/* Project close-out review: what an owner should see before removing a job from
 * the active portfolio. Computed server-side, identical on the read preview and
 * on the closing action — never a client-side-only check. Money figures stay in
 * each record's own currency and are reported as a sum labelled with the
 * workspace base for context; the close decision must not hinge on mixing FX.
 */
import { rowsForScoped } from './access';
import type { AuthCtx } from './auth';
import { buildScope, type Scope } from './access';
import { getRecord } from './records';

export const CLOSURE_TYPES = ['COMPLETION', 'CANCELLATION', 'ADMINISTRATIVE'] as const;
export type ClosureType = typeof CLOSURE_TYPES[number];
export const CLOSURE_LABEL: Record<ClosureType, string> = {
  COMPLETION: 'Successful completion',
  CANCELLATION: 'Cancellation',
  ADMINISTRATIVE: 'Administrative closure',
};

export type CloseoutIssue = { key: string; label: string; detail: string };

export type CloseoutSummary = {
  closureTypes: readonly ClosureType[];
  progress: number;
  status: string;
  actualCompletion: string | null;
  issues: CloseoutIssue[];
  counts: {
    incompleteTasks: number;
    pendingChangeOrders: number;
    draftInvoices: number;
    outstandingInvoices: number;
    openPunchItems: number;
    openRfis: number;
  };
  outstandingInvoiceTotal: number;
  outstandingInvoiceCurrency: string | null;
  walletFunded: boolean;
  walletRemaining: number;
  baseCurrency: string;
};

const up = (v: any) => String(v || '').toUpperCase();
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function projectCloseout(orgId: string, id: string, a: AuthCtx, scopeIn?: Scope): Promise<CloseoutSummary | null> {
  const scope = scopeIn || await buildScope(a);
  const project = await getRecord(orgId, 'projects', id, scope);
  if (!project) return null;
  const base = String(a.config?.currency?.base || a.org?.baseCurrency || 'USD').toUpperCase();

  const [tasks, changeOrders, arInvoices, punchLists, rfis] = await Promise.all([
    rowsForScoped(a, scope, 'tasks', id),
    rowsForScoped(a, scope, 'changeOrders', id),
    rowsForScoped(a, scope, 'arInvoices', id),
    rowsForScoped(a, scope, 'punchLists', id),
    rowsForScoped(a, scope, 'rfis', id),
  ]);

  const incompleteTasks = tasks.filter(t => !['COMPLETE', 'CANCELLED'].includes(up(t.status))).length;
  const pendingChangeOrders = changeOrders.filter(c => ['SUBMITTED', 'UNDER_REVIEW'].includes(up(c.status))).length;
  const draftInvoices = arInvoices.filter(i => up(i.status) === 'DRAFT').length;
  const issued = arInvoices.filter(i => !['DRAFT', 'VOID'].includes(up(i.status)));
  const outstanding = issued.filter(i => num(i.total) - num(i.amountPaid) > 0.004);
  const outstandingInvoiceTotal = outstanding.reduce((t, i) => t + num(i.total) - num(i.amountPaid), 0);
  const outstandingInvoiceCurrency = outstanding.length === 1 ? String(outstanding[0].currency || base).toUpperCase() : null;
  const openPunchItems = punchLists.filter(p => up(p.status) !== 'CLOSED').length;
  const openRfis = rfis.filter(r => up(r.status) !== 'CLOSED').length;
  const progress = num(project.progress);
  const walletFunded = num(project.fundedAmount) > 0;
  const walletRemaining = walletFunded ? num(project.remainingToFund) : 0;

  const issues: CloseoutIssue[] = [];
  if (incompleteTasks > 0) issues.push({ key: 'tasks', label: 'Unfinished tasks', detail: `${incompleteTasks} task${incompleteTasks === 1 ? '' : 's'} not marked COMPLETE or CANCELLED.` });
  if (progress < 100) issues.push({ key: 'progress', label: 'Programme below 100%', detail: `Physical progress is recorded at ${progress}%.` });
  if (pendingChangeOrders > 0) issues.push({ key: 'variations', label: 'Variations awaiting decision', detail: `${pendingChangeOrders} change order${pendingChangeOrders === 1 ? ' is' : 's are'} submitted or under review.` });
  if (draftInvoices > 0) issues.push({ key: 'drafts', label: 'Unissued invoices', detail: `${draftInvoices} draft invoice${draftInvoices === 1 ? '' : 's'} has never been issued.` });
  if (outstanding.length > 0) issues.push({ key: 'receivables', label: 'Outstanding receivables', detail: `${outstanding.length} issued invoice${outstanding.length === 1 ? '' : 's'} still owed (${outstandingInvoiceTotal.toLocaleString('en-GB', { maximumFractionDigits: 2 })}${outstandingInvoiceCurrency ? ` ${outstandingInvoiceCurrency}` : ` ${base} (mixed currencies)`} across them).` });
  if (openPunchItems > 0) issues.push({ key: 'punch', label: 'Open punch items', detail: `${openPunchItems} punch-list item${openPunchItems === 1 ? '' : 's'} not closed out.` });
  if (openRfis > 0) issues.push({ key: 'rfis', label: 'Open RFIs', detail: `${openRfis} request${openRfis === 1 ? '' : 's'} for information not closed.` });
  if (walletRemaining > 0.004) issues.push({ key: 'funding', label: 'Wallet funding outstanding', detail: `${walletRemaining.toLocaleString('en-GB', { maximumFractionDigits: 2 })} of client wallet funding has not been allocated.` });

  return {
    closureTypes: CLOSURE_TYPES,
    progress,
    status: up(project.status),
    actualCompletion: String(project.actualCompletion || '') || null,
    issues,
    counts: { incompleteTasks, pendingChangeOrders, draftInvoices, outstandingInvoices: outstanding.length, openPunchItems, openRfis },
    outstandingInvoiceTotal,
    outstandingInvoiceCurrency,
    walletFunded,
    walletRemaining,
    baseCurrency: base,
  };
}
