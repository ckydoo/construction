/* Typed CRUD service over Prisma. All tenant data is org-scoped and validated
   against the declarative resource registry. */
import prisma from './db';
import { getResource, type ResourceDef, type Field } from './resources';

export type Row = Record<string, any> & { id:string; number?:string; title?:string; status?:string; projectId?:string; createdAt:string; updatedAt:string };

function coerce(field: Field, value: any): any {
  if (value === '' || value === undefined || value === null) return null;
  if (['number','currency','percent'].includes(field.type)) { const n = Number(value); return isFinite(n) ? n : null; }
  if (field.type === 'boolean') return Boolean(value) && value !== 'false';
  if (field.type === 'tags') return Array.isArray(value) ? value : String(value).split(',').map(s=>s.trim()).filter(Boolean);
  return value;
}

export function validate(def: ResourceDef, input: Record<string, any>): { ok:boolean; errors:Record<string,string>; clean:Record<string,any> } {
  const errors: Record<string,string> = {}; const clean: Record<string,any> = {};
  for (const f of def.fields) {
    const raw = input[f.key];
    const val = coerce(f, raw);
    clean[f.key] = val;
    if (f.required && (val === null || val === '' || (Array.isArray(val) && !val.length))) errors[f.key] = `${f.label} is required`;
    if (val !== null && ['number','currency','percent'].includes(f.type) && typeof val !== 'number') errors[f.key] = 'Enter a valid number';
    if (f.type === 'email' && val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(val))) errors[f.key] = 'Enter a valid email';
    if (f.options && val && !f.options.includes(String(val))) errors[f.key] = 'Choose a valid option';
  }
  return { ok:Object.keys(errors).length===0, errors, clean };
}

export async function validateRefs(orgId:string, def:ResourceDef, clean:Record<string,any>): Promise<Record<string,string>> {
  const errors:Record<string,string> = {};
  const refs = def.fields.filter(f => f.type==='ref' && f.ref && clean[f.key] !== null && clean[f.key] !== undefined && clean[f.key] !== '');
  await Promise.all(refs.map(async f => {
    const found = await prisma.record.findFirst({
      where:{ id:String(clean[f.key]), organizationId:orgId, resource:f.ref!, deletedAt:null },
      select:{ id:true },
    });
    if(!found) errors[f.key] = `${f.label} must link to an existing ${f.ref} record`;
  }));
  return errors;
}

function toRow(rec: any): Row {
  let data: Record<string,any> = {};
  try { data = JSON.parse(rec.data || '{}'); } catch {}
  return { ...data, id:rec.id, number:rec.number || undefined, title:rec.title || undefined,
    status:rec.status || undefined, projectId:rec.projectId || undefined,
    createdAt:rec.createdAt.toISOString(), updatedAt:rec.updatedAt.toISOString() };
}

async function nextNumber(orgId: string, def: ResourceDef): Promise<string> {
  const seq = await prisma.sequence.upsert({
    where: { organizationId_resource: { organizationId:orgId, resource:def.id } },
    create: { organizationId:orgId, resource:def.id, next:2 },
    update: { next: { increment:1 } },
  });
  return `${def.prefix}-${String(seq.next - 1).padStart(4,'0')}`;
}

export async function logActivity(orgId:string, userId:string|undefined, actor:string, action:string, resource:string|undefined, detail:string) {
  try { await prisma.auditLog.create({ data:{ organizationId:orgId, userId, actor, action, resource, detail } }); } catch {}
}

export type ListParams = { q?:string; status?:string; projectId?:string; page?:number; pageSize?:number; sort?:string; dir?:'asc'|'desc'; all?:boolean };

export async function listRecords(orgId:string, def:ResourceDef, p:ListParams) {
  const where: any = { organizationId:orgId, resource:def.id, deletedAt:null };
  if (p.status && p.status !== 'ALL') where.status = p.status;
  if (p.projectId && p.projectId !== 'ALL') where.projectId = p.projectId;
  if (p.q) {
    const q = p.q.trim();
    where.OR = [{ title:{contains:q} }, { number:{contains:q} }, { data:{contains:q} }];
  }
  const total = await prisma.record.count({ where });
  const pageSize = Math.min(Math.max(Number(p.pageSize)||25, 1), 500);
  const page = Math.max(Number(p.page)||1, 1);
  const baseColumns = ['id','createdAt','updatedAt','title','status','number','projectId'];
  const dataSort = !!p.sort && !baseColumns.includes(p.sort);
  const orderBy: any = dataSort
    ? { createdAt:'desc' }
    : { [p.sort || 'createdAt']: p.dir === 'asc' ? 'asc' : 'desc' };
  // Data-backed columns are sorted in memory: fetch everything, sort, THEN paginate.
  const pagination: { skip?:number; take:number } = (p.all || dataSort)
    ? { take:10000 }
    : { skip:(page-1)*pageSize, take:pageSize };
  const recs = await prisma.record.findMany({ where, orderBy, ...pagination });
  let rows = recs.map(toRow);
  if (dataSort) {
    rows.sort((a,b)=>{
      const av=a[p.sort!], bv=b[p.sort!];
      if (typeof av==='number' && typeof bv==='number') return p.dir==='asc'?av-bv:bv-av;
      return p.dir==='asc'?String(av??'').localeCompare(String(bv??'')):String(bv??'').localeCompare(String(av??''));
    });
    if(!p.all) rows = rows.slice((page-1)*pageSize, page*pageSize);
  }
  return { rows, total, page, pageSize, pages:Math.max(1,Math.ceil(total/pageSize)) };
}

export async function getRecord(orgId:string, resourceId:string, id:string) {
  const rec = await prisma.record.findFirst({ where:{ id, organizationId:orgId, resource:resourceId, deletedAt:null } });
  return rec ? toRow(rec) : null;
}

export async function refOptions(orgId:string, def:ResourceDef, limit=300) {
  const recs = await prisma.record.findMany({ where:{ organizationId:orgId, resource:def.id, deletedAt:null }, take:limit, orderBy:{createdAt:'desc'}, select:{id:true,title:true,number:true} });
  return recs.map(r=>({ value:r.id, label:r.title || r.number || r.id }));
}

export async function createRecord(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, input:Record<string,any>) {
  const v = validate(def, input);
  const refErrors = v.ok ? await validateRefs(orgId, def, v.clean) : {};
  if (!v.ok || Object.keys(refErrors).length) return { ok:false as const, errors:{ ...v.errors, ...refErrors } };
  const number = await nextNumber(orgId, def);
  const status = v.clean.status || def.statusOptions?.[0] || null;
  const projectId = v.clean.projectId || null;
  const title = String(v.clean[def.titleKey] || number);
  const clean = { ...v.clean, number, status, projectId };
  const rec = await prisma.record.create({ data:{
    organizationId:orgId, resource:def.id, number, title, status, projectId,
    data:JSON.stringify(clean), createdById:userId || null,
  }});
  await logActivity(orgId, userId, actor, 'CREATE', def.id, `Created ${def.singular.toLowerCase()} “${title}” (${number})`);
  return { ok:true as const, row:toRow(rec) };
}

export async function updateRecord(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, id:string, input:Record<string,any>) {
  const existing = await prisma.record.findFirst({ where:{id, organizationId:orgId, resource:def.id, deletedAt:null} });
  if (!existing) return { ok:false as const, errors:{ _:'Record not found' } };
  let prior:Record<string,any> = {};
  try { prior = JSON.parse(existing.data || '{}'); } catch {}
  // PATCH semantics: only supplied keys change; all other fields are preserved.
  const v = validate(def, { ...prior, ...input });
  const refErrors = v.ok ? await validateRefs(orgId, def, v.clean) : {};
  if (!v.ok || Object.keys(refErrors).length) return { ok:false as const, errors:{ ...v.errors, ...refErrors } };
  const status = v.clean.status || def.statusOptions?.[0] || null;
  const projectId = v.clean.projectId || null;
  const title = String(v.clean[def.titleKey] || existing.title || existing.number);
  const clean = { ...v.clean, number:existing.number, status, projectId };
  const rec = await prisma.record.update({ where:{id}, data:{ title, status, projectId, data:JSON.stringify(clean) } });
  await logActivity(orgId, userId, actor, 'UPDATE', def.id, `Updated ${def.singular.toLowerCase()} “${title}” (${existing.number})`);
  return { ok:true as const, row:toRow(rec) };
}

export async function deleteRecord(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, id:string) {
  const rec = await prisma.record.findFirst({ where:{id, organizationId:orgId, resource:def.id, deletedAt:null} });
  if (!rec) return { ok:false as const, error:'Record not found' };
  await prisma.record.update({ where:{id}, data:{ deletedAt:new Date() } });
  await logActivity(orgId, userId, actor, 'DELETE', def.id, `Deleted ${def.singular.toLowerCase()} “${rec.title}” (${rec.number})`);
  return { ok:true as const };
}

export async function deleteMany(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, ids:string[]) {
  const res = await prisma.record.updateMany({ where:{ id:{in:ids}, organizationId:orgId, resource:def.id, deletedAt:null }, data:{deletedAt:new Date()} });
  await logActivity(orgId, userId, actor, 'DELETE', def.id, `Deleted ${res.count} ${def.label.toLowerCase()}`);
  return { ok:true as const, count:res.count };
}

export async function statsFor(orgId:string) {
  const [all, audit, notifications] = await Promise.all([
    prisma.record.findMany({ where:{organizationId:orgId, deletedAt:null}, select:{resource:true,status:true,projectId:true,data:true} }),
    prisma.auditLog.findMany({ where:{organizationId:orgId}, take:12, orderBy:{createdAt:'desc'} }),
    prisma.notification.findMany({ where:{organizationId:orgId}, take:30, orderBy:{createdAt:'desc'} }),
  ]);
  const amounts: Record<string,number> = {};
  const statusCounts: Record<string,number> = {};
  for (const r of all) {
    let d:any={}; try{d=JSON.parse(r.data||'{}')}catch{}
    const val = Number(d.contractValue ?? d.total ?? d.amount ?? d.netCertified ?? d.bidValue ?? d.value ?? 0);
    if (val) amounts[r.resource] = (amounts[r.resource]||0)+val;
    const key = `${r.resource}:${r.status||'NONE'}`; statusCounts[key]=(statusCounts[key]||0)+1;
  }
  return { totalRecords:all.length, amounts, statusCounts, audit, notifications };
}
