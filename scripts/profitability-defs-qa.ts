/* Static / pure-function audit for Phase 2 job profitability. No network and no
 * database access: synthetic records exercise conversion, margin, forecast,
 * billing position, cash gap, flags and module visibility. */
import assert from 'node:assert/strict';
import { normaliseCurrencyConfig } from '../src/lib/currency';
import { hrefVisible, moduleForPath, SPECIAL_ROUTE_MODULES } from '../src/lib/module-visibility';
import { RESOURCE_MAP } from '../src/lib/resources';
import {
  PROFITABILITY_RESOURCE_IDS, computeJobProfitability,
  summariseProfitability, profitabilityCostBreakdown,
} from '../src/lib/profitability';

const results: string[] = [];
function check(name: string, fn: () => string | void) {
  try { const detail = fn(); results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  catch (e: any) { results.push(`FAIL  ${name} — ${e.message}`); throw e; }
}
const near = (actual: number, expected: number, label: string, tolerance = 1) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);

const cfg = normaliseCurrencyConfig({ base: 'USD', enabled: ['USD', 'ZWG'], rates: { USD: 1, ZWG: 26 } }, 'USD');

check('profitability reads only existing registers', () => {
  for (const id of PROFITABILITY_RESOURCE_IDS) assert.ok((RESOURCE_MAP as any)[id], `unknown resource ${id}`);
  for (const [resource, fields] of Object.entries({
    projects: ['contractValue', 'budget', 'costToDate', 'progress', 'currency'],
    budgets: ['originalBudget', 'approvedVariations', 'committed', 'actualToDate', 'forecastToComplete', 'category'],
    arInvoices: ['total', 'amountPaid', 'currency', 'status'],
    paymentApps: ['netCertified', 'status'],
    purchaseOrders: ['amount', 'currency', 'status'],
    apBills: ['total', 'currency', 'status'],
    expenses: ['amount', 'currency', 'status'],
    timesheets: ['labourCost', 'status'],
    payments: ['amount', 'direction', 'currency', 'status'],
  })) {
    const def: any = (RESOURCE_MAP as any)[resource];
    const keys = new Set((def.fields || []).map((f: any) => f.key));
    for (const key of fields) assert.ok(keys.has(key), `${resource}.${key} missing`);
  }
  return `${PROFITABILITY_RESOURCE_IDS.length} registers`;
});

check('profitability route is gated by the reports module', () => {
  assert.equal(SPECIAL_ROUTE_MODULES.profitability, 'reports');
  assert.equal(moduleForPath('/kestrel-ridge/profitability'), 'reports');
  assert.equal(hrefVisible('/kestrel-ridge/profitability', { modules: ['reports'], resources: ['projects'] }), true);
  assert.equal(hrefVisible('/kestrel-ridge/profitability', { modules: [], resources: ['projects'] }), false);
  return 'visible only when Reports is on';
});

const clients = [{ id: 'c1', name: 'Client A' }];
const employees = [{ id: 'e1', name: 'Manager A' }];

const healthy = computeJobProfitability({
  org: 'kestrel-ridge', cfg, clients, employees,
  project: {
    id: 'p1', number: 'PRJ-0001', name: 'Profitable job', code: 'P1', status: 'ACTIVE',
    clientId: 'c1', manager: 'e1', currency: 'USD', progress: 60,
    contractValue: 100000, budget: 80000, costToDate: 50000,
  },
  changeOrders: [
    { projectId: 'p1', status: 'APPROVED', amount: 10000 },
    { projectId: 'p1', status: 'SUBMITTED', amount: 5000 },
  ],
  budgets: [
    { projectId: 'p1', status: 'APPROVED', category: 'Labour', originalBudget: 50000, approvedVariations: 0, committed: 55000, actualToDate: 40000, forecastToComplete: 10000 },
    { projectId: 'p1', status: 'REVISED', category: 'Materials', originalBudget: 30000, approvedVariations: 0, committed: 25000, actualToDate: 10000, forecastToComplete: 5000 },
  ],
  purchaseOrders: [{ projectId: 'p1', status: 'APPROVED', amount: 25000, currency: 'USD' }],
  apBills: [{ projectId: 'p1', status: 'ISSUED', total: 12000, currency: 'USD' }],
  expenses: [{ projectId: 'p1', status: 'APPROVED', amount: 2000, currency: 'USD' }],
  timesheets: [{ projectId: 'p1', status: 'POSTED', labourCost: 8000 }],
  arInvoices: [{ projectId: 'p1', status: 'ISSUED', total: 70000, amountPaid: 60000, currency: 'USD' }],
  paymentApps: [{ projectId: 'p1', status: 'CERTIFIED', netCertified: 65000 }],
  payments: [{ projectId: 'p1', direction: 'RECEIPT', status: 'CLEARED', amount: 1000, currency: 'USD' }],
});

check('a healthy job derives contract, cost, margin, billing and cash', () => {
  near(healthy.contractValue, 100000, 'contract');
  near(healthy.approvedVariations, 10000, 'approved variations');
  near(healthy.pendingVariations, 5000, 'pending variations');
  near(healthy.revisedContract, 110000, 'revised contract');
  near(healthy.budget, 80000, 'budget');
  near(healthy.actualCost, 50000, 'actual cost');
  assert.equal(healthy.costSource, 'project');
  near(healthy.costToComplete, 15000, 'cost to complete');
  near(healthy.forecastFinalCost, 65000, 'forecast final cost');
  near(healthy.costVariance, 15000, 'cost variance');
  near(healthy.billed, 70000, 'billed');
  near(healthy.certified, 65000, 'certified');
  near(healthy.received, 60000, 'received');
  near(healthy.cashGap, 10000, 'cash gap');
  near(healthy.earnedValue, 66000, 'earned value');
  near(healthy.billingVariance, 4000, 'billing variance');
  near(healthy.currentMargin, 20000, 'current margin');
  near(healthy.forecastMargin, 45000, 'forecast margin');
  near(healthy.marginPct, 40.91, 'margin %', 0.1);
  assert.equal(healthy.clientName, 'Client A');
  assert.equal(healthy.managerName, 'Manager A');
  assert.ok(healthy.flags.includes('Pending variations awaiting approval'), 'pending variation should be flagged');
  return `${healthy.statusLabel} · ${healthy.marginPct}% forecast margin`;
});

const loss = computeJobProfitability({
  org: 'kestrel-ridge', cfg,
  project: {
    id: 'p2', number: 'PRJ-0002', name: 'Loss job', code: 'P2', status: 'ACTIVE',
    currency: 'ZWG', progress: 80,
    contractValue: 1300000, budget: 1560000, costToDate: 1430000,
  },
  changeOrders: [
    { projectId: 'p2', status: 'INCLUDED_IN_CERT', amount: 260000 },
    { projectId: 'p2', status: 'UNDER_REVIEW', amount: 130000 },
  ],
  budgets: [{
    projectId: 'p2', status: 'APPROVED', category: 'Materials',
    originalBudget: 1560000, approvedVariations: 0, committed: 0,
    actualToDate: 1430000, forecastToComplete: 520000,
  }],
  arInvoices: [{ projectId: 'p2', status: 'ISSUED', total: 260000, amountPaid: 0, currency: 'ZWG' }],
});

check('ZWG records convert to USD and a loss job is flagged', () => {
  near(loss.contractValue, 50000, 'contract in USD');
  near(loss.approvedVariations, 10000, 'approved variations in USD');
  near(loss.revisedContract, 60000, 'revised contract in USD');
  near(loss.actualCost, 55000, 'actual cost in USD');
  near(loss.costToComplete, 20000, 'cost to complete in USD');
  near(loss.forecastFinalCost, 75000, 'forecast final cost in USD');
  near(loss.forecastMargin, -15000, 'forecast loss in USD');
  near(loss.marginPct, -25, 'negative margin %');
  assert.equal(loss.tone, 'red');
  for (const flag of ['Forecast loss at completion', 'Cost overrun forecast', 'Underbilled for work done', 'Cash gap on billed work', 'Pending variations awaiting approval']) {
    assert.ok(loss.flags.includes(flag), `missing flag: ${flag}`);
  }
  assert.equal(loss.missingRates.length, 0, 'ZWG should have a configured rate');
  return `${loss.statusLabel} · ${loss.marginPct}% · ${loss.flags.length} flags`;
});

const missingRate = computeJobProfitability({
  org: 'kestrel-ridge', cfg,
  project: { id: 'p3', name: 'Unrated currency job', status: 'ON_HOLD', currency: 'XXX', progress: 50, contractValue: 1000, budget: 800, costToDate: 500 },
});

check('a missing manual FX rate is visible, not silently converted', () => {
  assert.deepEqual(missingRate.missingRates, ['XXX']);
  assert.ok(missingRate.flags.includes('Missing manual FX rate'));
  near(missingRate.forecastMargin, 200, 'forecast margin stays unconverted');
  return 'XXX flagged';
});

const jobs = [healthy, loss, missingRate];
const summary = summariseProfitability(jobs);
const breakdown = profitabilityCostBreakdown(jobs);

check('summary and cost breakdown reconcile with job rows', () => {
  assert.equal(summary.projectCount, 3);
  near(summary.revisedContract, healthy.revisedContract + loss.revisedContract + missingRate.revisedContract, 'total revised contract');
  near(summary.forecastMargin, healthy.forecastMargin + loss.forecastMargin + missingRate.forecastMargin, 'total forecast margin');
  assert.equal(summary.atRisk, 1);
  assert.equal(summary.watch, 2);
  assert.equal(summary.missingRates, 1);
  assert.ok(breakdown.every(c => c.value > 0), 'cost breakdown must not contain negative slices');
  assert.equal(breakdown[0].label, 'Materials');
  return `${breakdown.length} cost categories · ${summary.atRisk} at risk`;
});

console.log(results.join('\n'));
console.log(`\n${results.length} PASS / 0 FAIL`);
