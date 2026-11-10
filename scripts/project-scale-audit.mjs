/* Dedicated browser QA for the two scalability acceptance criteria:
 *   1. clicking a project opens the FULL project page, never a side drawer;
 *   2. reference fields and project filters are server-backed searchable dropdowns.
 * Run: node scripts/project-scale-audit.mjs
 * Optional: AUDIT_BASE=https://… node scripts/project-scale-audit.mjs
 * Writes PROJECT_SCALE_AUDIT_REPORT.json/.md and screenshots. */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SHOTS = path.join(ROOT, 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });
const prod = /vercel\.app|myla-construction-erp/.test(BASE);
const prefix = prod ? 'production-' : '';
const results = [];
const consoleErrors = [];
const pageErrors = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));

let refSearchUrl = '';
page.on('request', r => {
  if (r.url().includes('mode=refs') && /q=Pomona/i.test(r.url())) refSearchUrl = r.url();
});

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(` FAIL  ${name} — ${e.message}`);
    await page.keyboard.press('Escape').catch(() => {});
  }
}

await check('owner signs in', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill('owner@kestrelridge.co.zw');
  await page.locator('input[type="password"]').fill('Demo@1234');
  await page.locator('form').getByRole('button', { name: /Sign in/ }).click();
  await page.waitForURL(new RegExp(`${ORG}/dashboard`), { timeout: 25000 });
  await page.waitForFunction(() => (document.querySelector('main')?.innerText || '').length > 200, { timeout: 25000 });
  return 'session ready';
});

let firstProjectId = '';
await check('register list is paged on the database', async () => {
  const resp = await page.request.get(`${BASE}/api/${ORG}/records/projects?page=1&pageSize=1`);
  assert(resp.ok(), `HTTP ${resp.status()}`);
  const j = await resp.json();
  assert(j.rows.length === 1, `expected 1 row, got ${j.rows.length}`);
  assert(j.total > 1 && j.pages > 1, `total ${j.total}, pages ${j.pages}`);
  firstProjectId = j.rows[0].id;
  return `1 of ${j.total} jobs · ${j.pages} pages`;
});

await check('project row click opens the full page, not a drawer', async () => {
  await page.goto(`${BASE}/${ORG}/m/projects`, { waitUntil: 'domcontentloaded' });
  await page.locator('tbody tr').first().waitFor();
  await page.waitForFunction(() => {
    const tr = document.querySelector('tbody tr');
    return tr && tr.textContent && tr.textContent.trim().length > 0;
  }, { timeout: 20000 });
  await page.locator('tbody tr').first().locator('td').nth(1).click();
  await page.waitForURL(new RegExp(`${ORG}/projects/`), { timeout: 20000 });
  await page.getByRole('link', { name: 'All projects' }).waitFor();
  const drawer = await page.locator('div.fixed.inset-0.z-50').count();
  assert(drawer === 0, 'side drawer opened instead of the full page');
  assert(!page.url().includes('/m/projects'), 'still on the list page');
  await page.screenshot({ path: path.join(SHOTS, `${prefix}project-detail-full-page.png`), fullPage: true });
  return page.url().replace(BASE, '');
});

await check('full project page exposes all sections and record/files panels', async () => {
  const tabLabels = await page.locator('button').allInnerTexts();
  const expected = ['Overview', 'Schedule', 'Commercial', 'Documents & RFIs', 'Site ops', 'HSE & quality', 'Team & plant', 'Record & files'];
  const missing = expected.filter(x => !tabLabels.some(t => t.trim() === x));
  assert(missing.length === 0, `missing tabs: ${missing.join(', ')}`);
  await page.getByRole('button', { name: 'Record & files' }).click();
  await page.getByText('Comments & activity').waitFor({ timeout: 20000 });
  await page.getByText('Attachments & revisions').waitFor();
  await page.getByText('Linked records').waitFor();
  // Let the ref-label and reverse-link queries settle so the screenshot shows
  // real client/manager names rather than ID suffixes or skeletons.
  await page.waitForFunction(() => {
    const t = document.body.innerText || '';
    return !t.includes('_cli-') && !t.includes('_emp-');
  }, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
  assert((await page.locator('div.fixed.inset-0.z-50').count()) === 0, 'inline panels rendered as a drawer');
  await page.screenshot({ path: path.join(SHOTS, `${prefix}project-detail-record-files.png`), fullPage: true });
  return `${expected.length} tabs · fields, links, comments and revisions inline`;
});

await check('deep ?open= project link redirects to the full page', async () => {
  assert(firstProjectId, 'no project id captured');
  await page.goto(`${BASE}/${ORG}/m/projects?open=${encodeURIComponent(firstProjectId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(new RegExp(`${ORG}/projects/${firstProjectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), { timeout: 20000 });
  return `/${ORG}/projects/${firstProjectId.split('_').pop()}`;
});

await check('form reference dropdown searches the server', async () => {
  refSearchUrl = '';
  await page.goto(`${BASE}/${ORG}/m/tasks`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New Task/ }).click();
  const combo = page.getByRole('combobox', { name: 'Job / project' });
  await combo.waitFor({ timeout: 20000 });
  await combo.fill('Pomona');
  const option = page.getByRole('option', { name: /Pomona Industrial Plant Expansion/ });
  await option.waitFor({ timeout: 20000 });
  assert(refSearchUrl.includes('mode=refs') && /q=Pomona/i.test(refSearchUrl), 'no debounced server ref search');
  await page.screenshot({ path: path.join(SHOTS, `${prefix}project-searchable-dropdown.png`), fullPage: true });
  await option.click();
  await page.waitForTimeout(350);
  const value = await combo.inputValue();
  assert(value.includes('Pomona'), `selected label missing: ${value}`);
  await page.keyboard.press('Escape');
  return `server search → ${value}`;
});

await check('project filter dropdown is searchable', async () => {
  await page.goto(`${BASE}/${ORG}/m/tasks`, { waitUntil: 'domcontentloaded' });
  const combo = page.getByRole('combobox', { name: 'Filter by project' });
  await combo.waitFor({ timeout: 20000 });
  await combo.fill('Pomona');
  const option = page.getByRole('option', { name: /Pomona Industrial Plant Expansion/ });
  await option.waitFor({ timeout: 20000 });
  await option.click();
  await page.waitForTimeout(650);
  const value = await combo.inputValue();
  assert(value.includes('Pomona'), `filter label missing: ${value}`);
  assert((await page.locator('tbody tr').count()) > 0, 'filtered table has no rows');
  await page.screenshot({ path: path.join(SHOTS, `${prefix}project-searchable-filter.png`), fullPage: true });
  return `${value} · filtered rows visible`;
});

await check('no console or page errors', async () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  return '0 errors';
});

const passed = results.filter(r => r.ok).length;
const report = { base: BASE, org: ORG, total: results.length, passed, failures: results.filter(r => !r.ok), results };
await fs.writeFile(path.join(ROOT, 'PROJECT_SCALE_AUDIT_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
const md = `# Project detail & scalability QA\n\nBase: \`${BASE}\`\n\n**${passed}/${results.length} checks passed.**\n\n| Check | Result |\n| --- | --- |\n` +
  results.map(r => `| ${r.name} | ${r.ok ? '✅' : '❌'} ${r.detail} |`).join('\n') +
  `\n\nEvidence: \`screenshots/${prefix}project-detail-full-page.png\`, \`screenshots/${prefix}project-detail-record-files.png\`, \`screenshots/${prefix}project-searchable-dropdown.png\`, \`screenshots/${prefix}project-searchable-filter.png\`.\n`;
await fs.writeFile(path.join(ROOT, 'PROJECT_SCALE_AUDIT_REPORT.md'), md);
await browser.close();
console.log(`\n=== PROJECT SCALE AUDIT: ${passed}/${results.length} passed ===`);
if (passed !== results.length) process.exit(1);
