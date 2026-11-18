'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Icon, ProgressBar } from '@/components/ui';
import { resourceFullyEnabled } from '@/lib/module-visibility';

type Step = { resource: string; label: string; hint: string; href: string; cta: string };

const STEPS: Step[] = [
  { resource: 'clients',   label: 'Add your first client',        hint: 'Name, phone and where the job is — two minutes.',        href: 'm/clients?new=1',   cta: 'Add client' },
  { resource: 'estimates', label: 'Price the job — send a quote', hint: 'List the work and amounts; MYLA totals it for you.',     href: 'm/estimates?new=1', cta: 'Create quote' },
  { resource: 'projects',  label: 'Win it — open the job',        hint: 'Convert the accepted quote, or open the job directly.',  href: 'm/projects?new=1',  cta: 'Open job' },
  { resource: 'arInvoices',label: 'Invoice the client',           hint: 'Turn the job or quote into an invoice.',              href: 'm/arInvoices?new=1', cta: 'Create invoice' },
  { resource: 'payments',  label: 'Record the money in',          hint: 'Open the invoice and record the payment against it.',  href: 'm/arInvoices',  cta: 'Open invoices' },
];

const KEY = 'myla-quickstart-hidden';

/** The "first job" guide: five steps from first call to money in the bank.
 *  Progress is derived live from the workspace's own records, so the checklist
 *  ticks itself off as the user works — nothing to fill in by hand. */
export default function QuickstartCard({ org, counts, config }: { org: string; counts?: Record<string, number> | null; config: any }) {
  const storageKey = `${KEY}:${org}`;
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setMounted(true); try { setHidden(localStorage.getItem(storageKey) === '1'); } catch { /* private mode */ } }, [storageKey]);
  if (!mounted) return null;

  const steps = STEPS.filter(s => { try { return resourceFullyEnabled(config, s.resource); } catch { return true; } });
  if (steps.length === 0) return null;
  const done = steps.filter(s => Number(counts?.[s.resource] || 0) > 0).length;
  const allDone = done === steps.length;
  const nextResource = steps.find(s => !Number(counts?.[s.resource] || 0))?.resource;
  if (hidden) {
    return <div className="flex items-center justify-end"><button className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => { try { localStorage.removeItem(storageKey); } catch {} setHidden(false); }}>Show the first-job guide</button></div>;
  }

  if (allDone) {
    return <Card className="flex flex-wrap items-center gap-3 border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-emerald-600 shadow-sm dark:bg-ink-900 dark:text-emerald-300"><Icon name="CheckCircle2" size={20}/></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">Your workspace is getting started</p><p className="mt-0.5 text-xs muted">You have entries in each of the five everyday sections. Open a job to check its progress and payments.</p></div>
      <button aria-label="Hide this message" title="Hide this message" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-700 dark:hover:bg-ink-800" onClick={() => { try { localStorage.setItem(storageKey, '1'); } catch {} setHidden(true); }}><Icon name="X" size={16}/></button>
    </Card>;
  }

  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center gap-3 border-b divider bg-brand-50/50 p-3.5 dark:bg-brand-500/5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-300"><Icon name="Rocket" size={18}/></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink-900 dark:text-white">Your first job, start to finish</p><p className="mt-0.5 text-xs muted">Start with the next highlighted step. Checks show which sections already have an entry; they do not mean a job is finished.</p></div>
      <div className="flex shrink-0 items-center gap-3"><div className="w-28"><ProgressBar value={(done / steps.length) * 100}/></div><span className="text-xs font-semibold tabular-nums muted">{done} of {steps.length}</span>
        <button aria-label="Hide the first-job guide" title="Hide the first-job guide" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-700 dark:hover:bg-ink-800" onClick={() => { try { localStorage.setItem(storageKey, '1'); } catch {} setHidden(true); }}><Icon name="X" size={16}/></button>
      </div>
    </div>
    <ol className="divide-y divider">{steps.map((s, i) => {
      const isDone = Number(counts?.[s.resource] || 0) > 0;
      return <li key={s.resource} className={`flex items-center gap-3 px-3.5 py-2.5 ${s.resource===nextResource?'bg-brand-50/60 dark:bg-brand-500/10':''}`}>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${isDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'divider border text-slate-400 dark:text-slate-500'}`}>{isDone ? <Icon name="Check" size={13}/> : i + 1}</span>
        <div className="min-w-0 flex-1"><p className={`text-[13px] font-medium ${isDone ? 'muted line-through decoration-slate-300' : 'text-ink-800 dark:text-slate-100'}`}>{s.resource===nextResource&&<span className="mr-2 text-xs font-bold text-brand-700 dark:text-brand-300">Start here</span>}{s.label}</p>{!isDone && <p className="mt-0.5 text-[11px] leading-snug muted">{s.hint}</p>}</div>
        {!isDone && <Link href={`/${org}/${s.href}`} className="btn-outline btn-sm inline-flex shrink-0 items-center gap-1">{s.cta}<Icon name="ArrowRight" size={13}/></Link>}
      </li>;
    })}</ol>
    <div className="border-t divider px-3.5 py-2"><p className="text-[11px] muted">Need more — purchase orders, time sheets, staff or stock? Switch them on any time in <Link href={`/${org}/settings`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">Settings → Sections</Link>. Your records are kept either way.</p></div>
  </Card>;
}
