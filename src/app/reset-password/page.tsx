'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Lucide from '@/components/lucide';
import { apiSend } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { Button, Card, CardHead, Field } from '@/components/ui';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'idle' | 'success' | 'error' | 'sent'>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
    setInvite(params.get('invite') === '1');
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setState('error'); setMessage('Use a password with at least 8 characters.'); return; }
    if (password !== confirm) { setState('error'); setMessage('Those passwords do not match. Please try again.'); return; }
    setBusy(true); setMessage('');
    try {
      const r = await apiSend('/api/auth/reset-password', 'POST', { token, password, invite });
      setState('success'); setMessage(invite ? 'Your account is ready. You can sign in now.' : r.message || 'Your password has been updated. You can sign in now.');
    } catch (err: any) {
      setState('error'); setMessage(userMessage(err, 'This link has expired or has already been used. Request a new one.'));
    } finally { setBusy(false); }
  }

  async function requestLink(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const r = await apiSend('/api/auth/forgot-password', 'POST', { email });
      setState('sent'); setMessage(r.message || 'If an account exists for that address, a password reset link is on its way.');
    } catch (err: any) {
      setMessage(userMessage(err, 'We couldn’t send a new link. Please try again.'));
    } finally { setBusy(false); }
  }

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 dark:bg-ink-950">
    <div className="w-full max-w-[440px] space-y-6">
      <div className="flex items-center gap-3"><Logo variant="lockup" autoDark className="h-7 w-auto" title={BRAND.name}/></div>
      <Card>
        <CardHead title={invite ? 'Accept your invitation' : 'Choose a new password'} subtitle={invite ? 'Confirm your email and choose a password' : 'Use at least 8 characters, then sign in'}/>
        <div className="space-y-4 p-5">
          {state === 'success' && <div className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            <Lucide.CheckCircle2 size={18} className="mt-0.5 shrink-0"/><p className="text-xs leading-relaxed">{message}</p>
          </div>}
          {state === 'sent' && <div className="flex gap-3 rounded-md border border-sky-200 bg-sky-50 p-3.5 text-sm text-sky-800 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
            <Lucide.Mail size={18} className="mt-0.5 shrink-0"/><p className="text-xs leading-relaxed">{message}</p>
          </div>}
          {state === 'error' && <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            <Lucide.AlertCircle size={18} className="mt-0.5 shrink-0"/><p className="text-xs leading-relaxed">{message}</p>
          </div>}
          {state !== 'success' && token && <form onSubmit={save} className="space-y-3">
            <Field label="New password" required><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/></Field>
            <Field label="Repeat new password" required><input className="input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required/></Field>
            <Button type="submit" variant="primary" className="w-full" loading={busy}>Save new password<Lucide.ArrowRight size={15}/></Button>
          </form>}
          {(state === 'error' || !token) && state !== 'success' && <form onSubmit={requestLink} className="space-y-3 border-t divider pt-4">
            <p className="text-xs muted">Need a new link? Enter your work email and we’ll send one.</p>
            <Field label="Work email" required><div className="relative"><Lucide.Mail size={16} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.co.zw" required/></div></Field>
            <Button type="submit" variant="outline" className="w-full" loading={busy}>Send a new link</Button>
          </form>}
          {state === 'success' && <Link href="/login" className="block"><Button variant="primary" className="w-full">Go to sign in<Lucide.ArrowRight size={15}/></Button></Link>}
          <Link href="/login" className="block text-center text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Back to sign in</Link>
        </div>
      </Card>
      <p className="text-center text-[11px] muted">MYLA · {BRAND.motto}</p>
    </div>
  </div>;
}
