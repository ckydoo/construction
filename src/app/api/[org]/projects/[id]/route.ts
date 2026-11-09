import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { readGuard, capabilityGuard } from '@/lib/guard';
import { canRead } from '@/lib/catalog';
import { getResource } from '@/lib/resources';
import { getRecord } from '@/lib/records';
import { buildScope, rowAllowed, rowsForScoped } from '@/lib/access';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, 'projects') || capabilityGuard(a.role, 'project360'); if (g) return g;
  const scope = await buildScope(a);
  const project = await getRecord(a.orgId, 'projects', id, scope);
  if (!project) return NextResponse.json({ error: 'Project not found' }, scope.kind ? { status: 403 } : { status: 404 });
  const related = ['tasks', 'contracts', 'changeOrders', 'rfis', 'submittals', 'documents', 'dailyLogs', 'meetings', 'punchLists', 'permits', 'budgets', 'arInvoices', 'paymentApps', 'purchaseOrders', 'timesheets', 'incidents', 'inspections', 'ncrs', 'equipment', 'crews', 'expenses']
    .filter(r => a.config.resources.includes(r) && canRead(a.role, r));
  const grouped: Record<string, any[]> = {};
  await Promise.all(related.map(async r => { grouped[r] = await rowsForScoped(a, scope, r); }));
  for (const k of Object.keys(grouped)) grouped[k] = grouped[k].filter(x => x.projectId === id);
  const budgets = grouped.budgets || [], invoices = grouped.arInvoices || [], apps = grouped.paymentApps || [];
  const sum = (rows: any[], key: string) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);

  const allocs = await prisma.walletTransaction.findMany({ where: { organizationId: a.orgId, projectId: id, kind: 'ALLOCATION' }, orderBy: { createdAt: 'desc' }, take: 50 });
  const funded = -allocs.filter(t => !t.reversedAt).reduce((n, t) => n + t.amountCents, 0) / 100;
  const target = Number(project.contractValue || project.budget || 0);
  const walletClientId = String(project.clientId || '');
  const clientRec = walletClientId ? await getRecord(a.orgId, 'clients', walletClientId, scope) : null;
  const walletRow = walletClientId ? await prisma.wallet.findUnique({ where: { organizationId_clientId: { organizationId: a.orgId, clientId: walletClientId } } }) : null;

  const totals = {
    originalBudget: sum(budgets, 'originalBudget'), committed: sum(budgets, 'committed'), actual: sum(budgets, 'actualToDate'),
    forecast: sum(budgets, 'forecastToComplete'), billed: sum(invoices, 'total'), received: sum(invoices, 'amountPaid'),
    certified: sum(apps, 'netCertified'), variations: sum(grouped.changeOrders || [], 'amount'),
    tasksComplete: (grouped.tasks || []).filter(t => t.status === 'COMPLETE').length, tasksTotal: (grouped.tasks || []).length,
    walletFunded: funded, walletTarget: target, walletRemaining: Math.max(0, target - funded), walletFundingPct: target ? Math.min(100, Math.round(funded / target * 100)) : 0,
  };
  return NextResponse.json({
    project, grouped, totals,
    wallet: {
      clientId: walletClientId, clientName: clientRec?.name || clientRec?.title || null,
      balance: walletRow ? walletRow.balanceCents / 100 : null, currency: walletRow?.currency || a.org.baseCurrency || 'USD',
      funded, remaining: Math.max(0, target - funded), target,
      transactions: allocs.map(t => ({ id: t.id, amount: t.amountCents / 100, note: t.note, actorName: t.actorName,
        reversedAt: t.reversedAt ? t.reversedAt.toISOString() : null, createdAt: t.createdAt.toISOString() })),
      href: `/wallets?client=${encodeURIComponent(walletClientId)}`,
    },
    defs: Object.fromEntries(related.map(r => [r, getResource(r)])),
  });
}
