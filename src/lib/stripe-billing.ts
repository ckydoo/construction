/* Stripe Checkout, customer portal and webhook state machine.
 * Stripe is canonical for automatic subscriptions and the 14-day card-required
 * trial. ZW/Paynow tenants are cancelled at trial end BEFORE Stripe's first
 * charge, then a Paynow invoice covers the same period (never both). */
import Stripe from 'stripe';
import {
  addDays, addMonths, baseUrl, billingActive, billingConfig, billingError,
  findOrCreateInvoice, findSubscriptionByStripeId, fromUnixSeconds, getSubscription,
  iso, liveChargesAllowed, markWebhookProcessed, notifyBilling, recordBillingEvent,
  recordWebhookEvent, shortHash, stripeMockEnabled, updateInvoice, upsertSubscription,
  type BillingSubscription,
} from './billing';
import { PLAN_MAP, TRIAL_DAYS, planAmountMinor, type PlanId } from './billing-plans';

function client(): Stripe {
  const cfg = billingConfig();
  // QA mock mode needs a signer/verifier but makes no network calls.
  if (!cfg.stripeSecret && cfg.mode === 'qa') return new Stripe('sk_test_myla_qa_mock');
  if (!cfg.stripeSecret) billingError('STRIPE_SECRET_KEY is not configured.', 503);
  return new Stripe(cfg.stripeSecret);
}
function effectiveWebhookSecret(): string {
  const cfg = billingConfig();
  return cfg.stripeWebhookSecret || (cfg.mode === 'qa' ? (process.env.BILLING_QA_KEY || 'myla-stripe-mock-key') : '');
}

function subscriptionId(value: any): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : String(value.id || '') || null;
}
function customerId(value: any): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : String(value.id || '') || null;
}
function periodOf(sub: any): { start: string | null; end: string | null } {
  const item = sub?.items?.data?.[0] || {};
  return {
    start: fromUnixSeconds(item.current_period_start) || iso(sub?.metadata?.currentPeriodStart),
    end: fromUnixSeconds(item.current_period_end) || iso(sub?.metadata?.currentPeriodEnd),
  };
}
async function orgForStripeObject(obj: any, subId: string | null): Promise<{ orgId: string; sub: BillingSubscription | null }> {
  const meta = obj?.metadata || {};
  if (meta.orgId) return { orgId: String(meta.orgId), sub: await getSubscription(String(meta.orgId)) };
  if (subId) {
    const sub = await findSubscriptionByStripeId(subId);
    if (sub) return { orgId: sub.organization_id, sub };
  }
  billingError('Stripe event is not linked to a MYLA organisation.', 400);
}

export async function startTrialCheckout(input: {
  req: Request; orgId: string; slug: string; planId: PlanId; email: string; name: string;
  sub: BillingSubscription;
}) {
  const cfg = billingConfig();
  if (!billingActive()) billingError('Billing is in shadow mode.', 503);
  if (input.sub.status !== 'trial_required') billingError('A trial has already been started for this organisation.', 409);

  if (stripeMockEnabled()) {
    const sessionId = `cs_mock_${shortHash(`${input.orgId}:${Date.now()}`).toUpperCase()}`;
    await upsertSubscription(input.orgId, {
      plan_id: input.planId, status: 'trialing', gateway: 'stripe',
      stripe_checkout_session_id: sessionId,
      stripe_subscription_id: `sub_mock_${sessionId.slice(-12)}`,
      trial_ends_at: iso(addDays(new Date(), TRIAL_DAYS)),
      metadata: { ...(input.sub.metadata || {}), qaMockCheckout: true, planId: input.planId },
    });
    const url = `${baseUrl(input.req)}/api/qa/billing/stripe-checkout?session_id=${encodeURIComponent(sessionId)}&org=${encodeURIComponent(input.slug)}`;
    return { url, sessionId, mock: true };
  }

  if (!cfg.stripeReady) billingError('Stripe test/live secret and webhook secret are required.', 503);
  const stripe = client();
  if (input.sub.stripe_checkout_session_id) {
    try {
      const old = await stripe.checkout.sessions.retrieve(input.sub.stripe_checkout_session_id);
      if (old.url && old.status === 'open') return { url: old.url, sessionId: old.id, mock: false };
    } catch { /* create a fresh session */ }
  }
  const price = cfg.stripePrices[input.planId];
  const plan = PLAN_MAP[input.planId];
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = price
    ? { price, quantity: 1 }
    : {
        price_data: {
          currency: 'usd', unit_amount: planAmountMinor(input.planId),
          recurring: { interval: 'month' },
          product_data: { name: `MYLA ${plan.name} — monthly organisation plan` },
        },
        quantity: 1,
      };
  const origin = baseUrl(input.req);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [lineItem],
    customer_email: input.email || undefined,
    client_reference_id: input.orgId,
    metadata: { orgId: input.orgId, orgSlug: input.slug, planId: input.planId },
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      description: `MYLA ${plan.name} · 14-day card-required trial`,
      metadata: { orgId: input.orgId, orgSlug: input.slug, planId: input.planId },
    },
    payment_method_collection: 'always',
    automatic_tax: { enabled: false },
    allow_promotion_codes: false,
    success_url: `${origin}/${encodeURIComponent(input.slug)}/billing?checkout=success`,
    cancel_url: `${origin}/${encodeURIComponent(input.slug)}/billing?checkout=cancelled`,
  });
  if (!session.url) billingError('Stripe did not return a Checkout URL.', 502);
  await upsertSubscription(input.orgId, {
    plan_id: input.planId, status: 'trial_required', gateway: 'stripe',
    stripe_checkout_session_id: session.id,
    metadata: { ...(input.sub.metadata || {}), checkoutCreatedAt: new Date().toISOString(), planId: input.planId },
  });
  return { url: session.url, sessionId: session.id, mock: false };
}

export async function scheduleStripeCancellation(sub: BillingSubscription): Promise<void> {
  if (sub.stripe_subscription_id && !stripeMockEnabled()) {
    await client().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
  }
  await upsertSubscription(sub.organization_id, {
    metadata: { ...(sub.metadata || {}), cancelAtPeriodEnd: true, cancellationRequestedAt: new Date().toISOString() },
    cancelled_at: iso(new Date()),
  });
}

export async function createPortalSession(input: { req: Request; slug: string; sub: BillingSubscription }) {
  const cfg = billingConfig();
  if (!cfg.stripeReady || !input.sub.stripe_customer_id || stripeMockEnabled())
    billingError('The Stripe customer portal is not configured for this workspace.', 503);
  const session = await client().billingPortal.sessions.create({
    customer: input.sub.stripe_customer_id,
    return_url: `${baseUrl(input.req)}/${encodeURIComponent(input.slug)}/billing`,
    ...(cfg.stripePortalConfiguration ? { configuration: cfg.stripePortalConfiguration } : {}),
  });
  return { url: session.url };
}

/** Mark a Stripe trial to end at period end and create the matching Paynow
 * invoice. Called on `trial_will_end` and again by the daily sweep as a fallback. */
export async function initiateTrialEndSwitch(sub: BillingSubscription, trialEnd: Date | string): Promise<void> {
  if (!sub.paynow_preferred || !['trialing','switch_pending'].includes(sub.status)) return;
  const start = new Date(trialEnd);
  const end = addMonths(start, 1);
  const gateway = billingConfig().mode === 'qa' ? 'mock' : 'paynow';
  const { invoice, created } = await findOrCreateInvoice({
    orgId: sub.organization_id, planId: sub.plan_id, gateway,
    periodStart: start, periodEnd: end, dueAt: start,
    metadata: { switchFrom: 'stripe_trial', stripeSubscriptionId: sub.stripe_subscription_id },
  });
  if (!sub.metadata?.switchInitiated && sub.stripe_subscription_id && !stripeMockEnabled()) {
    await client().subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
      metadata: { ...(sub.metadata || {}), mylaSwitch: 'pending', orgId: sub.organization_id, planId: sub.plan_id },
    });
  }
  await upsertSubscription(sub.organization_id, {
    metadata: {
      ...(sub.metadata || {}), switchInitiated: true,
      switchPeriodStart: start.toISOString(), switchInvoiceId: invoice.id,
    },
  });
  if (created) {
    await notifyBilling(sub.organization_id, 'Your Paynow invoice is ready',
      `Pay USD ${PLAN_MAP[sub.plan_id].priceUsd.toFixed(2)} for ${start.toLocaleDateString('en-GB')} before your Stripe trial ends. Your data stays available; no Stripe charge will be made.`,
      'WARNING', '/billing');
    await recordBillingEvent(sub.organization_id, 'switch_initiated', invoice.reference,
      'Stripe trial scheduled to cancel at period end; Paynow invoice created before first charge.');
  }
}

export async function cancelStripeForPaynowPayment(sub: BillingSubscription, periodStart: string): Promise<{ conflict: boolean }> {
  let conflict = false;
  if (sub.stripe_subscription_id && !sub.stripe_cancelled_at) {
    if (!stripeMockEnabled()) {
      const stripe = client();
      try {
        const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
        if (current.status !== 'canceled') {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
            prorate: false, invoice_now: false,
          });
        }
        // Defensive: if a real first charge already landed, flag it for manual refund.
        const invoices = await stripe.invoices.list({ subscription: sub.stripe_subscription_id, limit: 10 });
        const paid = invoices.data.filter(i => i.status === 'paid' && (i.amount_paid || 0) > 0);
        conflict = paid.some(i => {
          const p = (i as any).lines?.data?.[0]?.period?.start;
          const start = fromUnixSeconds(p);
          return start && start.slice(0, 10) === periodStart.slice(0, 10);
        });
      } catch (e: any) {
        await recordBillingEvent(sub.organization_id, 'stripe_cancel_warning', periodStart,
          `Paynow payment succeeded but Stripe cancellation needs review: ${e?.message || e}`);
      }
    }
  }
  if (!conflict && sub.last_stripe_charge_period_start?.slice(0, 10) === periodStart.slice(0, 10)) conflict = true;
  return { conflict };
}

function statusPatch(status: string, sub: BillingSubscription, stripeSub: any): Partial<BillingSubscription> {
  const period = periodOf(stripeSub);
  const trialEnd = fromUnixSeconds(stripeSub.trial_end);
  const base: Partial<BillingSubscription> = {
    gateway: 'stripe',
    stripe_subscription_id: String(stripeSub.id || sub.stripe_subscription_id || ''),
    stripe_customer_id: customerId(stripeSub.customer) || sub.stripe_customer_id,
    current_period_start: period.start || sub.current_period_start,
    current_period_end: period.end || sub.current_period_end,
    trial_ends_at: trialEnd || sub.trial_ends_at,
    metadata: { ...(sub.metadata || {}), cancelAtPeriodEnd: !!stripeSub.cancel_at_period_end },
  };
  switch (status) {
    case 'trialing':
      return { ...base, status: 'trialing', grace_until: null, cancelled_at: null };
    case 'active':
      return { ...base, status: 'active', grace_until: null, cancelled_at: null };
    case 'past_due': case 'unpaid':
      return { ...base, status: 'past_due', grace_until: iso(addDays(new Date(), 3)) };
    case 'paused':
      return { ...base, status: 'grace', grace_until: iso(addDays(new Date(), 3)) };
    case 'incomplete_expired':
      return { ...base, status: 'locked', grace_until: null };
    case 'canceled': {
      if (sub.paynow_preferred && (sub.metadata?.switchInitiated || sub.status === 'switch_pending')) {
        return { ...base, status: 'switch_pending', gateway: 'paynow',
          switch_deadline: iso(addDays(new Date(), 3)), stripe_cancelled_at: iso(new Date()),
          current_period_start: sub.metadata?.switchPeriodStart || period.start || sub.current_period_start,
          current_period_end: sub.metadata?.switchPeriodEnd || sub.current_period_end };
      }
      return { ...base, status: 'cancelled', cancelled_at: iso(new Date()), grace_until: null };
    }
    default:
      return { ...base, status: sub.status };
  }
}

async function applySubscriptionEvent(obj: any, eventType: string) {
  const subId = String(obj.id || '') || null;
  const { orgId, sub } = await orgForStripeObject(obj, subId);
  if (!sub) billingError('Subscription record not found for Stripe event.', 404);
  const patch = statusPatch(String(obj.status || ''), sub, obj);
  await upsertSubscription(orgId, patch);
  const updated = await getSubscription(orgId);
  if (!updated) return;
  if (updated.status === 'trialing' && updated.paynow_preferred && updated.trial_ends_at) {
    const until = new Date(updated.trial_ends_at).getTime() - Date.now();
    if (until <= 4 * 24 * 3600 * 1000) await initiateTrialEndSwitch(updated, updated.trial_ends_at);
  }
  if (['past_due','grace'].includes(updated.status) && eventType.endsWith('updated')) {
    await notifyBilling(orgId, 'Subscription payment failed',
      'We could not renew your MYLA subscription. Your data is safe and read-only for three days; add a payment method or pay an invoice to restore full access.',
      'ALERT', '/billing');
  }
}

export async function handleStripeWebhook(raw: string, signature: string) {
  if (!billingActive()) billingError('Billing is disabled.', 503);
  const secret = effectiveWebhookSecret();
  if (!secret) billingError('STRIPE_WEBHOOK_SECRET is not configured.', 503);
  let event: Stripe.Event;
  try {
    event = client().webhooks.constructEvent(raw, signature, secret);
  } catch (e: any) {
    billingError(`Invalid Stripe signature: ${e?.message || e}`, 400);
  }
  const inserted = await recordWebhookEvent('stripe', event.id, event.type, event as any);
  if (!inserted) return { ok: true, duplicate: true, event: event.type };
  const obj: any = event.data.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const orgId = String(obj.client_reference_id || obj.metadata?.orgId || '');
        if (!orgId) billingError('Checkout session is missing its organisation reference.', 400);
        const sub = await getSubscription(orgId);
        if (!sub) billingError('Subscription record not found for checkout.', 404);
        const stripeSubId = subscriptionId(obj.subscription) || sub.stripe_subscription_id;
        let stripeSub: any = {};
        if (!stripeMockEnabled() && stripeSubId) stripeSub = await client().subscriptions.retrieve(stripeSubId);
        const trialEnd = fromUnixSeconds(stripeSub.trial_end) || iso(addDays(new Date(), TRIAL_DAYS));
        await upsertSubscription(orgId, {
          status: 'trialing', gateway: 'stripe',
          stripe_checkout_session_id: String(obj.id || sub.stripe_checkout_session_id || ''),
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: customerId(obj.customer) || customerId(stripeSub.customer) || sub.stripe_customer_id,
          trial_ends_at: trialEnd,
          metadata: { ...(sub.metadata || {}), checkoutCompletedAt: new Date().toISOString() },
        });
        await notifyBilling(orgId, 'Your 14-day trial is active',
          `Your card is saved with Stripe. No charge will be made until ${new Date(trialEnd || Date.now()).toLocaleDateString('en-GB')}.`,
          'SUCCESS', '/billing');
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscriptionEvent(obj, event.type);
        break;
      case 'customer.subscription.trial_will_end': {
        const subId2 = String(obj.id || '') || null;
        const { orgId, sub } = await orgForStripeObject(obj, subId2);
        if (sub?.paynow_preferred && sub.trial_ends_at) {
          await initiateTrialEndSwitch(sub, fromUnixSeconds(obj.trial_end) || sub.trial_ends_at);
        } else {
          await notifyBilling(orgId, 'Your trial ends soon',
            'Your card will be charged for the first monthly period unless you cancel or switch to Paynow in Billing.',
            'WARNING', '/billing');
        }
        break;
      }
      case 'invoice.paid': {
        const amountPaid = Number(obj.amount_paid || 0);
        if (amountPaid <= 0) break; // zero-value trial invoice
        const subId3 = subscriptionId(obj.subscription);
        const { orgId, sub } = await orgForStripeObject({ metadata: obj.metadata }, subId3);
        if (!sub) break;
        const line: any = obj.lines?.data?.[0] || {};
        const periodStart = fromUnixSeconds(line.period?.start) || sub.current_period_start || iso(new Date());
        const periodEnd = fromUnixSeconds(line.period?.end) || iso(addMonths(new Date(periodStart!), 1));
        const { invoice } = await findOrCreateInvoice({
          orgId, planId: sub.plan_id, gateway: 'stripe',
          periodStart: periodStart!, periodEnd: periodEnd!, dueAt: periodStart!,
          reference: `STRIPE-${String(obj.id || shortHash(raw))}`,
          gatewayReference: String(obj.id || ''), metadata: { stripeInvoiceId: obj.id },
        });
        if (invoice.status !== 'paid') {
          await updateInvoice(invoice.id, { status: 'paid', paid_at: iso(new Date()), gateway_reference: String(obj.id || '') });
        }
        await upsertSubscription(orgId, {
          status: 'active', gateway: 'stripe', current_period_start: periodStart,
          current_period_end: periodEnd, grace_until: null,
          last_stripe_charge_period_start: periodStart, last_payment_at: iso(new Date()),
          stripe_customer_id: customerId(obj.customer) || sub.stripe_customer_id,
          stripe_subscription_id: subId3 || sub.stripe_subscription_id,
        });
        const paynowPaid = await import('./billing').then(m => m.getInvoices(orgId, 30));
        if (paynowPaid.some(i => i.gateway !== 'stripe' && i.status === 'paid' && i.period_start.slice(0, 10) === periodStart!.slice(0, 10))) {
          await notifyBilling(orgId, 'Duplicate-payment review required',
            'Stripe and Paynow both recorded a payment for one period. Contact support so one charge can be refunded; no data has been changed.',
            'ALERT', '/billing');
          await recordBillingEvent(orgId, 'double_billing_alert', String(obj.id), 'Stripe and Paynow paid invoices overlap.');
        }
        break;
      }
      case 'invoice.payment_failed': {
        const subId4 = subscriptionId(obj.subscription);
        const { orgId, sub } = await orgForStripeObject({ metadata: obj.metadata }, subId4);
        if (!sub) break;
        const line2: any = obj.lines?.data?.[0] || {};
        const periodStart2 = fromUnixSeconds(line2.period?.start) || sub.current_period_start;
        if (periodStart2) {
          const { invoice } = await findOrCreateInvoice({
            orgId, planId: sub.plan_id, gateway: 'stripe',
            periodStart: periodStart2, periodEnd: iso(addMonths(new Date(periodStart2), 1))!, dueAt: periodStart2,
            reference: `STRIPE-${String(obj.id || shortHash(raw))}`,
            gatewayReference: String(obj.id || ''),
          });
          if (invoice.status !== 'paid') await updateInvoice(invoice.id, { status: 'failed', failed_at: iso(new Date()), failure_reason: 'Stripe payment failed' });
        }
        await upsertSubscription(orgId, { status: 'past_due', grace_until: iso(addDays(new Date(), 3)) });
        await notifyBilling(orgId, 'Subscription payment failed',
          'Your data is safe. The workspace is read-only for three days; update your card in Billing to restore full access.',
          'ALERT', '/billing');
        break;
      }
      default:
        break;
    }
    await markWebhookProcessed('stripe', event.id);
    return { ok: true, event: event.type, live: liveChargesAllowed() };
  } catch (e) {
    // Leave processed_at null so an operator can replay/inspect the event.
    throw e;
  }
}
