/* Receipt → project cash attribution (read-only).
 *
 * Money the client has paid must land on the job it settled:
 *   - A receipt pinned to a project is attributed to that project in full.
 *   - Otherwise, every non-reversed allocation line is attributed to the
 *     project of its invoice. Each amount is counted once.
 *   - Whatever is not allocated — and money pinned to neither a job nor an
 *     invoice — stays out of job cash and is reported separately as
 *     unallocated customer credit.
 *   - Reversed allocation batches contribute nothing to any project.
 *   Nothing here writes. Both call sites handle the legacy (non-allocated)
 *   deposits: they simply never land on a job, which is the honest result
 *   for money nobody has attributed yet.
 */
import { supabaseAdmin, hasServiceKey } from '@/lib/supabase';

export type AttributedPayment = {
  id: string;
  amount: number;
  currency: string;
  direction: string;
  status: string;
  paymentDate?: string;
  name?: string;
  number?: string;
  /** project = explicit receipt link; allocation = derived from invoice line */
  attribution: 'project' | 'allocation';
  allocatedInvoiceId?: string;
};

export type ReceiptAttribution = {
  /** projectId → rows to sum for the job's "cash received" */
  byProject: Map<string, AttributedPayment[]>;
  /** currency → money received that is pinned to no job (customer credit) */
  unallocated: Record<string, number>;
};

const num = (v: unknown) => { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function attributeReceiptsToProjects(
  orgId: string,
  receipts: any[],
  resolveInvoice: (invoiceId: string) => Promise<any | null>,
): Promise<ReceiptAttribution> {
  const byProject = new Map<string, AttributedPayment[]>();
  const unallocated: Record<string, number> = {};
  const push = (projectId: string, row: AttributedPayment) => {
    const list = byProject.get(projectId) || [];
    list.push(row);
    byProject.set(projectId, list);
  };
  const credit = (currency: string, amount: number) => {
    if (amount <= 0) return;
    const code = String(currency || 'USD').toUpperCase();
    unallocated[code] = round2((unallocated[code] || 0) + amount);
  };

  const explicit = receipts.filter(r => String(r?.projectId || '').trim());
  for (const r of explicit) {
    push(String(r.projectId).trim(), {
      id: String(r.id), amount: round2(num(r.amount)), currency: String(r.currency || 'USD').toUpperCase(),
      direction: String(r.direction || 'RECEIPT'), status: String(r.status || ''),
      paymentDate: r.paymentDate ? String(r.paymentDate) : undefined,
      name: r.name ? String(r.name) : undefined, number: r.number ? String(r.number) : undefined,
      attribution: 'project',
    });
  }

  const free = receipts.filter(r => !String(r?.projectId || '').trim());
  if (!free.length) return { byProject, unallocated };
  if (!hasServiceKey()) {
    // Cannot read allocation lines: keep explicit attributions, and do not
    // guess project owners for the rest.
    for (const r of free) credit(r.currency, num(r.amount));
    return { byProject, unallocated };
  }

  const admin = supabaseAdmin();
  const ids = free.map(r => String(r.id));
  const { data: batches, error: batchError } = await admin
    .from('receipt_allocation_batches')
    .select('id,receipt_id')
    .eq('organization_id', orgId)
    .is('reversed_at', null)
    .in('receipt_id', ids);
  if (batchError) { for (const r of free) credit(r.currency, num(r.amount)); return { byProject, unallocated }; }
  const receiptOfBatch = new Map<string, string>((batches || []).map((b: any) => [String(b.id), String(b.receipt_id)]));
  const batchIds = Array.from(receiptOfBatch.keys());
  const linesByReceipt = new Map<string, { invoiceId: string; amount: number }[]>();
  if (batchIds.length) {
    const { data: lines, error: lineError } = await admin
      .from('receipt_allocation_lines')
      .select('batch_id,invoice_id,amount_minor')
      .eq('organization_id', orgId)
      .in('batch_id', batchIds);
    if (!lineError) {
      for (const l of lines || []) {
        const receiptId = receiptOfBatch.get(String((l as any).batch_id));
        if (!receiptId) continue;
        const list = linesByReceipt.get(receiptId) || [];
        list.push({ invoiceId: String((l as any).invoice_id), amount: num((l as any).amount_minor) / 100 });
        linesByReceipt.set(receiptId, list);
      }
    }
  }

  const invoiceCache = new Map<string, any | null>();
  for (const r of free) {
    const allocs = linesByReceipt.get(String(r.id)) || [];
    const currency = String(r.currency || 'USD').toUpperCase();
    let allocated = 0;
    for (const alloc of allocs) {
      let invoice = invoiceCache.get(alloc.invoiceId);
      if (invoice === undefined) {
        try { invoice = await resolveInvoice(alloc.invoiceId); } catch { invoice = null; }
        invoiceCache.set(alloc.invoiceId, invoice);
      }
      const projectId = invoice ? String(invoice.projectId || '').trim() : '';
      allocated += alloc.amount;
      if (projectId) {
        push(projectId, {
          id: `${r.id}:${alloc.invoiceId}`, amount: round2(alloc.amount), currency,
          direction: 'RECEIPT', status: String(r.status || ''),
          paymentDate: r.paymentDate ? String(r.paymentDate) : undefined,
          name: r.name ? String(r.name) : undefined, number: r.number ? String(r.number) : undefined,
          attribution: 'allocation', allocatedInvoiceId: alloc.invoiceId,
        });
      } else {
        credit(currency, alloc.amount);
      }
    }
    const remainder = num(r.amount) - allocated;
    if (remainder > 0.004) credit(currency, remainder);
  }

  return { byProject, unallocated };
}

/** Map each invoice with at least one non-reversed allocation to the receipts
 *  that settled it. Used to show the "receipt" stage of the job chain as done
 *  even though settlement receipts are not created by the invoice conversion. */
export async function allocatedReceiptsForInvoices(orgId: string): Promise<Map<string, { receiptId: string; amount: number }[]>> {
  const map = new Map<string, { receiptId: string; amount: number }[]>();
  if (!hasServiceKey()) return map;
  const admin = supabaseAdmin();
  const { data: batches, error: batchError } = await admin
    .from('receipt_allocation_batches')
    .select('id,receipt_id')
    .eq('organization_id', orgId)
    .is('reversed_at', null);
  if (batchError || !batches?.length) return map;
  const receiptOfBatch = new Map<string, string>(batches.map((b: any) => [String(b.id), String(b.receipt_id)]));
  const batchIds = Array.from(receiptOfBatch.keys());
  for (let i = 0; i < batchIds.length; i += 200) {
    const chunk = batchIds.slice(i, i + 200);
    const { data: lines, error: lineError } = await admin
      .from('receipt_allocation_lines')
      .select('batch_id,invoice_id,amount_minor')
      .eq('organization_id', orgId)
      .in('batch_id', chunk);
    if (lineError) continue;
    for (const l of lines || []) {
      const receiptId = receiptOfBatch.get(String((l as any).batch_id));
      if (!receiptId) continue;
      const invoiceId = String((l as any).invoice_id);
      const list = map.get(invoiceId) || [];
      list.push({ receiptId, amount: num((l as any).amount_minor) / 100 });
      map.set(invoiceId, list);
    }
  }
  return map;
}
