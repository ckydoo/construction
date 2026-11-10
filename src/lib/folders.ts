/* Server-side folder resolution. A folder key is only usable when the job it
 * belongs to is visible to the caller, so uploads and folder edits cannot be
 * aimed at another client's or another department's project. */
import { supabase } from './supabase';
import { getRecord } from './records';
import type { AuthCtx } from './auth';
import type { Scope } from './access';
import { keyParts, documentTypeForBucket } from './document-folders';

export type ResolvedFolder = { projectId: string; name: string; documentType: string };

export async function resolveFolderKey(a: AuthCtx, scope: Scope, key: string): Promise<ResolvedFolder | null> {
  const p = keyParts(key);
  if (p.kind === 'root') return null;
  if (p.kind === 'project' || p.kind === 'bucket') {
    const rec = await getRecord(a.orgId, 'projects', p.projectId!, scope);
    return rec ? { projectId: p.projectId!, name: String(rec.title || rec.name || 'Job'), documentType: documentTypeForBucket(p.bucket) } : null;
  }
  const sb = await supabase();
  const { data: folder } = await sb.from('document_folders')
    .select('id,name,project_id,parent_key')
    .eq('id', p.id).eq('organization_id', a.orgId).maybeSingle();
  if (!folder) return null;

  let projectId = folder.project_id as string | null;
  let documentType = 'Other';
  let cursor = folder.parent_key || '';
  for (let guard = 0; cursor && guard < 12 && (!projectId || documentType === 'Other'); guard++) {
    const q = keyParts(cursor);
    if (q.bucket && documentType === 'Other') documentType = documentTypeForBucket(q.bucket);
    if (q.projectId) { projectId = q.projectId; break; }
    const { data: parent } = await sb.from('document_folders')
      .select('project_id,parent_key').eq('id', q.id).eq('organization_id', a.orgId).maybeSingle();
    if (!parent) break;
    projectId = projectId || parent.project_id;
    cursor = parent.parent_key || '';
  }
  if (!projectId) return null;
  const rec = await getRecord(a.orgId, 'projects', projectId, scope);
  return rec ? { projectId, name: folder.name, documentType } : null;
}
