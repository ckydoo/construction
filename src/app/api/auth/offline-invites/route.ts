import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { billingActive, billingMode } from '@/lib/billing';
export const runtime='nodejs'; export const dynamic='force-dynamic';
async function current(){const sb=await supabase();const result=await sb.auth.getUser();return result.data.user||null;}
export async function GET(){
  const u=await current(); if(!u) return NextResponse.json({error:'Please sign in.'},{status:401});
  const admin=supabaseAdmin();const result=await admin.from('workspace_invites_v2').select('id,role,expires_at,organization_id').eq('offline_user_id',u.id).is('accepted_at',null).is('cancelled_at',null).order('created_at');
  if(result.error) return NextResponse.json({error:'Could not load invitations.'},{status:503});
  const ids=(result.data||[]).map(x=>x.organization_id);const orgs=ids.length?await admin.from('organizations').select('id,name').in('id',ids):{data:[],error:null};
  if(orgs.error) return NextResponse.json({error:'Could not load invitations.'},{status:503});
  return NextResponse.json({invitations:(result.data||[]).map(i=>({id:i.id,role:i.role,expiresAt:i.expires_at,workspace:orgs.data?.find(o=>o.id===i.organization_id)?.name||'Workspace'})),temporaryPassword:u.app_metadata?.temporary_password===true});
}
export async function POST(req:Request){
  const u=await current();if(!u) return NextResponse.json({error:'Please sign in.'},{status:401});
  if(billingMode()==='misconfigured')return NextResponse.json({error:'Workspace billing is temporarily unavailable.'},{status:503});
  const b=await req.json().catch(()=>({}));const id=String(b.id||'');
  const admin=supabaseAdmin();const inv=await admin.from('workspace_invites_v2').select('token_hash,offline_user_id,expires_at').eq('id',id).eq('offline_user_id',u.id).is('accepted_at',null).is('cancelled_at',null).maybeSingle();
  if(inv.error||!inv.data||new Date(inv.data.expires_at).getTime()<=Date.now()) return NextResponse.json({error:'Invitation unavailable or expired. Ask your administrator to renew it.'},{status:400});
  const result=await admin.rpc('accept_workspace_invite_v2',{p_token_hash:inv.data.token_hash,p_user_id:u.id,p_billing_enabled:billingActive()});
  if(result.error) return NextResponse.json({error:'Could not accept the invitation. It may have expired or the workspace may have reached its user limit. Contact your administrator.'},{status:409});
  return NextResponse.json({ok:true,slug:result.data,temporaryPassword:u.app_metadata?.temporary_password===true});
}
