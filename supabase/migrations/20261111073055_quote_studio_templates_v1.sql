-- Reusable Quote Studio templates. Templates belong to one workspace and are
-- protected by the same org membership, module, resource, role and capability
-- rules as the estimates register. The server sanitises every payload before
-- it is stored, and RLS is the final authority on every read and write.
create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_by_id uuid,
  created_by_name text not null default '',
  updated_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_templates_org_updated_idx
  on public.quote_templates (organization_id, updated_at desc);

alter table public.quote_templates enable row level security;
revoke all on public.quote_templates from anon, authenticated;
grant select, insert, update, delete on public.quote_templates to authenticated;
grant all on public.quote_templates to service_role;

drop policy if exists quote_templates_select on public.quote_templates;
create policy quote_templates_select on public.quote_templates
  for select to authenticated
  using (
    organization_id = any (public.app_org_ids())
    and public.app_can_read(organization_id, 'estimates'::text)
  );

drop policy if exists quote_templates_insert on public.quote_templates;
create policy quote_templates_insert on public.quote_templates
  for insert to authenticated
  with check (
    organization_id = any (public.app_org_ids())
    and public.app_can_write(organization_id, 'estimates'::text)
    and public.app_has_capability(organization_id, 'records.create'::text)
  );

drop policy if exists quote_templates_update on public.quote_templates;
create policy quote_templates_update on public.quote_templates
  for update to authenticated
  using (
    organization_id = any (public.app_org_ids())
    and public.app_can_write(organization_id, 'estimates'::text)
    and public.app_has_capability(organization_id, 'records.update'::text)
  )
  with check (
    organization_id = any (public.app_org_ids())
    and public.app_can_write(organization_id, 'estimates'::text)
    and public.app_has_capability(organization_id, 'records.update'::text)
  );

drop policy if exists quote_templates_delete on public.quote_templates;
create policy quote_templates_delete on public.quote_templates
  for delete to authenticated
  using (
    organization_id = any (public.app_org_ids())
    and public.app_can_delete(organization_id, 'estimates'::text)
    and public.app_has_capability(organization_id, 'records.delete'::text)
  );
