import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { MODULES, ROLES, COMPANY_TYPES, COMPANY_SIZES, permissionsFor, isExternal } from '@/lib/catalog';
import { RESOURCES } from '@/lib/resources';
import { normaliseCompanyProfile } from '@/lib/company';
import { visibleModuleDefs, auditResourceVisible, hrefVisible } from '@/lib/module-visibility';
import { countsByResource } from '@/lib/queries';
import { visibleResources, buildScope, rowAllowed } from '@/lib/access';
import { fetchAll } from '@/lib/fetch';
import { auditView, notificationView } from '@/lib/views';
import { publicBilling } from '@/lib/billing';
import { isSmtpConfigured } from '@/lib/email';

export async function GET(req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  // Settings is the single deliberate exception to strict module hiding: its
  // own request asks for the complete catalogue so disabled items can be re-enabled.
  const settingsScope = new URL(req.url).searchParams.get('scope') === 'settings';
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const external = isExternal(a.role);
  const scope = await buildScope(a);
  const restricted = !!scope.kind;
  const full = !restricted;
  const visible = visibleResources(a);
  const readableDefs = RESOURCES.filter(r => visible.includes(r.id));
  const exposedModules = settingsScope ? MODULES : visibleModuleDefs(a.config);
  const exposedResources = settingsScope ? RESOURCES : readableDefs;
  const sb = await supabase();

  // Staff and portal accounts see themselves in the team list; only owners and
  // administrators see all members, all clients and workspace-wide counts.
  let memberQuery = sb.from('memberships')
    .select('user_id, role, entity_id, staff_employee_id, created_at')
    .eq('organization_id', a.orgId);
  if (!full) memberQuery = memberQuery.eq('user_id', a.userId);

  const [members, notifications, audit, counts, clientRecs, employeeRecs, billing] = await Promise.all([
    memberQuery,
    external ? Promise.resolve({ data: [] }) : sb.from('notifications').select('*').eq('organization_id', a.orgId).order('created_at', { ascending: false }).limit(30),
    external ? Promise.resolve({ data: [] }) : sb.from('audit_logs').select('*').eq('organization_id', a.orgId).order('created_at', { ascending: false }).limit(25),
    full ? countsByResource(a.orgId) : Promise.resolve({}),
    full ? sb.from('records').select('id,number,title')
      .eq('organization_id', a.orgId).eq('resource', 'clients').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(300) : Promise.resolve({ data: [] }),
    full ? sb.from('records').select('id,number,title').eq('organization_id', a.orgId)
      .eq('resource', 'employees').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(500) : Promise.resolve({ data: [] }),
    publicBilling(a.orgId, a.role),
  ]);

  // memberships.user_id points at auth.users, not public.profiles, so PostgREST
  // cannot embed profiles(...) through a FK. Resolve the visible profiles in a
  // second RLS-scoped query and join here; otherwise every workspace reports an
  // empty team list even though its memberships exist.
  const memberRows: any[] = members.data || [];
  const profileRows: any[] = memberRows.length
    ? ((await sb.from('profiles').select('id,name,email,avatar_color,created_at')
        .in('id', memberRows.map(m => m.user_id))).data || [])
    : [];
  const profileById = new Map(profileRows.map(p => [p.id, p]));

  let visibleCounts: Record<string, number>;
  if (restricted) {
    visibleCounts = {};
    const recs = visible.length ? await fetchAll('records', q => q
      .eq('organization_id', a.orgId).is('deleted_at', null).in('resource', visible),
      'id,resource,data,project_id') : [];
    for (const r of recs) {
      const allowed = rowAllowed(scope, r.resource, { id: r.id, ...(r.data || {}), projectId: r.project_id });
      if (allowed) visibleCounts[r.resource] = (visibleCounts[r.resource] || 0) + 1;
    }
  } else {
    visibleCounts = Object.fromEntries(Object.entries(counts as Record<string, number>).filter(([k]) => visible.includes(k)));
  }

  const users = memberRows.map((m: any) => {
    const p: any = profileById.get(m.user_id) || {};
    return {
      id: m.user_id, name: p.name || 'User', email: p.email || '',
      avatarColor: p.avatar_color || '#64748b', role: m.role,
      entityId: m.entity_id, staffEmployeeId: m.staff_employee_id, joined: m.created_at,
    };
  });

  let pendingInvites: any[] = [];
  if (settingsScope && ['OWNER','ADMIN'].includes(a.role)) {
    const pending = await supabaseAdmin().from('workspace_invites_v2').select('id,name,email,role,expires_at,created_at,offline_user_id').eq('organization_id',a.orgId).is('accepted_at',null).is('cancelled_at',null).order('created_at',{ascending:false});
    pendingInvites = pending.data || [];
  }
  return NextResponse.json({
    ...(settingsScope && ['OWNER','ADMIN'].includes(a.role) ? {pendingInvites} : {}),
    org: { id: a.orgId, name: a.orgName, slug: a.orgSlug, legalName: a.org.legalName, regNumber: a.org.regNumber,
      country: a.org.country, baseCurrency: a.org.baseCurrency, companyType: a.org.companyType, size: a.org.size,
      headcount: a.org.headcount, plan: a.config.plan, limits: a.config.limits,
      currency: a.config.currency || null, company: normaliseCompanyProfile(a.config.company, a.org) },
    config: a.config, billing, modules: exposedModules, resources: exposedResources,
    roles: ROLES, companyTypes: COMPANY_TYPES, sizes: COMPANY_SIZES,
    role: a.role, permissions: permissionsFor(a.role, a.config.resources),
    walletEnabled: a.config.modules.includes('wallets'),
    ...(settingsScope ? { invitationEmailConfigured: isSmtpConfigured() } : {}),
    user: { id: a.userId, name: a.name, email: a.email, avatarColor: a.avatarColor, emailVerified: a.emailVerified, temporaryPassword: a.temporaryPassword },
    memberships: a.memberships,
    users,
    clients: (clientRecs.data || []).map((c: any) => ({ id: c.id, label: c.title || c.number || c.id })),
    employees: (employeeRecs.data || []).map((e: any) => ({ id: e.id, label: e.title || e.number || e.id })),
    entityId: a.entityId,
    notifications: (notifications.data || [])
      .filter((n: any) => (!restricted || !n.user_id || n.user_id === a.userId) && hrefVisible(n.href, a.config))
      .map(notificationView),
    audit: (audit.data || [])
      .filter((x: any) => (full || x.user_id === a.userId) && auditResourceVisible(x.resource, a.config))
      .map(auditView),
    counts: visibleCounts,
    scope: { kind: scope.kind, projectIds: scope.projectIds, departments: scope.departments, staffEmployeeId: scope.entityId },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
