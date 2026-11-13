-- Executar UMA vez após 202611130001_initial_schema.sql.
-- Preserva inscrições e pagamentos existentes. NULL = capacidade ainda não definida.
begin;
lock table public.events, public.registrations in access exclusive mode;

alter table public.events
  add column capacity integer,
  add column active_registration_count integer not null default 0;
alter table public.registrations
  add column status text not null default 'active',
  add column cancelled_at timestamptz,
  add constraint registrations_status_check check (status in ('active', 'cancelled')),
  add constraint registrations_cancelled_at_check check (
    (status = 'active' and cancelled_at is null) or
    (status = 'cancelled' and cancelled_at is not null)
  );

update public.events e
set active_registration_count = (
  select count(*) from public.registrations r where r.event_id = e.id
);
alter table public.events
  add constraint events_capacity_positive check (capacity is null or capacity > 0),
  add constraint events_active_count_nonnegative check (active_registration_count >= 0),
  add constraint events_capacity_not_below_active check (
    capacity is null or capacity >= active_registration_count
  );

alter table public.registrations drop constraint registrations_event_id_player_id_key;
create unique index registrations_one_active_per_player
  on public.registrations(event_id, player_id) where status = 'active';

-- A única maneira do cliente alterar o contador é por inscrições/cancelamentos.
revoke insert on public.events from authenticated;
grant insert (organizer_id, title, description, location, starts_at, ends_at,
  status, price_cents, capacity) on public.events to authenticated;
grant update (capacity) on public.events to authenticated;
revoke insert on public.registrations from authenticated;
grant insert (event_id, player_id) on public.registrations to authenticated;
grant update (status) on public.registrations to authenticated;

-- O UPDATE condicional trava a linha do evento. Inscrições simultâneas e
-- alterações de capacidade disputam a MESMA linha; não há COUNT antes do INSERT.
create function public.reserve_registration_seat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'active' or new.cancelled_at is not null then
    raise exception 'Uma nova inscrição deve estar ativa.' using errcode = '23514';
  end if;
  update public.events
  set active_registration_count = active_registration_count + 1
  where id = new.event_id and status = 'published' and starts_at > now()
    and (capacity is null or active_registration_count < capacity);
  if not found then
    raise exception 'Evento indisponível ou sem vagas.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function public.validate_registration_cancellation()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.event_id is distinct from old.event_id
     or new.player_id is distinct from old.player_id or new.created_at is distinct from old.created_at then
    raise exception 'Os vínculos da inscrição são imutáveis.' using errcode = '23514';
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

create function public.release_registration_seat()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'cancelled' then
    update public.events
    set active_registration_count = active_registration_count - 1
    where id = old.event_id and active_registration_count > 0;
    if not found then
      raise exception 'Contagem de vagas inconsistente; cancelamento não aplicado.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.reserve_registration_seat() from public, anon, authenticated;
revoke all on function public.validate_registration_cancellation() from public, anon, authenticated;
revoke all on function public.release_registration_seat() from public, anon, authenticated;

create trigger registrations_reserve_seat
  after insert on public.registrations for each row
  execute function public.reserve_registration_seat();
create trigger registrations_validate_cancellation
  before update on public.registrations for each row
  execute function public.validate_registration_cancellation();
create trigger registrations_release_seat
  after update on public.registrations for each row
  execute function public.release_registration_seat();

-- Leitura e INSERT mantêm as políticas existentes. Cancelar é permitido apenas
-- ao próprio jogador ou ao organizador do evento; não há DELETE nem reativação.
create policy registrations_cancel on public.registrations
  for update to authenticated
  using (player_id = (select auth.uid()) or exists (
    select 1 from public.events e
    where e.id = event_id and e.organizer_id = (select auth.uid())
  ))
  with check (player_id = (select auth.uid()) or exists (
    select 1 from public.events e
    where e.id = event_id and e.organizer_id = (select auth.uid())
  ));

comment on column public.events.capacity is 'NULL: sem limite definido; valor positivo: limite de inscrições ativas.';
comment on column public.events.active_registration_count is 'Contador interno mantido atomicamente por triggers; não editável pelo cliente.';
notify pgrst, 'reload schema';
commit;
