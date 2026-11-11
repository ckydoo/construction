import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removed: no Stripe customer portal is used in the Paynow-primary release. */
export async function POST() {
  return NextResponse.json({ error: 'Stripe portal was removed. Manage Paynow and DPO fallback invoices in Billing.' }, { status: 410 });
}
