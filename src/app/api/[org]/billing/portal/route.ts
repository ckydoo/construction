import { NextResponse } from 'next/server';
import { billingAdmin, billingFailure, billingMutationError } from '@/lib/billing-api';
import { getSubscription } from '@/lib/billing';
import { createPortalSession } from '@/lib/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const { a, error } = await billingAdmin(org); if (error) return error;
  const blocked = billingMutationError(); if (blocked) return blocked;
  try {
    const sub = await getSubscription(a.orgId);
    if (!sub) return NextResponse.json({ error: 'Billing subscription not found.' }, { status: 404 });
    const result = await createPortalSession({ req, slug: a.orgSlug, sub });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return billingFailure(e); }
}
