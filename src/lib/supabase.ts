/* MYLA Supabase clients.
 *
 * `supabase()`   — a cookie-bound, RLS-enforcing client for the signed-in user.
 *                  EVERY app read/write goes through this client, so Postgres
 *                  RLS is the single authority for tenancy, role and scope.
 * `supabaseAdmin()` — a service-role client, server-only. Used exclusively for
 *                  trusted bootstrap work: creating auth users, first orgs,
 *                  demo seeding. Never import it into a client component.
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function supabaseEnv() {
  return {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim(),
    anonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim(),
    serviceKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
  };
}

export function hasSupabaseConfig(): boolean {
  const { url, anonKey } = supabaseEnv();
  return Boolean(url && anonKey);
}

export function hasServiceKey(): boolean {
  return Boolean(supabaseEnv().serviceKey);
}

/** Cookie-bound client. `auth.uid()` inside Postgres resolves to the JWT user. */
export async function supabase(): Promise<SupabaseClient> {
  const { url, anonKey } = supabaseEnv();
  if (!url || !anonKey) throw new Error('Supabase is not configured. Copy .env.example to .env and add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(list: { name: string; value: string; options?: any }[]) {
        // Server Components cannot write cookies; middleware refreshes the session.
        try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* noop */ }
      },
    },
  });
}

/** Service-role client. Bypasses RLS — never expose the key to the browser. */
export function supabaseAdmin(): SupabaseClient {
  const { url, serviceKey } = supabaseEnv();
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env for server-side bootstrap and seeding.');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Convert a PostgREST/PLpgSQL error into a useful API error. */
export function dbError(error: any): never {
  const message = String(error?.message || error || 'Database request failed');
  const e: any = new Error(message);
  if (error?.code === 'PGRST116' || /not found|no rows/i.test(message)) e.status = 404;
  else if (error?.code === '42501' || /row-level security|permission denied|not permitted|Unauthorized/i.test(message)) e.status = 403;
  else if (error?.code === '23505' || /duplicate|already/i.test(message)) e.status = 409;
  else if (error?.code === 'P0001' || /required|invalid|cannot|greater than|outside the allowed|insufficient/i.test(message)) e.status = 400;
  else e.status = 500;
  throw e;
}

export function unwrap<T>(result: { data: T; error: any }): T {
  if (result.error) dbError(result.error);
  return result.data;
}
