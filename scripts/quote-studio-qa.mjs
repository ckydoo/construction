/* End-to-end QA for Quote Studio, reusable templates and drag-and-drop file
 * workflows. Uses throwaway records, soft-deletes them through the normal API,
 * and writes the ids to /tmp for the live-database cleanup step. */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QA_BASE || 'http://127.0.0.1:3000';
const STAMP = Date.now();
const LABEL = `QA Quote Studio ${STAMP}`;
const results = [];
const ids = { stamp: STAMP, label: LABEL };
const jar = new Map();

function absorb(res) {
  let lines = [];
  if (typeof res.headers.getSetCookie === 'function') lines = res.headers.getSetCookie();
  else {
    const raw = res.headers.get('set-cookie');
    if (raw) lines = raw.split(/, (?=\S+=)/).filter(Boolean);
  }
  for (const raw of lines) {
    const pair = String(raw).split(';')[0];
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function cookieHeader() { return [...jar].map(([k,v]) => `${k}=${v}`).join('; '); }

async function call(pathname, { method='GET', body, auth=true, headers={} } = {}) {
  const h = new Headers(headers);
  if (auth && jar.size) h.set('cookie', cookieHeader());
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    h.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + pathname, { method, headers: h, body: payload, redirect: 'manual', signal: AbortSignal.timeout(60000) });
  absorb(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail || '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function must(ok, message) { if (!ok) throw new Error(message); }

async function cleanup() {
  const api = (p, method='DELETE', body) => call(p, { method, body, auth:true }).catch(() => null);
  if (ids.fileId) await api(`/api/${ids.org}/files/${ids.fileId}`);
  if (ids.documentRecordId) await api(`/api/${ids.org}/records/documents/${ids.documentRecordId}`);
  if (ids.folderId) await api(`/api/${ids.org}/library`, 'POST', { action:'deleteFolder', id:ids.folderId });
  if (ids.quoteId) await api(`/api/${ids.org}/records/estimates/${ids.quoteId}`);
  if (ids.templateId) await api(`/api/${ids.org}/quote-templates`, 'POST', { action:'delete', id:ids.templateId });
  fs.writeFileSync('/tmp/quote-studio-qa-ids.json', JSON.stringify(ids, null, 2));
}

function round2(v) { return Math.round(v * 100) / 100; }

async function runBrowserChecks(org) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: BASE })));
    const page = await context.newPage();

    await page.goto(`${BASE}/${org}/library`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Document library').first().waitFor({ timeout: 25000 });
    await page.getByText(/Drop files/).first().waitFor({ timeout: 25000 });
    check('library hydrates with drag-and-drop guidance', true, 'Document library + drop zone');

    const firstFolder = page.locator('[data-testid="library-folder-drop"] button[aria-label^="Open "]').first();
    await firstFolder.waitFor({ timeout: 25000 });
    await firstFolder.click();
    await page.getByText('Drop files into this folder').waitFor({ timeout: 25000 });
    const zone = page.locator('[data-testid="file-drop-zone"]').first();
    await zone.evaluate(el => {
      const dt = new DataTransfer();
      dt.items.add(new File(['browser drag QA'], 'qa-browser-drag.txt', { type: 'text/plain' }));
      el.dispatchEvent(new DragEvent('dragenter', { bubbles:true, cancelable:true, dataTransfer:dt }));
      el.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:dt }));
    });
    await page.getByText('Release to add these files').waitFor({ timeout: 10000 });
    check('external file drag activates the upload drop zone', true, 'Release to add these files');

    const folderCard = page.locator('[data-testid="library-folder-drop"]').first();
    await folderCard.evaluate(el => {
      const dt = new DataTransfer();
      dt.items.add(new File(['folder drag QA'], 'qa-folder-drag.txt', { type: 'text/plain' }));
      el.dispatchEvent(new DragEvent('dragenter', { bubbles:true, cancelable:true, dataTransfer:dt }));
      el.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:dt }));
    });
    await page.getByText('Release to drop here').first().waitFor({ timeout: 10000 });
    check('folder cards highlight as drop targets', true, 'Release to drop here');

    await page.goto(`${BASE}/${org}/quotes/new`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Quote Studio').first().waitFor({ timeout: 25000 });
    await page.getByText('Starter packages').waitFor({ timeout: 25000 });
    await page.getByRole('button', { name: 'Start blank' }).click();
    await page.getByText('Client & job details').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Build the price' }).waitFor({ timeout: 10000 });
    const description = page.getByPlaceholder('What work or material is this?').first();
    await description.fill('Browser QA priced line');
    const numeric = page.locator('input[type="number"]');
    await numeric.nth(1).fill('100');
    const lineOk = await description.inputValue() === 'Browser QA priced line' && await numeric.nth(1).inputValue() === '100';
    check('Quote Studio wizard navigates and accepts priced lines', lineOk, 'Start → Client & job → Build the price');
  } catch (e) {
    check('browser drag-and-drop and Quote Studio checks', false, e.message);
  } finally {
    if (browser) await browser.close();
  }
}

(async () => {
  let fatal = null;
  try {
    const login = await call('/api/auth/login', {
      method:'POST', auth:false,
      body:{ email:'owner@kestrelridge.co.zw', password:'Demo@1234' },
    });
    must(login.status === 200, `login failed: ${login.status} ${login.text.slice(0,200)}`);
    const org = login.json?.slug || 'kestrel-ridge';
    ids.org = org;
    check('demo owner signs in', login.status === 200 && login.json?.slug === 'kestrel-ridge', org);

    const anon = await call(`/api/${org}/quote-templates`, { auth:false });
    check('anonymous template access refused', anon.status === 401, `status ${anon.status}`);

    const templates0 = await call(`/api/${org}/quote-templates`);
    must(templates0.status === 200, `template list failed: ${templates0.status} ${templates0.text.slice(0,200)}`);
    check('template API lists built-in starters', (templates0.json?.starters || []).length >= 4, `${(templates0.json?.starters || []).length} starters`);
    check('template API reports write permission', templates0.json?.canWrite === true, `canWrite=${templates0.json?.canWrite}`);

    const clientRefs = await call(`/api/${org}/records/clients?mode=refs&limit=1`);
    const clientId = clientRefs.json?.options?.[0]?.value;
    must(clientId, 'no seeded client available');
    check('client reference resolves for quote link', !!clientId, clientId);

    const payload = {
      name: LABEL, workType:'Commercial building', currency:'USD', markup:10,
      scope:'QA template scope. Includes listed work only.',
      items:[
        { description:'QA labour line', detail:'Two hours', qty:2, unitPrice:100, total:200, category:'labour' },
        { description:'QA materials line', detail:'One pack', qty:1, unitPrice:300, total:300, category:'materials' },
      ],
    };
    const createdTemplate = await call(`/api/${org}/quote-templates`, {
      method:'POST', body:{ action:'create', name:LABEL, description:'Temporary QA template', payload },
    });
    must(createdTemplate.status === 201, `template create failed: ${createdTemplate.status} ${createdTemplate.text.slice(0,200)}`);
    ids.templateId = createdTemplate.json?.template?.id;
    check('reusable quote template created', !!ids.templateId, ids.templateId);

    const templates1 = await call(`/api/${org}/quote-templates`);
    check('saved template appears in workspace list', (templates1.json?.templates || []).some(t => t.id === ids.templateId), `${(templates1.json?.templates || []).length} saved`);

    const quoteBody = {
      ...payload, clientId, status:'DRAFT', revision:0, submittedDate:'',
      labourCost:200, materialCost:300, plantCost:0, subcontractCost:0, overheads:0,
    };
    const expectedTotal = round2((200 + 300) * 1.10);
    const createdQuote = await call(`/api/${org}/records/estimates`, { method:'POST', body:quoteBody });
    must(createdQuote.status === 201, `quote create failed: ${createdQuote.status} ${createdQuote.text.slice(0,300)}`);
    ids.quoteId = createdQuote.json?.row?.id;
    check('Quote Studio payload creates a normal estimate', !!ids.quoteId, createdQuote.json?.row?.number);
    check('line categories survive record normalisation', createdQuote.json?.row?.items?.[0]?.category === 'labour', createdQuote.json?.row?.items?.[0]?.category);
    check('server derives quotation total from lines + markup', round2(Number(createdQuote.json?.row?.total)) === expectedTotal, `${createdQuote.json?.row?.total} expected ${expectedTotal}`);

    const gotQuote = await call(`/api/${org}/records/estimates/${ids.quoteId}`);
    check('created quote can be reopened for editing', gotQuote.status === 200 && gotQuote.json?.row?.id === ids.quoteId, gotQuote.json?.row?.number);

    const updatedTotal = round2((200 + 300) * 1.20);
    const patched = await call(`/api/${org}/records/estimates/${ids.quoteId}`, {
      method:'PATCH', body:{ name:`${LABEL} updated`, markup:20, items:payload.items },
    });
    check('Quote Studio edit updates total', patched.status === 200 && round2(Number(patched.json?.row?.total)) === updatedTotal, `${patched.json?.row?.total} expected ${updatedTotal}`);

    const updatedTemplate = await call(`/api/${org}/quote-templates`, {
      method:'POST', body:{ action:'update', id:ids.templateId, name:`${LABEL} updated`, description:'Temporary QA template updated', payload:{ ...payload, markup:20 } },
    });
    check('saved template can be updated', updatedTemplate.status === 200 && updatedTemplate.json?.template?.name?.includes('updated'), updatedTemplate.json?.template?.name);

    const newPage = await call(`/${org}/quotes/new`);
    check('full-page Quote Studio renders', newPage.status === 200 && newPage.text.includes('Quote Studio') && newPage.text.includes('Starter packages'), `status ${newPage.status}`);
    const editPage = await call(`/${org}/quotes/${ids.quoteId}/edit`);
    check('quote edit page loads the existing record', editPage.status === 200 && editPage.text.includes('Quote Studio') && editPage.text.includes(createdQuote.json?.row?.number || 'EST-'), `status ${editPage.status}`);
    const libraryPage = await call(`/${org}/library`);
    check('library page responds', libraryPage.status === 200, `status ${libraryPage.status}`);

    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/RecordDetail.tsx'), 'utf8');
    check('record drawer has a file drop zone', source.includes('FileDropZone') && source.includes('handleRevisionFiles'), 'RecordDetail.tsx');

    await runBrowserChecks(org);

    const lib = await call(`/api/${org}/library`);
    must(lib.status === 200, `library API failed: ${lib.status}`);
    const projectId = lib.json?.projects?.[0]?.id;
    must(projectId, 'no visible project for drag-and-drop QA');
    const parentKey = `p:${projectId}:drawings`;
    const destinationKey = `p:${projectId}:contracts`;
    const folder = await call(`/api/${org}/library`, {
      method:'POST', body:{ action:'createFolder', name:`QA Drag Drop ${STAMP}`, parentKey },
    });
    must(folder.status === 201, `folder create failed: ${folder.status} ${folder.text.slice(0,200)}`);
    ids.folderId = folder.json?.folder?.id;
    ids.folderKey = folder.json?.folder?.key;
    check('temporary drag-and-drop folder created', !!ids.folderId, ids.folderKey);

    const fd = new FormData();
    fd.append('file', new Blob([`QA drag-and-drop ${STAMP}`], { type:'text/plain' }), `qa-drag-${STAMP}.txt`);
    fd.append('folderKey', ids.folderKey);
    const upload = await call(`/api/${org}/files`, { method:'POST', body:fd });
    must(upload.status === 201, `file upload failed: ${upload.status} ${upload.text.slice(0,300)}`);
    ids.fileId = upload.json?.attachment?.id;
    ids.documentRecordId = upload.json?.attachment?.recordId;
    check('drop-to-folder upload creates a controlled document', !!ids.fileId && !!ids.documentRecordId, upload.json?.attachment?.fileName);

    const libAfterUpload = await call(`/api/${org}/library`);
    const uploaded = (libAfterUpload.json?.files || []).find(f => f.id === ids.fileId);
    check('uploaded file appears in the source folder', uploaded?.folderKey === ids.folderKey, uploaded?.folderKey);

    const moved = await call(`/api/${org}/library`, {
      method:'POST', body:{ action:'moveFile', fileId:ids.fileId, folderKey:destinationKey },
    });
    const libAfterMove = await call(`/api/${org}/library`);
    const movedFile = (libAfterMove.json?.files || []).find(f => f.id === ids.fileId);
    check('drag-to-folder move updates the file destination', moved.status === 200 && movedFile?.folderKey === destinationKey, movedFile?.folderKey);

    const removedFile = await call(`/api/${org}/files/${ids.fileId}`, { method:'DELETE' });
    check('temporary attachment can be removed', removedFile.status === 200, `status ${removedFile.status}`);
    const removedDocument = await call(`/api/${org}/records/documents/${ids.documentRecordId}`, { method:'DELETE' });
    check('temporary document record soft-deleted', removedDocument.status === 200, `status ${removedDocument.status}`);
    const removedFolder = await call(`/api/${org}/library`, { method:'POST', body:{ action:'deleteFolder', id:ids.folderId } });
    check('temporary folder removed', removedFolder.status === 200, `status ${removedFolder.status}`);
    const removedTemplate = await call(`/api/${org}/quote-templates`, { method:'POST', body:{ action:'delete', id:ids.templateId } });
    check('temporary template removed', removedTemplate.status === 200, `status ${removedTemplate.status}`);
    const removedQuote = await call(`/api/${org}/records/estimates/${ids.quoteId}`, { method:'DELETE' });
    check('temporary quote soft-deleted', removedQuote.status === 200, `status ${removedQuote.status}`);

    const finalTemplates = await call(`/api/${org}/quote-templates`);
    check('no QA template remains', !(finalTemplates.json?.templates || []).some(t => String(t.name).startsWith('QA Quote Studio')), `${(finalTemplates.json?.templates || []).length} saved`);
  } catch (e) {
    fatal = e;
    check('QA run completed without a fatal error', false, e.message);
  } finally {
    await cleanup();
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    const report = results.map(r => `${r.ok?'PASS':'FAIL'}  ${r.name}${r.detail?` — ${r.detail}`:''}`).join('\n');
    fs.writeFileSync('/tmp/quote-studio-qa-report.txt', `${report}\n\nRESULT ${pass} PASS / ${fail} FAIL\n`);
    console.log(`\nRESULT ${pass} PASS / ${fail} FAIL`);
  }
  if (fatal || results.some(r => !r.ok)) process.exitCode = 1;
})();
