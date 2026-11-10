import { NextResponse } from 'next/server';
import { billingAdmin, billingFailure, billingMutationError } from '@/lib/billing-api';
import { getInvoices, getSubscription } from '@/lib/billing';
import { startDpoCheckout } from '@/lib/dpo-billing';
import { startPaynowCheckout } from '@/lib/paynow-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const { a, error } = await billingAdmin(org); if (error) return error;
  const blocked = billingMutationError(); if (blocked) return blocked;
  try {
    const b = await req.json();
    const invoiceId = String(b.invoiceId || '');
    const invoices = await getInvoices(a.orgId, 100);
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (!['dpo','mock','paynow'].includes(invoice.gateway))
      return NextResponse.json({ error: 'This invoice is not a DPO/Paynow invoice.' }, { status: 400 });
    const sub = await getSubscription(a.orgId);
    if (!sub) return NextResponse.json({ error: 'Billing subscription not found.' }, { status: 404 });
    const dpoInvoice = Boolean(invoice.metadata?.dpo)
      || (!sub.paynow_preferred && (invoice.gateway === 'dpo' || invoice.gateway === 'mock'));
    if (dpoInvoice) {
      const result = await startDpoCheckout({
        req, orgId: a.orgId, slug: a.orgSlug, planId: invoice.plan_id,
        email: a.email, name: a.name, invoice, sub,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await startPaynowCheckout({
      req, orgId: a.orgId, slug: a.orgSlug, planId: invoice.plan_id,
      email: a.email, invoice, sub,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) { return billingFailure(e); }
}
