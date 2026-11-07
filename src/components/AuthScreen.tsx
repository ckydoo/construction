'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/client';
import { Button, Icon, Field } from './ui';
import * as Lucide from '@/components/lucide';

const DEMO = [
  {label:'Owner', email:'owner@kestrelridge.co.zw', role:'OWNER'},
  {label:'Project manager', email:'pm@kestrelridge.co.zw', role:'PROJECT_MANAGER'},
  {label:'Finance', email:'finance@kestrelridge.co.zw', role:'FINANCE_MANAGER'},
  {label:'HSE', email:'safety@kestrelridge.co.zw', role:'SAFETY_OFFICER'},
  {label:'Client portal', email:'client@westgate.co.zw', role:'CLIENT_EXTERNAL'},
];
const PASSWORD='Demo@1234';

function BrandPanel(){
  return <div className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
    <div className="absolute inset-0 opacity-[0.07]" style={{backgroundImage:'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',backgroundSize:'44px 44px'}}/>
    <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl"/>
    <div className="relative flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-ink-950"><Icon name="HardHat" size={20}/></span>
      <span className="text-lg">Build<span className="text-brand-400">Ops</span></span>
    </div>
    <div className="relative">
      <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-brand-400"/>Built for construction & industrial teams</div>
      <h1 className="max-w-md text-[2.6rem] font-semibold leading-[1.12] tracking-tight">Every project.<br/><span className="text-brand-400">Every rand.</span><br/>One workspace.</h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">From tender to handover — bids, sites, people, plant, safety and finance, connected in one system that adapts to the size and type of your company.</p>
      <svg viewBox="0 0 420 170" className="mt-10 w-full max-w-md" fill="none">
        <path d="M0 150h420" stroke="#f59e0b" strokeWidth="2" opacity=".55"/>
        <path d="M30 150V78l52-30v102" stroke="#94a3b8" strokeWidth="2" opacity=".6"/>
        <path d="M82 48l48 27v75H82V48z" stroke="#94a3b8" strokeWidth="2" opacity=".6"/>
        <path d="M130 150V62l70-40v128" stroke="#f59e0b" strokeWidth="2.5" opacity=".85"/>
        <path d="M200 22l68 38v90h-68V22z" stroke="#f59e0b" strokeWidth="2.5" opacity=".85"/>
        <path d="M148 80h18m-18 22h18m-18 22h18m70-56h22m-22 22h22m-22 22h22" stroke="#94a3b8" strokeWidth="2" opacity=".5"/>
        <path d="M290 150V96l44-24v78" stroke="#94a3b8" strokeWidth="2" opacity=".6"/>
        <path d="M334 72l50 28v50h-50V72z" stroke="#94a3b8" strokeWidth="2" opacity=".6"/>
        <path d="M268 150l14-34m14 34l-14-34" stroke="#f59e0b" strokeWidth="2" opacity=".55"/>
        <circle cx="47" cy="44" r="17" fill="#f59e0b" opacity=".14"/>
      </svg>
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
        {[['33','modules'],['49','resources'],['616','demo records']].map(([n,l])=><div key={l}><p className="text-xl font-semibold text-white">{n}</p><p className="text-xs text-slate-400">{l}</p></div>)}
      </div>
    </div>
    <p className="relative text-xs text-slate-500">© 2026 BuildOps · Harare, Zimbabwe</p>
  </div>;
}

export default function AuthScreen(){
  const router=useRouter();
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [email,setEmail]=useState(DEMO[0].email), [password,setPassword]=useState(PASSWORD);
  const [name,setName]=useState(''), [company,setCompany]=useState('');
  const [loading,setLoading]=useState(false), [error,setError]=useState('');
  const [showPw,setShowPw]=useState(false);

  async function submit(e:React.FormEvent){
    e.preventDefault(); setError(''); setLoading(true);
    try{
      const r = await apiSend(mode==='login'?'/api/auth/login':'/api/auth/register','POST', mode==='login'?{email,password}:{name,company,email,password});
      router.push(r.onboarded?`/${r.slug}/dashboard`:'/onboarding'); router.refresh();
    }catch(err:any){ setError(err.message||'Something went wrong'); setLoading(false); }
  }
  return <div className="flex min-h-screen bg-white dark:bg-ink-950">
    <BrandPanel/>
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-ink-950"><Icon name="HardHat" size={20}/></span><span className="text-lg font-semibold">Build<span className="text-brand-500">Ops</span></span></div>
        <div className="mb-7 flex rounded-xl bg-slate-100 p-1 dark:bg-ink-900">
          {(['login','register'] as const).map(m=><button key={m} onClick={()=>{setMode(m);setError('');}} className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${mode===m?'bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white':'muted'}`}>{m==='login'?'Sign in':'Create account'}</button>)}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">{mode==='login'?'Welcome back':'Start your workspace'}</h2>
        <p className="mt-1.5 text-sm muted">{mode==='login'?'Sign in to your construction workspace.':'Create an account, then tell us about your company.'}</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode==='register'&&<><Field label="Your full name" required><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Tendai Muchengeti" required/></Field>
          <Field label="Company name" required><input className="input" value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. Ridgeway Constructors" required/></Field></>}
          <Field label="Work email" required><div className="relative"><Lucide.Mail size={16} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.co.zw" required/></div></Field>
          <Field label="Password" required><div className="relative"><Lucide.Lock size={16} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9 pr-10" type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='register'?8:1}/><button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-2.5 text-slate-400 hover:text-ink-600"><Icon name={showPw?'EyeOff':'Eye'} size={16}/></button></div></Field>
          {error&&<div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"><Lucide.AlertCircle size={15} className="mt-0.5 shrink-0"/>{error}</div>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>{mode==='login'?'Sign in':'Create account & continue'}<Lucide.ArrowRight size={15}/></Button>
        </form>
        {mode==='login'&&<div className="mt-8">
          <div className="mb-3 flex items-center gap-3"><span className="h-px flex-1 bg-slate-200 dark:bg-ink-800"/><span className="text-[11px] font-semibold uppercase tracking-wider muted">Demo accounts · one-click access</span><span className="h-px flex-1 bg-slate-200 dark:bg-ink-800"/></div>
          <div className="flex flex-wrap gap-2">{DEMO.map(d=><button key={d.email} onClick={()=>{setEmail(d.email);setPassword(PASSWORD);setError('');setMode('login');}} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${email===d.email?'border-brand-400 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'border-slate-200 text-ink-600 hover:border-brand-300 hover:bg-brand-50/60 dark:border-ink-700 dark:text-slate-300'}`}>{d.label}</button>)}</div>
          <p className="mt-3 text-xs muted">Password: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-ink-800">{PASSWORD}</code> · Full demo data is preloaded.</p>
        </div>}
      </div>
    </div>
  </div>;
}
