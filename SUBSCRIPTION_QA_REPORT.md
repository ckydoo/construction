# MYLA subscription shadow QA

**10/10 checks passed** — local mock Stripe signed webhooks + hash-verified Paynow mock against `http://127.0.0.1:3001`.

| Result | Check | Detail |
|---|---|---|
| PASS | register a new organisation | myla-billing-qa-mwb1537j |
| PASS | onboarding remains reachable before payment | onboarded=true |
| PASS | billing starts in trial_required with three USD plans | 9 / 29 / 99 USD everywhere |
| PASS | hard lock blocks workspace APIs before trial | API 402 · dashboard redirects · billing page reachable |
| PASS | select Pro and start the 14-day card-required Stripe trial | signed checkout.session.completed → trialing |
| PASS | Pro trial grants full write access | client record created |
| PASS | trial_will_end creates exactly one Paynow invoice and cancels Stripe first | switch_pending · no Stripe charge recorded |
| PASS | hash-verified Paynow mock checkout activates the same period | invoice MYLA-202611-E33981C494A4 · active until 2026-12-13 |
| PASS | daily sweep is idempotent | invoices=1 |
| PASS | failed renewal gives 3-day grace then hard locks, without deleting data | locked · 1 record(s) preserved · billing reachable |

Workspace: `myla-billing-qa-mwb1537j` · `qa-billing-mwb1537j@kestrelridge.co.zw`. No live keys, live charges or production writes were used. Cleanup SQL: `/tmp/billing-qa-cleanup.sql`.

**Cleanup verified:** `qa_orgs 0`, `qa_users 0`, `mock_events 0`; the two pre-existing organisations remain `comped`. Stripe test-mode-compatible signed webhook events and a local hash-verified Paynow mock were used because live Stripe/Paynow credentials are not yet available.
