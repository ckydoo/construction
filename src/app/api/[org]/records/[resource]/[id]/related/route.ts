/* Reverse links: "what else in the ERP points at this record?" Powers the
   Linked records panel in the detail drawer and the connectivity audit. */
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { readGuard } from '@/lib/guard';
import { canRead } from '@/lib/catalog';
import { RESOURCE_MAP, RESOURCES } from '@/lib/resources';
import { buildScope, rowAllowed } from '@/lib/access';
import { getRecord } from '@/lib/records';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; resource: string; id: string }> }) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org);
  const def = RESOURCE_MAP[resource];
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource); if (g) return g;
  const scope = await buildScope(a);
  const row = await getRecord(a.orgId, resource, id, scope);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const candidates = RESOURCES.filter(r =>
    a.config.resources.includes(r.id) && canRead(a.role, r.id) &&
    r.fields.some(f => f.ref === resource || (f.key === 'projectId' && resource === 'projects'))
  );
  const groups: any[] = [];
  await Promise.all(candidates.map(async target => {
    const recs = await prisma.record.findMany({
      where: { organizationId: a.orgId, resource: target.id, deletedAt: null },
      select: { id: true, number: true, title: true, status: true, data: true, projectId: true },
      take: 2000,
    });
    const items: any[] = [];
    for (const r of recs) {
      let d: any = {}; try { d = JSON.parse(r.data || '{}'); } catch {}
      const candidate = { id: r.id, ...d, projectId: r.projectId };
      const linked = target.fields.some(f => (f.ref === resource && String(d[f.key] || '') === id) || (f.key === 'projectId' && resource === 'projects' && r.projectId === id));
      if (!linked || !rowAllowed(scope, target.id, candidate)) continue;
      items.push({ id: r.id, title: r.title || d.name || r.number, number: r.number, status: r.status, href: `/m/${target.id}?open=${encodeURIComponent(r.id)}` });
    }
    if (items.length) groups.push({ resource: target.id, label: target.label, icon: target.icon, count: items.length, items: items.slice(0, 12) });
  }));
  groups.sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));

  // Wallet ledger is a first-class linked module for clients and projects.
  let wallet: any = null;
  if (resource === 'clients' || resource === 'projects') {
    const where = resource === 'clients' ? { organizationId: a.orgId, clientId: id } : { organizationId: a.orgId, projectId: id };
    const txs = await prisma.walletTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, take: 12 });
    const w = resource === 'clients' ? await prisma.wallet.findUnique({ where: { organizationId_clientId: { organizationId: a.orgId, clientId: id } } }) : null;
    const agg = await prisma.walletTransaction.aggregate({ where: { ...where, kind: 'ALLOCATION', reversedAt: null }, _sum: { amountCents: true } });
    wallet = {
      balance: w ? w.balanceCents / 100 : null, currency: w?.currency || a.org.baseCurrency || 'USD',
      fundedToProjects: -(agg._sum.amountCents || 0) / 100, count: txs.length,
      href: `/wallets?client=${encodeURIComponent(resource === 'clients' ? id : String(row.clientId || ''))}`,
      items: txs.map(t => ({ id: t.id, kind: t.kind, amount: t.amountCents / 100, note: t.note, actorName: t.actorName, createdAt: t.createdAt.toISOString() })),
    };
  }
  return NextResponse.json({ record: { id, title: row.title, number: row.number }, groups, wallet });
}
