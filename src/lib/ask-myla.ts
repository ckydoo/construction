import {canRead,ROLE_RULES} from './catalog';
import {resourceFullyEnabled,type ConfigLike} from './module-visibility';
export const MYLA_RESOURCES=['estimates','arInvoices','projects','tasks'] as const;
export type MylaResource=typeof MYLA_RESOURCES[number];
export const MYLA_LABELS:Record<MylaResource,string>={estimates:'Quotations',arInvoices:'Invoices',projects:'Jobs',tasks:'Tasks'};
export function mylaResources(role:string,config:ConfigLike):MylaResource[]{
  return Object.hasOwn(ROLE_RULES,role)?MYLA_RESOURCES.filter(r=>resourceFullyEnabled(config,r)&&canRead(role,r)):[];
}
export type MylaPlan={resource:MylaResource|null;filter:'recent'|'search'|'overdue'|'unpaid'|'awaiting';query:string};
// Exact built-in prompts only: never silently drop extra user constraints.
export function builtInMylaPlan(question:string):MylaPlan|null{
  const key=question.trim().toLowerCase().replace(/[?!.]+$/, '').trim();
  const plans:Record<string,MylaPlan>={
    'which invoices are overdue':{resource:'arInvoices',filter:'overdue',query:''},
    'show overdue tasks':{resource:'tasks',filter:'overdue',query:''},
    'which quotations are awaiting a decision':{resource:'estimates',filter:'awaiting',query:''},
    'show my recent jobs':{resource:'projects',filter:'recent',query:''},
  };
  return Object.hasOwn(plans,key)?{...plans[key]}:null;
}
export function mylaServiceFailure(status:number,body?:unknown){
  const detail=body&&typeof body==='object'&&typeof (body as any).error==='string'?(body as any).error:'';
  let code='MYLA_SERVICE';
  let message='Myla’s AI service could not complete this request.';
  if(status===429){code='MYLA_LIMIT';message='The workspace AI limit has been reached.';}
  else if(status===401||status===403){code='MYLA_CONNECTION';message='Myla’s secure connection needs administrator attention.';}
  else if(status===404){code='MYLA_ENDPOINT';message='Myla’s AI backend could not be reached.';}
  else if(status===400){code='MYLA_REQUEST';message='Myla’s backend rejected the request format.';}
  else if(status===503){code='MYLA_SETUP';message='Myla’s AI service is not ready.';}
  // Only fixed labels leave the server; never echo arbitrary backend content.
  if(detail==='Invalid workspace')code='MYLA_WORKSPACE';
  else if(detail.startsWith('AI usage controls are not ready.'))code='MYLA_USAGE_SETUP';
  else if(detail.startsWith('AI is not configured yet. Ask your administrator to add OPENROUTER_API_KEY'))code='MYLA_KEY_SETUP';
  else if(detail.startsWith('AI is configured for free models only.'))code='MYLA_MODEL_SETUP';
  else if(detail.startsWith('AI provider is unavailable.'))code='MYLA_GENERATION';
  else if(detail.startsWith('AI returned an incomplete response.'))code='MYLA_INCOMPLETE';
  return {code,error:`${message} Support code: ${code}. Nothing was saved or sent.`};
}
export function parseMylaPlan(raw:unknown):MylaPlan{
  if(!raw||typeof raw!=='object')throw new Error('Please ask about quotations, invoices, jobs or tasks.');
  const p=raw as Record<string,unknown>;
  if(p.resource===null)return {resource:null,filter:'recent',query:''};
  if(!MYLA_RESOURCES.includes(p.resource as MylaResource)||!['recent','search','overdue','unpaid','awaiting'].includes(String(p.filter)))throw new Error('Please ask about quotations, invoices, jobs or tasks.');
  const resource=p.resource as MylaResource,filter=p.filter as MylaPlan['filter'];
  if(filter==='unpaid'&&resource!=='arInvoices'||filter==='awaiting'&&resource!=='estimates'||filter==='overdue'&&!['arInvoices','tasks'].includes(resource))throw new Error('Try asking for overdue invoices or tasks, unpaid invoices, or quotations awaiting a decision.');
  const query=typeof p.query==='string'?p.query.replace(/[,()%*\\'"\r\n]/g,' ').replace(/\s+/g,' ').trim().slice(0,80):'';
  if(filter==='search'&&query.length<2)throw new Error('Include a record number or a few words from its name.');
  return {resource,filter,query};
}
export function matchesMylaPlan(row:Record<string,any>,plan:MylaPlan,today:string){
  if(plan.filter==='overdue'){
    const date=plan.resource==='tasks'?row.plannedEnd:row.dueDate;
    const eligible=plan.resource==='tasks'?['NOT_STARTED','IN_PROGRESS','ON_HOLD'].includes(row.status):['ISSUED','PARTIALLY_PAID','OVERDUE'].includes(row.status);
    return eligible&&typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date<today;
  }
  if(plan.filter==='unpaid')return ['ISSUED','PARTIALLY_PAID','OVERDUE'].includes(row.status);
  if(plan.filter==='awaiting')return ['SUBMITTED','INTERNAL_REVIEW'].includes(row.status);
  return true;
}
export function mylaRecordLink(org:string,resource:MylaResource,id:string){
  return resource==='projects'?`/${encodeURIComponent(org)}/projects/${encodeURIComponent(id)}`:`/${encodeURIComponent(org)}/m/${resource}?open=${encodeURIComponent(id)}`;
}
export type MylaAnswer={answer:string;note?:string;checkedAt:string;records:{id:string;title:string;number:string;status:string;href:string;date?:string}[];register?:{label:string;href:string}};
