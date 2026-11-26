import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {canCreateAITasks,reviewedTask} from '../src/lib/ai-tasks';
import {parseWritingDraft} from '../src/lib/ai-assistant';
const config={modules:['projects'],resources:['projects','tasks'],limits:{}};
assert.equal(canCreateAITasks('OWNER',config),true);
for(const role of ['VIEWER','CLIENT_EXTERNAL','SUBCONTRACTOR_EXTERNAL','unknown'])assert.equal(canCreateAITasks(role,config),false);
assert.equal(canCreateAITasks('OWNER',{...config,resources:['projects']}),false);
assert.equal(canCreateAITasks('OWNER',{...config,modules:[]}),false);
assert.deepEqual(reviewedTask({name:' Work ',status:'COMPLETE',assignedTo:'forged'}),{name:'Work',plannedStart:'',plannedEnd:''});
for(const task of [{name:''},{name:'x'.repeat(201)},{name:'Work',plannedStart:'2026-02-30'},{name:'Work',plannedStart:'2026-05-10',plannedEnd:'2026-05-01'}])assert.throws(()=>reviewedTask(task));
const draft={title:'Plan',body:'Proposed works',tasks:[{name:'Mobilise',assignedTo:'bad',status:'COMPLETE'},null,{name:''}]};
assert.deepEqual(parseWritingDraft(draft,true).tasks,[{name:'Mobilise'}]);
assert.equal(parseWritingDraft(draft).tasks,undefined);
assert.equal(parseWritingDraft({...draft,tasks:Array(25).fill({name:'Work'})},true).tasks?.length,20);

// Execute the real route with mocked auth/storage. No secrets or live writes.
const source=ts.transpileModule(readFileSync('src/app/api/[org]/ai/tasks/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const projectId='11111111-1111-4111-a111-111111111111';
const requestId='22222222-2222-4222-a222-222222222222';
let auth:any={orgId:'org',userId:'user',name:'Reviewer',role:'OWNER',config};
let projectVisible=true,failAfterInsert=false,deniedBilling=false,createCount=0;
const stored=new Map<string,any>();
const modules:Record<string,any>={
 'node:crypto':{createHash},'next/server':{NextResponse:{json:(b:any,o:any)=>Response.json(b,o)}},
 '@/lib/auth':{apiAuth:async()=>auth},'@/lib/guard':{billingGuard:()=>deniedBilling?Response.json({error:'Billing'},{status:402}):null},
 '@/lib/access':{buildScope:async()=>({kind:'staff'})},'@/lib/ai-tasks':{canCreateAITasks,reviewedTask},
 '@/lib/resources':{getResource:()=>({id:'tasks'})},
 '@/lib/records':{
  getRecord:async(org:string,resource:string,id:string)=>resource==='projects'?(projectVisible?{id:projectId}:null):stored.get(id)||null,
  createRecord:async(org:string,user:string,actor:string,def:any,input:any,limits:any,tax:any,id:string)=>{
   assert.equal(user,auth.userId);assert.equal(input.status,'NOT_STARTED');assert.equal(input.progress,0);assert.equal(input.assignedTo,null);assert.equal(input.projectId,projectId);
   if(stored.has(id))throw new Error('duplicate primary key');
   createCount++;const row={...input,id};stored.set(id,row);
   if(failAfterInsert)throw new Error('response lost after insert');
   return {ok:true,row};
  }
 }
};
const exports:any={};new Function('require','exports',source)((name:string)=>{assert.ok(modules[name],name);return modules[name];},exports);
async function post(body:any){return exports.POST(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({org:'workspace'})}) as Promise<Response>;}
const body={projectId,requestId,approved:true,task:{name:'Mobilise',status:'COMPLETE',assignedTo:'forged'}};
async function main(){
 auth=null;assert.equal((await post(body)).status,401);
 auth={orgId:'org',userId:'user',name:'Reviewer',role:'VIEWER',config};assert.equal((await post(body)).status,403);
 auth.role='OWNER';auth.temporaryPassword=true;assert.equal((await post(body)).status,403);auth.temporaryPassword=false;
 deniedBilling=true;assert.equal((await post(body)).status,402);deniedBilling=false;
 assert.equal((await post({...body,approved:false})).status,400);
 assert.equal((await post({...body,projectId:'invalid'})).status,400);
 projectVisible=false;assert.equal((await post(body)).status,403);projectVisible=true;
 assert.equal(createCount,0);
 const first=await post(body);assert.equal(first.status,201);const saved=await first.json();
 const second=await post(body);assert.equal(second.status,200);assert.equal((await second.json()).row.id,saved.row.id);assert.equal(createCount,1);
 assert.equal((await post({...body,task:{name:'Changed'}})).status,409);assert.equal(createCount,1);
 failAfterInsert=true;
 assert.equal((await post({...body,requestId:'33333333-3333-4333-a333-333333333333'})).status,200);assert.equal(createCount,2);
 failAfterInsert=false;
 const concurrent=await Promise.all([post({...body,requestId:'44444444-4444-4444-a444-444444444444'}),post({...body,requestId:'44444444-4444-4444-a444-444444444444'})]);
 assert.ok(concurrent.every(r=>[200,201].includes(r.status)));assert.equal(createCount,3);
 auth.userId='different-user';assert.equal((await post(body)).status,201);assert.equal(createCount,4);
 console.log('AI task QA passed: permissions, consent, project scope, input bounds, safe defaults, stable retries, concurrent duplicate protection, lost-response recovery and user-bound request IDs.');
}
main().catch(e=>{console.error(e);process.exit(1);});
