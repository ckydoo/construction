/* Pure receipt-allocation arithmetic. Database locking, authorisation, audit,
 * persistence and idempotency are separate required controls; these helpers do
 * not settle invoices and are not yet wired to production. */
export function cents(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Amount must be a non-negative decimal with at most two decimal places.');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function decimal(value: bigint): string {
  if (value < 0n) throw new Error('Amount cannot be negative.');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

type Invoice = { id: string; currency: string; gross: string; allocated: string };
type RequestedAllocation = { invoiceId: string; amount: string };
export type AllocationPlan = { allocations: { invoiceId: string; amount: string }[]; unallocated: string };

/** Checks one receipt against current authoritative balances, supplied by the
 * caller while holding database locks. Never call with cached UI balances. */
export function planReceiptAllocation(receiptAmount: string, receiptCurrency: string, invoices: Invoice[], requests: RequestedAllocation[]): AllocationPlan {
  const total = cents(receiptAmount);
  if (total <= 0n) throw new Error('Receipt amount must be positive.');
  const currency = receiptCurrency.trim().toUpperCase();
  if (!currency) throw new Error('Receipt currency is required.');
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]));
  if (byId.size !== invoices.length) throw new Error('Duplicate invoice balance.');
  const seen = new Set<string>();
  let assigned = 0n;
  const allocations = requests.map(request => {
    if (seen.has(request.invoiceId)) throw new Error('Duplicate invoice allocation.');
    seen.add(request.invoiceId);
    const invoice = byId.get(request.invoiceId);
    if (!invoice) throw new Error('Invoice is not available for allocation.');
    if (invoice.currency.trim().toUpperCase() !== currency) throw new Error('Receipt and invoice currencies must match.');
    const gross = cents(invoice.gross), prior = cents(invoice.allocated), amount = cents(request.amount);
    if (prior > gross) throw new Error('Invoice allocations exceed its gross amount.');
    if (amount <= 0n) throw new Error('Allocation must be positive.');
    if (amount > gross - prior) throw new Error('Allocation exceeds the outstanding invoice balance.');
    assigned += amount;
    if (assigned > total) throw new Error('Allocations exceed the receipt amount.');
    return { invoiceId: request.invoiceId, amount: decimal(amount) };
  });
  return { allocations, unallocated: decimal(total - assigned) };
}
