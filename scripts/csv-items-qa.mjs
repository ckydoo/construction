// Route-level tests with mocked auth, guard and scoped database. Not live RLS.
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const mocks={
 'next/server':`export class NextResponse extends Response {static json(body,init){return new NextResponse(JSON.stringify(body),{status:init?.status||200,headers:{'content-type':'application/json'}})}}`,
 '@/lib/auth':`export const apiAuth=async()=>globalThis.__csvQA.auth;`,
 '@/lib/resources':`export const getResource=()=>globalThis.__csvQA.def;`,
 '@/lib/guard':`export const readGuard=(config,role)=>role==='NO_READ'?new Response('',{status:403}):null;export const capabilityGuard=(role)=>role==='NO_EXPORT'?new Response('',{status:403}):null;export const writeGuard=()=>null;export const billingGuard=()=>null;`,
 '@/lib/access':`export const buildScope=async a=>({org:a.orgId});`,
 '@/lib/records':`export const listRecords=async(org,def,p,scope)=>{globalThis.__csvQA.call={org,p,scope};return {rows:globalThis.__csvQA.rows.filter(r=>r.org===scope.org)}};export const createRecord=()=>{};export const refOptions=()=>[];`,
};
const dir=await mkdtemp(path.join(tmpdir(),'csv-qa-'));try{
 const file=path.join(dir,'route.mjs');await build({entryPoints:['src/app/api/[org]/records/[resource]/route.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}))}}],alias:{'@':'./src'},logLevel:'silent'});
 const {GET}=await import(pathToFileURL(file).href);const context={params:Promise.resolve({org:'test',resource:'estimates'})};
 const req=(mode='csv-items')=>new Request(`http://local/api/test/records/estimates?mode=${mode}&q=stone&status=DRAFT&projectId=p1`);
 const auth={orgId:'org-1',role:'OWNER',config:{}};globalThis.__csvQA={auth:null,def:{id:'estimates',fields:[{key:'items',type:'items',label:'Items'},{key:'secret',type:'items',hidden:true}]},rows:[{org:'org-1',id:'id-1',number:'EST-1',title:'Example',currency:'USD',items:[{description:'=formula',detail:'A, B',qty:0.125,unitPrice:2,total:0.25,category:'materials',custom:'retained'},{description:'Line 2',qty:1,unitPrice:3,total:3}],secret:[{description:'hidden'}]},{org:'org-2',id:'other',items:[{description:'not allowed'}]}]};
 assert.equal((await GET(req(),context)).status,401);
 __csvQA.auth={...auth,role:'NO_READ'};assert.equal((await GET(req(),context)).status,403);
 __csvQA.auth={...auth,role:'NO_EXPORT'};assert.equal((await GET(req(),context)).status,403);assert.equal(__csvQA.call,undefined);
 __csvQA.auth=auth;let res=await GET(req(),context);assert.equal(res.status,200);assert.match(res.headers.get('content-disposition'),/estimates-line-items.csv/);const text=await res.text();
 assert.equal(text.trimEnd().split('\r\n').length,3);assert.match(text,/id-1,EST-1,Example,USD,items,1,'=formula,"A, B",0.125,2,0.25,materials/);assert.match(text,/custom/);assert.doesNotMatch(text,/not allowed|hidden/);assert.deepEqual(__csvQA.call,{org:'org-1',p:{q:'stone',status:'DRAFT',projectId:'p1',page:1,pageSize:25,sort:undefined,dir:undefined,all:true},scope:{org:'org-1'}});
 res=await GET(req('csv'),context);assert.match(await res.text(),/^Record ID,Record no\./);
 __csvQA.def={id:'estimates',fields:[]};assert.equal((await GET(req(),context)).status,400);
 console.log('PASS: mocked route guards, scope/filter forwarding, parent ID, multiple fractional lines, CSV escaping, formula safety, hidden fields and no-line resource. Real authentication/RLS not tested.');
}finally{await rm(dir,{recursive:true,force:true})}
