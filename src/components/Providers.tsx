'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { DisplayCurrencyProvider } from './DisplayCurrencyProvider';
import { userMessage } from '@/lib/user-message';

const QueryClientSingleton = () => new QueryClient({ defaultOptions:{ queries:{ staleTime:20_000, refetchOnWindowFocus:false, retry:1 }, mutations:{ retry:0 } } });

type Toast = { id:number; title:string; description?:string; tone:'success'|'error'|'info'|'warning' };
type ToastCtx = { push:(t:Omit<Toast,'id'>)=>void };
const Ctx = createContext<ToastCtx>({ push:()=>{} });
export const useToast = () => useContext(Ctx);

function ToastHost({items,remove}:{items:Toast[];remove:(id:number)=>void}) {
  const icons:any={success:CheckCircle2,error:XCircle,warning:AlertTriangle,info:Info};
  const tones:any={ success:'text-emerald-600 dark:text-emerald-400', error:'text-red-600 dark:text-red-400', warning:'text-amber-600 dark:text-amber-400', info:'text-sky-600 dark:text-sky-400' };
  return <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
    {items.map(t=>{ const I=icons[t.tone]; return <div key={t.id} className="panel pointer-events-auto flex animate-fadein items-start gap-3 p-3">
      <I size={18} className={`mt-0.5 shrink-0 ${tones[t.tone]}`}/>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">{t.title}</p>{t.description&&<p className="mt-0.5 text-xs muted">{t.tone === 'error' ? userMessage(t.description) : t.description}</p>}</div>
      <button onClick={()=>remove(t.id)} aria-label="Dismiss notification" className="text-slate-400 hover:text-ink-700 dark:hover:text-white"><X size={15}/></button>
    </div>;})}
  </div>;
}
export function useTheme(){
  const [dark,setDark]=useState(false);
  useEffect(()=>{ const saved=localStorage.getItem('buildops-theme'); const d=saved? saved==='dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    setDark(!!d); document.documentElement.classList.toggle('dark',!!d); },[]);
  const toggle=useCallback(()=>setDark(d=>{ const n=!d; localStorage.setItem('buildops-theme',n?'dark':'light'); document.documentElement.classList.toggle('dark',n); return n; }),[]);
  return {dark,toggle};
}
export const useThemeSafe = () => ({ dark:false, toggle:()=>{} });

export default function Providers({children}:{children:React.ReactNode}){
  const [qc] = useState(QueryClientSingleton);
  const [toasts,setToasts]=useState<Toast[]>([]);
  const remove=useCallback((id:number)=>setToasts(t=>t.filter(x=>x.id!==id)),[]);
  const push=useCallback((t:Omit<Toast,'id'>)=>{
    const id=Date.now()+Math.random(); setToasts(s=>[...s.slice(-3),{...t,id}]);
    setTimeout(()=>remove(id),4200);
  },[remove]);
  return <QueryClientProvider client={qc}><DisplayCurrencyProvider><Ctx.Provider value={{push}}>{children}<ToastHost items={toasts} remove={remove}/></Ctx.Provider></DisplayCurrencyProvider></QueryClientProvider>;
}
