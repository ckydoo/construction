import { NextResponse } from 'next/server';
import { hasServiceKey, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness + monitoring summary. Public but deliberately uninformative:
 * reports whether the DB is reachable and the last cron heartbeat times.
 * No org/user data, no env details. Use for a browser check or an external
 * probe of your choosing; it does NOT page anyone by itself.
 */
export async function GET() {
  let db: 'up' | 'down' = 'down';
  const heartbeats: Record<string, string | null> = { billing: null, notifications: null };
  try {
    if (hasServiceKey()) {
      const admin = supabaseAdmin();
      const { error } = await admin.from('monitor_events').select('id', { head: true, count: 'exact' }).limit(1);
      if (!error) {
        db = 'up';
        for (const source of ['billing', 'notifications'] as const) {
          const { data } = await admin
            .from('monitor_events')
            .select('created_at')
            .eq('kind', 'heartbeat')
            .eq('source', source)
            .order('created_at', { ascending: false })
            .limit(1);
          heartbeats[source] = (data && data[0] && data[0].created_at) || null;
        }
      }
    }
  } catch {
    db = 'down';
  }
  const ok = db === 'up';
  return NextResponse.json(
    { ok, db, heartbeats, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
