'use client';
import { Button, Icon } from './ui';
import { money } from '@/lib/format';
import { LINE_CATEGORIES, type LineCategory } from '@/lib/financial';
import { emptyQuoteLine, type QuoteLine } from '@/lib/quote-studio';

const round2 = (v: number) => Math.round(v * 100) / 100;
const input = 'input h-9 px-2.5 text-xs';
const tone: Record<LineCategory, string> = {
  labour: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  materials: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  plant: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  subcontract: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  overheads: 'bg-slate-100 text-ink-600 dark:bg-ink-800 dark:text-slate-300',
};

export default function QuoteLinesEditor({
  value, onChange, currency = 'USD',
}: {
  value: QuoteLine[]; onChange: (lines: QuoteLine[]) => void; currency?: string;
}) {
  const lines = value.length ? value : [emptyQuoteLine('labour')];
  const update = (i: number, patch: Partial<QuoteLine>) => onChange(lines.map((l, j) => {
    if (i !== j) return l;
    const next = { ...l, ...patch };
    return { ...next, qty: Math.max(0, Number(next.qty) || 0), unitPrice: Math.max(0, Number(next.unitPrice) || 0), total: round2(Math.max(0, Number(next.qty) || 0) * Math.max(0, Number(next.unitPrice) || 0)) };
  }));
  const add = (category: LineCategory = 'materials') => onChange([...lines, emptyQuoteLine(category)]);
  const duplicate = (i: number) => onChange([...lines.slice(0, i + 1), { ...lines[i] }, ...lines.slice(i + 1)]);
  const remove = (i: number) => onChange(lines.length === 1 ? [emptyQuoteLine('labour')] : lines.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= lines.length) return;
    const next = [...lines]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };
  const subtotal = round2(lines.reduce((sum, l) => sum + round2((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)), 0));

  return <div className="space-y-3">
    <div className="space-y-2.5">
      {lines.map((l, i) => <div key={i} className="rounded-lg border divider bg-white p-3 shadow-card dark:bg-ink-900">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-ink-600 dark:bg-ink-800 dark:text-slate-300">{i + 1}</span>
          <Icon name="GripVertical" size={14} className="text-slate-300 dark:text-ink-700"/>
          <select className="select h-8 w-auto min-w-[150px] py-0 text-xs" value={l.category}
            onChange={e => update(i, { category: e.target.value as LineCategory })}
            aria-label={`Line ${i + 1} cost category`}>
            {LINE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone[l.category]}`}>{LINE_CATEGORIES.find(c => c.id === l.category)?.label}</span>
          <span className="ml-auto text-xs font-semibold tabular-nums text-ink-900 dark:text-white">{money(l.total, currency)}</span>
          <div className="flex gap-0.5">
            <button type="button" className="rounded p-1.5 muted hover:bg-slate-100 dark:hover:bg-ink-800" title="Move up" onClick={() => move(i, -1)}><Icon name="ChevronUp" size={13}/></button>
            <button type="button" className="rounded p-1.5 muted hover:bg-slate-100 dark:hover:bg-ink-800" title="Move down" onClick={() => move(i, 1)}><Icon name="ChevronDown" size={13}/></button>
            <button type="button" className="rounded p-1.5 muted hover:bg-slate-100 dark:hover:bg-ink-800" title="Duplicate line" onClick={() => duplicate(i)}><Icon name="Copy" size={13}/></button>
            <button type="button" className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" title="Remove line" onClick={() => remove(i)}><Icon name="Trash2" size={13}/></button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_120px]">
          <input className={`${input} sm:col-span-3`} value={l.description} onChange={e => update(i, { description: e.target.value })}
            placeholder="What work or material is this?"/>
          <input className={`${input} muted`} value={l.detail} onChange={e => update(i, { detail: e.target.value })}
            placeholder="Optional detail / specification"/>
          <label className="relative"><span className="absolute left-2 top-2 text-[10px] uppercase muted">Qty</span>
            <input className={`${input} pl-9 text-right`} type="number" min="0" step="any" value={l.qty}
              onChange={e => update(i, { qty: e.target.value === '' ? 0 : Number(e.target.value) })}/></label>
          <label className="relative"><span className="absolute left-2 top-2 text-[10px] uppercase muted">{currency}</span>
            <input className={`${input} pl-10 text-right`} type="number" min="0" step="any" value={l.unitPrice}
              onChange={e => update(i, { unitPrice: e.target.value === '' ? 0 : Number(e.target.value) })}/></label>
        </div>
      </div>)}
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-lg border divider bg-slate-50/70 p-3 dark:bg-ink-950/40">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide muted">Add a line</span>
      {LINE_CATEGORIES.map(c => <button type="button" key={c.id} onClick={() => add(c.id)}
        className="rounded-md border divider bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-700 transition hover:border-brand-400 hover:text-brand-700 dark:bg-ink-900 dark:text-slate-200">
        <Icon name="Plus" size={11} className="mr-1 inline"/>{c.label}</button>)}
      <span className="ml-auto text-xs font-semibold tabular-nums text-ink-900 dark:text-white">Cost subtotal {money(subtotal, currency)}</span>
    </div>
    <p className="caption">Enter a description, quantity and unit rate. The builder recalculates each line, the five cost buckets and the final total as you type.</p>
  </div>;
}
