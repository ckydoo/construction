/* Platform-owner billing configuration API (backend-only, stage-only v1).
 *
 * - Every request requires a Supabase Auth user with an active platform_admins row.
 * - The config tables grant nothing to anon/authenticated; this route uses the
 *   service role after the identity check above.
 * - No live credentials are accepted or stored. Only non-secret settings,
 *   effective-dated prices, gateway requirements and comped overrides live here.
 * - BILLING_ENABLED / DPO_LIVE_MODE remain hard environment master switches;
 *   the billing runtime does NOT read these tables yet.
 * - Every INSERT/UPDATE/DELETE is recorded by a database audit trigger.
 */
import { NextResponse } from 'next/server';
import { requirePlatformAdmin, type PlatformAdminCtx } from '@/lib/platform-admin';
import { supabaseAdmin, unwrap } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const SETTINGS_FIELDS = new Set([
  'billing_enabled','trial_days','grace_days','currency','tax_included',
  'active_gateway','pricing_model','maintenance_mode',
]);
const GATEWAY_FIELDS = new Set([
  'enabled','mode','api_url','payment_url_template','service_type','service_type_name',
  'callback_path','push_path','return_url','result_url','merchant_approved',
  'payout_confirmed','tokenisation_approved','push_url_registered',
  'hosted_url_confirmed','vat_tax_decided','requirements',
]);
const PLAN_VERSION_FIELDS = new Set([
  'plan_id','name','monthly_usd','yearly_usd','cadence','user_limit',
  'active_project_limit','all_modules_access','sort_order','effective_from',
]);
const OVERRIDE_FIELDS = new Set([
  'comped','comped_reason','custom_plan_id','custom_monthly_usd','custom_yearly_usd',
  'custom_user_limit','custom_active_project_limit','effective_from','effective_to','note',
]);
const REQUIREMENTS_KEYS = new Set([
  'merchant_approved','payout_confirmed','tokenisation_approved',
  'push_url_registered','hosted_url_confirmed','vat_tax_decided',
  'note','notes','reference','checked_at',
]);

// Exact dangerous key names (normalised). Substring matching would wrongly
// reject the harmless `tokenisation_approved` boolean above.
const SECRET_KEY_DENYLIST = new Set([
  'secret','token','password','credential','credentials','apikey','privatekey',
  'companytoken','callbacksecret','pushsecret','integrationkey','cronsecret',
  'servicekey','servicerolekey','accesskey','private','dpocompanytoken',
  'dpocallbacksecret','dpopushsecret','paynowintegrationkey','paynowintegrationid',
  'supabaseservicerolekey','supabasesecretkey',
]);
const normaliseKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

function assertNoSecretKeys(value: any, path = ''): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecretKeys(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    const here = path ? `${path}.${k}` : k;
    if (SECRET_KEY_DENYLIST.has(normaliseKey(k))) {
      throw Object.assign(new Error(`Field "${here}" is forbidden. Live credentials stay in encrypted environment variables, never in the database or API payloads.`), { status: 400 });
    }
    assertNoSecretKeys(v, here);
  }
}

function pick(fields: any, allowed: Set<string>, label: string): any {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw Object.assign(new Error(`"fields" must be an object for ${label}.`), { status: 400 });
  }
  const out: any = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.has(k)) {
      throw Object.assign(new Error(`Unknown field "${k}" for ${label}.`), { status: 400 });
    }
    out[k] = v;
  }
  assertNoSecretKeys(out, label);
  if (out.requirements !== undefined) {
    if (!out.requirements || typeof out.requirements !== 'object' || Array.isArray(out.requirements)) {
      throw Object.assign(new Error('"requirements" must be an object.'), { status: 400 });
    }
    for (const k of Object.keys(out.requirements)) {
      if (!REQUIREMENTS_KEYS.has(k)) {
        throw Object.assign(new Error(`Unknown requirements key "${k}".`), { status: 400 });
      }
    }
  }
  return out;
}

const truthy = (v: unknown) => String(v || '').trim().toLowerCase() === 'true';
const present = (v: unknown) => Boolean(String(v || '').trim());

function envMaster() {
  return {
    billingEnabled: truthy(process.env.BILLING_ENABLED),
    dpoLiveMode: truthy(process.env.DPO_LIVE_MODE),
    qaMode: truthy(process.env.BILLING_QA_MODE),
    paynowMock: truthy(process.env.PAYNOW_MOCK),
    dpoCompanyToken: present(process.env.DPO_COMPANY_TOKEN),
    dpoService: present(process.env.DPO_SERVICE_TYPE) || present(process.env.DPO_SERVICE_TYPE_NAME),
    dpoCallbackSecret: present(process.env.DPO_CALLBACK_SECRET),
    dpoPushSecret: present(process.env.DPO_PUSH_SECRET),
  };
}

function fail(e: any): NextResponse {
  const status = Number(e?.status) || 500;
  return NextResponse.json({ ok: false, error: e?.message || 'Platform configuration request failed.' }, { status, headers: NO_STORE });
}
function ok(data: any = {}, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status, headers: NO_STORE });
}

const asBool = (v: unknown) => v === true || String(v || '').trim().toLowerCase() === 'true';
const isoDate = (v: unknown, label: string): string => {
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error(`${label} must be a valid date.`), { status: 400 });
  return d.toISOString();
};

export async function GET(): Promise<NextResponse> {
  const { ctx, error } = await requirePlatformAdmin();
  if (error) return error;
  try {
    const admin = supabaseAdmin();
    const [settings, gateways, plans, activePlans, overrides, admins, audit] = await Promise.all([
      unwrap(await admin.from('platform_settings').select('*').eq('id', 1).maybeSingle()),
      unwrap(await admin.from('gateway_config').select('*').order('gateway')),
      unwrap(await admin.from('pricing_plans').select('*').order('plan_id').order('effective_from', { ascending: false })),
      unwrap(await admin.from('active_pricing_plans').select('*').order('sort_order')),
      unwrap(await admin.from('organization_billing_overrides').select('*')),
      unwrap(await admin.from('platform_admins').select('*').order('created_at')),
      unwrap(await admin.from('platform_config_audit').select('*').order('changed_at', { ascending: false }).limit(50)),
    ]);
    const master = envMaster();
    return ok({
      stageOnly: true,
      runtimeWired: false,
      actor: ctx,
      masterSwitches: master,
      settings,
      gateways,
      pricingPlans: plans,
      activePricingPlans: activePlans,
      organizationBillingOverrides: overrides,
      platformAdmins: admins,
      audit,
      note: 'Database values are desired/staged state only. BILLING_ENABLED and DPO_LIVE_MODE are environment master switches; the billing runtime still reads code constants and env.',
    });
  } catch (e) { return fail(e); }
}

type Body = {
  action?: string;
  fields?: any;
  gateway?: string;
  id?: string;
  userId?: string;
  organizationId?: string;
  note?: string;
};

export async function POST(req: Request): Promise<NextResponse> {
  const { ctx, error } = await requirePlatformAdmin();
  if (error) return error;
  if (!String(req.headers.get('content-type') || '').includes('application/json')) {
    return fail(Object.assign(new Error('Content-Type must be application/json.'), { status: 415 }));
  }

  let body: Body;
  try { body = await req.json(); } catch { return fail(Object.assign(new Error('Invalid JSON body.'), { status: 400 })); }
  try { assertNoSecretKeys(body, 'body'); } catch (e) { return fail(e); }

  const action = String(body.action || '');
  const actor: PlatformAdminCtx = ctx;
  const admin = supabaseAdmin();
  const master = envMaster();

  try {
    if (action === 'updateSettings') {
      const fields = pick(body.fields, SETTINGS_FIELDS, 'updateSettings');
      if (asBool(fields.billing_enabled) && !master.billingEnabled) {
        return fail(Object.assign(new Error('Cannot stage billing_enabled=true while the BILLING_ENABLED environment master switch is off. The database flag cannot bypass env.'), { status: 409 }));
      }
      const payload = { ...fields, updated_at: new Date().toISOString(), updated_by: actor.userId };
      const data = unwrap(await admin.from('platform_settings').update(payload).eq('id', 1).select().maybeSingle());
      return ok({ settings: data });
    }

    if (action === 'updateGateway') {
      const gateway = String(body.gateway || '');
      if (!['dpo','paynow','mock'].includes(gateway)) {
        return fail(Object.assign(new Error('gateway must be dpo, paynow or mock.'), { status: 400 }));
      }
      const fields = pick(body.fields, GATEWAY_FIELDS, 'updateGateway');
      if (asBool(fields.enabled) && !master.billingEnabled) {
        return fail(Object.assign(new Error('Cannot enable a gateway while BILLING_ENABLED is off in the environment.'), { status: 409 }));
      }
      if (gateway === 'dpo' && fields.mode === 'live') {
        const ready = master.billingEnabled && master.dpoLiveMode && master.dpoCompanyToken
          && master.dpoService && master.dpoCallbackSecret && master.dpoPushSecret;
        if (!ready) {
          return fail(Object.assign(new Error('DPO live mode requires BILLING_ENABLED=true, DPO_LIVE_MODE=true and all live credentials in encrypted env. No live key is stored here.'), { status: 409 }));
        }
      }
      const payload = { ...fields, gateway, updated_at: new Date().toISOString(), updated_by: actor.userId };
      const data = unwrap(await admin.from('gateway_config').upsert(payload, { onConflict: 'gateway' }).select().maybeSingle());
      return ok({ gateway: data });
    }

    if (action === 'createPlanVersion') {
      const fields = pick(body.fields, PLAN_VERSION_FIELDS, 'createPlanVersion');
      if (!fields.plan_id || fields.monthly_usd === undefined || fields.monthly_usd === null) {
        return fail(Object.assign(new Error('plan_id and monthly_usd are required.'), { status: 400 }));
      }
      const rpcPayload = { ...fields };
      if (rpcPayload.effective_from) rpcPayload.effective_from = new Date(String(rpcPayload.effective_from)).toISOString();
      const data = unwrap(await admin.rpc('create_pricing_plan_version', { p_payload: rpcPayload, p_actor: actor.userId }));
      const plan = Array.isArray(data) ? data[0] : data;
      return ok({ pricingPlan: plan }, 201);
    }

    if (action === 'activateDuePlans') {
      const data = unwrap(await admin.rpc('activate_due_pricing_plans', { p_now: new Date().toISOString() }));
      return ok({ activated: Array.isArray(data) ? data : [] });
    }

    if (action === 'retirePlan' || action === 'deletePlan') {
      const id = String(body.id || '');
      if (!id) return fail(Object.assign(new Error('id is required.'), { status: 400 }));
      if (action === 'retirePlan') {
        const data = unwrap(await admin.rpc('retire_pricing_plan', { p_id: id, p_actor: actor.userId }));
        return ok({ pricingPlan: Array.isArray(data) ? data[0] : data });
      }
      unwrap(await admin.rpc('delete_pricing_plan', { p_id: id }));
      return ok({ deletedId: id });
    }

    if (action === 'addAdmin') {
      const userId = String(body.userId || '');
      if (!userId) return fail(Object.assign(new Error('userId is required.'), { status: 400 }));
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
      if (authErr || !authUser?.user) {
        return fail(Object.assign(new Error('Supabase Auth user not found.'), { status: 404 }));
      }
      const email = String(authUser.user.email || '').trim().toLowerCase();
      if (!email) return fail(Object.assign(new Error('Auth user has no email.'), { status: 400 }));
      const row = {
        user_id: userId, email,
        created_by: actor.userId, updated_by: actor.userId,
        revoked_at: null, revoked_by: null,
      };
      const data = unwrap(await admin.from('platform_admins').upsert(row, { onConflict: 'user_id' }).select().maybeSingle());
      return ok({ platformAdmin: data }, 201);
    }

    if (action === 'revokeAdmin') {
      const userId = String(body.userId || '');
      if (!userId) return fail(Object.assign(new Error('userId is required.'), { status: 400 }));
      if (userId === actor.userId) {
        return fail(Object.assign(new Error('Cannot revoke your own platform admin access.'), { status: 409 }));
      }
      const { data: activeRows } = await admin.from('platform_admins').select('user_id').is('revoked_at', null);
      if ((activeRows || []).length <= 1) {
        return fail(Object.assign(new Error('Cannot revoke the last active platform admin.'), { status: 409 }));
      }
      const data = unwrap(await admin.from('platform_admins').update({
        revoked_at: new Date().toISOString(),
        revoked_by: actor.userId,
        updated_by: actor.userId,
      }).eq('user_id', userId).select().maybeSingle());
      return ok({ platformAdmin: data });
    }

    if (action === 'upsertOverride') {
      const organizationId = String(body.organizationId || '');
      if (!organizationId) return fail(Object.assign(new Error('organizationId is required.'), { status: 400 }));
      const fields = pick(body.fields, OVERRIDE_FIELDS, 'upsertOverride');
      if (fields.effective_from !== undefined) fields.effective_from = isoDate(fields.effective_from, 'effective_from');
      if (fields.effective_to !== undefined && fields.effective_to !== null) fields.effective_to = isoDate(fields.effective_to, 'effective_to');
      const { data: existing } = await admin.from('organization_billing_overrides').select('organization_id').eq('organization_id', organizationId).maybeSingle();
      let data: any;
      if (existing) {
        data = unwrap(await admin.from('organization_billing_overrides').update({
          ...fields, updated_at: new Date().toISOString(), updated_by: actor.userId,
        }).eq('organization_id', organizationId).select().maybeSingle());
      } else {
        data = unwrap(await admin.from('organization_billing_overrides').insert({
          organization_id: organizationId, ...fields,
          created_by: actor.userId, updated_by: actor.userId,
        }).select().maybeSingle());
      }
      return ok({ organizationBillingOverride: data });
    }

    if (action === 'deleteOverride') {
      const organizationId = String(body.organizationId || '');
      if (!organizationId) return fail(Object.assign(new Error('organizationId is required.'), { status: 400 }));
      unwrap(await admin.from('organization_billing_overrides').delete().eq('organization_id', organizationId));
      return ok({ deletedOrganizationId: organizationId });
    }

    return fail(Object.assign(new Error(`Unknown action "${action}".`), { status: 400 }));
  } catch (e) { return fail(e); }
}
