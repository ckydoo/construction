'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { canRead, canWrite, canCapability, ROLES } from '@/lib/catalog';
import { BRAND } from '@/lib/brand';
import { Icon, Button, Badge, Skeleton, Spinner } from './ui';
import Logo from './Logo';
import { useToast } from './Providers';

type Meta = {
  org:any; config:{modules:string[];resources:string[];flags:Record<string,boolean>;limits:any;plan:string;localePack:string};
  modules:any[]; resources:any[]; roles:any[]; role:string; user:any; memberships:any[];
  users:any[]; notifications:any[]; audit:any[]; counts:Record<string,number>; companyTypes:any[]; sizes:any[];
  permissions?:any; walletEnabled?:boolean; entityId?:string|null;
};

const SPECIAL = [
  { id:'dashboard', label:'Dashboard', group:'Overview', icon:'LayoutDashboard', href:'/dashboard' },
  { id:'documentation', label:'Documentation', group:'Overview', icon:'BookOpen', href:'/documentation' },
  { id:'library', label:'Document library', group:'Jobs & sites', icon:'FolderOpen', href:'/library', module:'documents' },
  { id:'wallets', label:'Client wallets', group:'Money & invoices', icon:'CreditCard', href:'/wallets', module:'wallets', cap:'wallet.read' },
  { id:'reports', label:'Reports', group:'Reports & extras', icon:'BarChart3', href:'/reports' },
  { id:'settings', label:'Settings', group:'Settings', icon:'Settings', href:'/settings', cap:'settings.view' },
];
const SPECIAL_TITLES:Record<string,string> = {
  dashboard:'Dashboard', documentation:'Documentation', library:'Document library', wallets:'Client wallets', reports:'Reports', settings:'Settings',
};
export const QUICK_CREATE = ['projects','clients','employees','purchaseOrders','arInvoices','rfis','timesheets','incidents'];

export default function AppShell({children,orgSlug,userName,userEmail,role}:{children:React.ReactNode;orgSlug:string;userName:string;userEmail:string;role:string}){
  const pathname=usePathname(); const router=useRouter(); const qc=useQueryClient(); const toast=useToast();
  const [mobileOpen,setMobileOpen]=useState(false);
  const [palette,setPalette]=useState(false);
  const [pq,setPq]=useState('');
  const [notifOpen,setNotifOpen]=useState(false);
  const [userOpen,setUserOpen]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);
  const [dark,setDark]=useState(false);
  const { data:meta, isLoading } = useQuery<Meta>({ queryKey:['meta',orgSlug], queryFn:()=>apiGet(orgApi(orgSlug,'meta')) });

  useEffect(()=>{ const d=localStorage.getItem('buildops-theme')==='dark'; setDark(d); document.documentElement.classList.toggle('dark',d); },[]);
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPalette(v=>!v);} if(e.key==='Escape'){setNotifOpen(false);setUserOpen(false);setQuickOpen(false);} }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[]);
  useEffect(()=>{setMobileOpen(false);},[pathname]);

  const navGroups=useMemo(()=>{
    if(!meta) return [];
    const groups:Record<string,any[]>={};
    const role=meta.role||'ADMIN';
    for(const s of SPECIAL){
      if((s as any).module && !meta.config.modules.includes((s as any).module)) continue;
      if((s as any).cap && !canCapability(role,(s as any).cap)) continue;
      (groups[s.group] ||= []).push({...s});
    }
    for(const r of meta.resources){
      if(!meta.config.resources.includes(r.id)) continue;
      if(!canRead(role,r.id)) continue;
      (groups[r.group] ||= []).push({id:r.id,label:r.label,icon:r.icon,href:`/m/${r.id}`,group:r.group});
    }
    const order=['Overview','Clients & quotes','Jobs & sites','Materials & suppliers','Staff & wages','Safety & quality','Money & invoices','Reports & extras','Settings'];
    return order.filter(g=>groups[g]?.length).map(g=>({group:g,items:groups[g]}));
  },[meta]);
  const { data:search } = useQuery<any>({ queryKey:['search',orgSlug,pq], queryFn:()=>apiGet(orgApi(orgSlug,`search?q=${encodeURIComponent(pq)}`)), enabled:palette&&pq.trim().length>=2 });
  const unread=(meta?.notifications||[]).filter(n=>!n.read).length;
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
    {meta?.config?.plan&&<div className="mx-3 mt-3 flex items-center rounded-md border divider bg-slate-50 px-2.5 py-1.5 text-[11px] dark:bg-ink-950/40"><span className="font-medium text-ink-800 dark:text-slate-200">{meta.config.plan} plan</span></div>}
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      {isLoading&&<div className="space-y-2 px-2 py-2">{Array.from({length:12}).map((_,i)=><Skeleton key={i} className="h-7 w-full"/>)}</div>}
      {navGroups.map(g=><div key={g.group} className="mb-4">
        <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{g.group}</p>
        {g.items.map((it:any)=>{
          const href=`/${orgSlug}${it.href}`; const active=pathname===href||(it.id!=='dashboard'&&pathname.startsWith(href));
          return <Link key={it.id} href={href} className={`nav-item ${active?'nav-active':''}`}>
            <Icon name={it.icon} size={15} className="shrink-0"/>
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
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
    {mobileOpen&&<div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-ink-950/50" onClick={()=>setMobileOpen(false)}/><div className="relative h-full w-64 border-r divider bg-white dark:bg-ink-900">{sidebar}</div></div>}
    <div className="lg:pl-60">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b divider bg-white px-4 dark:bg-ink-900 sm:px-6">
        <button aria-label="Open navigation" className="btn-ghost btn-icon lg:hidden" onClick={()=>setMobileOpen(true)}><Icon name="Menu" size={19}/></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-[13px] font-semibold text-ink-900 dark:text-white sm:text-sm">{pageTitle}</h1><p className="hidden truncate text-[11px] muted sm:block">{meta?.org?.name} · {meta?.org?.country||'ZW'} · {meta?.org?.baseCurrency||'USD'}</p></div>
        <button onClick={()=>setPalette(true)} className="hidden items-center gap-2 rounded-md border divider bg-white px-3 py-1.5 text-xs muted transition hover:bg-slate-50 dark:bg-ink-900 md:flex"><Lucide.Search size={14}/><span>Search anything…</span><kbd className="ml-6 rounded border divider px-1 py-0.5 font-mono text-[10px]">⌘K</kbd></button>
        <div className="relative">
          <button aria-label="Quick create" className="btn-ghost btn-icon" onClick={()=>setQuickOpen(v=>!v)} title="Quick create"><Lucide.Plus size={19}/></button>
          {quickOpen&&<div className="panel absolute right-0 top-10 z-30 w-60 p-2"><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider muted">Quick create</p>
            {QUICK_CREATE.filter(id=>canWrite(meta?.role||'ADMIN',id)).map(id=>{const r=meta?.resources.find(x=>x.id===id); if(!r)return null; return <Link key={id} href={`/${orgSlug}/m/${id}?new=1`} onClick={()=>setQuickOpen(false)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-xs font-medium text-ink-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-ink-800"><Icon name={r.icon} size={15}/>{r.singular}</Link>;})}
          </div>}
        </div>
        <button aria-label="Toggle dark mode" className="btn-ghost btn-icon" onClick={toggleTheme} title="Toggle theme"><Icon name={dark?'Sun':'Moon'} size={18}/></button>
        <div className="relative">
          <button aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'} className="btn-ghost btn-icon relative" onClick={()=>{setNotifOpen(v=>!v);setUserOpen(false);}}><Icon name="Bell" size={18}/>{unread>0&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-ink-900"/>}</button>
          {notifOpen&&<div className="panel absolute right-0 top-10 z-30 w-[min(340px,calc(100vw-2rem))] overflow-hidden">
            <div className="flex items-center justify-between border-b divider px-3 py-2.5"><p className="text-[13px] font-semibold">Notifications</p><button onClick={()=>markRead()} className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-300">Mark all read</button></div>
            <div className="max-h-80 overflow-y-auto">{(meta?.notifications||[]).length===0?<p className="p-6 text-center text-xs muted">You're all caught up.</p>:(meta?.notifications||[]).map((n:any)=><Link key={n.id} href={n.href?`/${orgSlug}${n.href}`:'#'} onClick={()=>{markRead(n.id);setNotifOpen(false);}} className={`flex gap-3 border-b divider px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-ink-800 ${n.read?'opacity-60':''}`}>
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.kind==='ALERT'?'bg-red-500':n.kind==='WARNING'?'bg-amber-500':n.kind==='SUCCESS'?'bg-emerald-500':'bg-sky-500'}`}/>
              <div className="min-w-0"><p className="text-xs font-semibold text-ink-800 dark:text-slate-100">{n.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] muted">{n.body}</p></div></Link>)}</div>
          </div>}
        </div>
        <div className="relative">
          <button aria-label="Account menu" className="btn-ghost btn-icon" onClick={()=>{setUserOpen(v=>!v);setNotifOpen(false);}}><span className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold text-white" style={{background:meta?.user?.avatarColor||'#51697B'}}>{(meta?.user?.name||userName).split(' ').map((w:string)=>w[0]).slice(0,2).join('')}</span></button>
          {userOpen&&<div className="panel absolute right-0 top-10 z-30 w-56 p-2"><div className="border-b divider px-2 py-2"><p className="text-xs font-semibold">{meta?.user?.name||userName}</p><p className="truncate text-[11px] muted">{meta?.user?.email||userEmail}</p></div>
            <div className="mt-1 flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2 text-[11px] muted dark:bg-ink-950/50"><Icon name="ShieldCheck" size={14}/><span className="flex-1">{ROLES.find(r=>r.id===role)?.label || role.replace(/_/g,' ')}</span>{meta?.permissions?.scoped&&<Badge tone="violet">Own jobs only</Badge>}</div>
            {canCapability(meta?.role||'ADMIN','settings.view')&&<Link href={`/${orgSlug}/settings`} onClick={()=>setUserOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-xs font-medium hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name="Settings" size={14}/>Workspace settings</Link>}
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"><Icon name="LogOut" size={14}/>Sign out</button></div>}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">{children}</main>
      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-12 items-center justify-around border-t divider bg-white dark:bg-ink-900 lg:hidden">
        {[{h:'/dashboard',i:'LayoutDashboard',l:'Home'},{h:'/m/projects',i:'HardHat',l:'Projects',r:'projects'},{h:'/m/timesheets',i:'Clock',l:'Time',r:'timesheets'},{h:'/wallets',i:'CreditCard',l:'Wallets',c:'wallet.read'},{h:'/settings',i:'Settings',l:'Settings',c:'settings.view'}].filter(x=>!(x as any).r||canRead(meta?.role||'ADMIN',(x as any).r)).filter(x=>!(x as any).c||canCapability(meta?.role||'ADMIN',(x as any).c)).map(x=><Link key={x.h} href={`/${orgSlug}${x.h}`} className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${pathname===`/${orgSlug}${x.h}`?'text-brand-600 dark:text-brand-300':'muted'}`}><Icon name={x.i} size={18}/>{x.l}</Link>)}
      </nav>
      <div className="h-12 lg:hidden"/>
    </div>
    {/* Command palette */}
    {palette&&<div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink-950/50" onClick={()=>setPalette(false)}/>
      <div className="card relative w-full max-w-xl overflow-hidden rounded-xl shadow-panel">
        <div className="flex items-center gap-3 border-b divider px-4 py-3"><Lucide.Search size={18} className="text-slate-400"/><input autoFocus value={pq} onChange={e=>setPq(e.target.value)} placeholder="Search jobs, clients, invoices, site queries…" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"/><kbd className="rounded border divider px-1.5 py-0.5 text-[10px] muted">ESC</kbd></div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {pq.trim().length<2&&<><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider muted">Jump to</p>{navGroups.flatMap(g=>g.items).slice(0,9).map((it:any)=><Link key={it.id} href={`/${orgSlug}${it.href}`} onClick={()=>setPalette(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name={it.icon} size={16} className="text-slate-400"/><span className="flex-1">{it.label}</span><span className="text-[10px] muted">{it.group}</span></Link>)}</>}
          {pq.trim().length>=2&&<>{!search?<div className="flex justify-center py-8"><Spinner/></div>:search.results.length===0?<p className="py-8 text-center text-xs muted">No records match “{pq}”</p>:<><p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider muted">{search.results.length} results</p>{search.results.map((r:any)=><Link key={r.id} href={`/${orgSlug}${r.href}`} onClick={()=>setPalette(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-ink-800"><Icon name={meta?.resources.find(x=>x.id===r.resource)?.icon||'FileText'} size={16} className="text-slate-400"/><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{r.title}</p><p className="text-[11px] muted">{r.resourceLabel} · {r.number}</p></div>{r.status&&<Badge tone="slate">{r.status.replace(/_/g,' ')}</Badge>}</Link>)}</>}</>}
        </div>
        <div className="flex items-center justify-between border-t divider bg-slate-50 px-4 py-2 text-[10px] muted dark:bg-ink-950/40"><span>⌘K to toggle · Enter to open</span><span>{meta?.config?.modules.length||0} sections in your workspace</span></div>
      </div>
    </div>}
  </div>;
}
