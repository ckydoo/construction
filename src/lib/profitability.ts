/* Phase 2 job profitability cockpit — pure derivation helpers.
 *
 * Everything is calculated from records that already exist. No profitability
 * table is introduced, no business record is written, and all money is
 * reported in the workspace base currency using the manual Settings rates.
 * Reports, PDFs, CSV exports and saved records keep their original currency.
 */
import { toBase, hasRate, type CurrencyConfig } from './currency';

export type ProfitabilityTone = 'green' | 'amber' | 'red' | 'slate';

export type ProfitabilityCategory = { label: string; value: number };

export type ProfitabilityJob = {
  id: string;
  number: string;
  name: string;
  code: string;
  clientName: string;
  managerName: string;
  status: string;
  sourceHealth: string;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  href: string;

  contractValue: number;
  approvedVariations: number;
  pendingVariations: number;
  revisedContract: number;

  budget: number;
  committed: number;
  actualCost: number;
  costToComplete: number;
  forecastFinalCost: number;
  costVariance: number;
  costSource: 'project' | 'budget lines' | 'transactions' | 'none';

  billed: number;
  certified: number;
  received: number;
  cashGap: number;
  earnedValue: number;
  billingVariance: number;

  currentMargin: number;
  forecastMargin: number;
  marginPct: number;

  categories: ProfitabilityCategory[];
  flags: string[];
  missingRates: string[];
  tone: ProfitabilityTone;
  statusLabel: string;
  /** Where the forecast-to-complete came from. 'unknown' means no budget, no proposed cost and no actuals — the job is excluded from company forecast totals. */
  forecastBasis: 'budget' | 'proposed-cost' | 'actual-cost' | 'unknown';
  /** True when the forecast rests on the awarded quote's proposed cost (or actuals alone) because no approved budget exists. Shown, but labelled provisional and kept out of headline company totals. */
  marginProvisional: boolean;
  /** False when nothing supports a forecast; job is excluded from company forecast totals entirely. */
  forecastAvailable: boolean;
};

export type ProfitabilitySummary = {
  projectCount: number;
  contractValue: number;
  revisedContract: number;
  budget: number;
  committed: number;
  actualCost: number;
  forecastFinalCost: number;
  costVariance: number;
  billed: number;
  certified: number;
  received: number;
  cashGap: number;
  pendingVariations: number;
  currentMargin: number;
  forecastMargin: number;
  marginPct: number;
  /** Jobs whose forecast uses the proposed cost (or actuals) for lack of an approved budget. */
  provisionalJobs: number;
  /** Jobs with no approved budget, no proposed cost and no actuals — excluded from forecast totals. */
  unknownCostJobs: number;
  /** Indicative margin of provisional jobs, shown separately — never mixed into forecastMargin. */
  provisionalForecastMargin: number;
  atRisk: number;
  watch: number;
  onTrack: number;
  underbilled: number;
  overbilled: number;
  missingRates: number;
};

export type ProfitabilityResponse = {
  base: string;
  currency: {
    base: string;
    rates: Record<string, number>;
    updatedAt: string | null;
    updatedBy: string | null;
    missingRates: string[];
  };
  summary: ProfitabilitySummary;
  jobs: ProfitabilityJob[];
  costBreakdown: ProfitabilityCategory[];
  generatedAt: string;
};

/** Registers read for the cockpit. Missing/disabled ones simply contribute 0. */
export const PROFITABILITY_RESOURCE_IDS = [
  'projects', 'clients', 'employees', 'contracts', 'changeOrders', 'budgets',
  'purchaseOrders', 'apBills', 'expenses', 'timesheets', 'arInvoices',
  'paymentApps', 'payments',
] as const;

export type ProfitabilityInput = {
  org: string;
  project: any;
  cfg: CurrencyConfig;
  clients?: any[];
  employees?: any[];
  contracts?: any[];
  changeOrders?: any[];
  budgets?: any[];
  purchaseOrders?: any[];
  apBills?: any[];
  expenses?: any[];
  timesheets?: any[];
  arInvoices?: any[];
  paymentApps?: any[];
  payments?: any[];
};

const str = (v: unknown) => String(v || '');
const num = (v: unknown) => { const n = Number(v || 0); return isFinite(n) ? n : 0; };
const clampPct = (v: unknown) => Math.min(100, Math.max(0, num(v)));
const round2 = (n: number) => Math.round(n * 100) / 100;
const statusSet = (rows: any[], allowed: string[]) => rows.filter(r => allowed.includes(str(r.status).toUpperCase()));

export function computeJobProfitability(input: ProfitabilityInput): ProfitabilityJob {
  const { org, project: p, cfg } = input;
  const projectCurrency = str(p.currency || cfg.base).toUpperCase();
  const missing = new Set<string>();
  const noteCurrency = (row?: any) => {
    const code = str(row?.currency || projectCurrency || cfg.base).toUpperCase();
    if (!hasRate(code, cfg)) missing.add(code);
  };
  const inBase = (value: unknown, row?: any) => {
    const n = num(value);
    if (!n) return 0;
    noteCurrency(row);
    return toBase(n, row?.currency || projectCurrency || cfg.base, cfg);
  };
  const sumRows = (rows: any[], pick: string | ((r: any) => unknown)) => rows.reduce((total, row) => {
    const value = typeof pick === 'function' ? pick(row) : row[pick];
    return total + inBase(value, row);
  }, 0);

  const clients = input.clients || [];
  const employees = input.employees || [];
  const client = clients.find(c => c.id === p.clientId);
  const manager = employees.find(e => e.id === p.manager);
  const clientName = str(client?.name || client?.title || p.clientName || '');
  const managerName = str(manager?.name || manager?.title || '');

  const contracts = input.contracts || [];
  const changeOrders = input.changeOrders || [];
  const budgets = input.budgets || [];
  const purchaseOrders = input.purchaseOrders || [];
  const apBills = input.apBills || [];
  const expenses = input.expenses || [];
  const timesheets = input.timesheets || [];
  const arInvoices = input.arInvoices || [];
  const paymentApps = input.paymentApps || [];
  const payments = input.payments || [];

  const primeContracts = contracts.filter(c =>
    c.kind === 'Prime contract' && !['DRAFT', 'TERMINATED'].includes(str(c.status).toUpperCase()));
  const approvedCo = statusSet(changeOrders, ['APPROVED', 'INCLUDED_IN_CERT']);
  const pendingCo = statusSet(changeOrders, ['SUBMITTED', 'UNDER_REVIEW']);
  const budgetLines = statusSet(budgets, ['APPROVED', 'REVISED', 'CLOSED']);
  const committedPos = statusSet(purchaseOrders, ['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED']);
  const postedBills = apBills.filter(b => !['DRAFT', 'VOID'].includes(str(b.status).toUpperCase()));
  const postedExpenses = statusSet(expenses, ['APPROVED', 'REIMBURSED']);
  const postedTimesheets = statusSet(timesheets, ['APPROVED', 'POSTED']);
  const issuedInvoices = arInvoices.filter(i => !['DRAFT', 'VOID'].includes(str(i.status).toUpperCase()));
  const certifiedApps = statusSet(paymentApps, ['CERTIFIED', 'PARTIALLY_PAID', 'PAID']);
  const clearedReceipts = payments.filter(x =>
    str(x.direction).toUpperCase() === 'RECEIPT' && ['CLEARED', 'RECONCILED'].includes(str(x.status).toUpperCase()));

  const contractFromProject = inBase(p.contractValue, p);
  const contractFromContracts = sumRows(primeContracts, 'value');
  const contractValue = contractFromProject || contractFromContracts;
  const approvedVariations = sumRows(approvedCo, 'amount');
  const pendingVariations = sumRows(pendingCo, 'amount');
  const revisedContract = contractValue + approvedVariations;

  const budgetFromProject = inBase(p.budget, p);
  const budgetFromLines = sumRows(budgetLines, r => num(r.originalBudget) + num(r.approvedVariations));
  const budget = budgetFromProject || budgetFromLines;

  const committedFromLines = sumRows(budgetLines, 'committed');
  const committedFromPos = sumRows(committedPos, 'amount');
  const committed = Math.max(committedFromLines, committedFromPos);

  const actualFromProject = inBase(p.costToDate, p);
  const actualFromLines = sumRows(budgetLines, 'actualToDate');
  const actualFromTransactions =
    sumRows(postedBills, 'total') + sumRows(postedExpenses, 'amount') + sumRows(postedTimesheets, 'labourCost');
  const actualCost = actualFromProject || actualFromLines || actualFromTransactions;
  const costSource = actualFromProject ? 'project' as const
    : actualFromLines ? 'budget lines' as const
      : actualFromTransactions ? 'transactions' as const : 'none' as const;

  const forecastToCompleteFromLines = sumRows(budgetLines, 'forecastToComplete');
  const proposedCost = inBase(p.proposedEstimateCost, p);
  let forecastBasis: ProfitabilityJob['forecastBasis'];
  let marginProvisional = false;
  let forecastAvailable = true;
  let costToComplete: number;
  let forecastFinalCost: number;
  if (forecastToCompleteFromLines > 0 || budget > 0) {
    // Approved budget (or approved forecast lines) is the basis: reliable.
    forecastBasis = 'budget';
    costToComplete = forecastToCompleteFromLines || Math.max(0, budget - actualCost);
    forecastFinalCost = actualCost + costToComplete;
  } else if (proposedCost > 0) {
    // No approved budget: the awarded quote's proposed cost is the only cost
    // signal. Show the forecast, labelled provisional, and keep it out of
    // headline company totals.
    forecastBasis = 'proposed-cost';
    marginProvisional = true;
    costToComplete = Math.max(0, proposedCost - actualCost);
    forecastFinalCost = actualCost + costToComplete;
  } else if (actualCost > 0) {
    // Actuals exist but nothing says what remains to be spent.
    forecastBasis = 'actual-cost';
    marginProvisional = true;
    costToComplete = 0;
    forecastFinalCost = actualCost;
  } else {
    // Unknown cost entirely — an unknown forecast must never become
    // zero-cost 100% margin in the company totals.
    forecastBasis = 'unknown';
    marginProvisional = true;
    forecastAvailable = false;
    costToComplete = 0;
    forecastFinalCost = 0;
  }
  const costVariance = budget ? budget - forecastFinalCost : 0;

  const billed = sumRows(issuedInvoices, 'total');
  const certified = sumRows(certifiedApps, 'netCertified');
  const receivedFromInvoices = sumRows(issuedInvoices, 'amountPaid');
  const receivedFromPayments = sumRows(clearedReceipts, 'amount');
  // Cash receipts and invoice settlement are different measures. Unallocated
  // customer deposits must not reduce receivables merely because they share a
  // project. Invoice amounts are updated by the allocation transaction.
  const received = receivedFromPayments;
  const cashGap = Math.max(0, billed - receivedFromInvoices);

  const progress = clampPct(p.progress);
  const earnedValue = revisedContract * (progress / 100);
  const billingVariance = billed - earnedValue;
  const currentMargin = billed - actualCost;
  const forecastMargin = forecastAvailable ? revisedContract - forecastFinalCost : 0;
  const marginPct = forecastAvailable && revisedContract ? (forecastMargin / revisedContract) * 100 : 0;

  const categoryTotals = new Map<string, number>();
  for (const line of budgetLines) {
    const label = str(line.category || 'Other');
    const value = inBase(line.actualToDate, line);
    if (value > 0) categoryTotals.set(label, (categoryTotals.get(label) || 0) + value);
  }
  if (!categoryTotals.size && actualFromTransactions > 0) {
    const labour = sumRows(postedTimesheets, 'labourCost');
    const supplierBills = sumRows(postedBills, 'total');
    const materialExpenses = sumRows(postedExpenses.filter(e => str(e.category).toLowerCase() === 'materials'), 'amount');
    const otherExpenses = sumRows(postedExpenses.filter(e => str(e.category).toLowerCase() !== 'materials'), 'amount');
    if (labour > 0) categoryTotals.set('Labour', labour);
    if (supplierBills > 0) categoryTotals.set('Supplier bills', supplierBills);
    if (materialExpenses > 0) categoryTotals.set('Materials', materialExpenses);
    if (otherExpenses > 0) categoryTotals.set('Site expenses', otherExpenses);
  }
  const categories = Array.from(categoryTotals.entries())
    .map(([label, value]) => ({ label, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
  const allocated = categories.reduce((t, c) => t + c.value, 0);
  if (actualCost - allocated > 1) categories.push({ label: 'Unallocated', value: round2(actualCost - allocated) });

  const flags: string[] = [];
  if (budget <= 0) flags.push('No approved budget');
  if (forecastBasis === 'unknown') flags.push('Forecast unavailable — approve a budget');
  else if (marginProvisional) flags.push('Provisional forecast (no approved budget)');
  if (forecastAvailable) {
    if (forecastMargin < 0) flags.push('Forecast loss at completion');
    else if (marginPct < 10) flags.push('Thin forecast margin');
  }
  if (budget > 0 && costVariance < -budget * 0.05) flags.push('Cost overrun forecast');
  if (revisedContract > 0 && billingVariance < -revisedContract * 0.1) flags.push('Underbilled for work done');
  if (revisedContract > 0 && billingVariance > revisedContract * 0.1) flags.push('Overbilled for work done');
  if (billed > 0 && cashGap > billed * 0.2) flags.push('Cash gap on billed work');
  if (pendingVariations > 0) flags.push('Pending variations awaiting approval');
  if (missing.size) flags.push('Missing manual FX rate');

  let tone: ProfitabilityTone = 'green';
  if (forecastBasis === 'unknown') tone = 'slate';
  else if (!revisedContract && !budget && !actualCost) tone = 'slate';
  else if (forecastMargin < 0 || (budget > 0 && costVariance < -budget * 0.05) || marginPct < 5) tone = 'red';
  else if (flags.length) tone = 'amber';
  const statusLabel = tone === 'red' ? 'At risk'
    : tone === 'amber' ? 'Watch'
      : tone === 'slate' ? 'Needs setup' : 'On track';

  return {
    id: str(p.id), number: str(p.number || ''), name: str(p.name || p.title || p.number || 'Untitled job'),
    code: str(p.code || ''), clientName, managerName,
    status: str(p.status || ''), sourceHealth: str(p.health || ''), progress,
    startDate: p.startDate ? str(p.startDate) : null, endDate: p.endDate ? str(p.endDate) : null,
    currency: projectCurrency,
    href: `/${org}/m/projects?open=${encodeURIComponent(str(p.id))}`,

    contractValue: round2(contractValue), approvedVariations: round2(approvedVariations),
    pendingVariations: round2(pendingVariations), revisedContract: round2(revisedContract),

    budget: round2(budget), committed: round2(committed), actualCost: round2(actualCost),
    costToComplete: round2(costToComplete), forecastFinalCost: round2(forecastFinalCost),
    costVariance: round2(costVariance), costSource,

    billed: round2(billed), certified: round2(certified), received: round2(received),
    cashGap: round2(cashGap), earnedValue: round2(earnedValue), billingVariance: round2(billingVariance),

    currentMargin: round2(currentMargin), forecastMargin: round2(forecastMargin),
    marginPct: round2(marginPct),

    categories, flags, missingRates: Array.from(missing).sort(), tone, statusLabel,
    forecastBasis, marginProvisional, forecastAvailable,
  };
}

export function summariseProfitability(jobs: ProfitabilityJob[]): ProfitabilitySummary {
  const total = (pick: (j: ProfitabilityJob) => number) => jobs.reduce((t, j) => t + num(pick(j)), 0);
  const revisedContract = total(j => j.revisedContract);
  // Headline cost/forecast figures cover jobs whose forecast rests on an
  // approved budget or approved forecast lines only. Provisional jobs are
  // reported separately so they never inflate the company margin.
  const confident = jobs.filter(j => j.forecastAvailable && !j.marginProvisional);
  const confidentRevised = confident.reduce((t, j) => t + num(j.revisedContract), 0);
  const forecastFinalCost = confident.reduce((t, j) => t + num(j.forecastFinalCost), 0);
  const forecastMargin = confident.reduce((t, j) => t + num(j.forecastMargin), 0);
  const costVariance = confident.reduce((t, j) => t + num(j.costVariance), 0);
  const provisionalJobs = jobs.filter(j => j.forecastAvailable && j.marginProvisional).length;
  const unknownCostJobs = jobs.filter(j => !j.forecastAvailable).length;
  const provisionalForecastMargin = jobs.filter(j => j.forecastAvailable && j.marginProvisional).reduce((t, j) => t + num(j.forecastMargin), 0);
  const marginPct = confidentRevised ? (forecastMargin / confidentRevised) * 100 : 0;
  return {
    projectCount: jobs.length,
    contractValue: round2(total(j => j.contractValue)),
    revisedContract: round2(revisedContract),
    budget: round2(total(j => j.budget)),
    committed: round2(total(j => j.committed)),
    actualCost: round2(total(j => j.actualCost)),
    forecastFinalCost: round2(forecastFinalCost),
    costVariance: round2(costVariance),
    billed: round2(total(j => j.billed)),
    certified: round2(total(j => j.certified)),
    received: round2(total(j => j.received)),
    cashGap: round2(total(j => j.cashGap)),
    pendingVariations: round2(total(j => j.pendingVariations)),
    currentMargin: round2(total(j => j.currentMargin)),
    forecastMargin: round2(forecastMargin),
    marginPct: round2(marginPct),
    provisionalJobs, unknownCostJobs, provisionalForecastMargin: round2(provisionalForecastMargin),
    atRisk: jobs.filter(j => j.tone === 'red').length,
    watch: jobs.filter(j => j.tone === 'amber').length,
    onTrack: jobs.filter(j => j.tone === 'green').length,
    underbilled: jobs.filter(j => j.billingVariance < 0).length,
    overbilled: jobs.filter(j => j.billingVariance > 0).length,
    missingRates: jobs.filter(j => j.missingRates.length > 0).length,
  };
}

export function profitabilityCostBreakdown(jobs: ProfitabilityJob[]): ProfitabilityCategory[] {
  const map = new Map<string, number>();
  for (const job of jobs) for (const c of job.categories) {
    if (c.value > 0) map.set(c.label, (map.get(c.label) || 0) + c.value);
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value: round2(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}
