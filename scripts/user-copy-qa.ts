/* Static + runtime QA for plain-language user copy.
 *
 * Technical diagnostics remain in API responses, QA scripts and engineering
 * docs. This audit checks that none of them leak into user-facing screens,
 * error toasts, inline alerts or the billing page.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, request } from 'playwright';
import { DEFAULT_USER_ERROR, userMessage } from '../src/lib/user-message';

const root = path.resolve(__dirname, '..');
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
const ok = async (name: string, fn: () => void | string | Promise<void | string>) => {
  try {
    const detail = await fn();
    pass++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    console.error(`FAIL  ${name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const BANNED_UI = [
  /Shadow mode/i,
  /nobody is charged or locked/i,
  /primary subscription rail/i,
  /DPO Pay code/i,
  /webhooks?/i,
  /tokenisation|tokenized/i,
  /environment keys/i,
  /callback secrets/i,
  /VAT\/tax decision/i,
  /Zimbabwe payout route/i,
  /Stripe was removed/i,
  /grandfathered/i,
  />\s*comped\s*</i,
  /rolled back/i,
  /Paynow primary/i,
  /DPO fallback configured/i,
  /Saved DPO payment token/i,
  /Recurring DPO fallback/i,
  /hash-verified|poll-confirmed|idempotent|verifyToken/i,
  /BILLING_ENABLED|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|npx supabase db push|supabase db push/i,
  /\.env\b/i,
  /Supabase is not connected yet/i,
  /\bUnauthorized\b/i,
  /\bForbidden\b/i,
  /Invalid request/i,
  /Unknown action|Unknown module|Unknown resource/i,
  /Request failed/i,
  /Internal Server Error/i,
  /status code/i,
  /\b(?:e|err|error)\??\.message\b/,
  /throw new Error\(b\.error\)/,
  /description:\s*r\.message|description:\s*result\.message/,
];

async function main() {
  await ok('no technical error or billing-internals copy remains in user-facing screens', () => {
  const files = walk(path.join(root, 'src')).filter(f => f.endsWith('.tsx'));
  const offenders: string[] = [];
  for (const file of files) {
    const source = withoutComments(fs.readFileSync(file, 'utf8'));
    for (const pattern of BANNED_UI) {
      if (pattern.test(source)) offenders.push(`${path.relative(root, file)} :: ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], `technical copy found:\n${offenders.join('\n')}`);
  return `${files.length} screen files checked`;
});

await ok('API errors are sanitised before they reach the UI', () => {
  const client = read('src/lib/client.ts');
  assert.match(client, /import \{ userMessage \} from '\.\/user-message'/);
  assert.match(client, /new Error\(userMessage\(\{ message: raw, status: res\.status \}\)\)/);
  assert.match(client, /err\.technicalMessage = raw/);
  const hosts = read('src/components/Providers.tsx');
  assert.match(hosts, /t\.tone === 'error' \? userMessage\(t\.description\) : t\.description/);
  return 'client boundary + error toast guard';
});

await ok('billing page uses plain-language status and payment copy', () => {
  const billing = read('src/app/[org]/billing/page.tsx');
  for (const needle of [
    'Billing is not active yet',
    'You can keep using this workspace. No payment is needed right now.',
    'Payment needed to keep editing',
    'Editing is paused while payment is overdue',
    'Your 7-day free trial is active',
    'Plan changes open after your free trial',
    'Continue to workspace',
    'Pay now',
    'USD 6 / 14 / 26',
    'Upgrade to ',
    'Cancel change',
    'No payment required',
    'Payment options',
    'Your billing history',
    'Your data stays safe if a payment is missed.',
    'Pay with Paynow',
    'Pay with DPO Pay',
  ]) assert.ok(billing.includes(needle), `billing page missing ${needle}`);
  assert.doesNotMatch(billing, /Shadow mode|primary subscription rail|webhooks|tokenisation|Stripe|payout|grandfathered|Paynow primary|DPO fallback configured|Saved DPO payment token|BILLING_ENABLED|callback secrets|environment keys/);
  return 'internal gateway/readiness detail removed';
});

await ok('sign-in setup notice no longer exposes developer instructions', () => {
  const auth = read('src/components/AuthScreen.tsx');
  assert.match(auth, /Sign-in is temporarily unavailable/);
  assert.match(auth, /Please try again shortly\. If you need access now, contact your workspace administrator\./);
  assert.doesNotMatch(auth, /NEXT_PUBLIC_|SUPABASE_|\.env|supabase db push/);
  return 'plain-language notice only';
});

await ok('userMessage keeps helpful messages and hides technical ones', () => {
  assert.equal(userMessage('Incorrect email or password.'), 'Incorrect email or password.');
  assert.equal(userMessage('A paid MYLA subscription is required. Your data has not been deleted.'), 'A paid MYLA subscription is required. Your data has not been deleted.');
  assert.equal(userMessage('This module is not enabled for your workspace'), 'This module is not enabled for your workspace');
  assert.equal(userMessage('Could not save template'), 'Could not save template');
  assert.equal(userMessage('We couldn’t upload that file. Please try again.'), 'We couldn’t upload that file. Please try again.');
  assert.equal(userMessage('Supabase RLS policy 42501: BILLING_ENABLED=true requires NEXT_PUBLIC_SUPABASE_ANON_KEY'), DEFAULT_USER_ERROR);
  assert.equal(userMessage('Billing is in shadow mode. Add live Paynow credentials and set BILLING_ENABLED=true to enable checkout.', 'We couldn’t update your billing details. Please try again.'), 'We couldn’t update your billing details. Please try again.');
  assert.equal(userMessage({ message: 'Unauthorized', status: 401 }), 'Your session has ended. Please sign in again.');
  assert.equal(userMessage({ message: 'Not found', status: 404 }), 'We couldn’t find that item. Refresh and try again.');
  assert.equal(userMessage({ message: 'Request failed (500)', status: 500 }), DEFAULT_USER_ERROR);
  assert.equal(userMessage('Validation failed', 'Please check the highlighted fields and try again.'), 'Please check the highlighted fields and try again.');
  return '11 message mappings';
});

await ok('deployed billing screen shows only plain-language copy', async () => {
  const api = await request.newContext({ baseURL: BASE });
  const browser = await chromium.launch({ headless: true });
  try {
    const login = await api.post('/api/auth/login', { data: { email: 'owner@kestrelridge.co.zw', password: 'Demo@1234' } });
    assert.equal(login.status(), 200, `login returned ${login.status()}`);
    const state = await api.storageState();
    const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/kestrel-ridge/billing`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Billing & subscription' }).waitFor({ timeout: 20000 });
    await page.getByText('Payment options').waitFor({ timeout: 20000 });
    const text = await page.locator('body').innerText();
    for (const pattern of BANNED_UI) assert.doesNotMatch(text, pattern, `technical copy visible: ${pattern}`);
    for (const needle of [
      'USD 6 / 14 / 26',
      'Payment options',
      'Your billing history',
      'Prices exclude VAT/tax. Your data stays safe if a payment is missed.',
    ]) assert.ok(text.includes(needle), `plain-language copy missing: ${needle}`);
    assert.ok(
      text.includes('Billing is not active yet') || text.includes('Your 7-day free trial is active') || text.includes('Current period ends'),
      'billing status copy missing',
    );
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    await ctx.close();
    return `${BASE} · plain-language billing page · 0 browser errors`;
  } finally {
    await browser.close();
    await api.dispose();
  }
});

  console.log(`\nUser-copy QA: ${pass}/6 checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
