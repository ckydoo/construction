import { NextResponse } from 'next/server';
import { apiAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { MODULES, ROLES, COMPANY_TYPES, COMPANY_SIZES, permissionsFor, isExternal } from '@/lib/catalog';
import { RESOURCES } from '@/lib/resources';
import { countsByResource } from '@/lib/queries';
import { visibleResources, buildScope, rowAllowed } from '@/lib/access';
import { fetchAll } from '@/lib/fetch';
import { auditView, notificationView } from '@/lib/views';

export async function GET(_req: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const a = await apiAuth(org);
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scoped = isExternal(a.role);
  const scope = await buildScope(a);
  const visible = visibleResources(a);
  const sb = await supabase();

  let memberQuery = sb.from('memberships')
    .select('user_id, role, entity_id, created_at')
    .eq('organization_id', a.orgId);
  if (scoped) memberQuery = memberQuery.eq('user_id', a.userId);

  const [members, notifications, audit, counts, clientRecs] = await Promise.all([
    memberQuery,
    scoped ? Promise.resolve({ data: [] }) : sb.from('notifications').select('*').eq('organization_id', a.orgId).order('created_at', { ascending: false }).limit(30),
    scoped ? Promise.resolve({ data: [] }) : sb.from('audit_logs').select('*').eq('organization_id', a.orgId).order('created_at', { ascending: false }).limit(25),
    countsByResource(a.orgId),
    scoped ? Promise.resolve({ data: [] }) : sb.from('records').select('id,number,title')
      .eq('organization_id', a.orgId).eq('resource', 'clients').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(300),
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
  if (scoped) {
    visibleCounts = {};
    const recs = visible.length ? await fetchAll('records', q => q
      .eq('organization_id', a.orgId).is('deleted_at', null).in('resource', visible),
      'id,resource,data,project_id') : [];
    for (const r of recs) {
      const allowed = rowAllowed(scope, r.resource, { id: r.id, ...(r.data || {}), projectId: r.project_id });
      if (allowed) visibleCounts[r.resource] = (visibleCounts[r.resource] || 0) + 1;
    }
  } else {
    visibleCounts = Object.fromEntries(Object.entries(counts).filter(([k]) => visible.includes(k)));
  }

  const users = memberRows.map((m: any) => {
    const p: any = profileById.get(m.user_id) || {};
    return {
      id: m.user_id, name: p.name || 'User', email: p.email || '',
      avatarColor: p.avatar_color || '#64748b', role: m.role,
      entityId: m.entity_id, joined: m.created_at,
    };
  });

  return NextResponse.json({
    org: { id: a.orgId, name: a.orgName, slug: a.orgSlug, legalName: a.org.legalName, regNumber: a.org.regNumber,
      country: a.org.country, baseCurrency: a.org.baseCurrency, companyType: a.org.companyType, size: a.org.size,
      headcount: a.org.headcount, plan: a.config.plan, limits: a.config.limits },
    config: a.config, modules: MODULES, resources: RESOURCES, roles: ROLES, companyTypes: COMPANY_TYPES, sizes: COMPANY_SIZES,
    role: a.role, permissions: permissionsFor(a.role, a.config.resources),
    walletEnabled: a.config.modules.includes('wallets'),
    user: { id: a.userId, name: a.name, email: a.email, avatarColor: a.avatarColor },
    memberships: a.memberships,
    users,
    clients: scoped ? [] : (clientRecs.data || []).map(c => ({ id: c.id, label: c.title || c.number || c.id })),
    entityId: a.entityId,
    notifications: (notifications.data || []).map(notificationView),
    audit: (audit.data || []).map(auditView),
    counts: visibleCounts,
  });
}
