/* Refreshes the Supabase Auth JWT on every request so Postgres RLS always sees
 * a valid `auth.uid()`. When billing is enabled, this is also the hard-lock
 * gate: Billing and meta remain reachable, every other org API/page is blocked
 * until the subscription is active. In shadow mode this adds zero DB queries. */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const ACCESS_STATUSES = new Set(['comped','trialing','active','past_due','grace','switch_pending']);
const READ_ONLY_STATUSES = new Set(['past_due','grace','switch_pending']);
const RESERVED = new Set([
  'api','auth','onboarding','login','register','setup','_next','favicon.ico',
  'webhooks','cron','qa','billing','invite','accept-invite',
]);
const SAFE_METHODS = new Set(['GET','HEAD','OPTIONS']);

function billingMode(): 'off' | 'qa' | 'live' | 'misconfigured' {
  const enabled = String(process.env.BILLING_ENABLED || '').trim().toLowerCase() === 'true';
  const vercel = String(process.env.VERCEL || '') === '1'
    || /vercel\.app/i.test(String(process.env.NEXT_PUBLIC_APP_URL || ''));
  const qa = String(process.env.BILLING_QA_MODE || '').trim().toLowerCase() === 'true' && !vercel;
  if (!enabled) return qa ? 'qa' : 'off';
  if (qa) return 'qa';
  return String(process.env.STRIPE_SECRET_KEY || '').trim().startsWith('sk_live_') ? 'live' : 'misconfigured';
}
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}

export async function middleware(request: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });
  const client = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  const session = await client.auth.getUser();

  const mode = billingMode();
  if (mode === 'off') return response;

  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const isApi = segments[0] === 'api';
  const orgSlug = decodeURIComponent((isApi ? segments[1] : segments[0]) || '');
  const rest = segments.slice(isApi ? 2 : 1);
  if (!orgSlug || RESERVED.has(orgSlug)) return response;
  const billingPath = rest[0] === 'billing';
  const metaApi = isApi && rest[0] === 'meta';
  if (billingPath || metaApi || request.method === 'OPTIONS') return response;

  if (mode === 'misconfigured') {
    return copyCookies(response, NextResponse.json({
      error: 'Billing is misconfigured. BILLING_ENABLED=true requires a live Stripe secret key; no charge or lock has been applied.',
    }, { status: 503 }));
  }
  if (!session.data?.user) return response; // route handlers return 401 themselves

  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!serviceKey) {
    return copyCookies(response, NextResponse.json({ error: 'Billing enforcement needs SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 }));
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: orgRow } = await admin.from('organizations').select('id').eq('slug', orgSlug).maybeSingle();
  if (!orgRow?.id) return response;
  const { data: membership } = await admin.from('memberships').select('role')
    .eq('organization_id', orgRow.id).eq('user_id', session.data.user.id).maybeSingle();
  if (!membership) return response;
  const { data: sub } = await admin.from('billing_subscriptions').select('status')
    .eq('organization_id', orgRow.id).maybeSingle();
  const status = String(sub?.status || 'trial_required');
  const blocked = !ACCESS_STATUSES.has(status);
  const readOnly = READ_ONLY_STATUSES.has(status);

  if (isApi) {
    if (blocked || (readOnly && !SAFE_METHODS.has(request.method))) {
      return copyCookies(response, NextResponse.json({
        error: blocked ? 'A paid MYLA subscription is required. Your data has not been deleted.' : 'This workspace is read-only while payment is overdue.',
        code: blocked ? 'BILLING_REQUIRED' : 'BILLING_READ_ONLY',
        status, billingUrl: `/${orgSlug}/billing`,
      }, { status: 402 }));
    }
    return response;
  }
  if (blocked) return copyCookies(response, NextResponse.redirect(new URL(`/${orgSlug}/billing`, request.url)));
  if (readOnly) return response; // AppShell displays the read-only banner.
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
