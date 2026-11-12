import { NextResponse } from 'next/server';
import { findAccountByEmail, issueEmailToken, recentTokenCount } from '@/lib/auth-email';
import { isSmtpConfigured } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function genericResponse() {
  const available = isSmtpConfigured();
  const message = available
    ? 'If your account still needs verification, a new link is on its way.'
    : 'If your account still needs verification, we’ll send a link as soon as that option is available.';
  return NextResponse.json({ ok: true, message, available });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return genericResponse();
  try {
    // Do not queue a verification email that cannot be delivered. The outbox
    // would otherwise surprise-send it when SMTP is configured much later.
    if (isSmtpConfigured()) {
      const account = await findAccountByEmail(email);
      if (account && !account.emailVerified && await recentTokenCount(account.id, 'verify_email', 1) === 0
        && await recentTokenCount(account.id, 'verify_email', 60) < 5) {
        await issueEmailToken(account, 'verify_email');
      }
    }
  } catch { /* keep the response generic */ }
  return genericResponse();
}
