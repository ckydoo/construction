/* Quote Studio: one plain-language draft object shared by the full-page
 * builder, reusable templates and the quote-template API. The final payload is
 * still a normal `estimates` record, so PDFs, conversions, RBAC, reporting and
 * the Convert to… chain keep working without a parallel data model. */
import { CURRENCIES, PROJECT_TYPES } from './resources';
import {
  LINE_CATEGORIES, normaliseLines, type DocLine, type LineCategory,
} from './financial';

export type QuoteLine = DocLine & { category: LineCategory };

export type QuoteDraft = {
  name: string;
  clientId: string;
  leadId: string;
  workType: string;
  currency: string;
  submittedDate: string;
  status: string;
  markup: number;
  revision: number;
  scope: string;
  items: QuoteLine[];
};

export type QuoteTemplatePayload = {
  name: string;
  workType: string;
  currency: string;
  markup: number;
  scope: string;
  items: QuoteLine[];
};

export type QuoteTemplate = {
  id: string;
  name: string;
  description: string;
  payload: QuoteTemplatePayload;
  builtIn?: boolean;
  icon?: string;
  accent?: string;
  createdByName?: string;
  updatedAt?: string;
};

export const QUOTE_STEPS = [
  { id:'start', label:'Start', hint:'Begin fresh or use a ready-made package' },
  { id:'client', label:'Client & job', hint:'Who it is for and what it is called' },
  { id:'price', label:'Build the price', hint:'Add work lines and choose your markup' },
  { id:'scope', label:'Scope & terms', hint:'Say exactly what is included' },
  { id:'review', label:'Review & save', hint:'Check the quotation before it goes out' },
] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const text = (v: unknown, max = 3000) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function emptyQuoteLine(category: LineCategory = 'labour'): QuoteLine {
  return { description:'', detail:'', qty:1, unitPrice:0, total:0, category };
}

function quoteLine(raw: any, fallback: LineCategory = 'materials'): QuoteLine {
  const line = normaliseLines([raw])[0];
  if (!line) return emptyQuoteLine(fallback);
  return {
    ...line,
    qty: Math.max(0, n(line.qty) || 1),
    unitPrice: Math.max(0, n(line.unitPrice)),
    total: round2(Math.max(0, n(line.qty) || 1) * Math.max(0, n(line.unitPrice))),
    category: line.category || fallback,
  };
}

const line = (
  description: string, detail: string, qty: number, unitPrice: number, category: LineCategory,
): QuoteLine => ({
  description, detail, qty, unitPrice, total: round2(qty * unitPrice), category,
});

export function blankQuoteDraft(): QuoteDraft {
  return {
    name:'', clientId:'', leadId:'', workType:'Commercial building', currency:'USD',
    submittedDate:'', status:'DRAFT', markup:15, revision:0, scope:'',
    items:[emptyQuoteLine('labour')],
  };
}

export const BUILT_IN_QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    id:'starter-renovation', name:'Renovation starter', icon:'Wand2', accent:'from-orange-50 to-amber-100',
    description:'A clear five-line starting point for small refurbishments and fit-outs.', builtIn:true,
    payload:{
      name:'Interior renovation quotation', workType:'Fit-out / refurb', currency:'USD', markup:18,
      scope:'Includes labour, standard materials, site cleaning and handover. Excludes structural alterations, statutory approvals and items not listed below. Valid for 30 days.',
      items:[
        line('Strip out and prepare existing areas', 'Protect adjacent finishes; remove nominated fixtures', 1, 1800, 'labour'),
        line('Supply plasterboard, trims and fixings', 'Standard specification, delivered to site', 1, 2600, 'materials'),
        line('Install partitions and ceilings', 'Setting out, framing, boarding and jointing', 48, 32, 'labour'),
        line('Paint and finish', 'Two coats to prepared surfaces', 1, 1450, 'subcontract'),
        line('Site supervision and cleaning', 'Daily checks, waste removal and final clean', 1, 850, 'overheads'),
      ],
    },
  },
  {
    id:'starter-concrete', name:'Concrete & civils', icon:'HardHat', accent:'from-sky-50 to-blue-100',
    description:'Excavation, reinforcement, concrete and finishing for a small civil package.', builtIn:true,
    payload:{
      name:'Concrete works quotation', workType:'Civil / roads', currency:'USD', markup:15,
      scope:'Includes setting out, excavation, blinding, reinforcement, concrete placement and curing. Excludes spoil removal off site, testing fees and unforeseen underground services. Valid for 30 days.',
      items:[
        line('Bulk excavation', 'Machine and hand trim to formation level', 120, 18, 'plant'),
        line('Blinding concrete', '50 mm class 15/20 blinding', 18, 95, 'materials'),
        line('Reinforcement supply and fix', 'B500B mesh and bars as per drawings', 2.4, 1450, 'subcontract'),
        line('Structural concrete', 'Class 30/37, placed, vibrated and cured', 46, 185, 'materials'),
        line('Formwork and finishing', 'Edge forms and power-floated surface', 1, 3200, 'labour'),
      ],
    },
  },
  {
    id:'starter-maintenance', name:'Maintenance call-out', icon:'Wrench', accent:'from-emerald-50 to-teal-100',
    description:'Fast, uncomplicated pricing for reactive repairs and small works.', builtIn:true,
    payload:{
      name:'Reactive maintenance quotation', workType:'Commercial building', currency:'USD', markup:22,
      scope:'Includes one site attendance during normal working hours, diagnosis, minor consumables and a short written report. Replacement parts and follow-up works are quoted separately. Valid for 14 days.',
      items:[
        line('Call-out and site attendance', 'Travel, inspection and fault diagnosis', 1, 180, 'labour'),
        line('Skilled technician', 'Up to four hours on site', 4, 45, 'labour'),
        line('Minor consumables', 'Sealants, fixings and standard spares', 1, 95, 'materials'),
        line('Supervision and report', 'Quality check and close-out note', 1, 75, 'overheads'),
      ],
    },
  },
  {
    id:'starter-electrical', name:'Electrical package', icon:'Zap', accent:'from-violet-50 to-purple-100',
    description:'Containment, cabling, distribution and testing for a typical small installation.', builtIn:true,
    payload:{
      name:'Electrical installation quotation', workType:'Commercial building', currency:'USD', markup:20,
      scope:'Includes containment, cabling, final connections, labelling and a standard test certificate. Excludes utility fees, standby power and builder work. Valid for 30 days.',
      items:[
        line('Cable trays and conduit', 'Supply and fix galvanised containment', 65, 22, 'materials'),
        line('Power and lighting cable', 'Sized and installed to approved layout', 420, 6.5, 'materials'),
        line('Distribution board', '12-way board with protective devices', 1, 1450, 'materials'),
        line('Installation labour', 'Electrician and assistant', 36, 48, 'labour'),
        line('Testing and commissioning', 'Continuity, insulation and functional tests', 1, 620, 'subcontract'),
      ],
    },
  },
];

export function quoteTotals(draft: QuoteDraft) {
  const lines = validQuoteLines(draft);
  const subtotal = round2(lines.reduce((sum, l) => sum + round2(l.qty * l.unitPrice), 0));
  const markupPct = clamp(n(draft.markup), 0, 1000);
  const markupAmount = round2(subtotal * markupPct / 100);
  const total = round2(subtotal + markupAmount);
  const byCategory = Object.fromEntries(LINE_CATEGORIES.map(c => [c.id, 0])) as Record<LineCategory, number>;
  for (const l of lines) byCategory[l.category] = round2(byCategory[l.category] + round2(l.qty * l.unitPrice));
  return { lines, subtotal, markupPct, markupAmount, total, byCategory };
}

export function validQuoteLines(draft: QuoteDraft): QuoteLine[] {
  return (draft.items || [])
    .map(l => quoteLine(l))
    .filter(l => !!text(l.description) && n(l.qty) > 0 && n(l.unitPrice) >= 0)
    .slice(0, 80);
}

/** Older quotes may have only the five cost buckets or a single total. Turn
 *  them into editable lines without changing the stored quote total. */
function linesFromLegacyRow(row: any, markupPct: number): QuoteLine[] {
  const out: QuoteLine[] = [];
  for (const c of LINE_CATEGORIES) {
    const amount = n(row?.[c.recordKey]);
    if (amount > 0) out.push(line(c.label, '', 1, round2(amount), c.id));
  }
  if (out.length) return out;
  const total = n(row?.total);
  if (total > 0) {
    const base = round2(total / (1 + markupPct / 100));
    out.push(line(text(row?.name || row?.title || 'Quoted works', 160), '', 1, base, 'materials'));
  }
  return out.length ? out : [emptyQuoteLine('labour')];
}

export function quoteDraftFromRow(row: any): QuoteDraft {
  const markup = clamp(n(row?.markup), 0, 1000);
  const stored = normaliseLines(row?.items);
  const items = stored.length
    ? stored.map(l => quoteLine(l))
    : linesFromLegacyRow(row, markup);
  return {
    name: text(row?.name || row?.title, 160),
    clientId: text(row?.clientId, 80),
    leadId: text(row?.leadId, 80),
    workType: PROJECT_TYPES.includes(text(row?.workType)) ? text(row?.workType) : PROJECT_TYPES[0],
    currency: CURRENCIES.includes(text(row?.currency)) ? text(row?.currency) : 'USD',
    submittedDate: text(row?.submittedDate, 20),
    status: text(row?.status, 40) || 'DRAFT',
    markup,
    revision: Math.max(0, Math.round(n(row?.revision))),
    scope: text(row?.scope),
    items: items.length ? items : [emptyQuoteLine('labour')],
  };
}

export function sanitiseTemplatePayload(raw: any): QuoteTemplatePayload {
  const source = raw && typeof raw === 'object' ? raw : {};
  const markup = clamp(n(source.markup), 0, 1000);
  const rawItems = Array.isArray(source.items) ? source.items.slice(0, 80) : [];
  const items = rawItems
    .map((x: any) => quoteLine(x))
    .filter((x: QuoteLine) => !!text(x.description) || x.unitPrice > 0)
    .slice(0, 60);
  return {
    name: text(source.name, 140) || 'Untitled quotation',
    workType: PROJECT_TYPES.includes(text(source.workType)) ? text(source.workType) : PROJECT_TYPES[0],
    currency: CURRENCIES.includes(text(source.currency)) ? text(source.currency) : 'USD',
    markup,
    scope: text(source.scope),
    items: items.length ? items : [emptyQuoteLine('labour')],
  };
}

export function quoteDraftFromTemplate(template: QuoteTemplate, base?: QuoteDraft): QuoteDraft {
  const payload = sanitiseTemplatePayload(template.payload);
  const root = base || blankQuoteDraft();
  return {
    ...root,
    name: payload.name,
    workType: payload.workType,
    currency: payload.currency,
    markup: payload.markup,
    scope: payload.scope,
    items: payload.items.map(x => ({ ...x })),
  };
}

export function templatePayloadFromDraft(draft: QuoteDraft): QuoteTemplatePayload {
  return sanitiseTemplatePayload({
    name: draft.name, workType: draft.workType, currency: draft.currency,
    markup: draft.markup, scope: draft.scope, items: draft.items,
  });
}

export function toRecordPayload(draft: QuoteDraft, status?: string): Record<string, any> {
  const totals = quoteTotals(draft);
  const items = totals.lines.map(l => ({
    description: text(l.description, 300), detail: text(l.detail, 500),
    qty: round2(l.qty), unitPrice: round2(l.unitPrice),
    total: round2(l.qty * l.unitPrice), category: l.category,
  }));
  return {
    name: text(draft.name, 160),
    clientId: text(draft.clientId, 80) || null,
    leadId: text(draft.leadId, 80) || null,
    workType: draft.workType || null,
    labourCost: totals.byCategory.labour,
    materialCost: totals.byCategory.materials,
    plantCost: totals.byCategory.plant,
    subcontractCost: totals.byCategory.subcontract,
    overheads: totals.byCategory.overheads,
    markup: totals.markupPct,
    total: totals.total,
    revision: Math.max(0, Math.round(n(draft.revision))),
    submittedDate: text(draft.submittedDate, 20) || null,
    currency: CURRENCIES.includes(draft.currency) ? draft.currency : 'USD',
    scope: text(draft.scope) || null,
    items,
    status: status || draft.status || 'DRAFT',
  };
}

export function validateQuoteDraft(draft: QuoteDraft, requireClient = false): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!text(draft.name)) errors.name = 'Give the quotation a short, recognisable title';
  if (requireClient && !text(draft.clientId)) errors.clientId = 'Choose a client before marking this quote ready to send';
  if (!validQuoteLines(draft).length) errors.items = 'Add at least one priced line with a description, quantity and rate';
  return errors;
}

export function quoteStudioHref(org: string, mode: 'new'|'edit', id?: string) {
  return `/${org}/quotes/${mode === 'edit' && id ? `${encodeURIComponent(id)}/edit` : 'new'}`;
}
