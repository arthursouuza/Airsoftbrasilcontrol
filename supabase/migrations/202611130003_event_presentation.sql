-- Campos opcionais de apresentação. Executar uma vez, após as migrações 001/002.
-- Não modifica inscrições, capacidade, contador, confirmação de e-mail ou RLS.
begin;
alter table public.events
  add column poster_url text,
  add column cover_url text,
  add column groups text,
  add column schedule text,
  add column rules text,
  add constraint events_poster_url_https check (poster_url is null or (length(poster_url) <= 2048 and poster_url ~* '^https://[^[:space:]]+$')),
  add constraint events_cover_url_https check (cover_url is null or (length(cover_url) <= 2048 and cover_url ~* '^https://[^[:space:]]+$')),
  add constraint events_groups_length check (groups is null or length(groups) <= 20000),
  add constraint events_schedule_length check (schedule is null or length(schedule) <= 20000),
  add constraint events_rules_length check (rules is null or length(rules) <= 20000);
grant insert (poster_url, cover_url, groups, schedule, rules)
  on public.events to authenticated;
grant update (poster_url, cover_url, groups, schedule, rules)
  on public.events to authenticated;
comment on column public.events.poster_url is 'URL HTTPS do cartaz informado pelo organizador; opcional.';
comment on column public.events.cover_url is 'URL HTTPS da capa informada pelo organizador; opcional.';
notify pgrst, 'reload schema';
commit;
