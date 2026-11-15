/**
 * In-house monitoring (Supabase-backed). No third-party vendor.
 *
 * Writes two kinds of rows to `public.monitor_events`:
 *  - heartbeat: emitted by cron routes after each sweep (success or failure)
 *  - error:     emitted by the Next.js onRequestError hook for server errors
 *
 * Service-role write only (RLS, no client policies). Never throws — monitoring
 * must never break the request path. Messages are clipped and callers must not
 * pass request bodies or user data (no PII, no tokens, no invoice payloads).
 */
import { hasServiceKey, supabaseAdmin } from './supabase';

export type MonitorEventInput = {
  kind: 'heartbeat' | 'error';
  source: string;
  level?: 'info' | 'warn' | 'error';
  message?: string;
  detail?: Record<string, unknown> | null;
};

function clip(value: unknown, max = 500): string {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

export async function recordMonitorEvent(event: MonitorEventInput): Promise<void> {
  try {
    if (!hasServiceKey()) return;
    const admin = supabaseAdmin();
    await admin.from('monitor_events').insert({
      kind: event.kind,
      source: clip(event.source, 64),
      level: event.level ?? (event.kind === 'error' ? 'error' : 'info'),
      message: event.message ? clip(event.message, 500) : null,
      // detail must be small, structured and PII-free (numeric counts etc.)
      detail: event.detail ?? null,
    });
  } catch {
    /* never throw from the monitoring path */
  }
}
