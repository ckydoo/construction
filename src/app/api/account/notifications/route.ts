import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';
import {
  ensurePreferences, publicPreferences, updatePreferences, type PreferencePatch,
} from '@/lib/notification-preferences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await getAuth();
  if (!a) return NextResponse.json({ error: 'Your session has ended. Please sign in again.' }, { status: 401 });
  const prefs = await ensurePreferences(a.userId);
  if (!prefs) return NextResponse.json({ error: 'We couldn’t load your notification settings. Please try again.' }, { status: 500 });
  return NextResponse.json({ preferences: publicPreferences(prefs) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: Request) {
  const a = await getAuth();
  if (!a) return NextResponse.json({ error: 'Your session has ended. Please sign in again.' }, { status: 401 });
  const patch = await req.json().catch(() => ({})) as PreferencePatch;
  const prefs = await updatePreferences(a.userId, patch);
  if (!prefs) return NextResponse.json({ error: 'We couldn’t save your notification settings. Please try again.' }, { status: 500 });
  return NextResponse.json({ preferences: publicPreferences(prefs) });
}
