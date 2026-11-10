# MYLA live onboarding / tenancy audit

**10/10 checks passed** — real Chromium against `http://127.0.0.1:3000`, backed by the live Supabase project.

| Check | Result | Detail |
|---|---|---|
| signup creates a confirmed Supabase Auth account and opens the wizard | PASS | new session → /onboarding |
| company profile step accepts legal entity, country and currency | PASS | legal name · ZA · ZAR → step 2 |
| company type and size feed the derivation engine | PASS | INDUSTRIAL_EPC · MID · 85 people · $10M–$50M |
| qualifiers visibly unlock feature flags | PASS | 4 qualifiers → 5+ live flags |
| step 5 derives the module pack and an explicit add-on | PASS | 21 → 22 modules · 13 basic · demo data off |
| creating the workspace persists derivation and lands on an empty dashboard | PASS | qa-onboarding-mwaqa3xpc68e · 22 modules · 0 seeded clients |
| a second tenant cannot read the demo workspace | PASS | API 401 · page redirects to own workspace |
| sign out and sign back in keep the onboarded session | PASS | Supabase Auth session → dashboard, no re-onboarding |
| team invite, role edit, invited sign-in and last-owner protection | PASS | VIEWER invite → PROJECT_MANAGER · last owner protected · temp-password sign-in |
| no uncaught page errors or unexpected console errors | PASS | 0 page errors · 0 console errors |

Workspace: `QA Onboarding mwaqa3xpc68e` · `qa-onboarding-mwaqa3xpc68e@kestrelridge.co.zw` · slug `qa-onboarding-mwaqa3xpc68e`.
Derived pack: **22 modules**, plan **Professional**, user limit **60**, with 13 basics plus type/size/qualifier/add-on layers. Demo data was left OFF so the new workspace starts with an empty state.

Unexpected console errors: 0 · Uncaught page errors: 0.
Screenshots: `screenshots/17-onboarding-signup.png` … `21-team-roles.png`.

## Cleanup

This suite creates two throwaway Auth users (`qa-onboarding-*` / `qa-invite-*`) and one workspace. Run the generated `../QA_ONBOARDING_CLEANUP.sql` through the Supabase SQL editor or connector; it temporarily disables the last-owner trigger, cascades the QA organization and deletes the QA Auth users, then re-enables the trigger. It never touches the seeded Kestrel Ridge workspace.
