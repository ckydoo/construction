/* Document library: automatic job/type folders, custom nested folders,
 * searchable files and revision chains. Files remain normal attachments, so
 * Storage RLS, record RLS and revision history all keep working unchanged. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { readGuard, writeGuard, capabilityGuard } from '@/lib/guard';
import { buildScope, rowsForScoped, visibleResources, allowedRecordIds } from '@/lib/access';
import { resolveFolderKey } from '@/lib/folders';
import { fetchAll } from '@/lib/fetch';
import { attachmentView } from '@/lib/views';
import { AUTO_BUCKETS, bucketKey, customKey, projectKey, safeFolderName } from '@/lib/document-folders';

type Ctx = { params: Promise<{ org: string }> };
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(_req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return err('Unauthorized', 401);
  const g = readGuard(a.config, a.role, 'documents'); if (g) return g;
  const scope = await buildScope(a);

  const [projectRows, customRows, attachmentRows] = await Promise.all([
    rowsForScoped(a, scope, 'projects'),
    fetchAll('document_folders', q => q.eq('organization_id', a.orgId).order('created_at', { ascending: true })),
    fetchAll('attachments', q => q.eq('organization_id', a.orgId).order('created_at', { ascending: false })),
  ]);

  const projects = projectRows.map(p => ({ id: p.id, name: String(p.name || p.title || p.number || p.id) }));
  const folders = customRows.map(f => ({
    id: f.id, name: f.name, parentKey: f.parent_key || '', projectId: f.project_id || null,
    createdAt: f.created_at,
  }));
  // Folder keys and owning records are both scoped. This mirrors record RLS so
  // a file cannot appear in the library just because its metadata row is visible.
  const allowedKeys = new Set<string>();
  for (const project of projectRows) {
    const id = String(project.id);
    allowedKeys.add(projectKey(id));
    for (const b of AUTO_BUCKETS) allowedKeys.add(bucketKey(id, b.key));
  }
  for (const f of customRows) allowedKeys.add(customKey(String(f.id)));
  const allowedRecords = scope.kind
    ? await allowedRecordIds(scope, a.orgId, visibleResources(a))
    : null;
  const files = attachmentRows
    .filter(r => r.folder_key && allowedKeys.has(String(r.folder_key)))
    .filter(r => !allowedRecords || allowedRecords.has(String(r.record_id)))
    .map(r => ({ ...attachmentView(r), folderKey: r.folder_key as string }));

  return NextResponse.json({
    projects, folders, files,
    canUpload: !writeGuard(a.config, a.role, 'documents') && !capabilityGuard(a.role, 'files.upload'),
    canDelete: !capabilityGuard(a.role, 'files.delete'),
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return err('Unauthorized', 401);
  const wg = writeGuard(a.config, a.role, 'documents'); if (wg) return wg;
  let b: any;
  try { b = await req.json(); } catch { return err('Expected JSON body'); }
  const action = String(b.action || '');
  const scope = await buildScope(a);
  const sb = await supabase();

  if (action === 'createFolder') {
    const cg = capabilityGuard(a.role, 'files.upload'); if (cg) return cg;
    const name = safeFolderName(b.name);
    if (!name) return err('Give the folder a name');
    const parentKey = String(b.parentKey || '');
    const resolved = await resolveFolderKey(a, scope, parentKey);
    if (!resolved) return err('Choose a job or folder you can access', 403);
    const { data, error } = await sb.from('document_folders').insert({
      organization_id: a.orgId, name, parent_key: parentKey,
      project_id: resolved.projectId, created_by_id: a.userId,
    }).select('id,name,parent_key,project_id,created_at').single();
    if (error) return err(error.message, 403);
    return NextResponse.json({ ok: true, folder: {
      id: data.id, key: customKey(data.id), name: data.name,
      parentKey: data.parent_key || '', projectId: data.project_id,
    } }, { status: 201 });
  }

  if (action === 'renameFolder') {
    const cg = capabilityGuard(a.role, 'files.upload'); if (cg) return cg;
    const name = safeFolderName(b.name);
    if (!name) return err('Give the folder a name');
    const id = String(b.id || '');
    if (!(await resolveFolderKey(a, scope, customKey(id)))) return err('Folder not found', 404);
    const { data, error } = await sb.from('document_folders').update({ name, updated_at: new Date().toISOString() })
      .eq('id', id).eq('organization_id', a.orgId).select('id').maybeSingle();
    if (error) return err(error.message, 403);
    if (!data) return err('Folder not found', 404);
    return NextResponse.json({ ok: true });
  }

  if (action === 'deleteFolder') {
    const cg = capabilityGuard(a.role, 'files.delete'); if (cg) return cg;
    const id = String(b.id || '');
    const key = customKey(id);
    if (!(await resolveFolderKey(a, scope, key))) return err('Folder not found', 404);
    const { data: folder } = await sb.from('document_folders').select('id').eq('id', id).eq('organization_id', a.orgId).maybeSingle();
    if (!folder) return err('Folder not found', 404);
    const [children, files] = await Promise.all([
      sb.from('document_folders').select('id').eq('organization_id', a.orgId).eq('parent_key', key).limit(1),
      sb.from('attachments').select('id').eq('organization_id', a.orgId).eq('folder_key', key).limit(1),
    ]);
    if ((children.data || []).length || (files.data || []).length) return err('Move or remove the items inside this folder first', 409);
    const { error } = await sb.from('document_folders').delete().eq('id', id).eq('organization_id', a.orgId);
    if (error) return err(error.message, 403);
    return NextResponse.json({ ok: true });
  }

  if (action === 'moveFile') {
    const cg = capabilityGuard(a.role, 'files.upload'); if (cg) return cg;
    const fileId = String(b.fileId || '');
    const folderKey = String(b.folderKey || '');
    const resolved = await resolveFolderKey(a, scope, folderKey);
    if (!resolved) return err('Choose a folder you can access', 403);
    const { data: att } = await sb.from('attachments')
      .select('id,record_id,document_key,folder_key').eq('id', fileId).eq('organization_id', a.orgId).maybeSingle();
    if (!att) return err('File not found', 404);
    if (scope.kind) {
      const ids = await allowedRecordIds(scope, a.orgId, visibleResources(a));
      if (!ids.has(String(att.record_id))) return err('File not found', 404);
    }
    // Keep every revision of a document together in its new folder.
    let q = sb.from('attachments').update({ folder_key: folderKey }).eq('organization_id', a.orgId);
    q = att.document_key ? q.eq('document_key', att.document_key) : q.eq('id', fileId);
    const { error } = await q;
    if (error) return err(error.message, 403);
    return NextResponse.json({ ok: true });
  }

  return err('Unknown action');
}
