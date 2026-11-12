import { NextResponse } from 'next/server';
import { signIn, slugify, uniqueSlug } from '@/lib/auth';
import { supabaseAdmin, hasSupabaseConfig, hasServiceKey } from '@/lib/supabase';
import { setEmailVerificationState } from '@/lib/email-verification';
import { sendWelcomeEmail } from '@/lib/auth-email';

export async function POST(req: Request) {
  let createdUserId: string | null = null;
  let createdOrgId: string | null = null;
  try {
    const b = await req.json();
    const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '');
    const company = String(b.company || '').trim();
    if (name.length < 2 || !company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8)
      return NextResponse.json({ error: 'Please provide your name, company, a valid email and a password of at least 8 characters.' }, { status: 400 });
    if (!hasSupabaseConfig() || !hasServiceKey())
      return NextResponse.json({ error: 'Creating an account is temporarily unavailable. Please try again shortly.' }, { status: 503 });

    const admin = supabaseAdmin();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, avatar_color: '#d97706' },
    });
    if (createErr) {
      if (/already|registered|exists|duplicate/i.test(createErr.message))
        return NextResponse.json({ error: 'An account with that email already exists. Try signing in.' }, { status: 409 });
      throw createErr;
    }
    createdUserId = created.user.id;

    // Supabase Auth confirmation is only for sign-in readiness. The optional
    // verification state lives in admin-only app_metadata for the dashboard nudge.
    await setEmailVerificationState(createdUserId, false);
    const signed = await signIn(email, password);
    if (!signed) throw new Error('Could not establish a session');

    const slug = await uniqueSlug(company);
    const { data: org, error: orgErr } = await admin.from('organizations').insert({
      name: company, slug, legal_name: company, country: 'ZW', base_currency: 'USD',
      locale_pack: 'ZW', onboarded: false, config: {}, created_by_id: createdUserId,
    }).select('id,slug,name').single();
    if (orgErr || !org) throw orgErr || new Error('Workspace creation failed');
    createdOrgId = org.id;
    const { error: memberErr } = await admin.from('memberships').insert({
      user_id: createdUserId, organization_id: org.id, role: 'OWNER', entity_id: null,
    });
    if (memberErr) throw memberErr;

    try { await sendWelcomeEmail({ id: createdUserId, email, name }, org.name || company, org.slug || slugify(company)); }
    catch { /* a queued welcome email must never block account creation */ }
    return NextResponse.json({ ok: true, email });
  } catch {
    if (createdOrgId) {
      try { await supabaseAdmin().from('organizations').delete().eq('id', createdOrgId); } catch { /* best-effort cleanup */ }
    }
    if (createdUserId) {
      try { await supabaseAdmin().auth.admin.deleteUser(createdUserId); } catch { /* best-effort cleanup */ }
    }
    return NextResponse.json({ error: 'We couldn’t create your account. Please try again.' }, { status: 500 });
  }
}
