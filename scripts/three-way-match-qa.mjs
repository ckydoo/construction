/* End-to-end QA for Phase 3: three-way procure-to-pay match cockpit.
 * Read-only: creates no records and requires no database cleanup.
 * Run against a production build: node scripts/three-way-match-qa.mjs
 * Env: QA_BASE (default http://127.0.0.1:3000), QA_EMAIL / QA_PASSWORD.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.QA_EMAIL || 'owner@kestrelridge.co.zw';
const PASSWORD = process.env.QA_PASSWORD || 'Demo@1234';
const LOG = '/tmp/three-way-match-qa-report.txt';
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
  await check('anonymous caller cannot read the three-way match', async () => {
    const r = await call(anon, api(slug, 'three-way-match'), {}, false);
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
  await check('three-way match API returns a reconciled, no-store payload', async () => {
    const r = await get('three-way-match');
    assert.equal(r.res.status, 200, JSON.stringify(r.body).slice(0, 400));
    assert.match(r.res.headers.get('cache-control') || '', /no-store/i);
    payload = r.body;
    assert.equal(payload.base, 'USD', 'workspace base currency should be USD');
    assert.ok(payload.currency && Array.isArray(payload.currency.missingRates), 'missing currency envelope');
    assert.ok(payload.currency && payload.currency.rates && typeof payload.currency.rates === 'object', 'missing manual rates');
    assert.ok(payload.summary && typeof payload.summary.orders === 'number', 'missing summary');
    assert.ok(Array.isArray(payload.groups) && payload.groups.length > 0, 'no purchase orders returned');
    assert.ok(Array.isArray(payload.orphans?.bills) && Array.isArray(payload.orphans?.receipts), 'missing orphan envelopes');
    assert.equal(payload.summary.orders, payload.groups.length, 'summary/order count mismatch');
    assert.equal(payload.summary.orphanBills, payload.orphans.bills.length, 'orphan bill count mismatch');
    assert.equal(payload.summary.orphanReceipts, payload.orphans.receipts.length, 'orphan receipt count mismatch');
    assert.equal(payload.summary.missingRates, payload.currency.missingRates.length, 'missing-rate count mismatch');
    assert.equal(payload.summary.tolerancePct, 2, 'tolerance should be 2%');
    assert.ok(!Number.isNaN(Date.parse(payload.generatedAt)), 'invalid generatedAt');
    return `${payload.groups.length} orders · ${payload.orphans.bills.length} orphan bills · ${payload.orphans.receipts.length} orphan deliveries`;
  });

  await check('every order reconciles stage, status, quantities and money', async () => {
    const required = [
      'id', 'status', 'poId', 'poNumber', 'poTitle', 'poStatus', 'vendorName', 'projectName',
      'currency', 'href', 'stage', 'stageLabel', 'orderValue', 'orderedQty', 'receivedQty',
      'quantityVariance', 'receiptCount', 'acceptedReceiptCount', 'disputedReceiptCount',
      'billCount', 'postedBillCount', 'draftBillCount', 'billedAmount', 'paidAmount',
      'outstandingAmount', 'priceVariance', 'variancePct', 'tolerance', 'flags',
      'recommendation', 'tone', 'statusLabel', 'documents', 'missingRates',
    ];
    const statuses = { MATCHED: 0, REVIEW: 0, BLOCKED: 0, AWAITING: 0 };
    const toneFor = { MATCHED: 'green', REVIEW: 'amber', BLOCKED: 'red', AWAITING: 'slate' };
    for (const g of payload.groups) {
      for (const key of required) assert.ok(g[key] !== undefined, `order ${g.id || '?'} missing ${key}`);
      assert.ok(['MATCHED', 'REVIEW', 'BLOCKED', 'AWAITING'].includes(g.status), `bad status ${g.status}`);
      statuses[g.status]++;
      assert.equal(g.tone, toneFor[g.status], `tone does not match ${g.status}`);
      assert.match(g.href, /\/m\/purchaseOrders\?open=/, 'order link must open the purchase order register');
      assert.ok(Array.isArray(g.flags) && Array.isArray(g.documents) && Array.isArray(g.missingRates), 'bad array field');
      assert.ok(g.documents.length >= 1 && g.documents[0].type === 'ORDER', 'missing linked order document');
      assert.ok([1, 2, 3].includes(g.stage), 'bad match stage');
      const expectedStage = g.acceptedReceiptCount && g.postedBillCount ? 3
        : (g.acceptedReceiptCount || g.postedBillCount) ? 2 : 1;
      assert.equal(g.stage, expectedStage, `stage ${g.stage} does not match linked documents`);
      const expectedVariance = g.postedBillCount > 0 ? g.billedAmount - g.orderValue : 0;
      assert.ok(Math.abs(g.priceVariance - expectedVariance) < 0.02, `price variance did not reconcile on ${g.id}`);
      const expectedPct = g.orderValue ? (expectedVariance / g.orderValue) * 100 : 0;
      assert.ok(Math.abs(g.variancePct - expectedPct) < 0.02, `variance % did not reconcile on ${g.id}`);
      assert.ok(g.outstandingAmount >= 0 && g.tolerance >= 0, 'negative money/tolerance');
      if (g.orderedQty !== null && g.receivedQty !== null) {
        assert.equal(g.quantityVariance, g.receivedQty - g.orderedQty, 'quantity variance did not reconcile');
      }
      if (g.status === 'MATCHED') assert.equal(g.flags.length, 0, 'matched order carries exceptions');
    }
    assert.equal(payload.summary.matched, statuses.MATCHED, 'matched count mismatch');
    assert.equal(payload.summary.review, statuses.REVIEW, 'review count mismatch');
    assert.equal(payload.summary.blocked, statuses.BLOCKED, 'blocked count mismatch');
    assert.equal(payload.summary.awaiting, statuses.AWAITING, 'awaiting count mismatch');
    assert.equal(statuses.MATCHED + statuses.REVIEW + statuses.BLOCKED + statuses.AWAITING, payload.groups.length, 'status totals mismatch');
    return `${payload.groups.length} orders reconciled · ${statuses.BLOCKED} blocked · ${statuses.REVIEW} review · ${statuses.AWAITING} awaiting`;
  });

  await check('three-way match page renders summary, table, exceptions, orphans and method', async () => {
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
    await page.goto(`${BASE}/${slug}/three-way-match`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('three-way-page').getByRole('heading', { name: 'Three-way match' }).waitFor({ timeout: 30000 });
    await page.getByTestId('nav-three-way-match').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByTestId('three-way-summary').locator('.card').first().waitFor({ timeout: 30000 });
    assert.equal(await page.getByTestId('three-way-summary').locator('.card').count(), 8, 'expected 8 summary cards');
    await page.getByTestId('three-way-row').first().waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.getByTestId('three-way-row').count(), payload.groups.length, 'table did not render every order');
    await page.getByTestId('three-way-exceptions').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByTestId('three-way-orphans').waitFor({ state: 'visible', timeout: 30000 });

    await page.getByTestId('three-way-method-toggle').click();
    const method = page.getByTestId('three-way-method');
    await method.waitFor({ state: 'visible', timeout: 10000 });
    assert.ok(await method.getByText('Three-way match', { exact: true }).count() > 0, 'method panel missing three-way match definition');
    assert.ok(await method.getByText('Price tolerance', { exact: true }).count() > 0, 'method panel missing price tolerance');
    assert.ok(await method.getByText('Module access', { exact: true }).count() > 0, 'method panel missing module access');
    assert.ok(await page.getByText(/workspace base currency/).count() > 0, 'base-currency note missing');
    assert.equal(await page.locator('main').getByText(/≈/).count(), 0, 'personal conversion leaked into base-currency cockpit');

    await page.getByTestId('three-way-page').getByRole('button', { name: /Blocked/ }).click();
    const blockedRows = await page.getByTestId('three-way-row').count();
    if (payload.summary.blocked > 0) assert.equal(blockedRows, payload.summary.blocked, 'blocked filter did not match API summary');
    else assert.equal(blockedRows, 0, 'blocked filter should be empty');
    await page.getByTestId('three-way-page').getByRole('button', { name: /All orders/ }).click();
    await page.getByTestId('three-way-row').first().waitFor({ state: 'visible', timeout: 10000 });

    const first = payload.groups[0];
    if (first?.poNumber) {
      await page.getByLabel('Search orders').fill(first.poNumber);
      await page.getByTestId('three-way-row').first().waitFor({ state: 'visible', timeout: 10000 });
      const rows = await page.getByTestId('three-way-row').count();
      assert.ok(rows >= 1 && rows <= payload.groups.length, `search returned ${rows} rows`);
      assert.ok((await page.getByTestId('three-way-row').first().innerText()).includes(first.poNumber), 'search did not keep the matching order');
      await page.getByLabel('Search orders').fill('');
    }
    const sort = page.getByLabel('Sort orders');
    await sort.selectOption('value');
    assert.equal(await sort.inputValue(), 'value', 'sort picker did not change');
    await sort.selectOption('variance');

    await page.goto(`${BASE}/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dashboard-three-way-match').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('link', { name: /Open three-way match/ }).waitFor({ state: 'visible', timeout: 30000 });

    assert.equal(consoleErrors.length, 0, `browser console errors: ${consoleErrors.join(' | ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
    assert.equal(mutatingRequests.length, 0, `unexpected mutating requests: ${mutatingRequests.join(' | ')}`);
    await context.close();
    return '8 cards · order table · exceptions · orphans · method · filters/search/sort · dashboard CTA · 0 writes · 0 console errors';
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
