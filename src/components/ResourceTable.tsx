'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import Link from 'next/link';
import { RESOURCE_MAP, type ResourceDef, toneFor } from '@/lib/resources';
import { canWrite, canDelete } from '@/lib/catalog';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { money, num, date, ago } from '@/lib/format';
import { Button, Icon, Badge, StatusPill, Skeleton, TableSkeleton, EmptyState, Card, ConfirmDialog, ProgressBar } from './ui';
import { useToast } from './Providers';
import RecordForm, { type RefOptions } from './RecordForm';
import RecordDetail from './RecordDetail';
import SearchSelect from './SearchSelect';
import { useRouter } from 'next/navigation';

type ListData = { rows:any[]; total:number; page:number; pages:number; pageSize:number };
const PAGE_SIZE=25;

function Cell({def,col,row,refs,org}:{def:ResourceDef;col:string;row:any;refs:RefOptions;org:string}){
  const f=def.fields.find(x=>x.key===col);
  const v=row[col];
  if(col==='number') return <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-600 dark:bg-ink-800 dark:text-slate-300">{v||'—'}</span>;
  if(v===null||v===undefined||v==='') return <span className="muted">—</span>;
  if(col==='status') return <StatusPill status={v}/>;
  if(!f){
    if(col===def.titleKey) return <span className="font-medium text-ink-900 dark:text-white">{v}</span>;
    return <span className="max-w-[200px] truncate">{String(v)}</span>;
  }
  if(f.type==='currency') return <span className="font-medium tabular-nums">{money(v,row.currency||'USD')}</span>;
  if(f.type==='number') return <span className="tabular-nums">{num(v)}</span>;
  if(f.type==='percent') return <div className="flex min-w-[90px] items-center justify-end gap-2"><span className="w-8 text-right text-xs tabular-nums">{Math.round(Number(v)||0)}%</span><div className="w-12"><ProgressBar value={v}/></div></div>;
  if(f.type==='date') return <span className="tabular-nums">{date(v)}</span>;
  if(f.type==='boolean') return v?<Badge tone="green">Yes</Badge>:<Badge tone="slate">No</Badge>;
  if(f.type==='tags') return <div className="flex gap-1">{(Array.isArray(v)?v:[v]).slice(0,2).map((t:string)=><Badge key={t} tone="blue">{t}</Badge>)}</div>;
  if(f.type==='ref'){
    const label=(refs[f.ref||'']||[]).find(o=>o.value===v)?.label;
    if(f.key==='projectId') return <Link href={`/${org}/projects/${encodeURIComponent(String(v))}`} onClick={e=>e.stopPropagation()} className="max-w-[160px] truncate text-brand-700 hover:underline dark:text-brand-300">{label||String(v).slice(-8)}</Link>;
    return <span className="max-w-[170px] truncate text-ink-600 dark:text-slate-300">{label||String(v).slice(-8)}</span>;
  }
  if(f.key==='health') return <Badge tone={v==='ON_TRACK'?'green':v==='AT_RISK'?'amber':'red'}>{String(v).replace(/_/g,' ')}</Badge>;
  if(f.type==='textarea') return <span className="block max-w-[210px] truncate muted">{String(v)}</span>;
  if(col===def.titleKey) return <span className="block max-w-[260px] truncate font-medium text-ink-900 dark:text-white">{String(v)}</span>;
  return <span className="block max-w-[190px] truncate">{String(v).replace(/_/g,' ')}</span>;
}

export default function ResourceTable({org,resource,embedded=false,fixedProjectId,initialOpenId,initialNew=false}:{
  org:string; resource:string; embedded?:boolean; fixedProjectId?:string; initialOpenId?:string|null; initialNew?:boolean;
}){
  const def=RESOURCE_MAP[resource]; const qc=useQueryClient(); const toast=useToast(); const router=useRouter();
  const [page,setPage]=useState(1), [qInput,setQInput]=useState(''), [q,setQ]=useState('');
  const [status,setStatus]=useState('ALL'), [projectFilter,setProjectFilter]=useState(fixedProjectId||'ALL');
  const [sort,setSort]=useState(''), [dir,setDir]=useState<'asc'|'desc'>('desc');
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [formOpen,setFormOpen]=useState(false), [editing,setEditing]=useState<any>(null), [detailRow,setDetailRow]=useState<any>(null);
  const [confirm,setConfirm]=useState<{ids:string[];label:string}|null>(null);
  const [serverErrors,setServerErrors]=useState<Record<string,string>|undefined>();

  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const role=meta?.role||'ADMIN';
  const canEdit=canWrite(role,resource), canRemove=canDelete(role);
  const enabled=!meta||meta.config?.resources?.includes(resource);
  const refTargets=useMemo(()=>Array.from(new Set(def?.fields.filter(f=>f.type==='ref').map(f=>f.ref!)||[])),[def]);
  const {data:refs}=useQuery<RefOptions>({ queryKey:['refs',org,resource], queryFn:async()=>{
    const entries=await Promise.all(refTargets.map(async r=>{ try{const d=await apiGet(orgApi(org,`records/${r}?mode=refs&limit=25`));return [r,d.options];}catch{return [r,[]];} }));
    return Object.fromEntries(entries);
  }, enabled:!!def, staleTime:60_000 });
  useEffect(()=>{const t=setTimeout(()=>{setQ(qInput);setPage(1);},280);return()=>clearTimeout(t);},[qInput]);
  useEffect(()=>{setSelected(new Set());},[resource,page,q,status,projectFilter]);

  const listKey=['records',org,resource,{page,q,status,projectId:projectFilter,sort,dir}];
  const url=orgApi(org,`records/${resource}?${new URLSearchParams({page:String(page),pageSize:String(PAGE_SIZE),q,status,projectId:projectFilter,sort,dir}).toString()}`);
  const {data,isLoading,isFetching,refetch}=useQuery<ListData>({queryKey:listKey,queryFn:()=>apiGet(url),enabled:!!def&&enabled,placeholderData:(p:any)=>p});
  const rows=data?.rows||[];
  // Resolve labels for the IDs actually on screen. This keeps large linked
  // registers accurate without loading every option into the browser.
  const rowRefValues=useMemo(()=>{
    const fields=def?.fields||[];
    const out:Record<string,string[]>={};
    for(const target of refTargets){
      const keys=fields.filter(f=>f.type==='ref'&&f.ref===target).map(f=>f.key);
      const ids=Array.from(new Set(rows.flatMap(r=>keys.map(k=>String(r[k]||'')).filter(Boolean))));
      if(projectFilter!=='ALL'&&target==='projects') ids.push(projectFilter);
      if(ids.length) out[target]=Array.from(new Set(ids)).slice(0,150);
    }
    return out;
  },[def,refTargets,rows,projectFilter]);
  const {data:rowRefs}=useQuery<RefOptions>({queryKey:['rowRefs',org,resource,rowRefValues],queryFn:async()=>{
    const entries=await Promise.all(Object.entries(rowRefValues).map(async ([target,ids])=>{
      try{const d=await apiGet(orgApi(org,`records/${target}?mode=refs&ids=${encodeURIComponent(ids.join(','))}`));return [target,d.options] as const;}
      catch{return [target,[]] as const;}
    }));
    return Object.fromEntries(entries);
  },enabled:!!def&&enabled&&Object.keys(rowRefValues).length>0,staleTime:60_000});
  const mergedRefs:RefOptions=useMemo(()=>{
    const out:RefOptions={};
    for(const target of refTargets){
      const map=new Map<string,string>();
      for(const o of refs?.[target]||[]) map.set(o.value,o.label);
      for(const o of rowRefs?.[target]||[]) map.set(o.value,o.label);
      out[target]=Array.from(map,([value,label])=>({value,label}));
    }
    return out;
  },[refTargets,refs,rowRefs]);

  useEffect(()=>{ if(initialNew){setEditing(null);setFormOpen(true);} },[initialNew]);
  useEffect(()=>{
    if(!initialOpenId) return;
    // Every project opens its full 360° page; the side drawer is for registers.
    if(resource==='projects'){ router.replace(`/${org}/projects/${encodeURIComponent(initialOpenId)}`); return; }
    const found=rows.find(r=>r.id===initialOpenId);
    if(found) setDetailRow(found);
    else apiGet(orgApi(org,`records/${resource}/${initialOpenId}`)).then(d=>setDetailRow(d.row)).catch(()=>{});
  },[initialOpenId,resource,org,router]); // eslint-disable-line

  const invalidate=()=>{ qc.invalidateQueries({queryKey:['records',org,resource]}); qc.invalidateQueries({queryKey:['meta',org]}); };
  const createMut=useMutation({ mutationFn:(values:any)=>apiSend(orgApi(org,`records/${resource}`),'POST',values),
    onMutate:async(values:any)=>{
      await qc.cancelQueries({queryKey:['records',org,resource]});
      const prev=qc.getQueryData(listKey);
      const temp={...values,id:`tmp-${Date.now()}`,number:'New…',title:String(values[def.titleKey]||`New ${def.singular}`),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),_optimistic:true};
      qc.setQueryData(listKey,(old:any)=>old?{...old,rows:[temp,...old.rows],total:old.total+1}:old);
      return {prev};
    },
    onError:(e:any,_v,ctx:any)=>{ if(ctx?.prev)qc.setQueryData(listKey,ctx.prev); toast.push({tone:'error',title:'Could not create record',description:e.message}); setServerErrors(e.details); },
    onSuccess:(r:any)=>{ setFormOpen(false); setEditing(null); setServerErrors(undefined); toast.push({tone:'success',title:`${def.singular} created`,description:`${r.row.title} · ${r.row.number}`}); },
    onSettled:invalidate });
  const updateMut=useMutation({ mutationFn:({id,values}:any)=>apiSend(orgApi(org,`records/${resource}/${id}`),'PATCH',values),
    onMutate:async({id,values}:any)=>{
      await qc.cancelQueries({queryKey:['records',org,resource]});
      const prev=qc.getQueryData(listKey);
      qc.setQueryData(listKey,(old:any)=>old?{...old,rows:old.rows.map((r:any)=>r.id===id?{...r,...values,title:String(values[def.titleKey]??r.title)}:r)}:old);
      setDetailRow((d:any)=>d?.id===id?{...d,...values}:d);
      return {prev};
    },
    onError:(e:any,_v,ctx:any)=>{ if(ctx?.prev)qc.setQueryData(listKey,ctx.prev); toast.push({tone:'error',title:'Update failed — rolled back',description:e.message}); },
    onSuccess:()=>{ if(!editing)toast.push({tone:'success',title:`${def.singular} updated`}); else {setFormOpen(false);setEditing(null);toast.push({tone:'success',title:'Changes saved'});} setServerErrors(undefined); },
    onSettled:invalidate });
  const deleteMut=useMutation({ mutationFn:(id:string)=>apiSend(orgApi(org,`records/${resource}/${id}`),'DELETE'),
    onMutate:async(id:string)=>{ await qc.cancelQueries({queryKey:['records',org,resource]}); const prev=qc.getQueryData(listKey);
      qc.setQueryData(listKey,(old:any)=>old?{...old,rows:old.rows.filter((r:any)=>r.id!==id),total:Math.max(0,old.total-1)}:old); return {prev}; },
    onError:(e:any,_v,ctx:any)=>{if(ctx?.prev)qc.setQueryData(listKey,ctx.prev);toast.push({tone:'error',title:'Delete failed — rolled back',description:e.message});},
    onSuccess:()=>{setDetailRow(null);toast.push({tone:'success',title:`${def.singular} deleted`});}, onSettled:invalidate });
  const bulkMut=useMutation({ mutationFn:(ids:string[])=>apiSend(orgApi(org,`records/${resource}/bulk`),'DELETE',{ids}),
    onMutate:async(ids:string[])=>{await qc.cancelQueries({queryKey:['records',org,resource]});const prev=qc.getQueryData(listKey);
      qc.setQueryData(listKey,(old:any)=>old?{...old,rows:old.rows.filter((r:any)=>!ids.includes(r.id)),total:Math.max(0,old.total-ids.length)}:old);return {prev};},
    onError:(e:any,_v,ctx:any)=>{if(ctx?.prev)qc.setQueryData(listKey,ctx.prev);toast.push({tone:'error',title:'Bulk delete failed',description:e.message});},
    onSuccess:(_d,v:string[])=>{setSelected(new Set());setConfirm(null);toast.push({tone:'success',title:`Deleted ${v.length} records`});},onSettled:invalidate });

  if(!def) return <Card><EmptyState title="Unknown module" description="This resource is not part of the catalogue."/></Card>;
  if(meta&&!enabled) return <Card><EmptyState icon="Lock" title="Module not enabled" description={`${def.label} is not part of your current workspace. An owner or admin can enable it in Settings → Modules.`} action={<Link href={`/${org}/settings`}><Button variant="primary" icon="Settings">Open settings</Button></Link>}/></Card>;

  const cols=def.columns;
  const numericCols=new Set(cols.filter(c=>{const f=def.fields.find(x=>x.key===c);return f&&['currency','number','percent'].includes(f.type);}));
  const allSelected=rows.length>0&&rows.every(r=>selected.has(r.id));
  const toggleAll=()=>setSelected(s=>{const n=new Set(s);if(allSelected)rows.forEach(r=>n.delete(r.id));else rows.forEach(r=>n.add(r.id));return n;});
  const toggleOne=(id:string)=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const csvHref=orgApi(org,`records/${resource}?mode=csv&${new URLSearchParams({q,status,projectId:projectFilter}).toString()}`);
  const projectOpts=mergedRefs.projects||[];
  const openRow=(r:any)=>{
    if(resource==='projects'){router.push(`/${org}/projects/${encodeURIComponent(r.id)}`);return;}
    setDetailRow(r);
  };

  return <div className={embedded?'':'space-y-4'}>
    {!embedded&&<div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:text-slate-400"><Icon name={def.icon} size={16}/></span><div><h1 className="heading">{def.label}</h1><p className="caption mt-0.5">{def.description}</p></div></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={csvHref} download><Button icon="Download" size="sm">Export CSV</Button></a>
        <Button variant="ghost" size="icon" onClick={()=>refetch()} title="Refresh"><Icon name="RefreshCw" size={16} className={isFetching?'animate-spin':''}/></Button>
        {canEdit&&<Button variant="primary" size="sm" icon="Plus" onClick={()=>{setEditing(null);setServerErrors(undefined);setFormOpen(true);}}>New {def.singular}</Button>}
      </div>
    </div>}

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b divider p-2.5">
        <div className="relative min-w-[200px] flex-1"><Lucide.Search size={15} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9" value={qInput} onChange={e=>setQInput(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}…`}/></div>
        {def.statusOptions&&<select className="select w-auto min-w-[140px]" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="ALL">All statuses</option>{def.statusOptions.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select>}
        {def.projectScoped&&!fixedProjectId&&<div className="w-[210px] min-w-[180px]"><SearchSelect org={org} resource="projects" label="Filter by project"
          value={projectFilter==='ALL'?'':projectFilter} onChange={v=>{setProjectFilter(v||'ALL');setPage(1);}}
          placeholder="Search all projects…" pageSize={25}
          initialLabel={projectOpts.find(o=>o.value===projectFilter)?.label}/></div>}
        {(q||status!=='ALL'||(projectFilter!=='ALL'&&!fixedProjectId))&&<Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" icon="X" onClick={()=>{setQInput('');setQ('');setStatus('ALL');setProjectFilter(fixedProjectId||'ALL');setPage(1);}}>Clear</Button>}
        <span className="ml-auto hidden text-xs muted sm:block">{data?.total??0} records</span>
      </div>
      {(q||status!=='ALL'||(projectFilter!=='ALL'&&!fixedProjectId))&&<div className="flex flex-wrap items-center gap-2 border-b divider bg-slate-50 px-3 py-1.5 text-[11px] dark:bg-ink-950/40">
        <span className="font-medium muted">Active filters</span>
        {q&&<span className="chip py-0.5">Search: {q}</span>}
        {status!=='ALL'&&<span className="chip py-0.5">Status: {status.replace(/_/g,' ')}</span>}
        {projectFilter!=='ALL'&&!fixedProjectId&&<span className="chip py-0.5">Project: {projectOpts.find(o=>o.value===projectFilter)?.label||projectFilter}</span>}
        <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-[11px]" icon="X" onClick={()=>{setQInput('');setQ('');setStatus('ALL');setProjectFilter(fixedProjectId||'ALL');setPage(1);}}>Reset all</Button>
      </div>}
      {selected.size>0&&<div className="flex flex-wrap items-center gap-2 border-b divider bg-slate-50 px-3 py-2 dark:bg-ink-950/50">
        <span className="text-xs font-semibold text-ink-800 dark:text-slate-200">{selected.size} selected</span>
        {canRemove&&<Button variant="ghost" size="sm" icon="Trash2" className="text-red-600" onClick={()=>setConfirm({ids:[...selected],label:`${selected.size} ${def.label.toLowerCase()}`})}>Delete selected</Button>}
        <Button variant="ghost" size="sm" onClick={()=>setSelected(new Set())}>Clear selection</Button>
      </div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="bg-slate-50/80 dark:bg-ink-950/40"><tr>
            {canRemove&&<th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-brand-500"/></th>}
            {cols.map(c=>{const f=def.fields.find(x=>x.key===c);return <th key={c} className={`table-th ${numericCols.has(c)?'text-right':''}`}>
              <button className="inline-flex items-center gap-1 hover:text-ink-800 dark:hover:text-white" onClick={()=>{if(sort===c)setDir(d=>d==='asc'?'desc':'asc');else{setSort(c);setDir('asc');}}}>
                {f?.label||(c==='number'?'No.':c)}{sort===c&&<Icon name={dir==='asc'?'ChevronUp':'ChevronDown'} size={12}/>}
              </button></th>;})}
            <th className="table-th w-20 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divider">
            {isLoading&&!data?Array.from({length:6}).map((_,i)=><tr key={i}>{Array.from({length:cols.length+2}).map((__,j)=><td key={j} className="table-td"><Skeleton className={`h-3.5 ${j===1?'w-40':'w-20'}`}/></td>)}</tr>):
            rows.length===0?<tr><td colSpan={cols.length+2}><EmptyState compact icon={def.icon} title={q||status!=='ALL'?'No matching records':`No ${def.label.toLowerCase()} yet`}
              description={q||status!=='ALL'?'Try a different search or clear your filters.':`Create your first ${def.singular.toLowerCase()} to get started, or load sample data to look around.`}
              action={canEdit?<div className="flex gap-2"><Button variant="primary" icon="Plus" onClick={()=>{setEditing(null);setFormOpen(true);}}>New {def.singular}</Button>{!q&&<Link href={`/${org}/settings`}><Button icon="Database">Load demo data</Button></Link>}</div>:undefined}/></td></tr>:
            rows.map(r=><tr key={r.id} onClick={()=>openRow(r)} className={`group cursor-pointer transition hover:bg-slate-50 dark:hover:bg-ink-800/60 ${r._optimistic?'opacity-60':''}`}>
              {canRemove&&<td className="table-td" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggleOne(r.id)} className="h-3.5 w-3.5 accent-brand-500"/></td>}
              {cols.map(c=><td key={c} className={`table-td ${numericCols.has(c)?'text-right':''}`} onClick={c==='status'?e=>e.stopPropagation():undefined}>
                {c==='status'&&def.statusOptions&&canEdit?<select value={r.status||def.statusOptions[0]} onChange={e=>updateMut.mutate({id:r.id,values:{...r,status:e.target.value}})} className={`rounded border divider bg-white px-1.5 py-1 text-[11px] font-medium focus:ring-1 focus:ring-brand-500 ${toneFor(r.status)==='green'?'text-emerald-600 dark:text-emerald-400':toneFor(r.status)==='red'?'text-red-600 dark:text-red-400':toneFor(r.status)==='amber'?'text-amber-600 dark:text-amber-400':'text-slate-600 dark:text-slate-300'}`}>
                  {def.statusOptions.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select>:<Cell def={def} col={c} row={r} refs={mergedRefs} org={org}/>}
              </td>)}
              <td className="table-td text-right" onClick={e=>e.stopPropagation()}><div className="flex justify-end gap-1 opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
                {resource==='projects'&&<Link href={`/${org}/projects/${encodeURIComponent(r.id)}`} aria-label={`Open full page for ${r.title||r.number}`} title="Open full project page" className="rounded-md p-1.5 hover:bg-slate-200 dark:hover:bg-ink-700"><Lucide.ExternalLink size={14}/></Link>}
                {canEdit&&<button aria-label={`Edit ${r.title||r.number}`} onClick={()=>{setEditing(r);setServerErrors(undefined);setFormOpen(true);}} className="rounded-md p-1.5 hover:bg-slate-200 dark:hover:bg-ink-700" title="Edit"><Lucide.Pencil size={14}/></button>}
                {canRemove&&<button aria-label={`Delete ${r.title||r.number}`} onClick={()=>setConfirm({ids:[r.id],label:r.title||r.number})} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Delete"><Lucide.Trash2 size={14}/></button>}
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t divider px-3 py-2.5">
        <p className="text-xs muted">{data?.total?`Showing ${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,data.total)} of ${data.total}`:'No records'}</p>
        <div className="flex items-center gap-1.5"><Button size="sm" variant="ghost" disabled={page<=1} onClick={()=>setPage(p=>p-1)} icon="ChevronLeft">Prev</Button><span className="px-2 text-xs font-medium">Page {page} / {data?.pages||1}</span><Button size="sm" variant="ghost" disabled={page>=(data?.pages||1)} onClick={()=>setPage(p=>p+1)}>Next<Icon name="ChevronRight" size={14}/></Button></div>
      </div>
    </Card>

    {canEdit&&<RecordForm def={def} open={formOpen} onClose={()=>{setFormOpen(false);setEditing(null);}} initial={editing} refs={mergedRefs} defaultProjectId={fixedProjectId} org={org}
      submitting={createMut.isPending||updateMut.isPending} serverErrors={serverErrors}
      onSubmit={(values)=>editing?updateMut.mutate({id:editing.id,values}):createMut.mutate(values)}/>}
    {detailRow&&<RecordDetail org={org} def={def} row={detailRow} open={!!detailRow} onClose={()=>setDetailRow(null)} refs={mergedRefs} canEdit={canEdit} canRemove={canRemove}
      onEdit={()=>{setEditing(detailRow);setDetailRow(null);setFormOpen(true);}} onDelete={()=>setConfirm({ids:[detailRow.id],label:detailRow.title})}/>}
    <ConfirmDialog open={!!confirm} onClose={()=>setConfirm(null)} loading={bulkMut.isPending||deleteMut.isPending}
      title={`Delete ${confirm?.label||'record'}?`} description="This record will be moved to the recycle bin (soft delete). You can restore it from the database."
      onConfirm={()=>{if(!confirm)return;setConfirm(null);if(confirm.ids.length===1)deleteMut.mutate(confirm.ids[0]);else bulkMut.mutate(confirm.ids);}}/>
  </div>;
}
