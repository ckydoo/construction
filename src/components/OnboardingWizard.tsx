'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMPANY_TYPES, COMPANY_SIZES, QUALIFIERS, MODULES, resolveWorkspace, STARTER_MODULE_IDS } from '@/lib/catalog';
import { apiSend } from '@/lib/client';
import { Button, Icon, Field, Badge, Toggle } from './ui';
import * as Lucide from '@/components/lucide';

const STEPS = [
  { id:1, title:'Company profile', desc:'The basics about your organisation' },
  { id:2, title:'Company type', desc:'What kind of work you do' },
  { id:3, title:'Company size', desc:'How big your team is today' },
  { id:4, title:'How you work', desc:'Delivery model and requirements' },
  { id:5, title:'Your workspace', desc:'Start small, add what you need' },
];
const HEADCOUNTS:Record<string,number>={MICRO:6,SMALL:28,MID:85,LARGE:520,ENTERPRISE:1400};
const COUNTRIES=['ZW','ZA','ZM','BW','MW','MZ','KE','NG','GB','US','AE','OTHER'];

export default function OnboardingWizard({initialName,userName}:{initialName:string;userName:string}){
  const router=useRouter();
  const [step,setStep]=useState(1);
  const [name,setName]=useState(initialName);
  const [legalName,setLegalName]=useState(initialName);
  const [regNumber,setRegNumber]=useState('');
  const [country,setCountry]=useState('ZW');
  const [baseCurrency,setBaseCurrency]=useState('USD');
  const [companyType,setCompanyType]=useState('GENERAL_CONTRACTOR');
  const [size,setSize]=useState('SMALL');
  const [headcount,setHeadcount]=useState('28');
  const [revenueBand,setRevenueBand]=useState('$1M – $10M');
  const [qualifiers,setQualifiers]=useState<string[]>([]);
  const [addons,setAddons]=useState<string[]>([]);
  const [loadDemo,setLoadDemo]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const config=useMemo(()=>resolveWorkspace({companyType,size,headcount:Number(headcount),revenueBand,qualifiers,addons}),[companyType,size,headcount,revenueBand,qualifiers,addons]);
  const enabled=useMemo(()=>new Set(config.modules),[config]);
  const byGroup=useMemo(()=>{
    const g:Record<string,typeof MODULES>={};
    for(const m of MODULES){ (g[m.group] ||= []).push(m); }
    return g;
  },[]);
  const starter=new Set(STARTER_MODULE_IDS);
  const optional=MODULES.filter(m=>!starter.has(m.id)&&!enabled.has(m.id));

  function toggleQ(id:string){ setQualifiers(q=>q.includes(id)?q.filter(x=>x!==id):[...q,id]); }
  function toggleAddon(id:string){ setAddons(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]); }
  const canNext = step===1 ? name.trim().length>1 : true;

  async function finish(){
    setLoading(true); setError('');
    try{
      const r=await apiSend('/api/onboarding','POST',{name,legalName,regNumber,country,baseCurrency,companyType,size,headcount:Number(headcount),revenueBand,qualifiers,addons,loadDemo});
      router.push(`/${r.slug}/dashboard`); router.refresh();
    }catch(e:any){ setError(e.message||'Could not create workspace'); setLoading(false); }
  }

  return <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
    <header className="border-b divider bg-white dark:bg-ink-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-ink-950"><Icon name="HardHat" size={18}/></span><span className="font-semibold tracking-tight">Build<span className="text-brand-500">Ops</span></span></div>
        <div className="flex items-center gap-3"><span className="hidden text-xs muted sm:block">Setting up workspace for {userName}</span><button onClick={async()=>{await apiSend('/api/auth/logout','POST');router.push('/login');router.refresh();}} className="text-xs font-medium muted hover:text-ink-900 dark:hover:text-white">Sign out</button></div>
      </div>
    </header>
    <div className="mx-auto flex max-w-6xl gap-8 px-5 py-8">
      <aside className="hidden w-56 shrink-0 lg:block">
        <p className="mb-5 text-xs font-semibold uppercase tracking-wider muted">Setup · Step {step} of 5</p>
        <ol className="space-y-1">{STEPS.map(s=>{
          const done=s.id<step, active=s.id===step;
          return <li key={s.id} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${active?'bg-white shadow-sm dark:bg-ink-900':''}`}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done?'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300':active?'bg-brand-500 text-ink-950':'bg-slate-200 text-slate-500 dark:bg-ink-800'}`}>{done?<Lucide.Check size={13}/>:s.id}</span>
            <div><p className={`text-sm font-medium ${active?'text-ink-900 dark:text-white':'muted'}`}>{s.title}</p><p className="text-[11px] muted">{s.desc}</p></div>
          </li>;})}</ol>
        <div className="mt-8 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 dark:border-brand-500/20 dark:bg-brand-500/5">
          <p className="text-xs font-semibold text-brand-800 dark:text-brand-300">Essentials first</p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-900/70 dark:text-brand-200/70">Every workspace starts with the connected essentials pack — including client wallets. Your answers and add-ons decide what else appears — switch more on whenever you are ready in Settings.</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-2 lg:hidden">{STEPS.map(s=><span key={s.id} className={`h-1.5 flex-1 rounded-full ${s.id<=step?'bg-brand-500':'bg-slate-200 dark:bg-ink-800'}`}/>)}</div>
        <div className="card p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Step {step} of 5</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">{STEPS[step-1].title}</h1>
          <p className="mt-1 text-sm muted">{STEPS[step-1].desc}</p>

          {step===1&&<div className="mt-7 grid gap-5 sm:grid-cols-2">
            <Field label="Company / trading name" required><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ridgeway Constructors"/></Field>
            <Field label="Legal name"><input className="input" value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="…(Pvt) Ltd"/></Field>
            <Field label="Registration number"><input className="input" value={regNumber} onChange={e=>setRegNumber(e.target.value)} placeholder="2019/012345/07"/></Field>
            <Field label="Country"><select className="select" value={country} onChange={e=>setCountry(e.target.value)}>{COUNTRIES.map(c=><option key={c} value={c}>{({ZW:'Zimbabwe',ZA:'South Africa',ZM:'Zambia',BW:'Botswana',MW:'Malawi',MZ:'Mozambique',KE:'Kenya',NG:'Nigeria',GB:'United Kingdom',US:'United States',AE:'United Arab Emirates',OTHER:'Other'} as any)[c]}</option>)}</select></Field>
            <Field label="Base currency"><select className="select" value={baseCurrency} onChange={e=>setBaseCurrency(e.target.value)}>{['USD','ZWG','ZAR','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></Field>
            <div className="rounded-xl border border-dashed divider bg-slate-50/60 p-4 text-xs muted dark:bg-ink-950/40 sm:col-span-2"><span className="font-semibold text-ink-700 dark:text-slate-200">Regional pack: Zimbabwe / Southern Africa</span><br/>VAT at 15%, USD + ZWG multi-currency, NEC / FIDIC / JBCC contract forms, NSSA & PAYE payroll concepts and local tax invoice numbering.</div>
          </div>}

          {step===2&&<div className="mt-7 grid gap-3 sm:grid-cols-2">{COMPANY_TYPES.map(t=>{
            const on=companyType===t.id;
            return <button key={t.id} onClick={()=>setCompanyType(t.id)} className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition ${on?'border-brand-400 bg-brand-50/70 ring-2 ring-brand-400/30 dark:bg-brand-500/10':'divider bg-white hover:border-slate-300 dark:bg-ink-900'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on?'bg-brand-500 text-ink-950':'bg-slate-100 text-ink-500 dark:bg-ink-800 dark:text-slate-400'}`}><Icon name={t.icon} size={20}/></span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink-900 dark:text-white">{t.label}</span><span className="mt-0.5 block text-xs muted">{t.desc}</span></span>
              {on&&<Lucide.CheckCircle2 size={17} className="ml-auto shrink-0 text-brand-600"/>}
            </button>;})}</div>}

          {step===3&&<div className="mt-7">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{COMPANY_SIZES.map(s=>{
              const on=size===s.id;
              return <button key={s.id} onClick={()=>{setSize(s.id);setHeadcount(String(HEADCOUNTS[s.id]||85));}} className={`rounded-xl border p-4 text-left transition ${on?'border-brand-400 bg-brand-50/70 ring-2 ring-brand-400/30 dark:bg-brand-500/10':'divider bg-white hover:border-slate-300 dark:bg-ink-900'}`}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-ink-900 dark:text-white">{s.label}</span>{on&&<Lucide.CheckCircle2 size={16} className="text-brand-600"/>}</div>
                <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{s.range}</p><p className="mt-2 text-xs muted">{s.desc}</p>
                <p className="mt-3 border-t divider pt-2 text-[11px] muted">Up to {s.users.toLocaleString()} users</p>
              </button>;})}</div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Approximate headcount"><input className="input" type="number" min={1} value={headcount} onChange={e=>setHeadcount(e.target.value)}/></Field>
              <Field label="Annual revenue band"><select className="select" value={revenueBand} onChange={e=>setRevenueBand(e.target.value)}>{['< $1M','$1M – $10M','$10M – $50M','$50M – $100M','$100M+'].map(v=><option key={v}>{v}</option>)}</select></Field>
            </div>
          </div>}

          {step===4&&<div className="mt-7">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider muted">Select everything that applies — each choice can switch on extra modules</p>
            <div className="grid gap-2.5 sm:grid-cols-2">{QUALIFIERS.map(q=>{
              const on=qualifiers.includes(q.id);
              return <button key={q.id} onClick={()=>toggleQ(q.id)} className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition ${on?'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10':'divider bg-white dark:bg-ink-900'}`}>
                <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${on?'border-brand-500 bg-brand-500 text-ink-950':'border-slate-300 dark:border-ink-600'}`}>{on&&<Lucide.Check size={12}/>}</span><span className="text-ink-800 dark:text-slate-200">{q.label}</span>
              </button>;})}</div>
            <div className="mt-6 rounded-xl border divider bg-slate-50/60 p-4 dark:bg-ink-950/40">
              <p className="text-xs font-semibold text-ink-800 dark:text-slate-200">What these unlock</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">{Object.entries(config.flags).filter(([,v])=>v).map(([k])=><Badge key={k} tone="blue">{k.replace(/([A-Z])/g,' $1').trim()}</Badge>)}</div>
            </div>
          </div>}

          {step===5&&<div className="mt-7 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Modules',config.modules.length],['Resources',config.resources.length],['Users',config.limits.users.toLocaleString()],['Plan',config.plan]].map(([l,v])=><div key={String(l)} className="rounded-xl border divider bg-slate-50/60 p-3.5 dark:bg-ink-950/40"><p className="text-[11px] font-semibold uppercase tracking-wider muted">{l}</p><p className="mt-1 text-lg font-semibold text-ink-900 dark:text-white">{v}</p></div>)}
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
              <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">You start with {STARTER_MODULE_IDS.length} essential modules — one connected chain from clients to cash</p>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-900/75 dark:text-emerald-200/70">Clients → leads → estimates & bids → projects → contracts → documents → invoices & payments, plus people and reporting. Everything else is optional below, and can be enabled later in Settings → Modules.</p>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-ink-900 dark:text-white">Your module pack</p><span className="text-xs muted">{config.modules.length} enabled</span></div>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border divider p-4">{Object.entries(byGroup).map(([group,mods])=><div key={group}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider muted">{group}</p>
                <div className="flex flex-wrap gap-1.5">{mods.map(m=><span key={m.id} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ${enabled.has(m.id)?'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300':'bg-slate-100 text-slate-400 dark:bg-ink-800 dark:text-slate-500'}`}><Icon name={m.icon} size={12}/>{m.label}{starter.has(m.id)&&<span className="ml-0.5 rounded bg-emerald-600/15 px-1 text-[9px] font-bold uppercase">core</span>}</span>)}</div>
              </div>)}</div>
            </div>
            {optional.length>0&&<div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">Optional add-ons <span className="font-normal muted">({optional.length} available)</span></p>
                <div className="flex gap-2"><button onClick={()=>setAddons(MODULES.map(m=>m.id))} className="text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300">Enable all</button><button onClick={()=>{setAddons([]);setQualifiers([]);}} className="text-[11px] font-medium muted hover:underline">Reset to essentials</button></div></div>
              <div className="max-h-48 overflow-y-auto rounded-xl border divider p-3"><div className="flex flex-wrap gap-2">{optional.map(m=>{
              const on=addons.includes(m.id);
              return <button key={m.id} onClick={()=>toggleAddon(m.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${on?'border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'divider muted'}`}>{on?<Lucide.Check size={12}/>:<Lucide.Plus size={12}/>}{m.label}</button>;})}</div></div></div>}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-500/20 dark:bg-brand-500/5">
              <div><p className="text-sm font-semibold text-ink-900 dark:text-white">Load realistic demo data</p><p className="mt-0.5 text-xs muted">616 records: 5 projects, 42 employees, POs, invoices, timesheets, RFIs, safety events and more.</p></div>
              <Toggle checked={loadDemo} onChange={setLoadDemo}/>
            </div>
            {error&&<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          </div>}

          <div className="mt-8 flex items-center justify-between border-t divider pt-5">
            <Button variant="ghost" onClick={()=>setStep(s=>Math.max(1,s-1))} disabled={step===1} icon="ArrowLeft">Back</Button>
            {step<5?<Button variant="primary" disabled={!canNext} onClick={()=>setStep(s=>s+1)}>Continue<Lucide.ArrowRight size={15}/></Button>
              :<Button variant="primary" loading={loading} onClick={finish} icon="Rocket">Create workspace</Button>}
          </div>
        </div>
        <p className="mt-4 text-center text-xs muted">You can enable or disable any module later in <strong>Settings → Modules</strong>.</p>
      </main>
    </div>
  </div>;
}
