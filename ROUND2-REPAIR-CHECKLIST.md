# Round 2 repair checklist — work in progress

## Current deployment status (supersedes historical work-in-progress notes below)
- Production deployment `dpl_CYHaQWfCEtbpBXsFJsgnWBMq7p5s` at commit `0f9cf4414ffbb2ddd519762a95294d6161613305` is READY/PROMOTED with `myla.co.zw` and `app.myla.co.zw` aliases. Receipt SQL and approval SQL were applied manually; these manual applications are not normal recorded migrations.
- Approval trigger is enabled; rollback-only owner-context live tests passed for calculated hours and approval stamps and variation decision date. These are not authenticated end-to-end or real role/RLS tests.
- Receipt allocation, quote baseline and approval implementation are deployed for new transactions, but authenticated end-to-end, role/RLS, audit and billing verification remain open. Billing checks are not atomic with receipt RPCs. Existing records were not reconciled.
- Other workstreams below remain open where explicitly noted; date reproduction, CSV child-row format, accounting review, independent security and backup verification still require work. Historical notes below describe earlier stages and are not current deployment status.

No item is closed by a build or unit test alone. Do not deploy the combined release until the applicable tests pass and the limitations are disclosed. Do not alter or delete QA2 evidence without an approved reconciliation plan.

1. **Receipt allocation and invoice settlement — OPEN.** Isolated reproduction confirmed receipt creation persists when the invoice update is rejected. A non-deployable database draft now passes isolated partial and multi-invoice allocation, invoice status synchronization, full receipt reversal, replay and source-mutation checks. Authorization, durable audit review, concurrent sessions, payment creation, UI, billing and full application integration remain incomplete. Current live invoice-to-receipt conversion is unsafe. Required: tenant and role enforcement; atomic durable audit; explicit unallocated credit; same-currency amounts; cleared/reconciled state and reversal behavior; prohibit generic changes or deletes that invalidate allocations; retry and concurrent transaction tests; safe repair proposal for existing records. Local conversion block is containment only, not a repair.
2. **Timesheets and variations — OPEN.** Owner/admin approval, self-approval permitted; calculate hours, required periods, authoritative actor/time and durable audit, authorization and approved-record mutation rules. Preserve legacy data; test all write paths.
3. **Tax default and financial metrics — OPEN.** Tax off by default; owner/admin may enable and choose rate; no hardcoded statutory rate; preserve historic records. Accountant review needed for tax/margin treatment; do not present unreviewed calculation as definitive margin.
4. **Quote-to-job baseline — OPEN.** Carry estimated costs as a proposed baseline, never automatically approve it; distinguish costs-to-date from forecast profit.
5. **Stale lists — OPEN.** Local changes prepared; test real save and conversions without refresh, including failures and server-derived values.
6. **Fractional quantities — OPEN.** Local drawer formatting change; verify precision in all forms, exports and documents.
7. **CSV usability — OPEN.** Local scoped name/ID and JSON line-item work; verify permissions, readability, correctness and formula injection handling. JSON is not yet the requested separate child rows or documented child CSV.
8. **Conversion tracker — OPEN.** Local linked-client change; test family lineage, permissions and specific no-next-step explanations.
9. **Invoice wording — OPEN.** Local preview and PDF invoice intro changes; inspect generated artifacts and other document types.
10. **Dates — OPEN.** Manual keyboard/calendar reproduction, identify rerender cause and test validation for cleared receipts and approved timesheets.
11. **Full QA and release — OPEN.** Scenario retest, allocation and security tests, migration validation, production backup/rollback plan, then explicitly report deployment and outcomes. Modules excluded by plan need authorized entitlement. Accountant review and independent security and backup testing remain separate launch gates.

Database draft integration review: the preliminary server route was moved out of `src` because a reversal can race with a concurrent allocation after its invoice-scope checks. Do not deploy it or expose the privileged RPC until authorization is checked inside the same database transaction. The route and SQL drafts are not in the release.

### Receipt allocation work in progress — local only
- Added draft create/allocate/reverse API and UI, including existing receipt management and invoice prefill; no migration or deployment performed.
- Added transaction-level authorization checks, but real Supabase permission/RLS and billing behavior have not been verified. API billing checks are not atomic with the RPC.
- Isolated PGlite tests pass settlement, retry, rollback, reversal, guards and simulated authorization. Local PostgreSQL concurrent sessions additionally passed simultaneous duplicate creation, competing allocations and allocation/reversal race with mocked authorization.
- Mocked Playwright browser test passed invoice prefill and retry using the same idempotency key after a failed request; no authenticated E2E performed.
- Cash gap draft now uses invoice allocations rather than applying unallocated project receipts; cash received uses cleared project receipts. Financial definitions still require accountant review.
- Before release: migration integration and grants, real billing/auth/RLS and tenant isolation tests, additional lifecycle/security/concurrency and authenticated UI checks, audit and financial reporting review. Other R2 issues remain open until individually implemented and tested.
- Live database read-only checks: FINANCE_MANAGER had write capability to both payment and invoice resources; HR_MANAGER did not; that finance actor had no write/update permission in another organization. These are sampled authorization function checks, not full RLS/E2E tests. Confirmed live records columns, composite key, and existing triggers against the draft.
- Allocation, receipt creation and reversal now write transactional audit events locally; idempotent replays do not produce duplicate creation/reversal audit entries. PGlite and local PostgreSQL concurrency tests passed with mocked audit/auth functions. Production audit and service-role execute grants remain untested.
- Added isolated receipt API guard tests using the real billing guard with simulated billing/auth contexts: locked and read-only workspaces are denied, as are missing authentication, disallowed role, invalid date and inaccessible linked records; valid requests convert allocation to minor units. A live unauthenticated REST read returned zero record rows. These do not verify authenticated end-to-end requests, live billing transitions, or allocation-table RLS.

### Live receipt verification after manual SQL application
- Both draft SQL files are now installed (user ran them manually); receipt source guard and financial guard triggers verified present. This was not recorded as a normal Supabase migration. Staging table from the blocked deployment attempt remains.
- Deployment dpl_26WfsSGqVp9GuJt5hw36ud2oFncU, commit 2a8e26ada9e518c0b84256bf44cffefdfe59994d, READY/PROMOTED to the established domains.
- Live database rollback-only synthetic test passed partial settlement (50 of 100), idempotent replay, and receipt reversal restoring unpaid status, using an existing owner's permission context; no synthetic data persisted. Live PostgREST service-role RPC reached validation; anonymous RPC was denied. Authenticated browser E2E, live concurrency, all roles/billing and accountant review remain open.

### Quote-to-job proposed baseline — implementation
- Quote-to-job conversion now carries pre-markup itemised costs, or the sum of explicitly entered cost categories when no item lines exist, into a clearly labelled proposed estimate cost field. If no cost data exists it stays blank; it does not set the approved project budget or infer cost from the sale price. Pure conversion/validation tests and build pass. Authenticated end-to-end conversion test remains open.

### Timesheet and variation approval — local work in progress
- Prepared a new database trigger to calculate normal plus overtime hours, require a valid period and employee/project before timesheet approval, stamp authenticated user ID/time, record variation decision date and transactional approval audit. New approvals lock substantive fields until authorized return to draft; legacy approvals are not backfilled or newly locked. Approval contact is labelled separately from authoritative user ID.
- Isolated tests passed spoofed actor protection, invalid hours/dates, role denial, no direct posting, approval/reopening, and variation date. The test authorization functions are mocked. Local build and TypeScript passed.
- Not deployed: needs real Supabase auth/RLS checks, explicit lifecycle/role review, migration application, and authenticated end-to-end tests. No existing records were modified.

### Date/form reset investigation
- Reproduced in a mocked Chromium form: refreshing workspace tax settings while a drawer was open reset the entered date and other edits. The form now initializes once per opening instead of on every metadata/prop change; a late-arriving tax default applies only when the tax field has not been edited. Closing and reopening starts a fresh form.
- `node scripts/record-form-date-qa.mjs`, TypeScript and production build pass. This demonstrates one cause of lost dates, not proof that native keyboard/calendar entry and authenticated receipt/timesheet validation are fully resolved; those remain open.
