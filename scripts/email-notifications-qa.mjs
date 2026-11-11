#!/usr/bin/env node
/* Static + runtime QA for email verification, critical-only transactional
 * email and quiet in-app notifications. Read-only at runtime: it never changes
 * preference switches, creates records or sends a live email. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || 'PASS' });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.error(`FAIL  ${name} — ${e.message}`);
  }
}

await check('remote-aligned migrations create the outbox, tokens, preferences and dedupe tables', () => {
  const v1 = read('supabase/migrations/20261111204130_email_notifications_v1.sql');
  const v2 = read('supabase/migrations/20261111205938_email_notifications_v2.sql');
  for (const needle of [
    'create table if not exists public.email_verification_tokens',
    'create table if not exists public.email_outbox',
    'create table if not exists public.notification_preferences',
    'create table if not exists public.notification_dedupe',
    'dedupe_key          text not null unique',
    'notification_preferences_select',
    'grant select, insert, update, delete on public.email_outbox to service_role',
  ]) assert.ok(v1.includes(needle), `v1 missing ${needle}`);
  for (const needle of [
    'in_app_approvals boolean not null default true',
    'in_app_tasks     boolean not null default true',
    'in_app_support   boolean not null default true',
    'in_app_digest    boolean not null default true',
    "alter column digest_frequency set default 'off'",
    'alter column mute_all set default true',
    'notification_preferences_in_app_digest_idx',
  ]) assert.ok(v2.includes(needle), `v2 missing ${needle}`);
  return '4 tables · owner policies · quiet v2 defaults';
});

await check('every new account is verified before entering a workspace', () => {
  const auth = read('src/lib/auth.ts');
  const register = read('src/app/api/auth/register/route.ts');
  const login = read('src/app/api/auth/login/route.ts');
  const screen = read('src/components/AuthScreen.tsx');
  assert.match(auth, /if \(!u\.email_confirmed_at\) return null/);
  assert.match(register, /email_confirm: false/);
  assert.match(register, /verificationRequired: true/);
  assert.match(register, /auth\.admin\.deleteUser\(createdUserId\)/);
  assert.match(login, /EMAIL_NOT_VERIFIED/);
  assert.match(login, /await signOut\(\)/);
  assert.match(screen, /r\.verificationRequired/);
  assert.match(screen, /Check your email/);
  const src = ['src/lib/auth.ts','src/app/api/auth/register/route.ts','src/app/api/auth/login/route.ts','src/components/AuthScreen.tsx','src/app/api/[org]/settings/route.ts'].map(read).join('\n');
  assert.doesNotMatch(src, /Welcome@123/, 'shared temporary password must be gone');
  assert.doesNotMatch(read('src/app/api/auth/register/route.ts'), /supabase db push|NEXT_PUBLIC_SUPABASE|service-role key/);
  return 'unconfirmed signup → one-time link → confirmed workspace access';
});

await check('verification, reset, invitation, welcome and security email flows are wired', () => {
  const authEmail = read('src/lib/auth-email.ts');
  const verify = read('src/app/api/auth/verify-email/route.ts');
  const reset = read('src/app/api/auth/reset-password/route.ts');
  const email = read('src/lib/email.ts');
  const templates = read('src/lib/email-templates.ts');
  for (const needle of ['issueEmailToken','consumeEmailToken','confirmAccountEmail','setAccountPassword','sendWelcomeEmail','sendWelcomeForAccount','sendPasswordChangedEmail','sendTeamInviteEmail'])
    assert.ok(authEmail.includes(needle), `auth-email missing ${needle}`);
  assert.match(authEmail, /inviteUrl\(token\)/);
  assert.match(reset, /isInvite \? 'invite' : 'reset_password'/);
  assert.match(reset, /sendWelcomeForAccount\(account\)/);
  assert.match(verify, /sendWelcomeForAccount/);
  assert.match(email, /export function verificationUrl/);
  assert.match(email, /export function resetPasswordUrl/);
  assert.match(email, /export function inviteUrl/);
  assert.match(email, /List-Unsubscribe/);
  assert.match(templates, /Turn off optional emails/);
  assert.doesNotMatch(templates, /<link|<img|url\(http/i, 'templates must stay self-contained');
  return 'one-time hashed links · welcome · reset · invitation · unsubscribe headers';
});

await check('critical-only email keeps workspace reminders in the notification centre', () => {
  const preferences = read('src/lib/notification-preferences.ts');
  const service = read('src/lib/notification-service.ts');
  const reminders = read('src/lib/reminders.ts');
  const support = read('src/app/api/[org]/support/route.ts');
  const comments = read('src/app/api/[org]/support/[ticket]/comments/route.ts');
  const workflow = read('src/app/api/[org]/work-items/action/route.ts');
  const billing = read('src/lib/billing.ts');
  assert.match(preferences, /category === 'security' \|\| category === 'billing' \|\| category === 'verification' \|\| category === 'welcome'/);
  assert.match(service, /ESSENTIAL_EMAIL_CATEGORIES/);
  assert.match(service, /if \(!ESSENTIAL_EMAIL_CATEGORIES\.has\(input\.category\)\) return false/);
  assert.match(service, /export async function notifyUsersByCategory/);
  assert.match(service, /export async function roleUserIds/);
  for (const file of [reminders, support, comments]) assert.doesNotMatch(file, /queueCategoryEmail/, 'workspace activity must not queue email');
  assert.match(reminders, /respectQuietHours: true/);
  assert.match(reminders, /runDigestSweep/);
  assert.match(support, /notifyUsersByCategory/);
  assert.match(comments, /notifyUsersByCategory/);
  assert.match(workflow, /notifyUsersByCategory/);
  assert.match(billing, /category: 'billing'/);
  assert.match(billing, /queueCategoryEmails/);
  return 'essential-only email · role-targeted in-app reminders · billing wired';
});

await check('premium Settings controls expose categories, digest, quiet hours, mute and unsubscribe', () => {
  const settings = read('src/app/[org]/settings/page.tsx');
  const ui = read('src/components/NotificationSettings.tsx');
  const api = read('src/app/api/account/notifications/route.ts');
  const email = read('src/lib/email.ts');
  assert.match(settings, /\{id:'notifications',label:'Notifications'\}/);
  assert.match(settings, /new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
  for (const needle of [
    'in_app_approvals','in_app_tasks','in_app_support','in_app_digest',
    'digest_frequency','quiet_hours_start','quiet_hours_end','mute_all',
    'Always on','Quiet from','Quiet until','Time zone','Turn off optional emails with one click',
    'Never emailed','Workspace summary',
  ]) assert.ok(ui.includes(needle), `notification UI missing ${needle}`);
  assert.match(api, /ensurePreferences\(a\.userId\)/);
  assert.match(api, /updatePreferences\(a\.userId, patch\)/);
  assert.match(email, /\?tab=notifications/);
  return '9 quiet tabs · category switches · digest · quiet hours · one-click unsubscribe';
});

await check('daily sweep and SMTP gate keep live sending safely queued', () => {
  const cron = read('src/app/api/cron/notifications/route.ts');
  const vercel = read('vercel.json');
  const email = read('src/lib/email.ts');
  assert.match(cron, /runNotificationSweep/);
  assert.match(cron, /safeHashEqual/);
  assert.match(cron, /NOTIFICATION_CRON_SECRET \|\| process\.env\.CRON_SECRET/);
  assert.match(vercel, /"path": "\/api\/cron\/notifications"/);
  assert.match(vercel, /"schedule": "0 5 \* \* \*"/);
  assert.ok(email.includes('return !!host && !!from') && email.includes('example\\.com'), 'SMTP gate must require a host and a real sender');
  assert.match(email, /const delivered = isSmtpConfigured\(\) \? await deliverEmailById\(id\) : false/);
  assert.match(email, /if \(!isSmtpConfigured\(\)\) return \{ configured: false/);
  return '05:00 UTC sweep · Bearer secret · no live send without SMTP';
});

await check('QA scripts and docs were reconciled with secure verification', () => {
  const auditPy = read('scripts/audit.py');
  const onboarding = read('scripts/onboarding-audit.mjs');
  const readme = read('README.md');
  assert.match(auditPy, /def confirm_qa_user/);
  assert.match(auditPy, /QA_INVITE_PASSWORD/);
  assert.match(onboarding, /async function confirmAccount/);
  assert.match(onboarding, /Check your email/);
  assert.doesNotMatch(auditPy + onboarding + readme, /Welcome@123/);
  assert.ok(!readme.includes('with a temporary password'), 'README must describe secure links, not a shared temporary password');
  assert.match(readme, /New accounts must confirm their email address before entering a workspace/);
  assert.doesNotMatch(readme, /Email confirmation should be disabled/);
  return 'role matrix · onboarding audit · README';
});

const api = await request.newContext({ baseURL: BASE });
await check('public verification, reset, unsubscribe and sign-in pages are reachable', async () => {
  for (const [route, needle] of [
    ['/login', 'Forgot password?'],
    ['/verify-email', 'Confirm your email address'],
    ['/reset-password', 'Choose a new password'],
    ['/notifications/unsubscribe', 'Email preferences'],
  ]) {
    const r = await api.get(route);
    assert.equal(r.status(), 200, `${route} returned ${r.status()}`);
    assert.ok((await r.text()).includes(needle), `${route} missing ${needle}`);
  }
  return '4 pages · plain-language copy';
});

await check('account email endpoints are generic, deduplicated and do not expose account state', async () => {
  const forgot = await api.post('/api/auth/forgot-password', { data: { email: 'not-a-member@example.invalid' } });
  assert.equal(forgot.status(), 200);
  assert.match((await forgot.json()).message, /If an account exists/);
  const resend = await api.post('/api/auth/resend-verification', { data: { email: 'not-a-member@example.invalid' } });
  assert.equal(resend.status(), 200);
  assert.match((await resend.json()).message, /If your account still needs verification/);
  const verify = await api.post('/api/auth/verify-email', { data: {} });
  assert.equal(verify.status(), 400);
  assert.match((await verify.json()).error, /This link is incomplete/);
  const reset = await api.post('/api/auth/reset-password', { data: {} });
  assert.equal(reset.status(), 400);
  const account = await api.get('/api/account/notifications');
  assert.equal(account.status(), 401);
  const cron = await api.get('/api/cron/notifications');
  assert.equal(cron.status(), 401);
  const unsubscribe = await fetch(`${BASE}/api/notifications/unsubscribe?token=invalid`, { redirect: 'manual' });
  assert.ok([302, 307, 308].includes(unsubscribe.status), `unsubscribe redirect ${unsubscribe.status}`);
  assert.match(unsubscribe.headers.get('location') || '', /done=0/);
  return 'no enumeration · no open sweep · invalid unsubscribe link handled';
});

await check('owner sees quiet defaults and an elegant Notifications tab with no browser errors', async () => {
  const login = await api.post('/api/auth/login', { data: { email: 'owner@kestrelridge.co.zw', password: 'Demo@1234' } });
  assert.equal(login.status(), 200, `owner login returned ${login.status()}`);
  const prefsResponse = await api.get('/api/account/notifications');
  assert.equal(prefsResponse.status(), 200);
  const prefs = (await prefsResponse.json()).preferences;
  assert.equal(prefs.email_security, true);
  assert.equal(prefs.email_billing, true);
  assert.equal(prefs.in_app_approvals, true);
  assert.equal(prefs.in_app_tasks, true);
  assert.equal(prefs.in_app_support, true);
  assert.equal(prefs.in_app_digest, true);
  assert.equal(prefs.digest_frequency, 'off');
  assert.equal(prefs.quiet_hours_start, 22);
  assert.equal(prefs.quiet_hours_end, 7);
  assert.equal(prefs.mute_all, true);
  assert.match(prefs.unsubscribeUrl, /\/api\/notifications\/unsubscribe\?token=/);

  const state = await api.storageState();
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/kestrel-ridge/settings?tab=notifications`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Email & notification centre').waitFor({ timeout: 20000 });
    await page.getByText('Always on').first().waitFor({ timeout: 20000 });
    for (const needle of ['Mute optional emails','Quiet from','Quiet until','Time zone','Workspace summary','Turn off optional emails with one click'])
      await page.getByText(needle, { exact: false }).first().waitFor({ timeout: 20000 });
    const body = await page.locator('body').innerText();
    for (const banned of [/Shadow mode/i, /SUPABASE_SERVICE_ROLE_KEY/i, /BILLING_ENABLED/i, /Unauthorized/i, /Invalid request/i])
      assert.doesNotMatch(body, banned, `technical copy visible: ${banned}`);
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: '/home/user/notifications-settings.png', fullPage: true });
    await ctx.close();
    return 'quiet defaults · 9 controls · 0 browser errors';
  } finally { await browser.close(); }
});

await api.dispose();
const passed = results.filter(r => r.ok).length;
console.log(`\nEmail/notifications QA: ${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exitCode = 1;
