import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removed: Stripe Checkout cannot pay out a Zimbabwe-registered MYLA entity. */
export async function POST() {
  return NextResponse.json({
    error: 'Stripe Checkout was removed. Start the 14-day no-card trial from Billing and pay the first invoice with DPO Pay.',
  }, { status: 410 });
}
