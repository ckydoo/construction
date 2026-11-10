# MYLA ERP — production deployment

**Status:** LIVE · **Date:** 2026-11-07 (Africa/Harare)

## Where it runs

| Item | Value |
|---|---|
| Primary URL | **https://myla-construction-erp.vercel.app** |
| Team-scoped alias | `https://myla-construction-erp-codzlabzim53-2563s-projects.vercel.app` |
| Branch alias | `https://myla-construction-erp-git-main-codzlabzim53-2563s-projects.vercel.app` |
| Vercel project | `myla-construction-erp` / `prj_gShJxUcNTwjzIuiwdOhapx1fqskT` |
| Team | `team_ueIKhxbPy42sX45n7gARWkWq` (Hobby) · region `iad1` |
| Deployment | `dpl_4w94S2ryvm6WLV3uamSydyp2zbTn` · state `READY` · `PROMOTED` · `timeToReady 49.1s` |
| Deployment source | `git@github.com:ckydoo/construction.git`, branch `main`, explicit commit `3b811f0cc16fd202749962c1f8bb6d3c704f6b0f` (docs-only commits may be ahead on `main`) |
| Framework / runtime | Next.js 15 · Node `26.x` |
| Install / build | `npm ci` · `npm run build` |
| Database | Supabase `oeadisqfuyhelppinaxw` (Postgres + Auth + Storage + RLS), `eu-west-1` |

The build completes in about a minute from the public GitHub commit; no source files are
re-uploaded manually. The GitHub repo is public, which is why a `git_source` deployment
works without installing the Vercel GitHub App.

## Current release — DPO Pay subscriptions in shadow mode

**Deployment:** pending explicit-SHA Vercel deploy. `SUBSCRIPTION_DPO_RELEASE.md` and
`DPO_PRODUCTION_SMOKE.md` will carry the exact commit, deployment ID and post-promotion
smoke results. Until that deployment is promoted, live production code remains the
historical Stripe/Paynow shadow release `3b811f0cc16fd202749962c1f8bb6d3c704f6b0f` /
`dpl_4w94S2ryvm6WLV3uamSydyp2zbTn`.

This release replaces the card-required Stripe Checkout trial with **DPO Pay by
Network** as the primary rail, a **14-day no-card trial**, optional tokenised monthly
renewals, and Paynow Zimbabwe as an optional customer-present fallback. Stripe is
removed from the production path and the `stripe` npm dependency is uninstalled.
Production billing stays **off**: `BILLING_ENABLED=false`, `BILLING_QA_MODE=false`,
`PAYNOW_MOCK=false`, `DPO_MOCK=false` and `DPO_LIVE_MODE=false`/absent. Nobody is
charged or locked. USD 9/29/99 per organisation/month applies everywhere; existing
orgs remain grandfathered comped. See `SUBSCRIPTION_DPO_RELEASE.md`,
`BILLING_SETUP.md` and `SUBSCRIPTION_QA_REPORT.md`.

Local verification before deployment: `npm run env:check`, `npx tsc --noEmit` and
`NODE_ENV=production npm run build` clean; `npm run audit:billing` **10/10** with a
zero-network DPO v6 mock; QA orgs/users/mock events/billing events cleaned to
`0/0/0/0`; live Supabase migration `dpo_pay_subscriptions_v1` verified. No Vercel
environment variables were added or changed. Production smoke is pending deployment.

## Previous release — Stripe/Paynow card-required trial shadow mode (superseded)

Production code was commit `3b811f0` / `3b811f0cc16fd202749962c1f8bb6d3c704f6b0f`,
deployed as `dpl_4w94S2ryvm6WLV3uamSydyp2zbTn` (`READY`, `PROMOTED`,
`timeToReady 49.1s`). It built a Stripe Checkout trial plus a trial-end Paynow switch,
but `BILLING_ENABLED=false` kept it off. Post-promotion smoke passed **17/17** and
local `npm run audit:billing` passed **10/10** with Stripe-test-compatible signed
webhooks and a Paynow mock. `SUBSCRIPTION_SHADOW_RELEASE.md` is now historical only;
the user chose DPO Pay because a Zimbabwe-registered entity cannot receive native
Stripe payouts.

## Previous release — tenant-branded financial documents, editable line items and strict module visibility

Production code is commit `fa2a960` / `fa2a960d1e35aef850a449ffac2e584508fc495c`, deployed with an
explicit Vercel `git_source` SHA as `dpl_66k3jB3Uc6fST34Esw4uSTxniTCf`. It is `READY`, `PROMOTED`
and aliased to **https://myla-construction-erp.vercel.app**. The preceding functional commit
`266c727` / `dpl_2aWWGTScXY57WN6QxGvRr1V2fgvN` introduced the release; `fa2a960` is a
header-only PDF layout fix for long tenant identities.

This release adds tenant-controlled company details and a custom logo for financial PDFs,
editable itemised lines on 16 financial/order registers, the formal two-page layout for all
financial/order documents, and strict module/resource visibility across navigation, quick
create, command palette, dashboard, reports, project 360, direct URLs and APIs. Settings is
the deliberate full-list exception. Company branding is stored in
`organizations.config.company`; **no new Supabase migration** was applied. See
`TENANT_FINANCIAL_DOCUMENTS_RELEASE.md`.

Production verification after promotion:

| Check | Result |
|---|---|
| `python3 scripts/audit.py --base https://myla-construction-erp.vercel.app` | **1290/1290 API**, 0 failures |
| `npx tsx scripts/audit-core.ts` | **22/22** |
| `AUDIT_BASE=https://myla-construction-erp.vercel.app npm run audit:finance` | **13/13 passed** |
| `AUDIT_BASE=https://myla-construction-erp.vercel.app npm run audit:features` | **16/16 passed** |
| `AUDIT_BASE=https://myla-construction-erp.vercel.app npm run audit:projects` | **8/8 passed** |
| Production tenant-branded PDF QA | **14/14** checks, 10,588 bytes, 2 pages, tenant logo, totals and MYLA footer |
| Owner/API smoke | login, meta, settings meta, overview, wallets, library, integrity, paged projects, refs, search and CSV all `200` |
| Runtime metadata | 34 modules / 49 resources · `/meta` `Cache-Control: no-store` |
| Current live integrity | `ok:true` · 619 records · 1637 refs · 0 broken refs · 0 wallet mismatches · 9 client wallets · $11,000,000 balance |
| QA cleanup | branding restored (no logo / 0% deposit), 0 QA clients, 0 QA estimates, 0 QA organisations, 0 QA Auth users |

Evidence: `PRODUCTION_AUDIT_REPORT.md`, `PRODUCTION_FINANCE_MODULE_AUDIT_REPORT.md`,
`PRODUCTION_FEATURE_AUDIT_REPORT.md`, `PRODUCTION_PROJECT_SCALE_AUDIT_REPORT.md`,
`screenshots/production-finance-quotation.pdf`,
`screenshots/production-finance-quotation-p1.png`, `screenshots/production-finance-quotation-p2.png`,
`screenshots/production-finance-module.png`, `screenshots/production-feature-library.png` and
`screenshots/production-project-*.png`.

Known limitation: strict module visibility is enforced in the application, API and server-page
layers. Database RLS `app_can_read` still checks `config.resources` but not `config.modules`;
no SQL module-gating migration was applied in this release.

The earlier row-scoped access, multi-currency and document-library release remains documented
in `RBAC_CURRENCY_LIBRARY_RELEASE.md`; its live Supabase migrations are unchanged.

## Environment variables

Nine project variables are set for `production`, `preview` and `development` (values are
never printed in this document):

| Variable | Type | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | encrypted | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sensitive (write-only) | browser-safe anon key |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive (write-only) | publishable-key fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | sensitive (write-only) | server-only admin operations |
| `SUPABASE_PROJECT_REF` | encrypted | CLI/ops reference |
| `SUPABASE_STORAGE_BUCKET` | encrypted | `buildops-documents` |
| `STORAGE_DRIVER` | encrypted | `supabase` |
| `NEXT_PUBLIC_APP_URL` | encrypted | `https://myla-construction-erp.vercel.app` |
| `AUTH_CALLBACK_BASE_URL` | encrypted | `https://myla-construction-erp.vercel.app` |

- The three `NEXT_PUBLIC_*` / service keys were created as **sensitive** (write-only)
  variables. Vercel still injected all nine into both `build.env` and the runtime
  `env`, so build-time reads and server-side Supabase calls work. The app reads these
  values server-side (`src/lib/supabase.ts`, `src/middleware.ts`); there is no browser
  Supabase client, so client-bundle inlining is not required.
- `NEXT_PUBLIC_APP_URL` and `AUTH_CALLBACK_BASE_URL` were verified against the real
  production alias — `myla-construction-erp.vercel.app` is assigned and serving.
- `TZ` was rejected by Vercel as a **reserved** environment variable name and was
  therefore omitted. No application code reads `process.env.TZ`, so this has no
  functional effect; Vercel functions use their default UTC clock.
- `.env` remains Git-ignored and is not present in the repository or the deployment
  source. The `prebuild` hook copies `.env.example` to `.env` when absent; Next.js
  gives already-set platform variables precedence over `.env` file values, which the
  production login test confirms.

## Initial production smoke tests (historical)

These checks were captured for the earlier visual / plain-language build; the current release's live verification is in **Current release** above.

| Check | Result |
|---|---|
| `GET /` | `307` redirect to the authenticated entry point |
| `GET /login` | `200`, MYLA brand, motto, sign-in form; no “Supabase is not connected” warning |
| `GET /brand/myla-logo-full.png` | `200`, `image/png`, 1782×441 RGBA |
| `GET /icon.png` | `200`, `image/png`, 64×64 RGBA |
| `POST /api/auth/login` (demo owner) | `200` `{ok:true, slug:"kestrel-ridge", role:"OWNER"}` |
| `POST /api/auth/login` (bad password) | `401` `Incorrect email or password.` |
| `GET /kestrel-ridge/dashboard` | `200`, MYLA shell, dashboard content |
| `GET /kestrel-ridge/documentation` | `200`, exact `Documentation` header, 2 inline SVG diagrams, 8 sections, business-flow language (no IT jargon), Zimbabwe terms present, 0 overflow, 0 console/page errors (verified on the live URL) |
| `GET /kestrel-ridge/wallets` | `200` |
| `GET /kestrel-ridge/reports` | `200`, header title now `Reports` |
| `GET /login` | `200`, plain-language hero: “One place for your jobs, your team and your money.” |
| `GET /kestrel-ridge/m/clients` | `200`, correct "Clients" title |
| `GET /api/kestrel-ridge/meta` | `200` (93 KB workspace metadata) |
| `GET /api/kestrel-ridge/overview` | `200` |
| `GET /api/kestrel-ridge/integrity` | `200`, `ok:true`, 616 records, 1627 refs, `brokenRefs:[]`, `walletMismatches:[]` |
| `GET /api/kestrel-ridge/wallets` | `200`, `$11,000,000` clean seed balance present |
| `GET /api/kestrel-ridge/records/clients` | `200`, 9 clients |
| `GET /api/kestrel-ridge/pdf/clients/<id>` | `200`, `application/pdf`, 1 page, `/Creator MYLA ERP`, `/Subject Built for Progress. CONSTRUCTION & INDUSTRIAL MANAGEMENT` |
| Storage QA: upload → Rev A → Rev B → list → download → delete ×2 | `201/201/200/200/200/200`, byte-identical download, `Rev B` marked latest, 0 attachments left |
| Supabase cleanup after storage QA | 0 QA attachments, 0 QA storage objects, 4 QA audit rows removed, `live_records 616` |

## Change log

| Commit | Deployment | Change |
|---|---|---|
| `8eb261a` | `dpl_xG4VW6abiEA665r5Qipu3sGirkm3` | Initial production release of the MYLA visual refinement |
| `039e619` | — | Documentation only (not deployed) |
| `3174c33` | `dpl_7F9Y6g1JMjpuwvnm9FAoK8P1rJbu` | Removed numeric record-count badges and the “N modules” label from the sidebar; nav now shows labels only |
| `1927c0f` | — | Documentation only (not deployed) |
| `5e31dd9` | `dpl_KTQ13fJnhbfW2RTteszBApaamJc4` | Added an in-app **Documentation** page to the sidebar with illustrated system/data/dashboard flows and business process diagrams |
| `874dd43` | — | Documentation only (not deployed) |
| `a6cb9c9` | `dpl_9rxRyLh9ri1mq4daYUCFhfPwMt1x` | Corrected two diagram labels from “modules” to “resources” (49 resources / 34 modules); no functional change |
| `6ce1fb2` | — | Documentation only (not deployed) |
| `1aef83b` | `dpl_C4C7kSENehVwMBFEXBNBdgLz71wB` | Rewrote Documentation as a plain-language **business flow** and applied Zimbabwe/African small-contractor terminology across the sidebar, onboarding, dashboard, reports, settings and wallets |
| `f830ea6` | — | Documentation-only closeout (not deployed) |
| `c6b39e2` | `dpl_HQ8PkC5tUEcpwbqeCBMd6ADmNXki` | Opened every project as a full detail page with an eighth **Record & files** tab, added server-backed searchable dropdowns, pushed paging/filter/search/count into Postgres, and applied additive search/reference indexes |
| `567774e` | — | Documentation-only closeout for the project-scale release (not deployed) |
| `7bc17d0` | `dpl_3xiHJ5Go5PTVEzoqbTDWdtWQW7wk` | Row-scoped staff access, Settings multi-currency conversion and a dedicated document/drawing library with automatic and custom folders, revisions and scoped files |
| `266c727` | `dpl_2aWWGTScXY57WN6QxGvRr1V2fgvN` | Tenant-branded financial PDFs, editable line items on 16 registers and strict module/resource visibility |
| `fa2a960` | `dpl_66k3jB3Uc6fST34Esw4uSTxniTCf` | Header-only fix keeping long tenant identities clear of financial PDF document numbers and dates |
| docs/QA closeout | — | Production audit reports, screenshots and exact deployment verification; documentation/evidence only, not deployed |

The sidebar change was verified on the live URL with a real Chromium session:
53 nav items, zero numeric badges, zero digits anywhere in the sidebar, no
“N modules” text, on both the desktop sidebar and the mobile drawer, with 0 page
errors. Evidence: `screenshots/production-sidebar-no-counts.png`,
`screenshots/sidebar-no-counts-desktop.png`, `screenshots/sidebar-no-counts-mobile.png`.

The plain-language release was verified against the live alias with a real Chromium
session: exact `Documentation` header and `h1`, `Documentation` present in the
sidebar (54 nav items across 9 plain-language sections), 2 accessible inline SVG
diagrams, 8 anchored sections, the six-step business flow, small-company and
Zimbabwe wording, **zero IT terms** on the page, `Reports` as the reports header,
0 horizontal overflow on desktop and mobile, 0 nested cards, 0 radius violations,
0 gradients and 0 console/page errors; `/api/kestrel-ridge/integrity` returned `200`
with `ok:true`, 616 records and 0 broken refs.
Local gates: `npx tsc --noEmit`, `npm run build`, `npm run audit:defs`,
`npm run audit:core` `10/10`, `npm run audit:browser` `28/28`,
`node scripts/design-qa.mjs` `15/15` across 55 routes,
`node scripts/onboarding-audit.mjs` `10/10` (QA orgs/users cleaned up: 0/0),
`npm run env:check`, reseed (616/49/7/34/6/4) and integrity `ok:true` / 616 records /
1627 refs / 0 broken refs / `$11,000,000` clean wallet balance.
Evidence: `screenshots/production-documentation.png`,
`screenshots/production-documentation-mobile.png`,
`screenshots/production-login-plain-language.png`, `screenshots/documentation-page.png`,
`screenshots/documentation-dark.png`, `screenshots/design-after/documentation.png`.
Wording rules: `TERMINOLOGY.md`.

## Redeploying

The project has **no Git integration installed**, so pushing to GitHub does **not**
trigger an automatic build. To publish a new commit, create a deployment against the
project with a GitHub `git_source`:

```json
{
  "name": "myla-construction-erp",
  "project": "prj_gShJxUcNTwjzIuiwdOhapx1fqskT",
  "target": "production",
  "team_id": "team_ueIKhxbPy42sX45n7gARWkWq",
  "files": null,
  "git_source": {
    "type": "github",
    "repo": "ckydoo/construction",
    "repoId": "1449142341",
    "ref": "main",
    "sha": "<exact-new-code-commit-sha>"
  }
}
```

Use the exact new code commit SHA rather than relying on the branch head. Documentation-only
commits need no redeploy because they do not change the running application.

Alternatively, install the Vercel GitHub App on the account and connect the repository
in Project Settings → Git; that enables automatic preview/production deployments. Two
early bootstrap deployments that failed before this Git-source path was established
were deleted, so the project history contains only successful production releases.

## Plain-language / regional terminology

`TERMINOLOGY.md` is the source of truth. MYLA now uses Zimbabwe / Southern African
plain language on customer-facing screens: **job** (project), **quote** (estimate),
**tender** (bid), **site query** (RFI), **variation** (change order), **delivery note**
(GRN), **snag list** (punch list), **staff & wages** (HR/payroll), **supplier**
(vendor), **plant** (equipment), **stand** (plot), **section** (module), **money
owed to you** (AR). USD and ZWG, 15% VAT, tax invoices, PAYE / NSSA, RTGS / mobile
money, `(Pvt) Ltd` and CR14 numbers are first-class. Onboarding starts at
**Very small (1–10 people)** and says a two-person workshop uses the same system as
a large contractor; **Start small** keeps only the client → quote → job → invoice →
payment chain. Other African countries can be added later through country/currency
configuration.

## Project detail & larger-data release

Commit `c6b39e2` (deployment `dpl_HQ8PkC5tUEcpwbqeCBMd6ADmNXki`) was the project-scale production build at the time. Clicking a project row, its **open full page** action, a command-palette result or a `?open=` link now opens `/{org}/projects/{id}` — never the side drawer. The full page gained an eighth **Record & files** tab with all project fields, linked modules, comments, attachments and PDF. All `ref` fields and project filters use a debounced, server-backed combobox. Register lists now page, filter, search, sort and count in Postgres; reverse links and project 360 filter at the database; and additive trigram/reference indexes were applied to Supabase. See `SCALABILITY_RELEASE.md` and `PROJECT_SCALE_AUDIT_REPORT.md`.

That build re-ran every gate: `npm run audit` **1211/1211** + **22/22** core, browser **28/28**, design **15/15** across 55 routes, onboarding **10/10** (QA orgs/users `0/0`), dedicated project QA **8/8** locally and **8/8** against the live alias, `env:check` OK, integrity `ok:true` 616 records / 1627 refs / 0 broken refs / 0 wallet mismatches, and a clean `$11,000,000` wallet balance. Production Chromium screenshots are in `screenshots/production-project-*.png`.

## Deliberate non-changes

- Supabase Auth `site_url` remains `http://localhost:3000`, the redirect allow-list is
  empty, `mailer_autoconfirm=false` and no SMTP is configured. Registration and team
  invites use the server-side Admin API with `email_confirm: true` / a temporary
  password, so no confirmation email or redirect is needed today. Hardening these
  account-level settings for public signup remains a separate, authorised-later task.
- No custom domain was added; `myla-construction-erp.vercel.app` is the Vercel-assigned
  production alias.
- No `vercel.json` or `TZ` override was added. The earlier visual,
  terminology and project-scale releases did not change auth, RLS, RBAC, validation or
  module derivation. `c6b39e2` added two additive search/reference indexes and a
  maintained `search_text` column. The earlier `7bc17d0` release intentionally changed
  staff row-scope SQL functions and RLS policies, added `document_folders` / folder keys
  and added workspace currency configuration. Existing resource IDs, module IDs, role IDs,
  status values, field keys, API paths, validation rules and module derivation logic were
  preserved. See `RBAC_CURRENCY_LIBRARY_RELEASE.md` and `supabase/migrations/`. The current financial-document release adds no database migration.
