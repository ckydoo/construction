/* Server-side rules for "Convert to…".
 *
 * A conversion is deliberately non-destructive: it creates one or more NEW
 * draft records, copies the useful fields forward, writes hidden provenance
 * keys (sourceResource / sourceId / sourceNumber / sourceLabel) and optionally
 * advances the source record's status. It never edits values on the source
 * other than the declared sourcePatch, never deletes anything and refuses to
 * create a second copy of the same step.
 *
 * All payloads use the exact field keys from src/lib/resources.ts so the
 * normal createRecord() validation, auto-numbering, ref checks, derived
 * financial totals, activity log and RLS still apply. */
import { RESOURCE_MAP } from './resources';
import { normaliseLines } from './financial';
import { SOURCE_KEYS } from './conversion-chain';

export type BuildCtx = { today: string; addDays: (days: number) => string };
export type ConversionAlso = {
  resource: string;
  label: string;
  build: (src: any, primary: any, ctx: BuildCtx) => Record<string, any>;
};
export type ConversionRule = {
  id: string;
  from: string;
  to: string;
  label: string;
  hint: string;
  icon: string;
  build: (src: any, ctx: BuildCtx) => Record<string, any>;
  also?: ConversionAlso[];
  sourcePatch?: (src: any) => Record<string, any>;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const amount = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const text = (v: any) => (v === null || v === undefined || v === '' ? null : String(v));
const titleOf = (s: any) => String(s?.name || s?.title || s?.number || 'Untitled');
const ref = (v: any) => (v ? String(v) : null);

/** Itemised lines scaled to the final selling price. Quote lines are cost lines;
 * copying them verbatim would make a tender's bidValue equal the pre-markup
 * subtotal, so each line is scaled by (1 + markup%). If the source has no
 * structured lines, one clean line carrying the final amount is used instead. */
function pricedLines(items: any, markupPct: any, fallback: any, label: string) {
  const factor = 1 + (Number(markupPct) || 0) / 100;
  const lines = normaliseLines(items).map(l => ({
    description: l.description,
    detail: l.detail,
    qty: l.qty,
    unitPrice: round2(l.unitPrice * factor),
    total: round2(l.total * factor),
  }));
  if (lines.length) return lines;
  const v = amount(fallback);
  return v ? [{ description: label, detail: '', qty: 1, unitPrice: v, total: v }] : [];
}

export function provenance(sourceResource: string, source: any): Record<string, any> {
  const number = String(source?.number || '');
  const title = String(source?.title || source?.name || '');
  return {
    [SOURCE_KEYS.resource]: sourceResource,
    [SOURCE_KEYS.id]: String(source?.id || ''),
    [SOURCE_KEYS.number]: number,
    [SOURCE_KEYS.label]: [number, title].filter(Boolean).join(' · ') || title || sourceResource,
  };
}

export const CONVERSION_RULES: ConversionRule[] = [
  {
    id: 'client-to-enquiry', from: 'clients', to: 'leads',
    label: 'Log an enquiry', icon: 'Target',
    hint: 'Starts a new job in the pipeline, already linked to this client.',
    build: (s) => ({
      name: `New enquiry – ${titleOf(s)}`,
      clientId: ref(s.id),
      stage: 'IDENTIFIED',
      status: 'OPEN',
      source: 'Repeat client',
      notes: `Created from client ${s.number || titleOf(s)}.`,
    }),
  },
  {
    id: 'enquiry-to-quote', from: 'leads', to: 'estimates',
    label: 'Convert to quotation', icon: 'Calculator',
    hint: 'Copies the client, expected value, work type and notes into a draft quotation.',
    build: (s) => ({
      name: titleOf(s),
      clientId: ref(s.clientId),
      leadId: ref(s.id),
      workType: text(s.workType),
      total: amount(s.value),
      markup: 0,
      revision: 0,
      currency: 'USD',
      scope: text(s.notes),
      items: [],
      status: 'DRAFT',
    }),
  },
  {
    id: 'quote-to-tender', from: 'estimates', to: 'bids',
    label: 'Convert to tender', icon: 'FileText',
    hint: 'Carries the priced lines and the final quote total into a tender submission.',
    build: (s) => ({
      name: titleOf(s),
      clientId: ref(s.clientId),
      tenderNo: text(s.number),
      bidValue: amount(s.total),
      closingDate: text(s.submittedDate),
      notes: text(s.scope),
      items: pricedLines(s.items, s.markup, s.total, `As per quotation ${s.number || ''}`),
      outcome: 'PENDING',
    }),
  },
  {
    id: 'quote-to-job', from: 'estimates', to: 'projects',
    label: 'Award as job + contract', icon: 'HardHat',
    hint: 'Award the quote without a formal tender. Creates the job AND its prime contract in one step.',
    build: (s) => ({
      name: titleOf(s),
      code: text(s.number),
      clientId: ref(s.clientId),
      type: text(s.workType),
      contractValue: amount(s.total),
      currency: text(s.currency) || 'USD',
      scope: text(s.scope),
      status: 'PLANNING',
    }),
    also: [{
      resource: 'contracts', label: 'Prime contract',
      build: (s, p) => ({
        name: `Prime contract – ${titleOf(s)}`,
        projectId: ref(p.id),
        clientId: ref(s.clientId),
        kind: 'Prime contract',
        value: amount(s.total),
        items: pricedLines(s.items, s.markup, s.total, `As per quotation ${s.number || ''}`),
        status: 'DRAFT',
      }),
    }],
    sourcePatch: () => ({ status: 'AWARDED' }),
  },
  {
    id: 'tender-to-job', from: 'bids', to: 'projects',
    label: 'Award as job + contract', icon: 'HardHat',
    hint: 'Award the tender. Creates the job AND its prime contract in one step.',
    build: (s) => ({
      name: titleOf(s),
      code: text(s.tenderNo || s.number),
      clientId: ref(s.clientId),
      contractFlavour: text(s.contractFlavour),
      contractValue: amount(s.bidValue),
      scope: text(s.notes),
      status: 'PLANNING',
    }),
    also: [{
      resource: 'contracts', label: 'Prime contract',
      build: (s, p) => ({
        name: `Prime contract – ${titleOf(s)}`,
        projectId: ref(p.id),
        clientId: ref(s.clientId),
        kind: 'Prime contract',
        contractFlavour: text(s.contractFlavour),
        value: amount(s.bidValue),
        items: pricedLines(s.items, 0, s.bidValue, `As per tender ${s.tenderNo || s.number || ''}`),
        status: 'DRAFT',
      }),
    }],
    sourcePatch: () => ({ outcome: 'AWARDED' }),
  },
  {
    id: 'job-to-contract', from: 'projects', to: 'contracts',
    label: 'Create prime contract', icon: 'FileSignature',
    hint: 'Creates a contract linked to this job with the agreed contract sum.',
    build: (s) => ({
      name: `Prime contract – ${titleOf(s)}`,
      projectId: ref(s.id),
      clientId: ref(s.clientId),
      kind: 'Prime contract',
      contractFlavour: text(s.contractFlavour),
      value: amount(s.contractValue),
      items: amount(s.contractValue)
        ? [{ description: titleOf(s), detail: 'Agreed contract sum', qty: 1, unitPrice: amount(s.contractValue), total: amount(s.contractValue) }]
        : [],
      status: 'DRAFT',
    }),
  },
  {
    id: 'contract-to-certificate', from: 'contracts', to: 'paymentApps',
    label: 'Create payment certificate', icon: 'Receipt',
    hint: 'Starts certificate no. 1 for this contract, already linked to its job and client.',
    build: (s, c) => ({
      name: `Payment certificate 1 – ${titleOf(s)}`,
      projectId: ref(s.projectId),
      clientId: ref(s.clientId),
      certificateNo: 1,
      periodEnd: c.today,
      items: [],
      status: 'DRAFT',
    }),
  },
  {
    id: 'job-to-certificate', from: 'projects', to: 'paymentApps',
    label: 'Create payment certificate', icon: 'Receipt',
    hint: 'Starts certificate no. 1 directly on this job if you do not use a separate contract.',
    build: (s, c) => ({
      name: `Payment certificate 1 – ${titleOf(s)}`,
      projectId: ref(s.id),
      clientId: ref(s.clientId),
      certificateNo: 1,
      periodEnd: c.today,
      items: [],
      status: 'DRAFT',
    }),
  },
  {
    id: 'job-to-invoice', from: 'projects', to: 'arInvoices',
    label: 'Create tax invoice directly', icon: 'FileText',
    hint: 'Creates a draft tax invoice straight from the job when you do not use payment certificates.',
    build: (s, c) => ({
      name: `Tax invoice – ${titleOf(s)}`,
      projectId: ref(s.id),
      clientId: ref(s.clientId),
      invoiceDate: c.today,
      dueDate: c.addDays(30),
      vatPct: 15,
      taxInvoiceNo: '',
      amountPaid: 0,
      currency: text(s.currency) || 'USD',
      items: pricedLines([], 0, s.contractValue ?? s.budget, `Works as per job ${s.number || ''}`.trim()),
      status: 'DRAFT',
    }),
  },
  {
    id: 'certificate-to-invoice', from: 'paymentApps', to: 'arInvoices',
    label: 'Convert to tax invoice', icon: 'FileText',
    hint: 'Turns the net certified amount into a draft tax invoice, VAT and due date calculated for you.',
    build: (s, c) => {
      const net = Number(s.netCertified ?? s.grossCertified) || 0;
      const vat = Number(s.vatAmount) || 0;
      const vatPct = net && vat ? round2((vat / net) * 100) : 15;
      return {
        name: `Tax invoice – ${titleOf(s)}`,
        projectId: ref(s.projectId),
        clientId: ref(s.clientId),
        invoiceDate: c.today,
        dueDate: c.addDays(30),
        vatPct,
        taxInvoiceNo: '',
        amountPaid: 0,
        currency: 'USD',
        items: [{
          description: `Interim certificate ${s.certificateNo || s.number || ''}`.trim(),
          detail: '',
          qty: 1,
          unitPrice: net,
          total: net,
        }],
        status: 'DRAFT',
      };
    },
  },
  {
    id: 'invoice-to-receipt', from: 'arInvoices', to: 'payments',
    label: 'Record receipt in full', icon: 'Banknote',
    hint: 'Records the money received and marks this invoice paid in full.',
    build: (s, c) => ({
      name: `Receipt for ${s.number || titleOf(s)}`,
      direction: 'RECEIPT',
      clientId: ref(s.clientId),
      projectId: ref(s.projectId),
      paymentDate: c.today,
      amount: amount(s.total ?? s.amount),
      method: 'Bank transfer',
      reference: text(s.number),
      currency: text(s.currency) || 'USD',
      items: [],
      status: 'CLEARED',
    }),
    sourcePatch: (s) => ({ status: 'PAID', amountPaid: Number(s.total ?? s.amount) || 0 }),
  },
];

export function buildContext(): BuildCtx {
  const today = new Date().toISOString().slice(0, 10);
  return {
    today,
    addDays: (days: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    },
  };
}

/** Human-readable preview of what a conversion will copy, shown before Create. */
export function buildPreview(resourceId: string, payload: Record<string, any>): { label: string; value: string }[] {
  const def = RESOURCE_MAP[resourceId];
  if (!def) return [];
  const out: { label: string; value: string }[] = [];
  for (const f of def.fields) {
    if (f.hidden || f.key === 'status' || f.type === 'ref') continue;
    const v = payload[f.key];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    let value: string;
    if (f.type === 'items') {
      const n = normaliseLines(v).length;
      value = `${n} itemised line${n === 1 ? '' : 's'}`;
    } else if (f.type === 'currency') {
      value = Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (f.type === 'select') {
      value = String(v).replace(/_/g, ' ');
    } else {
      value = String(v).slice(0, 140);
    }
    out.push({ label: f.label, value });
    if (out.length >= 9) break;
  }
  return out;
}

export function describePatch(fromResource: string, patch: Record<string, any>): string {
  const def = RESOURCE_MAP[fromResource];
  return Object.entries(patch).map(([k, v]) => {
    const label = def?.fields.find(f => f.key === k)?.label || k;
    return `${label} → ${String(v).replace(/_/g, ' ')}`;
  }).join(', ');
}
