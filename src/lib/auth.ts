/* Authentication and workspace resolution.
 * Supabase Auth owns passwords, JWTs and sessions (no custom Session table).
 * Tenancy, roles and portal scoping are read from Postgres and re-checked by
 * every RLS policy. Nothing here grants access — it only describes the caller. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabase, supabaseAdmin, hasSupabaseConfig } from './supabase';
import { resolveWorkspace, type WorkspaceConfig } from './catalog';

export type Membership = { orgId: string; orgSlug: string; orgName: string; role: string; entityId: string | null };
export type AuthCtx = {
  userId: string; name: string; email: string; role: string; avatarColor: string;
  orgId: string; orgName: string; orgSlug: string; onboarded: boolean;
  org: any; config: WorkspaceConfig; entityId: string | null;
  memberships: Membership[];
};

type OrgRow = Record<string, any>;

function orgView(o: OrgRow): OrgRow {
  return {
    id: o.id, name: o.name, slug: o.slug,
    legalName: o.legal_name ?? null, regNumber: o.reg_number ?? null,
    country: o.country, baseCurrency: o.base_currency, localePack: o.locale_pack,
    companyType: o.company_type ?? null, size: o.size ?? null,
    headcount: o.headcount ?? null, revenueBand: o.revenue_band ?? null,
    onboarded: !!o.onboarded, config: o.config || {},
    createdById: o.created_by_id ?? null, createdAt: o.created_at, updatedAt: o.updated_at,
  };
}

export function parseOrgConfig(org: any): WorkspaceConfig {
  let raw: any = org?.config ?? {};
  if (typeof raw === 'string') { try { raw = JSON.parse(raw || '{}'); } catch { raw = {}; } }
  if (raw && Array.isArray(raw.modules) && raw.modules.length) return raw as WorkspaceConfig;
  return resolveWorkspace({
    companyType: org?.companyType || 'GENERAL_CONTRACTOR',
    size: org?.size || 'SMALL',
    qualifiers: [],
  });
}

export async function getAuth(): Promise<AuthCtx | null> {
  // Always touch cookies, even when keys are missing: this keeps every page
  // that resolves auth dynamic (never statically prerendered as "logged out").
  await cookies();
  if (!hasSupabaseConfig()) return null;
  const sb = await supabase();
  const { data: authData, error } = await sb.auth.getUser();
  if (error || !authData?.user) return null;
  const u = authData.user;

  const { data: profile } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
  const { data: rows } = await sb
    .from('memberships')
    .select('organization_id, role, entity_id, organizations(*)')
    .eq('user_id', u.id);
  if (!rows?.length) return null;

  const memberships: Membership[] = rows.map((m: any) => ({
    orgId: m.organization_id,
    orgSlug: m.organizations?.slug || '',
    orgName: m.organizations?.name || '',
    role: m.role,
    entityId: m.entity_id ?? null,
  }));
  const primary = memberships[0];
  const org = orgView(rows[0].organizations || {});
  return {
    userId: u.id,
    name: profile?.name || String(u.user_metadata?.name || u.email || 'User').split('@')[0],
    email: profile?.email || u.email || '',
    role: primary.role,
    avatarColor: profile?.avatar_color || '#d97706',
    orgId: org.id, orgName: org.name, orgSlug: org.slug, onboarded: org.onboarded,
    org, config: parseOrgConfig(org), entityId: primary.entityId, memberships,
  };
}

export async function requireAuth(): Promise<AuthCtx> {
  const a = await getAuth(); if (!a) redirect('/login'); return a;
}

function switchOrg(a: AuthCtx, m: Membership, orgRaw: any): void {
  if (!m || !orgRaw || m.orgId === a.orgId) return;
  const org = orgView(orgRaw);
  Object.assign(a, {
    orgId: org.id, orgName: org.name, orgSlug: org.slug, role: m.role,
    entityId: m.entityId, onboarded: org.onboarded, org, config: parseOrgConfig(org),
  });
}

async function membershipRows(userId: string): Promise<any[]> {
  const sb = await supabase();
  const { data } = await sb.from('memberships')
    .select('organization_id, role, entity_id, organizations(*)').eq('user_id', userId);
  return data || [];
}

export async function requireOrg(slug: string): Promise<AuthCtx> {
  const a = await requireAuth();
  const m = a.memberships.find(x => x.orgSlug === slug);
  if (!m) redirect(`/${a.orgSlug}/dashboard`);
  if (m.orgId !== a.orgId) {
    const row = (await membershipRows(a.userId)).find(r => r.organization_id === m.orgId);
    if (row) switchOrg(a, m, row.organizations);
  }
  if (!a.onboarded) redirect('/onboarding');
  return a;
}

/** For API route handlers: returns null instead of redirecting. */
export async function apiAuth(slug?: string): Promise<AuthCtx | null> {
  const a = await getAuth(); if (!a) return null;
  if (slug) {
    const m = a.memberships.find(x => x.orgSlug === slug);
    if (!m) return null;
    if (m.orgId !== a.orgId) {
      const row = (await membershipRows(a.userId)).find(r => r.organization_id === m.orgId);
      if (!row) return null;
      switchOrg(a, m, row.organizations);
    }
  }
  return a;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  const admin = supabaseAdmin();
  const { data } = await admin.from('organizations').select('slug').like('slug', `${base}%`);
  const taken = new Set((data || []).map(r => r.slug));
  if (!taken.has(base)) return base;
  let i = 2; while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Establish a Supabase Auth session and write its cookies to the response. */
export async function signIn(email: string, password: string): Promise<{ userId: string } | null> {
  const sb = await supabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

export async function signOut(): Promise<void> {
  const sb = await supabase();
  await sb.auth.signOut();
}
