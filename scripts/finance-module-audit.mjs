/* QA for the finance-document / strict-module release:
 *   - tenant white-label branding + logo upload in Settings;
 *   - editable line items on quotation and invoice forms;
 *   - disabled modules/resources hidden from sidebar, quick create, command
 *     palette, dashboard, reports, project 360 and direct URLs;
 *   - Settings remains the only full-list exception;
 *   - existing data returns when a module is re-enabled.
 *
 * Run: npm run audit:finance  (or AUDIT_BASE=https://… npm run audit:finance)
 * Writes FINANCE_MODULE_AUDIT_REPORT.json/.md and screenshots/finance-module.png.
 */
import { chromium, request } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SHOTS = path.join(ROOT, 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });
const LOGO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PASSWORD = 'Demo@1234';
const results = [];
const contexts = [];
let browser, owner, page, originalCompany = {}, originalConfig = null;
let browserReady = false;

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const url = p => `${BASE}/api/${ORG}/${p}`;
const orgUrl = p => `${BASE}/${ORG}/${p}`;
async function body(r, label) {
  if (!r.ok()) throw new Error(`${label}: HTTP ${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`);
  return r.json();
}
async function session(email) {
  const ctx = await request.newContext({ baseURL: BASE });
  contexts.push(ctx);
  await body(await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } }), `login ${email}`);
  return ctx;
}
const get = async (ctx, p) => body(await ctx.get(url(p)), `GET ${p}`);
async function send(ctx, method, p, data) {
  return body(await ctx.fetch(url(p), { method, data }), `${method} ${p}`);
}
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
async function toggle(mid, enabled) {
  return send(owner, 'PATCH', 'settings', { action: 'toggleModule', moduleId: mid, enabled });
}
async function waitForNav() {
  await page.waitForSelector('aside nav');
  await page.waitForFunction(() => (document.querySelector('aside nav')?.innerText || '').trim().length > 12);
}
async function gotoStatus(p) {
  const r = await page.goto(orgUrl(p), { waitUntil: 'domcontentloaded' });
  return r ? r.status() : 0;
}

try {
  owner = await session('owner@kestrelridge.co.zw');
  const settingsMeta = await get(owner, 'meta?scope=settings');
  originalCompany = settingsMeta.org.company || {};
  originalConfig = settingsMeta.config || null;
  await send(owner, 'PATCH', 'settings', { action: 'applyPack', pack: 'full' });
  const state = await owner.storageState();
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  browserReady = true;

  await check('Settings saves tenant document branding and uploaded logo', async () => {
    await page.goto(orgUrl('settings'));
    await page.getByRole('button', { name: 'Document branding' }).click();
    await page.locator('label:has-text("Document display name") + input').fill('Kestrel Ridge UI QA');
    await page.locator('label:has-text("VAT / tax number") + input').fill('VAT-UI-QA');
    await page.locator('label:has-text("Postal / physical address") + textarea').fill('12 Borrowdale Road, Harare');
    await page.locator('label:has-text("Default deposit (%)") + input').fill('70');
    await page.locator('input[type=file]').setInputFiles({
      name: 'qa-logo.png', mimeType: 'image/png', buffer: Buffer.from(LOGO_PNG, 'base64'),
    });
    await page.getByRole('button', { name: 'Save document branding' }).click();
    await page.waitForTimeout(1500);
    const meta = await get(owner, 'meta?scope=settings');
    assert(meta.org.company.displayName === 'Kestrel Ridge UI QA', 'display name not saved');
    assert(String(meta.org.company.logoDataUrl || '').startsWith('data:image/png'), 'logo not saved');
    assert(meta.org.company.depositPct === 70, 'deposit not saved');
    return `${meta.org.company.displayName} · ${meta.org.company.depositPct}% deposit`;
  });

  await check('Quotation form has an editable itemised line table', async () => {
    await page.goto(orgUrl('m/estimates?new=1'));
    await page.waitForTimeout(900);
    assert(await page.locator('text=Itemised lines').count() > 0, 'no Itemised lines field');
    const table = page.locator('table').filter({ hasText: 'Description' }).first();
    assert(await table.count() > 0, 'no item table');
    await page.getByRole('button', { name: 'Add line' }).click();
    const inputs = table.locator('input');
    await inputs.nth(0).fill('UI QA roof trusses');
    await inputs.nth(2).fill('2');
    await inputs.nth(3).fill('100');
    await page.waitForTimeout(300);
    const text = await page.locator('body').innerText();
    assert(text.includes('200.00'), 'line subtotal did not calculate');
    assert(await page.getByRole('button', { name: 'Add line' }).count() > 0, 'no add-line control');
    await page.screenshot({ path: path.join(SHOTS, 'finance-module.png'), fullPage: true });
    return 'description · qty · unit price · subtotal';
  });

  await check('Invoice form also has editable itemised lines', async () => {
    await page.goto(orgUrl('m/arInvoices?new=1'));
    await page.waitForTimeout(900);
    assert(await page.locator('text=Itemised lines').count() > 0, 'no Itemised lines field on invoice');
    assert(await page.locator('table').filter({ hasText: 'Unit price' }).count() > 0, 'no item table on invoice');
    return 'estimate + invoice';
  });

  await check('Disabled safety module disappears from sidebar and quick create', async () => {
    await toggle('safety', false);
    await page.goto(orgUrl('dashboard'));
    await waitForNav();
    const nav = await page.locator('aside nav').first().innerText();
    assert(!nav.includes('Incidents & near misses'), 'sidebar still shows Incidents & near misses');
    assert(!nav.includes('Toolbox talks'), 'sidebar still shows Toolbox talks');
    await page.locator('button[aria-label="Quick create"]').click();
    const quick = await page.locator('div.panel:has-text("Quick create")').first().innerText();
    assert(!quick.includes('Incident'), 'quick create still shows Incident');
    await page.keyboard.press('Escape');
    return 'sidebar + quick create';
  });

  await check('Command palette / global search hides disabled records', async () => {
    await page.keyboard.press('Control+k');
    await page.locator('input[placeholder*="Search jobs"]').fill('incident');
    await page.waitForTimeout(900);
    const palette = await page.locator('div.card').last().innerText();
    assert(!palette.includes('Incidents & near misses'), 'palette still shows disabled incident results');
    await page.keyboard.press('Escape');
    return 'no incident results';
  });

  await check('Dashboard, reports and project 360 hide disabled module', async () => {
    await page.goto(orgUrl('reports'));
    const reports = await page.locator('body').innerText();
    assert(!reports.includes('Incidents & follow-up'), 'reports still shows Incidents card');
    await page.goto(orgUrl('dashboard'));
    const dash = await page.locator('body').innerText();
    assert(!dash.includes('Incidents'), 'dashboard still shows Incidents glance');
    const projects = (await get(owner, 'records/projects?pageSize=1')).rows;
    assert(projects.length > 0, 'no project for 360 check');
    await page.goto(orgUrl(`projects/${projects[0].id}`));
    await page.waitForTimeout(900);
    const projectText = await page.locator('body').innerText();
    assert(!projectText.includes('Safety incidents'), 'project 360 still shows Safety incidents KPI');
    assert(!projectText.includes('Incidents & near misses'), 'project 360 still shows Incidents table');
    return 'dashboard · reports · project 360';
  });

  await check('Project 360 hides disabled finance KPIs and snapshot rows', async () => {
    for (const mid of ['finance', 'billing', 'jobCosting']) await toggle(mid, false);
    const projects = (await get(owner, 'records/projects?pageSize=1')).rows;
    assert(projects.length > 0, 'no project for finance KPI check');
    await page.goto(orgUrl(`projects/${projects[0].id}`));
    await page.waitForTimeout(900);
    const text = await page.locator('body').innerText();
    for (const label of ['Billed / certified', 'Original budget', 'Committed', 'Actual to date', 'Forecast to complete', 'Received']) {
      assert(!text.includes(label), `project 360 still shows ${label}`);
    }
    for (const mid of ['finance', 'billing', 'jobCosting']) await toggle(mid, true);
    return 'top KPI row + financial snapshot';
  });

  await check('Settings remains the full-list exception', async () => {
    await page.goto(orgUrl('settings'));
    await page.getByRole('button', { name: 'Sections' }).click();
    await page.waitForTimeout(700);
    const text = await page.locator('body').innerText();
    assert(text.includes('Safety on site'), 'settings does not list disabled Safety module');
    return 'Safety on site still listed';
  });

  await check('Direct URL to disabled resource is blocked', async () => {
    assert(await gotoStatus('m/incidents') === 404, `/m/incidents did not 404`);
    return 'HTTP 404';
  });

  await check('Re-enabled module and its data return', async () => {
    await toggle('safety', true);
    const restoredMeta = await get(owner, 'meta');
    assert(restoredMeta.config.modules.includes('safety'), 'safety module not restored in meta');
    assert(restoredMeta.config.resources.includes('incidents'), 'incidents resource not restored in meta');
    await page.goto(orgUrl('dashboard'));
    await page.reload();
    await waitForNav();
    const nav = await page.locator('aside nav').first().innerText();
    assert(nav.includes('Incidents & near misses'), 'sidebar did not restore Incidents & near misses');
    assert(await gotoStatus('m/incidents') === 200, `/m/incidents did not return`);
    return 'sidebar + record list';
  });

  await check('Special pages are module-gated on direct URLs', async () => {
    for (const [mid, p] of [
      ['wallets', 'wallets'], ['reports', 'reports'], ['documents', 'library'],
      ['dashboard', 'dashboard'], ['dashboard', 'documentation'], ['projects', 'm/projects'],
    ]) {
      await toggle(mid, false);
      const status = await gotoStatus(p);
      assert(status === 404, `/${p} returned ${status} with ${mid} disabled`);
      await toggle(mid, true);
    }
    return 'wallets · reports · library · dashboard · docs · projects';
  });

  await check('Project 360 URL is blocked when projects is disabled', async () => {
    const projects = (await get(owner, 'records/projects?pageSize=1')).rows;
    assert(projects.length > 0, 'no project');
    await toggle('projects', false);
    assert(await gotoStatus(`projects/${projects[0].id}`) === 404, 'project 360 did not 404');
    await page.goto(orgUrl('dashboard'));
    await page.waitForTimeout(700);
    await page.locator('button[aria-label="Quick create"]').click();
    const quick = await page.locator('div.panel:has-text("Quick create")').first().innerText();
    assert(!quick.includes('Job'), 'quick create still shows Job with projects disabled');
    await page.keyboard.press('Escape');
    await toggle('projects', true);
    return 'project 360 + quick create';
  });

  await check('All disabled sections remain listed only in Settings', async () => {
    for (const mid of ['safety', 'wallets', 'reports', 'documents', 'dashboard', 'projects']) await toggle(mid, false);
    await page.goto(orgUrl('settings'));
    await page.getByRole('button', { name: 'Sections' }).click();
    await page.waitForTimeout(700);
    const text = await page.locator('body').innerText();
    for (const label of ['Safety on site', 'Client wallets', 'Reports', 'Document library', 'Home dashboard', 'Jobs & projects']) {
      assert(text.includes(label), `settings is missing ${label}`);
    }
    return '6 disabled modules still listed';
  });
} finally {
  try {
    if (owner) {
      // Restore the exact section set that was live before this audit. Applying
      // the full pack here would silently undo a deliberately simplified demo.
      if (originalConfig) {
        const wanted = new Set(originalConfig.modules || []);
        const currentMeta = await get(owner, 'meta?scope=settings');
        const current = new Set(currentMeta.config?.modules || []);
        for (const m of currentMeta.modules || []) {
          const should = wanted.has(m.id);
          if (should !== current.has(m.id)) await toggle(m.id, should);
        }
      } else {
        await send(owner, 'PATCH', 'settings', { action: 'applyPack', pack: 'full' });
      }
      await send(owner, 'PATCH', 'settings', { action: 'updateCompany', company: originalCompany });
    }
  } catch (e) { console.log(`cleanup warning: ${e.message}`); }
  if (browser) await browser.close().catch(() => {});
  for (const c of contexts) await c.dispose().catch(() => {});
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  const report = {
    generatedAt: new Date().toISOString(), base: BASE, org: ORG,
    passed, failed, total: results.length,
    screenshot: browserReady ? 'screenshots/finance-module.png' : null,
    results,
  };
  await fs.writeFile(path.join(ROOT, 'FINANCE_MODULE_AUDIT_REPORT.json'), JSON.stringify(report, null, 2));
  const md = [
    '# Finance documents & strict module visibility — QA', '',
    `- Base: ${BASE}`, `- Date: ${report.generatedAt}`, `- Result: **${passed}/${results.length} passed**, ${failed} failed`,
    report.screenshot ? `- Screenshot: \`${report.screenshot}\`` : '', '',
    '| Check | Result | Detail |', '| --- | --- | --- |',
    ...results.map(r => `| ${r.name.replace(/\|/g, '\\|')} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
    '', 'Generated by `scripts/finance-module-audit.mjs`.',
  ].join('\n');
  await fs.writeFile(path.join(ROOT, 'FINANCE_MODULE_AUDIT_REPORT.md'), md);
  console.log(`\n${passed}/${results.length} checks passed. Report: FINANCE_MODULE_AUDIT_REPORT.md`);
}
if (results.some(r => !r.ok)) process.exitCode = 1;
