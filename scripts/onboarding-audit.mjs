#!/usr/bin/env node
/* Live registration / onboarding / tenancy audit.
 *
 * This is a real Chromium flow against a running app backed by the live
 * Supabase project. It creates two throwaway Auth users and one workspace with
 * demo data turned OFF. Cleanup is intentionally left to a short SQL script in
 * the workspace root (QA_ONBOARDING_CLEANUP.sql): the last-owner trigger must
 * be disabled around the org delete, which needs a privileged SQL connection.
 * Nothing in this file prints or stores Supabase keys.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'screenshots');
const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const REPORT_MD = path.join(ROOT, 'ONBOARDING_AUDIT_REPORT.md');
const REPORT_JSON = path.join(ROOT, 'ONBOARDING_AUDIT_REPORT.json');
const CLEANUP_SQL = path.resolve(ROOT, '..', 'QA_ONBOARDING_CLEANUP.sql');
fs.mkdirSync(SHOTS, { recursive: true });

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const company = `QA Onboarding ${stamp}`;
const email = `qa-onboarding-${stamp}@kestrelridge.co.zw`;
const password = 'QaOnboarding@1234';
const inviteEmail = `qa-invite-${stamp}@kestrelridge.co.zw`;
const legalName = `${company} (Pvt) Ltd`;
const qualifiers = ['multiEntity', 'ownedPlant', 'clientPortal', 'designBuild'];
const addons = ['rental'];
const input = {
  companyType: 'INDUSTRIAL_EPC', size: 'MID', headcount: 85,
  revenueBand: '$10M – $50M', qualifiers, addons,
};

function derive(extra = {}) {
  const env = { ...process.env, QA_INPUT: JSON.stringify({ ...input, ...extra }) };
  const out = execFileSync('npx', ['tsx', '-e',
    "import { resolveWorkspace } from './src/lib/catalog.ts'; const i = JSON.parse(process.env.QA_INPUT!); console.log('__EXPECTED__' + JSON.stringify(resolveWorkspace(i)));",
  ], { cwd: ROOT, env, encoding: 'utf8' });
  const line = out.split('\n').find(l => l.startsWith('__EXPECTED__'));
  assert(line, 'could not compute expected workspace derivation');
  return JSON.parse(line.slice('__EXPECTED__'.length));
}
const expectedNoAddon = derive({ addons: [] });
const expected = derive();

const results = [];
const consoleErrors = [];
const pageErrors = [];
let browser;
let qaSlug = '';
let orgId = '';
let ownerId = '';
let inviteUserId = '';

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok   ${name} — ${detail}`);
  } catch (e) {
    const detail = e?.message || String(e);
    results.push({ name, ok: false, detail });
    console.log(` FAIL  ${name} — ${detail.replace(/\n/g, ' | ').slice(0, 500)}`);
  }
}
function watch(page) {
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
}
async function metric(page, label) {
  return page.evaluate(l => {
    const p = [...document.querySelectorAll('main .card p')].find(x => (x.textContent || '').trim() === l);
    const ps = p?.parentElement?.querySelectorAll('p');
    return ps?.[1]?.textContent?.trim() || '';
  }, label);
}
async function json(page, url) {
  const r = await page.request.get(url);
  const body = await r.json().catch(() => ({}));
  return { status: r.status(), body };
}
async function waitForMeta(page, predicate, label) {
  for (let i = 0; i < 40; i++) {
    const { status, body } = await json(page, `${BASE}/api/${qaSlug}/meta`);
    if (status === 200 && predicate(body)) return body;
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  watch(page);

  await check('signup creates a confirmed Supabase Auth account and opens the wizard', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.locator('input[placeholder="Tendai Muchengeti"]').fill('QA Owner');
    await page.locator('input[placeholder="e.g. Ridgeway Constructors"]').fill(company);
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('form').getByRole('button', { name: /Create account & continue/ }).click();
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    await page.getByRole('heading', { name: 'Company profile' }).waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, '17-onboarding-signup.png') });
    return `new session → ${new URL(page.url()).pathname}`;
  });

  await check('company profile step accepts legal entity, country and currency', async () => {
    const inputs = page.locator('main .card input.input');
    await inputs.nth(1).fill(legalName);
    await inputs.nth(2).fill(`QA/${stamp}`);
    const selects = page.locator('main .card select.select');
    await selects.nth(0).selectOption('ZA');
    await selects.nth(1).selectOption('ZAR');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('heading', { name: 'Company type' }).waitFor({ timeout: 15000 });
    return 'legal name · ZA · ZAR → step 2';
  });

  await check('company type and size feed the derivation engine', async () => {
    await page.getByRole('button', { name: /Industrial \/ EPC/ }).click();
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('heading', { name: 'Company size' }).waitFor({ timeout: 15000 });
    await page.locator('main .card button').filter({ hasText: 'Mid-sized' }).first().click();
    await page.locator('main .card input[type=number]').fill('85');
    await page.locator('main .card select.select').first().selectOption({ label: '$10M – $50M' });
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('heading', { name: 'How you work' }).waitFor({ timeout: 15000 });
    return 'INDUSTRIAL_EPC · MID · 85 people · $10M–$50M';
  });

  await check('qualifiers visibly unlock feature flags', async () => {
    for (const label of ['Multiple legal entities', 'Own plant & equipment fleet', 'Client / subcontractor portal', 'Design–build / EPC contracts']) {
      await page.locator('main .card button').filter({ hasText: label }).first().click();
    }
    const text = await page.locator('main .card').innerText();
    for (const flag of ['consolidation', 'multi Currency', 'barcode Assets', 'bim Integration', 'client Portal']) {
      assert(new RegExp(flag, 'i').test(text), `missing derived flag ${flag}`);
    }
    await page.screenshot({ path: path.join(SHOTS, '18-onboarding-qualifiers.png') });
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('heading', { name: 'Your workspace' }).waitFor({ timeout: 15000 });
    return '4 qualifiers → 5+ live flags';
  });

  await check('step 5 derives the module pack and an explicit add-on', async () => {
    assert.equal(await metric(page, 'Modules'), String(expectedNoAddon.modules.length), 'base module count');
    assert.equal(await metric(page, 'Plan'), expected.plan, 'plan');
    assert.equal(await metric(page, 'Users'), String(expected.limits.users), 'user limit');
    const coreBadges = await page.locator('main .card span').filter({ hasText: /^core$/ }).count();
    assert.equal(coreBadges, 13, 'core module badges');
    await page.getByRole('button', { name: /Rental & dispatch/ }).click();
    assert.equal(await metric(page, 'Modules'), String(expected.modules.length), 'module count after add-on');
    const toggle = page.locator('main .card button[aria-pressed]').last();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'demo-data toggle starts on');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'demo-data toggle off');
    await page.screenshot({ path: path.join(SHOTS, '19-onboarding-modules.png') });
    return `${expectedNoAddon.modules.length} → ${expected.modules.length} modules · 13 core · demo data off`;
  });

  await check('creating the workspace persists derivation and lands on an empty dashboard', async () => {
    const pre = await json(page, `${BASE}/api/onboarding`);
    assert.equal(pre.status, 200, 'onboarding GET');
    assert.equal(pre.body.org.onboarded, false, 'starts un-onboarded');
    qaSlug = pre.body.org.slug;
    assert(qaSlug, 'missing slug');
    await page.getByRole('button', { name: /Create workspace/ }).click();
    await page.waitForURL(new RegExp(`/${qaSlug}/dashboard`), { timeout: 30000 });
    const { status, body: meta } = await json(page, `${BASE}/api/${qaSlug}/meta`);
    assert.equal(status, 200, 'meta');
    assert.equal(meta.user.email, email, 'auth user');
    assert.equal(meta.role, 'OWNER', 'first membership role');
    assert.equal(meta.users.length, 1, 'one owner membership');
    assert.equal(meta.org.name, company, 'company name');
    assert.equal(meta.org.legalName, legalName, 'legal name');
    assert.equal(meta.org.country, 'ZA', 'country');
    assert.equal(meta.org.baseCurrency, 'ZAR', 'currency');
    assert.equal(meta.org.companyType, 'INDUSTRIAL_EPC', 'company type');
    assert.equal(meta.org.size, 'MID', 'size');
    assert.deepEqual([...meta.config.modules].sort(), [...expected.modules].sort(), 'modules');
    assert.deepEqual([...meta.config.resources].sort(), [...expected.resources].sort(), 'resources');
    assert.deepEqual(meta.config.flags, expected.flags, 'flags');
    assert.deepEqual(meta.config.limits, expected.limits, 'limits');
    assert.equal(meta.config.plan, expected.plan, 'plan');
    assert.equal(meta.config.localePack, expected.localePack, 'locale pack');
    assert.equal(meta.walletEnabled, true, 'wallets enabled');
    assert(!meta.config.modules.includes('unitSales'), 'unrelated module stayed off');
    orgId = meta.org.id; ownerId = meta.user.id;
    await page.goto(`${BASE}/${qaSlug}/m/clients`, { waitUntil: 'domcontentloaded' });
    await page.getByText('No clients yet').waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, '20-onboarding-empty.png') });
    // The grouped sidebar is resource-driven: no-resource capability modules
    // (portal, integrations) live in config/flags, while modules with registers
    // expose those registers as nav items.
    const sidebar = await page.locator('aside').first().textContent() || '';
    assert(/Rental contracts/.test(sidebar), 'explicit add-on resource missing from sidebar');
    assert(/Commissioning packages/.test(sidebar), 'type-defining resource missing from sidebar');
    assert(/Equipment & fleet/.test(sidebar), 'qualifier-derived resource missing from sidebar');
    assert(!/Units \/ plots & sales/.test(sidebar), 'disabled module leaked into sidebar');
    return `${qaSlug} · ${expected.modules.length} modules · 0 seeded clients`;
  });

  await check('a second tenant cannot read the demo workspace', async () => {
    const { status } = await json(page, `${BASE}/api/kestrel-ridge/meta`);
    assert.equal(status, 401, `expected 401, got ${status}`);
    await page.goto(`${BASE}/kestrel-ridge/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`/${qaSlug}/dashboard`), { timeout: 20000 });
    const text = await page.locator('body').innerText();
    assert(!text.includes('Kestrel Ridge'), 'cross-tenant org name leaked');
    return 'API 401 · page redirects to own workspace';
  });

  await check('sign out and sign back in keep the onboarded session', async () => {
    const out = await page.request.post(`${BASE}/api/auth/logout`);
    assert.equal(out.status(), 200, 'logout');
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('form').waitFor({ timeout: 15000 });
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('form').getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL(new RegExp(`/${qaSlug}/dashboard`), { timeout: 20000 });
    assert(!page.url().includes('/onboarding'), 'unexpected onboarding redirect');
    return 'Supabase Auth session → dashboard, no re-onboarding';
  });

  await check('team invite, role edit, invited sign-in and last-owner protection', async () => {
    await page.goto(`${BASE}/${qaSlug}/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Users & roles' }).click();
    const inviteCard = page.locator('div.card').filter({ hasText: 'Invite a teammate' }).first();
    await inviteCard.locator('input[placeholder="Jane Moyo"]').fill('QA Invitee');
    await inviteCard.locator('input[placeholder="jane@company.co.zw"]').fill(inviteEmail);
    await inviteCard.locator('select.select').first().selectOption('VIEWER');
    await page.getByRole('button', { name: /Add user/ }).click();
    await page.getByText(inviteEmail).first().waitFor({ timeout: 20000 });
    const meta2 = await waitForMeta(page, m => m.users.length === 2, 'invited member');
    const invited = meta2.users.find(u => u.email === inviteEmail);
    assert(invited, 'invited member missing from meta');
    assert.equal(invited.role, 'VIEWER', 'initial invite role');
    inviteUserId = invited.id;

    const row = page.locator('div.flex.flex-wrap.items-center.gap-3.px-5.py-3').filter({ hasText: inviteEmail }).first();
    await row.locator('select').first().selectOption('PROJECT_MANAGER');
    const meta3 = await waitForMeta(page, m => m.users.find(u => u.email === inviteEmail)?.role === 'PROJECT_MANAGER', 'role update');
    assert.equal(meta3.users.find(u => u.email === inviteEmail).role, 'PROJECT_MANAGER', 'role edit');
    const ownerRow = page.locator('div.flex.flex-wrap.items-center.gap-3.px-5.py-3').filter({ hasText: email }).first();
    assert(await ownerRow.locator('select').first().isDisabled(), 'owner could edit own role');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert(url && key, 'service-role env required for last-owner DB check');
    const service = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await service.from('memberships').update({ role: 'VIEWER' })
      .eq('user_id', ownerId).eq('organization_id', orgId);
    assert(error, 'last-owner demotion unexpectedly succeeded');
    assert(/at least one owner/i.test(error.message), `unexpected error: ${error.message}`);
    const still = await service.from('memberships').select('role')
      .eq('user_id', ownerId).eq('organization_id', orgId).single();
    assert.equal(still.data?.role, 'OWNER', 'owner role changed after rejected update');

    const inviteCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p2 = await inviteCtx.newPage();
    watch(p2);
    await p2.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await p2.locator('input[type=email]').fill(inviteEmail);
    await p2.locator('input[type=password]').fill('Welcome@123');
    await p2.locator('form').getByRole('button', { name: /Sign in/i }).click();
    await p2.waitForURL(new RegExp(`/${qaSlug}/dashboard`), { timeout: 20000 });
    const invitedMeta = await json(p2, `${BASE}/api/${qaSlug}/meta`);
    assert.equal(invitedMeta.status, 200, 'invited user meta');
    assert.equal(invitedMeta.body.role, 'PROJECT_MANAGER', 'invited role after sign-in');
    await inviteCtx.close();

    await page.screenshot({ path: path.join(SHOTS, '21-team-roles.png') });
    return 'VIEWER invite → PROJECT_MANAGER · last owner protected · temp-password sign-in';
  });

  await check('no uncaught page errors or unexpected console errors', async () => {
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
    assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`);
    return `${pageErrors.length} page errors · ${consoleErrors.length} console errors`;
  });

  await ctx.close();
} catch (e) {
  results.push({ name: 'harness', ok: false, detail: e?.message || String(e) });
  console.log(` FAIL  harness — ${e?.message || e}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  const report = {
    base: BASE, checks: results.length, passed, failed, results,
    company, email, inviteEmail, slug: qaSlug, orgId, ownerId, inviteUserId,
    expectedModules: expected.modules.length,
    expectedPlan: expected.plan, expectedUserLimit: expected.limits.users,
    consoleErrors, expectedErrors: [], pageErrors,
    cleanup: path.relative(ROOT, CLEANUP_SQL),
  };
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const rows = results.map(r => `| ${r.name.replace(/\|/g, '\\|')} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`).join('\n');
  fs.writeFileSync(REPORT_MD, `# BuildOps live onboarding / tenancy audit\n\n**${passed}/${results.length} checks passed** — real Chromium against \`${BASE}\`, backed by the live Supabase project.\n\n| Check | Result | Detail |\n|---|---|---|\n${rows}\n\nWorkspace: \`${company}\` · \`${email}\` · slug \`${qaSlug || 'n/a'}\`.\nDerived pack: **${expected.modules.length} modules**, plan **${expected.plan}**, user limit **${expected.limits.users}**, with 13 essentials plus type/size/qualifier/add-on layers. Demo data was left OFF so the new workspace starts with an empty state.\n\nUnexpected console errors: ${consoleErrors.length} · Uncaught page errors: ${pageErrors.length}.\nScreenshots: \`screenshots/17-onboarding-signup.png\` … \`21-team-roles.png\`.\n\n## Cleanup\n\nThis suite creates two throwaway Auth users (\`qa-onboarding-*\` / \`qa-invite-*\`) and one workspace. Run the generated \`${path.relative(ROOT, CLEANUP_SQL)}\` through the Supabase SQL editor or connector; it temporarily disables the last-owner trigger, cascades the QA organization and deletes the QA Auth users, then re-enables the trigger. It never touches the seeded Kestrel Ridge workspace.\n`);
  fs.writeFileSync(CLEANUP_SQL, `-- Generated by scripts/onboarding-audit.mjs on ${new Date().toISOString()}\n-- Run via the Supabase SQL editor / connector on project oeadisqfuyhelppinaxw.\n-- Slug: ${qaSlug || 'qa-onboarding-*'} · owner: ${email} · invite: ${inviteEmail}\nalter table public.memberships disable trigger memberships_protect_last_owner;\ndelete from public.organizations where slug like 'qa-onboarding-%';\ndelete from auth.users where email like 'qa-onboarding-%@kestrelridge.co.zw' or email like 'qa-invite-%@kestrelridge.co.zw';\nalter table public.memberships enable trigger memberships_protect_last_owner;\nselect (select count(*) from public.organizations where slug like 'qa-onboarding-%') as qa_orgs,\n       (select count(*) from auth.users where email like 'qa-onboarding-%@kestrelridge.co.zw' or email like 'qa-invite-%@kestrelridge.co.zw') as qa_users;\n`);
  console.log(`\n=== ONBOARDING AUDIT: ${passed}/${results.length} passed ===`);
  console.log(`Cleanup SQL: ${CLEANUP_SQL}`);
  process.exitCode = failed ? 1 : 0;
}
