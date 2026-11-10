/* Reverse links: "what else in the ERP points at this record?" Powers the
   Linked records panel in the detail drawer and the connectivity audit.
   Each register is queried on the database by its reference key, so a large
   workspace does not load every row into the API process. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { readGuard } from '@/lib/guard';
import { canRead } from '@/lib/catalog';
import { RESOURCE_MAP, RESOURCES } from '@/lib/resources';
import { buildScope, rowAllowed } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { fetchAll } from '@/lib/fetch';

function linkOr(resource:string, id:string, fields:{ref?:string;key:string}[]){
  const safe=String(id).replace(/["\\]/g,'');
  if(!safe) return '';
  const parts=fields.filter(f=>f.ref===resource).map(f=>`data->>${f.key}.eq."${safe}"`);
  if(resource==='projects') parts.push(`project_id.eq."${safe}"`);
  return parts.join(',');
}

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
  const sb = await supabase();
  const groups: any[] = await Promise.all(candidates.map(async target => {
    const or = linkOr(resource, id, target.fields);
    if(!or) return null;
    const { data:linked, error, count } = await sb.from('records')
      .select('id,resource,number,title,status,data,project_id', { count:'exact' })
      .eq('organization_id', a.orgId).eq('resource', target.id).is('deleted_at', null)
      .or(or).order('created_at', { ascending:false })
      .limit(scope.kind ? 200 : 12);
    if(error) throw error;
    const items=(linked||[]).filter(r => {
      if(!scope.kind) return true;
      return rowAllowed(scope, target.id, { id:r.id, ...(r.data||{}), projectId:r.project_id });
    }).slice(0,12).map(r => ({
      id:r.id, title:r.title || r.data?.name || r.number, number:r.number, status:r.status,
      href: target.id === 'projects'
        ? `/projects/${encodeURIComponent(r.id)}`
        : `/m/${target.id}?open=${encodeURIComponent(r.id)}`,
    }));
    if(!items.length) return null;
    return { resource:target.id, label:target.label, icon:target.icon,
      count: scope.kind ? items.length : (count ?? items.length), items };
  })).then(list => list.filter(Boolean).sort((x:any,y:any)=>y.count-x.count||x.label.localeCompare(y.label)));

  // Wallet ledger is a first-class linked module for clients and projects.
  let wallet: any = null;
  if (resource === 'clients' || resource === 'projects') {
    const txs = await fetchAll('wallet_transactions', q => q
      .eq('organization_id', a.orgId)
      .eq(resource === 'clients' ? 'client_id' : 'project_id', id),
      'id,kind,amount_cents,note,actor_name,created_at,reversed_at');
    txs.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
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
