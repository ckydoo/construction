import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';
import { getInvoices } from '@/lib/billing';
import { buildMockPaynowPayload, processPaynowWebhook } from '@/lib/paynow-billing';
import { qaPollUrl, supabaseAdminBillingOrgId } from '@/lib/billing-qa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  try {
    const body = await req.json();
    const slug = String(body.orgSlug || '');
    const orgId = await supabaseAdminBillingOrgId(slug);
    if (!orgId) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
    const invoices = await getInvoices(orgId, 50);
    const invoice = invoices.find(i => i.status === 'pending' && (i.gateway === 'paynow' || i.gateway === 'mock'));
    if (!invoice) return NextResponse.json({ error: 'No pending Paynow invoice' }, { status: 409 });
    const raw = buildMockPaynowPayload({
      reference: invoice.reference, amount: Number(invoice.amount_usd).toFixed(2),
      paynowReference: invoice.gateway_reference || undefined,
      pollUrl: qaPollUrl(req, invoice.reference),
      status: String(body.status || 'Paid'),
    });
    const result = await processPaynowWebhook(raw, req);
    return NextResponse.json({ reference: invoice.reference, result }, { status: result.ok ? 200 : 503 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'QA Paynow event failed' }, { status: 500 });
  }
}
