import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name:string)=>readFileSync(`src/components/${name}.tsx`,'utf8');
for(const name of ['AIAssistant','QuotationAssistant','AIPlanTasks','AIHelp','QuoteStudio']){
  assert.doesNotMatch(read(name),/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/,`${name}: no blocking browser dialogs`);
}
const assistant=read('AIAssistant'),quotation=read('QuotationAssistant'),help=read('AIHelp'),tasks=read('AIPlanTasks');
assert.match(assistant,/if\(dirty\)setPending\(m\)/);
assert.match(assistant,/Keep working/);assert.match(assistant,/Discard and switch/);
assert.match(assistant,/onDirtyChange=\{setDirty\}/);
assert.match(assistant,/role="region" aria-label="Confirm task change"/);
for(const source of [assistant,quotation]){
 assert.doesNotMatch(source,/checked=\{consent\}|!consent|setConsent/);assert.match(source,/consent:true/);
 assert.match(source,/checked=\{reviewed\}/);assert.match(source,/!reviewed/);
 assert.match(source,/Generate draft/);assert.match(source,/role="status"/);
 assert.match(source,/onDirtyChange/);
}
assert.doesNotMatch(quotation,/Company rates|templateId|ai-templates|quote-templates/);
assert.ok(quotation.indexOf('result.draft.items.map')<quotation.indexOf('result.questions.map'));
assert.match(quotation,/result.warnings.map/); // Critical pricing warnings stay visible.
assert.match(help,/<details/);assert.match(help,/About Myla & privacy/);
assert.match(help,/By using Myla, you agree/);assert.match(help,/external AI service/);
for(const name of ['AskMyla','AIAssistant','QuotationAssistant','AIHelp'])assert.doesNotMatch(read(name),/OpenRouter|model provider|checked=\{consent\}/);
assert.match(read('AskMyla'),/consent:true/);
assert.match(assistant,/min-h-11/);
assert.match(tasks,/approved:true/);assert.match(tasks,/!approved/);
assert.match(tasks,/Do not regenerate the plan to retry/);
console.log('AI UX source regression checks passed: no browser dialogs, inline switch controls, draft-first quotation review, concise help and use-based notice and retained draft approval gates. Interactive browser acceptance still required.');
