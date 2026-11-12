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
    const cols = def.fields.filter(f => !f.hidden);
    // Resolve names only through the same module, role and row-scope checks as
    // the corresponding reference endpoint. Keep IDs as separate columns.
    const labels: Record<string, Map<string, string>> = {};
    for (const f of cols) {
      if (f.type !== 'ref' || !f.ref || labels[f.ref]) continue;
      const target = getResource(f.ref);
      labels[f.ref] = new Map();
      if (!target || readGuard(a.config, a.role, f.ref)) continue;
      const keys = cols.filter(c => c.type === 'ref' && c.ref === f.ref).map(c => c.key);
      const ids = Array.from(new Set(result.rows.flatMap(r => keys.map(k => String(r[k] || '')).filter(Boolean))));
      for (let i = 0; i < ids.length; i += 500) {
        for (const option of await refOptions(a.orgId, target, 500, scope, undefined, ids.slice(i, i + 500))) {
          labels[f.ref].set(option.value, option.label);
        }
      }
    }
    const header = ['Record no.', ...cols.flatMap(c => c.type === 'ref' ? [c.label, `${c.label} ID`] : [c.label])].map(csvCell).join(',');
    const body = result.rows.map(r => [csvCell(r.number || ''), ...cols.flatMap(c => {
      const value = r[c.key];
      if (c.type === 'ref') return [csvCell(labels[c.ref || '']?.get(String(value || '')) || ''), csvCell(value)];
      // Structured lines remain valid JSON instead of JavaScript's "[object Object]".
      if (Array.isArray(value) && value.every(v => typeof v !== 'object' || v === null)) return [csvCell(value.join('; '))];
      return [csvCell(value)];
    })].join(',')).join('\n');
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
  const result = await createRecord(a.orgId, a.userId, a.name, def, body, a.config.limits, a.config.tax);
  if (!result.ok) return NextResponse.json({ error: 'Validation failed', errors: result.errors }, { status: result.status || 400 });
  return NextResponse.json({ row: result.row }, { status: 201 });
}
