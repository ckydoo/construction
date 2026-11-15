/* Public, booleans-only snapshot of the platform owner switches.
 *
 * NOT a secret: returns only { demo, maintenance }. Used by:
 *  - /api/platform/public-config (client components learn demo/maintenance)
 *  - getPlatformPublic() in server guards (API refusal, onboarding)
 *  - requireOrg / apiAuth (maintenance redirect / 401)
 *
 * Resolution (either source enables):
 *  - env:  NEXT_PUBLIC_DEMO_MODE='true' (build-time demo master) /
 *          MAINTENANCE_MODE='true' (env hard-force)
 *  - DB:   platform_settings.demo_enabled / maintenance_mode (id = 1),
 *          toggled by the platform owner at /platform
 *
 * Cached ~15s in-process (per lambda). Fail-open to both-off when the DB is
 * unreachable — a stuck deploy must never present itself as maintenance. */
import { hasServiceKey, supabaseAdmin } from './supabase';

export type PlatformPublic = { demo: boolean; maintenance: boolean };

const TTL_MS = 15_000;
let cache: { at: number; value: PlatformPublic } | null = null;

const truthy = (v: unknown) => String(v ?? '').trim().toLowerCase() === 'true';
export const envDemoMode = () => truthy(process.env.NEXT_PUBLIC_DEMO_MODE);
export const envMaintenanceMode = () => truthy(process.env.MAINTENANCE_MODE);

export async function getPlatformPublic(): Promise<PlatformPublic> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let demo = envDemoMode();
  let maintenance = envMaintenanceMode();
  try {
    if (hasServiceKey()) {
      const admin = supabaseAdmin();
      const { data } = await admin.from('platform_settings')
        .select('demo_enabled, maintenance_mode').eq('id', 1).maybeSingle();
      if (data) {
        demo = demo || !!data.demo_enabled;
        maintenance = maintenance || !!data.maintenance_mode;
      }
    }
  } catch {
    /* fail open */
  }
  const value = { demo, maintenance };
  cache = { at: Date.now(), value };
  return value;
}

export function invalidatePlatformPublicCache(): void { cache = null; }
