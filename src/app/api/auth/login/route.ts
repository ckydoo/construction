import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';

export async function POST(req: Request) {
  const b = await req.json();
  const email = String(b.email||'').trim().toLowerCase(), password = String(b.password||'');
  if (!email || !password) return NextResponse.json({ error:'Enter your email and password.' }, { status:400 });
  const user = await prisma.user.findUnique({ where:{email}, include:{memberships:{include:{organization:true}}} });
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return NextResponse.json({ error:'Incorrect email or password.' }, { status:401 });
  const membership = user.memberships[0];
  if (!membership) return NextResponse.json({ error:'No workspace is linked to this account.' }, { status:403 });
  await createSession(user.id);
  return NextResponse.json({ ok:true, slug:membership.organization.slug, onboarded:membership.organization.onboarded, name:user.name, role:membership.role });
}
