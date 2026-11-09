/* Cross-module integrity check: every reference resolves, every derived figure
   reconciles and the wallet ledger matches its cached balance. */
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { capabilityGuard } from '@/lib/guard';
import { RESOURCES } from '@/lib/resources';
import { walletInvariant } from '@/lib/wallets';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = capabilityGuard(a.role, 'integrity'); if (g) return g;

  const defs = RESOURCES.filter(r => a.config.resources.includes(r.id));
  const ids = defs.map(r => r.id);
  const recs = await prisma.record.findMany({
    where: { organizationId: a.orgId, deletedAt: null, resource: { in: ids } },
    select: { id: true, resource: true, data: true, projectId: true },
  });
  const byRes = new Map<string, Set<string>>();
  for (const r of recs) { const set = byRes.get(r.resource) || new Set<string>(); set.add(r.id); byRes.set(r.resource, set); }
  const parsed = new Map<string, any>();
  for (const r of recs) { try { parsed.set(r.id, JSON.parse(r.data || '{}')); } catch { parsed.set(r.id, {}); } }

  const brokenRefs: any[] = [];
  let checkedRefs = 0;
  const exists = (resource: string, id: string) => !!byRes.get(resource)?.has(id);
  for (const r of recs) {
    const def = defs.find(d => d.id === r.resource); if (!def) continue;
    const d = parsed.get(r.id) || {};
    for (const f of def.fields) {
      if (f.type !== 'ref' || !f.ref || !d[f.key]) continue;
      checkedRefs++;
      if (!exists(f.ref, String(d[f.key]))) brokenRefs.push({ record: r.id, resource: r.resource, field: f.key, target: f.ref, value: String(d[f.key]).slice(-12) });
    }
    if (r.projectId) { checkedRefs++; if (!exists('projects', r.projectId)) brokenRefs.push({ record: r.id, resource: r.resource, field: 'projectId', target: 'projects', value: r.projectId.slice(-12) }); }
  }

  const walletMismatches = await walletInvariant(a.orgId);
  const wallets = await prisma.wallet.findMany({ where: { organizationId: a.orgId } });
  const txns = await prisma.walletTransaction.findMany({ where: { organizationId: a.orgId }, select: { projectId: true, clientId: true, walletId: true } });
  const walletIds = new Set(wallets.map(w => w.id));
  const clientIds = byRes.get('clients') || new Set<string>();
  const projectIds = byRes.get('projects') || new Set<string>();
  const walletOrphans: any[] = [];
  for (const w of wallets) if (!clientIds.has(w.clientId)) walletOrphans.push({ wallet: w.id, clientId: w.clientId, reason: 'client record missing' });
  for (const t of txns) {
    if (!walletIds.has(t.walletId)) walletOrphans.push({ transaction: t.walletId, reason: 'wallet missing' });
    if (!clientIds.has(t.clientId)) walletOrphans.push({ transaction: t.walletId, reason: 'client missing' });
    if (t.projectId && !projectIds.has(t.projectId)) walletOrphans.push({ transaction: t.walletId, reason: 'project missing' });
  }

  // Derived project funding must equal active (non-reversed) allocations.
  const fundingMismatches: any[] = [];
  for (const pid of projectIds) {
    const agg = await prisma.walletTransaction.aggregate({ where: { organizationId: a.orgId, projectId: pid, kind: 'ALLOCATION', reversedAt: null }, _sum: { amountCents: true } });
    const expected = -(agg._sum.amountCents || 0) / 100;
    const rec = recs.find(r => r.id === pid);
    const actual = Number((rec && parsed.get(pid)?.fundedAmount) || 0);
    if (Math.abs(expected - actual) > 0.005) fundingMismatches.push({ projectId: pid, expected, actual });
  }

  const resourceMismatch = defs.flatMap(d => d.module && !a.config.modules.includes(d.module) ? [d.id] : []);
  const ok = !brokenRefs.length && !walletMismatches.length && !walletOrphans.length && !fundingMismatches.length && !resourceMismatch.length;
  return NextResponse.json({
    ok, checkedRecords: recs.length, checkedRefs,
    brokenRefs: brokenRefs.slice(0, 25), brokenRefCount: brokenRefs.length,
    walletMismatches, walletOrphans: walletOrphans.slice(0, 25), walletOrphanCount: walletOrphans.length,
    fundingMismatches, resourceMismatch,
    wallets: wallets.length, ledgerEntries: txns.length,
    role: a.role, generatedAt: new Date().toISOString(),
  });
}
