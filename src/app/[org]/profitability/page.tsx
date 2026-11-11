'use client';
/* Phase 2 Job profitability cockpit. Read-only, workspace-base-currency only:
 * what each job is worth, what it has cost, what it will cost to finish, and
 * whether billing/cash are keeping up with progress. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet, orgApi } from '@/lib/client';
import { money, num, pct, date } from '@/lib/format';
import {
  Badge, Button, Card, CardHead, EmptyState, Icon, ProgressBar,
  Skeleton, StatusPill, Tabs,
} from '@/components/ui';
import { DonutChart } from '@/components/Charts';
import type { ProfitabilityJob, ProfitabilityResponse } from '@/lib/profitability';

function metricTone(value: number): string {
  return value < 0 ? 'red' : value > 0 ? 'green' : 'slate';
}
function flagTone(flag: string): string {
  return /loss|overrun|missing/i.test(flag) ? 'red' : 'amber';
}

export default function ProfitabilityPage() {
  const { org } = useParams<{ org: string }>();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('margin');
  const [methodOpen, setMethodOpen] = useState(false);
  const { data, isLoading, isFetching, refetch } = useQuery<ProfitabilityResponse>({
    queryKey: ['profitability', org],
    queryFn: () => apiGet(orgApi(org, 'profitability')),
    staleTime: 30_000,
  });
  const jobs = data?.jobs || [];
  const summary = data?.summary;
  const base = data?.base || 'USD';
  const fmt = (value: unknown, compact = false) => money(value, base, compact);
  const fmtSigned = (value: number, compact = false) => `${value > 0 ? '+' : ''}${fmt(value, compact)}`;

  const tabs = [
    { id: 'all', label: 'All jobs', count: jobs.length },
    { id: 'active', label: 'Active', count: jobs.filter(j => ['ACTIVE', 'ON_HOLD'].includes(j.status)).length },
    { id: 'risk', label: 'Needs attention', count: jobs.filter(j => j.tone === 'red' || j.tone === 'amber').length },
    { id: 'completed', label: 'Completed', count: jobs.filter(j => ['COMPLETED', 'CLOSED'].includes(j.status)).length },
  ];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = jobs.filter(j => {
      if (tab === 'active' && !['ACTIVE', 'ON_HOLD'].includes(j.status)) return false;
      if (tab === 'risk' && j.tone !== 'red' && j.tone !== 'amber') return false;
      if (tab === 'completed' && !['COMPLETED', 'CLOSED'].includes(j.status)) return false;
      if (!needle) return true;
      return [j.name, j.code, j.number, j.clientName, j.managerName, j.status]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(needle));
    });
    const pick = (j: ProfitabilityJob) => ({
      margin: j.forecastMargin,
      contract: j.revisedContract,
      variance: j.costVariance,
      billed: j.billed,
      cash: j.cashGap,
      name: j.name,
    } as Record<string, number | string>)[sort] ?? j.forecastMargin;
    return [...list].sort((a, b) => Number(pick(a)) - Number(pick(b)));
  }, [jobs, tab, q, sort]);

  const exceptions = jobs.filter(j => j.flags.length).slice(0, 8);
  const marginJobs = [...jobs].sort((a, b) => Math.abs(b.forecastMargin) - Math.abs(a.forecastMargin)).slice(0, 6);
  const maxMargin = Math.max(...marginJobs.map(j => Math.abs(j.forecastMargin)), 1);
  const cards = summary ? [
    { label: 'Jobs in view', value: num(summary.projectCount), sub: `${summary.onTrack} on track · ${summary.watch} watch · ${summary.atRisk} at risk`, icon: 'HardHat', tone: 'blue' },
    { label: 'Revised contract', value: fmt(summary.revisedContract, true), sub: `${fmt(summary.pendingVariations, true)} variations awaiting approval`, icon: 'FileSignature', tone: 'slate' },
    { label: 'Approved budget', value: fmt(summary.budget, true), sub: `${fmt(summary.committed, true)} committed to suppliers`, icon: 'PieChart', tone: 'slate' },
    { label: 'Actual cost to date', value: fmt(summary.actualCost, true), sub: `${fmt(summary.forecastFinalCost, true)} forecast final cost`, icon: 'Receipt', tone: 'slate' },
    { label: 'Billed to clients', value: fmt(summary.billed, true), sub: `${fmt(summary.certified, true)} certified for payment`, icon: 'FileText', tone: 'slate' },
    { label: 'Cash received', value: fmt(summary.received, true), sub: `${fmt(summary.cashGap, true)} still outstanding`, icon: 'Banknote', tone: 'slate' },
    { label: 'Current margin', value: fmtSigned(summary.currentMargin, true), sub: 'Billed less actual cost', icon: 'TrendingUp', tone: metricTone(summary.currentMargin) },
    { label: 'Forecast margin', value: fmtSigned(summary.forecastMargin, true), sub: `${pct(summary.marginPct)} of revised contract`, icon: 'Target', tone: metricTone(summary.forecastMargin) },
  ] : [];

  return <div className="space-y-4" data-testid="profitability-page">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="heading">Job profitability</h1>
        <p className="caption mt-1">Which jobs are making money, which are drifting, and what is still to be billed or collected — in {base}, your workspace base currency.</p>
        <p className="mt-1 text-[11px] muted">Manual rates from Settings → Currencies. Reports, PDFs, CSV exports and saved records keep their original currency; your personal display currency does not change this cockpit.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh"><Icon name="RefreshCw" size={16} className={isFetching ? 'animate-spin' : ''}/></Button>
        <Link href={`/${org}/dashboard`}><Button icon="LayoutDashboard">Dashboard</Button></Link>
      </div>
    </div>

    {!!data?.currency.missingRates.length && <Card className="border-amber-300 bg-amber-50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/10">
      <div className="flex items-start gap-3"><Icon name="TriangleAlert" size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"/>
        <div><p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Some figures have no manual exchange rate</p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">Currencies: {data.currency.missingRates.join(', ')}. Their amounts are shown unconverted until a rate is set in Settings → Currencies.</p></div></div>
    </Card>}

    <div data-testid="profitability-summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24"/>) : cards.map(c => <Card key={c.label} className="flex items-start gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={c.icon} size={17}/></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{c.label}</p><p className="mt-1 truncate text-[20px] font-semibold tabular-nums">{c.value}</p><p className="mt-0.5 truncate text-[11px] muted">{c.sub}</p></div>
        <Badge tone={c.tone}>{c.tone === 'red' ? 'Risk' : c.tone === 'green' ? 'Positive' : 'Base'}</Badge>
      </Card>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 overflow-hidden">
        <CardHead title="Forecast margin by job" subtitle="Biggest gains and losses at completion · base currency"/>
        <div className="space-y-3 p-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10"/>) : marginJobs.length ? marginJobs.map(j => <div key={j.id} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs"><Link href={j.href} className="min-w-0 flex-1 truncate font-medium hover:text-brand-700 hover:underline dark:hover:text-brand-300">{j.name}</Link><span className={`font-semibold tabular-nums ${j.forecastMargin < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{fmtSigned(j.forecastMargin, true)}</span></div>
            <div className="h-2 overflow-hidden rounded-md bg-slate-100 dark:bg-ink-800"><div className={`h-full rounded-md ${j.forecastMargin < 0 ? 'bg-red-500' : j.tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(3, (Math.abs(j.forecastMargin) / maxMargin) * 100)}%` }}/></div>
            <p className="text-[10px] muted">{pct(j.marginPct)} margin · {j.statusLabel}</p>
          </div>) : <EmptyState compact icon="Gauge" title="No job margin data yet"/>}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <CardHead title="Where cost went" subtitle="Actual cost by category · base currency"/>
        <div className="p-4">{isLoading ? <Skeleton className="h-[170px]"/> : data?.costBreakdown.length ? <DonutChart data={data.costBreakdown} size={150} currency={base}/> : <EmptyState compact icon="PieChart" title="No cost categories yet"/>}</div>
      </Card>
    </div>

    <Card>
      <div data-testid="profitability-exceptions"><CardHead title="Jobs needing a commercial decision" subtitle="Margin, cost, billing and cash exceptions from the same figures" action={<Badge tone={exceptions.length ? 'amber' : 'green'}>{exceptions.length} flagged</Badge>}/>
      {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14"/>)}</div>
        : exceptions.length ? <div className="divide-y divider">{exceptions.map(j => <div key={j.id} className="flex flex-wrap items-start gap-3 p-3.5">
          <Badge tone={j.tone}>{j.statusLabel}</Badge>
          <div className="min-w-0 flex-1"><Link href={j.href} className="text-sm font-semibold hover:text-brand-700 hover:underline dark:hover:text-brand-300">{j.name}</Link>
            <p className="mt-0.5 text-[11px] muted">{j.clientName || 'No client'} · {j.code || j.number} · {pct(j.progress)} complete · forecast margin {fmt(j.forecastMargin, true)}</p>
            <div className="mt-2 flex flex-wrap gap-1">{j.flags.map(flag => <Badge key={flag} tone={flagTone(flag)}>{flag}</Badge>)}</div></div>
          <Link href={j.href} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">Open job →</Link>
        </div>)}</div>
          : <div className="p-4"><EmptyState compact icon="CheckCircle2" title="No commercial exceptions" description="Every job in view is on track against the current budget and billing position."/></div>}</div>
    </Card>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b divider px-3 pt-2">
        <Tabs tabs={tabs} active={tab} onChange={setTab} className="border-b-0"/>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <select aria-label="Sort jobs" className="select h-8 w-auto min-w-[160px] py-1 text-xs" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="margin">Lowest forecast margin</option>
            <option value="variance">Worst cost variance</option>
            <option value="contract">Largest contract</option>
            <option value="billed">Most billed</option>
            <option value="cash">Largest cash gap</option>
            <option value="name">Job name A–Z</option>
          </select>
          <input aria-label="Search jobs" className="input h-8 w-[min(220px,calc(100vw-4rem))] py-1 text-xs" placeholder="Search job, client, code…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>
      {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10"/>)}</div>
        : filtered.length === 0 ? <div className="p-4"><EmptyState icon="HardHat" title="No jobs match this view" description="Try another filter, or add a job and its budget to start tracking margin." action={<Link href={`/${org}/m/projects`}><Button icon="HardHat">Open jobs</Button></Link>}/></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-xs">
            <thead className="border-b divider bg-slate-50 text-[10px] font-semibold uppercase tracking-wide muted dark:bg-ink-900/60"><tr>
              <th className="px-3 py-2.5 text-left">Job</th><th className="px-3 py-2.5 text-left">Status</th><th className="px-3 py-2.5 text-right">Revised contract</th>
              <th className="px-3 py-2.5 text-right">Budget</th><th className="px-3 py-2.5 text-right">Actual cost</th><th className="px-3 py-2.5 text-right">To complete</th>
              <th className="px-3 py-2.5 text-right">Forecast cost</th><th className="px-3 py-2.5 text-right">Billed</th><th className="px-3 py-2.5 text-right">Received</th>
              <th className="px-3 py-2.5 text-right">Forecast margin</th><th className="px-3 py-2.5 text-right">Margin %</th><th className="px-3 py-2.5 text-left">Progress</th>
            </tr></thead>
            <tbody className="divide-y divider">{filtered.map(j => <tr key={j.id} data-testid="profitability-row" className="hover:bg-slate-50 dark:hover:bg-ink-800/40">
              <td className="px-3 py-2.5"><Link href={j.href} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline dark:text-white dark:hover:text-brand-300">{j.name}</Link><p className="mt-0.5 text-[10px] muted">{[j.code || j.number, j.clientName, j.endDate ? `Ends ${date(j.endDate)}` : ''].filter(Boolean).join(' · ')}</p><p className="mt-0.5 text-[10px] muted">Cost from {j.costSource}{j.approvedVariations ? ` · ${fmt(j.approvedVariations, true)} approved extras` : ''}</p></td>
              <td className="px-3 py-2.5"><StatusPill status={j.status}/><div className="mt-1"><Badge tone={j.tone}>{j.statusLabel}</Badge></div></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.revisedContract, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.budget, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.actualCost, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.costToComplete, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.forecastFinalCost, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.billed, true)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(j.received, true)}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${j.forecastMargin < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{fmtSigned(j.forecastMargin, true)}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${j.marginPct < 0 ? 'text-red-600 dark:text-red-300' : ''}`}>{pct(j.marginPct)}</td>
              <td className="px-3 py-2.5"><div className="flex items-center gap-2"><ProgressBar value={j.progress} tone={j.tone === 'red' ? 'red' : j.tone === 'amber' ? 'amber' : 'green'}/><span className="w-8 text-right tabular-nums muted">{num(j.progress)}%</span></div><p className="mt-1 text-[10px] muted">{j.billingVariance < 0 ? `${fmt(-j.billingVariance, true)} underbilled` : j.billingVariance > 0 ? `${fmt(j.billingVariance, true)} overbilled` : 'Billing in line'}</p></td>
            </tr>)}</tbody>
          </table></div>}
    </Card>

    <Card>
      <button type="button" data-testid="profitability-method-toggle" onClick={() => setMethodOpen(v => !v)} className="flex w-full items-center justify-between gap-3 p-3.5 text-left">
        <div><p className="text-sm font-semibold">How these figures are worked out</p><p className="caption mt-0.5">Plain-language definitions, so a manager can challenge the number without opening a spreadsheet.</p></div>
        <Icon name={methodOpen ? 'ChevronUp' : 'ChevronDown'} size={17} className="shrink-0 muted"/>
      </button>
      {methodOpen && <div data-testid="profitability-method" className="grid gap-px border-t divider bg-slate-200 dark:bg-ink-800 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ['Revised contract', 'Original contract value plus approved variations. Pending variations are shown separately, not counted as revenue.'],
          ['Actual cost', 'The job’s recorded cost to date; if absent, approved budget lines; if absent, posted supplier bills, approved expenses and approved/posted time sheets.'],
          ['Forecast final cost', 'Actual cost plus forecast-to-complete from budget lines, or the remaining budget when no forecast is entered.'],
          ['Forecast margin', 'Revised contract minus forecast final cost. Margin % is that figure as a share of the revised contract.'],
          ['Billing position', 'Billed less earned value (revised contract × progress). A negative figure means the job is underbilled for work done.'],
          ['Cash gap', 'Billed but not yet received. It uses invoice receipts, or cleared receipt records when invoices have no paid amount.'],
        ].map(([title, body]) => <div key={title} className="bg-white p-3.5 dark:bg-ink-900"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-relaxed muted">{body}</p></div>)}
      </div>}
    </Card>
  </div>;
}
