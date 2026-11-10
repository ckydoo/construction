/* Document library folder keys. Automatic folders are derived from jobs and
 * controlled-document types; custom folders are stored in public.document_folders
 * and can be nested under any automatic folder or another custom folder.
 * Keys are plain strings so a custom folder can point at a derived folder too. */
export const AUTO_BUCKETS = [
  { key: 'drawings', label: 'Drawings', icon: 'FileText', types: ['Drawing', 'Specification'] },
  { key: 'contracts', label: 'Contracts', icon: 'FileSignature', types: ['Contract', 'Correspondence'] },
  { key: 'site-photos', label: 'Site photos', icon: 'Camera', types: ['Photo set'] },
  { key: 'handover', label: 'Handover', icon: 'PackageCheck', types: ['O&M manual', 'Report', 'Method statement', 'Other'] },
] as const;

export const projectKey = (projectId: string) => `p:${projectId}`;
export const bucketKey = (projectId: string, bucket: string) => `p:${projectId}:${bucket}`;
export const customKey = (id: string) => `f:${id}`;

export function keyParts(key: string): { kind: 'root' | 'project' | 'bucket' | 'custom'; projectId?: string; bucket?: string; id?: string } {
  if (!key) return { kind: 'root' };
  const parts = key.split(':');
  if (parts[0] === 'p' && parts.length >= 2) {
    return parts.length >= 3
      ? { kind: 'bucket', projectId: parts[1], bucket: parts[2] }
      : { kind: 'project', projectId: parts[1] };
  }
  if (parts[0] === 'f') return { kind: 'custom', id: parts.slice(1).join(':') };
  return { kind: 'root' };
}

/** The controlled-document "type" that a folder should stamp on new uploads. */
export function documentTypeForBucket(bucket?: string): string {
  return AUTO_BUCKETS.find(b => b.key === bucket)?.types[0] || 'Other';
}
export function folderDocumentType(key: string): string {
  return documentTypeForBucket(keyParts(key).bucket);
}

export function safeFolderName(name: string): string {
  return String(name || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
}

export type LibraryFolder = {
  key: string; name: string; parentKey: string | null; projectId: string | null;
  custom: boolean; icon?: string; count?: number;
};

export type LibraryFile = {
  id: string; fileName: string; folderKey: string | null; recordId: string; resource: string;
  documentKey: string | null; revision: number; revisionLabel: string; isLatest: boolean;
  size: number; mime: string; uploadedByName: string; createdAt: string; note: string | null;
};

/** Build the folder tree for a workspace. Derived folders are always present. */
export function buildFolderTree(projects: { id: string; name: string }[], custom: {
  id: string; name: string; parent_key: string | null; project_id: string | null;
}[]): { folders: LibraryFolder[]; byKey: Map<string, LibraryFolder> } {
  const folders: LibraryFolder[] = [];
  for (const p of projects) {
    folders.push({ key: projectKey(p.id), name: p.name, parentKey: '', projectId: p.id, custom: false, icon: 'HardHat' });
    for (const b of AUTO_BUCKETS) {
      folders.push({ key: bucketKey(p.id, b.key), name: b.label, parentKey: projectKey(p.id), projectId: p.id, custom: false, icon: b.icon });
    }
  }
  for (const f of custom) {
    folders.push({ key: customKey(f.id), name: f.name, parentKey: f.parent_key || '', projectId: f.project_id, custom: true, icon: 'Folder' });
  }
  const byKey = new Map(folders.map(f => [f.key, f]));
  return { folders, byKey };
}

export function childrenOf(folders: LibraryFolder[], key: string): LibraryFolder[] {
  return folders.filter(f => (f.parentKey || '') === key);
}

export function breadcrumbs(byKey: Map<string, LibraryFolder>, key: string): LibraryFolder[] {
  const out: LibraryFolder[] = [];
  let cursor = key, guard = 0;
  while (cursor && guard++ < 12) {
    const f = byKey.get(cursor);
    if (!f) break;
    out.unshift(f);
    cursor = f.parentKey || '';
  }
  return out;
}
