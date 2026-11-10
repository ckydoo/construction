'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiSend } from '@/lib/client';
import { Button, Icon, Field } from './ui';
import Logo from './Logo';
import { BRAND } from '@/lib/brand';
import * as Lucide from '@/components/lucide';

const DEMO = [
  {label:'Owner', email:'owner@kestrelridge.co.zw', role:'OWNER'},
  {label:'Job manager', email:'pm@kestrelridge.co.zw', role:'PROJECT_MANAGER'},
  {label:'Finance', email:'finance@kestrelridge.co.zw', role:'FINANCE_MANAGER'},
  {label:'Safety', email:'safety@kestrelridge.co.zw', role:'SAFETY_OFFICER'},
  {label:'Client view', email:'client@westgate.co.zw', role:'CLIENT_EXTERNAL'},
];
const PASSWORD='Demo@1234';

function BrandPanel(){
  return <div className="relative hidden w-[42%] shrink-0 flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
    <div className="absolute inset-0 opacity-[0.035]" style={{backgroundImage:'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)',backgroundSize:'44px 44px'}}/>
    <div className="relative"><Logo variant="full" light className="w-full max-w-[420px]" title={`${BRAND.name} · ${BRAND.motto}`}/></div>
    <div className="relative max-w-md">
      <div className="mb-5 h-0.5 w-10 bg-brand-500"/>
      <h1 className="text-[28px] font-semibold leading-[1.2] tracking-tight text-white">One place for your jobs, your team and your money.</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-slate-300">From first quote to handover — quotes, sites, plant, safety and money connected for small workshops and large contractors alike.</p>
    </div>
    <div className="relative">
      <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-5">
        {[['34','sections'],['49','lists'],['616','sample records']].map(([n,l])=><div key={l}><p className="text-lg font-semibold tabular-nums text-white">{n}</p><p className="text-[11px] text-slate-400">{l}</p></div>)}
      </div>
      <p className="mt-6 text-[11px] text-slate-500">© 2026 {BRAND.name} · Harare, Zimbabwe</p>
    </div>
  </div>;
}

export default function AuthScreen({configured=true}:{configured?:boolean}){
  const router=useRouter();
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [name,setName]=useState(''), [company,setCompany]=useState('');
  const [email,setEmail]=useState(''), [password,setPassword]=useState('');
  const [showPw,setShowPw]=useState(false), [loading,setLoading]=useState(false), [error,setError]=useState('');
  async function submit(e:React.FormEvent){
    e.preventDefault(); setLoading(true); setError('');
    try{
      if(mode==='register'){
        await apiSend('/api/auth/register','POST',{name,email,password,company});
        router.push('/onboarding'); router.refresh(); return;
      }
      const r=await apiSend('/api/auth/login','POST',{email,password});
      router.push(r.onboarded?`/${r.slug}/dashboard`:'/onboarding'); router.refresh();
    }catch(err:any){ setError(err.message||'Something went wrong'); }
    finally{ setLoading(false); }
  }
  return <div className="flex min-h-screen bg-white dark:bg-ink-950">
    <BrandPanel/>
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo variant="lockup" autoDark className="h-7 w-auto" title={BRAND.name}/></div>
        <div className="mb-7 flex rounded-md bg-slate-100 p-0.5 dark:bg-ink-900">
          {(['login','register'] as const).map(m=><button key={m} onClick={()=>{setMode(m);setError('');}} className={`flex-1 rounded py-2 text-[13px] font-medium transition ${mode===m?'bg-white text-ink-900 dark:bg-ink-800 dark:text-white':'muted'}`}>{m==='login'?'Sign in':'Create account'}</button>)}
        </div>
        {!configured&&<div className="mb-5 rounded-md border border-amber-300 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><p className="font-semibold">Supabase is not connected yet</p><p className="mt-1">Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to <code className="font-mono">.env</code>, run <code className="font-mono">npx supabase db push</code>, then <code className="font-mono">npm run db:seed</code>. Sign-in will stay disabled until then.</p></div>}
        <h2 className="text-[22px] font-semibold tracking-tight text-ink-900 dark:text-white">{mode==='login'?'Welcome back':'Start your workspace'}</h2>
        <p className="mt-1.5 text-[13px] muted">{mode==='login'?'Sign in to your construction workspace.':'Create an account, then tell us about your company.'}</p>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-300">{BRAND.motto}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode==='register'&&<><Field label="Your full name" required><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Tendai Muchengeti" required/></Field>
          <Field label="Company name" required><input className="input" value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. Ridgeway Constructors" required/></Field></>}
          <Field label="Work email" required><div className="relative"><Lucide.Mail size={16} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.co.zw" required/></div></Field>
          <Field label="Password" required><div className="relative"><Lucide.Lock size={16} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9 pr-10" type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='register'?8:1}/><button type="button" onClick={()=>setShowPw(!showPw)} aria-label={showPw?'Hide password':'Show password'} className="absolute right-3 top-2.5 text-slate-400 hover:text-ink-600"><Icon name={showPw?'EyeOff':'Eye'} size={16}/></button></div></Field>
          {error&&<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"><Lucide.AlertCircle size={15} className="mt-0.5 shrink-0"/>{error}</div>}
          <Button type="submit" variant="primary" className="w-full" loading={loading}>{mode==='login'?'Sign in':'Create account & continue'}<Lucide.ArrowRight size={15}/></Button>
        </form>
        {mode==='login'&&<div className="mt-8">
          <div className="mb-3 flex items-center gap-3"><span className="h-px flex-1 bg-slate-200 dark:bg-ink-800"/><span className="text-[10px] font-semibold uppercase tracking-wider muted">Demo accounts · one-click access</span><span className="h-px flex-1 bg-slate-200 dark:bg-ink-800"/></div>
          <div className="flex flex-wrap gap-2">{DEMO.map(d=><button key={d.email} onClick={()=>{setEmail(d.email);setPassword(PASSWORD);setError('');setMode('login');}} className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${email===d.email?'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300':'border-slate-200 text-ink-600 hover:border-brand-300 hover:bg-brand-50/60 dark:border-ink-700 dark:text-slate-300'}`}>{d.label}</button>)}</div>
          <p className="mt-3 text-xs muted">Password: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-ink-800">{PASSWORD}</code> · Full demo data is preloaded.</p>
        </div>}
      </div>
    </div>
  </div>;
}
