/* Converts snake_case Postgres rows to the camelCase JSON shapes the existing
 * UI components already consume. Keeps the frontend unchanged after the
 * Prisma → Supabase rewrite. */

export const commentView = (c: any) => ({
  id: c.id, organizationId: c.organization_id, recordId: c.record_id,
  authorId: c.author_id, authorName: c.author_name, body: c.body, createdAt: c.created_at,
});

export const attachmentView = (a: any) => ({
  id: a.id, organizationId: a.organization_id, recordId: a.record_id, resource: a.resource,
  fileName: a.file_name, storedName: a.stored_name, mime: a.mime, size: a.size,
  uploadedById: a.uploaded_by_id, uploadedByName: a.uploaded_by_name,
  documentKey: a.document_key, revision: a.revision, revisionLabel: a.revision_label,
  isLatest: a.is_latest, note: a.note, folderKey: a.folder_key ?? null, createdAt: a.created_at,
});

export const auditView = (a: any) => ({
  id: a.id, organizationId: a.organization_id, userId: a.user_id, actor: a.actor,
  action: a.action, resource: a.resource, detail: a.detail, createdAt: a.created_at,
});

export const notificationView = (n: any) => ({
  id: n.id, organizationId: n.organization_id, userId: n.user_id, title: n.title,
  body: n.body, kind: n.kind, href: n.href, read: n.read, createdAt: n.created_at,
});

export const walletTxView = (t: any) => ({
  id: t.id, walletId: t.wallet_id, clientId: t.client_id, projectId: t.project_id,
  kind: t.kind, amountCents: t.amount_cents, amount: t.amount_cents / 100,
  balanceCents: t.balance_cents, balanceAfter: t.balance_cents / 100,
  currency: t.currency, reference: t.reference, method: t.method, note: t.note,
  actorName: t.actor_name, reversesId: t.reverses_id,
  reversedAt: t.reversed_at, createdAt: t.created_at,
});
