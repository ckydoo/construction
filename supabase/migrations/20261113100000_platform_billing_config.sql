-- Platform-owned billing configuration (stage-only v1).
--
-- This migration creates the database/API layer that only the platform owner
-- superadmin can manage. Company/tenant members have NO direct table access:
-- RLS is enabled, all privileges are revoked from anon/authenticated, and only
-- the server-side service role can read or write. Every request to the API is
-- additionally checked against public.platform_admins.
--
-- Live credentials are NEVER stored here. DPO_COMPANY_TOKEN,
-- DPO_CALLBACK_SECRET, DPO_PUSH_SECRET, PAYNOW_INTEGRATION_KEY and CRON_SECRET
-- remain encrypted environment variables. BILLING_ENABLED and DPO_LIVE_MODE
-- remain hard environment master switches; nothing in this schema is read by
-- the billing runtime yet (see PLATFORM_BILLING_CONFIG.md).
--
-- Live migration name: platform_billing_config_v1

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);
create unique index if not exists platform_admins_active_email_key
  on public.platform_admins (lower(email)) where revoked_at is null;

create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  billing_enabled boolean not null default false,
  trial_days integer not null default 14 check (trial_days between 0 and 60),
  grace_days integer not null default 3 check (grace_days between 0 and 30),
  currency text not null default 'USD' check (currency in ('USD')),
  tax_included boolean not null default false,
  active_gateway text not null default 'dpo' check (active_gateway in ('dpo','paynow','mock')),
  pricing_model text not null default 'tiered' check (pricing_model in ('tiered','flat_monthly_yearly','module_size')),
  maintenance_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.gateway_config (
  gateway text primary key check (gateway in ('dpo','paynow','mock')),
  enabled boolean not null default false,
  mode text not null default 'shadow' check (mode in ('shadow','sandbox','live')),
  api_url text,
  payment_url_template text,
  service_type text,
  service_type_name text,
  callback_path text,
  push_path text,
  return_url text,
  result_url text,
  merchant_approved boolean not null default false,
  payout_confirmed boolean not null default false,
  tokenisation_approved boolean not null default false,
  push_url_registered boolean not null default false,
  hosted_url_confirmed boolean not null default false,
  vat_tax_decided boolean not null default false,
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null check (plan_id in ('STARTER','PRO','ENTERPRISE','FLAT')),
  name text not null,
  monthly_usd numeric(10,2) not null check (monthly_usd >= 0),
  yearly_usd numeric(10,2) check (yearly_usd is null or yearly_usd >= 0),
  cadence text not null default 'monthly' check (cadence in ('monthly','yearly','both')),
  user_limit integer check (user_limit is null or user_limit > 0),
  active_project_limit integer check (active_project_limit is null or active_project_limit > 0),
  all_modules_access boolean not null default true,
  sort_order integer not null default 0,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  supersedes_id uuid references public.pricing_plans(id) on delete set null,
  constraint pricing_plans_effective_window check (effective_to is null or effective_to > effective_from),
  constraint pricing_plans_version_key unique (plan_id, effective_from)
);
create unique index if not exists pricing_plans_one_active_per_plan
  on public.pricing_plans (plan_id) where is_active and effective_to is null;
create index if not exists pricing_plans_active_idx
  on public.pricing_plans (plan_id, effective_from desc) where is_active;

create table if not exists public.platform_config_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists platform_config_audit_changed_at_idx
  on public.platform_config_audit (changed_at desc);

create table if not exists public.organization_billing_overrides (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  comped boolean not null default false,
  comped_reason text,
  custom_plan_id text,
  custom_monthly_usd numeric(10,2) check (custom_monthly_usd is null or custom_monthly_usd >= 0),
  custom_yearly_usd numeric(10,2) check (custom_yearly_usd is null or custom_yearly_usd >= 0),
  custom_user_limit integer check (custom_user_limit is null or custom_user_limit > 0),
  custom_active_project_limit integer check (custom_active_project_limit is null or custom_active_project_limit > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  note text,
  constraint organization_billing_overrides_window check (effective_to is null or effective_to > effective_from)
);

-- Convenience helper for service-role checks. Company users cannot execute it.
create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = p_user_id and revoked_at is null
  );
$$;
revoke all on function public.is_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_platform_admin(uuid) to service_role;

-- Versioned pricing helpers. All writes go through the service-role API; these
-- functions keep superseding/activation atomic and audit-friendly.
create or replace function public.create_pricing_plan_version(p_payload jsonb, p_actor uuid)
returns public.pricing_plans
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.pricing_plans;
  v_plan text := p_payload->>'plan_id';
  v_monthly numeric := (p_payload->>'monthly_usd')::numeric;
  v_effective timestamptz := coalesce((p_payload->>'effective_from')::timestamptz, now());
  v_now timestamptz := now();
begin
  if v_plan is null or v_plan not in ('STARTER','PRO','ENTERPRISE','FLAT') then
    raise exception 'invalid plan_id';
  end if;
  if v_monthly is null or v_monthly < 0 then
    raise exception 'monthly_usd must be >= 0';
  end if;

  -- An immediate version supersedes the active row and any earlier pending rows.
  if v_effective <= v_now then
    update public.pricing_plans
       set is_active = false,
           effective_to = v_effective,
           updated_at = v_now,
           updated_by = p_actor
     where plan_id = v_plan
       and effective_to is null
       and (is_active or effective_from < v_effective);
  end if;

  insert into public.pricing_plans (
    plan_id, name, monthly_usd, yearly_usd, cadence, user_limit,
    active_project_limit, all_modules_access, sort_order, effective_from,
    effective_to, is_active, created_by, updated_by, supersedes_id, created_at, updated_at
  ) values (
    v_plan,
    coalesce(nullif(p_payload->>'name',''), initcap(lower(v_plan))),
    v_monthly,
    nullif(p_payload->>'yearly_usd','')::numeric,
    coalesce(nullif(p_payload->>'cadence',''),'monthly'),
    nullif(p_payload->>'user_limit','')::integer,
    nullif(p_payload->>'active_project_limit','')::integer,
    coalesce((p_payload->>'all_modules_access')::boolean, true),
    coalesce((p_payload->>'sort_order')::integer, 0),
    v_effective,
    null,
    v_effective <= v_now,
    p_actor,
    p_actor,
    null,
    v_now,
    v_now
  ) returning * into v_row;

  return v_row;
end $$;

create or replace function public.activate_due_pricing_plans(p_now timestamptz default now())
returns setof public.pricing_plans
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_current public.pricing_plans;
  v_next public.pricing_plans;
begin
  for r in
    select distinct plan_id
    from public.pricing_plans
    where is_active = false and effective_to is null and effective_from <= p_now
  loop
    select * into v_current
    from public.pricing_plans
    where plan_id = r.plan_id and is_active and effective_to is null
    order by effective_from desc limit 1;

    select * into v_next
    from public.pricing_plans
    where plan_id = r.plan_id and is_active = false and effective_to is null
      and effective_from <= p_now
    order by effective_from desc limit 1;

    if v_next.id is not null
       and (v_current.id is null or v_next.effective_from > v_current.effective_from) then
      update public.pricing_plans
         set is_active = false,
             effective_to = v_next.effective_from,
             updated_at = p_now
       where plan_id = r.plan_id
         and effective_to is null
         and effective_from <= v_next.effective_from
         and id <> v_next.id;
      update public.pricing_plans
         set is_active = true, updated_at = p_now
       where id = v_next.id
      returning * into v_next;
      return next v_next;
    end if;
  end loop;
  return;
end $$;

create or replace function public.retire_pricing_plan(p_id uuid, p_actor uuid)
returns public.pricing_plans
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.pricing_plans;
begin
  select * into v_row from public.pricing_plans where id = p_id;
  if v_row.id is null then raise exception 'pricing plan not found'; end if;
  if v_row.effective_from > now() then
    -- Pending future version: cancel it rather than create an invalid window.
    delete from public.pricing_plans where id = p_id;
  else
    update public.pricing_plans
       set is_active = false,
           effective_to = coalesce(effective_to, now()),
           updated_at = now(),
           updated_by = p_actor
     where id = p_id
    returning * into v_row;
  end if;
  return v_row;
end $$;

create or replace function public.delete_pricing_plan(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.pricing_plans where id = p_id;
  if not found then raise exception 'pricing plan not found'; end if;
end $$;

revoke all on function public.create_pricing_plan_version(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.activate_due_pricing_plans(timestamptz) from public, anon, authenticated;
revoke all on function public.retire_pricing_plan(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_pricing_plan(uuid) from public, anon, authenticated;
grant execute on function public.create_pricing_plan_version(jsonb, uuid) to service_role;
grant execute on function public.activate_due_pricing_plans(timestamptz) to service_role;
grant execute on function public.retire_pricing_plan(uuid, uuid) to service_role;
grant execute on function public.delete_pricing_plan(uuid) to service_role;

create or replace view public.active_pricing_plans
with (security_invoker = true) as
select p.*
from public.pricing_plans p
where p.is_active
  and p.effective_from <= now()
  and (p.effective_to is null or p.effective_to > now());

-- RLS: deny ALL company/anonymous access. The service role bypasses RLS and is
-- used only by the platform-admin API after verifying public.platform_admins.
do $$
declare
  t text;
begin
  foreach t in array array[
    'platform_admins','platform_settings','gateway_config','pricing_plans',
    'platform_config_audit','organization_billing_overrides'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

revoke all on public.active_pricing_plans from anon, authenticated;
grant select on public.active_pricing_plans to service_role;

-- Immutable audit trail: every INSERT/UPDATE/DELETE on a config table is logged
-- by a security-definer trigger, so bypassing the API cannot skip auditing.
create or replace function public.platform_config_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_old jsonb := null;
  v_new jsonb := null;
  v_source jsonb;
  v_record_id text;
  v_note text := nullif(current_setting('platform.config.note', true), '');
begin
  if TG_OP = 'DELETE' then
    v_source := to_jsonb(OLD);
    v_old := v_source;
  else
    v_source := to_jsonb(NEW);
    v_new := v_source;
    if TG_OP = 'UPDATE' then v_old := to_jsonb(OLD); end if;
  end if;

  v_record_id := coalesce(
    v_source->>'id',
    v_source->>'gateway',
    v_source->>'user_id',
    v_source->>'organization_id'
  );
  v_actor := coalesce(
    nullif(v_source->>'updated_by','')::uuid,
    nullif(v_source->>'created_by','')::uuid,
    nullif(v_source->>'revoked_by','')::uuid
  );

  insert into public.platform_config_audit (
    table_name, record_id, action, old_values, new_values, changed_by, note
  ) values (
    TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, v_actor, v_note
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;
revoke all on function public.platform_config_audit_trigger() from public, anon, authenticated;
grant execute on function public.platform_config_audit_trigger() to service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'platform_admins','platform_settings','gateway_config','pricing_plans',
    'organization_billing_overrides'
  ] loop
    execute format('drop trigger if exists platform_config_audit on public.%I', t);
    execute format($f$
      create trigger platform_config_audit
      after insert or update or delete on public.%I
      for each row execute function public.platform_config_audit_trigger()
    $f$, t);
  end loop;
end $$;

-- Seed the staged configuration. No runtime billing behaviour changes.
select set_config('platform.config.note', 'Initial staged platform billing configuration seed.', true);

insert into public.platform_admins (user_id, email, created_by, updated_by)
values (
  '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a',
  'codzlabzim53@gmail.com',
  '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a',
  '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a'
) on conflict (user_id) do update
  set email = excluded.email, revoked_at = null, revoked_by = null,
      updated_by = excluded.updated_by;

insert into public.platform_settings (
  id, billing_enabled, trial_days, grace_days, currency, tax_included,
  active_gateway, pricing_model, maintenance_mode, updated_by
) values (
  1, false, 14, 3, 'USD', false, 'dpo', 'tiered', false,
  '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a'
) on conflict (id) do nothing;

insert into public.gateway_config (
  gateway, enabled, mode, api_url, payment_url_template, callback_path, push_path,
  requirements, updated_by
) values
('dpo', false, 'shadow',
 'https://secure.3gdirectpay.com/API/v6/',
 'https://secure.3gdirectpay.com/payv2.php?ID={token}',
 '/api/webhooks/dpo?source=return',
 '/api/webhooks/dpo',
 '{"merchant_approved":false,"payout_confirmed":false,"tokenisation_approved":false,"push_url_registered":false,"hosted_url_confirmed":false,"vat_tax_decided":false}'::jsonb,
 '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a'),
('paynow', false, 'shadow',
 null, null, null, '/api/webhooks/paynow',
 '{"merchant_approved":false,"payout_confirmed":false,"vat_tax_decided":false}'::jsonb,
 '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a'),
('mock', false, 'shadow', null, null, null, null,
 '{}'::jsonb,
 '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a')
on conflict (gateway) do nothing;

insert into public.pricing_plans (
  plan_id, name, monthly_usd, yearly_usd, cadence, user_limit,
  active_project_limit, all_modules_access, sort_order, effective_from,
  is_active, created_by, updated_by
) values
('STARTER','Starter',9.00,null,'monthly',5,10,false,1,now(),true,
 '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a','61aa66b8-b5d6-4aac-ba46-e348fd5ee37a'),
('PRO','Pro',29.00,null,'monthly',25,null,true,2,now(),true,
 '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a','61aa66b8-b5d6-4aac-ba46-e348fd5ee37a'),
('ENTERPRISE','Enterprise',99.00,null,'monthly',null,null,true,3,now(),true,
 '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a','61aa66b8-b5d6-4aac-ba46-e348fd5ee37a')
on conflict (plan_id, effective_from) do nothing;

insert into public.organization_billing_overrides (
  organization_id, comped, comped_reason, created_by, updated_by, note
)
select id, true, 'grandfather_all',
       '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a',
       '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a',
       'Existing organisation remains comped under the original subscription contract.'
from public.organizations
where slug in ('kestrel-ridge','codzlabzim-construct')
on conflict (organization_id) do nothing;

select set_config('platform.config.note', '', true);
