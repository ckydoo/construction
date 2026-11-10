/* MYLA subscription catalogue. One price book, everywhere: USD 9/29/99 per
 * organisation per month. Prices are exclusive of VAT/tax; the existing FX
 * settings may display a ZWG equivalent but never change the settled amount. */
import { MODULES } from './catalog';
import { RESOURCES } from './resources';

export type PlanId = 'STARTER' | 'PRO' | 'ENTERPRISE';
export type BillingStatus =
  | 'trial_required' | 'comped' | 'trialing' | 'active' | 'past_due' | 'grace' | 'locked'
  | 'cancelled' | 'switch_pending';

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;
export const BILLING_CURRENCY = 'USD';

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
    id: 'STARTER', name: 'Starter', priceUsd: 9,
    maxUsers: 5, maxProjects: 10, modules: STARTER_MODULES,
    features: ['Essential construction sections', 'Up to 5 users', 'Up to 10 active projects', 'Standard support'],
    support: 'Standard support',
  },
  {
    id: 'PRO', name: 'Pro', priceUsd: 29,
    maxUsers: 25, maxProjects: null, modules: '*',
    features: ['All 34 sections and 49 resources', 'Up to 25 users', 'Unlimited active projects',
      'Tenant-branded financial PDFs', 'Advanced roles and reporting', 'Document library', 'Standard support'],
    support: 'Standard support',
  },
  {
    id: 'ENTERPRISE', name: 'Enterprise', priceUsd: 99,
    maxUsers: null, maxProjects: null, modules: '*',
    features: ['Everything in Pro', 'Unlimited users and projects', 'Guided onboarding',
      'Priority support', 'Custom branding', 'Dedicated account assistance'],
    support: 'Priority support', contactSales: true,
  },
];

export const PLAN_MAP: Record<PlanId, PlanDef> = Object.fromEntries(PLANS.map(p => [p.id, p])) as Record<PlanId, PlanDef>;
export const PLAN_IDS = PLANS.map(p => p.id);
export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && (PLAN_IDS as string[]).includes(v);

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
  const min = (a?: number | null, b?: number) => a == null ? b : b == null ? a : Math.min(a, b);
  return {
    users: min(p.maxUsers, configured.users) ?? 9999,
    projects: min(p.maxProjects, configured.projects) ?? 9999,
    storageMb: configured.storageMb ?? 1024,
  };
}

/** Price in minor units for Stripe and two-decimal fixed notation for Paynow. */
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
