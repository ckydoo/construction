import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { RESOURCE_MAP } from '@/lib/resources';
import { buildScope, visibleResources, rowAllowed } from '@/lib/access';
import { fetchAll } from '@/lib/fetch';

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const visible = visibleResources(a);
  if (!visible.length) return NextResponse.json({ results: [] });
  const scope = await buildScope(a);
  const needle = q.toLowerCase();
  const recs = await fetchAll('records', x => x
    .eq('organization_id', a.orgId).is('deleted_at', null).in('resource', visible),
    'id,resource,number,title,status,data,project_id');

  const results = recs.filter(r => {
    if (!`${r.title || ''} ${r.number || ''} ${JSON.stringify(r.data || {})}`.toLowerCase().includes(needle)) return false;
    if (!scope.kind) return true;
    return rowAllowed(scope, r.resource, { id: r.id, ...(r.data || {}), projectId: r.project_id });
  }).slice(0, 24).map(r => ({
    id: r.id, resource: r.resource, resourceLabel: RESOURCE_MAP[r.resource]?.singular || r.resource,
    number: r.number, title: r.title, status: r.status, href: `/m/${r.resource}?open=${encodeURIComponent(r.id)}`,
  }));
  return NextResponse.json({ results });
}
