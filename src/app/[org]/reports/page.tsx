'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, orgApi } from '@/lib/client';
import { money, num, pct } from '@/lib/format';
import { Card, CardHead, Button, Icon, Badge, Skeleton, EmptyState, Field } from '@/components/ui';
import { BarChart, DonutChart } from '@/components/Charts';

const REPORTS = [
  { group:'Commercial', items:[
    {title:'Project portfolio summary',desc:'Every project with contract value, cost, progress and health',resource:'projects',icon:'HardHat'},
    {title:'Bid pipeline & win rate',desc:'Opportunities by stage, probability and expected value',resource:'leads',icon:'Target'},
    {title:'Estimate vs award analysis',desc:'All estimates with build-ups, markup and outcome',resource:'estimates',icon:'Calculator'},
    {title:'Contracts & variations register',desc:'Prime contracts and approved change orders',resource:'changeOrders',icon:'FileSignature'},
  ]},
  { group:'Financial', items:[
    {title:'Accounts receivable ageing',desc:'Client invoices, due dates, amounts paid and overdue items',resource:'arInvoices',icon:'Receipt'},
    {title:'Accounts payable & commitments',desc:'Supplier bills and purchase order commitments',resource:'apBills',icon:'FileInput'},
    {title:'Payment certificates & retention',desc:'Gross certified, retention held, advances and net due',resource:'paymentApps',icon:'Landmark'},
    {title:'Budget vs actual (CVR)',desc:'Cost code budget, committed, actual and variance',resource:'budgets',icon:'PieChart'},
    {title:'Cash movements',desc:'All client receipts and supplier payments',resource:'payments',icon:'Banknote'},
    {title:'General ledger journals',desc:'Posted and draft journals by period and account',resource:'journals',icon:'BookOpen'},
  ]},
  { group:'Operations', items:[
    {title:'Procurement status',desc:'Requisitions, purchase orders and goods received',resource:'purchaseOrders',icon:'ShoppingCart'},
    {title:'Plant & equipment utilisation',desc:'Asset register, hour meters, service due dates',resource:'equipment',icon:'Truck'},
    {title:'Inventory valuation',desc:'Stock on hand, reorder levels and stock value',resource:'inventory',icon:'Package'},
    {title:'RFI & submittal status',desc:'Open, overdue and closed technical communications',resource:'rfis',icon:'MessageCircleQuestion'},
    {title:'Programme & WBS status',desc:'Tasks, planned vs actual dates and progress',resource:'tasks',icon:'ListTodo'},
    {title:'Daily site production',desc:'Manpower, plant, weather and delays by day',resource:'dailyLogs',icon:'NotebookPen'},
  ]},
  { group:'People & HSE', items:[
    {title:'Workforce register',desc:'Employees, departments, grades and contract status',resource:'employees',icon:'UsersRound'},
    {title:'Timesheet & labour cost',desc:'Hours, overtime and allocated labour cost',resource:'timesheets',icon:'Clock'},
    {title:'Payroll history',desc:'Gross, statutory deductions and net pay by period',resource:'payRuns',icon:'Wallet'},
    {title:'Certification expiry',desc:'Competency tickets, licences and renewal status',resource:'certifications',icon:'GraduationCap'},
    {title:'HSE incident & CAPA',desc:'Incidents, severity, root cause and corrective actions',resource:'incidents',icon:'ShieldCheck'},
    {title:'Quality inspections & NCRs',desc:'Inspection scores, findings and non-conformances',resource:'inspections',icon:'BadgeCheck'},
  ]},
];
export default function ReportsPage(){
  const {org}=useParams<{org:string}>();
  const [group,setGroup]=useState('All');
  const [builderResource,setBuilderResource]=useState('projects');
  const [builderStatus,setBuilderStatus]=useState('ALL');
  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const {data:ov,isLoading}:any=useQuery({queryKey:['overview',org],queryFn:()=>apiGet(orgApi(org,'overview'))});
  const groups=['All',...REPORTS.map(g=>g.group)];
  const items=REPORTS.flatMap(g=>g.items.map(i=>({...i,group:g.group}))).filter(i=>group==='All'||i.group===group);
  const defs=meta?.resources||[];
  const statuses=(defs.find((d:any)=>d.id===builderResource)?.statusOptions)||[];
  return <div className="space-y-4">
    <div><h1 className="heading">Reports & business intelligence</h1><p className="mt-1 caption">Standard reports built from live workspace records. Export any view to CSV for Excel or your accounting system.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {isLoading?Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24"/>):[
        ['Total records',num(Object.values(ov?.counts||{}).reduce((a:number,b:any)=>a+Number(b),0))],['Contract value',money(ov?.kpis?.contractValue,'USD',true)],['Safety score',pct(ov?.kpis?.safetyScore)],['Open RFIs',num(ov?.kpis?.openRfis)],
      ].map(([l,v])=><Card key={String(l)} className="p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p><p className="mt-1.5 text-[20px] font-semibold tabular-nums">{v}</p></Card>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden"><CardHead title="Revenue trend" subtitle="Client invoices by month"/><div className="p-4 text-ink-500 dark:text-slate-400">{isLoading?<Skeleton className="h-[170px]"/>:<BarChart data={ov?.revenueSeries||[]} height={170}/>}</div></Card>
      <Card className="overflow-hidden"><CardHead title="Cost mix" subtitle="Actual cost by category"/><div className="p-4">{isLoading?<Skeleton className="h-[160px]"/>:ov?.costBreakdown?.length?<DonutChart data={ov.costBreakdown} size={140}/>:<EmptyState compact icon="PieChart" title="No cost data"/>}</div></Card>
    </div>
    <Card><CardHead title="Custom report builder" subtitle="Pick a dataset and filter, then export"/>
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Dataset"><select className="select" value={builderResource} onChange={e=>{setBuilderResource(e.target.value);setBuilderStatus('ALL');}}>{defs.filter((d:any)=>meta?.config?.resources?.includes(d.id)).map((d:any)=><option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
        <Field label="Status filter"><select className="select" value={builderStatus} onChange={e=>setBuilderStatus(e.target.value)}><option value="ALL">All statuses</option>{statuses.map((s:string)=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}</select></Field>
        <div className="flex items-end gap-2"><a className="flex-1" href={orgApi(org,`records/${builderResource}?mode=csv&status=${builderStatus}`)} download><Button variant="primary" className="w-full" icon="Download">Export CSV</Button></a><Link href={`/${org}/m/${builderResource}?status=${builderStatus}`}><Button icon="Table2">Open</Button></Link></div>
      </div>
    </Card>
    <div className="flex flex-wrap items-center gap-2">{groups.map(g=><button key={g} onClick={()=>setGroup(g)} className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${group===g?'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'divider muted'}`}>{g}</button>)}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(r=>{
      const enabled=meta?.config?.resources?.includes(r.resource);
      return <Card key={r.title} className="card-hover flex flex-col p-3.5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={r.icon} size={17}/></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">{r.title}</p><p className="mt-1 text-xs leading-relaxed muted">{r.desc}</p></div></div>
        <div className="mt-3.5 flex items-center justify-between border-t divider pt-2.5"><div className="flex items-center gap-2"><Badge tone="slate">{r.group}</Badge><span className="text-[11px] muted">{num(ov?.counts?.[r.resource])} rows</span></div>
          <div className="flex gap-1.5">{enabled?<a href={orgApi(org,`records/${r.resource}?mode=csv`)} download><Button size="sm" icon="Download">CSV</Button></a>:<Badge tone="amber">Module off</Badge>}<Link href={`/${org}/m/${r.resource}`}><Button size="sm" variant="ghost" icon="ArrowUpRight">Open</Button></Link></div></div></Card>;})}</div>
  </div>;
}
