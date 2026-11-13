-- Somente leitura. Pode executar antes ou depois de 003/004 no SQL Editor.
-- Não depende das novas tabelas/colunas existirem e não mostra dados pessoais.
with campos as (
  select attname from pg_attribute
  where attrelid = to_regclass('public.events') and not attisdropped
    and attname in ('poster_url','cover_url','groups','schedule','rules')
), apresentacao as (
  select
    (select count(*) from campos) as colunas,
    (select count(*) from pg_constraint where conrelid = to_regclass('public.events')
      and conname in ('events_poster_url_https','events_cover_url_https',
        'events_groups_length','events_schedule_length','events_rules_length')) as restricoes,
    (select count(*) from campos where
      has_column_privilege('authenticated','public.events',attname,'INSERT') and
      has_column_privilege('authenticated','public.events',attname,'UPDATE')) as permissoes
), base as (
  select
    (select count(*) from pg_attribute where not attisdropped and (
      (attrelid=to_regclass('public.events') and attname in ('capacity','active_registration_count')) or
      (attrelid=to_regclass('public.registrations') and attname in ('status','cancelled_at')))) as colunas,
    (select count(*) from pg_trigger where tgrelid=to_regclass('public.registrations')
      and not tgisinternal and tgenabled='O' and tgname in (
        'registrations_reserve_seat','registrations_validate_cancellation','registrations_release_seat')) as triggers,
    (select count(*) from pg_class where oid in (
      to_regclass('public.events'),to_regclass('public.registrations')) and relrowsecurity) as tabelas_rls
), grupos as (
  select
    to_regclass('public.event_combat_groups') is not null as tabela,
    (select count(*) from pg_attribute where attrelid=to_regclass('public.event_combat_groups')
      and not attisdropped and attname in (
        'id','event_id','name','capacity','active_registration_count','created_at')) as colunas,
    exists(select 1 from pg_attribute where attrelid=to_regclass('public.registrations')
      and not attisdropped and attname='combat_group_id') as vinculo,
    to_regprocedure('public.save_combat_group(uuid,text,integer,uuid)') is not null as rpc,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.event_combat_groups')),false) as rls,
    exists(select 1 from pg_policy where polrelid=to_regclass('public.event_combat_groups')
      and polname='combat_groups_read' and polcmd='r') as politica,
    exists(select 1 from pg_constraint where conrelid=to_regclass('public.registrations')
      and conname='registrations_group_same_event' and contype='f' and convalidated) as fk,
    (to_regclass('public.combat_groups_unique_name') is not null and
      to_regclass('public.registrations_group_active_idx') is not null) as indices,
    coalesce(not has_table_privilege('authenticated',to_regclass('public.event_combat_groups'),'INSERT,UPDATE,DELETE'),false) as escrita_bloqueada,
    coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_combat_group(uuid,text,integer,uuid)'),'EXECUTE'),false) as rpc_permitida,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f' and p.pronargs=0
      and p.proname in ('reserve_registration_seat','release_registration_seat','validate_registration_cancellation')
      and pg_get_functiondef(p.oid) like '%combat_group_id%') as funcoes_atualizadas
)
select
  (b.colunas=4 and b.triggers=3 and b.tabelas_rls=2 and
    to_regclass('public.registrations_one_active_per_player') is not null) as base_001_002_ok,
  case when a.colunas=5 and a.restricoes=5 and a.permissoes=5 then 'completa'
    when a.colunas=0 and a.restricoes=0 then 'ausente' else 'parcial' end as migracao_003,
  case when g.tabela and g.colunas=6 and g.vinculo and g.rpc and g.rls and g.politica
      and g.fk and g.indices and g.escrita_bloqueada and g.rpc_permitida and g.funcoes_atualizadas=3
    then 'completa'
    when not g.tabela and not g.vinculo and not g.rpc and not g.fk and g.funcoes_atualizadas=0
    then 'ausente' else 'parcial' end as migracao_004,
  a.colunas as colunas_003, a.restricoes as restricoes_003,
  b.triggers as triggers_vagas_ativos,
  g.funcoes_atualizadas as funcoes_grupos_atualizadas
from apresentacao a cross join base b cross join grupos g;
