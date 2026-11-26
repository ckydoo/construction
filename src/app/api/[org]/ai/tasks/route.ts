import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {apiAuth} from '@/lib/auth';
import {billingGuard} from '@/lib/guard';
import {buildScope} from '@/lib/access';
import {createRecord,getRecord} from '@/lib/records';
import {getResource} from '@/lib/resources';
import {canCreateAITasks,reviewedTask} from '@/lib/ai-tasks';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request,{params}:{params:Promise<{org:string}>}){
  const {org}=await params;const a=await apiAuth(org);if(!a)return reply({error:'Unauthorized'},401);
  if(!canCreateAITasks(a.role,a.config)||a.temporaryPassword)return reply({error:'You cannot create project tasks with your current permissions or account setup.'},403);
  const billing=billingGuard(a,{write:true});if(billing)return billing;
  const raw=await req.text();if(raw.length>4000)return reply({error:'Request too large'},413);
  let b:any,task:ReturnType<typeof reviewedTask>;
  try{b=JSON.parse(raw);task=reviewedTask(b?.task);}catch(e){return reply({error:e instanceof Error?e.message:'Invalid task'},400);}
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(b.approved!==true||typeof b.projectId!=='string'||!uuid.test(b.projectId)||typeof b.requestId!=='string'||!uuid.test(b.requestId))return reply({error:'Choose a project and explicitly approve this task.'},400);
  const scope=await buildScope(a);
  const project=await getRecord(a.orgId,'projects',b.projectId,scope);
  if(!project)return reply({error:'Project unavailable in this workspace or outside your access.'},403);
  // Stable per user/workspace/request, not supplied directly as a record ID. The
  // primary key arbitrates simultaneous retries; all inserts still use user RLS.
  const hex=createHash('sha256').update(`${a.orgId}:${a.userId}:ai-task:${b.requestId}`).digest('hex');
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  async function existing(){
    const row=await getRecord(a!.orgId,'tasks',id,scope);if(!row)return null;
    if(row.projectId!==b.projectId||row.name!==task.name||(row.plannedStart||'')!==task.plannedStart||(row.plannedEnd||'')!==task.plannedEnd)return reply({error:'This approval was already used for a different task or the saved task was edited. Check the task register before continuing.'},409);
    return reply({row,replayed:true});
  }
  try{
    const previous=await existing();if(previous)return previous;
    const result=await createRecord(a.orgId,a.userId,a.name,getResource('tasks')!,{...task,plannedStart:task.plannedStart||null,plannedEnd:task.plannedEnd||null,projectId:b.projectId,status:'NOT_STARTED',progress:0,wbsLevel:'Activity',assignedTo:null},a.config.limits,a.config.tax,id);
    if(!result.ok)return reply({error:'Task validation failed',errors:result.errors},result.status||400);
    return reply({row:result.row},201);
  }catch{
    // An insert may have committed even if its response was lost. Reconcile by
    // the same ID; never blindly insert a new task on a retry.
    try{const previous=await existing();if(previous)return previous;}catch{}
    return reply({error:'Could not confirm task creation. Retry this same approval to safely check its result.'},503);
  }
}
