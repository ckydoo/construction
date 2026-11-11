/* Quiet reminder engine. Derives high-signal work from existing registers and
 * writes one deduplicated, role-targeted in-app notification per state change.
 * Workspace reminders and summaries are never emailed under the critical-only
 * policy; the daily sweep also retries queued essential account/billing email. */
import { supabaseAdmin } from './supabase';
import { toRow } from './records';
import { WORKFLOW_RULES } from './workflow';
import { deliverPendingEmails } from './email';
import { inAppAllowed, type NotificationPreferencesRow } from './notification-preferences';
import {
  adminUserIds, notifyUsersByCategory, roleUserIds,
} from './notification-service';

const DAY = 24 * 60 * 60 * 1000;
const DEADLINE_KEYS = new Set(['requiredDate', 'deliveryDate', 'dueDate', 'startDate', 'decisionDate']);
const APPROVAL_RESOURCES = new Set([
  'timesheets', 'changeOrders', 'requisitions', 'purchaseOrders', 'expenses',
  'leaveRequests', 'submittals', 'paymentApps',
]);
const RULE_MAP = new Map(WORKFLOW_RULES.map(r => [r.resource, r]));

type OrgRow = { id: string; slug: string; name: string; config: any };
type PendingItem = {
  orgId: string; orgSlug: string; orgName: string;
  resource: string; id: string; title: string; ruleLabel: string; singular: string;
  due: Date; overdue: boolean; dueSoon: boolean; escalated: boolean; href: string;
  roles: string[];
};

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
function addDays(d: Date, days: number): Date { return new Date(d.getTime() + days * DAY); }
function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function friendlyDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
function orgResources(org: OrgRow): Set<string> {
  let raw: any = org.config || {};
  if (typeof raw === 'string') { try { raw = JSON.parse(raw || '{}'); } catch { raw = {}; } }
  return new Set(Array.isArray(raw?.resources) ? raw.resources.map(String) : []);
}

async function fetchAllAdmin(table: string, apply: (q: any) => any, columns = '*', orderColumn = 'id'): Promise<any[]> {
  const admin = supabaseAdmin();
  const out: any[] = [];
  const size = 1000;
  for (let start = 0; start <= 50000; start += size) {
    const q = apply(admin.from(table).select(columns)).order(orderColumn, { ascending: true }).range(start, start + size - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

async function collectState(now: Date) {
  const orgs = await fetchAllAdmin('organizations', q => q, 'id,slug,name,config') as OrgRow[];
  const orgMap = new Map(orgs.map(o => [o.id, o]));
  const resources = WORKFLOW_RULES.map(r => r.resource);
  const pendingStatuses = Array.from(new Set(WORKFLOW_RULES.flatMap(r => r.pending)));
  const [records, support] = await Promise.all([
    fetchAllAdmin('records', q => q.in('resource', resources).in('status', pendingStatuses).is('deleted_at', null),
      'id,organization_id,resource,status,title,number,data,created_at,updated_at'),
    fetchAllAdmin('support_tickets', q => q.in('status', ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER']),
      'id,organization_id,ticket_no,title,status,assigned_to,reporter_id,updated_at,created_at'),
  ]);
  const items: PendingItem[] = [];
  const nowMs = now.getTime();
  for (const rec of records) {
    const org = orgMap.get(rec.organization_id);
    const rule = RULE_MAP.get(String(rec.resource));
    if (!org || !rule || !orgResources(org).has(String(rec.resource)) || !rule.pending.includes(String(rec.status || ''))) continue;
    const row = toRow(rec);
    let anchor: Date | null = null;
    let anchorIsDeadline = false;
    for (const key of rule.dateKeys) {
      const d = parseDate(row[key]);
      if (d) { anchor = d; anchorIsDeadline = DEADLINE_KEYS.has(key); break; }
    }
    if (!anchor) anchor = parseDate(row.createdAt) || now;
    const due = anchorIsDeadline ? anchor : addDays(anchor, rule.slaDays);
    const overdue = due.getTime() < nowMs;
    const dueSoon = !overdue && due.getTime() - nowMs <= 2 * DAY;
    const escalated = overdue && nowMs - due.getTime() > 3 * DAY;
    if (!overdue && !dueSoon) continue;
    items.push({
      orgId: org.id, orgSlug: org.slug, orgName: org.name,
      resource: String(rec.resource), id: String(rec.id),
      title: String(row.title || row.name || row.subject || row.number || rule.singular),
      ruleLabel: rule.label, singular: rule.singular, due, overdue, dueSoon, escalated,
      href: `/m/${rec.resource}?open=${encodeURIComponent(String(rec.id))}`,
      roles: Array.from(new Set(rule.actions.flatMap(a => a.roles))),
    });
  }
  return { orgs, orgMap, items, support, nowMs };
}

export async function runReminderSweep(now = new Date()): Promise<{ created: number; candidates: number }> {
  const { orgMap, items, support, nowMs } = await collectState(now);
  let created = 0;
  const adminCache = new Map<string, string[]>();
  const roleCache = new Map<string, string[]>();
  const adminsFor = async (orgId: string) => {
    if (!adminCache.has(orgId)) adminCache.set(orgId, await adminUserIds(orgId));
    return adminCache.get(orgId) || [];
  };
  const rolesFor = async (orgId: string, resource: string, roles: string[]) => {
    const key = `${orgId}:${resource}`;
    if (!roleCache.has(key)) roleCache.set(key, await roleUserIds(orgId, roles));
    return roleCache.get(key) || [];
  };

  for (const item of items) {
    const dueKey = dayKey(item.due);
    const state = item.escalated ? 'escalated' : item.overdue ? 'overdue' : 'due_soon';
    const title = item.escalated ? 'Action is still waiting'
      : item.overdue ? 'Action overdue' : 'Coming up soon';
    const body = item.escalated
      ? `${item.title} (${item.ruleLabel}) has been waiting since ${friendlyDate(item.due)}.`
      : item.overdue
        ? `${item.title} (${item.ruleLabel}) was due ${friendlyDate(item.due)}.`
        : `${item.title} (${item.ruleLabel}) is due ${friendlyDate(item.due)}.`;
    const kind = item.escalated || item.overdue ? 'ALERT' : 'WARNING';
    const category = APPROVAL_RESOURCES.has(item.resource) ? 'approvals' : 'tasks';
    const eventKey = `reminder:${state}:${item.resource}:${item.id}:${dueKey}`;
    if (await notifyUsersByCategory(item.orgId, await rolesFor(item.orgId, item.resource, item.roles), category,
      title, body, kind, item.href, eventKey, { respectQuietHours: true, now })) created++;
  }

  for (const ticket of support) {
    const org = orgMap.get(ticket.organization_id);
    if (!org) continue;
    const updated = parseDate(ticket.updated_at) || parseDate(ticket.created_at) || now;
    const waitingDays = Math.floor((nowMs - updated.getTime()) / DAY);
    const href = `/support?ticket=${encodeURIComponent(ticket.id)}`;
    const recipients = Array.from(new Set([
      String(ticket.reporter_id || ''), String(ticket.assigned_to || ''), ...(await adminsFor(org.id)),
    ])).filter(Boolean);
    if (waitingDays >= 2) {
      const body = `${ticket.ticket_no} · ${ticket.title} has been waiting for an update since ${friendlyDate(updated)}.`;
      if (await notifyUsersByCategory(org.id, recipients, 'support', 'Support ticket needs a reply', body,
        'WARNING', href, `support-waiting:${ticket.id}:${dayKey(updated)}`, { respectQuietHours: true, now })) created++;
    }
    if (!ticket.assigned_to && nowMs - (parseDate(ticket.created_at)?.getTime() || nowMs) >= DAY) {
      const body = `${ticket.ticket_no} · ${ticket.title} is still unassigned.`;
      if (await notifyUsersByCategory(org.id, await adminsFor(org.id), 'support', 'Support ticket needs an owner', body,
        'WARNING', href, `support-unassigned:${ticket.id}`, { respectQuietHours: true, now })) created++;
    }
  }
  return { created, candidates: items.length + support.length };
}

type OrgSummary = { org: OrgRow; total: number; overdue: number; dueSoon: number; sample: string[] };

export async function runDigestSweep(now = new Date()): Promise<{ created: number; recipients: number }> {
  const { orgs, items, support } = await collectState(now);
  const orgMap = new Map(orgs.map(o => [o.id, o]));
  const summaries = new Map<string, OrgSummary>();
  for (const item of items) {
    const org = orgMap.get(item.orgId); if (!org) continue;
    const s = summaries.get(org.id) || { org, total: 0, overdue: 0, dueSoon: 0, sample: [] };
    s.total++; if (item.overdue) s.overdue++; if (item.dueSoon) s.dueSoon++;
    if (s.sample.length < 3) s.sample.push(item.title);
    summaries.set(org.id, s);
  }
  for (const ticket of support) {
    const org = orgMap.get(ticket.organization_id); if (!org) continue;
    const s = summaries.get(org.id) || { org, total: 0, overdue: 0, dueSoon: 0, sample: [] };
    s.total++;
    if (s.sample.length < 3) s.sample.push(`${ticket.ticket_no} · ${ticket.title}`);
    summaries.set(org.id, s);
  }
  if (!summaries.size) return { created: 0, recipients: 0 };

  const prefs = await fetchAllAdmin('notification_preferences', q => q.eq('in_app_digest', true), '*', 'user_id') as NotificationPreferencesRow[];
  const memberships = await fetchAllAdmin('memberships', q => q, 'id,organization_id,user_id');
  const byUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = byUser.get(m.user_id) || [];
    list.push(m.organization_id);
    byUser.set(m.user_id, list);
  }
  const date = dayKey(now);
  const weekly = now.getUTCDay() === 1;
  let created = 0;
  let recipients = 0;
  for (const pref of prefs) {
    const frequency = pref.digest_frequency === 'weekly' ? 'weekly' : 'daily';
    if (pref.digest_frequency === 'off' || (frequency === 'weekly' && !weekly)) continue;
    if (!inAppAllowed(pref, 'digest', now, true)) continue;
    const userOrgs = (byUser.get(pref.user_id) || []).map(id => summaries.get(id)).filter(Boolean) as OrgSummary[];
    if (!userOrgs.length) continue;
    const total = userOrgs.reduce((n, s) => n + s.total, 0);
    const overdue = userOrgs.reduce((n, s) => n + s.overdue, 0);
    const dueSoon = userOrgs.reduce((n, s) => n + s.dueSoon, 0);
    if (!total) continue;
    recipients++;
    const first = userOrgs[0].org;
    const sample = userOrgs.flatMap(s => s.sample).slice(0, 2);
    const body = `You have ${total} open action${total === 1 ? '' : 's'} across your workspaces. ${overdue} late · ${dueSoon} due soon.${sample.length ? ` ${sample.join(' · ')}` : ''}`;
    if (await notifyUsersByCategory(first.id, [pref.user_id], 'digest',
      `Your MYLA ${frequency} summary`, body, 'INFO', '/my-work',
      `in-app-digest:${frequency}:${date}:${pref.user_id}`, { respectQuietHours: true, now })) created++;
  }
  return { created, recipients };
}

export async function runNotificationSweep(): Promise<{
  emails: { configured: boolean; sent: number; attempted: number; remaining: number };
  reminders: { created: number; candidates: number };
  digests: { created: number; recipients: number };
}> {
  const now = new Date();
  const emails = await deliverPendingEmails();
  const reminders = await runReminderSweep(now);
  const digests = await runDigestSweep(now);
  try {
    const admin = supabaseAdmin();
    await admin.from('notification_dedupe').delete().lt('created_at', new Date(Date.now() - 30 * DAY).toISOString());
  } catch { /* cleanup is best effort */ }
  return { emails, reminders, digests };
}
