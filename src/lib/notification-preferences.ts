/* Per-user notification preferences. Defaults are deliberately quiet:
 * essential account, security and billing email stays on; all workspace activity
 * stays in the in-app notification centre and never becomes a reminder email. */
import { supabaseAdmin } from './supabase';
import { unsubscribeUrl, type EmailCategory } from './email';

export type { EmailCategory };
export type InAppCategory = 'security' | 'billing' | 'approvals' | 'tasks' | 'support' | 'digest';

export type NotificationPreferencesRow = {
  user_id: string;
  email_security: boolean;
  email_billing: boolean;
  in_app_approvals: boolean;
  in_app_tasks: boolean;
  in_app_support: boolean;
  in_app_digest: boolean;
  digest_frequency: 'daily' | 'weekly' | 'off';
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string;
  in_app_enabled: boolean;
  mute_all: boolean;
  unsubscribe_token: string;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicNotificationPreferences = {
  email_security: boolean;
  email_billing: boolean;
  in_app_approvals: boolean;
  in_app_tasks: boolean;
  in_app_support: boolean;
  in_app_digest: boolean;
  digest_frequency: 'daily' | 'weekly' | 'off';
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string;
  in_app_enabled: boolean;
  mute_all: boolean;
  unsubscribeUrl: string;
  unsubscribed_at: string | null;
};

export type PreferencePatch = Partial<Pick<NotificationPreferencesRow,
  'in_app_approvals' | 'in_app_tasks' | 'in_app_support' | 'in_app_digest' |
  'digest_frequency' | 'quiet_hours_start' | 'quiet_hours_end' | 'timezone' |
  'in_app_enabled' | 'mute_all'>> & { resubscribe?: boolean };

export function publicPreferences(row: NotificationPreferencesRow): PublicNotificationPreferences {
  return {
    email_security: row.email_security,
    email_billing: row.email_billing,
    in_app_approvals: row.in_app_approvals,
    in_app_tasks: row.in_app_tasks,
    in_app_support: row.in_app_support,
    in_app_digest: row.in_app_digest,
    digest_frequency: row.digest_frequency,
    quiet_hours_start: row.quiet_hours_start,
    quiet_hours_end: row.quiet_hours_end,
    timezone: row.timezone,
    in_app_enabled: row.in_app_enabled,
    mute_all: row.mute_all,
    unsubscribeUrl: unsubscribeUrl(row.unsubscribe_token),
    unsubscribed_at: row.unsubscribed_at,
  };
}

export async function ensurePreferences(userId: string): Promise<NotificationPreferencesRow | null> {
  const admin = supabaseAdmin();
  await admin.from('notification_preferences').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  const result = await admin.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
  return (result.data as NotificationPreferencesRow | null) || null;
}

export async function findByUnsubscribeToken(token: string): Promise<NotificationPreferencesRow | null> {
  if (!token) return null;
  const admin = supabaseAdmin();
  const result = await admin.from('notification_preferences').select('*').eq('unsubscribe_token', token).maybeSingle();
  return (result.data as NotificationPreferencesRow | null) || null;
}

export async function updatePreferences(userId: string, patch: PreferencePatch): Promise<NotificationPreferencesRow | null> {
  const allowed: Record<string, unknown> = {};
  for (const key of ['in_app_approvals', 'in_app_tasks', 'in_app_support', 'in_app_digest', 'in_app_enabled', 'mute_all'] as const)
    if (typeof patch[key] === 'boolean') allowed[key] = patch[key];
  if (patch.digest_frequency && ['daily', 'weekly', 'off'].includes(patch.digest_frequency)) allowed.digest_frequency = patch.digest_frequency;
  if (Number.isInteger(patch.quiet_hours_start) && Number(patch.quiet_hours_start) >= 0 && Number(patch.quiet_hours_start) <= 23) allowed.quiet_hours_start = patch.quiet_hours_start;
  if (Number.isInteger(patch.quiet_hours_end) && Number(patch.quiet_hours_end) >= 0 && Number(patch.quiet_hours_end) <= 23) allowed.quiet_hours_end = patch.quiet_hours_end;
  if (typeof patch.timezone === 'string' && patch.timezone.trim().length <= 64) {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: patch.timezone.trim() }); allowed.timezone = patch.timezone.trim(); } catch { /* ignore invalid zone */ }
  }
  if (patch.resubscribe) allowed.unsubscribed_at = null;
  await ensurePreferences(userId);
  const admin = supabaseAdmin();
  if (Object.keys(allowed).length) {
    const result = await admin.from('notification_preferences').update(allowed).eq('user_id', userId);
    if (result.error) return null;
  }
  const fresh = await admin.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
  return (fresh.data as NotificationPreferencesRow | null) || null;
}

export async function markUnsubscribed(token: string): Promise<boolean> {
  const row = await findByUnsubscribeToken(token);
  if (!row) return false;
  const admin = supabaseAdmin();
  const result = await admin.from('notification_preferences').update({
    email_approvals: false, email_tasks: false, email_support: false, email_digest: false,
    mute_all: true, unsubscribed_at: new Date().toISOString(),
  }).eq('user_id', row.user_id);
  return !result.error;
}

export function isQuietHour(prefs: NotificationPreferencesRow, now = new Date()): boolean {
  const start = Number(prefs.quiet_hours_start);
  const end = Number(prefs.quiet_hours_end);
  if (start === end) return false;
  let hour = now.getUTCHours();
  try {
    hour = Number(new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hour12: false, hourCycle: 'h23',
      timeZone: prefs.timezone || 'Africa/Harare',
    }).format(now));
  } catch { /* fall back to UTC hour */ }
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}

/** Critical-only email policy: workspace categories never leave the app. */
export function emailAllowed(prefs: NotificationPreferencesRow | null, category: EmailCategory, _now = new Date()): boolean {
  if (!prefs) return false;
  return category === 'security' || category === 'billing' || category === 'verification' || category === 'welcome';
}

export function inAppAllowed(
  prefs: NotificationPreferencesRow | null,
  category: InAppCategory,
  now = new Date(),
  respectQuietHours = false,
): boolean {
  if (!prefs || !prefs.in_app_enabled) return false;
  if (category === 'security' || category === 'billing') return true;
  const flag = category === 'approvals' ? prefs.in_app_approvals
    : category === 'tasks' ? prefs.in_app_tasks
    : category === 'support' ? prefs.in_app_support
    : category === 'digest' ? prefs.in_app_digest
    : false;
  if (!flag) return false;
  if (category === 'digest' && prefs.digest_frequency === 'off') return false;
  if (respectQuietHours && isQuietHour(prefs, now)) return false;
  return true;
}
