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
    (status = 'archived' and archived_from_status in ('draft', 'published', 'cancelled'))
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
create policy events_admin_update on public.events
  for update to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));
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
    new.status = 'archived'
    or old.status = 'archived'
    or new.archived_from_status is distinct from old.archived_from_status
  ) then
    raise exception 'Use as funcoes administrativas para arquivar/restaurar' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger events_guard_archive_state
  before update on public.events for each row
  execute function public.guard_event_archive_state();
revoke all on function public.guard_event_archive_state() from public, anon, authenticated;

create function public.admin_archive_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype;
begin
  if not public.is_site_admin() then
    raise exception 'Acesso administrativo negado' using errcode = '42501';
