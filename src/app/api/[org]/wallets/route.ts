import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { guardModule, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { listWallets } from '@/lib/wallets';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = guardModule(a.config, 'wallets') || capabilityGuard(a.role, 'wallet.read'); if (g) return g;
  const scope = await buildScope(a);
  return NextResponse.json({ ...(await listWallets(a, scope)), role: a.role, scoped: scope.kind });
}
