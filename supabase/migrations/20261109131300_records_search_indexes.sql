-- Server-side search and paging for large workspaces.
-- Additive only: no existing column, policy, resource ID or API shape changes.

create extension if not exists pg_trgm with schema extensions;

alter table public.records
  add column if not exists search_text text not null default '';

create or replace function public.records_set_search_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.search_text := lower(concat_ws(' ', new.title, new.number, new.data::text));
  return new;
end;
$$;

drop trigger if exists records_search_text_biu on public.records;
create trigger records_search_text_biu
before insert or update of title, number, data
on public.records
for each row execute function public.records_set_search_text();

-- Backfill existing rows; the trigger keeps new and edited rows current.
update public.records
set search_text = lower(concat_ws(' ', title, number, data::text))
where search_text = '';

create index if not exists records_org_resource_created_idx
  on public.records(organization_id, resource, created_at desc);
create index if not exists records_org_resource_project_idx
  on public.records(organization_id, resource, project_id);
create index if not exists records_title_trgm_idx
  on public.records using gin (lower(title) extensions.gin_trgm_ops);
create index if not exists records_number_trgm_idx
  on public.records using gin (lower(number) extensions.gin_trgm_ops);
create index if not exists records_search_text_trgm_idx
  on public.records using gin (search_text extensions.gin_trgm_ops);
