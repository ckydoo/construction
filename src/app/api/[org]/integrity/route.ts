/* Cross-module integrity check: every reference resolves, every derived figure
   reconciles and the wallet ledger matches its cached balance. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { capabilityGuard } from '@/lib/guard';
import { RESOURCES } from '@/lib/resources';
import { walletInvariant } from '@/lib/wallets';
import { fetchAll } from '@/lib/fetch';
import { resourceFullyEnabled, moduleEnabled } from '@/lib/module-visibility';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = capabilityGuard(a.role, 'integrity'); if (g) return g;

  const defs = RESOURCES.filter(r => resourceFullyEnabled(a.config, r.id));
  const walletsOn = moduleEnabled(a.config, 'wallets');
  const projectsOn = resourceFullyEnabled(a.config, 'projects');
  const ids = defs.map(r => r.id);
  const recs = ids.length ? await fetchAll('records', q => q
    .eq('organization_id', a.orgId).is('deleted_at', null).in('resource', ids),
    'id,resource,data,project_id') : [];
  const byRes = new Map<string, Set<string>>();
  for (const r of recs) { const set = byRes.get(r.resource) || new Set<string>(); set.add(r.id); byRes.set(r.resource, set); }
  const parsed = new Map<string, any>();
  for (const r of recs) parsed.set(r.id, r.data || {});

  const brokenRefs: any[] = [];
  let checkedRefs = 0;
  const exists = (resource: string, id: string) => !!byRes.get(resource)?.has(id);
  for (const r of recs) {
    const def = defs.find(d => d.id === r.resource); if (!def) continue;
    const d = parsed.get(r.id) || {};
    for (const f of def.fields) {
      if (f.type !== 'ref' || !f.ref || !d[f.key] || !resourceFullyEnabled(a.config, f.ref)) continue;
      checkedRefs++;
      if (!exists(f.ref, String(d[f.key]))) brokenRefs.push({ record: r.id, resource: r.resource, field: f.key, target: f.ref, value: String(d[f.key]).slice(-12) });
    }
    if (r.project_id && projectsOn) { checkedRefs++; if (!exists('projects', r.project_id)) brokenRefs.push({ record: r.id, resource: r.resource, field: 'projectId', target: 'projects', value: r.project_id.slice(-12) }); }
  }

  let walletMismatches: any[] = [], wallets: any[] = [], txns: any[] = [];
  if (walletsOn) [walletMismatches, wallets, txns] = await Promise.all([
    walletInvariant(a.orgId),
    fetchAll('wallets', q => q.eq('organization_id', a.orgId)),
    fetchAll('wallet_transactions', q => q.eq('organization_id', a.orgId), 'id,wallet_id,client_id,project_id,kind,amount_cents,reversed_at'),
  ]);
  const walletIds = new Set(wallets.map(w => w.id));
  const clientIds = byRes.get('clients') || new Set<string>();
  const projectIds = byRes.get('projects') || new Set<string>();
  const walletOrphans: any[] = [];
  for (const w of wallets) if (!clientIds.has(w.client_id)) walletOrphans.push({ wallet: w.id, clientId: w.client_id, reason: 'client record missing' });
  for (const t of txns) {
    if (!walletIds.has(t.wallet_id)) walletOrphans.push({ transaction: t.wallet_id, reason: 'wallet missing' });
    if (!clientIds.has(t.client_id)) walletOrphans.push({ transaction: t.wallet_id, reason: 'client missing' });
    if (t.project_id && !projectIds.has(t.project_id)) walletOrphans.push({ transaction: t.wallet_id, reason: 'project missing' });
  }

  // Derived project funding must equal active (non-reversed) allocations.
  const fundingMismatches: any[] = [];
  for (const pid of projectIds) {
    const expected = -txns.filter(t => t.project_id === pid && t.kind === 'ALLOCATION' && !t.reversed_at)
      .reduce((n, t) => n + t.amount_cents, 0) / 100;
    const actual = Number(parsed.get(pid)?.fundedAmount || 0);
    if (Math.abs(expected - actual) > 0.005) fundingMismatches.push({ projectId: pid, expected, actual });
  }

  const resourceMismatch = defs.flatMap(d => d.module && !moduleEnabled(a.config, d.module) ? [d.id] : []);
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
