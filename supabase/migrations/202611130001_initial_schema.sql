-- Airsoft Brasil Control: estrutura inicial e acesso por usuário.
-- Executar uma vez no SQL Editor do Supabase. Transação atômica.
-- Se alguma destas tabelas já existir, a execução falha sem substituí-la.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  location text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  price_cents integer not null default 0 check (price_cents >= 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  player_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, player_id)
);

-- Registro manual pelo organizador; não processa Pix/cartão automaticamente.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id),
  amount_cents integer not null check (amount_cents >= 0),
  method text not null check (method in ('manual_pix', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  created_at timestamptz not null default now()
);

create index teams_owner_idx on public.teams(owner_id);
create index team_members_user_idx on public.team_members(user_id);
create index events_organizer_idx on public.events(organizer_id);
create index events_public_idx on public.events(starts_at) where status = 'published';
create index registrations_player_idx on public.registrations(player_id);

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;

-- Remove privilégios padrão amplos, incluindo TRUNCATE e REFERENCES.
revoke all on public.profiles, public.teams, public.team_members,
  public.events, public.registrations, public.payments from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.events to anon;
grant select, insert on public.profiles, public.teams, public.events,
  public.team_members, public.registrations, public.payments to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (name, description) on public.teams to authenticated;
grant update (title, description, location, starts_at, ends_at, status, price_cents)
  on public.events to authenticated;
grant update (amount_cents, method, status) on public.payments to authenticated;
grant delete on public.team_members to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_create_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_edit_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_create on public.teams for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy teams_edit on public.teams for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy members_read on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())
  ));
-- O dono administra a equipe; usuários não se adicionam sem autorização.
create policy members_create on public.team_members for insert to authenticated
  with check (exists (
    select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())
  ));
create policy members_remove on public.team_members for delete to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid())
  ));

create policy events_read on public.events for select to anon, authenticated
  using (status = 'published' or organizer_id = (select auth.uid()));
create policy events_create on public.events for insert to authenticated
  with check (organizer_id = (select auth.uid()));
create policy events_edit on public.events for update to authenticated
  using (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));

create policy registrations_read on public.registrations for select to authenticated
  using (player_id = (select auth.uid()) or exists (
    select 1 from public.events e where e.id = event_id and e.organizer_id = (select auth.uid())
  ));
create policy registrations_create on public.registrations for insert to authenticated
  with check (player_id = (select auth.uid()) and exists (
    select 1 from public.events e
    where e.id = event_id and e.status = 'published' and e.starts_at > now()
  ));

create policy payments_read on public.payments for select to authenticated
  using (exists (
    select 1 from public.registrations r where r.id = registration_id
    and (r.player_id = (select auth.uid()) or exists (
      select 1 from public.events e where e.id = r.event_id and e.organizer_id = (select auth.uid())
    ))
  ));
create policy payments_create on public.payments for insert to authenticated
  with check (exists (
    select 1 from public.registrations r join public.events e on e.id = r.event_id
    where r.id = registration_id and e.organizer_id = (select auth.uid())
  ));
create policy payments_edit on public.payments for update to authenticated
  using (exists (
    select 1 from public.registrations r join public.events e on e.id = r.event_id
    where r.id = registration_id and e.organizer_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.registrations r join public.events e on e.id = r.event_id
    where r.id = registration_id and e.organizer_id = (select auth.uid())
  ));

commit;
