# MYLA — live MVP status

**Motto:** Built for Progress. · **Descriptor:** CONSTRUCTION & INDUSTRIAL MANAGEMENT

**Date:** 2026-11-07 (Africa/Harare)
**Repository:** `git@github.com:ckydoo/construction.git` · `main`
**Production:** **https://myla-construction-erp.vercel.app** (Vercel, `iad1`, Node 26.x,
built from commit `7bc17d0`, deployment `dpl_3xiHJ5Go5PTVEzoqbTDWdtWQW7wk`) · full detail in `PRODUCTION_DEPLOYMENT.md`
**Local runtime:** Next.js 15 on `0.0.0.0:3000`, backed by live Supabase
`oeadisqfuyhelppinaxw` (Postgres + Auth + Storage + RLS).

**Language:** plain, Zimbabwe / Southern Africa-first wording for very small
industrial and construction companies (`TERMINOLOGY.md`). The in-app Documentation
page now explains the **business flow** — client → quote → job → certificate →
payment — rather than the software architecture.

## Green gates

**Brand:** MYLA · *Built for Progress.* · CONSTRUCTION & INDUSTRIAL MANAGEMENT (see `BRAND.md`).

| Gate | Result |
|---|---|
| `npm run audit` | **1211/1211 API checks + 22/22 derivation checks** |
| `npm run audit:browser` | **28/28 real-Chromium checks**, 0 unexpected console/page errors |
| `npm run audit:onboarding` | **10/10 live signup/onboarding/tenancy/RBAC checks** |
| `npm run audit:projects` | **8/8** project-detail / searchable-dropdown checks locally and on the live alias |
| `npm run audit:features` | **16/16** role / currency / library checks locally and **16/16** on the live alias |
| Wallet invariant | 0 broken refs · 0 wallet mismatches · 0 wallet orphans · 0 funding mismatches |
| GitHub code push | `7bc17d0` pushed; later documentation-only commits need no redeploy · no `.env`, 0 secret hits |
| Visual QA | `node scripts/design-qa.mjs` **15/15** across 56 routes / five viewports |
| Vercel production build | `READY`, promoted, 9 env vars across all three targets |
| Production smoke | login, 8 pages/APIs, branded PDF, upload→revision→download→delete, library, FX and scoped PM access all passed |
| Current live data | 619 records, 49 resources, 7 users, 34 modules, 9 client wallets, 6 funded wallet rows, 42 ledger entries, 5 jobs |
| Production QA cleanup | USD base, PM staff assignment, 0 custom folders / 0 library files, 5 jobs, 9 wallets restored |
| Current live integrity | `ok:true` · 619 records / 1637 refs · 0 broken refs · 0 wallet mismatches · `$11,000,000` balance |

Full evidence: `AUDIT_REPORT.md`, `BROWSER_AUDIT_REPORT.md`,
`ONBOARDING_AUDIT_REPORT.md`, `FEATURE_AUDIT_REPORT.md`,
`PRODUCTION_FEATURE_AUDIT_REPORT.md`, `PRODUCTION_PROJECT_SCALE_AUDIT_REPORT.md` and `screenshots/`.

**Rebrand verification (MYLA):** typecheck/build and `npm run env:check` pass,
the rebuilt app serves the MYLA title/favicon/motto/exact uppercase descriptor,
browser audit re-run **28/28**, and both generated and seeded PDFs contain the
new identity. Final live state is 1 org, 7 memberships, 616 records, 0 QA users,
`ok=true` integrity and `$11,000,000` wallet balance. See `BRAND.md`. The
1211/1211 API and 22/22 core-derivation gates were re-run on that released build; the 10/10 onboarding suite was not re-run at that time because onboarding,
auth and derivation logic were unchanged; it was later re-run **10/10** after the
plain-language terminology pass. Rebrand and visual-refinement files were
committed as `8eb261a`, pushed to GitHub and deployed to Vercel.

**Previous release — plain-language business flow:** `1aef83b` rewrote the in-app
Documentation page around the client → quote → job → certificate → payment flow and
applied Zimbabwe / Southern African small-contractor wording across the product
(`TERMINOLOGY.md`). Gates on that build: typecheck, `npm run build`, `npm run env:check`,
`audit:core` 10/10, `audit:browser` 28/28, `design-qa` 15/15 across 55 routes,
`audit:onboarding` **10/10** (re-run; QA orgs and Auth users cleaned up 0/0), reseed
616/49/7/34/6/4, integrity `ok:true` / 616 records / 1627 refs / 0 broken refs and a
`$11,000,000` clean wallet balance. That release was display-text-only; the 1211/1211 API gate belongs to the initial
release build and was not re-run for that pass. Live verification: 8 documentation
sections, 2 inline SVG diagrams, no IT jargon, 9 plain-language sidebar sections,
0 overflow and 0 errors.

**Previous release — project detail & larger data:** `c6b39e2` makes every project open
as a full page (eight tabs, including inline **Record & files**) instead of a side
drawer, and replaces plain reference `<select>` controls with server-backed
searchable dropdowns. Register paging, filtering, search, sorting and exact counts
now run in Postgres; reverse links, global search and project 360 are database-filtered.
Two additive, idempotent Supabase migrations add trigram/reference indexes and a
maintained `search_text` column — no existing columns, policies, IDs, routes,
validation, RBAC, auth or derivation logic changed. Gates on this exact build:
typecheck/build, `npm run env:check`, `npm run audit` **1211/1211** + **22/22** core,
browser **28/28**, design **15/15**, onboarding **10/10**, dedicated project QA
**8/8** locally and **8/8** on the live alias, integrity `ok:true` / 616 records /
1627 refs / 0 broken refs, and `$11,000,000` wallet balance. See
`SCALABILITY_RELEASE.md` and `PROJECT_SCALE_AUDIT_REPORT.md`.

**Latest release — row-scoped access, multi-currency and document library:** `7bc17d0`
fixes the “every account shows the same data” problem. Only Owner/Admin see the whole
company; other internal staff see their department, shared master data, own staff record
and records on assigned jobs, while external portal scoping remains. Settings → Currencies
manages base/enabled currencies and manual rates, with base-currency dashboard, reports,
wallet and job 360 totals; records keep their entered currency and PDFs show a dual
reporting total. A dedicated `/kestrel-ridge/library` page adds automatic
`Project → Drawings / Contracts / Site photos / Handover` folders plus custom nested
folders, upload/browse/search, revision chains and links to owning records. Three additive
Supabase migrations enforce the same scope in Postgres RLS. Gates on this exact build:
typecheck/build/env-check, `npm run audit` **1211/1211** + **22/22** core, browser **28/28**,
design **15/15** across 56 routes, onboarding **10/10**, feature QA **16/16** locally and
**16/16** on production, project QA **8/8** locally and **8/8** on production. Production
deployment `dpl_3xiHJ5Go5PTVEzoqbTDWdtWQW7wk` is `READY` / `PROMOTED`. See
`RBAC_CURRENCY_LIBRARY_RELEASE.md`, `PRODUCTION_FEATURE_AUDIT_REPORT.md` and
`PRODUCTION_DEPLOYMENT.md`.

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

## Still unauthorized / not done

- Render Blueprint apply and `.onrender.com` deployment.
- Supabase Auth `site_url`, redirect allow-list, SMTP or autoconfirm changes.
- Installing the Vercel GitHub App for push-triggered deployments (the project is
  deployed from GitHub via an explicit `git_source` deployment instead).
- A custom domain (the Vercel-assigned `myla-construction-erp.vercel.app` alias is used).
- Enabling more modules by default beyond the proven core slice.

Public-host end-to-end verification is now complete: see `PRODUCTION_DEPLOYMENT.md`.
