# Production prep — 2026-11-15

Deployed as `3316bdb` via production deployment `dpl_4fz8QNKEM5YLg2QNQgDW8YA1xiEN`
(READY/PROMOTED, aliases myla.co.zw / app.myla.co.zw). Verified live 2026-11-15.

## What shipped
- **Demo mode gate.** All demo/sample-data entry points (login one-click demo
  accounts + 616 stat, onboarding toggle, Settings → Data tools card,
  dashboard + ResourceTable empty-state buttons, landing "demo data" copy)
  render only when demo mode is on. Seed APIs refuse with 403/ignore
  `loadDemo` otherwise. `lib/demo.ts` / `db:seed` retained.
  Sources (either enables): env `NEXT_PUBLIC_DEMO_MODE=true`, or
  `platform_settings.demo_enabled` (default **false**; column added by
  migration `platform_settings_demo_enabled`).
- **Maintenance mode enforced.** `platform_settings.maintenance_mode` (existing
  column) is now live: middleware redirects org/app pages to `/maintenance`
  and answers app APIs with `503 {code:'MAINTENANCE'}`. Platform owners keep
  access; `/login`, auth flows, marketing site, `/platform` stay reachable.
  Optional env override: `MAINTENANCE_MODE=true`. Cached 15s per isolate,
  fail-open if the settings table is unreachable.
- **Platform-owner superadmin at `/platform`** (server-gated by
  `platform_admins`; 403 for anyone else). Go-live switches (maintenance,
  demo) with confirm dialogs, staged billing settings (read-only —
  `BILLING_ENABLED` env remains the billing master), administrators list, and
  recent `platform_config_audit` rows with per-key diffs. Writes go through the
  audited `/api/platform/config` route (`demo_enabled` added to
  `SETTINGS_FIELDS`); cache invalidated on write.
- **Error pages.** `not-found.tsx` (branded 404), `error.tsx` (root error with
  digest ref + Try again), `global-error.tsx` (inline-styled last resort).
  None existed before. `/maintenance` and `/api/platform/public-config`
  (booleans only) added.

## Current production state
- `billing_enabled = true` (env `BILLING_ENABLED`), `maintenance_mode = false`,
  **`demo_enabled = false`** — owner decision 2026-11-15: demo hidden in production
  (flipped same day; login/settings/onboarding/empty-states and seed APIs closed).
- To re-enable demo (e.g. for an internal demo): `/platform` → Demo mode on.
- To open a maintenance window: `/platform` → Maintenance mode on (or
  `MAINTENANCE_MODE=true` in Vercel env). App APIs → 503, pages → /maintenance.

## Notes
- Landing page (myla.co.zw) contains zero "demo" wording (uses "example data").
- `.env.example` documents `NEXT_PUBLIC_DEMO_MODE` and `MAINTENANCE_MODE`.
- Maintenance gate bypass: active `platform_admins` rows. Audit trigger records
  every change; direct SQL edits to platform_settings surface in the trail too.

## QA-fix release — 2026-11-15 (bb2bd47 → dpl_BkSoGnJRXMkDz5NsjqoBcTfWpniu)
Owner-approved production deploy of the live-QA fixes (TESTER CONSTRUCTIONS report):
- Dashboard/Reports money figures count issued invoices only (DRAFT/VOID excluded),
  matching job profitability; "Money billed" chart derives from real dated issued
  invoices over a rolling 6-month window (no fabricated fallback bars); stale
  hard-coded Nov-2026 chart base date replaced with today.
- Project Overview: billed = issued invoices; received = cleared/reconciled receipts
  (parity with profitability); cost-to-date falls back to approved budget lines, then
  posted bills + reimbursed expenses + approved timesheet labour when the manual
  project cost is unset. Financial snapshot subtitle states the basis.
- Numeric bounds enforced end-to-end: field contract gains min/max/integer; generic
  validator + generated input attributes; record invariants backstop clients/vendors/
  subcontractors (credit limit ≥ 0, payment terms ≥ 0 whole days, rating 1–5).
- Edit drawer subtitle no longer claims "changes are saved immediately"; lists no
  longer flash "No records" before first load; empty months render zero-height bars.
- Receipt allocations panel calls out unallocated receipt amounts and explains the
  allocation route (invoice allocations only; unallocated receipts never reduce
  invoice balances). QA3 records (CLI-0003, PRJ-0003, EST-0003, INV-0003) untouched.
Live-verified after deploy: myla.co.zw 200, app.myla.co.zw 307→login, login 200,
/api/platform/public-config = {demo:false, maintenance:false}; no forbidden contact
strings on landing. Note: the tester password in TEST_HERE.md no longer authenticates
against production (local smoke with it was rejected — likely rotated); report kept
limited to read-only data checks and unauthenticated probes.

## Round-2 QA-fix release — prepared 2026-11-15 (NOT deployed)
Code-complete, build-green (`next build`), awaiting owner go-ahead for deploy.
Addresses the round-2 live-QA findings (TESTER CONSTRUCTIONS, 2026-11-15):

- D01 Forecast totals: jobs with no approved budget and no cost basis are excluded
  from company forecast-final-cost/margin totals; their forecast is shown as
  unavailable (never zero-cost 100% margin). Jobs whose only cost signal is the
  awarded quote's proposed cost (or actuals alone) get a clearly-labelled
  *provisional* forecast on their row, excluded from headline company totals and
  reported separately ("Awaiting budget" card + provisional banner). Planning/bid
  jobs now appear in the profitability view with provisional forecasts (labelled),
  closing D08's silent disappearance; view scope is stated on-page and in the
  method grid. Verified against the round-2 scenario (revised 23,419 → margin
  4,359 provisional).
- D02 Timesheet approval: DRAFT can no longer jump straight to APPROVED — list
  dropdowns and the edit drawer only offer state-machine-valid targets
  (`allowedStatusOptions`); the API refuses out-of-machine targets with 400 and a
  plain message; database-trigger conflicts (P0001) now surface the trigger's real
  business text as 409 instead of a generic 500/"Something went wrong". Approval
  still goes through the `SUBMITTED` queue, so exactly one approval (and one
  derivation of labour cost) happens; retrying cannot double-post labour cost.
  Workflow QA updated (draft-skip-to-approved now asserted blocked).
- D03 Dashboard receivables: the only remaining all-record invoice sums were
  audited — `overview` route already counts issued invoices only (bb2bd47); the
  round-2 "345 / ~34.8k" is consistent with the tester reading pre-deploy data
  (timing vs bb2bd47 unconfirmed). Code now double-safe; confirm against
  production after the next deploy with a hard refresh.
- D04 Allocation/reversal: receipt allocation and receipt creation fail fast with
  specific reasons (client mismatch, currency mismatch, draft/void/settled
  invoice, outstanding-balance exceeded, receipt total exceeded, reversed receipt);
  invoice pickers (record-and-allocate form + allocate controls) list only issued,
  outstanding, same-client, same-currency invoices; rejection reasons are shown
  inline on the receipt panel (not only in a toast); reversed receipts no longer
  appear to hold available credit (banner + zero unallocated + allocations marked
  Reversed) and cannot be allocated; payment (receipt) status transitions now go
  through dedicated actions (REVERSED blocked manually; RECONCILED only from
  CLEARED).
- D05 Receipt detail: reversed receipts state the historical amount explicitly and
  present zero available credit. (Fixed with D04.)
- D06 Journal honesty: journals are draft-only end-to-end — description, reports
  tile and module copy state posting/period control are not supported; POSTED
  blocked (already) and manual REVERSED now blocked; legacy POSTED/REVERSED
  journals may only move back to DRAFT; a legacy incomplete POSTED journal needs a
  data decision (production review) — no posting has been enabled.
- D07 Units of measure: BOQ/quote lines carry a separate unit (m³/t/bags/hour/sum
  …) through quote templates → quote builder → estimate/contract/tender lines →
  variation → valuation → invoice → preview/print → CSV item export. The shared
  columns now show UoM next to Qty; the mislabelled "Unit" (rate) column in the
  record detail now reads "Rate"; built-in quote templates are unit-tagged.
- Not code: D-series items blocked on owner/business actions (excluded modules —
  purchasing, stock, plant, diaries, safety, payroll, payment certificates/
  retention; multi-role/tenant release tests) remain open.
User-copy QA: 3/6 checks pass; the three failures (settings-page copy token,
accept-invite/login screen copy scan, deployed-copy probe requiring tester
credentials) are pre-existing on the previous commit and unrelated to this round.
NEXT: owner go-ahead to deploy; confirm D02/D03/D05 fixes re-tested on
app.myla.co.zw; tester credentials in TEST_HERE.md need rotating/confirming.

## Round-3 QA-fix release — prepared 2026-11-15 (NOT deployed)
Code-complete, build-green, awaiting owner go-ahead. Addresses R6-01/02/03 and the
message wording note from the 15 Nov 2026 task/document/close-out QA report:

- R6-01 Task chronology & duration (create/edit/inline list/import/retry all
  enforce server-side): planned finish cannot precede planned start; actual
  finish cannot precede actual start; pairs may be partial; when both planned
  dates are set, duration MUST equal the inclusive calendar days (auto-derived on
  the form, explicit contradictions rejected with a clear message — never silently
  overwritten); when dates are not set, duration must be a whole number of days
  ≥ 1 (was: negative durations accepted). Reasonable UX: the task drawer derives
  duration live from the two date fields.
- R6-02 Completion lifecycle: marking a task COMPLETE now sets progress to 100%
  and captures actual finish (today when missing) — everywhere (list dropdown,
  edit drawer, CSV import, retries). IN_PROGRESS stamps actual start when missing.
  Progress remains an independent physical measure for everything else; a 100%
  figure does NOT auto-complete a task (sign-off stays a deliberate action).
  A dedicated inspection quality workflow still does not exist — the generic task
  COMPLETE is consistent, not a certification.
- R6-03 Project close-out review: projects can no longer move ACTIVE/ON_HOLD/
  etc. → CLOSED from any raw status picker (blocked in PATCH with 409; picker and
  form no longer offer CLOSED). Instead, project detail header now has
  "Close project…" which opens a reviewed close-out drawer: server recomputes —
  unfinished tasks, progress < 100%, variations awaiting decision, unissued draft
  invoices, issued invoices with outstanding balances (count + total, per-currency
  aware), open punch items, open RFIs, outstanding client-wallet funding — then
  requires a closure type (Successful completion / Cancellation / Administrative),
  a note when the job is below 100% or non-completion, and an explicit
  acknowledgement when anything is outstanding. The decision, acknowledgement,
  reason and actor are written to the audit trail; a closure banner shows on the
  project header (who when why). Reopening remains possible from the register.
  Closing does NOT send email and does NOT settle money. Delivery of "successful
  completion" at <100% is an acknowledged override, recorded as such.
- Message wording: the manual invoice PAID/PARTIALLY_PAID guard now reads
  'Use “Record and allocate receipt” on this invoice to settle it…', pointing to
  the supported workflow instead of implying reconciliation is broken.
Verification: next build green; lifecycle helpers unit-checked against the exact
round-3 scenario (backwards dates + negative duration rejected; consistent row
passes; COMPLETE ⇒ 100% + actualFinish; IN_PROGRESS ⇒ actualStart; zero duration
rejected). NOT YET re-tested on production (deploy needs owner go-ahead; TS-0003-
class re-verification owed). The blocked release gates (multi-role/multi-tenant,
purchasing & retention modules, backup restore, weak network, phone/tablet) remain
unaddressed by this work.

## Round-3 QA-fix release — deployed 2026-11-16 (cba1470 → dpl_8qWxMyqH7Ds3Y7Ydg5RJiH1J93ec)
Owner-approved production deploy of the R6 QA fixes. Build READY and PROMOTED;
aliases myla.co.zw and app.myla.co.zw live.
Live-verified after deploy: myla.co.zw → 200; app.myla.co.zw/login → 200;
/api/platform/public-config = {demo:false, maintenance:false}; new close-out route
returns 401 for unauthenticated calls (route present, guarded, not 404/5xx);
landing shows only +263716826666 (×4) and codzlabzim53@gmail.com (×6); no
support@myla.co.zw / developer strings. No schema changes, so nothing ran on
production data; no records created or modified by the deploy or the checks.
RETEST OWED (round-3 report): TSK-0003-class impossible-date/negative-duration
rejection; COMPLETE ⇒ progress 100% + actual finish; projects no longer move to
CLOSED via the register (use Close project… on the job overview; review of
unresolved items, closure type, note, audit); invoice PAID attempt message now
points to "Record and allocate receipt". Tester credentials in TEST_HERE.md still
return 401 — supply fresh ones or accept read-only verification. Blocked gates
remain open (multi-role/tenant, purchasing/stock/plant/payroll/safety/retention,
backup restore, weak network, phone/tablet).

## First-job experience release — deployed 2026-11-17 (11058d0 → dpl_2KJssfSAtMTRrPCCAmpHMzqg3DrP)

Vercel production deploy of main @ `11058d0`, target production, build ~79s (timeToReady 79338ms).
Aliases assigned: myla.co.zw, app.myla.co.zw (+ *.vercel.app). Production now runs `11058d0`.

### Shipped
- New MICRO workspaces (minimal onboarding) start with exactly the job-to-cash loop (9 sections: dashboard, company, clients, quotes, jobs, contracts, invoices/payments, documents, reports). Type-defining modules still unlock. Settings reconfigure keeps essentials — existing workspaces are never auto-hidden.
- Dashboard "Your first job" checklist: client → quote → job → invoice → record payment. Progress derived live from workspace records; dismissible; shows completion state.
- Settings → Sections: new "Small builder" pack trims modules AND record lists (drops journals/accounts/AP bills); Essentials and Enable-included packs unchanged; nothing deleted.
- Marketing + Billing copy: "From USD 6 — built for the way you build"; honest Starter positioning (start with the job-to-cash loop, add sections any time); 7-day guided first job.

### Live verification (2026-11-17, unauthenticated — no records created or modified)
- myla.co.zw/ → 200; app.myla.co.zw/login → 200
- /api/platform/public-config → {"demo":false,"maintenance":false}
- closeout probe unauthenticated → 401
- Landing: new copy present ("From USD 6", "one-person builder and the small crew", "7-day guided first job", "Start with just the job-to-cash loop"); stale strings absent (support@myla.co.zw, Harare, "A plan for the way you build"); contacts unchanged (+263716826666 ×4, codzlabzim53@gmail.com ×6)

### Not done / owed
- Authenticated end-to-end pass of the new micro-onboarding → first-job checklist (needs fresh tester credentials — TEST_HERE.md creds still return 401 — or owner).
- Design-partner pilots (2–3 real small ZW builders) recommended before broad "for everyone" positioning.
- Still open gates: multi-role/multi-tenant isolation proof, backup-restore proof, round-3 R6 re-test (needs fresh tester credentials or owner hands).

## Release-hygiene re-verification — 2026-11-17 (deployed)

Owner-approved production deploy of `4b7669c` ("R6 UX completion…") as deployment
`dpl_R7ZxQiHxzDrgK5BZArpDJcPywzo3` (READY, aliases myla.co.zw + app.myla.co.zw).
App code is unchanged since `11058d0` except the R6 workflow guards + create-201
fix now living directly in `validateWorkflowTransition` (PATCH-level duplicate removed):

- raw PATCH project → CLOSED now returns 409 with close-out guidance; invoice → PAID/PARTIALLY_PAID returns 400 with "Record and allocate receipt" guidance (both enforced server-side on every path).
- Authenticated first-job QA suite re-run against prod (`scripts/first-job-qa.mjs`, service-role magic-link sessions): **22/22 checks pass** — MICRO onboarding = exactly 9 sections, client → quote → job → invoice → receipt → task loop, 201 creates, date/duration 400s, COMPLETE ⇒ progress 100% + actualEnd, close-without-ack ⇒ 422, acknowledged close ⇒ 200, both R6 guard regressions green. QA artifacts cleaned up (orgs/users removed; verified zero residue).
- Multi-role / multi-tenant isolation proof (`scripts/isolation-qa.ts`): **30/30 checks pass** against production — org B is refused on all 49 catalogued resources (list/detail/create), on 18 special routes, overview is not polluted by org A data, and intra-A role enforcement holds (VIEWER read-only; ACCOUNTANT cannot administer roles/settings; OWNER unaffected). QA orgs marked + comped for the test, then orgs (and their seeded billing rows) deleted; verified zero residue.
- Note: isolation gate 2 treats method-405 as blocked for routes without GET handlers (`/settings`, `/receipts`).

## Backup — logical export created 2026-11-17 (NOT a restore drill)

`scripts/export-logical-backup.mjs` wrote a full logical snapshot of all **42 public tables (10,280 rows, 7.7 MB)** to `backups/logical-2026-11-17T10-16-39-248Z/` (git-ignored). `scripts/verify-logical-backup.mjs` re-hashes and re-parses every file against its manifest — **VERIFY OK**; per-table counts match a direct production count. Auth schema (password hashes) and Storage bucket objects are **not** covered (owner scope: public schema only); Supabase daily backup/PITR covers those if enabled — owner to confirm in dashboard. No restore drill has been executed (owner chose logical-only; no scratch project, no DDL on prod). `scripts/restore-logical-backup.mjs` is a guarded, UNTESTED loader prepared for that drill; see `BACKUP_RESTORE.md` for status and the full runbook. Treat backups as UNPROVEN until the drill runs.

Remaining gates before broad "for everyone" positioning: backup-restore drill execution, design-partner pilot validation, landing-copy owner review. R6 re-test is DONE (22/22). Isolation gate is DONE (30/30).
