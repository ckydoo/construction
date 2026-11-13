-- New invitation flow. Legacy memberships and legacy invitations are unchanged.
create table public.workspace_invites_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null,
  entity_id text,
  staff_employee_id text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workspace_invites_v2_pending_unique on public.workspace_invites_v2(organization_id,email)
  where accepted_at is null and cancelled_at is null;
alter table public.workspace_invites_v2 enable row level security;
revoke all on public.workspace_invites_v2 from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_invites_v2 to service_role;

-- Membership creation and consumption of the token are one transaction.
create function public.accept_workspace_invite_v2(p_token_hash text, p_user_id uuid, p_billing_enabled boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare inv public.workspace_invites_v2%rowtype; org_slug text; plan text; sub_status text; seats integer; max_seats integer; configured_users text;
begin
  select * into inv from public.workspace_invites_v2 where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null or inv.cancelled_at is not null or inv.expires_at <= now() or not exists (select 1 from auth.users where id=p_user_id and lower(email)=lower(inv.email)) then
    raise exception 'Invitation is invalid, expired or already used';
  end if;
  select slug, config #>> '{limits,users}' into org_slug, configured_users from public.organizations where id = inv.organization_id for update;
  if not found then raise exception 'Workspace unavailable'; end if;
  if p_billing_enabled then
    select plan_id, status into plan, sub_status from public.billing_subscriptions where organization_id = inv.organization_id for update;
    if coalesce(sub_status, 'trial_required') not in ('comped','trialing','active') then raise exception 'Workspace cannot accept invitations until billing is active'; end if;
    max_seats := case coalesce(plan,'STARTER') when 'STARTER' then 6 when 'PRO' then 25 when 'ENTERPRISE' then case when configured_users ~ '^[0-9]{1,5}$' then least(configured_users::integer,9999) else 9999 end else 6 end;
    select count(*) into seats from public.memberships where organization_id = inv.organization_id;
    if max_seats is not null and seats >= max_seats then raise exception 'Workspace user limit reached'; end if;
  end if;
  insert into public.memberships(user_id,organization_id,role,entity_id,staff_employee_id)
    values(p_user_id,inv.organization_id,inv.role,inv.entity_id,inv.staff_employee_id);
  update public.workspace_invites_v2 set accepted_at=now(), updated_at=now() where id=inv.id;
  return org_slug;
end $$;
revoke all on function public.accept_workspace_invite_v2(text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.accept_workspace_invite_v2(text,uuid,boolean) to service_role;
