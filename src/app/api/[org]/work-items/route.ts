/* Read-only derivation of the role-aware "My work" queue.
 * No work-item table is needed: pending records are projected from the existing
 * registers, filtered by module visibility, RBAC and portal row scope. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { fetchAll } from '@/lib/fetch';
import { toRow } from '@/lib/records';
import { canRead } from '@/lib/catalog';
import { billingGuard } from '@/lib/guard';
import { buildScope, rowAllowed } from '@/lib/access';
import { resourceFullyEnabled, hrefVisible } from '@/lib/module-visibility';
import {
  WORKFLOW_RESOURCE_IDS, WORKFLOW_RULES, allowedWorkflowActions,
  workflowAssignedRole, type WorkItem,
} from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
const DEADLINE_KEYS = new Set(['requiredDate', 'deliveryDate', 'dueDate', 'startDate', 'decisionDate']);

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}
function addDays(d: Date, days: number): Date { return new Date(d.getTime() + days * DAY); }
function dateLabel(d: Date | null): string | null { return d ? d.toISOString() : null; }
function numberOrNull(v: unknown): number | null {
  const n = Number(v);
  return isFinite(n) && n !== 0 ? n : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = billingGuard(a); if (g) return g;

  const scope = await buildScope(a);
  const enabled = WORKFLOW_RULES.filter(rule =>
    resourceFullyEnabled(a.config, rule.resource) && canRead(a.role, rule.resource));
  if (!enabled.length) {
    return NextResponse.json({ items: [], summary: { total: 0, overdue: 0, dueSoon: 0, escalated: 0, actionable: 0 } }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const resources = enabled.map(r => r.resource);
  const pending = Array.from(new Set(enabled.flatMap(r => r.pending)));
  const [recs, projectRecs] = await Promise.all([
    fetchAll('records', q => q
      .eq('organization_id', a.orgId)
      .in('resource', resources)
      .in('status', pending)
      .is('deleted_at', null)),
    fetchAll('records', q => q
      .eq('organization_id', a.orgId)
      .eq('resource', 'projects')
      .is('deleted_at', null)),
  ]);

  const projectNames = new Map<string, string>();
  for (const rec of projectRecs) {
    const row = toRow(rec);
    if (scope.kind && !rowAllowed(scope, 'projects', row)) continue;
    projectNames.set(row.id, row.title || row.number || row.id);
  }

  const now = Date.now();
  const items: WorkItem[] = [];
  for (const rec of recs) {
    const row = toRow(rec);
    if (scope.kind && !rowAllowed(scope, row.resource || rec.resource, row)) continue;
    const resource = String(rec.resource);
    const rule = WORKFLOW_RULES.find(r => r.resource === resource);
    if (!rule || !rule.pending.includes(String(row.status || ''))) continue;
    const href = `/${org}/m/${resource}?open=${encodeURIComponent(row.id)}`;
    if (!hrefVisible(href, a.config)) continue;

    let anchor: Date | null = null;
    let anchorIsDeadline = false;
    for (const key of rule.dateKeys) {
      const d = parseDate(row[key]);
      if (d) { anchor = d; anchorIsDeadline = DEADLINE_KEYS.has(key); break; }
    }
    if (!anchor) anchor = parseDate(row.createdAt) || new Date(now);
    const due = anchorIsDeadline ? anchor : addDays(anchor, rule.slaDays);
    const overdue = due.getTime() < now;
    const dueSoon = !overdue && due.getTime() - now <= 2 * DAY;
    const escalated = overdue && now - due.getTime() > 3 * DAY;
    const amount = numberOrNull(row[rule.amountKey || '']);
    const actions = allowedWorkflowActions(resource, String(row.status || ''), a.role)
      .map(x => ({ id: x.id, label: x.label, to: x.to, tone: x.tone }));

    items.push({
      key: `${resource}:${row.id}`,
      resource,
      resourceLabel: rule.label,
      singular: rule.singular,
      icon: rule.icon,
      id: row.id,
      number: row.number || '',
      title: row.title || row.name || row.subject || row.number || rule.singular,
      status: String(row.status || ''),
      reason: rule.reason,
      amount,
      currency: String(row.currency || a.org?.baseCurrency || 'USD'),
      dueAt: dateLabel(due),
      ageDays: Math.max(0, Math.floor((now - (parseDate(row.updatedAt)?.getTime() || now)) / DAY)),
      overdue,
      dueSoon,
      escalated,
      priority: overdue || (amount && amount >= 100000) ? 'high' : dueSoon ? 'medium' : 'low',
      tone: overdue ? 'red' : dueSoon ? 'amber' : 'blue',
      href,
      projectName: row.projectId ? projectNames.get(String(row.projectId)) || null : null,
      assignedRole: workflowAssignedRole(resource, a.role),
      canAct: actions.length > 0,
      actions,
    });
  }

  items.sort((x, y) => {
    if (x.overdue !== y.overdue) return x.overdue ? -1 : 1;
    const dx = x.dueAt ? Date.parse(x.dueAt) : Infinity;
    const dy = y.dueAt ? Date.parse(y.dueAt) : Infinity;
    if (dx !== dy) return dx - dy;
    return (y.amount || 0) - (x.amount || 0);
  });

  const summary = {
    total: items.length,
    overdue: items.filter(i => i.overdue).length,
    dueSoon: items.filter(i => i.dueSoon).length,
    escalated: items.filter(i => i.escalated).length,
    actionable: items.filter(i => i.canAct).length,
  };
  return NextResponse.json({ items, summary, generatedAt: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
