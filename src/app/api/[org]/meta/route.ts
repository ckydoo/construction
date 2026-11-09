import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { MODULES, ROLES, COMPANY_TYPES, COMPANY_SIZES, permissionsFor, isExternal } from '@/lib/catalog';
import { RESOURCES } from '@/lib/resources';
import { countsByResource } from '@/lib/queries';
import { visibleResources, buildScope, allowedRecordIds } from '@/lib/access';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scoped = isExternal(a.role);
  const scope = await buildScope(a);
  const visible = visibleResources(a);
  const [members, notifications, audit, counts] = await Promise.all([
    scoped ? prisma.membership.findMany({ where: { organizationId: a.orgId, userId: a.userId }, include: { user: { select: { id: true, name: true, email: true, avatarColor: true, createdAt: true } } } })
           : prisma.membership.findMany({ where: { organizationId: a.orgId }, include: { user: { select: { id: true, name: true, email: true, avatarColor: true, createdAt: true } } }, orderBy: { createdAt: 'asc' } }),
    scoped ? Promise.resolve([]) : prisma.notification.findMany({ where: { organizationId: a.orgId }, take: 30, orderBy: { createdAt: 'desc' } }),
    scoped ? Promise.resolve([]) : prisma.auditLog.findMany({ where: { organizationId: a.orgId }, take: 25, orderBy: { createdAt: 'desc' } }),
    countsByResource(a.orgId),
  ]);
  let visibleCounts: Record<string, number>;
  if (scoped) {
    const ids = await allowedRecordIds(scope, a.orgId, visible);
    visibleCounts = {};
    const recs = await prisma.record.findMany({ where: { id: { in: Array.from(ids) } }, select: { resource: true } });
    for (const r of recs) visibleCounts[r.resource] = (visibleCounts[r.resource] || 0) + 1;
  } else {
    visibleCounts = Object.fromEntries(Object.entries(counts).filter(([k]) => visible.includes(k)));
  }
  const clientRecs = await prisma.record.findMany({ where: { organizationId: a.orgId, resource: 'clients', deletedAt: null }, select: { id: true, number: true, title: true }, orderBy: { createdAt: 'asc' }, take: 300 });
  return NextResponse.json({
    org: { id: a.orgId, name: a.orgName, slug: a.orgSlug, legalName: a.org.legalName, regNumber: a.org.regNumber,
      country: a.org.country, baseCurrency: a.org.baseCurrency, companyType: a.org.companyType, size: a.org.size,
      headcount: a.org.headcount, plan: a.config.plan, limits: a.config.limits },
    config: a.config, modules: MODULES, resources: RESOURCES, roles: ROLES, companyTypes: COMPANY_TYPES, sizes: COMPANY_SIZES,
    role: a.role, permissions: permissionsFor(a.role, a.config.resources),
    walletEnabled: a.config.modules.includes('wallets'),
    user: { id: a.userId, name: a.name, email: a.email, avatarColor: a.avatarColor },
    memberships: a.memberships,
    users: members.map(m => ({ id: m.user.id, name: m.user.name, email: m.user.email, avatarColor: m.user.avatarColor, role: m.role, entityId: m.entityId, joined: m.createdAt })),
    clients: scoped ? [] : clientRecs.map(c => ({ id: c.id, label: c.title || c.number || c.id })),
    entityId: a.entityId,
    notifications, audit, counts: visibleCounts,
  });
}
