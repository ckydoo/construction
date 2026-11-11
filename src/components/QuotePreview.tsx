'use client';
import { Badge, Icon } from './ui';
import { money, date } from '@/lib/format';
import { LINE_CATEGORIES } from '@/lib/financial';
import { quoteTotals, type QuoteDraft } from '@/lib/quote-studio';

export default function QuotePreview({
  draft, clientLabel = '', orgName = 'Your company',
}: { draft: QuoteDraft; clientLabel?: string; orgName?: string }) {
  const totals = quoteTotals(draft);
  const shown = totals.lines.slice(0, 8);
  const more = totals.lines.length - shown.length;
  return <div className="overflow-hidden rounded-xl border divider bg-white shadow-panel dark:bg-ink-900">
    <div className="relative overflow-hidden bg-ink-900 px-5 py-4 text-white">
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand-500/20"/>
      <div className="absolute right-10 top-6 h-12 w-12 rounded-full border border-white/10"/>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300">Quotation preview</p>
          <h3 className="mt-1 truncate text-lg font-semibold">{draft.name || 'Untitled quotation'}</h3>
          <p className="mt-0.5 truncate text-[11px] text-slate-300">{orgName} · {draft.currency} · {draft.workType || 'General works'}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-ink-950"><Icon name="Quote" size={18}/></span>
      </div>
    </div>
    <div className="grid gap-3 border-b divider px-5 py-4 text-xs sm:grid-cols-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-wide muted">Prepared for</p><p className="mt-1 font-medium text-ink-900 dark:text-white">{clientLabel || 'Choose a client'}</p></div>
      <div><p className="text-[10px] font-semibold uppercase tracking-wide muted">Date</p><p className="mt-1 font-medium text-ink-900 dark:text-white">{draft.submittedDate ? date(draft.submittedDate) : 'Not set'}</p></div>
      <div><p className="text-[10px] font-semibold uppercase tracking-wide muted">Status</p><div className="mt-1"><Badge tone={draft.status === 'DRAFT' ? 'slate' : 'green'}>{draft.status.replace(/_/g, ' ')}</Badge></div></div>
    </div>
    <div className="px-5 py-4">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_50px_85px] gap-2 border-b divider pb-2 text-[10px] font-semibold uppercase tracking-wide muted">
        <span>Description</span><span className="text-right">Qty</span><span className="text-right">Amount</span>
      </div>
      <div className="space-y-2">
        {!shown.length && <p className="py-5 text-center text-xs muted">Add a priced line to see it here.</p>}
        {shown.map((l, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_50px_85px] gap-2 text-xs">
          <div className="min-w-0"><p className="truncate font-medium text-ink-800 dark:text-slate-200">{l.description}</p>
            <p className="truncate text-[10px] muted">{l.detail || LINE_CATEGORIES.find(c => c.id === l.category)?.label}</p></div>
          <span className="text-right tabular-nums muted">{l.qty}</span>
          <span className="text-right font-medium tabular-nums">{money(l.qty * l.unitPrice, draft.currency)}</span>
        </div>)}
        {more > 0 && <p className="pt-1 text-[10px] muted">+ {more} more line{more === 1 ? '' : 's'} in the full quotation</p>}
      </div>
      <div className="mt-4 ml-auto max-w-[260px] space-y-1.5 rounded-lg border divider bg-slate-50 p-3 text-xs dark:bg-ink-950/50">
        <div className="flex justify-between"><span className="muted">Cost subtotal</span><span className="font-semibold tabular-nums">{money(totals.subtotal, draft.currency)}</span></div>
        <div className="flex justify-between"><span className="muted">Markup ({totals.markupPct}%)</span><span className="tabular-nums">{money(totals.markupAmount, draft.currency)}</span></div>
        <div className="flex justify-between border-t divider pt-1.5 text-sm"><span className="font-semibold">Quotation total</span><span className="font-bold tabular-nums text-brand-700 dark:text-brand-300">{money(totals.total, draft.currency)}</span></div>
      </div>
      {draft.scope && <div className="mt-4 border-t divider pt-3"><p className="text-[10px] font-semibold uppercase tracking-wide muted">Scope & terms</p><p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-700 dark:text-slate-300">{draft.scope}</p></div>}
    </div>
  </div>;
}
