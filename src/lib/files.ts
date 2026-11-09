/* Supabase Storage conventions. Binaries live in a private bucket; metadata
 * lives in public.attachments (Postgres) with RLS. Local disk is retired. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const DEFAULT_BUCKET = 'buildops-documents';
export const storageBucket = () => (process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;

/** <org-uuid>/<record-id>/<uuid>-<safe-name> — parsed by app_storage_allowed(). */
export function storagePath(orgId: string, recordId: string, storedName: string): string {
  return `${orgId}/${recordId}/${storedName}`;
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._()\- ]/g, '_').slice(0, 160) || 'file';
}

export const revisionLabel = (n: number) => `Rev ${n <= 26 ? String.fromCharCode(64 + n) : 'R' + n}`;
