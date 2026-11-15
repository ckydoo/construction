# Accountant review pack — MYLA Construction ERP

Prepared 2026-11-13. Audience: qualified accountant/tax adviser. Owner to attach
sample data exports and sign the final page only after every section is confirmed.
Nothing in this document is legal/financial advice; treat all calculations as UNVERIFIED
until signed.

## 0. What the platform does today (facts)
- Multi-tenant ERP for Zimbabwe construction firms: quotes → invoices → receipts (payments),
  projects/costs, timesheets, variations (change orders), inventory, documents.
- Subscription billing is separate from customer billing (MYLA's own fees, via Paynow;
  DPO tokenised renewal optional). Tax settings are workspace-configurable.
- Receipts are allocated to invoices; allocation affects invoice status
  (e.g. ISSUED → partially paid → PAID). Reversals restore prior status. Amounts are
  stored as numeric USD unless the workspace currency is set; fractional quantities
  (e.g. 2.5 units) are supported in line items.
- Cash gap and cash-received figures derive from invoice allocations and cleared receipts
  respectively (implementation note, not an accounting standard).

## 1. Decisions required from the accountant
For each: write AGREE / ADJUST to … / REJECT, and the governing principle.

### 1.1 Output tax (VAT) default
- Proposed: tax OFF by default. Owner/Admin may enable and set a rate (no statutory
  rate hardcoded anywhere). Historical records are never recalculated when the rate changes.
- Questions: rate presentation (exclusive vs inclusive); invoice wording when off;
  treatment of mixed-rated lines; whether the toggle must capture an effective date and
  rate source (ZIMRA notice reference).

### 1.2 Margin / profit definition (the number shown to owners)
- Proposed: job margin = (sale value − committed/actual cost) with cost-to-date separated
  from FORECAST at completion; proposed (unapproved) estimate costs never enter approved
  figures automatically; approved budget is a separate field set by the user.
- Questions: which costs count (labour incl. overtime from timesheets? subcontractors?
  plant? variations at submitted/approved/final value?); WIP treatment;
  retention; cost commitments vs actuals; forex gains/losses.

### 1.3 Cash gap definition (liquidity indicator)
- Proposed: cash gap = sum over issued invoices of (amount outstanding) filtered to the
  review window, computed from allocations — not from unallocated project receipts.
- Questions: inclusion of overdue vs current; retention holdbacks; credit notes;
  write-offs; doubtful-debt provision; VAT inclusive or exclusive in the outstanding amount.

### 1.4 Cash received
- Proposed: CLEARED receipts only (status 'cleared'), grouped by period; pending/unallocated
  receipts excluded until cleared.
- Questions: cheque/EFT clearing lag assumption; part-allocation presentation;
  multi-currency receipts (ZWG/USD) — translation rate and date; bank charges.

### 1.5 Receipt allocation, settlement and reversal rules
- Same-currency rule (no allocation across currencies); allocation capped at invoice
  outstanding; reversal returns invoice to ISSUED/equivalent state with zero paid;
  one payment may settle multiple invoices (partial allocation permitted).
- Questions: overpayment/credit handling (unallocated credit balance); refund vs credit
  note; settlement discount; bad-debt write-off workflow and audit trail.

### 1.6 Fractional quantities & rounding
- Quantities to 3 dp; line amounts = qty × rate rounded to 2 dp at line level (saved,
  not recalculated); totals = sum of saved lines.
- Questions: rounding mode (half-up vs bankers), tolerance for tie-outs, import of
  third-party documents with different rounding.

### 1.7 Invoice artifacts (wording & compliance)
- Current intro text: see app invoice preview (local changes awaiting inspection) —
  confirm required particulars for a ZW tax invoice (supplier/customer details, VAT number,
  invoice number/date, currency, line descriptions, VAT amount/rate, totals) for both
  VAT-registered and non-registered workspaces.
- Questions: simplified vs full tax invoice thresholds; duplicate/credit note numbering
  sequence control; record retention period (ZIMRA: keep supporting documents).

### 1.8 Reporting definitions on dashboards
- List every headline figure on the dashboard/reports and sign its formula, or mark it
  "indicative — not for financial statements". Attach the report definitions exported from
  the app (or the relevant source files under `src/lib/`).

## 2. Evidence to attach (sample data from the test workspace)
1. Two quotes with item lines incl. fractional qty → converted to job → invoice →
   partial receipt → reversal. Export quote PDF, invoice PDF/HTML, receipt document.
2. One invoice with tax off and one with tax on; show saved vs recalculated amounts.
3. The CSV exports (parent + line items) for the same documents.
4. Current dashboard screenshots for a workspace with known figures (hand-computed).

## 3. Sign-off
| Section | Decision | Signed / date |
|---|---|---|
| 1.1 Tax default | | |
| 1.2 Margin definition | | |
| 1.3 Cash gap | | |
| 1.4 Cash received | | |
| 1.5 Allocation/reversal | | |
| 1.6 Rounding | | |
| 1.7 Invoice artifacts | | |
| 1.8 Dashboard definitions | | |

Signature (accountant): ______________________  Date: ____________

**Release rule:** Gate 2 in LAUNCH_READINESS.md closes only when all rows are signed
AGREE/ADJUST and ADJUSTS are implemented and re-verified.
