'use client';
/* Phase 3 three-way match cockpit. Read-only: order ↔ goods receipt ↔ supplier
 * bill, with payment-blocking exceptions and unlinked documents surfaced in
 * plain language. Workspace base currency only. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, orgApi } from '@/lib/client';
import { money, num } from '@/lib/format';
import {
  Badge, Button, Card, CardHead, EmptyState, Icon, Skeleton, StatusPill, Tabs,
} from '@/components/ui';
import type { MatchGroup, OrphanDoc, ThreeWayResponse } from '@/lib/three-way-match';

function flagTone(flag: string): string {
  return /duplicate|billed before|unapproved|dispute|overbill|overpaid|missing manual/i.test(flag) ? 'red' : 'amber';
}

export default function ThreeWayMatchPage() {
  const { org } = useParams<{ org: string }>();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('variance');
  const [methodOpen, setMethodOpen] = useState(false);
  const { data, isLoading, isFetching, refetch } = useQuery<ThreeWayResponse>({
    queryKey: ['three-way-match', org],
    queryFn: () => apiGet(orgApi(org, 'three-way-match')),
    staleTime: 30_000,
  });
  const groups = data?.groups || [];
  const summary = data?.summary;
  const base = data?.base || 'USD';
  const fmt = (value: unknown, compact = false) => money(value, base, compact);
  const fmtSigned = (value: number, compact = false) => `${value > 0 ? '+' : ''}${fmt(value, compact)}`;

  const tabs = [
    { id: 'all', label: 'All orders', count: groups.length },
    { id: 'blocked', label: 'Blocked', count: groups.filter(g => g.tone === 'red').length },
    { id: 'review', label: 'Review', count: groups.filter(g => g.tone === 'amber').length },
    { id: 'matched', label: 'Matched', count: groups.filter(g => g.tone === 'green').length },
    { id: 'awaiting', label: 'Awaiting', count: groups.filter(g => g.tone === 'slate').length },
  ];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = groups.filter(g => {
      if (tab !== 'all' && g.tone !== (tab === 'blocked' ? 'red' : tab === 'review' ? 'amber' : tab === 'matched' ? 'green' : 'slate')) return false;
      if (!needle) return true;
      return [g.poNumber, g.poTitle, g.vendorName, g.projectName, g.statusLabel, ...g.flags]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(needle));
    });
    const pick = (g: MatchGroup) => ({
      variance: Math.abs(g.priceVariance),
      value: g.orderValue,
      vendor: g.vendorName,
      number: g.poNumber,
      flags: g.flags.length,
    } as Record<string, number | string>)[sort] ?? Math.abs(g.priceVariance);
    return [...list].sort((a, b) => sort === 'value' || sort === 'variance' || sort === 'flags'
      ? Number(pick(b)) - Number(pick(a))
      : String(pick(a)).localeCompare(String(pick(b))));
  }, [groups, tab, q, sort]);

  const exceptions = groups.filter(g => g.tone === 'red' || g.tone === 'amber').slice(0, 8);
  const orphanBills = data?.orphans.bills || [];
  const orphanReceipts = data?.orphans.receipts || [];
  const cards = summary ? [
    { label: 'Orders in view', value: num(summary.orders), sub: `${summary.tolerancePct}% price tolerance`, icon: 'ClipboardList', tone: 'blue' },
    { label: 'Matched', value: num(summary.matched), sub: `Within ${summary.tolerancePct}% tolerance`, icon: 'CheckCircle2', tone: 'green' },
    { label: 'Review', value: num(summary.review), sub: 'Needs a buyer or store check', icon: 'ListChecks', tone: 'amber' },
    { label: 'Blocked', value: num(summary.blocked), sub: 'Hold payment until resolved', icon: 'TriangleAlert', tone: 'red' },
    { label: 'Bills without PO', value: num(summary.orphanBills), sub: 'Not linked to any order', icon: 'Receipt', tone: 'red' },
    { label: 'Deliveries without PO', value: num(summary.orphanReceipts), sub: 'Not linked to any order', icon: 'PackageCheck', tone: 'amber' },
    { label: 'Duplicate invoices', value: num(summary.duplicateInvoices), sub: `${num(summary.missingInvoiceNumbers)} missing invoice numbers`, icon: 'Copy', tone: summary.duplicateInvoices ? 'red' : 'green' },
    { label: 'Price exceptions', value: num(summary.priceExceptions), sub: `${num(summary.missingReceipts)} missing receipts · ${num(summary.missingBills)} missing bills`, icon: 'TrendingUp', tone: summary.priceExceptions ? 'amber' : 'green' },
  ] : [];

  const orphanRow = (doc: OrphanDoc) => <div key={doc.id} className="flex flex-wrap items-start gap-3 border-b divider px-3.5 py-2.5 last:border-b-0">
    <Badge tone={doc.tone}>{doc.type === 'BILL' ? 'Bill' : 'Delivery'}</Badge>
    <div className="min-w-0 flex-1"><Link href={doc.href} className="text-xs font-semibold hover:text-brand-700 hover:underline dark:hover:text-brand-300">{[doc.number, doc.title].filter(Boolean).join(' · ')}</Link>
      <p className="mt-0.5 text-[10px] muted">{doc.reason} · {doc.vendorName || 'No supplier'}{doc.projectName ? ` · ${doc.projectName}` : ''}{doc.amount !== null ? ` · ${fmt(doc.amount, true)}` : ''}</p></div>
    <Link href={doc.href} className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-300">Open →</Link>
  </div>;

  return <div className="space-y-4" data-testid="three-way-page">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="heading">Three-way match</h1>
        <p className="caption mt-1">Order ↔ delivery ↔ supplier bill: what can be paid, what must be held, and which documents are not linked — in {base}, your workspace base currency.</p>
        <p className="mt-1 text-[11px] muted">Read-only. Manual rates from Settings → Currencies. Reports, PDFs, CSV exports and saved records keep their original currency; your personal display currency does not change this cockpit.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh"><Icon name="RefreshCw" size={16} className={isFetching ? 'animate-spin' : ''}/></Button>
        <Link href={`/${org}/dashboard`}><Button icon="LayoutDashboard">Dashboard</Button></Link>
      </div>
    </div>

    {!!data?.currency.missingRates.length && <Card className="border-amber-300 bg-amber-50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/10">
      <div className="flex items-start gap-3"><Icon name="TriangleAlert" size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"/>
        <div><p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Some documents have no manual exchange rate</p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">Currencies: {data.currency.missingRates.join(', ')}. Affected amounts are shown unconverted until a rate is set in Settings → Currencies.</p></div></div>
    </Card>}

    <div data-testid="three-way-summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24"/>) : cards.map(c => <Card key={c.label} className="flex items-start gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={c.icon} size={17}/></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{c.label}</p><p className="mt-1 truncate text-[20px] font-semibold tabular-nums">{c.value}</p><p className="mt-0.5 truncate text-[11px] muted">{c.sub}</p></div>
        <Badge tone={c.tone}>{c.tone === 'red' ? 'Hold' : c.tone === 'amber' ? 'Check' : c.tone === 'green' ? 'Clear' : 'Base'}</Badge>
      </Card>)}
    </div>

    <Card>
      <div data-testid="three-way-exceptions"><CardHead title="Payment holds and reviews" subtitle="The same figures, translated into the next commercial action" action={<Badge tone={exceptions.length ? 'amber' : 'green'}>{exceptions.length} flagged</Badge>}/>
        {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14"/>)}</div>
          : exceptions.length ? <div className="divide-y divider">{exceptions.map(g => <div key={g.id} className="flex flex-wrap items-start gap-3 p-3.5">
            <Badge tone={g.tone}>{g.statusLabel}</Badge>
            <div className="min-w-0 flex-1"><Link href={g.href} className="text-sm font-semibold hover:text-brand-700 hover:underline dark:hover:text-brand-300">{g.poNumber} · {g.poTitle}</Link>
              <p className="mt-0.5 text-[11px] muted">{g.vendorName || 'No supplier'}{g.projectName ? ` · ${g.projectName}` : ''} · order {fmt(g.orderValue, true)} · billed {fmt(g.billedAmount, true)} · variance {fmtSigned(g.priceVariance, true)}</p>
              <p className="mt-1 text-xs font-medium text-ink-700 dark:text-slate-200">{g.recommendation}</p>
              <div className="mt-2 flex flex-wrap gap-1">{g.flags.map(flag => <Badge key={flag} tone={flagTone(flag)}>{flag}</Badge>)}</div></div>
            <Link href={g.href} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">Open order →</Link>
          </div>)}</div>
            : <div className="p-4"><EmptyState compact icon="CheckCircle2" title="No payment holds" description="Every order in view is matched or still awaiting documents."/></div>}</div>
    </Card>

    <Card>
      <div data-testid="three-way-orphans"><CardHead title="Documents without a purchase order" subtitle="Bills and delivery notes that cannot be three-way matched until they are linked" action={<Badge tone={orphanBills.length + orphanReceipts.length ? 'red' : 'green'}>{orphanBills.length + orphanReceipts.length} unlinked</Badge>}/>
        {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10"/>)}</div>
          : orphanBills.length + orphanReceipts.length ? <div className="grid gap-px divider bg-slate-200 sm:grid-cols-2 dark:bg-ink-800">
            <div className="bg-white dark:bg-ink-900"><p className="border-b divider px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide muted">Supplier bills</p>{orphanBills.length ? orphanBills.map(orphanRow) : <p className="px-3.5 py-3 text-xs muted">None.</p>}</div>
            <div className="bg-white dark:bg-ink-900"><p className="border-b divider px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide muted">Delivery notes</p>{orphanReceipts.length ? orphanReceipts.map(orphanRow) : <p className="px-3.5 py-3 text-xs muted">None.</p>}</div>
          </div> : <div className="p-4"><EmptyState compact icon="Link2" title="All documents are linked" description="Every bill and delivery note points to a purchase order in this workspace."/></div>}</div>
    </Card>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b divider px-3 pt-2">
        <Tabs tabs={tabs} active={tab} onChange={setTab} className="border-b-0"/>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <select aria-label="Sort orders" className="select h-8 w-auto min-w-[170px] py-1 text-xs" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="variance">Largest price variance</option>
            <option value="value">Largest order value</option>
            <option value="flags">Most exceptions</option>
            <option value="vendor">Supplier A–Z</option>
            <option value="number">Order number</option>
          </select>
          <input aria-label="Search orders" className="input h-8 w-[min(220px,calc(100vw-4rem))] py-1 text-xs" placeholder="Search order, supplier, job…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>
      {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10"/>)}</div>
        : filtered.length === 0 ? <div className="p-4"><EmptyState icon="ClipboardCheck" title="No orders match this view" description="Try another filter, or open the purchase order register." action={<Link href={`/${org}/m/purchaseOrders`}><Button icon="ClipboardList">Open orders</Button></Link>}/></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-xs">
            <thead className="border-b divider bg-slate-50 text-[10px] font-semibold uppercase tracking-wide muted dark:bg-ink-900/60"><tr>
              <th className="px-3 py-2.5 text-left">Order</th><th className="px-3 py-2.5 text-left">Supplier / job</th><th className="px-3 py-2.5 text-left">Stage</th>
              <th className="px-3 py-2.5 text-left">Status</th><th className="px-3 py-2.5 text-right">Order value</th><th className="px-3 py-2.5 text-right">Delivered</th>
              <th className="px-3 py-2.5 text-right">Billed</th><th className="px-3 py-2.5 text-right">Paid</th><th className="px-3 py-2.5 text-right">Variance</th>
              <th className="px-3 py-2.5 text-right">Variance %</th><th className="px-3 py-2.5 text-left">Exceptions</th><th className="px-3 py-2.5 text-left">Next step</th>
            </tr></thead>
            <tbody className="divide-y divider">{filtered.map(g => <tr key={g.id} data-testid="three-way-row" className="hover:bg-slate-50 dark:hover:bg-ink-800/40">
              <td className="px-3 py-2.5"><Link href={g.href} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline dark:text-white dark:hover:text-brand-300">{g.poNumber || g.poTitle}</Link><p className="mt-0.5 max-w-[220px] truncate text-[10px] muted">{g.poTitle}</p><p className="mt-0.5 text-[10px] muted">{g.documents.filter(d => d.type !== 'ORDER').map(d => d.number || d.type).join(' · ') || 'No linked documents'}</p></td>
              <td className="px-3 py-2.5"><p className="font-medium">{g.vendorName || 'No supplier'}</p><p className="mt-0.5 text-[10px] muted">{g.projectName || 'No job'}</p></td>
              <td className="px-3 py-2.5"><Badge tone={g.stage === 3 ? 'green' : g.stage === 2 ? 'amber' : 'slate'}>{g.stage === 3 ? '3-way' : g.stage === 2 ? '2-way' : '1-way'}</Badge><p className="mt-1 text-[10px] muted">{g.receiptCount} delivery · {g.billCount} bill</p></td>
              <td className="px-3 py-2.5"><StatusPill status={g.poStatus}/><div className="mt-1"><Badge tone={g.tone}>{g.statusLabel}</Badge></div></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(g.orderValue, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{g.receivedQty !== null ? `${num(g.receivedQty)} / ${num(g.orderedQty)} qty` : `${g.receiptCount} note${g.receiptCount === 1 ? '' : 's'}`}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(g.billedAmount, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(g.paidAmount, true)}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${g.priceVariance > 0 ? 'text-red-600 dark:text-red-300' : g.priceVariance < 0 ? 'text-amber-600 dark:text-amber-300' : ''}`}>{fmtSigned(g.priceVariance, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{num(g.variancePct, 1)}%</td>
              <td className="px-3 py-2.5"><div className="flex max-w-[260px] flex-wrap gap-1">{g.flags.length ? g.flags.slice(0, 3).map(flag => <Badge key={flag} tone={flagTone(flag)}>{flag}</Badge>) : <Badge tone="green">Within tolerance</Badge>}{g.flags.length > 3 && <Badge tone="slate">+{g.flags.length - 3}</Badge>}</div></td>
              <td className="px-3 py-2.5"><p className="max-w-[260px] text-[11px] leading-relaxed">{g.recommendation}</p>{g.missingRates.length > 0 && <p className="mt-1 text-[10px] muted">Missing rate: {g.missingRates.join(', ')}</p>}</td>
            </tr>)}</tbody>
          </table></div>}
    </Card>

    <Card>
      <button type="button" data-testid="three-way-method-toggle" onClick={() => setMethodOpen(v => !v)} className="flex w-full items-center justify-between gap-3 p-3.5 text-left">
        <div><p className="text-sm font-semibold">How the match works</p><p className="caption mt-0.5">Plain-language rules, so an accounts clerk knows exactly why a bill is held.</p></div>
        <Icon name={methodOpen ? 'ChevronUp' : 'ChevronDown'} size={17} className="shrink-0 muted"/>
      </button>
      {methodOpen && <div data-testid="three-way-method" className="grid gap-px border-t divider bg-slate-200 dark:bg-ink-800 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ['Three-way match', 'A purchase order, an accepted goods receipt and a posted supplier bill all point to the same order, and the billed value is within tolerance.'],
          ['Price tolerance', `Billed value is compared with the order value after currency conversion. A difference over ${data?.summary.tolerancePct ?? 2}% is an exception.`],
          ['Duplicate invoice', 'The same supplier invoice number appears on more than one non-void bill for the same supplier. Payment is held.'],
          ['Orphan document', 'A bill or delivery note with no purchase order link. It cannot be matched until the link is corrected.'],
          ['Quantity check', 'Line quantities are parsed from the order and delivery item summaries when present. Missing quantities are flagged as data-quality gaps, not silently accepted.'],
          ['Currency conversion', 'Order and bill amounts are converted to the workspace base currency with manual Settings rates. Missing rates are surfaced instead of guessed.'],
          ['Module access', 'The cockpit includes only registers you can read. Both Ordering & deliveries and Money & accounts must be enabled for the three-way match to open.'],
        ].map(([title, body]) => <div key={title} className="bg-white p-3.5 dark:bg-ink-900"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-relaxed muted">{body}</p></div>)}
      </div>}
    </Card>
  </div>;
}
