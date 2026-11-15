import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { billingGuard, writeGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { updateRecord, logActivity } from '@/lib/records';
import { getResource } from '@/lib/resources';
import { projectCloseout, CLOSURE_TYPES, CLOSURE_LABEL, type ClosureType } from '@/lib/project-closeout';

type Ctx = { params: Promise<{ org: string; id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { org, id } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = billingGuard(a, { write: true }) || writeGuard(a.config, a.role, 'projects') || capabilityGuard(a.role, 'records.update');
  if (g) return g;
  const def = getResource('projects');
  if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });
  const scope = await buildScope(a);
  const summary = await projectCloseout(a.orgId, id, a, scope);
  if (!summary) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  if (summary.status === 'CLOSED') return NextResponse.json({ error: 'This project is already closed.' }, { status: 409 });

  const body = await req.json().catch(() => null);
  const closureType = String(body?.closureType || '').toUpperCase() as ClosureType;
  if (!CLOSURE_TYPES.includes(closureType)) return NextResponse.json({ error: 'Choose a closure type: completion, cancellation or administrative.' }, { status: 400 });
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  const acknowledged = body?.acknowledged === true;

  const noteRequired = closureType !== 'COMPLETION' || summary.progress < 100;
  if (noteRequired && !note) return NextResponse.json({ error: closureType === 'COMPLETION' ? 'This project is below 100% progress — enter a closure note explaining why it is completed.' : 'Enter a closure note recording the reason.' }, { status: 400 });

  if (summary.issues.length > 0 && !acknowledged) {
    return NextResponse.json({
      error: `This project has ${summary.issues.length} unresolved item${summary.issues.length === 1 ? '' : 's'}. Review them, then confirm to close anyway.`,
      issues: summary.issues,
      requiresAcknowledgement: true,
    }, { status: 422 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const patch: Record<string, any> = {
    status: 'CLOSED',
    closureType,
    closureNote: note || null,
    closedOn: today,
    ...(closureType === 'COMPLETION' && !summary.actualCompletion ? { actualCompletion: today } : {}),
  };
  const result = await updateRecord(a.orgId, a.userId, a.name, def, id, patch);
  if (!result.ok) return NextResponse.json({ error: 'Validation failed', errors: (result as any).errors }, { status: (result as any).status || 400 });

  const issueNote = summary.issues.length ? ` ${summary.issues.length} unresolved item(s) acknowledged.` : '';
  await logActivity(a.orgId, a.userId, a.name, 'UPDATE', 'projects',
    `Closed project “${result.row?.name || result.row?.number}” (${result.row?.number}) as ${CLOSURE_LABEL[closureType].toLowerCase()}.${issueNote}${note ? ` Note: ${note}` : ''}`);
  return NextResponse.json({ ok: true, row: result.row, summary });
}
