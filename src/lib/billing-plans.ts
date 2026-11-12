/* MYLA subscription catalogue. One price book, everywhere: USD 6/14/26 per
 * organisation per month. Prices are exclusive of VAT/tax; the existing FX
 * settings may display a ZWG equivalent but never change the settled amount. */
import { MODULES } from './catalog';
import { RESOURCES } from './resources';

export type PlanId = 'STARTER' | 'PRO' | 'ENTERPRISE';
export type BillingStatus =
  | 'trial_required' | 'comped' | 'trialing' | 'active' | 'past_due' | 'grace' | 'locked'
  | 'cancelled' | 'switch_pending';

export const TRIAL_DAYS = 7;
export const GRACE_DAYS = 3;
export const BILLING_CURRENCY = 'USD';
export const PRICE_BOOK_VERSION = 'USD_6_14_26_V1';
export const PLAN_CHANGE_POLICY = 'upgrade_immediate_prorated_downgrade_period_end';

export type PlanDef = {
  id: PlanId;
  name: string;
  priceUsd: number;
  maxUsers: number | null;
  maxProjects: number | null;
  modules: string[] | '*';
  features: string[];
  support: string;
  contactSales?: boolean;
};

const ALL_MODULE_IDS = MODULES.map(m => m.id);

export const STARTER_MODULE_IDS: readonly string[] = [
  'dashboard','company','crm','pipeline','estimating','projects','contracts',
  'documents','finance','wallets','hr','time','reports',
];
const STARTER_MODULES = STARTER_MODULE_IDS.filter(id => ALL_MODULE_IDS.includes(id));
const STARTER_RESOURCE_IDS = RESOURCES
  .filter(r => r.module && STARTER_MODULES.includes(r.module))
  .map(r => r.id);

export const PLANS: readonly PlanDef[] = [
  {
    id: 'STARTER', name: 'Starter', priceUsd: 6,
    maxUsers: 6, maxProjects: 15, modules: STARTER_MODULES,
    features: ['Essential construction sections', 'Up to 6 users', 'Up to 15 active projects', 'Standard support'],
    support: 'Standard support',
  },
  {
    id: 'PRO', name: 'Pro', priceUsd: 14,
    maxUsers: 25, maxProjects: 35, modules: '*',
    features: ['All 34 sections and 49 resources', 'Up to 25 users', 'Up to 35 active projects',
      'Tenant-branded financial PDFs', 'Advanced roles and reporting', 'Document library', 'Standard support'],
    support: 'Standard support',
  },
  {
    id: 'ENTERPRISE', name: 'Enterprise', priceUsd: 26,
    maxUsers: null, maxProjects: null, modules: '*',
    features: ['Everything in Pro', 'Unlimited users and projects', 'Guided onboarding',
      'Priority support', 'Custom branding', 'Dedicated account assistance'],
    support: 'Priority support', contactSales: true,
  },
];

export const PLAN_MAP: Record<PlanId, PlanDef> = Object.fromEntries(PLANS.map(p => [p.id, p])) as Record<PlanId, PlanDef>;
export const PLAN_IDS = PLANS.map(p => p.id);
export const PLAN_RANK: Record<PlanId, number> = { STARTER: 1, PRO: 2, ENTERPRISE: 3 };
export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && (PLAN_IDS as string[]).includes(v);

export function planRank(plan: PlanId): number { return PLAN_RANK[plan] || 1; }
export function planChangeDirection(from: PlanId, to: PlanId): 'same' | 'upgrade' | 'downgrade' {
  const delta = planRank(to) - planRank(from);
  return delta > 0 ? 'upgrade' : delta < 0 ? 'downgrade' : 'same';
}
/** Prorated upgrade difference for the unused portion of a paid period. */
export function prorationForUpgrade(
  from: PlanId,
  to: PlanId,
  periodStart: string | Date | null | undefined,
  periodEnd: string | Date | null | undefined,
  now: Date | string = new Date(),
): number {
  const difference = PLAN_MAP[to].priceUsd - PLAN_MAP[from].priceUsd;
  if (difference <= 0 || !periodStart || !periodEnd) return 0;
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  const at = new Date(now).getTime();
  const total = end - start;
  if (!Number.isFinite(total) || total <= 0) return 0;
  const remaining = Math.max(0, Math.min(total, end - at));
  const fraction = remaining / total;
  return Math.round((difference * fraction + Number.EPSILON) * 100) / 100;
}

/** Resources reachable on Starter. Pro/Enterprise expose the full catalogue. */
export function planResourceIds(plan: PlanId): string[] {
  return plan === 'STARTER' ? [...STARTER_RESOURCE_IDS] : RESOURCES.map(r => r.id);
}
export function planModuleIds(plan: PlanId): string[] {
  const p = PLAN_MAP[plan];
  return p.modules === '*' ? [...ALL_MODULE_IDS] : [...p.modules];
}
/** Union of rows a billing plan may expose; existing company/workspace config is
 * then intersected with this list at read time (never silently widened). */
export function entitledModules(plan: PlanId, configured: string[]): string[] {
  const allowed = planModuleIds(plan);
  return configured.filter(id => allowed.includes(id));
}
export function entitledResources(plan: PlanId, configured: string[]): string[] {
  const allowed = new Set(planResourceIds(plan));
  return configured.filter(id => allowed.has(id));
}
export function entitledLimits(plan: PlanId, configured: { users?: number; projects?: number; storageMb?: number }) {
  const p = PLAN_MAP[plan];
  // Paid tier limits govern seats and projects. Onboarding size defaults are
  // not purchased plan limits and must not reduce Starter/Pro entitlements.
  // Preserve existing configured behaviour for uncapped Enterprise.
  return {
    users: p.maxUsers ?? configured.users ?? 9999,
    projects: p.maxProjects ?? configured.projects ?? 9999,
    storageMb: configured.storageMb ?? 1024,
  };
}

/** Price in minor units and two-decimal fixed notation for DPO Pay / Paynow. */
export function planAmountMinor(plan: PlanId): number { return Math.round(PLAN_MAP[plan].priceUsd * 100); }
export function planAmountFixed(plan: PlanId): string { return PLAN_MAP[plan].priceUsd.toFixed(2); }
export function planLabel(plan: PlanId): string { return PLAN_MAP[plan].name; }

/** Status -> app access. Billing itself is always available to Owner/Admin.
 * `past_due`, `grace` and `switch_pending` are deliberately READ-ONLY: data is
 * preserved, nothing is deleted, and the workspace unlocks on payment. */
export function billingAllowsAccess(status: string | null | undefined): boolean {
  return ['comped','trialing','active','past_due','grace','switch_pending'].includes(String(status || ''));
}
export function billingAllowsWrite(status: string | null | undefined): boolean {
  return ['comped','trialing','active'].includes(String(status || ''));
}
export function billingNeedsPayment(status: string | null | undefined): boolean {
  return !billingAllowsAccess(status);
}
export function billingIsReadOnly(status: string | null | undefined): boolean {
  return billingAllowsAccess(status) && !billingAllowsWrite(status);
}
