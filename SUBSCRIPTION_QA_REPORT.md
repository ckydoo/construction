# MYLA USD 6/14/26 billing QA

**12/12 checks passed** — local DPO Pay v6 fallback mock against `http://127.0.0.1:3000`. Paynow remains the runtime primary. No Stripe, live keys, live charges or production writes were used.

| Result | Check | Detail |
|---|---|---|
| PASS | register a new organisation | myla-dpo-qa-mwd3bjo9 |
| PASS | onboarding starts an empty 7-day trial and returns Billing | sample data off · trial started · Billing next |
| PASS | billing exposes USD 6/14/26 and a payable prepay invoice | 6 / 14 / 26 USD · 7-day trial · one USD 6.00 prepay invoice |
| PASS | trial workspace has full write access | client record created |
| PASS | configured DPO fallback reissues the prepay invoice without a second period | Paynow default retained · one mock invoice · fallback selected |
| PASS | upgrade during trial is immediate and reprices the prepay month | Starter → Pro immediately · USD 14.00 · no duplicate invoice |
| PASS | downgrade is scheduled at period end and can be cancelled | Pro retained until period end · cancellation restores one pending invoice |
| PASS | payment during the trial preserves the full 7-day trial | USD 14.00 prepaid · trial still ends 2026-11-19 |
| PASS | trial expiry activates the prepaid month without a second invoice | active · prepaid period starts at former trial end · zero duplicate invoices |
| PASS | daily sweep is idempotent; tokenised renewal charges once | 2 paid invoices · one mock renewal charge · cron replay clean |
| PASS | active upgrade is immediate with one prorated adjustment invoice | Pro → Enterprise immediately · USD 11.60 proration · exact-amount payment verified |
| PASS | grace expiry hard locks without deleting data | locked · 1 record(s) preserved · billing reachable |

Workspace: `myla-dpo-qa-mwd3bjo9` · `qa-dpo-mwd3bjo9@kestrelridge.co.zw`. Cleanup SQL: `/tmp/billing-qa-cleanup.sql`.
