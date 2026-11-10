import { NextResponse } from 'next/server';
import { qaGuard } from '@/lib/qa-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(value: string): string {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET(req: Request) {
  const denied = qaGuard(req); if (denied) return denied;
  const u = new URL(req.url);
  const org = u.searchParams.get('org') || '';
  const reference = u.searchParams.get('reference') || '';
  const token = u.searchParams.get('token') || '';
  const secret = u.searchParams.get('qa_secret') || '';
  const redirect = `/${encodeURIComponent(org)}/billing?dpo=mock`;
  const payload = JSON.stringify({ org, reference, secret, redirect }).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>MYLA mock DPO Pay checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#03203F;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:white;padding:32px;border-radius:14px;box-shadow:0 10px 40px #03203f22;width:min(460px,90vw)}button{background:#F58712;color:white;border:0;border-radius:8px;padding:12px 18px;font-weight:600;cursor:pointer}p{color:#51697B;line-height:1.5}code{font-size:11px;color:#51697B}</style></head>
<body><div class="card"><h1>Test DPO Pay hosted checkout</h1>
<p>This local QA page simulates a customer-present first payment and DPO Super Wallet tokenisation. It makes no external payment call and cannot charge a real card.</p>
<p><strong>${esc(org)}</strong> · <code>${esc(reference)}</code><br/><code>${esc(token)}</code></p>
<button id="go">Approve payment</button><p id="msg"></p></div>
<script>const D=${payload};document.getElementById('go').onclick=async()=>{const h={'Content-Type':'application/json'};if(D.secret)h['x-myla-qa-secret']=D.secret;const r=await fetch('/api/qa/billing/dpo',{method:'POST',headers:h,body:JSON.stringify({orgSlug:D.org,step:'pay',reference:D.reference})});const j=await r.json().catch(()=>({}));document.getElementById('msg').textContent=r.ok?'Payment verified — return to Billing.':(j.error||'Could not verify payment');if(r.ok)setTimeout(()=>location.href=D.redirect,900);};</script></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
