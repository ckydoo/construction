'use client';
import * as Lucide from '@/components/lucide';
import React, { useEffect } from 'react';
import { toneFor } from '@/lib/resources';

export function Icon({name,size=18,className='',strokeWidth=1.8}:{name:string;size?:number;className?:string;strokeWidth?:number}){
  const C:any = (Lucide as any)[name] || Lucide.Circle;
  return <C size={size} strokeWidth={strokeWidth} className={className}/>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?:'primary'|'dark'|'outline'|'ghost'|'danger'; size?:'sm'|'md'|'icon'; loading?:boolean; icon?:string };
export function Button({variant='outline',size='md',loading,icon,children,className='',disabled,...rest}:BtnProps){
  const cls = variant==='primary'?'btn-primary':variant==='dark'?'btn-dark':variant==='ghost'?'btn-ghost':variant==='danger'?'btn-danger':'btn-outline';
  const sz = size==='sm'?'btn-sm':size==='icon'?'btn-icon':'btn-md';
  return <button className={`${cls} ${sz} ${className}`} disabled={disabled||loading} {...rest}>
    {loading?<Lucide.Loader2 size={15} className="animate-spin"/>:icon?<Icon name={icon} size={15}/>:null}{children}
  </button>;
}

const TONES:Record<string,string> = {
  green:'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber:'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
  red:'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300',
  blue:'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300',
  slate:'bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-ink-800 dark:text-slate-300',
  violet:'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300',
};
export function Badge({children,tone='slate',className=''}:{children:React.ReactNode;tone?:string;className?:string}){
  return <span className={`badge ring-1 ring-inset ${TONES[tone]||TONES.slate} ${className}`}>{children}</span>;
}
export function StatusPill({status}:{status?:string}){
  if(!status) return <span className="muted">—</span>;
  return <Badge tone={toneFor(status)}>{String(status).replace(/_/g,' ')}</Badge>;
}
export function Card({children,className=''}:{children:React.ReactNode;className?:string}){ return <div className={`card ${className}`}>{children}</div>; }
export function CardHead({title,subtitle,action}:{title:React.ReactNode;subtitle?:string;action?:React.ReactNode}){
  return <div className="flex items-start justify-between gap-4 border-b divider px-5 py-4">
    <div><h3 className="text-sm font-semibold text-ink-900 dark:text-white">{title}</h3>{subtitle&&<p className="mt-0.5 text-xs muted">{subtitle}</p>}</div>{action}
  </div>;
}
export function Field({label,required,error,hint,children,wide}:{label:string;required?:boolean;error?:string;hint?:string;children:React.ReactNode;wide?:boolean}){
  return <div className={wide?'sm:col-span-2':''}>
    <label className="label">{label}{required&&<span className="ml-1 text-red-500">*</span>}</label>
    {children}
    {error?<p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>:hint?<p className="mt-1 text-xs muted">{hint}</p>:null}
  </div>;
}
export function Skeleton({className=''}:{className?:string}){ return <div className={`skeleton ${className}`}/>; }
export function TableSkeleton({rows=8,cols=6}:{rows?:number;cols?:number}){
  return <div className="divide-y divider">{Array.from({length:rows}).map((_,i)=><div key={i} className="flex items-center gap-6 px-4 py-3.5">
    <Skeleton className="h-4 w-4 shrink-0 rounded"/>{Array.from({length:cols}).map((__,j)=><Skeleton key={j} className={`h-3.5 ${j===0?'w-1/4':j===1?'w-1/5':'w-1/6'}`}/>)}
  </div>)}</div>;
}
export function CardSkeleton({className=''}:{className?:string}){ return <div className={`card p-5 ${className}`}><Skeleton className="mb-4 h-3 w-1/3"/><Skeleton className="mb-2 h-7 w-1/2"/><Skeleton className="h-3 w-2/3"/></div>; }

export function EmptyState({icon='Inbox',title,description,action,compact=false}:{icon?:string;title:string;description?:string;action?:React.ReactNode;compact?:boolean}){
  return <div className={`flex flex-col items-center justify-center text-center ${compact?'py-10':'py-16'} px-6`}>
    <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
      <Icon name={icon} size={30}/>
      <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink-400 shadow-sm dark:bg-ink-800"><Lucide.Plus size={13}/></span>
    </div>
    <h3 className="text-sm font-semibold text-ink-900 dark:text-white">{title}</h3>
    {description&&<p className="mt-1.5 max-w-sm text-xs leading-relaxed muted">{description}</p>}
    {action&&<div className="mt-5">{action}</div>}
  </div>;
}
export function Spinner({size=16}:{size?:number}){ return <Lucide.Loader2 size={size} className="animate-spin text-brand-500"/>; }
export function ProgressBar({value,tone='brand'}:{value:number;tone?:'brand'|'green'|'amber'|'red'}){
  const v=Math.max(0,Math.min(100,Number(value)||0));
  const c=tone==='green'?'bg-emerald-500':tone==='amber'?'bg-amber-500':tone==='red'?'bg-red-500':'bg-brand-500';
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800"><div className={`h-full rounded-full ${c} transition-all duration-500`} style={{width:`${v}%`}}/></div>;
}
export function Toggle({checked,onChange,label}:{checked:boolean;onChange:(v:boolean)=>void;label?:string}){
  return <button type="button" onClick={()=>onChange(!checked)} className="inline-flex items-center gap-2.5" aria-pressed={checked}>
    <span className={`relative h-5 w-9 rounded-full transition ${checked?'bg-brand-500':'bg-slate-300 dark:bg-ink-700'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked?'left-[18px]':'left-0.5'}`}/>
    </span>{label&&<span className="text-sm muted">{label}</span>}
  </button>;
}
export function Tabs({tabs,active,onChange,className=''}:{tabs:{id:string;label:string;count?:number}[];active:string;onChange:(id:string)=>void;className?:string}){
  return <div className={`flex gap-1 overflow-x-auto border-b divider ${className}`}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} className={`relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition ${active===t.id?'text-brand-700 dark:text-brand-300':'muted hover:text-ink-800 dark:hover:text-white'}`}>
      {t.label}{t.count!==undefined&&<span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-ink-800">{t.count}</span>}
      {active===t.id&&<span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500"/>}
    </button>)}
  </div>;
}
export function Drawer({open,onClose,title,subtitle,children,footer,width='max-w-xl'}:{open:boolean;onClose:()=>void;title:React.ReactNode;subtitle?:string;children:React.ReactNode;footer?:React.ReactNode;width?:string}){
  useEffect(()=>{ if(!open)return; const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();}; document.addEventListener('keydown',h); document.body.style.overflow='hidden'; return ()=>{document.removeEventListener('keydown',h);document.body.style.overflow='';}; },[open,onClose]);
  if(!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end">
    <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose}/>
    <div className={`relative flex h-full w-full ${width} animate-fadein flex-col bg-white shadow-2xl dark:bg-ink-900`}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b divider px-5 py-4">
        <div><h2 className="text-base font-semibold text-ink-900 dark:text-white">{title}</h2>{subtitle&&<p className="mt-0.5 text-xs muted">{subtitle}</p>}</div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-white"><Lucide.X size={18}/></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer&&<div className="shrink-0 border-t divider bg-slate-50/60 px-5 py-3.5 dark:bg-ink-950/50">{footer}</div>}
    </div>
  </div>;
}
export function ConfirmDialog({open,onClose,onConfirm,title,description,confirmLabel='Delete',loading}:{open:boolean;onClose:()=>void;onConfirm:()=>void;title:string;description?:string;confirmLabel?:string;loading?:boolean}){
  if(!open)return null;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-ink-950/50" onClick={onClose}/>
    <div className="card relative w-full max-w-md animate-fadein p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10"><Lucide.TriangleAlert size={20}/></div>
      <h3 className="text-base font-semibold text-ink-900 dark:text-white">{title}</h3>
      {description&&<p className="mt-1.5 text-sm muted">{description}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></div>
    </div>
  </div>;
}
