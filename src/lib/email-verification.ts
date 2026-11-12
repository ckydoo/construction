/* Optional email verification state.
 *
 * Supabase Auth's email confirmation is used only to make password sign-in
 * work. Whether a person has actually verified their address is kept in the
 * admin-only app_metadata claim, so existing confirmed accounts stay verified
 * while new accounts can enter their workspace with a quiet dashboard reminder. */
import { supabaseAdmin } from './supabase';

export function readEmailVerified(appMetadata: unknown): boolean {
  const value = (appMetadata as Record<string, unknown> | null | undefined)?.email_verified;
  // A missing flag is a legacy account that was already verified before this
  // optional reminder existed. Only an explicit false means "not yet verified".
  return value !== false;
}

export async function setEmailVerificationState(userId: string, verified: boolean): Promise<void> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw error || new Error('Could not read account verification state');
  const appMetadata = { ...(data.user.app_metadata || {}), email_verified: verified };
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: appMetadata,
    ...(data.user.email_confirmed_at ? {} : { email_confirm: true }),
  });
  if (updateError) throw updateError;
}
