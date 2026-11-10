import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';
import { addDays, getSubscription, iso, upsertSubscription } from '@/lib/billing';
import { supabaseAdminBillingOrgId } from '@/lib/billing-qa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  try {
    const body = await req.json();
    const orgId = await supabaseAdminBillingOrgId(String(body.orgSlug || ''));
    if (!orgId) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
    await upsertSubscription(orgId, { grace_until: iso(addDays(new Date(), -1)) });
    return NextResponse.json({ ok: true, subscription: await getSubscription(orgId) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not expire grace' }, { status: 500 });
  }
}
