-- Private Supabase Storage bucket for drawings, PDFs and revision chains.
-- Object path convention: <org-uuid>/<record-id>/<uuid>-<safe-file-name>
-- The RLS helper in 0003 resolves the attachment + owning record from that path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buildops-documents', 'buildops-documents', false, 12582912, null)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit;

drop policy if exists buildops_storage_select on storage.objects;
create policy buildops_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'buildops-documents' and public.app_storage_allowed(name, bucket_id, 'read'));

drop policy if exists buildops_storage_insert on storage.objects;
create policy buildops_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'buildops-documents' and public.app_storage_allowed(name, bucket_id, 'write'));

drop policy if exists buildops_storage_update on storage.objects;
create policy buildops_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'buildops-documents' and public.app_storage_allowed(name, bucket_id, 'write'))
  with check (bucket_id = 'buildops-documents' and public.app_storage_allowed(name, bucket_id, 'write'));

drop policy if exists buildops_storage_delete on storage.objects;
create policy buildops_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'buildops-documents' and public.app_storage_allowed(name, bucket_id, 'delete'));
