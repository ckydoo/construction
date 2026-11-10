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
| Deployment | `dpl_C4C7kSENehVwMBFEXBNBdgLz71wB` · state `READY` · `PROMOTED` |
| Source | `git@github.com:ckydoo/construction.git`, branch `main`, commit `1aef83bf09238f021a0b29bdb602cc19ff90c5c4` |
| Framework / runtime | Next.js 15 · Node `26.x` |
| Install / build | `npm ci` · `npm run build` |
| Database | Supabase `oeadisqfuyhelppinaxw` (Postgres + Auth + Storage + RLS), `eu-west-1` |

The build completes in about a minute from the public GitHub commit; no source files are
re-uploaded manually. The GitHub repo is public, which is why a `git_source` deployment
works without installing the Vercel GitHub App.

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

## Production smoke tests (against the live URL)

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
    "ref": "main"
  }
}
```

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

## Deliberate non-changes

- Supabase Auth `site_url` remains `http://localhost:3000`, the redirect allow-list is
  empty, `mailer_autoconfirm=false` and no SMTP is configured. Registration and team
  invites use the server-side Admin API with `email_confirm: true` / a temporary
  password, so no confirmation email or redirect is needed today. Hardening these
  account-level settings for public signup remains a separate, authorised-later task.
- No custom domain was added; `myla-construction-erp.vercel.app` is the Vercel-assigned
  production alias.
- No `vercel.json`, no `TZ` override and no schema/database changes were made. Source
  changes since the initial release are the sidebar label cleanup, the new
  documentation route/link, and a display-text-only plain-language/terminology pass.
  **Resource IDs, module IDs, role IDs, status values, field keys, API paths, SQL,
  RLS policies, the role matrix, validation rules and module derivation logic are
  unchanged** — see `TERMINOLOGY.md`. The documentation page is read-only and uses no
  new dependencies or external assets.
