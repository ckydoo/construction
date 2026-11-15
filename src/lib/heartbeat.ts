/**
 * Dead-man's-switch heartbeat for cron routes (healthchecks.io or compatible).
 *
 * Pings the URL in `url` after a successful sweep, or `${url}/fail` on failure,
 * so a missed or failing cron alerts the owner instead of failing silently.
 * No-op when the env var is unset — safe to ship before the checks exist.
 * Never throws, never blocks the response beyond a short timeout.
 */
export async function pingHeartbeat(url: string | undefined, outcome: 'success' | 'fail' = 'success'): Promise<void> {
  const base = (url || '').trim();
  if (!base) return;
  const target = outcome === 'fail' ? `${base.replace(/\/+$/, '')}/fail` : base;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(target, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Heartbeat delivery problems must never break the cron itself.
  }
}
