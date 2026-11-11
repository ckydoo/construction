import { NextResponse } from 'next/server';
import { markUnsubscribed } from '@/lib/notification-preferences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const ok = await markUnsubscribed(token);
  return NextResponse.redirect(new URL(`/notifications/unsubscribe?done=${ok ? '1' : '0'}`, req.url));
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get('token') || '';
  if (!token) {
    const body = await req.json().catch(() => ({}));
    token = String(body.token || '').trim();
  }
  const ok = await markUnsubscribed(token);
  if ((req.headers.get('content-type') || '').includes('application/json'))
    return NextResponse.json({ ok, message: ok ? 'Optional emails are now off.' : 'This link is no longer valid.' });
  return new NextResponse(ok ? 'Optional emails are now off.' : 'This link is no longer valid.', {
    status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
