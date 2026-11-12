// Isolated route tests. Auth, Supabase and billing are test doubles; this is
// not an authenticated integration test or a substitute for real RLS tests.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const mocks={
 'next/server':`export class NextResponse extends Response {static json(body,init){return new NextResponse(JSON.stringify(body),{status:init?.status||200,headers:{'content-type':'application/json'}})}}`,
 '@/lib/auth':`export const apiAuth=async()=>globalThis.__receiptQA.auth;`,
 '@/lib/catalog':`export const canRead=()=>true;export const canWrite=(role)=>role!=='HR_MANAGER';export const canDelete=()=>true;export const canCapability=()=>true;`,
 '@/lib/module-visibility':`export const resourceFullyEnabled=()=>true;export const moduleEnabled=()=>true;`,
 '@/lib/access':`export const buildScope=async a=>a;`,
 '@/lib/records':`export const getRecord=async(o,r,id)=>globalThis.__receiptQA.visible.includes(id)?{id}:null;`,
 '@/lib/supabase':`export const hasServiceKey=()=>true;export const supabaseAdmin=()=>({rpc:async(name,args)=>{globalThis.__receiptQA.calls.push({name,args});return {data:{ok:true},error:null}}});`,
};
const file='/home/user/receipt-api-guard-test.mjs';
await build({entryPoints:['src/app/api/[org]/receipts/route.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},args=>{const path=args.importer.endsWith('/guard.ts')&&args.path.startsWith('./')?'@/lib/'+args.path.slice(2):args.path;return mocks[path]?{path,namespace:'qa'}:null});b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:mocks[args.path],loader:'js'}));}}],alias:{'@':'./src'},logLevel:'silent'});
const {POST}=await import(pathToFileURL(file).href+'?'+Date.now());
const req=(receipt, allocations=[])=>new Request('http://local/api/test/receipts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:'00000000-0000-4000-8000-000000000001',receipt,allocations})});
const context={params:Promise.resolve({org:'test'})};
const receipt={name:'Test',clientId:'client-1',currency:'USD',method:'Cash',paymentDate:'2026-11-12',amount:'50.00'};
const auth={orgId:'org-1',userId:'actor-1',role:'OWNER',config:{},billing:{access:true,writable:true}};
globalThis.__receiptQA={auth:null,visible:['client-1','invoice-1'],calls:[]};
assert.equal((await POST(req(receipt),context)).status,401);
__receiptQA.auth={...auth,billing:{access:true,writable:false}};assert.equal((await POST(req(receipt),context)).status,402);
__receiptQA.auth={...auth,billing:{access:false,writable:false}};assert.equal((await POST(req(receipt),context)).status,402);
__receiptQA.auth={...auth,role:'HR_MANAGER'};assert.equal((await POST(req(receipt),context)).status,403);
__receiptQA.auth=auth;assert.equal((await POST(req({...receipt,paymentDate:'2026-02-30'}),context)).status,400);
assert.equal((await POST(req({...receipt,clientId:'another-tenant-client'}),context)).status,403);
assert.equal((await POST(req(receipt,[{invoiceId:'another-tenant-invoice',amount:'10.00'}]),context)).status,403);
assert.equal(__receiptQA.calls.length,0);
const response=await POST(req(receipt,[{invoiceId:'invoice-1',amount:'10.00'}]),context);assert.equal(response.status,200);assert.equal(__receiptQA.calls.length,1);assert.equal(__receiptQA.calls[0].args.p_lines[0].amountMinor,1000);assert.equal(__receiptQA.calls[0].args.p_actor,'actor-1');
fs.unlinkSync(file);console.log('PASS receipt creation API guard tests: mocked unauthenticated, real billing guard with read-only/locked contexts, role, invalid date, inaccessible tenant records, and valid cents/RPC.');
