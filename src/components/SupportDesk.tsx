'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import {
  SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS, SUPPORT_STATUSES, SUPPORT_STATUS_LABELS,
  supportTone, type SupportTicket, type SupportComment, type SupportUser,
} from '@/lib/support';
import { Badge, Button, Card, CardHead, EmptyState, Field, Icon, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Providers';
import { ago, date, initials } from '@/lib/format';

const EMPTY_FORM = {
  title: '', description: '', category: 'BUG', priority: 'MEDIUM', pageUrl: '',
};

export default function SupportDesk({ org }: { org: string }) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');

  const ticketsQuery = useQuery<any>({
    queryKey: ['support', org],
    queryFn: () => apiGet(orgApi(org, 'support')),
  });
  const tickets: SupportTicket[] = ticketsQuery.data?.tickets || [];
  const canManage = !!ticketsQuery.data?.canManage;
  const users: SupportUser[] = ticketsQuery.data?.users || [];
  const active = tickets.find(t => t.id === selected) || tickets[0] || null;

  const commentsQuery = useQuery<any>({
    queryKey: ['support-comments', org, active?.id || ''],
    queryFn: () => apiGet(orgApi(org, `support?ticket=${encodeURIComponent(active?.id || '')}`)),
    enabled: !!active?.id,
  });
  const comments: SupportComment[] = commentsQuery.data?.comments || [];

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('ticket');
    if (fromLink) setSelected(fromLink);
  }, []);
  useEffect(() => {
    setForm(v => ({ ...v, pageUrl: v.pageUrl || pathname || '' }));
  }, [pathname]);

  const filtered = useMemo(() => tickets.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.ticket_no, t.title, t.description, t.reporter_name, t.category, t.status]
      .some(v => String(v || '').toLowerCase().includes(q));
  }), [tickets, search, statusFilter]);
  const stats = useMemo(() => [
    { label: 'Open', value: tickets.filter(t => ['OPEN','IN_PROGRESS','WAITING_ON_USER'].includes(t.status)).length, tone: 'blue' },
    { label: 'Critical', value: tickets.filter(t => t.priority === 'CRITICAL' && t.status !== 'CLOSED' && t.status !== 'RESOLVED').length, tone: 'red' },
    { label: 'Resolved', value: tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length, tone: 'green' },
    { label: 'Total', value: tickets.length, tone: 'slate' },
  ], [tickets]);
  const assigneeOptions = useMemo(() => {
    const list = [...users];
    if (active?.assigned_to && !list.some(u => u.id === active.assigned_to)) {
      list.push({ id: active.assigned_to, name: active.assigned_to_name || 'Assigned user', email: '', role: '' });
    }
    return list;
  }, [users, active?.assigned_to, active?.assigned_to_name]);

  function invalidate(ticketId?: string) {
    qc.invalidateQueries({ queryKey: ['support', org] });
    qc.invalidateQueries({ queryKey: ['support-comments', org] });
    if (ticketId) qc.invalidateQueries({ queryKey: ['meta', org] });
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault(); setBusy('create');
    try {
      const result = await apiSend(orgApi(org, 'support'), 'POST', form);
      setForm({ ...EMPTY_FORM, pageUrl: pathname || '' });
      setShowNew(false);
      setSelected(result.ticket.id);
      qc.setQueryData<any>(['support', org], (old: any) => ({
        ...(old || {}), tickets: [result.ticket, ...((old?.tickets || []) as SupportTicket[])],
      }));
      invalidate(result.ticket.id);
      toast.push({ tone: 'success', title: `${result.ticket.ticket_no} submitted`, description: 'Your bug or issue is now in the workspace support history.' });
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Could not submit ticket', description: userMessage(err, 'We couldn’t send your report. Please try again.') });
    } finally { setBusy(''); }
  }

  async function updateTicket(patch: Record<string, any>) {
    if (!active || !canManage) return;
    setBusy('ticket');
    try {
      await apiSend(orgApi(org, 'support'), 'PATCH', { ticketId: active.id, ...patch });
      invalidate(active.id);
      toast.push({ tone: 'success', title: 'Ticket updated', description: `${active.ticket_no} has been saved.` });
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Could not update ticket', description: userMessage(err, 'We couldn’t update that ticket. Please try again.') });
    } finally { setBusy(''); }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    const body = comment.trim();
    if (body.length < 2) return;
    setBusy('comment');
    try {
      await apiSend(orgApi(org, `support/${encodeURIComponent(active.id)}/comments`), 'POST', { body });
      setComment('');
      invalidate();
      toast.push({ tone: 'success', title: 'Update added', description: 'Your note is attached to this ticket.' });
    } catch (err: any) {
      toast.push({ tone: 'error', title: 'Could not add update', description: userMessage(err, 'We couldn’t add your update. Please try again.') });
    } finally { setBusy(''); }
  }

  if (ticketsQuery.isLoading) return <div className="space-y-4" data-testid="support-page"><Skeleton className="h-10 w-1/3"/><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96"/><Skeleton className="h-96 lg:col-span-2"/></div></div>;
  if (ticketsQuery.error) return <Card><EmptyState icon="HelpCircle" title="Support could not load" description={(ticketsQuery.error as any)?.message || 'Please refresh and try again.'}/></Card>;

  return <div className="space-y-4" data-testid="support-page">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="heading">Help & support</h1>
        <p className="caption mt-1">Report a bug or issue, follow its progress and keep a workspace ticket history.</p>
      </div>
      <Button variant="primary" icon="Plus" data-testid="new-support-ticket" onClick={() => setShowNew(v => !v)}>{showNew ? 'Close form' : 'New ticket'}</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-4">
      {stats.map(s => <Card key={s.label} className="p-3"><div className="flex items-center justify-between"><span className="text-[11px] muted">{s.label}</span><Badge tone={s.tone}>{s.value}</Badge></div><p className="mt-2 text-2xl font-semibold">{s.value}</p></Card>)}
    </div>

    {showNew && <div data-testid="support-report-form"><Card>
      <CardHead title="Report a bug or issue" subtitle="Describe what happened, where it happened and what you expected."/>
      <form onSubmit={createTicket} className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Short title" required wide><input className="input" data-testid="support-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Invoice total does not update after edit" minLength={4} maxLength={160} required/></Field>
        <Field label="Description" required hint="Include the steps to reproduce it and what you expected to happen." wide><textarea className="input min-h-[112px] resize-y py-2" data-testid="support-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Tell us what you were doing, what happened, and any error message." minLength={10} maxLength={5000} required/></Field>
        <Field label="Category"><select className="select" data-testid="support-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{SUPPORT_CATEGORIES.map(c => <option key={c} value={c}>{SUPPORT_CATEGORY_LABELS[c]}</option>)}</select></Field>
        <Field label="Priority"><select className="select" data-testid="support-priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{SUPPORT_PRIORITIES.map(p => <option key={p} value={p}>{SUPPORT_PRIORITY_LABELS[p]}</option>)}</select></Field>
        <Field label="Page or area" hint="Saved automatically from the page you are on." wide><input className="input" value={form.pageUrl} onChange={e => setForm({ ...form, pageUrl: e.target.value })} placeholder="/support" maxLength={500}/></Field>
        <div className="sm:col-span-2 flex items-center justify-between gap-3">
          <p className="text-[11px] muted">This ticket stays inside {ticketsQuery.data?.user?.name ? `your workspace and is submitted as ${ticketsQuery.data.user.name}` : 'your workspace'}.</p>
          <Button type="submit" variant="primary" icon="Send" loading={busy === 'create'}>Submit ticket</Button>
        </div>
      </form>
    </Card></div>}

    <div className="grid gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
      <div data-testid="support-history"><Card>
        <CardHead title="Workspace ticket history" subtitle={canManage ? 'Owners and admins see every ticket in this workspace.' : 'You see only tickets you submitted.'}/>
        <div className="grid gap-2 border-b divider p-3 sm:grid-cols-[1fr_140px]">
          <input className="input" aria-label="Search support tickets" data-testid="support-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"/>
          <select className="select" aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            {SUPPORT_STATUSES.map(s => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? <EmptyState compact icon="Inbox" title="No tickets here" description={tickets.length ? 'Try a different search or status.' : 'Report your first bug or issue to start the history.'} action={!tickets.length ? <Button variant="primary" icon="Plus" onClick={() => setShowNew(true)}>New ticket</Button> : undefined}/> :
          <div className="max-h-[620px] divide-y divider overflow-y-auto">
            {filtered.map(t => <button key={t.id} type="button" data-testid="support-ticket-row" data-ticket-no={t.ticket_no} onClick={() => setSelected(t.id)} className={`w-full px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-ink-800 ${active?.id === t.id ? 'bg-brand-50/70 dark:bg-brand-500/10' : ''}`}>
              <div className="flex items-start justify-between gap-2"><span className="font-mono text-[10px] muted">{t.ticket_no}</span><Badge tone={supportTone(t.status)}>{SUPPORT_STATUS_LABELS[t.status] || t.status}</Badge></div>
              <p className="mt-1 line-clamp-2 text-[13px] font-semibold text-ink-900 dark:text-white">{t.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5"><Badge tone={supportTone(t.category)}>{SUPPORT_CATEGORY_LABELS[t.category] || t.category}</Badge><Badge tone={supportTone(t.priority)}>{SUPPORT_PRIORITY_LABELS[t.priority] || t.priority}</Badge><span className="ml-auto text-[10px] muted">{ago(t.created_at)}</span></div>
              <p className="mt-2 truncate text-[11px] muted">{t.reporter_name}{t.assigned_to_name ? ` · ${t.assigned_to_name}` : ''}</p>
            </button>)}
          </div>}
      </Card></div>

      {!active ? <Card><EmptyState icon="MessageCircleQuestion" title="Select a ticket" description="Choose a ticket from the history to see its details and conversation."/></Card> :
        <div data-testid="support-ticket-detail" className="space-y-4">
          <Card>
            <CardHead title={<span><span className="mr-2 font-mono text-xs muted">{active.ticket_no}</span>{active.title}</span>} subtitle={`Reported by ${active.reporter_name} · ${date(active.created_at)}`} action={<Badge tone={supportTone(active.status)}>{SUPPORT_STATUS_LABELS[active.status] || active.status}</Badge>}/>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge tone={supportTone(active.category)}>{SUPPORT_CATEGORY_LABELS[active.category] || active.category}</Badge>
                <Badge tone={supportTone(active.priority)}>{SUPPORT_PRIORITY_LABELS[active.priority] || active.priority} priority</Badge>
                <Badge tone={active.assigned_to_name ? 'violet' : 'slate'}>{active.assigned_to_name ? `Assigned to ${active.assigned_to_name}` : 'Unassigned'}</Badge>
              </div>
              <div><p className="label mb-1">What happened</p><div className="whitespace-pre-wrap rounded-md border divider bg-slate-50 p-3 text-[13px] leading-relaxed dark:bg-ink-950/40">{active.description}</div></div>
              {active.page_url && <p className="text-[11px] muted">Page: <span className="font-mono">{active.page_url}</span></p>}
              {canManage ? <div className="grid gap-3 border-t divider pt-4 sm:grid-cols-3">
                <Field label="Status"><select className="select" aria-label="Ticket status" data-testid="support-status-select" value={active.status} disabled={busy === 'ticket'} onChange={e => updateTicket({ status: e.target.value })}>{SUPPORT_STATUSES.map(s => <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>)}</select></Field>
                <Field label="Priority"><select className="select" aria-label="Ticket priority" data-testid="support-detail-priority-select" value={active.priority} disabled={busy === 'ticket'} onChange={e => updateTicket({ priority: e.target.value })}>{SUPPORT_PRIORITIES.map(p => <option key={p} value={p}>{SUPPORT_PRIORITY_LABELS[p]}</option>)}</select></Field>
                <Field label="Assignee"><select className="select" aria-label="Ticket assignee" data-testid="support-assignee-select" value={active.assigned_to || ''} disabled={busy === 'ticket'} onChange={e => updateTicket({ assignedTo: e.target.value || null })}><option value="">Unassigned</option>{assigneeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              </div> : <div className="rounded-md border divider bg-slate-50 p-3 text-xs muted dark:bg-ink-950/40"><Icon name="ShieldCheck" size={14} className="mr-1.5 inline"/>Status, priority and assignment are managed by workspace owners and administrators.</div>}
            </div>
          </Card>

          <Card>
            <CardHead title="Conversation" subtitle="Updates stay attached to this ticket and its workspace." action={<Badge tone="slate">{comments.length}</Badge>}/>
            <div data-testid="support-comment-list" className="divide-y divider">
              {commentsQuery.isLoading ? <div className="p-4"><Skeleton className="h-16"/></div> : comments.length === 0 ? <EmptyState compact icon="MessageSquare" title="No updates yet" description="Add context, a workaround or a question for the workspace team."/> :
                comments.map(c => <div key={c.id} data-testid="support-comment" className="flex gap-3 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{initials(c.author_name)}</span>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-2"><p className="text-xs font-semibold">{c.author_name}</p><span className="text-[10px] muted">{date(c.created_at)} · {ago(c.created_at)}</span></div><p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p></div>
                </div>)}
            </div>
            <form onSubmit={postComment} className="border-t divider p-4">
              <Field label="Add an update"><textarea className="input min-h-[84px] resize-y py-2" data-testid="support-comment-input" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add more detail, ask a question, or describe a resolution…" maxLength={3000} required/></Field>
              <div className="mt-3 flex justify-end"><Button type="submit" variant="primary" icon="Send" loading={busy === 'comment'}>Post update</Button></div>
            </form>
          </Card>
        </div>}
    </div>
  </div>;
}
