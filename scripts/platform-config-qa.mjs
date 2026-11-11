/* Platform-owner billing configuration QA (stage-only v1).
 *
 * Creates two throwaway Supabase Auth users, exercises the HTTP API with a
 * temporary superadmin, verifies company/anon denial and RLS, then deletes the
 * throwaway users and their platform_admins rows. No live keys, no env changes,
 * no billing mutations, no deployment.
 *
 * Run against a production-mode server: `node scripts/platform-config-qa.mjs`.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const BASE = (process.env.PLATFORM_QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
const SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
const REAL_ADMIN_ID = '61aa66b8-b5d6-4aac-ba46-e348fd5ee37a';
const DEMO_EMAIL = 'owner@kestrelridge.co.zw';
const DEMO_PASSWORD = 'Demo@1234';
const REPORT = path.join(process.cwd(), 'PLATFORM_CONFIG_QA.md');

if (!URL || !ANON || !SERVICE) throw new Error('Supabase URL / anon key / service-role key missing from .env');

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const stamp = Date.now().toString(36);
const pw = () => `Qa-${stamp}-${Math.random().toString(36).slice(2, 12)}!`;
const tempA = { email: `qa-platform-a-${stamp}@example.com`, password: pw(), id: '' };
const tempB = { email: `qa-platform-b-${stamp}@example.com`, password: pw(), id: '' };

const checks = [];
function record(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`Check failed: ${name}${detail ? ` — ${detail}` : ''}`);
}
function softCheck(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

function cookieClient() {
  const jar = new Map();
  const client = createServerClient(URL, ANON, {
    cookies: {
      getAll() { return [...jar.entries()].map(([name, value]) => ({ name, value })); },
      setAll(list) { for (const c of list) jar.set(c.name, c.value); },
    },
  });
  return { client, jar };
}
const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function api(pathname, { method = 'GET', body, jar, expect } = {}) {
  const headers = new Headers();
  if (jar && jar.size) headers.set('cookie', cookieHeader(jar));
  if (body !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (expect !== undefined) assert.equal(res.status, expect, `${method} ${pathname} expected ${expect}, got ${res.status}: ${text.slice(0, 400)}`);
  return { status: res.status, json };
}

async function signIn(email, password) {
  const { client, jar } = cookieClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.ok(!error && data?.user, `sign-in failed for ${email}: ${error?.message}`);
  assert.ok(jar.size > 0, `no session cookies captured for ${email}`);
  return { client, jar, userId: data.user.id };
}

async function createTempUser(t) {
  const { data, error } = await admin.auth.admin.createUser({
    email: t.email, password: t.password, email_confirm: true,
    user_metadata: { name: 'Platform Config QA' },
  });
  assert.ok(!error && data?.user, `createUser failed: ${error?.message}`);
  t.id = data.user.id;
  return t.id;
}

// State captured for cleanup / restore.
let originalSettings = null;
let originalDpo = null;
let originalOverride = null;
let createdPlanId = '';

async function cleanup() {
  const notes = [];
  try {
    if (createdPlanId) {
      await admin.from('pricing_plans').delete().eq('id', createdPlanId);
      await admin.from('pricing_plans').delete().eq('name', 'QA Future Starter');
      notes.push('deleted QA pricing plan version');
    }
    if (originalSettings) {
      await admin.from('platform_settings').update({
        maintenance_mode: originalSettings.maintenance_mode,
        updated_at: new Date().toISOString(), updated_by: REAL_ADMIN_ID,
      }).eq('id', 1);
      notes.push('restored platform_settings.maintenance_mode');
    }
    if (originalDpo) {
      await admin.from('gateway_config').update({
        requirements: originalDpo.requirements,
        updated_at: new Date().toISOString(), updated_by: REAL_ADMIN_ID,
      }).eq('gateway', 'dpo');
      notes.push('restored dpo requirements');
    }
    if (originalOverride) {
      await admin.from('organization_billing_overrides').update({
        note: originalOverride.note,
        updated_at: new Date().toISOString(), updated_by: REAL_ADMIN_ID,
      }).eq('organization_id', originalOverride.organization_id);
      notes.push('restored organization override note');
    }
    for (const t of [tempA, tempB]) {
      if (!t.id) continue;
      const uid = t.id;
      // Detach every config-table FK reference before deleting the Auth user.
      // GoTrue's admin.deleteUser can fail with "Database error deleting user"
      // while dependent rows still point at the user; nulling them first keeps
      // the audit rows (immutable) but removes the references.
      const nullRefs = [
        ['platform_config_audit', ['changed_by']],
        ['platform_settings', ['updated_by']],
        ['gateway_config', ['updated_by']],
        ['pricing_plans', ['created_by', 'updated_by']],
        ['organization_billing_overrides', ['created_by', 'updated_by']],
        ['platform_admins', ['created_by', 'updated_by', 'revoked_by']],
      ];
      for (const [table, cols] of nullRefs) {
        for (const col of cols) {
          try { await admin.from(table).update({ [col]: null }).eq(col, uid); } catch { /* ignore */ }
        }
      }
      await admin.from('platform_admins').delete().eq('user_id', uid);
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) notes.push(`deleteUser ${t.email}: ${error.message}`);
      else notes.push(`deleted ${t.email}`);
    }
  } catch (e) {
    notes.push(`cleanup error: ${e?.message}`);
  }
  return notes;
}

async function run() {
  // 0. Baseline DB state (service role, read-only).
  const baseline = await api('/api/platform/config', { expect: 401 });
  record('anonymous GET is 401', baseline.status === 401);

  // 1. Demo company owner (org member, NOT platform admin).
  const demo = await signIn(DEMO_EMAIL, DEMO_PASSWORD);
  const demoGet = await api('/api/platform/config', { jar: demo.jar, expect: 403 });
  record('company owner GET is 403', demoGet.status === 403, demoGet.json?.error);
  const { data: denied, error: deniedErr } = await demo.client.from('platform_settings').select('*');
  assert.ok(deniedErr || !denied || denied.length === 0, 'company JWT must not read config table');
  record('company JWT direct table SELECT denied', true, deniedErr?.message || 'zero rows');

  // 2. Throwaway superadmin A.
  await createTempUser(tempA);
  await admin.from('platform_admins').insert({
    user_id: tempA.id, email: tempA.email,
    created_by: REAL_ADMIN_ID, updated_by: REAL_ADMIN_ID,
  });
  const a = await signIn(tempA.email, tempA.password);
  record('throwaway superadmin A created + signed in', true, tempA.email);

  const cfg = await api('/api/platform/config', { jar: a.jar, expect: 200 });
  record('superadmin GET config 200', cfg.json?.ok === true && cfg.json?.stageOnly === true && cfg.json?.runtimeWired === false);
  const priceLine = (cfg.json?.activePricingPlans || []).map((p) => `${p.plan_id}:${Number(p.monthly_usd)}`).join(',');
  record('seed has USD 9/29/99 active', priceLine === 'STARTER:9,PRO:29,ENTERPRISE:99', priceLine);
  record('seed billing disabled in DB', cfg.json?.settings?.billing_enabled === false);
  record('audit trail present', Array.isArray(cfg.json?.audit) && cfg.json.audit.length >= 10, `${cfg.json?.audit?.length} rows`);

  originalSettings = cfg.json.settings;
  originalDpo = (cfg.json.gateways || []).find((g) => g.gateway === 'dpo');
  originalOverride = (cfg.json.organizationBillingOverrides || [])[0];

  // 3. Master-switch and secret guards.
  const billGuard = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 409, body: { action: 'updateSettings', fields: { billing_enabled: true } } });
  record('DB billing_enabled cannot bypass BILLING_ENABLED env', billGuard.status === 409, billGuard.json?.error);
  const gwGuard = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 409, body: { action: 'updateGateway', gateway: 'dpo', fields: { enabled: true } } });
  record('gateway enabled guard while env off', gwGuard.status === 409);
  const liveGuard = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 409, body: { action: 'updateGateway', gateway: 'dpo', fields: { mode: 'live' } } });
  record('DPO live mode guard without env credentials', liveGuard.status === 409);
  const secretGuard = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 400, body: { action: 'updateGateway', gateway: 'dpo', fields: { companyToken: 'must-not-store' } } });
  record('secret-named field rejected', secretGuard.status === 400, secretGuard.json?.error);
  const nestedSecret = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 400, body: { action: 'updateGateway', gateway: 'dpo', fields: { requirements: { companyToken: 'must-not-store' } } } });
  record('nested secret in requirements rejected', nestedSecret.status === 400);

  // 4. Harmless staged settings + gateway changes (audited).
  const settingsUp = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 200, body: { action: 'updateSettings', fields: { maintenance_mode: true } } });
  record('updateSettings accepted', settingsUp.json?.settings?.maintenance_mode === true);
  const gwUp = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 200, body: { action: 'updateGateway', gateway: 'dpo', fields: { requirements: { merchant_approved: true } } } });
  record('updateGateway accepted', gwUp.json?.gateway?.requirements?.merchant_approved === true);

  // 5. Versioned pricing: future version, activation sweep, retire/cleanup.
  const future = new Date(Date.now() + 86400000).toISOString();
  const plan = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 201, body: {
    action: 'createPlanVersion',
    fields: { plan_id: 'STARTER', name: 'QA Future Starter', monthly_usd: 10.00, effective_from: future },
  } });
  createdPlanId = plan.json?.pricingPlan?.id || '';
  record('future pricing version created inactive', Boolean(createdPlanId) && plan.json?.pricingPlan?.is_active === false);
  const sweep = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 200, body: { action: 'activateDuePlans' } });
  record('activateDuePlans does not activate future version', Array.isArray(sweep.json?.activated) && sweep.json.activated.length === 0);
  const retire = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 200, body: { action: 'retirePlan', id: createdPlanId } });
  record('pending pricing version retired/deleted', retire.status === 200);
  createdPlanId = '';

  // 6. Organization override (note only; comped flag untouched).
  assert.ok(originalOverride?.organization_id, 'need an existing override to exercise upsert');
  const ov = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 200, body: {
    action: 'upsertOverride', organizationId: originalOverride.organization_id,
    fields: { note: 'QA platform config check' },
  } });
  record('upsertOverride accepted', ov.json?.organizationBillingOverride?.note === 'QA platform config check');

  // 7. Admin identity lifecycle via API.
  await createTempUser(tempB);
  const add = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 201, body: { action: 'addAdmin', userId: tempB.id } });
  record('addAdmin via API', add.json?.platformAdmin?.user_id === tempB.id);
  const b = await signIn(tempB.email, tempB.password);
  const bGet = await api('/api/platform/config', { jar: b.jar, expect: 200 });
  record('newly added admin can GET config', bGet.json?.ok === true);
  const revoke = await api('/api/platform/config', { method: 'POST', jar: a.jar, expect: 200, body: { action: 'revokeAdmin', userId: tempB.id } });
  record('revokeAdmin via API', revoke.status === 200 && revoke.json?.platformAdmin?.revoked_at);
  const bAfter = await api('/api/platform/config', { jar: b.jar, expect: 403 });
  record('revoked admin loses access', bAfter.status === 403);

  // 8. Audit grew from staged writes.
  const cfg2 = await api('/api/platform/config', { jar: a.jar, expect: 200 });
  record('audit log recorded staged changes', cfg2.json?.audit?.length > cfg.json?.audit?.length, `${cfg.json?.audit?.length} -> ${cfg2.json?.audit?.length}`);
}

async function main() {
  let cleanupNotes = [];
  try {
    await run();
  } catch (e) {
    record('QA run completed without assertion failure', false, e?.message);
    process.exitCode = 1;
  } finally {
    cleanupNotes = await cleanup();
  }

  // Final state verification (service role reads).
  try {
  const [adminsRes, settingsRes, gatewaysRes, plansRes, overridesRes, auditRes] = await Promise.all([
    admin.from('platform_admins').select('*'),
    admin.from('platform_settings').select('*').eq('id', 1).maybeSingle(),
    admin.from('gateway_config').select('*'),
    admin.from('pricing_plans').select('*'),
    admin.from('organization_billing_overrides').select('*'),
    admin.from('platform_config_audit').select('id'),
  ]);
  const admins = adminsRes.data || [];
  const activeAdmins = admins.filter((r) => !r.revoked_at).length;
  const qaAdminRows = admins.filter((r) => String(r.email || '').startsWith('qa-platform-')).length;
  const enabledGateways = (gatewaysRes.data || []).filter((r) => r.enabled).length;
  const activePlans = (plansRes.data || []).filter((r) => r.is_active).length;
  const qaPlans = (plansRes.data || []).filter((r) => r.name === 'QA Future Starter').length;
  const comped = (overridesRes.data || []).filter((r) => r.comped).length;
  const auditRows = (auditRes.data || []).length;

  softCheck('final: exactly one active platform admin', activeAdmins === 1, `${activeAdmins}`);
  softCheck('final: no QA admin rows', qaAdminRows === 0, `${qaAdminRows}`);
  softCheck('final: DB billing still disabled', settingsRes.data?.billing_enabled === false);
  softCheck('final: no gateway enabled', enabledGateways === 0, `${enabledGateways}`);
  softCheck('final: 3 active seed plans', activePlans === 3, `${activePlans}`);
  softCheck('final: no QA pricing plan left', qaPlans === 0, `${qaPlans}`);
  softCheck('final: 2 comped org overrides intact', comped === 2, `${comped}`);
  softCheck('final: audit trail retained', auditRows >= 10, `${auditRows} rows`);

  for (const t of [tempA, tempB]) {
    if (!t.id) continue;
    const { data: still, error: gone } = await admin.auth.admin.getUserById(t.id);
    softCheck(`final: throwaway user ${t.email} deleted`, Boolean(gone) || !still?.user);
  }
  } catch (e) {
    softCheck('final: service-role verification completed', false, e?.message);
  }

  // Report.
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok).length;
  const lines = [
    '# Platform billing configuration QA',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Result: **${passed} passed / ${failed} failed** (${checks.length} checks).`,
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...checks.map((c) => `| ${c.name} | ${c.ok ? 'PASS' : 'FAIL'} | ${String(c.detail || '').replace(/\|/g, '\\|')} |`),
    '',
    '## Cleanup',
    '',
    ...cleanupNotes.map((n) => `- ${n}`),
    '',
    'Stage-only: no runtime wiring, no env/Vercel change, no deploy, no live charges or locks.',
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nReport: ${REPORT}`);
  console.log(`Cleanup: ${cleanupNotes.join(' | ')}`);
  if (failed) process.exitCode = 1;
}

await main();
