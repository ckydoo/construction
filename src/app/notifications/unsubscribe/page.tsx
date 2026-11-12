'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Lucide from '@/components/lucide';
import { apiSend } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { Button, Card, CardHead } from '@/components/ui';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand';

export default function UnsubscribePage() {
  const [token, setToken] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
    setDone(params.get('done') === '1');
    if (params.get('done') === '0') setMessage('This link is no longer valid. Sign in to manage your preferences.');
  }, []);

  async function turnOff() {
    setBusy(true); setMessage('');
    try {
      const r = await apiSend('/api/notifications/unsubscribe', 'POST', { token });
      if (r.ok) setDone(true); else setMessage(r.message || 'We couldn’t update your preferences. Please try again.');
    } catch (err: any) {
      setMessage(userMessage(err, 'We couldn’t update your preferences. Please try again.'));
    } finally { setBusy(false); }
  }

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 dark:bg-ink-950">
    <div className="w-full max-w-[440px] space-y-6">
      <div className="flex items-center gap-3"><Logo variant="lockup" autoDark className="h-7 w-auto" title={BRAND.name}/></div>
      <Card>
        <CardHead title="Email preferences" subtitle="Quiet, essential-only by default"/>
        <div className="space-y-4 p-5">
          {done ? <div className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            <Lucide.CheckCircle2 size={18} className="mt-0.5 shrink-0"/><div><p className="font-semibold">Optional emails are off</p><p className="mt-1 text-xs leading-relaxed">Essential account, security and billing messages will still arrive. You can change this at any time in notification settings.</p></div>
          </div> : token ? <>
            <p className="text-sm leading-relaxed muted">Turn off optional MYLA emails. Workspace reminders and summaries stay in the notification centre; essential account, security and billing messages will still arrive.</p>
            <Button variant="primary" className="w-full" loading={busy} onClick={turnOff}>Turn off optional emails</Button>
          </> : <p className="text-sm leading-relaxed muted">Sign in to manage what MYLA sends you.</p>}
          {message && !done && <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"><Lucide.AlertCircle size={16} className="mt-0.5 shrink-0"/>{message}</div>}
          <Link href="/login" className="block py-2 text-center text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Back to MYLA</Link>
        </div>
      </Card>
      <p className="text-center text-[11px] muted">MYLA · {BRAND.motto}</p>
    </div>
  </div>;
}
