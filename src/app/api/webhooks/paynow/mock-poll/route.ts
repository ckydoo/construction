import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';
import { getInvoiceByReference, paynowMockEnabled } from '@/lib/billing';
import { buildMockPaynowPayload } from '@/lib/paynow-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  if (!paynowMockEnabled()) return NextResponse.json({ error: 'Paynow mock is off' }, { status: 404 });
  const reference = new URL(req.url).searchParams.get('reference') || '';
  const invoice = reference ? await getInvoiceByReference(reference) : null;
  if (!invoice) return new NextResponse('status=Error&error=Unknown+reference', { status: 404 });
  const body = buildMockPaynowPayload({
    reference, amount: Number(invoice.amount_usd).toFixed(2),
    paynowReference: invoice.gateway_reference || undefined,
    pollUrl: `${new URL(req.url).origin}/api/webhooks/paynow/mock-poll?reference=${encodeURIComponent(reference)}`,
    status: 'Paid',
  });
  return new NextResponse(body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-store' } });
}
