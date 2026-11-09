/* Declarative module catalogue + onboarding derivation engine.
   Single source of truth for sidebar, route guards, seed generation and Settings > Modules. */

export const COMPANY_TYPES = [
  { id: 'GENERAL_CONTRACTOR', label: 'General Contractor', desc: 'Building & general contracting', icon: 'Building2' },
  { id: 'CIVIL_INFRASTRUCTURE', label: 'Civil & Infrastructure', desc: 'Roads, bridges, water, utilities', icon: 'Route' },
  { id: 'INDUSTRIAL_EPC', label: 'Industrial / EPC', desc: 'Plants, energy, mining, oil & gas', icon: 'Factory' },
  { id: 'SPECIALTY_TRADE', label: 'Specialty Trade', desc: 'Electrical, mechanical, HVAC, plumbing', icon: 'Wrench' },
  { id: 'RESIDENTIAL_DEVELOPER', label: 'Residential Developer', desc: 'Homebuilding, estates, developments', icon: 'Home' },
  { id: 'CONSTRUCTION_MANAGEMENT', label: 'Construction Management', desc: 'PM, quantity surveying, consultancy', icon: 'ClipboardCheck' },
  { id: 'EQUIPMENT_RENTAL', label: 'Plant & Equipment Rental', desc: 'Heavy equipment hire & logistics', icon: 'Truck' },
  { id: 'MIXED_GROUP', label: 'Mixed / Holding Group', desc: 'Multiple divisions and legal entities', icon: 'Network' },
] as const;

export const COMPANY_SIZES = [
  { id: 'MICRO', label: 'Micro', range: '1–10 people', users: 3, desc: 'Owner-led, a few active jobs' },
  { id: 'SMALL', label: 'Small', range: '11–50 people', users: 15, desc: 'Growing contractor, single office' },
  { id: 'MID', label: 'Mid-sized', range: '51–200 people', users: 60, desc: 'Multiple projects & departments' },
  { id: 'LARGE', label: 'Large', range: '201–1,000 people', users: 300, desc: 'Multi-region, formal controls' },
  { id: 'ENTERPRISE', label: 'Enterprise', range: '1,000+ people', users: 9999, desc: 'Multi-entity, consolidated group' },
] as const;

export const QUALIFIERS = [
  { id: 'subcontractHeavy', label: 'Subcontract-heavy delivery', flags: ['subcontractorPrequal'] },
  { id: 'designBuild', label: 'Design–build / EPC contracts', flags: ['bimIntegration'] },
  { id: 'publicClients', label: 'Public-sector / parastatal clients', flags: ['certifiedPayroll'] },
  { id: 'fieldCrews', label: 'Mobile field crews & sites', flags: ['offlineFieldApp'] },
  { id: 'ownedPlant', label: 'Own plant & equipment fleet', flags: ['barcodeAssets'] },
  { id: 'materialsWarehouse', label: 'Materials warehouse / stores', flags: [] },
  { id: 'multiEntity', label: 'Multiple legal entities', flags: ['consolidation', 'multiCurrency'] },
  { id: 'multiCurrency', label: 'Trade in more than one currency', flags: ['multiCurrency'] },
  { id: 'regulatedHse', label: 'Regulated HSE (ISO 45001 / NSSA)', flags: ['hseAdvanced'] },
  { id: 'clientPortal', label: 'Client / subcontractor portal', flags: ['clientPortal'] },
  { id: 'eSignature', label: 'Electronic approvals & signatures', flags: ['esignature'] },
] as const;

export type ModuleId = string;
export type ModuleTier = 'CORE' | 'STANDARD' | 'ADVANCED' | 'ENTERPRISE';

export type ModuleDef = {
  id: ModuleId; label: string; group: string; icon: string; tier: ModuleTier;
  description: string; resources: string[];
  defaultTypes?: string[] | '*'; minSize?: number; requiresQualifier?: string;
};

export const MODULES: ModuleDef[] = [
  { id:'dashboard', label:'Executive dashboard', group:'Overview', icon:'LayoutDashboard', tier:'CORE', description:'Company-wide KPIs, attention queue and activity', resources:[], defaultTypes:'*' },
  { id:'company', label:'Company & settings', group:'Administration', icon:'Building', tier:'CORE', description:'Entities, numbering, currencies, users and roles', resources:[], defaultTypes:'*' },
  { id:'crm', label:'Clients & CRM', group:'Win work', icon:'Handshake', tier:'CORE', description:'Client companies, contacts and relationship history', resources:['clients','contacts'], defaultTypes:'*' },
  { id:'pipeline', label:'Leads & opportunities', group:'Win work', icon:'Target', tier:'STANDARD', description:'Bid pipeline, probability and revenue forecast', resources:['leads'], defaultTypes:'*', minSize:1 },
  { id:'estimating', label:'Estimating & tendering', group:'Win work', icon:'Calculator', tier:'CORE', description:'Take-offs, build-ups, markups, bid revisions and awards', resources:['estimates','bids'], defaultTypes:'*' },
  { id:'projects', label:'Project portfolio', group:'Project delivery', icon:'HardHat', tier:'CORE', description:'Projects, WBS, budgets, teams and health', resources:['projects','tasks'], defaultTypes:'*' },
  { id:'scheduling', label:'Scheduling & lookahead', group:'Project delivery', icon:'CalendarRange', tier:'STANDARD', description:'Gantt, milestones, dependencies and progress', resources:[], defaultTypes:'*', minSize:2 },
  { id:'contracts', label:'Contracts & variations', group:'Project delivery', icon:'FileSignature', tier:'CORE', description:'Prime contracts, subcontracts, change orders, retention', resources:['contracts','changeOrders'], defaultTypes:'*' },
  { id:'projectComms', label:'RFIs & submittals', group:'Project delivery', icon:'MessagesSquare', tier:'STANDARD', description:'Numbered registers with ball-in-court and due dates', resources:['rfis','submittals'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','CONSTRUCTION_MANAGEMENT','MIXED_GROUP'] },
  { id:'documents', label:'Documents & drawings', group:'Project delivery', icon:'FolderOpen', tier:'CORE', description:'Version-controlled registers and transmittals', resources:['documents'], defaultTypes:'*' },
  { id:'fieldOps', label:'Field operations', group:'Project delivery', icon:'Camera', tier:'CORE', description:'Daily site logs, photos, meetings and instructions', resources:['dailyLogs','meetings'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','SPECIALTY_TRADE','CONSTRUCTION_MANAGEMENT'] },
  { id:'closeout', label:'Punch lists & closeout', group:'Project delivery', icon:'ListChecks', tier:'STANDARD', description:'Snagging, inspections, permits and handover', resources:['punchLists','permits'], defaultTypes:'*', minSize:1 },
  { id:'procurement', label:'Procurement', group:'Supply chain', icon:'ShoppingCart', tier:'CORE', description:'Requisitions → RFQ → PO → GRN → bill', resources:['requisitions','purchaseOrders','goodsReceipts'], defaultTypes:'*' },
  { id:'vendors', label:'Vendors & subcontractors', group:'Supply chain', icon:'Store', tier:'CORE', description:'Prequalification, compliance docs and scorecards', resources:['vendors','subcontractors'], defaultTypes:'*' },
  { id:'inventory', label:'Inventory & stores', group:'Supply chain', icon:'Package', tier:'STANDARD', description:'Stock on hand, issues, transfers and reorder levels', resources:['inventory','warehouses'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','SPECIALTY_TRADE','EQUIPMENT_RENTAL','MIXED_GROUP'] },
  { id:'equipment', label:'Equipment & fleet', group:'Supply chain', icon:'Truck', tier:'STANDARD', description:'Asset register, utilisation, fuel and maintenance', resources:['equipment','workOrders'], defaultTypes:['GENERAL_CONTRACTOR','CIVIL_INFRASTRUCTURE','INDUSTRIAL_EPC','EQUIPMENT_RENTAL','MIXED_GROUP'] },
  { id:'hr', label:'HR & workforce', group:'People & HR', icon:'UsersRound', tier:'CORE', description:'Employees, departments, crews, documents and org chart', resources:['employees','departments','crews'], defaultTypes:'*' },
  { id:'time', label:'Time & attendance', group:'People & HR', icon:'Clock', tier:'CORE', description:'Timesheets, approval and cost-code allocation', resources:['timesheets'], defaultTypes:'*' },
  { id:'leave', label:'Leave & absence', group:'People & HR', icon:'Palmtree', tier:'STANDARD', description:'Leave types, balances, requests and calendar', resources:['leaveRequests'], defaultTypes:'*', minSize:1 },
  { id:'payroll', label:'Payroll & expenses', group:'People & HR', icon:'Wallet', tier:'STANDARD', description:'Pay runs, payslips, expense claims and reimbursements', resources:['payRuns','expenses'], defaultTypes:'*', minSize:1 },
  { id:'competency', label:'Certifications & training', group:'People & HR', icon:'GraduationCap', tier:'STANDARD', description:'Competency matrix, tickets, inductions and expiry alerts', resources:['certifications','training'], defaultTypes:'*' },
  { id:'safety', label:'HSE / safety', group:'Safety & quality', icon:'ShieldCheck', tier:'CORE', description:'Toolbox talks, JSA, permits-to-work, incidents and CAPA', resources:['toolboxTalks','incidents'], defaultTypes:'*' },
  { id:'quality', label:'Quality management', group:'Safety & quality', icon:'BadgeCheck', tier:'STANDARD', description:'Inspections, NCRs, ITPs and test results', resources:['inspections','ncrs','itps'], defaultTypes:'*', minSize:2 },
  { id:'finance', label:'Finance & accounting', group:'Finance', icon:'Landmark', tier:'CORE', description:'Chart of accounts, journals, AP/AR, payments and period close', resources:['accounts','journals','arInvoices','apBills','payments'], defaultTypes:'*' },
  { id:'wallets', label:'Client wallets', group:'Finance', icon:'CreditCard', tier:'CORE', description:'Prepaid client wallets: admin top-ups, project funding and a reconciled ledger', resources:[], defaultTypes:'*' },
  { id:'billing', label:'Progress billing & retention', group:'Finance', icon:'Receipt', tier:'STANDARD', description:'Payment certificates, retention and client receipts', resources:['paymentApps'], defaultTypes:'*', minSize:2 },
  { id:'jobCosting', label:'Budgets & job costing', group:'Finance', icon:'PieChart', tier:'STANDARD', description:'Budget vs committed vs actual, CVR and earned value', resources:['budgets'], defaultTypes:'*', minSize:2 },
  { id:'reports', label:'Reports & BI', group:'Insights', icon:'BarChart3', tier:'CORE', description:'Canned reports, saved views and exports', resources:[], defaultTypes:'*' },
  { id:'audit', label:'Audit log & notifications', group:'Insights', icon:'Bell', tier:'STANDARD', description:'Immutable activity stream and alerts', resources:[], defaultTypes:'*', minSize:2 },
  { id:'portal', label:'Client portal', group:'Insights', icon:'Globe', tier:'ADVANCED', description:'External client and subcontractor access', resources:[], defaultTypes:['RESIDENTIAL_DEVELOPER','CONSTRUCTION_MANAGEMENT','MIXED_GROUP'], requiresQualifier:'clientPortal' },
  { id:'unitSales', label:'Units, sales & warranty', group:'Insights', icon:'KeyRound', tier:'ADVANCED', description:'Plots, unit sales, reservations and handover', resources:['units'], defaultTypes:['RESIDENTIAL_DEVELOPER'] },
  { id:'rental', label:'Rental & dispatch', group:'Insights', icon:'Truck', tier:'ADVANCED', description:'Rental contracts, dispatch and utilisation billing', resources:['rentalContracts'], defaultTypes:['EQUIPMENT_RENTAL'] },
  { id:'commissioning', label:'Commissioning & turnover', group:'Insights', icon:'Gauge', tier:'ADVANCED', description:'Systems, test packs and O&M handover', resources:['commissioning'], defaultTypes:['INDUSTRIAL_EPC'] },
  { id:'integrations', label:'API & integrations', group:'Administration', icon:'Plug', tier:'ENTERPRISE', description:'API keys, webhooks and connector catalogue', resources:[], defaultTypes:'*', minSize:4 },
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
  { id:'PROJECT_MANAGER', label:'Project Manager', desc:'Projects, delivery, procurement approvals' },
  { id:'SITE_ENGINEER', label:'Site Engineer / Supervisor', desc:'Field logs, RFIs, timesheets, safety' },
  { id:'FINANCE_MANAGER', label:'Finance Manager', desc:'Finance, billing, costing and reports' },
  { id:'ACCOUNTANT', label:'Accountant', desc:'AP/AR, journals and expenses' },
  { id:'HR_MANAGER', label:'HR Manager', desc:'Employees, leave, payroll, training' },
  { id:'PROCUREMENT', label:'Procurement Officer', desc:'Vendors, requisitions, POs, inventory' },
  { id:'SAFETY_OFFICER', label:'HSE Officer', desc:'Safety, incidents, inspections, quality' },
  { id:'PLANT_MANAGER', label:'Plant Manager', desc:'Equipment, fleet and maintenance' },
  { id:'ESTIMATOR', label:'Estimator / QS', desc:'Leads, estimates, bids and contracts' },
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
