import assert from 'node:assert/strict';
import { recordInvariantErrors } from '../src/lib/record-invariants';

const guard = recordInvariantErrors;
assert.ok(guard('journals', { status:'POSTED', debit:100 }).status);
assert.ok(guard('journals', { status:'POSTED', debit:100, credit:100, accountId:'account', date:'2026-11-12', period:'2026-11' }).status, 'no false claim that a balanced header constitutes a ledger');
assert.deepEqual(guard('journals', { status:'DRAFT', debit:100 }), {});
const incomplete = guard('arInvoices', { status:'ISSUED', projectId:'project' });
for (const key of ['clientId','invoiceDate','dueDate']) assert.ok(incomplete[key], key);
assert.ok(guard('arInvoices', { status:'ISSUED', clientId:'x', invoiceDate:'2026-02-30', dueDate:'2026-03-02' }).invoiceDate);
assert.ok(guard('arInvoices', { status:'ISSUED', clientId:'x', invoiceDate:'2026-01-02', dueDate:'2026-01-01' }).dueDate);
assert.deepEqual(guard('arInvoices', { status:'ISSUED', clientId:'x', invoiceDate:'2026-01-02', dueDate:'2026-01-03' }), {});
for (const status of ['PAID','PARTIALLY_PAID']) assert.ok(guard('arInvoices', { status, clientId:'x', invoiceDate:'2026-01-02', dueDate:'2026-01-03' }, 'ISSUED').status);
for (const r of ['projects','tasks']) {
  for (const v of [-1, 101, 150, Infinity]) assert.ok(guard(r,{progress:v}).progress);
  for (const v of [0,50,100]) assert.deepEqual(guard(r,{progress:v}),{});
}
console.log('Record invariant unit checks passed');
