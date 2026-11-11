# Phase 2 — Job profitability cockpit

Built after the user chose **Start Phase 2**. This is a local implementation on top of the undeployed Phase 1 commit. **Nothing was pushed to GitHub and no Vercel production deployment was made.**

## What changed

- **`/profitability`** — a read-only cockpit showing which jobs are making money, which are drifting, and what is still to be billed or collected.
  - Workspace summary: jobs in view, revised contract, approved budget, committed, actual cost, forecast final cost, billed, certified, cash received, current margin and forecast margin.
  - Per-job table: original and revised contract, approved/pending variations, budget, actual cost, cost to complete, forecast final cost, cost variance, billed, received, cash gap, forecast margin, margin %, progress and billing position.
  - Commercial exceptions: forecast loss, cost overrun, thin margin, under/overbilling, cash gap, pending variations, missing budget and missing FX rate.
  - Forecast-margin bars, cost-category doughnut, filters (all / active / needs attention / completed), search and sorting.
  - “How these figures are worked out” panel with plain-language definitions.
- **Dashboard** — forecast-margin card with at-risk/watch counts and a direct link to the cockpit.
- **Sidebar / page gate / documentation** — Job profitability sits under Reports & extras, is hidden when Reports or Jobs are disabled, and is documented in the module directory and home-screen guide.
- **`/api/[org]/profitability`** — derives all figures from 13 existing registers, respects auth, billing, module visibility, RBAC and portal row scope, returns `Cache-Control: no-store`, and never writes a record.

## Calculation rules

- **Revised contract** = original contract + approved variations; pending variations are shown separately, not counted as revenue.
- **Budget** = project budget, or approved budget lines (`originalBudget + approvedVariations`).
- **Actual cost** = project cost to date; falling back to approved budget lines, then posted supplier bills, approved expenses and approved/posted time sheets.
- **Forecast final cost** = actual cost + forecast-to-complete from budget lines, or remaining budget when no forecast is entered.
- **Forecast margin** = revised contract − forecast final cost.
- **Billing position** = billed − earned value (`revised contract × progress`).
- **Cash gap** = billed − received, using invoice paid amounts or cleared receipt records.
- All money is converted to the **workspace base currency** with the manual Settings → Currencies rates. Missing rates are surfaced instead of silently converted. Personal display currency, reports, PDFs, CSV exports and saved records are unchanged.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| Clean production build | EXIT 0; `/profitability` and `/api/[org]/profitability` compiled |
| `audit:profitability` — pure definitions | **6 PASS / 0 FAIL** |
| `audit:profitability` — API + browser | **5 PASS / 0 FAIL** |
| `audit:topbar` regression | **30 PASS / 0 FAIL** |
| `audit:workflow` regression | **29+13 PASS / 0 FAIL** |

The profitability QA verified anonymous `401`, a reconciled no-store payload, four live jobs, six cost categories, plain-language fields on every row, eight summary cards, the job table, exceptions, method panel, dashboard CTA, zero personal-currency conversions, zero mutating browser requests and zero console errors. The workflow regression covered the Phase 1 Action Inbox again after the dashboard/nav changes.

## Live-data hygiene

The profitability QA created no records. The workflow regression created three throwaway records; all were soft-deleted, then hard-deleted with their audits and notifications. Final read-only Supabase check: `0` QA records, `0` QA audits, `0` QA notifications, `620` active Kestrel records, sequences `timesheets:82`, `leaveRequests:37`, `estimates:71`, `documents:70`, `clients:170`. No env, billing, workspace-setting or business-data changes remain.

## Git / delivery

- Phase 1 local commit remains `329c923a97007d4aa9508a7c57003c8351c4c8d5`.
- Phase 2 is the latest local `main` commit, “Add job profitability cockpit” (`git rev-parse HEAD`).
- `origin/main` remains `ffc9d6c58df5c5c5ee67584d56cab57c781ace63`.
- Clean worktree, `git diff --check` clean, no QA server and no `/home/user/qa-*.png` files.

## Next decision

Push and/or deploy were deliberately left undone. The remaining roadmap priorities are Phase 3 (three-way procure-to-pay match), Phase 4 (mobile/offline field capture), then Phase 5 (portal/e-signature and integrations).
