# BuildOps environment variables & API keys

**Fill in `/home/user/buildops/.env`.** It is ignored by Git and Docker, so real keys stay on your machine. The committed [`.env.example`](.env.example) is the master template — copy it with `npm run env:init` (or `cp .env.example .env`) and validate with `npm run env:check`.

> Do not paste real keys into chat or into `.env.example`. Anything named `NEXT_PUBLIC_*` is shipped to the browser. Service-role keys, secret keys, passwords and private tokens must **never** use that prefix.

---

## 1. What the app reads today

| Variable | Default in template | Where it is read | Notes |
|---|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | `prisma/schema.prisma`, Prisma CLI | Swap to a Postgres/Supabase URI to move off SQLite. Also requires `npm run db:postgres`. |
| `PORT` | `3000` | `scripts/prod-start.mjs` | Render/Docker set this too. |
| `NODE_ENV` | `development` | Next.js / Prisma | Set to `production` by the container. |
| `SEED_DEMO` | `true` | `scripts/prod-start.mjs` | Seeds 616 demo records **only when the DB is empty**. Set `false` for a clean production tenant. |
| `UPLOAD_ROOT` | empty → `<cwd>/uploads/<orgId>` | `src/lib/files.ts`, `scripts/seed.ts` | Point at a persistent volume or object storage later. |
| `AUDIT_BASE` | `http://127.0.0.1:3000` | `scripts/browser-audit.mjs` | Base URL for the Chromium suite. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | reserved | OAuth callbacks / emailed links once those are wired. |
| `SESSION_SECRET` | placeholder | `render.yaml` (generated) | **Reserved.** Sessions are currently opaque random tokens stored in the database, not signed cookies. Generate a value anyway for production: `openssl rand -hex 32`. |
| `TZ` | `Africa/Harare` | reserved | Regional scheduling/reporting. |
| `LOG_LEVEL`, `MAX_FILE_BYTES` | `info`, `12582912` | reserved | Named slots; the 12 MB upload cap is currently a constant in `src/lib/files.ts`. |

`npm run env:check` catches a missing `DATABASE_URL`, a Postgres URL with a SQLite Prisma provider, a tracked `.env`, placeholder production secrets and secret-looking values in `NEXT_PUBLIC_*` variables. It never prints key values.

---

## 2. Supabase keys

| Variable | Where to get it | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → **Project Settings → API → Project URL** | Public — safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **API → anon / public key** (legacy) | Public, protected by RLS |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **API → publishable key** (`sb_publishable_…`, newer projects) | Public, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **API → service_role key** (legacy) | **Server only** — bypasses RLS |
| `SUPABASE_SECRET_KEY` | **API → secret key** (`sb_secret_…`, newer projects) | **Server only** |
| `SUPABASE_JWT_SECRET` | **API → JWT settings** | Server only — verifying auth/webhooks |
| `SUPABASE_WEBHOOK_SECRET` | Your Supabase webhook configuration | Server only |
| `SUPABASE_PROJECT_REF`, `SUPABASE_REGION`, `SUPABASE_DB_PASSWORD` | Project settings / database setup | Server only |
| `SUPABASE_DATABASE_URL` | **Project Settings → Database → Connection string → URI** (pooled/session) | Server only |
| `SUPABASE_DIRECT_URL` | Same screen, direct/non-pooled connection on port `5432` | Server only — migrations |
| `DIRECT_URL` | Optional Prisma `directUrl` if you add it to `schema.prisma` | Server only |
| `SUPABASE_STORAGE_BUCKET` | Storage → bucket name, e.g. `buildops-documents` | Server only |

### Using Supabase Postgres as the database

1. Put the pooled URI in `.env` as `SUPABASE_DATABASE_URL`, and the direct URI in `SUPABASE_DIRECT_URL`.
2. Set `DATABASE_URL` to the same pooled URI.
3. Run:
   ```bash
   npm run db:postgres       # switches prisma/schema.prisma from sqlite to postgresql
   npx prisma generate
   npx prisma db push
   npm run build
   ```
4. Keep the direct URI for migrations against the non-pooled port. Commit the provider change if you want that database in deployment too.

### Using Supabase Auth / Storage

Those are **not wired yet**. The app currently uses Prisma-backed credentials sessions and local-disk uploads (`UPLOAD_ROOT`). Adding the keys above does not change that. Tell me which of **Postgres, Auth, Storage** you want first and I'll implement the switch, RLS policies and storage helpers.

---

## 3. Optional integration slots

These are named, grouped placeholders in `.env.example`. They are **not read by the current code** — they are there so you can paste keys once and I can wire the chosen connectors without renaming variables later.

| Group | Variables | Typical use |
|---|---|---|
| Object storage | `STORAGE_DRIVER`, `S3_*`, `R2_*` | Move drawings/PDFs off local disk to S3 / Cloudflare R2 |
| Email | `SMTP_*`, `RESEND_API_KEY`, `SENDGRID_API_KEY` | Invites, payment certificates, approval alerts |
| SMS / WhatsApp | `TWILIO_*`, `WHATSAPP_*` | OTP, site alerts, payment reminders |
| Payments | `PAYNOW_*`, `STRIPE_*`, `PAYPAL_*` | Wallet top-ups / invoices (Paynow is the ZW-friendly option) |
| Maps / weather | `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `OPENWEATHER_API_KEY` | Site maps, geocoding, weather in daily logs |
| SSO | `GOOGLE_CLIENT_*`, `MICROSOFT_*`, `AUTH_CALLBACK_BASE_URL` | Google / Microsoft sign-in |
| Accounting | `XERO_*`, `QUICKBOOKS_*`, `SAGE_*` | Sync invoices, bills, cost codes |
| Webhooks / internal API | `BUILDOPS_API_KEY`, `BUILDOPS_WEBHOOK_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY` | The **API & integrations** module, encrypted connector credentials |
| Notifications / monitoring / AI | `SLACK_*`, `TEAMS_WEBHOOK_URL`, `SENTRY_*`, `NEXT_PUBLIC_SENTRY_DSN`, `OPENAI_API_KEY` | Alerts, error tracking, document/OCR assistance |

Browser-restricted keys such as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are intentionally public, but restrict them by domain in the provider console.

---

## 4. Deployment

- **Local:** `.env` holds your keys; `.env.example` is the committed template. `npm run setup` auto-creates `.env` if missing.
- **Render / Docker:** set the same variables in the host's environment (or `render.yaml`). Host values override `.env`; `.dockerignore` excludes `.env` from the image. `render.yaml` already generates `SESSION_SECRET` and sets `DATABASE_URL`, `UPLOAD_ROOT`, `SEED_DEMO`, `NODE_ENV`.
- **Public repo:** never commit `.env`. If a key is ever pasted into `.env.example`, rotate it immediately.

See also [`DEPLOY.md`](DEPLOY.md), [`RENDER_DEPLOY.md`](RENDER_DEPLOY.md) and [`WALLETS_AND_RBAC.md`](WALLETS_AND_RBAC.md).
