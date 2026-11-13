import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { findAccountByEmail } from '@/lib/auth-email';
import { newInviteToken, sendWorkspaceInvite } from '@/lib/workspace-invites';
import { supabase, supabaseAdmin, hasServiceKey } from '@/lib/supabase';
import { resolveWorkspace, MODULES, STARTER_MODULE_IDS, ROLES, type WorkspaceConfig } from '@/lib/catalog';
import { CURRENCY_CODES, normaliseCurrencyConfig } from '@/lib/currency';
import { normaliseCompanyProfile } from '@/lib/company';
import { getResource } from '@/lib/resources';
import { createRecord, logActivity } from '@/lib/records';
import { writeGuard, capabilityGuard, billingGuard } from '@/lib/guard';
import { userLimitMessage } from '@/lib/billing-limits';
import { planModuleIds } from '@/lib/billing-plans';
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
    let q = sb.from('notifications').update({ read: true }).eq('organization_id', a.orgId).eq('user_id', a.userId);
    if (b.id) q = q.eq('id', b.id);
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  }
  if (!adminOnly(a.role)) return NextResponse.json({ error: 'Only owners and admins can change settings' }, { status: 403 });
  const bg = billingGuard(a, { write: true }); if (bg) return bg;

  if (b.action === 'updateOrg') {
    const wantsCurrency = b.baseCurrency !== undefined;
    const nextBase = wantsCurrency ? String(b.baseCurrency || 'USD').toUpperCase() : String(a.org.baseCurrency || 'USD');
    if (wantsCurrency && !(CURRENCY_CODES as readonly string[]).includes(nextBase)) {
      return NextResponse.json({ error: 'Choose a supported currency' }, { status: 400 });
    }
    // General and Currencies tabs both expose the base currency. Re-express the
    // saved rates when it changes so 1 base = N currency stays true.
    const currency = wantsCurrency ? normaliseCurrencyConfig(a.config.currency, nextBase) : null;
    const cfg: WorkspaceConfig | null = currency ? { ...a.config, ...(a.org.config || {}), currency } : null;
    const { data, error } = await sb.from('organizations').update({
      name: String(b.name || a.orgName),
      ...(b.legalName !== undefined ? { legal_name: b.legalName } : {}),
      ...(b.regNumber !== undefined ? { reg_number: b.regNumber } : {}),
      ...(b.country !== undefined ? { country: b.country } : {}),
      ...(wantsCurrency ? { base_currency: nextBase, config: cfg } : {}),
      ...(b.headcount !== undefined ? { headcount: Number(b.headcount) || null } : {}),
    }).eq('id', a.orgId).select('name').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    if (wantsCurrency && nextBase !== String(a.org.baseCurrency || 'USD')) {
      await logActivity(a.orgId, a.userId, a.name, 'UPDATE', 'settings', `Set reporting currency to ${nextBase}`);
    }
    return NextResponse.json({ ok: true, org: { name: data.name }, ...(currency ? { currency } : {}) });
  }
  if (b.action === 'updateTax') {
    if (typeof b.enabled !== 'boolean' || typeof b.rate !== 'number' || !Number.isFinite(b.rate) || b.rate < 0 || b.rate > 100 || (b.enabled && b.rate <= 0)) {
      return NextResponse.json({ error: 'Choose a tax rate greater than zero and at most 100% when enabling tax.' }, { status: 400 });
    }
    const tax = { enabled: b.enabled, rate: b.rate };
    const cfg: WorkspaceConfig = { ...a.config, ...(a.org.config || {}), tax };
    const { error } = await sb.from('organizations').update({ config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    await logActivity(a.orgId, a.userId, a.name, 'UPDATE', 'settings', `Updated tax defaults: ${tax.enabled ? `${tax.rate}%` : 'off'}`);
    return NextResponse.json({ ok: true, tax, message: 'Tax defaults saved for new records. Existing records are unchanged.' });
  }
  if (b.action === 'updateCompany') {
    const company = normaliseCompanyProfile(b.company, a.org);
    company.updatedAt = new Date().toISOString();
    company.updatedBy = a.name;
    const cfg: WorkspaceConfig = { ...a.config, ...(a.org.config || {}), company };
    const { error } = await sb.from('organizations').update({ config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    await logActivity(a.orgId, a.userId, a.name, 'UPDATE', 'settings', 'Updated the company branding and financial-document details');
    return NextResponse.json({ ok: true, company, message: 'Company document details saved.' });
  }
  if (b.action === 'updateCurrency') {
    const currency = normaliseCurrencyConfig(b.currency, b.baseCurrency || a.org.baseCurrency);
    currency.updatedAt = new Date().toISOString();
    currency.updatedBy = a.name;
    const cfg: WorkspaceConfig = { ...a.config, ...(a.org.config || {}), currency };
    const { error } = await sb.from('organizations').update({ base_currency: currency.base, config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    await logActivity(a.orgId, a.userId, a.name, 'UPDATE', 'settings',
      `Set reporting currency to ${currency.base} with ${currency.enabled.length} enabled currencies`);
    return NextResponse.json({ ok: true, currency, message: `Reporting currency saved. Totals convert to ${currency.base}.` });
  }
  if (b.action === 'toggleModule') {
    const cfg: WorkspaceConfig = { ...a.config, ...(a.org.config || {}) };
    const mod = MODULES.find(m => m.id === b.moduleId); if (!mod) return NextResponse.json({ error: 'Unknown module' }, { status: 404 });
    if (b.enabled && a.billing && !planModuleIds(a.billing.planId).includes(b.moduleId)) return NextResponse.json({ error: 'This section is not included in your current plan. Choose a plan that includes it in Billing.' }, { status: 403 });
    if (typeof b.enabled !== 'boolean') return NextResponse.json({ error: 'Choose whether to enable this section.' }, { status: 400 });
    const enabled = new Set(cfg.modules);
    if (b.enabled) enabled.add(b.moduleId); else enabled.delete(b.moduleId);
    cfg.modules = [...enabled];
    cfg.resources = [...new Set(MODULES.filter(m => enabled.has(m.id)).flatMap(m => m.resources))];
    const { error } = await sb.from('organizations').update({ config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true, config: cfg });
  }
  if (b.action === 'applyPack') {
    if (!['essentials', 'full'].includes(b.pack)) return NextResponse.json({ error: 'Choose a valid section pack.' }, { status: 400 });
    const cfg: WorkspaceConfig = { ...a.config, ...(a.org.config || {}) };
    const allowed = a.billing ? planModuleIds(a.billing.planId) : MODULES.map(m => m.id);
    const ids = (b.pack === 'essentials' ? STARTER_MODULE_IDS : MODULES.map(m => m.id)).filter(id => allowed.includes(id));
    const unavailable = (cfg.modules || []).filter(id => !allowed.includes(id));
    cfg.modules = [...new Set([...ids, ...unavailable])];
    cfg.resources = [...new Set(MODULES.filter(m => cfg.modules.includes(m.id)).flatMap(m => m.resources))];
    const { error } = await sb.from('organizations').update({ config: cfg }).eq('id', a.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true, config: cfg, message: b.pack === 'full' && ids.length < MODULES.length ? `Enabled all ${ids.length} sections included in your plan. Visit Billing for more sections.` : `Enabled ${ids.length} sections.` });
  }
  if (b.action === 'setRole' || b.action === 'setScope' || b.action === 'setStaffEmployee' || b.action === 'removeUser') {
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
      const updates: Record<string, any> = { role };
      if (role.endsWith('_EXTERNAL') !== target.role.endsWith('_EXTERNAL')) updates.entity_id = null;
      if (role.endsWith('_EXTERNAL')) updates.staff_employee_id = null;
      const { error } = await sb.from('memberships').update(updates).eq('id', target.id);
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
    if (b.action === 'setStaffEmployee') {
      if (target.role.endsWith('_EXTERNAL')) return NextResponse.json({ error: 'Portal accounts use a client link, not a staff assignment' }, { status: 400 });
      const employeeId = b.employeeId ? String(b.employeeId) : null;
      if (employeeId) {
        const { data: rec } = await sb.from('records').select('id')
          .eq('id', employeeId).eq('organization_id', a.orgId).eq('resource', 'employees')
          .is('deleted_at', null).maybeSingle();
        if (!rec) return NextResponse.json({ error: 'Choose a staff member that exists in this workspace' }, { status: 400 });
      }
      const { error } = await sb.from('memberships').update({ staff_employee_id: employeeId }).eq('id', target.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
      await logActivity(a.orgId, a.userId, a.name, 'ROLE_CHANGE', 'users',
        employeeId ? 'Linked a team member to their staff record and jobs' : 'Cleared a team member’s job assignment');
      return NextResponse.json({ ok: true, message: employeeId ? 'Job assignment saved' : 'Job assignment cleared' });
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
  const bg = billingGuard(a, { write: true }); if (bg) return bg;
  const b = await req.json();
  const sb = await supabase();

  if (b.action === 'invite' || b.action === 'resendInvite' || b.action === 'cancelInvite') {
    if (!hasServiceKey()) return NextResponse.json({error:'Invitations are temporarily unavailable.'},{status:503});
    const admin = supabaseAdmin();
    if (b.action !== 'invite') {
      const {data:inv,error} = await admin.from('workspace_invites_v2').select('*').eq('id',String(b.inviteId || '')).eq('organization_id',a.orgId).is('accepted_at',null).is('cancelled_at',null).maybeSingle();
      if (error || !inv) return NextResponse.json({error:'Pending invitation not found.'},{status:404});
      if (inv.role === 'OWNER' && a.role !== 'OWNER') return NextResponse.json({error:'Only an owner can manage an owner invitation.'},{status:403});
      if (b.action === 'cancelInvite') {
        const {data:changed,error:cancelError} = await admin.from('workspace_invites_v2').update({cancelled_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',inv.id).eq('token_hash',inv.token_hash).is('accepted_at',null).is('cancelled_at',null).select('id');
        if(cancelError || !changed?.length) return NextResponse.json({error:'Invitation changed; refresh and try again.'},{status:409});
        return NextResponse.json({ok:true,message:'Invitation cancelled. The link no longer works.'});
      }
      const next=newInviteToken();
      const {data:changed,error:updateError} = await admin.from('workspace_invites_v2').update({token_hash:next.hash,expires_at:next.expiresAt,updated_at:new Date().toISOString()}).eq('id',inv.id).eq('token_hash',inv.token_hash).is('accepted_at',null).is('cancelled_at',null).select('*').maybeSingle();
      if(updateError || !changed) return NextResponse.json({error:'Invitation changed; refresh and try again.'},{status:409});
      let delivery=null; try {delivery=await sendWorkspaceInvite(changed,a.orgName,a.orgSlug,next.token);} catch { /* report failure */ }
      const status=delivery?.delivered?'sent':delivery?.queued?'queued':'unavailable';
      return NextResponse.json({ok:true,deliveryStatus:status,message:status==='sent'?'New invitation accepted by the email provider. The old link no longer works.':status==='queued'?'New invitation queued; delivery is not yet confirmed. The old link no longer works.':'The new invitation could not be queued. Please try resending again.'});
    }
    const email=String(b.email||'').trim().toLowerCase(), name=String(b.name||'').trim(), role=String(b.role||'VIEWER');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return NextResponse.json({error:'Enter a name and valid email.'},{status:400});
    if (!ROLES.some(r=>r.id===role)) return NextResponse.json({error:'Unknown role.'},{status:400});
    if(role==='OWNER' && a.role!=='OWNER') return NextResponse.json({error:'Only an owner can invite another owner.'},{status:403});
    const limitError=await userLimitMessage(a.orgId,a.config.limits);
    if(limitError) return NextResponse.json({error:limitError},{status:402});
    const external=role.endsWith('_EXTERNAL');
    const entityId=external && b.entityId ? String(b.entityId) : null;
    const staffEmployeeId=!external && b.staffEmployeeId ? String(b.staffEmployeeId) : null;
    if(entityId || staffEmployeeId) {
      const {data:rec}=await sb.from('records').select('id').eq('id',entityId||staffEmployeeId).eq('organization_id',a.orgId).eq('resource',entityId?'clients':'employees').is('deleted_at',null).maybeSingle();
      if(!rec) return NextResponse.json({error:'Invalid client or staff scope.'},{status:400});
    }
    const existing=await findAccountByEmail(email);
    if(existing) {
      const {data:member}=await admin.from('memberships').select('id').eq('organization_id',a.orgId).eq('user_id',existing.id).maybeSingle();
      if(member) return NextResponse.json({error:'That user is already a member.'},{status:409});
    }
    const next=newInviteToken();
    const {data:inv,error:insertError}=await admin.from('workspace_invites_v2').insert({organization_id:a.orgId,email,name,role,entity_id:entityId,staff_employee_id:staffEmployeeId,token_hash:next.hash,expires_at:next.expiresAt,created_by:a.userId}).select('*').single();
    if(insertError || !inv) return NextResponse.json({error:'A pending invitation may already exist. Refresh the page or resend it.'},{status:409});
    let delivery=null;try {delivery=await sendWorkspaceInvite(inv,a.orgName,a.orgSlug,next.token);} catch { /* keep pending */ }
    const status=delivery?.delivered?'sent':delivery?.queued?'queued':'unavailable';
    return NextResponse.json({ok:true,deliveryStatus:status,message:status==='sent'?'Invitation sent to the email provider. Access begins only after acceptance.':status==='queued'?'Invitation queued, but delivery is not yet confirmed.':'Invitation created but email could not be queued; use Resend invitation.'});
  }
  if (b.action === 'seedDemo') {
    if (!hasServiceKey()) return NextResponse.json({ error: 'Sample data is temporarily unavailable. Please try again shortly.' }, { status: 503 });
    const r = await seedDemo(a.orgId, a.userId, a.name);
    return NextResponse.json({ ok: true, message: `Loaded ${r.records} demo records, ${r.wallets} wallets and ${r.pdfs} sample PDFs` });
  }
  if (b.action === 'clearData') {
    if (!hasServiceKey()) return NextResponse.json({ error: 'Clearing sample data is temporarily unavailable. Please try again shortly.' }, { status: 503 });
    await clearDemo(a.orgId);
    return NextResponse.json({ ok: true, message: 'All business records cleared' });
  }
  if (b.action === 'importCsv') {
    const resource = String(b.resource);
    const def = getResource(resource); if (!def) return NextResponse.json({ error: 'Unknown resource' }, { status: 404 });
    const g = writeGuard(a.config, a.role, resource) || capabilityGuard(a.role, 'records.create'); if (g) return g;
    const rows: Record<string, any>[] = b.rows || []; let ok = 0, failed = 0;
    const hidden = new Set(def.fields.filter(f => f.hidden).map(f => f.key));
    for (const raw of rows.slice(0, 200)) {
      // CSV import must not be able to forge Convert to… provenance links.
      const row: Record<string, any> = Object.fromEntries(Object.entries(raw).filter(([k]) => !hidden.has(k)));
      const r = await createRecord(a.orgId, a.userId, a.name, def, row, a.config.limits, a.config.tax);
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
