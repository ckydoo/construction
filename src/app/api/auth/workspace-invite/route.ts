import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { findValidWorkspaceInvite } from '@/lib/workspace-invites';
import { hashToken } from '@/lib/email';
import { billingActive, billingMode } from '@/lib/billing';
import { findAccountByEmail } from '@/lib/auth-email';
import { setEmailVerificationState } from '@/lib/email-verification';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const invalid=()=>NextResponse.json({error:'This invitation has expired, was cancelled, or has already been used. Ask your administrator to resend it.'},{status:400});
export async function POST(req:Request) {
  const body=await req.json().catch(()=>({})); const token=String(body.token||'').trim();
  const inv=await findValidWorkspaceInvite(token).catch(()=>null);
  if(!inv) return invalid();
  if(body.action==='info') {
    const org=await supabaseAdmin().from('organizations').select('name').eq('id',inv.organization_id).maybeSingle();
    const existing=await findAccountByEmail(inv.email);
    return NextResponse.json({ok:true,workspace:org.data?.name||'MYLA workspace',email:inv.email,newAccount:!existing,expiresAt:inv.expires_at});
  }
  if(body.action!=='accept') return NextResponse.json({error:'Unknown action.'},{status:400});
  if (billingMode() === 'misconfigured') return NextResponse.json({error:'Workspace billing is temporarily unavailable. Please contact your administrator.'},{status:503});
  const password=String(body.password||''); const existing=await findAccountByEmail(inv.email);
  if(!password || (!existing && password.length<8)) return NextResponse.json({error:'Enter a valid password.'},{status:400});
  const sb=await supabase(); let userId:string;
  if(!existing) {
    const created=await supabaseAdmin().auth.admin.createUser({email:inv.email,password,email_confirm:true,user_metadata:{name:inv.name,avatar_color:'#64748b'}});
    if(created.error || !created.data.user) return NextResponse.json({error:'Account could not be created. Reload the invitation and sign in if you already have an account.'},{status:409});
    userId=created.data.user.id;
    await setEmailVerificationState(userId,true).catch(()=>{});
  } else {
    const auth=await sb.auth.signInWithPassword({email:inv.email,password,options:{captchaToken:String(body.captchaToken||'')}});
    if(auth.error || auth.data.user?.id!==existing.id) return NextResponse.json({error:'Sign-in failed. Check your password and security check, then try again.'},{status:401});
    userId=existing.id;
  }
  const result=await supabaseAdmin().rpc('accept_workspace_invite_v2',{p_token_hash:hashToken(token),p_user_id:userId,p_billing_enabled:billingActive()});
  if(result.error) return NextResponse.json({error:'Could not accept the invitation. It may have expired or the workspace may have reached its user limit. Contact the administrator.'},{status:409});
  return NextResponse.json({ok:true,newAccount:!existing,slug:result.data});
}
