import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { RESOURCE_MAP } from '@/lib/resources';
import { buildScope, visibleResources, rowAllowed } from '@/lib/access';
import { supabase } from '@/lib/supabase';

/* The command palette searches on the database, not in Node memory: only the
 * matching page is returned. The trigram-indexed search_text column covers
 * title, number and every business field, exactly like the register search. */
function searchOr(q:string){
  const like=q.replace(/[,()%*\\'"]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
  return like ? `search_text.ilike.*${like}*` : '';
}

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const visible = visibleResources(a);
  if (!visible.length) return NextResponse.json({ results: [] });
  const scope = await buildScope(a);
  const or = searchOr(q);
  if (!or) return NextResponse.json({ results: [] });
  const sb = await supabase();
  // Scoped users may need a larger candidate window before row-level filtering.
  const { data:recs, error } = await sb.from('records')
    .select('id,resource,number,title,status,data,project_id')
    .eq('organization_id', a.orgId).is('deleted_at', null).in('resource', visible)
    .or(or).order('created_at', { ascending:false })
    .limit(scope.kind ? 200 : 24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (recs || []).filter(r => {
    if (!scope.kind) return true;
    return rowAllowed(scope, r.resource, { id:r.id, ...(r.data || {}), projectId:r.project_id });
  }).slice(0, 24).map(r => ({
    id: r.id, resource: r.resource, resourceLabel: RESOURCE_MAP[r.resource]?.singular || r.resource,
    number: r.number, title: r.title, status: r.status,
    href: r.resource === 'projects'
      ? `/projects/${encodeURIComponent(r.id)}`
      : `/m/${r.resource}?open=${encodeURIComponent(r.id)}`,
  }));
  return NextResponse.json({ results });
}
