#!/usr/bin/env node
/* QA for the simplicity / one-file-library pass.
 *
 * Run: npm run audit:simplicity
 * Or:  AUDIT_BASE=https://… npm run audit:simplicity
 *
 * Read-only: this audit never creates records or changes workspace settings.
 */
import { chromium } from 'playwright';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const PASSWORD = 'Demo@1234';
const EMAIL = 'owner@kestrelridge.co.zw';
const results = [];
let browser, page;

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(` FAIL  ${name} — ${e.message}`);
  }
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  page = await context.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await check('Owner signs in', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await Promise.all([
      page.waitForURL(new RegExp(`/${ORG}/dashboard`), { timeout: 30000 }),
      page.locator('form').getByRole('button', { name: /Sign in/i }).click(),
    ]);
    await page.waitForSelector('aside nav', { timeout: 30000 });
    await page.waitForFunction(() => (document.querySelector('aside nav')?.innerText || '').trim().length > 12);
    return 'dashboard loaded';
  });

  await check('Sidebar uses plain labels', async () => {
    const sidebar = await page.locator('aside nav').innerText();
    assert(sidebar.includes('Document library'), 'Document library missing from sidebar');
    assert(sidebar.includes('Drawing approvals'), 'Drawing approvals missing from sidebar');
    assert(!/Drawings for approval|Drawings & documents|Documents & drawings/.test(sidebar), 'old document wording remains in sidebar');
    assert(!/Document register/.test(sidebar), 'raw document register remains in sidebar');
    return 'library + approvals, no jargon';
  });

  await check('Specialist modules have their own catalogue group', async () => {
    const meta = await (await page.request.get(`${BASE}/api/${ORG}/meta?scope=settings`)).json();
    const specialist = (meta.modules || []).filter(m => m.group === 'Specialist modules');
    assert(specialist.length >= 4, `expected specialist modules in one group, got ${specialist.length}`);
    const sidebar = await page.locator('aside nav').innerText();
    assert(!sidebar.includes('Specialist modules'), 'empty specialist group clutters the demo sidebar');
    return `${specialist.length} specialist sections grouped, hidden when off`;
  });

  await check('Unused demo specialist modules are hidden', async () => {
    const sidebar = await page.locator('aside nav').innerText();
    assert(!/Stands & unit sales|Leases & rentals|Handover packs/.test(sidebar), 'specialist module leaked into demo sidebar');
    return 'disabled for Kestrel Ridge';
  });

  await check('Document library opens as the single file entry', async () => {
    await page.getByTestId('nav-library').click();
    await page.waitForURL(new RegExp(`/${ORG}/library`), { timeout: 30000 });
    await page.getByTestId('library-page').waitFor({ timeout: 30000 });
    assert((await page.locator('h1').first().innerText()).trim() === 'Document library', 'library heading incorrect');
    const text = await page.getByTestId('library-page').innerText();
    assert(text.includes('One place for files'), 'plain-language library description missing');
    return 'file-first library';
  });

  await check('Controlled register remains reachable from the library', async () => {
    const link = page.getByTestId('library-register-link');
    assert(await link.count() === 1, 'library register link missing');
    assert((await link.getAttribute('href')) === `/${ORG}/m/documents`, 'library register link points to wrong page');
    await link.click();
    await page.waitForURL(new RegExp(`/${ORG}/m/documents`), { timeout: 30000 });
    assert((await page.locator('h1').first().innerText()).trim() === 'Document register', 'register heading incorrect');
    return 'one click, no dead end';
  });

  await check('Settings uses the same plain labels', async () => {
    await page.goto(`${BASE}/${ORG}/settings`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Sections' }).click();
    await page.waitForTimeout(700);
    const text = await page.locator('body').innerText();
    for (const label of ['Document library', 'Specialist modules', 'Leases & rentals', 'Company setup']) {
      assert(text.includes(label), `Settings is missing ${label}`);
    }
    assert(!/Documents & drawings|Plant hire & dispatch/.test(text), 'old Settings wording remains');
    return 'same words in sidebar and Settings';
  });

  await check('No runtime console errors on live pages', async () => {
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
    return '0 errors';
  });

  await check('Switched-off specialist routes stay closed', async () => {
    for (const path of ['m/units', 'm/rentalContracts', 'm/commissioning']) {
      const r = await page.goto(`${BASE}/${ORG}/${path}`, { waitUntil: 'domcontentloaded' });
      assert(r && r.status() === 404, `${path} returned ${r ? r.status() : 'no response'} instead of 404`);
    }
    return '3 specialist routes blocked';
  });

} finally {
  await browser?.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\nSimplicity audit: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}
