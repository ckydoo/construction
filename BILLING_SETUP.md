# MYLA billing — current production policy

**Status: live Paynow billing.** Paynow is the primary payment rail in Production;
its Integration ID and Key are stored only in encrypted Vercel environment
variables. `BILLING_ENABLED=true` is set for Production. DPO Pay remains
code-complete as a configured fallback and local QA rail, but no live DPO
credentials are configured. No test payment or charge was made while enabling
billing. See `PAYNOW_LIVE_SETUP.md` for the completed Paynow configuration.

## Product contract

| Tier | Price | Users | Active projects | Entitlements |
|---|---:|---:|---:|---|
| Starter | **USD 6 / organisation / month** | 5 | 10 | Essential sections, standard support |
| Pro | **USD 14 / organisation / month** | 25 | Unlimited | All modules and resources, branded financial PDFs, advanced roles/reporting, document library |
| Enterprise | **USD 26 / organisation / month** | Unlimited | Unlimited | Everything in Pro, guided onboarding, priority support, custom branding, contact sales |

One global price book applies to every organisation: **USD 6 / 14 / 26**.
Settlement is USD; ZWG/ZAR amounts are display-only through FX settings. Prices
exclude VAT/tax. Billing is monthly. The runtime price book is
`src/lib/billing-plans.ts`; `pricing_plans` keeps effective-dated versions for
platform-owner audit, and `platform/config` remains a staged, non-runtime
configuration surface.

## New-workspace lifecycle

- Onboarding starts empty: **“Try it with sample data” is off by default**.
  Explicitly opting in still seeds the demo dataset.
- Immediately after onboarding, a **7-day no-card trial** starts automatically
  and the Owner lands on **Billing**, with a clear choice to pay now or continue
  to the workspace.
- The prepay invoice for the first paid month exists during the trial. Paying it
  early does **not** shorten the full 7-day trial: the paid month begins at
  `trial_ends_at` and ends one calendar month later.
- If the trial ends unpaid, the same invoice becomes due and a **3-day read-only
  grace** begins. After that the workspace is locked, never deleted; paying an
  open invoice restores access.
- Owner/Admin can pay open invoices with Paynow, or with the configured DPO
  fallback when available. Paynow checkout is hash-verified, exact-amount
  validated and poll-confirmed. Webhook retries are idempotent.

## Plan changes

- **Upgrade:** effective immediately. During a trial, the prepay invoice is
  repriced to the new plan. During a paid period, a prorated adjustment invoice
  is created for the unused portion; the audited change remains
  `payment_pending` until that exact amount is verified paid. Entitlements and
  limits follow the new plan immediately.
- **Downgrade:** effective at the current period end. The current plan and
  access remain unchanged until then; future invoices are repriced. One pending
  change per organisation is allowed and it can be cancelled from Billing.
- Every request, effective date, proration, actor and status is recorded in
  `billing_plan_changes` and `billing_events`. Invoices are reissued rather
  than deleted when a rail or plan changes. No business data is deleted.

## Existing organisations

The v3 migration applied the new price book and 7-day policy to all existing
organisations. Previously comped demo/tester workspaces were converted to
standard `active` subscriptions at their plan's new USD price, with no trial,
no live charge and an immediately payable invoice. Existing trials were shortened
to seven days from their own start. Comped overrides were cleared.

## Controls

- Only `OWNER` and `ADMIN` may view or mutate Billing; middleware keeps
  `/billing` and `/api/[org]/meta` reachable during a hard lock.
- `billingAllowsAccess`, `billingAllowsWrite`, `entitledModules`,
  `entitledResources` and `entitledLimits` provide defence in depth for pages,
  APIs, modules, user limits and active-project limits.
- `/api/cron/billing` runs daily with a Bearer secret. It is idempotent: one
  non-cancelled invoice per accounting period, one renewal charge, scheduled
  downgrades applied once, and no duplicate early-payment activation.
- `billing_invoices` has a partial unique index on
  `(organization_id, gateway, period_start)` for non-cancelled invoices;
  cancelled invoices remain as audit history.

## Verification docs

- Current local billing QA: `SUBSCRIPTION_QA_REPORT.md`.
- Current production smoke: `DPO_PRODUCTION_SMOKE.md`.
- Paynow setup: `PAYNOW_LIVE_SETUP.md`.
- Earlier shadow/DPO release records (`SUBSCRIPTION_SHADOW_RELEASE.md`,
  `SUBSCRIPTION_DPO_RELEASE.md`, `PRODUCTION_DEPLOYMENT.md`) are historical and
  explicitly superseded by this policy.
