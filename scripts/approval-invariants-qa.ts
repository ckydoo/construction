import assert from 'node:assert/strict';import {recordInvariantErrors} from '../src/lib/record-invariants';
const valid={status:'APPROVED',employeeId:'e',projectId:'p',weekStart:'2026-11-01',weekEnd:'2026-11-07',regularHours:40,overtimeHours:8};
assert.deepEqual(recordInvariantErrors('timesheets',valid,'SUBMITTED'),{});
assert.ok(recordInvariantErrors('timesheets',{...valid,weekEnd:'2026-02-30'},'SUBMITTED').weekEnd);
assert.ok(recordInvariantErrors('timesheets',{...valid,weekEnd:'2026-10-31'},'SUBMITTED').weekEnd);
assert.ok(recordInvariantErrors('timesheets',{...valid,regularHours:-1},'SUBMITTED').regularHours);
assert.ok(recordInvariantErrors('timesheets',{...valid,employeeId:null},'SUBMITTED').employeeId);
console.log('PASS timesheet approval invariants: missing data, invalid dates, ordering and negative hours.');
