# MYLA subscription setup & go-live checklist — DPO Pay by Network

**Current state: SHADOW MODE.** The DPO Pay subscription system is built and verified,
but `BILLING_ENABLED=false` on Vercel production, preview and development.
`BILLING_QA_MODE=false`, `DPO_MOCK=false`, `DPO_LIVE_MODE=false` and `PAYNOW_MOCK=false`
are also off or absent. Nobody is charged, no card is collected at trial start, no
workspace is locked, and no live DPO/Paynow request is made. Post-promotion
production smoke passed **26/26** (`DPO_PRODUCTION_SMOKE.md`). See
`SUBSCRIPTION_DPO_RELEASE.md` for the release record and `PRODUCTION_DEPLOYMENT.md`
for the exact deployed commit/deployment.

## Product contract

| Tier | Price | Users | Active projects | Entitlements |
|---|---:|---:|---:|---|
| Starter | **USD 9 / organisation / month** | 5 | 10 | Essential sections, standard support |
| Pro | **USD 29 / organisation / month** | 25 | Unlimited | All 34 sections / 49 resources, tenant-branded financial PDFs, advanced RBAC/reporting, document library |
| Enterprise | **USD 99 / organisation / month** | Unlimited | Unlimited | Everything in Pro, onboarding, priority support, custom branding, contact sales |

The same three prices apply everywhere; there is no Africa/regional price book or gating.
Settlement is USD. ZWG/ZAR are **display only** through the existing FX settings. Prices
are exclusive of VAT/tax. Monthly billing only in v1.

All new organisations get a **14-day NO-CARD trial**: no payment method is collected and
no invoice is created until the trial ends. At trial end the daily sweep creates one
invoice for the next paid period and starts a **3-day read-only grace**. The customer
pays that invoice on the DPO Pay hosted page (`AllowRecurrent=1`). MYLA treats
`verifyToken` plus exact amount/currency/reference matching as the source of truth;
DPO push/redirect callbacks are doorbells only. With merchant-approved Super Wallet
tokenisation, MYLA can save a subscription token and charge later renewals through
`createToken` + `chargeTokenRecurrent`. Paynow Zimbabwe is an **optional manual
fallback** with customer-present monthly invoices; no silent autodebit is assumed.
Failed renewals are read-only for three days and then hard-locked. No data is ever
deleted. Existing organisations are grandfathered active/comped with no expiry.

## What is implemented

- Tables: `billing_subscriptions`, `billing_invoices`, `billing_webhook_events`,
  `billing_events`. Additive live migration `dpo_pay_subscriptions_v1` adds DPO/mock
  gateways, six `dpo_*` columns, an index and no-card-trial seed metadata; local file
  `supabase/migrations/20261112100000_dpo_pay_subscriptions.sql`.
- RLS: Owner/Admin read only; all writes use the service-role server client. A trigger
  seeds every new organisation as `trial_required`; all pre-existing organisations are
  `comped`.
- Enforcement: `src/middleware.ts` hard-locks org pages/APIs, leaving `/billing` and
  `/api/[org]/meta` reachable. API write guards, user/project limits and the AppShell
  banner provide defence in depth.
- Owner/Admin UI: `src/app/[org]/billing/page.tsx`, plan cards, invoice table,
  no-card trial start, Paynow fallback preference, cancellation and contact sales.
- DPO Pay: `src/lib/dpo-billing.ts` builds v6 XML for `createToken`, `verifyToken`,
  `getSubscriptionToken`, `chargeTokenRecurrent` and `deleteCard`; callback HMAC and
  push-secret checks; hosted checkout URL template; exact USD amount/reference checks;
  idempotent webhook claims; one persisted charge attempt per invoice.
- Paynow: SHA-512 hash verification, exact reference/amount checks, poll confirmation,
  idempotent webhook claims, monthly invoices and reminders. `tokenize` is never sent.
- Cron: `vercel.json` calls `/api/cron/billing` daily at 02:00 UTC with Vercel's
  `CRON_SECRET` bearer token. The sweep is idempotent: one invoice per
  `(organisation, gateway, period_start)`, one recurring charge attempt per invoice,
  and replay-safe state transitions.
- Stripe: removed from the production path. The `stripe` npm dependency is gone;
  checkout/portal/switch/webhook routes are explicit `410` stubs. Historic Stripe
  columns are retained but never written. A Zimbabwe-registered entity cannot receive
  native Stripe payouts, so Stripe is not a go-live prerequisite.
- QA: `scripts/billing-audit.mjs` uses a local DPO v6 mock and a production smoke
  script; `scripts/check-env.mjs` and `.env.example` document the DPO slots.
  `SUBSCRIPTION_QA_REPORT.md` records the local **10/10** DPO checks.

## Go-live prerequisites — NOT yet supplied

1. **Confirm the DPO merchant account and Zimbabwe payout route.** Obtain written
   confirmation of the contracting entity, supported settlement currencies (USD, and
   whether ZWG/ZAR are needed), NOSTRO/bank payout route, fees, refunds and chargebacks.
2. **Confirm VAT/tax treatment.** Prices are exclusive; no automatic tax engine is
   enabled. Decide whether MYLA, DPO or an external accountant issues tax invoices.
3. **Confirm Super Wallet / recurring tokenisation approval.** Do not set
   `DPO_RECURRING_ENABLED=true` until DPO approves the merchant for tokenised recurrent
   charges. Without it, renewals remain customer-present.
4. **Confirm the hosted payment page URL.** DPO docs currently show `payv2.php`,
   `payv3.php` and `pay.asp` in different places. Ask DPO for the exact production URL
   and set `DPO_PAYMENT_URL_TEMPLATE` accordingly.
5. **Add live DPO credentials to Vercel** (production, preview and development as
   appropriate):
   `DPO_COMPANY_TOKEN`, `DPO_SERVICE_TYPE` or `DPO_SERVICE_TYPE_NAME`,
   `DPO_API_URL`, `DPO_PAYMENT_URL_TEMPLATE`, `DPO_CALLBACK_SECRET`,
   `DPO_PUSH_SECRET`. Never paste a sandbox CompanyToken into a live slot: sandbox and
   production share one API endpoint, and the token selects the environment.
6. **Register the DPO push URL** with DPO as
   `https://myla-construction-erp.vercel.app/api/webhooks/dpo?push_secret=<DPO_PUSH_SECRET>`,
   and ensure the browser return URL can reach `/api/webhooks/dpo?source=return&...`.
   The push body is unsigned; MYLA verifies the secret and then calls `verifyToken`.
7. **Run a fresh staging QA** with real DPO sandbox credentials, a sandbox hosted
   checkout, `verifyToken`, `getSubscriptionToken`, `chargeTokenRecurrent`, a declined
   payment, a cancelled payment and a replayed push callback.
8. **Only after explicit approval**, set `DPO_LIVE_MODE=true` and `BILLING_ENABLED=true`
   together. Keep `BILLING_QA_MODE=false`, `DPO_MOCK=false` and `PAYNOW_MOCK=false` in
   production. A production switch to `BILLING_ENABLED=true` without
   `DPO_LIVE_MODE=true` and the live DPO secrets is treated as `misconfigured` and
   fails closed; it never silently charges.
9. **Redeploy the exact commit SHA** via Vercel `git_source` after any environment
   change, then run `npm run audit:dpo-prod` and a manual sandbox/test payment smoke.
10. Optional Paynow fallback: add `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`,
    `PAYNOW_RETURN_URL` and `PAYNOW_RESULT_URL`. Do **not** enable Paynow tokenisation
    or Express Checkout recurring autodebit without separate Paynow approval.

## Local QA

```bash
npm run env:check
npx tsc --noEmit
NODE_ENV=production npm run build
NODE_ENV=production BILLING_ENABLED=false BILLING_QA_MODE=true \
  DPO_MOCK=true DPO_RECURRING_ENABLED=true PAYNOW_MOCK=false \
  DPO_LIVE_MODE=false npx next start -H 0.0.0.0 -p 3001
AUDIT_BASE=http://127.0.0.1:3001 npm run audit:billing
```

The local `.env` must contain Supabase URL/anon/service keys and `BILLING_QA_SECRET`.
QA mode is ignored on Vercel (`VERCEL=1` or a `vercel.app` app URL); QA routes return
`404` in production. The generated `/tmp/billing-qa-cleanup.sql` removes the throwaway
organisation/user. After the final run, live billing tables were verified as
`qa_orgs 0`, `qa_users 0`, `mock_events 0`, `comped 2`, `subscriptions 2`,
`invoices 0`, `billing_events 0`.

## Webhook/cron endpoints

| Path | Purpose |
|---|---|
| `/api/webhooks/dpo` | GET browser return (HMAC) and POST push payment (secret); both call `verifyToken` |
| `/api/webhooks/paynow` | Hash-verified Paynow status updates and poll confirmation |
| `/api/cron/billing` | Daily reminders, first/renewal invoices, tokenised charges, grace expiry and hard lock |
| `/api/[org]/billing` | Owner/Admin state + `selectPlan`, `startTrial`, `setPaynowPreference`, `cancel`, `contactSales` |
| `/api/[org]/billing/pay` | Start DPO hosted checkout or optional Paynow invoice checkout |
| `/api/[org]/billing/checkout` | `410` — Stripe Checkout removed |
| `/api/[org]/billing/portal` | `410` — Stripe portal removed |
| `/api/[org]/billing/switch` | `410` — Stripe→Paynow switch removed |
| `/api/webhooks/stripe` | `410` — Stripe webhooks disabled |
| `/api/qa/billing/dpo` | Local QA only; `404` in production |
| `/api/qa/billing/dpo-checkout` | Local QA only; `404` in production |
