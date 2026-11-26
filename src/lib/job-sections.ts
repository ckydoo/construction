import {canRead} from './catalog';
import {resourceFullyEnabled,type ConfigLike} from './module-visibility';
export const JOB_SECTIONS=[
  {id:'overview',label:'Overview',resources:[]},
  {id:'work',label:'Work & budget',resources:['tasks','budgets','changeOrders']},
  {id:'documents',label:'Documents',resources:['documents']},
  {id:'approvals',label:'Approvals & inspections',resources:['permits','inspections','punchLists','rfis','submittals']},
  {id:'money',label:'Money',resources:['arInvoices','paymentApps','apBills','expenses','purchaseOrders','contracts']},
  {id:'site',label:'Work reports',resources:['dailyLogs','meetings','incidents','toolboxTalks']},
  {id:'team',label:'People & equipment',resources:['timesheets','crews','equipment']},
  {id:'record',label:'Job details',resources:[]},
];
export const jobResourceVisible=(config:ConfigLike,role:string,resource:string)=>resourceFullyEnabled(config,resource)&&canRead(role,resource);
export function visibleJobSections(config:ConfigLike,role:string){return JOB_SECTIONS.filter(s=>!s.resources.length||s.resources.some(r=>jobResourceVisible(config,role,r)));}
