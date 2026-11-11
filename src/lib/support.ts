/* Shared, client-safe definitions for the dedicated support desk. These are
 * deliberately outside the generic records catalogue: support tickets must not
 * change a workspace's starter section/list counts. */

export const SUPPORT_CATEGORIES = ['BUG', 'ISSUE', 'QUESTION', 'FEATURE_REQUEST', 'BILLING', 'OTHER'] as const;
export const SUPPORT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'] as const;

export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export type SupportPriority = typeof SUPPORT_PRIORITIES[number];
export type SupportStatus = typeof SUPPORT_STATUSES[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  BUG: 'Bug', ISSUE: 'Issue', QUESTION: 'Question',
  FEATURE_REQUEST: 'Feature request', BILLING: 'Billing', OTHER: 'Other',
};
export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
};
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_ON_USER: 'Waiting on you',
  RESOLVED: 'Resolved', CLOSED: 'Closed',
};

export type SupportTicket = {
  id: string; organization_id: string; ticket_no: string;
  reporter_id: string | null; reporter_name: string; reporter_email: string;
  title: string; description: string;
  category: SupportCategory; priority: SupportPriority; status: SupportStatus;
  assigned_to: string | null; assigned_to_name: string | null;
  page_url: string | null; metadata: Record<string, any>;
  created_at: string; updated_at: string; resolved_at: string | null; closed_at: string | null;
};
export type SupportComment = {
  id: string; organization_id: string; ticket_id: string;
  author_id: string | null; author_name: string; body: string; created_at: string;
};
export type SupportUser = { id: string; name: string; email: string; role: string };

export function supportLabel(value: string): string {
  return String(value || '').replace(/_/g, ' ').toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase()) || '—';
}
export function supportTone(value: string): string {
  if (value === 'RESOLVED' || value === 'CLOSED' || value === 'LOW') return 'green';
  if (value === 'IN_PROGRESS' || value === 'MEDIUM') return 'blue';
  if (value === 'WAITING_ON_USER' || value === 'HIGH' || value === 'BILLING') return 'amber';
  if (value === 'CRITICAL' || value === 'BUG') return 'red';
  if (value === 'FEATURE_REQUEST') return 'violet';
  return 'slate';
}
