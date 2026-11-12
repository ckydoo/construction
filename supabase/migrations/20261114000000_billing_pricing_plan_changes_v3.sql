-- MYLA billing v3: 7-day trial, USD 6/14/26 price book, early trial payment,
-- comped-to-payable migration, and effective-dated plan changes.
-- No live charge is made here; invoices are only made payable in the app.

-- Allow a cancelled invoice to be reissued after a plan change without losing
-- its audit history. Only one non-cancelled invoice may exist per period.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.billing_invoices'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%period_start%'
  loop
    execute format('alter table public.billing_invoices drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists billing_invoices_active_period_key
  on public.billing_invoices (organization_id, gateway, period_start)
  where status <> 'cancelled';

-- Scheduled downgrades and their audit trail.
alter table public.billing_subscriptions
  add column if not exists pending_plan_id text check (pending_plan_id in ('STARTER','PRO','ENTERPRISE')),
  add column if not exists pending_plan_effective_at timestamptz;

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_pending_plan_pair;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_pending_plan_pair check (
    (pending_plan_id is null and pending_plan_effective_at is null)
    or (pending_plan_id is not null and pending_plan_effective_at is not null)
  );

create table if not exists public.billing_plan_changes (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  from_plan text not null check (from_plan in ('STARTER','PRO','ENTERPRISE')),
  to_plan text not null check (to_plan in ('STARTER','PRO','ENTERPRISE')),
  direction text not null check (direction in ('upgrade','downgrade')),
  effective_at timestamptz not null,
  status text not null default 'pending' check (status in
    ('pending','payment_pending','applied','cancelled','failed')),
  proration_usd numeric(10,2) not null default 0 check (proration_usd >= 0),
  adjustment_invoice_id uuid references public.billing_invoices(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists billing_plan_changes_one_pending_per_org
  on public.billing_plan_changes (organization_id)
  where status in ('pending','payment_pending');
create index if not exists billing_plan_changes_org_created_idx
  on public.billing_plan_changes (organization_id, created_at desc);
alter table public.billing_plan_changes enable row level security;
drop trigger if exists billing_plan_changes_touch on public.billing_plan_changes;
create trigger billing_plan_changes_touch before update on public.billing_plan_changes
  for each row execute function public.billing_touch_updated_at();

-- New organisations are seeded for the new no-card 7-day policy. Onboarding
-- starts the clock and creates a payable-during-trial invoice in app code.
create or replace function public.billing_seed_new_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.billing_subscriptions (organization_id, plan_id, status, gateway, metadata)
  values (new.id, 'STARTER', 'trial_required', 'none',
          jsonb_build_object(
            'seededAt', now(), 'trialType', 'no_card_7', 'cardRequired', false,
            'trialPolicyDays', 7, 'priceBookVersion', 'USD_6_14_26_V1',
            'planChangePolicy', 'upgrade_immediate_prorated_downgrade_period_end'
          ))
  on conflict (organization_id) do nothing;
  return new;
end;
$$;
drop trigger if exists billing_seed_new_org on public.organizations;
create trigger billing_seed_new_org after insert on public.organizations
  for each row execute function public.billing_seed_new_org();

-- Staged platform configuration now matches the runtime master switch.
update public.platform_settings
   set billing_enabled = true, trial_days = 7, grace_days = 3,
       active_gateway = 'paynow', pricing_model = 'tiered',
       updated_at = now(), updated_by = null
 where id = 1;

update public.gateway_config
   set enabled = true, mode = 'live',
       result_url = 'https://myla-construction-erp.vercel.app/api/webhooks/paynow',
       requirements = coalesce(requirements, '{}'::jsonb) || jsonb_build_object(
         'merchant_approved', true, 'payout_confirmed', true, 'vat_tax_decided', true
       ),
       updated_at = now(), updated_by = null
 where gateway = 'paynow';

-- Effective-dated price-book versions; the old rows remain as audit history.
select public.create_pricing_plan_version(jsonb_build_object(
  'plan_id','STARTER','name','Starter','monthly_usd',6.00,'cadence','monthly',
  'user_limit',5,'active_project_limit',10,'all_modules_access',false,'sort_order',1
), null::uuid);
select public.create_pricing_plan_version(jsonb_build_object(
  'plan_id','PRO','name','Pro','monthly_usd',14.00,'cadence','monthly',
  'user_limit',25,'active_project_limit',null,'all_modules_access',true,'sort_order',2
), null::uuid);
select public.create_pricing_plan_version(jsonb_build_object(
  'plan_id','ENTERPRISE','name','Enterprise','monthly_usd',26.00,'cadence','monthly',
  'user_limit',null,'active_project_limit',null,'all_modules_access',true,'sort_order',3
), null::uuid);

-- Apply the new policy to every organisation. Comped workspaces become payable
-- immediately, with a three-day payment window and full access until then.
do $$
declare v_now timestamptz := now();
begin
  with converted as (
    update public.billing_subscriptions s
       set status = 'active', comped_reason = null, trial_ends_at = null,
           current_period_start = v_now, current_period_end = v_now + interval '1 month',
           grace_until = null, switch_deadline = null, last_payment_at = null,
           cancelled_at = null, gateway = 'paynow', paynow_preferred = true,
           dpo_customer_token = null, dpo_subscription_token = null,
           dpo_last_transaction_token = null, dpo_tokenised_at = null,
           pending_plan_id = null, pending_plan_effective_at = null,
           metadata = metadata || jsonb_build_object(
             'compedConvertedAt', v_now, 'compedConverted', true,
             'priceBookVersion', 'USD_6_14_26_V1', 'trialPolicyDays', 7,
             'planChangePolicy', 'upgrade_immediate_prorated_downgrade_period_end'
           )
     where status = 'comped'
     returning organization_id, plan_id, v_now as period_start,
              v_now + interval '1 month' as period_end
  )
  insert into public.billing_invoices (
    organization_id, invoice_number, reference, plan_id, gateway, amount_usd,
    currency, status, period_start, period_end, due_at, reminder_upcoming_at,
    raw_status, metadata
  )
  select organization_id,
         'MYLA-' || to_char(v_now,'YYYYMM') || '-' || upper(substr(md5(organization_id::text || v_now::text || 'initial'),1,12)),
         'MYLA-' || to_char(v_now,'YYYYMM') || '-' || upper(substr(md5(organization_id::text || v_now::text || 'initial'),1,12)),
         plan_id, 'paynow',
         case plan_id when 'STARTER' then 6.00 when 'PRO' then 14.00 else 26.00 end,
         'USD', 'pending', period_start, period_end, v_now + interval '3 days',
         v_now, 'Payable now',
         jsonb_build_object(
           'planName', case plan_id when 'STARTER' then 'Starter' when 'PRO' then 'Pro' else 'Enterprise' end,
           'amountUsd', case plan_id when 'STARTER' then 6.00 when 'PRO' then 14.00 else 26.00 end,
           'taxIncluded', false, 'invoiceKind', 'subscription_initial',
           'compedConverted', true, 'prepayAfterTrial', false,
           'priceBookVersion', 'USD_6_14_26_V1', 'paymentWindowDays', 3
         )
    from converted
  on conflict do nothing;

  insert into public.billing_events (organization_id, kind, dedupe_key, detail, payload)
  select organization_id, 'comped_converted_to_payable', 'USD_6_14_26_V1',
         'Comped workspace converted to standard billing with an immediate payable invoice; no trial and no charge.',
         jsonb_build_object('priceBookVersion','USD_6_14_26_V1','paymentWindowDays',3)
    from public.billing_subscriptions
   where metadata->>'compedConverted' = 'true'
  on conflict do nothing;

  -- Existing pre-trial organisations start a 7-day trial now.
  update public.billing_subscriptions
     set status = 'trialing', trial_ends_at = v_now + interval '7 days',
         current_period_start = null, current_period_end = null,
         grace_until = null, switch_deadline = null, last_payment_at = null,
         cancelled_at = null, gateway = 'paynow', paynow_preferred = true,
         pending_plan_id = null, pending_plan_effective_at = null,
         metadata = metadata || jsonb_build_object(
           'trialStartedAt', v_now, 'trialType', 'no_card_7', 'cardRequired', false,
           'planAtTrialStart', plan_id, 'gatewayPreference', 'paynow',
           'priceBookVersion', 'USD_6_14_26_V1', 'trialPolicyDays', 7,
           'planChangePolicy', 'upgrade_immediate_prorated_downgrade_period_end'
         )
   where status = 'trial_required';

  -- Existing 14-day trials are shortened to seven days from their own start.
  update public.billing_subscriptions
     set trial_ends_at = coalesce((metadata->>'trialStartedAt')::timestamptz, created_at) + interval '7 days',
         current_period_start = null, current_period_end = null,
         gateway = 'paynow', paynow_preferred = true,
         pending_plan_id = null, pending_plan_effective_at = null,
         metadata = metadata || jsonb_build_object(
           'trialType', 'no_card_7', 'cardRequired', false,
           'gatewayPreference', 'paynow', 'priceBookVersion', 'USD_6_14_26_V1',
           'trialPolicyDays', 7,
           'planChangePolicy', 'upgrade_immediate_prorated_downgrade_period_end'
         )
   where status = 'trialing'
     and metadata->>'trialStartedAt' is not null;

  -- Every trial has an invoice for the month beginning when the trial ends.
  -- It is payable immediately but does not shorten the trial.
  insert into public.billing_invoices (
    organization_id, invoice_number, reference, plan_id, gateway, amount_usd,
    currency, status, period_start, period_end, due_at, reminder_upcoming_at,
    raw_status, metadata
  )
  select s.organization_id,
         'MYLA-' || to_char(s.trial_ends_at,'YYYYMM') || '-' || upper(substr(md5(s.organization_id::text || s.trial_ends_at::text || 'prepay'),1,12)),
         'MYLA-' || to_char(s.trial_ends_at,'YYYYMM') || '-' || upper(substr(md5(s.organization_id::text || s.trial_ends_at::text || 'prepay'),1,12)),
         s.plan_id, 'paynow',
         case s.plan_id when 'STARTER' then 6.00 when 'PRO' then 14.00 else 26.00 end,
         'USD', 'pending', s.trial_ends_at, s.trial_ends_at + interval '1 month',
         s.trial_ends_at, v_now, 'Payable during trial',
         jsonb_build_object(
           'planName', case s.plan_id when 'STARTER' then 'Starter' when 'PRO' then 'Pro' else 'Enterprise' end,
           'amountUsd', case s.plan_id when 'STARTER' then 6.00 when 'PRO' then 14.00 else 26.00 end,
           'taxIncluded', false, 'invoiceKind', 'subscription_prepay',
           'prepayAfterTrial', true, 'trialEndsAt', s.trial_ends_at,
           'priceBookVersion', 'USD_6_14_26_V1'
         )
    from public.billing_subscriptions s
   where s.status = 'trialing'
     and s.trial_ends_at is not null
     and not exists (
       select 1 from public.billing_invoices i
        where i.organization_id = s.organization_id
          and i.gateway = 'paynow'
          and i.period_start = s.trial_ends_at
          and i.status <> 'cancelled'
     )
  on conflict do nothing;

  -- Consistent policy metadata across all subscriptions.
  update public.billing_subscriptions
     set metadata = metadata || jsonb_build_object(
       'trialPolicyDays', 7, 'priceBookVersion', 'USD_6_14_26_V1',
       'planChangePolicy', 'upgrade_immediate_prorated_downgrade_period_end'
     );

  update public.organization_billing_overrides
     set comped = false, comped_reason = null, effective_to = null,
         note = 'Converted from comped to standard billing under the USD 6/14/26 price book; no trial and no charge.',
         updated_at = v_now, updated_by = null
   where comped = true;
end $$;
