import { fetchAll } from './fetch';

export async function rowsFor(orgId: string, resource: string, projectId?: string): Promise<Record<string, any>[]> {
  const recs = await fetchAll('records', q => {
    let x = q.eq('organization_id', orgId).eq('resource', resource).is('deleted_at', null);
    if (projectId) x = x.eq('project_id', projectId);
    return x;
  });
  return recs.map(r => ({
    ...(r.data || {}),
    id: r.id, number: r.number, title: r.title, status: r.status,
    projectId: r.project_id, createdAt: r.created_at,
  }));
}

export async function countsByResource(orgId: string): Promise<Record<string, number>> {
  const recs = await fetchAll('records', q => q
    .eq('organization_id', orgId).is('deleted_at', null), 'id,resource');
  const out: Record<string, number> = {};
  for (const r of recs) out[r.resource] = (out[r.resource] || 0) + 1;
  return out;
}

export const sum = (rows: any[], key: string) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
