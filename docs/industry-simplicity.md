# Construction and industrial fit — focused simplification

## Scope shipped in source

- Append Maintenance, Repairs, Installation and Fabrication to the shared work-type choices. Existing choices, order and default remain unchanged. The same field is used in enquiries, quotations, templates and jobs; no second job model is introduced.
- Use Work reports, Work meetings and Inspections for shared registers; use work-location and site/workshop/service examples. Existing IDs (`dailyLogs`, `meetings`, `inspections`), routes, data fields, permissions and saved records are unchanged. Weather and other site-specific fields remain optional; reports still require a job and date.
- Correct Quotation singular/title/total labels and the quotation editor badge. Specialist terminology remains where relevant; this is not a global replacement of technical identifiers or navigation-group keys.
- Adapt the existing AI prompts to construction and industrial installation, maintenance, repairs and fabrication. The UI shows Work report while retaining the `site-report` request key for compatibility. Users provide context in the existing notes field; no new business questionnaire, database retrieval or provider payload is added. Existing consent, safety, pricing and approval safeguards remain.

## Simplicity boundaries

No new modules, pages, onboarding steps, required fields, subscription entitlements or automated actions. Existing Essentials defaults and explicit Team/Full choices remain unchanged. Disabled-module behaviour uses the previous conversion-visibility fix, not a second configuration layer. Job-only awards remain available when Contracts is disabled. No direct quotation-to-invoice shortcut is added: the supported short route remains quotation → job → draft invoice, then the existing receipt workflow.

This is not full manufacturing, MRP, automated recurring maintenance, stock traceability, general-ledger posting or proof of enterprise-scale readiness. Maintenance uses existing equipment and repair records. No promise of new offline or consolidation capabilities is introduced.

## Validation

`npx tsx scripts/industry-fit-qa.ts` covers:
- All configured company-type/company-size combinations retaining the same Essentials resources.
- Existing work-type compatibility and new choices through quotation/template round trips and quotation → job → draft-invoice mapping.
- Disabled references/stages remaining hidden in lean configurations.
- Equipment and repair field validation for a service job, including open/in-progress/complete statuses.
- Explicit team configuration containing jobs, tasks, purchasing, deliveries and work reports.
- AI prompt context and safety rules; no provider calls.

Existing onboarding/entitlement, conversion visibility, field validation, proposed job cost, AI drafting and approved-task QA passed. TypeScript and production build passed. These are local contract/regression checks, not authenticated browser or live database acceptance tests.

Before release, use authorised staging accounts for three live journeys: (1) small-contractor quotation → job → invoice → allocated payment, (2) industrial equipment → repair work order → completion, (3) larger-team project → tasks → purchase/delivery records → work report. Verify permissions, totals, receipt allocation and persisted state. No live records were created for this pass.

Deploy the updated web application for labels/options and redeploy `ai-quotation` for the broadened prompts. No migration is required. Neither deployment was performed in this implementation pass; the last recorded deployed AI version was v3 before these prompt edits.
