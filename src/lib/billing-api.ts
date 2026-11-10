import { NextResponse } from 'next/server';
import { apiAuth, type AuthCtx } from './auth';
import { billingConfig, billingMode } from './billing';

export async function billingAdmin(org: string): Promise<{ a: AuthCtx; error?: NextResponse }> {
  const a = await apiAuth(org);
  if (!a) return { a: null as any, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (a.role !== 'OWNER' && a.role !== 'ADMIN')
    return { a, error: NextResponse.json({ error: 'Only owners and administrators can manage billing.' }, { status: 403 }) };
  return { a };
}
export function billingMutationError(): NextResponse | null {
  const mode = billingMode();
  if (mode === 'qa' || mode === 'live') return null;
  if (mode === 'misconfigured') return NextResponse.json({
    error: 'Billing is misconfigured: BILLING_ENABLED=true requires a live Stripe secret key. No charge or lock has been applied.',
  }, { status: 503 });
  return NextResponse.json({ error: 'Billing is in shadow mode. Add live keys and set BILLING_ENABLED=true to enable checkout.' }, { status: 409 });
}
export function billingFailure(e: any): NextResponse {
  return NextResponse.json({ error: e?.message || 'Billing request failed' }, { status: e?.status || 500 });
}
export function billingConfigPublic() {
  const cfg = billingConfig();
  return {
    mode: cfg.mode, active: cfg.active, currency: cfg.currency,
    trialDays: cfg.trialDays, graceDays: cfg.graceDays,
    taxIncluded: cfg.taxIncluded, stripeTaxEnabled: cfg.stripeTaxEnabled,
    paynowAvailable: cfg.paynowReady, stripeCheckoutAvailable: cfg.stripeReady || cfg.mode === 'qa',
  };
}
