import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase, supabaseAdmin, hasServiceKey } from '@/lib/supabase';
import { resolveWorkspace, MODULES, STARTER_MODULE_IDS, ROLES, type WorkspaceConfig } from '@/lib/catalog';
import { getResource } from '@/lib/resources';
import { createRecord, logActivity } from '@/lib/records';
import { writeGuard, capabilityGuard } from '@/lib/guard';
import { seedDemo, clearDemo } from '@/lib/seed-service';
import { fetchAll } from '@/lib/fetch';

const adminOnly = (role: string) => ['OWNER', 'ADMIN'].includes(role);

export async function PATCH(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await req.json();
  const sb = await supabase();

  // Any signed-in user may clear their own notification badge.
  if (b.action === 'markRead') {
    let q = sb.from('notifications').update({ read: true }).eq('organization_id', a.orgId);
    if (b.id) q = q.eq('id', b.id);
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  }
  if (!adminOnly(a.role)) return NextResponse.json({ error: 'Only owners and admins can change settings' }, { status: 403 });

  if (b.action === 'updateOrg') {
    const { data, error } = await sb.from('organizations').update({
      name: String(b.name || a.orgName),
      ...(b.legalName !== undefined ? { legal_name: b.legalName } : {}),
      ...(b.regNumber !== undefined ? { reg_number: b.regNumber } : {}),
      ...(b.country !== undefined ? { country: b.country } : {}),
      ...(b.baseCurrency !== undefined ? { base_currency: b.baseCurrency } : {}),
      ...(b.headcount !== undefined ? { headcount: Number(b.headcount) || null } : {}),
    }).eq('id', a.orgId).select('name').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true, org: { name: data.name } });
  }
  if (b.action === 'toggleModule') {
    const cfg: WorkspaceConfig = { ...a.config };
    const mod = MODULES.find(m => m.id === b.moduleId); if (!mod) return NextResponse.json({ error: 'Unknown module' }, { status: 404 });
    const enabled = new Set(cfg.modules);
    if (b.enabled) enabled.add(b.moduleId); else enabled.delete(b.moduleId);
    cfg.modules = [...enabled];
    cfg.resources = [...new Set(MODULES.filter(m => enabled.has(m.id)).flatMap(m => m.resources))];
    const { error } = await sb.from('organizations').update({ config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true, config: cfg });
  }
  if (b.action === 'applyPack') {
    const cfg: WorkspaceConfig = { ...a.config };
    const ids = b.pack === 'essentials' ? STARTER_MODULE_IDS : MODULES.map(m => m.id);
    cfg.modules = [...ids];
    cfg.resources = [...new Set(MODULES.filter(m => ids.includes(m.id)).flatMap(m => m.resources))];
    const { error } = await sb.from('organizations').update({ config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true, config: cfg, message: `Switched to ${b.pack === 'essentials' ? `the ${ids.length} essentials` : 'all ' + ids.length + ' modules'}.` });
  }
  if (b.action === 'setRole' || b.action === 'setScope' || b.action === 'removeUser') {
    const g = capabilityGuard(a.role, 'users.manage'); if (g) return g;
    const userId = String(b.userId || '');
    const { data: target } = await sb.from('memberships').select('*')
      .eq('user_id', userId).eq('organization_id', a.orgId).maybeSingle();
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    if (b.action === 'setRole') {
      const role = String(b.role || '');
      if (!ROLES.some(r => r.id === role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
      if (target.user_id === a.userId) return NextResponse.json({ error: 'You cannot change your own role' }, { status: 409 });
      if (role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({ error: 'Only an owner can grant the owner role' }, { status: 403 });
      if (target.role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({ error: 'Only an owner can change another owner' }, { status: 403 });
      if (target.role === 'OWNER' && role !== 'OWNER') {
        const owners = await fetchAll('memberships', q => q.eq('organization_id', a.orgId).eq('role', 'OWNER'), 'id');
        if (owners.length <= 1) return NextResponse.json({ error: 'The workspace must keep at least one owner' }, { status: 409 });
      }
      const { error } = await sb.from('memberships').update({
        role, ...(role.endsWith('_EXTERNAL') ? {} : { entity_id: null }),
      }).eq('id', target.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
      await logActivity(a.orgId, a.userId, a.name, 'ROLE_CHANGE', 'users',
        `Changed ${target.user_id.slice(-8)} to ${role.replace(/_/g, ' ').toLowerCase()}`);
      return NextResponse.json({ ok: true, message: `Role updated to ${role.replace(/_/g, ' ').toLowerCase()}` });
    }
    if (b.action === 'setScope') {
      const entityId = b.entityId ? String(b.entityId) : null;
      if (entityId) {
        const { data: rec } = await sb.from('records').select('id')
          .eq('id', entityId).eq('organization_id', a.orgId).eq('resource', 'clients')
          .is('deleted_at', null).maybeSingle();
        if (!rec) return NextResponse.json({ error: 'Choose a client that exists in this workspace' }, { status: 400 });
      } else if (target.role === 'CLIENT_EXTERNAL') {
        return NextResponse.json({ error: 'A client portal user must be linked to a client' }, { status: 400 });
      }
      const { error } = await sb.from('memberships').update({ entity_id: entityId }).eq('id', target.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
      return NextResponse.json({ ok: true, message: entityId ? 'Portal access scoped to a client' : 'Portal scope cleared' });
    }
    if (target.user_id === a.userId) return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 409 });
    if (target.role === 'OWNER') return NextResponse.json({ error: 'Owners cannot be removed' }, { status: 409 });
    const { error } = await sb.from('memberships').delete().eq('id', target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    // If this was their last workspace, remove the Auth account as well.
    if (hasServiceKey()) {
      try {
        const admin = supabaseAdmin();
        const { data: rest } = await admin.from('memberships').select('id').eq('user_id', userId).limit(1);
        if (!rest?.length) await admin.auth.admin.deleteUser(userId);
      } catch { /* membership removal is the important part */ }
    }
    return NextResponse.json({ ok: true, message: 'Team member removed' });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!adminOnly(a.role)) return NextResponse.json({ error: 'Only owners and admins can do this' }, { status: 403 });
  const b = await req.json();
  const sb = await supabase();

  if (b.action === 'invite') {
    const email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return NextResponse.json({ error: 'Enter a name and valid email' }, { status: 400 });
    const role = String(b.role || 'VIEWER');
    if (!ROLES.some(r => r.id === role)) return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
    if (role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({ error: 'Only an owner can invite another owner' }, { status: 403 });
    if (!hasServiceKey()) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required to create team accounts.' }, { status: 503 });
    const admin = supabaseAdmin();
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    let userId = profile?.id as string | undefined;
    if (!userId) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: 'Welcome@123', email_confirm: true,
        user_metadata: { name, avatar_color: '#64748b' },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      userId = created.user.id;
    }
    const { data: exists } = await admin.from('memberships').select('id')
      .eq('user_id', userId).eq('organization_id', a.orgId).maybeSingle();
    if (exists) return NextResponse.json({ error: 'That user is already a member' }, { status: 409 });
    const entityId = role.endsWith('_EXTERNAL') ? (b.entityId ? String(b.entityId) : null) : null;
    if (entityId) {
      const { data: rec } = await sb.from('records').select('id')
        .eq('id', entityId).eq('organization_id', a.orgId).eq('resource', 'clients').is('deleted_at', null).maybeSingle();
      if (!rec) return NextResponse.json({ error: 'Unknown client scope' }, { status: 400 });
    }
    const { error: mErr } = await admin.from('memberships').insert({
      user_id: userId, organization_id: a.orgId, role, entity_id: entityId,
    });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
    await admin.from('invitations').insert({
      email, role, organization_id: a.orgId,
      token: Math.random().toString(36).slice(2) + Date.now().toString(36), accepted_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, message: `${name} added as ${role.replace(/_/g, ' ').toLowerCase()}. Temporary password: Welcome@123` });
  }
  if (b.action === 'seedDemo') {
    if (!hasServiceKey()) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required to load demo data.' }, { status: 503 });
    const r = await seedDemo(a.orgId, a.userId, a.name);
    return NextResponse.json({ ok: true, message: `Loaded ${r.records} demo records, ${r.wallets} wallets and ${r.pdfs} sample PDFs` });
  }
  if (b.action === 'clearData') {
    if (!hasServiceKey()) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required to clear business data.' }, { status: 503 });
    await clearDemo(a.orgId);
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
    const cfg = resolveWorkspace({
      companyType: String(b.companyType || a.org.companyType), size: String(b.size || a.org.size),
      qualifiers: b.qualifiers || [], addons: b.addons || [],
    });
    const { error } = await sb.from('organizations').update({
      company_type: b.companyType, size: b.size, config: cfg,
    }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true, config: cfg });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
