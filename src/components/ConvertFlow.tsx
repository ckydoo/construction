'use client';
/* The "Convert to…" drawer: shows where a job is in the commercial chain and
 * creates the next linked record(s) in one click. Nothing is overwritten. */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as Lucide from '@/components/lucide';
import { Button, Drawer, Badge, Card, Icon, Skeleton } from './ui';
import { useToast } from './Providers';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { CHAIN_STAGES } from '@/lib/conversion-chain';
import { RESOURCE_MAP } from '@/lib/resources';

type Preview = { label: string; value: string }[];
type Option = {
  id: string; to: string; label: string; hint: string; icon: string;
  creates: string[]; preview: Preview; also: string[]; sourcePatch: string | null;
  existing: { id: string; number?: string; title?: string; href: string } | null;
};
type ChainStep = {
  id: string; label: string; short: string; singular: string; icon: string;
  optional: boolean; state: 'done' | 'current' | 'todo' | 'skipped';
  record: { id: string; number?: string; title?: string; status?: string } | null;
};
type FlowData = {
  chain: ChainStep[];
  options: Option[];
  convertedFrom: { resource: string; id: string; number?: string; label?: string; href: string | null } | null;
};

const STATE_STYLE: Record<string, string> = {
  done: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  current: 'border-brand-400 bg-brand-50 text-brand-800 dark:border-brand-400/40 dark:bg-brand-500/10 dark:text-brand-200',
  skipped: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-ink-700 dark:bg-ink-950/40 dark:text-slate-400',
  todo: 'border-slate-200 bg-white text-slate-500 dark:border-ink-700 dark:bg-ink-900 dark:text-slate-400',
};

export default function ConvertFlow({ org, resource, row, open, onClose }: {
  org: string; resource: string; row: any; open: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const url = orgApi(org, `records/${resource}/${row?.id}/convert`);
  const { data, isLoading, refetch } = useQuery<FlowData>({
    queryKey: ['convert', org, resource, row?.id],
    queryFn: () => apiGet(url),
    enabled: open && !!row?.id,
    staleTime: 0,
  });
  const convert = useMutation({
    mutationFn: (to: string) => apiSend(url, 'POST', { to }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      toast.push({
        tone: 'success', title: 'Converted — flow continued',
        description: `${r.rows?.length || 1} linked record${r.rows?.length === 1 ? '' : 's'} created: ${(r.rows || []).map((x: any) => x.number).join(' + ')}`,
      });
      setBusy(null);
      onClose();
      if (r.href) router.push(r.href);
    },
    onError: (e: any) => {
      setBusy(null);
      toast.push({ tone: 'error', title: 'Could not convert', description: e.message });
      refetch();
    },
  });
  const submit = (id: string) => { setBusy(id); convert.mutate(id); };
  const def = RESOURCE_MAP[resource];

  const footer = <div className="flex flex-wrap items-center justify-between gap-2">
    <p className="text-[11px] muted max-w-lg">Converting creates a new draft and links it back. The record you are viewing is not deleted or replaced. Each step can only be done once.</p>
    <Button onClick={onClose}>Close</Button>
  </div>;

  return <Drawer open={open} onClose={onClose} title="Continue this job"
    subtitle={`${row?.number || ''} · ${def?.singular || resource} · convert to the next step`}
    width="max-w-2xl" footer={footer}>
    <div className="space-y-5 px-4 py-4">

      {data?.convertedFrom && <div className="flex flex-wrap items-center gap-2 rounded-lg border divider bg-slate-50 p-3 dark:bg-ink-950/40">
        <Icon name="CornerDownRight" size={15} className="text-brand-600 dark:text-brand-300" />
        <p className="text-xs">Converted from <strong>{data.convertedFrom.label || data.convertedFrom.number || data.convertedFrom.resource}</strong></p>
        {data.convertedFrom.href && <Link href={data.convertedFrom.href} className="ml-auto text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Open source →</Link>}
      </div>}

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Where this job is</h3>
          <Badge tone="slate">{CHAIN_STAGES.length} stages</Badge>
        </div>
        {isLoading || !data ? <Skeleton className="h-20" /> : <>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {data.chain.map((s, i) => <div key={s.id} className={`min-w-[112px] shrink-0 rounded-md border p-2.5 ${STATE_STYLE[s.state]}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold tracking-wide opacity-70">{String(i + 1).padStart(2, '0')}</span>
                {s.state === 'done' ? <Lucide.Check size={13} /> : s.state === 'current' ? <Lucide.CircleDot size={13} /> : s.optional ? <span className="text-[9px]">optional</span> : null}
              </div>
              <p className="mt-1 text-[11px] font-semibold leading-tight">{s.short}</p>
              <p className="mt-0.5 truncate text-[10px] opacity-75">{s.record?.number || (s.state === 'done' ? 'Created' : s.state === 'skipped' ? 'Skipped' : 'Not yet')}</p>
            </div>)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {data.chain.filter(s => s.state === 'done' && s.record).map(s => {
              const href = s.id === 'projects' ? `/${org}/projects/${encodeURIComponent(s.record!.id)}` : `/${org}/m/${s.id}?open=${encodeURIComponent(s.record!.id)}`;
              return <Link key={s.id} href={href} className="rounded-md border divider px-2 py-1 text-[10px] text-ink-600 hover:border-brand-400 hover:text-brand-700 dark:text-slate-300">
                {s.short}: {s.record?.number || 'open'} →</Link>;
            })}
          </div>
        </>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Next step</h3>
          <Badge tone="blue">{data?.options?.length ?? 0} available</Badge>
        </div>
        {isLoading || !data ? <div className="space-y-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          : !data.options.length ? <Card className="p-4"><p className="caption">There is nothing to convert from this record. Either the next module is switched off, your role cannot create those records, or every next step has already been created.</p></Card>
            : <div className="space-y-3">{data.options.map(o => <Card key={o.id} className="p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border divider bg-slate-50 text-ink-600 dark:bg-ink-950/40 dark:text-slate-300"><Icon name={o.icon} size={16} /></span>
                  <div className="min-w-0"><p className="card-title">{o.label}</p><p className="caption mt-0.5">{o.hint}</p></div>
                </div>
                {o.existing
                  ? <Link href={o.existing.href} className="btn-outline btn-sm whitespace-nowrap"><Lucide.ExternalLink size={13} />Open {o.existing.number || 'created'}</Link>
                  : <Button size="sm" variant="primary" icon="ArrowRightLeft" loading={busy === o.id} disabled={!!busy} onClick={() => submit(o.id)}>{o.label}</Button>}
              </div>
              <div className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {o.preview.map((p, i) => <div key={`${p.label}-${i}`} className="flex min-w-0 items-baseline gap-1.5 text-[11px]">
                  <span className="shrink-0 muted">{p.label}</span>
                  <span className="min-w-0 truncate font-medium text-ink-800 dark:text-slate-200">{p.value}</span>
                </div>)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t divider pt-2.5">
                <Badge tone="slate">Creates: {o.creates.join(' + ')}</Badge>
                {o.sourcePatch && <Badge tone="amber">Also: {o.sourcePatch}</Badge>}
                {o.existing && <Badge tone="green">Already converted</Badge>}
              </div>
            </Card>)}</div>}
      </section>

      <p className="caption border-t divider pt-3">Tip: status changes (WON, AWARDED, ISSUED, PAID) can also be made inline on any list. Convert to… is for carrying the details forward, not for changing status by hand.</p>
    </div>
  </Drawer>;
}
