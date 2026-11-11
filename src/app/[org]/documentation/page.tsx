'use client';
/* In-product guide. Written for a busy contractor, not an IT team.
 * Every illustration is inline SVG/CSS: crisp, theme-aware and offline. */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Icon } from '@/components/ui';
import * as Lucide from '@/components/lucide';
import { MODULES } from '@/lib/catalog';
import { RESOURCES, RESOURCE_MAP } from '@/lib/resources';
import { CHAIN_STAGES } from '@/lib/conversion-chain';
import { moduleEnabled, hrefVisible } from '@/lib/module-visibility';
import { apiGet, orgApi } from '@/lib/client';

const C = {
  box: 'fill-white stroke-slate-200 dark:fill-ink-900 dark:stroke-ink-700',
  soft: 'fill-slate-50 stroke-slate-200 dark:fill-ink-950 dark:stroke-ink-700',
  text: 'fill-ink-900 dark:fill-white',
  muted: 'fill-slate-500 dark:fill-slate-400',
  faint: 'fill-slate-200 dark:fill-ink-700',
  accent: 'fill-brand-500',
  strokeAccent: 'stroke-brand-500',
  strokeFaint: 'stroke-slate-200 dark:stroke-ink-700',
};

const SECTIONS = [
  { id: 'flow', label: 'How a job flows' },
  { id: 'convert', label: 'Convert to…' },
  { id: 'studio', label: 'Quote Studio & files' },
  { id: 'modules', label: 'Every module' },
  { id: 'home', label: 'Your home screen' },
  { id: 'everyday', label: 'Everyday work' },
  { id: 'small', label: 'Start small' },
  { id: 'people', label: 'Who sees what' },
  { id: 'words', label: 'Words we use' },
  { id: 'find', label: 'Where to find it' },
  { id: 'help', label: 'Quick help' },
];

function SvgFrame({ children, label, viewBox, minWidth = 760 }: { children: React.ReactNode; label: string; viewBox: string; minWidth?: number }) {
  return <div>
    <div className="w-full overflow-x-auto rounded-md">
      <svg viewBox={viewBox} className="h-auto w-full" style={{ minWidth }} role="img" aria-label={label}>
        {children}
      </svg>
    </div>
    <p className="mt-1.5 text-[10px] muted sm:hidden">Swipe the picture sideways to see every step.</p>
  </div>;
}

function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <g>
    <path d={`M${x1} ${y} H${x2 - 9}`} strokeWidth={1.6} fill="none" className={C.strokeAccent} />
    <path d={`M${x2} ${y} l-9 -5 v10 z`} className={C.accent} />
  </g>;
}

function Stage({ x, n, title, lines }: { x: number; n: number; title: string; lines: string[] }) {
  return <g>
    <rect x={x} y={46} width={148} height={164} rx={6} strokeWidth={1} className={C.box} />
    <rect x={x} y={46} width={148} height={4} rx={2} className={C.accent} />
    <circle cx={x + 20} cy={74} r={12} className={C.accent} />
    <text x={x + 20} y={78} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">{n}</text>
    <text x={x + 12} y={104} fontSize={12.5} fontWeight={600} className={C.text}>{title}</text>
    {lines.map((l, i) => <text key={i} x={x + 12} y={128 + i * 17} fontSize={9.5} className={C.muted}>{l}</text>)}
  </g>;
}

/* 1 — The whole business, from first call to money in the bank. */
function JobFlow() {
  const stages = [
    { n: 1, title: 'A client calls', lines: ['Note the enquiry', 'Save the client', 'Where is the job?'] },
    { n: 2, title: 'Price the work', lines: ['Measure & cost it', 'Add your markup', 'Send a quote / tender'] },
    { n: 3, title: 'Agree & plan', lines: ['Sign the contract', 'Set a job budget', 'List the tasks'] },
    { n: 4, title: 'Do the work', lines: ['Daily site diary', 'Order materials', 'Time sheets & safety'] },
    { n: 5, title: 'Bill for it', lines: ['Measure work done', 'Payment certificate', 'Tax invoice + 15% VAT'] },
    { n: 6, title: 'Get paid & close', lines: ['Record the receipt', 'Snag list & handover', 'See what you made'] },
  ];
  return <SvgFrame viewBox="0 0 1000 300" label="Business flow: a client calls, you price the work, agree and plan, do the work on site, bill for it with a payment certificate and tax invoice, then get paid and hand over. Each step is one record, and what you learn feeds the next quote.">
    <rect x={0} y={0} width={1000} height={300} rx={8} className="fill-slate-50 dark:fill-ink-950" />
    <text x={18} y={26} fontSize={12} fontWeight={600} className={C.text}>One job, start to finish</text>
    <text x={18} y={39} fontSize={9.5} className={C.muted}>The same record follows the work — nothing gets typed twice.</text>
    {stages.map((s, i) => <g key={s.n}>
      <Stage x={16 + i * 165} n={s.n} title={s.title} lines={s.lines} />
      {i < stages.length - 1 && <Arrow x1={164 + i * 165} x2={181 + i * 165} y={128} />}
    </g>)}
    <rect x={16} y={226} width={968} height={58} rx={6} strokeWidth={1} className={C.soft} />
    <text x={32} y={248} fontSize={11} fontWeight={600} className={C.text}>At the end you can answer: what did we quote, what did it cost, what did we bill, and what is still owed?</text>
    <text x={32} y={268} fontSize={10} className={C.muted}>What you learned goes into the next quote — so the next job is priced better. USD and ZWG are both kept.</text>
  </SvgFrame>;
}

/* 2 — An illustrated home screen with numbered, plain-language callouts. */
function HomeScreen() {
  const kpis = [
    ['Jobs running', '6'], ['Money owed to you', '$1.2m'], ['Client money in hand', '$11.0m'],
    ['Bills to pay', '$0.4m'], ['Queries waiting', '3'],
  ];
  const bars = [58, 74, 52, 88, 66, 96, 78];
  const rowY = [210, 232, 254, 276];
  const lowY = [358, 380, 402, 424];
  return <SvgFrame viewBox="0 0 1000 470" label="Illustrated home screen: a five-number strip for jobs running, money owed to you, client money in hand, bills to pay and queries waiting; a money-billed chart; a client-money list; jobs needing chasing; recent work; and the sidebar sections." minWidth={800}>
    <rect x={0} y={0} width={1000} height={470} className="fill-white dark:fill-ink-900" />
    <path d="M0 40 H170 V462 A8 8 0 0 1 162 470 H8 A8 8 0 0 1 0 462 Z" className="fill-slate-50 dark:fill-ink-950" />
    <path d="M8 0 H992 A8 8 0 0 1 1000 8 V40 H0 V8 A8 8 0 0 1 8 0 Z" className="fill-ink-900" />
    <rect x={16} y={13} width={14} height={14} rx={3} className={C.accent} />
    <text x={37} y={25} fontSize={13} fontWeight={700} className="fill-white">MYLA</text>
    <text x={84} y={25} fontSize={9} className="fill-slate-400">ERP</text>
    <rect x={360} y={9} width={260} height={22} rx={4} className="fill-ink-800" />
    <text x={372} y={24} fontSize={9} className="fill-slate-400">Search jobs, clients, invoices…</text>
    <circle cx={940} cy={20} r={7} className="fill-ink-700" />
    <circle cx={964} cy={20} r={7} className={C.accent} />
    <line x1={170} y1={40} x2={170} y2={470} strokeWidth={1} className={C.strokeFaint} />
    <rect x={0} y={58} width={3} height={18} className={C.accent} />
    <rect x={8} y={56} width={146} height={22} rx={3} className="fill-brand-50 dark:fill-ink-800" />
    {Array.from({ length: 9 }).map((_, i) => <rect key={i} x={16} y={92 + i * 26} width={i % 3 === 0 ? 96 : 124} height={7} rx={2} className={C.faint} />)}
    <text x={190} y={68} fontSize={15} fontWeight={600} className={C.text}>Your business today</text>
    <text x={190} y={84} fontSize={9.5} className={C.muted}>Jobs, money and things needing attention</text>
    {kpis.map(([label, value], i) => {
      const x = 190 + i * 160;
      return <g key={label}>
        <rect x={x} y={96} width={150} height={52} rx={5} strokeWidth={1} className={C.soft} />
        <text x={x + 10} y={115} fontSize={8.5} className={C.muted}>{label}</text>
        <text x={x + 10} y={136} fontSize={15} fontWeight={600} className={C.text}>{value}</text>
      </g>;
    })}
    <rect x={190} y={158} width={390} height={152} rx={5} strokeWidth={1} className={C.box} />
    <text x={204} y={178} fontSize={10.5} fontWeight={600} className={C.text}>Money billed over time</text>
    <line x1={204} y1={292} x2={566} y2={292} strokeWidth={1} className={C.strokeFaint} />
    {bars.map((h, i) => <rect key={i} x={212 + i * 48} y={292 - h} width={26} height={h} rx={2} className={i === 5 ? C.accent : 'fill-slate-300 dark:fill-ink-600'} />)}
    <rect x={590} y={158} width={390} height={152} rx={5} strokeWidth={1} className={C.box} />
    <text x={604} y={178} fontSize={10.5} fontWeight={600} className={C.text}>Client money in hand</text>
    <text x={604} y={194} fontSize={8.5} className={C.muted}>Client</text>
    <text x={898} y={194} fontSize={8.5} className={C.muted}>Available</text>
    {rowY.map((y, i) => <g key={y}>
      <line x1={604} y1={y + 10} x2={966} y2={y + 10} strokeWidth={1} className={C.strokeFaint} />
      <rect x={604} y={y - 3} width={120 + i * 14} height={6} rx={2} className={C.faint} />
      <rect x={898} y={y - 3} width={52} height={6} rx={2} className={i === 0 ? C.accent : C.faint} />
    </g>)}
    <rect x={190} y={320} width={390} height={130} rx={5} strokeWidth={1} className={C.box} />
    <text x={204} y={340} fontSize={10.5} fontWeight={600} className={C.text}>Needs your attention</text>
    {lowY.map((y, i) => <g key={y}>
      <circle cx={210} cy={y - 2} r={3} className={i === 0 ? C.accent : C.faint} />
      <rect x={222} y={y - 5} width={230 - i * 18} height={6} rx={2} className={C.faint} />
    </g>)}
    <rect x={590} y={320} width={390} height={130} rx={5} strokeWidth={1} className={C.box} />
    <text x={604} y={340} fontSize={10.5} fontWeight={600} className={C.text}>What changed today</text>
    {lowY.map((y, i) => <g key={y}>
      <circle cx={610} cy={y - 2} r={3} className={i === 0 ? C.accent : C.faint} />
      <rect x={622} y={y - 5} width={226 - i * 22} height={6} rx={2} className={C.faint} />
    </g>)}
    <circle cx={966} cy={88} r={11} className={C.accent} /><text x={966} y={92} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">1</text>
    <circle cx={566} cy={170} r={11} className={C.accent} /><text x={566} y={174} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">2</text>
    <circle cx={966} cy={170} r={11} className={C.accent} /><text x={966} y={174} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">3</text>
    <circle cx={566} cy={332} r={11} className={C.accent} /><text x={566} y={336} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">4</text>
    <circle cx={966} cy={332} r={11} className={C.accent} /><text x={966} y={336} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">5</text>
    <circle cx={152} cy={52} r={11} className={C.accent} /><text x={152} y={56} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">6</text>
    <rect x={0.5} y={0.5} width={999} height={469} rx={8} fill="none" strokeWidth={1} className={C.strokeFaint} />
  </SvgFrame>;
}

type Step = { label: string; sub?: string };
function FlowStrip({ steps }: { steps: Step[] }) {
  return <div className="flex flex-wrap items-stretch gap-2">
    {steps.map((s, i) => <div key={i} className="relative min-w-[126px] rounded-md border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-7 dark:border-ink-700 dark:bg-ink-950/40">
      <p className="text-[10px] font-semibold tracking-wide text-brand-600 dark:text-brand-300">{String(i + 1).padStart(2, '0')}</p>
      <p className="mt-0.5 text-[12px] font-semibold leading-tight text-ink-900 dark:text-white">{s.label}</p>
      {s.sub && <p className="mt-0.5 text-[10px] leading-tight muted">{s.sub}</p>}
      {i < steps.length - 1 && <Lucide.ArrowRight size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-500" aria-hidden="true" />}
    </div>)}
  </div>;
}

const EVERYDAY: { title: string; icon: string; blurb: string; steps: Step[] }[] = [
  {
    title: 'Win a job', icon: 'Handshake',
    blurb: 'From the first phone call to a signed contract.',
    steps: [
      { label: 'Client calls', sub: 'Save their details' },
      { label: 'Visit & measure', sub: 'Take off quantities' },
      { label: 'Send a quote', sub: 'Cost + your markup' },
      { label: 'Win the tender', sub: 'Agreed price' },
      { label: 'Sign contract', sub: 'Start the job' },
    ],
  },
  {
    title: 'Run the site', icon: 'HardHat',
    blurb: 'One place for the programme, the daily diary and questions from site.',
    steps: [
      { label: 'Plan the tasks', sub: 'Who does what, when' },
      { label: 'Daily site diary', sub: 'People, plant, weather' },
      { label: 'Ask a question', sub: 'Site query with a due date' },
      { label: 'Check the work', sub: 'Site check & snag list' },
      { label: 'Hand over', sub: 'Sign off with the client' },
    ],
  },
  {
    title: 'Buy materials', icon: 'Truck',
    blurb: 'Know what was ordered, what arrived and what it cost.',
    steps: [
      { label: 'Ask for materials', sub: 'From the site or store' },
      { label: 'Get a price', sub: 'From a supplier' },
      { label: 'Place the order', sub: 'Order to supplier' },
      { label: 'Sign delivery note', sub: 'What actually arrived' },
      { label: 'Match the bill', sub: 'Before you pay' },
    ],
  },
  {
    title: 'Pay the team', icon: 'UsersRound',
    blurb: 'Hours worked become wages, with the right deductions.',
    steps: [
      { label: 'Record hours', sub: 'Time sheets per job' },
      { label: 'Approve', sub: 'Foreman signs off' },
      { label: 'Work out wages', sub: 'Overtime included' },
      { label: 'PAYE / NSSA', sub: 'Statutory deductions' },
      { label: 'Pay & payslips', sub: 'Take-home pay' },
    ],
  },
  {
    title: 'Money in & out', icon: 'Wallet',
    blurb: 'Client money in advance, certificates, tax invoices and receipts.',
    steps: [
      { label: 'Client pays in', sub: 'RTGS / mobile money' },
      { label: 'Put on the job', sub: 'Client money in hand' },
      { label: 'Certify work', sub: 'Payment certificate' },
      { label: 'Tax invoice', sub: '15% VAT included' },
      { label: 'Record receipt', sub: 'USD or ZWG' },
    ],
  },
  {
    title: 'Keep your files', icon: 'FileText',
    blurb: 'Drawings and documents stay with the job, with the latest version clear.',
    steps: [
      { label: 'Upload a drawing', sub: 'Linked to the job' },
      { label: 'Send for approval', sub: 'Note who received it' },
      { label: 'New version', sub: 'Rev A → Rev B' },
      { label: 'Print a PDF', sub: 'MYLA letterhead' },
      { label: 'Download', sub: 'Whenever you need it' },
    ],
  },
];

const MODULE_MAP = [
  { group: 'Overview', icon: 'LayoutDashboard', holds: 'Your day at a glance and this guide', items: [{ label: 'Dashboard', href: 'dashboard' }, { label: 'Documentation', href: 'documentation' }] },
  { group: 'Clients & quotes', icon: 'Handshake', holds: 'Clients, enquiries, quotes and tenders', items: [{ label: 'Clients', href: 'm/clients' }, { label: 'Enquiries & leads', href: 'm/leads' }, { label: 'Quotes & estimates', href: 'm/estimates' }, { label: 'Tenders & bids', href: 'm/bids' }] },
  { group: 'Jobs & sites', icon: 'HardHat', holds: 'Jobs, tasks, site queries and site diaries', items: [{ label: 'Jobs & projects', href: 'm/projects' }, { label: 'Job tasks & programme', href: 'm/tasks' }, { label: 'Site queries', href: 'm/rfis' }, { label: 'Site diaries', href: 'm/dailyLogs' }] },
  { group: 'Materials & suppliers', icon: 'Truck', holds: 'Suppliers, orders, deliveries and stock', items: [{ label: 'Suppliers', href: 'm/vendors' }, { label: 'Orders to suppliers', href: 'm/purchaseOrders' }, { label: 'Delivery notes', href: 'm/goodsReceipts' }, { label: 'Stock & materials', href: 'm/inventory' }] },
  { group: 'Staff & wages', icon: 'UsersRound', holds: 'Staff, time sheets, payroll and trade certificates', items: [{ label: 'Staff & workers', href: 'm/employees' }, { label: 'Time sheets', href: 'm/timesheets' }, { label: 'Payroll & payslips', href: 'm/payRuns' }, { label: 'Trade certificates', href: 'm/certifications' }] },
  { group: 'Safety & quality', icon: 'ShieldCheck', holds: 'Incidents, site checks and rework', items: [{ label: 'Incidents & near misses', href: 'm/incidents' }, { label: 'Site checks', href: 'm/inspections' }, { label: 'Faults & rework', href: 'm/ncrs' }] },
  { group: 'Money & invoices', icon: 'CreditCard', holds: 'Client money, tax invoices, certificates and budgets', items: [{ label: 'Client wallets', href: 'wallets' }, { label: 'Client invoices', href: 'm/arInvoices' }, { label: 'Payment certificates', href: 'm/paymentApps' }, { label: 'Job budgets & costs', href: 'm/budgets' }] },
  { group: 'Reports & extras', icon: 'BarChart3', holds: 'Ready-made lists and downloads', items: [{ label: 'Reports', href: 'reports' }] },
  { group: 'Settings', icon: 'Settings', holds: 'Company details, sections and people', items: [{ label: 'Settings', href: 'settings' }] },
];

const GLOSSARY: [string, string][] = [
  ['Job', 'Project — the work you won from a client'],
  ['Quote', 'Estimate — the price you send before the job'],
  ['Tender', 'Bid — the formal price you submit'],
  ['Enquiry', 'Lead / opportunity — someone asking about work'],
  ['Variation / extra', 'Change order — extra work the client agrees to pay for'],
  ['Site query', 'RFI — a question from site needing an answer'],
  ['Snag list', 'Punch list — small things to fix before handover'],
  ['Delivery note', 'GRN — what the storeman signs when goods arrive'],
  ['Supplier', 'Vendor — the company you buy from'],
  ['Plant', 'Equipment / fleet — machines, tools and vehicles'],
  ['Time sheet', 'Timesheet — hours worked on a job'],
  ['Wages', 'Payroll — payday, with PAYE and NSSA deducted'],
  ['Tax invoice', 'Invoice with 15% VAT and a tax invoice number'],
  ['Payment certificate', 'The QS certificate saying how much work is due'],
  ['Stand', 'A plot of land; stands / units is what a developer sells'],
  ['Client money in hand', 'A wallet — money a client paid in advance for their jobs'],
  ['Section', 'A module — a part of MYLA you can switch on or off'],
];

function Section({ id, title, kicker, children }: { id: string; title: string; kicker: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-20 space-y-3">
    <div>
      <h2 className="section-title">{title}</h2>
      <p className="mt-1 caption max-w-3xl">{kicker}</p>
    </div>
    {children}
  </section>;
}

/* ── The "Convert to…" chain, in the exact words used on the buttons ─────── */
const CONVERSION_STEPS: [string, string][] = [
  ['Client', 'Log an enquiry'],
  ['Enquiry', 'Convert to quotation'],
  ['Quote', 'Convert to tender  ·  Award as job + contract'],
  ['Tender', 'Award as job + contract'],
  ['Job', 'Create prime contract  ·  Create payment certificate'],
  ['Contract', 'Create payment certificate'],
  ['Payment certificate', 'Convert to tax invoice'],
  ['Tax invoice', 'Record receipt in full'],
];

/* ── Every module, generated from the live catalogue so it never goes stale ─ */
const TIER_HELP: Record<string, string> = {
  CORE: 'Essential — on for every workspace',
  STANDARD: 'Switched on as the company grows',
  ADVANCED: 'For a particular kind of work',
  ENTERPRISE: 'Largest groups and connections',
};
const SPECIAL_LINKS: Record<string, { label: string; href: string }[]> = {
  dashboard: [{ label: 'Dashboard', href: 'dashboard' }, { label: 'Documentation', href: 'documentation' }],
  company: [{ label: 'Settings', href: 'settings' }],
  scheduling: [{ label: 'Job tasks & programme', href: 'm/tasks' }],
  documents: [{ label: 'Document library', href: 'library' }],
  wallets: [{ label: 'Client wallets', href: 'wallets' }],
  reports: [{ label: 'Reports', href: 'reports' }, { label: 'Billing & subscription', href: 'billing' }],
  audit: [{ label: 'Settings → activity & alerts', href: 'settings' }],
  portal: [{ label: 'Settings → users & roles', href: 'settings' }],
  integrations: [{ label: 'Settings → connections', href: 'settings' }],
};

function ModuleDirectory({ org }: { org: string }) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('ALL');
  const { data: meta }: any = useQuery({ queryKey: ['meta', org], queryFn: () => apiGet(orgApi(org, 'meta')) });
  const config = meta?.config || { modules: [], resources: [] };
  const groups = useMemo(() => Array.from(new Set(MODULES.map(m => m.group))), []);
  const enabledCount = useMemo(() => MODULES.filter(m => moduleEnabled(config, m.id)).length, [config]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return MODULES.filter(m => {
      if (group !== 'ALL' && m.group !== group) return false;
      if (!needle) return true;
      const hay = [m.label, m.description, m.group, m.tier, m.id,
        ...m.resources.map(r => `${r} ${RESOURCE_MAP[r]?.label || ''} ${RESOURCE_MAP[r]?.description || ''}`)]
        .join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [search, group]);

  return <div className="space-y-3">
    <Card className="p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><Lucide.Search size={15} className="absolute left-3 top-2.5 text-slate-400"/><input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search modules, registers or what they do…"/></div>
        <select className="select w-auto min-w-[170px]" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="ALL">All groups</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {(search || group !== 'ALL') && <ButtonClear onClick={() => { setSearch(''); setGroup('ALL'); }}/>}
        <span className="ml-auto text-xs muted">{filtered.length} shown · {enabledCount}/{MODULES.length} switched on · {RESOURCES.length} registers</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t divider pt-2.5">
        {Object.entries(TIER_HELP).map(([tier, help]) => <span key={tier} className="rounded-md border divider px-2 py-1 text-[10px]"><strong>{tier}</strong> · {help}</span>)}
      </div>
    </Card>

    {!filtered.length && <Card className="p-4"><p className="caption">No module matches that search. Try a different word or clear the filters.</p></Card>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map(m => {
        const on = moduleEnabled(config, m.id);
        const registers = m.resources.map(id => RESOURCE_MAP[id]).filter(Boolean);
        const specials = (SPECIAL_LINKS[m.id] || []).filter(l => hrefVisible(`/${org}/${l.href}`, config));
        return <Card key={m.id} className={`p-3.5 ${on ? '' : 'opacity-75'}`}>
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border divider bg-slate-50 text-ink-600 dark:bg-ink-950/40 dark:text-slate-300"><Icon name={m.icon} size={16}/></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5"><p className="card-title">{m.label}</p><Badge tone={on ? 'green' : 'slate'}>{on ? 'On' : 'Not switched on'}</Badge></div>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide muted">{m.group} · {m.tier}</p>
              <p className="caption mt-1.5">{m.description}</p>
            </div>
          </div>
          <div className="mt-3 border-t divider pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide muted">What it holds</p>
            {registers.length ? <div className="mt-1.5 flex flex-wrap gap-1.5">{registers.map(r => {
              const visible = on && hrefVisible(`/m/${r.id}`, config);
              return visible
                ? <Link key={r.id} href={`/${org}/m/${r.id}`} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-ink-600 hover:border-brand-400 hover:text-brand-700 dark:border-ink-700 dark:text-slate-300">{r.label} →</Link>
                : <span key={r.id} className="rounded-md border divider px-2 py-1 text-[10px] muted">{r.label}</span>;
            })}</div> : <p className="caption mt-1">A page or settings area — no separate record list.</p>}
            {specials.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{specials.map(l => <Link key={l.href} href={`/${org}/${l.href}`} className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand-700 hover:underline dark:border-brand-400/30 dark:bg-brand-500/10 dark:text-brand-200">{l.label} →</Link>)}</div>}
            {!on && <p className="mt-2 caption">An owner can switch this on in <Link href={`/${org}/settings`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">Settings → Sections</Link>.</p>}
          </div>
        </Card>;
      })}
    </div>
  </div>;
}

function ButtonClear({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="btn-outline btn-sm h-8 px-2 text-[11px]"><Lucide.X size={13}/>Clear</button>;
}

export default function DocumentationPage() {
  const { org } = useParams<{ org: string }>();
  return <div className="space-y-6 pb-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="heading">Documentation</h1>
        <p className="mt-1 caption max-w-3xl">How work moves through MYLA — from the first phone call to money in the bank. Written for busy contractors, not IT teams.</p>
      </div>
      <Badge tone="blue">Plain-language guide</Badge>
    </div>

    <nav aria-label="On this page" className="flex flex-wrap gap-1.5 border-b divider pb-3">
      {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-600 transition hover:border-brand-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-ink-700 dark:bg-ink-900 dark:text-slate-300 dark:hover:text-white">
        {s.label}
      </a>)}
    </nav>

    <Section id="flow" title="How a job flows" kicker="Six steps. One record follows the work from the first call to handover, so nobody types the same thing twice or loses the paperwork.">
      <Card className="p-4">
        <JobFlow />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['You always know the price', 'The quote, the agreed contract and every extra stay together.'],
            ['You always know the cost', 'Materials, plant, wages and subcontractors are written against the job.'],
            ['You always know what is owed', 'Certificates, tax invoices, receipts and retention sit in one chain.'],
          ].map(([t, d]) => <div key={t} className="rounded-md border border-slate-200 p-3 dark:border-ink-700">
            <p className="card-title">{t}</p><p className="mt-1 caption">{d}</p>
          </div>)}
        </div>
      </Card>
    </Section>

    <Section id="convert" title="Convert to… — one job, one continuous flow" kicker="You do not retype the same job at every stage. Open any record in the chain and press Convert to… to create the next linked draft with the details already filled in.">
      <Card className="p-4">
        <FlowStrip steps={CHAIN_STAGES.map(s => ({ label: s.short, sub: s.optional ? 'Optional step' : s.singular }))}/>
        <p className="caption mt-3">A tender is optional — a quote can be awarded straight to a job. Every conversion creates a <strong>new</strong> record, links it back to the one you came from, and leaves the original intact. Each step can only be done once, so a double click will not create duplicates.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            ['Where the button is', 'In a record drawer footer, in the Actions column of any list, and on the project 360° record tab.'],
            ['What it copies', 'Client, job, itemised lines, the quoted total, the certified net amount, VAT, dates and the contract form.'],
            ['What it never does', 'It never deletes records, never skips your role permissions or module switches, and never overwrites the source except the status shown in the preview.'],
          ].map(([t, d]) => <div key={t} className="rounded-md border divider p-3"><p className="text-[12px] font-semibold">{t}</p><p className="caption mt-1">{d}</p></div>)}
        </div>
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead><tr className="border-b divider bg-slate-50 dark:bg-ink-950/40"><th className="table-th">If you are on a…</th><th className="table-th">Press…</th></tr></thead>
          <tbody>{CONVERSION_STEPS.map(([from, button], i) => <tr key={from} className={i ? 'border-t divider' : ''}>
            <td className="table-td font-medium">{from}</td><td className="table-td muted">{button}</td>
          </tr>)}</tbody>
        </table>
      </Card>
      <p className="caption">The drawer also shows a nine-stage strip: what is done, where you are now, and what is still to come. Completed stages open the actual record. Status changes such as WON, AWARDED, ISSUED and PAID are still made with the inline dropdown on the list.</p>
    </Section>

    <Section id="studio" title="Quote Studio & drag-and-drop files" kicker="Two faster ways to work: a guided quotation builder with reusable packages, and a document library you can organise by dragging files where they belong.">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"><Icon name="Wand2" size={18}/></span><div><h3 className="card-title">Quote Studio</h3><p className="caption mt-0.5">New Quote and Edit now open a full-page, five-step builder instead of the generic form.</p></div></div>
          <div className="mt-3 space-y-2">
            {[
              ['Start', 'Begin blank or load a built-in package such as Renovation, Concrete & civils, Maintenance or Electrical.'],
              ['Client & job', 'Choose a client, add one inline if needed, and set the title, currency and date.'],
              ['Build the price', 'Add plain-language lines by cost category; quantities, rates, cost buckets, markup and the final total recalculate live.'],
              ['Scope & terms', 'Use one-click snippets for inclusions, exclusions, validity, access and payment terms.'],
              ['Review & save', 'Check a branded live preview, set the status, then save. The result is a normal quote with a PDF and the full Convert to… chain.'],
            ].map(([t,d],i)=><div key={t} className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-ink-700 dark:bg-ink-800 dark:text-slate-200">{i+1}</span><div><p className="text-[12px] font-semibold">{t}</p><p className="caption">{d}</p></div></div>)}
          </div>
          <p className="caption mt-3">Save any draft as a <strong>reusable template</strong>. Templates keep the title, lines, markup and scope — never a client or a date — and can be used, updated or deleted by your workspace.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon name="CloudUpload" size={18}/></span><div><h3 className="card-title">Documents & files</h3><p className="caption mt-0.5">Drag files in to upload, drag documents between folders, and drop a replacement onto an existing file for a new revision.</p></div></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ['CloudUpload', 'Drop to upload', 'Drop one or many files into the current folder, or straight onto any folder card.'],
              ['FolderInput', 'Drag to organise', 'Use the grip handle beside a document to move it onto another job or custom folder.'],
              ['GitBranch', 'Drop a revision', 'Drop a new file onto an existing document card; older revisions stay attached and visible.'],
              ['Paperclip', 'Record attachments', 'Record drawers also have a drop zone for drawings, photos and signed paperwork.'],
            ].map(([i,t,d])=><div key={t} className="rounded-md border divider p-3"><Icon name={i} size={16} className="text-brand-600"/><p className="mt-2 text-[12px] font-semibold">{t}</p><p className="caption mt-0.5">{d}</p></div>)}
          </div>
          <p className="caption mt-3">The usual file picker, permissions, 12 MB limit, revision badges and controlled-document register are all still there — drag-and-drop is an easier way to reach them.</p>
        </Card>
      </div>
    </Section>

    <Section id="modules" title="Every module and what it does" kicker="All 34 modules and 49 registers in MYLA, generated from the same catalogue that builds the sidebar. Search by name or by what the module holds; a grey card is simply switched off for your company.">
      <ModuleDirectory org={org}/>
    </Section>

    <Section id="home" title="Your home screen" kicker="The first page you see each morning. The numbers below are an illustration — your own screen shows your own jobs and money.">
      <Card className="p-4">
        <HomeScreen />
        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {[
            [1, 'The five numbers', 'Jobs running, money owed to you, client money, bills to pay and queries waiting.'],
            [2, 'Money billed', 'A simple picture of what you have invoiced each month.'],
            [3, 'Client money in hand', 'What each client has paid in advance, ready to put on their jobs.'],
            [4, 'Needs your attention', 'Late payments, unanswered questions and jobs falling behind.'],
            [5, 'What changed today', 'Who added or changed a record, so nothing quietly disappears.'],
            [6, 'Sidebar sections', 'Only the parts of MYLA switched on for your company appear here.'],
          ].map(([n, t, d]) => <div key={n} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-500 text-[10px] font-bold text-white">{n}</span>
            <div><p className="text-[12px] font-semibold text-ink-900 dark:text-white">{t}</p><p className="caption">{d}</p></div>
          </div>)}
        </div>
      </Card>
    </Section>

    <Section id="everyday" title="Everyday work" kicker="Each chain is just a few screens. Start where you are; the next step is already linked to what you just saved.">
      <div className="grid gap-3 xl:grid-cols-2">
        {EVERYDAY.map(f => <Card key={f.title} className="p-4">
          <div className="mb-3 flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-ink-700 dark:border-ink-700 dark:bg-ink-950/40 dark:text-slate-200"><Icon name={f.icon} size={16} /></span>
            <div><h3 className="card-title">{f.title}</h3><p className="caption mt-0.5">{f.blurb}</p></div>
          </div>
          <FlowStrip steps={f.steps} />
        </Card>)}
      </div>
    </Section>

    <Section id="small" title="Start small — this is for a two-person workshop too" kicker="You do not need every section on day one. A very small contractor can run the whole business with four of them.">
      <div className="grid gap-3 lg:grid-cols-4">
        {[
          { icon: 'Handshake', t: '1. Clients', d: 'Who you are working for and how to reach them.' },
          { icon: 'FileText', t: '2. Quotes', d: 'Price the work and send a quote or tender.' },
          { icon: 'HardHat', t: '3. Jobs', d: 'What is on site, what has been done, what is left.' },
          { icon: 'Receipt', t: '4. Tax invoices', d: 'Bill the client, add 15% VAT, record the receipt.' },
        ].map(x => <Card key={x.t} className="p-3.5">
          <Icon name={x.icon} size={17} className="text-brand-600 dark:text-brand-300" />
          <p className="mt-2 card-title">{x.t}</p><p className="mt-1 caption">{x.d}</p>
        </Card>)}
      </div>
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Add more when you grow', 'Need materials, wages, safety or plant? Switch that section on in Settings. Nothing already saved is lost.'],
            ['Set up for Zimbabwe first', 'USD and ZWG, 15% VAT and tax invoices, PAYE / NSSA, RTGS and mobile money, (Pvt) Ltd and CR14 numbers.'],
            ['Other African countries', 'Country, currency and tax wording are settings, so the same system can be rolled out beyond Zimbabwe later.'],
          ].map(([t, d]) => <div key={t} className="rounded-md border border-slate-200 p-3 dark:border-ink-700">
            <p className="card-title">{t}</p><p className="mt-1 caption">{d}</p>
          </div>)}
        </div>
        <p className="mt-3 caption">During setup, MYLA asks what kind of work you do and how many people work here, then suggests a sensible starter set. You can always choose <strong>Start small again</strong> or <strong>Switch everything on</strong>.</p>
      </Card>
    </Section>

    <Section id="people" title="Who can see what" kicker="Only the people you invite can open your company. Each person sees the parts they need — nothing more.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: 'User', t: 'Owner / MD', d: 'Sees everything: jobs, money, people and settings. Can invite others.' },
          { icon: 'HardHat', t: 'Site supervisor / foreman', d: 'Records site diaries, hours, questions from site and safety checks.' },
          { icon: 'Wallet', t: 'Accounts person', d: 'Handles tax invoices, supplier bills, wages and receipts.' },
          { icon: 'Handshake', t: 'Client', d: 'If you invite them, they see only their own jobs and their own money.' },
        ].map(x => <Card key={x.t} className="p-3.5">
          <Icon name={x.icon} size={17} className="text-brand-600 dark:text-brand-300" />
          <p className="mt-2 card-title">{x.t}</p><p className="mt-1 caption">{x.d}</p>
        </Card>)}
      </div>
      <Card className="p-4">
        <p className="caption">Every change is checked before it is saved and written into the activity trail, so you can always see who did what. A client's view is limited to their own jobs — even the files, invoices and payments. You can review and change roles in <Link href={`/${org}/settings`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">Settings</Link>.</p>
      </Card>
    </Section>

    <Section id="words" title="Words we use" kicker="Plain words first. If a quantity surveyor, engineer or bookkeeper uses a formal word, it is here in brackets.">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead><tr className="border-b divider bg-slate-50 dark:bg-ink-950/40">
            <th className="table-th">In MYLA</th><th className="table-th">Also called</th>
          </tr></thead>
          <tbody>{GLOSSARY.map(([plain, formal], i) => <tr key={plain} className={i ? 'border-t divider' : ''}>
            <td className="table-td font-medium">{plain}</td>
            <td className="table-td muted">{formal}</td>
          </tr>)}</tbody>
        </table>
      </Card>
      <p className="caption">Full wording rules live in <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-ink-800">TERMINOLOGY.md</code> in the project.</p>
    </Section>

    <Section id="find" title="Where to find things" kicker="The sidebar is built from the sections switched on for your company. Every list works the same way: search, filter, open a record, attach a file, print or download.">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b divider bg-slate-50 dark:bg-ink-950/40">
            <th className="table-th">Section</th><th className="table-th">Start here</th><th className="table-th">What it holds</th>
          </tr></thead>
          <tbody>
            {MODULE_MAP.map((m, i) => <tr key={m.group} className={i ? 'border-t divider' : ''}>
              <td className="table-td"><span className="flex items-center gap-2 font-medium"><Icon name={m.icon} size={14} className="text-brand-600 dark:text-brand-300" />{m.group}</span></td>
              <td className="table-td"><span className="flex flex-wrap gap-1.5">{m.items.map(it => <Link key={it.href} href={`/${org}/${it.href}`} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:border-brand-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-ink-700 dark:text-slate-300 dark:hover:text-white">{it.label}</Link>)}</span></td>
              <td className="table-td muted">{m.holds}</td>
            </tr>)}
          </tbody>
        </table>
      </Card>
    </Section>

    <Section id="help" title="Quick help" kicker="Small things that save time on a busy day.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: 'Search', t: 'Find anything', d: 'Press Ctrl+K (⌘K on a Mac), then type two or more letters.' },
          { icon: 'Filter', t: 'Narrow a list', d: 'Search, status and active filters combine; Clear resets them straight away.' },
          { icon: 'Download', t: 'Take your data', d: 'Download any list as a CSV for Excel, or print a MYLA-branded PDF of a record.' },
          { icon: 'Paperclip', t: 'Keep versions', d: 'Attach a drawing, then add Rev B, Rev C and so on — the latest is marked.' },
        ].map(x => <Card key={x.t} className="p-3.5">
          <Icon name={x.icon} size={17} className="text-brand-600 dark:text-brand-300" />
          <p className="mt-2 card-title">{x.t}</p><p className="mt-1 caption">{x.d}</p>
        </Card>)}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/${org}/dashboard`} className="btn-primary btn-md">Open my dashboard <Lucide.ArrowRight size={15} /></Link>
        <Link href={`/${org}/reports`} className="btn-outline btn-md">See reports</Link>
        <Link href={`/${org}/wallets`} className="btn-outline btn-md">Client money</Link>
        <Link href={`/${org}/settings`} className="btn-outline btn-md">Settings</Link>
      </div>
    </Section>

    <p className="border-t divider pt-3 caption">MYLA ERP · Built for Progress. · CONSTRUCTION &amp; INDUSTRIAL MANAGEMENT. This guide describes the company you are signed into; the sections you see depend on what your company has switched on.</p>
  </div>;
}
