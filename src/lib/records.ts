/* Typed CRUD service over Supabase Postgres.
 * All queries use the caller's cookie-bound client, so RLS (0003_rbac.sql)
 * enforces org membership, enabled module, role, capability and portal scope.
 * Guard helpers in guard.ts are only a friendly pre-flight check. */
import { randomUUID } from 'node:crypto';
import { supabase, unwrap, dbError } from './supabase';
import { fetchAll } from './fetch';
import { type ResourceDef, type Field } from './resources';
import { rowAllowed, type Scope } from './access';
import { normaliseLines, financialTotalsPatch } from './financial';

export type Row = Record<string, any> & { id:string; number?:string; title?:string; status?:string; projectId?:string; createdAt:string; updatedAt:string };

function coerce(field: Field, value: any): any {
  if (value === '' || value === undefined || value === null) return null;
  if (['number','currency','percent'].includes(field.type)) { const n = Number(value); return isFinite(n) ? n : null; }
  if (field.type === 'boolean') return Boolean(value) && value !== 'false';
  if (field.type === 'tags') return Array.isArray(value) ? value : String(value).split(',').map(s=>s.trim()).filter(Boolean);
  if (field.type === 'items') return normaliseLines(value);
  return value;
}

export function validate(def: ResourceDef, input: Record<string, any>): { ok:boolean; errors:Record<string,string>; clean:Record<string,any> } {
  const errors: Record<string,string> = {}; const clean: Record<string,any> = {};
  for (const f of def.fields) {
    // Derived fields are owned by their source module (wallet ledger, etc.).
    if (f.readOnly) { clean[f.key] = input[f.key] ?? null; continue; }
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

export { fetchAll } from './fetch';

export async function validateRefs(orgId:string, def:ResourceDef, clean:Record<string,any>): Promise<Record<string,string>> {
  const errors:Record<string,string> = {};
  const refs = def.fields.filter(f => f.type==='ref' && f.ref && clean[f.key] !== null && clean[f.key] !== undefined && clean[f.key] !== '');
  const sb = await supabase();
  await Promise.all(refs.map(async f => {
    const { data } = await sb.from('records').select('id')
      .eq('organization_id', orgId).eq('resource', f.ref!)
      .eq('id', String(clean[f.key])).is('deleted_at', null).maybeSingle();
    if (!data) errors[f.key] = `${f.label} must link to an existing ${f.ref} record`;
  }));
  return errors;
}

export function toRow(rec: any): Row {
  const data: Record<string,any> = (rec.data && typeof rec.data === 'object') ? rec.data : {};
  return { ...data, id:rec.id, number:rec.number || undefined, title:rec.title || undefined,
    status:rec.status || undefined, projectId:rec.project_id || undefined,
    createdAt:rec.created_at, updatedAt:rec.updated_at };
}

async function nextNumber(orgId: string, def: ResourceDef): Promise<string> {
  const sb = await supabase();
  const { data, error } = await sb.rpc('app_next_number', { p_org: orgId, p_resource: def.id, p_prefix: def.prefix });
  if (error) dbError(error);
  return String(data);
}

export async function logActivity(orgId:string, userId:string|undefined, actor:string, action:string, resource:string|undefined, detail:string) {
  try {
    const sb = await supabase();
    await sb.rpc('app_log_activity', { p_org: orgId, p_actor: actor, p_action: action, p_resource: resource || null, p_detail: detail });
  } catch { /* auditing must never break the business operation */ }
}

export async function notify(orgId: string, title: string, body: string, kind = 'INFO', href: string | null = null) {
  try {
    const sb = await supabase();
    await sb.rpc('app_notify', { p_org: orgId, p_title: title, p_body: body, p_kind: kind, p_href: href });
  } catch { /* noop */ }
}

export type ListParams = { q?:string; status?:string; projectId?:string; page?:number; pageSize?:number; sort?:string; dir?:'asc'|'desc'; all?:boolean };

/** PostgREST `or`/`ilike` syntax uses commas, parens and wildcards as control characters. */
function safeLike(input:string){
  return input.replace(/[,()%*\\'"]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
}
/** One trigram-indexed column holds title, number and every data value. */
function searchOr(needle:string){
  const like=safeLike(needle);
  return like ? `search_text.ilike.*${like}*` : '';
}
const DB_SORT:Record<string,string> = {
  id:'id', createdAt:'created_at', updatedAt:'updated_at', title:'title',
  status:'status', number:'number', projectId:'project_id',
};

export async function listRecords(orgId:string, def:ResourceDef, p:ListParams, scope?:Scope) {
  const pageSize = Math.min(Math.max(Number(p.pageSize)||25, 1), 500);
  const page = Math.max(Number(p.page)||1, 1);
  const q = (p.q || '').trim();
  const sortKey = p.sort || 'createdAt';
  const dbSort = DB_SORT[sortKey];
  // Fast path: push filter, search, ordering, count and the page window into
  // Postgres. RLS applies to the cookie-bound client; the JS scope check is
  // kept as defence in depth on the returned page.
  const serverPage = !p.all && !!dbSort;
  if (serverPage) {
    const sb = await supabase();
    let query = sb.from('records').select('*', { count:'exact' })
      .eq('organization_id', orgId).eq('resource', def.id).is('deleted_at', null);
    if (p.status && p.status !== 'ALL') query = query.eq('status', p.status);
    if (p.projectId && p.projectId !== 'ALL') query = query.eq('project_id', p.projectId);
    const or = searchOr(q);
    if (or) query = query.or(or);
    query = query.order(dbSort, { ascending: p.dir === 'asc', nullsFirst:false })
      .order('id', { ascending:true })
      .range((page-1)*pageSize, page*pageSize-1);
    const { data, error, count } = await query;
    if (error) dbError(error);
    const rows = (data||[]).map(toRow).filter(r => !scope?.kind || rowAllowed(scope, def.id, r));
    const total = count ?? rows.length;
    return { rows, total, page, pageSize, pages:Math.max(1,Math.ceil(total/pageSize)) };
  }
  // Fallback: JSON-field sorting, CSV / full export and exact portal scoping.
  const recs = await fetchAll('records', x => {
    let y = x.eq('organization_id', orgId).eq('resource', def.id).is('deleted_at', null);
    if (p.status && p.status !== 'ALL') y = y.eq('status', p.status);
    if (p.projectId && p.projectId !== 'ALL') y = y.eq('project_id', p.projectId);
    return y;
  });
  let rows = recs.map(toRow);
  const needle = q.toLowerCase();
  if (needle) rows = rows.filter(r => `${r.title || ''} ${r.number || ''} ${JSON.stringify(r)}`.toLowerCase().includes(needle));
  if (scope?.kind) rows = rows.filter(r => rowAllowed(scope, def.id, r));
  if (sortKey && !DB_SORT[sortKey]) {
    rows.sort((a,b)=>{
      const av=a[sortKey], bv=b[sortKey];
      if (typeof av==='number' && typeof bv==='number') return p.dir==='asc'?av-bv:bv-av;
      return p.dir==='asc'?String(av??'').localeCompare(String(bv??'')):String(bv??'').localeCompare(String(av??''));
    });
  } else {
    const key = sortKey;
    rows.sort((a,b)=>{
      const av=String(a[key]??''), bv=String(b[key]??'');
      return p.dir==='asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }
  const total = rows.length;
  const window = p.all ? rows : rows.slice((page-1)*pageSize, page*pageSize);
  return { rows: window, total, page, pageSize, pages:Math.max(1,Math.ceil(total/pageSize)) };
}

export async function getRecord(orgId:string, resourceId:string, id:string, scope?:Scope) {
  const sb = await supabase();
  const { data: rec, error } = await sb.from('records').select('*')
    .eq('organization_id', orgId).eq('resource', resourceId).eq('id', id)
    .is('deleted_at', null).maybeSingle();
  if (error) dbError(error);
  if (!rec) return null;
  const row = toRow(rec);
  if (scope?.kind && !rowAllowed(scope, resourceId, row)) return null;
  return row;
}

export async function refOptions(orgId:string, def:ResourceDef, limit=300, scope?:Scope, q?:string, ids?:string[]) {
  const sb = await supabase();
  const cap = Math.min(Math.max(Number(limit)||300, 1), 500);
  let query = sb.from('records').select('id,title,number,data,project_id')
    .eq('organization_id', orgId).eq('resource', def.id).is('deleted_at', null);
  if (ids && ids.length) {
    query = query.in('id', ids.slice(0, 500));
  } else {
    const or = searchOr(q || '');
    if (or) query = query.or(or);
    query = query.order('title', { ascending:true }).order('id', { ascending:true }).range(0, cap-1);
  }
  const { data:recs, error } = await query;
  if (error) dbError(error);
  let rows = (recs||[]).map(r => ({ value:r.id, label:r.title || r.number || r.id,
    _row:{ id:r.id, ...(r.data||{}), projectId:r.project_id } }));
  if (scope?.kind) rows = rows.filter(r => rowAllowed(scope, def.id, r._row));
  return rows.map(r => ({ value:r.value, label:r.label }));
}

export async function createRecord(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, input:Record<string,any>) {
  const v = validate(def, { ...input, ...financialTotalsPatch(def.id, input, normaliseLines(input.items)) });
  const refErrors = v.ok ? await validateRefs(orgId, def, v.clean) : {};
  if (!v.ok || Object.keys(refErrors).length) return { ok:false as const, errors:{ ...v.errors, ...refErrors } };
  const number = await nextNumber(orgId, def);
  const status = v.clean.status || def.statusOptions?.[0] || null;
  const projectId = v.clean.projectId || null;
  const title = String(v.clean[def.titleKey] || number);
  const clean: Record<string,any> = { ...v.clean, number, status, projectId };
  for (const f of def.fields) if (f.readOnly) clean[f.key] = null;

  const sb = await supabase();
  const { data: rec, error } = await sb.from('records').insert({
    id: randomUUID(), organization_id: orgId, resource: def.id, number, title,
    status, project_id: projectId, data: clean, created_by_id: userId || null,
  }).select('*').single();
  if (error) dbError(error);
  await logActivity(orgId, userId, actor, 'CREATE', def.id, `Created ${def.singular.toLowerCase()} “${title}” (${number})`);
  return { ok:true as const, row:toRow(rec) };
}

export async function updateRecord(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, id:string, input:Record<string,any>) {
  const sb = await supabase();
  const { data: existing } = await sb.from('records').select('*')
    .eq('id', id).eq('organization_id', orgId).eq('resource', def.id)
    .is('deleted_at', null).maybeSingle();
  if (!existing) return { ok:false as const, errors:{ _:'Record not found' } };
  const prior: Record<string,any> = (existing.data && typeof existing.data === 'object') ? existing.data : {};
  // PATCH semantics: only supplied keys change; all other fields are preserved.
  // When the structured line editor is used, derive net/VAT/total from its rows;
  // older records with no structured lines keep their stored amounts.
  const suppliedLines = normaliseLines(input.items);
  const derived = suppliedLines.length ? financialTotalsPatch(def.id, { ...prior, ...input }, suppliedLines) : {};
  const v = validate(def, { ...prior, ...input, ...derived });
  const refErrors = v.ok ? await validateRefs(orgId, def, v.clean) : {};
  if (!v.ok || Object.keys(refErrors).length) return { ok:false as const, errors:{ ...v.errors, ...refErrors } };
  const status = v.clean.status || def.statusOptions?.[0] || null;
  const projectId = v.clean.projectId || null;
  const title = String(v.clean[def.titleKey] || existing.title || existing.number);
  const clean: Record<string,any> = { ...v.clean, number:existing.number, status, projectId };
  for (const f of def.fields) if (f.readOnly) clean[f.key] = prior[f.key] ?? null;

  const { data: rec, error } = await sb.from('records')
    .update({ title, status, project_id: projectId, data: clean })
    .eq('id', id).select('*').single();
  if (error) dbError(error);
  await logActivity(orgId, userId, actor, 'UPDATE', def.id, `Updated ${def.singular.toLowerCase()} “${title}” (${existing.number})`);
  return { ok:true as const, row:toRow(rec) };
}

export async function deleteRecord(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, id:string) {
  const sb = await supabase();
  const { data: rec } = await sb.from('records').select('id,title,number')
    .eq('id', id).eq('organization_id', orgId).eq('resource', def.id).is('deleted_at', null).maybeSingle();
  if (!rec) return { ok:false as const, error:'Record not found' };
  const { error } = await sb.from('records').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) dbError(error);
  await logActivity(orgId, userId, actor, 'DELETE', def.id, `Deleted ${def.singular.toLowerCase()} “${rec.title}” (${rec.number})`);
  return { ok:true as const };
}

export async function deleteMany(orgId:string, userId:string|undefined, actor:string, def:ResourceDef, ids:string[]) {
  const sb = await supabase();
  const { data, error } = await sb.from('records').update({ deleted_at: new Date().toISOString() })
    .in('id', ids).eq('organization_id', orgId).eq('resource', def.id)
    .is('deleted_at', null).select('id');
  if (error) dbError(error);
  await logActivity(orgId, userId, actor, 'DELETE', def.id, `Deleted ${data?.length || 0} ${def.label.toLowerCase()}`);
  return { ok:true as const, count: data?.length || 0 };
}

export async function statsFor(orgId:string) {
  const sb = await supabase();
  const [all, audit, notifications] = await Promise.all([
    fetchAll('records', q => q.eq('organization_id', orgId).is('deleted_at', null), 'resource,status,project_id,data'),
    unwrap(await sb.from('audit_logs').select('*').eq('organization_id', orgId).order('created_at', { ascending:false }).limit(12)) || [],
    unwrap(await sb.from('notifications').select('*').eq('organization_id', orgId).order('created_at', { ascending:false }).limit(30)) || [],
  ]);
  const amounts: Record<string,number> = {};
  const statusCounts: Record<string,number> = {};
  for (const r of all) {
    const d:any = r.data || {};
    const val = Number(d.contractValue ?? d.total ?? d.amount ?? d.netCertified ?? d.bidValue ?? d.value ?? 0);
    if (val) amounts[r.resource] = (amounts[r.resource]||0)+val;
    const key = `${r.resource}:${r.status||'NONE'}`; statusCounts[key]=(statusCounts[key]||0)+1;
  }
  return { totalRecords:all.length, amounts, statusCounts, audit, notifications };
}
