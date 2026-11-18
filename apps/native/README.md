# MYLA Everyday — native Android preview

A React Native / Expo app, **not a WebView**. Uses the existing MYLA Supabase accounts and org APIs. Online only; no offline writes or sync queue.

## Implemented

- SecureStore-backed sign-in/session restore; workspace selection and sign-out.
- Phone tabs and wide-tablet side navigation; role/module-aware sections.
- Search/paginate jobs, quotations, invoices, clients, tasks and payments.
- Create clients/jobs, and guided draft quotations/invoices; update job/task progress.
- Record an already-received payment against an issued invoice (not a money transfer).
- Native camera/library photo attachments and file/PDF sharing.
- Billing read-only/access UI; disabled tax is hidden; advanced reports open on the website.

Account onboarding, password recovery, temporary-password changes, issuing documents, conversions, advanced editing and analytics remain website workflows. Browser-required verification is not bypassed. Production completeness is not claimed.

## Status / verification

2026-11-18: native TypeScript, core tests and Android Metro/Hermes export passed. SDK54 bundled dependency check passed **offline** (online check failed). Root Next.js TypeScript/build and mobile-workspace/simple-form/tax regression scripts passed.

**No APK has been built, uploaded or tested on a real device. No backend deployment was performed for this native implementation.** `eas whoami` reports `Not logged in`; there is no linked Expo project. Android export only verifies bundling, not Gradle compilation or runtime behaviour. Public Supabase configuration was not available for authenticated tests.

`npm audit` after updating EAS CLI and compatible fixes: 50 findings (1 low, 13 moderate, 36 high, zero critical). Many are build-tool dependencies; they have not been individually triaged. Do not treat this as production security clearance. SDK54 is pinned for this preview; review upgrading to a current Expo SDK before release rather than running `npm audit fix --force` across incompatible SDK versions.

## Local setup

From `apps/native`:

```sh
npm ci
cp .env.example .env
# Fill public API origin, Supabase URL and anon/publishable key.
npm test
npm run typecheck
npm run export:android
npm start
```

Only public config belongs in EXPO_PUBLIC variables. Never put service-role keys, passwords or Expo access tokens in them. Use an HTTPS API origin with no path. Keep `.env` out of Git.

## Backend prerequisite

Deploy and verify the accompanying `src/lib/bearer-auth.ts`, Supabase/auth/middleware changes, and `/api/auth/mobile-session` endpoint with the full tested web application before connecting the APK. The client passes Supabase user JWTs, not privileged API keys. Explicit malformed/invalid Authorization credentials must not fall back to web cookies. Org membership, RLS, billing and maintenance checks remain server-side. Existing cookie web sessions are retained.

Use a staging workspace first. Test invalid/expired tokens, valid cookie plus invalid bearer, non-member orgs, cross-tenant references/files, restricted staff/portal scope, read-only billing and maintenance. Unit tests do not substitute for these live checks.

## Automated GitHub pipeline

See [PIPELINE.md](./PIPELINE.md) for the manually triggered **Build Android preview** workflow, one-time GitHub environment setup, signing credentials and installation links. The workflow uses GitHub environment variables as its public build configuration source; the local CLI instructions below are an alternative. No cloud build has been submitted.

## EAS internal APK distribution

On a trusted machine with access to Expo, using the intended account:

```sh
cd apps/native
npx eas login
npx eas whoami
npx eas init
```

The dynamic config reads `EXPO_OWNER` and `EXPO_PUBLIC_EAS_PROJECT_ID`; if `eas init` cannot edit it, copy the returned project UUID into local configuration. Do not invent a project ID. The Android package is `zw.co.myla.everyday`; confirm ownership before provisioning signing credentials.

In the project's **preview** EAS environment configure:

- `EXPO_PUBLIC_API_URL` (deployed backend)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_OWNER`
- `EXPO_PUBLIC_EAS_PROJECT_ID`

Make the public build variables available to EAS configuration resolution and JS bundling. Then:

```sh
npm run build:preview
```

The preview profile produces an internal-distribution **APK**, not an AAB. After EAS reports success, open its install link on an Android phone/tablet, allow installation from that source, and install. EAS hosts the link; no link exists until a successful cloud build. For this pinned SDK, prefer the standalone APK to assuming the latest Expo Go supports it. No EAS Update/OTA channel is configured.

## Device acceptance checklist (not yet executed)

- Owner, staff and portal accounts: log in/out, reopen, token refresh and switch workspaces without stale data.
- Small Android phone/tablet, large font, keyboard, rotation and Android Back.
- Enabled vs disabled modules; read-only and locked billing; maintenance.
- Search/pagination/reference pickers and denied/cross-tenant records.
- Draft quotation markup and invoice totals; tax disabled vs enabled; server validation errors.
- Save interruption: refresh before recreating records; drafts are not generally idempotent.
- Payment recording in a test org: duplicate requests, lost confirmation, partial/full balances and currencies. The existing receipts migration/RPC must be deployed. Receipt keys persist for identical user/org/payload retries; a retry can still return an already-settled validation error. Refresh the invoice before changing details. No live payments were recorded during development.
- Camera/photo permission denial, upload failure, 12 MB limit, PDF/file sharing and cache cleanup.
- Airplane mode produces errors, never a success/offline-sync promise.

Do not publish a production AAB until dependency review, native compilation and authenticated device checks are complete.
