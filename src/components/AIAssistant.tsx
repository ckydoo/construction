'use client';
import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiGet,orgApi} from '@/lib/client';
import {AI_MODES,visibleAIModes,type AIMode,type WritingMode,type WritingDraft} from '@/lib/ai-assistant';
import {Button,Card,Icon} from './ui';
import QuotationAssistant from './QuotationAssistant';
import AIPlanTasks from './AIPlanTasks';
import AIHelp from './AIHelp';
import AskMyla from './AskMyla';
import {mylaResources} from '@/lib/ask-myla';
type AssistantTab=AIMode|'ask';
const TAB_LABELS:Record<string,string>={...Object.fromEntries(Object.entries(AI_MODES).map(([k,v])=>[k,v.label])),ask:'Ask Myla'};
export default function AIAssistant({org}:{org:string}){
  const {data:meta,error}=useQuery<any>({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const [selected,setSelected]=useState<AssistantTab|null>(null),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[pending,setPending]=useState<AssistantTab|null>(null);
  if(error)return <p role="alert">Workspace permissions could not load. Refresh and try again.</p>;
  if(!meta)return <p className="muted">Loading workspace…</p>;
  const readable=mylaResources(meta.role,meta.config);
  const writable=meta.billing?.writable!==false&&!meta.billing?.readOnly;
  const modes:AssistantTab[]=[...(readable.length?['ask' as const]:[]),...(writable?visibleAIModes(meta.role,meta.config):[])];
  if(!modes.length||meta.billing?.access===false||meta.user?.temporaryPassword)return <Card className="p-5 space-y-2"><h1 className="text-lg font-semibold">Myla Assistant is unavailable</h1><p className="text-sm muted">{meta.user?.temporaryPassword?'Change your temporary password to use AI.':!modes.length?'Ask your workspace administrator to enable access to quotations, invoices, jobs or tasks.':'Your workspace is read-only. Ask your administrator to check the subscription.'}</p></Card>;
  const mode=selected&&modes.includes(selected)?selected:modes[0];
  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex items-center gap-4 pt-3 pb-2"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"><Icon name="Sparkles" size={28}/></div><div><h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Myla Assistant</h1><p className="mt-1 text-sm muted">Less admin. More time for your work.</p></div></div>
    {modes.length>1&&<div className="flex flex-wrap gap-2 rounded-2xl border divider bg-white dark:bg-ink-900 p-2" role="group" aria-label="Choose an AI task">{modes.map(m=><button key={m} type="button" disabled={busy} aria-pressed={mode===m} className={`flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 ${mode===m?'bg-ink-900 text-white dark:bg-brand-500 dark:text-ink-950 shadow-sm':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800'}`} onClick={()=>{if(m===mode){setPending(null);return;}if(dirty)setPending(m);else {setSelected(m);setPending(null);}}}><Icon name={m==='ask'?'Sparkles':m==='quotation'?'FileText':m==='project-plan'?'ListChecks':m==='site-report'?'ClipboardList':'MessageSquare'} size={17}/>{TAB_LABELS[m]}</button>)}</div>}
    {pending&&<div role="region" aria-label="Confirm task change" className="rounded-lg border divider p-4 space-y-3"><p className="text-sm">Switch to {TAB_LABELS[pending].toLowerCase()}? Your notes and unsaved draft will be discarded. Any tasks already created will remain saved.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>setPending(null)}>Keep working</Button><Button disabled={busy} onClick={()=>{setSelected(pending);setPending(null);setDirty(false);}}>Discard and switch</Button></div></div>}
    {mode==='ask'?<AskMyla org={org} resources={readable} onBusyChange={setBusy} onDirtyChange={setDirty}/>:mode==='quotation'?<QuotationAssistant org={org} embedded onBusyChange={setBusy} onDirtyChange={setDirty}/>:<WritingAssistant key={`${org}-${mode}`} org={org} mode={mode} onBusyChange={setBusy} onDirtyChange={setDirty}/>}
  </div>;
}
function WritingAssistant({org,mode,onBusyChange,onDirtyChange}:{org:string;mode:WritingMode;onBusyChange:(value:boolean)=>void;onDirtyChange:(value:boolean)=>void}){
  const [prompt,setPrompt]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[draft,setDraft]=useState<WritingDraft|null>(null),[reviewed,setReviewed]=useState(false),[copied,setCopied]=useState(false);
  const [creating,setCreating]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{onDirtyChange(!!prompt.trim()||!!draft);},[prompt,draft,onDirtyChange]);
  async function generate(){
    if(lock.current||creating||prompt.trim().length<20)return;lock.current=true;setBusy(true);onBusyChange(true);setError('');setDraft(null);setReviewed(false);setCopied(false);
    try{
      const response=await fetch(orgApi(org,'ai/draft'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,prompt,consent:true}),signal:AbortSignal.timeout(60000)});
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
    <Card className="space-y-4 p-5 sm:p-8"><h2 className="text-lg font-semibold">{AI_MODES[mode].label}</h2><p className="text-sm muted">{AI_MODES[mode].hint}</p>
      <label className="block text-sm font-semibold" htmlFor="ai-notes">What do you need?</label><textarea id="ai-notes" className="input min-h-40" maxLength={6000} disabled={busy||creating} value={prompt} onChange={e=>{setPrompt(e.target.value);setDraft(null);setReviewed(false);setCopied(false);}} placeholder={mode==='project-plan'?'Example: Plan a workshop renovation. Include preparation, installation and final checks.':mode==='site-report'?'Example: Today we installed two pumps. Testing is delayed until the seals arrive.':'Example: Write a friendly update explaining that installation is complete and testing is tomorrow.'}/>
      <p className="text-xs muted">{prompt.trim().length<20?'Add a little detail (at least 20 characters).':`${prompt.length}/6000 characters`}</p>
      <AIHelp/>
      <Button variant="primary" className="!h-11 !px-6 !rounded-xl" icon="Sparkles" loading={busy} disabled={busy||creating||prompt.trim().length<20} onClick={generate}>{busy?'Preparing your draft…':'Generate draft'}</Button>{busy&&<p role="status" className="text-xs muted">This may take up to a minute. Nothing is saved or sent.</p>}
    </Card>
    {!!error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {draft&&<Card className="space-y-4 p-5 sm:p-8"><p className="text-sm text-amber-800 dark:text-amber-200">Your draft is ready. Check the details before using it.</p>
      <label className="block text-sm font-semibold">Title<input className="input mt-2" disabled={creating} maxLength={150} value={draft.title} onChange={e=>{setDraft({...draft,title:e.target.value});setReviewed(false);setCopied(false);}}/></label>
      <label className="block text-sm font-semibold">Edit your draft<textarea className="input mt-2 min-h-80" disabled={creating} maxLength={12000} value={draft.body} onChange={e=>{setDraft({...draft,body:e.target.value});setReviewed(false);setCopied(false);}}/></label>
      {([['Missing details',draft.questions],['Check these assumptions',draft.assumptions]] as const).map(([label,items])=>items.length>0&&<section key={label}><h3 className="font-semibold">{label}</h3><ul className="list-disc pl-5 text-sm">{items.map((s,i)=><li key={i}>{s}</li>)}</ul></section>)}
      <p className="text-xs muted">Edit the draft above. Copying also includes any missing details and assumptions.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>{setReviewed(e.target.checked);setCopied(false);}}/>I’ve reviewed the draft and checked its details.</label>
      <Button variant="primary" disabled={!reviewed||!draft.body.trim()||!draft.title.trim()} onClick={copy}>Copy draft</Button>{copied&&<p role="status" className="text-sm">Copied. Nothing has been saved or sent.</p>}
      {mode==='project-plan'&&<AIPlanTasks org={org} tasks={draft.tasks||[]} onBusyChange={v=>{setCreating(v);onBusyChange(v);}}/>}
    </Card>}
  </div>;
}
