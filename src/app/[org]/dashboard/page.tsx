'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, orgApi } from '@/lib/client';
import { money, num, date, ago, pct } from '@/lib/format';
import { Button, Card, CardHead, Icon, Badge, StatusPill, Skeleton, CardSkeleton, EmptyState, ProgressBar, TableSkeleton } from '@/components/ui';
import { BarChart, DonutChart, Sparkline } from '@/components/Charts';

type OV = { kpis:Record<string,number>; projects:any[]; revenueSeries:{label:string;value:number}[]; costBreakdown:{label:string;value:number}[]; attention:any[]; notifications:any[]; audit:any[]; counts:Record<string,number>; currency:string };

function Kpi({label,value,sub,icon,tone='brand',spark,loading}:{label:string;value:string;sub?:string;icon:string;tone?:string;spark?:number[];loading?:boolean}){
  const tones:any={brand:'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',green:'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',blue:'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',red:'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'};
  if(loading) return <CardSkeleton/>;
  return <Card className="card-hover p-4"><div className="flex items-start justify-between gap-3">
    <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wider muted">{label}</p><p className="mt-1.5 truncate text-[22px] font-semibold tracking-tight text-ink-900 dark:text-white">{value}</p>{sub&&<p className="mt-1 text-[11px] muted">{sub}</p>}</div>
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon name={icon} size={18}/></span></div>
    {spark&&<div className="mt-3 flex justify-end"><Sparkline values={spark}/></div>}</Card>;
}

export default function DashboardPage(){
  const {org}=useParams<{org:string}>();
  const [period,setPeriod]=useState<'3'|'6'>('6');
  const {data,isLoading,isFetching,refetch}=useQuery<OV>({queryKey:['overview',org],queryFn:()=>apiGet(orgApi(org,'overview'))});
  const k=data?.kpis; const series=(data?.revenueSeries||[]).slice(-Number(period));
  const totalRecords=Object.values(data?.counts||{}).reduce((a,b)=>a+b,0);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="heading">Good morning, here's your business</h1><p className="mt-1 text-xs muted">Live view across projects, people, plant and money · {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div>
      <div className="flex items-center gap-2"><div className="flex rounded-lg border divider bg-white p-0.5 dark:bg-ink-900">{(['3','6'] as const).map(p=><button key={p} onClick={()=>setPeriod(p)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${period===p?'bg-slate-100 text-ink-900 dark:bg-ink-800 dark:text-white':'muted'}`}>{p}M</button>)}</div>
        <Button variant="ghost" size="icon" onClick={()=>refetch()}><Icon name="RefreshCw" size={16} className={isFetching?'animate-spin':''}/></Button>
        <Link href={`/${org}/m/projects?new=1`}><Button variant="primary" size="sm" icon="Plus">New project</Button></Link></div>
    </div>
    {!isLoading&&totalRecords===0&&<Card><EmptyState icon="Database" title="Your workspace is empty" description="Load the realistic demo dataset to explore every module with live data, or start by creating your first client and project." action={<Link href={`/${org}/settings`}><Button variant="primary" icon="Database">Load demo data</Button></Link>}/></Card>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi loading={isLoading} label="Active projects" value={num(k?.activeProjects)} sub={`${num(k?.pipelineProjects)} in pipeline`} icon="HardHat" spark={[3,4,4,5,5,6,6]}/>
      <Kpi loading={isLoading} label="Contract value" value={money(k?.contractValue,'USD',true)} sub={`${money(k?.pipelineValue,'USD',true)} bid pipeline`} icon="Briefcase" tone="blue" spark={[12,14,13,17,19,22,26]}/>
      <Kpi loading={isLoading} label="Billed to date" value={money(k?.billed,'USD',true)} sub={`${money(k?.certifiedValue,'USD',true)} certified`} icon="Receipt" tone="green" spark={[4,6,7,9,11,13,16]}/>
      <Kpi loading={isLoading} label="Outstanding AR" value={money(k?.outstanding,'USD',true)} sub={`${money(k?.payables,'USD',true)} payables`} icon="TrendingUp" tone="red" spark={[10,9,11,8,12,10,9]}/>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden"><CardHead title="Certified & invoiced revenue" subtitle="Last 6 months · client invoices raised" action={<Badge tone="green">{money(k?.billed,'USD',true)} total</Badge>}/>
        <div className="p-5 text-ink-500 dark:text-slate-400">{isLoading?<Skeleton className="h-[180px]"/>:series.length?<BarChart data={series} height={190}/>:<EmptyState compact icon="BarChart3" title="No invoices yet"/>}</div></Card>
      <Card className="overflow-hidden"><CardHead title="Cost to date by category" subtitle="From approved budget lines"/>
        <div className="p-5">{isLoading?<div className="space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-5"/>)}</div>:data?.costBreakdown?.length?<DonutChart data={data.costBreakdown} size={150}/>:<EmptyState compact icon="PieChart" title="No budget lines"/>}</div></Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden"><CardHead title="Project portfolio health" subtitle={`${data?.projects.length||0} active projects · ${pct(k?.progress)} average progress`} action={<Link href={`/${org}/m/projects`} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">View all →</Link>}/>
        {isLoading?<TableSkeleton rows={4} cols={3}/>:data?.projects?.length?<div className="divide-y divider">{data.projects.map(p=><Link key={p.id} href={`/${org}/projects/${p.id}`} className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50 dark:hover:bg-ink-800/60">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${p.health==='ON_TRACK'?'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10':'bg-amber-50 text-amber-600 dark:bg-amber-500/10'}`}><Icon name="HardHat" size={17}/></span>
          <div className="min-w-[190px] flex-1"><p className="truncate text-sm font-medium text-ink-900 dark:text-white">{p.name}</p><p className="text-[11px] muted">{p.type} · {p.location}</p></div>
          <div className="w-32"><div className="mb-1 flex justify-between text-[11px] muted"><span>Progress</span><span className="font-semibold text-ink-700 dark:text-slate-200">{p.progress}%</span></div><ProgressBar value={p.progress} tone={p.health==='ON_TRACK'?'brand':'amber'}/></div>
          <div className="hidden w-28 text-right sm:block"><p className="text-sm font-semibold tabular-nums">{money(p.contractValue,'USD',true)}</p><p className="text-[11px] muted">contract</p></div>
          <Icon name="ChevronRight" size={16} className="text-slate-300"/></Link>)}</div>:<EmptyState compact icon="HardHat" title="No active projects"/>}</Card>
      <Card className="overflow-hidden"><CardHead title="Needs your attention" subtitle="Derived from live records" action={<Badge tone="amber">{data?.attention.length||0} items</Badge>}/>
        {isLoading?<div className="space-y-3 p-5">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12"/>)}</div>:<div className="divide-y divider">{(data?.attention||[]).slice(0,6).map((a:any,i)=><Link key={i} href={`/${org}${a.href}`} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50 dark:hover:bg-ink-800/60">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.tone==='red'?'bg-red-500':a.tone==='amber'?'bg-amber-500':a.tone==='green'?'bg-emerald-500':'bg-sky-500'}`}/>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink-800 dark:text-slate-100">{a.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] muted">{a.detail}</p></div><span className="text-[10px] font-semibold uppercase tracking-wide muted">{a.kind}</span></Link>)}</div>}</Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden"><CardHead title="Recent activity" subtitle="Audit trail of changes in this workspace"/>
        {isLoading?<TableSkeleton rows={5} cols={2}/>:<div className="divide-y divider">{(data?.audit||[]).slice(0,7).map((a:any)=><div key={a.id} className="flex items-start gap-3 px-5 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-slate-300">{a.actor.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span>
          <div className="min-w-0 flex-1"><p className="text-xs text-ink-800 dark:text-slate-200"><span className="font-semibold">{a.actor}</span> · {a.detail}</p><p className="mt-0.5 text-[11px] muted">{a.resource?.replace(/_/g,' ')} · {ago(a.createdAt)}</p></div>
          <Badge tone={a.action==='DELETE'?'red':a.action==='APPROVE'?'green':'slate'}>{a.action}</Badge></div>)}</div>}</Card>
      <Card className="overflow-hidden"><CardHead title="Workspace at a glance" subtitle="Live record counts"/>
        <div className="grid grid-cols-2 gap-3 p-5">{isLoading?Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-16"/>):[
          ['Employees','employees','UsersRound'],['Projects','projects','HardHat'],['Clients','clients','Handshake'],['Equipment','equipment','Truck'],['Invoices','arInvoices','Receipt'],['Timesheets','timesheets','Clock'],['RFIs','rfis','MessageCircleQuestion'],['Safety events','incidents','ShieldCheck'],
        ].map(([label,key,icon])=><div key={key} className="rounded-lg border divider bg-slate-50/60 p-3 dark:bg-ink-950/40"><div className="flex items-center gap-2"><Icon name={icon} size={14} className="text-brand-500"/><p className="text-lg font-semibold tabular-nums">{num(data?.counts?.[key])}</p></div><p className="mt-0.5 text-[11px] muted">{label}</p></div>)}</div></Card>
    </div>
  </div>;
}
