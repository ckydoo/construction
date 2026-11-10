-- MYLA organisation subscriptions (shadow-mode schema).
-- Additive only: no existing application table, RLS policy or row is changed.
-- Existing organisations are grandfathered comped; new organisations await a
-- 14-day card-required Stripe Checkout trial. Nothing here charges a card.

create table if not exists public.billing_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id text not null default 'STARTER' check (plan_id in ('STARTER','PRO','ENTERPRISE')),
  status text not null default 'trial_required' check (status in
    ('trial_required','trialing','active','past_due','grace','switch_pending','locked','cancelled','comped')),
  gateway text not null default 'none' check (gateway in ('none','stripe','paynow')),
  paynow_preferred boolean not null default false,
  comped_reason text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  switch_deadline timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text,
  stripe_cancelled_at timestamptz,
  last_stripe_charge_period_start timestamptz,
  paynow_last_reference text,
  last_payment_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_invoices (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number text not null unique,
  reference text not null unique,
  plan_id text not null check (plan_id in ('STARTER','PRO','ENTERPRISE')),
  gateway text not null check (gateway in ('stripe','paynow','mock')),
  amount_usd numeric(10,2) not null check (amount_usd > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  due_at timestamptz not null,
  hosted_url text,
  poll_url text,
  gateway_reference text,
  raw_status text,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  reminder_upcoming_at timestamptz,
  reminder_due_at timestamptz,
  reminder_grace_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, gateway, period_start)
);

create table if not exists public.billing_webhook_events (
  id bigserial primary key,
  provider text not null check (provider in ('stripe','paynow','mock')),
  event_id text not null,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create table if not exists public.billing_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  dedupe_key text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, kind, dedupe_key)
);

create index if not exists billing_subscriptions_status_idx on public.billing_subscriptions(status);
create index if not exists billing_subscriptions_period_idx on public.billing_subscriptions(current_period_end, trial_ends_at);
create index if not exists billing_invoices_org_due_idx on public.billing_invoices(organization_id, due_at, status);
create index if not exists billing_invoices_status_idx on public.billing_invoices(status, due_at);

-- Owner/Admin-only read through the cookie-bound client. All writes go through
-- service-role server code (checkout, webhooks and the daily billing sweep).
create or replace function public.app_is_billing_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.role in ('OWNER','ADMIN')
  );
$$;
grant execute on function public.app_is_billing_admin(uuid) to authenticated;

alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists billing_subscriptions_select_admin on public.billing_subscriptions;
create policy billing_subscriptions_select_admin on public.billing_subscriptions
  for select to authenticated using (public.app_is_billing_admin(organization_id));

drop policy if exists billing_invoices_select_admin on public.billing_invoices;
create policy billing_invoices_select_admin on public.billing_invoices
  for select to authenticated using (public.app_is_billing_admin(organization_id));

-- No authenticated INSERT/UPDATE/DELETE policies: service role only.

create or replace function public.billing_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists billing_subscriptions_touch on public.billing_subscriptions;
create trigger billing_subscriptions_touch before update on public.billing_subscriptions
  for each row execute function public.billing_touch_updated_at();
drop trigger if exists billing_invoices_touch on public.billing_invoices;
create trigger billing_invoices_touch before update on public.billing_invoices
  for each row execute function public.billing_touch_updated_at();

-- Existing organisations: active/comped, no expiry, full entitlements.
insert into public.billing_subscriptions (
  organization_id, plan_id, status, gateway, comped_reason,
  current_period_start, metadata
)
select o.id, 'ENTERPRISE', 'comped', 'none', 'grandfathered_before_subscriptions',
       o.created_at, jsonb_build_object('grandfatheredAt', now())
from public.organizations o
on conflict (organization_id) do nothing;

-- New organisations: do NOT start a trial clock in shadow mode. The first
-- Owner/Admin Billing visit starts the 14-day Stripe Checkout trial when
-- billing is enabled; no card is charged and no lock is applied before then.
create or replace function public.billing_seed_new_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.billing_subscriptions (organization_id, plan_id, status, gateway, metadata)
  values (new.id, 'STARTER', 'trial_required', 'none', jsonb_build_object('seededAt', now()))
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists billing_seed_new_org on public.organizations;
create trigger billing_seed_new_org after insert on public.organizations
  for each row execute function public.billing_seed_new_org();
