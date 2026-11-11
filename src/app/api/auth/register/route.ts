import { NextResponse } from 'next/server';
import { slugify, uniqueSlug } from '@/lib/auth';
import { supabaseAdmin, hasSupabaseConfig, hasServiceKey } from '@/lib/supabase';
import { issueEmailToken } from '@/lib/auth-email';

export async function POST(req: Request) {
  let createdUserId: string | null = null;
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
      email, password, email_confirm: false,
      user_metadata: { name, avatar_color: '#d97706' },
    });
    if (createErr) {
      if (/already|registered|exists|duplicate/i.test(createErr.message))
        return NextResponse.json({ error: 'An account with that email already exists. Try signing in.' }, { status: 409 });
      throw createErr;
    }
    createdUserId = created.user.id;
    const slug = await uniqueSlug(company);
    const { data: org, error: orgErr } = await admin.from('organizations').insert({
      name: company, slug, legal_name: company, country: 'ZW', base_currency: 'USD',
      locale_pack: 'ZW', onboarded: false, config: {}, created_by_id: createdUserId,
    }).select('id,slug,name').single();
    if (orgErr || !org) throw orgErr || new Error('Workspace creation failed');
    const { error: memberErr } = await admin.from('memberships').insert({
      user_id: createdUserId, organization_id: org.id, role: 'OWNER', entity_id: null,
    });
    if (memberErr) throw memberErr;

    await issueEmailToken({ id: createdUserId, email, name }, 'verify_email', org.slug || slugify(company), org.name || company);
    return NextResponse.json({ ok: true, verificationRequired: true, email });
  } catch {
    if (createdUserId) {
      try { await supabaseAdmin().auth.admin.deleteUser(createdUserId); } catch { /* best-effort cleanup */ }
    }
    return NextResponse.json({ error: 'We couldn’t create your account. Please try again.' }, { status: 500 });
  }
}
