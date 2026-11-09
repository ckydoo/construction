# BuildOps — live MVP status

**Date:** 2026-11-07 (Africa/Harare)
**Repository:** `git@github.com:ckydoo/construction.git` · `main`
**Runtime:** Next.js 15 on `0.0.0.0:3000`, backed by live Supabase
`oeadisqfuyhelppinaxw` (Postgres + Auth + Storage + RLS).

## Green gates

| Gate | Result |
|---|---|
| `npm run audit` | **1211/1211 API checks + 22/22 derivation checks** |
| `npm run audit:browser` | **28/28 real-Chromium checks**, 0 unexpected console/page errors |
| `npm run audit:onboarding` | **10/10 live signup/onboarding/tenancy/RBAC checks** |
| Wallet invariant | `[]` |
| GitHub push | Full history, 117 files, no `.env`, 0 secret hits |
| Demo data | 616 records, 49 resources, 7 users, 34 modules, 6 wallets, 4 PDFs |
| QA fixture cleanup | 1 org, 7 memberships, 0 QA users, last-owner trigger enabled |
| Final demo reseed | 616 records, 6 wallet rows, 14 ledger entries, 4 PDFs, integrity `ok` |

Full evidence: `AUDIT_REPORT.md`, `BROWSER_AUDIT_REPORT.md`,
`ONBOARDING_AUDIT_REPORT.md`, `screenshots/`.

## What “complete MVP” means now

The core slice is proven end-to-end on the live Supabase project: real auth,
multi-tenancy with RLS, full CRUD across 49 resources, onboarding that derives
modules/flags/limits from company type/size/qualifiers/add-ons, client wallets,
cross-module links, role matrix, empty/loading/optimistic states, dark mode,
command palette and responsive layout. New workspaces start with 13 connected
essentials rather than every module at once, per the correctness-first decision.

## Live-only fixes made during QA

1. `scripts/audit.py` accepts HTTP `409` as well as `400` for an already-reversed
   wallet entry (the Supabase RPC uses `409`).
2. `scripts/browser-audit.mjs` waits for the wallet drawer's derived balance to
   fall after allocation and clicks a populated client data cell rather than a
   loading skeleton row.
3. `src/app/api/[org]/meta/route.ts` resolves `profiles` in a second RLS-scoped
   query and joins them to memberships in memory. `memberships.user_id` references
   `auth.users`, not `public.profiles`, so the previous PostgREST embedding made
   every team list empty on Supabase.
4. Added `npm run audit:onboarding` — a 10-check Chromium flow covering signup,
   the five-step wizard, derivation persistence, empty-state dashboard,
   cross-tenant denial, session persistence, team invite, role edit, invited
   sign-in and last-owner protection.
5. Hardened `scripts/audit.py` against a rare stalled chunked Supabase response:
   `Connection: close`, short read timeouts, a 60-second `SIGALRM` hard deadline
   and one retry for idempotent GETs. The full live suite now finishes at
   1211/1211 instead of one transient `HTTP 0` failure.

## Auth tradeoff (important)

The live Supabase Auth project still has `mailer_autoconfirm=false`, no SMTP,
`site_url=http://localhost:3000` and an empty redirect allow-list. Registration
and team invites deliberately use the server-side Admin API with
`email_confirm: true` / a temporary password, so they work today without a
confirmation email. That is acceptable for an MVP on a controlled host, but
public signup should be hardened before launch: configure SMTP or autoconfirm,
set the public `site_url` + redirect allow-list, and consider replacing temporary
passwords with real invite links. **These account-level changes are not done.**

## QA cleanup note

`npm run audit` and `npm run audit:onboarding` create throwaway Auth users and
workspaces. They are not auto-deleted because deleting a workspace's last OWNER
requires privileged SQL. Run the generated `../QA_ONBOARDING_CLEANUP.sql`
(or the equivalent Supabase SQL editor/connector statements) after a live run;
it disables `memberships_protect_last_owner`, deletes `qa-*` orgs/users/invites,
then re-enables the trigger. After the final QA run `npm run db:seed` restored the
clean demo dataset; the current live project is clean.

## Still unauthorized

- Render Blueprint apply and `.onrender.com` deployment.
- Supabase Auth `site_url`, redirect allow-list, SMTP or autoconfirm changes.
- Public-host end-to-end verification.
- Enabling more modules by default beyond the proven core slice.
