'use client';
import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiGet,orgApi} from '@/lib/client';
import {canUseQuotationAI} from '@/lib/ai-quotation';
import type {QuoteDraft,QuoteTemplate} from '@/lib/quote-studio';
import {Button,Card,Icon} from './ui';
import QuoteStudio from './QuoteStudio';
type Result={draft:QuoteDraft;warnings:string[];questions:string[];assumptions:string[]};
export default function QuotationAssistant({org,embedded=false,onBusyChange}:{org:string;embedded?:boolean;onBusyChange?:(busy:boolean)=>void}){
  const {data:meta}=useQuery<any>({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const allowed=!!meta&&canUseQuotationAI(meta.role,meta.config)&&meta.billing?.writable!==false&&!meta.billing?.readOnly&&!meta.user?.temporaryPassword;
  const {data:templates,error:templateError}=useQuery<{templates:QuoteTemplate[]}>({queryKey:['ai-templates',org],queryFn:()=>apiGet(orgApi(org,'quote-templates')),enabled:allowed});
  const [prompt,setPrompt]=useState(''),[templateId,setTemplateId]=useState(''),[consent,setConsent]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[editing,setEditing]=useState(false);
  const locked=useRef(false);
  async function generate(){
    if(locked.current)return;locked.current=true;setBusy(true);onBusyChange?.(true);setError('');setResult(null);setReviewed(false);
    try{
      const response=await fetch(orgApi(org,'ai/quotation'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,templateId,consent}),signal:AbortSignal.timeout(60000)});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'AI is unavailable.');setResult(body);
    }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'The request timed out. No quotation was saved.');}finally{locked.current=false;setBusy(false);onBusyChange?.(false);}
  }
  if(!meta)return <p className="muted">Loading workspace…</p>;
  if(!allowed)return <Card className="p-5">AI quotation drafting is unavailable for your current permissions, account setup or billing status.</Card>;
  if(editing&&result)return <><div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">AI draft — verify all quantities, prices and scope. Zero prices and quantities of one may be placeholders. Nothing has been saved yet.</div><QuoteStudio org={org} mode="create" initialDraft={result.draft}/></>;
  return <div className="mx-auto max-w-3xl space-y-5">
    {!embedded&&<div><h1 className="heading flex items-center gap-2"><Icon name="Sparkles" size={24}/>AI Assistant</h1><p className="mt-2 muted">Describe the job. Review a proposed work breakdown. Finish in the quotation editor.</p></div>}
    <Card className="space-y-4 p-5">
      <div><label htmlFor="ai-job" className="block text-sm font-semibold">What work are you quoting for?</label><textarea id="ai-job" className="input mt-2 min-h-40" maxLength={6000} value={prompt} disabled={busy} onChange={e=>{setPrompt(e.target.value);setResult(null);}} placeholder="Describe the work, dimensions, finishes and what the client will supply. Avoid personal details or confidential information."/><p className="mt-1 text-xs muted">{prompt.length}/6000 characters · You can add answers to follow-up questions here and generate again.</p></div>
      <div><label htmlFor="ai-rates" className="block text-sm font-semibold">Use rates from a saved company template (optional)</label><select id="ai-rates" className="input mt-2" disabled={busy} value={templateId} onChange={e=>{setTemplateId(e.target.value);setResult(null);}}><option value="">No template — leave prices for me to enter</option>{templates?.templates.map(t=><option key={t.id} value={t.id}>{t.name} ({t.payload.currency})</option>)}</select><p className="mt-1 text-xs muted">Only your selected saved template is used. Starter/sample prices and previous client records are not sent. Template rates are not verified current market prices.</p>{!!templateError&&<p role="alert" className="text-xs text-amber-700">Saved templates could not load. You can still generate an unpriced draft.</p>}</div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I agree to send this description and selected template rates to OpenRouter and its model provider for this draft.</label>
      <p className="text-xs muted">20 requests per workspace per UTC day shared across all AI modes, including provider failures. AI can make mistakes. It does not provide engineering certification, approve work or send documents.</p>
      <Button variant="primary" loading={busy} disabled={!consent||prompt.trim().length<20||busy} onClick={generate}>Prepare quotation draft</Button>
      {!!error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    </Card>
    {result&&<Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">{result.draft.name}</h2>
      {!!result.questions.length&&<section><h3 className="font-semibold">Questions to resolve</h3><ul className="list-disc pl-5 text-sm">{result.questions.map((q,i)=><li key={i}>{q}</li>)}</ul><p className="mt-2 text-xs muted">Add answers above and generate again, or resolve them manually in the editor.</p></section>}
      {!!result.assumptions.length&&<section><h3 className="font-semibold">Proposed assumptions — check these</h3><ul className="list-disc pl-5 text-sm">{result.assumptions.map((q,i)=><li key={i}>{q}</li>)}</ul></section>}
      <div className="space-y-2">{result.draft.items.map((line,i)=><div key={i} className="rounded border divider p-3"><p className="font-medium">{line.description}</p><p className="text-sm muted">Proposed quantity: {line.qty} {line.unit} · Unit price: {result.draft.currency} {line.unitPrice.toFixed(2)}</p><p className="text-xs muted">{line.detail}</p></div>)}</div>
      <p className="whitespace-pre-wrap text-sm">{result.draft.scope}</p>
      <ul className="list-disc pl-5 text-sm text-amber-800 dark:text-amber-200">{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I have reviewed the questions and assumptions and will verify all quantities and prices in the editor.</label>
      <Button variant="primary" disabled={!reviewed} onClick={()=>setEditing(true)}>Open in quotation editor</Button>
    </Card>}
  </div>;
}
