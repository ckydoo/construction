import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { apiAuth } from '@/lib/auth';
import { resolveWorkspace, MODULES, STARTER_MODULE_IDS, ROLES, type WorkspaceConfig } from '@/lib/catalog';
import { getResource } from '@/lib/resources';
import { createRecord } from '@/lib/records';
import { readGuard, writeGuard, capabilityGuard } from '@/lib/guard';
import { seedDemo } from '@/lib/seed-service';
import bcrypt from 'bcryptjs';

const adminOnly = (role: string) => ['OWNER', 'ADMIN'].includes(role);

export async function PATCH(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json();

  // Any signed-in user may clear their own notification badge.
  if (b.action === 'markRead') {
    if (b.id) await prisma.notification.updateMany({ where: { id: b.id, organizationId: a.orgId }, data: { read: true } });
    else await prisma.notification.updateMany({ where: { organizationId: a.orgId }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  if (!adminOnly(a.role)) return NextResponse.json({ error: 'Only owners and admins can change settings' }, { status: 403 });

  if (b.action === 'updateOrg') {
    const orgRow = await prisma.organization.update({ where: { id: a.orgId }, data: {
      name: String(b.name || a.orgName), legalName: b.legalName ?? undefined, regNumber: b.regNumber ?? undefined,
      country: b.country ?? undefined, baseCurrency: b.baseCurrency ?? undefined, headcount: b.headcount ? Number(b.headcount) : undefined,
    } });
    return NextResponse.json({ ok: true, org: { name: orgRow.name } });
  }
  if (b.action === 'toggleModule') {
    const cfg: WorkspaceConfig = { ...a.config };
    const mod = MODULES.find(m => m.id === b.moduleId); if (!mod) return NextResponse.json({ error: 'Unknown module' }, { status: 404 });
    const enabled = new Set(cfg.modules);
    if (b.enabled) enabled.add(b.moduleId); else enabled.delete(b.moduleId);
    cfg.modules = [...enabled];
    cfg.resources = [...new Set(MODULES.filter(m => enabled.has(m.id)).flatMap(m => m.resources))];
    await prisma.organization.update({ where: { id: a.orgId }, data: { config: JSON.stringify(cfg) } });
    return NextResponse.json({ ok: true, config: cfg });
  }
  if (b.action === 'applyPack') {
    const cfg: WorkspaceConfig = { ...a.config };
    const ids = b.pack === 'essentials' ? STARTER_MODULE_IDS : MODULES.map(m => m.id);
    cfg.modules = [...ids];
    cfg.resources = [...new Set(MODULES.filter(m => ids.includes(m.id)).flatMap(m => m.resources))];
    await prisma.organization.update({ where: { id: a.orgId }, data: { config: JSON.stringify(cfg) } });
    return NextResponse.json({ ok: true, config: cfg, message: `Switched to ${b.pack === 'essentials' ? `the ${ids.length} essentials` : 'all ' + ids.length + ' modules'}.` });
  }
  if (b.action === 'setRole' || b.action === 'setScope' || b.action === 'removeUser') {
    const g = capabilityGuard(a.role, 'users.manage'); if (g) return g;
    const userId = String(b.userId || '');
    const target = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: a.orgId } } });
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (b.action === 'setRole') {
      const role = String(b.role || '');
      if (!ROLES.some(r => r.id === role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
      if (target.userId === a.userId) return NextResponse.json({ error: 'You cannot change your own role' }, { status: 409 });
      if (role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({ error: 'Only an owner can grant the owner role' }, { status: 403 });
      if (target.role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({ error: 'Only an owner can change another owner' }, { status: 403 });
      if (target.role === 'OWNER' && role !== 'OWNER') {
        const owners = await prisma.membership.count({ where: { organizationId: a.orgId, role: 'OWNER' } });
        if (owners <= 1) return NextResponse.json({ error: 'The workspace must keep at least one owner' }, { status: 409 });
      }
      await prisma.membership.update({ where: { id: target.id }, data: { role, ...(role.endsWith('_EXTERNAL') ? {} : { entityId: null }) } });
      await prisma.auditLog.create({ data: { organizationId: a.orgId, userId: a.userId, actor: a.name, action: 'ROLE_CHANGE', resource: 'users', detail: `Changed ${target.userId.slice(-8)} to ${role.replace(/_/g, ' ').toLowerCase()}` } });
      return NextResponse.json({ ok: true, message: `Role updated to ${role.replace(/_/g, ' ').toLowerCase()}` });
    }
    if (b.action === 'setScope') {
      const entityId = b.entityId ? String(b.entityId) : null;
      if (entityId) {
        const rec = await prisma.record.findFirst({ where: { id: entityId, organizationId: a.orgId, resource: 'clients', deletedAt: null }, select: { id: true } });
        if (!rec) return NextResponse.json({ error: 'Choose a client that exists in this workspace' }, { status: 400 });
      } else if (target.role === 'CLIENT_EXTERNAL') {
        return NextResponse.json({ error: 'A client portal user must be linked to a client' }, { status: 400 });
      }
      await prisma.membership.update({ where: { id: target.id }, data: { entityId } });
      return NextResponse.json({ ok: true, message: entityId ? 'Portal access scoped to a client' : 'Portal scope cleared' });
    }
    if (target.userId === a.userId) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 409 });
    if (target.role === 'OWNER') return NextResponse.json({ error: 'Owners cannot be removed' }, { status: 409 });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.membership.delete({ where: { id: target.id } });
    await prisma.user.deleteMany({ where: { id: userId, memberships: { none: {} } } });
    return NextResponse.json({ ok: true, message: 'Team member removed' });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminOnly(a.role)) return NextResponse.json({ error: 'Only owners and admins can do this' }, { status: 403 });
  const b = await req.json();
  if (b.action === 'invite') {
    const email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return NextResponse.json({ error: 'Enter a name and valid email' }, { status: 400 });
    const role = String(b.role || 'VIEWER');
    if (!ROLES.some(r => r.id === role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
    if (role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({ error: 'Only an owner can invite another owner' }, { status: 403 });
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) user = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash('Welcome@123', 10), avatarColor: '#64748b' } });
    if (await prisma.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: a.orgId } } }))
      return NextResponse.json({ error: 'That user is already a member' }, { status: 409 });
    const entityId = role.endsWith('_EXTERNAL') ? (b.entityId ? String(b.entityId) : null) : null;
    if (entityId) {
      const rec = await prisma.record.findFirst({ where: { id: entityId, organizationId: a.orgId, resource: 'clients', deletedAt: null }, select: { id: true } });
      if (!rec) return NextResponse.json({ error: 'Unknown client scope' }, { status: 400 });
    }
    await prisma.membership.create({ data: { userId: user.id, organizationId: a.orgId, role, entityId } });
    await prisma.invitation.create({ data: { email, role, organizationId: a.orgId, token: Math.random().toString(36).slice(2) + Date.now().toString(36), acceptedAt: new Date() } });
    return NextResponse.json({ ok: true, message: `${name} added as ${role.replace(/_/g, ' ').toLowerCase()}. Temporary password: Welcome@123` });
  }
  if (b.action === 'seedDemo') {
    const r = await seedDemo(prisma, a.orgId);
    return NextResponse.json({ ok: true, message: `Loaded ${r.records} demo records` });
  }
  if (b.action === 'clearData') {
    await prisma.record.deleteMany({ where: { organizationId: a.orgId } });
    await prisma.sequence.deleteMany({ where: { organizationId: a.orgId } });
    await prisma.walletTransaction.deleteMany({ where: { organizationId: a.orgId } });
    await prisma.wallet.deleteMany({ where: { organizationId: a.orgId } });
    return NextResponse.json({ ok: true, message: 'All business records cleared' });
  }
  if (b.action === 'importCsv') {
    const resource = String(b.resource);
    const def = getResource(resource); if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });
    const g = writeGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'records.create'); if (g) return g;
    const rows: Record<string, any>[] = b.rows || []; let ok = 0, failed = 0;
    for (const row of rows.slice(0, 200)) {
      const r = await createRecord(a.orgId, a.userId, a.name, def, row);
      if (r.ok) ok++; else failed++;
    }
    return NextResponse.json({ ok: true, message: `Imported ${ok} records${failed ? `, ${failed} skipped (validation)` : ''}` });
  }
  if (b.action === 'reconfigure') {
    const cfg = resolveWorkspace({ companyType: String(b.companyType || a.org.companyType), size: String(b.size || a.org.size), qualifiers: b.qualifiers || [], addons: b.addons || [] });
    await prisma.organization.update({ where: { id: a.orgId }, data: { companyType: b.companyType, size: b.size, config: JSON.stringify(cfg) } });
    return NextResponse.json({ ok: true, config: cfg });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
