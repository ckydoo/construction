-- Workspace-scoped support desk. Tickets and comments are separate from the
-- generic records table, so starter module/resource counts stay unchanged.
create table if not exists public.support_tickets (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_no text not null,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_name text not null,
  reporter_email text not null default '',
  title text not null,
  description text not null,
  category text not null default 'BUG' check (category in ('BUG','ISSUE','QUESTION','FEATURE_REQUEST','BILLING','OTHER')),
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_ON_USER','RESOLVED','CLOSED')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_to_name text,
  page_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  unique (organization_id, ticket_no)
);
create index if not exists support_tickets_org_created_idx on public.support_tickets(organization_id, created_at desc);
create index if not exists support_tickets_org_reporter_idx on public.support_tickets(organization_id, reporter_id, created_at desc);
create index if not exists support_tickets_org_status_idx on public.support_tickets(organization_id, status, updated_at desc);

create table if not exists public.support_ticket_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_comments_ticket_idx on public.support_ticket_comments(organization_id, ticket_id, created_at);

create or replace function public.app_support_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_org = any(public.app_org_ids())
    and coalesce(public.app_role(p_org), '') in ('OWNER','ADMIN');
$$;

create or replace function public.app_support_ticket_visible(p_org uuid, p_ticket uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (p_org = any(public.app_org_ids())) then return false; end if;
  if public.app_support_admin(p_org) then return true; end if;
  return exists (
    select 1 from public.support_tickets t
    where t.id = p_ticket and t.organization_id = p_org and t.reporter_id = auth.uid()
  );
end;
$$;

create or replace function public.app_support_ticket_no(p_org uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next integer;
begin
  if not (p_org = any(public.app_org_ids())) then raise exception 'Unauthorized'; end if;
  insert into public.sequences as s (organization_id, resource, next)
  values (p_org, 'supportTickets', 2)
  on conflict (organization_id, resource) do update set next = s.next + 1
  returning s.next - 1 into v_next;
  return 'SUP-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.app_support_ticket_touch()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists support_tickets_touch on public.support_tickets;
create trigger support_tickets_touch before update on public.support_tickets
for each row execute function public.app_support_ticket_touch();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_comments enable row level security;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (organization_id = any(public.app_org_ids()) and (public.app_support_admin(organization_id) or reporter_id = auth.uid()));

drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (
    organization_id = any(public.app_org_ids())
    and reporter_id = auth.uid()
    and status = 'OPEN'
    and assigned_to is null
  );

drop policy if exists support_tickets_update on public.support_tickets;
create policy support_tickets_update on public.support_tickets for update to authenticated
  using (organization_id = any(public.app_org_ids()) and public.app_support_admin(organization_id))
  with check (organization_id = any(public.app_org_ids()) and public.app_support_admin(organization_id));

-- No delete policy: support history is retained as an audit trail.

drop policy if exists support_ticket_comments_select on public.support_ticket_comments;
create policy support_ticket_comments_select on public.support_ticket_comments for select to authenticated
  using (organization_id = any(public.app_org_ids()) and public.app_support_ticket_visible(organization_id, ticket_id));

drop policy if exists support_ticket_comments_insert on public.support_ticket_comments;
create policy support_ticket_comments_insert on public.support_ticket_comments for insert to authenticated
  with check (
    organization_id = any(public.app_org_ids())
    and author_id = auth.uid()
    and public.app_support_ticket_visible(organization_id, ticket_id)
  );

grant select, insert, update on public.support_tickets to authenticated, service_role;
grant select, insert on public.support_ticket_comments to authenticated, service_role;
grant execute on function public.app_support_admin(uuid) to authenticated, service_role;
grant execute on function public.app_support_ticket_visible(uuid, uuid) to authenticated, service_role;
grant execute on function public.app_support_ticket_no(uuid) to authenticated, service_role;
