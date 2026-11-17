import { fetchAll } from './fetch';
import { supabase, dbError } from './supabase';

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

/** Exact counts for the resources the caller can already see. Uses HEAD count
 *  queries so no row data is transferred; scoped callers derive counts from
 *  the rows they already fetched. */
export async function countsByResource(orgId: string, resources: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(resources.filter(Boolean)));
  if (!unique.length) return {};
  const sb = await supabase();
  const entries = await Promise.all(unique.map(async resource => {
    const { count, error } = await sb.from('records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('resource', resource)
      .is('deleted_at', null);
    if (error) dbError(error);
    return [resource, count ?? 0] as [string, number];
  }));
  return Object.fromEntries(entries);
}

export const sum = (rows: any[], key: string) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
