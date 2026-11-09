import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { readGuard, deleteGuard, capabilityGuard } from '@/lib/guard';
import { buildScope, visibleResources, allowedRecordIds } from '@/lib/access';
import { logActivity } from '@/lib/records';
import { storageBucket } from '@/lib/files';

async function visibleAttachment(a: any, id: string) {
  const sb = await supabase();
  const { data: att } = await sb.from('attachments').select('*')
    .eq('id', id).eq('organization_id', a.orgId).maybeSingle();
  if (!att) return { error: NextResponse.json({ error: 'File not found' }, { status: 404 }) };
  const g = readGuard(a.config, a.role, att.resource);
  if (g) return { error: g };
  const scope = await buildScope(a);
  if (scope.kind) {
    const ids = await allowedRecordIds(scope, a.orgId, visibleResources(a));
    if (!ids.has(att.record_id)) return { error: NextResponse.json({ error: 'File not found' }, { status: 404 }) };
  }
  return { att };
}

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { att, error } = await visibleAttachment(a, id); if (error) return error;
  const sb = await supabase();
  const { data, error: dlErr } = await sb.storage.from(storageBucket()).download(att!.stored_name);
  if (dlErr || !data) return NextResponse.json({ error: dlErr?.message || 'File missing in Storage' }, { status: 404 });
  const buf = await data.arrayBuffer();
  return new NextResponse(new Uint8Array(buf), { headers: {
    'Content-Type': att!.mime,
    'Content-Disposition': `inline; filename="${att!.file_name.replace(/"/g, '')}"`,
    'Cache-Control': 'private, max-age=3600',
  } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { att, error } = await visibleAttachment(a, id); if (error) return error;
  const g = deleteGuard(a.config, a.role, att!.resource) || capabilityGuard(a.role, 'files.delete'); if (g) return g;
  const sb = await supabase();
  // Remove the object while its metadata row still exists (Storage RLS needs it).
  const { error: rmErr } = await sb.storage.from(storageBucket()).remove([att!.stored_name]);
  if (rmErr) return NextResponse.json({ error: `Delete blocked: ${rmErr.message}` }, { status: 403 });
  await sb.from('attachments').delete().eq('id', id);
  if (att!.is_latest && att!.document_key) {
    const { data: next } = await sb.from('attachments').select('id')
      .eq('organization_id', a.orgId).eq('document_key', att!.document_key)
      .order('revision', { ascending: false }).limit(1).maybeSingle();
    if (next) await sb.from('attachments').update({ is_latest: true }).eq('id', next.id);
  }
  await logActivity(a.orgId, a.userId, a.name, 'DELETE', att!.resource, `Removed attachment “${att!.file_name}”`);
  return NextResponse.json({ ok: true });
}
