'use client';
/* Phase 1 Action Inbox. The queue is derived from existing records, so there
 * is no second register to keep in sync. Decisions run through one guarded
 * endpoint and cannot be bypassed by editing a status dropdown. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { num, date } from '@/lib/format';
import { WORKFLOW_RULES, type WorkItem } from '@/lib/workflow';
import { Badge, Button, Card, CardHead, EmptyState, Icon, Skeleton, StatusPill, Tabs } from '@/components/ui';
import { useDisplayMoney } from '@/components/DisplayCurrencyProvider';
import { useToast } from '@/components/Providers';

type Queue = {
  items: WorkItem[];
  summary: { total: number; overdue: number; dueSoon: number; escalated: number; actionable: number };
  generatedAt: string;
};
const DAY = 24 * 60 * 60 * 1000;

function dueText(item: WorkItem) {
  if (!item.dueAt) return 'No due date';
  const d = new Date(item.dueAt);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return `${Math.max(1, Math.ceil(-diff / DAY))} day${Math.ceil(-diff / DAY) === 1 ? '' : 's'} late`;
  if (diff <= DAY) return 'Due today';
  return `Due ${date(item.dueAt)}`;
}
function actionVariant(tone: string): 'primary' | 'danger' | 'outline' | 'ghost' {
  if (tone === 'green') return 'primary';
  if (tone === 'red') return 'danger';
  if (tone === 'slate') return 'ghost';
  return 'outline';
}

export default function MyWorkPage() {
  const { org } = useParams<{ org: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const formatMoney = useDisplayMoney();
  const [tab, setTab] = useState('all');
  const [resource, setResource] = useState('all');
  const [q, setQ] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data, isLoading, isFetching, refetch } = useQuery<Queue>({
    queryKey: ['work-items', org],
    queryFn: () => apiGet(orgApi(org, 'work-items')),
    staleTime: 15_000,
  });
  const items = data?.items || [];
  const summary = data?.summary || { total: 0, overdue: 0, dueSoon: 0, escalated: 0, actionable: 0 };
  const resources = useMemo(() => Array.from(new Set(items.map(i => i.resource))).sort(), [items]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(i => {
      if (tab === 'mine' && !i.canAct) return false;
      if (tab === 'overdue' && !i.overdue) return false;
      if (tab === 'soon' && !i.dueSoon) return false;
      if (tab === 'escalated' && !i.escalated) return false;
      if (resource !== 'all' && i.resource !== resource) return false;
      if (!needle) return true;
      return [i.number, i.title, i.resourceLabel, i.projectName, i.status].filter(Boolean)
        .some(v => String(v).toLowerCase().includes(needle));
    });
  }, [items, tab, resource, q]);

  async function run(item: WorkItem, action: { id: string; label: string; to: string; tone: string }) {
    if (busyKey) return;
    setBusyKey(item.key);
    try {
      await apiSend(orgApi(org, 'work-items/action'), 'POST', {
        resource: item.resource, id: item.id, action: action.id,
      });
      toast.push({ title: `${action.label} · done`, description: `${item.number || item.singular} is now ${action.to.replace(/_/g, ' ').toLowerCase()}.`, tone: 'success' });
      qc.invalidateQueries({ queryKey: ['work-items', org] });
      qc.invalidateQueries({ queryKey: ['overview', org] });
      qc.invalidateQueries({ queryKey: ['meta', org] });
    } catch (err: any) {
      toast.push({ title: 'Could not complete that action', description: userMessage(err, 'Refresh My work and try again.'), tone: 'error' });
      refetch();
    } finally { setBusyKey(''); }
  }

  const tabs = [
    { id: 'all', label: 'All open', count: summary.total },
    { id: 'mine', label: 'Waiting on you', count: summary.actionable },
    { id: 'overdue', label: 'Late', count: summary.overdue },
    { id: 'soon', label: 'Due soon', count: summary.dueSoon },
    { id: 'escalated', label: 'Escalated', count: summary.escalated },
  ];

  return <div className="space-y-4" data-testid="my-work-page">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="heading">My work</h1>
        <p className="caption mt-1">What is wrong, who owns it and what happens next. One place for approvals, answers and close-outs — no hunting through registers.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh"><Icon name="RefreshCw" size={16} className={isFetching ? 'animate-spin' : ''}/></Button>
        <Link href={`/${org}/dashboard`}><Button icon="LayoutDashboard">Dashboard</Button></Link>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24"/>) : [
        { label: 'Waiting on you', value: summary.actionable, tone: 'blue', icon: 'Inbox' },
        { label: 'Late', value: summary.overdue, tone: 'red', icon: 'Clock' },
        { label: 'Due in 2 days', value: summary.dueSoon, tone: 'amber', icon: 'Calendar' },
        { label: 'Escalated', value: summary.escalated, tone: 'violet', icon: 'TriangleAlert' },
      ].map(s => <Card key={s.label} className="flex items-start gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={s.icon} size={17}/></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide muted">{s.label}</p><p className="mt-1 text-[22px] font-semibold tabular-nums">{num(s.value)}</p></div>
        <Badge tone={s.tone}>{s.value > 0 ? 'Action' : 'Clear'}</Badge>
      </Card>)}
    </div>

    {summary.escalated > 0 && <Card className="border-red-200 bg-red-50 p-3.5 dark:border-red-500/20 dark:bg-red-500/10">
      <div className="flex items-start gap-3"><Icon name="TriangleAlert" size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-300"/>
        <div><p className="text-sm font-semibold text-red-900 dark:text-red-200">{num(summary.escalated)} item{summary.escalated === 1 ? '' : 's'} escalated</p>
          <p className="mt-0.5 text-xs text-red-800 dark:text-red-300">More than three days past the target date. These are pinned to the top until someone closes them.</p></div></div>
    </Card>}

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b divider px-3 pt-2">
        <Tabs tabs={tabs} active={tab} onChange={setTab} className="border-b-0"/>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <select aria-label="Filter by register" className="select h-8 w-auto min-w-[150px] py-1 text-xs" value={resource} onChange={e => setResource(e.target.value)}>
            <option value="all">All registers</option>
            {resources.map(r => <option key={r} value={r}>{WORKFLOW_RULES.find(x => x.resource === r)?.label || r}</option>)}
          </select>
          <input aria-label="Search work items" className="input h-8 w-[min(220px,calc(100vw-4rem))] py-1 text-xs" placeholder="Search number, job, title…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>
      {isLoading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28"/>)}</div>
        : filtered.length === 0 ? <div className="p-4" data-testid="my-work-empty"><EmptyState icon="CheckCircle2" title="Nothing waiting here" description="No items match this view. Approvals, late site queries and open safety actions will appear here automatically." action={<Link href={`/${org}/dashboard`}><Button icon="LayoutDashboard">Back to dashboard</Button></Link>}/></div>
          : <div className="divide-y divider">{filtered.map(item => <div key={item.key} data-testid="work-item" className={`p-3.5 transition ${item.escalated ? 'bg-red-50/50 dark:bg-red-500/5' : ''}`}>
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border divider text-ink-500 dark:bg-ink-800 dark:text-slate-300"><Icon name={item.icon} size={17}/></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={item.href} className="text-sm font-semibold text-ink-900 hover:text-brand-700 hover:underline dark:text-white dark:hover:text-brand-300">{item.title}</Link>
                  {item.number && <Badge tone="slate">{item.number}</Badge>}
                  <StatusPill status={item.status}/>
                  {item.overdue && <Badge tone="red">{dueText(item)}</Badge>}
                  {item.dueSoon && <Badge tone="amber">{dueText(item)}</Badge>}
                  {item.escalated && <Badge tone="violet">Escalated</Badge>}
                </div>
                <p className="mt-1 text-xs muted">{item.resourceLabel} · {item.reason}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] muted">
                  <span>{item.canAct ? 'Waiting on you' : `Assigned to ${item.assignedRole}`}</span>
                  {item.projectName && <span>Job: <span className="font-medium text-ink-700 dark:text-slate-200">{item.projectName}</span></span>}
                  {item.amount !== null && <span className="font-semibold tabular-nums text-ink-700 dark:text-slate-200">{formatMoney(item.amount, item.currency, true)}</span>}
                  <span>{dueText(item)}</span>
                </div>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                <Link href={item.href}><Button size="sm" icon="ArrowUpRight">Open</Button></Link>
                {item.actions.length === 0 && <span className="text-[11px] muted">Read-only for your role</span>}
                {item.actions.map(action => <Button key={action.id} data-testid={`work-item-action-${action.id}`} size="sm" variant={actionVariant(action.tone)} loading={busyKey === item.key} onClick={() => run(item, action)}>{action.label}</Button>)}
              </div>
            </div>
          </div>)}</div>}
    </Card>

    <Card>
      <button type="button" data-testid="workflow-rules-toggle" onClick={() => setRulesOpen(v => !v)} className="flex w-full items-center justify-between gap-3 p-3.5 text-left">
        <div><p className="text-sm font-semibold">How decisions work</p><p className="caption mt-0.5">Built-in guardrails: only the roles shown can move a waiting record, and every action is written to the audit trail.</p></div>
        <Icon name={rulesOpen ? 'ChevronUp' : 'ChevronDown'} size={17} className="shrink-0 muted"/>
      </button>
      {rulesOpen && <div data-testid="workflow-rules" className="grid gap-px border-t divider bg-slate-200 dark:bg-ink-800 sm:grid-cols-2 xl:grid-cols-3">
        {WORKFLOW_RULES.map(rule => <div key={rule.resource} className="bg-white p-3.5 dark:bg-ink-900">
          <p className="text-xs font-semibold">{rule.label}</p>
          <p className="mt-1 text-[11px] muted">Flags {rule.pending.map(s => s.replace(/_/g, ' ')).join(', ')} · target {rule.slaDays} day{rule.slaDays === 1 ? '' : 's'}</p>
          <div className="mt-2 flex flex-wrap gap-1">{rule.actions.map(a => <Badge key={a.id} tone={a.tone}>{a.label} → {a.to.replace(/_/g, ' ')}</Badge>)}</div>
          <p className="mt-2 text-[10px] muted">Approvers: {Array.from(new Set(rule.actions.flatMap(a => a.roles))).filter(r => !['OWNER', 'ADMIN'].includes(r)).map(r => r.replace(/_/g, ' ').toLowerCase()).join(', ')} plus Owner / Admin.</p>
        </div>)}
      </div>}
    </Card>
  </div>;
}
