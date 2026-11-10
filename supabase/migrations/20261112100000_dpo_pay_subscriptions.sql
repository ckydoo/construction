-- MYLA DPO Pay subscriptions: additive shadow-mode schema.
-- Stripe is no longer an active rail. Historic Stripe columns/rows are retained.
-- No payment is charged, no subscription is locked, and no existing row is changed.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.billing_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%gateway%'
  loop
    execute format('alter table public.billing_subscriptions drop constraint %I', r.conname);
  end loop;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.billing_invoices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%gateway%'
  loop
    execute format('alter table public.billing_invoices drop constraint %I', r.conname);
  end loop;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.billing_webhook_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.billing_webhook_events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_gateway_check
  check (gateway in ('none','stripe','paynow','dpo','mock'));

alter table public.billing_invoices
  add constraint billing_invoices_gateway_check
  check (gateway in ('stripe','paynow','dpo','mock'));

alter table public.billing_webhook_events
  add constraint billing_webhook_events_provider_check
  check (provider in ('stripe','paynow','dpo','mock'));

alter table public.billing_subscriptions
  add column if not exists dpo_customer_email text,
  add column if not exists dpo_customer_token text,
  add column if not exists dpo_subscription_token text,
  add column if not exists dpo_last_transaction_token text,
  add column if not exists dpo_last_reference text,
  add column if not exists dpo_tokenised_at timestamptz;

create index if not exists billing_subscriptions_dpo_token_idx
  on public.billing_subscriptions (dpo_subscription_token);

-- New organisations await a 14-day NO-CARD trial. Billing is still shadow/off
-- until BILLING_ENABLED=true and explicit DPO live credentials are supplied.
create or replace function public.billing_seed_new_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.billing_subscriptions (organization_id, plan_id, status, gateway, metadata)
  values (new.id, 'STARTER', 'trial_required', 'none',
          jsonb_build_object('seededAt', now(), 'trialType', 'no_card_14', 'cardRequired', false))
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists billing_seed_new_org on public.organizations;
create trigger billing_seed_new_org after insert on public.organizations
  for each row execute function public.billing_seed_new_org();
