import { NextResponse } from 'next/server';
import {
  confirmAccountEmail, consumeEmailToken, findAccountByEmail, sendWelcomeForAccount,
} from '@/lib/auth-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const token = String(b.token || '').trim();
  if (!token) return NextResponse.json({ error: 'This link is incomplete. Request a new one.' }, { status: 400 });
  const row = await consumeEmailToken(token, 'verify_email');
  if (!row) return NextResponse.json({ error: 'This link has expired or has already been used. Request a new one.' }, { status: 400 });

  await confirmAccountEmail(row.user_id);
  const account = await findAccountByEmail(row.email);
  await sendWelcomeForAccount(account || { id: row.user_id, email: row.email, name: row.email.split('@')[0] });
  return NextResponse.json({ ok: true, message: 'Your email is verified. You can sign in now.' });
}
