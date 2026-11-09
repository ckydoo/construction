import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { RESOURCE_MAP } from '@/lib/resources';
import { buildScope, visibleResources, rowAllowed } from '@/lib/access';

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q') || '';
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  const visible = visibleResources(a);
  const scope = await buildScope(a);
  const recs = await prisma.record.findMany({
    where: { organizationId: a.orgId, deletedAt: null, resource: { in: visible },
      OR: [{ title: { contains: q } }, { number: { contains: q } }, { data: { contains: q } }] },
    take: 200, orderBy: { createdAt: 'desc' },
    select: { id: true, resource: true, number: true, title: true, status: true, data: true, projectId: true },
  });
  const results = recs.filter(r => {
    if (!scope.kind) return true;
    let d: any = {}; try { d = JSON.parse(r.data || '{}'); } catch {}
    return rowAllowed(scope, r.resource, { id: r.id, ...d, projectId: r.projectId });
  }).slice(0, 24).map(r => ({
    id: r.id, resource: r.resource, resourceLabel: RESOURCE_MAP[r.resource]?.singular || r.resource,
    number: r.number, title: r.title, status: r.status, href: `/m/${r.resource}?open=${encodeURIComponent(r.id)}`,
  }));
  return NextResponse.json({ results });
}
