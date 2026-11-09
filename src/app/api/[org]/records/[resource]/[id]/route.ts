import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { readGuard, writeGuard, deleteGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { getRecord, updateRecord, deleteRecord } from '@/lib/records';

type Ctx = { params: Promise<{ org: string; resource: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); const def = getResource(resource);
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource); if (g) return g;
  const scope = await buildScope(a);
  const row = await getRecord(a.orgId, resource, id, scope);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [comments, files] = await Promise.all([
    prisma.comment.findMany({ where: { recordId: id, organizationId: a.orgId }, orderBy: { createdAt: 'asc' } }),
    prisma.attachment.findMany({ where: { recordId: id, organizationId: a.orgId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return NextResponse.json({ row, comments, files });
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
