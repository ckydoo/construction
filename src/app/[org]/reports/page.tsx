'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, orgApi } from '@/lib/client';
import { money, num, pct } from '@/lib/format';
import { resourceFullyEnabled, moduleEnabled } from '@/lib/module-visibility';
import { Card, CardHead, Button, Icon, Badge, Skeleton, EmptyState, Field } from '@/components/ui';
import { BarChart, DonutChart } from '@/components/Charts';
import { useDisplayCurrency } from '@/components/DisplayCurrencyProvider';

const REPORTS = [
  { group:'Clients & jobs', items:[
    {title:'All your jobs',desc:'Every job with value, cost, progress and how it is going',resource:'projects',icon:'HardHat'},
    {title:'Enquiries & chances of winning',desc:'Work you are quoting for, by stage and expected value',resource:'leads',icon:'Target'},
    {title:'Quotes & what we won',desc:'Every quote with cost, markup and whether you won it',resource:'estimates',icon:'Calculator'},
    {title:'Contracts & extras',desc:'Signed contracts and approved variations',resource:'changeOrders',icon:'FileSignature'},
  ]},
  { group:'Money', items:[
    {title:'Who owes you money',desc:'Client invoices, due dates, what is paid and what is late',resource:'arInvoices',icon:'Receipt'},
    {title:'Who you owe',desc:'Supplier bills and orders you have placed',resource:'apBills',icon:'FileInput'},
    {title:'Certificates & retention',desc:'Work certified, retention held, advances and net due',resource:'paymentApps',icon:'Landmark'},
    {title:'Budget vs actual',desc:'What you planned, committed and actually spent',resource:'budgets',icon:'PieChart'},
    {title:'Money in & out',desc:'Client receipts and payments to suppliers',resource:'payments',icon:'Banknote'},
    {title:'Accounting entries',desc:'Posted and draft entries by month and account',resource:'journals',icon:'BookOpen'},
  ]},
  { group:'Site & materials', items:[
    {title:'Orders & deliveries',desc:'Material requests, orders and goods received',resource:'purchaseOrders',icon:'ShoppingCart'},
    {title:'Plant & equipment',desc:'Machine register, hours used and next service',resource:'equipment',icon:'Truck'},
    {title:'Stock value',desc:'Stock on hand, reorder levels and its value',resource:'inventory',icon:'Package'},
    {title:'Site queries & approvals',desc:'Open, late and answered questions from site',resource:'rfis',icon:'MessageCircleQuestion'},
    {title:'Job programme & tasks',desc:'Tasks, planned vs actual dates and progress',resource:'tasks',icon:'ListTodo'},
    {title:'Daily site diary',desc:'People on site, plant, weather and delays by day',resource:'dailyLogs',icon:'NotebookPen'},
  ]},
  { group:'People & safety', items:[
    {title:'Staff register',desc:'Staff, teams, grades and contract status',resource:'employees',icon:'UsersRound'},
    {title:'Time sheets & labour cost',desc:'Hours, overtime and labour cost per job',resource:'timesheets',icon:'Clock'},
    {title:'Wages history',desc:'Gross pay, PAYE / NSSA deductions and take-home pay',resource:'payRuns',icon:'Wallet'},
    {title:'Trade certificate expiry',desc:'Trade tickets, licences and renewals',resource:'certifications',icon:'GraduationCap'},
    {title:'Incidents & follow-up',desc:'Incidents, severity, root cause and actions taken',resource:'incidents',icon:'ShieldCheck'},
    {title:'Site checks & faults',desc:'Check scores, findings and rework',resource:'inspections',icon:'BadgeCheck'},
  ]},
];
export default function ReportsPage(){
  const display=useDisplayCurrency();
  const {org}=useParams<{org:string}>();
  const [group,setGroup]=useState('All');
  const [builderResource,setBuilderResource]=useState('projects');
  const [builderStatus,setBuilderStatus]=useState('ALL');
  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const {data:ov,isLoading}:any=useQuery({queryKey:['overview',org],queryFn:()=>apiGet(orgApi(org,'overview'))});
  const config=meta?.config||{modules:[],resources:[]};
  const on=(id:string)=>resourceFullyEnabled(config,id);
  const mod=(id:string)=>moduleEnabled(config,id);
  const available=REPORTS.map(g=>({...g,items:g.items.filter(i=>on(i.resource))})).filter(g=>g.items.length);
  const groups=['All',...available.map(g=>g.group)];
  const items=available.flatMap(g=>g.items.map(i=>({...i,group:g.group}))).filter(i=>group==='All'||i.group===group);
  const defs=(meta?.resources||[]).filter((d:any)=>on(d.id));
  const base=ov?.currency||'USD'; const fx=ov?.fx;
  const statuses=(defs.find((d:any)=>d.id===builderResource)?.statusOptions)||[];
  useEffect(()=>{ if(meta&&!on(builderResource)&&defs[0]) setBuilderResource(defs[0].id); },[meta]); // eslint-disable-line
  return <div className="space-y-4">
    <div><h1 className="heading">Reports</h1><p className="mt-1 caption">Ready-made lists from your own records. Download any view as a CSV for Excel or your bookkeeper.</p>{display.preference&&display.currency!==base&&<p className="mt-2 text-[11px] font-medium text-brand-700 dark:text-brand-300">Reports stay in the workspace base currency, {base}. Your personal {display.currency} view applies to lists, dashboards and record details.</p>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {isLoading?Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24"/>):[
        ['Records kept',num(Object.entries(ov?.counts||{}).filter(([k])=>on(k)).reduce((a:number,[,b]:any)=>a+Number(b),0)),true],
        ['Value of jobs',money(ov?.kpis?.contractValue,base,true),on('projects')||on('estimates')],
        ['Safety score',pct(ov?.kpis?.safetyScore),on('incidents')||on('inspections')],
        ['Open site queries',num(ov?.kpis?.openRfis),on('rfis')],
      ].filter((x:any)=>x[2]).map(([l,v]:any)=><Card key={String(l)} className="p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p><p className="mt-1.5 text-[20px] font-semibold tabular-nums">{v}</p></Card>)}
    </div>
    {fx&&fx.enabled.length>1&&(mod('finance')||mod('billing')||mod('wallets'))&&<Card><CardHead title="Money by currency" subtitle={`Converted to ${base} for reporting · manual rates from Settings`}/>
      <div className="grid gap-px bg-slate-200 dark:bg-ink-800 sm:grid-cols-2 lg:grid-cols-4">{fx.enabled.map((c:string)=>{const row=(fx.byCurrency||[]).find((x:any)=>x.currency===c);return <div key={c} className="bg-white p-3.5 dark:bg-ink-900"><p className="text-[11px] font-semibold uppercase muted">{c}{c===fx.base?' · base':''}</p><p className="mt-1 text-[15px] font-semibold tabular-nums">{money(row?.amount||0,c,true)}</p><p className="text-[10px] muted">{c===fx.base?'As entered':`${money(row?.baseAmount||0,fx.base,true)} in ${fx.base}`}</p></div>;})}</div></Card>}
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden"><CardHead title="Money billed over time" subtitle="Client invoices by month"/><div className="p-4 text-ink-500 dark:text-slate-400">{isLoading?<Skeleton className="h-[170px]"/>:<BarChart data={ov?.revenueSeries||[]} height={170} currency={base}/>}</div></Card>
      <Card className="overflow-hidden"><CardHead title="Where costs went" subtitle="Actual cost by category"/><div className="p-4">{isLoading?<Skeleton className="h-[160px]"/>:ov?.costBreakdown?.length?<DonutChart data={ov.costBreakdown} size={140} currency={base}/>:<EmptyState compact icon="PieChart" title="No cost data"/>}</div></Card>
    </div>
    <Card><CardHead title="Make your own list" subtitle="Choose a list, filter it, then download"/>
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="List"><select className="select" value={builderResource} onChange={e=>{setBuilderResource(e.target.value);setBuilderStatus('ALL');}}>{defs.map((d:any)=><option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
        <Field label="Status filter"><select className="select" value={builderStatus} onChange={e=>setBuilderStatus(e.target.value)}><option value="ALL">All statuses</option>{statuses.map((s:string)=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select></Field>
        <div className="flex items-end gap-2"><a className="flex-1" href={orgApi(org,`records/${builderResource}?mode=csv&status=${builderStatus}`)} download><Button variant="primary" className="w-full" icon="Download">Export CSV</Button></a><Link href={`/${org}/m/${builderResource}?status=${builderStatus}`}><Button icon="Table2">Open</Button></Link></div>
      </div>
    </Card>
    <div className="flex flex-wrap items-center gap-2">{groups.map(g=><button key={g} onClick={()=>setGroup(g)} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${group===g?'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'divider muted'}`}>{g}</button>)}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(r=>{
      const enabled=on(r.resource);
      return <Card key={r.title} className="card-hover flex flex-col p-3.5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={r.icon} size={17}/></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">{r.title}</p><p className="mt-1 text-xs leading-relaxed muted">{r.desc}</p></div></div>
        <div className="mt-3.5 flex items-center justify-between border-t divider pt-2.5"><div className="flex items-center gap-2"><Badge tone="slate">{r.group}</Badge><span className="text-[11px] muted">{num(ov?.counts?.[r.resource])} rows</span></div>
          <div className="flex gap-1.5">{enabled?<a href={orgApi(org,`records/${r.resource}?mode=csv`)} download><Button size="sm" icon="Download">CSV</Button></a>:<Badge tone="amber">Module off</Badge>}{enabled&&<Link href={`/${org}/m/${r.resource}`}><Button size="sm" variant="ghost" icon="ArrowUpRight">Open</Button></Link>}</div></div></Card>;})}</div>
  </div>;
}
