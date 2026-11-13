/* Work-in-progress. This endpoint is not deployed until the associated
 * transaction functions, permissions and integration tests are complete. */
import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { billingGuard, capabilityGuard, readGuard, writeGuard } from '@/lib/guard';
import { billingMode } from '@/lib/billing';
import { buildScope } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { hasServiceKey, supabaseAdmin } from '@/lib/supabase';
import { cents } from '@/lib/receipt-allocation';

type Ctx = { params: Promise<{org:string;id:string}> };
const uuid = (x:unknown) => typeof x==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fail = (error:string,status:number) => NextResponse.json({error},{status});

export async function GET(_req:Request,{params}:Ctx) {
  const {org,id}=await params; const a=await apiAuth(org);
  if(!a)return fail('Unauthorized',401);
  const g=billingGuard(a)||readGuard(a.config,a.role,'payments')||readGuard(a.config,a.role,'arInvoices');if(g)return g;
  if(!hasServiceKey())return fail('Receipt allocation is unavailable.',503);
  const scope=await buildScope(a);const receipt=await getRecord(a.orgId,'payments',id,scope);
  if(!receipt)return fail('Receipt not found.',404);
  const admin=supabaseAdmin();
  const {data:batches,error}=await admin.from('receipt_allocation_batches').select('id,created_at,reversed_at').eq('organization_id',a.orgId).eq('receipt_id',id).order('created_at');
  if(error)return fail('Receipt allocation is unavailable.',503);
  const ids=(batches||[]).map(x=>x.id);
  if(!ids.length)return NextResponse.json({allocations:[],allocatedMinor:0});
  const {data:lines,error:lineError}=await admin.from('receipt_allocation_lines').select('batch_id,invoice_id,amount_minor').eq('organization_id',a.orgId).in('batch_id',ids);
  if(lineError)return fail('Receipt allocation is unavailable.',503);
  const invoiceIds=Array.from(new Set((lines||[]).map(x=>String(x.invoice_id))));
  const invoices=new Map<string,any>();
  for(const invoiceId of invoiceIds){const invoice=await getRecord(a.orgId,'arInvoices',invoiceId,scope);if(!invoice)return fail('One or more allocated invoices are not accessible.',403);invoices.set(invoiceId,invoice);}
  const batchMap=new Map((batches||[]).map(b=>[b.id,b]));
  const allocations=(lines||[]).map(l=>({invoiceId:l.invoice_id,invoiceNumber:invoices.get(l.invoice_id)?.number||'',invoiceTitle:invoices.get(l.invoice_id)?.title||'',amountMinor:l.amount_minor,reversedAt:batchMap.get(l.batch_id)?.reversed_at||null}));
  return NextResponse.json({allocations,allocatedMinor:allocations.filter(x=>!x.reversedAt).reduce((n,x)=>n+Number(x.amountMinor),0)},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(req:Request,{params}:Ctx) {
  const {org,id} = await params;
  const a = await apiAuth(org);
  if (!a) return fail('Unauthorized',401);
  const mode = billingMode();
  if (mode === 'misconfigured') return fail('Billing is misconfigured. Workspace changes are paused until it is fixed.',503);
  const guard = billingGuard(a,{write:true}) || writeGuard(a.config,a.role,'payments') || writeGuard(a.config,a.role,'arInvoices') || capabilityGuard(a.role,'records.update');
  if (guard) return guard;
  if (!hasServiceKey()) return fail('Receipt allocation is unavailable.',503);
  const body = await req.json().catch(()=>null);
  if (!body || !uuid(body.requestId) || !['allocate','reverse'].includes(body.action)) return fail('Invalid request.',400);
  const scope = await buildScope(a);
  const receipt = await getRecord(a.orgId,'payments',id,scope);
  if (!receipt) return fail('Receipt not found.',404);
  const admin = supabaseAdmin();
  if (body.action==='reverse') {
    // Reversal touches every allocated invoice. Check visibility for each one
    // before invoking the service-only function, not only the receipt.
    const {data:batches,error:bErr} = await admin.from('receipt_allocation_batches').select('id').eq('organization_id',a.orgId).eq('receipt_id',id).is('reversed_at',null);
    if (bErr) return fail('Allocation service is unavailable.',503);
    const ids = (batches||[]).map(x=>x.id);
    if (ids.length) {
      const {data:lines,error:lErr} = await admin.from('receipt_allocation_lines').select('invoice_id').eq('organization_id',a.orgId).in('batch_id',ids);
      if (lErr) return fail('Allocation service is unavailable.',503);
      for (const invoiceId of new Set((lines||[]).map(x=>String(x.invoice_id)))) {
        if (!await getRecord(a.orgId,'arInvoices',invoiceId,scope)) return fail('Invoice not found or not accessible.',403);
      }
    }
    const {data,error} = await admin.rpc('draft_reverse_receipt_v2',{p_org:a.orgId,p_receipt:id,p_request:body.requestId,p_actor:a.userId,p_billing_enabled:mode==='qa'||mode==='live'});
    if (error) return fail('Reversal could not be confirmed. Retry the same request.',409);
    return NextResponse.json({ok:true,result:data});
  }
  if (!Array.isArray(body.allocations) || body.allocations.length<1 || body.allocations.length>100) return fail('Add at least one invoice allocation.',400);
  const lines:{invoiceId:string;amountMinor:number}[]=[];
  const seen=new Set<string>();
  for (const line of body.allocations) {
    if (!line || typeof line.invoiceId!=='string' || !line.invoiceId || seen.has(line.invoiceId) || typeof line.amount!=='string') return fail('Invalid or duplicate invoice.',400);
    seen.add(line.invoiceId);
    let amount:bigint;
    try { amount=cents(line.amount); } catch { return fail('Enter a valid amount with at most two decimal places.',400); }
    if (amount<=0n || amount>BigInt(Number.MAX_SAFE_INTEGER)) return fail('Allocation amount must be positive and within the supported limit.',400);
    if (!await getRecord(a.orgId,'arInvoices',line.invoiceId,scope)) return fail('Invoice not found or not accessible.',403);
    lines.push({invoiceId:line.invoiceId,amountMinor:Number(amount)});
  }
  const {data,error} = await admin.rpc('draft_allocate_receipt_v2',{p_org:a.orgId,p_receipt:id,p_request:body.requestId,p_actor:a.userId,p_lines:lines,p_billing_enabled:mode==='qa'||mode==='live'});
  if (error) return fail('Allocation could not be confirmed. Retry the same request before changing details.',409);
  return NextResponse.json({ok:true,result:data});
}
