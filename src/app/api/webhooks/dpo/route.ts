import { NextResponse } from 'next/server';
import { getInvoiceByReference, getOrgSlug } from '@/lib/billing';
import { processDpoCallback } from '@/lib/dpo-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OK_XML = '<?xml version="1.0" encoding="utf-8"?><API3G><Response>OK</Response></API3G>';
const ERROR_XML = '<?xml version="1.0" encoding="utf-8"?><API3G><Response>ERROR</Response></API3G>';

async function slugForReference(reference: string): Promise<string> {
  if (!reference) return '';
  const invoice = await getInvoiceByReference(reference);
  return invoice ? (await getOrgSlug(invoice.organization_id) || '') : '';
}

export async function GET(req: Request) {
  const requestedReference = new URL(req.url).searchParams.get('reference') || '';
  let result: any = {};
  try {
    result = await processDpoCallback(req, 'return');
  } catch {
    result = { ok: false };
  }
  const reference = String(result.reference || requestedReference || '');
  let slug = '';
  try { slug = await slugForReference(reference); } catch { /* never expose callback errors in a redirect */ }
  const status = result?.ok ? (result?.paid ? 'paid' : 'received') : (result?.pending ? 'pending' : 'error');
  const target = slug
    ? `/${slug}/billing?dpo=${status}&reference=${encodeURIComponent(reference)}`
    : `/login?dpo=${status}`;
  return NextResponse.redirect(new URL(target, new URL(req.url).origin));
}

export async function POST(req: Request) {
  const raw = await req.text();
  try {
    await processDpoCallback(req, 'push', raw);
    return new NextResponse(OK_XML, {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return new NextResponse(ERROR_XML, {
      status: e?.status || 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
