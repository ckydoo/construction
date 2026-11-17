/* Verify a logical backup directory against its manifest.
 *
 *   node scripts/verify-logical-backup.mjs backups/logical-<stamp>
 *
 * Read-only. Re-hashes every file, re-parses every JSONL line, and checks
 * row counts. Exits non-zero on any mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/verify-logical-backup.mjs <backup-dir>'); process.exit(2); }

const manifestPath = path.join(dir, 'manifest.json');
if (!fs.existsSync(manifestPath)) { console.error(`missing ${manifestPath}`); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let ok = true;
let totalRows = 0;
const REQUIRED_TABLES = [
  'organizations', 'memberships', 'profiles', 'records', 'sequences', 'wallets',
  'wallet_transactions', 'billing_subscriptions', 'pricing_plans',
];
const present = new Set(manifest.tables.map((t) => t.name));
for (const required of REQUIRED_TABLES) {
  if (!present.has(required)) { console.error(`MISSING table in manifest: ${required}`); ok = false; }
}

for (const t of manifest.tables) {
  const file = path.join(dir, `${t.name}.jsonl`);
  if (!fs.existsSync(file)) { console.error(`MISSING file: ${file}`); ok = false; continue; }
  const buf = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha256 !== t.sha256) { console.error(`HASH MISMATCH: ${t.name} (got ${sha256})`); ok = false; continue; }
  const text = buf.toString('utf8');
  let rows = 0;
  if (text.trim().length > 0) {
    for (const line of text.split('\n')) {
      if (!line) continue;
      try { JSON.parse(line); rows += 1; } catch { console.error(`JSON PARSE FAIL: ${t.name}`); ok = false; break; }
    }
  }
  if (rows !== t.rows) { console.error(`ROW COUNT MISMATCH: ${t.name} manifest=${t.rows} actual=${rows}`); ok = false; continue; }
  totalRows += rows;
}

console.log(`backup: ${dir}`);
console.log(`  tables: ${manifest.tables.length}, rows verified: ${totalRows}, bytes: ${manifest.totals.bytes}`);
if (!ok) { console.error('VERIFY FAILED'); process.exit(1); }
console.log('VERIFY OK — every file hash, row count and JSONL line matches the manifest.');
