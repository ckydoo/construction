import { NextResponse } from 'next/server';
import { billingConfig, qaEnvironmentAllowed, safeHashEqual } from './billing';

/** Local-only QA switch. Never available in a production build. */
export function qaGuard(req: Request): NextResponse | null {
  const cfg = billingConfig();
  if (cfg.mode !== 'qa' || !qaEnvironmentAllowed()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const expected = cfg.qaSecret;
  if (!expected) return null;
  const supplied = req.headers.get('x-myla-qa-secret')
    || new URL(req.url).searchParams.get('qa_secret') || '';
  if (!safeHashEqual(expected, supplied)) return NextResponse.json({ error: 'Invalid QA secret' }, { status: 401 });
  return null;
}
