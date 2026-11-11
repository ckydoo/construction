'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import Link from 'next/link';
import type { ResourceDef } from '@/lib/resources';
import { normaliseLines } from '@/lib/financial';
import { visibleFields, resourceFullyEnabled, moduleEnabled, hrefVisible } from '@/lib/module-visibility';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { Button, Card, CardHead, Drawer, StatusPill, Badge, Skeleton, Icon } from './ui';
import { money, num, date } from '@/lib/format';
import { useToast } from './Providers';
import ConvertFlow from './ConvertFlow';
import { CONVERTIBLE_RESOURCE_IDS } from '@/lib/conversion-chain';
import type { RefOptions } from './RecordForm';

export default function RecordDetail({org,def,row,open,onClose,onEdit,onDelete,refs,canEdit,canRemove,inline=false}:{
  org:string; def:ResourceDef; row:any; open:boolean; onClose:()=>void; onEdit?:()=>void; onDelete?:()=>void;
  refs:RefOptions; canEdit:boolean; canRemove:boolean; inline?:boolean;
}){
  const active=open||inline;
  const qc=useQueryClient(); const toast=useToast(); const [comment,setComment]=useState(''); const [sending,setSending]=useState(false); const [uploading,setUploading]=useState(false); const [expanded,setExpanded]=useState<Record<string,boolean>>({}); const [revNotes,setRevNotes]=useState<Record<string,string>>({}); const [convertOpen,setConvertOpen]=useState(false);
  const canConvert=canEdit&&!!row?.id&&CONVERTIBLE_RESOURCE_IDS.has(def.id);
  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const config=meta?.config||{modules:[],resources:[]};
  const fields=visibleFields(def,config);
  const {data,isLoading}=useQuery({ queryKey:['record',org,def.id,row?.id], queryFn:()=>apiGet(orgApi(org,`records/${def.id}/${row.id}`)), enabled:active&&!!row?.id });
  const {data:related}:any=useQuery({ queryKey:['related',org,def.id,row?.id], queryFn:()=>apiGet(orgApi(org,`records/${def.id}/${row.id}/related`)), enabled:active&&!!row?.id });
  async function addComment(){ if(!comment.trim())return; setSending(true);
    try{ await apiSend(orgApi(org,`records/${def.id}/${row.id}/comments`),'POST',{body:comment}); setComment(''); qc.invalidateQueries({queryKey:['record',org,def.id,row.id]}); }
    catch(e:any){ toast.push({tone:'error',title:'Could not post comment',description:e.message}); } finally{ setSending(false); }
  }
  async function handleUpload(e:React.ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]); if(!files.length) return;
    setUploading(true); let ok=0;
    for(const f of files){
      const fd=new FormData(); fd.append('file',f); fd.append('recordId',row.id); fd.append('resource',def.id);
      try{ const res=await fetch(orgApi(org,'files'),{method:'POST',body:fd}); if(!res.ok){const b=await res.json().catch(()=>({error:'Upload failed'}));throw new Error(b.error);} ok++; }
      catch(err:any){ toast.push({tone:'error',title:'Upload failed',description:`${f.name}: ${err.message}`}); }
    }
    await qc.invalidateQueries({queryKey:['record',org,def.id,row.id]});
    setUploading(false); e.target.value='';
    if(ok) toast.push({tone:'success',title:`${ok} file${ok>1?'s':''} attached`});
  }
  async function removeFile(id:string,name:string){
    try{ await apiSend(orgApi(org,`files/${id}`),'DELETE'); await qc.invalidateQueries({queryKey:['record',org,def.id,row.id]}); toast.push({tone:'success',title:'Attachment removed',description:name}); }
    catch(e:any){ toast.push({tone:'error',title:'Could not remove file',description:e.message}); }
  }
  async function handleRevisionUpload(e:React.ChangeEvent<HTMLInputElement>,parent:any,key:string){
    const f=e.target.files?.[0]; if(!f) return;
    setUploading(true);
    try{
      const fd=new FormData(); fd.append('file',f); fd.append('recordId',row.id); fd.append('resource',def.id);
      fd.append('supersedesId',parent.id); fd.append('note',revNotes[key]||'');
      const res=await fetch(orgApi(org,'files'),{method:'POST',body:fd});
      if(!res.ok){const b=await res.json().catch(()=>({error:'Upload failed'}));throw new Error(b.error);}
      await qc.invalidateQueries({queryKey:['record',org,def.id,row.id]});
      setRevNotes(v=>({...v,[key]:''})); setExpanded(v=>({...v,[key]:true}));
      toast.push({tone:'success',title:'New revision uploaded',description:f.name});
    }catch(err:any){ toast.push({tone:'error',title:'Revision upload failed',description:err.message}); }
    finally{ setUploading(false); e.target.value=''; }
  }
  function display(f:any,v:any){
    if(v===null||v===undefined||v==='') return <span className="muted">—</span>;
    if(f.type==='currency') return <span className="font-medium">{money(v)}</span>;
    if(f.type==='number') return num(v);
    if(f.type==='percent') return `${num(v)}%`;
    if(f.type==='date') return date(v);
    if(f.type==='boolean') return v?<Badge tone="green">Yes</Badge>:<Badge tone="slate">No</Badge>;
    if(f.type==='tags') return <div className="flex flex-wrap gap-1">{(Array.isArray(v)?v:[v]).map((t:string)=><Badge key={t} tone="blue">{t}</Badge>)}</div>;
    if(f.type==='ref'){ const o=(refs[f.ref||'']||[]).find(x=>x.value===v); return <span className="text-brand-700 dark:text-brand-300">{o?.label||String(v).slice(-8)}</span>; }
    if(f.type==='items'){ const lines=normaliseLines(v); return lines.length?<div className="overflow-x-auto rounded border divider"><table className="w-full text-xs"><thead className="bg-slate-50 dark:bg-ink-800/60"><tr><th className="px-2 py-1.5 text-left">Description</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Unit</th><th className="px-2 py-1.5 text-right">Subtotal</th></tr></thead><tbody>{lines.map((l,i)=><tr key={i} className="border-t divider"><td className="px-2 py-1.5">{l.description}{l.detail&&<span className="block muted">{l.detail}</span>}</td><td className="px-2 py-1.5 text-right tabular-nums">{num(l.qty)}</td><td className="px-2 py-1.5 text-right tabular-nums">{money(l.unitPrice,row?.currency)}</td><td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(l.total,row?.currency)}</td></tr>)}</tbody></table></div>:<span className="muted">—</span>; }
    if(f.key==='status') return <StatusPill status={v}/>;
    return <span className="whitespace-pre-wrap break-words">{String(v)}</span>;
  }
  const allFiles:any[] = data?.files||[];
  const relatedGroups=(related?.groups||[]).filter((g:any)=>resourceFullyEnabled(config,g.resource))
    .map((g:any)=>({...g,items:(g.items||[]).filter((it:any)=>hrefVisible(it.href,config))})).filter((g:any)=>g.items.length);
  const showWallet=!!related?.wallet&&moduleEnabled(config,'wallets')&&hrefVisible(related.wallet.href,config);
  const groups:{key:string;items:any[]}[] = (()=>{
    const out:{key:string;items:any[]}[]=[];
    for(const f of allFiles){ const key=f.documentKey||f.id; let g=out.find(x=>x.key===key); if(!g){g={key,items:[]};out.push(g);} g.items.push(f); }
    for(const g of out) g.items.sort((a:any,b:any)=>(b.revision||1)-(a.revision||1));
    return out;
  })();
  const body = <>

    <div className="border-b divider px-4 py-3"><div className="flex flex-wrap items-center gap-2"><StatusPill status={row?.status}/><Badge tone="slate">{row?.number}</Badge>{row?.projectId&&<span className="text-xs muted">Linked to a project</span>}
      {row?.sourceResource&&row?.sourceId&&<Link href={row.sourceResource==='projects'?`/${org}/projects/${encodeURIComponent(row.sourceId)}`:`/${org}/m/${row.sourceResource}?open=${encodeURIComponent(row.sourceId)}`} className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:underline dark:border-brand-400/30 dark:bg-brand-500/10 dark:text-brand-200">Converted from {row.sourceLabel||row.sourceNumber||row.sourceResource} →</Link>}
    </div></div>
    <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2">
      {fields.filter(f=>f.key!=='status').map(f=><div key={f.key} className={f.wide||f.type==='textarea'||f.type==='items'?'sm:col-span-2':''}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide muted">{f.label}</p><div className="text-sm text-ink-800 dark:text-slate-200">{display(f,row?.[f.key])}</div>
      </div>)}
    </div>
    <div className="border-t divider px-4 py-4">
      <div className="mb-3 flex items-center gap-2"><Icon name="Link2" size={16} className="text-slate-400"/><h3 className="text-sm font-semibold">Linked records</h3>
        <Badge tone="slate">{relatedGroups.reduce((n:number,g:any)=>n+g.items.length,0)} across modules</Badge></div>
      {showWallet&&<div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border divider bg-slate-50 p-3 dark:bg-ink-950/50">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-900"><Icon name="CreditCard" size={16}/></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wider muted">Client wallet</p><p className="text-sm font-semibold tabular-nums">{related.wallet.balance!==null?money(related.wallet.balance,related.wallet.currency):`${money(related.wallet.fundedToProjects,related.wallet.currency)} funded to this project`}</p></div>
        <Link href={`/${org}${related.wallet.href}`} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Open wallet →</Link></div>}
      {!related?<Skeleton className="h-14"/>:!relatedGroups.length?<p className="rounded-md border divider bg-slate-50 p-4 text-center text-xs muted dark:bg-ink-950/50">No other modules link to this record yet.</p>:
        <div className="space-y-2.5">{relatedGroups.map((g:any)=><div key={g.resource} className="rounded-lg border divider p-3">
          <div className="mb-2 flex items-center gap-2"><Icon name={g.icon||'FileText'} size={14} className="muted"/><p className="text-xs font-semibold">{g.label}</p><Badge tone="slate">{g.items.length}</Badge></div>
          <div className="flex flex-wrap gap-1.5">{g.items.map((it:any)=><Link key={it.id} href={`/${org}${it.href}`} className="max-w-[220px] truncate rounded border divider px-2 py-1 text-[11px] text-ink-700 hover:bg-brand-50 hover:text-brand-700 dark:bg-ink-800 dark:text-slate-300">{it.title||it.number}</Link>)}</div></div>)}</div>}
    </div>
    <div className="border-t divider px-4 py-4">
      <div className="mb-3 flex items-center gap-2"><Icon name="MessageSquare" size={16} className="text-slate-400"/><h3 className="text-sm font-semibold">Comments & activity</h3></div>
      {isLoading?<div className="space-y-2"><Skeleton className="h-12"/><Skeleton className="h-12"/></div>:
        (data?.comments||[]).length===0?<p className="rounded-md border divider bg-slate-50 p-4 text-center text-xs muted dark:bg-ink-950/50">No comments yet. Start the conversation.</p>:
        <div className="space-y-3">{(data?.comments||[]).map((c:any)=><div key={c.id} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[10px] font-semibold text-ink-700 dark:bg-ink-700 dark:text-slate-200">{c.authorName.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span><div className="min-w-0 flex-1 rounded-md border divider bg-slate-50 p-2.5 dark:bg-ink-950/50"><p className="text-xs font-semibold">{c.authorName}<span className="ml-2 font-normal muted">{date(c.createdAt)}</span></p><p className="mt-1 text-xs text-ink-700 dark:text-slate-300">{c.body}</p></div></div>)}</div>}
      <div className="mt-4 flex gap-2"><input className="input" value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addComment();}} placeholder="Write a comment…"/><Button variant="primary" size="sm" loading={sending} onClick={addComment} icon="Send">Post</Button></div>
    </div>
    <div className="border-t divider px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Icon name="Paperclip" size={16} className="text-slate-400"/><h3 className="text-sm font-semibold">Attachments & revisions</h3><Badge tone="slate">{groups.length} doc{groups.length===1?'':'s'} · {allFiles.length} file{allFiles.length===1?'':'s'}</Badge></div>
        {canEdit&&<label className="btn-outline btn-sm cursor-pointer"><Icon name="Upload" size={13}/>{uploading?'Uploading…':'Upload file'}<input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading}/></label>}
      </div>
      {isLoading?<Skeleton className="h-16"/>:!groups.length?<p className="rounded-md border divider bg-slate-50 p-4 text-center text-xs muted dark:bg-ink-950/50">No files attached yet. Upload drawings, photos, signed certificates or supporting documents (up to 12 MB each).</p>:
        <div className="space-y-3">{groups.map(g=>{
          const cur=g.items[0]; const older=g.items.slice(1);
          return <div key={g.key} className="overflow-hidden rounded-lg border divider">
            <div className="flex items-center gap-3 p-2.5">
              {cur.mime?.startsWith('image/')?<img src={orgApi(org,`files/${cur.id}`)} alt={cur.fileName} className="h-9 w-9 shrink-0 rounded object-cover"/>:<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500 dark:bg-ink-800"><Icon name={cur.mime?.includes('pdf')?'FileText':'FileImage'} size={16}/></span>}
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-xs font-medium">{cur.fileName}</p><Badge tone="green">{cur.revisionLabel||'Rev A'}</Badge></div><p className="truncate text-[11px] muted">{Math.max(1,Math.round(cur.size/1024))} KB · {cur.uploadedByName} · {date(cur.createdAt)}{cur.note?` · ${cur.note}`:''}</p></div>
              <a href={orgApi(org,`files/${cur.id}`)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon="Download">Open</Button></a>
              {older.length>0&&<button onClick={()=>setExpanded(v=>({...v,[g.key]:!v[g.key]}))} className="btn-outline btn-sm"><Icon name="History" size={13}/>{g.items.length} rev<Icon name={expanded[g.key]?'ChevronUp':'ChevronDown'} size={12}/></button>}
              {canRemove&&<button onClick={()=>removeFile(cur.id,cur.fileName)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Remove"><Lucide.Trash2 size={14}/></button>}
            </div>
            {canEdit&&<div className="flex items-center gap-2 border-t divider px-2.5 py-2">
              <input className="input h-8 min-w-0 flex-1 text-xs" placeholder="Revision note (optional)" value={revNotes[g.key]||''} onChange={e=>setRevNotes(v=>({...v,[g.key]:e.target.value}))}/>
              <label className="btn-outline btn-sm cursor-pointer whitespace-nowrap"><Icon name="GitBranch" size={13}/>New revision<input type="file" className="hidden" disabled={uploading} onChange={e=>handleRevisionUpload(e,cur,g.key)}/></label>
            </div>}
            {expanded[g.key]&&older.length>0&&<div className="space-y-1.5 border-t divider bg-slate-50 px-3 py-2 dark:bg-ink-950/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide muted">Revision history · superseded</p>
              {older.map((o:any)=><div key={o.id} className="flex items-center gap-2 text-[11px]"><Badge tone="slate">{o.revisionLabel}</Badge><span className="min-w-0 flex-1 truncate">{o.note||o.fileName}</span><span className="hidden muted sm:inline">{o.uploadedByName} · {date(o.createdAt)}</span><a href={orgApi(org,`files/${o.id}`)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Open</a>{canRemove&&<button onClick={()=>removeFile(o.id,o.fileName)} className="text-red-500" title="Remove"><Lucide.Trash2 size={12}/></button>}</div>)}
            </div>}
          </div>;
        })}</div>}
    </div>
  </>;
  const title=row?.title||def.singular;
  const subtitle=`${row?.number||''} · ${def.singular}`;
  const convertButton = canConvert&&<Button size="sm" variant="outline" icon="ArrowRightLeft" onClick={()=>setConvertOpen(true)}>Convert to…</Button>;
  const footer = <div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] muted">Created {date(row?.createdAt)}</p><div className="flex flex-wrap gap-2">{convertButton}<a href={orgApi(org,`pdf/${def.id}/${row.id}`)} download><Button size="sm" icon="FileDown">PDF</Button></a>{canRemove&&onDelete&&<Button variant="ghost" size="sm" icon="Trash2" onClick={onDelete} className="text-red-600">Delete</Button>}{canEdit&&onEdit&&<Button variant="primary" size="sm" icon="Pencil" onClick={onEdit}>Edit record</Button>}</div></div>;
  const inlineActions = <div className="flex flex-wrap gap-2">
    {convertButton}
    <a href={orgApi(org,`pdf/${def.id}/${row.id}`)} download><Button size="sm" icon="FileDown">PDF</Button></a>
    {canEdit&&onEdit&&<Button variant="primary" size="sm" icon="Pencil" onClick={onEdit}>Edit record</Button>}
    {canRemove&&onDelete&&<Button variant="ghost" size="sm" icon="Trash2" onClick={onDelete} className="text-red-600">Delete</Button>}
  </div>;
  const flow = canConvert&&<ConvertFlow org={org} resource={def.id} row={row} open={convertOpen} onClose={()=>setConvertOpen(false)}/>;
  if(inline) return <Card className="overflow-hidden">
    <CardHead title={`${title} · record & files`} subtitle="Full project record, linked modules, comments and document revisions" action={inlineActions}/>
    {body}
    {flow}
  </Card>;
  return <Drawer open={open} onClose={onClose} title={title} subtitle={subtitle} footer={footer}>{body}{flow}</Drawer>;

}
