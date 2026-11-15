import Link from 'next/link';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-ink-950">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-40"><Logo variant="lockup" autoDark className="h-8 w-auto" title={BRAND.name} /></div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">This page could not be found</h1>
        <p className="mt-3 text-sm leading-relaxed muted">The link may be old, or the section may be switched off for this workspace. An owner or admin can switch sections back on in Settings.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/dashboard" className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Open the dashboard</Link>
          <Link href="/documentation" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-100 dark:border-ink-700 dark:text-slate-200">Documentation</Link>
        </div>
      </div>
    </main>
  );
}
