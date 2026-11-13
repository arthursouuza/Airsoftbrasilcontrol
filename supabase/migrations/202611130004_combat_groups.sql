-- Airsoft Brasil Control: grupos com reserva atômica de vagas.
-- Requer 001 e 002; funciona com ou sem a apresentação opcional 003.
-- Executar UMA vez. Preserva inscrições legadas, inclusive sem grupo.
begin;
lock table public.events, public.registrations in access exclusive mode;

create table public.event_combat_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null check (length(trim(name)) between 1 and 80),
  capacity integer not null check (capacity > 0),
  active_registration_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, event_id),
  constraint combat_groups_count_valid check (
    active_registration_count >= 0 and active_registration_count <= capacity
  )
);
create unique index combat_groups_unique_name
  on public.event_combat_groups(event_id, lower(trim(name)));
alter table public.registrations add column combat_group_id uuid;
alter table public.registrations add constraint registrations_group_same_event
  foreign key (combat_group_id, event_id) references public.event_combat_groups(id, event_id);
create index registrations_group_active_idx
  on public.registrations(combat_group_id) where status = 'active';

alter table public.event_combat_groups enable row level security;
revoke all on public.event_combat_groups from public, anon, authenticated;
grant select on public.event_combat_groups to anon, authenticated;
create policy combat_groups_read on public.event_combat_groups
  for select to anon, authenticated using (exists (
    select 1 from public.events e where e.id = event_id
      and (e.status = 'published' or e.organizer_id = (select auth.uid()))
  ));
-- Não concede escrita direta: a RPC sempre trava evento ANTES de grupo.
grant insert (combat_group_id) on public.registrations to authenticated;

create function public.save_combat_group(
  p_event_id uuid, p_name text, p_capacity integer, p_group_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  perform 1 from public.events
    where id = p_event_id and organizer_id = auth.uid() for update;
  if not found then
    raise exception 'Somente o organizador pode definir grupos.' using errcode = '42501';
  end if;
  if p_group_id is null then
    insert into public.event_combat_groups(event_id, name, capacity)
      values(p_event_id, trim(p_name), p_capacity) returning id into result_id;
  else
    update public.event_combat_groups set name = trim(p_name), capacity = p_capacity
      where id = p_group_id and event_id = p_event_id returning id into result_id;
    if not found then
      raise exception 'Grupo não pertence ao evento.' using errcode = '23514';
    end if;
  end if;
  return result_id;
end;
$$;
revoke all on function public.save_combat_group(uuid,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.save_combat_group(uuid,text,integer,uuid) to authenticated;

-- A linha do evento é o ponto de serialização para criar/editar grupos,
-- inscrever/cancelar e alterar a capacidade total. Qualquer falha desfaz
-- ambas as reservas no mesmo INSERT/transação, inclusive duplicidade.
create or replace function public.reserve_registration_seat()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or new.cancelled_at is not null then
    raise exception 'Uma nova inscrição deve estar ativa.' using errcode = '23514';
  end if;
  update public.events set active_registration_count = active_registration_count + 1
    where id = new.event_id and status = 'published' and starts_at > now()
      and (capacity is null or active_registration_count < capacity);
  if not found then
    raise exception 'Evento indisponível ou sem vagas.' using errcode = 'P0001';
  end if;
  if new.combat_group_id is null then
    if exists(select 1 from public.event_combat_groups where event_id = new.event_id) then
      raise exception 'Escolha um grupo de combate.' using errcode = 'P1001';
    end if;
  else
    update public.event_combat_groups
      set active_registration_count = active_registration_count + 1
      where id = new.combat_group_id and event_id = new.event_id
        and active_registration_count < capacity;
    if not found then
      raise exception 'Grupo indisponível ou sem vagas.' using errcode = 'P1002';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_registration_cancellation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id
     or new.player_id is distinct from old.player_id or new.created_at is distinct from old.created_at
     or new.combat_group_id is distinct from old.combat_group_id then
    raise exception 'Os vínculos e o grupo da inscrição são imutáveis. Cancele e faça nova inscrição.' using errcode = '23514';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Uma inscrição cancelada não pode ser reativada. Faça nova inscrição.' using errcode = '23514';
  end if;
  if new.status = 'cancelled' and old.status = 'active' then
    new.cancelled_at := now();
  else
    new.cancelled_at := old.cancelled_at;
  end if;
  return new;
end;
$$;

create or replace function public.release_registration_seat()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'cancelled' then
    update public.events set active_registration_count = active_registration_count - 1
      where id = old.event_id and active_registration_count > 0;
    if not found then
      raise exception 'Contagem do evento inconsistente; cancelamento não aplicado.' using errcode = '23514';
    end if;
    if old.combat_group_id is not null then
      update public.event_combat_groups set active_registration_count = active_registration_count - 1
        where id = old.combat_group_id and event_id = old.event_id and active_registration_count > 0;
      if not found then
        raise exception 'Contagem do grupo inconsistente; cancelamento não aplicado.' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.reserve_registration_seat() from public, anon, authenticated;
revoke all on function public.validate_registration_cancellation() from public, anon, authenticated;
revoke all on function public.release_registration_seat() from public, anon, authenticated;
comment on column public.registrations.combat_group_id is 'NULL: inscrição legada ou evento sem grupos. Grupo imutável; trocar exige cancelar e reinscrever.';
comment on table public.event_combat_groups is 'Grupos estruturados, independentes do texto editorial events.groups; escritas somente via save_combat_group.';
notify pgrst, 'reload schema';
commit;
