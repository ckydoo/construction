/* Daily billing sweep. Idempotent: every transition is guarded by a state field
 * or a dedupe key, so replaying the cron never creates a second invoice or a
 * second charge. No data is ever deleted. */
import { supabaseAdmin } from './supabase';
import {
  addDays, billingActive, getInvoices, getSubscription, iso, notifyBilling,
  recordBillingEvent, updateInvoice, upsertSubscription,
  type BillingInvoice,
} from './billing';
import { initiateTrialEndSwitch } from './stripe-billing';
import { createRenewalInvoice } from './paynow-billing';

type SweepCounts = {
  scanned: number; switchInitiated: number; renewalInvoices: number;
  reminders: number; graceStarted: number; locked: number; errors: number;
};

async function pendingInvoices(orgId: string): Promise<BillingInvoice[]> {
  const invoices = await getInvoices(orgId, 100);
  return invoices.filter(i => i.status === 'pending' && (i.gateway === 'paynow' || i.gateway === 'mock'));
}

export async function runBillingSweep(now = new Date()): Promise<SweepCounts> {
  const counts: SweepCounts = { scanned: 0, switchInitiated: 0, renewalInvoices: 0, reminders: 0, graceStarted: 0, locked: 0, errors: 0 };
  if (!billingActive()) return counts;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('billing_subscriptions')
    .select('*').in('status', ['trialing','active','past_due','grace','switch_pending','cancelled']);
  if (error) throw new Error(error.message);

  for (const raw of data || []) {
    counts.scanned++;
    try {
      const sub = await getSubscription(String(raw.organization_id));
      if (!sub) continue;
      const orgId = sub.organization_id;
      const cancelled = !!sub.cancelled_at;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
      const graceUntil = sub.grace_until ? new Date(sub.grace_until) : null;
      const switchDeadline = sub.switch_deadline ? new Date(sub.switch_deadline) : null;

      // 1. Trial-end gateway switch fallback (if trial_will_end webhook was missed).
      if (sub.status === 'trialing' && sub.paynow_preferred && sub.trial_ends_at) {
        const until = new Date(sub.trial_ends_at).getTime() - now.getTime();
        if (until <= 3 * 86400 * 1000) {
          await initiateTrialEndSwitch(sub, sub.trial_ends_at);
          counts.switchInitiated++;
        }
      }

      // 2. Stripe trial ended without a paid invoice: start the 3-day grace.
      if (sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) <= addDays(now, -1)
          && !sub.last_payment_at && !sub.paynow_preferred) {
        await upsertSubscription(orgId, { status: 'past_due', grace_until: iso(addDays(now, 3)) });
        await notifyBilling(orgId, 'Trial ended without payment',
          'Your workspace is read-only for three days. Add a payment method in Billing to restore full access. No data has been deleted.',
          'ALERT', '/billing');
        counts.graceStarted++;
        continue;
      }

      // 3. Paynow monthly renewal: create ONE customer-present invoice per period.
      if (sub.status === 'active' && sub.gateway === 'paynow' && !cancelled && periodEnd
          && periodEnd <= addDays(now, 7)) {
        const { created, invoice } = await createRenewalInvoice(sub, periodEnd);
        if (created) {
          counts.renewalInvoices++;
          await recordBillingEvent(orgId, 'renewal_invoice_created', invoice.reference,
            `Paynow invoice created for ${invoice.period_start.slice(0, 10)}. No autodebit.`);
        }
      }

      // 4. Reminders and hard lock for unpaid Paynow invoices.
      const invoices = await pendingInvoices(orgId);
      for (const invoice of invoices) {
        const due = new Date(invoice.due_at);
        if (due <= addDays(now, 7) && !invoice.reminder_upcoming_at) {
          await updateInvoice(invoice.id, { reminder_upcoming_at: iso(now) });
          await notifyBilling(orgId, 'Subscription invoice due soon',
            `Your USD ${Number(invoice.amount_usd).toFixed(2)} MYLA invoice is due ${due.toLocaleDateString('en-GB')}. Paynow is customer-present; no autodebit will be taken.`,
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
        }
        if (addDays(due, 3) <= now && !invoice.reminder_grace_at) {
          await updateInvoice(invoice.id, {
            reminder_grace_at: iso(now), status: 'failed', failed_at: iso(now),
            failure_reason: 'Unpaid after 3-day grace',
          });
          await upsertSubscription(orgId, { status: 'locked', grace_until: null });
          await notifyBilling(orgId, 'Workspace locked',
            'The three-day grace period ended without payment. Nothing was deleted; pay the outstanding invoice to unlock immediately.',
            'ALERT', '/billing');
          counts.locked++;
        }
      }

      // 5. Stripe failed-renewal grace expiry.
      if (['past_due','grace'].includes(sub.status) && graceUntil && graceUntil <= now) {
        await upsertSubscription(orgId, { status: 'locked', grace_until: null });
        await notifyBilling(orgId, 'Workspace locked',
          'The three-day payment grace period ended. Nothing was deleted; update your card or pay an invoice to unlock.',
          'ALERT', '/billing');
        counts.locked++;
        continue;
      }

      // 6. Trial-to-Paynow switch deadline.
      if (sub.status === 'switch_pending' && switchDeadline && switchDeadline <= now) {
        await upsertSubscription(orgId, { status: 'locked', switch_deadline: null });
        await notifyBilling(orgId, 'Workspace locked',
          'The Paynow switch window ended without payment. Nothing was deleted; pay the open invoice to unlock.',
          'ALERT', '/billing');
        counts.locked++;
        continue;
      }

      // 7. Cancellation takes effect at the end of the paid period.
      if (cancelled && sub.status === 'active' && periodEnd && periodEnd <= now) {
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
