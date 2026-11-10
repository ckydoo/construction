/* Server-only billing state. No payment credentials, card data or lock decision
 * are exposed to the browser. All writes use the service-role client because
 * billing state is authoritative and must never be editable through RLS. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from './supabase';
import {
  BILLING_CURRENCY, GRACE_DAYS, PLAN_MAP, PLANS, TRIAL_DAYS,
  billingAllowsAccess, billingAllowsWrite, isPlanId, planAmountFixed,
  type BillingStatus, type PlanId,
} from './billing-plans';

export type BillingMode = 'off' | 'qa' | 'live' | 'misconfigured';

export type BillingSubscription = {
  organization_id: string;
  plan_id: PlanId;
  status: BillingStatus;
  gateway: 'none' | 'stripe' | 'paynow';
  paynow_preferred: boolean;
  comped_reason: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  switch_deadline: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_cancelled_at: string | null;
  last_stripe_charge_period_start: string | null;
  paynow_last_reference: string | null;
  last_payment_at: string | null;
  cancelled_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type BillingInvoice = {
  id: string;
  organization_id: string;
  invoice_number: string;
  reference: string;
  plan_id: PlanId;
  gateway: 'stripe' | 'paynow' | 'mock';
  amount_usd: string | number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  period_start: string;
  period_end: string;
  due_at: string;
  hosted_url: string | null;
  poll_url: string | null;
  gateway_reference: string | null;
  raw_status: string | null;
  paid_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  reminder_upcoming_at: string | null;
  reminder_due_at: string | null;
  reminder_grace_at: string | null;
  failure_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

const truthy = (value: unknown) => String(value || '').trim().toLowerCase() === 'true';

export function qaEnvironmentAllowed(): boolean {
  // `next start` sets NODE_ENV=production even on a laptop. QA is allowed there,
  // but never on a Vercel deployment (where BILLING_QA_MODE stays false anyway).
  if (String(process.env.VERCEL || '') === '1') return false;
  if (/vercel\.app/i.test(String(process.env.NEXT_PUBLIC_APP_URL || ''))) return false;
  return true;
}

export function billingMode(): BillingMode {
  const qa = truthy(process.env.BILLING_QA_MODE) && qaEnvironmentAllowed();
  if (!truthy(process.env.BILLING_ENABLED)) return qa ? 'qa' : 'off';
  if (qa) return 'qa';
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  // An explicit production switch without a LIVE Stripe key is a misconfiguration,
  // never a silent charge. Use BILLING_QA_MODE locally for sk_test_ keys.
  if (!secret || !secret.startsWith('sk_live_')) return 'misconfigured';
  return 'live';
}
export function billingActive(): boolean {
  const mode = billingMode();
  return mode === 'qa' || mode === 'live';
}
export function liveChargesAllowed(): boolean { return billingMode() === 'live'; }
export function paynowMockEnabled(): boolean { return billingMode() === 'qa' && truthy(process.env.PAYNOW_MOCK); }
export function stripeMockEnabled(): boolean {
  return billingMode() === 'qa' && !String(process.env.STRIPE_SECRET_KEY || '').trim().startsWith('sk_test_');
}

export function billingConfig() {
  const mode = billingMode();
  const stripeSecret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const paynowKey = String(process.env.PAYNOW_INTEGRATION_KEY || '').trim();
  const mockKey = String(process.env.BILLING_QA_KEY || 'myla-paynow-mock-key');
  return {
    mode, active: mode === 'qa' || mode === 'live', trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS,
    currency: BILLING_CURRENCY, taxIncluded: false, stripeTaxEnabled: false,
    stripeSecret, stripeWebhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
    stripePrices: {
      STARTER: String(process.env.STRIPE_PRICE_STARTER || '').trim(),
      PRO: String(process.env.STRIPE_PRICE_PRO || '').trim(),
      ENTERPRISE: String(process.env.STRIPE_PRICE_ENTERPRISE || '').trim(),
    } as Record<PlanId, string>,
    stripePortalConfiguration: String(process.env.STRIPE_PORTAL_CONFIGURATION || '').trim(),
    paynowId: String(process.env.PAYNOW_INTEGRATION_ID || '').trim(),
    paynowKey, paynowEffectiveKey: paynowKey || mockKey,
    paynowInitiateUrl: String(process.env.PAYNOW_INITIATE_URL || 'https://www.paynow.co.zw/interface/initiatetransaction').trim(),
    paynowReturnUrl: String(process.env.PAYNOW_RETURN_URL || '').trim(),
    paynowResultUrl: String(process.env.PAYNOW_RESULT_URL || '').trim(),
    paynowMock: paynowMockEnabled(),
    paynowReady: mode === 'qa' ? paynowMockEnabled() : Boolean(String(process.env.PAYNOW_INTEGRATION_ID || '').trim() && paynowKey),
    stripeReady: mode === 'qa' ? !stripeMockEnabled() : Boolean(stripeSecret && String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()),
    cronSecret: String(process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET || '').trim(),
    qaSecret: String(process.env.BILLING_QA_SECRET || '').trim(),
  };
}

export function baseUrl(req?: Request): string {
  // A request's own origin is authoritative: it works for localhost QA, Vercel
  // preview hosts and the production alias without trusting a stale APP_URL.
  if (req) {
    const origin = new URL(req.url).origin;
    // Next's local network bind can surface as 0.0.0.0; browsers and server-side
    // fetches reach that host as 127.0.0.1 instead.
    return origin.replace('://0.0.0.0:', '://127.0.0.1:');
  }
  return String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '') || 'http://localhost:3000';
}

export function addDays(date: Date | string, days: number): Date {
  const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d;
}
export function addMonths(date: Date | string, months = 1): Date {
  const d = new Date(date); d.setUTCMonth(d.getUTCMonth() + months); return d;
}
export function iso(date: Date | string | null | undefined): string | null {
  if (!date) return null; return new Date(date).toISOString();
}
export function fromUnixSeconds(value: unknown): string | null {
  const n = Number(value); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}
export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
export function safeHashEqual(a: string, b: string): boolean {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
export function randomToken(bytes = 5): string { return randomBytes(bytes).toString('hex').toUpperCase(); }

function normalizePlan(value: unknown): PlanId {
  return isPlanId(value) ? value : 'STARTER';
}
function normalizeStatus(value: unknown): BillingStatus {
  const allowed: BillingStatus[] = ['trial_required','trialing','active','past_due','grace','switch_pending','locked','cancelled','comped'];
  return allowed.includes(value as BillingStatus) ? value as BillingStatus : 'trial_required';
}
function normalizeGateway(value: unknown): 'none' | 'stripe' | 'paynow' {
  return value === 'stripe' || value === 'paynow' ? value : 'none';
}

export function normalizeSubscription(row: any): BillingSubscription {
  return {
    organization_id: String(row.organization_id), plan_id: normalizePlan(row.plan_id),
    status: normalizeStatus(row.status), gateway: normalizeGateway(row.gateway),
    paynow_preferred: !!row.paynow_preferred, comped_reason: row.comped_reason || null,
    trial_ends_at: iso(row.trial_ends_at), current_period_start: iso(row.current_period_start),
    current_period_end: iso(row.current_period_end), grace_until: iso(row.grace_until),
    switch_deadline: iso(row.switch_deadline), stripe_customer_id: row.stripe_customer_id || null,
    stripe_subscription_id: row.stripe_subscription_id || null,
    stripe_checkout_session_id: row.stripe_checkout_session_id || null,
    stripe_cancelled_at: iso(row.stripe_cancelled_at),
    last_stripe_charge_period_start: iso(row.last_stripe_charge_period_start),
    paynow_last_reference: row.paynow_last_reference || null,
    last_payment_at: iso(row.last_payment_at), cancelled_at: iso(row.cancelled_at),
    metadata: (row.metadata && typeof row.metadata === 'object') ? row.metadata : {},
    created_at: iso(row.created_at) || new Date().toISOString(),
    updated_at: iso(row.updated_at) || new Date().toISOString(),
  };
}

export async function getOrgSlug(orgId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from('organizations')
    .select('slug').eq('id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.slug || null;
}

export async function getSubscription(orgId: string): Promise<BillingSubscription | null> {
  const { data, error } = await supabaseAdmin().from('billing_subscriptions')
    .select('*').eq('organization_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeSubscription(data) : null;
}

export async function findSubscriptionByStripeId(stripeSubscriptionId: string): Promise<BillingSubscription | null> {
  const { data, error } = await supabaseAdmin().from('billing_subscriptions')
    .select('*').eq('stripe_subscription_id', stripeSubscriptionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeSubscription(data) : null;
}

export async function upsertSubscription(orgId: string, patch: Partial<BillingSubscription>): Promise<BillingSubscription> {
  const current = await getSubscription(orgId);
  const next: any = {
    ...(current || {}),
    ...patch,
    organization_id: orgId,
  };
  delete next.created_at;
  delete next.updated_at;
  const { data, error } = await supabaseAdmin().from('billing_subscriptions')
    .upsert(next, { onConflict: 'organization_id' }).select('*').single();
  if (error) throw new Error(error.message);
  return normalizeSubscription(data);
}

export async function getInvoices(orgId: string, limit = 24): Promise<BillingInvoice[]> {
  const { data, error } = await supabaseAdmin().from('billing_invoices')
    .select('*').eq('organization_id', orgId)
    .order('period_start', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(error.message);
  return (data || []) as BillingInvoice[];
}

export async function getInvoiceByReference(reference: string): Promise<BillingInvoice | null> {
  const { data, error } = await supabaseAdmin().from('billing_invoices')
    .select('*').eq('reference', reference).maybeSingle();
  if (error) throw new Error(error.message);
  return data as BillingInvoice | null;
}

/** One invoice per organisation, gateway and period. Safe under webhook retries. */
export async function findOrCreateInvoice(input: {
  orgId: string; planId: PlanId; gateway: 'stripe' | 'paynow' | 'mock';
  periodStart: Date | string; periodEnd: Date | string; dueAt?: Date | string;
  reference?: string; gatewayReference?: string; hostedUrl?: string | null; pollUrl?: string | null;
  metadata?: Record<string, any>;
}): Promise<{ invoice: BillingInvoice; created: boolean }> {
  const plan = PLAN_MAP[input.planId];
  const start = new Date(input.periodStart).toISOString();
  const end = new Date(input.periodEnd).toISOString();
  const due = new Date(input.dueAt || start).toISOString();
  const admin = supabaseAdmin();
  const existing = await admin.from('billing_invoices').select('*')
    .eq('organization_id', input.orgId).eq('gateway', input.gateway)
    .eq('period_start', start).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { invoice: existing.data as BillingInvoice, created: false };

  const stamp = start.slice(0, 7).replace('-', '');
  const token = randomToken(6);
  const row = {
    organization_id: input.orgId,
    invoice_number: `MYLA-${stamp}-${token}`,
    reference: input.reference || `MYLA-${stamp}-${token}`,
    plan_id: input.planId, gateway: input.gateway,
    amount_usd: planAmountFixed(input.planId), currency: BILLING_CURRENCY,
    status: 'pending', period_start: start, period_end: end, due_at: due,
    hosted_url: input.hostedUrl || null, poll_url: input.pollUrl || null,
    gateway_reference: input.gatewayReference || null,
    metadata: { planName: plan.name, amountUsd: plan.priceUsd, taxIncluded: false, ...(input.metadata || {}) },
  };
  const { data, error } = await admin.from('billing_invoices').insert(row).select('*').single();
  if (!error) return { invoice: data as BillingInvoice, created: true };
  if (error.code === '23505') {
    const retry = await admin.from('billing_invoices').select('*')
      .eq('organization_id', input.orgId).eq('gateway', input.gateway).eq('period_start', start).maybeSingle();
    if (retry.data) return { invoice: retry.data as BillingInvoice, created: false };
  }
  throw new Error(error.message);
}

export async function updateInvoice(id: string, patch: Partial<BillingInvoice>): Promise<BillingInvoice> {
  const clean: any = { ...patch };
  delete clean.id; delete clean.organization_id; delete clean.created_at; delete clean.updated_at;
  const { data, error } = await supabaseAdmin().from('billing_invoices')
    .update(clean).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as BillingInvoice;
}

export async function recordWebhookEvent(provider: 'stripe' | 'paynow' | 'mock', eventId: string, eventType: string, payload: any): Promise<boolean> {
  // Claim, not just insert: an event whose processing did not finish (e.g. a
  // Paynow poll that timed out) must be retryable with the identical payload.
  const { data, error } = await supabaseAdmin().from('billing_webhook_events')
    .upsert({ provider, event_id: eventId, event_type: eventType, payload: payload || {} },
      { onConflict: 'provider,event_id' })
    .select('id,processed_at').single();
  if (error) throw new Error(error.message);
  return !data?.processed_at;
}
export async function markWebhookProcessed(provider: string, eventId: string): Promise<void> {
  await supabaseAdmin().from('billing_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('provider', provider).eq('event_id', eventId);
}

export async function recordBillingEvent(orgId: string, kind: string, dedupeKey: string | null, detail: string, payload: any = {}): Promise<void> {
  try {
    await supabaseAdmin().from('billing_events').upsert(
      { organization_id: orgId, kind, dedupe_key: dedupeKey, detail, payload },
      { onConflict: 'organization_id,kind,dedupe_key', ignoreDuplicates: true },
    );
  } catch { /* audit must never break billing */ }
}

export async function notifyBilling(orgId: string, title: string, body: string, kind = 'WARNING', href = '/billing'): Promise<void> {
  try {
    await supabaseAdmin().from('notifications').insert({
      organization_id: orgId, user_id: null, title, body, kind, href, read: false,
    });
  } catch { /* notification delivery must never break billing */ }
}

export type PublicBilling = {
  enabled: boolean; mode: BillingMode; plans: typeof PLANS; currency: string;
  trialDays: number; graceDays: number; taxIncluded: boolean; stripeTaxEnabled: boolean;
  status: BillingStatus; plan: PlanId; priceUsd: number; gateway: string;
  access: boolean; writable: boolean; readOnly: boolean; needsPayment: boolean;
  canManage: boolean; paynowPreferred: boolean; trialEndsAt: string | null;
  currentPeriodEnd: string | null; graceUntil: string | null; switchDeadline: string | null;
  comped: boolean; stripeCustomerPortal: boolean; paynowAvailable: boolean;
};

export async function publicBilling(orgId: string, role: string): Promise<PublicBilling> {
  const cfg = billingConfig();
  const sub = await getSubscription(orgId);
  const plan = sub?.plan_id || 'STARTER';
  const status = sub?.status || 'trial_required';
  const access = cfg.active ? billingAllowsAccess(status) : true;
  const writable = cfg.active ? billingAllowsWrite(status) : true;
  return {
    enabled: cfg.active, mode: cfg.mode, plans: PLANS, currency: BILLING_CURRENCY,
    trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS, taxIncluded: false, stripeTaxEnabled: false,
    status, plan, priceUsd: PLAN_MAP[plan].priceUsd, gateway: sub?.gateway || 'none',
    access, writable, readOnly: access && !writable, needsPayment: cfg.active && !access,
    canManage: role === 'OWNER' || role === 'ADMIN',
    paynowPreferred: !!sub?.paynow_preferred,
    trialEndsAt: sub?.trial_ends_at || null, currentPeriodEnd: sub?.current_period_end || null,
    graceUntil: sub?.grace_until || null, switchDeadline: sub?.switch_deadline || null,
    comped: status === 'comped',
    stripeCustomerPortal: Boolean(cfg.stripeReady && sub?.stripe_customer_id),
    paynowAvailable: cfg.paynowReady,
  };
}

export async function requireBillingManage(orgId: string, role: string): Promise<void> {
  if (role !== 'OWNER' && role !== 'ADMIN') throw new Error('Only owners and administrators can manage billing.');
  if (!billingActive()) throw new Error('Billing is in shadow mode. Add live keys and set BILLING_ENABLED=true to enable checkout.');
  void orgId;
}

export function billingError(message: string, status = 400): never {
  const e: any = new Error(message); e.status = status; throw e;
}
