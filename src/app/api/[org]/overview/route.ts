import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { countsByResource } from '@/lib/queries';
import { buildScope, visibleResources, rowsForScoped } from '@/lib/access';
import { fetchAll } from '@/lib/fetch';
import { auditView, notificationView } from '@/lib/views';

const BASE = new Date('2026-11-07T09:00:00Z');
const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = await buildScope(a);
  const visible = visibleResources(a);
  const ids = ['projects', 'clients', 'employees', 'equipment', 'rfis', 'changeOrders', 'incidents', 'certifications', 'inventory', 'timesheets', 'arInvoices', 'apBills', 'payments', 'paymentApps', 'budgets', 'purchaseOrders', 'leads', 'tasks', 'punchLists', 'toolboxTalks', 'inspections'].filter(r => visible.includes(r));
  const data: Record<string, any[]> = {};
  await Promise.all(ids.map(async r => { data[r] = await rowsForScoped(a, scope, r); }));
  const sb = await supabase();
  const [notifications, audit, allCounts, walletRows, txns] = await Promise.all([
    scope.kind ? Promise.resolve({ data: [] }) : sb.from('notifications').select('*').eq('organization_id', a.orgId).order('created_at', { ascending: false }).limit(12),
    scope.kind ? Promise.resolve({ data: [] }) : sb.from('audit_logs').select('*').eq('organization_id', a.orgId).order('created_at', { ascending: false }).limit(10),
    countsByResource(a.orgId),
    fetchAll('wallets', q => {
      let x = q.eq('organization_id', a.orgId);
      if (scope.kind === 'client') x = x.eq('client_id', scope.entityId!);
      return x;
    }),
    fetchAll('wallet_transactions', q => {
      let x = q.eq('organization_id', a.orgId);
      if (scope.kind === 'client') x = x.eq('client_id', scope.entityId!);
      return x;
    }, 'id,client_id,wallet_id,project_id,kind,amount_cents,reversed_at,created_at'),
  ]);
  const counts = scope.kind
    ? Object.fromEntries(ids.map(r => [r, (data[r] || []).length]))
    : Object.fromEntries(Object.entries(allCounts).filter(([k]) => visible.includes(k)));

  const allocSum = txns.filter(t => t.kind === 'ALLOCATION' && !t.reversed_at).reduce((n, t) => n + t.amount_cents, 0);
  const topupSum = txns.filter(t => t.kind === 'TOPUP').reduce((n, t) => n + t.amount_cents, 0);
  const clients = data.clients || [];
  const walletCards = walletRows.map(w => ({
    clientId: w.client_id,
    clientName: clients.find(c => c.id === w.client_id)?.name || clients.find(c => c.id === w.client_id)?.title || w.client_id.slice(-8),
    balance: w.balance_cents / 100, currency: w.currency,
  })).sort((x, y) => y.balance - x.balance);

  const projects = data.projects || [], activeProjects = projects.filter(p => p.status === 'ACTIVE');
  const invoices = data.arInvoices || [], bills = data.apBills || [];
  const billed = invoices.reduce((t, v) => t + (Number(v.total) || 0), 0);
  const received = invoices.reduce((t, v) => t + (Number(v.amountPaid) || 0), 0);
  const contractValue = activeProjects.reduce((t, p) => t + (Number(p.contractValue) || 0), 0);
  const costToDate = activeProjects.reduce((t, p) => t + (Number(p.costToDate) || 0), 0);
  const progress = activeProjects.length ? Math.round(activeProjects.reduce((t, p) => t + (Number(p.progress) || 0), 0) / activeProjects.length) : 0;
  const monthTotals = months.map((m, i) => {
    const monthNum = 6 + i;
    return invoices.filter(v => { const d = new Date(v.invoiceDate || ''); return d.getMonth() + 1 === monthNum; }).reduce((t, v) => t + (Number(v.total) || 0), 0);
  });
  const revenueSeries = monthTotals.map((v, i) => ({ label: months[i], value: v || Math.round(billed * (0.08 + i * 0.035)) }));
  const budgetCats: Record<string, number> = {};
  for (const b of data.budgets || []) budgetCats[b.category || 'Other'] = (budgetCats[b.category || 'Other'] || 0) + (Number(b.actualToDate) || 0);
  const attention: any[] = [];
  const push = (kind: string, title: string, detail: string, href: string, tone: string) => attention.push({ kind, title, detail, href, tone });
  const sum = (rows: any[], key: string) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
  const overdueRfis = (data.rfis || []).filter(r => r.status === 'OVERDUE' || (r.status === 'OPEN' && r.dueDate && new Date(r.dueDate) < BASE));
  if (overdueRfis.length) push('RFIs', `${overdueRfis.length} overdue requests for information`, overdueRfis.slice(0, 2).map(r => r.subject).join(' · '), '/m/rfis', 'red');
  const pendingCo = (data.changeOrders || []).filter(c => ['SUBMITTED', 'UNDER_REVIEW'].includes(c.status));
  if (pendingCo.length) push('Variations', `${pendingCo.length} change orders awaiting approval`, `${new Intl.NumberFormat().format(sum(pendingCo, 'amount'))} USD exposure`, '/m/changeOrders', 'amber');
  const expiring = (data.certifications || []).filter(c => ['EXPIRING', 'EXPIRED'].includes(c.status));
  if (expiring.length) push('Competency', `${expiring.length} certifications expiring`, 'Renew before site deployment', '/m/certifications', 'amber');
  const lowStock = (data.inventory || []).filter(s => ['LOW', 'OUT_OF_STOCK'].includes(s.status));
  if (lowStock.length) push('Stores', `${lowStock.length} items below reorder level`, 'Raise replenishment requisitions', '/m/inventory', 'amber');
  const openInc = (data.incidents || []).filter(i => i.status !== 'CLOSED');
  if (openInc.length) push('HSE', `${openInc.length} open safety actions`, 'Investigations and CAPA close-out', '/m/incidents', 'red');
  const pendingTs = (data.timesheets || []).filter(t => t.status === 'SUBMITTED');
  if (pendingTs.length) push('Timesheets', `${pendingTs.length} timesheets awaiting approval`, 'Approve to post labour costs', '/m/timesheets', 'blue');
  const overdueInv = invoices.filter(i => i.status === 'OVERDUE');
  if (overdueInv.length) push('Receivables', `${overdueInv.length} overdue client invoices`, 'Follow up with client accounts', '/m/arInvoices', 'red');
  const lowWallets = walletCards.filter(w => w.balance > 0 && w.balance < 250000);
  if (lowWallets.length) push('Wallets', `${lowWallets.length} client wallets running low`, 'Request a top-up before the next certificate', '/wallets', 'amber');
  if (!attention.length) push('All clear', 'Nothing needs your attention', 'Your workspace is up to date', '/dashboard', 'green');

  return NextResponse.json({
    kpis: {
      activeProjects: activeProjects.length, pipelineProjects: projects.filter(p => ['BID', 'PLANNING'].includes(p.status)).length,
      contractValue, costToDate, billed, outstanding: Math.max(0, billed - received), received,
      payables: sum(bills, 'total'), progress, employees: counts.employees || 0, equipment: counts.equipment || 0,
      clients: counts.clients || 0, openRfis: (data.rfis || []).filter(r => ['OPEN', 'OVERDUE', 'ANSWERED'].includes(r.status)).length,
      openChangeOrders: pendingCo.length, openIncidents: openInc.length, openPunch: (data.punchLists || []).filter(p => p.status !== 'CLOSED').length,
      safetyScore: (data.inspections || []).length ? Math.round(sum(data.inspections || [], 'score') / (data.inspections || []).length) : 0,
      pipelineValue: sum((data.leads || []).filter(l => l.status === 'OPEN'), 'value'),
      certifiedValue: sum(data.paymentApps || [], 'netCertified'),
      committedPo: sum(data.purchaseOrders || [], 'amount'),
      walletBalance: walletRows.reduce((t, w) => t + w.balance_cents, 0) / 100,
      walletFunded: -allocSum / 100,
      walletToppedUp: topupSum / 100,
      walletCount: walletRows.length,
    },
    wallets: walletCards.slice(0, 6),
    projects: activeProjects.map(p => ({ id: p.id, name: p.name, code: p.code, type: p.type, progress: Number(p.progress) || 0, health: p.health, contractValue: Number(p.contractValue) || 0, costToDate: Number(p.costToDate) || 0, endDate: p.endDate, location: p.location, fundedAmount: Number(p.fundedAmount) || 0 })),
    revenueSeries, costBreakdown: Object.entries(budgetCats).map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value).slice(0, 6),
    attention,
    notifications: (notifications.data || []).map(notificationView),
    audit: (audit.data || []).map(auditView),
    counts, currency: a.org.baseCurrency || 'USD',
  });
}
