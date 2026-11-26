import {canRead,canWrite,canCapability,ROLE_RULES} from './catalog';
import {resourceFullyEnabled,type ConfigLike} from './module-visibility';
import type {ConversionRule} from './conversions';
export function visibleConversionResource(config:ConfigLike,role:string,resource:string){
  return Object.hasOwn(ROLE_RULES,role)&&resourceFullyEnabled(config,resource)&&canRead(role,resource);
}
/** A disabled contract module must not prevent awarding a job. Permission
 * denial is NOT treated as a disabled module: never silently skip that check. */
export function workspaceConversionRule(rule:ConversionRule,config:ConfigLike):ConversionRule{
  if(['quote-to-job','tender-to-job'].includes(rule.id)&&!resourceFullyEnabled(config,'contracts')){
    return {...rule,also:(rule.also||[]).filter(s=>s.resource!=='contracts'),label:'Award as job',hint:'Creates a linked job using these details. No contract is created.'};
  }
  return rule;
}
export function conversionBlockReason(role:string,rule:ConversionRule,billing?:{access?:boolean;writable?:boolean},temporaryPassword=false):string|null{
  if(temporaryPassword)return 'Change your temporary password before creating records.';
  if(billing&&(!billing.access||!billing.writable))return 'This workspace is read-only. Check your subscription to create records.';
  if(!canCapability(role,'records.create'))return 'Your role cannot create records.';
  if(![rule.to,...(rule.also||[]).map(s=>s.resource)].every(r=>canWrite(role,r)))return 'Your role cannot create all records required by this step.';
  if(rule.sourcePatch&&!canWrite(role,rule.from))return 'Your role cannot update the source record required by this step.';
  return null;
}
