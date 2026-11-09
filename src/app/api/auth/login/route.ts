import { NextResponse } from 'next/server';
import { signIn } from '@/lib/auth';
import { supabase, hasSupabaseConfig } from '@/lib/supabase';

export async function POST(req: Request) {
  const b = await req.json();
  const email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '');
  if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  if (!hasSupabaseConfig()) return NextResponse.json({ error: 'Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.' }, { status: 503 });

  const signed = await signIn(email, password);
  if (!signed) return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });

  const sb = await supabase();
  const { data: rows } = await sb.from('memberships')
    .select('role, entity_id, organizations(id,slug,name,onboarded)')
    .eq('user_id', signed.userId);
  const membership: any = rows?.[0];
  if (!membership) return NextResponse.json({ error: 'No workspace is linked to this account.' }, { status: 403 });
  const { data: profile } = await sb.from('profiles').select('name').eq('id', signed.userId).maybeSingle();
  const org = membership.organizations || {};
  return NextResponse.json({
    ok: true, slug: org.slug, onboarded: !!org.onboarded,
    name: profile?.name || email.split('@')[0], role: membership.role,
  });
}
