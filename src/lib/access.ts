/* Row-level scoping helpers for external portal roles.
 * Postgres RLS is the authority (app_visible_record in 0003_rbac.sql already
 * filters every row). These helpers mirror that logic in JS for endpoints that
 * combine data from several tables, and power UI-side filtering. */
import type { AuthCtx } from './auth';
import { canRead, isExternal } from './catalog';
import { rowsFor } from './queries';
import { fetchAll } from './fetch';

export type Scope = { kind: 'client' | 'subcontractor' | null; entityId: string | null; projectIds: string[] };
export const FULL_SCOPE: Scope = { kind: null, entityId: null, projectIds: [] };

const dataOf = (raw: any): Record<string, any> => (raw && typeof raw === 'object') ? raw : {};

export function visibleResources(a: AuthCtx): string[] {
  return a.config.resources.filter(r => canRead(a.role, r));
}

export async function buildScope(a: AuthCtx): Promise<Scope> {
  if (!isExternal(a.role) || !a.entityId) return FULL_SCOPE;
  const kind: 'client' | 'subcontractor' = a.role === 'CLIENT_EXTERNAL' ? 'client' : 'subcontractor';
  if (kind === 'client') {
    const projects = await fetchAll('records', q => q
      .eq('organization_id', a.orgId).eq('resource', 'projects').is('deleted_at', null), 'id,data');
    return { kind, entityId: a.entityId,
      projectIds: projects.filter(p => dataOf(p.data).clientId === a.entityId).map(p => p.id) };
  }
  const [contracts, submittals] = await Promise.all([
    fetchAll('records', q => q.eq('organization_id', a.orgId).eq('resource', 'contracts').is('deleted_at', null), 'id,project_id,data'),
    fetchAll('records', q => q.eq('organization_id', a.orgId).eq('resource', 'submittals').is('deleted_at', null), 'id,project_id,data'),
  ]);
  const ids = [...contracts, ...submittals]
    .filter(r => {
      const d = dataOf(r.data);
      return d.counterparty === a.entityId || d.submittedBy === a.entityId || d.subcontractorId === a.entityId;
    })
    .map(r => r.project_id)
    .filter((x): x is string => !!x);
  return { kind, entityId: a.entityId, projectIds: Array.from(new Set(ids)) };
}

export function rowAllowed(scope: Scope, resource: string, row: any): boolean {
  if (!scope.kind) return true;
  const own = scope.entityId;
  if (scope.kind === 'client') {
    if (resource === 'clients') return row.id === own;
    if (resource === 'contacts') return row.clientId === own;
    if (resource === 'projects') return scope.projectIds.includes(row.id);
    if (row.clientId && row.clientId === own) return true;
    if (row.projectId && scope.projectIds.includes(row.projectId)) return true;
    return false;
  }
  if (resource === 'subcontractors') return row.id === own;
  if (resource === 'projects') return scope.projectIds.includes(row.id);
  if (row.counterparty === own || row.submittedBy === own || row.subcontractorId === own) return true;
  if (row.projectId && scope.projectIds.includes(row.projectId)) return true;
  return false;
}

/** All record ids this caller may read (used for attachments, search, integrity). */
export async function allowedRecordIds(scope: Scope, orgId: string, resources: string[]): Promise<Set<string>> {
  if (!resources.length) return new Set<string>();
  const recs = await fetchAll('records', q => q
    .eq('organization_id', orgId).is('deleted_at', null).in('resource', resources), 'id,resource,data,project_id');
  const out = new Set<string>();
  for (const r of recs) {
    const row = { id: r.id, ...dataOf(r.data), projectId: r.project_id };
    if (rowAllowed(scope, r.resource, row)) out.add(r.id);
  }
  return out;
}

export async function rowsForScoped(a: AuthCtx, scope: Scope, resource: string) {
  const rows = await rowsFor(a.orgId, resource);
  return scope.kind ? rows.filter(r => rowAllowed(scope, resource, r)) : rows;
}

/** Wallet tenant scoping: the only client id an external user may address. */
export function walletClientAllowed(a: AuthCtx, clientId: string): boolean {
  if (!isExternal(a.role)) return true;
  if (a.role !== 'CLIENT_EXTERNAL') return false;
  return a.entityId === clientId;
}
