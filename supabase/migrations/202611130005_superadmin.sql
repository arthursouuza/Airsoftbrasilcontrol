-- Airsoft Brasil Control — 005: administracao de eventos.
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
notify pgrst, 'reload schema';
commit;
