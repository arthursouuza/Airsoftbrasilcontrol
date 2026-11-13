-- Execute no SQL Editor do projeto Supabase.
-- Somente leitura: lista tabelas, colunas e políticas do schema public.
select t.table_name, t.column_name, t.data_type, t.is_nullable
from information_schema.columns as t
where t.table_schema = 'public'
order by t.table_name, t.ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
