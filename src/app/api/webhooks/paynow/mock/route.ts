import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';
import { getInvoiceByReference, getOrgSlug, paynowMockEnabled } from '@/lib/billing';
import { qaPollUrl } from '@/lib/billing-qa';
import { buildMockPaynowPayload, processPaynowWebhook } from '@/lib/paynow-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  if (!paynowMockEnabled()) return NextResponse.json({ error: 'Paynow mock is off' }, { status: 404 });
  const url = new URL(req.url);
  const reference = url.searchParams.get('reference') || '';
  const invoice = reference ? await getInvoiceByReference(reference) : null;
  if (!invoice) return NextResponse.json({ error: 'Unknown invoice reference' }, { status: 404 });
  const origin = url.origin;
  const pollUrl = qaPollUrl(req, reference);
  const raw = buildMockPaynowPayload({
    reference, amount: Number(invoice.amount_usd).toFixed(2),
    paynowReference: invoice.gateway_reference || undefined,
    pollUrl, status: url.searchParams.get('status') || 'Paid',
  });
  const result = await processPaynowWebhook(raw, req);
  if (!result.ok) return NextResponse.json(result, { status: 503 });
  const slug = await getOrgSlug(invoice.organization_id);
  return NextResponse.redirect(new URL(`/${slug || ''}/billing?paynow=mock`, origin));
}
