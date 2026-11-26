import {NextResponse} from 'next/server';
import {apiAuth} from '@/lib/auth';
import {billingGuard} from '@/lib/guard';
import {supabase,supabaseEnv} from '@/lib/supabase';
import {buildScope,rowAllowed} from '@/lib/access';
import {mylaResources,builtInMylaPlan,mylaServiceFailure,parseMylaPlan,matchesMylaPlan,mylaRecordLink,MYLA_LABELS} from '@/lib/ask-myla';
export const runtime='nodejs';
export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request,{params}:{params:Promise<{org:string}>}){
  const {org}=await params;const a=await apiAuth(org);if(!a)return reply({error:'Unauthorized'},401);
  const allowed=mylaResources(a.role,a.config);if(!allowed.length)return reply({error:'No supported records are available with your current access.'},403);
  const billing=billingGuard(a);if(billing)return billing;
  if(a.temporaryPassword)return reply({error:'Change your temporary password before asking Myla.'},403);
  const raw=await req.text();if(raw.length>4000)return reply({error:'Please shorten your question.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
  const question=typeof b?.question==='string'?b.question.trim():'';
  if(question.length<3||question.length>2000||b?.consent!==true)return reply({error:'Enter a question and allow Myla to interpret it.'},400);
  try{
    let plan=builtInMylaPlan(question);
    if(!plan){
    const {url,serviceKey}=supabaseEnv();if(!url||!serviceKey)return reply(mylaServiceFailure(503),503);
    // Provider interprets only the user's question. It never sees database rows
    // and never decides tenancy, roles, SQL, identifiers or destination URLs.
    let response:Response;
    try{response=await fetch(`${url}/functions/v1/ai-quotation`,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},body:JSON.stringify({task:'ask',prompt:question,orgId:a.orgId,userId:a.userId,rates:[],currency:'USD'}),signal:AbortSignal.timeout(50000),cache:'no-store'});}catch{return reply(mylaServiceFailure(502),502);}
    const result=await response.json().catch(()=>null);
    if(!response.ok){
      // Status only: never log questions, credentials, records or provider bodies.
      console.error('myla_interpretation_failed',{status:response.status,code:mylaServiceFailure(response.status,result).code});
      return reply(mylaServiceFailure(response.status,result),response.status===429?429:502);
    }
    try{plan=parseMylaPlan(result?.suggestion);}catch{return reply(mylaServiceFailure(502),502);}
    }
    const checkedAt=new Date().toISOString();
    if(!plan.resource)return reply({answer:'I can find quotations, invoices, jobs and tasks. Which would you like to look at? Try “show overdue tasks” or “find quotation EST-0001”. I can’t change records or calculate business totals here yet.',checkedAt,records:[]});
    if(!allowed.includes(plan.resource))return reply({answer:'That section is not available with your current workspace access. Ask your administrator if you need access.',checkedAt,records:[]});
    const scope=await buildScope(a);const sb=await supabase();
    let query=sb.from('records').select('id,title,number,status,project_id,data').eq('organization_id',a.orgId).eq('resource',plan.resource).is('deleted_at',null);
    if(plan.query)query=query.ilike('search_text',`%${plan.query}%`);
    // Bounded candidate window, RLS plus explicit row-scope defence. Do not
    // expose pre-scope counts or claim that this window is the whole register.
    const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:true}).limit(201);
    if(error)throw new Error('Records unavailable');
    const rows=(data||[]).slice(0,200).filter(r=>rowAllowed(scope,plan.resource!,{...(r.data||{}),id:r.id,projectId:r.project_id}));
    const matches=rows.filter(r=>matchesMylaPlan({...r.data,status:r.status},plan,checkedAt.slice(0,10)));
    const records=matches.slice(0,12).map(r=>({id:r.id,title:String(r.title||r.number||'Untitled').slice(0,240),number:String(r.number||''),status:String(r.status||''),href:mylaRecordLink(org,plan.resource!,r.id),date:String((plan.resource==='tasks'?r.data?.plannedEnd:r.data?.dueDate)||'').slice(0,10)}));
    const label=MYLA_LABELS[plan.resource];
    const description=plan.filter==='search'?`matching “${plan.query}”`:plan.filter==='overdue'?'with a past due date and an open status':plan.filter==='unpaid'?'marked issued, partially paid or overdue':plan.filter==='awaiting'?'marked submitted or internal review':'most recently created';
    return reply({answer:records.length?`${label} ${description}. ${records.length>1?'Choose a record to see its full details.':'Open the record to see its full details.'}`:`No ${label.toLowerCase()} ${description} were found in the checked records.`,note:'Checked up to 200 recent matching records you can access; showing up to 12. This is not a complete register or a financial balance. Overdue dates use UTC. Open the full register for more.',checkedAt,records,register:{label:`View all ${label.toLowerCase()}`,href:`/${encodeURIComponent(org)}/m/${plan.resource}`}});
  }catch{return reply({error:'Myla could not load your records. Try again shortly. Nothing was changed.'},502);}
}
