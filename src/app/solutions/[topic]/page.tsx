import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import Logo from '@/components/Logo';

const APP = 'https://app.myla.co.zw/login';
const pages = {
  'construction-project-management': {
    title:'Construction project management software for African teams',
    description:'Organise construction projects, tasks, documents and project details in one workspace with MYLA Construction ERP.',
    eyebrow:'Project management', heading:'Keep construction projects organised from the start.',
    intro:'MYLA Construction ERP brings project information into one workspace, so construction teams can keep a clearer view of jobs and the work around them.',
    points:[['Bring job details together','Record your project name, client, site, dates, budget and progress in one place.'],['Organise tasks around the job','Create and review project tasks so the work has a clear project context.'],['Keep documents close','Use the project document library to organise project files and related information.'],['Review the numbers','See available project and budget information alongside the work.']],
    note:'Available sections depend on your plan, workspace configuration and role. Project data must be entered and kept up to date by your team.',
  },
  'construction-quotations': {
    title:'Construction quotation and estimating software for Africa',
    description:'Prepare itemised construction estimates and quotations with labour, materials, equipment and markup in MYLA Construction ERP.',
    eyebrow:'Quotations & estimating', heading:'Build clearer construction estimates and quotations.',
    intro:'Bring the components of an estimate together and prepare an itemised quotation for construction work with MYLA Construction ERP.',
    points:[['Build an itemised estimate','Add descriptions, quantities and unit prices for labour, materials and other work.'],['Show the calculation','Review the cost subtotal, markup and quotation total before sharing a document.'],['Keep the scope clear','Add scope and terms to help explain what your quotation covers.'],['Keep records together','Save your quotation alongside the other commercial records in your workspace.']],
    note:'Your team is responsible for checking prices, scope, taxes and document details before sending a quotation.',
  },
  'construction-invoices': {
    title:'Construction invoicing software for African businesses',
    description:'Organise construction invoice records, clients and project information with MYLA Construction ERP.',
    eyebrow:'Invoices & project records', heading:'Keep construction invoice records with your projects.',
    intro:'Record project invoices and organise the client, dates and itemised work in the same workspace as your construction jobs.',
    points:[['Link the job and client','Associate an invoice with a project and an existing client in your workspace.'],['Record invoice details','Add itemised work, invoice dates, due dates and the relevant tax rate.'],['Review before issuing','Required issue details are checked before an invoice moves out of draft.'],['See related project information','Keep invoice records alongside project and budget information for review.']],
    note:'Payment reconciliation and journal posting are not yet supported. Do not use invoice status as proof that a payment was received; confirm tax treatment with a qualified adviser for your jurisdiction.',
  },
} as const;
type Topic = keyof typeof pages;
const paths = Object.keys(pages) as Topic[];
export function generateStaticParams(){ return paths.map(topic=>({topic})); }
export async function generateMetadata({params}:{params:Promise<{topic:string}>}):Promise<Metadata>{
  const {topic}=await params; const p=pages[topic as Topic]; if(!p) return {};
  const url=`https://myla.co.zw/solutions/${topic}`;
  return {title:`${p.title} | MYLA Construction ERP`,description:p.description,alternates:{canonical:url},robots:{index:true,follow:true},openGraph:{title:p.title,description:p.description,url,siteName:'MYLA Construction ERP',type:'website',images:[{url:'https://myla.co.zw/landing/myla-dashboard.webp',alt:'MYLA Construction ERP dashboard'}]},twitter:{card:'summary_large_image',title:p.title,description:p.description,images:['https://myla.co.zw/landing/myla-dashboard.webp']}};
}
export default async function SolutionPage({params}:{params:Promise<{topic:string}>}){
  const {topic}=await params; const p=pages[topic as Topic]; if(!p) notFound();
  return <main className="min-h-screen bg-[#f7f8f7] text-[#102c40]">
    <header className="border-b border-[#e5e9e8]"><div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-3 px-5 sm:px-8"><Link href="/" aria-label="MYLA Construction ERP home" className="flex items-center gap-2"><Logo variant="lockup" className="h-5 w-auto sm:h-7" title="MYLA Construction ERP"/><span className="hidden border-l border-[#cbd7d0] pl-2 text-[9px] font-bold uppercase leading-3 tracking-[.08em] text-[#49616b] sm:block">Construction<br/>ERP</span></Link><div className="flex items-center gap-4"><Link href="/#pricing" className="hidden text-sm font-semibold text-slate-600 sm:block">Pricing</Link><a href={APP} className="inline-flex items-center gap-2 rounded-md bg-[#102c40] px-4 py-3 text-xs font-semibold text-white">Sign in <ArrowUpRight size={15}/></a></div></div></header>
    <section className="mx-auto max-w-[1200px] px-5 pb-16 pt-16 sm:px-8 sm:pt-24"><Link href="/" className="text-xs font-semibold text-[#a95e09] hover:underline">← MYLA Construction ERP home</Link><div className="mt-9 grid gap-12 lg:grid-cols-[1fr_.8fr]"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#c9700c]">{p.eyebrow}</p><h1 className="mt-4 max-w-[720px] text-4xl font-semibold leading-[1.12] tracking-[-.035em] sm:text-6xl">{p.heading}</h1><p className="mt-6 max-w-2xl text-base leading-8 text-[#596e79]">{p.intro}</p><p className="mt-4 text-sm leading-7 text-[#596e79]">Designed for construction teams across Africa. Check that currencies, tax settings and workflows meet your local requirements.</p><div className="mt-8 flex flex-wrap gap-3"><a href={APP} className="inline-flex items-center gap-2 rounded-md bg-[#ed820d] px-6 py-4 text-sm font-bold">Open MYLA Construction ERP <ArrowRight size={16}/></a><Link href="/#pricing" className="rounded-md border border-[#cbd7d0] bg-white px-6 py-4 text-sm font-semibold">View plans</Link></div></div><div className="rounded-xl border border-[#d6e2d9] bg-white p-7 sm:p-9"><h2 className="text-xl font-semibold">How it helps</h2><div className="mt-6 space-y-6">{p.points.map(([title,text])=><div key={title} className="flex gap-3"><Check className="mt-0.5 shrink-0 text-[#d77b10]" size={18}/><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-[#637583]">{text}</p></div></div>)}</div></div></div><p className="mt-10 rounded-md border border-[#e2e9e4] bg-[#f2f6f3] p-4 text-xs leading-6 text-[#596e79]">{p.note}</p></section>
    <section className="border-t border-[#e5e9e8] bg-white"><div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8"><h2 className="text-2xl font-semibold">Explore MYLA Construction ERP</h2><div className="mt-6 grid gap-3 sm:grid-cols-3">{paths.filter(x=>x!==topic).map(x=><Link key={x} href={`/solutions/${x}`} className="rounded-lg border border-[#dbe4df] p-5 text-sm font-semibold hover:border-[#ed820d]">{pages[x].eyebrow} <span aria-hidden="true">→</span></Link>)}<Link href="/#features" className="rounded-lg border border-[#dbe4df] p-5 text-sm font-semibold hover:border-[#ed820d]">All capabilities →</Link></div></div></section>
    <footer className="bg-[#0b2231] px-5 py-8 text-xs text-[#a4b5bb]"><div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-4 sm:px-3"><span>© {new Date().getFullYear()} MYLA Construction ERP.</span><Link href="/">Home</Link></div></footer>
  </main>;
}
