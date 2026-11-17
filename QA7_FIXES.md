# QA7 fix batch — implementation notes (2026-11-17)

Source: fresh-account QA report (TESTEDW / Owner + MD view, 17 Nov 2026).
Order: R7-01 → R7-02 → R7-03 → R7-04 → R7-05 (R7-06 confirmed separately).
Status of this batch: **built and verified locally; not deployed; commit pushed
to origin/main by owner request; deployment still requires owner sign-off.**

## R7-01 (High) — Receipts allocated via invoices vanished from job cash
- New `src/lib/receipt-attribution.ts`: attributes each cleared/reconciled
  RECEIPT to a project first by its explicit `projectId` pin, otherwise through
  every non-reversed allocation line (`receipt_allocation_lines` joined to
  non-reversed `receipt_allocation_batches`) to the invoice's project. Money
  allocated to an invoice is counted exactly once; money pinned to no job and
  no allocated invoice is reported separately as unallocated customer credit
  (never added to a job). Reversed batches are ignored automatically; allocation
  amount is per invoice, not per batch.
- Both affected surfaces now use it:
  - `/api/[org]/profitability`: cleared receipts → attributed payments flow into
    `computeJobProfitability`; unallocated credit surfaced on the summary
    (`summary.unallocatedCredit`, shown on the Cash received card).
  - `/api/[org]/projects/[id]` (job 360): same attribution; `received` now uses
    allocation-derived rows. Other surfaces unchanged.
- Double counting: invoice-linked allocations settle invoice balances
  (`amountPaid`); the received figure is receipt-side and uniqueness is by
  allocation line → project, one time each.
- Verified read-only against the live production database for the QA7 fixture:
  invoice INV-0001 (`190fccaa…`, project `f4b5c11e…` = PRJ-0001) has exactly two
  non-reversed lines — 2,000.00 (PYM-0001) + 2,830.00 (PYM-0002) = 4,830.00, and
  both receipts have `project_id` NULL. Post-fix, job cash = **4,830 received,
  0 outstanding**, net billed 4,200, VAT 630, net current margin 3,720
  (computeJobProfitability run locally with the fixture values).
- Reversal consistency: reversing a batch removes its lines' contribution and
  reverts invoice `amountPaid` in the same transaction; both cash and
  outstanding update without extra code.

## R7-02 (High) — Quotation UoM (m³, hour) lost on save
- Root cause: `toRecordPayload()` re-mapped lines and omitted `unit` (all other
  links — editor state, `normaliseLine(s)`, field validation, CSV export,
  Quote Studio lines, previews, readback (`quoteDraftFromRow`) — already keep
  `unit`).
- Fix: `unit` carried through `toRecordPayload` (20-char cap, `null` when empty).
- Quote Studio/PDF output now shows the unit in the items table (UoM column).
  Downstream conversions were checked — `pricedLines()` already propagates unit.

## R7-03 (High) — Margin mixed VAT-inclusive billing with net costs
Owner approved (2026-11-17): **net billed for margin & work-progress, gross for
cash/receivables, VAT shown separately.**
- `computeJobProfitability`: net/gross split derived per invoice
  (`amount` → net; fallback `total − vatAmount`). New job fields: `billedNet`,
  `vatBilled`. New summary fields: `billedNet`, `vatBilled` (and
  `unallocatedCredit`).
- Changed: `currentMargin = billedNet − actualCost`; `billingVariance =
  billedNet − earnedValue`. Unchanged: `cashGap` and receivables stay on gross.
- UI labels updated to say so (Billed card: net · VAT · certified sub; Current
  margin: "Net billed less actual cost"; table hover shows net/VAT;
  "How these figures are worked out" gains the split definition and the new
  unallocated-credit definition). Project 360 snapshot gains "Net billed
  (excl. VAT)". This is a definition change, not a statutory claim — VAT shown
  is the user-entered 15%.
- QA7 expected numbers now reconcile: net billed 4,200 / VAT 630 / gross 4,830 /
  net margin 3,720.

## R7-04 (Med) — Invoice conversion dead-end (Receipt: "Not yet")
- RecordDetail already had a "Record and allocate receipt" button (prefilled
  invoice/client/remaining incl. outstanding). The dead-end was the Convert
  drawer: the invoice-to-receipt conversion is intentionally hidden (not atomic)
  and the chain strip showed an unexplained "Not yet" with nothing to press.
- Fix:
  - Convert drawer now shows a "Record the money" section for arInvoices with
    direct "Record receipt" action (closes the convert drawer, opens the
    prefilled record-and-allocate drawer). From contexts without the receipt
    handler it links to the invoice drawer instead.
  - The chain strip now treats an invoice with ≥1 non-reversed allocation as
    having its Receipt stage complete (receipt shown via the allocation, not via
    a conversion that does not exist). Allocation mapping is read-only.
  - `RecordDetail` passes `onRecordReceipt` to ConvertFlow.
- PAID is never set by hand (server invariant message now also surfaces client-side).

## R7-05 (Low/Med) — Invalid task optimistically toasted "Something went wrong"
- `RecordForm` now runs the same `recordInvariantErrors` used by the server
  before submit is accepted — an invalid task (finish < start, duration
  mismatch, invalid category) is never inserted, and the error appears under the
  field (e.g. "Planned finish cannot be before planned start.").
- `ResourceTable` create-error toast now joins field-specific `details` (same as
  update path) instead of only `userMessage`, so a server rejection still shows
  the actual reason; generic copy only as fallback.

## R7-06 (Med) — Dashboard "0 being quoted / 12,000 quotes in hand" after award
Owner decision (2026-11-17): **show both, labelled.**
- Overview API: `estimates` + `bids` (when visible) now loaded; new KPI fields
  `openQuotesValue` (DRAFT/INTERNAL_REVIEW/SUBMITTED estimates) and
  `awardedQuotesValue` (AWARDED estimates + AWARDED bids).
- Dashboard: "Jobs running" sub now "N in bid/planning stage" (was "being
  quoted"). "Value of jobs" sub now "X awarded · Y open pipeline" where Y =
  open leads + open quotes. No behaviour removed — the open enquiry (12,000) is
  still visible, now labelled open pipeline; the awarded quote (8,400) shows as
  awarded.

## Performance pass — dashboard aggregation (not a spec change)
- `overview` GET now has a 30-second in-memory cache, keyed by a SHA-256 of
  workspace + user + role + effective row scope + base currency + workspace config,
  with a 100-entry cap and 30s `Cache-Control: private, max-age=30`. Returns
  `X-Overview-Cache: HIT|MISS`. No tenant boundary crosses the key.
- `countsByResource()` no longer reads all record rows: it uses parallel HEAD
  `COUNT(*)` queries for only the caller-visible resources (uses the existing
  `records_org_resource_idx`). Meta uses the same path. Scoped roles still
  derive counts from the rows they fetched.
- Dashboard `overview` and `meta` queries use 30s `staleTime`.
- No aggregation definition, KPI, role or DB schema changed — only caching and
  index-backed exact counts. Build passes; `tsc --noEmit` clean after the pass.

## Verification so far
- `npx tsc --noEmit` clean; `npm run build` succeeds.
- Unit checks: record-invariants QA and field-validation QA pass;
  `computeJobProfitability` fixture check returns 4,830 / 0 / 4,200 / 630 /
  3,720 as required; record-invariants block plannedEnd < plannedStart with the
  field-specific message.
- Read-only SQL against production verified the allocation/reversal columns and
  the two QA7 receipts/allocation lines. No production records were read into
  the workspace or modified; no QA data touched.
- Not yet run: post-deploy browser regression (deploy is owner-gated).

## Deliberately NOT changed
- `invoice-to-receipt` conversion remains hidden/409 until receipt allocation
  settlement is fully idempotent end-to-end; the supported path is
  Record and allocate receipt.
- No edits to QA records; 15% VAT remains user-entered (no statutory claim).
- R7-06 wording chosen per owner; no change to what counts as ACTIVE jobs.
