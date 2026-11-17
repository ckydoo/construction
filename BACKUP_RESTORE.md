# Backup & restore — MYLA / Construction (production)

Last updated: 2026-11-17. Applies to Supabase project `oeadisqfuyhelppinaxw` ("Construction", eu-west-1).

## Status at a glance

| Capability | State |
|---|---|
| Logical data backup (public schema) created | ✅ 2026-11-17, 42 tables / 10,280 rows / 7.7 MB |
| Backup verified (hash + row count + JSONL parse) | ✅ `scripts/verify-logical-backup.mjs` — VERIFY OK |
| Backup cross-checked against live production | ✅ per-table row counts match a direct DB count taken the same hour |
| Restore drill executed (target database actually loaded) | ❌ NOT done — owner chose logical-only (no scratch project, no DDL on prod) |
| `auth.*` schema backup (users, password hashes) | ❌ Not taken (owner scope: public only). Relies on Supabase daily backup/PITR |
| Storage bucket objects | ❌ Not backed up. Relies on Supabase Storage redundancy + app-level re-upload |
| Schema DDL export (`pg_dump --schema-only`) | ❌ Not possible now — `SUPABASE_DB_PASSWORD` in .env is empty |
| Replay of repo migrations reproduces prod schema | ⚠️ Unverified — prod has 69 recorded migrations vs 24 files in `supabase/migrations/` (baseline 0001–0005 is presumably a squash; never proven on a blank DB) |
| Supabase daily backup / PITR enabled on the project | ❓ Owner to confirm in dashboard (Database → Backups); not visible via API |

**Bottom line:** we now hold a verified point-in-time *logical* snapshot of every
production table, and a guarded restore loader to replay it. We have **not**
proven an end-to-end restore. Do not describe backups as "proven" until the
runbook below is executed against a scratch project.

## The artifact (this workspace)

- Path: `backups/logical-2026-11-17T10-16-39-248Z/` (git-ignored, **contains live production data** — handle as customer PII/financial data; copy to encrypted off-box storage and delete from the sandbox when done)
- Format: one `<table>.jsonl` per table + `manifest.json` with per-table row counts, byte sizes and SHA-256 hashes
- Manifest SHA-256: `bf4fa1a2deef279e6dd3dbbf3424fc64360279ba5be15de36dde23568e5af473`
- Re-verify any time: `node scripts/verify-logical-backup.mjs backups/logical-2026-11-17T10-16-39-248Z`
- Re-create (read-only against prod): `node scripts/export-logical-backup.mjs`
- 10,280 rows is small — a scheduled weekly export is cheap and worthwhile.

Row counts at capture time (2026-11-17): records 3,933 · audit_logs 4,633 · comments 562 ·
email_outbox 81 · notifications 286 · wallet_transactions 144 · invitations 120 ·
sequences 174 · memberships 14 · organizations 6 · profiles 23 (+ 27 smaller/empty tables).

## What this does NOT back up

1. **`auth.*`** — Supabase Auth users (incl. password hashes), sessions, identities.
   Public tables reference `auth.users(id)` everywhere (`profiles.id`, `memberships.user_id`, …),
   so any restore MUST recreate auth users with the same UUIDs before reloading public data.
   The supported path is Supabase's built-in daily backup / PITR, which restores auth coherently.
2. **Storage bucket objects** (R2/S3 or Supabase Storage attachments) — the `attachments`
   table's rows are exported, the files are not. Re-sync from the bucket provider or from Supabase Storage.
3. **Extensions / cron / realtime config** — recreated by migrations + Supabase defaults.

## Restore runbook (scratch drill — needs owner go-ahead)

Prerequisites: `supabase` CLI, this repo, `.env` populated, a **scratch** Supabase project
(eu-west-1, free/pro — create via `create_project` or dashboard), and owner approval to spend
infra budget. All steps below write only to the scratch project.

1. **Create scratch project** e.g. `Construction-restore-drill` (note the ref). Never point the loader at prod — it refuses if the URL matches `.env`.
2. **Replay schema.** Baseline first, then increments, in filename order:
   `0001_extensions.sql`, `0002_schema.sql`, `0003_rbac.sql`, `0004_storage.sql`, `0005_functions.sql`, then `2026*.sql` in order.
   Apply via SQL editor or `psql $RESTORE_DB_URL -f <file>`. **Validate** afterwards:
   ```sql
   -- expected vs prod (compare to a fresh prod run):
   select table_name from information_schema.tables where table_schema='public' order by 1;  -- 42 tables
   select count(*) from information_schema.routines  where routine_schema='public';          -- functions
   select polname from pg_policy pol join pg_class rel on rel.oid=pol.polrelid order by 1;   -- RLS policies
   select indexname from pg_indexes where schemaname='public' order by 1;                    -- indexes
   select extname from pg_extension; select tgname from pg_trigger order by 1;               -- extensions, triggers
   ```
   Any diff = schema drift between repo migrations and prod. Fix the migration set (or capture prod's real DDL once `SUPABASE_DB_PASSWORD` is available: `pg_dump --schema-only`) before trusting the drill.
3. **Recreate auth users first** (same UUIDs are mandatory — public FKs depend on them):
   for each email in `profiles.jsonl`, call
   `supabase.auth.admin.createUser({ id, email, email_confirm: true, password: <random> })`
   (service role; GoTrue accepts the id from the payload), then send password-reset links to all
   users. Profiles/memberships/records then insert cleanly.
4. **Load public data** with the guarded loader (untested until this drill):
   ```bash
   RESTORE_DRY_RUN=1 RESTORE_SUPABASE_URL=https://<scratch-ref>.supabase.co \
     RESTORE_SERVICE_ROLE_KEY=<scratch-service-role-key> \
     node scripts/restore-logical-backup.mjs --dir backups/logical-<stamp>
   # then, for real:
   RESTORE_SUPABASE_URL=... RESTORE_SERVICE_ROLE_KEY=... \
     node scripts/restore-logical-backup.mjs --dir backups/logical-<stamp> --i-confirm-destructive-load
   ```
   The loader refuses non-empty targets and never upserts/deletes/DDLs. It inserts in FK-safe order in batches of 500.
5. **Verify the scratch copy**: row counts vs `manifest.json` (`node scripts/verify-logical-backup.mjs`),
   plus a login as a recreated user (reset password) and smoke: load dashboard, open a record, client list.
6. **Record results** here (pass/fail per step). If anything fails, fix forward on the scratch project and re-document.
7. **Destroy the scratch project** (`delete_project`) once signed off — or pause it to keep the evidence.
8. **Production incident path** (if this is ever a real recovery): prefer Supabase daily backup / PITR
   restore of the prod project itself (restores auth+storage coherently) — the logical path above is the
   fallback for logical corruption / partial recovery, and loses sessions & storage objects.

## Owner actions owed

1. **Copy the backup off this sandbox** to encrypted storage you control; delete from repo workspace afterwards.
2. **Confirm RPO posture in Supabase dashboard** (Database → Backups): which daily backups exist, whether PITR is on. If off, enable it — the logical export is a floor, not a ceiling.
3. **Set `SUPABASE_DB_PASSWORD` in `.env`** (from Supabase dashboard → Database → Reset database password) so a true DDL export (`pg_dump --schema-only`) becomes possible; ask me to add that step to the exporter.
4. **Storage backup**: confirm bucket (`R2`/`S3_BUCKET`/Supabase Storage) versioning or schedule a sync of the attachments bucket.
5. **Run the drill** (steps 1–7) before any "your data is safe" marketing claim — and ideally before the design-partner pilots.
6. **Retention**: keep N≥3 timestamped logical exports (weekly) + Supabase native backups; prune older ones on encrypted storage.
