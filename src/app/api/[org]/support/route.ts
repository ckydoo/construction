import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { adminUserIds, notifyUsersByCategory } from '@/lib/notification-service';
import {
  SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES,
  type SupportCategory, type SupportPriority, type SupportStatus,
} from '@/lib/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ org: string }> };
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => {
  const v = String(value ?? '').trim().toUpperCase() as T;
  return values.includes(v) ? v : fallback;
};
const canManage = (role: string) => role === 'OWNER' || role === 'ADMIN';

export async function GET(req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = await supabase();
  const ticketId = new URL(req.url).searchParams.get('ticket');

  const ticketsResult = await sb.from('support_tickets')
    .select('*').eq('organization_id', a.orgId)
    .order('created_at', { ascending: false }).limit(200);
  if (ticketsResult.error) return NextResponse.json({ error: ticketsResult.error.message }, { status: 500 });

  let comments: any[] = [];
  if (ticketId) {
    const commentsResult = await sb.from('support_ticket_comments')
      .select('*').eq('organization_id', a.orgId).eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }).limit(200);
    if (commentsResult.error) return NextResponse.json({ error: commentsResult.error.message }, { status: 500 });
    comments = commentsResult.data || [];
  }

  // Only workspace managers need the assignee directory. RLS also protects
  // memberships, but avoid exposing the full team list to ordinary reporters.
  let memberQuery = sb.from('memberships').select('user_id, role')
    .eq('organization_id', a.orgId);
  if (!canManage(a.role)) memberQuery = memberQuery.eq('user_id', a.userId);
  const membersResult = await memberQuery;
  if (membersResult.error) return NextResponse.json({ error: membersResult.error.message }, { status: 500 });
  const memberRows: any[] = membersResult.data || [];
  const ids = memberRows.map(m => m.user_id).filter(Boolean);
  const profilesResult = ids.length
    ? await sb.from('profiles').select('id, name, email').in('id', ids)
    : { data: [], error: null };
  if (profilesResult.error) return NextResponse.json({ error: profilesResult.error.message }, { status: 500 });
  const profileById = new Map((profilesResult.data || []).map((p: any) => [p.id, p]));
  const users = memberRows.map(m => ({
    id: m.user_id,
    name: (profileById.get(m.user_id) as any)?.name || 'User',
    email: (profileById.get(m.user_id) as any)?.email || '',
    role: m.role,
  })).sort((x, y) => x.name.localeCompare(y.name));

  return NextResponse.json({
    tickets: ticketsResult.data || [],
    comments,
    users,
    canManage: canManage(a.role),
    user: { id: a.userId, name: a.name, email: a.email, role: a.role },
    constants: {
      categories: SUPPORT_CATEGORIES,
      priorities: SUPPORT_PRIORITIES,
      statuses: SUPPORT_STATUSES,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = await supabase();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const title = clean(body.title, 160);
  const description = clean(body.description, 5000);
  const category: SupportCategory = oneOf(SUPPORT_CATEGORIES, body.category, 'BUG');
  const priority: SupportPriority = oneOf(SUPPORT_PRIORITIES, body.priority, 'MEDIUM');
  const pageUrl = clean(body.pageUrl, 500) || null;
  if (title.length < 4 || description.length < 10) {
    return NextResponse.json({ error: 'Add a short title and a description of at least 10 characters.' }, { status: 400 });
  }

  const numberResult = await sb.rpc('app_support_ticket_no', { p_org: a.orgId });
  if (numberResult.error || !numberResult.data) {
    return NextResponse.json({ error: numberResult.error?.message || 'Could not allocate a ticket number.' }, { status: 500 });
  }

  const insert = await sb.from('support_tickets').insert({
    organization_id: a.orgId,
    ticket_no: String(numberResult.data),
    reporter_id: a.userId,
    reporter_name: a.name,
    reporter_email: a.email,
    title,
    description,
    category,
    priority,
    status: 'OPEN',
    assigned_to: null,
    assigned_to_name: null,
    page_url: pageUrl,
    metadata: {
      submittedFrom: 'in_app_support',
      userAgent: clean(req.headers.get('user-agent'), 300),
      pageUrl,
    },
  }).select('*').single();
  if (insert.error) return NextResponse.json({ error: insert.error.message }, { status: insert.error.code === '42501' ? 403 : 500 });

  const ticket = insert.data;
  const href = `/support?ticket=${ticket.id}`;
  // Role-targeted, deduplicated in-app alert. Workspace activity is never emailed.
  await notifyUsersByCategory(a.orgId, (await adminUserIds(a.orgId)).filter(id => id !== a.userId), 'support',
    `New support ticket ${ticket.ticket_no}`,
    `${title} · ${priority} priority · reported by ${a.name}`, 'ALERT', href, `support-new:${ticket.id}`);

  return NextResponse.json({ ticket }, { status: 201 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManage(a.role)) return NextResponse.json({ error: 'Only owners and administrators can manage ticket status, priority and assignees.' }, { status: 403 });
  const sb = await supabase();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const ticketId = clean(body.ticketId, 100);
  if (!ticketId) return NextResponse.json({ error: 'Choose a ticket.' }, { status: 400 });

  const existing = await sb.from('support_tickets').select('*')
    .eq('organization_id', a.orgId).eq('id', ticketId).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });

  const patch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status: SupportStatus = oneOf(SUPPORT_STATUSES, body.status, existing.data.status as SupportStatus);
    const now = new Date().toISOString();
    patch.status = status;
    if (status === 'RESOLVED') { patch.resolved_at = now; patch.closed_at = null; }
    else if (status === 'CLOSED') { patch.resolved_at = existing.data.resolved_at || now; patch.closed_at = now; }
    else { patch.resolved_at = null; patch.closed_at = null; }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
    patch.priority = oneOf(SUPPORT_PRIORITIES, body.priority, existing.data.priority as SupportPriority);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'assignedTo')) {
    const assigned = clean(body.assignedTo, 100);
    if (!assigned) {
      patch.assigned_to = null; patch.assigned_to_name = null;
    } else {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assigned))
        return NextResponse.json({ error: 'Invalid assignee.' }, { status: 400 });
      const membership = await sb.from('memberships').select('user_id')
        .eq('organization_id', a.orgId).eq('user_id', assigned).maybeSingle();
      if (membership.error) return NextResponse.json({ error: membership.error.message }, { status: 500 });
      if (!membership.data) return NextResponse.json({ error: 'Assignee must belong to this workspace.' }, { status: 400 });
      const profile = await sb.from('profiles').select('name').eq('id', assigned).maybeSingle();
      patch.assigned_to = assigned;
      patch.assigned_to_name = clean(profile.data?.name || 'User', 120);
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'No ticket changes supplied.' }, { status: 400 });

  const result = await sb.from('support_tickets').update(patch)
    .eq('organization_id', a.orgId).eq('id', ticketId).select('*').single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: result.error.code === '42501' ? 403 : 500 });

  const changed = Object.keys(patch).map(k => k.replace(/_/g, ' ')).join(', ');
  const href = `/support?ticket=${ticketId}`;
  const recipients = Array.from(new Set([
    String(existing.data.reporter_id || ''), String(result.data.assigned_to || ''), ...(await adminUserIds(a.orgId)),
  ])).filter(id => id && id !== a.userId);
  await notifyUsersByCategory(a.orgId, recipients, 'support',
    `Support ticket ${result.data.ticket_no} updated`,
    `${a.name} changed ${changed}.`, 'INFO', href, `support-update:${result.data.id}:${result.data.updated_at}`);
  return NextResponse.json({ ticket: result.data });
}
