import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  const org = url.searchParams.get('org') || '';
  const secret = url.searchParams.get('qa_secret') || '';
  const sessionId = url.searchParams.get('session_id') || '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>MYLA mock Stripe Checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#03203F;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:32px;border-radius:14px;box-shadow:0 10px 40px #03203f22;width:min(440px,90vw)}button{background:#F58712;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:600;cursor:pointer}p{color:#51697B;line-height:1.5}code{font-size:11px;color:#51697B}</style></head>
<body><div class="card"><h1>Test Stripe Checkout</h1><p>This local QA page saves a mock payment method and starts the 14-day trial. It makes no network call and cannot charge a card.</p><p><strong>${org}</strong> · <code>${sessionId}</code></p><button id="go">Approve trial</button><p id="msg"></p></div>
<script>document.getElementById('go').onclick=async()=>{const r=await fetch('/api/qa/billing/stripe',{method:'POST',headers:{'Content-Type':'application/json',${secret ? `'x-myla-qa-secret':'${secret}',` : ''}},body:JSON.stringify({orgSlug:'${org}',step:'checkout'})});const j=await r.json();document.getElementById('msg').textContent=r.ok?'Trial active — return to Billing.':(j.error||'Could not start trial');if(r.ok)setTimeout(()=>location.href='/${org}/billing',900);};</script></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
