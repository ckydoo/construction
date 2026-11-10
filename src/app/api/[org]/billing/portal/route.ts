import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removed: no Stripe customer portal is used in the DPO Pay release. */
export async function POST() {
  return NextResponse.json({ error: 'Stripe portal was removed. Manage DPO Pay invoices in Billing.' }, { status: 410 });
}
