import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as ask from '../src/lib/ask-myla';
const config={modules:['estimating','finance','projects'],resources:['estimates','arInvoices','projects','tasks']};
assert.equal(ask.mylaResources('OWNER',config).length,4);
assert.equal(ask.mylaResources('unknown',config).length,0);
assert.equal(ask.mylaResources('OWNER',{...config,modules:[]}).length,0);
assert.ok(ask.mylaResources('VIEWER',config).includes('projects'));
for(const raw of [{resource:'employees',filter:'search',query:'pay'},{resource:'tasks',filter:'unpaid'},{resource:'arInvoices',filter:'sql'},{resource:'projects',filter:'search',query:'*'}])assert.throws(()=>ask.parseMylaPlan(raw));
assert.deepEqual(ask.parseMylaPlan({resource:null}),{resource:null,filter:'recent',query:''});
const overdue=ask.parseMylaPlan({resource:'arInvoices',filter:'overdue'});
assert.ok(ask.matchesMylaPlan({status:'ISSUED',dueDate:'2026-01-01'},overdue,'2026-11-18'));
for(const status of ['PAID','DRAFT','VOID'])assert.equal(ask.matchesMylaPlan({status,dueDate:'2026-01-01'},overdue,'2026-11-18'),false);
assert.equal(ask.matchesMylaPlan({status:'ISSUED',dueDate:'2026-11-18'},overdue,'2026-11-18'),false);
assert.equal(ask.mylaRecordLink('org','tasks','id?evil'),'/org/m/tasks?open=id%3Fevil');
let auth:any={role:'OWNER',config,orgId:'tenant-a',userId:'user',billing:{access:true,writable:false}};
let plan:any={resource:'tasks',filter:'recent'};let calls=0,queries=0;
const callsSeen:any[]=[];
const rows=[{id:'visible',title:'Visible task',status:'NOT_STARTED',data:{name:'Visible task'},project_id:'job-a'},{id:'hidden',title:'Hidden task',data:{name:'Hidden task'},project_id:'job-b'}];
const query:any={};for(const method of ['select','eq','is','ilike','order'])query[method]=(...args:any[])=>{callsSeen.push([method,...args]);return query;};query.limit=async(n:number)=>{assert.equal(n,201);queries++;return {data:rows,error:null};};
const modules:Record<string,any>={
 'next/server':{NextResponse:{json:(body:any,opts:any)=>Response.json(body,opts)}},
 '@/lib/auth':{apiAuth:async()=>auth},'@/lib/guard':{billingGuard:(a:any)=>a.billing?.access===false?Response.json({error:'locked'},{status:402}):null},
 '@/lib/supabase':{supabaseEnv:()=>({url:'https://backend.test',serviceKey:'test-server'}),supabase:async()=>({from:(table:string)=>{assert.equal(table,'records');return query;}})},
 '@/lib/access':{buildScope:async()=>({kind:'staff'}),rowAllowed:(_s:any,_r:any,row:any)=>row.projectId==='job-a'},
 '@/lib/ask-myla':ask
};
const source=ts.transpileModule(readFileSync('src/app/api/[org]/ai/ask/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api:any={};new Function('require','exports','fetch',source)((name:string)=>{assert.ok(modules[name]);return modules[name];},api,async(_url:any,init:any)=>{
 calls++;const payload=JSON.parse(init.body);assert.deepEqual(Object.keys(payload).sort(),['currency','orgId','prompt','rates','task','userId']);assert.equal(payload.task,'ask');assert.deepEqual(payload.rates,[]);return Response.json({suggestion:plan});
});
async function post(body:any={question:'Show recent tasks',consent:true}){return api.POST(new Request('https://app.test',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({org:'workspace'})}) as Promise<Response>;}
async function main(){
 auth=null;assert.equal((await post()).status,401);assert.equal(calls,0);
 auth={role:'OWNER',config,orgId:'tenant-a',userId:'user',billing:{access:true,writable:false}};
 assert.equal((await post({question:'Show tasks',consent:false})).status,400);assert.equal(calls,0);
 auth.temporaryPassword=true;assert.equal((await post()).status,403);auth.temporaryPassword=false;
 const response=await post();assert.equal(response.status,200);const answer=await response.json();assert.equal(answer.records.length,1);assert.equal(answer.records[0].id,'visible');assert.match(answer.records[0].href,/workspace\/m\/tasks\?open=visible/);assert.match(answer.note,/not a complete register/);assert.ok(callsSeen.some(c=>c[0]==='eq'&&c[1]==='organization_id'&&c[2]==='tenant-a'));
 plan={resource:'employees',filter:'recent',sql:'select *',href:'https://evil.test'};assert.equal((await post()).status,422);assert.equal(queries,1);
 plan={resource:'projects',filter:'recent'};auth.config={...config,resources:['tasks']};const denied=await (await post()).json();assert.equal(denied.records.length,0);assert.equal(queries,1);
 plan={resource:null};assert.match((await (await post()).json()).answer,/Which would you like/);assert.equal(queries,1);
 auth.billing.access=false;assert.equal((await post()).status,402);
 console.log('Ask Myla QA passed: read permissions, disabled modules, consent, billing, temporary password, tenant filter, row scope, safe links, constrained plans and read-only responses. No live records or provider calls.');
}
main().catch(e=>{console.error(e);process.exit(1);});
