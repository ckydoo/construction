import assert from 'node:assert/strict';
import { RESOURCES, RESOURCE_MAP } from '../src/lib/resources';
import { splitFormFields } from '../src/lib/simple-forms';
import { visibleFields } from '../src/lib/module-visibility';

const config = { modules: [...new Set(RESOURCES.map(r=>r.module))], resources: RESOURCES.map(r=>r.id) };
for (const enabled of [false,true]) for (const def of RESOURCES) {
  const fields = visibleFields(def, {...config,tax:{enabled,rate:15}});
  const before = JSON.stringify(fields);
  const {main,more} = splitFormFields(def.id, fields);
  assert.deepEqual([...main,...more].map(f=>f.key).sort(), fields.filter(f=>!f.readOnly).map(f=>f.key).sort());
  assert.ok(more.every(f=>!f.required));
  assert.ok(fields.filter(f=>f.required&&!f.readOnly).every(f=>main.includes(f)));
  assert.equal(JSON.stringify(fields),before);
  assert.ok([...main,...more].every(f=>!f.hidden&&!f.readOnly));
  if(!enabled) assert.ok([...main,...more].every(f=>!/^(tax|vat)/i.test(f.key)));
}
const clients=splitFormFields('clients',RESOURCE_MAP.clients.fields);
assert.ok(clients.main.some(f=>f.key==='phone'));
assert.ok(clients.more.some(f=>f.key==='creditLimit'));
const invoice=splitFormFields('arInvoices',RESOURCE_MAP.arInvoices.fields);
for(const key of ['clientId','invoiceDate','dueDate','amount','total','items']) assert.ok(invoice.main.some(f=>f.key===key));
assert.equal(splitFormFields('unknown',RESOURCE_MAP.clients.fields).more.length,0);
console.log('Simple forms QA passed: no missing fields, required and invoice fields visible, tax and read-only rules retained.');

// Starting setups are independent of size, additive and still plan-limited.
import { resolveWorkspace, MODULES, COMPANY_SIZES, isWorkspaceSetup } from '../src/lib/catalog';
import { entitledModules, entitledResources } from '../src/lib/billing-plans';
for (const size of COMPANY_SIZES.map(s=>s.id)) {
  const input = { companyType:'GENERAL_CONTRACTOR', size, minimal:true };
  const essentials = resolveWorkspace({...input, setup:'essentials'});
  assert.deepEqual(essentials.resources, ['clients','contacts','estimates','projects','tasks','arInvoices','payments']);
  const team = resolveWorkspace({...input, setup:'team'});
  for (const id of ['purchaseOrders','vendors','employees','timesheets','budgets']) assert.ok(team.resources.includes(id));
  const full = resolveWorkspace({...input, setup:'full'});
  assert.equal(full.modules.length, MODULES.length);
  assert.deepEqual(essentials.limits, full.limits, 'setup never changes size or plan limits');
  const upgraded = resolveWorkspace({...input, setup:'essentials', addons:['finance','documents']});
  assert.ok(upgraded.resources.includes('apBills'));
  assert.ok(upgraded.resources.includes('documents'));
  const allowed = entitledModules('STARTER',full.modules);
  const resources = entitledResources('STARTER',full.resources);
  assert.ok(allowed.length < full.modules.length);
  assert.ok(resources.every(r=>MODULES.some(m=>allowed.includes(m.id)&&m.resources.includes(r))));
}
assert.equal(isWorkspaceSetup('invalid'),false);
assert.equal(isWorkspaceSetup('team'),true);
const legacy=resolveWorkspace({companyType:'GENERAL_CONTRACTOR',size:'MICRO',minimal:true});
assert.ok(legacy.resources.includes('contracts'), 'legacy settings path stays unchanged');
console.log('Workspace setup QA passed: all sizes, additive extras, existing defaults and plan boundaries.');
