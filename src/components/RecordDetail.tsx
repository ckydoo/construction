'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import type { ResourceDef } from '@/lib/resources';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { Button, Drawer, StatusPill, Badge, Skeleton, Icon } from './ui';
import { money, num, date } from '@/lib/format';
import { useToast } from './Providers';
import type { RefOptions } from './RecordForm';

export default function RecordDetail({org,def,row,open,onClose,onEdit,onDelete,refs,canEdit,canRemove}:{
  org:string; def:ResourceDef; row:any; open:boolean; onClose:()=>void; onEdit:()=>void; onDelete:()=>void;
  refs:RefOptions; canEdit:boolean; canRemove:boolean;
}){
  const qc=useQueryClient(); const toast=useToast(); const [comment,setComment]=useState(''); const [sending,setSending]=useState(false); const [uploading,setUploading]=useState(false);
  const {data,isLoading}=useQuery({ queryKey:['record',org,def.id,row?.id], queryFn:()=>apiGet(orgApi(org,`records/${def.id}/${row.id}`)), enabled:open&&!!row?.id });
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
  function display(f:any,v:any){
    if(v===null||v===undefined||v==='') return <span className="muted">—</span>;
    if(f.type==='currency') return <span className="font-medium">{money(v)}</span>;
    if(f.type==='number') return num(v);
    if(f.type==='percent') return `${num(v)}%`;
    if(f.type==='date') return date(v);
    if(f.type==='boolean') return v?<Badge tone="green">Yes</Badge>:<Badge tone="slate">No</Badge>;
    if(f.type==='tags') return <div className="flex flex-wrap gap-1">{(Array.isArray(v)?v:[v]).map((t:string)=><Badge key={t} tone="blue">{t}</Badge>)}</div>;
    if(f.type==='ref'){ const o=(refs[f.ref||'']||[]).find(x=>x.value===v); return <span className="text-brand-700 dark:text-brand-300">{o?.label||String(v).slice(-8)}</span>; }
    if(f.key==='status') return <StatusPill status={v}/>;
    return <span className="whitespace-pre-wrap break-words">{String(v)}</span>;
  }
  return <Drawer open={open} onClose={onClose} title={row?.title||def.singular} subtitle={`${row?.number||''} · ${def.singular}`}
    footer={<div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] muted">Created {date(row?.createdAt)}</p><div className="flex flex-wrap gap-2"><a href={orgApi(org,`pdf/${def.id}/${row.id}`)} download><Button size="sm" icon="FileDown">PDF</Button></a>{canRemove&&<Button variant="ghost" size="sm" icon="Trash2" onClick={onDelete} className="text-red-600">Delete</Button>}{canEdit&&<Button variant="primary" size="sm" icon="Pencil" onClick={onEdit}>Edit record</Button>}</div></div>}>
    <div className="border-b divider px-5 py-4"><div className="flex flex-wrap items-center gap-2"><StatusPill status={row?.status}/><Badge tone="slate">{row?.number}</Badge>{row?.projectId&&<span className="text-xs muted">Linked to a project</span>}</div></div>
    <div className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2">
      {def.fields.filter(f=>f.key!=='status').map(f=><div key={f.key} className={f.wide||f.type==='textarea'?'sm:col-span-2':''}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide muted">{f.label}</p><div className="text-sm text-ink-800 dark:text-slate-200">{display(f,row?.[f.key])}</div>
      </div>)}
    </div>
    <div className="border-t divider px-5 py-5">
      <div className="mb-3 flex items-center gap-2"><Icon name="MessageSquare" size={16} className="text-slate-400"/><h3 className="text-sm font-semibold">Comments & activity</h3></div>
      {isLoading?<div className="space-y-2"><Skeleton className="h-12"/><Skeleton className="h-12"/></div>:
        (data?.comments||[]).length===0?<p className="rounded-lg bg-slate-50 p-4 text-center text-xs muted dark:bg-ink-950/50">No comments yet. Start the conversation.</p>:
        <div className="space-y-3">{(data?.comments||[]).map((c:any)=><div key={c.id} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-ink-700 dark:bg-ink-700 dark:text-slate-200">{c.authorName.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span><div className="min-w-0 flex-1 rounded-lg bg-slate-50 p-2.5 dark:bg-ink-950/50"><p className="text-xs font-semibold">{c.authorName}<span className="ml-2 font-normal muted">{date(c.createdAt)}</span></p><p className="mt-1 text-xs text-ink-700 dark:text-slate-300">{c.body}</p></div></div>)}</div>}
      <div className="mt-4 flex gap-2"><input className="input" value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addComment();}} placeholder="Write a comment…"/><Button variant="primary" size="sm" loading={sending} onClick={addComment} icon="Send">Post</Button></div>
    </div>
    <div className="border-t divider px-5 py-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Icon name="Paperclip" size={16} className="text-slate-400"/><h3 className="text-sm font-semibold">Attachments</h3><Badge tone="slate">{data?.files?.length||0}</Badge></div>
        {canEdit&&<label className="btn-outline btn-sm cursor-pointer"><Icon name="Upload" size={13}/>{uploading?'Uploading…':'Upload file'}<input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading}/></label>}
      </div>
      {isLoading?<Skeleton className="h-12"/>:!(data?.files||[]).length?<p className="rounded-lg bg-slate-50 p-4 text-center text-xs muted dark:bg-ink-950/50">No files attached yet. Upload drawings, photos, signed certificates or supporting documents (up to 12 MB each).</p>:
        <div className="space-y-2">{(data?.files||[]).map((f:any)=><div key={f.id} className="flex items-center gap-3 rounded-lg border divider p-2.5">
          {f.mime?.startsWith('image/')?<img src={orgApi(org,`files/${f.id}`)} alt={f.fileName} className="h-9 w-9 shrink-0 rounded object-cover"/>:<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-ink-500 dark:bg-ink-800"><Icon name={f.mime?.includes('pdf')?'FileText':'FileImage'} size={16}/></span>}
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{f.fileName}</p><p className="text-[11px] muted">{Math.max(1,Math.round(f.size/1024))} KB · {f.uploadedByName} · {date(f.createdAt)}</p></div>
          <a href={orgApi(org,`files/${f.id}`)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon="Download">Open</Button></a>
          {canRemove&&<button onClick={()=>removeFile(f.id,f.fileName)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Remove"><Lucide.Trash2 size={14}/></button>}
        </div>)}</div>}
    </div>
  </Drawer>;
}
