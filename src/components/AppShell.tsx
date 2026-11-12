'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { canRead, canWrite, canCapability, ROLES, navGroupsFor, resourceNavGroup } from '@/lib/catalog';
import { moduleEnabled, resourceFullyEnabled, hrefVisible } from '@/lib/module-visibility';
import { BRAND } from '@/lib/brand';
import { Icon, Button, Badge, Skeleton, Spinner } from './ui';
import Overlay from './Overlay';
import Logo from './Logo';
import { useToast } from './Providers';
import { useDisplayCurrency } from './DisplayCurrencyProvider';
import { CURRENCY_LABELS } from '@/lib/currency';

type Meta = {
  org:any; config:{modules:string[];resources:string[];flags:Record<string,boolean>;limits:any;plan:string;localePack:string};
  modules:any[]; resources:any[]; roles:any[]; role:string; user:any; memberships:any[];
  users:any[]; notifications:any[]; audit:any[]; counts:Record<string,number>; companyTypes:any[]; sizes:any[];
  permissions?:any; walletEnabled?:boolean; entityId?:string|null; billing?:any;
};

const SPECIAL = [
  { id:'my-work', label:'My work', group:'Overview', icon:'Inbox', href:'/my-work', module:'dashboard' },
  { id:'dashboard', label:'Dashboard', group:'Overview', icon:'LayoutDashboard', href:'/dashboard', module:'dashboard' },
  { id:'documentation', label:'Documentation', group:'Overview', icon:'BookOpen', href:'/documentation', module:'dashboard' },
  { id:'library', label:'Document library', group:'Jobs & sites', icon:'FolderOpen', href:'/library', module:'documents', resource:'documents' },
  { id:'three-way-match', label:'Three-way match', group:'Materials & suppliers', icon:'ClipboardCheck', href:'/three-way-match', module:'procurement', alsoModule:'finance', resource:'purchaseOrders' },
  { id:'wallets', label:'Client wallets', group:'Money & invoices', icon:'CreditCard', href:'/wallets', module:'wallets', cap:'wallet.read' },
  { id:'reports', label:'Reports', group:'Reports & extras', icon:'BarChart3', href:'/reports', module:'reports' },
  { id:'profitability', label:'Job profitability', group:'Reports & extras', icon:'Gauge', href:'/profitability', module:'reports', resource:'projects' },
  { id:'settings', label:'Settings', group:'Settings', icon:'Settings', href:'/settings', cap:'settings.view' },
  { id:'support', label:'Help & support', group:'Settings', icon:'HelpCircle', href:'/support' },
  { id:'billing', label:'Billing & subscription', group:'Settings', icon:'CreditCard', href:'/billing', adminOnly:true },
];
const SPECIAL_TITLES:Record<string,string> = {
  'my-work':'My work', dashboard:'Dashboard', documentation:'Documentation', library:'Document library', 'three-way-match':'Three-way match', wallets:'Client wallets', reports:'Reports', profitability:'Job profitability', settings:'Settings', support:'Help & support', billing:'Billing & subscription',
};
export const QUICK_CREATE = ['projects','clients','employees','purchaseOrders','arInvoices','rfis','timesheets','incidents'];
// The file-first Document library replaces the raw document register in the
// sidebar; the register stays reachable from inside the library.
const HIDDEN_RESOURCE_NAV = new Set(['documents']);

export default function AppShell({children,orgSlug,userName,userEmail,role}:{children:React.ReactNode;orgSlug:string;userName:string;userEmail:string;role:string}){
  const pathname=usePathname(); const router=useRouter(); const qc=useQueryClient(); const toast=useToast();
  const [mobileOpen,setMobileOpen]=useState(false);
  const [palette,setPalette]=useState(false);
  const [pq,setPq]=useState('');
  const [notifOpen,setNotifOpen]=useState(false);
  const [userOpen,setUserOpen]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);
  const [currencyOpen,setCurrencyOpen]=useState(false);
  const [dark,setDark]=useState(false);
  const quickRef=useRef<HTMLDivElement>(null);
  const notifRef=useRef<HTMLDivElement>(null);
  const userRef=useRef<HTMLDivElement>(null);
  const currencyRef=useRef<HTMLDivElement>(null);
  const display=useDisplayCurrency();
  const { setWorkspaceConfig }=display;
  const { data:meta, isLoading } = useQuery<Meta>({ queryKey:['meta',orgSlug], queryFn:()=>apiGet(orgApi(orgSlug,'meta')) });
  const { data:workQueue }:any = useQuery({ queryKey:['work-items',orgSlug], queryFn:()=>apiGet(orgApi(orgSlug,'work-items')), enabled:!!meta, staleTime:30_000, refetchInterval:60_000 });
  const workCount = Number(workQueue?.summary?.actionable || 0);

  useEffect(()=>{ const d=localStorage.getItem('buildops-theme')==='dark'; setDark(d); document.documentElement.classList.toggle('dark',d); },[]);
  useEffect(()=>{ if(meta?.org) setWorkspaceConfig(meta.org.currency, meta.org.baseCurrency||'USD'); },[meta,setWorkspaceConfig]);
  const closeMenus=useCallback(()=>{ setNotifOpen(false); setUserOpen(false); setQuickOpen(false); setCurrencyOpen(false); },[]);
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPalette(v=>!v);} if(e.key==='Escape'){closeMenus();setPalette(false);} }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[closeMenus]);
  useEffect(()=>{ setMobileOpen(false); closeMenus(); },[pathname,closeMenus]);
  useEffect(()=>{
    const onPointerDown=(e:PointerEvent)=>{
      const target=e.target as Node|null;
      if(!target) return;
      if([quickRef,notifRef,userRef,currencyRef].some(r=>r.current?.contains(target))) return;
      closeMenus();
    };
    document.addEventListener('pointerdown',onPointerDown,true);
    return ()=>document.removeEventListener('pointerdown',onPointerDown,true);
  },[closeMenus]);

  const navGroups=useMemo(()=>{
    if(!meta) return [];
    const groups:Record<string,any[]>={};
    const role=meta.role||'ADMIN';
    const allowed=new Set(navGroupsFor(role));
    for(const s of SPECIAL){
      if(!allowed.has(s.group)) continue;
      if((s as any).module && !moduleEnabled(meta.config,(s as any).module)) continue;
      if((s as any).alsoModule && !moduleEnabled(meta.config,(s as any).alsoModule)) continue;
      if((s as any).resource && !resourceFullyEnabled(meta.config,(s as any).resource)) continue;
      if((s as any).cap && !canCapability(role,(s as any).cap)) continue;
      if((s as any).adminOnly && !['OWNER','ADMIN'].includes(role)) continue;
      (groups[s.group] ||= []).push({...s});
    }
    for(const r of meta.resources){
      if(!allowed.has(r.group)) continue;
      if(HIDDEN_RESOURCE_NAV.has(r.id)) continue;
      if(!resourceFullyEnabled(meta.config,r.id)) continue;
      if(!canRead(role,r.id)) continue;
      (groups[r.group] ||= []).push({id:r.id,label:r.label,icon:r.icon,href:`/m/${r.id}`,group:r.group});
    }
    const order=['Overview','Clients & quotes','Jobs & sites','Materials & suppliers','Staff & wages','Safety & quality','Money & invoices','Reports & extras','Specialist modules','Settings'];
    return order.filter(g=>groups[g]?.length).map(g=>({group:g,items:groups[g]}));
  },[meta]);
  const { data:search } = useQuery<any>({ queryKey:['search',orgSlug,pq], queryFn:()=>apiGet(orgApi(orgSlug,`search?q=${encodeURIComponent(pq)}`)), enabled:palette&&pq.trim().length>=2 });
  const searchResults=((search?.results||[]) as any[]).filter(r=>resourceFullyEnabled(meta?.config||{modules:[],resources:[]},r.resource)&&hrefVisible(r.href,meta?.config||{modules:[],resources:[]}));
  const unread=(meta?.notifications||[]).filter(n=>!n.read&&hrefVisible(n.href,meta?.config||{modules:[],resources:[]})).length;
  const pageTitle=useMemo(()=>{
    const seg=pathname.split('/').filter(Boolean);
    if(seg.length<=2) return SPECIAL_TITLES[seg[1]||''] || 'Dashboard';
    if(seg[1]==='m') return meta?.resources.find(r=>r.id===seg[2])?.label || 'Section';
    if(seg[1]==='projects') return 'Project detail';
    return seg[1].charAt(0).toUpperCase()+seg[1].slice(1);
  },[pathname,meta]);

  async function signOut(){ await apiSend('/api/auth/logout','POST'); qc.clear(); router.push('/login'); router.refresh(); }
  async function markRead(id?:string){ await apiSend(orgApi(orgSlug,'settings'),'PATCH',{action:'markRead',id}); qc.invalidateQueries({queryKey:['meta',orgSlug]}); }
  function toggleTheme(){ const n=!dark; setDark(n); localStorage.setItem('buildops-theme',n?'dark':'light'); document.documentElement.classList.toggle('dark',n); }

  const sidebar=<div className="flex h-full flex-col">
    <div className="flex h-14 shrink-0 items-center gap-2 border-b divider px-3">
      <Logo variant="lockup" autoDark className="h-6 w-auto max-w-[190px]" title={`${BRAND.name} · ${BRAND.motto}`}/>
      <button aria-label="Close navigation" className="rounded-md p-1 text-slate-400 lg:hidden" onClick={()=>setMobileOpen(false)}><Lucide.X size={18}/></button>
    </div>
    {meta?.config?.plan&&<div className="mx-3 mt-3 flex items-center rounded-md border divider bg-slate-50 px-2.5 py-1.5 text-[11px] dark:bg-ink-950/40"><span className="font-medium text-ink-800 dark:text-slate-200">{meta.billing?.enabled ? meta.billing.plan : meta.config.plan} plan</span>{meta.billing?.comped&&<span className="ml-auto text-[10px] muted">No payment due</span>}</div>}
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      {isLoading&&<div className="space-y-2 px-2 py-2">{Array.from({length:12}).map((_,i)=><Skeleton key={i} className="h-7 w-full"/>)}</div>}
      {navGroups.map(g=><div key={g.group} className="mb-4">
        <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{g.group}</p>
        {g.items.map((it:any)=>{
          const href=`/${orgSlug}${it.href}`; const active=pathname===href||(it.id!=='dashboard'&&pathname.startsWith(href));
          return <Link key={it.id} href={href} data-testid={it.id==='my-work'?'nav-my-work':it.id==='profitability'?'nav-profitability':it.id==='three-way-match'?'nav-three-way-match':it.id==='library'?'nav-library':undefined} className={`nav-item ${active?'nav-active':''}`}>
            <Icon name={it.icon} size={15} className="shrink-0"/>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.id==='my-work'&&workCount>0&&<span data-testid="nav-my-work-count" className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{workCount>99?'99+':workCount}</span>}
          </Link>;})}
      </div>)}
    </nav>
    <div className="shrink-0 border-t divider p-2.5">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white" style={{background:meta?.user?.avatarColor||'#51697B'}}>{(meta?.user?.name||userName).split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-ink-800 dark:text-slate-200">{meta?.user?.name||userName}</p><p className="truncate text-[10px] muted">{ROLES.find(r=>r.id===role)?.label || role.replace(/_/g,' ')}</p></div>
      </div>
    </div>
  </div>;

  return <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
    {/* Sidebar desktop */}
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r divider bg-white dark:bg-ink-900 lg:block">{sidebar}</aside>
    {/* Sidebar mobile */}
    {mobileOpen&&<Overlay kind="mobile-nav" className="z-50 lg:hidden"><div className="absolute inset-0 bg-ink-950/50" onClick={()=>setMobileOpen(false)}/><div className="relative h-full w-64 border-r divider bg-white dark:bg-ink-900">{sidebar}</div></Overlay>}
    <div className="lg:pl-60">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b divider bg-white px-4 dark:bg-ink-900 sm:px-6">
        <button aria-label="Open navigation" className="btn-ghost btn-icon lg:hidden" onClick={()=>setMobileOpen(true)}><Icon name="Menu" size={19}/></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-[13px] font-semibold text-ink-900 dark:text-white sm:text-sm">{pageTitle}</h1><p className="hidden truncate text-[11px] muted sm:block">{meta?.org?.name} · {meta?.org?.country||'ZW'} · {meta?.org?.baseCurrency||'USD'}{display.preference&&<span className="font-medium text-brand-600 dark:text-brand-300"> · {display.currency} view</span>}</p></div>
        <button onClick={()=>setPalette(true)} className="hidden items-center gap-2 rounded-md border divider bg-white px-3 py-1.5 text-xs muted transition hover:bg-slate-50 dark:bg-ink-900 md:flex"><Lucide.Search size={14}/><span>Search anything…</span><kbd className="ml-6 rounded border divider px-1 py-0.5 font-mono text-[10px]">⌘K</kbd></button>
        <div className="relative" ref={quickRef}>
          <button aria-label="Quick create" aria-haspopup="menu" aria-expanded={quickOpen} className="btn-ghost btn-icon" onClick={()=>{setQuickOpen(v=>!v);setNotifOpen(false);setUserOpen(false);setCurrencyOpen(false);}} title="Quick create"><Lucide.Plus size={19}/></button>
          {quickOpen&&<div data-testid="topbar-quick-panel" className="panel fixed left-1/2 top-14 z-30 w-[min(240px,calc(100vw-2rem))] -translate-x-1/2 p-2 sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-60 sm:translate-x-0"><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider muted">Quick create</p>
            {QUICK_CREATE.filter(id=>resourceFullyEnabled(meta?.config||{modules:[],resources:[]},id)&&canWrite(meta?.role||'ADMIN',id)&&new Set(navGroupsFor(meta?.role||'ADMIN')).has(resourceNavGroup(id)||'')).map(id=>{const r=meta?.resources.find(x=>x.id===id); if(!r)return null; return <Link key={id} href={`/${orgSlug}/m/${id}?new=1`} onClick={()=>setQuickOpen(false)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-xs font-medium text-ink-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-ink-800"><Icon name={r.icon} size={15}/>{r.singular}</Link>;})}
          </div>}
        </div>
        <div className="relative" ref={currencyRef}>
          <button data-testid="topbar-currency" aria-label={`Display currency ${display.currency}`} aria-haspopup="menu" aria-expanded={currencyOpen} title="Personal display currency" className="btn-ghost btn-sm flex items-center gap-1.5" onClick={()=>{setCurrencyOpen(v=>!v);setNotifOpen(false);setUserOpen(false);setQuickOpen(false);}}>
            <Icon name="Banknote" size={15}/><span className="hidden font-semibold sm:inline">{display.currency}</span><Icon name="ChevronDown" size={13}/>
          </button>
          {currencyOpen&&<div data-testid="topbar-currency-panel" className="panel fixed left-1/2 top-14 z-30 w-[min(280px,calc(100vw-2rem))] -translate-x-1/2 p-2 sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:translate-x-0">
            <div className="px-2 py-1.5"><p className="text-[12px] font-semibold">Display currency</p><p className="mt-0.5 text-[10px] muted">Your personal view · saved on this browser only.</p></div>
            <button type="button" onClick={()=>{display.setPreference(null);setCurrencyOpen(false);}} className={`mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-ink-800 ${!display.preference?'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200':''}`}>
              <Icon name={!display.preference?'Check':'Circle'} size={14} className={!display.preference?'text-brand-600':'text-slate-300'}/><span className="flex-1 font-medium">Workspace default</span><Badge tone="slate">{display.baseCurrency}</Badge>
            </button>
            <div className="my-1 border-t divider"/>
            <div className="max-h-64 overflow-y-auto">
              {display.options.map(code=><button type="button" key={code} onClick={()=>{display.setPreference(code);setCurrencyOpen(false);}} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-ink-800 ${display.preference===code?'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200':''}`}>
                <Icon name={display.preference===code?'Check':'Circle'} size={14} className={display.preference===code?'text-brand-600':'text-slate-300'}/><span className="w-10 font-semibold">{code}</span><span className="min-w-0 flex-1 truncate muted">{CURRENCY_LABELS[code]||code}</span>{code===display.baseCurrency&&<Badge tone="blue">base</Badge>}
              </button>)}
            </div>
            <p className="mt-2 border-t divider px-2 pt-2 text-[10px] leading-relaxed muted">Lists, dashboards and record details convert using workspace rates. Reports, PDFs, saved records and the workspace base currency stay unchanged.</p>
          </div>}
        </div>
        <button aria-label="Toggle dark mode" className="btn-ghost btn-icon" onClick={toggleTheme} title="Toggle theme"><Icon name={dark?'Sun':'Moon'} size={18}/></button>
        <div className="relative" ref={notifRef}>
          <button aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'} aria-haspopup="menu" aria-expanded={notifOpen} className="btn-ghost btn-icon relative" onClick={()=>{setNotifOpen(v=>!v);setUserOpen(false);setQuickOpen(false);setCurrencyOpen(false);}}><Icon name="Bell" size={18}/>{unread>0&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-ink-900"/>}</button>
          {notifOpen&&<div data-testid="topbar-notifications-panel" className="panel fixed left-1/2 top-14 z-30 w-[min(340px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:translate-x-0">
            <div className="flex items-center justify-between border-b divider px-3 py-2.5"><p className="text-[13px] font-semibold">Notifications</p><button onClick={()=>markRead()} className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-300">Mark all read</button></div>
            <div className="max-h-80 overflow-y-auto">{(meta?.notifications||[]).length===0?<p className="p-6 text-center text-xs muted">You're all caught up.</p>:(meta?.notifications||[]).map((n:any)=><Link key={n.id} href={n.href?`/${orgSlug}${n.href}`:'#'} onClick={()=>{markRead(n.id);setNotifOpen(false);}} className={`flex gap-3 border-b divider px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-ink-800 ${n.read?'opacity-60':''}`}>
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.kind==='ALERT'?'bg-red-500':n.kind==='WARNING'?'bg-amber-500':n.kind==='SUCCESS'?'bg-emerald-500':'bg-sky-500'}`}/>
              <div className="min-w-0"><p className="text-xs font-semibold text-ink-800 dark:text-slate-100">{n.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] muted">{n.body}</p></div></Link>)}</div>
          </div>}
        </div>
        <div className="relative" ref={userRef}>
          <button aria-label="Account menu" aria-haspopup="menu" aria-expanded={userOpen} className="btn-ghost btn-icon" onClick={()=>{setUserOpen(v=>!v);setNotifOpen(false);setQuickOpen(false);setCurrencyOpen(false);}}><span className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold text-white" style={{background:meta?.user?.avatarColor||'#51697B'}}>{(meta?.user?.name||userName).split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span></button>
          {userOpen&&<div data-testid="topbar-user-panel" className="panel fixed left-1/2 top-14 z-30 w-[min(224px,calc(100vw-2rem))] -translate-x-1/2 p-2 sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-56 sm:translate-x-0"><div className="border-b divider px-2 py-2"><p className="text-xs font-semibold">{meta?.user?.name||userName}</p><p className="truncate text-[11px] muted">{meta?.user?.email||userEmail}</p></div>
            <div className="mt-1 flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2 text-[11px] muted dark:bg-ink-950/50"><Icon name="ShieldCheck" size={14}/><span className="flex-1">{ROLES.find(r=>r.id===role)?.label || role.replace(/_/g,' ')}</span>{meta?.permissions?.scoped&&<Badge tone="violet">Own jobs only</Badge>}</div>
            {canCapability(meta?.role||'ADMIN','settings.view')&&<Link href={`/${orgSlug}/settings`} onClick={()=>setUserOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name="Settings" size={14}/>Workspace settings</Link>}
            <Link href={`/${orgSlug}/support`} onClick={()=>setUserOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name="HelpCircle" size={14}/>Help & support</Link>
            {['OWNER','ADMIN'].includes(meta?.role||'')&&<Link href={`/${orgSlug}/billing`} onClick={()=>setUserOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name="CreditCard" size={14}/>Billing & subscription</Link>}
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"><Icon name="LogOut" size={14}/>Sign out</button></div>}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {meta?.billing?.enabled && pathname!==`/${orgSlug}/billing` && (meta.billing.needsPayment||meta.billing.readOnly||meta.billing.status==='trialing')&&
          <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${meta.billing.needsPayment?'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200':meta.billing.readOnly?'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200':'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200'}`}>
            <span className="font-medium">{meta.billing.needsPayment?'Payment needed — your data is safe, but editing is paused.':meta.billing.readOnly?'Payment overdue — editing is paused until your account is up to date.':`Free trial active — no charge until ${meta.billing.trialEndsAt?new Date(meta.billing.trialEndsAt).toLocaleDateString('en-GB'):'trial end'}.`}</span>
            {['OWNER','ADMIN'].includes(meta?.role||'')&&<Link href={`/${orgSlug}/billing`} className="font-semibold underline">Open billing</Link>}
          </div>}
        {children}
      </main>
      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-12 items-center justify-around border-t divider bg-white dark:bg-ink-900 lg:hidden">
        {[{h:'/dashboard',i:'LayoutDashboard',l:'Home',m:'dashboard',g:'Overview'},{h:'/my-work',i:'Inbox',l:'My work',m:'dashboard',g:'Overview'},{h:'/m/projects',i:'HardHat',l:'Projects',r:'projects',g:'Jobs & sites'},{h:'/m/timesheets',i:'Clock',l:'Time',r:'timesheets',g:'Staff & wages'},{h:'/wallets',i:'CreditCard',l:'Wallets',m:'wallets',c:'wallet.read',g:'Money & invoices'},{h:'/settings',i:'Settings',l:'Settings',c:'settings.view',g:'Settings'}].filter(x=>new Set(navGroupsFor(meta?.role||'ADMIN')).has((x as any).g)).filter(x=>!(x as any).m||moduleEnabled(meta?.config||{modules:[],resources:[]},(x as any).m)).filter(x=>!(x as any).r||(resourceFullyEnabled(meta?.config||{modules:[],resources:[]},(x as any).r)&&canRead(meta?.role||'ADMIN',(x as any).r))).filter(x=>!(x as any).c||canCapability(meta?.role||'ADMIN',(x as any).c)).map(x=><Link key={x.h} href={`/${orgSlug}${x.h}`} className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${pathname===`/${orgSlug}${x.h}`?'text-brand-600 dark:text-brand-300':'muted'}`}><Icon name={x.i} size={18}/>{x.l}</Link>)}
      </nav>
      <div className="h-12 lg:hidden"/>
    </div>
    {/* Command palette */}
    {palette&&<Overlay kind="command-palette" className="z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink-950/50" onClick={()=>setPalette(false)}/>
      <div className="card relative w-full max-w-xl overflow-hidden rounded-xl shadow-panel">
        <div className="flex items-center gap-3 border-b divider px-4 py-3"><Lucide.Search size={18} className="text-slate-400"/><input autoFocus value={pq} onChange={e=>setPq(e.target.value)} placeholder="Search jobs, clients, invoices, site queries…" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"/><kbd className="rounded border divider px-1.5 py-0.5 text-[10px] muted">ESC</kbd></div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {pq.trim().length<2&&<><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider muted">Jump to</p>{navGroups.flatMap(g=>g.items).slice(0,9).map((it:any)=><Link key={it.id} href={`/${orgSlug}${it.href}`} onClick={()=>setPalette(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name={it.icon} size={16} className="text-slate-400"/><span className="flex-1">{it.label}</span><span className="text-[10px] muted">{it.group}</span></Link>)}</>}
          {pq.trim().length>=2&&<>{!search?<div className="flex justify-center py-8"><Spinner/></div>:searchResults.length===0?<p className="py-8 text-center text-xs muted">No records match “{pq}”</p>:<><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider muted">{searchResults.length} results</p>{searchResults.map((r:any)=><Link key={r.id} href={`/${orgSlug}${r.href}`} onClick={()=>setPalette(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name={meta?.resources.find(x=>x.id===r.resource)?.icon||'FileText'} size={16} className="text-slate-400"/><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{r.title}</p><p className="text-[11px] muted">{r.resourceLabel} · {r.number}</p></div>{r.status&&<Badge tone="slate">{r.status.replace(/_/g,' ')}</Badge>}</Link>)}</>}</>}
        </div>
        <div className="flex items-center justify-between border-t divider bg-slate-50 px-4 py-2 text-[10px] muted dark:bg-ink-950/40"><span>⌘K to toggle · Enter to open</span><span>{meta?.config?.modules.length||0} sections in your workspace</span></div>
      </div>
    </Overlay>}
  </div>;
}
