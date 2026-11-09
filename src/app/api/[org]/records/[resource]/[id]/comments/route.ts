import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { readGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { getRecord } from '@/lib/records';

export async function POST(req: Request, { params }: { params: Promise<{ org: string; resource: string; id: string }> }) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'comments.create'); if (g) return g;
  const scope = await buildScope(a);
  // The comment must belong to a live record of this org, this resource and this scope.
  if (!(await getRecord(a.orgId, resource, id, scope))) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  const { body } = await req.json();
  if (!String(body || '').trim()) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
  const c = await prisma.comment.create({ data: { organizationId: a.orgId, recordId: id, authorId: a.userId, authorName: a.name, body: String(body).trim() } });
  return NextResponse.json({ comment: c }, { status: 201 });
}
