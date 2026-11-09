import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { resolveWorkspace } from '@/lib/catalog';
import { capabilityGuard } from '@/lib/guard';
import { seedDemo } from '@/lib/seed-service';

export async function GET() {
  const a = await apiAuth(); if (!a) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  return NextResponse.json({ org:{ id:a.orgId, name:a.orgName, slug:a.orgSlug, onboarded:a.onboarded, companyType:a.org.companyType, size:a.org.size, config:a.config } });
}

export async function POST(req: Request) {
  const a = await apiAuth(); if (!a) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const g = capabilityGuard(a.role,'settings.manage'); if (g) return g;
  try {
    const b = await req.json();
    const type = String(b.companyType||'GENERAL_CONTRACTOR');
    const size = String(b.size||'SMALL');
    const config = resolveWorkspace({ companyType:type, size, headcount:Number(b.headcount)||undefined,
      revenueBand:b.revenueBand, qualifiers:b.qualifiers||[], addons:b.addons||[] });
    const org = await prisma.organization.update({ where:{id:a.orgId}, data:{
      name:String(b.name||a.orgName).trim(), legalName:String(b.legalName||'').trim() || null,
      regNumber:String(b.regNumber||'').trim() || null, country:String(b.country||'ZW'),
      baseCurrency:String(b.baseCurrency||'USD'), companyType:type, size,
      headcount:Number(b.headcount)||null, revenueBand:b.revenueBand||null,
      onboarded:true, config:JSON.stringify(config),
    }});
    if (b.loadDemo) await seedDemo(prisma, a.orgId);
    else {
      await prisma.notification.create({ data:{ organizationId:a.orgId, title:'Workspace ready', body:`${config.modules.length} modules enabled for your ${size.toLowerCase()} ${type.replace(/_/g,' ').toLowerCase()} workspace.`, kind:'SUCCESS', href:'/dashboard' } });
    }
    return NextResponse.json({ ok:true, slug:org.slug, config });
  } catch (e:any) { return NextResponse.json({ error:e?.message||'Could not create workspace' }, { status:500 }); }
}
