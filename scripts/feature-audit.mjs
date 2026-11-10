/* Dedicated QA for the three active acceptance criteria:
 *   1. only owner/admin see the whole company; staff see department + own jobs;
 *   2. Settings currencies convert reporting totals into the base currency;
 *   3. the document library exposes automatic folders, nested folders,
 *      upload, search, revisions and links to owning records.
 *
 * Run: npm run audit:features
 * Optional: AUDIT_BASE=https://… npm run audit:features
 * Writes FEATURE_AUDIT_REPORT.json/.md and screenshots/feature-library.png.
 * All temporary records, files and folders it creates are removed again.
 */
import { chromium, request } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SHOTS = path.join(ROOT, 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });
const MARK = Date.now().toString(36).slice(-6);
const PASSWORD = 'Demo@1234';
const USD_RATES = { USD: 1, ZWG: 26, ZAR: 18, EUR: 0.92, GBP: 0.78 };
const CODES = Object.keys(USD_RATES);
const results = [];
const consoleErrors = [];
const pageErrors = [];
const contexts = [];
let browser;

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const url = p => `${BASE}/api/${ORG}/${p}`;
const ratesFor = base => Object.fromEntries(CODES.map(c => [c, USD_RATES[c] / (USD_RATES[base] || 1)]));

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(` FAIL  ${name} — ${e.message}`);
  }
}
async function body(r, label) {
  if (!r.ok()) throw new Error(`${label}: HTTP ${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`);
  return r.json();
}
async function session(email) {
  const ctx = await request.newContext({ baseURL: BASE });
  contexts.push(ctx);
  const r = await ctx.post('/api/auth/login', { data: { email, password: PASSWORD } });
  await body(r, `login ${email}`);
  return ctx;
}
const get = async (ctx, p) => body(await ctx.get(url(p)), `GET ${p}`);
async function send(ctx, method, p, data) {
  return body(await ctx.fetch(url(p), { method, data }), `${method} ${p}`);
}
async function upload(ctx, folderKey, fileName, extra = {}) {
  const multipart = {
    file: { name: fileName, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 ${MARK} ${fileName}`) },
    folderKey,
    ...extra,
  };
  return body(await ctx.post(url('files'), { multipart }), `upload ${fileName}`);
}
async function remove(ctx, p) {
  const r = await ctx.delete(url(p));
  if (!r.ok()) throw new Error(`DELETE ${p}: HTTP ${r.status()} ${(await r.text().catch(() => '')).slice(0, 120)}`);
  return r.json().catch(() => ({}));
}
const projectName = p => String(p.name || p.title || p.number || p.id);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

let owner, pm, safety, client;
let originalCurrency, originalBase = 'USD', pmUserId, originalStaffEmployeeId;
let assignmentCleared = false, tempInvoiceId = null;
let browserReady = false;
const artifacts = []; // { folderId, fileIds:[], recordIds:[] }
const cleanupErrors = [];

try {
  owner = await session('owner@kestrelridge.co.zw');
  pm = await session('pm@kestrelridge.co.zw');
  safety = await session('safety@kestrelridge.co.zw');
  client = await session('client@westgate.co.zw');

  const ownerMeta = await get(owner, 'meta');
  originalCurrency = ownerMeta.org.currency;
  originalBase = ownerMeta.org.baseCurrency || 'USD';
  const pmUser = ownerMeta.users.find(u => u.email === 'pm@kestrelridge.co.zw');
  assert(pmUser, 'PM member not found in owner meta');
  pmUserId = pmUser.id;
  originalStaffEmployeeId = pmUser.staffEmployeeId;

  let ownerProjects, ownerWallets, pmProjects, pmWallets, hiddenProjectId;
  await check('owner sees the whole company', async () => {
    assert(ownerMeta.scope.kind === null, `owner scope is ${ownerMeta.scope.kind}`);
    ownerProjects = (await get(owner, 'records/projects?page=1&pageSize=100')).rows;
    ownerWallets = await get(owner, 'wallets');
    assert(ownerProjects.length >= 3, `only ${ownerProjects.length} projects`);
    assert(ownerWallets.wallets.length >= 5, `only ${ownerWallets.wallets.length} wallets`);
    assert(ownerMeta.users.length > 1 && ownerMeta.clients.length > 0, 'owner team/client lists are incomplete');
    return `${ownerProjects.length} jobs · ${ownerWallets.wallets.length} wallets · ${ownerMeta.users.length} users`;
  });

  await check('internal staff see fewer jobs and fewer wallets than owner', async () => {
    const accounts = [
      ['project manager', 'pm@kestrelridge.co.zw'], ['finance manager', 'finance@kestrelridge.co.zw'],
      ['HR manager', 'hr@kestrelridge.co.zw'], ['safety officer', 'safety@kestrelridge.co.zw'],
      ['procurement', 'procurement@kestrelridge.co.zw'],
    ];
    const details = [];
    for (const [label, email] of accounts) {
      const ctx = await session(email);
      const meta = await get(ctx, 'meta');
      const projects = (await get(ctx, 'records/projects?page=1&pageSize=100')).rows;
      const wallets = await get(ctx, 'wallets');
      assert(meta.scope.kind === 'staff', `${label} scope is ${meta.scope.kind}`);
      assert(projects.length < ownerProjects.length, `${label} sees all ${projects.length} jobs`);
      assert(wallets.wallets.length < ownerWallets.wallets.length, `${label} sees all ${wallets.wallets.length} wallets`);
      assert(meta.users.length === 1, `${label} sees ${meta.users.length} team members`);
      details.push(`${label.split(' ')[0]} ${projects.length}/${wallets.wallets.length}`);
      await ctx.dispose(); contexts.splice(contexts.indexOf(ctx), 1);
    }
    return details.join(' · ');
  });

  await check('two staff roles have genuinely different job sets', async () => {
    pmProjects = (await get(pm, 'records/projects?page=1&pageSize=100')).rows;
    pmWallets = await get(pm, 'wallets');
    const safetyProjects = (await get(safety, 'records/projects?page=1&pageSize=100')).rows;
    const a = pmProjects.map(p => p.id), b = safetyProjects.map(p => p.id);
    assert(!sameSet(a, b), 'PM and safety see the same jobs');
    const ownerIds = new Set(ownerProjects.map(p => p.id));
    assert([...a, ...b].every(id => ownerIds.has(id)), 'staff job is outside the owner list');
    hiddenProjectId = ownerProjects.find(p => !a.includes(p.id))?.id;
    assert(hiddenProjectId, 'no job hidden from PM was found');
    return `PM ${a.length} jobs · safety ${b.length} jobs · hidden ${hiddenProjectId.slice(-8)}`;
  });

  await check('external client portal remains scoped', async () => {
    const meta = await get(client, 'meta');
    const projects = (await get(client, 'records/projects?page=1&pageSize=100')).rows;
    const wallets = await get(client, 'wallets');
    assert(meta.scope.kind === 'client', `client scope is ${meta.scope.kind}`);
    assert(projects.length === 1 && wallets.wallets.length === 1, 'client portal is not scoped');
    return '1 job · 1 wallet';
  });

  await check('wallet detail and global search deny hidden records', async () => {
    const visibleIds = new Set(pmWallets.wallets.map(w => w.clientId));
    const hiddenWallet = ownerWallets.wallets.find(w => !visibleIds.has(w.clientId));
    assert(hiddenWallet, 'no wallet hidden from PM was found');
    const denied = await pm.get(url(`wallets/${hiddenWallet.clientId}`));
    assert(denied.status() === 403 || denied.status() === 404, `hidden wallet returned ${denied.status()}`);
    const hiddenName = projectName(ownerProjects.find(p => p.id === hiddenProjectId));
    const search = await get(pm, `search?q=${encodeURIComponent(hiddenName.slice(0, 24))}`);
    assert(!search.results.some(r => r.id === hiddenProjectId), 'hidden job appeared in command-palette search');
    return `wallet ${denied.status()} · search clean`;
  });

  await check('unassigned staff account sees no jobs, wallets or wallet money', async () => {
    assignmentCleared = true;
    await send(owner, 'PATCH', 'settings', { action: 'setStaffEmployee', userId: pmUserId, employeeId: null });
    const meta = await get(pm, 'meta');
    const projects = await get(pm, 'records/projects?page=1&pageSize=100');
    const wallets = await get(pm, 'wallets');
    const overview = await get(pm, 'overview');
    assert(meta.scope.kind === 'staff' && meta.scope.projectIds.length === 0, 'staff assignment was not cleared');
    assert(projects.total === 0 && wallets.wallets.length === 0, 'unassigned staff still sees company rows');
    assert(Number(overview.kpis.walletBalance || 0) === 0, 'unassigned staff sees wallet money');
    await send(owner, 'PATCH', 'settings', { action: 'setStaffEmployee', userId: pmUserId, employeeId: originalStaffEmployeeId || null });
    assignmentCleared = false;
    const restored = await get(pm, 'meta');
    assert(restored.scope.projectIds.length > 0, 'staff assignment was not restored');
    return 'cleared → 0 jobs / 0 wallets → restored';
  });

  // ── Currency settings and base-currency reporting ────────────────────────
  let currencySaved = false, zwgInvoiceDelta = 0;
  await check('Settings saves enabled currencies and manual rates', async () => {
    currencySaved = true;
    const currency = { base: 'USD', enabled: CODES, rates: { ...USD_RATES }, updatedAt: null, updatedBy: null };
    const saved = await send(owner, 'PATCH', 'settings', { action: 'updateCurrency', currency, baseCurrency: 'USD' });
    const meta = await get(owner, 'meta');
    assert(saved.currency.base === 'USD' && meta.org.currency.rates.ZWG === 26, 'currency settings did not persist');
    assert(meta.org.currency.enabled.length >= 5, 'enabled currencies did not persist');
    return 'USD base · 5 currencies · ZWG 26';
  });

  await check('a ZWG invoice converts to USD in dashboard totals', async () => {
    const before = await get(owner, 'overview');
    const zwgBefore = (before.fx.byCurrency || []).find(x => x.currency === 'ZWG')?.baseAmount || 0;
    const invoice = await send(owner, 'POST', 'records/arInvoices', {
      name: `QA ZWG conversion ${MARK}`, projectId: ownerProjects[0].id,
      invoiceDate: '2026-11-07', total: 260000, currency: 'ZWG', status: 'ISSUED',
    });
    tempInvoiceId = invoice.row.id;
    const after = await get(owner, 'overview');
    const zwgAfter = (after.fx.byCurrency || []).find(x => x.currency === 'ZWG')?.baseAmount || 0;
    zwgInvoiceDelta = zwgAfter - zwgBefore;
    assert(after.currency === 'USD' && after.fx.base === 'USD', 'overview is not reporting in USD');
    assert(Math.abs(zwgInvoiceDelta - 10000) < 0.01, `260000 ZWG converted to ${zwgInvoiceDelta} USD, expected 10000`);
    assert(Math.abs((after.kpis.billed - before.kpis.billed) - 10000) < 0.01, 'billed KPI did not convert');
    return '260000 ZWG → 10000 USD';
  });

  await check('changing the base currency re-expresses every saved rate', async () => {
    const switched = await send(owner, 'PATCH', 'settings', {
      action: 'updateCurrency',
      currency: { base: 'USD', enabled: CODES, rates: { ...USD_RATES } },
      baseCurrency: 'ZWG',
    });
    assert(switched.currency.base === 'ZWG' && switched.currency.rates.ZWG === 1, 'new base rate is not 1');
    assert(Math.abs(switched.currency.rates.USD - 1 / 26) < 0.0001, 'USD rate was not inverted');
    const meta = await get(owner, 'meta');
    assert(meta.org.baseCurrency === 'ZWG', 'organisation base currency did not change');
    const org = await send(owner, 'PATCH', 'settings', { action: 'updateOrg', baseCurrency: 'ZAR' });
    const meta2 = await get(owner, 'meta');
    assert(org.currency.base === 'ZAR' && meta2.org.baseCurrency === 'ZAR', 'General tab base currency is inconsistent');
    assert(Math.abs(meta2.org.currency.rates.ZWG - 26 / 18) < 0.0001, 'General tab did not re-express rates');
    return 'USD → ZWG → ZAR, rates preserved';
  });

  await check('Reports and wallets expose base-currency FX data', async () => {
    const overview = await get(owner, 'overview');
    const wallets = await get(owner, 'wallets');
    assert(overview.fx.enabled.length > 1 && Array.isArray(overview.fx.byCurrency), 'no FX breakdown on reports feed');
    assert(wallets.baseCurrency && wallets.fx && wallets.summary.baseCurrency === wallets.baseCurrency, 'wallets summary is not in base currency');
    assert(wallets.wallets.every(w => Number.isFinite(w.baseBalance) && Number.isFinite(w.baseToppedUp)), 'wallet rows lack converted totals');
    return `${wallets.baseCurrency} · ${overview.fx.byCurrency.length} currency rows`;
  });

  // ── Document library ─────────────────────────────────────────────────────
  let primaryProject, primaryFolder, primaryAttachA, primaryAttachB, primaryRecordId;
  let hiddenFolder, hiddenAttach, hiddenRecordId;
  await check('library exposes one folder per job and four automatic buckets', async () => {
    const lib = await get(owner, 'library');
    assert(lib.projects.length >= 3, `only ${lib.projects.length} jobs in library`);
    assert(lib.canUpload === true, 'owner cannot upload to the library');
    primaryProject = lib.projects[0];
    return `${lib.projects.length} jobs · Drawings / Contracts / Site photos / Handover`;
  });

  await check('nested custom folder, upload, revision chain and owning record', async () => {
    const drawings = `p:${primaryProject.id}:drawings`;
    primaryFolder = (await send(owner, 'POST', 'library', {
      action: 'createFolder', name: `QA Structural ${MARK}`, parentKey: drawings,
    })).folder;
    artifacts.push({ folderId: primaryFolder.id, fileIds: [], recordIds: [] });
    const a = await upload(owner, primaryFolder.key, `qa-${MARK}-rev-a.pdf`);
    primaryAttachA = a.attachment;
    primaryRecordId = primaryAttachA.recordId;
    artifacts.at(-1).fileIds.push(primaryAttachA.id);
    artifacts.at(-1).recordIds.push(primaryRecordId);
    const b = await upload(owner, primaryFolder.key, `qa-${MARK}-rev-b.pdf`, {
      recordId: primaryRecordId, resource: 'documents', supersedesId: primaryAttachA.id,
    });
    primaryAttachB = b.attachment;
    artifacts.at(-1).fileIds.push(primaryAttachB.id);
    const lib = await get(owner, 'library');
    const revisions = lib.files.filter(f => f.recordId === primaryRecordId);
    assert(revisions.length === 2, `expected 2 revisions, got ${revisions.length}`);
    assert(revisions.some(f => f.revisionLabel === 'Rev B' && f.isLatest), 'revision B is not the latest');
    const docs = await get(owner, 'records/documents?page=1&pageSize=100');
    const doc = docs.rows.find(r => r.id === primaryRecordId);
    assert(doc, 'library upload did not create a document register row');
    assert(doc.projectId === primaryProject.id, 'document is not linked to its job');
    assert(doc.type === 'Drawing', `nested folder inherited type ${doc.type}`);
    return `${primaryFolder.name} · Rev A/B · ${doc.number}`;
  });

  await check('moving a document keeps every revision in the new folder', async () => {
    const contracts = `p:${primaryProject.id}:contracts`;
    await send(owner, 'POST', 'library', { action: 'moveFile', fileId: primaryAttachA.id, folderKey: contracts });
    const lib = await get(owner, 'library');
    const moved = lib.files.filter(f => [primaryAttachA.id, primaryAttachB.id].includes(f.id));
    assert(moved.length === 2 && moved.every(f => f.folderKey === contracts), 'revision chain was split across folders');
    return 'both revisions moved to Contracts';
  });

  await check('library hides folders and files on jobs a staff member cannot see', async () => {
    const drawings = `p:${hiddenProjectId}:drawings`;
    hiddenFolder = (await send(owner, 'POST', 'library', {
      action: 'createFolder', name: `QA Hidden ${MARK}`, parentKey: drawings,
    })).folder;
    artifacts.push({ folderId: hiddenFolder.id, fileIds: [], recordIds: [] });
    const uploaded = await upload(owner, hiddenFolder.key, `qa-${MARK}-hidden.pdf`);
    hiddenAttach = uploaded.attachment;
    hiddenRecordId = hiddenAttach.recordId;
    artifacts.at(-1).fileIds.push(hiddenAttach.id);
    artifacts.at(-1).recordIds.push(hiddenRecordId);
    const pmLib = await get(pm, 'library');
    assert(!pmLib.projects.some(p => p.id === hiddenProjectId), 'hidden job appears in PM library');
    assert(!pmLib.folders.some(f => f.id === hiddenFolder.id), 'hidden folder appears in PM library');
    assert(!pmLib.files.some(f => f.id === hiddenAttach.id), 'hidden file appears in PM library');
    const denied = await pm.get(url(`files/${hiddenAttach.id}`));
    assert(denied.status() === 403 || denied.status() === 404, `hidden file download returned ${denied.status()}`);
    return `hidden from PM · download ${denied.status()}`;
  });

  await check('document library page renders folders, search and record links', async () => {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill('owner@kestrelridge.co.zw');
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: /Sign in/ }).click();
    await page.waitForURL(new RegExp(`${ORG}/dashboard`), { timeout: 25000 });
    await page.goto(`${BASE}/${ORG}/library`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Document library' }).waitFor();
    await page.getByRole('button', { name: `Open ${projectName(primaryProject)}` }).click();
    for (const label of ['Drawings', 'Contracts', 'Site photos', 'Handover']) {
      await page.getByRole('button', { name: `Open ${label}` }).waitFor();
    }
    await page.getByRole('button', { name: 'Open Drawings' }).click();
    await page.getByText(primaryFolder.name).waitFor();
    await page.getByPlaceholder('Search all files…').fill(`qa-${MARK}-rev-b`);
    await page.getByText(`qa-${MARK}-rev-b.pdf`).first().waitFor();
    assert(await page.getByRole('button', { name: 'Record' }).count() > 0, 'no link to the owning record');
    await page.screenshot({ path: path.join(SHOTS, 'feature-library.png'), fullPage: true });
    browserReady = true;
    assert(consoleErrors.length === 0 && pageErrors.length === 0, `browser errors: ${[...consoleErrors, ...pageErrors].join(' | ')}`);
    return 'folders · search · revisions · record links';
  });
} finally {
  // Restore settings/assignment first, then remove every temporary artifact.
  const safe = async (label, fn) => { try { await fn(); } catch (e) { cleanupErrors.push(`${label}: ${e.message}`); } };
  if (owner) {
    if (assignmentCleared && pmUserId) {
      await safe('restore staff assignment', () => send(owner, 'PATCH', 'settings', {
        action: 'setStaffEmployee', userId: pmUserId, employeeId: originalStaffEmployeeId || null,
      }));
    }
    if (tempInvoiceId) await safe('remove temporary invoice', () => remove(owner, `records/arInvoices/${tempInvoiceId}`));
    for (const art of artifacts) {
      for (const id of art.fileIds) await safe(`remove file ${id.slice(-8)}`, () => remove(owner, `files/${id}`));
      for (const id of art.recordIds) await safe(`remove document ${id.slice(-8)}`, () => remove(owner, `records/documents/${id}`));
      if (art.folderId) await safe(`remove folder ${art.folderId.slice(-8)}`, () => send(owner, 'POST', 'library', { action: 'deleteFolder', id: art.folderId }));
    }
    const restore = originalCurrency || { base: originalBase, enabled: CODES, rates: ratesFor(originalBase), updatedAt: null, updatedBy: null };
    await safe('restore currency settings', () => send(owner, 'PATCH', 'settings', {
      action: 'updateCurrency', currency: restore, baseCurrency: originalBase,
    }));
  }
  if (browser) await browser.close().catch(() => {});
  for (const ctx of contexts) await ctx.dispose().catch(() => {});
}

results.push({
  name: 'QA cleanup restores live demo data',
  ok: cleanupErrors.length === 0,
  detail: cleanupErrors.length ? cleanupErrors.join(' | ') : 'currency, assignment, records, files and folders restored',
});
if (cleanupErrors.length) console.log(` FAIL  QA cleanup — ${cleanupErrors.join(' | ')}`);
else console.log('  ok   QA cleanup — restored');

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
const report = {
  generatedAt: new Date().toISOString(), base: BASE, org: ORG,
  passed, failed, total: results.length,
  browserReady, consoleErrors, pageErrors, results,
};
await fs.writeFile(path.join(ROOT, 'FEATURE_AUDIT_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(ROOT, 'FEATURE_AUDIT_REPORT.md'), [
  '# Role, currency and document-library QA', '',
  `- Base: \`${BASE}\``,
  `- Date: ${report.generatedAt}`,
  `- Result: **${passed}/${results.length} passed**${failed ? `, **${failed} failed**` : ''}`,
  `- Screenshot: \`screenshots/feature-library.png\``, '',
  '| Check | Result | Detail |', '|---|---|---|',
  ...results.map(r => `| ${r.name.replace(/\|/g, '\\|')} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail || '').replace(/\|/g, '\\|')} |`),
  '',
].join('\n'));
console.log(`\nFEATURE_AUDIT ${passed}/${results.length} passed${failed ? ` · ${failed} FAILED` : ''}`);
process.exitCode = failed ? 1 : 0;
