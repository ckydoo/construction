import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {COMPANY_TYPES,COMPANY_SIZES,resolveWorkspace} from '../src/lib/catalog';
import {PROJECT_TYPES,RESOURCE_MAP,RESOURCES} from '../src/lib/resources';
import {quoteDraftFromRow,sanitiseTemplatePayload,toRecordPayload} from '../src/lib/quote-studio';
import {CONVERSION_RULES,buildContext} from '../src/lib/conversions';
import {workspaceConversionRule,visibleConversionResource} from '../src/lib/conversion-visibility';
import {visibleFields} from '../src/lib/module-visibility';
import {validateFields} from '../src/lib/field-validation';
import {AI_MODES} from '../src/lib/ai-assistant';
// Compare to the pre-change committed definitions: no migration, new required
// fields, new resources or new onboarding modules in this simplification pass.
const previous=execFileSync('git',['show','12abc8d:src/lib/resources.ts'],{encoding:'utf8'});
const oldTypes=previous.match(/export const PROJECT_TYPES = (\[[^;]+\]);/)![1].match(/'([^']+)'/g)!.map(s=>s.slice(1,-1));
assert.deepEqual(PROJECT_TYPES.slice(0,oldTypes.length),oldTypes);
assert.equal(RESOURCES.length,(previous.match(/\bd\('/g)||[]).length);
for(const companyType of COMPANY_TYPES.map(t=>t.id))for(const size of COMPANY_SIZES.map(s=>s.id)){
 const config=resolveWorkspace({companyType,size,setup:'essentials',minimal:true});
 assert.deepEqual(config.resources,['clients','contacts','estimates','projects','tasks','arInvoices','payments']);
 assert.ok(!config.modules.includes('contracts'));assert.ok(!config.modules.includes('billing'));
}
const lean=resolveWorkspace({companyType:'SPECIALTY_TRADE',size:'MICRO',setup:'essentials',minimal:true});
const ctx=buildContext({enabled:false,rate:0});
// Journey 1: quotations -> job-only award -> draft invoice. Real receipt
// allocation remains a live acceptance test; these checks do not record money.
for(const workType of PROJECT_TYPES){
 const draft=quoteDraftFromRow({name:'Customer work',workType,items:[{description:'Work',qty:2,unitPrice:100,total:200}]});
 assert.equal(draft.workType,workType);assert.equal(sanitiseTemplatePayload(draft).workType,workType);
 const quote={...toRecordPayload(draft),id:'quote',clientId:'client',number:'EST-TEST',total:200};
 const rule=workspaceConversionRule(CONVERSION_RULES.find(r=>r.id==='quote-to-job')!,lean);
 assert.equal(rule.also?.length,0);
 const job=rule.build(quote,ctx);assert.equal(job.type,workType);
 assert.equal(validateFields(RESOURCE_MAP.projects,job).ok,true);
 const invoice=CONVERSION_RULES.find(r=>r.id==='job-to-invoice')!.build({...job,id:'job'},ctx);
 assert.equal(invoice.status,'DRAFT');assert.equal(invoice.amountPaid,0);assert.equal(invoice.projectId,'job');assert.equal(invoice.vatPct,0);
 assert.equal(validateFields(RESOURCE_MAP.arInvoices,invoice).ok,true);
}
// Disabled references do not appear on simple forms.
assert.ok(!visibleFields(RESOURCE_MAP.projects,lean).some(f=>f.key==='manager'));
assert.ok(!visibleConversionResource(lean,'OWNER','contracts'));
assert.ok(!visibleConversionResource(lean,'OWNER','paymentApps'));
// Journey 2: existing industrial asset and repair fields accept a simple service job.
assert.equal(validateFields(RESOURCE_MAP.equipment,{name:'Workshop compressor',category:'Compressor',status:'AVAILABLE'}).ok,true);
for(const status of ['OPEN','IN_PROGRESS','COMPLETE'])assert.equal(validateFields(RESOURCE_MAP.workOrders,{name:'Compressor service',equipmentId:'asset',type:'PREVENTIVE',status}).ok,true);
// Journey 3: larger teams can explicitly enable project/purchasing/reporting
// without affecting Essentials for equally large companies.
const team=resolveWorkspace({companyType:'INDUSTRIAL_EPC',size:'LARGE',setup:'team'});
for(const resource of ['projects','tasks','purchaseOrders','goodsReceipts','dailyLogs'])assert.ok(team.resources.includes(resource));
assert.equal(validateFields(RESOURCE_MAP.tasks,{name:'Inspect installation',projectId:'job',status:'NOT_STARTED',progress:0}).ok,true);
assert.equal(validateFields(RESOURCE_MAP.dailyLogs,{name:'Workshop progress',projectId:'job',date:'2026-11-18',workDone:'Assembly checked',status:'DRAFT'}).ok,true);
assert.equal(AI_MODES['site-report'].label,'Work report');
const edge=readFileSync('supabase/functions/ai-quotation/index.ts','utf8');
assert.match(edge,/construction and industrial/);assert.match(edge,/installation, maintenance, repairs and fabrication/);assert.match(edge,/never invent measurements/);assert.match(edge,/Never invent prices/);
assert.equal(RESOURCE_MAP.estimates.singular,'Quotation');
console.log('Industry-fit QA passed: all company-size Essentials combinations, old/new job types and template round trips, quotation/job/invoice mapping, maintenance records, team workflow definitions, disabled-module visibility and AI safety wording. No live writes performed.');
