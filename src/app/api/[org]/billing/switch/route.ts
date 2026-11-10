import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Removed with Stripe. Use POST /api/[org]/billing action=setPaynowPreference. */
export async function POST() {
  return NextResponse.json({ error: 'The Stripe-to-Paynow switch endpoint was removed. Use Billing → Payment gateway instead.' }, { status: 410 });
}
