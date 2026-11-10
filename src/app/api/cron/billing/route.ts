import { NextResponse } from 'next/server';
import { billingConfig, safeHashEqual } from '@/lib/billing';
import { runBillingSweep } from '@/lib/billing-cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req: Request) {
  const cfg = billingConfig();
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const localQa = cfg.mode === 'qa' && !cfg.cronSecret;
  if (!cfg.cronSecret && !localQa) return NextResponse.json({ error: 'Billing cron secret is not configured.' }, { status: 503 });
  if (cfg.cronSecret && !safeHashEqual(cfg.cronSecret, token)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await runBillingSweep();
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Billing sweep failed' }, { status: 500 });
  }
}
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
