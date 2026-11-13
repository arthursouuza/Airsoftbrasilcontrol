-- Incremental após 005. Não altera capas, eventos ou inscrições existentes.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-covers','event-covers',true,5242880,array['image/jpeg','image/png','image/webp']);

-- Caminho EVENT_UUID/IMAGE_UUID.ext. Somente criador/admin envia, sem sobrescrita.
create function public.can_upload_event_cover(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id::text = split_part(p_name,'/',1) and e.status <> 'archived'
      and (e.organizer_id=auth.uid() or public.is_site_admin())
  ) and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$';
$$;
revoke all on function public.can_upload_event_cover(text) from public,anon,authenticated;
grant execute on function public.can_upload_event_cover(text) to authenticated;
create policy event_covers_insert on storage.objects for insert to authenticated
with check(bucket_id='event-covers' and public.can_upload_event_cover(name));

create function public.set_event_cover(p_event_id uuid,p_cover_url text,p_expected text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_path text;
begin
  select * into strict v_event from public.events where id=p_event_id for update;
  if auth.uid() is null or not(v_event.organizer_id=auth.uid() or public.is_site_admin()) then
    raise exception 'Somente o criador do evento ou administrador pode alterar a capa' using errcode='42501';
  end if;
  if v_event.status='archived' then raise exception 'Restaure o evento antes de editar'; end if;
  if v_event.cover_url is distinct from p_expected then raise exception 'A capa mudou. Atualize antes de salvar' using errcode='40001'; end if;
  v_path := substring(p_cover_url from '^https://nzgpceglyxwtukrbdkam\.supabase\.co/storage/v1/object/public/event-covers/(.*)$');
  if v_path is null or split_part(v_path,'/',1) <> p_event_id::text
     or not exists(select 1 from storage.objects where bucket_id='event-covers' and name=v_path) then
    raise exception 'Envie primeiro uma capa válida para este evento';
  end if;
  update public.events set cover_url=p_cover_url where id=p_event_id;
  insert into public.admin_audit(actor_id,resource,resource_id,action,before_data,after_data)
    select auth.uid(),'events',p_event_id,'update',to_jsonb(v_event),to_jsonb(e) from public.events e where e.id=p_event_id;
end;
$$;
revoke all on function public.set_event_cover(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_event_cover(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
