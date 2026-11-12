import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { resolveWorkspace, COMPANY_TYPES, COMPANY_SIZES } from '@/lib/catalog';
import { isPlanId, PLAN_MAP } from '@/lib/billing-plans';
import { capabilityGuard } from '@/lib/guard';
import { seedDemo } from '@/lib/seed-service';
import { notify } from '@/lib/records';
import { getSubscription } from '@/lib/billing';
import { startNoCardTrial } from '@/lib/billing-lifecycle';

export async function GET() {
  const a = await apiAuth(); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sub = await getSubscription(a.orgId);
  const planId = isPlanId(sub?.plan_id) ? sub.plan_id : 'STARTER';
  return NextResponse.json({ plan: PLAN_MAP[planId], enforcePlan: Boolean(a.billing), org: {
    id: a.orgId, name: a.orgName, slug: a.orgSlug, onboarded: a.onboarded,
    companyType: a.org.companyType, size: a.org.size, config: a.config,
  } });
}

export async function POST(req: Request) {
  const a = await apiAuth(); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = capabilityGuard(a.role, 'settings.manage'); if (g) return g;
  try {
    const b = await req.json();
    const type = String(b.companyType || '');
    const size = String(b.size || '');
    if (!COMPANY_TYPES.some(t => t.id === type)) return NextResponse.json({ error: 'Choose your type of work before continuing.' }, { status: 400 });
    if (!COMPANY_SIZES.some(s => s.id === size)) return NextResponse.json({ error: 'Choose your team size before continuing.' }, { status: 400 });
    if (String(b.name || '').trim().length < 2) return NextResponse.json({ error: 'Enter your company name.' }, { status: 400 });
    if (b.headcount !== '' && b.headcount != null && (!Number.isInteger(Number(b.headcount)) || Number(b.headcount) < 1)) return NextResponse.json({ error: 'Enter a valid number of people.' }, { status: 400 });
    const config = resolveWorkspace({
      companyType: type, size, headcount: Number(b.headcount) || undefined,
      revenueBand: b.revenueBand, qualifiers: b.qualifiers || [], addons: b.addons || [],
    });
    const sb = await supabase();
    const { error } = await sb.from('organizations').update({
      name: String(b.name || a.orgName).trim(),
      legal_name: String(b.legalName || '').trim() || null,
      reg_number: String(b.regNumber || '').trim() || null,
      country: String(b.country || 'ZW'), base_currency: String(b.baseCurrency || 'USD'),
      company_type: type, size, headcount: Number(b.headcount) || null,
      revenue_band: b.revenueBand || null, onboarded: true, config,
    }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });

    if (b.loadDemo) {
      await seedDemo(a.orgId, a.userId, a.name);
    } else {
      await notify(a.orgId, 'Workspace ready',
        `${config.modules.length} modules enabled for your ${size.toLowerCase()} ${type.replace(/_/g, ' ').toLowerCase()} workspace.`,
        'SUCCESS', '/dashboard');
    }
    // A new workspace goes straight into its no-card trial and Billing. The
    // trial invoice is payable now but the full trial is never shortened.
    let billingStarted = false;
    try {
      const sub = await getSubscription(a.orgId);
      if (sub && sub.status === 'trial_required') {
        await startNoCardTrial(sub, sub.plan_id, a.email);
        billingStarted = true;
      }
    } catch (billingError) {
      // Onboarding must never fail because a billing seed is missing; Billing
      // remains reachable and the normal plan picker can recover the state.
      console.error('[onboarding] automatic trial start failed', billingError);
    }
    return NextResponse.json({
      ok: true, slug: a.orgSlug, config,
      billingStarted, next: `/${a.orgSlug}/billing`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not create workspace' }, { status: 500 });
  }
}
