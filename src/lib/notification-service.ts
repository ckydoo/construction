/* One delivery boundary for in-app notifications and critical-only email.
 * In-app alerts are immediate, role-targeted and deduplicated. Only essential
 * account, security and billing email is queued; workspace activity stays here. */
import { supabaseAdmin } from './supabase';
import { appBaseUrl, emailTemplateData, queueTemplateEmail, unsubscribeUrl, type EmailCategory } from './email';
import type { EmailTemplateKey } from './email-templates';
import {
  emailAllowed, ensurePreferences, inAppAllowed, type InAppCategory,
} from './notification-preferences';

export type NotificationKind = 'INFO' | 'SUCCESS' | 'WARNING' | 'ALERT';
const ESSENTIAL_EMAIL_CATEGORIES = new Set<EmailCategory>(['security', 'billing', 'verification', 'welcome']);

async function claimDedupe(orgId: string, eventKey?: string): Promise<boolean> {
  if (!eventKey) return true;
  const admin = supabaseAdmin();
  const claimed = await admin.from('notification_dedupe')
    .upsert({ organization_id: orgId, event_key: eventKey }, { onConflict: 'organization_id,event_key', ignoreDuplicates: true })
    .select('event_key');
  return (claimed.data || []).length > 0;
}

export async function createOrgNotification(
  orgId: string, title: string, body: string, kind: NotificationKind = 'INFO', href: string | null = null, eventKey?: string,
): Promise<boolean> {
  try {
    if (!await claimDedupe(orgId, eventKey)) return false;
    const admin = supabaseAdmin();
    const result = await admin.from('notifications').insert({
      organization_id: orgId, user_id: null, title, body, kind, href, read: false,
    });
    return !result.error;
  } catch { return false; }
}

export async function createUserNotifications(
  orgId: string, userIds: string[], title: string, body: string,
  kind: NotificationKind = 'INFO', href: string | null = null, eventKey?: string,
): Promise<boolean> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return false;
  try {
    if (!await claimDedupe(orgId, eventKey)) return false;
    const admin = supabaseAdmin();
    const result = await admin.from('notifications').insert(unique.map(userId => ({
      organization_id: orgId, user_id: userId, title, body, kind, href, read: false,
    })));
    return !result.error;
  } catch { return false; }
}

/** Preference-aware, role-targeted in-app delivery. No dedupe is claimed if nobody is eligible. */
export async function notifyUsersByCategory(
  orgId: string,
  userIds: string[],
  category: InAppCategory,
  title: string,
  body: string,
  kind: NotificationKind = 'INFO',
  href: string | null = null,
  eventKey?: string,
  options: { respectQuietHours?: boolean; now?: Date } = {},
): Promise<boolean> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return false;
  const now = options.now || new Date();
  const eligible: string[] = [];
  for (const userId of unique) {
    const prefs = await ensurePreferences(userId);
    if (inAppAllowed(prefs, category, now, !!options.respectQuietHours)) eligible.push(userId);
  }
  if (!eligible.length) return false;
  return createUserNotifications(orgId, eligible, title, body, kind, href, eventKey);
}

export async function roleUserIds(orgId: string, roles: string[]): Promise<string[]> {
  const uniqueRoles = Array.from(new Set(roles.filter(Boolean)));
  if (!uniqueRoles.length) return [];
  const admin = supabaseAdmin();
  const result = await admin.from('memberships').select('user_id')
    .eq('organization_id', orgId).in('role', uniqueRoles);
  return (result.data || []).map(r => r.user_id).filter(Boolean);
}

export async function adminUserIds(orgId: string): Promise<string[]> {
  return roleUserIds(orgId, ['OWNER', 'ADMIN']);
}

export async function memberUserIds(orgId: string): Promise<string[]> {
  const admin = supabaseAdmin();
  const result = await admin.from('memberships').select('user_id').eq('organization_id', orgId);
  return (result.data || []).map(r => r.user_id).filter(Boolean);
}

export async function orgSlug(orgId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const result = await admin.from('organizations').select('slug').eq('id', orgId).maybeSingle();
  return result.data?.slug || null;
}

export type CategoryEmailInput = {
  userId: string;
  category: EmailCategory;
  templateKey: EmailTemplateKey;
  subject: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  orgSlug?: string | null;
  dedupeKey: string;
  details?: string[];
  note?: string;
  essential?: boolean;
  now?: Date;
  scheduledAt?: string;
};

export async function queueCategoryEmail(input: CategoryEmailInput): Promise<boolean> {
  if (!ESSENTIAL_EMAIL_CATEGORIES.has(input.category)) return false;
  try {
    const prefs = await ensurePreferences(input.userId);
    if (!prefs || !emailAllowed(prefs, input.category, input.now || new Date())) return false;
    const admin = supabaseAdmin();
    const profile = await admin.from('profiles').select('email,name').eq('id', input.userId).maybeSingle();
    const to = String(profile.data?.email || '').trim();
    if (!to) return false;
    const link = unsubscribeUrl(prefs.unsubscribe_token);
    const result = await queueTemplateEmail({
      to,
      userId: input.userId,
      templateKey: input.templateKey,
      data: emailTemplateData({
        name: profile.data?.name || undefined,
        subject: input.subject,
        headline: input.headline,
        body: input.body,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl || `${appBaseUrl()}/${input.orgSlug || ''}/dashboard`,
        details: input.details,
        note: input.note,
        essential: input.essential ?? true,
        orgSlug: input.orgSlug,
      }),
      dedupeKey: `${input.dedupeKey}:${input.userId}`,
      unsubscribeUrl: link,
      payload: { category: input.category, orgSlug: input.orgSlug || null },
      scheduledAt: input.scheduledAt,
    });
    return !!result;
  } catch { return false; }
}

export async function queueCategoryEmails(input: Omit<CategoryEmailInput, 'userId'> & { userIds: string[] }): Promise<number> {
  let queued = 0;
  for (const userId of Array.from(new Set(input.userIds.filter(Boolean)))) {
    const { userIds: _userIds, ...rest } = input;
    if (await queueCategoryEmail({ ...rest, userId })) queued++;
  }
  return queued;
}
