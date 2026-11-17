/* Multi-role / multi-tenant isolation gate, run against a live deployment.
 *
 * Creates TWO clearly-marked QA organisations with owners (and role users in
 * org A), mints admin magic-link sessions (password grants are
 * captcha-protected in production), then proves org B cannot read/write org A
 * anywhere — every catalogue resource, list/detail/CSV, and every special
 * route — and that role restrictions hold inside org A.
 *
 * Nothing is deleted automatically. Review the emitted cleanup SQL and run it
 * via the Supabase connector when satisfied.
 *
 *   AUDIT_BASE=https://app.myla.co.zw npx tsx scripts/isolation-qa.ts
 */
import 'dotenv/config';
(globalThis as any).WebSocket = (globalThis as any).WebSocket || class {};
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { RESOURCES } from '../src/lib/resources';
import { MODULES } from '../src/lib/catalog';
import fs from 'node:fs';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(SUPA, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const stamp = Date.now().toString(36);
const jars = { A: new Map<string,string>(), B: new Map<string,string>(), AViewer: new Map<string,string>(), AFinance: new Map<string,string>() };
const created: { slug: string; email: string }[] = [];
let failures = 0, checks = 0;

function check(name: string, ok: boolean, detail = '') {
  checks++; if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : ' FAIL '}${name}${detail ? ' — ' + detail : ''}`);
}
function capture(jar: Map<string,string>, res: Response) {
  const list = typeof (res.headers as any).getSetCookie === 'function' ? (res.headers as any).getSetCookie() : ((res.headers.get('set-cookie') || '').split(/, (?=\S+=)/).filter(Boolean));
  for (const raw of list) { const pair = String(raw).split(';')[0]; const at = pair.indexOf('='); if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim()); }
}
async function app(jar: Map<string,string>, pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (jar.size) headers.set('cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  capture(jar, res);
  const text = await res.text().catch(() => '');
  let body: any = {}; try { body = JSON.parse(text); } catch {}
  return { res, body, text };
}
async function mkUser(tag: string) {
  const email = `qa-iso-${tag}-${stamp}@kestrelridge.co.zw`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: `Qa!${stamp}zz`, email_confirm: true, user_metadata: { name: `QA ISO ${tag}` } });
  if (error || !data.user) throw new Error(`createUser ${tag}: ${error?.message}`);
  return { id: data.user.id, email };
}
async function mkOrg(name: string, slug: string, config: any) {
  const { data, error } = await admin.from('organizations').insert({ name, slug, legal_name: name, country: 'ZW', base_currency: 'USD', locale_pack: 'ZW', onboarded: true, config, created_by_id: null }).select('id,slug').single();
  if (error || !data) throw new Error(`org ${slug}: ${error?.message}`);
  return data;
}
async function mkMembership(userId: string, orgId: string, role: string) {
  const { error } = await admin.from('memberships').insert({ user_id: userId, organization_id: orgId, role, entity_id: null });
  if (error) throw new Error(`membership ${role}: ${error.message}`);
}
async function mintSession(jar: Map<string,string>, email: string) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = link.data?.properties?.hashed_token;
  if (!hash) throw new Error('generateLink failed: ' + link.error?.message);
  const captured: any[] = [];
  const ssr = createServerClient(SUPA, ANON, { cookies: { getAll: () => [], setAll: (list: any[]) => { for (const c of list) captured.push(c); } } });
  const v = await ssr.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
  if (v.error) throw new Error('verifyOtp: ' + v.error.message);
  for (const c of captured) jar.set(c.name, c.value);
}
const fullConfig = () => ({
  modules: MODULES.map(m => m.id),
  resources: Array.from(new Set(MODULES.flatMap(m => m.resources))),
  flags: {}, limits: { users: 500, projects: 500, storageMb: 1000000 }, localePack: 'ZW', plan: 'Business',
});

async function main(): Promise<number> {
// ── Orgs ──
console.log('[setup] creating marked QA organisations A and B (all sections on in A)…');
const slugA = `myla-iso-a-${stamp}`, slugB = `myla-iso-b-${stamp}`;
const cfgA = fullConfig();
const cfgB = { modules: ['dashboard','company','crm','estimating','projects','contracts','finance','documents','reports'], resources: ['clients','contacts','estimates','projects','tasks','contracts','changeOrders','arInvoices','payments','documents'], flags: {}, limits: { users: 6, projects: 15, storageMb: 500 }, localePack: 'ZW', plan: 'Starter' };
const orgA = await mkOrg(`MYLA ISO A ${stamp}`, slugA, cfgA);
const orgB = await mkOrg(`MYLA ISO B ${stamp}`, slugB, cfgB);
// New orgs get an auto-created trial_required subscription; promote both marked
// QA orgs to comped so billing locks don't make the checks vacuous. Real
// payment is never involved.
for (const [id, plan] of [[(orgA as any).id, 'PRO'], [(orgB as any).id, 'STARTER']] as const) {
  const u = await admin.from('billing_subscriptions').update({ status: 'comped', plan_id: plan, comped_reason: 'isolation-qa', metadata: { seededAt: new Date().toISOString(), kind: 'isolation-qa' } }).eq('organization_id', id);
  if (u.error) throw new Error('comped subscription: ' + u.error.message);
}
const aOwner = await mkUser('a'); const bOwner = await mkUser('b');
const aViewer = await mkUser('av'); const aFinance = await mkUser('af');
await mkMembership(aOwner.id, (orgA as any).id, 'OWNER');
await mkMembership(bOwner.id, (orgB as any).id, 'OWNER');
await mkMembership(aViewer.id, (orgA as any).id, 'VIEWER');
await mkMembership(aFinance.id, (orgA as any).id, 'ACCOUNTANT');
for (const [slug, email] of [[slugA, aOwner.email], [slugB, bOwner.email], [slugA, aViewer.email], [slugA, aFinance.email]] as const) created.push({ slug, email });
await mintSession(jars.A, aOwner.email);
await mintSession(jars.B, bOwner.email);
await mintSession(jars.AViewer, aViewer.email);
await mintSession(jars.AFinance, aFinance.email);
check('sessions minted for A owner, B owner, A viewer, A accountant', true);

// ── Seed org A with a couple of records ──
const mkA = async (resource: string, body: any) => (await app(jars.A, `/api/${slugA}/records/${resource}`, { method: 'POST', body: JSON.stringify(body) }));
const clientA = await mkA('clients', { name: `ISO Client ${stamp}`, category: 'Client' });
const clientAId = clientA.body?.row?.id;
const projectA = await mkA('projects', { name: `ISO Job ${stamp}`, clientId: clientAId, contractValue: 900, currency: 'USD', progress: 10 });
const projectAId = projectA.body?.row?.id;
const invoiceA = await mkA('arInvoices', { name: `ISO Invoice ${stamp}`, clientId: clientAId, projectId: projectAId, amount: 900, vatPct: 0, total: 900, currency: 'USD', invoiceDate: '2026-11-01', dueDate: '2026-12-01' });
const invoiceAId = invoiceA.body?.row?.id;
check('org A seeded with client/job/invoice', !!clientAId && !!projectAId && !!invoiceAId, `client=${!!clientAId} job=${!!projectAId} invoice=${!!invoiceAId}`);

// ── Gate 1: cross-tenant access to every resource (list + detail + write) ──
console.log('\n[gate 1] org B session vs every org A resource…');
const denied = (s: number) => s >= 300;
const leaksA = (text: string) => /ISO Client |ISO Job |ISO Invoice /.test(text || '');
for (const r of RESOURCES) {
  const list = await app(jars.B, `/api/${slugA}/records/${r.id}?pageSize=1`);
  if (!denied(list.res.status) || leaksA(list.text)) check(`B cannot list A/${r.id}`, false, `status ${list.res.status}`);
  const detail = await app(jars.B, `/api/${slugA}/records/${r.id}/${clientAId}`);
  // detail ids of other resources will simply not exist — we only assert "not readable"
  if (!denied(detail.res.status) || leaksA(detail.text)) check(`B cannot read A/${r.id} by id`, false, `status ${detail.res.status}`);
  const write = await app(jars.B, `/api/${slugA}/records/${r.id}`, { method: 'POST', body: JSON.stringify({ name: 'intrusion' }) });
  if (!denied(write.res.status)) check(`B cannot create in A/${r.id}`, false, `status ${write.res.status}`);
}
check(`cross-tenant blocked on all ${RESOURCES.length} resources (list/detail/create)`, failures === 0);

// ── Gate 2: special routes as B against A ──
console.log('\n[gate 2] org B session vs org A special routes…');
const special: [string, string, any?][] = [
  ['GET', `/api/${slugA}/meta`], ['GET', `/api/${slugA}/overview`], ['GET', `/api/${slugA}/work-items`],
  ['GET', `/api/${slugA}/search?q=iso`], ['GET', `/api/${slugA}/wallets`], ['GET', `/api/${slugA}/wallets/${clientAId}`],
  ['GET', `/api/${slugA}/profitability`], ['GET', `/api/${slugA}/three-way-match`], ['GET', `/api/${slugA}/library`],
  ['GET', `/api/${slugA}/settings`], ['POST', `/api/${slugA}/settings`, { action: 'applyPack', pack: 'full' }],
  ['GET', `/api/${slugA}/billing`], ['GET', `/api/${slugA}/integrity`], ['GET', `/api/${slugA}/receipts`],
  ['GET', `/api/${slugA}/quote-templates`], ['GET', `/api/${slugA}/support`],
];
for (const [method, path, body] of special) {
  const r = await app(jars.B, path, { method, body: body ? JSON.stringify(body) : undefined });
  check(`B blocked: ${method} ${path.replace(`/api/${slugA}`, '')}`, denied(r.res.status), `status ${r.res.status}`);
}
// A-scoped sub-resources that carry A's record ids
const pdf = await app(jars.B, `/api/${slugA}/pdf/arInvoices/${invoiceAId}`);
check('B blocked: PDF of A invoice', denied(pdf.res.status), `status ${pdf.res.status}`);
const closeR = await app(jars.B, `/api/${slugA}/projects/${projectAId}/close`, { method: 'POST', body: JSON.stringify({ closureType: 'COMPLETION', acknowledged: true }) });
check('B blocked: close A project', denied(closeR.res.status), `status ${closeR.res.status}`);
const csv = await app(jars.B, `/api/${slugA}/records/clients?mode=csv`);
check('B blocked: CSV export of A clients', denied(csv.res.status), `status ${csv.res.status}`);

// ── Gate 3: B's own view is not polluted by A ──
const bOverview = await app(jars.B, `/api/${slugB}/overview`);
const bCounts = bOverview.body?.counts || {};
check('B overview contains no A records', Number(bCounts.clients || 0) === 0 && Number(bCounts.arInvoices || 0) === 0, JSON.stringify(bCounts));

// ── Gate 4: intra-org roles (A internal) ──
console.log('\n[gate 4] role enforcement inside org A…');
const vWrite = await app(jars.AViewer, `/api/${slugA}/records/clients`, { method: 'POST', body: JSON.stringify({ name: 'viewer intrusion' }) });
check('VIEWER cannot create records', denied(vWrite.res.status), `status ${vWrite.res.status}`);
const vDelete = await app(jars.AViewer, `/api/${slugA}/records/clients/${clientAId}`, { method: 'DELETE' });
check('VIEWER cannot delete records', denied(vDelete.res.status), `status ${vDelete.res.status}`);
const vSettings = await app(jars.AViewer, `/api/${slugA}/settings`);
check('VIEWER cannot open Settings', denied(vSettings.res.status), `status ${vSettings.res.status}`);
const vApplyPack = await app(jars.AViewer, `/api/${slugA}/settings`, { method: 'POST', body: JSON.stringify({ action: 'applyPack', pack: 'full' }) });
check('VIEWER cannot change workspace sections', denied(vApplyPack.res.status), `status ${vApplyPack.res.status}`);
const vRead = await app(jars.AViewer, `/api/${slugA}/records/clients`);
check('VIEWER can read (200 expected)', vRead.res.status === 200, `status ${vRead.res.status}`);
const fUsers = await app(jars.AFinance, `/api/${slugA}/settings`, { method: 'POST', body: JSON.stringify({ action: 'setRole', userId: aViewer.id, role: 'ADMIN' }) });
check('ACCOUNTANT cannot change roles', denied(fUsers.res.status), `status ${fUsers.res.status}`);
const fSettings = await app(jars.AFinance, `/api/${slugA}/settings`);
check('ACCOUNTANT cannot open Settings', denied(fSettings.res.status), `status ${fSettings.res.status}`);

// ── Summary + cleanup SQL ──
console.log(`\n${checks - failures}/${checks} isolation checks passed against ${BASE}`);
const cleanup = `-- Generated by scripts/isolation-qa.ts (${new Date().toISOString()})\n-- Run via Supabase SQL editor / connector on oeadisqfuyhelppinaxw.\nalter table public.memberships disable trigger memberships_protect_last_owner;\ndelete from public.organizations where slug in ('${slugA}','${slugB}');\ndelete from auth.users where email in (${created.map(c => `'${c.email}'`).join(',')});\nalter table public.memberships enable trigger memberships_protect_last_owner;\nselect (select count(*) from public.organizations where slug in ('${slugA}','${slugB}')) as qa_orgs, (select count(*) from auth.users where email in (${created.map(c => `'${c.email}'`).join(',')})) as qa_users;\n`;
fs.writeFileSync('/tmp/isolation-qa-cleanup.sql', cleanup);
console.log('Cleanup SQL written to /tmp/isolation-qa-cleanup.sql');
return failures === 0 ? 0 : 1;
}
main().then(c => process.exit(c)).catch(e => { console.error('isolation suite failed:', e); process.exit(1); });
