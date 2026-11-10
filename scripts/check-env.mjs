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

const url = get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY') || get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const service = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SECRET_KEY');
if (!isSet(url)) warnings.push('NEXT_PUBLIC_SUPABASE_URL is empty — paste your project URL to connect the app.');
if (!isSet(anon)) warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is empty — paste the anon/publishable key.');
if (!isSet(service)) notes.push('SUPABASE_SERVICE_ROLE_KEY is empty — needed for registration, team invites, demo seeding and migrations.');
if (isSet(url) && !isSet(anon)) warnings.push('Supabase URL is set without a public anon/publishable key.');
if (isSet(service) && !isSet(url)) warnings.push('A Supabase service-role key is set without NEXT_PUBLIC_SUPABASE_URL.');
if (isSet(url) && !/^https?:\/\//.test(url)) errors.push('NEXT_PUBLIC_SUPABASE_URL must be a full https URL.');
if (get('STORAGE_DRIVER') && !['supabase','local','s3','r2'].includes(get('STORAGE_DRIVER')))
  warnings.push(`STORAGE_DRIVER=${get('STORAGE_DRIVER')} is not implemented; only supabase is wired.`);

const migrations = path.join(root, 'supabase', 'migrations');
if (!fs.existsSync(migrations)) errors.push('supabase/migrations is missing — the schema cannot be applied.');
else notes.push(`Supabase migrations: ${fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).length} SQL files (apply with \`npx supabase db push\`).`);

const billingOn = get('BILLING_ENABLED').toLowerCase() === 'true';
if (billingOn && get('DPO_LIVE_MODE').toLowerCase() !== 'true')
  errors.push('BILLING_ENABLED=true requires explicit DPO_LIVE_MODE=true. Keep both false until DPO merchant approval and live credentials are ready.');
if (billingOn && !isSet(get('DPO_COMPANY_TOKEN')))
  errors.push('BILLING_ENABLED=true requires a live DPO_COMPANY_TOKEN.');
if (billingOn && !(isSet(get('DPO_SERVICE_TYPE')) || isSet(get('DPO_SERVICE_TYPE_NAME'))))
  errors.push('BILLING_ENABLED=true requires DPO_SERVICE_TYPE or DPO_SERVICE_TYPE_NAME.');
if (billingOn && !isSet(get('DPO_CALLBACK_SECRET')))
  errors.push('BILLING_ENABLED=true requires DPO_CALLBACK_SECRET.');
if (billingOn && !isSet(get('DPO_PUSH_SECRET')))
  errors.push('BILLING_ENABLED=true requires DPO_PUSH_SECRET.');
if (billingOn && get('DPO_RECURRING_ENABLED').toLowerCase() !== 'true')
  warnings.push('DPO_RECURRING_ENABLED is false; renewals will require customer-present payment.');
if (billingOn && !isSet(get('PAYNOW_INTEGRATION_ID')))
  warnings.push('Optional Paynow fallback credentials are empty; DPO Pay remains the primary gateway.');

if (get('NODE_ENV') === 'production') {
  if (!get('NEXT_PUBLIC_APP_URL').startsWith('https://')) warnings.push('NEXT_PUBLIC_APP_URL should be an HTTPS URL in production.');
  if (!isSet(service)) warnings.push('Server-side actions (registration, invites, seeding) need SUPABASE_SERVICE_ROLE_KEY in production.');
}

// Count only real key/endpoint slots for optional integrations.
const groups = {
  'S3/R2 storage': ['S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_PUBLIC_BASE_URL','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL'],
  Email: ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','RESEND_API_KEY','SENDGRID_API_KEY'],
  'SMS/WhatsApp': ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER','TWILIO_MESSAGING_SERVICE_SID','WHATSAPP_BUSINESS_ACCOUNT_ID','WHATSAPP_BUSINESS_PHONE_ID','WHATSAPP_ACCESS_TOKEN'],
  Payments: ['PAYNOW_INTEGRATION_ID','PAYNOW_INTEGRATION_KEY','PAYNOW_RETURN_URL','PAYNOW_RESULT_URL','DPO_COMPANY_TOKEN','DPO_SERVICE_TYPE','DPO_SERVICE_TYPE_NAME','DPO_API_URL','DPO_PAYMENT_URL_TEMPLATE','DPO_CALLBACK_SECRET','DPO_PUSH_SECRET','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET'],
  Subscriptions: ['BILLING_ENABLED','BILLING_QA_MODE','PAYNOW_MOCK','DPO_MOCK','DPO_LIVE_MODE','DPO_RECURRING_ENABLED','BILLING_CRON_SECRET','BILLING_QA_SECRET','BILLING_QA_KEY'],
  'Maps/weather': ['GOOGLE_MAPS_API_KEY','NEXT_PUBLIC_GOOGLE_MAPS_API_KEY','OPENWEATHER_API_KEY'],
  SSO: ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','MICROSOFT_TENANT_ID'],
  Accounting: ['XERO_CLIENT_ID','XERO_CLIENT_SECRET','XERO_TENANT_ID','XERO_WEBHOOK_SIGNING_KEY','QUICKBOOKS_CLIENT_ID','QUICKBOOKS_CLIENT_SECRET','QUICKBOOKS_REALM_ID','SAGE_CLIENT_ID','SAGE_CLIENT_SECRET'],
  'Webhooks/monitoring/AI': ['INTEGRATIONS_ENCRYPTION_KEY','BUILDOPS_API_KEY','BUILDOPS_WEBHOOK_SECRET','SLACK_WEBHOOK_URL','SLACK_BOT_TOKEN','TEAMS_WEBHOOK_URL','SENTRY_DSN','NEXT_PUBLIC_SENTRY_DSN','SENTRY_AUTH_TOKEN','OPENAI_API_KEY'],
};
const configured = Object.entries(groups)
  .filter(([, keys]) => keys.some((k) => isSet(get(k))))
  .map(([name]) => name);

console.log('MYLA environment check (Supabase)');
console.log(`  .env             ${fs.existsSync(envPath) ? 'present' : 'MISSING'}`);
console.log(`  .env.example     ${fs.existsSync(examplePath) ? 'present' : 'MISSING'}`);
console.log(`  Supabase URL     ${isSet(url) ? 'configured' : 'not set'}`);
console.log(`  Anon key         ${isSet(anon) ? 'configured' : 'not set'}`);
console.log(`  Service-role key ${isSet(service) ? 'configured' : 'not set'}`);
console.log(`  Storage driver   ${get('STORAGE_DRIVER') || 'supabase'}`);
console.log(`  Live billing     ${get('BILLING_ENABLED').toLowerCase() === 'true' ? 'ENABLED' : 'disabled (shadow mode)'}`);
console.log(`  Optional integration slots configured: ${configured.length ? configured.join(', ') : 'none yet'}`);
for (const n of notes) console.log(`  note    ${n}`);
for (const w of warnings) console.log(`  WARN    ${w}`);
for (const e of errors) console.log(`  ERROR   ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} blocking issue(s). Fix them before deploying.`);
  process.exit(1);
}
console.log(warnings.length ? `\nOK with ${warnings.length} warning(s). No secret values were printed.` : '\nOK. No secret values were printed.');
