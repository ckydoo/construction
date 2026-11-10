# MYLA subscription system — shadow release

**Date:** 2026-11-07 (Africa/Harare) · **Mode:** `BILLING_ENABLED=false` in production

This release adds the complete organisation-level subscription system requested for
MYLA, but deliberately keeps live charging and locking switched off until live
Stripe/Paynow credentials, price/webhook IDs and legal-entity confirmation are available.
Existing production behaviour is unchanged; nobody is charged and no workspace is locked.

## Decisions implemented

- **One global price book:** USD **9 / 29 / 99** per organisation per month for
  Starter / Pro / Enterprise. No regional price book, no Africa gating.
- **14-day card-required trial:** every new organisation starts on Stripe Checkout with
  `trial_period_days=14` and a saved payment method, but no initial charge.
- **Hybrid gateways:** Stripe automatic subscriptions are canonical. Zimbabwe tenants
  can switch to Paynow at trial end, before Stripe's first charge. Paynow v1 is a
  customer-present monthly checkout/invoice; no tokenisation or silent autodebit.
- **3-day grace then hard lock:** failed renewals are read-only for three days, then
  org pages/APIs are blocked. Billing and meta remain reachable; no data is deleted.
- **Owner/Admin-only Billing:** UI, API and RLS reads are restricted to Owner/Admin.
- **Grandfathering:** all organisations existing before the migration are `comped`,
  active and without expiry. The live migration recorded two: Kestrel Ridge
  Construction & Industrial Group and Codzlabzim construct.
- **Money:** USD settlement, ZWG display only through existing FX settings, prices
  exclusive of VAT/tax, Stripe Tax not auto-enabled.
- **Shadow mode:** full schema, plans, UI, guards, webhooks, cron and QA are present;
  `BILLING_ENABLED=false`, `BILLING_QA_MODE=false`, `PAYNOW_MOCK=false` are set on Vercel.

## Scope delivered

- Supabase migration `20261111100000_billing_subscriptions.sql` / live migration
  `billing_subscriptions_shadow_v1`: subscriptions, invoices, webhook events, billing
  audit events, RLS, new-org trigger and grandfathering.
- Plan catalogue and entitlement filtering in `src/lib/billing-plans.ts` and
  `src/lib/auth.ts`; Starter 5 users/10 active projects/essentials, Pro 25 users/
  unlimited projects/all sections, Enterprise unlimited users/contact sales.
- Middleware hard lock, API guards, user/project limits, AppShell banners and
  Owner/Admin Billing navigation.
- Billing page with plan cards, ZWG display equivalent, shadow-mode notice, gateway
  switch, invoice table, Paynow checkout, Stripe portal, cancellation and contact sales.
- Stripe Checkout, portal and webhook state machine; trial reminders; automatic renewal;
  failed-payment grace; trial-end switch with `cancel_at_period_end`.
- Paynow initiate/poll/webhook hash verification, exact amount/reference checks,
  idempotent event claims, monthly invoice creation and reminders.
- Daily Vercel Cron endpoint and `CRON_SECRET` environment variable.
- Stripe SDK dependency, billing env template, `env:check` validation and
  `npm run audit:billing`.

## Safety against double billing

The trial-end switch is initiated on `customer.subscription.trial_will_end` and again by
the daily sweep as a fallback. Stripe is set to cancel at period end before its first
charge; one Paynow invoice is created for that exact period. A unique
`(organisation, gateway, period_start)` constraint, idempotent webhook claims and a
paid-invoice overlap alert prevent duplicate fulfilment. On Paynow payment, any still-active
Stripe subscription is cancelled defensively and overlapping paid Stripe invoices raise a
manual-review alert. No automatic refund is attempted.

## Verification

- `npx tsc --noEmit` clean; `npm run build` clean.
- `npm run env:check` clean, reporting **Live billing disabled (shadow mode)** and 11 SQL migrations.
- `npm run audit:billing`: **10/10 checks passed** (`SUBSCRIPTION_QA_REPORT.md`). It covered
  registration/onboarding, `trial_required` hard lock, 9/29/99 plans, signed Stripe trial
  checkout, Pro write access, one-invoice trial-end switch without a Stripe charge,
  hash-verified Paynow mock payment, idempotent cron, 3-day grace, hard lock and data
  preservation. Stripe test-mode-compatible signed webhooks plus a Paynow mock were used
  because live keys are not supplied.
- QA cleanup verified: `qa_orgs 0`, `qa_users 0`, `mock_events 0`; pre-existing orgs remain
  `comped`.
- Live billing tables: `2` comped subscriptions, `0` invoices after cleanup.
- Production Vercel environment: `BILLING_ENABLED=false`, `BILLING_QA_MODE=false`,
  `PAYNOW_MOCK=false`, `CRON_SECRET` set.

## Not done / outstanding

- Live Stripe secret, webhook secret, price IDs and customer-portal configuration.
- Stripe legal-entity / supported-country bank-account confirmation.
- Paynow integration ID/key and tokenisation approval (tokenisation intentionally unused).
- VAT/tax registration decision; Stripe Tax remains off.
- `BILLING_ENABLED=true` go-live, live webhook registration and a fresh staging run with
  real test-mode Checkout.
- Known cosmetic `PROJECT -` in tenant-branded PDFs from the prior release remains.

See `BILLING_SETUP.md` for the exact go-live checklist and webhook events.
