'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Button,Card,Icon} from './ui';
import AIHelp from './AIHelp';
import {orgApi} from '@/lib/client';
import type {MylaAnswer,MylaResource} from '@/lib/ask-myla';
const examples:{resource:MylaResource;text:string}[]=[{resource:'arInvoices',text:'Which invoices are overdue?'},{resource:'tasks',text:'Show overdue tasks'},{resource:'estimates',text:'Which quotations are awaiting a decision?'},{resource:'projects',text:'Show my recent jobs'}];
export default function AskMyla({org,resources,onBusyChange,onDirtyChange}:{org:string;resources:MylaResource[];onBusyChange:(v:boolean)=>void;onDirtyChange:(v:boolean)=>void}){
  const [question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<MylaAnswer|null>(null),[asked,setAsked]=useState('');
  const locked=useRef(false),resultRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{onDirtyChange(!!question.trim()||!!result);},[question,result,onDirtyChange]);
  useEffect(()=>{if(result)resultRef.current?.focus();},[result]);
  async function ask(e:React.FormEvent){
    e.preventDefault();if(locked.current||question.trim().length<3)return;
    locked.current=true;setBusy(true);onBusyChange(true);setError('');setResult(null);setAsked(question.trim());
    try{
      const response=await fetch(orgApi(org,'ai/ask'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,consent:true}),signal:AbortSignal.timeout(60000)});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Myla is unavailable.');setResult(body);
    }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'That took too long. Try again. Nothing was changed.');}
    finally{locked.current=false;setBusy(false);onBusyChange(false);}
  }
  return <div className="space-y-5"><Card className="p-5 sm:p-8 space-y-6">
    <div><h2 className="text-lg font-semibold">What can I help you find?</h2><p className="text-sm muted mt-1">Find a record, check what’s overdue, or pick a suggestion below.</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{examples.filter(e=>resources.includes(e.resource)).map(e=><button key={e.resource} type="button" disabled={busy} className="flex items-center justify-between gap-3 rounded-xl border divider bg-slate-50/70 dark:bg-ink-900 px-4 py-4 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50" onClick={()=>setQuestion(e.text)}><span>{e.text}</span><Icon name="ArrowUpRight" size={16} className="shrink-0 muted"/></button>)}</div>
    <form onSubmit={ask} className="space-y-3"><label htmlFor="myla-question" className="block text-sm font-semibold">Your question</label><textarea id="myla-question" className="input min-h-36 !rounded-xl !p-4 !text-base" maxLength={2000} disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="e.g. Find the quotation for the pump installation"/>
      <Button type="submit" variant="primary" icon="ArrowUpRight" className="w-full sm:w-auto !h-11 !px-6 !rounded-xl" loading={busy} disabled={busy||question.trim().length<3}>{busy?'Looking for answers…':'Ask Myla'}</Button>
      {busy&&<p role="status" className="text-xs muted">Checking records you can access. This may take up to a minute.</p>}
      <AIHelp ask/>
    </form>
    {!!error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
  </Card>
  {result&&<Card className="p-5 space-y-4"><div ref={resultRef} tabIndex={-1} aria-label="Myla answer"><p className="text-xs muted mb-2">You asked: {asked}</p><p className="font-medium">{result.answer}</p></div>
    {!!result.note&&<p className="text-xs muted">{result.note}</p>}
    <div className="space-y-2">{result.records.map(record=><Link key={record.id} href={record.href} className="block rounded-lg border divider p-3 hover:border-brand-400 focus-visible:outline focus-visible:outline-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-sm">{record.title}</p><span className="text-xs text-brand-700 dark:text-brand-300">View details →</span></div><p className="text-xs muted mt-1">{record.number} · {record.status.replaceAll('_',' ').toLowerCase()}{record.date?` · Due ${record.date}`:''}</p></Link>)}</div>
    {result.register&&<Link className="btn-outline inline-flex" href={result.register.href}>{result.register.label}</Link>}
    <p className="text-xs muted">Checked {new Date(result.checkedAt).toLocaleString()}. Nothing was changed.</p>
  </Card>}
  </div>;
}
