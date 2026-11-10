import { NextResponse } from 'next/server';
import { handleStripeWebhook } from '@/lib/stripe-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const signature = req.headers.get('stripe-signature') || '';
    const result = await handleStripeWebhook(raw, signature);
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Stripe webhook failed' }, { status: e?.status || 500 });
  }
}
