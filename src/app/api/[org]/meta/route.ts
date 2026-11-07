import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { MODULES, ROLES, COMPANY_TYPES, COMPANY_SIZES } from '@/lib/catalog';
import { RESOURCES } from '@/lib/resources';
import { countsByResource } from '@/lib/queries';

export async function GET(_req:Request,{params}:{params:Promise<{org:string}>}){
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const [users, notifications, audit, counts] = await Promise.all([
    prisma.membership.findMany({ where:{organizationId:a.orgId}, include:{user:{select:{id:true,name:true,email:true,avatarColor:true,createdAt:true}}} , orderBy:{createdAt:'asc'} }),
    prisma.notification.findMany({ where:{organizationId:a.orgId}, take:30, orderBy:{createdAt:'desc'} }),
    prisma.auditLog.findMany({ where:{organizationId:a.orgId}, take:25, orderBy:{createdAt:'desc'} }),
    countsByResource(a.orgId),
  ]);
  return NextResponse.json({
    org:{ id:a.orgId, name:a.orgName, slug:a.orgSlug, legalName:a.org.legalName, regNumber:a.org.regNumber,
      country:a.org.country, baseCurrency:a.org.baseCurrency, companyType:a.org.companyType, size:a.org.size,
      headcount:a.org.headcount, plan:a.config.plan, limits:a.config.limits },
    config:a.config, modules:MODULES, resources:RESOURCES, roles:ROLES, companyTypes:COMPANY_TYPES, sizes:COMPANY_SIZES,
    role:a.role, user:{ id:a.userId, name:a.name, email:a.email, avatarColor:a.avatarColor },
    memberships:a.memberships,
    users:users.map(m=>({ id:m.user.id, name:m.user.name, email:m.user.email, avatarColor:m.user.avatarColor, role:m.role, joined:m.createdAt })),
    notifications, audit, counts,
  });
}
