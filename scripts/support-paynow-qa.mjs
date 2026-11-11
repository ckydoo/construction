/* Support desk + Paynow-primary QA.
 * - `SUPPORT_QA_MODE=create` (default) submits one ticket in the isolated tester
 *   workspace, comments on it and exercises admin status/priority/assignee.
 * - `SUPPORT_QA_MODE=verify QA_BASE=...` reads the marker and verifies the same
 *   record through the deployed app without creating another ticket.
 * Billing stays disabled; no live payment call or production env change is made. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, request } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const MODE = process.env.SUPPORT_QA_MODE === 'verify' ? 'verify' : 'create';
const MARKER = '/home/user/support-paynow-marker.json';
const account = JSON.parse(fs.readFileSync('TESTER_ACCOUNT.json', 'utf8'));
const read = p => fs.readFileSync(p, 'utf8');
const results = [];
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

async function waitTicket(api, slug, predicate, label) {
  for (let i = 0; i < 40; i++) {
    const r = await api.get(`/api/${encodeURIComponent(slug)}/support`, { timeout: 20000 });
    const body = await r.json();
    const ticket = (body.tickets || []).find(predicate);
    if (ticket) return ticket;
    await sleep(300);
  }
  throw new Error(label);
}

await check('dedicated support tables and RLS policies are present', async () => {
  const sql = read('supabase/migrations/20261111183948_support_tickets_v1.sql');
  for (const needle of [
    'create table if not exists public.support_tickets',
    'create table if not exists public.support_ticket_comments',
    'enable row level security', 'support_tickets_select', 'support_tickets_insert',
    'support_tickets_update', 'support_ticket_comments_select',
    'support_ticket_comments_insert', 'No delete policy',
  ]) assert.ok(sql.includes(needle), `migration missing ${needle}`);
  const catalogue = read('src/lib/catalog.ts') + read('src/lib/resources.ts');
  assert.doesNotMatch(catalogue, /supportTickets|id:\s*['"]support['"]/, 'support must not become a starter module/resource');
  return '2 tables · 5 policies · no catalogue resource';
});

await check('support desk routes, UI and navigation are wired', async () => {
  for (const p of [
    'src/app/[org]/support/layout.tsx', 'src/app/[org]/support/page.tsx',
    'src/app/api/[org]/support/route.ts', 'src/app/api/[org]/support/[ticket]/comments/route.ts',
    'src/components/SupportDesk.tsx', 'src/lib/support.ts',
  ]) assert.ok(fs.existsSync(p), `${p} is missing`);
  const shell = read('src/components/AppShell.tsx');
  assert.match(shell, /id:'support', label:'Help & support'.*href:'\/support'/);
  assert.match(shell, /support:'Help & support'/);
  const visibility = read('src/lib/module-visibility.ts');
  assert.match(visibility, /special === 'support'\) return true/);
  const desk = read('src/components/SupportDesk.tsx');
  for (const needle of ['Report a bug or issue', 'Workspace ticket history', 'support-status-select', 'support-assignee-select', 'support-comment-input', 'Conversation'])
    assert.ok(desk.includes(needle), `support UI missing ${needle}`);
  return 'form · history · status/priority/assignee · comments · nav';
});

await check('Paynow is primary in runtime code and UI', async () => {
  const billing = read('src/lib/billing.ts');
  assert.match(billing, /export function primaryGateway\(\): BillingGateway \{\s*return 'paynow';/);
  assert.match(billing, /primaryGateway: 'paynow' as const, paynowPrimary: true/);
  assert.match(billing, /paynowLiveReady\(\) \|\| dpoLiveReady\(\)/);
  const page = read('src/app/[org]/billing/page.tsx');
  assert.match(page, /Pay with Paynow/);
  assert.match(page, /Billing is not active yet/);
  assert.match(page, /Payment options/);
  assert.doesNotMatch(page, /Shadow mode|primary subscription rail|webhooks|tokenisation|environment keys|callback secrets|Stripe was removed|grandfathered comped|BILLING_ENABLED|DPO fallback configured|Saved DPO payment token/);
  assert.doesNotMatch(page, /DPO Pay primary/);
  const cron = read('src/lib/billing-cron.ts');
  assert.match(cron, /Paynow invoice will be ready/);
  assert.match(cron, /Pay USD .* by Paynow/);
  return 'primaryGateway paynow · plain-language billing UI';
});

await check('DPO code, webhooks, env keys and fallback QA remain configured', async () => {
  for (const p of [
    'src/lib/dpo-billing.ts', 'src/app/api/webhooks/dpo/route.ts',
    'src/app/api/qa/billing/dpo/route.ts', 'src/app/api/qa/billing/dpo-checkout/route.ts',
    'scripts/billing-audit.mjs', 'scripts/dpo-production-smoke.mjs',
  ]) assert.ok(fs.existsSync(p), `${p} is missing`);
  const env = read('.env.example');
  for (const key of [
    'DPO_LIVE_MODE', 'DPO_RECURRING_ENABLED', 'DPO_COMPANY_TOKEN', 'DPO_SERVICE_TYPE',
    'DPO_SERVICE_TYPE_NAME', 'DPO_CALLBACK_SECRET', 'DPO_PUSH_SECRET',
    'DPO_API_URL', 'DPO_PAYMENT_URL_TEMPLATE', 'PAYNOW_INTEGRATION_ID', 'PAYNOW_INTEGRATION_KEY',
  ]) assert.match(env, new RegExp(`^${key}=`, 'm'), `${key} missing`);
  const audit = read('scripts/billing-audit.mjs');
  assert.match(audit, /setGatewayPreference/, 'DPO fallback QA must explicitly select DPO');
  const local = read('.env');
  const enabled = local.match(/^BILLING_ENABLED\s*=\s*(.*)$/m)?.[1]?.replace(/["']/g, '').trim();
  assert.equal(enabled, 'false', 'local billing must stay disabled');
  return 'DPO adapter/webhooks/QA/env retained · billing disabled';
});

const api = await request.newContext({ baseURL: BASE });
const browser = await chromium.launch({ headless: true });
let ctx;
let page;
try {
  await check('tester owner can sign in', async () => {
    const r = await api.post('/api/auth/login', { data: { email: account.email, password: account.password } });
    assert.equal(r.status(), 200, await r.text());
    const body = await r.json();
    assert.equal(body.slug, account.slug);
    assert.equal(body.role, 'OWNER');
    return `${account.slug} · OWNER`;
  });

  await check('starter module/list counts are unchanged', async () => {
    const r = await api.get(`/api/${encodeURIComponent(account.slug)}/meta`);
    assert.equal(r.status(), 200, await r.text());
    const meta = await r.json();
    assert.equal(meta.modules.length, 13);
    assert.equal(meta.resources.length, 19);
    return '13 sections · 19 lists';
  });

  await check('billing API reports Paynow primary while shadow mode stays off', async () => {
    const r = await api.get(`/api/${encodeURIComponent(account.slug)}/billing`);
    assert.equal(r.status(), 200, await r.text());
    const body = await r.json();
    assert.equal(body.billing.enabled, false);
    assert.equal(body.billing.mode, 'off');
    assert.equal(body.billing.primaryGateway, 'paynow');
    assert.equal(body.billing.paynowPrimary, true);
    assert.equal(body.config.primaryGateway, 'paynow');
    assert.equal(body.config.dpoCheckoutAvailable, false);
    return 'off · Paynow primary · no live checkout';
  });

  await check('support API enforces an admin-scoped workspace view', async () => {
    const r = await api.get(`/api/${encodeURIComponent(account.slug)}/support`);
    assert.equal(r.status(), 200, await r.text());
    const body = await r.json();
    assert.ok(Array.isArray(body.tickets));
    assert.equal(body.canManage, true);
    assert.ok(Array.isArray(body.users));
    return `${body.tickets.length} visible ticket(s) · ${body.users.length} assignable user(s)`;
  });

  const state = await api.storageState();
  ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 960 } });
  page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

  await check('support desk opens from the workspace shell', async () => {
    const r = await page.goto(`${BASE}/${encodeURIComponent(account.slug)}/support`, { waitUntil: 'domcontentloaded' });
    assert.equal(r?.status(), 200);
    await page.getByTestId('support-page').waitFor({ timeout: 20000 });
    await page.waitForFunction(() => (document.querySelector('aside nav')?.innerText || '').trim().length > 12, null, { timeout: 20000 });
    const sidebar = await page.locator('aside nav').innerText();
    assert.match(sidebar, /Help & support/);
    await page.getByRole('heading', { name: 'Workspace ticket history' }).waitFor({ timeout: 20000 });
    const body = await page.locator('body').innerText();
    assert.match(body, /Workspace ticket history/);
    assert.match(body, /Owners and admins see every ticket/);
    return '200 · nav · history';
  });

  if (MODE === 'create') {
    const stamp = Date.now().toString(36);
    const title = `Support QA ${stamp} — invoice total bug`;
    const description = `Steps to reproduce ${stamp}: open a client invoice, edit a line item, then save. The displayed total does not refresh until a full page reload. Expected the total to update immediately.`;
    const comment = `QA update ${stamp}: reproduced in the tester workspace and attached to the support history.`;
    let ticketId = '';
    let ticketNo = '';
    let assignedTo = null;

    await check('bug report creates a numbered workspace ticket', async () => {
      await page.getByTestId('new-support-ticket').click();
      await page.getByTestId('support-report-form').waitFor();
      await page.getByTestId('support-title').fill(title);
      await page.getByTestId('support-description').fill(description);
      await page.getByTestId('support-category').selectOption('BUG');
      await page.getByTestId('support-priority').selectOption('HIGH');
      await page.getByRole('button', { name: 'Submit ticket' }).click();
      const row = page.getByTestId('support-ticket-row').filter({ hasText: title }).first();
      await row.waitFor({ timeout: 20000 });
      ticketNo = await row.getAttribute('data-ticket-no');
      assert.match(ticketNo || '', /^SUP-\d{4}$/);
      const ticket = await waitTicket(api, account.slug, t => t.title === title, 'new ticket did not appear in API');
      ticketId = ticket.id;
      assert.equal(ticket.category, 'BUG');
      assert.equal(ticket.priority, 'HIGH');
      assert.equal(ticket.status, 'OPEN');
      return `${ticketNo} · BUG · HIGH · OPEN`;
    });

    await check('comments are stored on the dedicated ticket thread', async () => {
      await page.getByTestId('support-comment-input').fill(comment);
      await page.getByRole('button', { name: 'Post update' }).click();
      await page.getByTestId('support-comment').filter({ hasText: comment }).waitFor({ timeout: 20000 });
      const r = await api.get(`/api/${encodeURIComponent(account.slug)}/support?ticket=${encodeURIComponent(ticketId)}`);
      assert.equal(r.status(), 200, await r.text());
      const body = await r.json();
      assert.ok(body.comments.some(c => c.body === comment), 'comment missing from API');
      return '1 update · persisted via support_ticket_comments';
    });

    await check('owner can set status, priority and assignee', async () => {
      await page.getByTestId('support-status-select').selectOption('IN_PROGRESS');
      await waitTicket(api, account.slug, t => t.id === ticketId && t.status === 'IN_PROGRESS', 'status did not update');
      await page.getByTestId('support-detail-priority-select').selectOption('CRITICAL');
      await waitTicket(api, account.slug, t => t.id === ticketId && t.priority === 'CRITICAL', 'priority did not update');
      const select = page.getByTestId('support-assignee-select');
      const options = await select.locator('option').evaluateAll(els => els.map(e => e.value).filter(Boolean));
      assert.ok(options.length, 'no workspace assignees');
      assignedTo = options[0];
      await select.selectOption(assignedTo);
      const ticket = await waitTicket(api, account.slug, t => t.id === ticketId && t.assigned_to === assignedTo, 'assignee did not update');
      assert.ok(ticket.assigned_to_name);
      return 'IN_PROGRESS · CRITICAL · assigned';
    });

    fs.writeFileSync(MARKER, JSON.stringify({
      slug: account.slug, ticketId, ticketNo, title, description, comment,
      status: 'IN_PROGRESS', priority: 'CRITICAL', assignedTo, createdAt: new Date().toISOString(),
    }, null, 2));
    await check('production verification marker is written outside the repo', async () => {
      assert.ok(fs.existsSync(MARKER));
      return MARKER;
    });
  } else {
    await check('deployed app shows the existing support ticket and thread', async () => {
      assert.ok(fs.existsSync(MARKER), `${MARKER} is missing; run create mode first`);
      const marker = JSON.parse(fs.readFileSync(MARKER, 'utf8'));
      const r = await page.goto(`${BASE}/${encodeURIComponent(marker.slug)}/support?ticket=${encodeURIComponent(marker.ticketId)}`, { waitUntil: 'domcontentloaded' });
      assert.equal(r?.status(), 200);
      await page.waitForFunction(() => (document.querySelector('aside nav')?.innerText || '').trim().length > 12, null, { timeout: 20000 });
      await page.getByTestId('support-ticket-detail').waitFor({ timeout: 20000 });
      await page.getByText(marker.title).first().waitFor({ timeout: 20000 });
      await page.getByTestId('support-comment').filter({ hasText: marker.comment }).waitFor({ timeout: 20000 });
      const detail = await page.getByTestId('support-ticket-detail').innerText();
      assert.match(detail, /In progress/i);
      assert.match(detail, /Critical priority/i);
      const apiCheck = await api.get(`/api/${encodeURIComponent(marker.slug)}/support?ticket=${encodeURIComponent(marker.ticketId)}`);
      assert.equal(apiCheck.status(), 200, await apiCheck.text());
      const body = await apiCheck.json();
      const ticket = body.tickets.find(t => t.id === marker.ticketId);
      assert.ok(ticket, 'ticket missing from deployed API');
      assert.equal(ticket.status, marker.status);
      assert.equal(ticket.priority, marker.priority);
      assert.equal(ticket.assigned_to, marker.assignedTo);
      assert.ok(body.comments.some(c => c.body === marker.comment));
      return `${marker.ticketNo} · status/priority/assignee · 1 comment`;
    });
  }

  await check('no console errors or failed requests on support/billing surfaces', async () => {
    assert.equal(errors.length, 0, errors.slice(0, 3).join(' | '));
    return '0 console/page/request errors';
  });
} finally {
  if (ctx) await ctx.close();
  await browser.close();
  await api.dispose();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\nSupport + Paynow QA (${MODE}): ${results.length - failed}/${results.length} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}
