import {canCapability,canRead,canWrite} from './catalog';
import {resourceFullyEnabled} from './module-visibility';
import {canUseAIMode} from './ai-assistant';
export function canCreateAITasks(role:string,config:{modules?:string[];resources:string[]}){
  return canUseAIMode(role,config,'project-plan')&&resourceFullyEnabled(config,'tasks')&&canRead(role,'tasks')&&canWrite(role,'tasks')&&canCapability(role,'records.create');
}
export type ReviewedTask={name:string;plannedStart:string;plannedEnd:string};
export function reviewedTask(raw:any):ReviewedTask{
  if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>200)throw new Error('Enter a task name of 1–200 characters.');
  const date=(v:unknown)=>{
    if(v===''||v==null)return '';
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new Error('Use valid task dates.');
    return v;
  };
  const plannedStart=date(raw.plannedStart),plannedEnd=date(raw.plannedEnd);
  if(plannedStart&&plannedEnd&&plannedEnd<plannedStart)throw new Error('Task finish must be on or after its start.');
  return {name:raw.name.trim(),plannedStart,plannedEnd};
}
