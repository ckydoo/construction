/* End-to-end QA for Phase 1: Action Inbox + approval engine.
 * Run against a production build (`npm run start`):
 *   node scripts/workflow-qa.mjs
 * Env: QA_BASE (default http://127.0.0.1:3000), QA_EMAIL / QA_PASSWORD.
 *
 * Creates three throwaway records, exercises guarded transitions, approves via
 * the API and the browser, then soft-deletes all three. Audit, notification and
 * number-sequence cleanup is applied afterwards from /tmp/workflow-qa-ids.json.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.QA_EMAIL || 'owner@kestrelridge.co.zw';
const PASSWORD = process.env.QA_PASSWORD || 'Demo@1234';
const FINANCE_EMAIL = process.env.QA_FINANCE_EMAIL || 'finance@kestrelridge.co.zw';
const OUT = '/tmp/workflow-qa-ids.json';
const LOG = '/tmp/workflow-qa-report.txt';
const stamp = Date.now().toString(36);
const labelBase = `QA Action Inbox ${stamp}`;
const apiLabel = `${labelBase} API`;
const uiLabel = `${labelBase} UI`;
const roleLabel = `${labelBase} Role`;
const today = new Date().toISOString().slice(0, 10);
const weekEnd = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const results = [];
const created = [];
let slug = 'kestrel-ridge';
let orgId = '';
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
function cookieHeader(session) { return [...session.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
async function call(session, pathname, init = {}, withCookie = true) {
  const headers = new Headers(init.headers || {});
  if (withCookie && session.jar.size) headers.set('cookie', cookieHeader(session));
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${pathname}`, {
    ...init, headers, redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(45000),
  });
  if (withCookie) capture(session, res);
  const text = await res.text().catch(() => '');
  let body = {};
  try { body = JSON.parse(text); } catch { /* html / csv */ }
  return { res, body, text };
}
const api = (org, suffix) => `/api/${encodeURIComponent(org)}/${suffix}`;
const get = (s, suffix) => call(s, api(slug, suffix), {});
const post = (s, suffix, body) => call(s, api(slug, suffix), { method: 'POST', body: JSON.stringify(body) });
const patch = (s, suffix, body) => call(s, api(slug, suffix), { method: 'PATCH', body: JSON.stringify(body) });
const del = (s, suffix) => call(s, api(slug, suffix), { method: 'DELETE' });
const anon = makeSession();
const owner = makeSession();
const finance = makeSession();

async function login(s, email, password) {
  const r = await call(s, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(r.res.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.slug, 'missing org slug');
  return r.body;
}
function track(resource, row) {
  assert.ok(row?.id, `${resource}: missing id in ${JSON.stringify(row)}`);
  created.push({ resource, id: row.id, number: row.number });
  return row;
}
async function check(name, fn) {
  try { const detail = await fn(); results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  catch (e) { results.push(`FAIL  ${name} — ${e.message}`); throw e; }
}
async function createTimesheet(name) {
  const r = await post(owner, 'records/timesheets', {
    name, projectId: globalThis.qaProjectId, weekStart: today, weekEnd,
    regularHours: 8, overtimeHours: 0, totalHours: 8, labourCost: 1200,
    currency: 'USD', notes: 'Temporary workflow QA record', status: 'DRAFT',
  });
  assert.equal(r.res.status, 201, JSON.stringify(r.body));
  return track('timesheets', r.body.row);
}

try {
  await check('anonymous callers cannot read or action the queue', async () => {
    const r = await call(anon, api(slug, 'work-items'), {}, false);
    assert.equal(r.res.status, 401, JSON.stringify(r.body));
    const a = await call(anon, api(slug, 'work-items/action'), { method: 'POST', body: JSON.stringify({ resource: 'timesheets', id: 'x', action: 'approve' }) }, false);
    assert.equal(a.res.status, 401, JSON.stringify(a.body));
    return '401 GET · 401 POST';
  });

  await check('owner and finance demo accounts sign in', async () => {
    const o = await login(owner, EMAIL, PASSWORD);
    slug = o.slug;
    const f = await login(finance, FINANCE_EMAIL, PASSWORD);
    assert.equal(o.role, 'OWNER');
    assert.equal(f.role, 'FINANCE_MANAGER');
    return `${slug} · OWNER + FINANCE_MANAGER`;
  });

  await check('workspace metadata and project reference are available', async () => {
    const m = await get(owner, 'meta');
    assert.equal(m.res.status, 200, JSON.stringify(m.body).slice(0, 300));
    orgId = m.body.org?.id || '';
    assert.ok(orgId, 'missing org id');
    const p = await get(owner, 'records/projects?pageSize=1');
    assert.equal(p.res.status, 200, JSON.stringify(p.body).slice(0, 300));
    globalThis.qaProjectId = p.body.rows?.[0]?.id;
    assert.ok(globalThis.qaProjectId, 'no project available for required ref');
    return `${orgId} · ${globalThis.qaProjectId}`;
  });

  let tsApi, tsUi, leave;
  await check('three throwaway pending records are created', async () => {
    tsApi = await createTimesheet(apiLabel);
    tsUi = await createTimesheet(uiLabel);
    const r = await post(owner, 'records/leaveRequests', {
      name: roleLabel, leaveType: 'ANNUAL', startDate: today, endDate: today,
      days: 1, reason: 'Temporary role-guard QA record', status: 'PENDING',
    });
    assert.equal(r.res.status, 201, JSON.stringify(r.body));
    leave = track('leaveRequests', r.body.row);
    return `${tsApi.number} · ${tsUi.number} · ${leave.number}`;
  });

  await check('draft timesheets can move into the approval state', async () => {
    for (const row of [tsApi, tsUi]) {
      const r = await patch(owner, `records/timesheets/${row.id}`, { status: 'SUBMITTED' });
      assert.equal(r.res.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.row.status, 'SUBMITTED');
    }
    return 'DRAFT → SUBMITTED';
  });

  await check('work-items API derives the three items with due/escalation data', async () => {
    const r = await get(owner, 'work-items');
    assert.equal(r.res.status, 200, JSON.stringify(r.body).slice(0, 300));
    assert.ok(r.body.summary && typeof r.body.summary.total === 'number', 'missing summary');
    for (const field of ['overdue', 'dueSoon', 'escalated', 'actionable']) {
      assert.equal(typeof r.body.summary[field], 'number', `missing summary.${field}`);
    }
    const byId = new Map((r.body.items || []).map(i => [i.id, i]));
    for (const row of [tsApi, tsUi, leave]) {
      const item = byId.get(row.id);
      assert.ok(item, `${row.id} missing from queue`);
      assert.ok(item.href.includes(`/m/${item.resource}`), 'bad open link');
      assert.ok(item.canAct, 'owner should be able to act');
      assert.ok(item.actions.length > 0, 'no actions');
      assert.equal(typeof item.escalated, 'boolean', 'missing escalation flag');
    }
    return `${r.body.items.length} total · ${r.body.summary.actionable} actionable`;
  });

  await check('generic PATCH cannot bypass a pending workflow state', async () => {
    const r = await patch(owner, `records/timesheets/${tsApi.id}`, { status: 'POSTED' });
    assert.equal(r.res.status, 400, JSON.stringify(r.body));
    assert.equal(r.body.workflowGuarded, true);
    assert.match(r.body.error, /Use an action button in My work/);
    const still = await get(owner, `records/timesheets/${tsApi.id}`);
    assert.equal(still.body.row.status, 'SUBMITTED');
    return '400 · status unchanged';
  });

  await check('unknown action is refused', async () => {
    const r = await post(owner, 'work-items/action', { resource: 'timesheets', id: tsApi.id, action: 'delete-everything' });
    assert.equal(r.res.status, 400, JSON.stringify(r.body));
    return '400 unknown action';
  });

  await check('a non-approver role cannot approve or force a status', async () => {
    const action = await post(finance, 'work-items/action', { resource: 'leaveRequests', id: leave.id, action: 'approve' });
    assert.equal(action.res.status, 403, JSON.stringify(action.body));
    const edit = await patch(finance, `records/leaveRequests/${leave.id}`, { status: 'APPROVED' });
    assert.equal(edit.res.status, 403, JSON.stringify(edit.body));
    return '403 action · 403 direct edit';
  });

  await check('one explicit action approves the record and writes audit + notification', async () => {
    const r = await post(owner, 'work-items/action', { resource: 'timesheets', id: tsApi.id, action: 'approve' });
    assert.equal(r.res.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.row.status, 'APPROVED');
    assert.equal(r.body.action.to, 'APPROVED');
    const meta = await get(owner, 'meta');
    assert.ok((meta.body.audit || []).some(a => String(a.detail).includes('Timesheet approved for job costing') && String(a.detail).includes(apiLabel)), 'approval missing from audit trail');
    assert.ok((meta.body.notifications || []).some(n => String(n.body).includes(apiLabel)), 'approval notification missing');
    return `${r.body.row.number} → APPROVED`;
  });

  await check('a second decision on the same record is idempotently refused', async () => {
    const r = await post(owner, 'work-items/action', { resource: 'timesheets', id: tsApi.id, action: 'approve' });
    assert.equal(r.res.status, 409, JSON.stringify(r.body));
    const q = await get(owner, 'work-items');
    assert.ok(!(q.body.items || []).some(i => i.id === tsApi.id), 'approved item still in queue');
    assert.ok((q.body.items || []).some(i => i.id === tsUi.id), 'UI item should remain pending');
    return '409 · removed from queue';
  });

  await check('My work page renders the queue and nav badge', async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(new RegExp(`${slug}/dashboard`), { timeout: 30000 });

    await page.goto(`${BASE}/${slug}/my-work`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('my-work-page').getByRole('heading', { name: 'My work' }).waitFor({ timeout: 30000 });
    await page.getByTestId('nav-my-work').waitFor({ state: 'visible', timeout: 30000 });
    assert.ok(await page.getByTestId('nav-my-work-count').count() > 0, 'actionable badge missing');
    await page.getByTestId('work-item').first().waitFor({ state: 'visible', timeout: 30000 });
    assert.ok(await page.getByTestId('work-item').count() > 0, 'no work items rendered');
    const card = page.getByTestId('work-item').filter({ hasText: uiLabel });
    await card.waitFor({ state: 'visible', timeout: 30000 });
    assert.ok(await card.getByRole('button', { name: 'Approve', exact: true }).count() === 1, 'approve button missing');

    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByText('Approve · done').waitFor({ timeout: 30000 });
    await card.waitFor({ state: 'detached', timeout: 30000 });
    const approved = await get(owner, `records/timesheets/${tsUi.id}`);
    assert.equal(approved.body.row.status, 'APPROVED', 'UI action did not persist');

    await page.getByTestId('workflow-rules-toggle').click();
    const rules = page.getByTestId('workflow-rules');
    await rules.waitFor({ state: 'visible', timeout: 10000 });
    assert.ok(await rules.getByText('Time sheets', { exact: true }).count() > 0, 'rules panel empty');
    assert.ok(await rules.getByText('Expense claims', { exact: true }).count() > 0, 'rules missing expense approvals');

    await page.goto(`${BASE}/${slug}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('dashboard-my-work').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('link', { name: /Open My work/ }).waitFor({ state: 'visible', timeout: 30000 });
    assert.ok(await page.getByRole('link', { name: /Open My work/ }).count() > 0, 'dashboard CTA missing');
    assert.equal(consoleErrors.length, 0, `browser console errors: ${consoleErrors.join(' | ')}`);
    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
    await context.close();
    return 'queue · one-click approve · rules · dashboard CTA · 0 console errors';
  });

  await check('all temporary records are soft-deleted through the API', async () => {
    for (const item of [...created].reverse()) {
      const r = await del(owner, `records/${item.resource}/${item.id}`);
      assert.equal(r.res.status, 200, `${item.resource}: ${JSON.stringify(r.body)}`);
    }
    const q = await get(owner, 'work-items');
    for (const marker of [apiLabel, uiLabel, roleLabel]) {
      assert.ok(!(q.body.items || []).some(i => String(i.title).includes(marker)), `${marker} still in queue`);
    }
    return `${created.length} records · queue clean`;
  });
} catch (e) {
  failed = true;
  results.push(`ERROR — ${e.message}`);
} finally {
  // Best-effort cleanup even if an assertion failed mid-run.
  for (const item of [...created].reverse()) {
    try { await del(owner, `records/${item.resource}/${item.id}`); } catch { /* noop */ }
  }
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(OUT, JSON.stringify({
    orgSlug: slug, orgId, labelBase, stamp, created,
    sequencesToRestore: { timesheets: 82, leaveRequests: 37 },
  }, null, 2));
  const report = results.join('\n') + `\n\n${results.filter(r => r.startsWith('PASS')).length} PASS / ${results.filter(r => r.startsWith('FAIL') || r.startsWith('ERROR')).length} FAIL\n`;
  fs.writeFileSync(LOG, report);
  console.log(report);
  if (failed) process.exitCode = 1;
}
