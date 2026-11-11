/* Read-only three-way procure-to-pay match API. Derives exceptions from the
 * existing purchase order, goods receipt and supplier bill registers. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { billingGuard, guardModule, readGuard } from '@/lib/guard';
import { buildScope, visibleResources, rowsForScoped } from '@/lib/access';
import { normaliseCurrencyConfig } from '@/lib/currency';
import { THREE_WAY_RESOURCE_IDS, buildThreeWayMatch } from '@/lib/three-way-match';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = billingGuard(a)
    || guardModule(a.config, 'procurement')
    || guardModule(a.config, 'finance')
    || readGuard(a.config, a.role, 'purchaseOrders')
    || readGuard(a.config, a.role, 'apBills');
  if (g) return g;

  const cfg = normaliseCurrencyConfig(a.config.currency, a.org.baseCurrency);
  const scope = await buildScope(a);
  const visible = new Set(visibleResources(a));
  const needed = THREE_WAY_RESOURCE_IDS.filter(r => visible.has(r));
  const data: Record<string, any[]> = {};
  await Promise.all(needed.map(async resource => {
    data[resource] = await rowsForScoped(a, scope, resource);
  }));

  const payload = buildThreeWayMatch({
    org, cfg,
    purchaseOrders: data.purchaseOrders || [],
    goodsReceipts: data.goodsReceipts || [],
    apBills: data.apBills || [],
    vendors: data.vendors || [],
    projects: data.projects || [],
  });
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}
