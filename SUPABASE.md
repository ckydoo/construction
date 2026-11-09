# MYLA on Supabase — architecture, migrations & runbook

**Status of this change:** code and migrations are complete and type-checked/built. They have **not** been applied to a live Supabase project: no project URL, anon key or service-role key was supplied, and the Supabase connector is disconnected. Per your choice (`code_only`), `supabase db push`, seeding and live verification are deferred until you paste the keys or connect the app.

---

## 1. Locked decisions (no assumptions)

| Decision | Choice | What it means in the code |
|---|---|---|
| Architecture | `full_supabase` | Supabase Postgres + Auth + Storage + RLS/RPC replace the Next.js data/API layer. Next.js is UI + thin route handlers. Prisma/SQLite is **gone**. |
| Auth / RBAC | `rls_only` | Supabase Auth JWT; `auth.uid()` + Postgres RLS is the authority. Custom `Session` table, bcrypt password hashing and opaque session cookies are retired. |
| Storage | `storage_rls` | Binaries in a private Supabase Storage bucket with org/role policies. |
| Attachment metadata | `metadata_postgres` (you resolved the contradiction) | `public.attachments` in Postgres with RLS, not Prisma. |
| Migrations | `supabase_cli` | `supabase/migrations/*.sql` + `supabase/config.toml` + `supabase/seed.sql`; applied with `supabase db push`. |
| Scope | `full_rewrite` | Every API route, auth, wallets, files and data-access module rewritten in one pass. |
| Apply / verify | `code_only` | Build code + migrations now; paste keys later before any live push. |

`guard.ts` remains as a **friendly pre-flight** check (module switches, readable 403 messages); it no longer grants anything — RLS does.

---

## 2. What changed

### Removed
- `@prisma/client`, `prisma`, `bcryptjs`, `@types/bcryptjs` (from `package.json` and `next.config.mjs`).
- `prisma/schema.prisma`, `prisma/dev.db`, `scripts/seed.ts`, `scripts/snapshot.ts`, `scripts/switch-provider.mjs`.
- The local `uploads/` disk directory and `UPLOAD_ROOT`.
- `DATABASE_URL`, `SEED_DEMO`, `SESSION_SECRET` from the required environment.
- The 1 GB Render disk volume and SQLite environment in `Dockerfile` / `render.yaml`.
- Custom `Session` table, `hashPassword`/`verifyPassword`/`createSession`/`destroySession`.

### Added
- `src/lib/supabase.ts` — `supabase()` (cookie-bound, RLS-enforcing) and `supabaseAdmin()` (service-role, server-only).
- `src/middleware.ts` — refreshes the Supabase JWT so `auth.uid()` is always valid.
- `src/lib/auth.ts` — `getAuth()` resolves the Supabase user, profile, memberships and org config.
- `src/lib/fetch.ts`, `records.ts`, `queries.ts`, `access.ts`, `wallets.ts`, `views.ts`, `files.ts`, `seed-service.ts`, `seed-data.ts`.
- `scripts/seed-supabase.ts` — creates the 7 demo Auth users, org, memberships, 616 records, 6 reconciled wallets, 4 sample PDFs.
- `scripts/check-env.mjs`, `.env.example`, `ENV_KEYS.md`, `scripts/prod-start.mjs` rewritten for Supabase.
- `supabase/config.toml`, `supabase/seed.sql`, and five migrations.

### Rewritten
All 21 API route files now use the Supabase clients/RPC helpers. The React UI is unchanged — `src/lib/views.ts` maps snake_case Postgres rows back to the camelCase JSON the components already expect.

---

## 3. Migration inventory (`supabase/migrations/`)

| File | Contents |
|---|---|
| `0001_extensions.sql` | `pgcrypto`, `uuid-ossp`, shared `set_updated_at()` trigger. |
| `0002_schema.sql` | `organizations`, `profiles`, `memberships`, `invitations`, `records`, `comments`, `audit_logs`, `notifications`, `sequences`, `attachments`, `wallets`, `wallet_transactions`; indexes, FKs, uniques, `auth.users → profiles` sync trigger, `updated_at` triggers. Money is `bigint` cents. |
| `0003_rbac.sql` | **Generated** from `src/lib/catalog.ts` `ROLE_RULES` by `scripts/gen-supabase-rbac.py`: 14-role read/write/delete/capability/scoped helper functions, identity helpers (`app_org_ids`, `app_role`, `app_entity`, `app_visible_record`, `app_storage_allowed`), last-owner protection trigger, and RLS policies on all 12 tables. Regenerate with `npm run rbac:generate`. |
| `0004_storage.sql` | Private `buildops-documents` bucket (12 MiB limit) + SELECT/INSERT/UPDATE/DELETE policies on `storage.objects`. |
| `0005_functions.sql` | SECURITY DEFINER RPCs: `app_next_number`, `app_log_activity`, `app_notify`, `app_mirror_client_balance`, `app_mirror_project`, `app_wallet_topup`, `app_wallet_allocate`, `app_wallet_reverse`, `app_wallet_invariant`. The ledger, audit log, notifications and sequences have **no direct write policies** — clients can only reach them through these functions. |

`supabase/seed.sql` is intentionally empty: demo Auth users must be created through the GoTrue Admin API, so seeding is a script (`npm run db:seed`) rather than plain SQL. `supabase db reset` therefore produces a clean schema.

### RLS model
- `app_org_ids()` → all orgs the JWT user belongs to.
- `app_can_read/p_write/p_delete(p_org, p_resource)` → module enabled **and** role allowed (derived from the same `ROLE_RULES` used by the UI).
- `app_has_capability(p_org, cap)` → 16 capabilities (`wallet.topup`, `files.delete`, `users.manage`, …).
- `app_visible_record(...)` → `CLIENT_EXTERNAL` sees only its pinned client, that client's projects and records linked to them; `SUBCONTRACTOR_EXTERNAL` sees only its own contracts/submittals and their projects.
- `app_wallet_client_allowed(...)` → external users can only address their own wallet.
- Default deny: only the listed policies grant access.

One wallet per client; ledger is append-only, corrections are `REVERSAL` entries, idempotency keys are unique per org, and all money movement runs inside one RPC transaction with an advisory lock. Derived `clients.walletBalance` / `projects.fundedAmount` / `projects.remainingToFund` are mirrored by the same RPC so every module sees the same numbers.

### Storage object layout
`<org-uuid>/<record-id>/<uuid>-<safe-file-name>` — `app_storage_allowed()` parses the org and record id, resolves the `attachments` row by `stored_name`, then checks visibility + role + capability. Uploads therefore insert the metadata row first and remove it if the Storage upload is denied; deletes remove the object before the metadata row.

---

## 4. Apply it to your project (when keys are available)

```bash
cd /home/user/buildops
cp .env.example .env           # then paste the values below

# .env (server-side, never NEXT_PUBLIC_* for the service role key)
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-or-publishable-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-or-secret-key>"
SUPABASE_PROJECT_REF="<project-ref>"
SUPABASE_DB_PASSWORD="<database-password>"

npm run env:check              # never prints secret values
npx supabase login             # one-time CLI auth
npx supabase link --project-ref <project-ref>
npx supabase db push           # applies 0001 → 0005
npm run db:seed                # 7 auth users, 616 records, 6 wallets, 4 PDFs
npm run build && npm run start
```

Local stack instead of a hosted project:

```bash
npx supabase start             # needs Docker
npx supabase db reset
npm run db:seed
```

Then verify: sign in as `owner@kestrelridge.co.zw` / `Demo@1234`, check `/kestrel-ridge/wallets`, `/integrity` (0 broken refs, 0 wallet mismatches), upload + open a PDF attachment, and confirm `client@westgate.co.zw` only sees Westgate's own records.

**Nothing in this repository contains real keys.** `.env` is ignored by Git and Docker.

---

## 5. Deployment

`Dockerfile` and `render.yaml` no longer provision SQLite or a disk. Render supplies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_APP_URL` as `sync: false` (prompted) environment values. Apply migrations with `supabase db push` before the first deploy. Self-registration and team invites use the server-side Supabase Admin API with `email_confirm: true` / a temporary password, so they work with the current `mailer_autoconfirm=false`, empty SMTP and localhost `site_url` settings. That is deliberate for the MVP; enable email verification / SMTP and set the public `site_url` + redirect allow-list before exposing signup publicly.

---

## 6. Known caveats
- Next.js emits a harmless Edge Runtime warning for `@supabase/ssr`/`@supabase/supabase-js` (`process.version`) during build. Middleware compiles and runs; the warning does not affect the Node.js server routes.
- The historical `1211/1211` API and `28/28` Chromium audits were pre-Supabase SQLite results. They have been superseded by live-Supabase runs: **1211/1211 API + 22/22 derivation**, **28/28 Chromium** and **10/10 onboarding/tenancy** checks. The live API total now also includes 13 role-fixture cleanup checks enabled by the fixed team-list query; see `AUDIT_REPORT.md`, `BROWSER_AUDIT_REPORT.md` and `ONBOARDING_AUDIT_REPORT.md`.
- `npm run db:seed` and Settings → Load demo data require `SUPABASE_SERVICE_ROLE_KEY`; registration and team invites do too. Without it, the app renders a setup notice on the login screen.
- The HTTP and onboarding audit suites create throwaway role/tenant Auth users. They are not auto-deleted because removing an org's last owner needs privileged SQL. After a live run, use the Supabase SQL editor/connector to disable `memberships_protect_last_owner`, delete `qa-*` organizations/users/invitations, and re-enable the trigger; see `../QA_ONBOARDING_CLEANUP.sql` and `LIVE_MVP_STATUS.md`.
