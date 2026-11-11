import { NextResponse } from 'next/server';
import { findAccountByEmail, issueEmailToken, recentTokenCount } from '@/lib/auth-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGE = 'If your account still needs verification, a new link is on its way.';

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: true, message: MESSAGE });
  try {
    const account = await findAccountByEmail(email);
    if (!account || account.emailConfirmedAt) return NextResponse.json({ ok: true, message: MESSAGE });
    if (await recentTokenCount(account.id, 'verify_email', 1) > 0) return NextResponse.json({ ok: true, message: MESSAGE });
    if (await recentTokenCount(account.id, 'verify_email', 60) >= 5) return NextResponse.json({ ok: true, message: MESSAGE });
    await issueEmailToken(account, 'verify_email');
  } catch { /* keep the response generic */ }
  return NextResponse.json({ ok: true, message: MESSAGE });
}
