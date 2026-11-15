import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { readGuard, capabilityGuard } from '@/lib/guard';
import { canRead } from '@/lib/catalog';
import { getResource } from '@/lib/resources';
import { getRecord } from '@/lib/records';
import { buildScope, rowsForScoped } from '@/lib/access';
import { fetchAll } from '@/lib/fetch';
import { normaliseCurrencyConfig, toBase } from '@/lib/currency';
import { resourceFullyEnabled, moduleEnabled, hrefVisible } from '@/lib/module-visibility';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, 'projects') || capabilityGuard(a.role, 'project360'); if (g) return g;
  const scope = await buildScope(a);
  const cfg = normaliseCurrencyConfig(a.config.currency, a.org.baseCurrency);
  const walletsOn = moduleEnabled(a.config, 'wallets') && hrefVisible('/wallets', a.config);
  const project = await getRecord(a.orgId, 'projects', id, scope);
  if (!project) return NextResponse.json({ error: 'Project not found' }, scope.kind ? { status: 403 } : { status: 404 });
  const related = ['tasks', 'contracts', 'changeOrders', 'rfis', 'submittals', 'documents', 'dailyLogs', 'meetings', 'punchLists', 'permits', 'budgets', 'arInvoices', 'paymentApps', 'purchaseOrders', 'timesheets', 'incidents', 'inspections', 'ncrs', 'equipment', 'crews', 'expenses', 'apBills', 'payments']
    .filter(r => resourceFullyEnabled(a.config, r) && canRead(a.role, r));
  const grouped: Record<string, any[]> = {};
  await Promise.all(related.map(async r => { grouped[r] = await rowsForScoped(a, scope, r, id); }));
  for (const k of Object.keys(grouped)) grouped[k] = grouped[k].filter(x => x.projectId === id);
  const budgets = grouped.budgets || [], apps = grouped.paymentApps || [];
  const allInvoices = grouped.arInvoices || [];
  // Match job profitability: money figures only count invoices issued to the
  // client. Drafts and voids stay in the register but are excluded here.
  const invoices = allInvoices.filter(i => !['DRAFT', 'VOID'].includes(String(i.status || '').toUpperCase()));
  // Job profitability reports cash received from cleared/reconciled receipts
  // (invoice-linked allocations settle invoice balances separately).
  const clearedReceipts = (grouped.payments || []).filter(x =>
    String(x.direction || '').toUpperCase() === 'RECEIPT' && ['CLEARED', 'RECONCILED'].includes(String(x.status || '').toUpperCase()));
  const sum = (rows: any[], key: string) => rows.reduce((t, r) => t + toBase(r[key], r.currency || project.currency || cfg.base, cfg), 0);

  const allocs = walletsOn ? await fetchAll('wallet_transactions', q => q
    .eq('organization_id', a.orgId).eq('project_id', id).eq('kind', 'ALLOCATION')) : [];
  allocs.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  const funded = -allocs.filter(t => !t.reversed_at).reduce((n, t) => n + toBase(t.amount_cents / 100, t.currency || cfg.base, cfg), 0);
  const target = toBase(project.contractValue || project.budget || 0, project.currency || cfg.base, cfg);
  const walletClientId = String(project.clientId || '');
  const clientRec = walletClientId && resourceFullyEnabled(a.config, 'clients') && canRead(a.role, 'clients') ? await getRecord(a.orgId, 'clients', walletClientId, scope) : null;
  const sb = await supabase();
  const { data: walletRow } = walletsOn && walletClientId ? await sb.from('wallets').select('*')
    .eq('organization_id', a.orgId).eq('client_id', walletClientId).maybeSingle() : { data: null };

  const totals = {
    originalBudget: sum(budgets, 'originalBudget'), committed: sum(budgets, 'committed'), actual: sum(budgets, 'actualToDate'),
    forecast: sum(budgets, 'forecastToComplete'), billed: sum(invoices, 'total'),
    received: clearedReceipts.reduce((t, r) => t + toBase(r.amount, r.currency || project.currency || cfg.base, cfg), 0),
    receivedFromInvoices: sum(invoices, 'amountPaid'),
    certified: sum(apps, 'netCertified'), variations: sum(grouped.changeOrders || [], 'amount'),
    tasksComplete: (grouped.tasks || []).filter(t => t.status === 'COMPLETE').length, tasksTotal: (grouped.tasks || []).length,
    walletFunded: funded, walletTarget: target, walletRemaining: Math.max(0, target - funded), walletFundingPct: target ? Math.min(100, Math.round(funded / target * 100)) : 0,
  };
  const originalCurrency = String(project.currency || cfg.base).toUpperCase();
  const contract = toBase(project.contractValue || project.budget || 0, originalCurrency, cfg);
  // Same cost basis as job profitability: the project's manual cost-to-date if
  // set, else approved budget lines, else posted supplier bills, reimbursed
  // expenses and approved timesheet labour.
  const postedBills = (grouped.apBills || []).filter(b => !['DRAFT', 'VOID'].includes(String(b.status || '').toUpperCase()));
  const postedExpenses = (grouped.expenses || []).filter(e => ['APPROVED', 'REIMBURSED'].includes(String(e.status || '').toUpperCase()));
  const postedTimesheets = (grouped.timesheets || []).filter(t => ['APPROVED', 'POSTED'].includes(String(t.status || '').toUpperCase()));
  const actualFromProject = toBase(project.costToDate || 0, originalCurrency, cfg);
  const actualFromLines = sum(budgets, 'actualToDate');
  const actualFromTransactions = sum(postedBills, 'total') + sum(postedExpenses, 'amount') + sum(postedTimesheets, 'labourCost');
  const cost = actualFromProject || actualFromLines || actualFromTransactions;
  return NextResponse.json({
    project: { ...project, clientName: clientRec?.name || clientRec?.title || null }, grouped, totals, currency: cfg.base,
    display: {
      currency: cfg.base, originalCurrency,
      contractValue: contract, costToDate: cost, margin: contract - cost,
    },
    wallet: walletsOn ? {
      clientId: walletClientId, clientName: clientRec?.name || clientRec?.title || null,
      balance: walletRow ? toBase(walletRow.balance_cents / 100, walletRow.currency || cfg.base, cfg) : null,
      currency: cfg.base, originalCurrency: walletRow?.currency || cfg.base,
      funded, remaining: Math.max(0, target - funded), target,
      transactions: allocs.slice(0, 50).map(t => ({
        id: t.id, amount: t.amount_cents / 100,
        amountBase: toBase(t.amount_cents / 100, t.currency || cfg.base, cfg),
        currency: t.currency || cfg.base, note: t.note, actorName: t.actor_name,
        reversedAt: t.reversed_at || null, createdAt: t.created_at,
      })),
      href: `/wallets?client=${encodeURIComponent(walletClientId)}`,
    } : null,
    defs: Object.fromEntries(related.map(r => [r, getResource(r)])),
  });
}
