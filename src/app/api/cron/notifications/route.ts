import { NextResponse } from 'next/server';
import { safeHashEqual } from '@/lib/billing';
import { runNotificationSweep } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = (process.env.NOTIFICATION_CRON_SECRET || process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '').trim();
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (secret) return safeHashEqual(secret, token);
  return process.env.NODE_ENV !== 'production' || process.env.NOTIFICATIONS_QA_MODE === 'true';
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await runNotificationSweep();
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Notification sweep failed' }, { status: 500 });
  }
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
