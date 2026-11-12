/* Effective-dated plan changes: immediate prorated upgrades and end-of-period
 * downgrades. Every request is audited in billing_plan_changes, and pending
 * invoices are repriced or reissued without deleting billing history. */
import {
  billingError, findOrCreateInvoice, getInvoices, getSubscription, invoiceGateway,
  iso, notifyBilling, recordBillingEvent, updateInvoice, upsertSubscription,
  type BillingInvoice, type BillingSubscription,
} from './billing';
import {
  PLAN_CHANGE_POLICY, PLAN_MAP, PRICE_BOOK_VERSION, isPlanId, planAmountFixed,
  planChangeDirection, planLabel, prorationForUpgrade,
  type PlanId,
} from './billing-plans';
import { supabaseAdmin } from './supabase';

export type PlanChangeActor = {
  userId: string;
  email: string | null;
  name: string;
  orgSlug: string;
};

type PlanChangeRow = {
  id: string;
  organization_id: string;
  from_plan: PlanId;
  to_plan: PlanId;
  direction: 'upgrade' | 'downgrade';
  effective_at: string;
  status: 'pending' | 'payment_pending' | 'applied' | 'cancelled' | 'failed';
  proration_usd: number | string;
  adjustment_invoice_id: string | null;
  metadata: Record<string, any>;
};

const OPEN_STATUSES = ['pending', 'payment_pending'];

async function openPlanChange(orgId: string): Promise<PlanChangeRow | null> {
  const { data, error } = await supabaseAdmin().from('billing_plan_changes')
    .select('*').eq('organization_id', orgId).in('status', OPEN_STATUSES)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PlanChangeRow | null;
}

async function insertPlanChange(row: Record<string, any>): Promise<PlanChangeRow> {
  const { data, error } = await supabaseAdmin().from('billing_plan_changes')
    .insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data as PlanChangeRow;
}

async function updatePlanChange(id: string, patch: Record<string, any>): Promise<PlanChangeRow> {
  const { data, error } = await supabaseAdmin().from('billing_plan_changes')
    .update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return data as PlanChangeRow;
}

function policyMetadata(extra: Record<string, any> = {}) {
  return {
    priceBookVersion: PRICE_BOOK_VERSION,
    planChangePolicy: PLAN_CHANGE_POLICY,
    ...extra,
  };
}

async function repriceInvoice(invoice: BillingInvoice, toPlan: PlanId): Promise<BillingInvoice> {
  const amount = planAmountFixed(toPlan);
  if (invoice.status !== 'pending') return invoice;
  if (invoice.plan_id === toPlan && Number(invoice.amount_usd).toFixed(2) === amount) return invoice;
  const now = new Date();
  const metadata = {
    ...(invoice.metadata || {}),
    planId: toPlan, planName: PLAN_MAP[toPlan].name,
    amountUsd: Number(amount), taxIncluded: false,
    priceBookVersion: PRICE_BOOK_VERSION,
    repricedAt: now.toISOString(), previousPlanId: invoice.plan_id,
    previousAmountUsd: Number(invoice.amount_usd),
  };
  if (!invoice.hosted_url && !invoice.poll_url && !invoice.gateway_reference) {
    return updateInvoice(invoice.id, {
      plan_id: toPlan, amount_usd: amount, metadata,
      raw_status: 'Repriced after plan change',
    });
  }
  await updateInvoice(invoice.id, {
    status: 'cancelled', cancelled_at: iso(now),
    failure_reason: 'Reissued after plan change',
    metadata: { ...(invoice.metadata || {}), reissuedAt: now.toISOString() },
  });
  const { invoice: replacement } = await findOrCreateInvoice({
    orgId: invoice.organization_id, planId: toPlan, gateway: invoice.gateway,
    periodStart: invoice.period_start, periodEnd: invoice.period_end,
    dueAt: invoice.due_at, amountUsd: Number(amount), metadata,
  });
  return replacement;
}

export async function repriceFutureInvoices(
  orgId: string,
  toPlan: PlanId,
  effectiveAt: Date | string = new Date(),
): Promise<number> {
  const cutoff = new Date(effectiveAt).getTime() - 1;
  const invoices = await getInvoices(orgId, 100);
  let changed = 0;
  for (const invoice of invoices) {
    if (invoice.status !== 'pending') continue;
    if (invoice.metadata?.invoiceKind === 'plan_adjustment') continue;
    if (new Date(invoice.period_start).getTime() < cutoff) continue;
    await repriceInvoice(invoice, toPlan);
    changed++;
  }
  return changed;
}

async function cancelPriorDowngrade(orgId: string, actor: PlanChangeActor): Promise<void> {
  const prior = await openPlanChange(orgId);
  if (!prior) return;
  if (prior.status === 'payment_pending') {
    billingError('Pay the outstanding plan adjustment before requesting another change.', 409);
  }
  await updatePlanChange(prior.id, {
    status: 'cancelled',
    metadata: policyMetadata({ ...(prior.metadata || {}), cancelledAt: new Date().toISOString(), cancelledBy: actor.userId }),
  });
  await upsertSubscription(orgId, { pending_plan_id: null, pending_plan_effective_at: null });
  await recordBillingEvent(orgId, 'plan_change_cancelled', prior.id,
    `${planLabel(prior.from_plan)} → ${planLabel(prior.to_plan)} downgrade was superseded.`);
}

export async function requestPlanChange(
  sub: BillingSubscription,
  requestedPlan: unknown,
  actor: PlanChangeActor,
): Promise<{ planChange: PlanChangeRow; invoice: BillingInvoice | null; applied: boolean; message: string }> {
  if (!isPlanId(requestedPlan)) billingError('Choose Starter, Pro or Enterprise.', 400);
  const toPlan: PlanId = requestedPlan;
  if (!['trialing', 'active', 'comped'].includes(sub.status)) {
    billingError('Plan changes are available on an active or trial subscription.', 409);
  }
  const direction = planChangeDirection(sub.plan_id, toPlan);
  if (direction === 'same') billingError('That is already the current plan.', 409);
  await cancelPriorDowngrade(sub.organization_id, actor);

  const now = new Date();
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const base = {
    organization_id: sub.organization_id,
    requested_by: actor.userId || null,
    from_plan: sub.plan_id,
    to_plan: toPlan,
    direction,
    metadata: policyMetadata({ requestedBy: actor.name, requestedEmail: actor.email, orgSlug: actor.orgSlug }),
  };

  if (direction === 'downgrade') {
    const effectiveAt = periodEnd && periodEnd > now ? periodEnd
      : trialEnd && trialEnd > now ? trialEnd
      : now;
    const scheduled = effectiveAt > now;
    const change = await insertPlanChange({
      ...base,
      effective_at: iso(effectiveAt),
      status: scheduled ? 'pending' : 'applied',
      proration_usd: 0,
      applied_at: scheduled ? null : iso(now),
      metadata: policyMetadata({ ...base.metadata, effectiveAt: iso(effectiveAt), scheduled }),
    });
    if (scheduled) {
      await upsertSubscription(sub.organization_id, {
        pending_plan_id: toPlan, pending_plan_effective_at: iso(effectiveAt),
        metadata: { ...(sub.metadata || {}), pendingPlanChangeId: change.id, planChangePolicy: PLAN_CHANGE_POLICY },
      });
    } else {
      await upsertSubscription(sub.organization_id, {
        plan_id: toPlan, pending_plan_id: null, pending_plan_effective_at: null,
        metadata: { ...(sub.metadata || {}), lastAppliedPlanChangeId: change.id, planChangePolicy: PLAN_CHANGE_POLICY },
      });
    }
    await repriceFutureInvoices(sub.organization_id, toPlan, effectiveAt);
    await recordBillingEvent(sub.organization_id, 'plan_change_requested', change.id,
      `${planLabel(sub.plan_id)} → ${planLabel(toPlan)} ${scheduled ? 'scheduled' : 'applied'}; downgrades take effect at period end.`);
    await notifyBilling(sub.organization_id, scheduled ? 'Downgrade scheduled' : 'Plan updated',
      scheduled
        ? `${planLabel(toPlan)} will start on ${effectiveAt.toLocaleDateString('en-GB')}. Your current plan stays active until then.`
        : `${planLabel(toPlan)} is active now. No payment adjustment is due for a downgrade.`,
      'INFO', '/billing');
    return {
      planChange: change, invoice: null, applied: !scheduled,
      message: scheduled ? `${planLabel(toPlan)} scheduled for the end of the current period.` : `${planLabel(toPlan)} is active now.`,
    };
  }

  // Upgrades are immediate. A paid period gets a prorated Paynow/DPO adjustment;
  // a trial simply reprices the prepaid first month.
  const hasPaidPeriod = Boolean(sub.current_period_start && periodEnd && periodEnd > now);
  const proration = hasPaidPeriod
    ? prorationForUpgrade(sub.plan_id, toPlan, sub.current_period_start, sub.current_period_end, now)
    : 0;
  const adjustment = Math.max(0, Number(proration.toFixed(2)));
  const gateway = invoiceGateway(sub);
  let invoice: BillingInvoice | null = null;
  const change = await insertPlanChange({
    ...base,
    effective_at: iso(now),
    status: adjustment > 0 ? 'payment_pending' : 'applied',
    proration_usd: adjustment,
    applied_at: adjustment > 0 ? null : iso(now),
    metadata: policyMetadata({
      ...base.metadata, immediate: true, prorationUsd: adjustment,
      fromPlan: sub.plan_id, toPlan, gateway,
    }),
  });
  if (adjustment > 0 && periodEnd) {
    const { invoice: created } = await findOrCreateInvoice({
      orgId: sub.organization_id, planId: toPlan, gateway,
      periodStart: now, periodEnd, dueAt: now, amountUsd: adjustment,
      metadata: {
        invoiceKind: 'plan_adjustment', prepayAfterTrial: false,
        planChange: {
          id: change.id, fromPlan: sub.plan_id, toPlan,
          prorationUsd: adjustment, gateway,
        },
      },
    });
    invoice = await updateInvoice(created.id, {
      reminder_upcoming_at: iso(now), reminder_due_at: iso(now),
      raw_status: 'Payable now',
    });
    await updatePlanChange(change.id, { adjustment_invoice_id: invoice.id });
  }
  await upsertSubscription(sub.organization_id, {
    plan_id: toPlan, pending_plan_id: null, pending_plan_effective_at: null,
    metadata: {
      ...(sub.metadata || {}),
      lastAppliedPlanChangeId: change.id,
      planChangePolicy: PLAN_CHANGE_POLICY,
      ...(adjustment > 0 ? { outstandingPlanAdjustmentId: change.id } : {}),
    },
  });
  await repriceFutureInvoices(sub.organization_id, toPlan, hasPaidPeriod && periodEnd ? periodEnd : now);
  await recordBillingEvent(sub.organization_id, 'plan_change_requested', change.id,
    `${planLabel(sub.plan_id)} → ${planLabel(toPlan)} upgrade applied${adjustment > 0 ? `; USD ${adjustment.toFixed(2)} prorated adjustment payable` : ''}.`);
  await notifyBilling(sub.organization_id, 'Plan upgraded',
    `${planLabel(toPlan)} is active now.${adjustment > 0 ? ` A prorated adjustment of USD ${adjustment.toFixed(2)} is payable in Billing.` : ' Your next invoice has been updated.'}`,
    'SUCCESS', '/billing');
  return {
    planChange: change, invoice, applied: true,
    message: adjustment > 0
      ? `${planLabel(toPlan)} is active. Pay the USD ${adjustment.toFixed(2)} prorated adjustment.`
      : `${planLabel(toPlan)} is active now.`,
  };
}

export async function cancelOpenPlanChange(
  orgId: string,
  actor: PlanChangeActor,
): Promise<{ message: string }> {
  const change = await openPlanChange(orgId);
  if (!change) billingError('No scheduled plan change to cancel.', 404);
  await updatePlanChange(change.id, {
    status: 'cancelled',
    metadata: policyMetadata({ ...(change.metadata || {}), cancelledAt: new Date().toISOString(), cancelledBy: actor.userId }),
  });
  if (change.adjustment_invoice_id) {
    const { data: inv } = await supabaseAdmin().from('billing_invoices')
      .select('*').eq('id', change.adjustment_invoice_id).maybeSingle();
    if (inv && inv.status === 'pending') {
      await updateInvoice(inv.id, {
        status: 'cancelled', cancelled_at: iso(new Date()),
        failure_reason: 'Plan adjustment cancelled',
      });
    }
  }
  const sub = await getSubscription(orgId);
  if (sub) {
    const patch: Partial<BillingSubscription> = { pending_plan_id: null, pending_plan_effective_at: null };
    if (change.status === 'payment_pending' && sub.plan_id === change.to_plan) {
      patch.plan_id = change.from_plan;
      patch.metadata = { ...(sub.metadata || {}), outstandingPlanAdjustmentId: null };
    }
    await upsertSubscription(orgId, patch);
    await repriceFutureInvoices(orgId, patch.plan_id || sub.plan_id, new Date(0));
  }
  await recordBillingEvent(orgId, 'plan_change_cancelled', change.id,
    `${planLabel(change.from_plan)} → ${planLabel(change.to_plan)} change was cancelled.`);
  await notifyBilling(orgId, 'Plan change cancelled',
    'Your current plan is unchanged. No billing adjustment is due for the cancelled request.',
    'INFO', '/billing');
  return { message: 'Plan change cancelled. Your current plan is unchanged.' };
}

/** Apply scheduled downgrades at their effective date. Returns the count applied. */
export async function applyDuePlanChanges(orgId: string, now: Date = new Date()): Promise<number> {
  const { data, error } = await supabaseAdmin().from('billing_plan_changes')
    .select('*').eq('organization_id', orgId).eq('status', 'pending')
    .lte('effective_at', now.toISOString());
  if (error) throw new Error(error.message);
  let applied = 0;
  for (const row of (data || []) as PlanChangeRow[]) {
    const sub = await getSubscription(orgId);
    if (!sub) continue;
    await upsertSubscription(orgId, {
      plan_id: row.to_plan, pending_plan_id: null, pending_plan_effective_at: null,
      metadata: { ...(sub.metadata || {}), lastAppliedPlanChangeId: row.id, planChangePolicy: PLAN_CHANGE_POLICY },
    });
    await updatePlanChange(row.id, {
      status: 'applied', applied_at: iso(now),
      metadata: policyMetadata({ ...(row.metadata || {}), appliedByCron: true }),
    });
    await repriceFutureInvoices(orgId, row.to_plan, now);
    await recordBillingEvent(orgId, 'plan_change_applied', row.id,
      `${planLabel(row.from_plan)} → ${planLabel(row.to_plan)} downgrade took effect at period end.`);
    await notifyBilling(orgId, 'Plan changed',
      `${planLabel(row.to_plan)} is active from today. Your next invoice uses the new price.`,
      'INFO', '/billing');
    applied++;
  }
  return applied;
}
