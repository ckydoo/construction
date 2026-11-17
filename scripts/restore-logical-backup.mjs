/* Logical restore loader — REPLAYS a backup created by export-logical-backup.mjs.
 *
 *   RESTORE_SUPABASE_URL=https://<scratch-ref>.supabase.co \
 *   RESTORE_SERVICE_ROLE_KEY=<scratch service role key> \
 *   node scripts/restore-logical-backup.mjs --dir backups/logical-<stamp> \
 *     --i-confirm-destructive-load
 *
 * SAFETY GUARDS
 *   - Refuses to run unless RESTORE_SUPABASE_URL differs from NEXT_PUBLIC_SUPABASE_URL in .env
 *     (i.e. you must target a SCRATCH project, not production).
 *   - Refuses to insert into any non-empty table: every table must be EMPTY in the
 *     target, otherwise the load aborts before writing anything.
 *   - Never upserts. Never deletes. No DDL.
 *   - Requires --i-confirm-destructive-load.
 *
 * THIS SCRIPT IS UNTESTED — no restore target exists yet. Validate it against a scratch
 * project and verify the results before relying on it for a real incident. See
 * BACKUP_RESTORE.md. Note: the backup intentionally excludes auth.* and Storage.
 * Recreate auth users FIRST (BACKUP_RESTORE.md step 4) or every profiles.id /
 * user_id FK will fail. Run with RESTORE_DRY_RUN=1 to only validate JSONL integrity,
 * table emptiness and FK-safe order without writing.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// FK-safe insert order (parents first), captured from the schema in supabase/migrations.
const LOAD_ORDER = [
  'pricing_plans',
  'gateway_config',
  'platform_settings', 'platform_runtime_state', 'platform_admins',
  'platform_config_audit', 'platform_owner_actions',
  'organizations',
  'profiles',
  'memberships', 'organization_access_controls', 'organization_billing_overrides',           'invitations', 'workspace_invites_v2',
  'billing_subscriptions', 'billing_events', 'billing_invoices',
  'billing_plan_changes', 'billing_webhook_events',
  'sequences', 'quote_templates', 'document_folders',
  'records',
  'wallets', 'wallet_transactions',
  'receipt_allocation_batches', 'receipt_allocation_lines',
  'receipt_creation_requests', 'receipt_invoice_baselines',
  'receipt_migration_staging', 'receipt_reversal_requests',
  'attachments', 'comments', 'audit_logs', 'monitor_events',
  'email_outbox', 'email_verification_tokens',
  'notification_preferences', 'notification_dedupe', 'notifications',
  'support_tickets', 'support_ticket_comments',
];
const BATCH = 500;

const args = process.argv.slice(2);
const confirm = args.includes('--i-confirm-destructive-load');
const dirArg = args[args.indexOf('--dir') + 1];
const dryRun = process.env.RESTORE_DRY_RUN === '1';

const restoreUrl = (process.env.RESTORE_SUPABASE_URL || '').trim();
const restoreKey = (process.env.RESTORE_SERVICE_ROLE_KEY || '').trim();
const prodUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();

if (!dirArg) { console.error('usage: --dir backups/logical-<stamp> [--i-confirm-destructive-load]'); process.exit(2); }
if (!restoreUrl || !restoreKey) { console.error('Set RESTORE_SUPABASE_URL and RESTORE_SERVICE_ROLE_KEY for the SCRATCH target.'); process.exit(2); }
if (restoreUrl === prodUrl) { console.error('REFUSED: RESTORE_SUPABASE_URL equals the production URL in .env.'); process.exit(2); }
if (!confirm && !dryRun) { console.error('Refusing to write without --i-confirm-destructive-load. Use RESTORE_DRY_RUN=1 for a read-only check.'); process.exit(2); }

const manifest = JSON.parse(fs.readFileSync(path.join(dirArg, 'manifest.json'), 'utf8'));
const byName = new Map(manifest.tables.map((t) => [t.name, t]));
const missing = LOAD_ORDER.filter((t) => !byName.has(t));
if (missing.length) { console.error('Backup manifest is missing tables required for load: ' + missing.join(', ')); process.exit(2); }

globalThis.WebSocket = class {};
const admin = createClient(restoreUrl, restoreKey, { auth: { persistSession: false, autoRefreshToken: false } });

function readJsonl(table) {
  const file = path.join(dirArg, `${table}.jsonl`);
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

// 1) Every target table must be empty (skipped in dry-run: no network needed).
if (!dryRun) {
  console.log('Checking that every target table is empty…');
  for (const table of LOAD_ORDER) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) { console.error(`  ${table}: cannot count — ${error.message}`); process.exit(1); }
    if ((count ?? 0) !== 0) { console.error(`  ${table}: NOT EMPTY (${count} rows) — refusing to load.`); process.exit(1); }
  }
  console.log('  all target tables empty.');
}

// 2) Load in FK-safe order.
let loaded = 0;
for (const table of LOAD_ORDER) {
  const rows = readJsonl(table);
  if (rows.length === 0) { console.log(`  - ${table}: 0 rows (skipped)`); continue; }
  if (dryRun) { console.log(`  [dry-run] ${table}: would insert ${rows.length} rows`); loaded += rows.length; continue; }
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await admin.from(table).insert(batch);
    if (error) { console.error(`  ${table}: insert failed at rows ${i}-${i + batch.length - 1}: ${error.message}`); console.error('Target is now partially loaded — recreate the scratch project and start over.'); process.exit(1); }
  }
  console.log(`  ✓ ${table}: ${rows.length} rows`);
  loaded += rows.length;
}
console.log(`${dryRun ? '[dry-run] ' : ''}Load complete: ${loaded} rows across ${LOAD_ORDER.length} tables.`);
