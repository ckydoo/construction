import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {apiAuth} from '@/lib/auth';
import {billingGuard} from '@/lib/guard';
import {buildScope} from '@/lib/access';
import {getRecord,createRecord,listRecords} from '@/lib/records';
import {getResource} from '@/lib/resources';
import {canReviewJobBudget,reviewedBudgetAmount} from '@/lib/job-budget';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request,{params}:{params:Promise<{org:string;id:string}>}){
  const {org,id}=await params;const a=await apiAuth(org);if(!a)return reply({error:'Unauthorized'},401);
  if(!canReviewJobBudget(a.role,a.config)||a.temporaryPassword)return reply({error:'You cannot approve a job budget with your current access.'},403);
  const billing=billingGuard(a,{write:true});if(billing)return billing;
  const raw=await req.text();if(raw.length>2000)return reply({error:'Request too large'},413);
  let amount:number;
  try{const b=JSON.parse(raw);if(b.approved!==true)throw new Error('Review and approve this budget first.');amount=reviewedBudgetAmount(b.amount);}catch(e){return reply({error:(e as Error).message},400);}
  const scope=await buildScope(a);const project=await getRecord(a.orgId,'projects',id,scope);
  if(!project)return reply({error:'Job not available'},404);
  if(project.status==='CLOSED')return reply({error:'This job is closed.'},409);
  // Same initial-budget identity across users and retries. A primary-key
  // collision is reconciled, not replaced with another budget record.
  const hex=createHash('sha256').update(`${a.orgId}:${id}:initial-job-budget`).digest('hex');
  const budgetId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const def=getResource('budgets')!;
  async function replay(){const row=await getRecord(a!.orgId,'budgets',budgetId,scope);if(!row)return null;return Number(row.originalBudget)===amount?reply({row,replayed:true}):reply({error:'An initial budget already exists. Open the budget register to review it.'},409);}
  try{
    const prior=await replay();if(prior)return prior;
    if(Number(project.budget)>0)return reply({error:'This job already has an approved budget amount. Review it rather than adding another initial budget.'},409);
    const existing=await listRecords(a.orgId,def,{projectId:id,pageSize:1},scope);
    if(existing.rows.length)return reply({error:'This job already has budget lines. Review those rather than adding another initial budget.'},409);
    const result=await createRecord(a.orgId,a.userId,a.name,def,{name:`Initial cost budget — ${project.name||project.number||'Job'}`,projectId:id,costCode:'INITIAL',originalBudget:amount,approvedVariations:0,committed:0,actualToDate:0,forecastToComplete:amount,status:'APPROVED'},a.config.limits,a.config.tax,budgetId);
    if(!result.ok)return reply({error:'Budget validation failed',errors:result.errors},result.status||400);
    return reply({row:result.row},201);
  }catch{
    try{const prior=await replay();if(prior)return prior;}catch{}
    return reply({error:'Could not confirm the budget. Retry the same amount to check safely.'},503);
  }
}
