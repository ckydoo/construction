/* In-system document previews for customer-facing records. The preview is a
 * server-rendered HTML version of the generated PDF, so it works in an iframe
 * without depending on a browser PDF plug-in. */
export const PREVIEWABLE_RESOURCE_IDS: ReadonlySet<string> = new Set(['estimates', 'arInvoices']);

export function isPreviewableResource(resource: string): boolean {
  return PREVIEWABLE_RESOURCE_IDS.has(resource);
}

export function documentPreviewHref(org: string, resource: string, id: string): string {
  return `/preview/${org}/${resource}/${encodeURIComponent(id)}`;
}
