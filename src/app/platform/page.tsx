import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { isPlatformAdminUser } from '@/lib/platform-admin';
import Logo from '@/components/Logo';
import { BRAND } from '@/lib/brand';
import PlatformAdmin from '@/components/PlatformAdmin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `Platform owner — ${BRAND.name}`, robots: { index: false, follow: false } };

export default async function PlatformPage() {
  const a = await getAuth();
  if (!a) redirect('/login');
  const isAdmin = await isPlatformAdminUser(a.userId);
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-ink-950">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 w-36"><Logo variant="lockup" autoDark className="h-8 w-auto" title={BRAND.name} /></div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] muted">403</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink-900 dark:text-white">Platform owner access only</h1>
          <p className="mt-3 text-sm leading-relaxed muted">This page is reserved for the MYLA platform owner. If you believe you should have access, ask an existing platform administrator.</p>
          <a href="/" className="mt-6 inline-flex items-center justify-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-100 dark:border-ink-700 dark:text-slate-200">Back to myla.co.zw</a>
        </div>
      </main>
    );
  }
  return <PlatformAdmin actorEmail={a.email} actorName={a.name} />;
}
