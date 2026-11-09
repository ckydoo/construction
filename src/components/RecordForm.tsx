'use client';
import { useEffect, useMemo, useState } from 'react';
import * as Lucide from '@/components/lucide';
import type { ResourceDef, Field } from '@/lib/resources';
import { Button, Drawer, Field as FWrap, Icon, Toggle } from './ui';

export type RefOptions = Record<string,{value:string;label:string}[]>;

export function initialValues(def:ResourceDef, row?:any, defaultProjectId?:string){
  const v:Record<string,any>={};
  for(const f of def.fields){
    const cur = row?.[f.key];
    v[f.key] = cur!==undefined&&cur!==null ? cur : (f.defaultValue ?? (f.type==='tags'?[]:''));
  }
  if(def.fields.some(f=>f.key==='projectId') && !v.projectId && defaultProjectId) v.projectId=defaultProjectId;
  if(def.statusOptions&&!v.status) v.status=def.statusOptions[0];
  return v;
}

export default function RecordForm({def,open,onClose,onSubmit,initial,refs,defaultProjectId,submitting,serverErrors}:{
  def:ResourceDef; open:boolean; onClose:()=>void; onSubmit:(v:Record<string,any>)=>void;
  initial?:any; refs:RefOptions; defaultProjectId?:string; submitting?:boolean; serverErrors?:Record<string,string>;
}){
  const [values,setValues]=useState<Record<string,any>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  useEffect(()=>{ if(open){ setValues(initialValues(def,initial,defaultProjectId)); setErrors({}); } },[open,initial,def,defaultProjectId]);
  useEffect(()=>{ if(serverErrors) setErrors(serverErrors); },[serverErrors]);
  const set=(k:string,v:any)=>{ setValues(s=>({...s,[k]:v})); setErrors(e=>{const n={...e};delete n[k];return n;}); };
  const submit=(e:React.FormEvent)=>{
    e.preventDefault();
    const err:Record<string,string>={};
    for(const f of def.fields) if(f.required && (values[f.key]===undefined||values[f.key]===null||values[f.key]===''||(Array.isArray(values[f.key])&&!values[f.key].length))) err[f.key]=`${f.label} is required`;
    setErrors(err); if(Object.keys(err).length) return;
    onSubmit(values);
  };
  const grouped=useMemo(()=>{
    const visible=def.fields.filter(f=>!f.readOnly);
    const basic=visible.filter(f=>!f.wide&&f.type!=='tags');
    const wide=visible.filter(f=>f.wide||f.type==='tags');
    return {basic,wide};
  },[def]);

  function control(f:Field){
    const v=values[f.key];
    const common=`input ${errors[f.key]?'border-red-400 focus:ring-red-400/30':''}`;
    switch(f.type){
      case 'textarea': return <textarea className={`${common} min-h-[76px] resize-y py-2`} value={v??''} onChange={e=>set(f.key,e.target.value)} placeholder={f.placeholder||`Enter ${f.label.toLowerCase()}`}/>;
      case 'select': return <select className={`select ${errors[f.key]?'border-red-400':''}`} value={v??''} onChange={e=>set(f.key,e.target.value)}><option value="">Select…</option>{(f.options||[]).map(o=><option key={o} value={o}>{o.replace(/_/g,' ')}</option>)}</select>;
      case 'ref': {
        const opts=refs[f.ref||'']||[];
        return <select className={`select ${errors[f.key]?'border-red-400':''}`} value={v??''} onChange={e=>set(f.key,e.target.value)}><option value="">— None —</option>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
      }
      case 'boolean': return <div className="flex h-9 items-center"><Toggle checked={!!v} onChange={x=>set(f.key,x)} label={v?'Yes':'No'}/></div>;
      case 'tags': return <input className={common} value={Array.isArray(v)?v.join(', '):v??''} onChange={e=>set(f.key,e.target.value)} placeholder="Comma separated tags"/>;
      case 'date': return <input className={common} type="date" value={v??''} onChange={e=>set(f.key,e.target.value)}/>;
      case 'datetime': return <input className={common} type="datetime-local" value={v??''} onChange={e=>set(f.key,e.target.value)}/>;
      case 'number': case 'currency': case 'percent': return <div className="relative"><input className={`${common} ${f.type!=='number'?'pl-8':''}`} type="number" step="any" value={v??''} onChange={e=>set(f.key,e.target.value===''?'':Number(e.target.value))} placeholder={f.placeholder||'0'}/>{f.type==='currency'&&<span className="absolute left-3 top-2 text-xs muted">$</span>}{f.type==='percent'&&<span className="absolute right-3 top-2 text-xs muted">%</span>}</div>;
      default: return <input className={common} type={f.type==='email'?'email':f.type==='phone'?'tel':'text'} value={v??''} onChange={e=>set(f.key,e.target.value)} placeholder={f.placeholder||`Enter ${f.label.toLowerCase()}`}/>;
    }
  }
  return <Drawer open={open} onClose={onClose} title={`${initial?'Edit':'New'} ${def.singular}`} subtitle={initial?`${initial.number} · changes are saved immediately`:`Complete the fields below to create a new ${def.singular.toLowerCase()}.`}
    footer={<div className="flex items-center justify-between"><p className="text-[11px] muted"><span className="text-red-500">*</span> Required field</p><div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit as any} loading={submitting} icon="Save">{initial?'Save changes':`Create ${def.singular}`}</Button></div></div>}>
    <form onSubmit={submit} className="grid gap-4 px-4 py-4 sm:grid-cols-2">
      {grouped.basic.map(f=><FWrap key={f.key} label={f.label} required={f.required} error={errors[f.key]} hint={f.hint}>{control(f)}</FWrap>)}
      {grouped.wide.map(f=><FWrap key={f.key} label={f.label} required={f.required} error={errors[f.key]} wide>{control(f)}</FWrap>)}
    </form>
  </Drawer>;
}
