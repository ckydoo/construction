/* Logical (SQL/JSON) backup of every table in the `public` schema.
 *
 *   node scripts/export-logical-backup.mjs
 *
 * Read-only: performs SELECTs via the Supabase service role and writes the
 * result to ./backups/logical-<timestamp>/ as JSONL + a signed-by-hash manifest.
 * No DDL is executed anywhere; production is never modified.
 *
 * NOT included (by owner decision / out of scope):
 *   - auth.* schema (GoTrue users, sessions, identities)
 *   - Storage bucket objects (referenced from public.attachments)
 *   - Other schemas (cron, extensions)
 *   Restore of those relies on Supabase's own daily backups / PITR.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Captured 2026-11-17 from information_schema (42 public base tables).
const TABLES = [
  'attachments', 'audit_logs', 'billing_events', 'billing_invoices',
  'billing_plan_changes', 'billing_subscriptions', 'billing_webhook_events',
  'comments', 'document_folders', 'email_outbox', 'email_verification_tokens',
  'gateway_config', 'invitations', 'memberships', 'monitor_events',
  'notification_dedupe', 'notification_preferences', 'notifications',
  'organization_access_controls', 'organization_billing_overrides',
  'organizations', 'platform_admins', 'platform_config_audit',
  'platform_owner_actions', 'platform_runtime_state', 'platform_settings',
  'pricing_plans', 'profiles', 'quote_templates',
  'receipt_allocation_batches', 'receipt_allocation_lines',
  'receipt_creation_requests', 'receipt_invoice_baselines',
  'receipt_migration_staging', 'receipt_reversal_requests', 'records',
  'sequences', 'support_ticket_comments', 'support_tickets',
  'wallet_transactions', 'wallets', 'workspace_invites_v2',
];

const PAGE = 1000;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(process.cwd(), 'backups', `logical-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

// Supabase realtime needs WebSocket; this is a pure REST export.
globalThis.WebSocket = class {};
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const manifest = {
  kind: 'logical-backup',
  createdAt: new Date().toISOString(),
  projectRef: (process.env.SUPABASE_PROJECT_REF || 'oeadisqfuyhelppinaxw').trim(),
  supabaseUrl: url,
  schema: 'public',
  format: 'jsonl',
  tables: [],
  totals: { tables: 0, rows: 0, bytes: 0 },
};

for (const table of TABLES) {
  const file = path.join(outDir, `${table}.jsonl`);
  const out = fs.createWriteStream(file);
  let rows = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) out.write(JSON.stringify(row) + '\n');
    rows += data.length;
    if (data.length < PAGE) break;
  }
  await new Promise((resolve, reject) => { out.end((err) => (err ? reject(err) : resolve())); });
  const buf = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  manifest.tables.push({ name: table, rows, bytes: buf.length, sha256 });
  manifest.totals.rows += rows;
  manifest.totals.bytes += buf.length;
  console.log(`  ✓ ${table}: ${rows} rows, ${buf.length} bytes, sha256 ${sha256.slice(0, 16)}…`);
}

manifest.totals.tables = manifest.tables.length;
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nLogical backup written to ${outDir}`);
console.log(`  tables: ${manifest.totals.tables}, rows: ${manifest.totals.rows}, bytes: ${manifest.totals.bytes}`);
