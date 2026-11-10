'use client';
import { Button, Icon } from './ui';
import type { DocLine } from '@/lib/financial';
import { editableLines } from '@/lib/financial';

const m = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = 'input h-9 px-2 text-xs';

export default function LineItemsEditor({
  value, onChange, currency = 'USD', vatPct = 0, markupPct = 0,
}: {
  value: any; onChange: (lines: DocLine[]) => void;
  currency?: string; vatPct?: number; markupPct?: number;
}) {
  const lines = editableLines(value);
  const update = (i: number, patch: Partial<DocLine>) => {
    const next = lines.map((l, j) => i === j ? { ...l, ...patch } : l);
    onChange(next.map(l => ({ ...l, total: Math.round(l.qty * l.unitPrice * 100) / 100 })));
  };
  const remove = (i: number) => onChange(lines.filter((_, j) => j !== i));
  const add = () => onChange([...lines, { description: '', detail: '', qty: 1, unitPrice: 0, total: 0 }]);
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const tax = subtotal * (Number(vatPct) || 0) / 100;
  const markup = subtotal * (Number(markupPct) || 0) / 100;
  const total = subtotal + tax + markup;
  return <div className="space-y-2">
    <div className="overflow-x-auto rounded-md border divider">
      <table className="w-full min-w-[620px] text-xs">
        <thead className="bg-slate-50 dark:bg-ink-800/60"><tr>
          <th className="w-9 px-2 py-2 text-left font-semibold muted">#</th>
          <th className="px-2 py-2 text-left font-semibold">Description</th>
          <th className="w-20 px-2 py-2 text-right font-semibold">Qty</th>
          <th className="w-28 px-2 py-2 text-right font-semibold">Unit price</th>
          <th className="w-28 px-2 py-2 text-right font-semibold">Subtotal</th>
          <th className="w-10 px-2 py-2"/>
        </tr></thead>
        <tbody className="divide-y divider">
          {lines.map((l, i) => <tr key={i} className="align-top">
            <td className="px-2 py-2 muted">{i + 1}</td>
            <td className="px-2 py-2 space-y-1.5">
              <input className={input} value={l.description} onChange={e => update(i, { description: e.target.value })} placeholder="Work or material description"/>
              <input className={`${input} muted`} value={l.detail} onChange={e => update(i, { detail: e.target.value })} placeholder="Optional specification / note"/>
            </td>
            <td className="px-2 py-2"><input className={`${input} text-right`} type="number" min="0" step="any" value={l.qty} onChange={e => update(i, { qty: Number(e.target.value) || 0 })}/></td>
            <td className="px-2 py-2"><input className={`${input} text-right`} type="number" min="0" step="any" value={l.unitPrice} onChange={e => update(i, { unitPrice: Number(e.target.value) || 0 })}/></td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums">{m(l.total)}</td>
            <td className="px-2 py-2"><button type="button" title="Remove line" className="rounded p-1.5 muted hover:bg-red-50 hover:text-red-600" onClick={() => remove(i)}><Icon name="Trash2" size={14}/></button></td>
          </tr>)}
          {!lines.length&&<tr><td colSpan={6} className="px-3 py-6 text-center muted">Add at least one description, quantity and unit price to print an itemised financial document.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" size="sm" variant="ghost" icon="Plus" onClick={add}>Add line</Button>
      <div className="min-w-[230px] space-y-1 rounded-md border divider bg-slate-50/70 p-2.5 text-xs dark:bg-ink-950/30">
        <div className="flex justify-between"><span className="muted">Subtotal</span><span className="font-semibold tabular-nums">{currency} {m(subtotal)}</span></div>
        {tax > 0&&<div className="flex justify-between"><span className="muted">VAT ({Number(vatPct) || 0}%)</span><span className="tabular-nums">{m(tax)}</span></div>}
        {markup > 0&&<div className="flex justify-between"><span className="muted">Markup ({Number(markupPct) || 0}%)</span><span className="tabular-nums">{m(markup)}</span></div>}
        <div className="flex justify-between border-t divider pt-1 text-sm"><span className="font-semibold">Total</span><span className="font-bold tabular-nums">{currency} {m(total)}</span></div>
      </div>
    </div>
    <p className="caption">Totals are recalculated from these lines when you save. If you leave this table empty, the existing amount fields are used, so older records still print correctly.</p>
  </div>;
}
