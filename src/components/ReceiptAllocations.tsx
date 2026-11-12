'use client';
import { useRef,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { apiGet,apiSend,orgApi } from '@/lib/client';
import { cents,decimal } from '@/lib/receipt-allocation';
import { userMessage } from '@/lib/user-message';
import { Button,Field } from './ui';
import SearchSelect from './SearchSelect';
import { useToast } from './Providers';
import { receiptRequestKey,clearReceiptRequest } from '@/lib/receipt-request';

type Allocation={invoiceId:string;invoiceNumber:string;invoiceTitle:string;amountMinor:number;reversedAt:string|null};
type Data={allocations:Allocation[];allocatedMinor:number};
export default function ReceiptAllocations({org,row,canEdit}:{org:string;row:any;canEdit:boolean}){
 const qc=useQueryClient(),toast=useToast();const [invoice,setInvoice]=useState(''),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false);
 const requestId=useRef<string|null>(null),reverseId=useRef<string|null>(null),inFlight=useRef(false);
 const endpoint=orgApi(org,`receipts/${encodeURIComponent(row.id)}/allocations`);
 const {data,isLoading,isError}=useQuery<Data>({queryKey:['receipt-allocations',org,row.id],queryFn:()=>apiGet(endpoint)});
 async function refresh(){await Promise.all([qc.invalidateQueries({queryKey:['receipt-allocations',org,row.id]}),qc.invalidateQueries({queryKey:['records',org]}),qc.invalidateQueries({queryKey:['record',org]}),qc.invalidateQueries({queryKey:['profitability',org]})]);}
 async function allocate(){
  if(inFlight.current)return;
  if(!invoice||!amount){toast.push({tone:'error',title:'Select an invoice and amount'});return;}
  inFlight.current=true;setBusy(true);
  try{const payload={action:'allocate',allocations:[{invoiceId:invoice,amount}]};const key=await receiptRequestKey(org,`allocate:${row.id}`,payload,requestId.current);requestId.current=key.requestId;await apiSend(endpoint,'POST',{...payload,requestId:key.requestId});await refresh();clearReceiptRequest(key.storageKey);requestId.current=null;setInvoice('');setAmount('');toast.push({tone:'success',title:'Receipt allocated'});}
  catch(e:any){toast.push({tone:'error',title:'Allocation not confirmed',description:userMessage(e,'Retry without changing the fields to use the same request key.')});}finally{inFlight.current=false;setBusy(false);}
 }
 async function reverse(){
  if(inFlight.current)return;
  if(!window.confirm('Reverse this receipt and all its invoice allocations? This records a reversal; it does not transfer money.'))return;
  inFlight.current=true;setBusy(true);
  try{const key=await receiptRequestKey(org,`reverse:${row.id}`,{action:'reverse'},reverseId.current);reverseId.current=key.requestId;await apiSend(endpoint,'POST',{action:'reverse',requestId:key.requestId});await refresh();clearReceiptRequest(key.storageKey);reverseId.current=null;toast.push({tone:'success',title:'Receipt reversed'});}
  catch(e:any){toast.push({tone:'error',title:'Reversal not confirmed',description:userMessage(e,'Retry the same reversal to avoid duplicates.')});}finally{inFlight.current=false;setBusy(false);}
 }
 let remaining='—';try{const remainingMinor=cents(String(row.amount))-BigInt(data?.allocatedMinor||0);if(remainingMinor>=0n)remaining=decimal(remainingMinor);}catch{}
 const active=['CLEARED','RECONCILED'].includes(String(row.status||''));
 return <section className="space-y-3 border-t divider px-4 py-4"><h3 className="text-sm font-semibold">Invoice allocations</h3>
 {isLoading?<p className="caption">Loading allocations…</p>:isError?<p className="caption text-red-600">Allocations unavailable or you do not have permission to view them.</p>:<>
  <p className="caption">Unallocated receipt amount: {remaining} {row.currency||''}. A receipt is not a bank transfer.</p>
  {data?.allocations.map((a,i)=><div key={`${a.invoiceId}-${i}`} className="rounded border divider p-2 text-xs">{a.invoiceNumber||a.invoiceTitle||a.invoiceId} · {decimal(BigInt(a.amountMinor))} {row.currency||''} {a.reversedAt?'· Reversed':''}</div>)}
  {!data?.allocations.length&&<p className="caption">No invoice allocations.</p>}
  {canEdit&&active&&<><div className="grid gap-3 sm:grid-cols-2"><Field label="Invoice"><SearchSelect org={org} resource="arInvoices" label="Invoice to allocate" value={invoice} onChange={v=>{requestId.current=null;setInvoice(v);}}/></Field><Field label="Allocation amount"><input className="input" type="text" inputMode="decimal" value={amount} onChange={e=>{requestId.current=null;setAmount(e.target.value);}}/></Field></div>
   <div className="flex flex-wrap gap-2"><Button onClick={allocate} loading={busy}>Allocate receipt</Button><Button variant="outline" onClick={reverse} disabled={busy}>Reverse receipt</Button></div></>}
 </>}
 </section>;
}
