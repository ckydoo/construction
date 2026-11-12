import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';

export default async function Home(){
  const host = (await headers()).get('host')?.split(':')[0].toLowerCase();
  if (host === 'myla.co.zw') return <Landing/>;
  const a = await getAuth();
  if(!a) redirect('/login');
  if(!a.onboarded) redirect('/onboarding');
  redirect(`/${a.orgSlug}/dashboard`);
}

function Landing(){
  const app = 'https://app.myla.co.zw';
  const features = [
    ['01','Projects & sites','Keep projects, tasks, documents and site activity together in one workspace.'],
    ['02','Money & operations','Bring estimates, procurement, invoices and reporting into your day-to-day workflow.'],
    ['03','People & accountability','Coordinate your team with role-based access and a shared view of work.'],
  ];
  return <main className="min-h-screen bg-[#f8f7f3] text-slate-900">
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
      <Logo variant="lockup" className="h-8 w-auto max-w-[190px]" title="MYLA"/>
      <nav className="flex items-center gap-5 text-sm font-medium"><a href="#features" className="hidden text-slate-600 hover:text-slate-900 sm:block">Features</a><a href={`${app}/login`} className="rounded-lg bg-slate-900 px-4 py-2.5 text-white hover:bg-slate-700">Sign in <span aria-hidden="true">↗</span></a></nav>
    </header>
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-2 lg:gap-20 lg:pb-28">
      <div><p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-amber-700">Construction, better connected</p><h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Build with clarity.<br/><span className="text-amber-700">Manage with MYLA.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">A single workspace for construction teams to organise projects, people and operations—from the office to the site.</p><div className="mt-8 flex flex-wrap gap-3"><a href={`${app}/login`} className="rounded-lg bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-slate-700">Get started →</a><a href={`${app}/login`} className="rounded-lg border border-slate-300 px-6 py-3.5 text-sm font-semibold hover:bg-white">Sign in</a></div><p className="mt-5 text-sm text-slate-500">Made for the work that brings projects to life.</p></div>
      <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-2xl sm:p-9"><div className="flex items-center justify-between border-b border-white/15 pb-5"><span className="text-sm font-semibold">Your construction workspace</span><span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-300">Connected</span></div><div className="mt-6 grid grid-cols-2 gap-3">{['Projects','Procurement','Finance','People'].map((x,i)=><div key={x} className="rounded-xl border border-white/10 bg-white/5 p-5"><div className="mb-5 h-2 w-10 rounded-full bg-amber-400"/><p className="text-sm font-semibold">{x}</p><p className="mt-1 text-xs text-slate-400">Together in MYLA</p></div>)}</div><p className="mt-6 text-sm leading-6 text-slate-400">One place for the details that keep your business moving.</p></div>
    </section>
    <section id="features" className="border-t border-slate-200 bg-white"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Built for your business</p><h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Less scattered work. More connected teams.</h2><div className="mt-12 grid gap-8 md:grid-cols-3">{features.map(([n,title,description])=><article key={n} className="border-t-2 border-amber-500 pt-5"><span className="text-xs font-semibold text-slate-400">{n}</span><h3 className="mt-3 text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-600">{description}</p></article>)}</div></div></section>
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 sm:px-8"><span>© {new Date().getFullYear()} MYLA</span><a href={`${app}/login`} className="font-medium text-slate-700">Open MYLA →</a></footer>
  </main>;
}
