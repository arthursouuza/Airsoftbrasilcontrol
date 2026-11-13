-- Airsoft Brasil Control — 005: administração segura de eventos.
-- Requer migrações 001–004. Revisar em ambiente de teste antes de aplicar.
begin;

-- O papel administrativo não é editável pelo cliente.
create table public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from public, anon, authenticated;

-- A atribuição inicial deve ocorrer SOMENTE pelo SQL Editor, após confirmar o UID.
-- Confirme que o UID abaixo corresponde à conta pretendida antes de executar.
insert into public.site_admins(user_id)
select id from auth.users
where id = '76788b2d-a0a7-4423-8ef3-63f0b1975a7d'::uuid
  and lower(email) = 'arthur.pg040@gmail.com';

-- Uma migração aplicada sem a conta correta deve falhar, não deixar o painel desprotegido.
do $$ begin
  if not exists (select 1 from public.site_admins where user_id = '76788b2d-a0a7-4423-8ef3-63f0b1975a7d'::uuid) then
    raise exception 'Conta administrativa não encontrada: confirme UID e e-mail em auth.users';
  end if;
end $$;

create function public.is_site_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.site_admins a where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_site_admin() from public, anon, authenticated;
grant execute on function public.is_site_admin() to authenticated;

-- Arquivamento não destrói dados nem libera vagas.
alter table public.events drop constraint events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'published', 'cancelled', 'archived'));
alter table public.events add column archived_from_status text;
alter table public.events add constraint events_archived_from_status_check
  check (archived_from_status is null or archived_from_status in ('draft', 'published', 'cancelled'));

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

-- Permite administração global sem conceder alteração de contadores ou proprietário.
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

-- RPCs são as únicas operações administrativas de arquivar/restaurar/excluir.
-- Arquivamento registra o status anterior, sem tocar nas inscrições.
create function public.admin_archive_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype;
begin
  if not public.is_site_admin() then
    raise exception 'Acesso administrativo negado' using errcode = '42501';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Evento não encontrado'; end if;
  if v_event.status = 'archived' then return; end if;
  update public.events set status = 'archived', archived_from_status = v_event.status
    where id = p_event_id;
  insert into public.admin_event_audit(actor_id,event_id,event_title,action,details)
    values(auth.uid(),p_event_id,v_event.title,'archive',jsonb_build_object('previous_status',v_event.status));
end;
$$;

create function public.admin_restore_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_target text;
begin
  if not public.is_site_admin() then
