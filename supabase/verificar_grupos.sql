-- Leitura apenas, executar após 004 no SQL Editor.
select
  (select relrowsecurity from pg_class where oid = 'public.event_combat_groups'::regclass) as rls_grupos_ativo,
  has_function_privilege('authenticated','public.save_combat_group(uuid,text,integer,uuid)','execute') as organizador_pode_usar_rpc,
  not has_table_privilege('authenticated','public.event_combat_groups','insert,update,delete') as escrita_direta_bloqueada,
  (select count(*) from public.events e where active_registration_count <> (
    select count(*) from public.registrations r where r.event_id=e.id and r.status='active'
  ) or (capacity is not null and active_registration_count > capacity)) as eventos_inconsistentes,
  (select count(*) from public.event_combat_groups g where active_registration_count <> (
    select count(*) from public.registrations r where r.combat_group_id=g.id and r.status='active'
  ) or active_registration_count > capacity) as grupos_inconsistentes,
  (select count(*) from (select event_id,player_id from public.registrations where status='active'
    group by event_id,player_id having count(*)>1) d) as pares_ativos_duplicados,
  (select count(*) from public.registrations where combat_group_id is null and status='active') as inscricoes_ativas_sem_grupo;
