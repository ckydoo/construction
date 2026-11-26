# Job home — Phase 1

Implemented in the working branch; not deployed.

## Lean workflow

The existing job page groups existing registers into Work & budget, Documents, Approvals & inspections, Money, Work reports, and People & equipment. Sections and records respect module visibility and role access. No new module is required. Detailed costing and specialist controls remain optional.

An accessible source quotation/BoQ is linked from the job, with up to 100 current source lines shown. This is not a frozen, immutable BoQ baseline.

Starting cost budget approval uses the job's proposed estimate cost, never its selling price. An authorized user must review the amount and explicitly approve it. This creates one approved summary budget line, not a detailed BoQ allocation. Existing budgets prevent this shortcut. Later revisions use the existing register. Budget lines follow the existing job-currency convention (they have no separate currency field).

The initial-budget endpoint checks authentication, permissions, writable billing, scoped job access, closed jobs and existing budgets. A deterministic organization/job record ID reconciles duplicate submissions and uncertain responses. This does not make creation atomic against simultaneous writes through the general budget register. Browser input is locked after submission; refresh to inspect the current job before changing an uncertain request.

Documents links to the existing job folder in the library. Existing attachment/revision functionality is reused. Document types now include BoQ, Council approval and Permit.

Permits support plan approval, stage inspection and completion approval, authority reference, submission date, authority decision, inspection result and conditions/evidence notes. New permit forms default to Pending. Authority decisions are recorded separately from internal workflow status; neither a record nor internal approval proves council approval. Retain the actual evidence with the record/library.

Job summary totals exclude draft budgets, uncertified payment applications and unapproved variations.

## Local verification

Passed: job-home mocked route/helper QA; receipt allocation arithmetic and mocked receipt API guards; tax defaults and visibility; quote-to-job proposed cost; conversion visibility; field contracts; profitability pure-function checks; TypeScript; production build; diff whitespace checks.

The receipt guard fixture was updated to include issued invoice status, client, currency and outstanding amount. Added negative cases for draft/void/paid invoices, mismatched client/currency, excessive invoice allocation and allocations exceeding the receipt.

Document preview browser QA could not run because TESTER_ACCOUNT.json is absent. Authenticated browser acceptance, live file/revision permissions, live database/RLS behavior, and production receipt transactions have not been verified in this work. No live customer records were written. No deployment performed.

## Out of scope

Stock movement ledger, unified actual-cost posting, automated labour-rate costing, immutable detailed BoQ baselines, new specialist retention/subcontract/plant controls, and full general-ledger posting.
