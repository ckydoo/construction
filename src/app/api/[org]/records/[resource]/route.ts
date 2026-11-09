import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { canWrite } from '@/lib/catalog';
import { listRecords, createRecord, refOptions } from '@/lib/records';
import { csvCell } from '@/lib/format';
import { guardResource } from '@/lib/guard';

type Ctx = { params: Promise<{org:string;resource:string}> };
async function ctx(p: Promise<{org:string;resource:string}>) {
  const { org, resource } = await p;
  const a = await apiAuth(org);
  const def = getResource(resource);
  return { a, def, resource };
}
export async function GET(req: Request, { params }: Ctx) {
  const { a, def, resource } = await ctx(params);
  if (!a) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  if (!def) return NextResponse.json({ error:'Unknown resource' }, { status:404 });
  if (!a.config.resources.includes(resource)) return NextResponse.json({ error:'This module is not enabled for your workspace' }, { status:403 });
  const url = new URL(req.url);
  const qp = Object.fromEntries(url.searchParams);
  if (qp.mode === 'refs') return NextResponse.json({ options: await refOptions(a.orgId, def) });
  const result = await listRecords(a.orgId, def, {
    q:qp.q, status:qp.status, projectId:qp.projectId, page:Number(qp.page)||1,
    pageSize:Number(qp.pageSize)||25, sort:qp.sort, dir:(qp.dir as 'asc'|'desc'), all:qp.all==='1'||qp.mode==='csv',
  });
  if (qp.mode === 'csv') {
    const cols = def.fields.map(f=>({key:f.key,label:f.label}));
    const header = ['Record no.', ...cols.map(c=>c.label)].map(csvCell).join(',');
    const body = result.rows.map(r=>[r.number||'', ...cols.map(c=>csvCell(Array.isArray(r[c.key])?r[c.key].join('; '):r[c.key]))].join(',')).join('\n');
    return new NextResponse(`${header}\n${body}`, { headers:{ 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':`attachment; filename="${resource}.csv"` } });
  }
  return NextResponse.json(result);
}
export async function POST(req: Request, { params }: Ctx) {
  const { a, def, resource } = await ctx(params);
  if (!a) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  if (!def) return NextResponse.json({ error:'Unknown resource' }, { status:404 });
  const g = guardResource(a.config, resource); if (g) return g;
  if (!canWrite(a.role, def.id)) return NextResponse.json({ error:'Your role cannot create records here' }, { status:403 });
  const body = await req.json();
  const result = await createRecord(a.orgId, a.userId, a.name, def, body);
  if (!result.ok) return NextResponse.json({ error:'Validation failed', errors:result.errors }, { status:400 });
  return NextResponse.json({ row:result.row }, { status:201 });
}
