'use client';
import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {apiGet,orgApi} from '@/lib/client';
import {canCreateAITasks,reviewedTask} from '@/lib/ai-tasks';
import {Button} from './ui';
type Item={requestId:string;name:string;plannedStart:string;plannedEnd:string;selected:boolean;id?:string};
export default function AIPlanTasks({org,tasks,onBusyChange}:{org:string;tasks:{name:string}[];onBusyChange:(v:boolean)=>void}){
  const {data:meta}=useQuery<any>({queryKey:['meta',org],queryFn:()=>apiGet(orgApi(org,'meta'))});
  const allowed=!!meta&&canCreateAITasks(meta.role,meta.config);
  const {data:projects,error:projectError}=useQuery<{options:{value:string;label:string}[]}>({queryKey:['ai-project-refs',org],queryFn:()=>apiGet(orgApi(org,'records/projects?mode=refs&limit=300')),enabled:allowed});
  const [items,setItems]=useState<Item[]>(()=>tasks.map(t=>({...t,requestId:crypto.randomUUID(),plannedStart:'',plannedEnd:'',selected:true})));
  const [projectId,setProjectId]=useState(''),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),cache=useQueryClient();
  const pending=items.filter(i=>i.selected&&!i.id),saved=items.filter(i=>i.id);
  function edit(index:number,patch:Partial<Item>){setItems(old=>old.map((t,i)=>i===index?{...t,...patch}:t));setApproved(false);}
  async function create(){
    if(lock.current||!approved||!projectId||!pending.length)return;
    try{pending.forEach(reviewedTask);}catch(e){setError((e as Error).message);return;}
    lock.current=true;setBusy(true);onBusyChange(true);setStarted(true);setError('');
    try{
      for(const item of pending){
        const response=await fetch(orgApi(org,'ai/tasks'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:true,projectId,requestId:item.requestId,task:{name:item.name,plannedStart:item.plannedStart,plannedEnd:item.plannedEnd}}),signal:AbortSignal.timeout(30000)});
        const body=await response.json();if(!response.ok)throw new Error(body.error||'Task creation failed.');
        if(!body.row?.id)throw new Error('Task creation could not be confirmed.');
        setItems(old=>old.map(t=>t.requestId===item.requestId?{...t,id:body.row.id}:t));
      }
    }catch(e){setError((e as Error).name==='TimeoutError'?'The response timed out. Retry remaining tasks to reconcile safely.':(e as Error).message);}
    finally{lock.current=false;setBusy(false);onBusyChange(false);void cache.invalidateQueries({queryKey:['records',org,'tasks']});}
  }
  if(!allowed)return <p className="text-sm muted">Creating tasks requires enabled project and task modules and permission to create tasks. You can still copy the plan.</p>;
  if(!items.length)return <p className="text-sm muted">This response has no structured task suggestions. Generate a new project plan to prepare tasks.</p>;
  return <section className="space-y-4 border-t divider pt-5"><h3 className="font-semibold">Review and create project tasks</h3>
    <p className="text-sm muted">Review this checklist separately from the plan text above. Dates are optional and entered by you. Tasks will be unassigned, Not started, with 0% progress. Nothing is created until you approve below.</p>
    <label className="block text-sm">Project<select className="input mt-2" value={projectId} disabled={started||busy} onChange={e=>{setProjectId(e.target.value);setApproved(false);}}><option value="">Choose an accessible project</option>{projects?.options.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
    {!!projectError&&<p role="alert">Projects could not load. Refresh and try again.</p>}
    {items.map((item,i)=><fieldset key={item.requestId} disabled={started||busy} className="rounded border divider p-3 space-y-2"><legend className="text-sm">Task {i+1}{item.id?' — Created':''}</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.selected} onChange={e=>edit(i,{selected:e.target.checked})}/>Include this task</label>
      <label className="block text-sm">Task name<input className="input" maxLength={200} value={item.name} onChange={e=>edit(i,{name:e.target.value})}/></label>
      <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Planned start<input type="date" className="input" value={item.plannedStart} onChange={e=>edit(i,{plannedStart:e.target.value})}/></label><label className="text-sm">Planned finish<input type="date" className="input" value={item.plannedEnd} onChange={e=>edit(i,{plannedEnd:e.target.value})}/></label></div>
    </fieldset>)}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} disabled={started||busy} onChange={e=>setApproved(e.target.checked)}/>I have reviewed the selected tasks, project, dates, questions and assumptions, and approve creating these tasks.</label>
    <p className="text-xs muted">Tasks are created individually. If one fails, earlier successes remain saved. After submission, this approval is locked so retries cannot duplicate or alter it. Edit saved tasks in the task register.</p>
    <Button variant="primary" loading={busy} disabled={busy||!approved||!projectId||!pending.length} onClick={create}>{started?'Retry remaining tasks':`Create ${pending.length} approved tasks`}</Button>
    {!!saved.length&&<p role="status">{saved.length} task(s) created. <a className="underline" href={`/${org}/m/tasks?projectId=${encodeURIComponent(projectId)}`}>Open task register</a></p>}
    {!!error&&<p role="alert" className="text-sm text-red-700">{error} Previously confirmed tasks will not be resubmitted. Do not regenerate the plan to retry.</p>}
  </section>;
}
