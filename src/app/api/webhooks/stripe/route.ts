import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stripe subscriptions are removed; DPO Pay handles hosted checkout/callbacks. */
export async function POST() {
  return NextResponse.json({ error: 'Stripe webhooks are disabled. Use /api/webhooks/dpo or /api/webhooks/paynow.' }, { status: 410 });
}
