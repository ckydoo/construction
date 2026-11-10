'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, orgApi } from '@/lib/client';
import { money, date, pct, num } from '@/lib/format';
import { Card, CardHead, Button, Icon, Badge, StatusPill, Skeleton, Tabs, ProgressBar, EmptyState } from '@/components/ui';
import ResourceTable from '@/components/ResourceTable';
import RecordDetail from '@/components/RecordDetail';
import { RESOURCE_MAP } from '@/lib/resources';
import { canWrite, canDelete } from '@/lib/catalog';
import { resourceFullyEnabled, moduleEnabled, visibleRefTargets, hrefVisible } from '@/lib/module-visibility';
import type { RefOptions } from '@/components/RecordForm';

const TABS=[
  {id:'overview',label:'Overview'},{id:'schedule',label:'Schedule'},{id:'commercial',label:'Commercial'},
  {id:'documents',label:'Documents & RFIs'},{id:'site',label:'Site ops'},{id:'hse',label:'HSE & quality'},
  {id:'team',label:'Team & plant'},{id:'record',label:'Record & files'},
];
export default function ProjectPage(){
  const {org,id}=useParams<{org:string;id:string}>();
  const [tab,setTab]=useState('overview');
  const {data,isLoading}=useQuery({queryKey:['project',org,id],queryFn:()=>apiGet(orgApi(org,`projects/${id}`))});
  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const p=data?.project, t=data?.totals, g=data?.grouped||{}, cur=data?.currency||'USD';
  const d=data?.display, recordCur=p?.currency||cur;
  const role=meta?.role||'ADMIN';
  const config=meta?.config||{modules:[],resources:[]};
  const on=(id:string)=>resourceFullyEnabled(config,id);
  const mod=(id:string)=>moduleEnabled(config,id);
  const tabResources:Record<string,string[]>={schedule:['tasks'],commercial:['changeOrders','budgets','paymentApps'],documents:['rfis','documents','submittals'],site:['dailyLogs','punchLists','meetings'],hse:['incidents','inspections','toolboxTalks'],team:['timesheets','crews','equipment']};
  const tabs=TABS.filter(x=>x.id==='overview'||x.id==='record'||(tabResources[x.id]||[]).some(on));
  useEffect(()=>{ if(meta&&!tabs.some(x=>x.id===tab)) setTab('overview'); },[meta]); // eslint-disable-line
  const canEdit=canWrite(role,'projects'), canRemove=canDelete(role);
  const snapshotRows: [string, any][] = ([
    ['Original budget', t?.originalBudget, on('budgets')],
    ['Committed', t?.committed, on('budgets')],
    ['Actual to date', t?.actual, on('budgets')],
    ['Forecast to complete', t?.forecast, on('budgets')],
    ['Approved variations', t?.variations, on('changeOrders')],
    ['Received', t?.received, on('arInvoices')],
  ] as [string, any, boolean][]).filter(x=>x[2]).map(([l,v])=>[l,v]);
  const showSnapshot=snapshotRows.length>0;
  const showWallet=mod('wallets')&&hrefVisible(data?.wallet?.href,config);
  const refTargets=useMemo(()=>visibleRefTargets(RESOURCE_MAP.projects,config),[meta]);
  const refIds=useMemo(()=>{
    const out:Record<string,string[]>={};
    for(const target of refTargets){
      const keys=RESOURCE_MAP.projects.fields.filter(f=>f.type==='ref'&&f.ref===target).map(f=>f.key);
      const ids=keys.map(k=>String((p||{})[k]||'')).filter(Boolean);
      if(ids.length) out[target]=Array.from(new Set(ids)).slice(0,150);
    }
    return out;
  },[p,refTargets]);
  const {data:refs}:any=useQuery<RefOptions>({queryKey:['projectRefs',org,id,refIds],queryFn:async()=>{
    const entries=await Promise.all(Object.entries(refIds).map(async ([target,ids])=>{
      try{const d:any=await apiGet(orgApi(org,`records/${target}?mode=refs&ids=${encodeURIComponent(ids.join(','))}`));return [target,d.options] as const;}
      catch{return [target,[]] as const;}
    }));
    return Object.fromEntries(entries);
  },enabled:Object.keys(refIds).length>0,staleTime:60_000});
  if(isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2"/><div className="grid gap-4 sm:grid-cols-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-28"/>)}</div><Skeleton className="h-96"/></div>;
  if(!p) return <Card><EmptyState icon="HardHat" title="Project not found" description="This project may have been deleted." action={<Link href={`/${org}/m/projects`}><Button variant="primary">Back to projects</Button></Link>}/></Card>;
  const margin=d?.margin ?? (Number(p.contractValue||0)-Number(p.costToDate||0));
  const info:[string,any][]=[
    ['Project code',p.code],
    ...(on('clients')?[['Client',p.clientName||'—']] as [string,any][]:[]),
    ['Contract form',p.contractFlavour],['Location',p.location],['Start date',date(p.startDate)],['Planned completion',date(p.endDate)],
    ...(on('employees')?[['Project manager',p.managerName||'—']] as [string,any][]:[]),
    ['Record currency',recordCur],['Reporting currency',cur],
  ];
  const kpis:[string,string][]=[
    ['Contract value',money(d?.contractValue ?? p.contractValue,cur)],
    ['Cost to date',money(d?.costToDate ?? p.costToDate,cur)],
    ['Projected margin',money(margin,cur)],
  ];
  const billedOn=on('arInvoices'), certifiedOn=on('paymentApps');
  if(billedOn||certifiedOn){
    const parts=[billedOn?money(t?.billed,cur):null,certifiedOn?money(t?.certified,cur):null].filter(Boolean) as string[];
    kpis.push([billedOn&&certifiedOn?'Billed / certified':billedOn?'Billed':'Certified',parts.join(' / ')]);
  }
  return <div className="space-y-4">
    <div><Link href={`/${org}/m/projects`} className="inline-flex items-center gap-1.5 text-xs font-medium muted hover:text-brand-600"><Icon name="ArrowLeft" size={13}/>All projects</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:text-slate-400"><Icon name="HardHat" size={17}/></span>
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="heading">{p.name}</h1><StatusPill status={p.status}/><Badge tone={p.health==='ON_TRACK'?'green':p.health==='AT_RISK'?'amber':'red'}>{String(p.health||'').replace(/_/g,' ')}</Badge></div>
        <p className="mt-1 text-xs muted">{p.type} · {p.location} · {p.code}</p></div></div>
        <div className="flex gap-2">{on('tasks')&&<Link href={`/${org}/m/tasks?new=1`}><Button icon="Plus">Add task</Button></Link>}{on('rfis')&&<Link href={`/${org}/m/rfis?new=1`}><Button variant="primary" icon="Plus">New RFI</Button></Link>}</div></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map(([l,v])=><Card key={l} className="p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p><p className="mt-1.5 text-[18px] font-semibold tabular-nums tracking-tight">{v}</p></Card>)}
    </div>
    <Card className="overflow-hidden"><div className="px-4 py-3"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Physical progress</p><span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{pct(p.progress)}</span></div><ProgressBar value={p.progress}/></div>
      <div className="grid gap-x-6 gap-y-3 border-t divider px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">{info.map(([l,v])=><div key={l}><p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p><p className="mt-1 truncate text-sm text-ink-800 dark:text-slate-200">{v||'—'}</p></div>)}</div></Card>
    <Tabs tabs={tabs} active={tab} onChange={setTab}/>
    {tab==='overview'&&<div className="grid gap-4 lg:grid-cols-2">
      {showSnapshot&&<Card><CardHead title="Financial snapshot" subtitle="Figures from the sections switched on in this workspace"/>
        <div className="grid grid-cols-2 gap-2.5 p-4">{snapshotRows.map(([l,v])=><div key={l} className="rounded-md border divider bg-slate-50/60 p-3 dark:bg-ink-950/40"><p className="text-[11px] muted">{l}</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(v,cur)}</p></div>)}</div></Card>}
      {showWallet&&<Card><CardHead title="Client wallet funding" subtitle="Prepaid client funds allocated to this project" action={data?.wallet?.href&&<Link href={`/${org}${data.wallet.href}`} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">Open wallet →</Link>}/>
        <div className="space-y-3 p-4"><div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wider muted">Funded from wallet</p><p className="mt-1 text-2xl font-semibold tracking-tight">{money(t?.walletFunded,cur)}</p></div><Badge tone="green">{num(t?.walletFundingPct)}% of contract</Badge></div>
          <ProgressBar value={t?.walletFundingPct||0} tone="green"/>
          <div className="grid grid-cols-2 gap-3">{[['Contract value',money(t?.walletTarget||0,cur)],['Remaining to fund',money(t?.walletRemaining,cur)],['Client',data?.wallet?.clientName||'—'],['Wallet balance',data?.wallet?.balance!==null&&data?.wallet?.balance!==undefined?money(data.wallet.balance,data.wallet.currency):'—']].map(([l,v])=><div key={String(l)} className="rounded-md border divider bg-slate-50/60 p-3 dark:bg-ink-950/40"><p className="text-[11px] muted">{l}</p><p className="mt-0.5 truncate text-xs font-semibold tabular-nums">{v}</p></div>)}</div>
          {(data?.wallet?.transactions||[]).length>0&&<div className="border-t divider pt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider muted">Recent allocations</p><div className="space-y-1.5">{data.wallet.transactions.slice(0,3).map((x:any)=><div key={x.id} className="flex items-center gap-2 text-[11px]"><Badge tone={x.reversedAt?'slate':'blue'}>{x.reversedAt?'Reversed':'Allocated'}</Badge><span className="min-w-0 flex-1 truncate muted">{x.note||x.actorName}</span><span className="font-semibold tabular-nums">{money(Math.abs(x.amountBase ?? x.amount),cur)}</span></div>)}</div></div>}
        </div></Card>}
      {[on('tasks'),on('rfis'),on('punchLists'),on('incidents'),on('changeOrders'),on('documents')].some(Boolean)&&<Card><CardHead title="Delivery status" subtitle="Counts across project registers"/>
        <div className="grid grid-cols-2 gap-2.5 p-4">{[['Tasks complete',`${t?.tasksComplete||0} / ${t?.tasksTotal||0}`,on('tasks')],['Open RFIs',(g.rfis||[]).filter((x:any)=>x.status!=='CLOSED').length,on('rfis')],['Open punch items',(g.punchLists||[]).filter((x:any)=>x.status!=='CLOSED').length,on('punchLists')],['Safety incidents',(g.incidents||[]).length,on('incidents')],['Change orders',(g.changeOrders||[]).length,on('changeOrders')],['Documents',(g.documents||[]).length,on('documents')]].filter((x:any)=>x[2]).map(([l,v]:any)=><div key={String(l)} className="flex items-center justify-between rounded-lg border divider px-3 py-2.5"><span className="text-xs muted">{l}</span><span className="text-sm font-semibold tabular-nums">{v}</span></div>)}</div></Card>}
      {p.scope&&<Card className="lg:col-span-2"><CardHead title="Scope of works"/><p className="p-4 text-sm leading-relaxed muted">{p.scope}</p></Card>}
    </div>}
    {tab==='schedule'&&on('tasks')&&<ResourceTable org={org} resource="tasks" embedded fixedProjectId={id}/>}
    {tab==='commercial'&&<div className="space-y-4">{on('changeOrders')&&<ResourceTable org={org} resource="changeOrders" embedded fixedProjectId={id}/>}{on('budgets')&&<ResourceTable org={org} resource="budgets" embedded fixedProjectId={id}/>}{on('paymentApps')&&<ResourceTable org={org} resource="paymentApps" embedded fixedProjectId={id}/>}</div>}
    {tab==='documents'&&<div className="space-y-4">{on('rfis')&&<ResourceTable org={org} resource="rfis" embedded fixedProjectId={id}/>}{on('documents')&&<ResourceTable org={org} resource="documents" embedded fixedProjectId={id}/>}{on('submittals')&&<ResourceTable org={org} resource="submittals" embedded fixedProjectId={id}/>}</div>}
    {tab==='site'&&<div className="space-y-4">{on('dailyLogs')&&<ResourceTable org={org} resource="dailyLogs" embedded fixedProjectId={id}/>}{on('punchLists')&&<ResourceTable org={org} resource="punchLists" embedded fixedProjectId={id}/>}{on('meetings')&&<ResourceTable org={org} resource="meetings" embedded fixedProjectId={id}/>}</div>}
    {tab==='hse'&&<div className="space-y-4">{on('incidents')&&<ResourceTable org={org} resource="incidents" embedded fixedProjectId={id}/>}{on('inspections')&&<ResourceTable org={org} resource="inspections" embedded fixedProjectId={id}/>}{on('toolboxTalks')&&<ResourceTable org={org} resource="toolboxTalks" embedded fixedProjectId={id}/>}</div>}
    {tab==='team'&&<div className="space-y-4">{on('timesheets')&&<ResourceTable org={org} resource="timesheets" embedded fixedProjectId={id}/>}{on('crews')&&<ResourceTable org={org} resource="crews" embedded fixedProjectId={id}/>}{on('equipment')&&<ResourceTable org={org} resource="equipment" embedded fixedProjectId={id}/>}</div>}
    {tab==='record'&&<RecordDetail org={org} def={RESOURCE_MAP.projects} row={p} open={false} inline onClose={()=>{}}
      refs={refs||{}} canEdit={canEdit} canRemove={canRemove}/>}
  </div>;
}
