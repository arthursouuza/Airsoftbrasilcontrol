-- Airsoft Brasil Control — 005: administracao auditada do site.
-- Requer 001–004. Aplicar apenas uma vez, apos revisar/testar.
begin;

create table public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from public, anon, authenticated;

insert into public.site_admins(user_id)
select id from auth.users
where id = '76788b2d-a0a7-4423-8ef3-63f0b1975a7d'::uuid
  and lower(email) = 'arthur.pg040@gmail.com';
do $$ begin
  if not exists (
    select 1 from public.site_admins
    where user_id = '76788b2d-a0a7-4423-8ef3-63f0b1975a7d'::uuid
  ) then
    raise exception 'Conta administrativa nao encontrada: confirme UID e email';
  end if;
end $$;

create function public.is_site_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.site_admins where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_site_admin() from public, anon, authenticated;
grant execute on function public.is_site_admin() to authenticated;

alter table public.events drop constraint events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'published', 'cancelled', 'archived'));
alter table public.events add column archived_from_status text;
alter table public.events add constraint events_archived_from_status_check
  check (
    (status = 'archived' and archived_from_status is not null and archived_from_status in ('draft', 'published', 'cancelled'))
    or (status <> 'archived' and archived_from_status is null)
  );

create table public.admin_event_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  event_id uuid not null,
  event_title text not null,
  action text not null check (action in ('archive', 'restore', 'delete')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
alter table public.admin_event_audit enable row level security;
revoke all on public.admin_event_audit from public, anon, authenticated;
grant select on public.admin_event_audit to authenticated;
create policy admin_audit_read on public.admin_event_audit
  for select to authenticated using ((select public.is_site_admin()));

create policy events_admin_read on public.events
  for select to authenticated using ((select public.is_site_admin()));
create policy registrations_admin_read on public.registrations
  for select to authenticated using ((select public.is_site_admin()));
create policy payments_admin_read on public.payments
  for select to authenticated using ((select public.is_site_admin()));
create policy combat_groups_admin_read on public.event_combat_groups
  for select to authenticated using ((select public.is_site_admin()));

-- Bloqueia mudancas diretas de status arquivado e da memoria do status.
-- RPCs SECURITY DEFINER criadas pelo SQL Editor executam como postgres.
create function public.guard_event_archive_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'postgres' and (
    (TG_OP = 'INSERT' and (new.status = 'archived' or new.archived_from_status is not null))
    or (TG_OP = 'UPDATE' and (new.status is distinct from old.status
      or new.archived_from_status is distinct from old.archived_from_status)
      and (new.status = 'archived' or old.status = 'archived'
        or new.archived_from_status is distinct from old.archived_from_status))
  ) then
    raise exception 'Use as funcoes administrativas para arquivar/restaurar' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger events_guard_archive_state
  before insert or update on public.events for each row
  execute function public.guard_event_archive_state();
revoke all on function public.guard_event_archive_state() from public, anon, authenticated;

create function public.admin_archive_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype;
begin
  if not public.is_site_admin() then
    raise exception 'Acesso administrativo negado' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Evento nao encontrado'; end if;
  if v_event.status = 'archived' then return; end if;
  update public.events
     set status = 'archived', archived_from_status = v_event.status
   where id = p_event_id;
  insert into public.admin_event_audit(actor_id,event_id,event_title,action,details)
  values (auth.uid(),p_event_id,v_event.title,'archive',
          jsonb_build_object('previous_status',v_event.status));
end;
$$;

create function public.admin_restore_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_target text;
begin
  if not public.is_site_admin() then
    raise exception 'Acesso administrativo negado' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Evento nao encontrado'; end if;
  if v_event.status <> 'archived' then
    raise exception 'Evento nao esta arquivado';
  end if;
  v_target := v_event.archived_from_status;
  -- Um evento passado nao volta automaticamente ao catalogo publico.
  if v_target = 'published' and v_event.starts_at <= now() then
    v_target := 'draft';
  end if;
  update public.events
     set status = v_target, archived_from_status = null
   where id = p_event_id;
  insert into public.admin_event_audit(actor_id,event_id,event_title,action,details)
  values (auth.uid(),p_event_id,v_event.title,'restore',
          jsonb_build_object('restored_status',v_target));
end;
$$;

-- Preserva a identidade dos eventos protegidos mesmo se o titulo mudar.
create table public.protected_events (
  event_id uuid primary key references public.events(id),
  reason text not null
);
alter table public.protected_events enable row level security;
revoke all on public.protected_events from public, anon, authenticated;
insert into public.protected_events(event_id, reason)
select id, 'Operacao Carandiru: preservacao obrigatoria'
from public.events where title ilike '%carandiru%'
  or id = 'b581d679-53ba-4479-8e92-9b44b7ab49b6'::uuid;

-- Exclusao somente de evento arquivado sem inscricoes ou pagamentos.
-- Nunca elimina inscricoes; FKs preservam pagamentos e protegem concorrencia.
create function public.admin_delete_event(p_event_id uuid, p_confirm_title text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_groups integer;
begin
  if not public.is_site_admin() then
    raise exception 'Acesso administrativo negado' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Evento nao encontrado'; end if;
  if v_event.title ilike '%carandiru%' or exists (
    select 1 from public.protected_events where event_id = p_event_id
  ) then
    raise exception 'Operacao Carandiru protegida contra exclusao';
  end if;
  if v_event.status <> 'archived' then
    raise exception 'Arquive o evento antes de solicitar exclusao definitiva';
  end if;
  if p_confirm_title is distinct from v_event.title then
    raise exception 'Confirmacao incorreta: informe o titulo exato do evento';
  end if;
  if exists (select 1 from public.registrations where event_id = p_event_id) then
    raise exception 'Exclusao bloqueada: existem inscricoes ou pagamentos vinculados';
  end if;
  select count(*) into v_groups from public.event_combat_groups where event_id = p_event_id;
  delete from public.event_combat_groups where event_id = p_event_id;
  delete from public.events where id = p_event_id;
  insert into public.admin_event_audit(actor_id,event_id,event_title,action,details)
  values (auth.uid(),p_event_id,v_event.title,'delete',
    jsonb_build_object('groups_deleted',v_groups,'confirmed_title',p_confirm_title));
end;
$$;

revoke all on function public.admin_archive_event(uuid) from public, anon, authenticated;
revoke all on function public.admin_restore_event(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_event(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_archive_event(uuid) to authenticated;
grant execute on function public.admin_restore_event(uuid) to authenticated;
grant execute on function public.admin_delete_event(uuid,text) to authenticated;
-- A conta administrativa precisa continuar correspondendo ao titular autorizado.
create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.site_admins a join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and u.id = '76788b2d-a0a7-4423-8ef3-63f0b1975a7d'::uuid
      and lower(u.email) = 'arthur.pg040@gmail.com'
  );
$$;

-- Protecao também para UPDATE direto pelo organizador e contadores internos.
create function public.guard_protected_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.id = 'b581d679-53ba-4479-8e92-9b44b7ab49b6'::uuid
    or old.title ilike '%carandiru%'
    or exists(select 1 from public.protected_events where event_id = old.id)
  then
    if TG_OP = 'DELETE' then
      raise exception 'Operacao Carandiru protegida contra exclusao';
    end if;
    if new.status <> 'published' then
      raise exception 'Operacao Carandiru deve permanecer publicada';
    end if;
    -- Ao reconhecer novo titulo protegido, fixa tambem a identidade.
    insert into public.protected_events(event_id,reason)
      values(old.id,'Operacao Carandiru: preservacao obrigatoria') on conflict do nothing;
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_protected_event() from public, anon, authenticated;
create trigger events_protect_carandiru before update or delete on public.events
  for each row execute function public.guard_protected_event();

create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  resource text not null,
  resource_id uuid not null,
  action text not null check(action in ('create','update')),
  before_data jsonb,
  after_data jsonb not null,
  occurred_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;
grant select on public.admin_audit to authenticated;
create policy admin_audit_select on public.admin_audit for select to authenticated
  using((select public.is_site_admin()));
create policy profiles_admin_read on public.profiles for select to authenticated
  using((select public.is_site_admin()));
create policy members_admin_read on public.team_members for select to authenticated
  using((select public.is_site_admin()));
grant select on public.protected_events to authenticated;
create policy protected_admin_read on public.protected_events for select to authenticated
  using((select public.is_site_admin()));

-- Conteudo editorial como texto, sem HTML, JS ou URLs arbitrarias.
create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check(key in ('search_heading','catalogue_description','teams_description','organize_heading','organize_description','footer_tagline')),
  value text not null check(length(trim(value)) between 1 and 1000)
);
alter table public.site_content enable row level security;
revoke all on public.site_content from public, anon, authenticated;
grant select on public.site_content to anon, authenticated;
create policy site_content_read on public.site_content for select to anon, authenticated using(true);
insert into public.site_content(key,value) values
 ('search_heading','Encontre seu próximo jogo'),
 ('catalogue_description','Jogos publicados, em ordem de início.'),
 ('teams_description','Encontre quem divide a sua paixão pelo Airsoft.'),
 ('organize_heading','Leve seu próximo jogo para o campo.'),
 ('organize_description','Publique sua operação e acompanhe inscrições e vagas em um só lugar.'),
 ('footer_tagline','Seu jogo. Seu comando.');

-- Escrita somente via RPC tipada, com lista de campos, locks e auditoria.
-- Nao altera auth.users, site_admins, IDs, donos ou contadores por JSON.
create function public.admin_save(
  p_resource text, p_data jsonb, p_id uuid default null, p_expected jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_allowed text[]; v_before jsonb; v_after jsonb; v_id uuid := p_id;
  v_event public.events%rowtype; v_profile public.profiles%rowtype;
  v_team public.teams%rowtype; v_group public.event_combat_groups%rowtype;
  v_registration public.registrations%rowtype; v_payment public.payments%rowtype;
  v_content public.site_content%rowtype; v_event_id uuid;
begin
  if not public.is_site_admin() then
    raise exception 'Acesso administrativo negado' using errcode='42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data = '{}'::jsonb then
    raise exception 'Informe os campos para salvar' using errcode='22023';
  end if;
  v_allowed := case p_resource
    when 'events' then array['title','description','location','starts_at','ends_at','price_cents','capacity','status','poster_url','cover_url','groups','schedule','rules']
    when 'profiles' then array['display_name']
    when 'teams' then array['name','description']
    when 'event_combat_groups' then array['event_id','name','capacity']
    when 'registrations' then array['event_id','player_id','combat_group_id','status']
    when 'payments' then array['registration_id','amount_cents','method','status']
    when 'site_content' then array['value']
    else null end;
  if v_allowed is null or exists(select 1 from jsonb_object_keys(p_data) k where not(k = any(v_allowed))) then
    raise exception 'Recurso ou campo nao permitido' using errcode='22023';
  end if;
  if p_id is not null and p_expected is null then
    raise exception 'Recarregue o registro antes de editar' using errcode='40001';
  end if;
  case p_resource
  when 'events' then
    if p_id is null then
      v_event := jsonb_populate_record(null::public.events,p_data);
      if coalesce(v_event.status,'draft') not in ('draft','published') then raise exception 'Novo evento deve ser rascunho ou publicado'; end if;
      insert into public.events(organizer_id,title,description,location,starts_at,ends_at,price_cents,capacity,status,poster_url,cover_url,groups,schedule,rules)
      values(auth.uid(),v_event.title,coalesce(v_event.description,''),v_event.location,v_event.starts_at,v_event.ends_at,coalesce(v_event.price_cents,0),v_event.capacity,coalesce(v_event.status,'draft'),v_event.poster_url,v_event.cover_url,v_event.groups,v_event.schedule,v_event.rules)
      returning to_jsonb(events.*),id into v_after,v_id;
    else
      select * into strict v_event from public.events where id=p_id for update;
      v_before := to_jsonb(v_event);
      if v_event.status='archived' then raise exception 'Restaure o evento antes de editar'; end if;
      v_event := jsonb_populate_record(v_event,p_data);
      if v_event.status not in ('draft','published','cancelled') then raise exception 'Use arquivamento administrativo'; end if;
      update public.events set title=v_event.title,description=v_event.description,location=v_event.location,
        starts_at=v_event.starts_at,ends_at=v_event.ends_at,price_cents=v_event.price_cents,
        capacity=v_event.capacity,status=v_event.status,poster_url=v_event.poster_url,cover_url=v_event.cover_url,
        groups=v_event.groups,schedule=v_event.schedule,rules=v_event.rules
        where id=p_id returning to_jsonb(events.*) into v_after;
    end if;
  when 'profiles' then
    if p_id is null then raise exception 'Jogadores criam sua conta pelo cadastro'; end if;
    select * into strict v_profile from public.profiles where id=p_id for update;
    v_before := to_jsonb(v_profile);
    update public.profiles set display_name=p_data->>'display_name' where id=p_id
      returning to_jsonb(profiles.*) into v_after;
  when 'teams' then
    if p_id is null then
      insert into public.teams(owner_id,name,description) values(auth.uid(),p_data->>'name',coalesce(p_data->>'description',''))
        returning to_jsonb(teams.*),id into v_after,v_id;
    else
      select * into strict v_team from public.teams where id=p_id for update;
      v_before := to_jsonb(v_team); v_team := jsonb_populate_record(v_team,p_data);
      update public.teams set name=v_team.name,description=v_team.description where id=p_id
        returning to_jsonb(teams.*) into v_after;
    end if;
  when 'event_combat_groups' then
    if p_id is not null then
      select event_id into strict v_event_id from public.event_combat_groups where id=p_id;
      if p_data ? 'event_id' and (p_data->>'event_id')::uuid is distinct from v_event_id then raise exception 'Evento do grupo e imutavel'; end if;
    else v_event_id := (p_data->>'event_id')::uuid; end if;
    perform 1 from public.events where id=v_event_id and status <> 'archived' for update;
    if not found then raise exception 'Evento nao encontrado ou arquivado'; end if;
    if p_id is null then
      insert into public.event_combat_groups(event_id,name,capacity) values(v_event_id,trim(p_data->>'name'),(p_data->>'capacity')::integer)
        returning to_jsonb(event_combat_groups.*),id into v_after,v_id;
    else
      select * into strict v_group from public.event_combat_groups where id=p_id for update;
      v_before := to_jsonb(v_group); v_group := jsonb_populate_record(v_group,p_data);
      update public.event_combat_groups set name=trim(v_group.name),capacity=v_group.capacity where id=p_id
        returning to_jsonb(event_combat_groups.*) into v_after;
    end if;
  when 'registrations' then
    if p_id is null then
      if coalesce(p_data->>'status','active') <> 'active' then raise exception 'Nova inscricao deve estar ativa'; end if;
      insert into public.registrations(event_id,player_id,combat_group_id)
        values((p_data->>'event_id')::uuid,(p_data->>'player_id')::uuid,(p_data->>'combat_group_id')::uuid)
        returning to_jsonb(registrations.*),id into v_after,v_id;
    else
      if p_data <> '{"status":"cancelled"}'::jsonb then raise exception 'Somente cancelamento e permitido; vinculos sao imutaveis'; end if;
      select event_id into strict v_event_id from public.registrations where id=p_id;
      perform 1 from public.events where id=v_event_id for update;
      select * into strict v_registration from public.registrations where id=p_id for update;
      v_before := to_jsonb(v_registration);
      update public.registrations set status='cancelled' where id=p_id returning to_jsonb(registrations.*) into v_after;
    end if;
  when 'payments' then
    if p_id is not null then
      select registration_id into strict v_id from public.payments where id=p_id;
      if p_data ? 'registration_id' and (p_data->>'registration_id')::uuid is distinct from v_id then raise exception 'Vinculo do pagamento e imutavel'; end if;
    else v_id := (p_data->>'registration_id')::uuid; end if;
    select event_id into strict v_event_id from public.registrations where id=v_id;
    perform 1 from public.events where id=v_event_id for update;
    perform 1 from public.registrations where id=v_id for update;
    if p_id is null then
      insert into public.payments(registration_id,amount_cents,method,status)
        values(v_id,(p_data->>'amount_cents')::integer,p_data->>'method',coalesce(p_data->>'status','pending'))
        returning to_jsonb(payments.*),id into v_after,v_id;
    else
      select * into strict v_payment from public.payments where id=p_id for update;
      v_before := to_jsonb(v_payment); v_payment := jsonb_populate_record(v_payment,p_data);
      update public.payments set amount_cents=v_payment.amount_cents,method=v_payment.method,status=v_payment.status
        where id=p_id returning to_jsonb(payments.*),id into v_after,v_id;
    end if;
  when 'site_content' then
    if p_id is null then raise exception 'Edite um bloco editorial existente'; end if;
    select * into strict v_content from public.site_content where id=p_id for update;
    v_before := to_jsonb(v_content);
    update public.site_content set value=p_data->>'value' where id=p_id returning to_jsonb(site_content.*) into v_after;
  end case;
  -- A comparacao ocorre na mesma transacao e desfaz toda a escrita em conflito.
  if p_id is not null and v_before is distinct from p_expected then
    raise exception 'Registro mudou. Atualize a pagina antes de salvar' using errcode='40001';
  end if;
  insert into public.admin_audit(actor_id,resource,resource_id,action,before_data,after_data)
    values(auth.uid(),p_resource,v_id,case when p_id is null then 'create' else 'update' end,v_before,v_after);
  return v_id;
end;
$$;
revoke all on function public.admin_save(text,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.admin_save(text,jsonb,uuid,jsonb) to authenticated;

-- Desativacao reversivel: nao apaga historico de membros.
alter table public.team_members add column active boolean not null default true;
create function public.admin_set_team_member(
  p_team_id uuid, p_user_id uuid, p_active boolean, p_expected jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_site_admin() then raise exception 'Acesso administrativo negado' using errcode='42501'; end if;
  if p_active is null then raise exception 'Informe o estado do vinculo'; end if;
  perform 1 from public.teams where id=p_team_id for update;
  if not found then raise exception 'Equipe nao encontrada'; end if;
  perform 1 from public.profiles where id=p_user_id;
  if not found then raise exception 'Jogador nao encontrado'; end if;
  select to_jsonb(m.*) into v_before from public.team_members m
    where team_id=p_team_id and user_id=p_user_id for update;
  if v_before is distinct from p_expected then
    raise exception 'Vinculo mudou. Atualize antes de salvar' using errcode='40001';
  end if;
  insert into public.team_members(team_id,user_id,active) values(p_team_id,p_user_id,p_active)
    on conflict(team_id,user_id) do update set active=excluded.active
    returning to_jsonb(team_members.*) into v_after;
  insert into public.admin_audit(actor_id,resource,resource_id,action,before_data,after_data)
    values(auth.uid(),'team_members',p_team_id,case when v_before is null then 'create' else 'update' end,v_before,v_after);
end;
$$;
revoke all on function public.admin_set_team_member(uuid,uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_team_member(uuid,uuid,boolean,jsonb) to authenticated;

-- Lote atomico: se qualquer evento falhar, nenhum arquivamento fica aplicado.
create function public.admin_archive_events(p_event_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_site_admin() then raise exception 'Acesso administrativo negado' using errcode='42501'; end if;
  if p_event_ids is null or cardinality(p_event_ids) not between 1 and 100
    or array_position(p_event_ids,null) is not null
    or (select count(distinct x) from unnest(p_event_ids) x) <> cardinality(p_event_ids)
  then raise exception 'Selecione entre 1 e 100 eventos distintos'; end if;
  for v_id in select x from unnest(p_event_ids) x order by x loop
    perform public.admin_archive_event(v_id);
  end loop;
end;
$$;
revoke all on function public.admin_archive_events(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_archive_events(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
