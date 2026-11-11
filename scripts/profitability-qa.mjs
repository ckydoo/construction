/* End-to-end QA for Phase 2: Job profitability cockpit.
 * Read-only: creates no records and requires no database cleanup.
 * Run against a production build: node scripts/profitability-qa.mjs
 * Env: QA_BASE (default http://127.0.0.1:3000), QA_EMAIL / QA_PASSWORD.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.QA_EMAIL || 'owner@kestrelridge.co.zw';
const PASSWORD = process.env.QA_PASSWORD || 'Demo@1234';
const LOG = '/tmp/profitability-qa-report.txt';
const results = [];
let slug = 'kestrel-ridge';
let failed = false;
let browser;

function makeSession() { return { jar: new Map() }; }
function capture(session, res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/, (?=\S+=)/).filter(Boolean);
  for (const raw of list) {
    const pair = String(raw).split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) session.jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}
async function call(session, pathname, init = {}, withCookie = true) {
  const headers = new Headers(init.headers || {});
  if (withCookie && session.jar.size) headers.set('cookie', [...session.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${pathname}`, {
    ...init, headers, redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(45000),
  });
  if (withCookie) capture(session, res);
  const text = await res.text().catch(() => '');
  let body = {};
  try { body = JSON.parse(text); } catch { /* html */ }
  return { res, body, text };
}
const api = (org, suffix) => `/api/${encodeURIComponent(org)}/${suffix}`;
const owner = makeSession();
const anon = makeSession();
const get = suffix => call(owner, api(slug, suffix), {});

async function check(name, fn) {
  try { const detail = await fn(); results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  catch (e) { results.push(`FAIL  ${name} — ${e.message}`); throw e; }
}

try {
  await check('anonymous caller cannot read job profitability', async () => {
    const r = await call(anon, api(slug, 'profitability'), {}, false);
    assert.equal(r.res.status, 401, JSON.stringify(r.body));
    return '401';
  });

  await check('demo owner signs in', async () => {
    const r = await call(owner, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    assert.equal(r.res.status, 200, JSON.stringify(r.body));
    slug = r.body.slug;
    assert.ok(slug);
    return slug;
  });

  let payload;
  await check('profitability API returns a reconciled, no-store payload', async () => {
    const r = await get('profitability');
    assert.equal(r.res.status, 200, JSON.stringify(r.body).slice(0, 400));
    assert.match(r.res.headers.get('cache-control') || '', /no-store/i);
    payload = r.body;
    assert.equal(payload.base, 'USD', 'workspace base currency should be USD');
    assert.ok(payload.currency && Array.isArray(payload.currency.missingRates), 'missing currency envelope');
    assert.ok(payload.summary && typeof payload.summary.projectCount === 'number', 'missing summary');
    assert.ok(Array.isArray(payload.jobs) && payload.jobs.length > 0, 'no jobs returned');
    assert.ok(Array.isArray(payload.costBreakdown), 'missing cost breakdown');
    assert.equal(payload.summary.projectCount, payload.jobs.length, 'summary/job count mismatch');
    assert.ok(payload.summary.revisedContract >= payload.summary.contractValue - 1, 'approved variations must not reduce contract');
    assert.ok(payload.summary.forecastFinalCost >= payload.summary.actualCost - 1, 'forecast cost must include actual cost');
    const expectedMargin = payload.summary.revisedContract - payload.summary.forecastFinalCost;
    assert.ok(Math.abs(payload.summary.forecastMargin - expectedMargin) < 1, `forecast margin did not reconcile: ${payload.summary.forecastMargin} vs ${expectedMargin}`);
    const expectedPct = payload.summary.revisedContract ? (expectedMargin / payload.summary.revisedContract) * 100 : 0;
    assert.ok(Math.abs(payload.summary.marginPct - expectedPct) < 1, 'margin % did not reconcile');
    assert.ok(payload.costBreakdown.every(c => c.value >= 0), 'negative cost slice');
    return `${payload.jobs.length} jobs · ${payload.costBreakdown.length} cost categories`;
  });

  await check('every job exposes plain-language margin, cost, billing and cash fields', async () => {
    const required = [
      'id', 'name', 'status', 'currency', 'href', 'contractValue', 'approvedVariations',
      'pendingVariations', 'revisedContract', 'budget', 'committed', 'actualCost',
      'costToComplete', 'forecastFinalCost', 'costVariance', 'billed', 'certified',
      'received', 'cashGap', 'earnedValue', 'billingVariance', 'currentMargin',
      'forecastMargin', 'marginPct', 'categories', 'flags', 'missingRates', 'tone', 'statusLabel',
    ];
    for (const job of payload.jobs) {
      for (const key of required) assert.ok(job[key] !== undefined, `job ${job.id || '?'} missing ${key}`);
      assert.match(job.href, /\/m\/projects\?open=/, 'job link must open the project register');
      assert.ok(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'].includes(job.status), `bid/planning job leaked: ${job.status}`);
      assert.ok(['green', 'amber', 'red', 'slate'].includes(job.tone), 'bad health tone');
      assert.ok(job.forecastFinalCost >= job.actualCost - 1, 'job forecast cost below actual');
      assert.ok(Math.abs(job.forecastMargin - (job.revisedContract - job.forecastFinalCost)) < 1, 'job margin did not reconcile');
      assert.ok(job.categories.every(c => c.value >= 0), 'negative job cost category');
    }
    return `${payload.jobs.length} jobs reconciled`;
  });

  await check('profitability page renders summary, table, exceptions and method', async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const mutatingRequests = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(new RegExp(`${slug}/dashboard`), { timeout: 30000 });

    // After login, the cockpit itself must issue no mutating requests.
    page.on('request', r => { if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method())) mutatingRequests.push(`${r.method()} ${r.url()}`); });
    await page.goto(`${BASE}/${slug}/profitability`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('profitability-page').getByRole('heading', { name: 'Job profitability' }).waitFor({ timeout: 30000 });
    await page.getByTestId('nav-profitability').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByTestId('profitability-summary').locator('.card').first().waitFor({ timeout: 30000 });
    assert.equal(await page.getByTestId('profitability-summary').locator('.card').count(), 8, 'expected 8 summary cards');
    await page.getByTestId('profitability-row').first().waitFor({ state: 'visible', timeout: 30000 });
    assert.ok(await page.getByTestId('profitability-row').count() > 0, 'no job rows rendered');
    await page.getByTestId('profitability-exceptions').waitFor({ state: 'visible', timeout: 30000 });

    await page.getByTestId('profitability-method-toggle').click();
    const method = page.getByTestId('profitability-method');
    await method.waitFor({ state: 'visible', timeout: 10000 });
    assert.ok(await method.getByText('Revised contract', { exact: true }).count() > 0, 'method panel missing definitions');
    assert.ok(await method.getByText('Forecast margin', { exact: true }).count() > 0, 'method panel missing forecast margin');
    assert.ok(await page.getByText(/workspace base currency/).count() > 0, 'base-currency note missing');
    assert.equal(await page.locator('main').getByText(/≈/).count(), 0, 'personal conversion leaked into base-currency cockpit');

    await page.goto(`${BASE}/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dashboard-profitability').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('link', { name: /Open job profitability/ }).waitFor({ state: 'visible', timeout: 30000 });

    assert.equal(consoleErrors.length, 0, `browser console errors: ${consoleErrors.join(' | ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
    assert.equal(mutatingRequests.length, 0, `unexpected mutating requests: ${mutatingRequests.join(' | ')}`);
    await context.close();
    return '8 cards · job table · exceptions · method · dashboard CTA · 0 writes · 0 console errors';
  });
} catch (e) {
  failed = true;
  results.push(`ERROR — ${e.message}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  const report = results.join('\n') + `\n\n${results.filter(r => r.startsWith('PASS')).length} PASS / ${results.filter(r => r.startsWith('FAIL') || r.startsWith('ERROR')).length} FAIL\n`;
  fs.writeFileSync(LOG, report);
  console.log(report);
  if (failed) process.exitCode = 1;
}
