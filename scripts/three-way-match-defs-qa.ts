/* Static Phase 3 checks: three-way match read-only definitions and contract. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { THREE_WAY_RESOURCE_IDS, THREE_WAY_TOLERANCE_PCT, buildThreeWayMatch } from '../src/lib/three-way-match';
import { RESOURCE_MAP } from '../src/lib/resources';
import type { CurrencyConfig } from '../src/lib/currency';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
const ok = (name: string, fn: () => void) => {
  try { fn(); pass++; console.log(`PASS ${name}`); }
  catch (error) { console.log(`FAIL ${name}: ${(error as Error).message}`); process.exitCode = 1; }
};
const cfg: CurrencyConfig = {
  base: 'USD', enabled: ['USD', 'ZWG', 'ZAR'], rates: { USD: 1, ZWG: 26, ZAR: 18 }, updatedAt: null,
};
const baseInput = {
  org: 'qa', cfg, vendors: [], projects: [],
  purchaseOrders: [{
    id: 'PO-1', number: 'PO-001', title: 'Cement', status: 'APPROVED', createdAt: '2026-11-01T08:00:00Z',
    projectId: 'P1', vendorId: 'V1', amount: 1000, currency: 'USD', items: 'Qty 10 @ 100 USD',
  }],
  goodsReceipts: [{
    id: 'GRN-1', number: 'GRN-001', title: 'Cement delivery', status: 'ACCEPTED', createdAt: '2026-11-02T08:00:00Z',
    purchaseOrderId: 'PO-1', deliveryNote: 'DN-01', items: 'Qty 10', discrepancies: '',
  }],
  apBills: [{
    id: 'BILL-1', number: 'BILL-001', title: 'Supplier invoice', status: 'ISSUED', createdAt: '2026-11-03T08:00:00Z',
    purchaseOrderId: 'PO-1', vendorId: 'V1', vendorInvoiceNo: 'INV-1',
    amount: 1000, total: 1000, amountPaid: 0, currency: 'USD',
  }],
};
const result = () => buildThreeWayMatch(baseInput as any);

ok('resource IDs use existing registers only', () => {
  assert.deepEqual(THREE_WAY_RESOURCE_IDS, [
    'purchaseOrders', 'goodsReceipts', 'apBills', 'vendors', 'projects',
  ]);
  assert.equal(THREE_WAY_TOLERANCE_PCT, 2);
  for (const id of THREE_WAY_RESOURCE_IDS) assert.ok(RESOURCE_MAP[id], `${id} missing from RESOURCE_MAP`);
});
ok('clean three-way match is matched', () => {
  const r = result();
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].status, 'MATCHED');
  assert.equal(r.groups[0].tone, 'green');
  assert.equal(r.groups[0].stage, 3);
  assert.equal(r.groups[0].flags.length, 0);
  assert.equal(r.summary.matched, 1);
  assert.equal(r.summary.blocked, 0);
  assert.equal(r.summary.orphanBills, 0);
  assert.equal(r.summary.orphanReceipts, 0);
  assert.equal(r.groups[0].orderedQty, 10);
  assert.equal(r.groups[0].receivedQty, 10);
});
ok('duplicate supplier invoice number blocks payment', () => {
  const bill = { ...baseInput.apBills[0], id: 'BILL-2', number: 'BILL-002' };
  const r = buildThreeWayMatch({ ...baseInput, apBills: [...baseInput.apBills, bill] } as any);
  assert.equal(r.summary.duplicateInvoices, 1);
  assert.equal(r.groups[0].status, 'BLOCKED');
  assert.ok(r.groups[0].flags.includes('Duplicate supplier invoice number'));
  assert.match(r.groups[0].recommendation, /duplicate/i);
});
ok('price variance beyond tolerance is a review, within tolerance is matched', () => {
  const over = buildThreeWayMatch({ ...baseInput, apBills: [{ ...baseInput.apBills[0], amount: 1050, total: 1050 }] } as any);
  assert.equal(over.groups[0].status, 'REVIEW');
  assert.ok(over.groups[0].flags.some(f => /price variance/i.test(f)));
  const within = buildThreeWayMatch({ ...baseInput, apBills: [{ ...baseInput.apBills[0], amount: 1010, total: 1010 }] } as any);
  assert.equal(within.groups[0].status, 'MATCHED');
});
ok('missing receipt / bill and quantity gap are surfaced', () => {
  const noReceipt = buildThreeWayMatch({ ...baseInput, goodsReceipts: [] } as any);
  assert.equal(noReceipt.summary.missingReceipts, 1);
  assert.equal(noReceipt.groups[0].status, 'BLOCKED');
  assert.ok(noReceipt.groups[0].flags.some(f => /receipt/i.test(f)));
  const short = buildThreeWayMatch({ ...baseInput, goodsReceipts: [{ ...baseInput.goodsReceipts[0], items: 'Qty 8' }] } as any);
  assert.equal(short.groups[0].receivedQty, 8);
  assert.ok(short.groups[0].flags.includes('Quantity variance'));
  const noBill = buildThreeWayMatch({ ...baseInput, apBills: [] } as any);
  assert.equal(noBill.summary.missingBills, 1);
  assert.equal(noBill.groups[0].stage, 2);
  assert.equal(noBill.groups[0].status, 'AWAITING');
  assert.equal(noBill.groups[0].tone, 'slate');
});
ok('orphans, cancelled POs and void bills are excluded or listed', () => {
  const orphanBill = { ...baseInput.apBills[0], id: 'B-ORPHAN', number: 'BILL-900', purchaseOrderId: '' };
  const orphanGrn = { ...baseInput.goodsReceipts[0], id: 'G-ORPHAN', number: 'GRN-900', purchaseOrderId: '' };
  const r = buildThreeWayMatch({ ...baseInput, goodsReceipts: [...baseInput.goodsReceipts, orphanGrn], apBills: [...baseInput.apBills, orphanBill] } as any);
  assert.equal(r.summary.orphanBills, 1);
  assert.equal(r.summary.orphanReceipts, 1);
  assert.equal(r.orphans.bills[0].id, 'B-ORPHAN');
  assert.equal(r.orphans.receipts[0].id, 'G-ORPHAN');
  const excluded = buildThreeWayMatch({
    ...baseInput,
    purchaseOrders: [{ ...baseInput.purchaseOrders[0], status: 'CANCELLED' }],
    apBills: [{ ...baseInput.apBills[0], status: 'VOID' }],
  } as any);
  assert.equal(excluded.summary.orders, 0);
  assert.equal(excluded.summary.orphanBills, 0);
  assert.equal(excluded.summary.orphanReceipts, 0);
});
ok('currency conversion uses workspace base and flags missing rates', () => {
  const zwg = buildThreeWayMatch({
    ...baseInput,
    apBills: [{ ...baseInput.apBills[0], amount: 26000, total: 26000, currency: 'ZWG' }],
  } as any);
  assert.equal(zwg.base, 'USD');
  assert.equal(zwg.groups[0].billedAmount, 1000);
  const missing = buildThreeWayMatch({
    ...baseInput,
    apBills: [{ ...baseInput.apBills[0], amount: 900, total: 900, currency: 'EUR' }],
  } as any);
  assert.ok(missing.currency.missingRates.includes('EUR'));
  assert.ok(missing.groups[0].flags.some(f => /manual FX rate/i.test(f)));
});
ok('API is read-only and uses auth, billing, module, read and scoping guards', () => {
  const api = read('src/app/api/[org]/three-way-match/route.ts');
  for (const needle of [
    'apiAuth', 'billingGuard', "guardModule(a.config, 'procurement')", "guardModule(a.config, 'finance')",
    "readGuard(a.config, a.role, 'purchaseOrders')", "readGuard(a.config, a.role, 'apBills')",
    'buildScope', 'visibleResources', 'rowsForScoped', "'Cache-Control': 'no-store'",
  ]) assert.ok(api.includes(needle), `API missing ${needle}`);
  assert.equal(/export async function POST|export async function PATCH|export async function DELETE/.test(api), false);
  assert.equal(/\b(insertRecord|updateRecord|deleteRecord|logActivity)\b/.test(api), false);
  const lib = read('src/lib/three-way-match.ts');
  assert.equal(/fetch\(|supabase|updateRecord|insertRecord/.test(lib), false);
});
ok('UI, nav, dashboard, visibility, docs and QA script are wired', () => {
  const page = read('src/app/[org]/three-way-match/page.tsx');
  for (const needle of [
    'three-way-page', 'three-way-summary', 'three-way-exceptions', 'three-way-orphans',
    'three-way-row', 'three-way-method-toggle', 'three-way-method',
    "apiGet(orgApi(org, 'three-way-match'))",
  ]) assert.ok(page.includes(needle), `page missing ${needle}`);
  assert.equal(/useMutation|apiPost|apiPatch|apiDelete|axios\.post/.test(page), false);
  const shell = read('src/components/AppShell.tsx');
  assert.ok(shell.includes("id:'three-way-match'"));
  assert.ok(shell.includes("alsoModule:'finance'"));
  assert.ok(shell.includes('(s as any).alsoModule'));
  assert.ok(shell.includes("'nav-three-way-match'"));
  assert.ok(read('src/app/[org]/dashboard/page.tsx').includes('dashboard-three-way-match'));
  const visibility = read('src/lib/module-visibility.ts');
  assert.ok(visibility.includes("'three-way-match': 'procurement'"));
  assert.ok(visibility.includes('three-way-match|documentation'));
  assert.ok(visibility.includes("special === 'three-way-match'"));
  assert.ok(read('src/app/[org]/documentation/page.tsx').includes("finance: [{ label: 'Supplier bills'"));
  assert.ok(read('src/app/[org]/documentation/page.tsx').includes("href: 'three-way-match'"));
  const layout = read('src/app/[org]/three-way-match/layout.tsx');
  assert.ok(layout.includes("moduleId: 'procurement'"));
  assert.ok(layout.includes("also: { moduleId: 'finance'"));
  assert.ok(read('src/lib/page-modules.ts').includes('also?:'));
  assert.ok(read('package.json').includes('"audit:three-way-match"'));
});
console.log(`\n${pass} PASS / ${process.exitCode ? 1 : 0} FAIL`);
