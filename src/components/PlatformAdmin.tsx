'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as Lucide from '@/components/lucide';
import Logo from './Logo';
import { BRAND } from '@/lib/brand';
import { apiGet, apiSend } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { Card, CardHead, Badge, Toggle, Button, ConfirmDialog, Skeleton, EmptyState } from './ui';
import { useToast } from './Providers';
import { date, dateShort } from '@/lib/format';

type ConfirmKind = 'maintenance' | 'demo';

/* Diffs changed keys between two jsonb row snapshots (audit trail helper). */
function changedKeys(oldV: any, newV: any): { key: string; from: string; to: string }[] {
  if (!oldV || !newV || typeof oldV !== 'object' || typeof newV !== 'object') return [];
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const out: { key: string; from: string; to: string }[] = [];
  for (const k of keys) {
    const a = JSON.stringify(oldV[k]);
    const b = JSON.stringify(newV[k]);
    if (a !== b && !['updated_at', 'updated_by'].includes(k)) out.push({ key: k, from: String(oldV[k]), to: String(newV[k]) });
  }
  return out.slice(0, 4);
}

export default function PlatformAdmin({ actorEmail, actorName }: { actorEmail: string; actorName: string }) {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: ConfirmKind; value: boolean }>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiGet('/api/platform/config');
      setData(r); setError('');
    } catch (e: any) {
      setError(userMessage(e, 'We could not load the platform configuration.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function apply(kind: ConfirmKind, value: boolean) {
    setBusy(kind);
    try {
      await apiSend('/api/platform/config', 'POST', {
        action: 'updateSettings',
        fields: kind === 'maintenance' ? { maintenance_mode: value } : { demo_enabled: value },
      });
      toast.push({ tone: 'success', title: value ? (kind === 'maintenance' ? 'Maintenance mode is ON' : 'Demo mode is ON') : 'Switched back off', description: kind === 'maintenance' ? (value ? 'Customers are now redirected to the maintenance page. Platform owners keep access.' : 'The platform is open again.') : (value ? 'Demo entry points are now visible. Never enable this on the production site.' : 'Demo entry points are hidden.') });
      await load();
    } catch (e: any) {
      toast.push({ tone: 'error', title: 'Could not update the switch', description: userMessage(e, 'Please try again.') });
    } finally { setBusy(''); setConfirm(null); }
  }

  const settings = data?.settings;
  const master = data?.masterSwitches || {};
  const admins: any[] = data?.platformAdmins || [];
  const audit: any[] = data?.audit || [];
  const maintenanceOn = !!settings?.maintenance_mode;
  const demoOn = !!settings?.demo_enabled;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
      <header className="border-b border-ink-800 bg-ink-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-4">
            <Logo variant="lockup" light className="h-6 w-auto" title={BRAND.name} />
            <span className="hidden h-5 w-px bg-white/15 sm:block" />
            <div className="hidden sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">Platform owner</p>
              <p className="text-[11px] text-slate-400">Signed in as {actorName || actorEmail}</p>
            </div>
          </div>
          <Link href="/" className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5">Back to myla.co.zw</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-5 py-8">
        <div>
          <h1 className="heading">Production switches</h1>
          <p className="caption mt-1">Changes here are live immediately and recorded in the configuration audit trail.</p>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

        {!data && !error && <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>}

        {data && (
          <>
            <Card>
              <CardHead title="Go-live control" subtitle="The two switches that decide how the public sees MYLA today." />
              <div className="divide-y divider">
                <div className="flex items-start justify-between gap-6 p-5">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${maintenanceOn ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-400'}`}><Lucide.Wrench size={17} /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">Maintenance mode</p><Badge tone={maintenanceOn ? 'amber' : 'green'}>{maintenanceOn ? 'On — customers see the maintenance page' : 'Off — platform is open'}</Badge></div>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed muted">While on, everyone except platform owners is sent to the maintenance page and app APIs answer 503. Use for planned work or an incident. Sign-in pages, the platform page and the marketing site stay reachable.</p>
                    </div>
                  </div>
                  <Toggle checked={maintenanceOn} onChange={(v) => setConfirm({ kind: 'maintenance', value: v })} label="Toggle maintenance mode" />
                </div>
                <div className="flex items-start justify-between gap-6 p-5">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${demoOn ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' : 'bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-400'}`}><Lucide.Sparkles size={17} /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">Demo mode</p><Badge tone={demoOn ? 'violet' : 'slate'}>{demoOn ? 'On — demo entry points visible' : 'Off — recommended for production'}</Badge></div>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed muted">Shows one-click demo accounts on the sign-in page, “Load demo data” in Settings, the onboarding sample-data toggle and the empty-workspace demo buttons. Keep this OFF on myla.co.zw.</p>
                    </div>
                  </div>
                  <Toggle checked={demoOn} onChange={(v) => setConfirm({ kind: 'demo', value: v })} label="Toggle demo mode" />
                </div>
                <div className="flex items-start justify-between gap-6 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-ink-800 dark:text-slate-400"><Lucide.CreditCard size={17} /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">Billing enforcement</p><Badge tone={master.billingEnabled ? 'green' : 'slate'}>{master.billingEnabled ? 'BILLING_ENABLED — on in environment' : 'BILLING_ENABLED — off in environment'}</Badge></div>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed muted">The billing lock is an environment master switch ({master.billingEnabled ? 'enabled' : 'disabled'}). It cannot be changed from this page; change it in the Vercel environment variables and redeploy.</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="Staged settings" subtitle="Desired state for the billing runtime — environment and code constants remain authoritative." />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-xs sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Currency', settings?.currency],
                  ['Tax included', settings?.tax_included ? 'Yes' : 'No'],
                  ['Trial days', settings?.trial_days],
                  ['Grace days', settings?.grace_days],
                  ['Gateway', settings?.active_gateway],
                  ['Pricing model', settings?.pricing_model],
                ].map(([label, value]) => (
                  <div key={String(label)}><p className="text-[10px] font-semibold uppercase tracking-wide muted">{label}</p><p className="mt-1 font-mono text-[12px] text-ink-900 dark:text-slate-100">{value === undefined || value === null || value === '' ? '—' : String(value)}</p></div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHead title="Platform administrators" subtitle="These people keep access during maintenance mode and can change the switches above." />
              <div className="divide-y divider">
                {admins.length === 0 && <div className="p-5 text-xs muted">No platform administrators found.</div>}
                {admins.map((adm) => (
                  <div key={adm.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-[11px] font-semibold text-white">{String(adm.email || '?').slice(0, 2).toUpperCase()}</div>
                      <div><p className="text-xs font-medium text-ink-900 dark:text-slate-100">{adm.email}</p><p className="text-[10px] muted">Added {adm.created_at ? dateShort(adm.created_at) : '—'}{adm.revoked_at ? ` · revoked ${dateShort(adm.revoked_at)}` : ''}</p></div>
                    </div>
                    <Badge tone={adm.revoked_at ? 'slate' : 'green'}>{adm.revoked_at ? 'Revoked' : 'Active'}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHead title="Recent configuration activity" subtitle="Recorded automatically by the database — the last 50 changes across all platform settings." />
              <div className="divide-y divider">
                {audit.length === 0 && <div className="p-5"><EmptyState icon="History" title="No changes recorded yet" description="Toggles and staged settings edits will appear here." /></div>}
                {audit.slice(0, 12).map((row) => {
                  const diffs = changedKeys(row.old_values, row.new_values);
                  return (
                    <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={row.action === 'DELETE' ? 'red' : row.action === 'INSERT' ? 'green' : 'blue'}>{row.action}</Badge>
                          <code className="font-mono text-[11px] text-ink-700 dark:text-slate-300">{row.table_name}</code>
                          {row.note && <span className="text-[10px] muted">“{row.note}”</span>}
                        </div>
                        {diffs.length > 0 && (
                          <p className="mt-1.5 text-[11px] muted">
                            {diffs.map((d) => <span key={d.key} className="mr-3"><code className="font-mono">{d.key}</code>: {d.from} → {d.to}</span>)}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-[10px] muted">{row.changed_at ? date(row.changed_at) : ''}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
            <p className="pb-6 text-center text-[11px] muted">Every change on this page is written to the immutable platform audit trail. Credentials never belong in this page or its API.</p>
          </>
        )}
      </main>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && apply(confirm.kind, confirm.value)}
        loading={!!busy}
        confirmLabel={confirm?.kind === 'maintenance' ? (confirm?.value ? 'Enable maintenance mode' : 'Disable maintenance mode') : (confirm?.value ? 'Enable demo mode' : 'Disable demo mode')}
        title={confirm?.kind === 'maintenance' ? (confirm?.value ? 'Put MYLA into maintenance mode?' : 'Take MYLA out of maintenance mode?') : (confirm?.value ? 'Enable demo mode?' : 'Disable demo mode?')}
        description={confirm?.kind === 'maintenance'
          ? (confirm?.value ? 'Customers are redirected to the maintenance page and app APIs answer 503 until you switch it back off. Platform owners keep access. Billing and sign-in stay reachable.' : 'Customers regain normal access immediately.')
          : (confirm?.value ? 'One-click demo accounts appear on the sign-in page and workspaces can load the 616-record demo dataset. Never enable this on the production site.' : 'Demo accounts and all demo entry points are hidden immediately.')}
      />
    </div>
  );
}
