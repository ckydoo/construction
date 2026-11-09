/* Validate the local environment without printing any secret values.
 * Run with `npm run env:check`. Exits 1 on a blocking misconfiguration. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = value;
  }
  return out;
}

const fileEnv = parseEnv(envPath);
const env = { ...fileEnv, ...process.env };
const get = (k) => (env[k] ?? '').trim();
const isSet = (v) => Boolean(v) && !/^(replace|your|paste|changeme|change-me|example|todo|xxx|<)/i.test(v);
const errors = [];
const warnings = [];
const notes = [];

if (!fs.existsSync(envPath)) errors.push('.env is missing — run `npm run env:init` or `cp .env.example .env`.');
if (!fs.existsSync(examplePath)) errors.push('.env.example is missing — the template must stay in the repo.');

if (!isSet(get('DATABASE_URL'))) errors.push('DATABASE_URL is required (Prisma reads it).');

// Never commit the real env file.
const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: root, stdio: 'ignore' });
if (tracked.status === 0) errors.push('.env is tracked by Git — run `git rm --cached .env` and keep real keys out of the repo.');

// Public variables must not carry private material.
const dangerousPublic = Object.keys(env).filter((k) =>
  k.startsWith('NEXT_PUBLIC_') &&
  /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|ACCESS_KEY|SECRET_KEY/i.test(k) &&
  isSet(get(k))
);
if (dangerousPublic.length) errors.push(`Secret-looking values in browser-exposed variables: ${dangerousPublic.join(', ')}`);

if (get('NODE_ENV') === 'production') {
  if (!isSet(get('SESSION_SECRET'))) warnings.push('SESSION_SECRET is still a placeholder; generate one with `openssl rand -hex 32`.');
  if (get('SEED_DEMO') === 'true') warnings.push('SEED_DEMO=true in production will seed the demo organisation on an empty database.');
  if (!get('NEXT_PUBLIC_APP_URL').startsWith('https://')) warnings.push('NEXT_PUBLIC_APP_URL should be an HTTPS URL in production.');
}

// Postgres URL requires the matching Prisma provider.
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const schema = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
const provider = (schema.match(/provider\s*=\s*"(\w+)"/) || [])[1] || 'unknown';
const db = get('DATABASE_URL');
if (/^postgresql:\/\//i.test(db) && provider === 'sqlite') {
  errors.push('DATABASE_URL is PostgreSQL but schema.prisma still uses sqlite — run `npm run db:postgres`, then regenerate and push.');
}
if (/^file:/i.test(db) && provider === 'postgresql') {
  errors.push('DATABASE_URL is SQLite but schema.prisma uses postgresql — restore the sqlite provider or set a Postgres URL.');
}

if (isSet(get('SUPABASE_DATABASE_URL')) && /^file:/i.test(db)) {
  notes.push('A Supabase database URL is present but not active; set DATABASE_URL to it after `npm run db:postgres`.');
}
if (isSet(get('NEXT_PUBLIC_SUPABASE_URL')) && !isSet(get('NEXT_PUBLIC_SUPABASE_ANON_KEY')) && !isSet(get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))) {
  warnings.push('Supabase URL is set without a public anon/publishable key.');
}
if (isSet(get('SUPABASE_SERVICE_ROLE_KEY')) && !isSet(get('NEXT_PUBLIC_SUPABASE_URL'))) {
  warnings.push('A Supabase service-role key is set without NEXT_PUBLIC_SUPABASE_URL.');
}

// Count only real key/endpoint slots, not harmless defaults such as
// STORAGE_DRIVER=local or SMTP_PORT=587.
const groups = {
  Supabase: ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_JWT_SECRET','SUPABASE_WEBHOOK_SECRET','SUPABASE_PROJECT_REF','SUPABASE_REGION','SUPABASE_DB_PASSWORD','SUPABASE_DATABASE_URL','SUPABASE_DIRECT_URL','DIRECT_URL'],
  'S3/R2 storage': ['S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_PUBLIC_BASE_URL','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL'],
  Email: ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','RESEND_API_KEY','SENDGRID_API_KEY'],
  'SMS/WhatsApp': ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER','TWILIO_MESSAGING_SERVICE_SID','WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_BUSINESS_PHONE_ID','WHATSAPP_ACCESS_TOKEN'],
  Payments: ['PAYNOW_INTEGRATION_ID','PAYNOW_INTEGRATION_KEY','PAYNOW_RETURN_URL','PAYNOW_RESULT_URL','STRIPE_SECRET_KEY','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY','STRIPE_WEBHOOK_SECRET','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET'],
  'Maps/weather': ['GOOGLE_MAPS_API_KEY','NEXT_PUBLIC_GOOGLE_MAPS_API_KEY','OPENWEATHER_API_KEY'],
  SSO: ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','MICROSOFT_TENANT_ID'],
  Accounting: ['XERO_CLIENT_ID','XERO_CLIENT_SECRET','XERO_TENANT_ID','XERO_WEBHOOK_SIGNING_KEY','QUICKBOOKS_CLIENT_ID','QUICKBOOKS_CLIENT_SECRET','QUICKBOOKS_REALM_ID','SAGE_CLIENT_ID','SAGE_CLIENT_SECRET'],
  'Webhooks/monitoring/AI': ['INTEGRATIONS_ENCRYPTION_KEY','BUILDOPS_API_KEY','BUILDOPS_WEBHOOK_SECRET','SLACK_WEBHOOK_URL','SLACK_BOT_TOKEN','TEAMS_WEBHOOK_URL','SENTRY_DSN','NEXT_PUBLIC_SENTRY_DSN','SENTRY_AUTH_TOKEN','OPENAI_API_KEY'],
};
const configured = Object.entries(groups)
  .filter(([, keys]) => keys.some((k) => isSet(get(k))))
  .map(([name]) => name);

console.log('BuildOps environment check');
console.log(`  .env           ${fs.existsSync(envPath) ? 'present' : 'MISSING'}`);
console.log(`  .env.example   ${fs.existsSync(examplePath) ? 'present' : 'MISSING'}`);
console.log(`  DATABASE_URL   ${db ? (db.startsWith('file:') ? 'SQLite file' : 'external database') : 'MISSING'}`);
console.log(`  Prisma provider ${provider}`);
console.log(`  Integration slots configured: ${configured.length ? configured.join(', ') : 'none yet'}`);
for (const n of notes) console.log(`  note    ${n}`);
for (const w of warnings) console.log(`  WARN    ${w}`);
for (const e of errors) console.log(`  ERROR   ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} blocking issue(s). Fix them before deploying.`);
  process.exit(1);
}
console.log(warnings.length ? `\nOK with ${warnings.length} warning(s). No secret values were printed.` : '\nOK. No secret values were printed.');
