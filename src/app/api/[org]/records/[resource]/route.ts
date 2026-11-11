import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { readGuard, writeGuard, capabilityGuard, billingGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { listRecords, createRecord, refOptions } from '@/lib/records';
import { csvCell } from '@/lib/format';

type Ctx = { params: Promise<{ org: string; resource: string }> };
async function ctx(p: Promise<{ org: string; resource: string }>) {
  const { org, resource } = await p;
  const a = await apiAuth(org);
  const def = getResource(resource);
  return { a, def, resource };
}

export async function GET(req: Request, { params }: Ctx) {
  const { a, def, resource } = await ctx(params);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });
  const g = readGuard(a.config, a.role, resource); if (g) return g;
  const scope = await buildScope(a);
  const url = new URL(req.url);
  const qp = Object.fromEntries(url.searchParams);
  if (qp.mode === 'refs') {
    const ids = qp.ids ? qp.ids.split(',').map(s=>s.trim()).filter(Boolean).slice(0, 500) : undefined;
    const limit = Number(qp.limit) || 300;
    return NextResponse.json({ options: await refOptions(a.orgId, def, limit, scope, qp.q, ids) });
  }
  const result = await listRecords(a.orgId, def, {
    q: qp.q, status: qp.status, projectId: qp.projectId, page: Number(qp.page) || 1,
    pageSize: Number(qp.pageSize) || 25, sort: qp.sort, dir: (qp.dir as 'asc' | 'desc'),
    all: qp.all === '1' || qp.mode === 'csv',
  }, scope);
  if (qp.mode === 'csv') {
    const eg = capabilityGuard(a.role, 'exports'); if (eg) return eg;
    const cols = def.fields.filter(f => !f.hidden).map(f => ({ key: f.key, label: f.label }));
    const header = ['Record no.', ...cols.map(c => c.label)].map(csvCell).join(',');
    const body = result.rows.map(r => [r.number || '', ...cols.map(c => csvCell(Array.isArray(r[c.key]) ? r[c.key].join('; ') : r[c.key]))].join(',')).join('\n');
    return new NextResponse(`${header}\n${body}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${resource}.csv"` } });
  }
  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: Ctx) {
  const { a, def, resource } = await ctx(params);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });
  const g = billingGuard(a, { write: true }) || writeGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'records.create'); if (g) return g;
  const body = await req.json();
  const result = await createRecord(a.orgId, a.userId, a.name, def, body, a.config.limits);
  if (!result.ok) return NextResponse.json({ error: 'Validation failed', errors: result.errors }, { status: result.status || 400 });
  return NextResponse.json({ row: result.row }, { status: 201 });
}
