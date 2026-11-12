import assert from 'node:assert/strict';
import { cents, decimal, planReceiptAllocation } from '../src/lib/receipt-allocation';
const invoices = [
  {id:'one',currency:'USD',gross:'34500.00',allocated:'10000.00'},
  {id:'two',currency:'USD',gross:'5000',allocated:'0'},
];
assert.equal(decimal(cents('0.25')), '0.25');
assert.equal(decimal(cents('99999999999999.99')), '99999999999999.99');
for (const invalid of ['-1','1.001','1e2','NaN','', '.50']) assert.throws(() => cents(invalid));
assert.deepEqual(planReceiptAllocation('30000','USD',invoices,[{invoiceId:'one',amount:'24500'},{invoiceId:'two',amount:'1000'}]),{
  allocations:[{invoiceId:'one',amount:'24500.00'},{invoiceId:'two',amount:'1000.00'}],unallocated:'4500.00',
});
assert.equal(planReceiptAllocation('10000','USD',invoices,[]).unallocated,'10000.00');
assert.throws(() => planReceiptAllocation('0','USD',invoices,[]));
assert.throws(() => planReceiptAllocation('10000','USD',invoices,[{invoiceId:'one',amount:'0'}]));
assert.throws(() => planReceiptAllocation('10000','USD',invoices,[{invoiceId:'one',amount:'10001'}]));
assert.throws(() => planReceiptAllocation('50000','USD',invoices,[{invoiceId:'one',amount:'24501'}]));
assert.throws(() => planReceiptAllocation('50000','EUR',invoices,[{invoiceId:'one',amount:'1'}]));
assert.throws(() => planReceiptAllocation('50000','USD',invoices,[{invoiceId:'one',amount:'1'},{invoiceId:'one',amount:'1'}]));
assert.throws(() => planReceiptAllocation('1','USD',invoices,[{invoiceId:'missing',amount:'1'}]));
console.log('Receipt allocation arithmetic checks passed (no database integration tested).');
