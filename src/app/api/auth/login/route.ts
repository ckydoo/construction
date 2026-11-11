import { NextResponse } from 'next/server';
import { signIn, signOut } from '@/lib/auth';
import { supabase, hasSupabaseConfig } from '@/lib/supabase';
import { findAccountByEmail, issueEmailToken, recentTokenCount } from '@/lib/auth-email';

export async function POST(req: Request) {
  const b = await req.json();
  const email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '');
  if (!email || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  if (!hasSupabaseConfig()) return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again shortly.' }, { status: 503 });

  const signed = await signIn(email, password);
  if (!signed) return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  if (!signed.emailConfirmedAt) {
    await signOut();
    const account = await findAccountByEmail(email);
    if (account && !account.emailConfirmedAt && await recentTokenCount(account.id, 'verify_email', 1) === 0)
      await issueEmailToken(account, 'verify_email');
    return NextResponse.json({
      error: 'Please verify your email address before signing in.',
      code: 'EMAIL_NOT_VERIFIED',
      email,
    }, { status: 403 });
  }

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
