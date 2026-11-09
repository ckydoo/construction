import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { readGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { commentView } from '@/lib/views';

export async function POST(req: Request, { params }: { params: Promise<{ org: string; resource: string; id: string }> }) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'comments.create'); if (g) return g;
  const scope = await buildScope(a);
  // The comment must belong to a live record of this org, this resource and this scope.
  if (!(await getRecord(a.orgId, resource, id, scope))) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  const { body } = await req.json();
  if (!String(body || '').trim()) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
  const sb = await supabase();
  const { data, error } = await sb.from('comments').insert({
    organization_id: a.orgId, record_id: id, author_id: a.userId,
    author_name: a.name, body: String(body).trim(),
  }).select('*').single();
  if (error) {
    const e: any = new Error(error.message);
    e.status = 403;
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  return NextResponse.json({ comment: commentView(data) }, { status: 201 });
}
