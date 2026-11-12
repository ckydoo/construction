'use client';
import { useState,useRef,useEffect } from 'react';
import { cents,decimal } from '@/lib/receipt-allocation';
import { useQueryClient } from '@tanstack/react-query';
import { Button,Drawer,Field } from './ui';
import SearchSelect from './SearchSelect';
import { apiSend,orgApi } from '@/lib/client';
import { useToast } from './Providers';
import { userMessage } from '@/lib/user-message';
import { CURRENCY_CODES } from '@/lib/currency';
import { receiptRequestKey,clearReceiptRequest } from '@/lib/receipt-request';

type Line={key:string;invoiceId:string;amount:string};
export default function ReceiptAllocationForm({org,open,onClose,initialInvoice}:{org:string;open:boolean;onClose:()=>void;initialInvoice?:any}){
 const qc=useQueryClient(),toast=useToast();
 const [r,setR]=useState({name:'',clientId:'',projectId:'',paymentDate:'',amount:'',currency:'',method:'',reference:''});
 const [lines,setLines]=useState<Line[]>([]);const [busy,setBusy]=useState(false);
 const requestId=useRef<string|null>(null);const inFlight=useRef(false);
 useEffect(()=>{
  if(!open||!initialInvoice?.id)return;
  let remaining='';try{const balance=cents(String(initialInvoice.total))-cents(String(initialInvoice.amountPaid||0));if(balance>0n)remaining=decimal(balance);}catch{}
  setR(v=>({...v,name:`Receipt for ${initialInvoice.number||'invoice'}`,clientId:String(initialInvoice.clientId||''),projectId:String(initialInvoice.projectId||''),currency:String(initialInvoice.currency||''),amount:remaining}));
  setLines([{key:'invoice-source',invoiceId:String(initialInvoice.id),amount:remaining}]);requestId.current=null;
 },[open,initialInvoice?.id]);

 const editReceipt=(key:string,value:string)=>{requestId.current=null;setR(v=>({...v,[key]:value}));};
 const editLine=(key:string,field:'invoiceId'|'amount',value:string)=>{requestId.current=null;setLines(v=>v.map(x=>x.key===key?{...x,[field]:value}:x));};
 const close=()=>{if(!busy)onClose();};
 async function submit(){
  if(inFlight.current)return;
  if(!r.name.trim()||!r.clientId||!r.paymentDate||!r.amount||!r.currency||!r.method||lines.some(l=>!l.invoiceId||!l.amount)){
   toast.push({tone:'error',title:'Complete the required receipt and allocation fields'});return;
  }
  inFlight.current=true;setBusy(true);
  try{
   const payload={receipt:r,allocations:lines.map(({invoiceId,amount})=>({invoiceId,amount}))};
   const key=await receiptRequestKey(org,'create',payload,requestId.current);requestId.current=key.requestId;
   const result:any=await apiSend(orgApi(org,'receipts'),'POST',{requestId:key.requestId,...payload});
   await qc.invalidateQueries({queryKey:['records',org]});
   await qc.invalidateQueries({queryKey:['profitability',org]});
   clearReceiptRequest(key.storageKey);
   toast.push({tone:'success',title:'Receipt recorded',description:result.result?.number||'Receipt and allocations saved.'});
   requestId.current=null;setR({name:'',clientId:'',projectId:'',paymentDate:'',amount:'',currency:'',method:'',reference:''});setLines([]);onClose();
  }catch(e:any){toast.push({tone:'error',title:'Could not record receipt',description:userMessage(e,'No confirmation received. Retry without changing the fields to safely use the same request key.')});}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <Drawer open={open} onClose={close} title="Record and allocate receipt" subtitle="Records a receipt; it does not transfer money. Unallocated amounts remain customer credit." footer={<div className="flex justify-end gap-2"><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Record receipt</Button></div>}>
  <div className="grid gap-4 p-4 sm:grid-cols-2">
   <Field label="Receipt description" required><input className="input" value={r.name} onChange={e=>editReceipt('name',e.target.value)}/></Field>
   <Field label="Client" required><SearchSelect org={org} resource="clients" value={r.clientId} onChange={v=>editReceipt('clientId',v)} label="Client"/></Field>
   <Field label="Job / project (optional)"><SearchSelect org={org} resource="projects" value={r.projectId} onChange={v=>editReceipt('projectId',v)} label="Job / project"/></Field>
   <Field label="Receipt date" required><input type="date" className="input" value={r.paymentDate} onChange={e=>editReceipt('paymentDate',e.target.value)}/></Field>
   <Field label="Amount received" required><input type="text" inputMode="decimal" className="input" value={r.amount} onChange={e=>editReceipt('amount',e.target.value)} placeholder="0.00"/></Field>
   <Field label="Currency" required><select className="select" value={r.currency} onChange={e=>editReceipt('currency',e.target.value)}><option value="">Select currency</option>{CURRENCY_CODES.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
   <Field label="Method" required><select className="select" value={r.method} onChange={e=>editReceipt('method',e.target.value)}><option value="">Select method</option>{['Bank transfer','RTGS','Mobile money','Cash','Cheque','Card','Offset'].map(m=><option key={m}>{m}</option>)}</select></Field>
   <Field label="Reference"><input className="input" value={r.reference} onChange={e=>editReceipt('reference',e.target.value)}/></Field>
   <section className="space-y-3 sm:col-span-2"><h3 className="text-sm font-semibold">Invoice allocations</h3><p className="caption">Add invoice amounts, or leave empty to keep the receipt unallocated.</p>
    {lines.map((l,i)=><div className="grid gap-2 rounded border divider p-3 sm:grid-cols-2" key={l.key}><Field label={`Invoice ${i+1}`} required><SearchSelect org={org} resource="arInvoices" value={l.invoiceId} onChange={v=>editLine(l.key,'invoiceId',v)} label={`Invoice ${i+1}`}/></Field><Field label="Allocation amount" required><input className="input" type="text" inputMode="decimal" value={l.amount} onChange={e=>editLine(l.key,'amount',e.target.value)}/></Field><button type="button" className="text-left text-xs text-red-600" onClick={()=>{requestId.current=null;setLines(v=>v.filter(x=>x.key!==l.key));}}>Remove allocation</button></div>)}
    <Button size="sm" icon="Plus" onClick={()=>{requestId.current=null;setLines(v=>[...v,{key:crypto.randomUUID(),invoiceId:'',amount:''}]);}}>Add invoice</Button>
   </section>
  </div>
 </Drawer>;
}
