# Ask Myla — read-only record finder

Myla Assistant keeps the existing /[org]/ai-assistant route and adds Ask Myla as the first/default tab. Other drafting tabs remain permission-filtered. Read-capable users can use Ask without record-create permission; read-only billing can use it while account access is allowed. Fully blocked billing, disabled resources, unknown roles and temporary-password accounts are rejected server-side.

## Supported scope

Find recent or named quotations, invoices, jobs and tasks; overdue invoices/tasks; invoice statuses ISSUED/PARTIALLY_PAID/OVERDUE; and quotations in SUBMITTED/INTERNAL_REVIEW. Each question is independent (no conversation memory). Examples populate the question field; nothing submits without the consent checkbox and Ask Myla action. Results link to the existing full-detail pages or registers.

Only the user's question is sent to OpenRouter via the existing private ai-quotation function with task=ask. The provider returns a constrained resource/filter/query plan, not SQL or narrative answers. Unsupported/ambiguous/multi-resource/action/aggregate requests should return resource=null; MYLA asks the user to narrow the request. Parsed resource and filter values are allowlisted, incompatible combinations rejected, and the search string is bounded and stripped of wildcard/control punctuation. Invalid plans never run arbitrary queries.

The Next.js API independently validates permissions, applies organization and soft-delete filters on the cookie/bearer-bound RLS Supabase client, and performs the existing rowAllowed scope check. The service role is used only for the private provider proxy/quota call, never to retrieve the user's records. Provider output cannot choose URLs, organization IDs or record IDs. Titles, references and links are built only from scoped database rows. No retrieved records are sent back to the provider. No user record write tools are exposed; only the existing quota counter is mutated.

## Accuracy boundaries

The endpoint reads at most 201 candidate rows, evaluates up to 200 recent candidates, and returns at most 12 matches. Status/date filtering is applied to the scoped window. The response explicitly warns this is not a complete register; zero matches do not claim there are no matching records elsewhere. Invoices are identified by stored status, not an AI-calculated balance. No financial sums, mixed-currency totals, forecasts or customer balance assertions are returned. Overdue means a supported open status and due date before today in UTC. Full-register links are labelled View all, not falsely presented as filtered links. No pagination is provided inside Ask in this increment.

This is a useful navigation-first release, not unrestricted chat over every module. Account/team/member scope and actual provider interpretation need staging acceptance. If a provider misinterprets a question within the allowed schema, the generated answer describes the filter actually applied and the user can rephrase or inspect the register.

## UX

One question box, examples filtered to enabled/readable resources, concise opt-in and expandable help. Results focus automatically for keyboard users. Inline errors and inline tab-discard controls replace browser alerts/confirmations. Draft modes retain review/consent and task-creation approval. The previous UI cleanup is included: concise labels, secondary information in How AI works, draft-first quotation results and shorter task-copy.

## Verification and rollout

Passed locally: scripts/ask-myla-qa.ts (actual route executed with mocked auth/storage/provider), expanded Edge-handler tests in scripts/ai-quotation-qa.ts, scripts/ai-tasks-qa.ts, scripts/ai-ux-qa.ts, TypeScript and Next.js production build. These are not live authenticated browser tests. No customer records were changed or sent to a live provider during implementation.

Deploy the updated Supabase ai-quotation function first (new task=ask protocol), then deploy the web application. No new migration or secrets are needed; Ask shares the existing 20-attempt/workspace/UTC-day limit. The old function rejects ask requests rather than giving ungrounded answers. Neither deployment has been performed in this implementation pass.

Staging acceptance: owner, viewer, scoped staff and external users; disabled modules; foreign-tenant/project records; quota failure; unsupported questions; empty/multiple results; long questions; tab switches; keyboard/mobile layout; live model plan interpretation; invoice status versus receipt allocation state. Keep all money/record mutations in the established reviewed workflows.
