'use client';
import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiGet,orgApi} from '@/lib/client';
import {AI_MODES,availableAIModes,type AIMode,type WritingMode,type WritingDraft} from '@/lib/ai-assistant';
import {Button,Card,Icon} from './ui';
import QuotationAssistant from './QuotationAssistant';
import AIPlanTasks from './AIPlanTasks';
export default function AIAssistant({org}:{org:string}){
  const {data:meta,error}=useQuery<any>({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const [selected,setSelected]=useState<AIMode|null>(null),[busy,setBusy]=useState(false);
  if(error)return <p role="alert">Workspace permissions could not load. Refresh and try again.</p>;
  if(!meta)return <p className="muted">Loading workspace…</p>;
  const modes=availableAIModes(meta.role,meta.config);
  if(!modes.length||meta.billing?.writable===false||meta.billing?.readOnly||meta.user?.temporaryPassword)return <Card className="p-5">AI drafting is unavailable for your current permissions, account setup or billing status.</Card>;
  const mode=selected&&modes.includes(selected)?selected:modes[0];
  return <div className="space-y-5">
    <div><h1 className="heading flex items-center gap-2"><Icon name="Sparkles" size={24}/>AI Assistant</h1><p className="mt-2 muted">Draft with AI. Review and edit before using anything.</p></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Choose an AI task">{modes.map(m=><button key={m} type="button" disabled={busy} aria-pressed={mode===m} className={mode===m?'btn-primary':'btn-outline'} onClick={()=>{if(m===mode)return;if(window.confirm('Switch task? Any unsaved draft in this view will be discarded.'))setSelected(m);}}>{AI_MODES[m].label}</button>)}</div>
    {mode==='quotation'?<QuotationAssistant org={org} embedded onBusyChange={setBusy}/>:<WritingAssistant key={`${org}-${mode}`} org={org} mode={mode} onBusyChange={setBusy}/>}
  </div>;
}
function WritingAssistant({org,mode,onBusyChange}:{org:string;mode:WritingMode;onBusyChange:(value:boolean)=>void}){
  const [prompt,setPrompt]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState<WritingDraft|null>(null),[reviewed,setReviewed]=useState(false),[copied,setCopied]=useState(false);
  const [creating,setCreating]=useState(false);
  const lock=useRef(false);
  async function generate(){
    if(lock.current)return;lock.current=true;setBusy(true);onBusyChange(true);setError('');setDraft(null);setReviewed(false);setCopied(false);
    try{
      const response=await fetch(orgApi(org,'ai/draft'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,prompt,consent}),signal:AbortSignal.timeout(60000)});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'AI is unavailable.');setDraft(body.draft);
    }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'The request timed out. Nothing was saved or sent.');}
    finally{lock.current=false;setBusy(false);onBusyChange(false);}
  }
  async function copy(){
    if(!draft||!reviewed)return;
    try{await navigator.clipboard.writeText([draft.title,draft.body,draft.questions.length?'Questions to resolve:\n'+draft.questions.join('\n'):'',draft.assumptions.length?'Assumptions to verify:\n'+draft.assumptions.join('\n'):''].filter(Boolean).join('\n\n'));setCopied(true);setError('');}
    catch{setError('Clipboard access is unavailable. Select and copy the draft text manually.');}
  }
  return <div className="mx-auto max-w-3xl space-y-5">
    <Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">{AI_MODES[mode].label}</h2><p className="text-sm muted">{AI_MODES[mode].hint}</p>
      <label className="block text-sm font-semibold" htmlFor="ai-notes">Your notes</label><textarea id="ai-notes" className="input min-h-40" maxLength={6000} disabled={busy||creating} value={prompt} onChange={e=>{setPrompt(e.target.value);setDraft(null);setReviewed(false);setCopied(false);}} placeholder="Include confirmed facts and flag what is unknown. Avoid confidential or personal information."/>
      <p className="text-xs muted">{prompt.length}/6000 characters · Only these notes are sent. No customer, project or financial records are retrieved.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy||creating} onChange={e=>setConsent(e.target.checked)}/>I agree to send these notes to OpenRouter and its model provider to prepare this draft.</label>
      <p className="text-xs muted">Shared limit: 20 AI requests per workspace per UTC day across all modes, including provider failures. No automatic saving, task creation or sending.</p>
      <Button variant="primary" loading={busy} disabled={busy||creating||!consent||prompt.trim().length<20} onClick={generate}>Prepare draft</Button>
    </Card>
    {!!error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {draft&&<Card className="space-y-4 p-5"><p className="text-sm text-amber-800 dark:text-amber-200">Unsaved AI draft — check all facts, dates, figures and assumptions. This is not engineering, safety or legal certification.</p>
      <label className="block text-sm font-semibold">Title<input className="input mt-2" disabled={creating} maxLength={150} value={draft.title} onChange={e=>{setDraft({...draft,title:e.target.value});setReviewed(false);setCopied(false);}}/></label>
      <label className="block text-sm font-semibold">Edit your draft<textarea className="input mt-2 min-h-80" disabled={creating} maxLength={12000} value={draft.body} onChange={e=>{setDraft({...draft,body:e.target.value});setReviewed(false);setCopied(false);}}/></label>
      {([['Questions to resolve',draft.questions],['Assumptions to verify',draft.assumptions]] as const).map(([label,items])=>items.length>0&&<section key={label}><h3 className="font-semibold">{label}</h3><ul className="list-disc pl-5 text-sm">{items.map((s,i)=><li key={i}>{s}</li>)}</ul></section>)}
      <p className="text-xs muted">Add answers to your notes and generate again, or resolve them in your edited draft. Copy includes the questions and assumptions. Leaving this view discards the draft.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setCopied(false);}}/>I have reviewed this draft and will verify any unresolved information before using it.</label>
      <Button variant="primary" disabled={!reviewed||!draft.body.trim()||!draft.title.trim()} onClick={copy}>Copy reviewed draft</Button>{copied&&<p role="status" className="text-sm">Copied. Nothing has been saved or sent.</p>}
      {mode==='project-plan'&&<AIPlanTasks org={org} tasks={draft.tasks||[]} onBusyChange={v=>{setCreating(v);onBusyChange(v);}}/>}
    </Card>}
  </div>;
}
