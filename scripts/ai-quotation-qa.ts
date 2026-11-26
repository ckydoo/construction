import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {canUseQuotationAI,parseSuggestion,prepareAIDraft} from '../src/lib/ai-quotation';
import {availableAIModes,canUseAIMode,parseWritingDraft,isAIMode} from '../src/lib/ai-assistant';
const all={modules:['estimating','projects','fieldOps','crm'],resources:['estimates','projects','dailyLogs','clients']};
assert.equal(isAIMode('__proto__'),false);assert.equal(isAIMode('site-report'),true);
for(const mode of ['project-plan','site-report','customer-message'] as const){
 assert.equal(canUseAIMode('OWNER',all,mode),true);
 assert.equal(canUseAIMode('OWNER',{...all,modules:[]},mode),false);
 assert.equal(canUseAIMode('OWNER',{...all,resources:[]},mode),false);
 for(const role of ['VIEWER','CLIENT_EXTERNAL','SUBCONTRACTOR_EXTERNAL','unknown'])assert.equal(canUseAIMode(role,all,mode),false);
}
assert.equal(availableAIModes('OWNER',{modules:['fieldOps'],resources:['dailyLogs']}).join(','),'site-report');
assert.throws(()=>parseWritingDraft({body:'Missing title'}));assert.throws(()=>parseWritingDraft(null));
const writing=parseWritingDraft({title:'Site report',body:'Reported work only',questions:['Missing date',null],assumptions:['Verify'],status:'APPROVED',recipientId:'untrusted'});
assert.deepEqual(Object.keys(writing),['title','body','questions','assumptions']);assert.equal(writing.questions.length,1);
assert.equal(parseWritingDraft({...writing,body:'x'.repeat(14000)}).body.length,12000);
const config={modules:['estimating'],resources:['estimates']};
assert.equal(canUseQuotationAI('OWNER',config),true);
assert.equal(canUseQuotationAI('OWNER',{...config,modules:[]}),false);
assert.equal(canUseQuotationAI('CLIENT',config),false);
const suggestion=parseSuggestion({name:'Job',scope:'Proposed work',questions:['What is the wall height?'],assumptions:['Access available'],items:[{description:'Brickwork',unit:'m2',qty:null,rateId:'fake',unitPrice:999999,status:'APPROVED'}]});
const result=prepareAIDraft(suggestion,[],'USD');
assert.equal(result.draft.status,'DRAFT');assert.equal(result.draft.markup,0);
assert.equal(result.draft.items[0].unitPrice,0);assert.equal(result.draft.items[0].qty,1);
assert.match(result.draft.scope,/wall height/);assert.equal(result.warnings.length,3);
const priced=prepareAIDraft({...suggestion,items:[{description:'Brickwork',unit:'wrong unit',qty:2,rateId:'rate-0'}]},[{id:'rate-0',description:'Company brickwork',unit:'m2',unitPrice:12.5}],'USD');
assert.equal(priced.draft.items[0].total,25);assert.equal(priced.draft.items[0].unit,'m2');
assert.equal(parseSuggestion({...suggestion,items:[{description:'Bad quantity',qty:Infinity}]}).items[0].qty,null);
assert.throws(()=>parseSuggestion({items:[]}));assert.throws(()=>parseSuggestion({items:[null]}));

// Execute the actual Edge handler with mocked environment/network: no provider costs or secrets.
const source=ts.transpileModule(readFileSync('supabase/functions/ai-quotation/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
async function edge(env:Record<string,string>,auth:string,fetcher:typeof fetch,body:any={}){
  let handler:any;
  new Function('Deno','fetch',source)({env:{get:(k:string)=>env[k]},serve:(h:any)=>{handler=h;}},fetcher);
  return handler(new Request('https://example.test',{method:'POST',headers:{authorization:auth},body:JSON.stringify(body)})) as Promise<Response>;
}
async function main(){
 const env={SUPABASE_SERVICE_ROLE_KEY:'server-test',SUPABASE_URL:'https://example.test',OPENROUTER_API_KEY:'provider-test',OPENROUTER_MODEL:'test/model:free'};
 const denyFetch=(async()=>{throw new Error('Network should not be reached');}) as typeof fetch;
 assert.equal((await edge(env,'Bearer user-test',denyFetch)).status,401);
 assert.equal((await edge({...env,OPENROUTER_API_KEY:''},'Bearer server-test',denyFetch)).status,503);
 assert.equal((await edge({...env,OPENROUTER_MODEL:'test/paid'},'Bearer server-test',denyFetch)).status,503);
 const body={orgId:'11111111-1111-1111-1111-111111111111',userId:'22222222-2222-2222-2222-222222222222',prompt:'Prepare a quotation for kitchen work',currency:'USD',rates:[]};
 let calls=0;
 const limited=(async()=>{calls++;return Response.json(false);}) as typeof fetch;
 assert.equal((await edge(env,'Bearer server-test',limited,body)).status,429);assert.equal(calls,1);
 const successful=(async(url:any,init:any)=>{
   if(String(url).includes('/rpc/'))return Response.json(true);
   const sent=JSON.parse(init.body);assert.equal(sent.model,'test/model:free');assert.deepEqual(sent.provider.max_price,{prompt:0,completion:0});assert.equal(sent.provider.require_parameters,true);assert.equal(sent.provider.allow_fallbacks,false);assert.equal(sent.provider.data_collection,'deny');assert.equal(sent.max_tokens,2500);assert.equal(sent.tools,undefined);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(suggestion)}}]});
 }) as typeof fetch;
 const response=await edge(env,'Bearer server-test',successful,body);assert.equal(response.status,200);assert.deepEqual((await response.json()).suggestion,suggestion);
 let defaultModel='';
 const defaultFetch=(async(url:any,init:any)=>{if(String(url).includes('/rpc/'))return Response.json(true);defaultModel=JSON.parse(init.body).model;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(suggestion)}}]});}) as typeof fetch;
 assert.equal((await edge({...env,OPENROUTER_MODEL:''},'Bearer server-test',defaultFetch,body)).status,200);assert.equal(defaultModel,'nvidia/nemotron-3.5-super-vl:free');
 assert.equal((await edge(env,'Bearer server-test',denyFetch,{...body,task:'send-email'})).status,400);
 for(const task of ['project-plan','site-report','customer-message']){
  let reservations=0;
  const writer=(async(url:any,init:any)=>{
   if(String(url).includes('/rpc/')){assert.match(String(url),/reserve_ai_quotation$/);reservations++;return Response.json(true);}
   const sent=JSON.parse(init.body);assert.deepEqual(JSON.parse(sent.messages[1].content),{request:body.prompt});assert.match(sent.messages[0].content,/No database access or tools/);assert.equal(sent.provider.max_price.prompt,0);assert.equal(sent.provider.allow_fallbacks,false);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(writing)}}]});
  }) as typeof fetch;
  const res=await edge(env,'Bearer server-test',writer,{...body,task});assert.equal(res.status,200);assert.deepEqual(parseWritingDraft((await res.json()).suggestion),writing);assert.equal(reservations,1);
  assert.equal((await edge(env,'Bearer server-test',limited,{...body,task})).status,429);
 }
 const askFetcher=(async(url:any,init:any)=>{if(String(url).includes('/rpc/'))return Response.json(true);const sent=JSON.parse(init.body);assert.match(sent.messages[0].content,/READ-ONLY record lookup/);assert.match(sent.messages[0].content,/No database records are provided/);assert.deepEqual(JSON.parse(sent.messages[1].content),{request:'jobs'});return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({resource:'projects',filter:'recent',query:''})}}]});}) as typeof fetch;
 assert.equal((await edge(env,'Bearer server-test',askFetcher,{...body,task:'ask',prompt:'jobs'})).status,200);
 assert.equal((await edge(env,'Bearer user-test',denyFetch,{...body,task:'ask'})).status,401);
 assert.equal((await edge(env,'Bearer server-test',limited,{...body,task:'ask'})).status,429);
 console.log('AI quotation and writing modes QA passed: permissions, untrusted output, price provenance, draft-only handoff, proxy authentication, configuration and quota enforcement.');
}
main().catch(e=>{console.error(e);process.exit(1);});
