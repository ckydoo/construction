/* Daily billing sweep. Idempotent: every transition is guarded by a state field
 * or a dedupe key, so replaying the cron never creates a second invoice or a
 * second charge. No data is ever deleted. Stripe is not used. */
import { supabaseAdmin } from './supabase';
import {
  addDays, billingActive, billingConfig, getInvoices, getSubscription, iso,
  notifyBilling, recordBillingEvent, updateInvoice, upsertSubscription,
  type BillingInvoice,
} from './billing';
import { createSubscriptionInvoice } from './billing-lifecycle';
import { applyDuePlanChanges } from './billing-plan-change';
import { attemptDpoRenewal, revokeDpoCard } from './dpo-billing';

type SweepCounts = {
  scanned: number; firstInvoices: number; renewalInvoices: number;
  recurringCharges: number; reminders: number; graceStarted: number;
  locked: number; planChangesApplied: number; errors: number;
};

function pendingInvoices(all: BillingInvoice[]): BillingInvoice[] {
  return all.filter(i => i.status === 'pending' && ['dpo','mock','paynow'].includes(i.gateway));
}

export async function runBillingSweep(now = new Date()): Promise<SweepCounts> {
  const counts: SweepCounts = {
    scanned: 0, firstInvoices: 0, renewalInvoices: 0, recurringCharges: 0,
    reminders: 0, graceStarted: 0, locked: 0, planChangesApplied: 0, errors: 0,
  };
  if (!billingActive()) return counts;
  const cfg = billingConfig();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('billing_subscriptions')
    .select('*').in('status', ['trialing','active','past_due','grace','switch_pending','cancelled','locked']);
  if (error) throw new Error(error.message);

  for (const raw of data || []) {
    counts.scanned++;
    try {
      const orgId = String(raw.organization_id);
      counts.planChangesApplied += await applyDuePlanChanges(orgId, now);
      let sub = await getSubscription(orgId);
      if (!sub) continue;
      const cancelled = !!sub.cancelled_at;
      const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
      let periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;

      // 1. Upcoming no-card trial reminder (once).
      if (sub.status === 'trialing' && trialEnd && trialEnd > now && trialEnd <= addDays(now, 7)
          && !sub.metadata?.trialReminderAt) {
        await upsertSubscription(orgId, {
          metadata: { ...(sub.metadata || {}), trialReminderAt: new Date().toISOString() },
        });
        await notifyBilling(orgId, 'Your no-card trial ends soon',
          `Your 7-day trial ends ${trialEnd.toLocaleDateString('en-GB')}. Your invoice is already available in Billing if you want to pay early; no card has been charged.`,
          'WARNING', '/billing');
        counts.reminders++;
        sub = await getSubscription(orgId) || sub;
      }

      // 2. Trial expiry: use the prepay invoice created at trial start. If it
      // was paid early, activate the prepaid month without a second invoice.
      if (sub.status === 'trialing' && trialEnd && trialEnd <= now) {
        const allInvoices = await getInvoices(orgId, 100);
        const prepaid = allInvoices.find(i => i.status === 'paid' && i.metadata?.prepayAfterTrial === true);
        const existingPrepay = allInvoices.find(i => i.status === 'pending' && i.metadata?.prepayAfterTrial === true);
        if (prepaid) {
          await upsertSubscription(orgId, {
            status: 'active',
            current_period_start: prepaid.period_start,
            current_period_end: prepaid.period_end,
            grace_until: null, switch_deadline: null,
            metadata: { ...(sub.metadata || {}), trialEndedAt: trialEnd.toISOString(), prepaidActivatedAt: now.toISOString() },
          });
          await recordBillingEvent(orgId, 'prepaid_period_started', prepaid.reference,
            'The full 7-day trial completed; the prepaid month started without a duplicate invoice.');
        } else {
          let invoice: BillingInvoice;
          if (existingPrepay) {
            invoice = await updateInvoice(existingPrepay.id, {
              due_at: now.toISOString(), reminder_upcoming_at: iso(now), reminder_due_at: iso(now),
              raw_status: 'Due',
            });
          } else {
            const fallback = await createSubscriptionInvoice(sub, trialEnd, {
              renewal: false, email: sub.dpo_customer_email,
              metadata: { prepayAfterTrial: true, trialEndsAt: iso(trialEnd), invoiceKind: 'subscription_prepay' },
            });
            invoice = fallback.invoice;
            if (fallback.created) counts.firstInvoices++;
          }
          await notifyBilling(orgId, 'Your first subscription invoice is ready',
            `Pay USD ${Number(invoice.amount_usd).toFixed(2)} by Paynow${invoice.metadata?.dpo ? ' or the selected DPO Pay fallback' : ''}. Your workspace is read-only for three days; nothing is deleted.`,
            'WARNING', '/billing');
          await recordBillingEvent(orgId, 'first_invoice_created', invoice.reference,
            'No-card trial ended; the prepay invoice is now due.');
          await upsertSubscription(orgId, {
            status: 'grace',
            current_period_start: invoice.period_start,
            current_period_end: invoice.period_end,
            grace_until: iso(addDays(trialEnd, 3)),
            switch_deadline: null,
            metadata: { ...(sub.metadata || {}), trialEndedAt: trialEnd.toISOString(), firstInvoiceId: invoice.id },
          });
          counts.graceStarted++;
          periodEnd = invoice.period_end ? new Date(invoice.period_end) : periodEnd;
        }
        sub = await getSubscription(orgId) || sub;
      }

      // 3. Next monthly renewal invoice, created at most seven days before period end.
      if (sub.status === 'active' && !cancelled && periodEnd && periodEnd <= addDays(now, 7)) {
        const { invoice, created } = await createSubscriptionInvoice(sub, periodEnd, {
          renewal: true, email: sub.dpo_customer_email,
        });
        if (created) {
          counts.renewalInvoices++;
          await recordBillingEvent(orgId, 'renewal_invoice_created', invoice.reference,
            `${invoice.metadata?.autodebit ? 'Tokenised DPO fallback' : invoice.metadata?.dpo ? 'DPO fallback' : 'Paynow customer-present'} invoice created for ${invoice.period_start.slice(0, 10)}.`);
        }
      }

      const invoices = await getInvoices(orgId, 100);
      for (const invoice of pendingInvoices(invoices)) {
        const due = new Date(invoice.due_at);
        if (invoice.metadata?.prepayAfterTrial && sub.status === 'trialing'
            && trialEnd && trialEnd > now) continue;
        const dpoInvoice = Boolean(invoice.metadata?.dpo) && ['dpo','mock'].includes(invoice.gateway);

        // 4. Tokenised DPO renewal: charge once, then poll verifyToken on replay.
        if (due <= now && sub.status === 'active' && dpoInvoice
            && cfg.dpoRecurringEnabled && sub.dpo_subscription_token) {
          const attempt = await attemptDpoRenewal(sub, invoice, now);
          if (attempt.ok && attempt.paid) {
            counts.recurringCharges++;
            sub = await getSubscription(orgId) || sub;
            continue;
          }
          if (attempt.failed) {
            counts.graceStarted++;
            sub = await getSubscription(orgId) || sub;
            continue;
          }
          if (attempt.pending) {
            await upsertSubscription(orgId, {
              status: 'past_due', grace_until: iso(addDays(due, 3)),
              metadata: { ...(sub.metadata || {}), dpoChargePendingInvoiceId: invoice.id, dpoChargePendingReason: attempt.reason },
            });
            await recordBillingEvent(orgId, 'dpo_charge_pending', invoice.reference, attempt.reason || 'verification pending');
            counts.graceStarted++;
            sub = await getSubscription(orgId) || sub;
            continue;
          }
        }

        if (due <= addDays(now, 7) && !invoice.reminder_upcoming_at) {
          await updateInvoice(invoice.id, { reminder_upcoming_at: iso(now) });
          await notifyBilling(orgId, 'Subscription invoice due soon',
            `Your USD ${Number(invoice.amount_usd).toFixed(2)} MYLA invoice is due ${due.toLocaleDateString('en-GB')}. ${dpoInvoice ? 'DPO Pay fallback checkout is available in Billing.' : 'Paynow is the primary customer-present rail; no silent autodebit is taken.'}`,
            'WARNING', '/billing');
          counts.reminders++;
        }
        if (due <= now && !invoice.reminder_due_at) {
          await updateInvoice(invoice.id, { reminder_due_at: iso(now), raw_status: 'Overdue' });
          await upsertSubscription(orgId, { status: 'past_due', grace_until: iso(addDays(due, 3)) });
          await notifyBilling(orgId, 'Subscription payment overdue',
            'Your workspace is read-only for three days. Pay the open invoice to restore full access. Your data is safe.',
            'ALERT', '/billing');
          counts.graceStarted++;
          sub = await getSubscription(orgId) || sub;
        }
        if (addDays(due, 3) <= now && !invoice.reminder_grace_at && invoice.status === 'pending') {
          await updateInvoice(invoice.id, {
            reminder_grace_at: iso(now), status: 'failed', failed_at: iso(now),
            failure_reason: 'Unpaid after 3-day grace',
          });
          await upsertSubscription(orgId, { status: 'locked', grace_until: null });
          await notifyBilling(orgId, 'Workspace locked',
            'The three-day grace period ended without payment. Nothing was deleted; pay the outstanding invoice to unlock immediately.',
            'ALERT', '/billing');
          counts.locked++;
          sub = await getSubscription(orgId) || sub;
        }
      }

      // 5. Grace expiry / legacy switch deadline.
      sub = await getSubscription(orgId) || sub;
      const graceUntil = sub.grace_until ? new Date(sub.grace_until) : null;
      if (['past_due','grace'].includes(sub.status) && graceUntil && graceUntil <= now) {
        await upsertSubscription(orgId, { status: 'locked', grace_until: null });
        await notifyBilling(orgId, 'Workspace locked',
          'The three-day payment grace period ended. Nothing was deleted; pay the open invoice to unlock.',
          'ALERT', '/billing');
        counts.locked++;
        continue;
      }
      if (sub.status === 'switch_pending' && sub.switch_deadline && new Date(sub.switch_deadline) <= now) {
        await upsertSubscription(orgId, { status: 'locked', switch_deadline: null });
        await notifyBilling(orgId, 'Workspace locked',
          'The gateway switch window ended without payment. Nothing was deleted; pay the open invoice to unlock.',
          'ALERT', '/billing');
        counts.locked++;
        continue;
      }

      // 6. Cancellation takes effect at the end of the paid period.
      periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
      if (cancelled && sub.status === 'active' && periodEnd && periodEnd <= now) {
        await revokeDpoCard(sub);
        await upsertSubscription(orgId, { status: 'cancelled' });
        await notifyBilling(orgId, 'Subscription ended',
          'Your subscription ended at the close of the paid period. All workspace data remains intact.',
          'INFO', '/billing');
      }
    } catch (e) {
      counts.errors++;
      console.error('[billing-sweep]', e);
    }
  }
  return counts;
}
