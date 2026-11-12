/* Pending migration and integration QA. Creates a receipt and allocations as
 * one database transaction. No emails, external payment or bank transfer. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { billingGuard, capabilityGuard, writeGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { hasServiceKey, supabaseAdmin } from '@/lib/supabase';
import { cents } from '@/lib/receipt-allocation';
type Ctx = {params:Promise<{org:string}>};
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const fail=(error:string,status:number)=>NextResponse.json({error},{status});
export async function POST(req:Request,{params}:Ctx){
 const {org}=await params; const a=await apiAuth(org); if(!a)return fail('Unauthorized',401);
 const g=billingGuard(a,{write:true})||writeGuard(a.config,a.role,'payments')||writeGuard(a.config,a.role,'arInvoices')||capabilityGuard(a.role,'records.create')||capabilityGuard(a.role,'records.update'); if(g)return g;
 if(!hasServiceKey())return fail('Receipt service is unavailable.',503);
 const body=await req.json().catch(()=>null); const r=body?.receipt;
 if(!uuid(body?.requestId)||!r||typeof r!=='object'||!Array.isArray(body.allocations)||body.allocations.length>100)return fail('Invalid receipt request.',400);
 const name=typeof r.name==='string'?r.name.trim():''; const clientId=typeof r.clientId==='string'?r.clientId:'';
 const currency=typeof r.currency==='string'?r.currency.trim().toUpperCase():'';
 const method=typeof r.method==='string'?r.method:''; const paymentDate=typeof r.paymentDate==='string'?r.paymentDate:'';
 if(!name||name.length>200||!clientId||!/^[A-Z]{3}$/.test(currency)||!['Bank transfer','RTGS','Mobile money','Cash','Cheque','Card','Offset'].includes(method)||!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||typeof r.amount!=='string')return fail('Enter receipt name, client, date, currency, method and amount.',400);
 const d=new Date(`${paymentDate}T00:00:00Z`);if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==paymentDate)return fail('Enter a valid receipt date.',400);
 try {if(cents(r.amount)<=0n||cents(r.amount)>BigInt(Number.MAX_SAFE_INTEGER))return fail('Amount is out of range.',400);}catch{return fail('Enter a valid amount with at most two decimal places.',400);}
 const scope=await buildScope(a); if(!await getRecord(a.orgId,'clients',clientId,scope))return fail('Client not found or not accessible.',403);
 const projectId=typeof r.projectId==='string'?r.projectId:''; if(projectId&&!await getRecord(a.orgId,'projects',projectId,scope))return fail('Project not found or not accessible.',403);
 const seen=new Set<string>();const lines:{invoiceId:string;amountMinor:number}[]=[];
 for(const x of body.allocations){
  if(!x||typeof x.invoiceId!=='string'||!x.invoiceId||seen.has(x.invoiceId)||typeof x.amount!=='string')return fail('Invalid or duplicate invoice.',400);
  seen.add(x.invoiceId); let n:bigint;try{n=cents(x.amount);}catch{return fail('Enter valid allocation amounts.',400);}
  if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))return fail('Allocation amount is out of range.',400);
  if(!await getRecord(a.orgId,'arInvoices',x.invoiceId,scope))return fail('Invoice not found or not accessible.',403);
  lines.push({invoiceId:x.invoiceId,amountMinor:Number(n)});
 }
 const payload={name,clientId,currency,method,paymentDate,amount:r.amount,projectId,reference:typeof r.reference==='string'?r.reference.trim().slice(0,200):''};
 const {data,error}=await supabaseAdmin().rpc('draft_create_receipt',{p_org:a.orgId,p_actor:a.userId,p_request:body.requestId,p_receipt:payload,p_lines:lines});
 if(error)return fail('Receipt could not be confirmed. Retry the same request before changing any details.',409);
 return NextResponse.json({ok:true,result:data});
}
