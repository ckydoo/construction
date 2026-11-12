import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removed: Stripe Checkout cannot pay out a Zimbabwe-registered MYLA entity. */
export async function POST() {
  return NextResponse.json({
    error: 'Stripe Checkout was removed. The 7-day no-card trial starts during onboarding; pay its invoice from Billing with Paynow or the configured alternative.',
  }, { status: 410 });
}
