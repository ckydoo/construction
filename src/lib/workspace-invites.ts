import { supabaseAdmin } from './supabase';
import { appBaseUrl, emailTemplateData, hashToken, newToken, queueTemplateEmail, type EnqueueResult } from './email';

type Invite = { id: string; email: string; name: string; token_hash: string; expires_at: string; organization_id: string };

export async function sendWorkspaceInvite(inv: Invite, orgName: string, orgSlug: string, token: string): Promise<EnqueueResult | null> {
  const url = `${appBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  return queueTemplateEmail({ to:inv.email, templateKey:'invite',
    data:emailTemplateData({ name:inv.name, subject:`Invitation to ${orgName}`, headline:`You’re invited to ${orgName}`,
      body:'Accept this invitation to join the workspace. Existing users sign in; new users choose a password. This invitation expires in seven days.',
      ctaLabel:'Accept invitation', ctaUrl:url, orgSlug, essential:true,
      note:'Only the intended recipient can accept. Ask the workspace administrator to resend an expired invitation.' }),
    dedupeKey:`workspace-invite-v2:${inv.id}:${inv.token_hash}`, payload:{purpose:'workspace_invite_v2',inviteId:inv.id,tokenHash:inv.token_hash,orgSlug} });
}
export function newInviteToken() { const token=newToken(); return {token, hash:hashToken(token), expiresAt:new Date(Date.now()+7*86400000).toISOString()}; }
export async function findValidWorkspaceInvite(token:string):Promise<Invite|null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const result=await supabaseAdmin().from('workspace_invites_v2').select('*').eq('token_hash',hashToken(token)).is('accepted_at',null).is('cancelled_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
  if(result.error) throw result.error;
  return result.data as Invite|null;
}
