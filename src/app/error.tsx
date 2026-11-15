'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-ink-950">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-40"><Logo variant="lockup" autoDark className="h-8 w-auto" title={BRAND.name} /></div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] muted">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">That didn’t work</h1>
        <p className="mt-3 text-sm leading-relaxed muted">A technical problem stopped this page loading. Your work is saved. Try again; if it keeps happening, email <a className="font-medium text-brand-700 hover:underline dark:text-brand-300" href="mailto:support@myla.co.zw">support@myla.co.zw</a>{error?.digest ? <> and quote reference <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-ink-800">{error.digest}</code></> : null}.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={reset} className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Try again</button>
          <Link href="/dashboard" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-100 dark:border-ink-700 dark:text-slate-200">Open the dashboard</Link>
        </div>
      </div>
    </main>
  );
}
