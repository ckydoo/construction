'use client';
/* In-product documentation. Every diagram is inline SVG/HTML so it stays crisp,
 * theme-aware and available offline — no external images or chart libraries. */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Badge, Icon } from '@/components/ui';
import * as Lucide from '@/components/lucide';

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
  { id: 'map', label: 'System map' },
  { id: 'dashboard', label: 'Dashboard anatomy' },
  { id: 'lifecycle', label: 'Request lifecycle' },
  { id: 'flows', label: 'Business flows' },
  { id: 'access', label: 'Access & tenancy' },
  { id: 'modules', label: 'Module map' },
  { id: 'reference', label: 'Quick reference' },
];

function DiagramBox({ x, y, w, h, title, sub, accent = false }: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean }) {
  return <g>
    <rect x={x} y={y} width={w} height={h} rx={6} strokeWidth={1} className={C.box} />
    {accent && <rect x={x} y={y + 12} width={3} height={h - 24} rx={1.5} className={C.accent} />}
    <text x={x + 14} y={y + 24} fontSize={13} fontWeight={600} className={C.text}>{title}</text>
    {sub && <text x={x + 14} y={y + 41} fontSize={9.5} className={C.muted}>{sub}</text>}
  </g>;
}

function Chip({ x, y, w, label }: { x: number; y: number; w: number; label: string }) {
  return <g>
    <rect x={x} y={y} width={w} height={23} rx={4} strokeWidth={1} className={C.soft} />
    <text x={x + 10} y={y + 15} fontSize={10} className={C.text}>{label}</text>
  </g>;
}

function Arrow({ x1, x2, y, label }: { x1: number; x2: number; y: number; label?: string }) {
  return <g>
    <path d={`M${x1} ${y} H${x2 - 9}`} strokeWidth={1.6} fill="none" className={C.strokeAccent} />
    <path d={`M${x2} ${y} l-9 -5 v10 z`} className={C.accent} />
    {label && <text x={(x1 + x2) / 2} y={y - 9} textAnchor="middle" fontSize={9.5} className={C.muted}>{label}</text>}
  </g>;
}

function Callout({ x, y, n }: { x: number; y: number; n: number }) {
  return <g>
    <circle cx={x} cy={y} r={11} className={C.accent} />
    <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-white">{n}</text>
  </g>;
}

function SvgFrame({ children, label, viewBox, minWidth = 720 }: { children: React.ReactNode; label: string; viewBox: string; minWidth?: number }) {
  return <div>
    <div className="w-full overflow-x-auto rounded-md">
      <svg viewBox={viewBox} className="h-auto w-full" style={{ minWidth }} role="img" aria-label={label}>
        {children}
      </svg>
    </div>
    <p className="mt-1.5 text-[10px] muted sm:hidden">Swipe the diagram sideways to see every stage.</p>
  </div>;
}

/* 1 — How the parts fit together. */
function SystemMap() {
  return <SvgFrame viewBox="0 0 1000 322" label="System map: people sign in to the MYLA Next.js application, which reads and writes through Supabase Auth, Postgres with row-level security, and Storage, then renders dashboards, reports, PDFs and exports.">
    <rect x={0} y={0} width={1000} height={322} rx={8} className="fill-slate-50 dark:fill-ink-950" />
    <DiagramBox x={18} y={64} w={176} h={112} title="People & roles" sub="Owner · PM · Finance · Client" />
    <text x={32} y={112} fontSize={10} className={C.muted}>Sign in once, then work inside</text>
    <text x={32} y={130} fontSize={10} className={C.muted}>one shared workspace.</text>
    <DiagramBox x={234} y={48} w={250} h={146} title="MYLA application" sub="Next.js 15 · server-rendered" accent />
    <Chip x={248} y={100} w={222} label="App shell & navigation" />
    <Chip x={248} y={130} w={222} label="49 connected resources" />
    <Chip x={248} y={160} w={222} label="API routes + RBAC guards" />
    <DiagramBox x={524} y={48} w={250} h={146} title="Supabase" sub="One project, many workspaces" accent />
    <Chip x={538} y={100} w={222} label="Auth · sessions · cookies" />
    <Chip x={538} y={130} w={222} label="Postgres + RLS policies" />
    <Chip x={538} y={160} w={222} label="Storage · attachments · PDFs" />
    <DiagramBox x={814} y={64} w={168} h={112} title="Outputs" sub="Dashboards · Reports · PDFs" />
    <text x={828} y={112} fontSize={10} className={C.muted}>CSV exports, certificates</text>
    <text x={828} y={130} fontSize={10} className={C.muted}>and audit trails.</text>
    <Arrow x1={196} x2={232} y={120} label="sign in" />
    <Arrow x1={486} x2={522} y={120} label="queries" />
    <Arrow x1={776} x2={812} y={120} label="records" />
    <path d="M898 178 V222 H106 V178" strokeWidth={1.3} strokeDasharray="4 4" fill="none" className={C.strokeFaint} />
    <path d="M106 178 l-5 9 h10 z" className={C.accent} />
    <rect x={18} y={244} width={964} height={52} rx={6} strokeWidth={1} className={C.soft} />
    <text x={34} y={266} fontSize={11} fontWeight={600} className={C.text}>Decisions loop back as new records — the cycle repeats.</text>
    <text x={34} y={284} fontSize={10} className={C.muted}>Every read and write is re-checked against your organisation, role and record scope before it reaches the database.</text>
  </SvgFrame>;
}

/* 2 — An illustrated dashboard with numbered callouts. */
function DashboardAnatomy() {
  const kpis = [
    ['Active projects', '12'], ['Contract value', '$24.8m'], ['Wallet balance', '$11.0m'],
    ['Open RFIs', '7'], ['Modules live', '34'],
  ];
  const bars = [58, 74, 52, 88, 66, 96, 78];
  const rowY = [210, 232, 254, 276];
  const lowY = [358, 380, 402, 424];
  return <SvgFrame viewBox="0 0 1000 470" label="Illustrated dashboard: a five-metric KPI strip, a revenue versus cost chart, a client wallet register, an attention list and a recent activity trail, with module navigation down the left side." minWidth={760}>
    <rect x={0} y={0} width={1000} height={470} className="fill-white dark:fill-ink-900" />
    <path d="M0 40 H170 V462 A8 8 0 0 1 162 470 H8 A8 8 0 0 1 0 462 Z" className="fill-slate-50 dark:fill-ink-950" />
    <path d="M8 0 H992 A8 8 0 0 1 1000 8 V40 H0 V8 A8 8 0 0 1 8 0 Z" className="fill-ink-900" />
    <rect x={16} y={13} width={14} height={14} rx={3} className={C.accent} />
    <text x={37} y={25} fontSize={13} fontWeight={700} className="fill-white">MYLA</text>
    <text x={84} y={25} fontSize={9} className="fill-slate-400">ERP</text>
    <rect x={360} y={9} width={260} height={22} rx={4} className="fill-ink-800" />
    <text x={372} y={24} fontSize={9} className="fill-slate-400">Search anything…</text>
    <circle cx={940} cy={20} r={7} className="fill-ink-700" />
    <circle cx={964} cy={20} r={7} className={C.accent} />
    <line x1={170} y1={40} x2={170} y2={470} strokeWidth={1} className={C.strokeFaint} />
    <rect x={0} y={58} width={3} height={18} className={C.accent} />
    <rect x={8} y={56} width={146} height={22} rx={3} className="fill-brand-50 dark:fill-ink-800" />
    {Array.from({ length: 9 }).map((_, i) => <rect key={i} x={16} y={92 + i * 26} width={i % 3 === 0 ? 96 : 124} height={7} rx={2} className={C.faint} />)}
    <text x={190} y={68} fontSize={15} fontWeight={600} className={C.text}>Dashboard</text>
    <text x={190} y={84} fontSize={9.5} className={C.muted}>Live position across your enabled modules</text>
    {kpis.map(([label, value], i) => {
      const x = 190 + i * 160;
      return <g key={label}>
        <rect x={x} y={96} width={150} height={52} rx={5} strokeWidth={1} className={C.soft} />
        <text x={x + 10} y={115} fontSize={8.5} className={C.muted}>{label}</text>
        <text x={x + 10} y={136} fontSize={15} fontWeight={600} className={C.text}>{value}</text>
      </g>;
    })}
    <rect x={190} y={158} width={390} height={152} rx={5} strokeWidth={1} className={C.box} />
    <text x={204} y={178} fontSize={10.5} fontWeight={600} className={C.text}>Revenue vs cost</text>
    <line x1={204} y1={292} x2={566} y2={292} strokeWidth={1} className={C.strokeFaint} />
    {bars.map((h, i) => <rect key={i} x={212 + i * 48} y={292 - h} width={26} height={h} rx={2} className={i === 5 ? C.accent : 'fill-slate-300 dark:fill-ink-600'} />)}
    <rect x={590} y={158} width={390} height={152} rx={5} strokeWidth={1} className={C.box} />
    <text x={604} y={178} fontSize={10.5} fontWeight={600} className={C.text}>Client wallet register</text>
    <text x={604} y={194} fontSize={8.5} className={C.muted}>Client</text>
    <text x={898} y={194} fontSize={8.5} className={C.muted}>Available</text>
    {rowY.map((y, i) => <g key={y}>
      <line x1={604} y1={y + 10} x2={966} y2={y + 10} strokeWidth={1} className={C.strokeFaint} />
      <rect x={604} y={y - 3} width={120 + i * 14} height={6} rx={2} className={C.faint} />
      <rect x={898} y={y - 3} width={52} height={6} rx={2} className={i === 0 ? C.accent : C.faint} />
    </g>)}
    <rect x={190} y={320} width={390} height={130} rx={5} strokeWidth={1} className={C.box} />
    <text x={204} y={340} fontSize={10.5} fontWeight={600} className={C.text}>Needs attention</text>
    {lowY.map((y, i) => <g key={y}>
      <circle cx={210} cy={y - 2} r={3} className={i === 0 ? C.accent : C.faint} />
      <rect x={222} y={y - 5} width={230 - i * 18} height={6} rx={2} className={C.faint} />
    </g>)}
    <rect x={590} y={320} width={390} height={130} rx={5} strokeWidth={1} className={C.box} />
    <text x={604} y={340} fontSize={10.5} fontWeight={600} className={C.text}>Recent activity</text>
    {lowY.map((y, i) => <g key={y}>
      <circle cx={610} cy={y - 2} r={3} className={i === 0 ? C.accent : C.faint} />
      <rect x={622} y={y - 5} width={226 - i * 22} height={6} rx={2} className={C.faint} />
    </g>)}
    <Callout x={966} y={88} n={1} />
    <Callout x={566} y={170} n={2} />
    <Callout x={966} y={170} n={3} />
    <Callout x={566} y={332} n={4} />
    <Callout x={966} y={332} n={5} />
    <Callout x={152} y={52} n={6} />
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

const FLOWS: { title: string; icon: string; blurb: string; steps: Step[] }[] = [
  {
    title: 'Win work', icon: 'Target',
    blurb: 'A prospect becomes a priced, awarded job with a signed contract.',
    steps: [
      { label: 'Client', sub: 'Company & contacts' },
      { label: 'Opportunity', sub: 'Stage, value, probability' },
      { label: 'Estimate', sub: 'Build-up + markup' },
      { label: 'Bid register', sub: 'Submission & outcome' },
      { label: 'Award', sub: 'WON → contract' },
    ],
  },
  {
    title: 'Project delivery', icon: 'HardHat',
    blurb: 'The programme, site communications and quality records run off one project.',
    steps: [
      { label: 'Project', sub: 'Scope, budget, manager' },
      { label: 'WBS & tasks', sub: 'Programme and progress' },
      { label: 'RFIs / submittals', sub: 'Technical queries' },
      { label: 'Daily logs', sub: 'Manpower, plant, delays' },
      { label: 'Inspections', sub: 'Punch list → handover' },
    ],
  },
  {
    title: 'Finance & wallets', icon: 'Wallet',
    blurb: 'Client funds are allocated to projects and reconciled against certificates and invoices.',
    steps: [
      { label: 'Top up', sub: 'Client wallet credit' },
      { label: 'Allocate', sub: 'Fund a project' },
      { label: 'Certify', sub: 'Progress certificate' },
      { label: 'Invoice', sub: 'Tax invoice / receipt' },
      { label: 'Reconcile', sub: 'Ledger + integrity check' },
    ],
  },
  {
    title: 'Documents & revisions', icon: 'GitBranch',
    blurb: 'Files are attached to a record, superseded by later revisions and exported as branded PDFs.',
    steps: [
      { label: 'Upload', sub: 'Metadata saved first' },
      { label: 'Store', sub: 'Supabase Storage object' },
      { label: 'Rev A → Rev B', sub: 'Supersedes chain' },
      { label: 'PDF export', sub: 'MYLA-branded document' },
      { label: 'Download / delete', sub: 'Scope checked again' },
    ],
  },
];

const MODULE_MAP = [
  { group: 'Overview', icon: 'LayoutDashboard', holds: 'Position, KPIs and guides', items: [{ label: 'Dashboard', href: 'dashboard' }, { label: 'Documentation', href: 'documentation' }] },
  { group: 'Win work', icon: 'Handshake', holds: 'Prospects, pricing, bids and awards', items: [{ label: 'Clients', href: 'm/clients' }, { label: 'Leads & opportunities', href: 'm/leads' }, { label: 'Estimates', href: 'm/estimates' }, { label: 'Bid register', href: 'm/bids' }] },
  { group: 'Project delivery', icon: 'HardHat', holds: 'Programme, site records and handover', items: [{ label: 'Projects', href: 'm/projects' }, { label: 'Tasks & WBS', href: 'm/tasks' }, { label: 'RFIs', href: 'm/rfis' }, { label: 'Daily site logs', href: 'm/dailyLogs' }] },
  { group: 'Supply chain', icon: 'Truck', holds: 'Vendors, purchasing and stock', items: [{ label: 'Vendors', href: 'm/vendors' }, { label: 'Purchase orders', href: 'm/purchaseOrders' }, { label: 'Goods received', href: 'm/goodsReceipts' }, { label: 'Inventory & stock', href: 'm/inventory' }] },
  { group: 'People & HR', icon: 'UsersRound', holds: 'Workforce, time and payroll', items: [{ label: 'Employees', href: 'm/employees' }, { label: 'Timesheets', href: 'm/timesheets' }, { label: 'Pay runs', href: 'm/payRuns' }, { label: 'Certifications', href: 'm/certifications' }] },
  { group: 'Safety & quality', icon: 'ShieldCheck', holds: 'Incidents, inspections and NCRs', items: [{ label: 'Incidents', href: 'm/incidents' }, { label: 'HSE inspections', href: 'm/inspections' }, { label: 'Non-conformance', href: 'm/ncrs' }] },
  { group: 'Finance', icon: 'CreditCard', holds: 'Wallets, certificates, invoices and ledgers', items: [{ label: 'Client wallets', href: 'wallets' }, { label: 'Client invoices', href: 'm/arInvoices' }, { label: 'Payment certificates', href: 'm/paymentApps' }, { label: 'Budgets', href: 'm/budgets' }] },
  { group: 'Insights', icon: 'BarChart3', holds: 'Cross-module reporting', items: [{ label: 'Reports & BI', href: 'reports' }] },
  { group: 'Administration', icon: 'Settings', holds: 'Plan, team, roles and integrity', items: [{ label: 'Settings', href: 'settings' }] },
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

export default function DocumentationPage() {
  const { org } = useParams<{ org: string }>();
  return <div className="space-y-6 pb-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="heading">Documentation</h1>
        <p className="mt-1 caption max-w-3xl">How MYLA works — from sign-in to a signed certificate. Visual guides to the workspace, the data flow and the business processes behind each module.</p>
      </div>
      <Badge tone="blue">Workspace guide</Badge>
    </div>

    <nav aria-label="On this page" className="flex flex-wrap gap-1.5 border-b divider pb-3">
      {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-600 transition hover:border-brand-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-ink-700 dark:bg-ink-900 dark:text-slate-300 dark:hover:text-white">
        {s.label}
      </a>)}
    </nav>

    <Section id="map" title="The system at a glance" kicker="Four layers, one loop. People work in the app; the app talks to Supabase; Supabase returns records that become dashboards, reports and PDFs; decisions made there become new records.">
      <Card className="p-4">
        <SystemMap />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Application', 'Next.js 15 server components, shared UI and 49 resource definitions.'],
            ['Guards', 'Every API route resolves the caller, the organisation, the role and the visible scope.'],
            ['Data', 'Supabase Auth, Postgres with row-level security, and a private Storage bucket.'],
            ['Reporting', 'Live KPIs, standard reports, CSV exports and generated MYLA-branded PDFs.'],
          ].map(([t, d]) => <div key={t} className="rounded-md border border-slate-200 p-3 dark:border-ink-700">
            <p className="card-title">{t}</p><p className="mt-1 caption">{d}</p>
          </div>)}
        </div>
      </Card>
    </Section>

    <Section id="dashboard" title="Reading the dashboard" kicker="An illustrated map of the workspace home. The numbers below are illustrative — the live dashboard always reads your own records.">
      <Card className="p-4">
        <DashboardAnatomy />
        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {[
            [1, 'KPI strip', 'Five compact measures so the shape of the business is visible without scrolling.'],
            [2, 'Revenue vs cost', 'Trend bars built from live financial records, not hardcoded demo numbers.'],
            [3, 'Client wallet register', 'Available funds per client, linked straight into the wallets workspace.'],
            [4, 'Needs attention', 'Overdue RFIs, delayed projects and other items that need a decision.'],
            [5, 'Recent activity', 'An audit trail of creates, edits, uploads, allocations and deletions.'],
            [6, 'Module navigation', 'Only the modules enabled for your plan, and readable for your role, appear.'],
          ].map(([n, t, d]) => <div key={n} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-500 text-[10px] font-bold text-white">{n}</span>
            <div><p className="text-[12px] font-semibold text-ink-900 dark:text-white">{t}</p><p className="caption">{d}</p></div>
          </div>)}
        </div>
      </Card>
    </Section>

    <Section id="lifecycle" title="What happens when you click" kicker="A single request passes through seven checks before anything is written. This is why a client-portal user can never see another client's records.">
      <Card className="p-4">
        <FlowStrip steps={[
          { label: 'Sign in', sub: 'Supabase Auth' },
          { label: 'Session cookie', sub: 'HttpOnly, per browser' },
          { label: 'Middleware', sub: 'Refresh + route guard' },
          { label: 'Organisation', sub: 'Slug → membership' },
          { label: 'Role & scope', sub: 'Capabilities, entity scope' },
          { label: 'RLS query', sub: 'Postgres re-checks' },
          { label: 'UI + audit', sub: 'Optimistic update, log' },
        ]} />
        <p className="mt-3 caption">Writes are validated against the module's field definitions, then logged to the audit trail. Failures roll the optimistic row back and show a toast — nothing is half-saved.</p>
      </Card>
    </Section>

    <Section id="flows" title="Business flows" kicker="Each group of modules is one continuous chain. creating a record at step one makes it available as a reference in every step after it.">
      <div className="grid gap-3 xl:grid-cols-2">
        {FLOWS.map(f => <Card key={f.title} className="p-4">
          <div className="mb-3 flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-ink-700 dark:border-ink-700 dark:bg-ink-950/40 dark:text-slate-200"><Icon name={f.icon} size={16} /></span>
            <div><h3 className="card-title">{f.title}</h3><p className="caption mt-0.5">{f.blurb}</p></div>
          </div>
          <FlowStrip steps={f.steps} />
        </Card>)}
      </div>
    </Section>

    <Section id="access" title="Workspaces, roles & security" kicker="One database holds many organisations. Isolation is enforced in the database, not just hidden in the interface.">
      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <FlowStrip steps={[
            { label: 'Organisation', sub: 'Plan, modules, limits' },
            { label: 'Membership', sub: 'User + role' },
            { label: 'Capability', sub: 'Read / write / delete' },
            { label: 'Record scope', sub: 'All or assigned entity' },
          ]} />
          <div className="mt-3 rounded-md border border-slate-200 p-3 dark:border-ink-700">
            <p className="card-title">Client portal</p>
            <p className="mt-1 caption">A <span className="font-semibold">CLIENT_EXTERNAL</span> membership is scoped to one client record. The sidebar, lists, wallets, attachments and PDF endpoints all narrow to that scope, and Postgres RLS refuses anything outside it.</p>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h3 className="card-title">Built-in roles</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['OWNER', 'ADMIN', 'PROJECT_MANAGER', 'FINANCE', 'HR', 'SAFETY', 'PROCUREMENT', 'CLIENT_EXTERNAL'].map(r => <Badge key={r} tone="slate">{r.replace(/_/g, ' ')}</Badge>)}
          </div>
          <p className="mt-3 caption">Settings shows the full role × capability matrix and a live integrity check of broken references, wallet mismatches and orphaned ledger entries.</p>
        </Card>
      </div>
    </Section>

    <Section id="modules" title="Where things live" kicker="The sidebar is generated from your enabled modules. Open any of these to see the same table, filter, drawer, comment, attachment and PDF pattern.">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr className="border-b divider bg-slate-50 dark:bg-ink-950/40">
            <th className="table-th">Group</th><th className="table-th">Start here</th><th className="table-th">What it holds</th>
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

    <Section id="reference" title="Quick reference" kicker="Small things that make day-to-day work faster.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: 'Search', t: 'Find anything', d: 'Press ⌘K / Ctrl+K for the command palette, then type at least two characters.' },
          { icon: 'Filter', t: 'Narrow a list', d: 'Search, status, project and active-filter chips combine; Clear resets them immediately.' },
          { icon: 'Download', t: 'Take data with you', d: 'CSV export on every table, plus a branded PDF for any individual record.' },
          { icon: 'Paperclip', t: 'Keep versions', d: 'Upload a file, then supersede it to create Rev B, Rev C and so on — the latest is flagged.' },
        ].map(x => <Card key={x.t} className="p-3.5">
          <Icon name={x.icon} size={17} className="text-brand-600 dark:text-brand-300" />
          <p className="mt-2 card-title">{x.t}</p><p className="mt-1 caption">{x.d}</p>
        </Card>)}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/${org}/dashboard`} className="btn-primary btn-md">Open dashboard <Lucide.ArrowRight size={15} /></Link>
        <Link href={`/${org}/reports`} className="btn-outline btn-md">Browse reports</Link>
        <Link href={`/${org}/wallets`} className="btn-outline btn-md">Client wallets</Link>
        <Link href={`/${org}/settings`} className="btn-outline btn-md">Workspace settings</Link>
      </div>
    </Section>

    <p className="border-t divider pt-3 caption">MYLA ERP · Built for Progress. · CONSTRUCTION &amp; INDUSTRIAL MANAGEMENT. This guide describes the application you are signed into; behaviour follows the modules enabled for your workspace.</p>
  </div>;
}
