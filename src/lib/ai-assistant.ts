import {canCapability,canRead,canWrite} from './catalog';
import {resourceFullyEnabled} from './module-visibility';
import {canUseQuotationAI} from './ai-quotation';
export const AI_MODES={
  quotation:{label:'Quotation',resource:'estimates',hint:'Prepare a proposed work breakdown and finish in the quotation editor.'},
  'project-plan':{label:'Project plan',resource:'projects',hint:'Describe the job, constraints and milestones. Get a proposed plan and task checklist.'},
  'site-report':{label:'Work report',resource:'dailyLogs',hint:'Add site, workshop or service notes: date, completed work, delays, deliveries and next steps.'},
  'customer-message':{label:'Customer message',resource:'clients',hint:'Describe the purpose, confirmed facts and preferred tone. Omit private contact details.'},
} as const;
export type AIMode=keyof typeof AI_MODES;
export type WritingMode=Exclude<AIMode,'quotation'>;
export function isAIMode(v:unknown):v is AIMode{return typeof v==='string'&&Object.hasOwn(AI_MODES,v);}
export function canUseAIMode(role:string,config:{modules?:string[];resources:string[]},mode:AIMode){
  if(mode==='quotation')return canUseQuotationAI(role,config);
  const resource=AI_MODES[mode].resource;
  return resourceFullyEnabled(config,resource)&&canRead(role,resource)&&canWrite(role,resource)&&canCapability(role,'records.create');
}
export function availableAIModes(role:string,config:{modules?:string[];resources:string[]}){return (Object.keys(AI_MODES) as AIMode[]).filter(mode=>canUseAIMode(role,config,mode));}
export type WritingDraft={title:string;body:string;questions:string[];assumptions:string[];tasks?:{name:string}[]};
export function parseWritingDraft(raw:unknown,includeTasks=false):WritingDraft{
  if(!raw||typeof raw!=='object')throw new Error('AI returned an invalid draft. Please try again.');
  const r=raw as Record<string,unknown>;
  const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
  if(!text(r.title,150)||!text(r.body,12000))throw new Error('AI returned an incomplete draft. Please try again.');
  const list=(v:unknown)=>Array.isArray(v)?v.slice(0,8).map(x=>text(x,300)).filter(Boolean):[];
  const tasks=includeTasks&&Array.isArray(r.tasks)?r.tasks.slice(0,20).filter((v:any)=>v&&typeof v.name==='string'&&v.name.trim()).map((v:any)=>({name:text(v.name,200)})):[];
  return {...(includeTasks?{tasks}:{}),title:text(r.title,150),body:text(r.body,12000),questions:list(r.questions),assumptions:list(r.assumptions)};
}
