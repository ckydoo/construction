# MYLA environment variables & API keys

**Fill in `/home/user/buildops/.env`.** It is ignored by Git and Docker, so real keys stay on your machine. The committed [`.env.example`](.env.example) is the master template — copy it with `npm run env:init` (or `cp .env.example .env`) and validate with `npm run env:check`.

> Do not paste real keys into chat or into `.env.example`. Anything named `NEXT_PUBLIC_*` is shipped to the browser. Service-role keys, secret keys, passwords and private tokens must **never** use that prefix.

---

## 1. Required for the app to run (Supabase is the server)

| Variable | Where to get it | Exposure | Read by |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | Public | `src/lib/supabase.ts`, `src/middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | API → anon/public key | Public, protected by RLS | `src/lib/supabase.ts`, `src/middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | API → publishable key (`sb_publishable_…`, newer projects) — alternative to the anon key | Public, protected by RLS | `src/lib/supabase.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | API → service_role key | **Server only — bypasses RLS** | `supabaseAdmin()` (registration, invites, seeding) |
| `SUPABASE_SECRET_KEY` | API → secret key (`sb_secret_…`) — alternative to service role | **Server only** | `supabaseAdmin()` |
| `SUPABASE_STORAGE_BUCKET` | Storage → bucket name | Server only | `src/lib/files.ts` (default `buildops-documents`) |
| `MAX_FILE_BYTES` | your policy | Server only | upload cap (default 12 MiB, also enforced by the bucket) |

Without the URL + anon key the app builds but shows a setup notice on `/login` and sign-in is disabled. Without the service-role key, registration, team invites, demo seeding and `clearData` return a clear 503 instead of failing silently.

## 2. Required for migrations / local stack (Supabase CLI, not the running app)

| Variable | Where to get it | Notes |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Project Settings → General | `npx supabase link --project-ref <ref>` |
| `SUPABASE_DB_PASSWORD` | Database setup | CLI auth for `supabase db push` |
| `SUPABASE_DATABASE_URL` | Database → Connection string → URI (pooled/session) | CLI / diagnostics |
| `SUPABASE_DIRECT_URL`, `DIRECT_URL` | Database → direct 5432 URI | migrations |
| `SUPABASE_REGION` | Project settings | informational |

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push       # applies supabase/migrations/0001 → 0005
npm run db:seed            # creates Auth users + demo data
```

`npm run env:check` never prints key values. It flags a tracked `.env`, secret-looking `NEXT_PUBLIC_*` variables, a malformed URL, missing migrations and missing keys (as warnings until you are ready to deploy).

## 3. App/runtime settings

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` in the container |
| `PORT` | `3000` | Render/Docker also set this |
| `TZ` | `Africa/Harare` | regional scheduling/reporting |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | OAuth callbacks / emailed links, set to HTTPS in production |
| `AUDIT_BASE` | `http://127.0.0.1:3000` | Chromium audit suite |
| `LOG_LEVEL` | `info` | reserved |
| `STORAGE_DRIVER` | `supabase` | only `supabase` is implemented |

## 4. Optional connector slots (not wired yet)

Sections 3–10 of `.env.example` name slots for S3/R2, email/SMTP, SMS/WhatsApp, DPO Pay by Network, Paynow Zimbabwe, PayPal, maps/weather, Google/Microsoft SSO, Xero/QuickBooks/Sage, webhooks, Slack/Teams, Sentry and OpenAI. Stripe is no longer used by subscriptions: a Zimbabwe-registered entity cannot receive native Stripe payouts. Adding a value does **not** enable a feature; tell me which connector to wire and I'll implement it.

## 5. Platform-owner billing config: secrets stay here, not in Postgres

The stage-only platform config layer (`PLATFORM_BILLING_CONFIG.md`) stores
non-secret settings, effective-dated prices, gateway readiness flags and comped
overrides in Supabase. It deliberately has **no credential columns**. Keep these
in encrypted env/Vercel only:

| Variable | Exposure | Why it is env-only |
|---|---|---|
| `DPO_COMPANY_TOKEN` | Server only | Live DPO merchant credential; never in `gateway_config`. |
| `DPO_CALLBACK_SECRET`, `DPO_PUSH_SECRET` | Server only | Webhook authenticity; never in the DB or API payloads. |
| `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` | Server only | Paynow hash/merchant credentials. |
| `CRON_SECRET` | Server only | Vercel cron bearer token. |
| `BILLING_ENABLED`, `DPO_LIVE_MODE` | Server only | Hard master switches; DB flags cannot bypass them. |

The platform API rejects secret-like field names and refuses to enable billing
or DPO live mode unless these env switches/credentials are present. The billing
runtime still reads code constants/env; the DB config is staged desired state
only.

**Removed with the Supabase rewrite:** `DATABASE_URL`, `SEED_DEMO`, `UPLOAD_ROOT`, `SESSION_SECRET`. There is no local SQLite database, no disk upload root and no custom session table. Supabase Auth owns sessions; Postgres owns all data; Supabase Storage owns binaries.
