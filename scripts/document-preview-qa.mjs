#!/usr/bin/env node
/* Read-only QA for the in-drawer quote / client-invoice document preview.
 *
 * Run: npm run audit:document-preview
 * Or:  QA_BASE=https://… npm run audit:document-preview
 */
import { chromium, request } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TESTER_FILE = path.resolve(new URL('..', import.meta.url).pathname, 'TESTER_ACCOUNT.json');
const tester = JSON.parse(fs.readFileSync(TESTER_FILE, 'utf8'));
const browser = await chromium.launch({ headless: true });
const results = [];
let failures = 0;

function ok(name, detail = '') { results.push({ name, ok: true, detail }); console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`); }
function fail(name, detail = '') { failures++; results.push({ name, ok: false, detail }); console.log(` FAIL  ${name} — ${detail}`); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function upper(s) { return String(s || '').toUpperCase(); }

async function session(email, password) {
  const c = await request.newContext({ baseURL: BASE });
  const r = await c.post('/api/auth/login', { data: { email, password } });
  assert(r.status() === 200, `login returned ${r.status()}`);
  return { c, state: await c.storageState() };
}

async function checkPreview(label, org, resource, email, password, docWord) {
  const { c, state } = await session(email, password);
  const list = await (await c.get(`${BASE}/api/${org}/records/${resource}?all=1`)).json();
  const first = (list.rows || [])[0];
  assert(first?.id, `no sample ${resource} row`);
  const id = encodeURIComponent(first.id);
  const pdfPath = `/api/${org}/pdf/${resource}/${id}`;
  const previewPath = `/preview/${org}/${resource}/${id}`;
  const expectedDocNo = String(first.number || first.taxInvoiceNo || first.reference || first.id.slice(-8));

  const download = await c.get(`${BASE}${pdfPath}`);
  const disposition = download.headers()['content-disposition'] || '';
  const pdfBytes = await download.body();
  assert(download.status() === 200 && disposition.startsWith('attachment'), `download PDF ${download.status()} ${disposition}`);
  assert(pdfBytes.subarray(0, 4).toString() === '%PDF', 'download response is not a PDF');
  assert(disposition.includes(expectedDocNo), `download filename missing ${expectedDocNo}`);
  ok(`${label}: attachment download unchanged`, disposition);

  const queryVariant = await c.get(`${BASE}${pdfPath}?inline=1`);
  const queryDisposition = queryVariant.headers()['content-disposition'] || '';
  assert(queryVariant.status() === 200 && queryDisposition.startsWith('attachment'), `download with query ${queryVariant.status()} ${queryDisposition}`);
  ok(`${label}: PDF route stays attachment-only`, queryDisposition);

  const htmlPreview = await c.get(`${BASE}${previewPath}`);
  const htmlType = htmlPreview.headers()['content-type'] || '';
  const html = await htmlPreview.text();
  assert(htmlPreview.status() === 200 && htmlType.includes('text/html'), `HTML preview ${htmlPreview.status()} ${htmlType}`);
  assert(upper(html).includes(docWord) && html.includes(expectedDocNo), 'HTML preview is missing the customer-facing document content');
  assert(upper(html).includes('DESCRIPTION') && upper(html).includes('TOTAL'), 'HTML preview is missing line items/totals');
  ok(`${label}: HTML preview route`, `${htmlPreview.status()} ${htmlType}`);

  const nonPreviewable = await c.get(`${BASE}/preview/${org}/clients/${encodeURIComponent(first.id)}`);
  assert(nonPreviewable.status() === 404, `non-previewable resource returned ${nonPreviewable.status()}`);
  ok(`${label}: preview route restricted to quotes/invoices`);

  const anon = await request.newContext({ baseURL: BASE });
  const unauthorised = await anon.get(`${BASE}${previewPath}`, { maxRedirects: 0 });
  const location = unauthorised.headers().location || '';
  assert([302, 307, 308, 401, 403].includes(unauthorised.status()) && (!location || location.includes('/login')), `unauthenticated preview returned ${unauthorised.status()} ${location}`);
  ok(`${label}: preview requires sign-in`, `${unauthorised.status()} → ${location || 'denied'}`);
  await anon.dispose();

  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [], pageErrors = [], failedRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('requestfailed', r => failedRequests.push(`${r.url()} ${r.failure()?.errorText || ''}`));

  await page.goto(`${BASE}/${org}/m/${resource}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 20000 });
  await page.getByRole('button', { name: /^Edit / }).first().waitFor({ timeout: 20000 });
  await page.locator('tbody tr').first().locator('td').nth(2).click();
  const drawer = page.locator('div.fixed.inset-0.z-50').first();
  await drawer.waitFor({ timeout: 10000 });
  await page.getByText('Document preview').first().waitFor({ timeout: 10000 });

  const panel = page.locator('div.fixed.inset-0.z-50 > div.relative').first();
  const frame = page.locator('iframe[title*="preview"]').first();
  const src = await frame.getAttribute('src');
  const frameBox = await frame.boundingBox();
  const panelBox = await panel.boundingBox();
  const openHref = await page.locator('a[target="_blank"]').first().getAttribute('href');
  const previewButtons = await page.getByRole('button', { name: 'Preview', exact: true }).count();
  const downloadButtons = await page.getByRole('link', { name: 'Download PDF' }).count();
  const previewBelowFields = await page.evaluate(() => {
    const fields = document.getElementById('record-fields');
    const preview = document.getElementById('document-preview');
    return !!fields && !!preview && !!(fields.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

  assert(src && src.includes('/preview/'), `iframe is not the HTML preview: ${src}`);
  assert(openHref && openHref.includes('/preview/'), `Open link is not the HTML preview: ${openHref}`);
  assert(frameBox && frameBox.height > 400, `preview iframe too short: ${JSON.stringify(frameBox)}`);
  assert(panelBox && panelBox.width >= 700, `drawer too narrow for preview: ${panelBox?.width}`);
  assert(previewBelowFields, 'preview is not below the record fields');
  assert(previewButtons === 1, `expected one Preview footer button, got ${previewButtons}`);
  assert(downloadButtons >= 1, 'missing Download PDF link');
  assert(page.url().includes(`/m/${resource}`), `row click navigated away: ${page.url()}`);
  ok(`${label}: drawer embeds HTML preview below fields`, `${Math.round(panelBox.width)}px drawer · ${Math.round(frameBox.height)}px preview`);

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.waitForFunction(() => {
    const scroller = document.querySelector('div.fixed.inset-0.z-50 > div.relative > div.min-h-0.flex-1.overflow-y-auto');
    return !!scroller && scroller.scrollTop > 100;
  }, null, { timeout: 5000 });
  ok(`${label}: footer Preview jumps to document`);

  const frameBody = page.frameLocator('iframe[title*="preview"]').locator('.fp-sheet');
  await frameBody.waitFor({ timeout: 10000 });
  const frameText = upper(await frameBody.innerText());
  const lineRows = await page.frameLocator('iframe[title*="preview"]').locator('.fp-items tbody tr').count();
  assert(frameText.includes(docWord), 'preview iframe did not render the document');
  assert(frameText.includes(upper(expectedDocNo)), `preview iframe is missing ${expectedDocNo}`);
  assert(frameText.includes('DESCRIPTION') && frameText.includes('TOTAL'), 'preview iframe is missing line items/totals');
  assert(lineRows > 0, 'preview iframe has no line items');
  ok(`${label}: preview iframe renders document`, `${docWord} ${expectedDocNo} · ${lineRows} line item(s)`);

  const clean = consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0;
  assert(clean, JSON.stringify({ consoleErrors, pageErrors, failedRequests }));
  ok(`${label}: no console/page/request errors`);

  await ctx.close();
  await c.dispose();
}

async function checkOtherRegister() {
  const { c, state } = await session('owner@kestrelridge.co.zw', 'Demo@1234');
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/kestrel-ridge/m/clients`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 20000 });
  await page.getByRole('button', { name: /^Edit / }).first().waitFor({ timeout: 20000 });
  await page.locator('tbody tr').first().locator('td').nth(2).click();
  await page.locator('div.fixed.inset-0.z-50').first().waitFor({ timeout: 10000 });
  const count = await page.getByText('Document preview').count();
  assert(count === 0, 'clients drawer unexpectedly has a document preview');
  ok('Other registers keep the normal drawer', 'clients have no preview pane');
  await ctx.close();
  await c.dispose();
}

try {
  await checkPreview('Quotation', 'kestrel-ridge', 'estimates', 'owner@kestrelridge.co.zw', 'Demo@1234', 'QUOTATION');
  await checkPreview('Tax invoice', tester.slug, 'arInvoices', tester.email, tester.password, 'TAX INVOICE');
  await checkOtherRegister();
} catch (e) {
  fail('document preview QA', e.message);
} finally {
  await browser.close();
}

console.log(`\nDocument preview audit: ${results.length - failures}/${results.length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
