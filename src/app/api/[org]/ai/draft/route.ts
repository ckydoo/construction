import {mylaServiceFailure} from '@/lib/ask-myla';
import {NextResponse} from 'next/server';
import {apiAuth} from '@/lib/auth';
import {billingGuard} from '@/lib/guard';
import {supabaseEnv} from '@/lib/supabase';
import {isAIMode,canUseAIMode,parseWritingDraft} from '@/lib/ai-assistant';
export const runtime='nodejs';
export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request,{params}:{params:Promise<{org:string}>}){
  const {org}=await params;const a=await apiAuth(org);if(!a)return reply({error:'Unauthorized'},401);
  const raw=await req.text();if(raw.length>8000)return reply({error:'Please shorten your notes.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
  if(!isAIMode(b?.mode)||b.mode==='quotation')return reply({error:'Choose a supported drafting mode.'},400);
  if(!canUseAIMode(a.role,a.config,b.mode))return reply({error:'This mode is unavailable for your workspace permissions.'},403);
  const billing=billingGuard(a,{write:true});if(billing)return billing;
  if(a.temporaryPassword)return reply({error:'Change your temporary password before using AI.'},403);
  if(b.consent!==true)return reply({error:'Confirm that your notes may be sent to the AI provider.'},400);
  const prompt=typeof b.prompt==='string'?b.prompt.trim():'';
  if(prompt.length<20||prompt.length>6000)return reply({error:'Provide 20–6000 characters of notes.'},400);
  const {url,serviceKey}=supabaseEnv();if(!url||!serviceKey)return reply(mylaServiceFailure(503),503);
  let received=false;
  try{
    // Notes only: no database reads, record IDs, recipient lookup or mutations.
    const response=await fetch(`${url}/functions/v1/ai-quotation`,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},body:JSON.stringify({task:b.mode,prompt,orgId:a.orgId,userId:a.userId,currency:'USD',rates:[]}),signal:AbortSignal.timeout(55000),cache:'no-store'});
    received=true;
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      const failure=mylaServiceFailure(response.status,result);
      console.error('myla_draft_failed',{status:response.status,code:failure.code});
      return reply(failure,[429,503].includes(response.status)?response.status:502);
    }
    return reply({draft:parseWritingDraft(result?.suggestion,b.mode==='project-plan')});
  }catch{
    const code=received?'MYLA_RESPONSE':'MYLA_TRANSPORT';
    return reply({code,error:`Myla could not complete this draft. Support code: ${code}. Nothing was saved or sent.`},502);
  }
}
