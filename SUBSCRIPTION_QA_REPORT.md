# MYLA DPO Pay subscription shadow QA

**10/10 checks passed** — local DPO Pay v6 mock against `http://127.0.0.1:3001`. No Stripe, live keys, live charges or production writes were used.

| Result | Check | Detail |
|---|---|---|
| PASS | register a new organisation | myla-dpo-qa-mwb5ehba |
| PASS | onboarding remains reachable before payment | onboarded=true |
| PASS | billing starts in trial_required with three USD plans and no card | 9 / 29 / 99 USD everywhere · DPO mock · no Stripe |
| PASS | hard lock blocks workspace APIs before trial | API 402 · dashboard redirects · billing page reachable |
| PASS | select Pro and start the 14-day NO-CARD trial | trialing · no card saved · no invoice yet |
| PASS | Pro trial grants full write access | client record created |
| PASS | trial expiry creates one DPO invoice and 3-day read-only grace | grace · one USD 29.00 DPO invoice · no charge |
| PASS | DPO hosted mock verifies payment and saves a recurring token | invoice MYLA-202611-A2F9E5FE71D1 · active until 2026-12-09 |
| PASS | daily sweep is idempotent; tokenised renewal charges once | 2 paid invoices · chargeTokenRecurrent once · cron replay clean |
| PASS | grace expiry hard locks without deleting data | locked · 1 record(s) preserved · billing reachable |

Workspace: `myla-dpo-qa-mwb5ehba` · `qa-dpo-mwb5ehba@kestrelridge.co.zw`. Cleanup SQL: `/tmp/billing-qa-cleanup.sql`.

Cleanup verified after the final run: `qa_orgs 0`, `qa_users 0`, `mock_events 0`, `billing_events 0`, `comped 2`, `subscriptions 2`, `invoices 0`. The two pre-existing organisations remain comped and no live DPO/Paynow charge was made.
