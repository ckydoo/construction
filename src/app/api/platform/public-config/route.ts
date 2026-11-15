/* Public platform switches — booleans only, no auth required.
 * Clients use this to decide whether demo UI is shown and whether to display
 * a maintenance notice. The aggressive half of the enforcement lives in
 * requireOrg / apiAuth, not here. */
import { NextResponse } from 'next/server';
import { getPlatformPublic } from '@/lib/platform-public';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const state = await getPlatformPublic();
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
}
