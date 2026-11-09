import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { guardModule, guardResource, capabilityGuard } from '@/lib/guard';
import { buildScope, walletClientAllowed } from '@/lib/access';
import { walletDetail, topUpWallet, allocateToProject, reverseTransaction, WalletError } from '@/lib/wallets';

type Ctx = { params: Promise<{ org: string; clientId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, clientId } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = guardModule(a.config, 'wallets') || capabilityGuard(a.role, 'wallet.read'); if (g) return g;
  if (!walletClientAllowed(a, clientId)) return NextResponse.json({ error: 'You can only view your own wallet' }, { status: 403 });
  try {
    return NextResponse.json(await walletDetail(a, clientId, await buildScope(a)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof WalletError ? e.status : 500 });
  }
}

/** Wallet actions. Ledger entries are only created here — never via generic CRUD. */
export async function POST(req: Request, { params }: Ctx) {
  const { org, clientId } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const moduleGate = guardModule(a.config, 'wallets') || guardResource(a.config, 'clients'); if (moduleGate) return moduleGate;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 }); }
  const action = String(body.action || '');
  const cap = action === 'topup' ? 'wallet.topup' : action === 'allocate' ? 'wallet.allocate' : action === 'reverse' ? 'wallet.refund' : null;
  if (!cap) return NextResponse.json({ error: 'Unknown wallet action' }, { status: 400 });
  const g = capabilityGuard(a.role, cap); if (g) return g;
  if (!walletClientAllowed(a, clientId)) return NextResponse.json({ error: 'You can only use your own wallet' }, { status: 403 });
  if (action === 'allocate') {
    const pg = guardResource(a.config, 'projects'); if (pg) return pg;
  }
  try {
    const result = action === 'topup' ? await topUpWallet(a, clientId, body)
      : action === 'allocate' ? await allocateToProject(a, clientId, body)
      : await reverseTransaction(a, clientId, body);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: any) {
    const status = e instanceof WalletError ? e.status : 500;
    return NextResponse.json({ error: e.message || 'Wallet action failed' }, { status });
  }
}
