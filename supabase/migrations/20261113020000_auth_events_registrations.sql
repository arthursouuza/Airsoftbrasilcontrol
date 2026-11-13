begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 70),
  team text not null default '' check (char_length(team) <= 70),
  created_at timestamptz not null default now()
);

-- Every authenticated account can organize its own events. There is no client-editable admin role.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(btrim(title)) between 2 and 90),
  location text not null check (char_length(btrim(location)) between 2 and 120),
  starts_at timestamptz not null,
  mode text not null check (mode in ('Milsim', 'Jogo aberto', 'CQB')),
  description text not null check (char_length(btrim(description)) between 2 and 600),
  capacity integer not null check (capacity between 1 and 10000),
  occupied integer not null default 0 check (occupied >= 0 and occupied <= capacity),
  closed boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_organizer_idx on public.events(organizer_id);
create index events_starts_at_idx on public.events(starts_at);

-- Only active registrations are retained. Cancellation removes the row; no payment/history claims.
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  player_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint registrations_event_player_unique unique(event_id, player_id)
);
create index registrations_player_idx on public.registrations(player_id);

-- This UPDATE takes a row lock and rechecks its WHERE after a concurrent writer commits
-- at READ COMMITTED. At stricter isolation Postgres may abort: callers must retry, never overbook.
-- The counter and registration commit/rollback together, including unique/FK/RLS failures.
create function public.reserve_event_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events set occupied = occupied + 1
  where id = new.event_id and not closed and starts_at > now() and occupied < capacity;
  if not found then
    raise exception 'EVENT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
-- AFTER avoids counting rows discarded by INSERT ... ON CONFLICT DO NOTHING.
create trigger registration_reserve after insert on public.registrations
for each row execute function public.reserve_event_seat();

create function public.release_event_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events set occupied = occupied - 1 where id = old.event_id;
  return old;
end;
$$;
create trigger registration_release after delete on public.registrations
for each row execute function public.release_event_seat();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy events_public_read on public.events for select to anon, authenticated using (true);
create policy events_create_own on public.events for insert to authenticated
with check (organizer_id = (select auth.uid()) and starts_at > now());
create policy events_update_own on public.events for update to authenticated
using (organizer_id = (select auth.uid())) with check (organizer_id = (select auth.uid()));

create policy registrations_read on public.registrations for select to authenticated
using (player_id = (select auth.uid()) or exists (
  select 1 from public.events e where e.id = event_id and e.organizer_id = (select auth.uid())
));
create policy registrations_create_self on public.registrations for insert to authenticated
with check (player_id = (select auth.uid()));
create policy registrations_cancel_self on public.registrations for delete to authenticated
using (player_id = (select auth.uid()));

-- Deliberately no broad profile access. Only an event's organizer can obtain its minimal roster.
create function public.event_roster(target_event uuid)
returns table (registration_id uuid, player_id uuid, display_name text, team text, registered_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.events e where e.id = target_event and e.organizer_id = auth.uid()
  ) then
    raise exception 'NOT_EVENT_OWNER' using errcode = '42501';
  end if;
  return query select r.id, r.player_id, p.display_name, p.team, r.created_at
  from public.registrations r join public.profiles p on p.id = r.player_id
  where r.event_id = target_event order by r.created_at, r.id;
end;
$$;

-- Supabase may have permissive default grants: revoke explicitly before granting columns.
revoke all on public.profiles, public.events, public.registrations from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.profiles, public.registrations to authenticated;
grant insert (id, display_name, team), update (display_name, team) on public.profiles to authenticated;
grant insert (organizer_id, title, location, starts_at, mode, description, capacity, closed),
      update (title, location, starts_at, mode, description, capacity, closed) on public.events to authenticated;
-- occupied, event ownership, registration identity and timestamps cannot be modified by clients.
grant insert (event_id, player_id), delete on public.registrations to authenticated;
revoke all on function public.reserve_event_seat(), public.release_event_seat(), public.event_roster(uuid)
from public, anon, authenticated;
grant execute on function public.event_roster(uuid) to authenticated;

commit;
