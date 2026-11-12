'use client';
import { useEffect, useState } from 'react';
import { apiSend } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { Button } from './ui';
import * as Lucide from '@/components/lucide';

const REMINDER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A quiet, dismissible dashboard nudge. Verification never blocks the workspace. */
export default function EmailVerificationReminder({
  userId, email, emailVerified,
}: {
  userId?: string;
  email?: string;
  emailVerified?: boolean;
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const key = `myla-email-verification-reminder:${userId || 'account'}`;
    try {
      const until = Number(window.localStorage.getItem(key) || 0);
      setDismissed(until > Date.now());
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  function dismiss() {
    const key = `myla-email-verification-reminder:${userId || 'account'}`;
    try { window.localStorage.setItem(key, String(Date.now() + REMINDER_TTL_MS)); } catch { /* private mode */ }
    setDismissed(true);
  }

  async function verify() {
    if (!email) return;
    setBusy(true); setMessage('');
    try {
      const r = await apiSend('/api/auth/resend-verification', 'POST', { email });
      setMessage(r.message || 'If your account still needs verification, a new link is on its way.');
    } catch (err: any) {
      setMessage(userMessage(err, 'We couldn’t send a new link. Please try again.'));
    } finally { setBusy(false); }
  }

  if (emailVerified !== false || dismissed !== false) return null;

  return <div data-testid="email-verification-reminder" role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-sky-950 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100">
    <Lucide.ShieldCheck size={17} className="shrink-0 text-sky-700 dark:text-sky-300"/>
    <div className="min-w-0 flex-1">
      <p className="font-semibold">Verify your email when you’re ready.</p>
      <p className="mt-0.5 leading-relaxed text-sky-800 dark:text-sky-200/80">It helps keep your account secure. Your workspace is ready to use now.</p>
      {message && <p aria-live="polite" className="mt-1.5 leading-relaxed text-sky-900 dark:text-sky-100">{message}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" size="sm" variant="outline" loading={busy} onClick={verify}>Send verification link</Button>
      <button type="button" onClick={dismiss} className="rounded px-2 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-sky-100 dark:text-sky-200 dark:hover:bg-sky-500/15">Not now</button>
    </div>
  </div>;
}
