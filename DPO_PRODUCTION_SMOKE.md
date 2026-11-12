# MYLA DPO Pay production smoke
> **CURRENT BILLING V3 — HISTORICAL DOCUMENT.** This record describes an earlier
> shadow/DPO release and is superseded by `BILLING_SETUP.md`. Production now uses
> Paynow live billing, a 7-day no-card trial that starts after onboarding, USD
> 6 / 14 / 26 monthly plans, early payment during the trial, immediate prorated
> upgrades, period-end downgrades and no comped workspaces. Do not use the older
> prices, trial length, gateway switch or status described below as current
> configuration.

Deployment: `bd38a90721be86016e9c8dbf937d1b6a4fc365d6` / `dpl_GKfLfcx2C9UdXJcFvPNHwxZJiSXc` (READY/PROMOTED).

**26/26 checks passed** against `https://myla-construction-erp.vercel.app` on 2026-11-07 (Africa/Harare). No live DPO/Paynow keys, charges, locks, QA rows or environment changes were used.

| Result | Check | Detail |
|---|---|---|
| PASS | login page renders | 200 · MYLA brand |
| PASS | demo owner can sign in | kestrel-ridge · OWNER |
| PASS | bad password is rejected | 401 |
| PASS | dashboard renders | 200 |
| PASS | billing page renders | 200 |
| PASS | settings renders | 200 |
| PASS | library renders | 200 |
| PASS | reports renders | 200 |
| PASS | billing API remains in shadow mode with DPO-only config | off · comped · 9/29/99 · no card · Stripe disabled |
| PASS | meta still exposes 34 modules / 49 resources | 34 modules · 49 resources |
| PASS | overview API returns 200 | 200 |
| PASS | wallets API returns 200 | 200 |
| PASS | clients API returns 200 | 200 |
| PASS | integrity API reports a clean workspace | ok · 0 broken refs |
| PASS | billing mutations are blocked in shadow mode | 409 · no trial/charge created |
| PASS | cron endpoint rejects an unauthorised caller | 401 · CRON_SECRET enforced |
| PASS | DPO QA state route is unavailable in production | 404 |
| PASS | DPO mock checkout route is unavailable in production | 404 |
| PASS | DPO mock callback route is unavailable in production | 404 |
| PASS | QA expire route is unavailable in production | 404 |
| PASS | Stripe checkout stub returns 410 | 410 · removed |
| PASS | Stripe portal stub returns 410 | 410 · removed |
| PASS | Stripe switch stub returns 410 | 410 · removed |
| PASS | Stripe webhook stub returns 410 | 410 · removed |
| PASS | DPO push callback fails closed without billing enabled | 503 · ERROR XML · no charge |
| PASS | DPO return callback redirects safely without billing enabled | 307 · /login?dpo=error |