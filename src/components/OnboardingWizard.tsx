'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMPANY_TYPES, COMPANY_SIZES, QUALIFIERS, MODULES, resolveWorkspace, STARTER_MODULE_IDS } from '@/lib/catalog';
import { BRAND } from '@/lib/brand';
import { apiGet, apiSend } from '@/lib/client';
import { useQuery } from '@tanstack/react-query';
import { entitledModules, entitledResources, entitledLimits, isPlanId } from '@/lib/billing-plans';
import { userMessage } from '@/lib/user-message';
import { Button, Icon, Field, Badge, Toggle } from './ui';
import Logo from './Logo';
import * as Lucide from '@/components/lucide';

const STEPS = [
  { id:1, title:'Your company', desc:'A few details about your company' },
  { id:2, title:'Type of work', desc:'What kind of work you do' },
  { id:3, title:'Team size', desc:'How many people work here' },
  { id:4, title:'How you work', desc:'Anything special about how you work' },
  { id:5, title:'Ready to go', desc:'Start small, add what you need' },
];
const FLAG_LABELS:Record<string,string> = {
  subcontractorPrequal:'Check subcontractors before giving them work',
  bimIntegration:'Design-and-build drawings',
  certifiedPayroll:'Certified wage records',
  offlineFieldApp:'Site teams working offline',
  barcodeAssets:'Barcode / asset tags for plant',
  consolidation:'Combine several companies',
  multiCurrency:'Trade in USD and ZWG',
  hseAdvanced:'Formal safety reporting',
  clientPortal:'Clients can log in',
  esignature:'Electronic approvals',
  equipmentRental:'Plant hire',
  unitSales:'Selling stands / units',
  regulatedHse:'Formal safety rules',
  publicSector:'Government clients',
  industrial:'Industrial / plant work',
};

const COUNTRIES=['ZW','ZA','ZM','BW','MW','MZ','KE','NG','GB','US','AE','OTHER'];

export default function OnboardingWizard({initialName,userName}:{initialName:string;userName:string}){
  const router=useRouter();
  const [step,setStep]=useState(1);
  const [name,setName]=useState(initialName);
  const [legalName,setLegalName]=useState(initialName);
  const [regNumber,setRegNumber]=useState('');
  const [country,setCountry]=useState('ZW');
  const [baseCurrency,setBaseCurrency]=useState('USD');
  const [companyType,setCompanyType]=useState('');
  const [size,setSize]=useState('');
  const [headcount,setHeadcount]=useState('');
  const [revenueBand,setRevenueBand]=useState('');
  const [qualifiers,setQualifiers]=useState<string[]>([]);
  const [addons,setAddons]=useState<string[]>([]);
  const [loadDemo,setLoadDemo]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const {data: provisioning, isLoading: planLoading, isError: planError} = useQuery({queryKey:['onboarding-plan'],queryFn:()=>apiGet('/api/onboarding')});
  const requested=useMemo(()=>resolveWorkspace({companyType,size,headcount:Number(headcount),revenueBand,qualifiers,addons}),[companyType,size,headcount,revenueBand,qualifiers,addons]);
  const planId = provisioning?.plan?.id;
  const config=useMemo(()=> provisioning?.enforcePlan && isPlanId(planId) ? {...requested, modules:entitledModules(planId,requested.modules), resources:entitledResources(planId,requested.resources), limits:entitledLimits(planId,requested.limits), plan:provisioning.plan.name} : {...requested, plan:provisioning?.plan?.name || 'Loading…'}, [requested, provisioning, planId]);
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
  const canNext = step===1 ? name.trim().length>1 : step===2 ? !!companyType : step===3 ? !!size && (!headcount || (Number.isInteger(Number(headcount)) && Number(headcount)>0)) : true;

  async function finish(){
    setLoading(true); setError('');
    try{
      const r=await apiSend('/api/onboarding','POST',{name,legalName,regNumber,country,baseCurrency,companyType,size,headcount:headcount ? Number(headcount) : null,revenueBand,qualifiers,addons,loadDemo});
      router.push(r.next || `/${r.slug}/billing`); router.refresh();
    }catch(e:any){ setError(userMessage(e, 'We couldn’t create your workspace. Please try again.')); setLoading(false); }
  }

  return <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
    <header className="border-b divider bg-white dark:bg-ink-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Logo variant="lockup" autoDark className="h-7 w-auto" title={`${BRAND.name} · ${BRAND.motto}`}/>
        <div className="flex items-center gap-3"><span className="hidden text-xs muted sm:block">{BRAND.motto} Setting up MYLA for {userName}</span><button onClick={async()=>{await apiSend('/api/auth/logout','POST');router.push('/login');router.refresh();}} className="text-xs font-medium muted hover:text-ink-900 dark:hover:text-white">Sign out</button></div>
      </div>
    </header>
    <div className="mx-auto flex max-w-6xl gap-8 px-5 py-8">
      <aside className="hidden w-56 shrink-0 lg:block">
        <p className="mb-5 text-xs font-semibold uppercase tracking-wider muted">Setup · Step {step} of 5</p>
        <ol className="space-y-1">{STEPS.map(s=>{
          const done=s.id<step, active=s.id===step;
          return <li key={s.id} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${active?'border divider bg-white dark:bg-ink-900':''}`}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${done?'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300':active?'bg-brand-500 text-ink-950':'bg-slate-200 text-slate-500 dark:bg-ink-800'}`}>{done?<Lucide.Check size={13}/>:s.id}</span>
            <div><p className={`text-sm font-medium ${active?'text-ink-900 dark:text-white':'muted'}`}>{s.title}</p><p className="text-[11px] muted">{s.desc}</p></div>
          </li>;})}</ol>
        <div className="mt-6 rounded-md border divider bg-slate-50 p-3.5 dark:border-ink-700 dark:bg-ink-950/40">
          <p className="text-xs font-semibold text-ink-900 dark:text-white">Essentials first</p>
          <p className="mt-1 caption mt-1">Every company starts with the everyday basics — including money clients pay in advance. Your answers decide what else appears; switch more on whenever you are ready in Settings.</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-2 lg:hidden">{STEPS.map(s=><span key={s.id} className={`h-1.5 flex-1 rounded-sm ${s.id<=step?'bg-brand-500':'bg-slate-200 dark:bg-ink-800'}`}/>)}</div>
        <div className="card p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Step {step} of 5</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-ink-900 dark:text-white">{STEPS[step-1].title}</h1>
          <p className="mt-1 text-sm muted">{STEPS[step-1].desc}</p>

          {step===1&&<div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Trading name" required><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Ridgeway Constructors"/></Field>
            <Field label="Registered name"><input className="input" value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="…(Pvt) Ltd"/></Field>
            <Field label="Company reg. / CR14 no."><input className="input" value={regNumber} onChange={e=>setRegNumber(e.target.value)} placeholder="2019/012345/07"/></Field>
            <Field label="Country"><select className="select" value={country} onChange={e=>setCountry(e.target.value)}>{COUNTRIES.map(c=><option key={c} value={c}>{({ZW:'Zimbabwe',ZA:'South Africa',ZM:'Zambia',BW:'Botswana',MW:'Malawi',MZ:'Mozambique',KE:'Kenya',NG:'Nigeria',GB:'United Kingdom',US:'United States',AE:'United Arab Emirates',OTHER:'Other'} as any)[c]}</option>)}</select></Field>
            <Field label="Main currency"><select className="select" value={baseCurrency} onChange={e=>setBaseCurrency(e.target.value)}>{[['USD','USD – US dollars'],['ZWG','ZWG – Zimbabwe Gold'],['ZAR','ZAR – South African rand'],['EUR','EUR – euro'],['GBP','GBP – pound']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            <div className="rounded-md border border-dashed divider bg-slate-50/60 p-4 text-xs muted dark:bg-ink-950/40 sm:col-span-2"><span className="font-semibold text-ink-700 dark:text-slate-200">Ready for Zimbabwe &amp; Southern Africa</span><br/>15% VAT, USD and ZWG, tax invoices, NSSA &amp; PAYE, RTGS / mobile-money payments and NEC / FIDIC / JBCC contract forms. A two-person workshop uses the same system as a large contractor.</div>
          </div>}

          {step===2&&<div className="mt-6 grid gap-3 sm:grid-cols-2">{COMPANY_TYPES.map(t=>{
            const on=companyType===t.id;
            return <button key={t.id} onClick={()=>setCompanyType(t.id)} className={`flex items-start gap-3.5 rounded-md border p-4 text-left transition ${on?'border-brand-500 bg-brand-50/40 dark:bg-brand-500/10':'divider bg-white hover:border-slate-300 dark:bg-ink-900'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${on?'bg-brand-500 text-ink-950':'bg-slate-100 text-ink-500 dark:bg-ink-800 dark:text-slate-400'}`}><Icon name={t.icon} size={20}/></span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink-900 dark:text-white">{t.label}</span><span className="mt-0.5 block text-xs muted">{t.desc}</span></span>
              {on&&<Lucide.CheckCircle2 size={17} className="ml-auto shrink-0 text-brand-600"/>}
            </button>;})}</div>}

          {step===3&&<div className="mt-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{COMPANY_SIZES.map(s=>{
              const on=size===s.id;
              return <button key={s.id} onClick={()=>setSize(s.id)} className={`rounded-md border p-4 text-left transition ${on?'border-brand-500 bg-brand-50/40 dark:bg-brand-500/10':'divider bg-white hover:border-slate-300 dark:bg-ink-900'}`}>
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-ink-900 dark:text-white">{s.label}</span>{on&&<Lucide.CheckCircle2 size={16} className="text-brand-600"/>}</div>
                <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{s.range}</p><p className="mt-2 text-xs muted">{s.desc}</p>
                <p className="mt-3 border-t divider pt-2 text-[11px] muted">Team size is separate from your plan’s user limit.</p>
              </button>;})}</div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="About how many people work here?"><input className="input" type="number" min={1} value={headcount} onChange={e=>setHeadcount(e.target.value)}/></Field>
              <Field label="Yearly turnover (roughly)"><select className="select" value={revenueBand} onChange={e=>setRevenueBand(e.target.value)}><option value="">Not specified</option>{[['< $1M','Under US$1 million'],['$1M – $10M','US$1–10 million'],['$10M – $50M','US$10–50 million'],['$50M – $100M','US$50–100 million'],['$100M+','Over US$100 million']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            </div>
          </div>}

          {step===4&&<div className="mt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider muted">Tick what applies — each one may add a section you can use</p>
            <div className="grid gap-2.5 sm:grid-cols-2">{QUALIFIERS.map(q=>{
              const on=qualifiers.includes(q.id);
              return <button key={q.id} onClick={()=>toggleQ(q.id)} className={`flex items-center gap-3 rounded-md border px-3.5 py-3 text-left text-sm transition ${on?'border-brand-500 bg-brand-50/40 dark:bg-brand-500/10':'divider bg-white dark:bg-ink-900'}`}>
                <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${on?'border-brand-500 bg-brand-500 text-ink-950':'border-slate-300 dark:border-ink-600'}`}>{on&&<Lucide.Check size={12}/>}</span><span className="text-ink-800 dark:text-slate-200">{q.label}</span>
              </button>;})}</div>
            <div className="mt-6 rounded-md border divider bg-slate-50/60 p-4 dark:bg-ink-950/40">
              <p className="text-xs font-semibold text-ink-800 dark:text-slate-200">What this adds</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">{Object.entries(config.flags).filter(([,v])=>v).map(([k])=><Badge key={k} tone="blue">{FLAG_LABELS[k] || k.replace(/([A-Z])/g,' $1').trim()}</Badge>)}</div>
            </div>
          </div>}

          {step===5&&<div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Sections',config.modules.length],['Lists',config.resources.length],['People',config.limits.users.toLocaleString()],['Plan',config.plan]].map(([l,v])=><div key={String(l)} className="rounded-md border divider bg-slate-50/60 p-3.5 dark:bg-ink-950/40"><p className="text-[11px] font-semibold uppercase tracking-wider muted">{l}</p><p className="mt-1 text-lg font-semibold text-ink-900 dark:text-white">{v}</p></div>)}
            </div>
            <div className="rounded-md border divider bg-slate-50 p-4 dark:border-ink-700 dark:bg-ink-950/40">
              {provisioning?.enforcePlan && requested.modules.some(m=>!enabled.has(m)) && <p className="mb-2 text-xs font-semibold text-amber-700">Some selected sections are not included in your current plan. Your choices will be saved, but these sections need a suitable plan before they appear. Visit Billing after setup.</p>}
              <p className="text-xs font-semibold text-ink-900 dark:text-white">You start with {STARTER_MODULE_IDS.length} everyday sections — from first enquiry to getting paid</p>
              <p className="mt-1 text-[11px] leading-relaxed muted">Clients → enquiries → quotes &amp; tenders → jobs → contracts → document library → tax invoices &amp; payments, plus your team and reports. Everything else is optional, and you can switch it on later in Settings.</p>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-ink-900 dark:text-white">What is switched on</p><span className="text-xs muted">{config.modules.length} on</span></div>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border divider p-4">{Object.entries(byGroup).map(([group,mods])=><div key={group}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider muted">{group}</p>
                <div className="flex flex-wrap gap-1.5">{mods.map(m=><span key={m.id} className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${enabled.has(m.id)?'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300':'bg-slate-100 text-slate-400 dark:bg-ink-800 dark:text-slate-500'}`}><Icon name={m.icon} size={12}/>{m.label}{starter.has(m.id)&&<span className="ml-0.5 rounded bg-emerald-600/15 px-1 text-[9px] font-bold uppercase">basic</span>}</span>)}</div>
              </div>)}</div>
            </div>
            {optional.length>0&&<div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">Optional add-ons <span className="font-normal muted">({optional.length} available)</span></p>
                <div className="flex gap-2"><button onClick={()=>setAddons(MODULES.map(m=>m.id))} className="text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300">Switch everything on</button><button onClick={()=>{setAddons([]);setQualifiers([]);}} className="text-[11px] font-medium muted hover:underline">Start small again</button></div></div>
              <div className="max-h-48 overflow-y-auto rounded-md border divider p-3"><div className="flex flex-wrap gap-2">{optional.map(m=>{
              const on=addons.includes(m.id);
              return <button key={m.id} onClick={()=>toggleAddon(m.id)} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition ${on?'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'divider muted'}`}>{on?<Lucide.Check size={12}/>:<Lucide.Plus size={12}/>}{m.label}</button>;})}</div></div></div>}
            <div className="flex items-center justify-between gap-4 rounded-md border divider bg-slate-50 p-4 dark:border-ink-700 dark:bg-ink-950/40">
              <div><p className="text-sm font-semibold text-ink-900 dark:text-white">Try it with sample data <span className="ml-1 text-[11px] font-normal muted">Off by default</span></p><p className="mt-0.5 text-xs muted">Optional: 616 sample records across jobs, staff, orders, invoices, time sheets, site queries and safety events. Your workspace starts empty unless you switch this on.</p></div>
              <Toggle checked={loadDemo} onChange={setLoadDemo}/>
            </div>
            {planError&&<p className="text-xs text-red-700">We couldn’t load your plan. Refresh and try again.</p>}
            {error&&<p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          </div>}

          <div className="mt-6 flex items-center justify-between border-t divider pt-5">
            <Button variant="ghost" onClick={()=>setStep(s=>Math.max(1,s-1))} disabled={step===1} icon="ArrowLeft">Back</Button>
            {step<5?<Button variant="primary" disabled={!canNext} onClick={()=>setStep(s=>s+1)}>Continue<Lucide.ArrowRight size={15}/></Button>
              :<Button variant="primary" loading={loading} disabled={planLoading||planError||!provisioning} onClick={finish} icon="Rocket">Open my company</Button>}
          </div>
        </div>
        <p className="mt-4 text-center text-xs muted">Your 7-day trial and payment options open in Billing next. You can switch sections on or off any time in <strong>Settings</strong>.</p>
      </main>
    </div>
  </div>;
}
