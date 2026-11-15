import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `Scheduled maintenance — ${BRAND.name}`, robots: { index: false, follow: false } };

export default function MaintenancePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-ink-950">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 w-40"><Logo variant="lockup" autoDark className="h-8 w-auto" title={BRAND.name} /></div>
        <div className="mb-4 flex items-center justify-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Scheduled maintenance</p></div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">We’ll be right back</h1>
        <p className="mt-3 text-sm leading-relaxed muted">MYLA is briefly offline while we carry out planned maintenance. Your data is safe — nothing is lost. Please check back shortly.</p>
        <p className="mt-5 text-xs muted">If something looks wrong after we’re back, contact <a className="font-medium text-brand-700 hover:underline dark:text-brand-300" href="mailto:codzlabzim53@gmail.com">codzlabzim53@gmail.com</a> or call <a className="font-medium text-brand-700 hover:underline dark:text-brand-300" href="tel:+263716826666">+263716826666</a>.</p>
        <div className="mt-8 border-t border-slate-200 pt-5 dark:border-ink-800"><Link href="/" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">Go to myla.co.zw</Link></div>
      </div>
    </main>
  );
}
