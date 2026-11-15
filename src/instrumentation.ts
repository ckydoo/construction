/**
 * Next.js instrumentation hook — in-house server-error logging.
 * Records one monitor_events row per server error (message + route metadata
 * only; no request bodies, no headers, no user data).
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string },
) {
  try {
    const e = error as { message?: string; digest?: string } | null;
    const { recordMonitorEvent } = await import('@/lib/monitor');
    await recordMonitorEvent({
      kind: 'error',
      source: 'app',
      level: 'error',
      message: e?.message || String(error ?? 'unknown error'),
      detail: {
        method: request?.method,
        path: request?.path,
        digest: e?.digest,
        routerKind: context?.routerKind,
        routePath: context?.routePath,
        routeType: context?.routeType,
        renderSource: context?.renderSource,
      },
    });
  } catch {
    /* monitoring must never throw */
  }
}
