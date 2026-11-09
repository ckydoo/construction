/* Reverse links: "what else in the ERP points at this record?" Powers the
   Linked records panel in the detail drawer and the connectivity audit. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { readGuard } from '@/lib/guard';
import { canRead } from '@/lib/catalog';
import { RESOURCE_MAP, RESOURCES } from '@/lib/resources';
import { buildScope, rowAllowed } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { fetchAll } from '@/lib/fetch';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; resource: string; id: string }> }) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org);
  const def = RESOURCE_MAP[resource];
  if (!a || !def) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const g = readGuard(a.config, a.role, resource); if (g) return g;
  const scope = await buildScope(a);
  const row = await getRecord(a.orgId, resource, id, scope);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const candidates = RESOURCES.filter(r =>
    a.config.resources.includes(r.id) && canRead(a.role, r.id) &&
    r.fields.some(f => f.ref === resource || (f.key === 'projectId' && resource === 'projects'))
  );
  const all = candidates.length ? await fetchAll('records', q => q
    .eq('organization_id', a.orgId).is('deleted_at', null)
    .in('resource', candidates.map(c => c.id)), 'id,resource,number,title,status,data,project_id') : [];

  const groups: any[] = [];
  for (const target of candidates) {
    const items: any[] = [];
    for (const r of all.filter(x => x.resource === target.id).slice(0, 2000)) {
      const d: any = r.data || {};
      const candidate = { id: r.id, ...d, projectId: r.project_id };
      const linked = target.fields.some(f =>
        (f.ref === resource && String(d[f.key] || '') === id) ||
        (f.key === 'projectId' && resource === 'projects' && r.project_id === id));
      if (!linked || !rowAllowed(scope, target.id, candidate)) continue;
      items.push({ id: r.id, title: r.title || d.name || r.number, number: r.number, status: r.status, href: `/m/${target.id}?open=${encodeURIComponent(r.id)}` });
    }
    if (items.length) groups.push({ resource: target.id, label: target.label, icon: target.icon, count: items.length, items: items.slice(0, 12) });
  }
  groups.sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));

  // Wallet ledger is a first-class linked module for clients and projects.
  let wallet: any = null;
  if (resource === 'clients' || resource === 'projects') {
    const txs = await fetchAll('wallet_transactions', q => q
      .eq('organization_id', a.orgId)
      .eq(resource === 'clients' ? 'client_id' : 'project_id', id));
    txs.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    const sb = await supabase();
    const { data: w } = await sb.from('wallets').select('*')
      .eq('organization_id', a.orgId).eq('client_id', id).maybeSingle();
    const active = txs.filter(t => t.kind === 'ALLOCATION' && !t.reversed_at);
    wallet = {
      balance: w ? w.balance_cents / 100 : null, currency: w?.currency || a.org.baseCurrency || 'USD',
      fundedToProjects: -active.reduce((n, t) => n + t.amount_cents, 0) / 100, count: txs.length,
      href: `/wallets?client=${encodeURIComponent(resource === 'clients' ? id : String(row.clientId || ''))}`,
      items: txs.slice(0, 12).map(t => ({ id: t.id, kind: t.kind, amount: t.amount_cents / 100, note: t.note, actorName: t.actor_name, createdAt: t.created_at })),
    };
  }
  return NextResponse.json({ record: { id, title: row.title, number: row.number }, groups, wallet });
}
