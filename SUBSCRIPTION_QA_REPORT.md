# MYLA USD 6/14/26 billing QA — trial plan changes locked

**14/14 checks passed** — local DPO Pay v6 fallback mock against `http://127.0.0.1:3000`. Paynow remains the runtime primary. No Stripe, live keys, live charges or production writes were used.

| Result | Check | Detail |
|---|---|---|
| PASS | register a new organisation | myla-dpo-qa-mwd45spf |
| PASS | a plan can be chosen before the free trial begins | Pro selected while trial_required · no invoice yet |
| PASS | onboarding starts an empty 7-day trial and returns Billing | sample data off · trial started · Billing next |
| PASS | billing exposes USD 6/14/26 and a payable prepay invoice | 6 / 14 / 26 USD · 7-day Pro trial · one USD 14.00 prepay invoice · changes locked |
| PASS | trial workspace has full write access | client record created |
| PASS | configured DPO fallback reissues the prepay invoice without a second period | Paynow default retained · one mock invoice · fallback selected |
| PASS | trial upgrades are blocked without changing plan or invoice | 409 · Pro / USD 14.00 unchanged · no plan-change row |
| PASS | trial downgrades are blocked without scheduling a change | 409 · no scheduled downgrade · cancellation correctly reports none |
| PASS | payment during the trial preserves the full 7-day trial | USD 14.00 prepaid · trial still ends 2026-11-19 |
| PASS | trial expiry activates the prepaid month without a second invoice | active · prepaid period starts at former trial end · zero duplicate invoices |
| PASS | daily sweep is idempotent; tokenised renewal charges once | 2 paid invoices · one mock renewal charge · cron replay clean |
| PASS | active upgrade is immediate with one prorated adjustment invoice | Pro → Enterprise immediately · USD 11.60 proration · exact-amount payment verified |
| PASS | active downgrade is scheduled at period end and can be cancelled | Enterprise retained until period end · cancellation restores current plan |
| PASS | grace expiry hard locks without deleting data | locked · 1 record(s) preserved · billing reachable |

Workspace: `myla-dpo-qa-mwd45spf` · `qa-dpo-mwd45spf@kestrelridge.co.zw`. Cleanup SQL: `/tmp/billing-qa-cleanup.sql`.
