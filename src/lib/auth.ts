import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import prisma from './db';
import { resolveWorkspace, type WorkspaceConfig } from './catalog';

export const SESSION_COOKIE = 'buildops_session';
export const SESSION_DAYS = 30;

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export type AuthCtx = {
  userId: string; name: string; email: string; role: string; avatarColor: string;
  orgId: string; orgName: string; orgSlug: string; onboarded: boolean;
  org: any; config: WorkspaceConfig; entityId: string|null;
  memberships: {orgId:string;orgSlug:string;orgName:string;role:string;entityId:string|null}[];
};

export function parseOrgConfig(org: any): WorkspaceConfig {
  try {
    const c = JSON.parse(org.config || '{}');
    if (Array.isArray(c.modules) && c.modules.length) return c as WorkspaceConfig;
  } catch {}
  return resolveWorkspace({ companyType: org.companyType || 'GENERAL_CONTRACTOR', size: org.size || 'SMALL', qualifiers: [] });
}

export async function getAuth(): Promise<AuthCtx | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { memberships: { include: { organization: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const user = session.user;
  const memberships = user.memberships.map(m => ({ orgId:m.organizationId, orgSlug:m.organization.slug, orgName:m.organization.name, role:m.role, entityId:m.entityId }));
  const primary = memberships[0];
  if (!primary) return null;
  const org = await prisma.organization.findUnique({ where: { id: primary.orgId } });
  if (!org) return null;
  return {
    userId:user.id, name:user.name, email:user.email, role:primary.role, avatarColor:user.avatarColor,
    orgId:org.id, orgName:org.name, orgSlug:org.slug, onboarded:org.onboarded, org,
    config:parseOrgConfig(org), entityId:primary.entityId, memberships,
  };
}

export async function requireAuth(): Promise<AuthCtx> {
  const a = await getAuth(); if (!a) redirect('/login'); return a;
}

export async function requireOrg(slug: string): Promise<AuthCtx> {
  const a = await requireAuth();
  const m = a.memberships.find(x => x.orgSlug === slug);
  if (!m) redirect(`/${a.orgSlug}/dashboard`);
  if (m.orgId !== a.orgId) {
    const org = await prisma.organization.findUnique({ where:{id:m.orgId} });
    if (org) Object.assign(a, { orgId:org.id, orgName:org.name, orgSlug:org.slug, role:m.role, entityId:m.entityId, onboarded:org.onboarded, org, config:parseOrgConfig(org) });
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
      const org = await prisma.organization.findUnique({ where:{id:m.orgId} });
      if (!org) return null;
      Object.assign(a, { orgId:org.id, orgName:org.name, orgSlug:org.slug, role:m.role, entityId:m.entityId, onboarded:org.onboarded, org, config:parseOrgConfig(org) });
    }
  }
  return a;
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly:true, sameSite:'lax', path:'/', expires:expiresAt, secure:false });
  return token;
}
export async function destroySession() {
  const c = await cookies(); const token = c.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where:{token} });
  c.delete(SESSION_COOKIE);
}
export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40) || 'workspace';
}
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name); let s = base, i = 1;
  while (await prisma.organization.findUnique({ where:{slug:s} })) s = `${base}-${++i}`;
  return s;
}
