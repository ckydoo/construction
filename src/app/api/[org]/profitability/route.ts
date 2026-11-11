/* Read-only job profitability cockpit. Derives per-job margin, cost-to-complete,
 * billing position and cash gap from the existing record registers. No new
 * table, no business write and no personal display-currency conversion. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { billingGuard, guardModule, readGuard } from '@/lib/guard';
import { buildScope, visibleResources, rowsForScoped } from '@/lib/access';
import { normaliseCurrencyConfig } from '@/lib/currency';
import {
  PROFITABILITY_RESOURCE_IDS, computeJobProfitability,
  summariseProfitability, profitabilityCostBreakdown, type ProfitabilityJob,
} from '@/lib/profitability';

export const dynamic = 'force-dynamic';

const INCLUDED_PROJECT_STATUSES = new Set(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED']);

function groupByProject(rows: any[] = []) {
  const out = new Map<string, any[]>();
  for (const row of rows) {
    const id = String(row.projectId || '');
    if (!id) continue;
    const list = out.get(id) || [];
    list.push(row);
    out.set(id, list);
  }
  return out;
}

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = billingGuard(a) || guardModule(a.config, 'reports') || readGuard(a.config, a.role, 'projects');
  if (g) return g;

  const cfg = normaliseCurrencyConfig(a.config.currency, a.org.baseCurrency);
  const scope = await buildScope(a);
  const visible = new Set(visibleResources(a));
  const needed = PROFITABILITY_RESOURCE_IDS.filter(r => visible.has(r));
  const data: Record<string, any[]> = {};
  await Promise.all(needed.map(async resource => {
    data[resource] = await rowsForScoped(a, scope, resource);
  }));

  const projects = (data.projects || []).filter(p => INCLUDED_PROJECT_STATUSES.has(String(p.status || '').toUpperCase()));
  const grouped = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, groupByProject(rows)]));
  const pick = (resource: string, projectId: string) => (grouped[resource]?.get(projectId) || []) as any[];
  const clients = data.clients || [];
  const employees = data.employees || [];

  const jobs: ProfitabilityJob[] = projects.map(project => computeJobProfitability({
    org, project, cfg, clients, employees,
    contracts: pick('contracts', project.id),
    changeOrders: pick('changeOrders', project.id),
    budgets: pick('budgets', project.id),
    purchaseOrders: pick('purchaseOrders', project.id),
    apBills: pick('apBills', project.id),
    expenses: pick('expenses', project.id),
    timesheets: pick('timesheets', project.id),
    arInvoices: pick('arInvoices', project.id),
    paymentApps: pick('paymentApps', project.id),
    payments: pick('payments', project.id),
  })).sort((x, y) => {
    const rank = (j: ProfitabilityJob) => j.tone === 'red' ? 0 : j.tone === 'amber' ? 1 : j.tone === 'slate' ? 2 : 3;
    return rank(x) - rank(y) || x.forecastMargin - y.forecastMargin || y.revisedContract - x.revisedContract;
  });

  const summary = summariseProfitability(jobs);
  const missingRates = Array.from(new Set(jobs.flatMap(j => j.missingRates))).sort();
  return NextResponse.json({
    base: cfg.base,
    currency: {
      base: cfg.base, rates: cfg.rates,
      updatedAt: cfg.updatedAt || null, updatedBy: cfg.updatedBy || null,
      missingRates,
    },
    summary,
    jobs,
    costBreakdown: profitabilityCostBreakdown(jobs),
    generatedAt: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
