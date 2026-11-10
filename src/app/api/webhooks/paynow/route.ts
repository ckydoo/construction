import { NextResponse } from 'next/server';
import { processPaynowWebhook } from '@/lib/paynow-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const result = await processPaynowWebhook(raw, req);
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Paynow webhook failed' }, { status: e?.status || 500 });
  }
}
