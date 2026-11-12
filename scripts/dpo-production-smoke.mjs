/* Focused production smoke for the live Paynow-primary USD 6/14/26 billing
 * release, with the retained DPO Pay fallback left unconfigured.
 * It uses only the demo owner account, makes no payment calls, creates no
 * charges, and does not print cookies or secret values. Run after promoting the
 * explicit-SHA Vercel deployment:
 *   DPO_PROD_BASE=https://myla-construction-erp.vercel.app npm run audit:dpo-prod
 * Optional report metadata: DPO_PROD_SHA, DPO_PROD_DEPLOYMENT_ID,
 * DPO_PROD_STATE and DPO_PROD_DATE.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.DPO_PROD_BASE || 'https://myla-construction-erp.vercel.app').replace(/\/$/, '');
const DEPLOY_SHA = (process.env.DPO_PROD_SHA || '').trim();
const DEPLOY_ID = (process.env.DPO_PROD_DEPLOYMENT_ID || '').trim();
const DEPLOY_STATE = (process.env.DPO_PROD_STATE || 'READY/PROMOTED').trim();
const RUN_DATE = (process.env.DPO_PROD_DATE || new Date().toISOString()).trim();
const ORG = 'kestrel-ridge';
const OWNER = { email: 'owner@kestrelridge.co.zw', password: 'Demo@1234' };
const REPORT = path.join(process.cwd(), 'DPO_PRODUCTION_SMOKE.md');
const jar = new Map();
const results = [];

function capture(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/, (?=\S+=)/).filter(Boolean);
  for (const raw of list) {
    const pair = String(raw).split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}
function cookieHeader() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }

async function request(pathname, init = {}) {
  const headers = new Headers(init.headers || {});
  if (jar.size) headers.set('cookie', cookieHeader());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const target = /^https?:\/\//.test(pathname) ? pathname : `${BASE}${pathname}`;
  const res = await fetch(target, {
    ...init, headers, redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  capture(res);
  const text = await res.text().catch(() => '');
  let body = {};
  try { body = JSON.parse(text); } catch { /* HTML or XML */ }
  return { res, body, text };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || 'PASS' });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.error(`FAIL  ${name} — ${e.message}`);
    throw e;
  }
}

let failed = false;
try {
  await check('login page renders', async () => {
    const r = await request('/login');
    assert.equal(r.res.status, 200);
    assert.match(r.text, /MYLA/i);
    return '200 · MYLA brand';
  });
  await check('demo owner can sign in', async () => {
    const r = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(OWNER) });
    assert.equal(r.res.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(r.body.slug, ORG);
    assert.equal(r.body.role, 'OWNER');
    return `${ORG} · OWNER`;
  });
  await check('bad password is rejected', async () => {
    const r = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ ...OWNER, password: 'Wrong@1234' }) });
    assert.equal(r.res.status, 401);
    return '401';
  });
  for (const [label, url] of [
    ['dashboard', `/${ORG}/dashboard`],
    ['billing page', `/${ORG}/billing`],
    ['settings', `/${ORG}/settings`],
    ['support desk', `/${ORG}/support`],
    ['library', `/${ORG}/library`],
    ['reports', `/${ORG}/reports`],
  ]) {
    await check(`${label} renders`, async () => {
      const r = await request(url);
      assert.equal(r.res.status, 200);
      return '200';
    });
  }
  await check('billing API is live with the USD 6/14/26 price book and an open invoice', async () => {
    const r = await request(`/api/${ORG}/billing`);
    assert.equal(r.res.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.billing.mode, 'live');
    assert.equal(r.body.billing.enabled, true);
    assert.equal(r.body.billing.status, 'active');
    assert.equal(r.body.billing.comped, false);
    assert.equal(r.body.billing.primaryGateway, 'paynow');
    assert.equal(r.body.billing.paynowPrimary, true);
    assert.equal(r.body.billing.paynowAvailable, true);
    assert.equal(r.body.config.primaryGateway, 'paynow');
    assert.equal(r.body.billing.trialDays, 7);
    assert.equal(r.body.billing.trialRequiresCard, false);
    assert.equal(r.body.billing.priceBookVersion, 'USD_6_14_26_V1');
    assert.equal(r.body.billing.planChangePolicy, 'upgrade_immediate_prorated_downgrade_period_end');
    assert.deepEqual(r.body.billing.plans.map((p) => p.priceUsd), [6, 14, 26]);
    assert.ok(r.body.billing.paymentDueAt, 'one payable invoice is present');
    assert.equal(r.body.config.dpoCheckoutAvailable, false);
    assert.equal(r.body.config.stripeCheckoutAvailable, false);
    assert.equal(r.body.config.dpoRecurringEnabled, false);
    return 'live · active · Paynow primary · 6/14/26 · 7-day policy · no charge';
  });
  await check('meta still exposes 31 modules / 46 resources', async () => {
    const r = await request(`/api/${ORG}/meta`);
    assert.equal(r.res.status, 200, JSON.stringify(r.body).slice(0, 240));
    assert.equal(r.body.modules.length, 31);
    assert.equal(r.body.resources.length, 46);
    assert.equal(r.body.billing.mode, 'live');
    assert.equal(r.body.billing.status, 'active');
    return '31 modules · 46 resources · live billing';
  });
  for (const [label, url] of [
    ['overview API', `/api/${ORG}/overview`],
    ['wallets API', `/api/${ORG}/wallets`],
    ['clients API', `/api/${ORG}/records/clients`],
  ]) {
    await check(`${label} returns 200`, async () => {
      const r = await request(url);
      assert.equal(r.res.status, 200);
      return '200';
    });
  }
  await check('support desk API returns the workspace ticket history', async () => {
    const r = await request(`/api/${ORG}/support`);
    assert.equal(r.res.status, 200, JSON.stringify(r.body).slice(0, 240));
    assert.ok(Array.isArray(r.body.tickets), 'tickets array');
    assert.equal(r.body.canManage, true);
    return `${r.body.tickets.length} visible ticket(s)`;
  });
  await check('integrity API reports a clean workspace', async () => {
    const r = await request(`/api/${ORG}/integrity`);
    assert.equal(r.res.status, 200, JSON.stringify(r.body).slice(0, 240));
    assert.equal(r.body.ok, true);
    assert.equal(Array.isArray(r.body.brokenRefs) ? r.body.brokenRefs.length : 0, 0);
    return 'ok · 0 broken refs';
  });
  await check('invalid plan change is rejected without a charge', async () => {
    const r = await request(`/api/${ORG}/billing`, {
      method: 'POST', body: JSON.stringify({ action: 'changePlan', planId: 'INVALID' }),
    });
    assert.equal(r.res.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error || '', /Choose Starter, Pro or Enterprise/i);
    return '400 · no plan change, invoice or charge created';
  });
  await check('cron endpoint rejects an unauthorised caller', async () => {
    const r = await request('/api/cron/billing', { method: 'POST' });
    assert.equal(r.res.status, 401);
    return '401 · CRON_SECRET enforced';
  });
  await check('DPO QA state route is unavailable in production', async () => {
    const r = await request(`/api/qa/billing/state?org=${ORG}`);
    assert.equal(r.res.status, 404);
    return '404';
  });
  await check('DPO mock checkout route is unavailable in production', async () => {
    const r = await request('/api/qa/billing/dpo-checkout');
    assert.equal(r.res.status, 404);
    return '404';
  });
  await check('DPO mock callback route is unavailable in production', async () => {
    const r = await request('/api/qa/billing/dpo', { method: 'POST', body: '{}' });
    assert.equal(r.res.status, 404);
    return '404';
  });
  await check('QA expire route is unavailable in production', async () => {
    const r = await request('/api/qa/billing/expire', { method: 'POST', body: '{}' });
    assert.equal(r.res.status, 404);
    return '404';
  });
  for (const [label, url] of [
    ['Stripe checkout stub', `/api/${ORG}/billing/checkout`],
    ['Stripe portal stub', `/api/${ORG}/billing/portal`],
    ['Stripe switch stub', `/api/${ORG}/billing/switch`],
    ['Stripe webhook stub', '/api/webhooks/stripe'],
  ]) {
    await check(`${label} returns 410`, async () => {
      const r = await request(url, { method: 'POST', body: '{}' });
      assert.equal(r.res.status, 410, JSON.stringify(r.body));
      return '410 · removed';
    });
  }
  await check('DPO push callback fails closed while the fallback is unconfigured', async () => {
    const r = await request('/api/webhooks/dpo', { method: 'POST', body: '' });
    assert.equal(r.res.status, 503);
    assert.match(r.text, /ERROR/);
    return '503 · ERROR XML · no charge';
  });
  await check('DPO return callback redirects safely without a valid transaction', async () => {
    const r = await request('/api/webhooks/dpo?source=return&reference=probe&sig=invalid');
    assert.equal(r.res.status, 307);
    assert.match(r.res.headers.get('location') || '', /\/login/);
    return '307 · /login?dpo=error';
  });
} catch {
  failed = true;
} finally {
  const passed = results.filter((r) => r.ok).length;
  const rows = results.map((r) => `| ${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${String(r.detail).replace(/\|/g, '\\|')} |`).join('\n');
  const deployment = (DEPLOY_SHA || DEPLOY_ID)
    ? `Deployment: \`${DEPLOY_SHA || 'not supplied'}\` / \`${DEPLOY_ID || 'not supplied'}\` (${DEPLOY_STATE}).\n\n`
    : '';
  fs.writeFileSync(REPORT, `# MYLA Paynow-primary / USD 6/14/26 production smoke\n\n${deployment}**${passed}/${results.length} checks passed** against \`${BASE}\` on ${RUN_DATE}. Paynow is primary; the DPO fallback remains code-complete but unconfigured. No payment, charge, lock, QA row or environment change was made.\n\n| Result | Check | Detail |\n|---|---|---|\n${rows}\n`);
  console.log(`\n${passed}/${results.length} checks passed. Report: ${REPORT}`);
  if (failed) process.exitCode = 1;
}
