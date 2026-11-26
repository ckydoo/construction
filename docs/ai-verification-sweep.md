# Myla AI verification sweep

## Verdict: NOT signed off for live generation

Code tests and deployment status are not evidence of successful production AI generation. Repeated user reports establish a production failure. No successful authenticated production response has been observed during this sweep.

## Scope and evidence

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Production database destination | Confirmed | Vercel NEXT_PUBLIC_SUPABASE_URL points to oeadisqfuyhelppinaxw.supabase.co, the project inspected through the connector. |
| Backend deployment | Confirmed active v5 | Supabase list_edge_functions. Active is not an invocation test. |
| Server key configuration | Presence only | Vercel service-role variable is sensitive/redacted. Its actual validity and equality with an accepted backend credential are NOT established. Redaction must not be interpreted as an empty value. |
| AI secret | Presence previously confirmed | Supabase metadata lists OPENROUTER_API_KEY. Presence does not establish validity or provider access. |
| Usage controls | Live permissions verified | Usage table RLS enabled; anon cannot read; authenticated cannot insert; anon/authenticated cannot execute reservation; service_role can execute. |
| Usage reservation | Previously passed, rolled back | Reservation succeeded within a rolled-back transaction; no durable quota change. This is not a REST or Edge invocation test. |
| Usage activity | Last checks returned no rows | Suggests a failure before reservation/model generation; not proof of a particular authentication or configuration error. |
| Model availability | Public endpoint listing previously available | Does not prove access with this account, privacy routing constraints, or successful generation. |
| All five AI modes | Local mocked checks passed | Quotation, Ask Myla, project plan, work report and customer message. No real inference. |
| Provider failure handling | 30 additional mocked cases passed | Six cases in each of five modes: quota-service failure, provider denial, thrown transport error, truncated response, malformed JSON, absent content. No upstream detail or test credential leakage. |
| Record lookup access | Local mocked checks passed | Authentication, module/role visibility, billing, temporary passwords, tenant filter, row scope, safe links, bounded results, no writes. |
| Task creation controls | Local mocked checks passed | Explicit approval, scoped project, safe defaults, stable retry IDs, duplicate/lost-response recovery. No live task creation tested. |
| Quotation pricing | Pure-function checks passed | AI prices are discarded; absent trusted rates produce zero-price warnings. Missing quantities are placeholders with warnings. |
| UI controls | Source checks passed | No browser dialogs, mode-change confirmation, no provider names in normal form, use-based notice, review/approval safeguards retained. Not a visual browser acceptance test. |
| Error diagnostics | Mocked route checks passed | Quotation and writing now expose safe support codes; Ask Myla also does. No raw upstream response is echoed. |
| TypeScript and production build | Passed locally | Does not establish runtime/provider availability. |

## Remaining findings

1. **Release blocker: live generation fails and cause is unconfirmed.** Need an actual authenticated production response with its current support code or equivalent protected runtime trace. Available connectors expose configuration/deployment/database operations, not authenticated invocation or runtime request logs. Local environment has no configured production credentials. No credentials were requested in chat.
2. **Timeout margin is tight.** Edge can spend up to 10 seconds reserving usage and 45 seconds generating, plus overhead. Ask Myla waits 50 seconds; drafting waits 55; browser waits 60. A slow otherwise-valid request can exceed the outer budget. This does not explain a proven immediate authentication failure and has not been established as the reported cause.
3. **Usage denial is ambiguous.** Reservation returns false for both missing membership and exhausted quota; Edge labels either as the daily limit. App authentication normally establishes membership first, but that error is not a precise diagnosis.
4. **No automatic paid fallback.** Free-model, no-data-collection and supported-parameter constraints remain intact. A public model listing does not establish an eligible route under all these constraints.
5. **Built-in suggestions are not AI verification.** Four exact prompts now bypass inference and reuse scoped record lookup. Their success cannot certify free-text interpretation or drafting.
6. **Task retries are not a transaction for the whole plan.** Partial successes persist; request IDs are browser-view state and are lost after refresh. These are existing limitations, not fixed by this sweep.

## Verification required before sign-off

- One successful free-text Ask request (not a built-in prompt), with scoped results.
- Successful valid quotation, project-plan, work-report and customer-message drafts through production.
- Quotation editor handoff with no implicit save; task review/approval and retry behavior in an authorized test workspace.
- Browser verification on desktop/mobile with real role/module settings.

No new production change or speculative configuration replacement was made during this sweep. Only expanded local regression coverage and this report were added.
