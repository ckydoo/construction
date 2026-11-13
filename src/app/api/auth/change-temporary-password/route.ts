import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function POST(req:Request){
  const sb=await supabase(); const current=await sb.auth.getUser();const u=current.data.user;
  if(!u) return NextResponse.json({error:'Please sign in.'},{status:401});
  if(u.app_metadata?.temporary_password!==true) return NextResponse.json({error:'No temporary password needs changing.'},{status:400});
  const b=await req.json().catch(()=>({})); const password=String(b.password||'');
  if(password.length<12) return NextResponse.json({error:'Use at least 12 characters.'},{status:400});
  const updated=await sb.auth.updateUser({password});
  if(updated.error) return NextResponse.json({error:'Could not change your password. Please try again.'},{status:400});
  const admin=supabaseAdmin();const latest=await admin.auth.admin.getUserById(u.id);
  if(latest.error||!latest.data.user) return NextResponse.json({error:'Password changed, but the reminder could not be cleared. Contact your administrator.'},{status:503});
  const mark=await admin.auth.admin.updateUserById(u.id,{app_metadata:{...latest.data.user.app_metadata,temporary_password:false}});
  if(mark.error) return NextResponse.json({error:'Password changed, but the reminder could not be cleared. Contact your administrator.'},{status:503});
  return NextResponse.json({ok:true});
}
