/* QA for the "Convert to…" continuous flow.
 * Creates one throwaway client and walks the whole commercial chain through
 * the public API, asserts every copied value and derived total, then soft-
 * deletes all of them. Run against a production build (`npm run start:prod`).
 *
 * Usage: node scripts/conversion-qa.mjs
 * Env:   QA_BASE (default http://127.0.0.1:3000),
 *        QA_EMAIL / QA_PASSWORD (default demo owner on kestrel-ridge).
 *
 * The script writes /tmp/conversion-qa-ids.json so the temporary rows (and
 * their audit entries / number-sequence increments) can be fully removed
 * afterwards via the Supabase SQL connector. No data is left behind. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.QA_EMAIL || 'owner@kestrelridge.co.zw';
const PASSWORD = process.env.QA_PASSWORD || 'Demo@1234';
const OUT = '/tmp/conversion-qa-ids.json';
const LOG = '/tmp/conversion-qa-report.txt';
const stamp = Date.now().toString(36);
const label = `QA Convert ${stamp}`;
const jar = new Map();
const created = [];
const results = [];
let slug = '';

function capture(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/, (?=\S+=)/).filter(Boolean);
  for (const raw of list) {
    const pair = String(raw).split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}
function cookieHeader() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
async function call(pathname, init = {}, withCookie = true) {
  const headers = new Headers(init.headers || {});
  if (withCookie && jar.size) headers.set('cookie', cookieHeader());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${BASE}${pathname}`, {
    ...init, headers, redirect: 'manual', cache: 'no-store',
    signal: AbortSignal.timeout(45000),
  });
  if (withCookie) capture(res);
  const text = await res.text().catch(() => '');
  let body = {};
  try { body = JSON.parse(text); } catch { /* html / csv / pdf */ }
  return { res, body, text };
}
const api = (org, suffix) => `/api/${encodeURIComponent(org)}/${suffix}`;
const get = (org, suffix) => call(api(org, suffix), {});
const post = (org, suffix, body) => call(api(org, suffix), { method: 'POST', body: JSON.stringify(body) });
const patch = (org, suffix, body) => call(api(org, suffix), { method: 'PATCH', body: JSON.stringify(body) });
const del = (org, suffix) => call(api(org, suffix), { method: 'DELETE' });
const convertUrl = (resource, id) => `records/${resource}/${id}/convert`;

function track(resource, row) {
  assert.ok(row?.id, `${resource}: missing id in ${JSON.stringify(row)}`);
  created.push({ resource, id: row.id, number: row.number });
  return row;
}
async function check(name, fn) {
  try { const detail = await fn(); results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  catch (e) { results.push(`FAIL  ${name} — ${e.message}`); throw e; }
}

let failed = false;
try {
  await check('demo owner can sign in', async () => {
    const r = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
    assert.equal(r.res.status, 200, JSON.stringify(r.body));
    slug = r.body.slug;
    assert.ok(slug, 'missing org slug');
    return slug;
  });

  await check('convert endpoint rejects anonymous callers', async () => {
    const r = await call(api(slug, 'records/clients/not-a-record/convert'), {}, false);
    assert.equal(r.res.status, 401, JSON.stringify(r.body));
  });

  const client = track('clients', (await post(slug, 'records/clients', {
    name: `${label} (Pvt) Ltd`, type: 'Private developer', city: 'Harare',
    email: `qa-${stamp}@example.test`, paymentTerms: 30, status: 'ACTIVE',
  })).body.row);
  await check('QA client created', async () => client.number);

  let enquiry;
  await check('client → enquiry (Convert to…)', async () => {
    const url = convertUrl('clients', client.id);
    const options = (await get(slug, url)).body.options || [];
    assert.ok(options.some(o => o.id === 'client-to-enquiry'), JSON.stringify(options));
    const bad = await post(slug, url, {});
    assert.equal(bad.res.status, 400, 'missing "to" must fail');
    const made = await post(slug, url, { to: 'client-to-enquiry' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    enquiry = track('leads', made.body.primary);
    assert.equal(enquiry.clientId, client.id);
    assert.equal(enquiry.status, 'OPEN');
    assert.equal(enquiry.sourceResource, 'clients');
    assert.equal(enquiry.sourceId, client.id);
    return enquiry.number;
  });

  let quote;
  await check('enquiry → quotation carries the expected value', async () => {
    const patched = await patch(slug, `records/leads/${enquiry.id}`, { value: 354000, workType: 'Commercial building', notes: 'QA scope note' });
    assert.equal(patched.res.status, 200, JSON.stringify(patched.body));
    const made = await post(slug, convertUrl('leads', enquiry.id), { to: 'enquiry-to-quote' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    quote = track('estimates', made.body.primary);
    assert.equal(quote.total, 354000);
    assert.equal(quote.clientId, client.id);
    assert.equal(quote.leadId, enquiry.id);
    assert.equal(quote.status, 'DRAFT');
    return quote.number;
  });

  let tender;
  await check('quote → tender keeps the marked-up total on scaled lines', async () => {
    const patched = await patch(slug, `records/estimates/${quote.id}`, {
      items: [
        { description: 'Earthworks', detail: '', qty: 1, unitPrice: 100000, total: 100000 },
        { description: 'Concrete frame', detail: '', qty: 1, unitPrice: 200000, total: 200000 },
      ],
      markup: 18,
      submittedDate: new Date().toISOString().slice(0, 10),
    });
    assert.equal(patched.res.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.row.total, 354000, 'quote total must include 18% markup');
    const made = await post(slug, convertUrl('estimates', quote.id), { to: 'quote-to-tender' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    tender = track('bids', made.body.primary);
    assert.equal(tender.bidValue, 354000, 'tender must carry the final quote total, not the cost subtotal');
    assert.equal(tender.items.length, 2);
    assert.equal(tender.outcome, 'PENDING');
    return `${tender.number} · bidValue ${tender.bidValue}`;
  });

  let job, contract;
  await check('tender → job + prime contract (2 records, 1 click)', async () => {
    const made = await post(slug, convertUrl('bids', tender.id), { to: 'tender-to-job' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.rows.length, 2, 'bundle must create job + contract');
    job = track('projects', made.body.rows[0]);
    contract = track('contracts', made.body.rows[1]);
    assert.equal(job.contractValue, 354000);
    assert.equal(contract.projectId, job.id);
    assert.equal(contract.value, 354000);
    assert.equal(contract.sourceResource, 'projects', 'contract provenance points at the job');
    assert.equal(contract.sourceId, job.id);
    assert.equal(made.body.sourceUpdated, true, 'tender outcome must become AWARDED');
    const awarded = (await get(slug, `records/bids/${tender.id}`)).body.row;
    assert.equal(awarded.outcome, 'AWARDED');
    return `${job.number} + ${contract.number}`;
  });

  let certificate;
  await check('contract → payment certificate', async () => {
    const made = await post(slug, convertUrl('contracts', contract.id), { to: 'contract-to-certificate' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    certificate = track('paymentApps', made.body.primary);
    assert.equal(certificate.projectId, job.id);
    assert.equal(certificate.certificateNo, 1);
    assert.equal(certificate.status, 'DRAFT');
    return certificate.number;
  });

  let invoice;
  await check('certificate → tax invoice derives VAT and total', async () => {
    const patched = await patch(slug, `records/paymentApps/${certificate.id}`, {
      workValue: 100000, grossCertified: 100000, retentionHeld: 5000,
      netCertified: 95000, vatAmount: 14250, status: 'CERTIFIED',
    });
    assert.equal(patched.res.status, 200, JSON.stringify(patched.body));
    const made = await post(slug, convertUrl('paymentApps', certificate.id), { to: 'certificate-to-invoice' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    invoice = track('arInvoices', made.body.primary);
    assert.equal(invoice.amount, 95000);
    assert.equal(invoice.vatAmount, 14250);
    assert.equal(invoice.total, 109250);
    assert.equal(invoice.vatPct, 15);
    assert.equal(invoice.status, 'DRAFT');
    return `${invoice.number} · total ${invoice.total}`;
  });

  let receipt;
  await check('invoice → receipt marks the invoice PAID in full', async () => {
    const made = await post(slug, convertUrl('arInvoices', invoice.id), { to: 'invoice-to-receipt' });
    assert.equal(made.res.status, 201, JSON.stringify(made.body));
    receipt = track('payments', made.body.primary);
    assert.equal(receipt.amount, 109250);
    assert.equal(receipt.direction, 'RECEIPT');
    assert.equal(receipt.status, 'CLEARED');
    assert.equal(made.body.sourceUpdated, true);
    const paid = (await get(slug, `records/arInvoices/${invoice.id}`)).body.row;
    assert.equal(paid.status, 'PAID');
    assert.equal(paid.amountPaid, 109250);
    return `${receipt.number} · ${receipt.amount}`;
  });

  await check('a second conversion of the same step is refused', async () => {
    const r = await post(slug, convertUrl('arInvoices', invoice.id), { to: 'invoice-to-receipt' });
    assert.equal(r.res.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.existing.id, receipt.id);
  });

  await check('GET convert shows the nine-stage chain and an existing step', async () => {
    const r = await get(slug, convertUrl('payments', receipt.id));
    assert.equal(r.res.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.chain.length, 9);
    assert.equal(r.body.chain.find(s => s.id === 'payments').state, 'current');
    assert.ok(r.body.chain.filter(s => s.state === 'done').length >= 6, JSON.stringify(r.body.chain));
    assert.ok(r.body.convertedFrom?.href, 'receipt must link back to its invoice');
    return `${r.body.chain.filter(s => s.state === 'done').length} stages done`;
  });

  await check('hidden provenance is kept out of CSV exports', async () => {
    const r = await get(slug, 'records/arInvoices?mode=csv');
    assert.equal(r.res.status, 200);
    assert.ok(!r.text.includes('Converted from'), 'CSV header leaked a hidden field');
  });

  await check('branded PDF still renders for a converted record', async () => {
    const r = await get(slug, `pdf/arInvoices/${invoice.id}`);
    assert.equal(r.res.status, 200, r.text.slice(0, 200));
    assert.match(r.res.headers.get('content-type') || '', /pdf/i);
  });

  await check('Documentation page lists every module', async () => {
    const r = await call(`/${slug}/documentation`);
    assert.equal(r.res.status, 200);
    assert.ok(r.text.includes('Every module and what it does'), 'module directory missing');
  });

  await check('all temporary records soft-deleted through the API', async () => {
    for (const item of [...created].reverse()) {
      const r = await del(slug, `records/${item.resource}/${item.id}`);
      assert.equal(r.res.status, 200, `${item.resource}: ${JSON.stringify(r.body)}`);
    }
    return `${created.length} records`;
  });
} catch (e) {
  failed = true;
  results.push(`ERROR — ${e.message}`);
} finally {
  // Best-effort cleanup even if an assertion failed mid-chain.
  for (const item of [...created].reverse()) {
    try { await del(slug || 'kestrel-ridge', `records/${item.resource}/${item.id}`); } catch { /* noop */ }
  }
  fs.writeFileSync(OUT, JSON.stringify({
    orgSlug: slug, label, created,
    orgId: '5eb6b265-aa92-4eff-a36d-5a43f2f30836',
    sequencesToRestore: {
      clients: 170, leads: 49, estimates: 70, bids: 50,
      projects: 58, contracts: 57, paymentApps: 49,
      arInvoices: 65, payments: 46,
    },
  }, null, 2));
  fs.writeFileSync(LOG, results.join('\n') + '\n');
  console.log(results.join('\n'));
  console.log(`RESULT ${results.filter(r => r.startsWith('PASS')).length} PASS / ${results.filter(r => r.startsWith('FAIL')).length} FAIL`);
}
process.exit(failed ? 1 : 0);
