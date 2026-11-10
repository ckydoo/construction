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
    const mode = String(body.mode || 'grace');
    const past = addDays(new Date(), -1);
    const current = await getSubscription(orgId);
    const patch: any = {};
    if (mode === 'trial') patch.trial_ends_at = iso(past);
    else if (mode === 'period') patch.current_period_end = iso(past);
    else {
      patch.grace_until = iso(past);
      // Cron hard-locks from past_due/grace, not from an active subscription
      // that merely has a stale grace_until. Put QA into the real grace state.
      if (current?.status === 'active') patch.status = 'past_due';
    }
    await upsertSubscription(orgId, patch);
    return NextResponse.json({ ok: true, mode, subscription: await getSubscription(orgId) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not expire billing state' }, { status: 500 });
  }
}
