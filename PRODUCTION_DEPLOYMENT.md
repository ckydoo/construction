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
| Deployment | `dpl_7F9Y6g1JMjpuwvnm9FAoK8P1rJbu` · state `READY` · `PROMOTED` |
| Source | `git@github.com:ckydoo/construction.git`, branch `main`, commit `3174c33aa43e520aff8550ab8f41c331a493d898` |
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
| `GET /kestrel-ridge/wallets` | `200` |
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

The sidebar change was verified on the live URL with a real Chromium session:
53 nav items, zero numeric badges, zero digits anywhere in the sidebar, no
“N modules” text, on both the desktop sidebar and the mobile drawer, with 0 page
errors. Evidence: `screenshots/production-sidebar-no-counts.png`,
`screenshots/sidebar-no-counts-desktop.png`, `screenshots/sidebar-no-counts-mobile.png`.

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

## Deliberate non-changes

- Supabase Auth `site_url` remains `http://localhost:3000`, the redirect allow-list is
  empty, `mailer_autoconfirm=false` and no SMTP is configured. Registration and team
  invites use the server-side Admin API with `email_confirm: true` / a temporary
  password, so no confirmation email or redirect is needed today. Hardening these
  account-level settings for public signup remains a separate, authorised-later task.
- No custom domain was added; `myla-construction-erp.vercel.app` is the Vercel-assigned
  production alias.
- No `vercel.json`, no `TZ` override and no schema/database changes were made. The
  only source change since the initial release is the sidebar label cleanup in
  `src/components/AppShell.tsx`; all APIs, RBAC, routing and business logic are untouched.
