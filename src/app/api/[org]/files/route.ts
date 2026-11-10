import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getResource } from '@/lib/resources';
import { writeGuard, readGuard, capabilityGuard } from '@/lib/guard';
import { buildScope, visibleResources, allowedRecordIds } from '@/lib/access';
import { getRecord, createRecord, logActivity } from '@/lib/records';
import { resolveFolderKey } from '@/lib/folders';
import { fetchAll } from '@/lib/fetch';
import { attachmentView } from '@/lib/views';
import { MAX_FILE_BYTES, safeFileName, storageBucket, storagePath, revisionLabel } from '@/lib/files';

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 }); }
  const file = form.get('file');
  let recordId = String(form.get('recordId') || '');
  let resource = String(form.get('resource') || '');
  const folderKey = String(form.get('folderKey') || '');
  const supersedesId = String(form.get('supersedesId') || '');
  const note = String(form.get('note') || '').slice(0, 500);
  if (!(file instanceof File)) return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File is larger than 12 MB' }, { status: 413 });

  const scope = await buildScope(a);
  const sb = await supabase();

  // Library upload: create a controlled document record in the target folder's
  // job, then attach the file to that record. This keeps Storage RLS, revision
  // chains and record-level permissions identical to record attachments.
  if (folderKey && !recordId) {
    const resolved = await resolveFolderKey(a, scope, folderKey);
    if (!resolved) return NextResponse.json({ error: 'Choose a folder you can access' }, { status: 403 });
    resource = 'documents';
    const def = getResource(resource);
    if (!def) return NextResponse.json({ error: 'Documents module is not enabled' }, { status: 404 });
    const g = writeGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'files.upload'); if (g) return g;
    const safe = safeFileName(file.name);
    const created = await createRecord(a.orgId, a.userId, a.name, def, {
      name: safe, projectId: resolved.projectId, type: resolved.documentType,
      fileName: safe, revision: 'A', issuedDate: new Date().toISOString().slice(0, 10), status: 'CURRENT',
    });
    if (!created.ok) return NextResponse.json({ error: 'Could not create the document register entry', errors: created.errors }, { status: 400 });
    recordId = created.row.id;
  }

  if (!recordId || !resource) return NextResponse.json({ error: 'recordId and resource are required' }, { status: 400 });
  const def = getResource(resource);
  if (!def) return NextResponse.json({ error: 'Unknown or disabled resource' }, { status: 404 });
  const g = writeGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'files.upload'); if (g) return g;
  if (!(await getRecord(a.orgId, resource, recordId, scope))) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  const bucket = storageBucket();
  let documentKey: string = randomUUID(), revision = 1, previousLatest: string[] = [];
  let resolvedFolderKey = folderKey || null;
  if (supersedesId) {
    const { data: parent } = await sb.from('attachments').select('*')
      .eq('id', supersedesId).eq('organization_id', a.orgId).eq('record_id', recordId).maybeSingle();
    if (!parent) return NextResponse.json({ error: 'Parent attachment not found' }, { status: 404 });
    documentKey = parent.document_key || parent.id;
    resolvedFolderKey = resolvedFolderKey || parent.folder_key || null;
    if (!parent.document_key) await sb.from('attachments').update({ document_key: documentKey }).eq('id', parent.id);
    const { data: siblings } = await sb.from('attachments').select('id,revision,is_latest')
      .eq('organization_id', a.orgId).eq('document_key', documentKey);
    revision = Math.max(0, ...(siblings || []).map((s: any) => s.revision || 1)) + 1;
    previousLatest = (siblings || []).filter((s: any) => s.is_latest).map((s: any) => s.id);
    if ((siblings || []).length) await sb.from('attachments').update({ is_latest: false })
      .eq('organization_id', a.orgId).eq('document_key', documentKey);
  }

  const safe = safeFileName(file.name);
  const storedName = `${randomUUID()}-${safe}`;
  const path = storagePath(a.orgId, recordId, storedName);
  // Metadata first: the Storage RLS helper resolves the owning record from the
  // object path via public.attachments, so the row must exist before upload.
  const { data: att, error: metaErr } = await sb.from('attachments').insert({
    organization_id: a.orgId, record_id: recordId, resource,
    file_name: safe, stored_name: path, mime: file.type || 'application/octet-stream',
    size: file.size, uploaded_by_id: a.userId, uploaded_by_name: a.name,
    document_key: documentKey, revision, revision_label: revisionLabel(revision),
    is_latest: true, note: note || null, folder_key: resolvedFolderKey,
  }).select('*').single();
  if (metaErr) return NextResponse.json({ error: metaErr.message }, { status: 403 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await sb.storage.from(bucket).upload(path, bytes, {
    contentType: file.type || 'application/octet-stream', upsert: false,
  });
  if (uploadErr) {
    await sb.from('attachments').delete().eq('id', att.id);
    if (previousLatest.length) await sb.from('attachments').update({ is_latest: true }).in('id', previousLatest);
    return NextResponse.json({ error: `Upload blocked: ${uploadErr.message}` }, { status: 403 });
  }

  const rec = await getRecord(a.orgId, resource, recordId);
  await logActivity(a.orgId, a.userId, a.name, 'UPLOAD', resource,
    revision > 1 ? `Uploaded ${revisionLabel(revision)} of “${safe}” on ${rec?.title || rec?.number}` : `Attached “${safe}” to ${rec?.title || rec?.number}`);
  return NextResponse.json({ attachment: attachmentView(att) }, { status: 201 });
}

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const u = new URL(req.url);
  const recordId = u.searchParams.get('recordId') || '';
  const resource = u.searchParams.get('resource') || '';
  if (resource) { const g = readGuard(a.config, a.role, resource); if (g) return g; }
  const visible = visibleResources(a);
  if (!visible.length) return NextResponse.json({ files: [] });
  let rows = await fetchAll('attachments', q => q
    .eq('organization_id', a.orgId).in('resource', visible));
  if (resource) rows = rows.filter(r => r.resource === resource);
  const scope = await buildScope(a);
  if (scope.kind) {
    const ids = await allowedRecordIds(scope, a.orgId, visible);
    const folderCache = new Map<string, boolean>();
    const visibleRows: any[] = [];
    for (const r of rows) {
      if (recordId && r.record_id !== recordId) continue;
      if (!ids.has(r.record_id)) continue;
      if (r.folder_key) {
        const key = String(r.folder_key);
        let ok = folderCache.get(key);
        if (ok === undefined) { ok = !!(await resolveFolderKey(a, scope, key)); folderCache.set(key, ok); }
        if (!ok) continue;
      }
      visibleRows.push(r);
    }
    rows = visibleRows;
  } else if (recordId) {
    rows = rows.filter(r => r.record_id === recordId);
  }
  rows.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  return NextResponse.json({ files: rows.slice(0, 200).map(attachmentView) });
}
