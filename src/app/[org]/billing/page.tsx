'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, orgApi } from '@/lib/client';
import { normaliseCurrencyConfig, toBase, hasRate, type CurrencyConfig } from '@/lib/currency';
import { Badge, Button, Card, CardHead, EmptyState, Icon, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Providers';

const STATUS_LABELS: Record<string, string> = {
  trial_required: 'Trial not started', trialing: '14-day no-card trial', active: 'Active',
  past_due: 'Payment overdue', grace: 'Read-only grace', switch_pending: 'Gateway switch pending',
  locked: 'Locked', cancelled: 'Cancelled', comped: 'Grandfathered · comped',
};
const STATUS_TONES: Record<string, any> = {
  trial_required: 'amber', trialing: 'blue', active: 'green', past_due: 'amber',
  grace: 'amber', switch_pending: 'violet', locked: 'red', cancelled: 'slate', comped: 'green',
};

function zwgEquivalent(priceUsd: number, cfg: CurrencyConfig | null): string | null {
  if (!cfg || !hasRate('ZWG', cfg) || !cfg.enabled?.includes('ZWG')) return null;
  const inBase = toBase(priceUsd, 'USD', cfg);
  const zwg = cfg.base === 'ZWG' ? inBase : inBase * Number(cfg.rates.ZWG || 0);
  return Number.isFinite(zwg) && zwg > 0 ? `≈ ZWG ${zwg.toLocaleString(undefined, { maximumFractionDigits: 2 })} display only` : null;
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
    || (!billing?.paynowPreferred && (i?.gateway === 'dpo' || i?.gateway === 'mock'));

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
      toast.push({ tone: 'success', title: 'Billing updated', description: result.message || 'Your subscription details have been refreshed.' });
      return result;
    } catch (e: any) {
      toast.push({ tone: 'error', title: 'Could not complete billing action', description: e.message });
    } finally { setBusy(''); }
  }
  async function selectPlan(planId: string) {
    setSelected(planId);
    if (status === 'trial_required' && active) {
      setBusy(`plan-${planId}`);
      try {
        await apiSend(orgApi(org, 'billing'), 'POST', { action: 'selectPlan', planId });
        await qc.invalidateQueries({ queryKey: ['billing', org] });
      } catch (e: any) { toast.push({ tone: 'error', title: 'Could not select plan', description: e.message }); }
      finally { setBusy(''); }
    }
  }
  async function startTrial(planId: string) { await send('billing', { action: 'startTrial', planId }, 'trial'); }
  async function setPaynowPreference(usePaynow: boolean) {
    await send('billing', { action: 'setPaynowPreference', usePaynow }, 'switch');
  }
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

    {!active && <Card><div className="flex items-start gap-3 p-4"><Icon name="ShieldCheck" size={19}/><div><p className="text-sm font-semibold">Shadow mode — nobody is charged or locked</p><p className="mt-1 text-xs muted">The DPO Pay subscription system is built, but production billing is disabled until live DPO credentials, merchant/tokenisation approval, callback secrets, VAT/tax decision and the Zimbabwe payout route are confirmed. Stripe was removed because it cannot pay out a Zimbabwe-registered entity. Existing organisations are grandfathered comped.</p></div></div></Card>}
    {active && billing?.needsPayment && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Payment required to unlock this workspace</p><p className="mt-1 text-xs muted">Nothing has been deleted. Choose a plan and start the 14-day no-card trial, or pay an open DPO Pay invoice.</p></div><Badge tone="red">Read-only</Badge></div></Card>}
    {active && billing?.readOnly && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Workspace is read-only during the 3-day grace period{billing?.graceUntil ? ` until ${new Date(billing.graceUntil).toLocaleDateString('en-GB')}` : ''}</p><p className="mt-1 text-xs muted">Pay the open invoice with DPO Pay (or the local Paynow fallback) to restore full access. No data is deleted.</p></div><Badge tone="amber">Grace</Badge></div></Card>}
    {active && status === 'trialing' && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Your 14-day no-card trial is active</p><p className="mt-1 text-xs muted">No card was collected and no charge is due until {trialDate}. Your first invoice will be payable by DPO Pay when the trial ends.</p></div><Badge tone="blue">No card required</Badge></div></Card>}
    {status === 'comped' && <Card><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Grandfathered organisation</p><p className="mt-1 text-xs muted">This workspace was created before subscriptions and remains active and comped with no expiry.</p></div><Badge tone="green">No payment required</Badge></div></Card>}

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
      <Card><CardHead title="Payment gateway" subtitle="DPO Pay primary · 14-day no-card trial"/>
        <div className="space-y-3 p-4">
          <p className="text-xs muted">DPO Pay by Network handles the first customer-present payment. With merchant-approved Super Wallet tokenisation, later monthly renewals can be charged automatically. Paynow Zimbabwe remains an optional local fallback with manual monthly invoices. Stripe has been removed because a Zimbabwe-registered entity cannot receive its payouts.</p>
          {billing?.dpoTokenised && <Badge tone="green">Saved DPO payment token active</Badge>}
          {billing?.dpoRecurringEnabled && <p className="text-[11px] muted">Recurring DPO charges are enabled for this deployment.</p>}
          {['trial_required','trialing','grace'].includes(status) && billing?.paynowAvailable && <label className="flex items-start gap-3 rounded-md border divider p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={!!billing?.paynowPreferred} disabled={!active || busy === 'switch'} onChange={e => setPaynowPreference(e.target.checked)}/>
            <span><strong>Use Paynow Zimbabwe as local fallback</strong><span className="mt-1 block text-xs muted">Manual customer-present invoices only; no tokenisation or silent autodebit.</span></span>
          </label>}
          {['active','trialing','grace','past_due','switch_pending'].includes(status) && !sub?.cancelled_at && <Button variant="ghost" icon="X" loading={busy === 'cancel'} onClick={cancel}>Cancel at period end</Button>}
        </div></Card>
      <Card><CardHead title="Invoices" subtitle="USD settlement · DPO Pay / Paynow fallback"/>
        <div className="p-4">
          {invoices.length === 0 ? <EmptyState icon="Receipt" title="No invoices yet" description="Your first invoice appears here at trial end or at each monthly renewal."/> :
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b divider muted"><th className="py-2">Invoice</th><th className="py-2">Period</th><th className="py-2">Amount</th><th className="py-2">Status</th><th className="py-2"></th></tr></thead><tbody>
              {invoices.map((i: any) => <tr key={i.id} className="border-b divider/60"><td className="py-2 font-mono text-[10px]">{i.invoice_number}</td><td className="py-2">{new Date(i.period_start).toLocaleDateString('en-GB')}</td><td className="py-2">USD {Number(i.amount_usd).toFixed(2)}</td><td className="py-2"><Badge tone={i.status === 'paid' ? 'green' : i.status === 'failed' ? 'red' : 'amber'}>{i.status}</Badge></td><td className="py-2 text-right">{i.status === 'pending' && <Button size="sm" variant="primary" loading={busy === `pay-${i.id}`} onClick={() => send('billing/pay', { invoiceId: i.id }, `pay-${i.id}`)}>{dpoInvoice(i) ? 'Pay with DPO Pay' : 'Pay with Paynow'}</Button>}</td></tr>)}
            </tbody></table></div>}
          <p className="mt-3 text-[11px] muted">Prices are exclusive of VAT/tax. DPO callbacks are verifyToken-confirmed and amount/currency matched; Paynow webhooks are hash-verified, poll-confirmed and idempotent. No data is deleted on non-payment.</p>
        </div></Card>
    </div>
  </div>;
}
