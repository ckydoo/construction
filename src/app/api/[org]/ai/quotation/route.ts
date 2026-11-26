import {mylaServiceFailure} from '@/lib/ask-myla';
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase, supabaseEnv } from '@/lib/supabase';
import { billingGuard } from '@/lib/guard';
import { canUseQuotationAI, parseSuggestion, prepareAIDraft, type AIRate } from '@/lib/ai-quotation';
export const runtime = 'nodejs';
export const maxDuration = 60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request,{params}:{params:Promise<{org:string}>}) {
  const {org}=await params;
  const a=await apiAuth(org); if(!a)return reply({error:'Unauthorized'},401);
  if(!canUseQuotationAI(a.role,a.config))return reply({error:'Your role cannot create quotations in this workspace.'},403);
  const billing=billingGuard(a,{write:true});if(billing)return billing;
  if(a.temporaryPassword)return reply({error:'Change your temporary password before using AI.'},403);
  const raw=await req.text();if(raw.length>8000)return reply({error:'Please shorten your description.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
  if(b?.consent!==true)return reply({error:'Confirm that this description may be sent to the AI provider.'},400);
  const prompt=typeof b.prompt==='string'?b.prompt.trim():'';
  if(prompt.length<20||prompt.length>6000)return reply({error:'Describe the work using 20–6000 characters.'},400);
  let currency=String(a.org.baseCurrency||'USD');const rates:AIRate[]=[];
  if(b.templateId){
    if(typeof b.templateId!=='string'||!/^[0-9a-f-]{36}$/i.test(b.templateId))return reply({error:'Invalid rate template'},400);
    // RLS user client + explicit tenant restriction; never accept browser-supplied rates.
    const sb=await supabase();const {data,error}=await sb.from('quote_templates').select('payload').eq('organization_id',a.orgId).eq('id',b.templateId).maybeSingle();
    if(error||!data)return reply({error:'Rate template unavailable in this workspace.'},403);
    if(typeof data.payload?.currency==='string'&&/^[A-Z]{3}$/.test(data.payload.currency))currency=data.payload.currency;
    for(const [i,line] of (Array.isArray(data.payload?.items)?data.payload.items:[]).slice(0,40).entries()){
      if(typeof line.description!=='string'||!Number.isFinite(line.unitPrice)||line.unitPrice<0||line.unitPrice>1e6)continue;
      rates.push({id:`rate-${i}`,description:line.description.slice(0,240),unit:String(line.unit||'').slice(0,30),unitPrice:line.unitPrice});
    }
  }
  const {url,serviceKey}=supabaseEnv();if(!url||!serviceKey)return reply(mylaServiceFailure(503),503);
  let received=false;
  try{
    const response=await fetch(`${url}/functions/v1/ai-quotation`,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},body:JSON.stringify({orgId:a.orgId,userId:a.userId,prompt,currency,rates}),signal:AbortSignal.timeout(55000),cache:'no-store'});
    received=true;
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      const failure=mylaServiceFailure(response.status,result);
      console.error('myla_draft_failed',{status:response.status,code:failure.code});
      return reply(failure,[429,503].includes(response.status)?response.status:502);
    }
    const suggestion=parseSuggestion(result?.suggestion);
    return reply({...prepareAIDraft(suggestion,rates,currency),questions:suggestion.questions,assumptions:suggestion.assumptions});
  }catch{
    const code=received?'MYLA_RESPONSE':'MYLA_TRANSPORT';
    return reply({code,error:`Myla could not complete this draft. Support code: ${code}. Nothing was saved or sent.`},502);
  }
}
