/* Authenticated QA for the first-job experience, run against a live deployment.
 * Creates ONE clearly-marked QA organisation + OWNER user, drives the real
 * HTTP flow (login → onboarding MICRO → records → R6 regressions), prints a
 * report, and emits cleanup SQL for /tmp/first-job-qa-cleanup.sql.
 * Nothing is deleted automatically — review the cleanup SQL before running it.
 * Usage: AUDIT_BASE=https://app.myla.co.zw node scripts/first-job-qa.mjs
 *        (default base: http://127.0.0.1:3000) */
import 'dotenv/config';
// Node 20 has no native WebSocket; the QA suite never uses realtime, so a
// stub keeps the Supabase client constructor happy.
globalThis.WebSocket = globalThis.WebSocket || class {};
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !SERVICE) { console.error('Missing Supabase env'); process.exit(1); }
const admin = createClient(SUPA, SERVICE, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { enabled: false } });

const stamp = Date.now().toString(36);
const email = `qa-firstjob-${stamp}@kestrelridge.co.zw`;
const password = `Qa!${stamp}$${Math.random().toString(36).slice(2, 8)}`; // unused at runtime (magic-link session); required by createUser
const company = `MYLA FirstJob QA ${stamp}`;
const slug = `myla-firstjob-qa-${stamp}`;
const jar = new Map();
const results = [];
let orgId = '';
let userId = '';

function capture(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/, (?=\S+=)/).filter(Boolean);
  for (const raw of list) { const pair = String(raw).split(';')[0]; const at = pair.indexOf('='); if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim()); }
}
async function app(pathname, init = {}) {
  const headers = new Headers(init.headers || {});
  if (jar.size) headers.set('cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  capture(res);
  const text = await res.text().catch(() => '');
  let body = {}; try { body = JSON.parse(text); } catch {}
  return { res, body, text };
}
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '}${name}${detail ? ' — ' + detail : ''}`);
}

// ── 0. Create the QA org + OWNER user (bypasses captcha/email by design) ──
console.log(`\n[setup] creating QA user ${email}`);
const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'QA FirstJob', avatar_color: '#d97706' } });
if (createErr) { console.error('createUser failed:', createErr.message); process.exit(1); }
userId = created.user.id;
const { data: org, error: orgErr } = await admin.from('organizations').insert({ name: company, slug, legal_name: company, country: 'ZW', base_currency: 'USD', locale_pack: 'ZW', onboarded: false, config: {}, created_by_id: userId }).select('id,slug').single();
if (orgErr || !org) { console.error('org insert failed:', orgErr?.message); process.exit(1); }
orgId = org.id;
const { error: memberErr } = await admin.from('memberships').insert({ user_id: userId, organization_id: orgId, role: 'OWNER', entity_id: null });
if (memberErr) { console.error('membership failed:', memberErr.message); process.exit(1); }
console.log(`[setup] org ${slug} created (${orgId})`);

// ── 1. Session (production enforces Turnstile on password grants, so mint a
//       real session the supported way: admin magic link + verifyOtp, no captcha) ──
console.log('[setup] minting QA session via admin magic link…');
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const hash = link.data?.properties?.hashed_token;
if (link.error || !hash) { console.error('generateLink failed:', link.error?.message); process.exit(1); }
const { createServerClient } = await import('@supabase/ssr');
const captured = [];
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ssr = createServerClient(SUPA, anon, { cookies: { getAll: () => [], setAll: (list) => { for (const c of list) captured.push(c); } } });
const v = await ssr.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
if (v.error) { console.error('verifyOtp failed:', v.error.message); process.exit(1); }
for (const c of captured) jar.set(c.name, c.value);
check('authenticated session minted (magic link, no password grant)', captured.length > 0, captured.map(c => c.name).join(', '));
const probe = await app(`/api/${slug}/meta`);
check('session authenticates the app', probe.res.status === 200, `meta status ${probe.res.status}`);

// ── 2. Onboarding: smallest team size (MICRO) → job-to-cash only ──
const onboard = await app('/api/onboarding', { method: 'POST', body: JSON.stringify({ name: company, companyType: 'GENERAL_CONTRACTOR', size: 'MICRO', headcount: 1, country: 'ZW', baseCurrency: 'USD', qualifiers: [], addons: [] }) });
const mods = onboard.body?.config?.modules || [];
const SOLO = ['dashboard','company','crm','estimating','projects','contracts','finance','documents','reports'];
check('onboarding completes', onboard.res.status === 200 && onboard.body.ok === true, `status ${onboard.res.status} ${onboard.body.error || ''}`);
check('micro workspace = exactly the 9 job-to-cash sections', SOLO.every(m => mods.includes(m)) && mods.length === SOLO.length, `modules: ${mods.join(',')}`);
check('no heavy sections at micro (hr/wallets/pipeline/payroll)', !['hr','wallets','pipeline','payroll','equipment','safety'].some(m => mods.includes(m)));

// ── 3. Meta reflects the solo config ──
const meta = await app(`/api/${slug}/meta`);
const metaMods = meta.body?.config?.modules || [];
check('meta shows the solo config', meta.res.status === 200 && metaMods.length === SOLO.length, `meta modules: ${metaMods.length}`);

// ── 4. The first-job loop: client → quote → job → invoice → payment ──
const mk = async (resource, body) => (await app(`/api/${slug}/records/${resource}`, { method: 'POST', body: JSON.stringify(body) }));
const client = await mk('clients', { name: `QA Client ${stamp}`, phone: '+263700000000', category: 'Client' });
const clientId = client.body?.row?.id || client.body?.id;
check('create client', client.res.status >= 200 && client.res.status < 300 && !!clientId, `status ${client.res.status} ${client.body.error || ''}`);
const estimate = await mk('estimates', { name: `QA Quote ${stamp}`, clientId, total: 1200, currency: 'USD' });
const estimateId = estimate.body?.row?.id || estimate.body?.id;
check('create quote', estimate.res.status >= 200 && estimate.res.status < 300 && !!estimateId, `status ${estimate.res.status} ${estimate.body.error || ''}`);
const project = await mk('projects', { name: `QA Job ${stamp}`, clientId, contractValue: 1200, currency: 'USD', progress: 0 });
const projectId = project.body?.row?.id || project.body?.id;
check('create job', project.res.status >= 200 && project.res.status < 300 && !!projectId, `status ${project.res.status} ${project.body.error || ''}`);
const invoice = await mk('arInvoices', { name: `QA Invoice ${stamp}`, clientId, projectId, amount: 1200, vatPct: 0, total: 1200, currency: 'USD', invoiceDate: new Date().toISOString().slice(0,10), dueDate: new Date(Date.now()+14*864e5).toISOString().slice(0,10) });
const invoiceId = invoice.body?.row?.id || invoice.body?.id;
check('create invoice', invoice.res.status >= 200 && invoice.res.status < 300 && !!invoiceId, `status ${invoice.res.status} ${invoice.body.error || ''}`);
const payment = await mk('payments', { name: `QA Receipt ${stamp}`, direction: 'RECEIPT', clientId, projectId, paymentDate: new Date().toISOString().slice(0,10), amount: 500, method: 'Bank transfer', currency: 'USD' });
const paymentId = payment.body?.row?.id || payment.body?.id;
check('create receipt', payment.res.status >= 200 && payment.res.status < 300 && !!paymentId, `status ${payment.res.status} ${payment.body.error || ''}`);

// ── 5. Overview counts feed the dashboard checklist ──
const overview = await app(`/api/${slug}/overview`);
const counts = overview.body?.counts || {};
check('overview counts reflect the loop', ['clients','estimates','projects','arInvoices','payments'].every(r => Number(counts[r] || 0) >= 1), JSON.stringify(counts));

// ── 6. R6-01: impossible task dates / negative duration rejected ──
const badDates = await mk('tasks', { name: `QA bad dates ${stamp}`, projectId, plannedStart: '2026-01-10', plannedEnd: '2026-01-05', duration: 6 });
check('planned finish before planned start rejected', badDates.res.status >= 400 && badDates.res.status < 500, `status ${badDates.res.status} ${badDates.body.error || JSON.stringify(badDates.body.errors || '')}`);
const negDur = await mk('tasks', { name: `QA neg duration ${stamp}`, projectId, duration: -1 });
check('negative duration rejected', negDur.res.status >= 400 && negDur.res.status < 500, `status ${negDur.res.status} ${negDur.body.error || ''}`);
const mismatch = await mk('tasks', { name: `QA duration mismatch ${stamp}`, projectId, plannedStart: '2026-01-05', plannedEnd: '2026-01-07', duration: 5 });
check('duration contradicting dates rejected', mismatch.res.status >= 400 && mismatch.res.status < 500, `status ${mismatch.res.status} ${mismatch.body.error || ''}`);
const goodTask = await mk('tasks', { name: `QA task ${stamp}`, projectId, plannedStart: '2026-01-05', plannedEnd: '2026-01-07', duration: 3 });
const goodTaskId = goodTask.body?.row?.id || goodTask.body?.id;
check('consistent task accepted', goodTask.res.status >= 200 && goodTask.res.status < 300 && !!goodTaskId, `status ${goodTask.res.status} ${goodTask.body.error || ''}`);

// ── 7. R6-02: COMPLETE ⇒ progress 100 + actual finish ──
if (goodTaskId) {
  const done = await app(`/api/${slug}/records/tasks/${goodTaskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETE' }) });
  const row = done.body?.row || done.body || {};
  check('COMPLETE sets progress 100', Number(row.progress) === 100, `progress=${row.progress}`);
  check('COMPLETE stamps actual finish', !!row.actualEnd, `actualEnd=${row.actualEnd}`);
} else check('COMPLETE flow (no task id)', false);

// ── 8. R6-03: no silent CLOSED; reviewed close-out enforced ──
const rawClose = await app(`/api/${slug}/records/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ status: 'CLOSED' }) });
check('raw PATCH to CLOSED rejected with 409 + close-out guidance', rawClose.res.status === 409 && String(rawClose.body.error || '').includes('Close project'), `status ${rawClose.res.status} ${rawClose.body.error || ''}`);
const noAck = await app(`/api/${slug}/projects/${projectId}/close`, { method: 'POST', body: JSON.stringify({ closureType: 'COMPLETION', note: 'QA close-out test' }) });
check('close without acknowledgement refused (422)', noAck.res.status === 422 && noAck.body.requiresAcknowledgement === true, `status ${noAck.res.status} ${noAck.body.error || ''}`);
const ack = await app(`/api/${slug}/projects/${projectId}/close`, { method: 'POST', body: JSON.stringify({ closureType: 'COMPLETION', note: 'QA close-out test — job complete', acknowledged: true }) });
check('acknowledged close-out succeeds', ack.res.status === 200 && ack.body.ok === true, `status ${ack.res.status} ${ack.body.error || ''}`);

// ── 9. INV guard: manual PAID points to “Record and allocate receipt” ──
const paidPatch = await app(`/api/${slug}/records/arInvoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify({ status: 'PAID' }) });
const errText = JSON.stringify(paidPatch.body);
check('manual PAID refused with “Record and allocate receipt” guidance', paidPatch.res.status === 400 && errText.includes('Record and allocate receipt'), `status ${paidPatch.res.status} ${errText.slice(0, 200)}`);

// ── Summary + cleanup SQL ──
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} checks passed against ${BASE}`);
fs.writeFileSync('/tmp/first-job-qa-cleanup.sql', `-- Generated by scripts/first-job-qa.mjs (${new Date().toISOString()})\n-- Run via Supabase SQL editor / connector on oeadisqfuyhelppinaxw.\nalter table public.memberships disable trigger memberships_protect_last_owner;\ndelete from public.organizations where slug = '${slug}';\ndelete from auth.users where email = '${email}';\nalter table public.memberships enable trigger memberships_protect_last_owner;\nselect (select count(*) from public.organizations where slug = '${slug}') as qa_orgs,\n       (select count(*) from auth.users where email = '${email}') as qa_users;\n`);
console.log('Cleanup SQL written to /tmp/first-job-qa-cleanup.sql');
process.exit(results.every(r => r.ok) ? 0 : 1);
