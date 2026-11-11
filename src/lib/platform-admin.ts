/* Platform-owner (superadmin) identity gate.
 *
 * Company/tenant membership is deliberately irrelevant here. A caller must have
 * a valid Supabase Auth session AND an active row in public.platform_admins.
 * The config tables themselves grant nothing to authenticated/anon; only the
 * service-role client used by the API can read or write them. */
import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from './supabase';

export type PlatformAdminCtx = { userId: string; email: string };

export async function requirePlatformAdmin(): Promise<{ ctx: PlatformAdminCtx; error?: NextResponse }> {
  let userId: string;
  let userEmail: string;
  try {
    const sb = await supabase();
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) {
      return { ctx: null as any, error: NextResponse.json({ error: 'Unauthorized: sign in as the platform owner.' }, { status: 401 }) };
    }
    userId = data.user.id;
    userEmail = data.user.email || '';
  } catch (e: any) {
    return { ctx: null as any, error: NextResponse.json({ error: e?.message || 'Supabase is not configured.' }, { status: 503 }) };
  }

  try {
    const admin = supabaseAdmin();
    const { data: row, error: adminErr } = await admin
      .from('platform_admins')
      .select('user_id, email')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();
    if (adminErr) {
      return { ctx: null as any, error: NextResponse.json({ error: adminErr.message }, { status: 500 }) };
    }
    if (!row) {
      return { ctx: null as any, error: NextResponse.json({ error: 'Forbidden: platform owner / superadmin access only.' }, { status: 403 }) };
    }
    return { ctx: { userId, email: (row as any).email || userEmail } };
  } catch (e: any) {
    return { ctx: null as any, error: NextResponse.json({ error: e?.message || 'Service-role client unavailable.' }, { status: 503 }) };
  }
}
