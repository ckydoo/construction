import { NextResponse } from 'next/server';
import { findAccountByEmail, issueEmailToken, recentTokenCount } from '@/lib/auth-email';
import { isSmtpConfigured } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function message() {
  return isSmtpConfigured()
    ? 'If an account exists for that address, password reset instructions will be sent if eligible.'
    : 'Password reset email is currently unavailable. Please contact your administrator for help.';
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !isSmtpConfigured()) return NextResponse.json({ ok: true, message: message() });
  try {
    const account = await findAccountByEmail(email);
    if (account && await recentTokenCount(account.id, 'reset_password', 1) === 0
      && await recentTokenCount(account.id, 'reset_password', 60) < 5)
      await issueEmailToken(account, 'reset_password');
  } catch { /* keep the response generic */ }
  return NextResponse.json({ ok: true, message: message() });
}
