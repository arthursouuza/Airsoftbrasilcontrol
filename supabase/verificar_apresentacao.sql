-- Somente leitura; funciona antes ou depois da migração 003.
-- Depois: campos=5, restricoes=5, rls=true, permissoes=true, triggers=3.
with campos as (
  select attname from pg_attribute
  where attrelid = 'public.events'::regclass and not attisdropped
    and attname in ('poster_url', 'cover_url', 'groups', 'schedule', 'rules')
), restricoes as (
  select conname from pg_constraint
  where conrelid = 'public.events'::regclass
    and conname in ('events_poster_url_https', 'events_cover_url_https',
      'events_groups_length', 'events_schedule_length', 'events_rules_length')
)
select
  (select count(*) from campos) as campos_apresentacao,
  (select count(*) from restricoes) as restricoes_apresentacao,
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass)
    as rls_eventos_ativo,
  (select count(*) = 5 and coalesce(bool_and(
    has_column_privilege('authenticated', 'public.events', attname, 'INSERT')
    and has_column_privilege('authenticated', 'public.events', attname, 'UPDATE')
  ), false) from campos) as permissoes_apresentacao_ok,
  (select count(*) from pg_trigger
    where tgrelid = 'public.registrations'::regclass and not tgisinternal
      and tgenabled = 'O'
      and tgname in ('registrations_reserve_seat', 'registrations_validate_cancellation',
        'registrations_release_seat')) as triggers_vagas_ativos;
