# MYLA subscription setup & go-live checklist

**Current state: SHADOW MODE.** The complete billing system is built and deployed as
commit `3b811f0cc16fd202749962c1f8bb6d3c704f6b0f` / deployment `dpl_4w94S2ryvm6WLV3uamSydyp2zbTn`,
but `BILLING_ENABLED=false` on Vercel production, preview and development. No live
card is charged, no workspace is locked, and no live Stripe/Paynow request is made.
`BILLING_QA_MODE=false` and `PAYNOW_MOCK=false` are also set on Vercel. Post-promotion
production smoke passed **17/17** checks; see `SUBSCRIPTION_SHADOW_RELEASE.md`.

## Product contract

| Tier | Price | Users | Active projects | Entitlements |
|---|---:|---:|---:|---|
| Starter | **USD 9 / organisation / month** | 5 | 10 | Essential sections, standard support |
| Pro | **USD 29 / organisation / month** | 25 | Unlimited | All 34 sections / 49 resources, tenant-branded financial PDFs, advanced RBAC/reporting, document library |
| Enterprise | **USD 99 / organisation / month** | Unlimited | Unlimited | Everything in Pro, onboarding, priority support, custom branding, contact sales |

The same three prices apply everywhere; there is no Africa/regional price book or gating.
Settlement is USD. ZWG is **display only** through the existing FX settings. Prices are
exclusive of VAT/tax and Stripe Tax is not auto-enabled. Monthly billing only in v1.

All new organisations get a **14-day card-required trial on Stripe Checkout**:
`trial_period_days=14`, `payment_method_collection=always`, no initial charge and a
zero-value trial invoice. Zimbabwe/Paynow tenants may opt to switch at trial end;
Stripe is cancelled at period end **before its first charge**, then one Paynow invoice
covers the same period. If they do not switch, Stripe charges normally. Stripe remains
the canonical automatic subscription gateway. Paynow uses **customer-present monthly
checkout/invoice**; tokenisation and silent autodebit are deliberately not used until
merchant approval exists. Failed renewals are read-only for a 3-day grace period and
then hard-locked. No data is ever deleted. Existing organisations are grandfathered
active/comped with no expiry.

## What is implemented

- Tables: `billing_subscriptions`, `billing_invoices`, `billing_webhook_events`,
  `billing_events`; migration `supabase/migrations/20261111100000_billing_subscriptions.sql`
  and live Supabase migration `billing_subscriptions_shadow_v1`.
- RLS: Owner/Admin read only; all writes use the service-role server client. No browser
  client can alter billing state. A trigger seeds every new organisation as
  `trial_required`; all pre-existing organisations were inserted as `comped`.
- Enforcement: `src/middleware.ts` hard-locks org pages/APIs, leaving `/billing` and
  `/api/[org]/meta` reachable. `src/lib/auth.ts` intersects modules/resources/limits
  with the purchased plan; API write guards, user/project limits and the AppShell
  banner provide defence in depth.
- Owner/Admin UI: `src/app/[org]/billing/page.tsx`, plus Billing links in the sidebar
  and account menu.
- Stripe: Checkout trial, customer portal, subscription/invoice webhooks,
  `trial_will_end` switch, automatic renewal state and 3-day grace.
- Paynow: SHA-512 hash verification, exact reference/amount matching, poll URL
  confirmation with host allowlist, idempotent webhook claims, monthly invoices and
  reminders. `tokenize` is never sent.
- Cron: `vercel.json` calls `/api/cron/billing` daily at 02:00 UTC with Vercel's
  `CRON_SECRET` bearer token. It creates one renewal invoice per period, sends
  reminders, expires grace and locks; replaying it is idempotent.
- Double-billing guards: one invoice per `(organisation, gateway, period_start)`,
  `cancel_at_period_end` before the Stripe first charge, defensive Stripe cancellation
  on Paynow payment, paid-invoice overlap alerts and idempotent webhook/event tables.
- QA: `npm run audit:billing` uses Stripe-test-mode-compatible signed webhook events
  and a local Paynow mock. `SUBSCRIPTION_QA_REPORT.md` records **10/10 passing checks**.

## Go-live prerequisites — NOT yet supplied

1. **Confirm the Stripe legal entity and supported-country bank account.** Zimbabwe is
   not assumed to be a native Stripe merchant-account country; Stripe Tax coverage is
   not payment processing. A supported entity/bank account must be confirmed with Stripe.
2. Add live Stripe credentials to Vercel:
   `STRIPE_SECRET_KEY=sk_live_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`,
   optionally stable `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`,
   `STRIPE_PRICE_ENTERPRISE` and `STRIPE_PORTAL_CONFIGURATION`. If price IDs are omitted,
   Checkout creates recurring `price_data` from the plan catalogue.
3. Configure a Stripe webhook to `https://myla-construction-erp.vercel.app/api/webhooks/stripe`
   for `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
   `customer.subscription.trial_will_end`, `invoice.paid` and `invoice.payment_failed`.
4. Add Paynow Zimbabwe `PAYNOW_INTEGRATION_ID` and `PAYNOW_INTEGRATION_KEY`. Do **not**
   enable `tokenize=true` or recurring Express Checkout until Paynow approves the
   merchant for tokenisation. Set `PAYNOW_RESULT_URL` to
   `https://myla-construction-erp.vercel.app/api/webhooks/paynow` and a suitable
   `PAYNOW_RETURN_URL`.
5. Confirm VAT/tax treatment. Prices are exclusive; Stripe Tax remains off. Enable it
   manually only after registration advice.
6. Set `BILLING_ENABLED=true` **only after** all of the above and a fresh staging QA run.
   Keep `BILLING_QA_MODE=false` and `PAYNOW_MOCK=false` in production. A production
   switch to `BILLING_ENABLED=true` without `sk_live_...` is treated as `misconfigured`
   and fails closed; it never silently charges.
7. Redeploy the exact commit SHA via Vercel `git_source` after changing environment
   variables, then smoke-test `/api/[org]/billing`, `/api/[org]/meta`, a Stripe test
   Checkout and a Paynow test invoice.

## Local QA

```bash
# .env must contain Supabase URL/anon/service keys and BILLING_QA_SECRET
BILLING_QA_MODE=true PAYNOW_MOCK=true BILLING_ENABLED=false PORT=3001 npm run start:prod
AUDIT_BASE=http://127.0.0.1:3001 npm run audit:billing
```

QA mode is ignored on Vercel (`VERCEL=1` or a `vercel.app` app URL). The QA routes are
404 in production. The generated `/tmp/billing-qa-cleanup.sql` removes the throwaway
organisation/user; the verified production state after the latest run was `qa_orgs 0`,
`qa_users 0`, `mock_events 0`.

## Webhook/cron endpoints

| Path | Purpose |
|---|---|
| `/api/webhooks/stripe` | Signature-verified Stripe subscription lifecycle |
| `/api/webhooks/paynow` | Hash-verified Paynow status updates |
| `/api/cron/billing` | Daily reminders, renewals, grace expiry and hard lock |
| `/api/[org]/billing` | Owner/Admin state + plan/gateway/cancel/contact-sales actions |
| `/api/[org]/billing/checkout` | Start 14-day Stripe Checkout trial |
| `/api/[org]/billing/switch` | Opt into the trial-end Paynow switch |
| `/api/[org]/billing/pay` | Start a pending Paynow monthly checkout |
| `/api/[org]/billing/portal` | Stripe customer portal session |
