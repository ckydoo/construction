import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { resolveWorkspace } from '@/lib/catalog';
import { capabilityGuard } from '@/lib/guard';
import { seedDemo } from '@/lib/seed-service';
import { notify } from '@/lib/records';

export async function GET() {
  const a = await apiAuth(); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ org: {
    id: a.orgId, name: a.orgName, slug: a.orgSlug, onboarded: a.onboarded,
    companyType: a.org.companyType, size: a.org.size, config: a.config,
  } });
}

export async function POST(req: Request) {
  const a = await apiAuth(); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = capabilityGuard(a.role, 'settings.manage'); if (g) return g;
  try {
    const b = await req.json();
    const type = String(b.companyType || 'GENERAL_CONTRACTOR');
    const size = String(b.size || 'SMALL');
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
    return NextResponse.json({ ok: true, slug: a.orgSlug, config });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not create workspace' }, { status: 500 });
  }
}
