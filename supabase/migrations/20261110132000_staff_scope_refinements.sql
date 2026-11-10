-- Additive refinement for databases that already applied staff_scope_and_document_folders.
-- Deny whole-company wallet visibility to unassigned staff, keep folder edits
-- on visible jobs, and restrict the audit trail for internal staff.

create or replace function public.app_wallet_client_allowed(p_org uuid, p_client_id text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text; pids text[]; cids text[];
begin
  if p_org is null or p_client_id is null or not (p_org = any(public.app_org_ids())) then return false; end if;
  r := public.app_role(p_org);
  if r is null then return false; end if;
  if public.app_full_access(r) then return true; end if;
  if r = 'CLIENT_EXTERNAL' then return public.app_entity(p_org) = p_client_id; end if;
  if r = 'SUBCONTRACTOR_EXTERNAL' then return false; end if;
  -- Only owners/admins see the whole company. Staff without an assigned job
  -- have no client wallets; assigned staff see clients on their own jobs.
  pids := public.app_staff_project_ids(p_org);
  if coalesce(array_length(pids, 1), 0) = 0 then return false; end if;
  cids := public.app_staff_client_ids(p_org);
  return p_client_id = any(cids);
end;
$$;

drop policy if exists document_folders_update on public.document_folders;
create policy document_folders_update on public.document_folders for update to authenticated
  using (
    organization_id = any(public.app_org_ids())
    and public.app_can_write(organization_id, 'documents')
    and public.app_has_capability(organization_id, 'files.upload')
    and (project_id is null or public.app_visible_record_id(organization_id, project_id))
  )
  with check (
    organization_id = any(public.app_org_ids())
    and public.app_can_write(organization_id, 'documents')
    and public.app_has_capability(organization_id, 'files.upload')
    and (project_id is null or public.app_visible_record_id(organization_id, project_id))
  );

drop policy if exists document_folders_delete on public.document_folders;
create policy document_folders_delete on public.document_folders for delete to authenticated
  using (
    organization_id = any(public.app_org_ids())
    and public.app_can_delete(organization_id, 'documents')
    and public.app_has_capability(organization_id, 'files.delete')
    and (project_id is null or public.app_visible_record_id(organization_id, project_id))
  );

-- Internal staff should not read company-wide activity about jobs they cannot
-- see; owner/admin keep the full audit trail.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    organization_id = any(public.app_org_ids())
    and (public.app_full_access(public.app_role(organization_id)) or user_id = auth.uid())
  );
