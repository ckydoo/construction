import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { guardModule, capabilityGuard } from '@/lib/guard';
import { walletClientAllowed } from '@/lib/access';

type Ctx = { params: Promise<{ org: string; clientId: string; txId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { org, clientId, txId } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = guardModule(a.config, 'wallets') || capabilityGuard(a.role, 'wallet.read'); if (g) return g;
  if (!walletClientAllowed(a, clientId)) return NextResponse.json({ error: 'You can only view your own wallet' }, { status: 403 });
  const t = await prisma.walletTransaction.findFirst({ where: { id: txId, clientId, organizationId: a.orgId } });
  if (!t) return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 });
  return NextResponse.json({ transaction: { ...t, amount: t.amountCents / 100, balanceAfter: t.balanceCents / 100, createdAt: t.createdAt.toISOString() } });
}

/* The ledger is append-only. Corrections are posted as REVERSAL entries. */
const immutable = () => NextResponse.json({ error: 'Ledger entries are immutable — post a reversal instead' }, { status: 405 });
export const PATCH = immutable;
export const DELETE = immutable;
export const PUT = immutable;
