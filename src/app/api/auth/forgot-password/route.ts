import { NextResponse } from 'next/server';
import { findAccountByEmail, issueEmailToken, recentTokenCount } from '@/lib/auth-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MESSAGE = 'If an account exists for that address, we’ve recorded your request. Password reset emails aren’t being delivered yet — ask your administrator if you need access now.';

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: true, message: MESSAGE });
  try {
    const account = await findAccountByEmail(email);
    if (!account) return NextResponse.json({ ok: true, message: MESSAGE });
    if (await recentTokenCount(account.id, 'reset_password', 1) > 0) return NextResponse.json({ ok: true, message: MESSAGE });
    if (await recentTokenCount(account.id, 'reset_password', 60) >= 5) return NextResponse.json({ ok: true, message: MESSAGE });
    await issueEmailToken(account, 'reset_password');
  } catch { /* keep the response generic */ }
  return NextResponse.json({ ok: true, message: MESSAGE });
}
