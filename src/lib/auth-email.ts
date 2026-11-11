/* Account email flows: one-time verification, reset and invitation links,
 * plus welcome and password-changed messages. Raw links are never stored;
 * only a SHA-256 hash is kept in the service-role token table. */
import { supabaseAdmin } from './supabase';
import {
  appBaseUrl, emailTemplateData, hashToken, inviteUrl, newToken, queueTemplateEmail,
  resetPasswordUrl, verificationUrl,
} from './email';
import { ensurePreferences } from './notification-preferences';

export type EmailTokenPurpose = 'verify_email' | 'reset_password' | 'invite';

export type AccountUser = {
  id: string; email: string; name: string; emailConfirmedAt: string | null;
};

export async function findAccountByEmail(email: string): Promise<AccountUser | null> {
  const admin = supabaseAdmin();
  const profile = await admin.from('profiles').select('id,name,email').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (!profile.data) return null;
  const auth = await admin.auth.admin.getUserById(profile.data.id);
  if (auth.error || !auth.data?.user) return null;
  return {
    id: String(profile.data.id),
    email: String(profile.data.email || auth.data.user.email || email).trim().toLowerCase(),
    name: String(profile.data.name || '').trim() || String(email).split('@')[0],
    emailConfirmedAt: auth.data.user.email_confirmed_at || null,
  };
}

export async function recentTokenCount(userId: string, purpose: EmailTokenPurpose, minutes: number): Promise<number> {
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const result = await admin.from('email_verification_tokens').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('purpose', purpose).gte('created_at', since);
  return result.count || 0;
}

export async function issueEmailToken(
  user: Pick<AccountUser, 'id' | 'email' | 'name'>,
  purpose: EmailTokenPurpose,
  orgSlug?: string | null,
  orgName?: string | null,
): Promise<{ token: string; expiresAt: string } | null> {
  const admin = supabaseAdmin();
  const token = newToken();
  const lifetimeMinutes = purpose === 'reset_password' ? 60 : purpose === 'invite' ? 7 * 24 * 60 : 24 * 60;
  const expiresAt = new Date(Date.now() + lifetimeMinutes * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await admin.from('email_verification_tokens').update({ used_at: now })
    .eq('user_id', user.id).eq('purpose', purpose).is('used_at', null);
  const inserted = await admin.from('email_verification_tokens').insert({
    user_id: user.id, email: user.email, purpose, token_hash: hashToken(token), expires_at: expiresAt,
  });
  if (inserted.error) return null;
  await ensurePreferences(user.id);
  const isReset = purpose === 'reset_password';
  const isInvite = purpose === 'invite';
  const link = isReset ? resetPasswordUrl(token) : isInvite ? inviteUrl(token) : verificationUrl(token);
  const headline = isReset ? 'Choose a new password'
    : isInvite ? `You’re invited to ${orgName || 'a MYLA workspace'}`
    : 'Confirm your email address';
  const body = isReset
    ? 'We received a request to reset your MYLA password. The link below expires in one hour and can be used once.'
    : isInvite
      ? 'Your workspace administrator added you to MYLA. Choose a password to confirm your email address and get started. The link expires in seven days and can be used once.'
      : 'Confirm this address to finish setting up your MYLA workspace. The link expires in 24 hours.';
  await queueTemplateEmail({
    to: user.email,
    userId: user.id,
    templateKey: isReset ? 'reset_password' : isInvite ? 'invite' : 'verification',
    data: emailTemplateData({
      name: user.name, subject: headline, headline, body,
      ctaLabel: isReset ? 'Choose a new password' : isInvite ? 'Accept invitation & set password' : 'Confirm email address',
      ctaUrl: link,
      essential: true,
      orgSlug,
      note: isReset
        ? 'If you did not request this, you can safely ignore the message. Your password has not changed.'
        : isInvite
          ? 'If you were not expecting this invitation, you can safely ignore this message.'
          : 'If you did not create this account, you can safely ignore this message.',
    }),
    dedupeKey: `${purpose}:${user.id}:${hashToken(token)}`,
    unsubscribeUrl: null,
    payload: { purpose, orgSlug: orgSlug || null },
  });
  return { token, expiresAt };
}

export async function consumeEmailToken(token: string, purpose: EmailTokenPurpose) {
  const admin = supabaseAdmin();
  const found = await admin.from('email_verification_tokens').select('*')
    .eq('token_hash', hashToken(token)).eq('purpose', purpose).is('used_at', null)
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!found.data) return null;
  const claimed = await admin.from('email_verification_tokens').update({ used_at: new Date().toISOString() })
    .eq('id', found.data.id).is('used_at', null).select('id');
  if (!claimed.data?.length) return null;
  return found.data as { id: string; user_id: string; email: string; purpose: EmailTokenPurpose };
}

export async function confirmAccountEmail(userId: string): Promise<void> {
  const admin = supabaseAdmin();
  await admin.auth.admin.updateUserById(userId, { email_confirm: true });
}

export async function setAccountPassword(userId: string, password: string): Promise<void> {
  const admin = supabaseAdmin();
  await admin.auth.admin.updateUserById(userId, { password });
}

export async function sendWelcomeEmail(user: Pick<AccountUser, 'id' | 'email' | 'name'>, orgName: string, orgSlug?: string | null): Promise<void> {
  await ensurePreferences(user.id);
  await queueTemplateEmail({
    to: user.email,
    userId: user.id,
    templateKey: 'welcome',
    data: emailTemplateData({
      name: user.name,
      subject: 'Welcome to MYLA',
      headline: `Welcome to ${orgName}`,
      body: 'Your email is verified and your workspace is ready. Start with the essentials, then add your team when you are ready.',
      details: ['Set up your company details and branding', 'Add your first project, quote or client', 'Invite teammates from Settings'],
      ctaLabel: 'Open MYLA',
      ctaUrl: orgSlug ? `${appBaseUrl()}/${orgSlug}/dashboard` : appBaseUrl(),
      orgSlug,
      essential: true,
      note: 'This is an essential account message. You can still choose what appears in your notification centre at any time.',
    }),
    dedupeKey: `welcome:${user.id}`,
    unsubscribeUrl: null,
    payload: { orgSlug: orgSlug || null },
  });
}

export async function sendWelcomeForAccount(user: Pick<AccountUser, 'id' | 'email' | 'name'>, fallbackOrgName = 'your MYLA workspace'): Promise<void> {
  const admin = supabaseAdmin();
  const { data: rows } = await admin.from('memberships')
    .select('organizations(name,slug)').eq('user_id', user.id).limit(1);
  const raw: any = (rows?.[0] as any)?.organizations;
  const org = Array.isArray(raw) ? raw[0] : raw;
  await sendWelcomeEmail(user, org?.name || fallbackOrgName, org?.slug || null);
}

export async function sendPasswordChangedEmail(user: Pick<AccountUser, 'id' | 'email' | 'name'>): Promise<void> {
  await ensurePreferences(user.id);
  await queueTemplateEmail({
    to: user.email,
    userId: user.id,
    templateKey: 'password_changed',
    data: emailTemplateData({
      name: user.name,
      subject: 'Your MYLA password was changed',
      headline: 'Your password was changed',
      body: 'The password for your MYLA account was changed just now. If this was not you, reset your password and contact your workspace administrator.',
      ctaLabel: 'Open MYLA', ctaUrl: appBaseUrl(), essential: true,
    }),
    dedupeKey: `password-changed:${user.id}:${new Date().toISOString().slice(0, 16)}`,
    unsubscribeUrl: null,
  });
}

/** Invite a verified person, or send a secure set-password / verification link to a new account. */
export async function sendTeamInviteEmail(user: AccountUser, orgName: string, orgSlug: string): Promise<void> {
  if (!user.emailConfirmedAt) {
    await issueEmailToken(user, 'invite', orgSlug, orgName);
    return;
  }
  await ensurePreferences(user.id);
  await queueTemplateEmail({
    to: user.email,
    userId: user.id,
    templateKey: 'invite',
    data: emailTemplateData({
      name: user.name,
      subject: `You’ve been added to ${orgName}`,
      headline: `You’re invited to ${orgName}`,
      body: 'Your workspace administrator added you to a MYLA workspace. Your existing account is ready to use.',
      ctaLabel: 'Open MYLA', ctaUrl: `${appBaseUrl()}/${orgSlug}/dashboard`, orgSlug, essential: true,
      note: 'If you were not expecting this invitation, contact your workspace administrator.',
    }),
    dedupeKey: `team-invite:${user.id}:${orgSlug}`,
    unsubscribeUrl: null,
    payload: { orgSlug },
  });
}
