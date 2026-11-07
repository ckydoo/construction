import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, createSession, uniqueSlug } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const name = String(b.name||'').trim(), email = String(b.email||'').trim().toLowerCase(), password = String(b.password||'');
    const company = String(b.company||'').trim();
    if (name.length < 2 || !company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8)
      return NextResponse.json({ error:'Please provide your name, company, a valid email and a password of at least 8 characters.' }, { status:400 });
    if (await prisma.user.findUnique({ where:{email} }))
      return NextResponse.json({ error:'An account with that email already exists. Try signing in.' }, { status:409 });
    const user = await prisma.user.create({ data:{ name, email, passwordHash:await hashPassword(password), avatarColor:'#d97706' } });
    const org = await prisma.organization.create({ data:{
      name:company, slug:await uniqueSlug(company), legalName:company, onboarded:false, config:'{}',
    }});
    await prisma.membership.create({ data:{ userId:user.id, organizationId:org.id, role:'OWNER' } });
    await createSession(user.id);
    return NextResponse.json({ ok:true, slug:org.slug, onboarded:false });
  } catch (e:any) {
    return NextResponse.json({ error:e?.message || 'Registration failed' }, { status:500 });
  }
}
