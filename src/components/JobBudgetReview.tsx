'use client';
import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Button,Card} from './ui';
import {orgApi} from '@/lib/client';
import {canReviewJobBudget,proposedJobBudget,reviewedBudgetAmount} from '@/lib/job-budget';
export default function JobBudgetReview({org,project,meta,budgets,onSaved}:{org:string;project:any;meta:any;budgets:any[];onSaved:()=>void}){
  const proposed=proposedJobBudget(project);
  const [amount,setAmount]=useState(proposed===null?'':String(proposed)),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const lock=useRef(false),cache=useQueryClient();
  const allowed=!!meta&&canReviewJobBudget(meta.role,meta.config)&&meta.billing?.writable!==false&&!meta.billing?.readOnly&&!meta.user?.temporaryPassword;
  async function save(){
    if(lock.current||!approved)return;
    let value:number;try{value=reviewedBudgetAmount(Number(amount));}catch(e){setError((e as Error).message);return;}
    lock.current=true;setBusy(true);setAttempted(true);setError('');
    try{const response=await fetch(orgApi(org,`projects/${project.id}/budget`),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved:true,amount:value}),signal:AbortSignal.timeout(30000)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Budget could not be saved.');setSaved(true);void cache.invalidateQueries({queryKey:['project',org,project.id]});onSaved();}
    catch(e){setError((e as Error).name==='TimeoutError'?'The result is not confirmed. Retry the same approval safely.':(e as Error).message);}
    finally{lock.current=false;setBusy(false);}
  }
  if(saved)return <Card className="p-4"><p role="status">Cost budget approved. The selling price has not changed.</p></Card>;
  if(budgets.length||Number(project.budget)>0)return <Card className="p-4 text-sm muted">This job already has a budget. Review its existing figures below; no new initial budget will be added.</Card>;
  if(!allowed||project.status==='CLOSED')return null;
  return <Card className="p-5 space-y-3"><h2 className="font-semibold">Review the starting cost budget</h2><p className="text-sm muted">{proposed!==null?'The awarded estimate proposed this cost before markup. Check it before approving.':'No estimated cost was carried into this job. Enter a reviewed cost allowance.'} This is not the selling price.</p>
    <label className="block text-sm font-medium">Cost budget ({project.currency||meta.org?.baseCurrency||'USD'})<input className="input mt-1" type="number" min="0.01" step="0.01" disabled={busy||attempted} value={amount} onChange={e=>{setAmount(e.target.value);setApproved(false);}}/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy||attempted} checked={approved} onChange={e=>setApproved(e.target.checked)}/>I have checked the cost allowance and approve it for this job.</label>
    <p className="text-xs muted">Creates one approved budget line. No costs, payments or contract values are changed. Use the existing budget register for later revisions.</p>
    <Button variant="primary" disabled={busy||!approved||!amount} loading={busy} onClick={save}>{attempted?'Retry budget approval':'Approve cost budget'}</Button>
    {!!error&&<p role="alert" className="text-sm text-red-700">{error} Refresh to review the current job if you need to change the amount.</p>}
  </Card>;
}
