import { NextResponse } from 'next/server';
import { billingAdmin, billingConfigPublic, billingFailure, billingMutationError } from '@/lib/billing-api';
import {
  billingConfig, getInvoices, getSubscription, iso, notifyBilling, publicBilling,
  recordBillingEvent, upsertSubscription,
} from '@/lib/billing';
import { cancelSubscription, startNoCardTrial } from '@/lib/billing-lifecycle';
import { revokeDpoCard } from '@/lib/dpo-billing';
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
      if (sub.status !== 'trial_required') return NextResponse.json({ error: 'Choose a plan before starting the no-card trial.' }, { status: 409 });
      const next = await upsertSubscription(a.orgId, { plan_id: b.planId });
      return NextResponse.json({ ok: true, subscription: next });
    }

    if (action === 'startTrial') {
      const planId = b.planId && isPlanId(b.planId) ? b.planId : sub.plan_id;
      const next = await startNoCardTrial(sub, planId, a.email);
      return NextResponse.json({ ok: true, subscription: next, message: '14-day no-card trial started.' });
    }

    if (action === 'setGatewayPreference' || action === 'setPaynowPreference') {
      // New UI sends `gateway`; the legacy action name is retained for DPO QA.
      const requested = action === 'setGatewayPreference'
        ? String(b.gateway || (b.useDpo === true ? 'dpo' : b.usePaynow === false ? 'dpo' : 'paynow'))
        : (b.usePaynow === false ? 'dpo' : 'paynow');
      const preference = requested.toLowerCase() === 'dpo' ? 'dpo' : 'paynow';
      const cfg = billingConfig();
      if (preference === 'dpo' && !cfg.dpoReady)
        return NextResponse.json({ error: 'DPO fallback credentials are not configured; Paynow remains the primary gateway.' }, { status: 409 });
      if (!['trial_required','trialing','grace'].includes(sub.status) || sub.last_payment_at)
        return NextResponse.json({ error: 'The payment rail can only be selected before the first paid period.' }, { status: 409 });
      const next = await upsertSubscription(a.orgId, {
        paynow_preferred: preference === 'paynow',
        metadata: { ...(sub.metadata || {}), gatewayPreference: preference },
      });
      await recordBillingEvent(a.orgId, 'gateway_preference_changed', iso(new Date()),
        preference === 'dpo' ? 'DPO Pay fallback selected before first payment; Paynow remains the default.' : 'Paynow primary rail confirmed before first payment.');
      return NextResponse.json({ ok: true, subscription: next });
    }

    if (action === 'cancel') {
      const next = await cancelSubscription(sub);
      await revokeDpoCard(sub);
      return NextResponse.json({ ok: true, subscription: next });
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
