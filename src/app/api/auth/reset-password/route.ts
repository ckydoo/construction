import { NextResponse } from 'next/server';
import {
  confirmAccountEmail, consumeEmailToken, findAccountByEmail,
  sendPasswordChangedEmail, sendWelcomeForAccount, setAccountPassword,
} from '@/lib/auth-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || '').trim();
  const password = String(b.password || '');
  const isInvite = b.invite === true || b.invite === '1';
  if (!token) return NextResponse.json({ error: 'This link is incomplete. Request a new one.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Use a password with at least 8 characters.' }, { status: 400 });
  const row = await consumeEmailToken(token, isInvite ? 'invite' : 'reset_password');
  if (!row) return NextResponse.json({ error: 'This link has expired or has already been used. Request a new one.' }, { status: 400 });

  await setAccountPassword(row.user_id, password);
  await confirmAccountEmail(row.user_id);
  const account = await findAccountByEmail(row.email)
    || { id: row.user_id, email: row.email, name: row.email.split('@')[0], emailConfirmedAt: new Date().toISOString(), emailVerified: true };
  if (isInvite) await sendWelcomeForAccount(account);
  else await sendPasswordChangedEmail(account);
  return NextResponse.json({ ok: true, message: 'Your password has been updated. You can sign in now.' });
}
