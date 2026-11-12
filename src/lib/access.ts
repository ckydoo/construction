/* Row-level scoping helpers.
 * Postgres RLS is the authority: app_visible_record in
 * 20261110130000_staff_scope.sql enforces the same rules for every row.
 * These helpers mirror that logic in JS for endpoints that combine data from
 * several tables, and power UI-side filtering. Three kinds of scope exist:
 *   null            — owner / administrator, the whole workspace
 *   'client'        — external client portal, own client + own jobs
 *   'subcontractor' — external subcontractor portal, own jobs
 *   'staff'         — internal department + assigned jobs
 */
import type { AuthCtx } from './auth';
import { canRead, isExternal, isFullAccess, staffDepartments, STAFF_SHARED_RESOURCES } from './catalog';
import { resourceFullyEnabled } from './module-visibility';
import { rowsFor } from './queries';
import { fetchAll } from './fetch';
import { supabase } from './supabase';

export type Scope = {
  kind: 'client' | 'subcontractor' | 'staff' | null;
  entityId: string | null;
  projectIds: string[];
  clientIds: string[];
  departments: string[];
};
export const FULL_SCOPE: Scope = { kind: null, entityId: null, projectIds: [], clientIds: [], departments: [] };

const dataOf = (raw: any): Record<string, any> => (raw && typeof raw === 'object') ? raw : {};
const safe = (s: string) => s.replace(/["\\]/g, '');

export function visibleResources(a: AuthCtx): string[] {
  return a.config.resources.filter(r => resourceFullyEnabled(a.config, r) && canRead(a.role, r));
}

/** Server-side lookup of the jobs assigned to an internal account. The SQL
 *  function is SECURITY DEFINER so it sees the whole register while Postgres
 *  RLS is evaluating a row; the fallback keeps older databases usable. */
async function staffProjectIds(orgId: string): Promise<string[]> {
  try {
    const sb = await supabase();
    const { data, error } = await sb.rpc('app_staff_project_ids', { p_org: orgId });
    if (!error && Array.isArray(data)) return Array.from(new Set(data.filter(Boolean).map(String)));
  } catch { /* older database without the helper */ }
  const employee = await staffEmployeeId(orgId);
  if (!employee) return [];
  const own = safe(employee);
  const [projects, tasks, timesheets, crews] = await Promise.all([
    fetchAll('records', q => q.eq('organization_id', orgId).eq('resource', 'projects')
      .is('deleted_at', null).or(`data->>manager.eq."${own}"`), 'id,data'),
    fetchAll('records', q => q.eq('organization_id', orgId).eq('resource', 'tasks')
      .is('deleted_at', null).or(`data->>assignedTo.eq."${own}"`), 'id,project_id,data'),
    fetchAll('records', q => q.eq('organization_id', orgId).eq('resource', 'timesheets')
      .is('deleted_at', null).or(`data->>employeeId.eq."${own}"`), 'id,project_id,data'),
    fetchAll('records', q => q.eq('organization_id', orgId).eq('resource', 'crews')
      .is('deleted_at', null).or(`data->>crewLeader.eq."${own}"`), 'id,project_id,data'),
  ]);
  const ids = [
    ...projects.filter(p => dataOf(p.data).manager === employee).map(p => p.id),
    ...[...tasks, ...timesheets, ...crews].map(r => r.project_id).filter(Boolean),
  ];
  return Array.from(new Set(ids.map(String)));
}

async function staffEmployeeId(orgId: string): Promise<string | null> {
  try {
    const sb = await supabase();
    const { data, error } = await sb.rpc('app_employee', { p_org: orgId });
    if (!error && data) return String(data);
  } catch { /* older database */ }
  return null;
}

async function projectClientIds(orgId: string, projectIds: string[]): Promise<string[]> {
  if (!projectIds.length) return [];
  const rows = await fetchAll('records', q => q.eq('organization_id', orgId)
    .eq('resource', 'projects').is('deleted_at', null).in('id', projectIds.slice(0, 500)), 'id,data');
  return Array.from(new Set(rows.map(r => dataOf(r.data).clientId).filter(Boolean).map(String)));
}

export async function buildScope(a: AuthCtx): Promise<Scope> {
  if (isFullAccess(a.role)) return FULL_SCOPE;

  // Fail closed: a portal account with no client/subcontractor link must never
  // fall through to the internal-staff branch below, which exposes shared
  // registers (clients, contacts, vendors, departments, crews, warehouses,
  // accounts) to every staff caller. An unlinked portal account sees no rows.
  if (isExternal(a.role) && !a.entityId) {
    return { kind: 'client', entityId: null, projectIds: [], clientIds: [], departments: [] };
  }

  if (isExternal(a.role) && a.entityId) {
    const kind: 'client' | 'subcontractor' = a.role === 'CLIENT_EXTERNAL' ? 'client' : 'subcontractor';
    const own = safe(String(a.entityId));
    if (kind === 'client') {
      const projects = await fetchAll('records', q => q
        .eq('organization_id', a.orgId).eq('resource', 'projects').is('deleted_at', null)
        .or(`data->>clientId.eq."${own}"`), 'id,data');
      const projectIds = projects.filter(p => dataOf(p.data).clientId === a.entityId).map(p => p.id);
      return { kind, entityId: a.entityId, projectIds, clientIds: [String(a.entityId)], departments: [] };
    }
    const or = ['counterparty','submittedBy','subcontractorId'].map(k => `data->>${k}.eq."${own}"`).join(',');
    const [contracts, submittals] = await Promise.all([
      fetchAll('records', q => q.eq('organization_id', a.orgId).eq('resource', 'contracts')
        .is('deleted_at', null).or(or), 'id,project_id,data'),
      fetchAll('records', q => q.eq('organization_id', a.orgId).eq('resource', 'submittals')
        .is('deleted_at', null).or(or), 'id,project_id,data'),
    ]);
    const ids = [...contracts, ...submittals]
      .filter(r => {
        const d = dataOf(r.data);
        return d.counterparty === a.entityId || d.submittedBy === a.entityId || d.subcontractorId === a.entityId;
      })
      .map(r => r.project_id)
      .filter((x): x is string => !!x);
    return { kind, entityId: a.entityId, projectIds: Array.from(new Set(ids)), clientIds: [], departments: [] };
  }

  // Internal staff: department registers + assigned jobs.
  const projectIds = await staffProjectIds(a.orgId);
  const clientIds = await projectClientIds(a.orgId, projectIds);
  return {
    kind: 'staff', entityId: await staffEmployeeId(a.orgId),
    projectIds, clientIds, departments: staffDepartments(a.role),
  };
}

export function rowAllowed(scope: Scope, resource: string, row: any): boolean {
  if (!scope.kind) return true;

  if (scope.kind === 'client') {
    const own = scope.entityId;
    if (resource === 'clients') return row.id === own;
    if (resource === 'contacts') return row.clientId === own;
    if (resource === 'projects') return scope.projectIds.includes(row.id);
    if (row.clientId && row.clientId === own) return true;
    if (row.projectId && scope.projectIds.includes(row.projectId)) return true;
    return false;
  }
  if (scope.kind === 'subcontractor') {
    const own = scope.entityId;
    if (resource === 'subcontractors') return row.id === own;
    if (resource === 'projects') return scope.projectIds.includes(row.id);
    if (row.counterparty === own || row.submittedBy === own || row.subcontractorId === own) return true;
    if (row.projectId && scope.projectIds.includes(row.projectId)) return true;
    return false;
  }

  // Internal staff
  if ((STAFF_SHARED_RESOURCES as readonly string[]).includes(resource)) return true;
  if (scope.departments.includes(resource)) return true;
  if (resource === 'employees' && scope.entityId && row.id === scope.entityId) return true;
  if (resource === 'projects' && scope.entityId && row.manager === scope.entityId) return true;
  if (resource === 'projects') return scope.projectIds.includes(row.id);
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

export async function rowsForScoped(a: AuthCtx, scope: Scope, resource: string, projectId?: string) {
  const rows = await rowsFor(a.orgId, resource, projectId);
  return scope.kind ? rows.filter(r => rowAllowed(scope, resource, r)) : rows;
}

/** Wallet tenant scoping. Only owners/admins see every wallet. Assigned staff
 *  see wallets for clients on their jobs; an unassigned staff account sees none.
 *  A missing scope fails closed instead of falling back to the whole company. */
export function walletClientAllowed(a: AuthCtx, clientId: string, scope?: Scope): boolean {
  if (isFullAccess(a.role)) return true;
  if (scope?.kind === 'staff') {
    return scope.projectIds.length > 0 && scope.clientIds.includes(clientId);
  }
  if (!isExternal(a.role)) return false;
  if (a.role !== 'CLIENT_EXTERNAL') return false;
  return a.entityId === clientId;
}
