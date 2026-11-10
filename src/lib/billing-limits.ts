/* Plan-limit preflight. Billing state is authoritative in middleware; these
 * checks give a friendly 402 instead of letting a record or invite exceed the
 * purchased tier. In shadow mode they are inert. */
import { supabase } from './supabase';
import { billingActive } from './billing';

type Limits = { users?: number; projects?: number; storageMb?: number } | null | undefined;

function cap(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 9999 ? n : 9999;
}

export async function projectLimitMessage(orgId: string, resource: string, limits: Limits): Promise<string | null> {
  if (!billingActive() || resource !== 'projects') return null;
  const max = cap(limits?.projects);
  if (max >= 9999) return null;
  const sb = await supabase();
  const { count, error } = await sb.from('records')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId).eq('resource', 'projects').is('deleted_at', null)
    .not('status', 'in', '(COMPLETED,CLOSED,CANCELLED,completed,closed,cancelled)');
  if (error) return null; // fail open only on a count error; middleware remains authoritative
  if ((count || 0) < max) return null;
  return `Your plan includes ${max} active projects. Upgrade in Billing to add more; no existing data is deleted.`;
}

export async function userLimitMessage(orgId: string, limits: Limits): Promise<string | null> {
  if (!billingActive()) return null;
  const max = cap(limits?.users);
  if (max >= 9999) return null;
  const sb = await supabase();
  const { count, error } = await sb.from('memberships')
    .select('*', { count: 'exact', head: true }).eq('organization_id', orgId);
  if (error) return null;
  if ((count || 0) < max) return null;
  return `Your plan includes ${max} users. Upgrade in Billing to invite more people; no existing user is removed.`;
}
