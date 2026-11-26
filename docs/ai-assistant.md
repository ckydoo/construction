# AI quotation assistant (OpenRouter through Supabase)

## Scope

One role-aware AI Assistant sidebar entry, immediately after Dashboard. It drafts quotation work breakdowns, asks questions and proposes scope. It does not send/approve documents, change records, provide engineering certification, or search arbitrary workspace records. Users review the response and explicitly open the normal quotation editor. Only the editor's existing Save action creates a record.

The browser calls the authenticated Next.js org API. After role, module, membership and billing checks, that API calls the Supabase `ai-quotation` Edge Function using the server-only service-role credential. The function accepts only the exact built-in `SUPABASE_SERVICE_ROLE_KEY`; browser Supabase user JWTs, anon and publishable keys are rejected. The OpenRouter key lives ONLY in Supabase Edge Function secrets. It is never needed in Vercel, the browser, or Expo.

## Setup / release order

1. Apply `supabase/migrations/20261118000100_ai_quotation_limits.sql` to the intended MYLA database via the normal reviewed migration process. The rate-limiter function is service-role-only, checks membership, and atomically allows at most 20 attempts per workspace per UTC day. Concurrent requests cannot exceed that cap. Provider failures count; missing provider configuration does not.
2. Deploy `supabase/functions/ai-quotation/index.ts` as **ai-quotation**. `supabase/config.toml` disables gateway JWT verification for this function; its explicit server-only credential check is mandatory and must not be removed. Example CLI command from the linked project: `supabase functions deploy ai-quotation`. Ensure the Vercel backend's service-role JWT matches Supabase's built-in service-role JWT; a newer secret key is NOT interchangeable for this private proxy comparison. Do not change any public client keys.
3. In Supabase dashboard → Edge Functions → Secrets, add:
   - **OPENROUTER_API_KEY**: real OpenRouter API key, entered directly by the owner. Do not create a placeholder or paste it into chat, Git or public environment variables.
   - **OPENROUTER_MODEL** (optional): defaults to `nvidia/nemotron-3.5-super-vl:free` (NVIDIA Nemotron 3.5 Super VL). Only `:free` model overrides are accepted; paid model IDs are rejected before quota reservation. Provider maximum input/output prices are zero, required parameters must be supported, and fallback is disabled. Select a model supporting JSON-object responses and a provider compatible with `data_collection: deny`. The default is explicit; it does not automatically switch models. If no compatible endpoint is available, requests fail rather than weakening the privacy preference.
4. Set a credit/spending limit on the OpenRouter key/account. The request cap and 2,500 output-token limit are not a monetary budget. Provider pricing varies.
5. Deploy the web application containing the sidebar, assistant, org API and quotation editor handoff.
6. Run authenticated staging acceptance checks below before broad rollout.

No existing secret should be read to create a new one. If OPENROUTER_API_KEY is missing, the assistant returns a setup message without making a provider request. No separate Vercel OPENROUTER_API_KEY is used.

## Prices, data and user review

- Users opt in to sending their description and an optional selected saved company quotation template to OpenRouter and its selected model provider. Avoid personal/sensitive information. There is no chat history storage.
- Only bounded template item descriptions, units and rates are sent. Templates are read using the authenticated RLS client plus explicit org filtering. Starter/example rates, client records and other companies' data are not included.
- Model-generated prices, totals, statuses and record IDs are discarded. The model can propose a rate ID; the server resolves it against the fetched template. Every chosen rate's source description is shown so the user can check that it fits. Currency and unit come from the selected template. Rates may be out of date.
- Unknown rates become zero, unknown quantities become one, both with explicit placeholder warnings. Every quantity is proposed, not measured. Questions and assumptions carry into the quotation scope for review.
- Draft status and zero markup are set by application code. MYLA's existing quotation logic calculates totals and saves records. No tools or write operations are exposed to the model.
- Provider prompts/responses and API keys are not logged by this implementation. Only per-org daily request counts are persisted. OpenRouter/model-provider processing remains subject to their terms; the request preference is not a guarantee of zero retention.
- Calls have timeouts and no automatic paid retries. Generation failures do not create quotations. Navigating away loses the unsaved assistant draft.

## Validation

Local checks: `npx tsx scripts/ai-quotation-qa.ts`, `npx tsc --noEmit`, `npm run build`.
Tests exercise output sanitisation, refusing invented prices, module/role checks, placeholder warnings, assumption handoff, the actual Edge handler with mocked network, server credential rejection, missing configuration, quota denial and successful provider response handling.
Deployed the ai_quotation_limits migration and ai-quotation Edge Function to the Construction project (oeadisqfuyhelppinaxw). Supabase reports function version 1 ACTIVE (id d32df8c9-300c-42ba-a36b-c124f797b771). A read-only database check confirmed RLS enabled, anon/authenticated unable to read usage or execute the quota RPC, and service_role able to execute it. No secrets were created or retrieved. No live provider request, physical-device test or authenticated end-to-end browser test has been performed. The web AI interface still needs deployment.

Authenticated staging acceptance:
- Owner with estimates enabled can generate; disabled estimates, read-only billing, non-member, portal and staff without quotation permission cannot.
- Cross-org/inaccessible template IDs are rejected before calling the provider.
- Missing key/migration/function or a non-free model override produce useful errors; provider credit exhaustion/timeout/invalid JSON do not create records.
- Twenty requests exhaust the org's UTC-day allowance; concurrent requests cannot exceed it.
- Review/edit a draft with unresolved questions and missing prices; validate normal PDF/tax/quotation behaviours after explicit save.
- Verify keyboard, mobile layout, screen-reader labels and no unintended double submission.

## Free-model selection

OpenRouter endpoint metadata checked during implementation: https://openrouter.ai/api/v1/models/nvidia/nemotron-3.5-super-vl:free/endpoints lists zero prompt/completion pricing and response_format/structured_outputs support. Availability and free-account quotas can change. The existing data_collection:deny preference is unchanged and may exclude a provider; a live authenticated test is still needed. No promise of best-model quality, unlimited usage, or zero hosting costs. Qwen3 235B Instruct 2507 was considered but its free endpoint list was empty at the time of checking.

## Expanded assistant — project plans, site reports and customer messages

The single sidebar entry now opens four task choices, filtered by enabled resources/modules and read/write/create permissions. Quotations require estimates access, project plans require projects access, site reports require dailyLogs access, and customer messages require clients access. A user with site diary permissions but no estimating access can use site reports without gaining quotation access. External and read-only roles cannot generate drafts. API checks independently enforce these permissions, billing, membership and temporary-password restrictions.

New modes use `POST /api/[org]/ai/draft` and the same private Edge Function with a validated task selector. Their only model input is the user's explicitly consented notes (20–6000 characters). No customer/project/financial data, recipient lookup or record search is performed. The organization and user IDs are used for quota checks, not included in provider prompts. The optional quotation template remains quotation-only.

Project plans propose phases and task checklists; site reports organise supplied observations without inventing events; customer messages draft wording from supplied facts. All return bounded title/body/questions/assumptions as plain text. Users can edit the draft, review it and copy it manually. Copy includes questions and assumptions to retain uncertainty. No new task, diary or message is saved or sent. Changing modes warns that unsaved work will be discarded. Changing input invalidates the prior draft; editing a result clears review confirmation. There is no persistent draft history.

All four modes share the existing atomic 20-request UTC-day quota (`reserve_ai_quotation` and `ai_quotation_usage` retain their historical names); no separate budget or migration is introduced. Free-only model selection, privacy settings and zero-price limits remain in force.

**Release status:** the previously deployed Edge Function v1 handles quotations only. The expanded function in this branch MUST be redeployed before releasing the new web UI. No live provider test or deployment of this expanded implementation has been performed. The user reported saving the provider secret; it has not been read or verified by this implementation.

Local validation: expanded `scripts/ai-quotation-qa.ts` tests mode permissions (including disabled module/resource and external roles), parser bounds, invalid mode rejection, each actual Edge handler task with mocked network, notes-only provider payloads and shared quota denial. Existing quotation regression tests and Next.js production build passed. Authenticated UI/clipboard/permissions tests with real accounts and live-provider quality checks remain release acceptance work. Verify errors for quota exhaustion, provider downtime, missing configuration and a quotation-only old function before rollout. The expanded sidebar is part of the web platform, not a new native APK screen.
