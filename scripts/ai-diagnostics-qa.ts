import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {mylaServiceFailure} from '../src/lib/ask-myla';
async function main(){
 for(const mode of ['quotation','draft']){
  let status=401,backend:any={error:'Unauthorized'},transport=false;
  const modules:Record<string,any>={
   'next/server':{NextResponse:{json:(b:any,o:any)=>Response.json(b,o)}},
   '@/lib/auth':{apiAuth:async()=>({orgId:'org',userId:'user',role:'OWNER',config:{},org:{baseCurrency:'USD'}})},
   '@/lib/supabase':{supabaseEnv:()=>({url:'https://backend.test',serviceKey:'synthetic-test'})},
   '@/lib/guard':{billingGuard:()=>null},
   '@/lib/ask-myla':{mylaServiceFailure},
   '@/lib/ai-quotation':{canUseQuotationAI:()=>true,parseSuggestion:()=>{throw Error('bad output');}},
   '@/lib/ai-assistant':{isAIMode:()=>true,canUseAIMode:()=>true,parseWritingDraft:()=>{throw Error('bad output');}},
  };
  const compiled=ts.transpileModule(readFileSync(`src/app/api/[org]/ai/${mode}/route.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const api:any={};
  new Function('require','exports','fetch','console',compiled)((key:string)=>{assert.ok(modules[key]);return modules[key];},api,async()=>{if(transport)throw Error('network');return Response.json(backend,{status});},{error:()=>{}});
  const post=()=>api.POST(new Request('https://app.test',{method:'POST',body:JSON.stringify({mode:'customer-message',prompt:'Prepare a short synthetic test draft',consent:true})}),{params:Promise.resolve({org:'test'})});
  for(const [s,error,code] of [[401,'Unauthorized','MYLA_CONNECTION'],[404,'missing','MYLA_ENDPOINT'],[503,'AI usage controls are not ready.','MYLA_USAGE_SETUP'],[502,'AI provider is unavailable.','MYLA_GENERATION'],[429,'limit','MYLA_LIMIT'],[400,'Invalid workspace','MYLA_WORKSPACE']] as const){
   status=s;backend={error};const res=await post();const body=await res.json();assert.equal(body.code,code);assert.match(body.error,new RegExp(code));
  }
  status=502;backend={error:'private upstream token abc'};assert.doesNotMatch((await (await post()).json()).error,/private upstream|abc/);
  transport=true;assert.equal((await (await post()).json()).code,'MYLA_TRANSPORT');
  transport=false;status=200;backend={suggestion:{}};assert.equal((await (await post()).json()).code,'MYLA_RESPONSE');
 }
 console.log('PASS quotation and writing diagnostics: safe codes for authentication, endpoint, setup, generation, limit, invalid workspace, transport and malformed responses. Mocked only.');
}
main().catch(e=>{console.error(e);process.exit(1);});
