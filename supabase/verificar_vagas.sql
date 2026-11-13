-- Somente leitura. Executar após 202611130002_capacity_cancellations.sql.
-- Deve retornar 0 inconsistências.
select count(*) as eventos_inconsistentes
from (
  select e.id, e.capacity, e.active_registration_count,
    count(r.id) filter (where r.status = 'active') as ativos_reais
  from public.events e
  left join public.registrations r on r.event_id = e.id
  group by e.id
) totals
where active_registration_count <> ativos_reais
  or active_registration_count < 0
  or (capacity is not null and capacity < ativos_reais);

-- Deve retornar 0 pares duplicados.
select count(*) as pares_ativos_duplicados
from (
  select event_id, player_id from public.registrations
  where status = 'active'
  group by event_id, player_id having count(*) > 1
) duplicates;

-- Deve listar três triggers, com enabled = O (origin).
select tgname, tgenabled as enabled from pg_trigger
where tgrelid = 'public.registrations'::regclass
  and not tgisinternal
  and tgname in ('registrations_reserve_seat', 'registrations_validate_cancellation', 'registrations_release_seat')
order by tgname;
