import {canRead,canWrite,canCapability} from './catalog';
import {resourceFullyEnabled,type ConfigLike} from './module-visibility';
export function canReviewJobBudget(role:string,config:ConfigLike){return ['projects','budgets'].every(r=>resourceFullyEnabled(config,r)&&canRead(role,r))&&canWrite(role,'budgets')&&canCapability(role,'records.create');}
export function reviewedBudgetAmount(value:unknown){
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e12||Math.abs(value*100-Math.round(value*100))>0.0001)throw new Error('Enter a positive cost budget with at most two decimal places.');
  return Math.round(value*100)/100;
}
export function proposedJobBudget(project:Record<string,any>):number|null{
  const amount=project.proposedEstimateCost;
  return typeof amount==='number'&&Number.isFinite(amount)&&amount>=0?amount:null;
}
