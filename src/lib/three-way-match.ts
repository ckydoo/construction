/* Phase 3 three-way procure-to-pay match — pure derivation helpers.
 *
 * Read-only: compares purchase orders, goods receipts and supplier bills that
 * already exist. No approval/payment state is changed and no table is added.
 * Money is reported in the workspace base currency using manual Settings rates;
 * saved records, PDFs and CSV exports keep their original currency.
 */
import { toBase, hasRate, type CurrencyConfig } from './currency';

export type MatchTone = 'green' | 'amber' | 'red' | 'slate';
export type MatchStatus = 'MATCHED' | 'REVIEW' | 'BLOCKED' | 'AWAITING';
export type MatchDocType = 'ORDER' | 'DELIVERY' | 'BILL';
export type OrphanType = 'BILL' | 'DELIVERY';

export type MatchDoc = {
  type: MatchDocType;
  id: string;
  number: string;
  title: string;
  status: string;
  amount: number | null;
  currency: string;
  href: string;
  note: string;
};

export type MatchGroup = {
  id: string;
  status: MatchStatus;
  poId: string;
  poNumber: string;
  poTitle: string;
  poStatus: string;
  vendorName: string;
  projectName: string;
  currency: string;
  href: string;

  stage: 1 | 2 | 3;
  stageLabel: string;
  orderValue: number;
  orderedQty: number | null;
  receivedQty: number | null;
  quantityVariance: number | null;
  receiptCount: number;
  acceptedReceiptCount: number;
  disputedReceiptCount: number;
  billCount: number;
  postedBillCount: number;
  draftBillCount: number;

  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  priceVariance: number;
  variancePct: number;
  tolerance: number;

  flags: string[];
  recommendation: string;
  tone: MatchTone;
  statusLabel: string;
  documents: MatchDoc[];
  missingRates: string[];
};

export type OrphanDoc = {
  type: OrphanType;
  id: string;
  number: string;
  title: string;
  status: string;
  vendorName: string;
  projectName: string;
  amount: number | null;
  currency: string;
  href: string;
  reason: string;
  tone: MatchTone;
  missingRates: string[];
};

export type ThreeWaySummary = {
  orders: number;
  matched: number;
  review: number;
  blocked: number;
  awaiting: number;
  orphanBills: number;
  orphanReceipts: number;
  duplicateInvoices: number;
  missingInvoiceNumbers: number;
  priceExceptions: number;
  missingReceipts: number;
  missingBills: number;
  disputedDeliveries: number;
  overdueBills: number;
  missingRates: number;
  tolerancePct: number;
};

export type ThreeWayResponse = {
  base: string;
  currency: {
    base: string;
    rates: Record<string, number>;
    updatedAt: string | null;
    updatedBy: string | null;
    missingRates: string[];
  };
  summary: ThreeWaySummary;
  groups: MatchGroup[];
  orphans: { bills: OrphanDoc[]; receipts: OrphanDoc[] };
  generatedAt: string;
};

export const THREE_WAY_RESOURCE_IDS = [
  'purchaseOrders', 'goodsReceipts', 'apBills', 'vendors', 'projects',
] as const;

export const THREE_WAY_TOLERANCE_PCT = 2;

export type ThreeWayInput = {
  org: string;
  cfg: CurrencyConfig;
  purchaseOrders?: any[];
  goodsReceipts?: any[];
  apBills?: any[];
  vendors?: any[];
  projects?: any[];
};

const str = (v: unknown) => String(v || '');
const num = (v: unknown) => { const n = Number(v || 0); return isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const upper = (v: unknown) => str(v).toUpperCase();
const titleOf = (row: any, fallback: string) => str(row?.name || row?.title || row?.number || fallback);

function parseQty(text: unknown): number | null {
  const match = /Qty\s*([0-9]+(?:\.[0-9]+)?)/i.exec(str(text));
  return match ? Number(match[1]) : null;
}
function cleanDiscrepancy(text: unknown): string {
  const s = str(text).trim();
  return s && !/^none$/i.test(s) ? s : '';
}
function groupBy<T extends Record<string, any>>(rows: T[], key: string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const id = str(row[key]);
    if (!id) continue;
    const list = out.get(id) || [];
    list.push(row);
    out.set(id, list);
  }
  return out;
}
function docHref(org: string, resource: string, id: string) {
  return `/${org}/m/${resource}?open=${encodeURIComponent(id)}`;
}
function nameFrom(rows: any[], id: unknown, fallback = '') {
  const row = rows.find(r => r.id === id);
  return str(row?.name || row?.title || fallback);
}

export function buildThreeWayMatch(input: ThreeWayInput): ThreeWayResponse {
  const { org, cfg } = input;
  const allPurchaseOrders = input.purchaseOrders || [];
  const purchaseOrders = allPurchaseOrders.filter(p => upper(p.status) !== 'CANCELLED');
  const goodsReceipts = input.goodsReceipts || [];
  const apBills = (input.apBills || []).filter(b => upper(b.status) !== 'VOID');
  const vendors = input.vendors || [];
  const projects = input.projects || [];

  const globalMissing = new Set<string>();
  const note = (code: string, local?: Set<string>) => {
    const clean = upper(code || cfg.base);
    if (!hasRate(clean, cfg)) { globalMissing.add(clean); local?.add(clean); }
  };
  const inBase = (value: unknown, code: string, local?: Set<string>) => {
    note(code, local);
    return toBase(value, code, cfg);
  };
  const currencyOf = (row: any, fallback: string) => upper(row?.currency || fallback || cfg.base);

  const poById = new Map(allPurchaseOrders.map(p => [str(p.id), p]));
  const receiptsByPo = groupBy(goodsReceipts, 'purchaseOrderId');
  const billsByPo = groupBy(apBills, 'purchaseOrderId');

  // Duplicate supplier invoice numbers are a payment-blocking exception.
  // Fall back to the linked PO supplier when a bill has no vendorId.
  const vendorKeyOf = (bill: any) => str(bill.vendorId)
    || str(poById.get(str(bill.purchaseOrderId))?.vendorId) || 'none';
  const invoiceGroups = new Map<string, any[]>();
  const missingInvoiceNumbers = new Set<string>();
  for (const bill of apBills) {
    const invoiceNo = str(bill.vendorInvoiceNo).trim().toUpperCase();
    if (!invoiceNo) { missingInvoiceNumbers.add(str(bill.id)); continue; }
    const key = `${vendorKeyOf(bill)}|${invoiceNo}`;
    const list = invoiceGroups.get(key) || [];
    list.push(bill);
    invoiceGroups.set(key, list);
  }
  const duplicateKeys = new Set([...invoiceGroups.entries()].filter(([, list]) => list.length > 1).map(([key]) => key));
  const invoiceKeyOf = (bill: any) => `${vendorKeyOf(bill)}|${str(bill.vendorInvoiceNo).trim().toUpperCase()}`;

  const makeDoc = (
    type: MatchDocType, row: any, resource: string, amount: number | null,
    currency: string, noteText: string,
  ): MatchDoc => ({
    type, id: str(row.id), number: str(row.number || ''), title: titleOf(row, type),
    status: upper(row.status), amount, currency,
    href: docHref(org, resource, str(row.id)), note: noteText,
  });

  const groups: MatchGroup[] = purchaseOrders.map(po => {
    const localMissing = new Set<string>();
    const poId = str(po.id);
    const poCurrency = currencyOf(po, cfg.base);
    const orderValue = inBase(po.amount, poCurrency, localMissing);
    const receipts = receiptsByPo.get(poId) || [];
    const bills = billsByPo.get(poId) || [];
    const postedBills = bills.filter(b => upper(b.status) !== 'DRAFT');
    const draftBills = bills.filter(b => upper(b.status) === 'DRAFT');
    const acceptedReceipts = receipts.filter(r => ['RECEIVED', 'PARTIAL', 'ACCEPTED'].includes(upper(r.status)));
    const disputedReceipts = receipts.filter(r => upper(r.status) === 'DISPUTED' || cleanDiscrepancy(r.discrepancies));
    const partialReceipts = receipts.filter(r => upper(r.status) === 'PARTIAL');
    const overdueBills = postedBills.filter(b => upper(b.status) === 'OVERDUE');

    let billedAmount = 0;
    let paidAmount = 0;
    const billCurrencies = new Set<string>();
    const documents: MatchDoc[] = [makeDoc('ORDER', po, 'purchaseOrders', orderValue, poCurrency,
      po.orderDate ? `Ordered ${str(po.orderDate)}` : '')];

    for (const bill of bills) {
      const billCurrency = currencyOf(bill, poCurrency);
      billCurrencies.add(billCurrency);
      const value = inBase(bill.total ?? bill.amount, billCurrency, localMissing);
      const paid = inBase(bill.amountPaid, billCurrency, localMissing);
      documents.push(makeDoc('BILL', bill, 'apBills', value, billCurrency,
        bill.vendorInvoiceNo ? `Supplier invoice ${str(bill.vendorInvoiceNo)}` : 'Supplier invoice number missing'));
      if (upper(bill.status) !== 'DRAFT') { billedAmount += value; paidAmount += paid; }
    }
    for (const receipt of receipts) {
      documents.push(makeDoc('DELIVERY', receipt, 'goodsReceipts', null, poCurrency,
        cleanDiscrepancy(receipt.discrepancies) || str(receipt.deliveryNote || '')));
    }

    const orderedQty = parseQty(po.items);
    const parsedReceiptQty = receipts.map(r => parseQty(r.items)).filter((x): x is number => x !== null);
    const receivedQty = parsedReceiptQty.length ? parsedReceiptQty.reduce((t, q) => t + q, 0) : null;
    const quantityVariance = orderedQty !== null && receivedQty !== null ? receivedQty - orderedQty : null;
    const quantityTolerance = orderedQty !== null ? Math.max(1, orderedQty * (THREE_WAY_TOLERANCE_PCT / 100)) : 0;

    const tolerance = Math.max(0, orderValue * (THREE_WAY_TOLERANCE_PCT / 100));
    const priceVariance = postedBills.length ? billedAmount - orderValue : 0;
    const variancePct = orderValue ? (priceVariance / orderValue) * 100 : 0;
    const outstandingAmount = Math.max(0, billedAmount - paidAmount);

    const flags: string[] = [];
    const add = (flag: string) => { if (!flags.includes(flag)) flags.push(flag); };
    const hasDuplicate = bills.some(b => str(b.vendorInvoiceNo).trim() && duplicateKeys.has(invoiceKeyOf(b)));
    if (hasDuplicate) add('Duplicate supplier invoice number');
    if (bills.some(b => !str(b.vendorInvoiceNo).trim())) add('Supplier invoice number missing');
    if (postedBills.length && !acceptedReceipts.length) add('Billed before goods receipt');
    if (!receipts.length && (postedBills.length || ['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(upper(po.status)))) add('No goods receipt linked');
    if (!postedBills.length && (acceptedReceipts.length || ['RECEIVED', 'PARTIALLY_RECEIVED'].includes(upper(po.status)))) add('No supplier bill linked');
    if (postedBills.length && ['DRAFT', 'PENDING_APPROVAL'].includes(upper(po.status))) add('Unapproved purchase order billed');
    if (draftBills.length) add('Draft supplier bill linked');
    if (disputedReceipts.length) add('Delivery dispute recorded');
    if (partialReceipts.length) add('Partial delivery recorded');
    if (overdueBills.length) add('Overdue supplier bill');
    if (postedBills.length && orderValue > 0 && Math.abs(priceVariance) > tolerance) {
      add('Price variance over tolerance');
      add(priceVariance > 0 ? 'Overbilled against purchase order' : 'Underbilled against purchase order');
    }
    if (postedBills.length && !orderValue) add('No purchase order value to match');
    if (paidAmount > billedAmount + tolerance) add('Overpaid supplier bill');
    if (quantityVariance !== null && Math.abs(quantityVariance) > quantityTolerance) add('Quantity variance');
    if ((orderedQty === null || receivedQty === null) && (postedBills.length || acceptedReceipts.length)) add('Line quantities not captured');
    if ([...billCurrencies].some(c => c !== poCurrency)) add('Bill currency differs from purchase order');
    if (localMissing.size) add('Missing manual FX rate');

    const blocking = [
      'Duplicate supplier invoice number', 'Billed before goods receipt',
      'Unapproved purchase order billed', 'Delivery dispute recorded',
      'Overpaid supplier bill', 'Missing manual FX rate',
    ];
    const awaitingFlags = [
      'No goods receipt linked', 'No supplier bill linked', 'Line quantities not captured',
    ];
    const noLinkedDocs = !receipts.length && !bills.length;
    const onlyAwaitingFlags = flags.length > 0 && flags.every(f => awaitingFlags.includes(f));
    let status: MatchStatus;
    if (flags.some(f => blocking.includes(f))) status = 'BLOCKED';
    else if (!postedBills.length && (noLinkedDocs || onlyAwaitingFlags)) status = 'AWAITING';
    else if (flags.length) status = 'REVIEW';
    else status = 'MATCHED';
    const tone: MatchTone = status === 'BLOCKED' ? 'red'
      : status === 'REVIEW' ? 'amber'
        : status === 'AWAITING' ? 'slate' : 'green';
    const statusLabel = status === 'BLOCKED' ? 'Blocked'
      : status === 'REVIEW' ? 'Review'
        : status === 'AWAITING' ? 'Awaiting documents' : 'Matched';

    const recommendation = hasDuplicate ? 'Hold payment: possible duplicate supplier invoice.'
      : flags.includes('Billed before goods receipt') ? 'Hold payment until an accepted goods receipt is linked.'
        : flags.includes('Unapproved purchase order billed') ? 'Do not pay: approve the purchase order first.'
          : flags.includes('Delivery dispute recorded') ? 'Resolve the delivery discrepancy before payment.'
            : flags.includes('Overbilled against purchase order') ? 'Request a corrected invoice or credit note from the supplier.'
              : flags.includes('Price variance over tolerance') ? 'Buyer to review the price variance before payment.'
                : flags.includes('Overpaid supplier bill') ? 'Reconcile the overpayment with the supplier.'
                  : flags.includes('Missing manual FX rate') ? 'Set a manual FX rate in Settings → Currencies.'
                    : flags.includes('No goods receipt linked') ? 'Link the delivery note before approving the bill.'
                      : flags.includes('No supplier bill linked') ? 'Chase the supplier invoice or close the order.'
                        : flags.includes('Partial delivery recorded') ? 'Confirm the remaining delivery before final payment.'
                          : flags.includes('Quantity variance') ? 'Reconcile delivered quantity with the order.'
                            : flags.includes('Line quantities not captured') ? 'Capture line quantities on orders and deliveries for a true line-level match.'
                              : flags.includes('Bill currency differs from purchase order') ? 'Confirm the invoice currency and exchange rate.'
                                : flags.includes('Overdue supplier bill') ? 'Chase the overdue supplier bill.'
                                  : status === 'AWAITING' ? 'Awaiting delivery note and supplier bill.'
                                    : flags.length ? 'Review the linked documents before payment.'
                                      : `Matched within ${THREE_WAY_TOLERANCE_PCT}% tolerance — release for payment.`;

    const stage: 1 | 2 | 3 = acceptedReceipts.length && postedBills.length ? 3
      : (acceptedReceipts.length || postedBills.length) ? 2 : 1;
    const stageLabel = stage === 3 ? 'Order · delivery · bill'
      : stage === 2 ? 'Two documents linked' : 'Order only';

    return {
      id: poId, status, poId, poNumber: str(po.number || ''), poTitle: titleOf(po, 'Purchase order'),
      poStatus: upper(po.status), vendorName: nameFrom(vendors, po.vendorId),
      projectName: nameFrom(projects, po.projectId), currency: poCurrency,
      href: docHref(org, 'purchaseOrders', poId),
      stage, stageLabel, orderValue: round2(orderValue),
      orderedQty, receivedQty, quantityVariance,
      receiptCount: receipts.length, acceptedReceiptCount: acceptedReceipts.length,
      disputedReceiptCount: disputedReceipts.length, billCount: bills.length,
      postedBillCount: postedBills.length, draftBillCount: draftBills.length,
      billedAmount: round2(billedAmount), paidAmount: round2(paidAmount),
      outstandingAmount: round2(outstandingAmount), priceVariance: round2(priceVariance),
      variancePct: round2(variancePct), tolerance: round2(tolerance),
      flags, recommendation, tone, statusLabel, documents,
      missingRates: Array.from(localMissing).sort(),
    };
  }).sort((a, b) => {
    const rank = (g: MatchGroup) => g.tone === 'red' ? 0 : g.tone === 'amber' ? 1 : g.tone === 'slate' ? 2 : 3;
    return rank(a) - rank(b) || Math.abs(b.priceVariance) - Math.abs(a.priceVariance) || b.orderValue - a.orderValue;
  });

  const makeOrphan = (type: OrphanType, row: any, reason: string): OrphanDoc => {
    const localMissing = new Set<string>();
    const fallbackCurrency = cfg.base;
    const currency = currencyOf(row, fallbackCurrency);
    const amount = type === 'BILL'
      ? inBase(row.total ?? row.amount, currency, localMissing)
      : null;
    return {
      type, id: str(row.id), number: str(row.number || ''), title: titleOf(row, type),
      status: upper(row.status), vendorName: nameFrom(vendors, row.vendorId),
      projectName: nameFrom(projects, row.projectId), amount: amount === null ? null : round2(amount),
      currency, href: docHref(org, type === 'BILL' ? 'apBills' : 'goodsReceipts', str(row.id)),
      reason, tone: type === 'BILL' ? 'red' : 'amber',
      missingRates: Array.from(localMissing).sort(),
    };
  };
  const hasPo = (id: unknown) => poById.has(str(id));
  const orphanBills = apBills.filter(b => !hasPo(b.purchaseOrderId)).map(b =>
    makeOrphan('BILL', b, b.purchaseOrderId ? 'Linked purchase order not found' : 'No purchase order linked'));
  const orphanReceipts = goodsReceipts.filter(r => !hasPo(r.purchaseOrderId)).map(r =>
    makeOrphan('DELIVERY', r, r.purchaseOrderId ? 'Linked purchase order not found' : 'No purchase order linked'));

  const summary: ThreeWaySummary = {
    orders: groups.length,
    matched: groups.filter(g => g.status === 'MATCHED').length,
    review: groups.filter(g => g.status === 'REVIEW').length,
    blocked: groups.filter(g => g.status === 'BLOCKED').length,
    awaiting: groups.filter(g => g.status === 'AWAITING').length,
    orphanBills: orphanBills.length,
    orphanReceipts: orphanReceipts.length,
    duplicateInvoices: duplicateKeys.size,
    missingInvoiceNumbers: missingInvoiceNumbers.size,
    priceExceptions: groups.filter(g => g.flags.includes('Price variance over tolerance')).length,
    missingReceipts: groups.filter(g => g.flags.includes('No goods receipt linked')).length,
    missingBills: groups.filter(g => g.flags.includes('No supplier bill linked')).length,
    disputedDeliveries: groups.filter(g => g.flags.includes('Delivery dispute recorded')).length,
    overdueBills: groups.filter(g => g.flags.includes('Overdue supplier bill')).length,
    missingRates: globalMissing.size,
    tolerancePct: THREE_WAY_TOLERANCE_PCT,
  };

  return {
    base: cfg.base,
    currency: {
      base: cfg.base, rates: cfg.rates,
      updatedAt: cfg.updatedAt || null, updatedBy: cfg.updatedBy || null,
      missingRates: Array.from(globalMissing).sort(),
    },
    summary, groups, orphans: { bills: orphanBills, receipts: orphanReceipts },
    generatedAt: new Date().toISOString(),
  };
}
