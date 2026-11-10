# MYLA subscriptions — DPO Pay by Network shadow release

**Date:** 2026-11-07 (Africa/Harare) · **Mode:** `BILLING_ENABLED=false` in production ·
**Gateway:** DPO Pay by Network primary, Paynow Zimbabwe optional manual fallback ·
**Trial:** 14 days, no card required

> **Deployment record:** pending explicit-SHA Vercel deployment. This file is updated
> with the exact commit, deployment ID and post-promotion smoke results after the
> production deploy. See `PRODUCTION_DEPLOYMENT.md` for the live alias.

## Why this release exists

The earlier Stripe + Paynow shadow release assumed a card-required Stripe Checkout
trial. The user confirmed that Stripe cannot pay out a Zimbabwe-registered entity,
chose **DPO Pay tokenisation** as the direction, and chose a **14-day no-card trial**.
Stripe is therefore removed from the production path. It is not a go-live
prerequisite, the `stripe` npm package is uninstalled, and old Stripe checkout,
portal, switch and webhook routes are explicit `410` stubs. Historic Stripe columns
remain in the database but are never written.

## Decisions implemented

- **One global price book:** USD **9 / 29 / 99** per organisation per month for
  Starter / Pro / Enterprise. No regional price book, no Africa gating.
- **14-day no-card trial:** `trial_required` → Owner/Admin selects a plan →
  `startTrial` → `trialing` for 14 days. No card, no invoice, no charge.
- **DPO first payment:** at trial end one invoice is created and the workspace enters
  a 3-day read-only grace. The customer pays on DPO's hosted page with
  `AllowRecurrent=1`. MYLA never sees card data.
- **Verified fulfilment:** DPO push/redirect callbacks are doorbells. `verifyToken`
  plus exact `CompanyRef`, `TransactionAmount=plan price` and
  `TransactionCurrency=USD` is authoritative. Only result `000` marks an invoice paid.
- **Tokenised renewals:** after the first verified payment, `getSubscriptionToken`
  can save a Super Wallet subscription/customer token. Later renewals use
  `createToken` + `chargeTokenRecurrent` when `DPO_RECURRING_ENABLED=true` and the
  merchant has tokenisation approval. One persisted charge attempt per invoice;
  transient/pending states poll `verifyToken` instead of charging again.
- **Paynow fallback:** optional, customer-present, hash-verified monthly invoices.
  No Paynow tokenisation or silent autodebit is assumed.
- **3-day grace then hard lock:** unpaid invoices become read-only for three days,
  then lock org pages/APIs. Billing and meta remain reachable; no data is deleted.
- **Owner/Admin-only Billing:** UI, API and RLS reads are restricted to Owner/Admin.
- **Grandfathering:** all organisations existing before the migration are `comped`,
  active and without expiry. Two were recorded.
- **Money:** USD settlement, ZWG/ZAR display only through existing FX settings,
  prices exclusive of VAT/tax, no automatic tax engine.
- **Shadow mode:** `BILLING_ENABLED=false`, `BILLING_QA_MODE=false`, `DPO_MOCK=false`,
  `DPO_LIVE_MODE=false`, `PAYNOW_MOCK=false` in production. No live DPO/Paynow keys,
  charges, locks or Vercel environment changes were added in this phase.

## Scope delivered

- Additive live Supabase migration `dpo_pay_subscriptions_v1` and local file
  `supabase/migrations/20261112100000_dpo_pay_subscriptions.sql`: `dpo`/`mock`
  gateway/provider constraints, six `dpo_*` columns, index, no-card-trial seed
  metadata.
- New `src/lib/dpo-billing.ts`: v6 XML builders, hosted checkout, callback HMAC,
  push-secret validation, `verifyToken`, Super Wallet token lookup, recurring charge,
  card revocation and a zero-network local QA mock.
- New `src/lib/billing-lifecycle.ts`: no-card trial, one-invoice-per-period creation,
  paid/failed/cancel/token-clear transitions.
- Rewritten `src/lib/billing.ts`, `billing-api.ts`, `billing-cron.ts`,
  `paynow-billing.ts`, `billing-qa.ts`, `src/middleware.ts`, Billing UI and billing
  routes.
- New `/api/webhooks/dpo`, `/api/qa/billing/dpo`, `/api/qa/billing/dpo-checkout` and
  a trial/period/grace `expire` QA helper.
- Updated `.env.example`, `scripts/check-env.mjs`, `package.json` (Stripe dependency
  removed), `scripts/billing-audit.mjs`, `scripts/dpo-production-smoke.mjs`,
  `BILLING_SETUP.md`, `ENV_KEYS.md`, `PRODUCTION_DEPLOYMENT.md`,
  `SUBSCRIPTION_QA_REPORT.md`, and a superseded banner on the historical
  `SUBSCRIPTION_SHADOW_RELEASE.md`.
- Daily Vercel Cron `/api/cron/billing` at 02:00 UTC with `CRON_SECRET`.

## Safety against double billing

One invoice per `(organisation, gateway, period_start)`; idempotent webhook event
claims; paid-invoice overlap alerts; one persisted `chargeAttempts` entry per
recurring invoice; `verifyToken` before any paid state; no automatic refund attempt.
`DPO_LIVE_MODE=true` is an explicit gate because DPO sandbox and production share
`https://secure.3gdirectpay.com/API/v6/`. A `BILLING_ENABLED=true` switch without
that gate and all live secrets yields `misconfigured`, never a silent charge.

## Verification

- `npm run env:check`: clean, **Live billing disabled (shadow mode)**, DPO/Paynow
  integration slots recognised, no secret values printed.
- `npx tsc --noEmit`: clean. `NODE_ENV=production npm run build`: clean.
- `npm run audit:billing`: **10/10** local DPO checks passed against a production
  build on `http://127.0.0.1:3001` (`SUBSCRIPTION_QA_REPORT.md`). Coverage:
  registration/onboarding, `trial_required` hard lock, 9/29/99 plans and no-card
  trial, Pro write access, one USD 29.00 first invoice plus grace, DPO mock hosted
  payment/tokenisation, idempotent cron and one tokenised renewal charge, replay
  safety, grace expiry hard lock with data preserved.
- Live Supabase migration verified: `dpo_columns=6`; subscription gateway check
  includes `dpo`/`mock`; invoice and webhook provider checks include `dpo`/`mock`.
- QA cleanup verified after the final run: `qa_orgs 0`, `qa_users 0`,
  `mock_events 0`, `billing_events 0`, `comped 2`, `subscriptions 2`, `invoices 0`.
- Vercel environment verified before deploy: `BILLING_ENABLED=false`,
  `BILLING_QA_MODE=false`, `PAYNOW_MOCK=false`, encrypted `CRON_SECRET` present, no
  `DPO_*` variables. No Vercel env vars were created or changed for this release.
- Production smoke: **pending deployment**; will be recorded here and in
  `DPO_PRODUCTION_SMOKE.md` after the explicit-SHA deploy.

## Not done / outstanding

- Live DPO `CompanyToken`, `ServiceType`/`ServiceTypeName`, callback/push secrets,
  hosted page URL and push URL registration.
- Written DPO confirmation of Zimbabwe merchant onboarding, payout/NOSTRO route,
  supported settlement currencies, fees and refund/chargeback handling.
- DPO Super Wallet / tokenisation approval before `DPO_RECURRING_ENABLED=true`.
- VAT/tax registration decision and legal-entity confirmation.
- Fresh staging QA with real DPO sandbox credentials and a manual test payment.
- Explicit user approval, then `DPO_LIVE_MODE=true` and `BILLING_ENABLED=true`.
- Known cosmetic `PROJECT -` in tenant-branded PDFs from a prior release remains.
- The historical Stripe/Paynow card-required trial release is superseded; see
  `SUBSCRIPTION_SHADOW_RELEASE.md` only for history, not go-live steps.

## Official DPO references used

- `https://docs.dpopay.com/dpo-pay-by-network/reference/quick-start-guide.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/create-token.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/verify-token-response-codes.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/transaction-status-lookup.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/recurring-payments-tokenisation-guide.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/super-wallet-get-subscription-token.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/super-wallet-charge-token-recurrent.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/super-wallet-delete-card.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/pushpayments.md`
- `https://docs.dpopay.com/dpo-pay-by-network/reference/sandbox-test-credentials.md`
