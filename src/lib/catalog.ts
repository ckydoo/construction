/* Declarative module catalogue + onboarding derivation engine.
   Single source of truth for sidebar, route guards, seed generation and Settings > Modules. */

export const COMPANY_TYPES = [
  { id: 'GENERAL_CONTRACTOR', label: 'Building contractor', desc: 'Houses, shops, offices and general building work', icon: 'Building2' },
  { id: 'CIVIL_INFRASTRUCTURE', label: 'Roads & civil works', desc: 'Roads, bridges, water, sewer and utilities', icon: 'Route' },
  { id: 'INDUSTRIAL_EPC', label: 'Industrial & plant works', desc: 'Factories, mines, energy, workshops and plant maintenance', icon: 'Factory' },
  { id: 'SPECIALTY_TRADE', label: 'Specialist trade', desc: 'Electrical, plumbing, welding, fabrication, air-conditioning', icon: 'Wrench' },
  { id: 'RESIDENTIAL_DEVELOPER', label: 'Housing & stands', desc: 'Homes, stands, estates and small developments', icon: 'Home' },
  { id: 'CONSTRUCTION_MANAGEMENT', label: 'Managing & measuring work', desc: 'Project management, quantity surveying, consultancy', icon: 'ClipboardCheck' },
  { id: 'EQUIPMENT_RENTAL', label: 'Plant & equipment hire', desc: 'Hiring out machines, tools and vehicles', icon: 'Truck' },
  { id: 'MIXED_GROUP', label: 'Group of companies', desc: 'Several teams or registered companies', icon: 'Network' },
] as const;

export const COMPANY_SIZES = [
  { id: 'MICRO', label: 'Very small', range: '1–10 people', users: 3, desc: 'Owner-run, a few jobs on the go' },
  { id: 'SMALL', label: 'Small', range: '11–50 people', users: 15, desc: 'Small office, growing team' },
  { id: 'MID', label: 'Growing', range: '51–200 people', users: 60, desc: 'Several jobs and separate teams' },
  { id: 'LARGE', label: 'Large', range: '201–1,000 people', users: 300, desc: 'Several regions, formal checks' },
  { id: 'ENTERPRISE', label: 'Very large group', range: '1,000+ people', users: 9999, desc: 'Several companies in one group' },
] as const;

export const QUALIFIERS = [
  { id: 'subcontractHeavy', label: 'We use a lot of subcontractors', flags: ['subcontractorPrequal'] },
  { id: 'designBuild', label: 'Design-and-build contracts', flags: ['bimIntegration'] },
  { id: 'publicClients', label: 'Government or parastatal clients', flags: ['certifiedPayroll'] },
  { id: 'fieldCrews', label: 'Teams working away from the office', flags: ['offlineFieldApp'] },
  { id: 'ownedPlant', label: 'We own our plant & equipment', flags: ['barcodeAssets'] },
  { id: 'materialsWarehouse', label: 'We keep a stores / yard', flags: [] },
  { id: 'multiEntity', label: 'More than one registered company', flags: ['consolidation', 'multiCurrency'] },
  { id: 'multiCurrency', label: 'We use both USD and ZWG', flags: ['multiCurrency'] },
  { id: 'regulatedHse', label: 'Formal safety rules (NSSA / ISO)', flags: ['hseAdvanced'] },
  { id: 'clientPortal', label: 'Clients can log in to see their jobs', flags: ['clientPortal'] },
  { id: 'eSignature', label: 'Approvals by email / e-signature', flags: ['esignature'] },
] as const;

export type ModuleId = string;
export type ModuleTier = 'CORE' | 'STANDARD' | 'ADVANCED' | 'ENTERPRISE';

export type ModuleDef = {
  id: ModuleId; label: string; group: string; icon: string; tier: ModuleTier;
  description: string; resources: string[];
  defaultTypes?: string[] | '*'; minSize?: number; requiresQualifier?: string;
};

export const MODULES: ModuleDef[] = [
  { id:'dashboard', label:'Home dashboard', group:'Overview', icon:'LayoutDashboard', tier:'CORE', description:'Jobs, money and things that need your attention', resources:[], defaultTypes:'*' },
  { id:'company', label:'Company & settings', group:'Settings', icon:'Building', tier:'CORE', description:'Company details, numbering, currencies, users and roles', resources:[], defaultTypes:'*' },
  { id:'crm', label:'Clients & contacts', group:'Clients & quotes', icon:'Handshake', tier:'CORE', description:'Client companies, contacts and relationship history', resources:['clients','contacts'], defaultTypes:'*' },
  { id:'pipeline', label:'Enquiries & leads', group:'Clients & quotes', icon:'Target', tier:'STANDARD', description:'Enquiries, chance of winning and expected value', resources:['leads'], defaultTypes:'*', minSize:1 },
  { id:'estimating', label:'Quotes & tenders', group:'Clients & quotes', icon:'Calculator', tier:'CORE', description:'Measure, price, add markup, revise and win tenders', resources:['estimates','bids'], defaultTypes:'*' },
  { id:'projects', label:'Jobs & projects', group:'Jobs & sites', icon:'HardHat', tier:'CORE', description:'Jobs, tasks, budgets, teams and progress', resources:['projects','tasks'], defaultTypes:'*' },
  { id:'scheduling', label:'Job programme', group:'Jobs & sites', icon:'CalendarRange', tier:'STANDARD', description:'Start and finish dates, milestones and progress', resources:[], defaultTypes:'*', minSize:2 },
  { id:'contracts', label:'Contracts & variations', group:'Jobs & sites', icon:'FileSignature', tier:'CORE', description:'Main contracts, subcontracts, variations and retention', resources:['contracts','changeOrders'], defaultTypes:'*' },
  { id:'projectComms', label:'Site queries & approvals', group:'Jobs & sites', icon:'MessagesSquare', tier:'STANDARD', description:'Numbered lists with who must answer and due dates', resources:['rfis','submittals'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','CONSTRUCTION_MANAGEMENT','MIXED_GROUP'] },
  { id:'documents', label:'Documents & drawings', group:'Jobs & sites', icon:'FolderOpen', tier:'CORE', description:'Latest drawing versions and who they were sent to', resources:['documents'], defaultTypes:'*' },
  { id:'fieldOps', label:'Site diaries & meetings', group:'Jobs & sites', icon:'Camera', tier:'CORE', description:'Daily site diaries, photos, meetings and instructions', resources:['dailyLogs','meetings'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','SPECIALTY_TRADE','CONSTRUCTION_MANAGEMENT'] },
  { id:'closeout', label:'Snag lists & handover', group:'Jobs & sites', icon:'ListChecks', tier:'STANDARD', description:'Snagging, inspections, permits and handover', resources:['punchLists','permits'], defaultTypes:'*', minSize:1 },
  { id:'procurement', label:'Ordering & deliveries', group:'Materials & suppliers', icon:'ShoppingCart', tier:'CORE', description:'Material request → quote → order → delivery note → bill', resources:['requisitions','purchaseOrders','goodsReceipts'], defaultTypes:'*' },
  { id:'vendors', label:'Suppliers & subcontractors', group:'Materials & suppliers', icon:'Store', tier:'CORE', description:'Supplier details, tax clearance and ratings', resources:['vendors','subcontractors'], defaultTypes:'*' },
  { id:'inventory', label:'Stock & stores', group:'Materials & suppliers', icon:'Package', tier:'STANDARD', description:'Stock on hand, issues, transfers and reorder levels', resources:['inventory','warehouses'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','SPECIALTY_TRADE','EQUIPMENT_RENTAL','MIXED_GROUP'] },
  { id:'equipment', label:'Plant & equipment', group:'Materials & suppliers', icon:'Truck', tier:'STANDARD', description:'Plant register, hours used, fuel and servicing', resources:['equipment','workOrders'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','EQUIPMENT_RENTAL','MIXED_GROUP'] },
  { id:'hr', label:'Staff & teams', group:'Staff & wages', icon:'UsersRound', tier:'CORE', description:'Staff, teams, site crews and documents', resources:['employees','departments','crews'], defaultTypes:'*' },
  { id:'time', label:'Time sheets', group:'Staff & wages', icon:'Clock', tier:'CORE', description:'Time sheets, approval and job cost allocation', resources:['timesheets'], defaultTypes:'*' },
  { id:'leave', label:'Leave', group:'Staff & wages', icon:'Palmtree', tier:'STANDARD', description:'Leave types, balances, requests and calendar', resources:['leaveRequests'], defaultTypes:'*', minSize:1 },
  { id:'payroll', label:'Wages & expenses', group:'Staff & wages', icon:'Wallet', tier:'STANDARD', description:'Wage runs, payslips, expense claims and refunds', resources:['payRuns','expenses'], defaultTypes:'*', minSize:1 },
  { id:'competency', label:'Trade certificates & training', group:'Staff & wages', icon:'GraduationCap', tier:'STANDARD', description:'Trade tickets, inductions and expiry alerts', resources:['certifications','training'], defaultTypes:'*' },
  { id:'safety', label:'Safety on site', group:'Safety & quality', icon:'ShieldCheck', tier:'CORE', description:'Toolbox talks, safe-work checks, permits, incidents and follow-up', resources:['toolboxTalks','incidents'], defaultTypes:'*' },
  { id:'quality', label:'Quality checks', group:'Safety & quality', icon:'BadgeCheck', tier:'STANDARD', description:'Site checks, faults, checklists and test results', resources:['inspections','ncrs','itps'], defaultTypes:'*', minSize:2 },
  { id:'finance', label:'Money & accounts', group:'Money & invoices', icon:'Landmark', tier:'CORE', description:'Account codes, journals, money in and out, month-end', resources:['accounts','journals','arInvoices','apBills','payments'], defaultTypes:'*' },
  { id:'wallets', label:'Client wallets', group:'Money & invoices', icon:'CreditCard', tier:'CORE', description:'Client money paid in advance, allocated to jobs and reconciled', resources:[], defaultTypes:'*' },
  { id:'billing', label:'Payment certificates & retention', group:'Money & invoices', icon:'Receipt', tier:'STANDARD', description:'Payment certificates, retention and client receipts', resources:['paymentApps'], defaultTypes:'*', minSize:2 },
  { id:'jobCosting', label:'Job budgets & costs', group:'Money & invoices', icon:'PieChart', tier:'STANDARD', description:'Budget against committed and actual costs', resources:['budgets'], defaultTypes:'*', minSize:2 },
  { id:'reports', label:'Reports', group:'Reports & extras', icon:'BarChart3', tier:'CORE', description:'Ready-made reports and CSV exports', resources:[], defaultTypes:'*' },
  { id:'audit', label:'Activity & alerts', group:'Reports & extras', icon:'Bell', tier:'STANDARD', description:'A record of what changed and who did it', resources:[], defaultTypes:'*', minSize:2 },
  { id:'portal', label:'Client portal', group:'Reports & extras', icon:'Globe', tier:'ADVANCED', description:'External client and subcontractor access', resources:[], defaultTypes:['RESIDENTIAL_DEVELOPER','CONSTRUCTION_MANAGEMENT','MIXED_GROUP'], requiresQualifier:'clientPortal' },
  { id:'unitSales', label:'Stands, sales & warranties', group:'Reports & extras', icon:'KeyRound', tier:'ADVANCED', description:'Stands, unit sales, reservations and handover', resources:['units'], defaultTypes:['RESIDENTIAL_DEVELOPER'] },
  { id:'rental', label:'Plant hire & dispatch', group:'Reports & extras', icon:'Truck', tier:'ADVANCED', description:'Plant hire agreements, dispatch and billing', resources:['rentalContracts'], defaultTypes:['EQUIPMENT_RENTAL'] },
  { id:'commissioning', label:'Handover packs', group:'Reports & extras', icon:'Gauge', tier:'ADVANCED', description:'Systems, test packs and handover manuals', resources:['commissioning'], defaultTypes:['INDUSTRIAL_EPC'] },
  { id:'integrations', label:'Connections & add-ons', group:'Settings', icon:'Plug', tier:'ENTERPRISE', description:'Connections and add-ons for other tools', resources:[], defaultTypes:'*', minSize:4 },
];

export const CORE_MODULE_IDS = MODULES.filter(m => m.tier === 'CORE').map(m => m.id);

/* The essentials: one connected commercial chain — win work → deliver → invoice →
   get paid — plus the people and reporting needed to run it. New workspaces start
   here. Everything else is an explicit add-on (onboarding step 5) or can be
   switched on later in Settings → Modules. This keeps the first-run surface small
   and lets each module be verified before the next one is introduced. */
export const STARTER_MODULE_IDS: string[] = [
  'dashboard','company','crm','pipeline','estimating','projects','contracts',
  'documents','finance','wallets','hr','time','reports',
];
export const STARTER_MODULE_SET = new Set(STARTER_MODULE_IDS);
// A company's defining modules (unit sales, rental, commissioning) unlock as soon
// as that company type is chosen; everything else follows a size/tier ramp.
const TYPE_DEFINING_MODULES = new Set(['unitSales','rental','commissioning']);
const TIER_MIN_SIZE: Record<ModuleTier, number> = { CORE:2, STANDARD:3, ADVANCED:4, ENTERPRISE:4 };
const SIZE_INDEX: Record<string, number> = { MICRO:0, SMALL:1, MID:2, LARGE:3, ENTERPRISE:4 };

export type OnboardingInput = {
  companyType: string;
  size: string;
  headcount?: number;
  revenueBand?: string;
  qualifiers?: string[];
  addons?: string[];
};

export type WorkspaceConfig = {
  modules: string[];
  resources: string[];
  flags: Record<string, boolean>;
  limits: { users: number; projects: number; storageMb: number };
  localePack: string;
  plan: string;
};

export function resolveWorkspace(input: OnboardingInput): WorkspaceConfig {
  const type = input.companyType || 'GENERAL_CONTRACTOR';
  const size = input.size || 'SMALL';
  const si = SIZE_INDEX[size] ?? 1;
  const qualifiers = input.qualifiers || [];
  const addons = input.addons || [];
  // Start small: only the essentials. Type, size, qualifiers and explicit
  // add-ons then layer on modules — nothing is enabled "just because it exists".
  const enabled = new Set<string>(STARTER_MODULE_IDS);

  for (const m of MODULES) {
    if (enabled.has(m.id)) continue;
    const typeMatch = m.defaultTypes === '*' || (m.defaultTypes || []).includes(type) || type === 'MIXED_GROUP';
    if (!typeMatch) continue;
    const minSize = TYPE_DEFINING_MODULES.has(m.id) ? 0 : Math.max(m.minSize ?? 0, TIER_MIN_SIZE[m.tier]);
    const sizeMatch = si >= minSize;
    const qualMatch = !m.requiresQualifier || qualifiers.includes(m.requiresQualifier) || addons.includes(m.id);
    if (sizeMatch && qualMatch) enabled.add(m.id);
  }
  // Qualifiers are explicit choices in onboarding — they unlock their modules.
  if (qualifiers.includes('clientPortal')) enabled.add('portal');
  if (qualifiers.includes('ownedPlant')) enabled.add('equipment');
  if (qualifiers.includes('materialsWarehouse')) enabled.add('inventory');
  if (qualifiers.includes('multiEntity') || type === 'MIXED_GROUP') enabled.add('integrations');
  for (const a of addons) if (MODULES.some(m => m.id === a)) enabled.add(a);

  const flags: Record<string, boolean> = {
    approvalChains: si >= 2,
    budgetVersions: si >= 2,
    wipReporting: si >= 2,
    earnedValue: si >= 2,
    customRoles: si >= 2,
    consolidation: si >= 3 || qualifiers.includes('multiEntity'),
    apiKeys: si >= 3,
    sso: si >= 4,
    auditExport: si >= 2,
    multiCurrency: qualifiers.includes('multiCurrency') || qualifiers.includes('multiEntity') || si >= 3,
    certifiedPayroll: qualifiers.includes('publicClients'),
    offlineFieldApp: qualifiers.includes('fieldCrews'),
    barcodeAssets: qualifiers.includes('ownedPlant'),
    subcontractorPrequal: qualifiers.includes('subcontractHeavy'),
    esignature: qualifiers.includes('eSignature'),
    bimIntegration: qualifiers.includes('designBuild'),
    hseAdvanced: qualifiers.includes('regulatedHse') || type === 'INDUSTRIAL_EPC',
    clientPortal: enabled.has('portal'),
  };

  const resources = Array.from(new Set(MODULES.filter(m => enabled.has(m.id)).flatMap(m => m.resources)));
  const sizeDef = COMPANY_SIZES.find(s => s.id === size) || COMPANY_SIZES[1];
  return {
    modules: Array.from(enabled),
    resources,
    flags,
    limits: { users: sizeDef.users, projects: si === 0 ? 5 : si === 1 ? 25 : si === 2 ? 100 : 500, storageMb: [500, 5000, 25000, 100000, 1000000][si] },
    localePack: 'ZW',
    plan: ['Starter', 'Growth', 'Professional', 'Business', 'Enterprise'][si],
  };
}

export const ROLES = [
  { id:'OWNER', label:'Owner / Managing Director', desc:'Full access, billing and workspace settings' },
  { id:'ADMIN', label:'Administrator', desc:'Full access to all enabled modules' },
  { id:'PROJECT_MANAGER', label:'Contracts / job manager', desc:'Jobs, site work and order approvals' },
  { id:'SITE_ENGINEER', label:'Site supervisor / foreman', desc:'Site diaries, queries, time sheets and safety' },
  { id:'FINANCE_MANAGER', label:'Finance Manager', desc:'Finance, billing, costing and reports' },
  { id:'ACCOUNTANT', label:'Accounts clerk / bookkeeper', desc:'Supplier bills, client invoices and expenses' },
  { id:'HR_MANAGER', label:'HR / admin officer', desc:'Staff, leave, wages and training' },
  { id:'PROCUREMENT', label:'Buyer / stores officer', desc:'Suppliers, requests, orders and stock' },
  { id:'SAFETY_OFFICER', label:'Safety officer', desc:'Safety, incidents and site checks' },
  { id:'PLANT_MANAGER', label:'Plant & fleet officer', desc:'Plant, vehicles and servicing' },
  { id:'ESTIMATOR', label:'Estimator / quantity surveyor', desc:'Enquiries, quotes, tenders and contracts' },
  { id:'VIEWER', label:'Viewer', desc:'Read-only across the workspace' },
  { id:'CLIENT_EXTERNAL', label:'Client (portal)', desc:'External read-only project access' },
  { id:'SUBCONTRACTOR_EXTERNAL', label:'Subcontractor (portal)', desc:'External limited access' },
] as const;

/* ─────────────────────────────────────────────────────────────────────────
   ROLE-LEVEL ACCESS CONTROL
   One matrix drives every API route, the sidebar, the form actions and the
   audit suite. `read`/`write` are resource-id allow/deny lists; `scoped`
   roles are additionally row-limited to their own client/subcontractor.
   Capabilities gate actions that are not ordinary record writes.
   ───────────────────────────────────────────────────────────────────────── */
export type Capability =
  | 'records.create' | 'records.update' | 'records.delete'
  | 'files.upload' | 'files.delete' | 'comments.create' | 'exports'
  | 'settings.view' | 'settings.manage' | 'users.manage'
  | 'project360' | 'integrity'
  | 'wallet.read' | 'wallet.topup' | 'wallet.allocate' | 'wallet.refund';

const FINANCE_REGISTERS = ['accounts','journals','arInvoices','apBills','payments','paymentApps','budgets','payRuns','expenses'];
const HR_REGISTERS = ['employees','departments','crews','payRuns','leaveRequests','certifications','training'];
const HSE_REGISTERS = ['incidents','inspections','toolboxTalks','ncrs','itps'];
export const CLIENT_PORTAL_READ = [
  'clients','contacts','projects','tasks','contracts','changeOrders','documents','rfis','submittals',
  'dailyLogs','meetings','punchLists','permits','arInvoices','paymentApps','payments','budgets',
  'units','commissioning','inspections',
];
export const SUB_PORTAL_READ = [
  'projects','tasks','contracts','documents','rfis','submittals','purchaseOrders','timesheets',
  'dailyLogs','meetings','punchLists','toolboxTalks','incidents',
];

export type RoleRule = {
  read: '*' | string[]; readDeny?: string[];
  write: '*' | string[]; writeDeny?: string[];
  delete: boolean; scoped: boolean; capabilities: Capability[];
};

const ALL_CAPS: Capability[] = [
  'records.create','records.update','records.delete','files.upload','files.delete','comments.create',
  'exports','settings.view','settings.manage','users.manage','project360','integrity',
  'wallet.read','wallet.topup','wallet.allocate','wallet.refund',
];
const READ_CAPS: Capability[] = ['comments.create','exports','project360','wallet.read','settings.view'];
const caps = (extra: Capability[], remove: Capability[] = []) =>
  Array.from(new Set([...READ_CAPS, ...extra].filter(c => !remove.includes(c))));

export const ROLE_RULES: Record<string, RoleRule> = {
  OWNER:            { read:'*', write:'*', delete:true, scoped:false, capabilities:[...ALL_CAPS] },
  ADMIN:            { read:'*', write:'*', delete:true, scoped:false, capabilities:[...ALL_CAPS] },
  PROJECT_MANAGER:  { read:'*', readDeny:['accounts','journals','payRuns'], write:'*',
                      writeDeny:FINANCE_REGISTERS, delete:true, scoped:false,
                      capabilities:caps(['records.create','records.update','records.delete','files.upload','files.delete','wallet.allocate']) },
  SITE_ENGINEER:    { read:'*', readDeny:[...FINANCE_REGISTERS,'employees'], write:'*',
                      writeDeny:[...FINANCE_REGISTERS,...HR_REGISTERS], delete:false, scoped:false,
                      capabilities:caps(['records.create','records.update','files.upload']) },
  FINANCE_MANAGER:  { read:'*', write:'*', writeDeny:[...HSE_REGISTERS,'dailyLogs','toolboxTalks'],
                      delete:true, scoped:false,
                      capabilities:caps(['records.create','records.update','records.delete','files.upload','files.delete','integrity','wallet.topup','wallet.allocate','wallet.refund']) },
  ACCOUNTANT:       { read:'*', write:'*', writeDeny:[...HSE_REGISTERS,'employees','dailyLogs','projects','contracts'],
                      delete:false, scoped:false,
                      capabilities:caps(['records.create','records.update','files.upload','integrity']) },
  HR_MANAGER:       { read:'*', readDeny:FINANCE_REGISTERS, write:'*',
                      writeDeny:[...FINANCE_REGISTERS,'projects','contracts','purchaseOrders'], delete:true, scoped:false,
                      capabilities:caps(['records.create','records.update','records.delete','files.upload','files.delete']) },
  PROCUREMENT:      { read:'*', write:'*', writeDeny:[...FINANCE_REGISTERS,'employees'], delete:true, scoped:false,
                      capabilities:caps(['records.create','records.update','records.delete','files.upload','files.delete']) },
  SAFETY_OFFICER:   { read:'*', readDeny:[...FINANCE_REGISTERS,'employees'], write:'*',
                      writeDeny:[...FINANCE_REGISTERS,...HR_REGISTERS], delete:false, scoped:false,
                      capabilities:caps(['records.create','records.update','files.upload']) },
  PLANT_MANAGER:    { read:'*', readDeny:[...FINANCE_REGISTERS,'employees'], write:'*',
                      writeDeny:[...FINANCE_REGISTERS,...HR_REGISTERS], delete:false, scoped:false,
                      capabilities:caps(['records.create','records.update','files.upload']) },
  ESTIMATOR:        { read:'*', write:'*', writeDeny:[...FINANCE_REGISTERS,'payRuns'], delete:false, scoped:false,
                      capabilities:caps(['records.create','records.update','files.upload']) },
  VIEWER:           { read:'*', write:[], delete:false, scoped:false,
                      capabilities:['exports','wallet.read','project360','settings.view'] },
  CLIENT_EXTERNAL:  { read:CLIENT_PORTAL_READ, write:[], delete:false, scoped:true,
                      capabilities:['comments.create','exports','project360','wallet.read','wallet.allocate'] },
  SUBCONTRACTOR_EXTERNAL: { read:SUB_PORTAL_READ, write:[], delete:false, scoped:true,
                      capabilities:['comments.create','exports','project360'] },
};

export function ruleFor(role: string): RoleRule { return ROLE_RULES[role] || ROLE_RULES.VIEWER; }
export function capabilitiesFor(role: string): Capability[] { return ruleFor(role).capabilities; }
export function canCapability(role: string, cap: Capability): boolean { return ruleFor(role).capabilities.includes(cap); }

export function canRead(role: string, resource: string): boolean {
  const r = ruleFor(role);
  if (r.readDeny?.includes(resource)) return false;
  return r.read === '*' || r.read.includes(resource);
}
export function canWrite(role: string, resource: string): boolean {
  const r = ruleFor(role);
  if (!canRead(role, resource)) return false;
  if (r.writeDeny?.includes(resource)) return false;
  return r.write === '*' || r.write.includes(resource);
}
export function canDelete(role: string, resource?: string): boolean {
  const r = ruleFor(role);
  if (!r.delete) return false;
  return resource ? canWrite(role, resource) : true;
}
export function isExternal(role: string): boolean { return ruleFor(role).scoped; }

/** Snapshot of what the current role may do — sent to the UI by /meta. */
export function permissionsFor(role: string, resources: string[]) {
  const r = ruleFor(role);
  return {
    role,
    read: resources.filter(x => canRead(role, x)),
    write: resources.filter(x => canWrite(role, x)),
    delete: r.delete,
    scoped: r.scoped,
    capabilities: r.capabilities,
  };
}
