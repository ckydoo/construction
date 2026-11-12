'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, orgApi } from '@/lib/client';
import { num, ago, pct, money } from '@/lib/format';
import { resourceFullyEnabled, moduleEnabled, hrefVisible, auditResourceVisible } from '@/lib/module-visibility';
import { Button, Card, CardHead, Icon, Badge, Skeleton, EmptyState, ProgressBar, TableSkeleton } from '@/components/ui';
import { BarChart, DonutChart } from '@/components/Charts';
import EmailVerificationReminder from '@/components/EmailVerificationReminder';
import { useDisplayCurrency, useDisplayMoney } from '@/components/DisplayCurrencyProvider';

type OV = { kpis:Record<string,number>; wallets:{clientId:string;clientName:string;balance:number;currency:string}[]; projects:any[]; revenueSeries:{label:string;value:number}[]; costBreakdown:{label:string;value:number}[]; attention:any[]; notifications:any[]; audit:any[]; counts:Record<string,number>; currency:string };

function Kpi({label,value,sub,loading}:{label:string;value:string;sub?:string;loading?:boolean}){
  if(loading) return <div className="bg-white p-4 dark:bg-ink-900"><Skeleton className="mb-3 h-3 w-1/3"/><Skeleton className="mb-2 h-6 w-1/2"/><Skeleton className="h-3 w-2/3"/></div>;
  return <div className="bg-white p-4 dark:bg-ink-900">
    <p className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</p>
    <p className="mt-1.5 truncate text-[20px] font-semibold tabular-nums tracking-tight text-ink-900 dark:text-white">{value}</p>
    {sub&&<p className="caption mt-0.5">{sub}</p>}
  </div>;
}

export default function DashboardPage(){
  const formatMoney=useDisplayMoney(); const display=useDisplayCurrency();
  const {org}=useParams<{org:string}>();
  const [period,setPeriod]=useState<'3'|'6'>('6');
  const {data,isLoading,isFetching,refetch}=useQuery<OV>({queryKey:['overview',org],queryFn:()=>apiGet(orgApi(org,'overview'))});
  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const config=meta?.config||{modules:[],resources:[]};
  const on=(id:string)=>resourceFullyEnabled(config,id);
  const mod=(id:string)=>moduleEnabled(config,id);
  // Starter workspaces do not have procurement/ordering switched on. Asking for
  // three-way match data before those sections exist produces a forbidden 403
  // and a noisy console error on an otherwise clean first-run dashboard.
  const showProfitability=mod('reports')&&on('projects');
  const showThreeWay=mod('procurement')&&mod('finance')&&on('purchaseOrders')&&on('apBills');
  const {data:workQueue}:any=useQuery({queryKey:['work-items',org],queryFn:()=>apiGet(orgApi(org,'work-items')),staleTime:30_000,enabled:mod('dashboard')});
  const {data:profitability}:any=useQuery({queryKey:['profitability',org],queryFn:()=>apiGet(orgApi(org,'profitability')),staleTime:60_000,enabled:showProfitability});
  const {data:threeWay}:any=useQuery({queryKey:['three-way-match',org],queryFn:()=>apiGet(orgApi(org,'three-way-match')),staleTime:60_000,enabled:showThreeWay});
  const showJobs=on('projects')||on('estimates');
  const k=data?.kpis; const series=(data?.revenueSeries||[]).slice(-Number(period));
  const totalRecords=Object.entries(data?.counts||{}).filter(([k])=>on(k)).reduce((a,[,b])=>a+Number(b||0),0);
  const base=data?.currency||'USD';
  const glance=[['Staff','employees'],['Jobs','projects'],['Clients','clients'],['Plant','equipment'],['Tax invoices','arInvoices'],['Time sheets','timesheets'],['Site queries','rfis'],['Incidents','incidents']].filter(([,key])=>on(key));
  const attention=(data?.attention||[]).filter((a:any)=>hrefVisible(a.href,config));
  const audit=(data?.audit||[]).filter((a:any)=>auditResourceVisible(a.resource,config));
  const projects=(data?.projects||[]).filter(()=>on('projects'));
  // Pin the greeting date to the workspace's home time zone so the server and
  // browser render the same text even when their clocks straddle midnight.
  const today = new Intl.DateTimeFormat('en-GB',{ weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Africa/Harare' }).format(new Date());
  return <div className="space-y-4">
    <EmailVerificationReminder userId={meta?.user?.id} email={meta?.user?.email} emailVerified={meta?.user?.emailVerified}/>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="heading">Your business today</h1><p className="caption mt-1">Jobs, money and things needing attention · {today}{display.preference&&<> · viewing money in <span className="font-semibold text-brand-600 dark:text-brand-300">{display.currency}</span>; reports stay in {base}</>}</p></div>
      <div className="flex items-center gap-2"><div className="flex rounded-md border divider bg-white p-0.5 dark:bg-ink-900">{(['3','6'] as const).map(p=><button key={p} onClick={()=>setPeriod(p)} className={`rounded px-2.5 py-1 text-xs font-medium ${period===p?'bg-slate-100 text-ink-900 dark:bg-ink-800 dark:text-white':'muted'}`}>{p}M</button>)}</div>
        <Button variant="ghost" size="icon" onClick={()=>refetch()}><Icon name="RefreshCw" size={16} className={isFetching?'animate-spin':''}/></Button>
        {on('projects')&&<Link href={`/${org}/m/projects?new=1`}><Button variant="primary" size="sm" icon="Plus">New job</Button></Link>}</div>
    </div>
    {workQueue&&<Card className="flex flex-wrap items-center gap-3 border-brand-200 bg-brand-50/60 p-3.5 dark:border-brand-500/20 dark:bg-brand-500/5">
      <span data-testid="dashboard-my-work" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-300"><Icon name="Inbox" size={18}/></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">{workQueue.summary.total ? `${num(workQueue.summary.total)} item${workQueue.summary.total===1?'':'s'} need a decision or close-out` : 'You are all caught up'}</p>
        <p className="mt-0.5 text-xs muted">{workQueue.summary.actionable} waiting on you · {workQueue.summary.overdue} late · {workQueue.summary.escalated} escalated</p></div>
      <Link href={`/${org}/my-work`} className="btn-primary btn-sm inline-flex items-center gap-1.5"><Icon name="ArrowRight" size={15}/>Open My work</Link>
    </Card>}
    {showProfitability&&profitability&&profitability.summary.projectCount>0&&<Card className="flex flex-wrap items-center gap-3 p-3.5">
      <span data-testid="dashboard-profitability" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name="Gauge" size={18}/></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">Forecast margin {money(profitability.summary.forecastMargin, profitability.base, true)} across {num(profitability.summary.projectCount)} job{profitability.summary.projectCount===1?'':'s'}</p>
        <p className="mt-0.5 text-xs muted">{pct(profitability.summary.marginPct)} of revised contract · {num(profitability.summary.atRisk)} at risk · {num(profitability.summary.watch)} to watch · workspace base {profitability.base}</p></div>
      <Link href={`/${org}/profitability`} className="btn-outline btn-sm inline-flex items-center gap-1.5"><Icon name="TrendingUp" size={15}/>Open job profitability</Link>
    </Card>}
    {showThreeWay&&threeWay&&threeWay.summary.orders>0&&<Card className="flex flex-wrap items-center gap-3 p-3.5">
      <span data-testid="dashboard-three-way-match" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name="ClipboardCheck" size={18}/></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">{num(threeWay.summary.blocked)} payment hold{threeWay.summary.blocked===1?'':'s'} · {num(threeWay.summary.review)} order{threeWay.summary.review===1?'':'s'} to review</p>
        <p className="mt-0.5 text-xs muted">{num(threeWay.summary.matched)} matched · {num(threeWay.summary.orphanBills)} bills without a PO · {num(threeWay.summary.orphanReceipts)} deliveries without a PO · workspace base {threeWay.base}</p></div>
      <Link href={`/${org}/three-way-match`} className="btn-outline btn-sm inline-flex items-center gap-1.5"><Icon name="ClipboardCheck" size={15}/>Open three-way match</Link>
    </Card>}
    {!isLoading&&totalRecords===0&&<Card><EmptyState icon="Database" title="Nothing here yet" description="Load sample data to look around, or start by adding your first client and job." action={<Link href={`/${org}/settings`}><Button variant="primary" icon="Database">Load sample data</Button></Link>}/></Card>}
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 xl:grid-cols-5 dark:bg-ink-800">
        {on('projects')&&<Kpi loading={isLoading} label="Jobs running" value={num(k?.activeProjects)} sub={`${num(k?.pipelineProjects)} being quoted`}/>}
        {showJobs&&<Kpi loading={isLoading} label="Value of jobs" value={formatMoney(k?.contractValue,base,true)} sub={`${formatMoney(k?.pipelineValue,base,true)} quotes in hand`}/>}
        {mod('finance')&&<Kpi loading={isLoading} label="Invoiced to date" value={formatMoney(k?.billed,base,true)} sub={`${formatMoney(k?.certifiedValue,base,true)} certified for payment`}/>}
        {mod('finance')&&<Kpi loading={isLoading} label="Money owed to you" value={formatMoney(k?.outstanding,base,true)} sub={`${formatMoney(k?.payables,base,true)} you owe suppliers`}/>}
        {mod('wallets')&&<Kpi loading={isLoading} label="Client money in hand" value={formatMoney(k?.walletBalance,base,true)} sub={`${formatMoney(k?.walletFunded,base,true)} set aside for jobs`}/>}
      </div>
    </Card>
    {!isLoading&&mod('wallets')&&(data?.wallets||[]).length>0&&<Card className="overflow-hidden"><CardHead title="Client wallets" subtitle="Money each client has paid in advance · every movement recorded" action={<Link href={`/${org}/wallets`} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">Manage wallets →</Link>}/>
      <div className="grid gap-px bg-slate-200 dark:bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">{(data?.wallets||[]).slice(0,6).map(w=><Link key={w.clientId} href={`/${org}/wallets?client=${encodeURIComponent(w.clientId)}`} className="flex items-center gap-3 bg-white px-4 py-2.5 transition hover:bg-slate-50 dark:bg-ink-900 dark:hover:bg-ink-800/60">
        <Icon name="Wallet" size={15} className="shrink-0 text-ink-400"/>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{w.clientName}</p><p className="text-[10px] muted">Ready to put on jobs</p></div>
        <span className="text-[13px] font-semibold tabular-nums">{formatMoney(w.balance,w.currency)}</span></Link>)}</div></Card>}
    <div className="grid gap-4 lg:grid-cols-3">
      {mod('finance')&&<Card className="lg:col-span-2 overflow-hidden"><CardHead title="Money billed" subtitle="Last 6 months · tax invoices raised" action={<Badge tone="green">{formatMoney(k?.billed,base,true)} total</Badge>}/>
        <div className="p-4 text-ink-500 dark:text-slate-400">{isLoading?<Skeleton className="h-[180px]"/>:series.length?<BarChart data={series} height={180} currency={base} personal/>:<EmptyState compact icon="BarChart3" title="No invoices yet"/>}</div></Card>}
      {on('budgets')&&<Card className="overflow-hidden"><CardHead title="Where the money went" subtitle="From your job budgets"/>
        <div className="p-4">{isLoading?<div className="space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-5"/>)}</div>:data?.costBreakdown?.length?<DonutChart data={data.costBreakdown} size={148} currency={base} personal/>:<EmptyState compact icon="PieChart" title="No budget lines"/>}</div></Card>}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      {on('projects')&&<Card className="lg:col-span-2 overflow-hidden"><CardHead title="How your jobs are doing" subtitle={`${projects.length} jobs running · ${pct(k?.progress)} average progress`} action={<Link href={`/${org}/m/projects`} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">View all →</Link>}/>
        {isLoading?<TableSkeleton rows={4} cols={3}/>:projects.length?<div className="divide-y divider">{projects.map(p=><Link key={p.id} href={`/${org}/projects/${p.id}`} className="flex flex-wrap items-center gap-4 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-ink-800/60">
          <span className={`h-2 w-2 shrink-0 rounded-sm ${p.health==='ON_TRACK'?'bg-emerald-500':'bg-amber-500'}`}/>
          <div className="min-w-[190px] flex-1"><p className="truncate text-[13px] font-medium text-ink-900 dark:text-white">{p.name}</p><p className="text-[11px] muted">{p.type} · {p.location}</p></div>
          <div className="w-32"><div className="mb-1 flex justify-between text-[11px] muted"><span>Progress</span><span className="font-semibold text-ink-700 dark:text-slate-200">{p.progress}%</span></div><ProgressBar value={p.progress} tone={p.health==='ON_TRACK'?'brand':'amber'}/></div>
          <div className="hidden w-28 text-right sm:block"><p className="text-[13px] font-semibold tabular-nums">{formatMoney(p.contractValue,p.currency||base,true)}</p><p className="text-[11px] muted">contract</p></div>
          <Icon name="ChevronRight" size={15} className="text-slate-300"/></Link>)}</div>:<EmptyState compact icon="HardHat" title="No jobs running"/>}</Card>}
      <Card className="overflow-hidden"><CardHead title="Needs your attention" subtitle="From today's records" action={<Badge tone="amber">{attention.filter((a:any)=>a.kind!=='All clear').length} {attention.filter((a:any)=>a.kind!=='All clear').length===1?'item':'items'}</Badge>}/>
        {isLoading?<div className="space-y-3 p-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12"/>)}</div>:<div className="divide-y divider">{attention.slice(0,6).map((a:any,i)=><Link key={i} href={`/${org}${a.href}`} className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-ink-800/60">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-sm ${a.tone==='red'?'bg-red-500':a.tone==='amber'?'bg-amber-500':a.tone==='green'?'bg-emerald-500':'bg-sky-500'}`}/>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink-800 dark:text-slate-100">{a.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] muted">{a.detail}</p></div><span className="text-[10px] font-semibold uppercase tracking-wide muted">{a.kind}</span></Link>)}</div>}</Card>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden"><CardHead title="Recent activity" subtitle="What changed and who did it"/>
        {isLoading?<TableSkeleton rows={5} cols={2}/>:<div className="divide-y divider">{audit.slice(0,7).map((a:any)=><div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-slate-300">{a.actor.split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span>
          <div className="min-w-0 flex-1"><p className="text-xs text-ink-800 dark:text-slate-200"><span className="font-semibold">{a.actor}</span> · {a.detail}</p><p className="mt-0.5 text-[11px] muted">{a.resource?.replace(/_/g,' ')} · {ago(a.createdAt)}</p></div>
          <Badge tone={a.action==='DELETE'?'red':a.action==='APPROVE'?'green':'slate'}>{a.action}</Badge></div>)}</div>}</Card>
      <Card className="overflow-hidden"><CardHead title="Record counts" subtitle="How many records you have"/>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3">{isLoading?Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-8"/>):glance.map(([label,key])=><div key={key} className="flex items-center justify-between border-b divider pb-2"><span className="caption">{label}</span><span className="text-[13px] font-semibold tabular-nums">{num(data?.counts?.[key])}</span></div>)}</div></Card>
    </div>
  </div>;
}
