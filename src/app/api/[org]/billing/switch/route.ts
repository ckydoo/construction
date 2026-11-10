import { NextResponse } from 'next/server';
import { billingAdmin, billingFailure, billingMutationError } from '@/lib/billing-api';
import { getSubscription, upsertSubscription } from '@/lib/billing';
import { initiateTrialEndSwitch } from '@/lib/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const { a, error } = await billingAdmin(org); if (error) return error;
  const blocked = billingMutationError(); if (blocked) return blocked;
  try {
    const b = await req.json();
    const usePaynow = b.usePaynow === true;
    const sub = await getSubscription(a.orgId);
    if (!sub) return NextResponse.json({ error: 'Billing subscription not found.' }, { status: 404 });
    if (!['trial_required','trialing'].includes(sub.status))
      return NextResponse.json({ error: 'Gateway choice is only available before the first Stripe charge.' }, { status: 409 });
    const next = await upsertSubscription(a.orgId, { paynow_preferred: usePaynow });
    if (usePaynow && next.trial_ends_at
        && new Date(next.trial_ends_at).getTime() - Date.now() <= 4 * 86400 * 1000) {
      await initiateTrialEndSwitch(next, next.trial_ends_at);
    }
    return NextResponse.json({ ok: true, subscription: await getSubscription(a.orgId) });
  } catch (e) { return billingFailure(e); }
}
