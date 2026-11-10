import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { qaGuard } from '@/lib/qa-guard';
import { billingConfig, safeHashEqual } from '@/lib/billing';
import { buildStripeStepEvent, supabaseAdminBillingOrgId } from '@/lib/billing-qa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  try {
    const body = await req.json();
    const slug = String(body.orgSlug || '');
    const step = String(body.step || '');
    const orgId = await supabaseAdminBillingOrgId(slug);
    if (!orgId) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
    const event = await buildStripeStepEvent(orgId, slug, step);
    const payload = JSON.stringify(event);
    const cfg = billingConfig();
    const secret = cfg.stripeWebhookSecret || (process.env.BILLING_QA_KEY || 'myla-stripe-mock-key');
    const signature = new Stripe('sk_test_myla_qa_mock').webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(new URL('/api/webhooks/stripe', req.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
      body: payload,
    });
    const result = await res.json().catch(() => ({}));
    return NextResponse.json({ step, webhookStatus: res.status, result }, { status: res.ok ? 200 : 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'QA Stripe event failed' }, { status: 500 });
  }
}
