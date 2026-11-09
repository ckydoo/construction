import { NextResponse } from 'next/server';
import { signIn, slugify, uniqueSlug } from '@/lib/auth';
import { supabaseAdmin, hasSupabaseConfig, hasServiceKey } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '');
    const company = String(b.company || '').trim();
    if (name.length < 2 || !company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8)
      return NextResponse.json({ error: 'Please provide your name, company, a valid email and a password of at least 8 characters.' }, { status: 400 });
    if (!hasSupabaseConfig() || !hasServiceKey())
      return NextResponse.json({ error: 'Supabase is not configured yet. Add the project URL, anon key and service-role key to .env, then run `supabase db push`.' }, { status: 503 });

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
    const userId = created.user.id;
    const slug = await uniqueSlug(company);
    const { data: org, error: orgErr } = await admin.from('organizations').insert({
      name: company, slug, legal_name: company, country: 'ZW', base_currency: 'USD',
      locale_pack: 'ZW', onboarded: false, config: {}, created_by_id: userId,
    }).select('id,slug').single();
    if (orgErr) throw orgErr;
    const { error: memberErr } = await admin.from('memberships').insert({
      user_id: userId, organization_id: org.id, role: 'OWNER', entity_id: null,
    });
    if (memberErr) throw memberErr;

    const signed = await signIn(email, password);
    if (!signed) throw new Error('Account was created but the session could not be started. Try signing in.');
    return NextResponse.json({ ok: true, slug: org.slug || slugify(company), onboarded: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Registration failed' }, { status: 500 });
  }
}
