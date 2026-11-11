/* Execute one explicit My-work action. The action id — not an arbitrary status
 * from the client — decides the next state, so the UI cannot skip approvals. */
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { billingGuard, capabilityGuard, writeGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { getRecord, logActivity, updateRecord } from '@/lib/records';
import { notifyUsersByCategory, roleUserIds } from '@/lib/notification-service';
import { resolveWorkflowAction } from '@/lib/workflow';

export const dynamic = 'force-dynamic';
const today = () => new Date().toISOString().slice(0, 10);

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const payload = body && typeof body === 'object' ? body as Record<string, any> : {};
  const resource = String(payload.resource || '');
  const id = String(payload.id || '');
  const actionId = String(payload.action || '');
  const note = String(payload.note || '').trim().slice(0, 300);
  const def = getResource(resource);
  if (!def || !id || !actionId) return NextResponse.json({ error: 'Missing resource, record or action' }, { status: 400 });

  const g = billingGuard(a, { write: true })
    || writeGuard(a.config, a.role, resource)
    || capabilityGuard(a.role, 'records.update');
  if (g) return g;

  const scope = await buildScope(a);
  const src = await getRecord(a.orgId, resource, id, scope);
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const resolved = resolveWorkflowAction(resource, String(src.status || ''), actionId, a.role);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { action } = resolved;

  const patch: Record<string, unknown> = { status: action.to };
  if (resource === 'changeOrders' && ['APPROVED', 'REJECTED'].includes(action.to)) patch.decisionDate = today();
  if (resource === 'submittals' && ['APPROVED', 'APPROVE_AS_NOTED', 'REJECTED', 'RESUBMIT'].includes(action.to)) patch.returnedDate = today();
  if (resource === 'rfis' && action.to === 'ANSWERED') patch.answeredDate = today();
  if (resource === 'punchLists' && action.to === 'CLOSED') patch.closedDate = today();
  if (resource === 'ncrs' && action.to === 'CLOSED') patch.closeDate = today();

  const result = await updateRecord(a.orgId, a.userId, a.name, def, id, patch, { expectedStatus: String(src.status || '') });
  if (!result.ok) return NextResponse.json({ error: result.errors?._ || 'Validation failed', errors: result.errors }, { status: (result as any).status || 400 });

  const label = `${src.number || resource} · ${src.title || src.name || src.subject || ''}`.trim();
  const detail = `${action.note}: ${label}${note ? ` — ${note}` : ''}`;
  await logActivity(a.orgId, a.userId, a.name, 'APPROVE', resource, detail);
  const approvals = new Set(['timesheets','changeOrders','requisitions','purchaseOrders','expenses','leaveRequests','submittals','paymentApps']);
  const category = approvals.has(resource) ? 'approvals' : 'tasks';
  const roles = Array.from(new Set(resolved.rule.actions.flatMap(entry => entry.roles)));
  const recipients = await roleUserIds(a.orgId, roles);
  const fingerprint = createHash('sha256').update(`${src.status}|${action.to}|${resource}|${id}|${note}`).digest('hex').slice(0, 20);
  await notifyUsersByCategory(a.orgId, recipients, category,
    `${action.label}: ${src.number || resource}`,
    `${label} moved to ${action.to}${note ? ` — ${note}` : ''}`,
    'SUCCESS', `/m/${resource}?open=${encodeURIComponent(id)}`, `workflow-action:${fingerprint}`);

  return NextResponse.json({ ok: true, row: result.row, action: { id: action.id, label: action.label, to: action.to } });
}
