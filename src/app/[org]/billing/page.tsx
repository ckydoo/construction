'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { normaliseCurrencyConfig, toBase, hasRate, type CurrencyConfig } from '@/lib/currency';
import { Badge, Button, Card, CardHead, EmptyState, Icon, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Providers';

const STATUS_LABELS: Record<string, string> = {
  trial_required: 'Trial not started', trialing: '14-day free trial', active: 'Active',
  past_due: 'Payment overdue', grace: 'Payment overdue', switch_pending: 'Payment update pending',
  locked: 'Access paused', cancelled: 'Cancelled', comped: 'No payment due',
};
const STATUS_TONES: Record<string, any> = {
  trial_required: 'amber', trialing: 'blue', active: 'green', past_due: 'amber',
  grace: 'amber', switch_pending: 'violet', locked: 'red', cancelled: 'slate', comped: 'green',
};

function zwgEquivalent(priceUsd: number, cfg: CurrencyConfig | null): string | null {
  if (!cfg || !hasRate('ZWG', cfg) || !cfg.enabled?.includes('ZWG')) return null;
  const inBase = toBase(priceUsd, 'USD', cfg);
  const zwg = cfg.base === 'ZWG' ? inBase : inBase * Number(cfg.rates.ZWG || 0);
  return Number.isFinite(zwg) && zwg > 0 ? `≈ ZWG ${zwg.toLocaleString(undefined, { maximumFractionDigits: 2 })} equivalent` : null;
}

export default function BillingPage() {
  const { org } = useParams<{ org: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string>('STARTER');
  const [busy, setBusy] = useState('');
  const { data, isLoading }: any = useQuery({
    queryKey: ['billing', org], queryFn: () => apiGet(orgApi(org, 'billing')),
  });
  const { data: meta }: any = useQuery({
    queryKey: ['meta', org], queryFn: () => apiGet(orgApi(org, 'meta')),
  });
  const currency = useMemo(() => meta?.org?.currency
    ? normaliseCurrencyConfig(meta.org.currency, meta.org.baseCurrency || 'USD') : null, [meta]);
  const billing = data?.billing;
  const sub = data?.subscription;
  const invoices: any[] = data?.invoices || [];
  const canManage = billing?.canManage;
  const active = billing?.enabled;
  const status = billing?.status || 'trial_required';
  const dpoInvoice = (i: any) => Boolean(i?.metadata?.dpo)
    || i?.gateway === 'dpo' || i?.gateway === 'mock';

  useEffect(() => { if (billing?.plan) setSelected(billing.plan); }, [billing?.plan]);

  async function send(path: string, body: any, key: string) {
    setBusy(key);
    try {
      const result = await apiSend(orgApi(org, path), 'POST', body);
      if (result.url) { window.location.assign(result.url); return; }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['billing', org] }),
        qc.invalidateQueries({ queryKey: ['meta', org] }),
      ]);
      toast.push({ tone: 'success', title: 'Billing updated', description: 'Your subscription details have been updated.' });
      return result;
    } catch (e: any) {
      toast.push({ tone: 'error', title: 'Could not complete billing action', description: userMessage(e, 'We couldn’t update your billing details. Please try again.') });
    } finally { setBusy(''); }
  }
  async function selectPlan(planId: string) {
    setSelected(planId);
    if (status === 'trial_required' && active) {
      setBusy(`plan-${planId}`);
      try {
        await apiSend(orgApi(org, 'billing'), 'POST', { action: 'selectPlan', planId });
        await qc.invalidateQueries({ queryKey: ['billing', org] });
      } catch (e: any) { toast.push({ tone: 'error', title: 'Could not select plan', description: userMessage(e, 'We couldn’t select that plan. Please try again.') }); }
      finally { setBusy(''); }
    }
  }
  async function startTrial(planId: string) { await send('billing', { action: 'startTrial', planId }, 'trial'); }
  async function cancel() {
    if (!window.confirm('Cancel at the end of the current paid period? Your data will stay intact.')) return;
    await send('billing', { action: 'cancel' }, 'cancel');
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/3"/><Skeleton className="h-72"/></div>;
  if (!canManage) return <Card><EmptyState icon="ShieldCheck" title="Billing is restricted" description="Only organisation owners and administrators can view or change subscription details."/></Card>;

  const planCards = (billing?.plans || []);
  const trialDate = billing?.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const periodDate = billing?.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="heading">Billing & subscription</h1><p className="caption mt-1">USD 9 / 29 / 99 per organisation per month, everywhere. Prices exclude VAT/tax.</p></div>
      <Badge tone={STATUS_TONES[status] || 'slate'}>{STATUS_LABELS[status] || status}</Badge>
    </div>

    {!active && <Card><div className="flex items-start gap-3 p-4"><Icon name="ShieldCheck" size={19}/><div><p className="text-sm font-semibold">Billing is not active yet</p><p className="mt-1 text-xs muted">You can keep using this workspace. No payment is needed right now.</p></div></div></Card>}
    {active && billing?.needsPayment && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Payment needed to keep editing</p><p className="mt-1 text-xs muted">Your data is safe. Choose a plan to start your free trial, or pay an open invoice.</p></div><Badge tone="red">Editing paused</Badge></div></Card>}
    {active && billing?.readOnly && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Editing is paused while payment is overdue{billing?.graceUntil ? ` until ${new Date(billing.graceUntil).toLocaleDateString('en-GB')}` : ''}</p><p className="mt-1 text-xs muted">Pay the open invoice to restore full access. Your data is safe.</p></div><Badge tone="amber">Payment overdue</Badge></div></Card>}
    {active && status === 'trialing' && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Your 14-day free trial is active</p><p className="mt-1 text-xs muted">You won’t be charged until {trialDate}. Your first invoice will appear here when the trial ends.</p></div><Badge tone="blue">No card required</Badge></div></Card>}
    {status === 'comped' && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">No payment required</p><p className="mt-1 text-xs muted">Your workspace is active, and no payment is due.</p></div><Badge tone="green">No payment required</Badge></div></Card>}

    <div className="grid gap-4 lg:grid-cols-3">
      {planCards.map((p: any) => {
        const current = p.id === billing?.plan;
        const equivalent = zwgEquivalent(p.priceUsd, currency);
        return <Card key={p.id} className={current ? 'ring-2 ring-brand-500' : ''}>
          <div className="p-4">
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{p.name}</h2>{current && <Badge tone="blue">Current</Badge>}</div>
            <p className="mt-2 text-3xl font-bold">USD {p.priceUsd}<span className="text-xs font-normal muted"> /org/month</span></p>
            {equivalent && <p className="mt-1 text-[11px] muted">{equivalent}</p>}
            <p className="mt-2 text-xs muted">{p.maxUsers ? `Up to ${p.maxUsers} users` : 'Unlimited users'} · {p.maxProjects ? `Up to ${p.maxProjects} active projects` : 'Unlimited active projects'}</p>
            <ul className="mt-4 space-y-2 text-xs">
              {p.features.map((f: string) => <li key={f} className="flex gap-2"><Icon name="Check" size={14} className="text-emerald-500"/><span>{f}</span></li>)}
            </ul>
            <div className="mt-5 space-y-2">
              {status === 'trial_required' && <>
                <Button variant={selected === p.id ? 'primary' : 'ghost'} className="w-full" loading={busy === `plan-${p.id}`} onClick={() => selectPlan(p.id)}>{selected === p.id ? 'Selected' : 'Select plan'}</Button>
                {selected === p.id && <Button variant="primary" className="w-full" icon="Rocket" loading={busy === 'trial'} disabled={!active || p.id !== selected} onClick={() => startTrial(p.id)}>Start 14-day free trial</Button>}
              </>}
              {p.contactSales && <Button variant="ghost" className="w-full" loading={busy === 'sales'} disabled={!active || status === 'trial_required'} onClick={() => send('billing', { action: 'contactSales' }, 'sales')}>Contact sales</Button>}
              {status !== 'trial_required' && current && <div className="rounded-md bg-slate-50 px-3 py-2 text-center text-xs muted dark:bg-ink-950/40">{periodDate ? `Current period ends ${periodDate}` : 'Active subscription'}</div>}
            </div>
          </div>
        </Card>;
      })}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHead title="Payment options" subtitle="Secure monthly payments"/>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2"><Badge tone="blue">Paynow</Badge>{billing?.dpoFallbackAvailable && <Badge tone="green">Alternative payment option available</Badge>}</div>
          <p className="text-xs muted">Your monthly invoice can be paid securely online. If the usual option is unavailable, another secure payment option will be offered when available.</p>
          {['active','trialing','grace','past_due','switch_pending'].includes(status) && !sub?.cancelled_at && <Button variant="ghost" icon="X" loading={busy === 'cancel'} onClick={cancel}>Cancel at period end</Button>}
        </div></Card>
      <Card><CardHead title="Invoices" subtitle="Your billing history"/>
        <div className="p-4">
          {invoices.length === 0 ? <EmptyState icon="Receipt" title="No invoices yet" description="Your first invoice will appear here at the end of your trial or at each renewal."/> :
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b divider muted"><th className="py-2">Invoice</th><th className="py-2">Period</th><th className="py-2">Amount</th><th className="py-2">Status</th><th className="py-2"></th></tr></thead><tbody>
              {invoices.map((i: any) => <tr key={i.id} className="border-b divider/60"><td className="py-2 font-mono text-[10px]">{i.invoice_number}</td><td className="py-2">{new Date(i.period_start).toLocaleDateString('en-GB')}</td><td className="py-2">USD {Number(i.amount_usd).toFixed(2)}</td><td className="py-2"><Badge tone={i.status === 'paid' ? 'green' : i.status === 'failed' ? 'red' : 'amber'}>{i.status}</Badge></td><td className="py-2 text-right">{i.status === 'pending' && <Button size="sm" variant="primary" loading={busy === `pay-${i.id}`} onClick={() => send('billing/pay', { invoiceId: i.id }, `pay-${i.id}`)}>{dpoInvoice(i) ? 'Pay with DPO Pay' : 'Pay with Paynow'}</Button>}</td></tr>)}
            </tbody></table></div>}
          <p className="mt-3 text-[11px] muted">Prices exclude VAT/tax. Your data stays safe if a payment is missed.</p>
        </div></Card>
    </div>
  </div>;
}
