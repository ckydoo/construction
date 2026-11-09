import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getResource } from '@/lib/resources';
import { readGuard, writeGuard, deleteGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { getRecord, updateRecord, deleteRecord } from '@/lib/records';
import { commentView, attachmentView } from '@/lib/views';

type Ctx = { params: Promise<{ org: string; resource: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource); if (g) return g;
  const scope = await buildScope(a);
  const row = await getRecord(a.orgId, resource, id, scope);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sb = await supabase();
  const [c, f] = await Promise.all([
    sb.from('comments').select('*').eq('record_id', id).eq('organization_id', a.orgId).order('created_at', { ascending: true }),
    sb.from('attachments').select('*').eq('record_id', id).eq('organization_id', a.orgId).order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({
    row,
    comments: (c.data || []).map(commentView),
    files: (f.data || []).map(attachmentView),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = writeGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'records.update'); if (g) return g;
  const scope = await buildScope(a);
  if (!(await getRecord(a.orgId, resource, id, scope))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const result = await updateRecord(a.orgId, a.userId, a.name, def, id, body);
  if (!result.ok) return NextResponse.json({ error: 'Validation failed', errors: result.errors }, { status: 400 });
  return NextResponse.json({ row: result.row });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = deleteGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'records.delete'); if (g) return g;
  const scope = await buildScope(a);
  if (!(await getRecord(a.orgId, resource, id, scope))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const result = await deleteRecord(a.orgId, a.userId, a.name, def, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
