/* Test-only helpers. These are unreachable in production and make no external
 * payment calls; they exercise the exact signed webhook handlers used live. */
import { supabaseAdmin } from './supabase';
import { baseUrl, billingConfig, getInvoices, getSubscription } from './billing';
import { PLAN_MAP, type PlanId } from './billing-plans';

export async function supabaseAdminBillingOrgId(slug: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from('organizations')
    .select('id').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id || null;
}

export function qaPollUrl(req: Request, reference: string): string {
  const secret = billingConfig().qaSecret;
  const u = new URL('/api/webhooks/paynow/mock-poll', baseUrl(req));
  u.searchParams.set('reference', reference);
  if (secret) u.searchParams.set('qa_secret', secret);
  return u.toString();
}

export function qaEventId(prefix: string): string {
  return `evt_mock_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function buildStripeStepEvent(orgId: string, slug: string, step: string) {
  const sub = await getSubscription(orgId);
  if (!sub) throw new Error('Billing subscription not found');
  const planId: PlanId = sub.plan_id;
  const now = Math.floor(Date.now() / 1000);
  const trialEnd = now + 14 * 86400;
  const periodStart = sub.current_period_start ? Math.floor(new Date(sub.current_period_start).getTime() / 1000) : now;
  const periodEnd = sub.current_period_end ? Math.floor(new Date(sub.current_period_end).getTime() / 1000) : trialEnd;
  const subscriptionId = sub.stripe_subscription_id || `sub_mock_${orgId.slice(0, 8)}`;
  const customerId = sub.stripe_customer_id || `cus_mock_${orgId.slice(0, 8)}`;
  const metadata = { orgId, orgSlug: slug, planId };
  const baseSubscription = {
    id: subscriptionId, object: 'subscription', customer: customerId, status: 'trialing',
    trial_end: trialEnd, cancel_at_period_end: false, metadata,
    items: { object: 'list', data: [{ id: 'si_mock', current_period_start: now, current_period_end: trialEnd }] },
  };
  let type = 'customer.subscription.created';
  let object: any = baseSubscription;
  switch (step) {
    case 'checkout':
      type = 'checkout.session.completed';
      object = {
        id: sub.stripe_checkout_session_id || `cs_mock_${orgId.slice(0, 8)}`,
        object: 'checkout.session', client_reference_id: orgId,
        customer: customerId, subscription: subscriptionId, metadata,
      };
      break;
    case 'trial_created':
      type = 'customer.subscription.created'; object = baseSubscription; break;
    case 'trial_will_end':
      type = 'customer.subscription.trial_will_end';
      object = { ...baseSubscription, trial_end: now + 3 * 86400 };
      break;
    case 'subscription_deleted':
      type = 'customer.subscription.deleted';
      object = { ...baseSubscription, status: 'canceled', cancel_at_period_end: true };
      break;
    case 'invoice_paid':
      type = 'invoice.paid';
      object = {
        id: `in_mock_${Date.now()}`, object: 'invoice', customer: customerId,
        subscription: subscriptionId, amount_paid: Math.round(PLAN_MAP[planId].priceUsd * 100),
        metadata,
        lines: { object: 'list', data: [{ id: 'il_mock', period: { start: periodStart, end: periodEnd } }] },
      };
      break;
    case 'invoice_payment_failed':
      type = 'invoice.payment_failed';
      object = {
        id: `in_mock_failed_${Date.now()}`, object: 'invoice', customer: customerId,
        subscription: subscriptionId, amount_due: Math.round(PLAN_MAP[planId].priceUsd * 100),
        metadata,
        lines: { object: 'list', data: [{ id: 'il_mock', period: { start: periodStart, end: periodEnd } }] },
      };
      break;
    default:
      throw new Error(`Unknown QA step: ${step}`);
  }
  return {
    id: qaEventId(step), object: 'event', api_version: '2025-09-30.clover',
    created: now, livemode: false, pending_webhooks: 0, request: { id: null, idempotency_key: null },
    type, data: { object },
  };
}
