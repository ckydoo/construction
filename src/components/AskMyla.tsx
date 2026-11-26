'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Button,Card} from './ui';
import {orgApi} from '@/lib/client';
import type {MylaAnswer,MylaResource} from '@/lib/ask-myla';
const examples:{resource:MylaResource;text:string}[]=[{resource:'arInvoices',text:'Which invoices are overdue?'},{resource:'tasks',text:'Show overdue tasks'},{resource:'estimates',text:'Which quotations are awaiting a decision?'},{resource:'projects',text:'Show my recent jobs'}];
export default function AskMyla({org,resources,onBusyChange,onDirtyChange}:{org:string;resources:MylaResource[];onBusyChange:(v:boolean)=>void;onDirtyChange:(v:boolean)=>void}){
  const [question,setQuestion]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<MylaAnswer|null>(null),[asked,setAsked]=useState('');
  const locked=useRef(false),resultRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{onDirtyChange(!!question.trim()||!!result);},[question,result,onDirtyChange]);
  useEffect(()=>{if(result)resultRef.current?.focus();},[result]);
  async function ask(e:React.FormEvent){
    e.preventDefault();if(locked.current||!consent||question.trim().length<3)return;
    locked.current=true;setBusy(true);onBusyChange(true);setError('');setResult(null);setAsked(question.trim());
    try{
      const response=await fetch(orgApi(org,'ai/ask'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,consent}),signal:AbortSignal.timeout(60000)});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Myla is unavailable.');setResult(body);
    }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'That took too long. Try again. Nothing was changed.');}
    finally{locked.current=false;setBusy(false);onBusyChange(false);}
  }
  return <div className="space-y-5"><Card className="p-5 space-y-4">
    <div><h2 className="text-lg font-semibold">What would you like to find?</h2><p className="text-sm muted mt-1">Ask about your quotations, invoices, jobs or tasks. Open a result for full details.</p></div>
    <div className="flex flex-wrap gap-2">{examples.filter(e=>resources.includes(e.resource)).map(e=><button key={e.resource} type="button" disabled={busy} className="rounded-lg border divider px-3 py-2 text-left text-xs hover:border-brand-400" onClick={()=>setQuestion(e.text)}>{e.text}</button>)}</div>
    <form onSubmit={ask} className="space-y-3"><label htmlFor="myla-question" className="block text-sm font-semibold">Ask Myla</label><textarea id="myla-question" className="input min-h-28" maxLength={2000} disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="e.g. Find the quotation for the pump installation"/>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={consent} onChange={e=>setConsent(e.target.checked)}/>Allow OpenRouter and its model provider to interpret my question.</label>
      <details className="text-xs muted"><summary className="cursor-pointer py-1">How Myla uses your data</summary><div className="mt-2 space-y-2"><p>Only your question is sent to the AI provider—not your workspace records. Avoid private information in the question. MYLA retrieves matching records using your workspace, role and project permissions.</p><p>Read-only: no records are changed. Questions share the 20-request daily workspace AI limit. Each question is independent; include the record name rather than saying “that one”.</p><p>This first version finds recent records, overdue invoices/tasks, unpaid invoice statuses and quotations awaiting review. It does not calculate totals, forecast results or answer every business question.</p></div></details>
      <Button type="submit" variant="primary" loading={busy} disabled={busy||!consent||question.trim().length<3}>{busy?'Looking for answers…':'Ask Myla'}</Button>
      {busy&&<p role="status" className="text-xs muted">Checking records you can access. This may take up to a minute.</p>}
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
