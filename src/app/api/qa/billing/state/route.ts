import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';
import { getInvoices, getSubscription } from '@/lib/billing';
import { supabaseAdminBillingOrgId } from '@/lib/billing-qa';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  const slug = new URL(req.url).searchParams.get('org') || '';
  const orgId = await supabaseAdminBillingOrgId(slug);
  if (!orgId) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
  const [subscription, invoices, records] = await Promise.all([
    getSubscription(orgId), getInvoices(orgId, 50),
    supabaseAdmin().from('records').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
  ]);
  return NextResponse.json({ orgId, subscription, invoices, recordCount: records.count || 0 });
}
