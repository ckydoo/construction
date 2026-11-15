# Independent security review scope & backup/restore drill

Two separate work items. Both are required before Gate 5 sign-off. Neither may be closed
by the developer who built the code; an independent reviewer is required.

## A. Security review scope (independent reviewer)

### A1. Authentication & session
- Password policy (min length, breached-password check is absent — note it), hashing via
  Supabase Auth; session handling; `security_captcha` Turnstile on auth forms; rate limits
  (`rate_limit_email_sent=2`, `rate_limit_otp=30`, etc. — verify actual values on the project).
- Offline temporary-password invites: token generation (`newToken`, hashed at rest),
  expiry/one-time-use, resend rotation, cancel cleanup (removes unused auth account),
  no membership pre-acceptance, address binding. File refs: `src/lib/auth.ts`,
  `src/app/api/[org]/settings/**`, `src/app/api/auth/offline-invites/route.ts`,
  `src/lib/email.ts`, `src/lib/email-templates.ts`.
- `localStorage` usage for skip-reminder (offline invites): confirm no sensitive data stored.

### A2. Authorisation & tenancy (the critical section)
- Full role matrix — expected denies (app-level 403) AND direct PostgREST/RLS denies:
  OWNER, ADMIN, FINANCE_MANAGER, HR_MANAGER, PROJECT_MANAGER, ACCOUNTANT?, restricted/portal.
- Cross-workspace isolation: for each table touched by money (invoices, receipts,
  allocations, payments, billing_*), confirm RLS + `organization_id` scoping in every
  read/write path. Include direct Supabase client access with a low-privilege JWT.
- Receipt RPCs: only v2 wrappers executable by `service_role`; base RPCs denied;
  `SECURITY DEFINER` correct-owner; search_path pinned. Refs:
  `supabase/migrations/20261119000000_receipt_write_billing_atomic.sql`.
- Billing write context: every receipt create/allocate/reverse sets it inside the DB
  transaction; misconfigured billing rejected before RPC; `comped|trialing|active` rule.
- Idempotency: replay of the same allocate request returns same result, no duplicate audit
  or allocation; concurrent allocate vs reverse on the same invoice — at least one side must
  fail cleanly; no over-allocation beyond invoice outstanding under concurrency.
- Invites: seat-limit and billing checks authoritative at acceptance (not client counts).
- Audit log: APPROVE/ALLOCATE/CREATE/REVERSE/acceptance events attributable to user id;
  no way to forge actor via request body.
- Exports/CSV: permission checks before row generation; formula-injection escaping;
  hidden/permissioned fields never in export.
- Documents: Supabase Storage bucket `buildops-documents` — RLS/policies, signed-URL
  lifetime, path traversal, upload MIME/extension allow-list, size cap (`MAX_FILE_BYTES`).
- Email: no tokens/secrets in URLs beyond one-time links; outbox `last_error` must not leak
  credentials; billing essential mail ignores preference mute (by design) — confirm intended.
- Middleware: RESERVED slug list; `platform` now reserved; safe methods; read-only billing
  enforcement paths (`past_due`/`grace`/`switch_pending` write-block).
- Secrets: list Vercel env names only (never values) and confirm presence; rotate any
  secret ever printed in chat/screenshots. `CRON_SECRET` has `readable-secret` flag — rotate.
- Error handling: API 500s mapped to user-safe messages (409 for lock conflicts);
  stack traces never in responses.

### A3. Dependency & platform
- `npm audit` (or Snyk) clean or risk-accepted; Node 26 on Vercel; Next 15; no `dangerouslySetInnerHTML`
  with user input; CSP headers (Vercel `images.contentDispositionType=attachment` is set —
  confirm headers for XSS/clickjacking on app pages).
- Supabase: DB version 17.11; pooler config; JWT expiry 3600; refresh-token reuse detection on.

### A4. Reporting
For each finding: severity (CVSS-ish), reproduction, file:line, fix owner, retest.
Re-test after fixes. Sign the gate in LAUNCH_READINESS.md only when criticals/highs are closed.

## B. Backup & restore drill (owner + Supabase dashboard)

### B1. Inventory (record actual values)
- Supabase project `oeadisqfuyhelppinaxw` (eu-west-1): plan; **backup frequency & retention**;
  point-in-time recovery (PITR) availability; daily backup timestamp; `pg_dump` manual
  fallback (`SUPABASE_DIRECT_URL`) — verified working? storage bucket contents not covered
  by DB backups: documents live in `buildops-documents` — needs separate export.
- Vercel: deployment rollback procedure (instant rollback to previous READY deployment;
  Vercel keeps prior deployments — rollback does not restore DB state).
- Env vars: export of names (not values) stored securely offline; redeploy-from-scratch
  runbook (clone repo → set envs → deploy → smoke test).

### B2. Drill (perform once, timed, NOT in production data)
1. Pick a low-risk marker table (e.g. `email_outbox` row count or a canary row you create
   and then intentionally lose).
2. Restore path decision tree:
   a. If PITR available: create a **new** Supabase project from backup/branch (or restore
      into a branch if branching is enabled — current plan may not support it; note
      `entitlement_required` if returned and stop).
   b. If only daily backups: restore latest daily to a scratch project.
   c. Manual: `pg_dump` → `psql` into scratch DB; run migration integrity check.
3. Time it end to end; verify row integrity on 3 sample tables (documents, invoices,
   billing_subscriptions) and that RLS policies/functions/triggers exist on restore.
4. Re-register one test workspace's storage documents from bucket export.
5. Record: time, point restored to, data-loss window (RPO), restore duration (RTO),
   what broke, what manual steps were needed (e.g. re-granting, re-running migrations).

### B3. Targets (propose, then ratify)
- RPO ≤ 24h (daily backup) or ≤ 5 min if PITR enabled — record which applies.
- RTO ≤ 4h for a documented restore-to-scratch + cutover.
- Drill frequency: before launch, then every 6 months.

### B4. Storage & files gap (known)
DB backups do NOT include Storage bucket files. Export `buildops-documents` now and after
every release; store privately with the DB backup. Signed download URLs are not backed up —
they regenerate on demand.

### B5. Sign-off
Drill report attached; checklist item 11 closed; gate 3 in LAUNCH_READINESS.md signed.
