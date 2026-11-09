/* Row-level scoping for external portal roles. A client user is pinned to one
   client record via Membership.entityId and may only see that client's own
   records, projects and wallet. Everything internal sees the whole org. */
import prisma from './db';
import type { AuthCtx } from './auth';
import { canRead, isExternal } from './catalog';
import { rowsFor } from './queries';

export type Scope = { kind: 'client' | 'subcontractor' | null; entityId: string | null; projectIds: string[] };
export const FULL_SCOPE: Scope = { kind: null, entityId: null, projectIds: [] };

function dataOf(raw: string): Record<string, any> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export function visibleResources(a: AuthCtx): string[] {
  return a.config.resources.filter(r => canRead(a.role, r));
}

export async function buildScope(a: AuthCtx): Promise<Scope> {
  if (!isExternal(a.role) || !a.entityId) return FULL_SCOPE;
  const kind: 'client' | 'subcontractor' = a.role === 'CLIENT_EXTERNAL' ? 'client' : 'subcontractor';
  if (kind === 'client') {
    const projects = await prisma.record.findMany({
      where: { organizationId: a.orgId, resource: 'projects', deletedAt: null },
      select: { id: true, data: true },
    });
    return { kind, entityId: a.entityId, projectIds: projects.filter(p => dataOf(p.data).clientId === a.entityId).map(p => p.id) };
  }
  // A subcontractor sees the projects on its own contracts / submittals.
  const [contracts, submittals] = await Promise.all([
    prisma.record.findMany({ where: { organizationId: a.orgId, resource: 'contracts', deletedAt: null }, select: { projectId: true, data: true } }),
    prisma.record.findMany({ where: { organizationId: a.orgId, resource: 'submittals', deletedAt: null }, select: { projectId: true, data: true } }),
  ]);
  const ids = [...contracts, ...submittals]
    .filter(r => {
      const d = dataOf(r.data);
      return d.counterparty === a.entityId || d.submittedBy === a.entityId || d.subcontractorId === a.entityId;
    })
    .map(r => r.projectId)
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
  const recs = await prisma.record.findMany({
    where: { organizationId: orgId, deletedAt: null, resource: { in: resources } },
    select: { id: true, resource: true, data: true, projectId: true },
  });
  const out = new Set<string>();
  for (const r of recs) {
    const row = { id: r.id, ...dataOf(r.data), projectId: r.projectId };
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
