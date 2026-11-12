/* Shared rules for proper financial documents: line items, document titles,
 * fallback rows for older records and totals calculated from entered items. */
import { RESOURCE_MAP, type ResourceDef } from './resources';
import type { CompanyProfile } from './company';

export type LineCategory = 'labour' | 'materials' | 'plant' | 'subcontract' | 'overheads';
export const LINE_CATEGORIES: {
  id: LineCategory; label: string; recordKey: string; hint: string;
}[] = [
  { id:'labour', label:'Labour', recordKey:'labourCost', hint:'Site crew, supervision and install time' },
  { id:'materials', label:'Materials', recordKey:'materialCost', hint:'Cement, steel, finishes, consumables' },
  { id:'plant', label:'Plant & equipment', recordKey:'plantCost', hint:'Machines, scaffolding, transport' },
  { id:'subcontract', label:'Subcontractors', recordKey:'subcontractCost', hint:'Specialist packages and hired teams' },
  { id:'overheads', label:'Overheads', recordKey:'overheads', hint:'Site running costs, permits and support' },
];

export type DocLine = {
  description: string;
  detail: string;
  qty: number;
  unitPrice: number;
  total: number;
  /** Optional pricing bucket used by Quote Studio and cost roll-ups. */
  category?: LineCategory;
};

type FinancialDocConfig = {
  title: string;
  shortTitle: string;
  numberLabel: string;
  partyKey: string;
  partyLabel: string;
  dateKey?: string;
  amountKey?: string;
  netKey?: string;
  vatKey?: string;
  paidKey?: string;
  markupKey?: string;
  showDeposit?: boolean;
  showPaid?: boolean;
  showBank?: boolean;
  showWarranty?: boolean;
  fallbackKeys: string[];
};

const C = (cfg: Partial<FinancialDocConfig> & Pick<FinancialDocConfig, 'title' | 'shortTitle' | 'numberLabel' | 'partyKey' | 'partyLabel'>): FinancialDocConfig => ({
  showBank: true, showWarranty: true, fallbackKeys: [], ...cfg,
});

export const FINANCIAL_DOCUMENT_CONFIG: Record<string, FinancialDocConfig> = {
  estimates: C({ title: 'QUOTATION', shortTitle: 'Quotation', numberLabel: 'Quotation no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'submittedDate', amountKey: 'total', markupKey: 'markup', showDeposit: true, fallbackKeys: ['labourCost', 'materialCost', 'plantCost', 'subcontractCost', 'overheads'] }),
  bids: C({ title: 'TENDER SUBMISSION', shortTitle: 'Tender', numberLabel: 'Tender no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'closingDate', amountKey: 'bidValue', fallbackKeys: ['bidValue', 'bidBond'] }),
  contracts: C({ title: 'CONTRACT SUMMARY', shortTitle: 'Contract', numberLabel: 'Contract no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'signedDate', amountKey: 'value', fallbackKeys: ['value'] }),
  changeOrders: C({ title: 'VARIATION ORDER', shortTitle: 'Variation', numberLabel: 'Variation no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'submittedDate', amountKey: 'amount', fallbackKeys: ['amount'] }),
  requisitions: C({ title: 'MATERIAL REQUISITION', shortTitle: 'Requisition', numberLabel: 'Requisition no.', partyKey: 'requestedBy', partyLabel: 'Requested by', dateKey: 'requiredDate', amountKey: 'estimatedValue', fallbackKeys: ['estimatedValue'] }),
  purchaseOrders: C({ title: 'PURCHASE ORDER', shortTitle: 'Purchase order', numberLabel: 'Order no.', partyKey: 'vendorId', partyLabel: 'Supplier', dateKey: 'orderDate', amountKey: 'amount', fallbackKeys: ['amount'] }),
  goodsReceipts: C({ title: 'DELIVERY NOTE', shortTitle: 'Delivery note', numberLabel: 'Delivery no.', partyKey: 'vendorId', partyLabel: 'Supplier', dateKey: 'receivedDate', fallbackKeys: [] }),
  budgets: C({ title: 'BUDGET STATEMENT', shortTitle: 'Budget', numberLabel: 'Budget no.', partyKey: 'accountId', partyLabel: 'Cost code', amountKey: 'originalBudget', fallbackKeys: ['originalBudget', 'approvedVariations', 'committed', 'actualToDate', 'forecastToComplete'] }),
  journals: C({ title: 'JOURNAL VOUCHER', shortTitle: 'Journal', numberLabel: 'Journal no.', partyKey: 'accountId', partyLabel: 'Account', dateKey: 'date', amountKey: 'debit', fallbackKeys: ['debit', 'credit'] }),
  expenses: C({ title: 'EXPENSE CLAIM', shortTitle: 'Expense claim', numberLabel: 'Claim no.', partyKey: 'employeeId', partyLabel: 'Staff member', dateKey: 'expenseDate', amountKey: 'amount', fallbackKeys: ['amount'] }),
  payRuns: C({ title: 'PAYROLL SUMMARY', shortTitle: 'Payroll', numberLabel: 'Payroll no.', partyKey: 'preparedBy', partyLabel: 'Prepared by', dateKey: 'periodStart', amountKey: 'grossPay', fallbackKeys: ['grossPay', 'deductions', 'netPay'] }),
  accounts: C({ title: 'ACCOUNT STATEMENT', shortTitle: 'Account', numberLabel: 'Account no.', partyKey: 'parent', partyLabel: 'Parent account', amountKey: 'balance', showWarranty: false, fallbackKeys: ['openingBalance', 'balance'] }),
  arInvoices: C({ title: 'TAX INVOICE', shortTitle: 'Tax invoice', numberLabel: 'Invoice no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'invoiceDate', amountKey: 'total', netKey: 'amount', vatKey: 'vatAmount', paidKey: 'amountPaid', showPaid: true, fallbackKeys: ['amount', 'vatAmount'] }),
  paymentApps: C({ title: 'INTERIM PAYMENT CERTIFICATE', shortTitle: 'Payment certificate', numberLabel: 'Certificate no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'periodEnd', amountKey: 'netCertified', vatKey: 'vatAmount', showPaid: false, fallbackKeys: ['workValue', 'variationsValue', 'previousCertified', 'grossCertified', 'retentionHeld', 'advanceRecoupment', 'netCertified', 'vatAmount'] }),
  apBills: C({ title: 'SUPPLIER BILL', shortTitle: 'Supplier bill', numberLabel: 'Bill no.', partyKey: 'vendorId', partyLabel: 'Supplier', dateKey: 'billDate', amountKey: 'total', netKey: 'amount', vatKey: 'vatAmount', paidKey: 'amountPaid', showPaid: true, fallbackKeys: ['amount', 'vatAmount'] }),
  payments: C({ title: 'PAYMENT / RECEIPT', shortTitle: 'Receipt', numberLabel: 'Receipt no.', partyKey: 'clientId', partyLabel: 'Client', dateKey: 'paymentDate', amountKey: 'amount', showPaid: false, fallbackKeys: ['amount'] }),
};

export const FINANCIAL_DOCUMENT_IDS = Object.keys(FINANCIAL_DOCUMENT_CONFIG);
export function isFinancialDocument(resourceId: string): boolean {
  return !!FINANCIAL_DOCUMENT_CONFIG[resourceId];
}
export function financialDocConfig(resourceId: string): FinancialDocConfig {
  return FINANCIAL_DOCUMENT_CONFIG[resourceId] || C({
    title: 'FINANCIAL DOCUMENT', shortTitle: 'Document', numberLabel: 'Document no.',
    partyKey: 'clientId', partyLabel: 'Client', amountKey: RESOURCE_MAP[resourceId]?.amountKey,
  });
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v: unknown, max = 500) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const normaliseLine = (raw: any): DocLine | null => {
  if (typeof raw === 'string') {
    const description = s(raw);
    return description ? { description, detail: '', qty: 1, unitPrice: 0, total: 0 } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const description = s(raw.description ?? raw.name ?? raw.item ?? raw.title);
  const detail = s(raw.detail ?? raw.notes ?? raw.note ?? raw.specification);
  const qty = n(raw.qty ?? raw.quantity ?? 1);
  const unitPrice = n(raw.unitPrice ?? raw.rate ?? raw.price ?? 0);
  const total = n(raw.total ?? raw.amount ?? qty * unitPrice);
  if (!description && !detail && !unitPrice && !total) return null;
  const rawCategory = raw && typeof raw === 'object' && raw.category != null ? String(raw.category) : '';
  const category = LINE_CATEGORIES.some(c => c.id === rawCategory) ? rawCategory as LineCategory : undefined;
  return { description: description || 'Item', detail, qty, unitPrice, total, ...(category ? { category } : {}) };
};

export function normaliseLines(raw: any): DocLine[] {
  let list: any[];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    const value = raw.trim();
    if (value.startsWith('[')) {
      try { const parsed = JSON.parse(value); list = Array.isArray(parsed) ? parsed : [value]; }
      catch { list = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
    } else {
      // Legacy textarea: one item per line, or a single free-text description.
      const parts = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      list = parts.length > 1 ? parts : [value];
    }
  } else list = [];
  return list.map(normaliseLine).filter((x): x is DocLine => !!x).slice(0, 80);
}
export function editableLines(raw: any): DocLine[] {
  const source: any[] = Array.isArray(raw) ? raw : normaliseLines(raw);
  return source.map((x) => normaliseLine(x) || {
    description: '', detail: '', qty: 1, unitPrice: 0, total: 0,
  }).slice(0, 80);
}
export function lineSubtotal(lines: DocLine[]): number {
  return lines.reduce((sum, l) => sum + l.total, 0);
}
function labelFor(def: ResourceDef, key: string): string {
  return def.fields.find(f => f.key === key)?.label || key.replace(/([A-Z])/g, ' $1');
}
function notesFor(row: any, def: ResourceDef): string {
  for (const key of ['scope', 'notes', 'justification', 'description', 'narration', 'discrepancies']) {
    const v = row?.[key];
    if (v && typeof v === 'string') return s(v, 600);
  }
  return s(row?.name, 300);
}

/** Explicit itemised lines when present; otherwise a clean breakdown from the
 *  legacy currency fields, so all records created before this release still print. */
export function documentLines(row: any, def: ResourceDef): DocLine[] {
  const explicit = normaliseLines(row?.items ?? row?.lineItems);
  if (explicit.length) return explicit;
  const cfg = financialDocConfig(def.id);
  const lines: DocLine[] = [];
  for (const key of cfg.fallbackKeys) {
    const value = n(row?.[key]);
    if (!value) continue;
    lines.push({ description: labelFor(def, key), detail: '', qty: 1, unitPrice: value, total: value });
  }
  if (!lines.length) {
    const amount = n(row?.[cfg.amountKey || def.amountKey || '']);
    lines.push({
      description: s(row?.name || row?.title || def.singular, 300),
      detail: notesFor(row, def), qty: 1, unitPrice: amount, total: amount,
    });
  }
  return lines;
}

export type FinancialTotals = {
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  deposit: number;
  depositBalance: number;
  explicitItems: boolean;
};

export function financialTotals(row: any, def: ResourceDef, lines: DocLine[], company: CompanyProfile): FinancialTotals {
  const cfg = financialDocConfig(def.id);
  const explicitItems = normaliseLines(row?.items ?? row?.lineItems).length > 0;
  const lineSum = lineSubtotal(lines);
  const net = cfg.netKey ? n(row?.[cfg.netKey]) : 0;
  const subtotal = explicitItems ? lineSum : (net || n(row?.[cfg.amountKey || def.amountKey || '']) || lineSum);
  const tax = cfg.vatKey ? n(row?.[cfg.vatKey]) : 0;
  const paid = cfg.paidKey ? n(row?.[cfg.paidKey]) : 0;
  const total = n(row?.[cfg.amountKey || def.amountKey || '']) || subtotal + tax;
  const deposit = cfg.showDeposit && company.depositPct > 0 ? total * company.depositPct / 100 : 0;
  return {
    currency: s(row?.currency || 'USD', 8).toUpperCase() || 'USD',
    subtotal, tax, total, paid,
    balance: Math.max(0, total - paid),
    deposit,
    depositBalance: Math.max(0, total - deposit),
    explicitItems,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Patch record fields when the user edits itemised lines. Existing records
 *  without lines keep their stored totals until their lines are edited. */
export function financialTotalsPatch(resourceId: string, current: Record<string, any>, lines: DocLine[]): Record<string, any> {
  const cfg = financialDocConfig(resourceId);
  const subtotal = round2(lineSubtotal(lines));
  if (!lines.length) return {};
  const patch: Record<string, any> = {};
  if (cfg.netKey) patch[cfg.netKey] = subtotal;
  if (resourceId === 'estimates') {
    const markup = n(current.markup);
    patch.total = round2(subtotal * (1 + markup / 100));
  } else if (resourceId === 'arInvoices' || resourceId === 'apBills' || resourceId === 'purchaseOrders') {
    const vatPct = n(current.vatPct ?? (resourceId === 'purchaseOrders' ? 15 : 0));
    const vat = round2(subtotal * vatPct / 100);
    if (cfg.vatKey) patch[cfg.vatKey] = vat;
    patch.total = round2(subtotal + vat);
  } else if (cfg.amountKey) {
    patch[cfg.amountKey] = subtotal;
  }
  return patch;
}
