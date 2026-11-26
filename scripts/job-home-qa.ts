import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {canReviewJobBudget,proposedJobBudget,reviewedBudgetAmount} from '../src/lib/job-budget';
import {visibleJobSections} from '../src/lib/job-sections';
import {buildFolderTree} from '../src/lib/document-folders';
const config={modules:['projects','jobCosting','documents','closeout','finance'],resources:['projects','tasks','budgets','documents','permits','arInvoices'],limits:{}};
assert.equal(canReviewJobBudget('OWNER',config),true);
for(const role of ['VIEWER','CLIENT_EXTERNAL','SUBCONTRACTOR_EXTERNAL'])assert.equal(canReviewJobBudget(role,config),false);
assert.equal(canReviewJobBudget('OWNER',{...config,resources:['projects']}),false);
assert.equal(proposedJobBudget({contractValue:1000}),null);
assert.equal(proposedJobBudget({proposedEstimateCost:600,contractValue:1000}),600);
for(const v of [0,-1,Infinity,NaN,'200',0.001])assert.throws(()=>reviewedBudgetAmount(v));
assert.equal(reviewedBudgetAmount(120.25),120.25);
assert.deepEqual(visibleJobSections({modules:['projects'],resources:['projects','tasks']},'OWNER').map(s=>s.id),['overview','work','record']);
assert.ok(visibleJobSections(config,'OWNER').some(s=>s.id==='approvals'));
const tree=buildFolderTree([{id:'job-a',name:'Job'}],[]);assert.ok(tree.byKey.has('p:job-a'));assert.equal(tree.byKey.has('p:hidden-job'),false);
const source=ts.transpileModule(readFileSync('src/app/api/[org]/projects/[id]/budget/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let auth:any={role:'OWNER',config,userId:'user',orgId:'org',name:'Owner'},visible=true,otherBudgets=false,failAfter=false,creates=0,project:any={id:'job-a',name:'Job',contractValue:1000,proposedEstimateCost:600};
const rows=new Map<string,any>();
const modules:Record<string,any>={
 'node:crypto':{createHash},'next/server':{NextResponse:{json:(b:any,o:any)=>Response.json(b,o)}},
 '@/lib/auth':{apiAuth:async()=>auth},'@/lib/guard':{billingGuard:(a:any)=>a.blocked?Response.json({error:'read-only'},{status:402}):null},
 '@/lib/access':{buildScope:async()=>({kind:'staff'})},'@/lib/resources':{getResource:()=>({id:'budgets'})},
 '@/lib/job-budget':{canReviewJobBudget,reviewedBudgetAmount},
 '@/lib/records':{
  getRecord:async(_org:string,resource:string,id:string)=>resource==='projects'?(visible?project:null):rows.get(id)||null,
  listRecords:async()=>({rows:otherBudgets?[{id:'existing'}]:[]}),
  createRecord:async(org:string,user:string,actor:string,def:any,input:any,_limits:any,_tax:any,id:string)=>{
   assert.equal(org,'org');assert.equal(user,'user');assert.equal(input.projectId,'job-a');assert.equal(input.status,'APPROVED');assert.equal(input.actualToDate,0);assert.equal(input.originalBudget,600);assert.equal(input.contractValue,undefined);
   if(rows.has(id))throw new Error('duplicate');creates++;const row={...input,id};rows.set(id,row);if(failAfter)throw new Error('response lost');return {ok:true,row};
  }
 }
};
const api:any={};new Function('require','exports',source)((name:string)=>{assert.ok(modules[name],name);return modules[name];},api);
const post=(b:any={approved:true,amount:600})=>api.POST(new Request('https://test',{method:'POST',body:JSON.stringify(b)}),{params:Promise.resolve({org:'workspace',id:'job-a'})}) as Promise<Response>;
async function main(){
 auth=null;assert.equal((await post()).status,401);auth={role:'VIEWER',config,orgId:'org',userId:'user'};assert.equal((await post()).status,403);
 auth.role='OWNER';auth.temporaryPassword=true;assert.equal((await post()).status,403);auth.temporaryPassword=false;
 auth.blocked=true;assert.equal((await post()).status,402);auth.blocked=false;
 assert.equal((await post({approved:false,amount:600})).status,400);visible=false;assert.equal((await post()).status,404);visible=true;
 project.status='CLOSED';assert.equal((await post()).status,409);project.status='ACTIVE';
 project.budget=300;assert.equal((await post()).status,409);delete project.budget;
 otherBudgets=true;assert.equal((await post()).status,409);otherBudgets=false;assert.equal(creates,0);
 assert.equal((await post()).status,201);assert.equal((await post()).status,200);assert.equal(creates,1);
 assert.equal((await post({approved:true,amount:700})).status,409);
 rows.clear();failAfter=true;assert.equal((await post()).status,200);assert.equal(creates,2);
 rows.clear();failAfter=false;const concurrent=await Promise.all([post(),post()]);assert.ok(concurrent.every(r=>[200,201].includes(r.status)));assert.equal(creates,3);
 console.log('Job-home QA passed: enabled/readable sections, scoped library keys, cost-only proposal, permission/approval gates, existing budgets, closed jobs, safe retries and duplicate initial-budget prevention. Mocked storage only.');
}
main().catch(e=>{console.error(e);process.exit(1);});
