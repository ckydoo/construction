import assert from 'node:assert/strict';
import { resolveWorkspace, SOLO_MODULE_IDS, SOLO_RESOURCE_IDS } from '../src/lib/catalog';

// A brand-new micro workspace starts with exactly the job-to-cash loop.
const solo = resolveWorkspace({ companyType:'GENERAL_CONTRACTOR', size:'MICRO', qualifiers:[], addons:[], minimal:true });
for (const id of SOLO_MODULE_IDS) assert.ok(solo.modules.includes(id), `solo module ${id}`);
for (const r of SOLO_RESOURCE_IDS) assert.ok(solo.resources.includes(r), `solo resource ${r}`);
// Nothing from the wider catalogue leaks in (no pipeline, wallets, hr, time…).
for (const banned of ['pipeline','wallets','hr','time','payroll','procurement','vendors','equipment']) {
  assert.ok(!solo.modules.includes(banned), `banned module leaked: ${banned}`);
}
for (const banned of ['accounts','journals','apBills','payRuns','timesheets','employees']) {
  assert.ok(!solo.resources.includes(banned), `banned resource leaked: ${banned}`);
}
// Type-defining modules still unlock for their type even in minimal micro mode.
const dev = resolveWorkspace({ companyType:'RESIDENTIAL_DEVELOPER', size:'MICRO', qualifiers:[], addons:[], minimal:true });
assert.ok(dev.modules.includes('unitSales'), 'type-defining module unlocks in minimal micro');
assert.ok(dev.resources.includes('units'), 'type-defining resource included');
// Without the minimal flag (e.g. Settings reconfigure) micro keeps essentials.
const recalc = resolveWorkspace({ companyType:'GENERAL_CONTRACTOR', size:'MICRO', qualifiers:[] });
assert.ok(recalc.modules.includes('hr'), 'reconfigure keeps essentials');
// Small size still gets essentials, not solo.
const small = resolveWorkspace({ companyType:'GENERAL_CONTRACTOR', size:'SMALL', qualifiers:[], minimal:true });
assert.ok(small.modules.includes('contracts') && small.modules.includes('hr'), 'small size unchanged');
console.log('Solo workspace checks passed');
