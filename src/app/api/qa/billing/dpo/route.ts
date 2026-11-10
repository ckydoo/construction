import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';
import { baseUrl, getInvoices, updateInvoice } from '@/lib/billing';
import { dpoCallbackSignature } from '@/lib/dpo-billing';
import { supabaseAdminBillingOrgId } from '@/lib/billing-qa';

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
    const invoices = await getInvoices(orgId, 50);
    const invoice = invoices.find(i => i.status === 'pending' && i.gateway === 'mock' && i.metadata?.dpo);
    if (!invoice) return NextResponse.json({ error: 'No pending DPO mock invoice' }, { status: 409 });

    if (step === 'pay') {
      const token = String(body.token || invoice.gateway_reference || invoice.metadata.dpo.transactionToken || '');
      const dpo = { ...(invoice.metadata.dpo || {}), mockPaid: true, transactionToken: token, mockChargeResult: '000' };
      await updateInvoice(invoice.id, { metadata: { ...(invoice.metadata || {}), dpo } });
      const callback = new URL('/api/webhooks/dpo', baseUrl(req));
      callback.searchParams.set('source', 'return');
      callback.searchParams.set('reference', invoice.reference);
      callback.searchParams.set('sig', dpoCallbackSignature(invoice.reference));
      callback.searchParams.set('TransactionToken', token);
      callback.searchParams.set('CompanyRef', invoice.reference);
      const res = await fetch(callback.toString(), { method: 'GET', redirect: 'manual', cache: 'no-store' });
      const text = await res.text().catch(() => '');
      return NextResponse.json({
        step, reference: invoice.reference, token,
        callbackStatus: res.status, callbackLocation: res.headers.get('location') || null,
        callbackPreview: text.slice(0, 160),
      }, { status: res.status >= 400 ? 502 : 200 });
    }

    if (step === 'fail_charge') {
      const dpo = {
        ...(invoice.metadata.dpo || {}), mockPaid: false,
        mockChargeResult: '901', chargeAttempts: [],
      };
      await updateInvoice(invoice.id, { metadata: { ...(invoice.metadata || {}), dpo } });
      return NextResponse.json({ ok: true, step, reference: invoice.reference, mockChargeResult: '901' });
    }

    return NextResponse.json({ error: `Unknown QA DPO step: ${step}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'QA DPO event failed' }, { status: 500 });
  }
}
