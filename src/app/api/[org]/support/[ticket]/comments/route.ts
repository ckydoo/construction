import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { adminUserIds, notifyUsersByCategory } from '@/lib/notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ org: string; ticket: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, ticket } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = await supabase();
  const result = await sb.from('support_ticket_comments').select('*')
    .eq('organization_id', a.orgId).eq('ticket_id', ticket)
    .order('created_at', { ascending: true }).limit(200);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ comments: result.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Ctx) {
  const { org, ticket } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = await supabase();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const text = String(body.body ?? '').trim().slice(0, 3000);
  if (text.length < 2) return NextResponse.json({ error: 'Write a short update before posting.' }, { status: 400 });

  // RLS on support_ticket_comments checks both org membership and ticket visibility.
  const result = await sb.from('support_ticket_comments').insert({
    organization_id: a.orgId,
    ticket_id: ticket,
    author_id: a.userId,
    author_name: String(a.name || 'User').slice(0, 120),
    body: text,
  }).select('*').single();
  if (result.error) {
    const status = result.error.code === '42501' || result.error.code === '23503' ? 403 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  const ticketRow = await sb.from('support_tickets')
    .select('ticket_no,title,reporter_id,assigned_to')
    .eq('organization_id', a.orgId).eq('id', ticket).maybeSingle();
  const href = `/support?ticket=${ticket}`;
  const recipients = Array.from(new Set([
    String(ticketRow.data?.reporter_id || ''), String(ticketRow.data?.assigned_to || ''), ...(await adminUserIds(a.orgId)),
  ])).filter(id => id && id !== a.userId);
  const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  await notifyUsersByCategory(a.orgId, recipients, 'support',
    `New reply on ${ticketRow.data?.ticket_no || 'a support ticket'}`,
    `${a.name} replied: ${preview}`, 'INFO', href, `support-reply:${result.data.id}`);
  return NextResponse.json({ comment: result.data }, { status: 201 });
}
