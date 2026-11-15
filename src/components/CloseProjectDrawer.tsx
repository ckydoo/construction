'use client';
/* Close-out review for a job. Removing a project from the active portfolio is
 * a commercial decision: this drawer shows what is unfinished, requires a clear
 * closure type and reason, and records an acknowledged override when anything
 * is outstanding. Server recomputes everything; the UI never trusted. */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, Field, Icon } from './ui';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { useToast } from './Providers';
import { userMessage } from '@/lib/user-message';

type Summary = {
  progress: number; status: string; actualCompletion: string | null;
  baseCurrency: string;
  issues: { key: string; label: string; detail: string }[];
  counts: Record<string, number>;
  outstandingInvoiceTotal: number; outstandingInvoiceCurrency: string | null;
  walletFunded: boolean; walletRemaining: number;
};

const TYPE_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: 'COMPLETION', label: 'Successful completion', sub: 'Works delivered and handed over.' },
  { id: 'CANCELLATION', label: 'Cancellation', sub: 'The job will not be delivered.' },
  { id: 'ADMINISTRATIVE', label: 'Administrative closure', sub: 'Duplicate, testing or bookkeeping record.' },
];

export default function CloseProjectDrawer({ org, id, open, onClose, onClosed }: { org: string; id: string; open: boolean; onClose: () => void; onClosed: () => void }) {
  const toast = useToast(); const qc = useQueryClient();
  const [closureType, setClosureType] = useState('COMPLETION');
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery<Summary>({ queryKey: ['closeout', org, id], queryFn: () => apiGet(orgApi(org, `projects/${id}/closeout`)), enabled: open, staleTime: 10_000 });
  useEffect(() => { if (open) { setAcknowledged(false); } }, [open, closureType]);

  const issues = useMemo(() => data?.issues || [], [data]);
  const noteRequired = closureType !== 'COMPLETION' || (data?.progress ?? 100) < 100;
  const canSubmit = !!data && (!noteRequired || note.trim().length > 0) && (issues.length === 0 || acknowledged) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await apiSend(orgApi(org, `projects/${id}/close`), 'POST', { closureType, note: note.trim(), acknowledged });
      toast.push({ tone: 'success', title: 'Project closed', description: closureType === 'COMPLETION' ? 'Completion recorded with today\u2019s date.' : 'Closure recorded.' });
      await Promise.all(['project', 'records', 'overview', 'profitability', 'my-work'].map(k => qc.invalidateQueries({ queryKey: [k, org] })));
      await qc.invalidateQueries({ queryKey: ['project', org, id] });
      onClosed(); onClose();
    } catch (e: any) {
      toast.push({ tone: 'error', title: 'Project not closed', description: userMessage(e, 'Review the unresolved items and try again.') });
      refetch();
    } finally { setBusy(false); }
  }

  return <Drawer open={open} onClose={() => !busy && onClose()} title="Close project" subtitle="Removing a job from the active portfolio. Records are kept — this is a review, not a delete." width="max-w-lg" footer={
    <div className="flex items-center justify-between gap-2"><Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!canSubmit} onClick={submit} icon="Lock">Close project</Button></div>
  }>
    <div className="space-y-4 px-4 py-4">
      {isLoading && <p className="caption">Reviewing open items…</p>}
      {isError && <p className="caption text-red-600">The close-out summary is unavailable. Nothing was closed.</p>}
      {data && <>
        <div><p className="text-[11px] font-semibold uppercase tracking-wide muted">Closure type</p>
          <div className="mt-1.5 grid gap-1.5">{TYPE_OPTIONS.map(o => <label key={o.id} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs ${closureType === o.id ? 'border-brand-500 bg-brand-50/60 dark:border-brand-400/60 dark:bg-brand-500/10' : 'divider'}`}><input type="radio" name="closureType" className="mt-0.5" checked={closureType === o.id} onChange={() => setClosureType(o.id)}/><span><span className="font-semibold">{o.label}</span><span className="mt-0.5 block muted">{o.sub}</span></span></label>)}</div>
        </div>
        <div className="rounded-md border divider p-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">This project, right now</p><span className="text-sm font-semibold tabular-nums">{data.progress}% progress</span></div>
          {issues.length === 0
            ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">No unresolved items found across tasks, variations, invoices, punch list, RFIs or wallet funding.</p>
            : <ul className="mt-2 space-y-1.5">{issues.map(i => <li key={i.key} className="flex items-start gap-2 text-xs"><Icon name="AlertTriangle" size={14} className="mt-0.5 shrink-0 text-amber-500"/><span><span className="font-semibold">{i.label}.</span> <span className="muted">{i.detail}</span></span></li>)}</ul>}
        </div>
        <Field label="Closure note" required={noteRequired} hint={noteRequired ? (closureType === 'COMPLETION' ? 'Required because the job is below 100% progress.' : 'Recorded in the audit trail.') : 'Optional. Recorded in the audit trail.'}>
          <textarea className="input min-h-[72px] resize-y py-2" value={note} onChange={e => setNote(e.target.value)} placeholder={closureType === 'CANCELLATION' ? 'e.g. Client cancelled scope on 12 Nov; demobilisation instructed…' : 'e.g. Handover complete on 28 Nov; retention held per contract…'}/>
        </Field>
        {issues.length > 0 && <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/><span><span className="font-semibold">Close with unresolved items.</span> I have reviewed the {issues.length} item{issues.length === 1 ? '' : 's'} above and accept responsibility for closing the job anyway. This is recorded in the audit trail.</span></label>}
        <p className="caption">Reopening later (status back to Active) is available from the project register. Closing does not send emails and does not settle money.</p>
      </>}
    </div>
  </Drawer>;
}
