/* Server-only billing state. No payment credentials, card data or lock decision
 * are exposed to the browser. All writes use the service-role client because
 * billing state is authoritative and must never be editable through RLS.
 *
 * Active rails: Paynow Zimbabwe is the primary customer-present monthly invoice
 * rail. DPO Pay by Network remains fully configured as the tokenised recurring
 * fallback: its code, webhooks, env keys and checkout/tokenisation paths stay.
 * Stripe is no longer used because a Zimbabwe-registered entity cannot receive
 * native Stripe payouts. Historic Stripe columns are retained but never written. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from './supabase';
import { appBaseUrl } from './email';
import { adminUserIds, notifyUsersByCategory, orgSlug, queueCategoryEmails, type NotificationKind } from './notification-service';
import {
  BILLING_CURRENCY, GRACE_DAYS, PLAN_CHANGE_POLICY, PLAN_MAP, PLANS,
  PRICE_BOOK_VERSION, TRIAL_DAYS,
  billingAllowsAccess, billingAllowsWrite, isPlanId, planAmountFixed,
  type BillingStatus, type PlanId,
} from './billing-plans';

export type BillingMode = 'off' | 'qa' | 'live' | 'misconfigured';
export type BillingGateway = 'none' | 'stripe' | 'paynow' | 'dpo' | 'mock';
export type BillingProvider = 'stripe' | 'paynow' | 'dpo' | 'mock';

export type BillingSubscription = {
  organization_id: string;
  plan_id: PlanId;
  status: BillingStatus;
  gateway: BillingGateway;
  paynow_preferred: boolean;
  comped_reason: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  switch_deadline: string | null;
  pending_plan_id: PlanId | null;
  pending_plan_effective_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_cancelled_at: string | null;
  last_stripe_charge_period_start: string | null;
  paynow_last_reference: string | null;
  dpo_customer_email: string | null;
  dpo_customer_token: string | null;
  dpo_subscription_token: string | null;
  dpo_last_transaction_token: string | null;
  dpo_last_reference: string | null;
  dpo_tokenised_at: string | null;
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
  gateway: BillingProvider;
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

export function expectedInvoiceAmount(
  invoice: Pick<BillingInvoice, 'plan_id' | 'amount_usd' | 'metadata'>,
): string {
  if (invoice.metadata?.invoiceKind === 'plan_adjustment') {
    const value = Number(invoice.metadata?.planChange?.prorationUsd ?? invoice.amount_usd);
    return Number.isFinite(value) ? value.toFixed(2) : planAmountFixed(invoice.plan_id);
  }
  return planAmountFixed(invoice.plan_id);
}

/** Gateway-side exact-amount validation. A prorated adjustment may be less than
 * the monthly plan price, but must be positive, self-consistent and no larger
 * than the monthly price difference. All other invoices use the price book. */
export function validateInvoiceAmount(
  invoice: Pick<BillingInvoice, 'plan_id' | 'amount_usd' | 'metadata'>,
  requestedPlan: PlanId,
): string {
  const amount = Number(invoice.amount_usd).toFixed(2);
  if (invoice.plan_id !== requestedPlan) billingError('Invoice plan does not match the selected plan.', 409);
  if (invoice.metadata?.invoiceKind === 'plan_adjustment') {
    const change = invoice.metadata?.planChange || {};
    const fromPlan = change.fromPlan as PlanId;
    const proration = Number(change.prorationUsd);
    const maximum = isPlanId(fromPlan)
      ? PLAN_MAP[requestedPlan].priceUsd - PLAN_MAP[fromPlan].priceUsd : 0;
    if (!Number.isFinite(proration) || proration <= 0 || maximum <= 0
        || proration - maximum > 0.009 || amount !== proration.toFixed(2)) {
      billingError('Prorated adjustment amount is invalid.', 409);
    }
    return amount;
  }
  if (amount !== planAmountFixed(requestedPlan)) {
    billingError('Invoice amount does not match the selected plan.', 409);
  }
  return amount;
}

const truthy = (value: unknown) => String(value || '').trim().toLowerCase() === 'true';

export function qaEnvironmentAllowed(): boolean {
  // QA is allowed on a local `next start` but never on a Vercel deployment.
  if (String(process.env.VERCEL || '') === '1') return false;
  if (/vercel\.app/i.test(String(process.env.NEXT_PUBLIC_APP_URL || ''))) return false;
  return true;
}

function dpoLiveReady(): boolean {
  const token = String(process.env.DPO_COMPANY_TOKEN || '').trim();
  const service = String(process.env.DPO_SERVICE_TYPE || '').trim()
    || String(process.env.DPO_SERVICE_TYPE_NAME || '').trim();
  const callback = String(process.env.DPO_CALLBACK_SECRET || '').trim();
  const push = String(process.env.DPO_PUSH_SECRET || '').trim();
  // DPO production and sandbox share one endpoint, so the live switch is explicit.
  return truthy(process.env.DPO_LIVE_MODE) && Boolean(token && service && callback && push);
}
function paynowLiveReady(): boolean {
  return Boolean(String(process.env.PAYNOW_INTEGRATION_ID || '').trim()
    && String(process.env.PAYNOW_INTEGRATION_KEY || '').trim());
}

export function billingMode(): BillingMode {
  const qa = truthy(process.env.BILLING_QA_MODE) && qaEnvironmentAllowed();
  if (!truthy(process.env.BILLING_ENABLED)) return qa ? 'qa' : 'off';
  if (qa) return 'qa';
  // Paynow is primary, but a complete DPO live configuration also unlocks the
  // retained fallback rail. Either way, a switch without live credentials is a
  // misconfiguration and never a silent charge.
  return paynowLiveReady() || dpoLiveReady() ? 'live' : 'misconfigured';
}
export function billingActive(): boolean {
  const mode = billingMode();
  return mode === 'qa' || mode === 'live';
}
export function liveChargesAllowed(): boolean { return billingMode() === 'live'; }
export function dpoMockEnabled(): boolean {
  return billingMode() === 'qa' && truthy(process.env.DPO_MOCK);
}
export function paynowMockEnabled(): boolean {
  return billingMode() === 'qa' && truthy(process.env.PAYNOW_MOCK);
}

export type GatewayPreference = 'paynow' | 'dpo';
/** Paynow is the default for every new workspace. Explicit DPO fallback is kept
 * for tokenised recurring accounts and for the DPO QA suite. */
export function gatewayPreference(row: any): GatewayPreference {
  const explicit = row?.metadata?.gatewayPreference;
  if (explicit === 'dpo' || explicit === 'paynow') return explicit;
  if (row?.paynow_preferred === true) return 'paynow';
  if (row?.dpo_subscription_token) return 'dpo';
  return 'paynow';
}
export function paynowPreferred(row: any): boolean { return gatewayPreference(row) === 'paynow'; }

export function primaryGateway(): BillingGateway {
  return 'paynow';
}
/** DPO remains a first-class configured fallback, including its local QA mock. */
export function dpoProvider(): BillingProvider {
  return dpoMockEnabled() ? 'mock' : 'dpo';
}
/** Choose the invoice rail: Paynow by default, DPO only by explicit selection
 * or as a configured fallback when Paynow is unavailable. */
export function invoiceGateway(sub: BillingSubscription): BillingProvider {
  const cfg = billingConfig();
  if (gatewayPreference(sub) === 'dpo') return dpoProvider();
  if (cfg.mode === 'qa' || cfg.paynowReady || !cfg.dpoReady) return 'paynow';
  return dpoProvider();
}

export function billingConfig() {
  const mode = billingMode();
  const paynowKey = String(process.env.PAYNOW_INTEGRATION_KEY || '').trim();
  const mockKey = String(process.env.BILLING_QA_KEY || 'myla-paynow-mock-key');
  const dpoCompanyToken = String(process.env.DPO_COMPANY_TOKEN || '').trim();
  const dpoServiceType = String(process.env.DPO_SERVICE_TYPE || '').trim();
  const dpoServiceTypeName = String(process.env.DPO_SERVICE_TYPE_NAME || '').trim();
  const dpoCallbackSecret = String(process.env.DPO_CALLBACK_SECRET || '').trim();
  const dpoPushSecret = String(process.env.DPO_PUSH_SECRET || '').trim();
  const dpoLiveMode = truthy(process.env.DPO_LIVE_MODE);
  const dpoRecurringEnabled = truthy(process.env.DPO_RECURRING_ENABLED);
  const dpoMock = dpoMockEnabled();
  const paynowMock = paynowMockEnabled();
  const dpoReady = mode === 'qa'
    ? dpoMock
    : Boolean(dpoLiveMode && dpoCompanyToken && (dpoServiceType || dpoServiceTypeName) && dpoCallbackSecret && dpoPushSecret);
  const paynowLive = paynowLiveReady();
  return {
    mode, active: mode === 'qa' || mode === 'live', trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS,
    currency: BILLING_CURRENCY, taxIncluded: false, stripeTaxEnabled: false,
    primaryGateway: 'paynow' as const, paynowPrimary: true,
    dpoFallbackAvailable: dpoReady, paynowLiveReady: paynowLive,
    dpoApiUrl: String(process.env.DPO_API_URL || 'https://secure.3gdirectpay.com/API/v6/').trim(),
    dpoPaymentUrlTemplate: String(process.env.DPO_PAYMENT_URL_TEMPLATE || 'https://secure.3gdirectpay.com/payv2.php?ID={token}').trim(),
    dpoCompanyToken, dpoServiceType, dpoServiceTypeName,
    dpoCallbackSecret, dpoPushSecret, dpoLiveMode, dpoRecurringEnabled,
    dpoMock, dpoReady,
    paynowId: String(process.env.PAYNOW_INTEGRATION_ID || '').trim(),
    paynowKey, paynowEffectiveKey: paynowKey || mockKey,
    paynowInitiateUrl: String(process.env.PAYNOW_INITIATE_URL || 'https://www.paynow.co.zw/interface/initiatetransaction').trim(),
    paynowReturnUrl: String(process.env.PAYNOW_RETURN_URL || '').trim(),
    paynowResultUrl: String(process.env.PAYNOW_RESULT_URL || '').trim(),
    paynowMock,
    paynowReady: mode === 'qa' ? paynowMock : paynowLive,
    stripeCheckoutAvailable: false,
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
function normalizeGateway(value: unknown): BillingGateway {
  return value === 'stripe' || value === 'paynow' || value === 'dpo' || value === 'mock' ? value : 'none';
}

export function normalizeSubscription(row: any): BillingSubscription {
  const metadata: Record<string, any> = (row.metadata && typeof row.metadata === 'object') ? { ...row.metadata } : {};
  const preference = gatewayPreference(row);
  if (metadata.gatewayPreference !== 'dpo' && metadata.gatewayPreference !== 'paynow') metadata.gatewayPreference = preference;
  return {
    organization_id: String(row.organization_id), plan_id: normalizePlan(row.plan_id),
    status: normalizeStatus(row.status), gateway: normalizeGateway(row.gateway),
    paynow_preferred: preference === 'paynow', comped_reason: row.comped_reason || null,
    trial_ends_at: iso(row.trial_ends_at), current_period_start: iso(row.current_period_start),
    current_period_end: iso(row.current_period_end), grace_until: iso(row.grace_until),
    switch_deadline: iso(row.switch_deadline),
    pending_plan_id: isPlanId(row.pending_plan_id) ? row.pending_plan_id : null,
    pending_plan_effective_at: iso(row.pending_plan_effective_at),
    stripe_customer_id: row.stripe_customer_id || null,
    stripe_subscription_id: row.stripe_subscription_id || null,
    stripe_checkout_session_id: row.stripe_checkout_session_id || null,
    stripe_cancelled_at: iso(row.stripe_cancelled_at),
    last_stripe_charge_period_start: iso(row.last_stripe_charge_period_start),
    paynow_last_reference: row.paynow_last_reference || null,
    dpo_customer_email: row.dpo_customer_email || null,
    dpo_customer_token: row.dpo_customer_token || null,
    dpo_subscription_token: row.dpo_subscription_token || null,
    dpo_last_transaction_token: row.dpo_last_transaction_token || null,
    dpo_last_reference: row.dpo_last_reference || null,
    dpo_tokenised_at: iso(row.dpo_tokenised_at),
    last_payment_at: iso(row.last_payment_at), cancelled_at: iso(row.cancelled_at),
    metadata,
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

/** ISO-3166 alpha-2 country from onboarding, for optional DPO customer fields. */
export async function getOrgCountry(orgId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from('organizations')
    .select('country').eq('id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  const country = String(data?.country || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
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

/* One non-cancelled invoice per organisation and accounting period, regardless
 * of which configured gateway is selected. Safe under webhook retries and plan
 * changes; gateway reissue cancels the old invoice rather than deleting it. */
export async function findOrCreateInvoice(input: {
  orgId: string; planId: PlanId; gateway: BillingProvider;
  periodStart: Date | string; periodEnd: Date | string; dueAt?: Date | string;
  reference?: string; gatewayReference?: string; hostedUrl?: string | null; pollUrl?: string | null;
  amountUsd?: number; metadata?: Record<string, any>;
}): Promise<{ invoice: BillingInvoice; created: boolean }> {
  const start = new Date(input.periodStart).toISOString();
  const end = new Date(input.periodEnd).toISOString();
  const due = new Date(input.dueAt || start).toISOString();
  const amount = input.amountUsd != null
    ? Number(input.amountUsd).toFixed(2) : planAmountFixed(input.planId);
  const adjustment = input.metadata?.invoiceKind === 'plan_adjustment';
  const admin = supabaseAdmin();
  const existingRows = await admin.from('billing_invoices').select('*')
    .eq('organization_id', input.orgId).eq('period_start', start)
    .neq('status', 'cancelled').limit(20);
  if (existingRows.error) throw new Error(existingRows.error.message);
  const candidates = (existingRows.data || []).filter((row: any) =>
    (row.metadata?.invoiceKind === 'plan_adjustment') === adjustment);
  const existing = (candidates.find((row: any) => row.status === 'pending')
    || candidates.find((row: any) => row.status === 'paid')
    || candidates[0]) as BillingInvoice | undefined;
  if (existing) {
    if (existing.gateway === input.gateway || existing.status !== 'pending') {
      return { invoice: existing, created: false };
    }
    // Gateway switched before checkout. Preserve history; reissue only if the
    // first invoice was already sent to a gateway, otherwise move it safely.
    if (!existing.hosted_url && !existing.poll_url && !existing.gateway_reference) {
      return {
        invoice: await updateInvoice(existing.id, {
          gateway: input.gateway, plan_id: input.planId, amount_usd: amount,
          metadata: { ...(existing.metadata || {}), ...(input.metadata || {}), priceBookVersion: PRICE_BOOK_VERSION },
        }),
        created: false,
      };
    }
    await updateInvoice(existing.id, {
      status: 'cancelled', cancelled_at: iso(new Date()),
      failure_reason: 'Reissued on the selected payment rail',
      metadata: { ...(existing.metadata || {}), reissuedAt: new Date().toISOString() },
    });
  }

  const stamp = start.slice(0, 7).replace('-', '');
  const token = randomToken(6);
  const row = {
    organization_id: input.orgId,
    invoice_number: `MYLA-${stamp}-${token}`,
    reference: input.reference || `MYLA-${stamp}-${token}`,
    plan_id: input.planId, gateway: input.gateway,
    amount_usd: amount, currency: BILLING_CURRENCY,
    status: 'pending', period_start: start, period_end: end, due_at: due,
    hosted_url: input.hostedUrl || null, poll_url: input.pollUrl || null,
    gateway_reference: input.gatewayReference || null,
    metadata: {
      planName: PLAN_MAP[input.planId].name,
      amountUsd: Number(amount), taxIncluded: false,
      priceBookVersion: PRICE_BOOK_VERSION, ...(input.metadata || {}),
    },
  };
  const { data, error } = await admin.from('billing_invoices').insert(row).select('*').single();
  if (!error) return { invoice: data as BillingInvoice, created: true };
  if (error.code === '23505') {
    const retry = await admin.from('billing_invoices').select('*')
      .eq('organization_id', input.orgId).eq('gateway', input.gateway)
      .eq('period_start', start).neq('status', 'cancelled').maybeSingle();
    if (retry.error) throw new Error(retry.error.message);
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

export async function recordWebhookEvent(provider: BillingProvider, eventId: string, eventType: string, payload: any): Promise<boolean> {
  // Claim, not just insert: an event whose processing did not finish (e.g. a
  // pending verification) must be retryable with the identical payload.
  const { data, error } = await supabaseAdmin().from('billing_webhook_events')
    .upsert({ provider, event_id: eventId, event_type: eventType, payload: payload || {} },
      { onConflict: 'provider,event_id' })
    .select('id,processed_at').single();
  if (error) throw new Error(error.message);
  return !data?.processed_at;
}
export async function markWebhookProcessed(provider: BillingProvider, eventId: string): Promise<void> {
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
    const fingerprint = createHash('sha256').update(`${title}|${body}|${new Date().toISOString().slice(0, 10)}`).digest('hex').slice(0, 20);
    const notificationKind = (['INFO', 'SUCCESS', 'WARNING', 'ALERT'].includes(kind) ? kind : 'WARNING') as NotificationKind;
    const admins = await adminUserIds(orgId);
    await notifyUsersByCategory(orgId, admins, 'billing', title, body, notificationKind, href, `billing:${fingerprint}`);
    const slug = await orgSlug(orgId);
    await queueCategoryEmails({
      userIds: admins,
      category: 'billing',
      templateKey: 'billing',
      subject: title,
      headline: title,
      body,
      ctaLabel: 'Review billing',
      ctaUrl: `${appBaseUrl()}/${slug || ''}${href.startsWith('/') ? href : `/${href}`}`,
      orgSlug: slug,
      dedupeKey: `billing-email:${fingerprint}`,
      essential: true,
      note: 'This is an essential billing message. Your subscription and account emails stay on even when optional notifications are muted.',
    });
  } catch { /* notification delivery must never break billing */ }
}

export type PublicBilling = {
  enabled: boolean; mode: BillingMode; plans: typeof PLANS; currency: string;
  trialDays: number; graceDays: number; taxIncluded: boolean; stripeTaxEnabled: boolean;
  trialRequiresCard: boolean; dpoAvailable: boolean; dpoCheckoutAvailable: boolean;
  dpoRecurringEnabled: boolean; dpoTokenised: boolean; dpoFallbackAvailable: boolean;
  paynowAvailable: boolean; paynowPrimary: boolean; primaryGateway: BillingGateway;
  gatewayPreference: GatewayPreference; dpoFallbackSelected: boolean;
  stripeCheckoutAvailable: boolean; stripeCustomerPortal: boolean;
  status: BillingStatus; plan: PlanId; priceUsd: number; gateway: BillingGateway;
  access: boolean; writable: boolean; readOnly: boolean; needsPayment: boolean;
  canManage: boolean; paynowPreferred: boolean; trialEndsAt: string | null;
  currentPeriodEnd: string | null; graceUntil: string | null; switchDeadline: string | null;
  comped: boolean; priceBookVersion: string; planChangePolicy: string;
  paymentDueAt: string | null; canChangePlan: boolean;
  pendingPlanChange: {
    id: string; fromPlan: PlanId; toPlan: PlanId;
    direction: 'upgrade' | 'downgrade'; effectiveAt: string | null;
    status: string; prorationUsd: number; adjustmentInvoiceId: string | null;
  } | null;
};

export async function publicBilling(orgId: string, role: string): Promise<PublicBilling> {
  const cfg = billingConfig();
  const sub = await getSubscription(orgId);
  const plan = sub?.plan_id || 'STARTER';
  const status = sub?.status || 'trial_required';
  const access = cfg.active ? billingAllowsAccess(status) : true;
  const writable = cfg.active ? billingAllowsWrite(status) : true;
  const preference = gatewayPreference(sub);
  const admin = supabaseAdmin();
  const [dueRow, changeRow] = await Promise.all([
    admin.from('billing_invoices').select('due_at').eq('organization_id', orgId)
      .eq('status', 'pending').order('due_at', { ascending: true }).limit(1).maybeSingle(),
    admin.from('billing_plan_changes').select('*').eq('organization_id', orgId)
      .in('status', ['pending','payment_pending']).order('created_at', { ascending: false })
      .limit(1).maybeSingle(),
  ]);
  const pc = changeRow.data;
  const pendingPlanChange = pc ? {
    id: String(pc.id),
    fromPlan: pc.from_plan as PlanId,
    toPlan: pc.to_plan as PlanId,
    direction: pc.direction as 'upgrade' | 'downgrade',
    effectiveAt: iso(pc.effective_at),
    status: String(pc.status),
    prorationUsd: Number(pc.proration_usd || 0),
    adjustmentInvoiceId: pc.adjustment_invoice_id || null,
  } : null;
  return {
    enabled: cfg.active, mode: cfg.mode, plans: PLANS, currency: BILLING_CURRENCY,
    trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS, taxIncluded: false, stripeTaxEnabled: false,
    trialRequiresCard: false,
    dpoAvailable: cfg.dpoReady, dpoCheckoutAvailable: cfg.dpoReady,
    dpoRecurringEnabled: cfg.dpoRecurringEnabled, dpoTokenised: Boolean(sub?.dpo_subscription_token),
    dpoFallbackAvailable: cfg.dpoReady,
    paynowAvailable: cfg.paynowReady, paynowPrimary: true, primaryGateway: cfg.primaryGateway,
    gatewayPreference: preference, dpoFallbackSelected: preference === 'dpo',
    stripeCheckoutAvailable: false, stripeCustomerPortal: false,
    status, plan, priceUsd: PLAN_MAP[plan].priceUsd, gateway: sub?.gateway || 'none',
    access, writable, readOnly: access && !writable, needsPayment: cfg.active && !access,
    canManage: role === 'OWNER' || role === 'ADMIN',
    paynowPreferred: preference === 'paynow',
    trialEndsAt: sub?.trial_ends_at || null, currentPeriodEnd: sub?.current_period_end || null,
    graceUntil: sub?.grace_until || null, switchDeadline: sub?.switch_deadline || null,
    comped: status === 'comped',
    priceBookVersion: PRICE_BOOK_VERSION, planChangePolicy: PLAN_CHANGE_POLICY,
    paymentDueAt: iso(dueRow.data?.due_at) || null,
    canChangePlan: status === 'active',
    pendingPlanChange,
  };
}

export async function requireBillingManage(orgId: string, role: string): Promise<void> {
  if (role !== 'OWNER' && role !== 'ADMIN') throw new Error('Only owners and administrators can manage billing.');
  if (!billingActive()) throw new Error('Billing is in shadow mode. Add live Paynow credentials (or a complete DPO fallback configuration) and set BILLING_ENABLED=true to enable checkout.');
  void orgId;
}

export function billingError(message: string, status = 400): never {
  const e: any = new Error(message); e.status = status; throw e;
}
