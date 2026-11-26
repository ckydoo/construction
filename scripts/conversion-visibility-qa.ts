import assert from 'node:assert/strict';
import {CHAIN_STAGES} from '../src/lib/conversion-chain';
import {CONVERSION_RULES,buildContext} from '../src/lib/conversions';
import {visibleConversionResource,workspaceConversionRule,conversionBlockReason} from '../src/lib/conversion-visibility';
const lean={modules:['estimating','projects'],resources:['estimates','projects']};
assert.deepEqual(CHAIN_STAGES.filter(s=>visibleConversionResource(lean,'OWNER',s.id)).map(s=>s.id),['estimates','projects']);
assert.equal(visibleConversionResource({...lean,modules:[]},'OWNER','projects'),false);
assert.equal(visibleConversionResource({...lean,resources:[]},'OWNER','projects'),false);
assert.equal(visibleConversionResource(lean,'unknown','projects'),false);
for(const id of ['quote-to-job','tender-to-job']){
 const base=CONVERSION_RULES.find(r=>r.id===id)!;
 const rule=workspaceConversionRule(base,lean);
 assert.equal(rule.label,'Award as job');assert.equal(rule.also?.length,0);
 assert.equal(base.also?.length,1); // no mutation of global rules
 assert.equal(rule.sourcePatch,base.sourcePatch);
 assert.deepEqual(rule.build({name:'Job',total:100,items:[]},buildContext()),base.build({name:'Job',total:100,items:[]},buildContext()));
 const full={modules:[...lean.modules,'contracts'],resources:[...lean.resources,'contracts']};
 assert.equal(workspaceConversionRule(base,full),base);
 assert.equal(workspaceConversionRule(base,{...full,resources:lean.resources}).also?.length,0);
 assert.equal(workspaceConversionRule(base,{...full,modules:lean.modules}).also?.length,0);
 assert.equal(conversionBlockReason('OWNER',rule),null);
 assert.match(conversionBlockReason('VIEWER',rule)!,/cannot create/);
 assert.match(conversionBlockReason('OWNER',rule,{access:true,writable:false})!,/read-only/);
 assert.match(conversionBlockReason('OWNER',rule,undefined,true)!,/temporary password/);
}
for(const rule of CONVERSION_RULES.filter(r=>!['quote-to-job','tender-to-job'].includes(r.id)))assert.equal(workspaceConversionRule(rule,lean),rule);
assert.equal(CHAIN_STAGES.find(s=>s.id==='estimates')?.short,'Quotation');
console.log('Conversion visibility QA passed: enabled module/resource intersection, role visibility, job-only awards, unchanged full workflow, no rule mutation and write blockers.');
