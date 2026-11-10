/* Test-only helpers. These are unreachable in production and make no external
 * payment calls; they exercise the local DPO and Paynow mock handlers. */
import { supabaseAdmin } from './supabase';
import { baseUrl, billingConfig } from './billing';

export async function supabaseAdminBillingOrgId(slug: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from('organizations')
    .select('id').eq('slug', slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id || null;
}

export function qaPollUrl(req: Request, reference: string): string {
  const secret = billingConfig().qaSecret;
  const u = new URL('/api/webhooks/paynow/mock-poll', baseUrl(req));
  u.searchParams.set('reference', reference);
  if (secret) u.searchParams.set('qa_secret', secret);
  return u.toString();
}

export function qaEventId(prefix: string): string {
  return `evt_mock_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
