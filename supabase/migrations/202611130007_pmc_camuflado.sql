-- Após 006. Preserva inscrições sem time e todos os pagamentos.
begin;
lock table public.events,public.event_combat_groups,public.registrations in access exclusive mode;
alter table public.events add column split_teams boolean not null default false;
alter table public.events alter column split_teams set default true;
alter table public.events add constraint events_split_even_capacity check
  (not split_teams or (capacity is not null and capacity >= 2 and capacity % 2 = 0));

create function public.guard_split_team()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype;
begin
  select * into v_event from public.events where id=case when TG_OP='DELETE' then old.event_id else new.event_id end for update;
  if v_event.split_teams then
    if TG_OP='DELETE' then
      if v_event.status <> 'archived' then raise exception 'Os times PMC e CAMUFLADO são obrigatórios'; end if;
      return old;
    end if;
    if new.name not in ('PMC','CAMUFLADO') or new.capacity <> v_event.capacity/2 then
      raise exception 'Use PMC e CAMUFLADO, cada um com metade da capacidade total';
    end if;
    if TG_OP='UPDATE' and (new.name is distinct from old.name or new.event_id is distinct from old.event_id) then
      raise exception 'A identidade do time não pode ser alterada';
    end if;
  end if;
  return case when TG_OP='DELETE' then old else new end;
end;
$$;
create trigger combat_groups_split_guard before insert or update or delete on public.event_combat_groups
for each row execute function public.guard_split_team();

create function public.sync_split_teams()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.split_teams then
    insert into public.event_combat_groups(event_id,name,capacity) values
      (new.id,'PMC',new.capacity/2),(new.id,'CAMUFLADO',new.capacity/2)
    on conflict (event_id,lower(trim(name))) do update set capacity=excluded.capacity;
  end if;
  return new;
end;
$$;
create trigger events_sync_split_teams after insert or update of capacity,split_teams on public.events
for each row execute function public.sync_split_teams();

-- Só habilita automaticamente eventos com capacidade par e sem grupos prévios.
-- Nenhum jogador é atribuído a um time pelo organizador ou pela migração.
update public.events e set split_teams=true
where e.status in ('draft','published') and e.capacity >= 2 and e.capacity % 2=0
and not exists(select 1 from public.event_combat_groups g where g.event_id=e.id);

create function public.enable_split_teams(p_event_id uuid,p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype;
begin
  select * into strict v_event from public.events where id=p_event_id for update;
  if auth.uid() is null or not(v_event.organizer_id=auth.uid() or public.is_site_admin()) then
    raise exception 'Somente o criador ou administrador pode configurar os times' using errcode='42501';
  end if;
  if v_event.status='archived' then raise exception 'Restaure o evento antes de editar'; end if;
  if not v_event.split_teams and exists(select 1 from public.event_combat_groups where event_id=p_event_id) then
    raise exception 'Evento já tem grupos. Revise os vínculos antes de converter os times';
  end if;
  if p_capacity is null or p_capacity < 2 or p_capacity % 2 <> 0 then raise exception 'Informe uma capacidade total par, a partir de 2'; end if;
  update public.events set capacity=p_capacity,split_teams=true where id=p_event_id;
end;
$$;

-- Escolha única do próprio jogador para inscrição legada. Mantém ID e pagamentos.
create function public.choose_registration_team(p_registration_id uuid,p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event_id uuid; v_reg public.registrations%rowtype;
begin
  select event_id into strict v_event_id from public.registrations where id=p_registration_id and player_id=auth.uid();
  perform 1 from public.events where id=v_event_id and split_teams and status='published' and starts_at>now() for update;
  if not found then raise exception 'Escolha de time indisponível para este evento'; end if;
  select * into strict v_reg from public.registrations where id=p_registration_id for update;
  if v_reg.status<>'active' or v_reg.combat_group_id is not null then raise exception 'Inscrição já tem time ou está cancelada'; end if;
  update public.event_combat_groups set active_registration_count=active_registration_count+1
  where id=p_group_id and event_id=v_event_id and active_registration_count<capacity;
  if not found then raise exception 'Time lotado ou indisponível' using errcode='P1002'; end if;
  update public.registrations set combat_group_id=p_group_id where id=p_registration_id;
end;
$$;

create or replace function public.validate_registration_cancellation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id
    or new.player_id is distinct from old.player_id or new.created_at is distinct from old.created_at then
    raise exception 'Os vínculos da inscrição são imutáveis' using errcode='23514';
  end if;
  if new.combat_group_id is distinct from old.combat_group_id and not (
    current_user='postgres' and old.combat_group_id is null and new.combat_group_id is not null
    and old.status='active' and new.status='active' and old.player_id=auth.uid()
  ) then raise exception 'O time já escolhido é imutável' using errcode='23514'; end if;
  if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Faça uma nova inscrição' using errcode='23514'; end if;
  if new.status='cancelled' and old.status='active' then new.cancelled_at:=now(); else new.cancelled_at:=old.cancelled_at; end if;
  return new;
end;
$$;
revoke all on function public.guard_split_team() from public,anon,authenticated;
revoke all on function public.sync_split_teams() from public,anon,authenticated;
revoke all on function public.enable_split_teams(uuid,integer) from public,anon,authenticated;
revoke all on function public.choose_registration_team(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enable_split_teams(uuid,integer) to authenticated;
grant execute on function public.choose_registration_team(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
