# Phase 3 — Three-way procure-to-pay match

**Delivery: local, read-first MVP. Committed locally only; not pushed or deployed.** Phase 1 (`329c923…`) and Phase 2 (`698de4c…`) also remain local and undeployed. `origin/main` is still `ffc9d6c58df5c5c5ee67584d56cab57c781ace63`; live Vercel production is still `dpl_3L7xwyxXk7iL2LL9xMTHVJRxwxZ6`. No Vercel call, push, environment change or migration was made.

## What was added

A read-only cockpit that compares the three documents that already exist in the ERP:

**purchase order ↔ goods receipt / delivery note ↔ supplier bill**

It answers the accounts clerk's question — *what can be paid, what must be held, and which documents are not linked?* — without introducing a new table, a new record type or a business-data write.

### Derivation (`src/lib/three-way-match.ts`)

Pure helpers and types, including `THREE_WAY_RESOURCE_IDS`, `THREE_WAY_TOLERANCE_PCT = 2`, `MatchStatus`, `MatchGroup`, `OrphanDoc`, `ThreeWaySummary`, `ThreeWayResponse` and `buildThreeWayMatch(input)`.

The derivation:

- groups goods receipts and supplier bills by `purchaseOrderId`;
- excludes cancelled purchase orders and void supplier bills;
- detects duplicate supplier invoice numbers (per supplier, falling back to the linked PO supplier) and missing invoice numbers;
- parses `Qty <number>` from free-text order/delivery item summaries where present, and flags missing line quantities instead of silently accepting them;
- converts order and bill money into the **workspace base currency** using the manual Settings FX rates (`toBase`/`hasRate`), and flags missing rates;
- computes order value, billed amount, paid amount, outstanding amount, price variance, variance %, 2% tolerance, quantity variance and match stage 1 / 2 / 3;
- classifies each order as **Matched** (green), **Review** (amber), **Blocked** (red) or **Awaiting documents** (slate), with a plain-language recommendation;
- lists **orphan** supplier bills and delivery notes that have no readable purchase order link.

Blocking exceptions: duplicate supplier invoice number, billed before goods receipt, unapproved purchase order billed, delivery dispute recorded, overpaid supplier bill, missing manual FX rate. Review exceptions include price variance over 2%, quantity variance, missing line quantities, invoice-number gaps, bill currency differing from the PO, draft/partial/overdue bill and delivery states. Missing receipt or bill documents are treated as awaiting, not as a payment approval.

### Read-only API (`GET /api/[org]/three-way-match`)

Guards: `apiAuth`, `billingGuard`, `guardModule('procurement')`, `guardModule('finance')`, `readGuard('purchaseOrders')`, `readGuard('apBills')`, `buildScope`, `visibleResources`, `rowsForScoped`. Response header `Cache-Control: no-store`. There is no POST/PATCH/DELETE handler and no `insertRecord`/`updateRecord`/`deleteRecord`/`logActivity` call.

### Page (`/[org]/three-way-match`)

- layout gate: `requirePageModule(org, { moduleId:'procurement', resourceId:'purchaseOrders', also:{ moduleId:'finance', resourceId:'apBills' } })`;
- `src/lib/page-modules.ts` gained the optional `also` second module/resource check;
- 8 summary cards, payment holds/reviews, unlinked documents, searchable/sortable order table, status tabs and a plain-language method panel;
- test IDs: `three-way-page`, `three-way-summary`, `three-way-exceptions`, `three-way-orphans`, `three-way-row`, `three-way-method-toggle`, `three-way-method`, `nav-three-way-match`, `dashboard-three-way-match`;
- workspace base currency only. Personal display currency does **not** convert this cockpit; Reports, PDFs, CSV exports, saved records and workspace base remain unchanged.

### Wiring

- `src/components/AppShell.tsx`: “Three-way match” nav item under Materials & suppliers; hidden unless both `procurement` and `finance` modules are enabled (`alsoModule`).
- `src/lib/module-visibility.ts`: `SPECIAL_ROUTE_MODULES['three-way-match'] = 'procurement'`, direct-route regex and `hrefVisible` require both `purchaseOrders` and `apBills` to be fully enabled.
- `src/app/[org]/dashboard/page.tsx`: read-only CTA with blocked/review/matched/orphan counts.
- `src/app/[org]/documentation/page.tsx`: Materials & suppliers module map, procurement and finance special links, home-screen item 10.
- `package.json`: `audit:three-way-match`.

## Explicitly out of scope

No approval/payment state change, no configurable tolerance or approval chain, no structured line-level item table, no new resource type, no migration, no change to saved records/reports/PDF/CSV/workspace base, no push and no Vercel deployment. Configurable tolerance/chains remain deferred.

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | `0` |
| Clean `NODE_ENV=production npm run build` | `0`; `/[org]/three-way-match` `5.51 kB` / `152 kB`, `/api/[org]/three-way-match` `268 B` / `103 kB` |
| `scripts/three-way-match-defs-qa.ts` | `9 PASS / 0 FAIL` |
| `scripts/three-way-match-qa.mjs` (API + browser) | `5 PASS / 0 FAIL` |
| Three-way match live payload | `14` orders, `0` orphan bills, `0` orphan deliveries, `8` blocked, `6` review, `0` awaiting; every stage/status/quantity/money field reconciled |
| Browser cockpit | 8 cards, order table, exceptions, orphans, method, blocked filter, search, sort, dashboard CTA, `0` mutating requests, `0` console errors |
| `audit:topbar` | `30 PASS / 0 FAIL` |
| `audit:profitability` | `6 PASS / 0 FAIL` static + `5 PASS / 0 FAIL` e2e |
| `audit:workflow` | `29 PASS / 0 FAIL` static + `13 PASS / 0 FAIL` e2e |
| `audit:convert` | `16 PASS / 0 FAIL` |
| `git diff --check` | `0` |

QA scripts created temporary records for the workflow/convert regressions. Cleanup through the Supabase connector removed `12` QA records, `33` QA audit rows and `2` QA notifications, and restored all `49` number sequences. Final live state: `620` active records, `0` QA records / `0` QA audits / `0` QA notifications; sequence examples `clients:170`, `documents:70`, `estimates:71`, `leaveRequests:37`, `timesheets:82`, `purchaseOrders:66`, `goodsReceipts:51`, `apBills:48`. Phase 3 code itself performs no business-data writes; connector writes were limited to QA cleanup.

Final workspace checks: `port3000=0`, `/home/user/qa-*.png=0`, all QA servers stopped.

## Release notes

- `PHASE3_THREE_WAY_MATCH_RELEASE.md` (this file)
- QA logs: `/tmp/three-way-match-defs-qa.log`, `/tmp/three-way-match-tsc.log`, `/tmp/three-way-match-build.log`, `/tmp/three-way-match-qa.log`, `/tmp/three-way-match-qa-report.txt`, `/tmp/three-way-match-topbar-regression.log`, `/tmp/three-way-match-profitability-regression.log`, `/tmp/three-way-match-workflow-regression.log`, `/tmp/three-way-match-convert-regression.log`.
