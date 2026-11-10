'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { money, num, date, ago } from '@/lib/format';
import { Button, Card, CardHead, Icon, Badge, StatusPill, Field, Tabs, Skeleton, EmptyState, ProgressBar, Drawer, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/Providers';

type WalletRow = {
  clientId:string; clientName:string; clientNumber:string|null; clientStatus:string|null;
  walletId:string|null; currency:string; balance:number; baseBalance:number; baseToppedUp:number; baseNetAllocated:number; toppedUp:number; allocated:number;
  reversed:number; netAllocated:number; projectCount:number; lastActivity:string|null; txCount:number;
};
type WalletsData = {
  wallets:WalletRow[]; currency:string; baseCurrency?:string; fx?:any; role:string; scoped:string|null;
  summary:{ clientCount:number; fundedWallets:number; totalBalance:number; totalToppedUp:number; totalAllocated:number; fundedProjects:number };
};
type LedgerTx = { id:string; kind:string; amount:number; balanceAfter:number; currency:string; projectId:string|null;
  reference:string|null; method:string|null; note:string|null; actorName:string; reversesId:string|null; reversedAt:string|null; createdAt:string };
type Detail = {
  client:{id:string;name:string;number:string|null;status:string|null};
  wallet:{id:string|null;balance:number;currency:string;createdAt:string|null};
  ledger:LedgerTx[];
  projects:{id:string;name:string;code:string|null;contractValue:number;fundedAmount:number;remainingToFund:number;status:string|null}[];
  totals:{toppedUp:number;allocated:number;transactions:number};
};

const KINDS:Record<string,{label:string;tone:string}> = {
  TOPUP:{label:'Funds added',tone:'green'}, ALLOCATION:{label:'Project funding',tone:'blue'}, REVERSAL:{label:'Reversal',tone:'amber'},
};

function Inner(){
  const {org}=useParams<{org:string}>();
  const sp=useSearchParams(); const qc=useQueryClient(); const toast=useToast();
  const deepClient=sp.get('client');
  const [selected,setSelected]=useState<string|null>(deepClient);
  const [tab,setTab]=useState('ledger');
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState<null|{tx:LedgerTx}>(null);
  const [topup,setTopup]=useState({amount:'',reference:'',method:'Bank transfer (USD)',note:''});
  const [alloc,setAlloc]=useState({amount:'',projectId:'',note:''});
  const {data:meta}:any=useQuery({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const {data,isLoading,refetch}=useQuery<WalletsData>({queryKey:['wallets',org],queryFn:()=>apiGet(orgApi(org,'wallets'))});
  const {data:detail,isLoading:detailLoading}=useQuery<Detail>({queryKey:['wallet',org,selected],queryFn:()=>apiGet(orgApi(org,`wallets/${selected}`)),enabled:!!selected});
  const caps:string[]=meta?.permissions?.capabilities||[];
  const canTopup=caps.includes('wallet.topup'), canAllocate=caps.includes('wallet.allocate'), canReverse=caps.includes('wallet.refund');
  useEffect(()=>{ if(deepClient) setSelected(deepClient); },[deepClient]);
  useEffect(()=>{ if(detail?.projects?.length&&!alloc.projectId) setAlloc(v=>({...v,projectId:detail.projects[0].id})); },[detail]);

  const invalidate=async()=>{
    await Promise.all([
      qc.invalidateQueries({queryKey:['wallets',org]}), qc.invalidateQueries({queryKey:['wallet',org,selected]}),
      qc.invalidateQueries({queryKey:['meta',org]}), qc.invalidateQueries({queryKey:['overview',org]}),
      qc.invalidateQueries({queryKey:['records',org]}), qc.invalidateQueries({queryKey:['project',org]}),
    ]);
  };
  async function act(action:'topup'|'allocate'|'reverse', body:any, delta:number){
    if(!selected) return;
    setBusy(true);
    const prev=qc.getQueryData(['wallets',org]);
    if(delta) qc.setQueryData(['wallets',org],(old:any)=>{
      if(!old) return old;
      const w=old.wallets.find((x:WalletRow)=>x.clientId===selected);
      const rate=Number(old.fx?.rates?.[detail?.wallet.currency||w?.currency||'USD'])||1;
      const baseDelta=delta/rate;
      return {...old,
        wallets:old.wallets.map((x:WalletRow)=>x.clientId===selected?{
          ...x, balance:Math.max(0,x.balance+delta), baseBalance:Math.max(0,x.baseBalance+baseDelta),
        }:x),
        summary:{...old.summary,totalBalance:old.summary.totalBalance+baseDelta},
      };
    });
    try{
      const r:any=await apiSend(orgApi(org,`wallets/${selected}`),'POST',{action,...body});
      toast.push({tone:'success',title:action==='topup'?'Funds added':action==='allocate'?'Project funded':'Entry reversed',
        description:`New balance ${money(r.balance,detail?.wallet.currency||'USD')}`});
      setTopup({amount:'',reference:'',method:'Bank transfer (USD)',note:''});
      setAlloc(v=>({...v,amount:'',note:''}));
      await invalidate();
    }catch(e:any){
      if(prev) qc.setQueryData(['wallets',org],prev);
      toast.push({tone:'error',title:'Wallet action failed — rolled back',description:e.message});
    }finally{ setBusy(false); setConfirm(null); }
  }

  if(isLoading||!meta) return <div className="space-y-4"><Skeleton className="h-10 w-1/3"/><div className="grid gap-4 sm:grid-cols-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-28"/>)}</div><Skeleton className="h-96"/></div>;
  if(!meta.walletEnabled) return <Card><EmptyState icon="CreditCard" title="Client wallets module is off" description="Enable it in Settings → Modules to start funding projects from client advances." action={<Link href={`/${org}/settings`}><Button variant="primary">Open settings</Button></Link>}/></Card>;
  if(!caps.includes('wallet.read')) return <Card><EmptyState icon="Lock" title="Access restricted" description={`Your role (${meta.role.replace(/_/g,' ')}) does not include client wallet access. Ask an owner or administrator to change your role.`}/></Card>;

  const s=data?.summary, rows=data?.wallets||[];
  const base=data?.baseCurrency||data?.currency||'USD'; const fx=data?.fx;
  const active=rows.find(w=>w.clientId===selected);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="heading">Client wallets</h1><p className="caption mt-1">Money clients pay in advance, kept per client, put on their own jobs and recorded every step.</p></div>
      <div className="flex items-center gap-2"><Badge tone="slate">{meta.role.replace(/_/g,' ')}</Badge>
        <Button variant="ghost" size="icon" onClick={()=>refetch()}><Icon name="RefreshCw" size={16}/></Button>
        <Link href={`/${org}/m/clients`}><Button variant="outline" size="sm" icon="Handshake">Clients</Button></Link></div>
    </div>
    {!canTopup&&<div className="rounded-md border divider bg-slate-50 px-4 py-2.5 text-xs muted dark:bg-ink-900">
      {canAllocate?'You can fund your own projects from this wallet. Only owners, admins and finance managers can add funds or reverse entries.'
        :'Read-only wallet access. Contact an administrator for funding changes.'}
    </div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[['Available balance',money(s?.totalBalance,base),'Across all client wallets','Wallet','brand'],
        ['Funded to projects',money(s?.totalAllocated,base),`${num(s?.fundedProjects)} projects funded`,'ArrowUpRight','blue'],
        ['Total topped up',money(s?.totalToppedUp,base),'All-time admin deposits','Landmark','green'],
        ['Active wallets',`${num(s?.fundedWallets)} / ${num(s?.clientCount)}`,'Clients with wallet activity','CreditCard','violet'],
      ].map(([l,v,sub])=><Card key={String(l)} className="p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p><p className="mt-1.5 truncate text-[20px] font-semibold tabular-nums tracking-tight text-ink-900 dark:text-white">{v}</p><p className="caption mt-0.5">{sub}</p></Card>)}
    </div>
    {fx&&fx.byCurrency?.length>1&&<Card><CardHead title={`Balances in ${base}`} subtitle="Each wallet keeps its own currency; totals use the manual rates in Settings → Currencies"/>
      <div className="grid gap-px bg-slate-200 dark:bg-ink-800 sm:grid-cols-2 lg:grid-cols-4">{fx.byCurrency.map((x:any)=><div key={x.currency} className="bg-white p-3.5 dark:bg-ink-900"><p className="text-[11px] font-semibold uppercase muted">{x.currency}{x.currency===fx.base?' · base':''}</p><p className="mt-1 text-[15px] font-semibold tabular-nums">{money(x.amount,x.currency,true)}</p><p className="text-[10px] muted">{x.currency===fx.base?'As entered':`${money(x.baseAmount,fx.base,true)} in ${fx.base}`}</p></div>)}</div></Card>}
    <Card className="overflow-hidden">
      <CardHead title="All client wallets" subtitle={`${rows.length} clients · balances checked against the record`} action={<Badge tone="green">Every move recorded</Badge>}/>
      {rows.length===0?<div className="p-5"><EmptyState compact icon="CreditCard" title="No clients yet" description="Create a client first, then add funds to its wallet."/></div>:
      <div className="overflow-x-auto"><table className="w-full text-left text-[13px]"><thead className="border-y divider bg-slate-50 muted dark:bg-ink-950/50">
        <tr><th className="table-th">Client</th><th className="table-th text-right">Wallet balance</th><th className="table-th text-right">Topped up</th><th className="table-th text-right">Allocated</th><th className="table-th hidden text-right sm:table-cell">Projects</th><th className="table-th hidden md:table-cell">Last activity</th><th className="table-th"/></tr></thead>
        <tbody className="divide-y divider">{rows.map(w=><tr key={w.clientId} className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-ink-800/50" onClick={()=>{setSelected(w.clientId);setTab('ledger');}}>
          <td className="table-td"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:text-slate-400"><Icon name="Building2" size={15}/></span><div className="min-w-0"><p className="truncate font-medium text-ink-900 dark:text-white">{w.clientName}</p><p className="truncate text-[10px] muted">{w.clientNumber||'—'} · {w.txCount} entries</p></div></div></td>
          <td className="table-td text-right"><span className="font-semibold tabular-nums">{money(w.balance,w.currency)}</span>{w.toppedUp>0&&<div className="ml-auto mt-1 w-24"><ProgressBar value={w.toppedUp?Math.min(100,w.netAllocated/w.toppedUp*100):0}/></div>}</td>
          <td className="table-td text-right tabular-nums muted">{money(w.toppedUp,w.currency)}</td>
          <td className="table-td text-right tabular-nums muted">{money(w.netAllocated,w.currency)}</td>
          <td className="table-td hidden text-right sm:table-cell"><Badge tone={w.projectCount?'blue':'slate'}>{w.projectCount} funded</Badge></td>
          <td className="table-td hidden muted md:table-cell">{w.lastActivity?ago(w.lastActivity):'—'}</td>
          <td className="table-td text-right"><Button size="sm" variant="ghost" icon="ChevronRight" onClick={(e:any)=>{e.stopPropagation();setSelected(w.clientId);setTab('ledger');}}>Open</Button></td>
        </tr>)}</tbody></table></div>}
    </Card>

    <Drawer open={!!selected} onClose={()=>setSelected(null)} width="max-w-3xl"
      title={active?.clientName||detail?.client.name||'Client wallet'}
      subtitle={active?.clientNumber?`${active.clientNumber} · prepaid client account`:'Prepaid client account'}
      footer={<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] muted">The balance comes from the record of every movement.</p><div className="flex gap-2">{canAllocate&&<Button variant="primary" size="sm" icon="ArrowUpRight" onClick={()=>setTab('fund')}>Fund a project</Button>}{canTopup&&<Button variant="outline" size="sm" icon="Plus" onClick={()=>setTab('topup')}>Add funds</Button>}</div></div>}>
      {detailLoading||!detail?<div className="space-y-3 p-5"><Skeleton className="h-24"/><Skeleton className="h-60"/></div>:
      <div className="space-y-4">
        <div className="grid gap-3 px-5 pt-5 sm:grid-cols-3">
          <div className="rounded-md border divider bg-slate-50 p-3.5 dark:bg-ink-950/40"><p className="text-[10px] font-semibold uppercase tracking-wider muted">Amount left</p><p className="mt-1 text-2xl font-semibold tracking-tight">{money(detail.wallet.balance,detail.wallet.currency)}</p><p className="mt-1 text-[11px] muted">{detail.totals.transactions} recorded movements</p></div>
          <div className="rounded-md border divider p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide muted">Total added</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(detail.totals.toppedUp,detail.wallet.currency)}</p><p className="mt-1 text-[11px] muted">Deposits</p></div>
          <div className="rounded-md border divider p-3.5"><p className="text-[11px] font-semibold uppercase tracking-wide muted">Active funding</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(detail.totals.allocated,detail.wallet.currency)}</p><p className="mt-1 text-[11px] muted">{detail.projects.filter(p=>p.fundedAmount>0).length} projects</p></div>
        </div>
        <div className="px-5"><Tabs tabs={[{id:'ledger',label:'Ledger',count:detail.ledger.length},{id:'projects',label:'Projects',count:detail.projects.length},...(canTopup?[{id:'topup',label:'Add funds'}]:[]),...(canAllocate?[{id:'fund',label:'Fund a project'}]:[])]} active={tab} onChange={setTab}/></div>
        {tab==='ledger'&&<div className="px-5 pb-5">
          {!detail.ledger.length?<EmptyState compact icon="Receipt" title="No wallet activity yet" description="An owner, administrator or accounts person can add the first deposit."/>:
          <div className="overflow-hidden rounded-md border divider"><table className="w-full text-left text-[13px]"><thead className="border-b divider bg-slate-50 muted dark:bg-ink-950/50"><tr><th className="table-th">Entry</th><th className="table-th">Details</th><th className="table-th text-right">Amount</th><th className="table-th text-right">Balance</th><th className="table-th"/></tr></thead>
            <tbody className="divide-y divider">{detail.ledger.map(t=><tr key={t.id} className={t.reversedAt?'opacity-55':''}>
              <td className="table-th"><Badge tone={KINDS[t.kind]?.tone||'slate'}>{KINDS[t.kind]?.label||t.kind}</Badge><p className="mt-1 text-[10px] muted">{date(t.createdAt)}</p></td>
              <td className="table-th"><p className="truncate text-ink-800 dark:text-slate-200">{t.note||t.reference||t.method||'—'}</p><p className="truncate text-[10px] muted">{t.actorName}{t.reversedAt?' · reversed':''}{t.projectId?` · ${detail.projects.find(p=>p.id===t.projectId)?.name||'project'}`:''}</p></td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${t.amount>0?'text-emerald-600 dark:text-emerald-400':'text-ink-800 dark:text-slate-200'}`}>{t.amount>0?'+':''}{money(t.amount,t.currency)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums muted">{money(t.balanceAfter,t.currency)}</td>
              <td className="px-2 py-2.5 text-right">{canReverse&&t.kind==='ALLOCATION'&&!t.reversedAt&&<button aria-label="Reverse this allocation" className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10" title="Reverse this allocation" onClick={()=>setConfirm({tx:t})}><Icon name="RotateCcw" size={14}/></button>}</td>
            </tr>)}</tbody></table></div>}
        </div>}
        {tab==='projects'&&<div className="space-y-2 px-5 pb-5">
          {!detail.projects.length?<EmptyState compact icon="HardHat" title="No projects for this client" description="Create a project linked to this client before allocating wallet funds."/>:
          detail.projects.map(p=><div key={p.id} className="rounded-md border divider p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-[11px] muted">{p.code} · contract {money(p.contractValue,detail.wallet.currency)}</p></div><StatusPill status={p.status||undefined}/></div>
            <div className="mt-3 flex items-center gap-3"><div className="flex-1"><ProgressBar value={p.contractValue?p.fundedAmount/p.contractValue*100:0}/></div><span className="text-xs font-semibold tabular-nums">{money(p.fundedAmount,detail.wallet.currency)}</span></div>
            <p className="mt-1.5 text-[11px] muted">{money(p.remainingToFund,detail.wallet.currency)} remaining to fund</p></div>)}
        </div>}
        {tab==='topup'&&canTopup&&<form className="grid gap-4 px-4 pb-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();act('topup',{...topup,amount:Number(topup.amount)},Number(topup.amount)||0);}}>
          <Field label="Amount" required><input className="input" type="number" min="0.01" step="0.01" value={topup.amount} onChange={e=>setTopup({...topup,amount:e.target.value})} placeholder="250000"/></Field>
          <Field label="Reference"><input className="input" value={topup.reference} onChange={e=>setTopup({...topup,reference:e.target.value})} placeholder="RTGS-2026-1148"/></Field>
          <Field label="Method"><select className="select" value={topup.method} onChange={e=>setTopup({...topup,method:e.target.value})}>{['Bank transfer (USD)','Bank transfer (ZWG)','Cash','Treasury warrant','Client advance','Other'].map(m=><option key={m}>{m}</option>)}</select></Field>
          <Field label="Note"><input className="input" value={topup.note} onChange={e=>setTopup({...topup,note:e.target.value})} placeholder="Deposit received"/></Field>
          <div className="sm:col-span-2"><Button variant="primary" type="submit" loading={busy} icon="Plus">Add funds to wallet</Button></div>
        </form>}
        {tab==='fund'&&canAllocate&&<form className="grid gap-4 px-4 pb-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();act('allocate',{...alloc,amount:Number(alloc.amount)},-(Number(alloc.amount)||0));}}>
          <Field label="Project" required><select className="select" value={alloc.projectId} onChange={e=>setAlloc({...alloc,projectId:e.target.value})}>{detail.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Amount" required><input className="input" type="number" min="0.01" step="0.01" value={alloc.amount} onChange={e=>setAlloc({...alloc,amount:e.target.value})} placeholder="100000"/></Field>
          <div className="sm:col-span-2"><Field label="Note"><input className="input" value={alloc.note} onChange={e=>setAlloc({...alloc,note:e.target.value})} placeholder="Mobilisation advance"/></Field></div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] muted">Available: {money(detail.wallet.balance,detail.wallet.currency)} · funds can only go to this client's own projects.</p><Button variant="primary" type="submit" loading={busy} icon="ArrowUpRight" disabled={!detail.projects.length}>Fund project</Button></div>
        </form>}
      </div>}
    </Drawer>
    <ConfirmDialog open={!!confirm} onClose={()=>setConfirm(null)} loading={busy} confirmLabel="Reverse entry"
      title="Reverse this allocation?" description={`${money(Math.abs(confirm?.tx.amount||0),confirm?.tx.currency||data?.currency||'USD')} will be credited back to the wallet and deducted from the project's funded total. Recorded movements are never deleted.`}
      onConfirm={()=>confirm&&act('reverse',{transactionId:confirm.tx.id},Math.abs(confirm.tx.amount))}/>
  </div>;
}
export default function Page(){ return <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-1/3"/><Skeleton className="h-96"/></div>}><Inner/></Suspense>; }
