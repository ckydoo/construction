import { NextResponse } from 'next/server';
import { billingAdmin, billingFailure, billingMutationError } from '@/lib/billing-api';
import { getSubscription } from '@/lib/billing';
import { startTrialCheckout } from '@/lib/stripe-billing';
import { isPlanId } from '@/lib/billing-plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const { a, error } = await billingAdmin(org); if (error) return error;
  const blocked = billingMutationError(); if (blocked) return blocked;
  try {
    const b = await req.json();
    const planId = b.planId;
    if (!isPlanId(planId)) return NextResponse.json({ error: 'Choose Starter, Pro or Enterprise.' }, { status: 400 });
    const sub = await getSubscription(a.orgId);
    if (!sub) return NextResponse.json({ error: 'Billing subscription not found.' }, { status: 404 });
    const result = await startTrialCheckout({
      req, orgId: a.orgId, slug: a.orgSlug, planId,
      email: a.email, name: a.name, sub,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return billingFailure(e); }
}
