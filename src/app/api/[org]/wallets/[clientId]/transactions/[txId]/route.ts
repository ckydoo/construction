import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { guardModule, capabilityGuard } from '@/lib/guard';
import { walletClientAllowed, buildScope } from '@/lib/access';
import { walletTxView } from '@/lib/views';

type Ctx = { params: Promise<{ org: string; clientId: string; txId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, clientId, txId } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = guardModule(a.config, 'wallets') || capabilityGuard(a.role, 'wallet.read'); if (g) return g;
  if (!walletClientAllowed(a, clientId, await buildScope(a))) return NextResponse.json({ error: 'You can only view your own wallet' }, { status: 403 });
  const sb = await supabase();
  const { data: t } = await sb.from('wallet_transactions').select('*')
    .eq('id', txId).eq('client_id', clientId).eq('organization_id', a.orgId).maybeSingle();
  if (!t) return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 });
  return NextResponse.json({ transaction: walletTxView(t) });
}

/* The ledger is append-only. Corrections are posted as REVERSAL entries. */
const immutable = () => NextResponse.json({ error: 'Ledger entries are immutable — post a reversal instead' }, { status: 405 });
export const PATCH = immutable;
export const DELETE = immutable;
export const PUT = immutable;
