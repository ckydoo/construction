/* Shared billing state transitions for Paynow primary and DPO Pay fallback.
 * No external payment call is made here; gateways call these helpers only after
 * amount/currency/reference verification. No business data is ever deleted. */
import {
  addDays, addMonths, billingConfig, billingError, dpoProvider, findOrCreateInvoice,
  gatewayPreference, getInvoices, getSubscription, invoiceGateway, iso, notifyBilling,
  primaryGateway, recordBillingEvent, updateInvoice, upsertSubscription,
  type BillingInvoice, type BillingProvider, type BillingSubscription,
} from './billing';
import { PLAN_MAP, PRICE_BOOK_VERSION, TRIAL_DAYS, planLabel, type PlanId } from './billing-plans';
import { supabaseAdmin } from './supabase';

export type WalletTokens = { subscriptionToken: string; customerToken: string };

export async function startNoCardTrial(
  sub: BillingSubscription,
  planId: PlanId,
  email?: string | null,
): Promise<BillingSubscription> {
  if (sub.status !== 'trial_required') billingError('A trial has already been started for this organisation.', 409);
  const now = new Date();
  const preference = gatewayPreference(sub);
  const trialEnd = addDays(now, TRIAL_DAYS);
  const firstPeriodEnd = addMonths(trialEnd, 1);
  const next = await upsertSubscription(sub.organization_id, {
    plan_id: planId,
    status: 'trialing',
    gateway: preference === 'dpo' ? dpoProvider() : primaryGateway(),
    paynow_preferred: preference === 'paynow',
    trial_ends_at: iso(trialEnd),
    current_period_start: null,
    current_period_end: null,
    grace_until: null,
    switch_deadline: null,
    cancelled_at: null,
    dpo_customer_email: email || sub.dpo_customer_email,
    metadata: {
      ...(sub.metadata || {}),
      gatewayPreference: preference,
      trialType: 'no_card_7', trialDays: TRIAL_DAYS,
      cardRequired: false, trialRequiresCard: false,
      trialStartedAt: now.toISOString(), planAtTrialStart: planId,
      prepayAfterTrial: true, priceBookVersion: PRICE_BOOK_VERSION,
      priceUsd: PLAN_MAP[planId].priceUsd,
    },
  });
  // The invoice exists while the trial is active so the user may pay early.
  // Its paid month begins at trialEnd; paying it never shortens the 7-day trial.
  await findOrCreateInvoice({
    orgId: sub.organization_id, planId, gateway: invoiceGateway(next),
    periodStart: trialEnd, periodEnd: firstPeriodEnd, dueAt: trialEnd,
    metadata: {
      invoiceKind: 'subscription_prepay', prepayAfterTrial: true,
      trialEndsAt: iso(trialEnd), gatewayPreference: preference,
      taxIncluded: false,
    },
  });
  await notifyBilling(sub.organization_id, 'Your 7-day trial is active',
    `Your ${planLabel(planId)} workspace is fully usable until ${new Date(next.trial_ends_at || now).toLocaleDateString('en-GB')}. No card was collected. You can pay now or continue the trial; a paid month starts when the trial ends.`,
    'SUCCESS', '/billing');
  await recordBillingEvent(sub.organization_id, 'no_card_trial_started', next.trial_ends_at,
    `7-day no-card trial started on ${planLabel(planId)}; USD ${PLAN_MAP[planId].priceUsd.toFixed(2)}/month prepay invoice is available immediately.`);
  return next;
}

type InvoiceOptions = {
  renewal?: boolean;
  email?: string | null;
  metadata?: Record<string, any>;
  dpo?: Record<string, any>;
};

/** Create the first post-trial invoice or one monthly renewal invoice. */
export async function createSubscriptionInvoice(
  sub: BillingSubscription,
  periodStart: Date | string,
  opts: InvoiceOptions = {},
): Promise<{ invoice: BillingInvoice; created: boolean }> {
  const cfg = billingConfig();
  const gateway = invoiceGateway(sub);
  const preference = gatewayPreference(sub);
  const dpoLike = gateway === 'dpo' || gateway === 'mock';
  const email = opts.email || sub.dpo_customer_email || null;
  if (email && !sub.dpo_customer_email) {
    await upsertSubscription(sub.organization_id, { dpo_customer_email: email });
  }
  const autodebit = Boolean(dpoLike && cfg.dpoRecurringEnabled && sub.dpo_subscription_token);
  const prepayAfterTrial = Boolean(sub.status === 'trialing' && opts.metadata?.prepayAfterTrial);
  const metadata: Record<string, any> = {
    renewal: Boolean(opts.renewal),
    prepayAfterTrial,
    invoiceKind: prepayAfterTrial ? 'subscription_prepay'
      : sub.status === 'trialing' ? 'subscription_initial' : 'subscription_renewal',
    gatewayPreference: dpoLike ? 'dpo' : 'paynow',
    invoiceRail: dpoLike ? 'dpo' : 'paynow',
    selectedRail: preference,
    autodebit,
    ...(opts.metadata || {}),
  };
  if (dpoLike) {
    metadata.dpo = {
      allowRecurrent: cfg.dpoRecurringEnabled,
      autodebit,
      email,
      mock: cfg.mode === 'qa',
      mockPaid: false,
      mockChargeResult: '000',
      ...(opts.dpo || {}),
    };
  }
  return findOrCreateInvoice({
    orgId: sub.organization_id,
    planId: sub.plan_id,
    gateway,
    periodStart,
    periodEnd: addMonths(periodStart, 1),
    dueAt: periodStart,
    metadata,
  });
}

/** Mark a verified invoice paid and restore full workspace access. */
export async function activatePaidInvoice(
  invoice: BillingInvoice,
  opts: {
    gateway: BillingProvider;
    gatewayReference?: string | null;
    transactionToken?: string | null;
    wallet?: WalletTokens | null;
    email?: string | null;
    rawStatus?: string | null;
    approval?: string | null;
  },
): Promise<BillingSubscription | null> {
  const sub = await getSubscription(invoice.organization_id);
  if (!sub) billingError('Subscription record not found.', 404);
  if (invoice.status === 'paid') return sub;

  const all = await getInvoices(invoice.organization_id, 100);
  const duplicate = all.find(i => i.id !== invoice.id && i.status === 'paid'
    && i.period_start.slice(0, 10) === invoice.period_start.slice(0, 10)
    && i.metadata?.invoiceKind !== 'plan_adjustment'
    && invoice.metadata?.invoiceKind !== 'plan_adjustment');
  if (duplicate) {
    await notifyBilling(invoice.organization_id, 'Duplicate-payment review required',
      'Two gateways recorded a payment for one period. Contact support so one charge can be refunded; access remains active.',
      'ALERT', '/billing');
    await recordBillingEvent(invoice.organization_id, 'double_billing_alert', invoice.reference,
      'Two paid invoices overlap for one subscription period.');
  }

  const dpoMeta = { ...(invoice.metadata?.dpo || {}) };
  if (opts.transactionToken) dpoMeta.transactionToken = opts.transactionToken;
  if (opts.approval) dpoMeta.lastApproval = opts.approval;
  const dpoLike = Boolean(invoice.metadata?.dpo) || Boolean(opts.wallet) || opts.gateway === 'dpo';
  const metadata: Record<string, any> = {
    ...(invoice.metadata || {}),
    ...(Object.keys(dpoMeta).length ? { dpo: dpoMeta } : {}),
    lastPaidGateway: opts.gateway,
    lastPaidInvoiceId: invoice.id,
    lastPaidReference: invoice.reference,
  };
  if (opts.wallet) metadata.dpoTokenised = true;

  await updateInvoice(invoice.id, {
    status: 'paid', paid_at: iso(new Date()),
    raw_status: opts.rawStatus || 'Paid',
    gateway_reference: opts.gatewayReference || invoice.gateway_reference,
    metadata,
  });

  // A prorated adjustment is not a subscription period. Keep the existing
  // period and access, settle the audited change, and avoid double billing.
  if (invoice.metadata?.invoiceKind === 'plan_adjustment') {
    const changeId = invoice.metadata?.planChange?.id || null;
    if (changeId) {
      const { data: change } = await supabaseAdmin().from('billing_plan_changes')
        .update({ status: 'applied', applied_at: iso(new Date()) })
        .eq('id', changeId).select('*').maybeSingle();
      if (change) {
        await recordBillingEvent(invoice.organization_id, 'plan_change_applied', changeId,
          `Paid USD ${Number(invoice.amount_usd).toFixed(2)} prorated adjustment for ${PLAN_MAP[change.to_plan as PlanId].name}.`);
      }
    }
    const settled = await upsertSubscription(invoice.organization_id, {
      last_payment_at: iso(new Date()),
      metadata: { ...(sub.metadata || {}), outstandingPlanAdjustmentId: null, lastPaidInvoiceId: invoice.id },
    });
    await notifyBilling(invoice.organization_id, 'Payment received',
      'Your prorated plan adjustment is paid and the upgrade is confirmed. No data was changed.',
      'SUCCESS', '/billing');
    await recordBillingEvent(invoice.organization_id, 'payment_received', invoice.reference,
      `Paid USD ${Number(invoice.amount_usd).toFixed(2)} plan adjustment through ${opts.gateway}.`);
    return settled;
  }

  // Early trial payment: keep the full 7-day trial and schedule the paid month
  // to begin at trialEnd, instead of activating the subscription immediately.
  const prepayAfterTrial = Boolean(invoice.metadata?.prepayAfterTrial && sub.status === 'trialing');
  const patch: Partial<BillingSubscription> = {
    status: prepayAfterTrial ? 'trialing' : 'active',
    // The subscription plan is authoritative after an immediate upgrade; the
    // invoice may retain its historical plan for accounting. Never revert it.
    gateway: invoice.gateway, plan_id: sub.plan_id,
    current_period_start: invoice.period_start, current_period_end: invoice.period_end,
    grace_until: null, switch_deadline: null, cancelled_at: null,
    last_payment_at: iso(new Date()),
    metadata: {
      ...(sub.metadata || {}),
      lastPaidGateway: opts.gateway, lastPaidInvoiceId: invoice.id,
      lastPaidReference: invoice.reference,
      ...(prepayAfterTrial ? { prepaidThrough: invoice.period_end, prepayPaidAt: iso(new Date()) } : {}),
      ...(opts.wallet ? { dpoTokenised: true } : {}),
    },
  };
  if (dpoLike) {
    patch.dpo_last_reference = invoice.reference;
    patch.dpo_last_transaction_token = opts.transactionToken || null;
    patch.dpo_customer_email = opts.email || invoice.metadata?.dpo?.email || sub.dpo_customer_email;
    if (opts.wallet) {
      patch.dpo_subscription_token = opts.wallet.subscriptionToken;
      patch.dpo_customer_token = opts.wallet.customerToken;
      patch.dpo_tokenised_at = iso(new Date());
    }
  } else {
    patch.paynow_last_reference = invoice.reference;
  }
  const next = await upsertSubscription(invoice.organization_id, patch);

  await notifyBilling(invoice.organization_id, 'Payment received',
    prepayAfterTrial
      ? `Your full ${TRIAL_DAYS}-day trial remains active. Your paid ${PLAN_MAP[invoice.plan_id].name} month starts ${new Date(invoice.period_start).toLocaleDateString('en-GB')}. No data was changed.`
      : `Your MYLA ${PLAN_MAP[invoice.plan_id].name} subscription is active until ${new Date(invoice.period_end).toLocaleDateString('en-GB')}. No data was changed.`,
    'SUCCESS', '/billing');
  await recordBillingEvent(invoice.organization_id, 'payment_received', invoice.reference,
    `Paid USD ${Number(invoice.amount_usd).toFixed(2)} through ${opts.gateway}${prepayAfterTrial ? `; prepaid period starts ${invoice.period_start}.` : '.'}`);
  return next;
}

/** A decline/expiry starts the 3-day read-only grace, never a deletion. */
export async function markInvoiceFailed(invoice: BillingInvoice, reason: string, rawStatus?: string | null): Promise<void> {
  if (invoice.status === 'paid') return;
  const now = new Date();
  await updateInvoice(invoice.id, {
    status: 'failed', failed_at: iso(now), raw_status: rawStatus || 'Failed',
    failure_reason: reason,
  });
  const sub = await getSubscription(invoice.organization_id);
  if (!sub) return;
  await upsertSubscription(invoice.organization_id, {
    status: 'past_due', grace_until: iso(addDays(now, 3)),
    metadata: { ...(sub.metadata || {}), lastPaymentFailure: reason, lastFailedInvoiceId: invoice.id },
  });
  await notifyBilling(invoice.organization_id, 'Payment not completed',
    'Your workspace is read-only for three days while you retry the invoice. No data is deleted.',
    'WARNING', '/billing');
  await recordBillingEvent(invoice.organization_id, 'payment_failed', invoice.reference, reason);
}

export async function cancelSubscription(sub: BillingSubscription): Promise<BillingSubscription> {
  const now = new Date();
  const next = await upsertSubscription(sub.organization_id, {
    cancelled_at: iso(now),
    ...(sub.status === 'trial_required' ? { status: 'cancelled' as const } : {}),
    metadata: { ...(sub.metadata || {}), cancelAtPeriodEnd: true, cancellationRequestedAt: now.toISOString() },
  });
  await notifyBilling(sub.organization_id, 'Cancellation scheduled',
    'Your subscription will end at the close of the current paid period. All workspace data stays intact.', 'INFO', '/billing');
  await recordBillingEvent(sub.organization_id, 'cancellation_requested', iso(now),
    'Owner/Admin requested cancellation at period end.');
  return next;
}

/** Locally forget DPO tokens after cancellation or card revocation. */
export async function clearDpoTokens(orgId: string): Promise<void> {
  const sub = await getSubscription(orgId);
  if (!sub) return;
  await upsertSubscription(orgId, {
    dpo_subscription_token: null,
    dpo_customer_token: null,
    dpo_last_transaction_token: null,
    dpo_tokenised_at: null,
    metadata: { ...(sub.metadata || {}), dpoCardRevokedAt: new Date().toISOString(), dpoTokenised: false },
  });
}
