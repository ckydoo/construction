import { NextResponse } from 'next/server';
import { billingAdmin, billingConfigPublic, billingFailure, billingMutationError } from '@/lib/billing-api';
import { getInvoices, getSubscription, iso, notifyBilling, publicBilling, recordBillingEvent, upsertSubscription } from '@/lib/billing';
import { initiateTrialEndSwitch, scheduleStripeCancellation } from '@/lib/stripe-billing';
import { isPlanId } from '@/lib/billing-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ org: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org } = await params;
  const { a, error } = await billingAdmin(org); if (error) return error;
  try {
    const [billing, subscription, invoices] = await Promise.all([
      publicBilling(a.orgId, a.role), getSubscription(a.orgId), getInvoices(a.orgId, 36),
    ]);
    return NextResponse.json({ billing, subscription, invoices, config: billingConfigPublic() },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return billingFailure(e); }
}

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const { a, error } = await billingAdmin(org); if (error) return error;
  const blocked = billingMutationError(); if (blocked) return blocked;
  try {
    const b = await req.json();
    const action = String(b.action || '');
    const sub = await getSubscription(a.orgId);
    if (!sub) return NextResponse.json({ error: 'Billing subscription not found.' }, { status: 404 });

    if (action === 'selectPlan') {
      if (!isPlanId(b.planId)) return NextResponse.json({ error: 'Choose Starter, Pro or Enterprise.' }, { status: 400 });
      if (sub.status !== 'trial_required') return NextResponse.json({ error: 'Choose a plan before starting the trial; use the Stripe portal for later changes.' }, { status: 409 });
      const next = await upsertSubscription(a.orgId, { plan_id: b.planId });
      return NextResponse.json({ ok: true, subscription: next });
    }
    if (action === 'setPaynowPreference') {
      const usePaynow = b.usePaynow === true;
      if (!['trial_required','trialing','switch_pending'].includes(sub.status))
        return NextResponse.json({ error: 'Paynow can be selected before the first Stripe charge.' }, { status: 409 });
      if (!usePaynow && sub.status === 'switch_pending')
        return NextResponse.json({ error: 'The trial-end Paynow switch is already in progress.' }, { status: 409 });
      const next = await upsertSubscription(a.orgId, { paynow_preferred: usePaynow });
      if (usePaynow && next.status === 'trialing' && next.trial_ends_at
          && new Date(next.trial_ends_at).getTime() - Date.now() <= 4 * 86400 * 1000) {
        await initiateTrialEndSwitch(next, next.trial_ends_at);
      }
      return NextResponse.json({ ok: true, subscription: await getSubscription(a.orgId) });
    }
    if (action === 'cancel') {
      if (sub.gateway === 'stripe') await scheduleStripeCancellation(sub);
      else await upsertSubscription(a.orgId, {
        cancelled_at: iso(new Date()),
        metadata: { ...(sub.metadata || {}), cancelAtPeriodEnd: true, cancellationRequestedAt: new Date().toISOString() },
        ...(sub.status === 'trial_required' ? { status: 'cancelled' } : {}),
      });
      await notifyBilling(a.orgId, 'Cancellation scheduled',
        'Your subscription will end at the close of the current paid period. All workspace data stays intact.', 'INFO', '/billing');
      return NextResponse.json({ ok: true, subscription: await getSubscription(a.orgId) });
    }
    if (action === 'contactSales') {
      await upsertSubscription(a.orgId, {
        metadata: { ...(sub.metadata || {}), contactSalesRequestedAt: new Date().toISOString() },
      });
      await recordBillingEvent(a.orgId, 'enterprise_contact_sales', iso(new Date()), 'Owner/Admin requested Enterprise onboarding assistance.');
      await notifyBilling(a.orgId, 'Enterprise request recorded',
        'Our team will contact you about onboarding, custom branding and priority support. No payment details are requested here.', 'INFO', '/billing');
      return NextResponse.json({ ok: true, message: 'Enterprise request recorded. Our team will contact you.' });
    }
    return NextResponse.json({ error: 'Unknown billing action.' }, { status: 400 });
  } catch (e) { return billingFailure(e); }
}
