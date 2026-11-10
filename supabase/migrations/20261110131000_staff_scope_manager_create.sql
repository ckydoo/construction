-- Additive refinement for databases that already applied staff_scope_and_document_folders.
-- Lets a manager create a new job they will run; the row becomes visible from
-- app_staff_project_ids as soon as it is saved. The generated baseline
-- 20261110130000_staff_scope.sql already contains this rule for fresh databases.

create or replace function public.app_visible_record(
  p_org uuid, p_resource text, p_id text, p_project_id text, p_data jsonb
)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r text; e text; emp text; pids text[]; d jsonb;
begin
  if p_org is null or p_id is null then return false; end if;
  r := public.app_role(p_org);
  if r is null then return false; end if;
  if public.app_full_access(r) then return true; end if;
  e := public.app_entity(p_org);
  d := coalesce(p_data, '{}'::jsonb);

  if r = 'CLIENT_EXTERNAL' then
    if e is null then return false; end if;
    if p_resource = 'clients' then return p_id = e; end if;
    if p_resource = 'contacts' then return d->>'clientId' = e; end if;
    select coalesce(array_remove(array_agg(id), null), array[]::text[]) into pids
      from public.records
      where organization_id = p_org and resource = 'projects' and deleted_at is null
        and data->>'clientId' = e;
    if p_resource = 'projects' then return p_id = any(pids); end if;
    if d->>'clientId' = e then return true; end if;
    if p_project_id is not null and p_project_id = any(pids) then return true; end if;
    return false;
  end if;

  if r = 'SUBCONTRACTOR_EXTERNAL' then
    if e is null then return false; end if;
    if p_resource = 'subcontractors' then return p_id = e; end if;
    select coalesce(array_remove(array_agg(project_id), null), array[]::text[]) into pids
      from public.records
      where organization_id = p_org and resource in ('contracts','submittals') and deleted_at is null
        and (data->>'counterparty' = e or data->>'submittedBy' = e or data->>'subcontractorId' = e);
    if p_resource = 'projects' then return p_id = any(pids); end if;
    if d->>'counterparty' = e or d->>'submittedBy' = e or d->>'subcontractorId' = e then return true; end if;
    if p_project_id is not null and p_project_id = any(pids) then return true; end if;
    return false;
  end if;

  -- Internal staff
  emp := public.app_employee(p_org);
  if p_resource = any(public.app_staff_shared_resources()) then return true; end if;
  if p_resource = any(public.app_staff_departments(r)) then return true; end if;
  if p_resource = 'employees' and emp is not null and p_id = emp then return true; end if;
  -- A manager may create a new job they will run; it becomes visible as soon
  -- as it is saved because app_staff_project_ids reads the manager field.
  if p_resource = 'projects' and emp is not null and d->>'manager' = emp then return true; end if;
  pids := public.app_staff_project_ids(p_org);
  if p_resource = 'projects' then return p_id = any(pids); end if;
  if p_project_id is not null and p_project_id = any(pids) then return true; end if;
  return false;
end;
$$;
