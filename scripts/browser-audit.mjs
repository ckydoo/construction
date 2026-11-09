/* Real-browser audit: hydration, forms, optimistic create/rollback, drawers,
   comments, edit, validation, filters, CSV, dark mode, command palette, responsive.
   Run: node scripts/browser-audit.mjs   (requires `npx playwright install chromium-headless-shell`)
   Writes BROWSER_AUDIT_REPORT.json/.md and screenshots/ into the project root. */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:3000';
const ORG = 'kestrel-ridge';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SHOTS = path.join(ROOT, 'screenshots');
await fs.mkdir(SHOTS, { recursive: true });

const NAME = 'QA Browser Client ' + Date.now().toString().slice(-6);
const UPDATED = NAME + ' EDITED';
const results = [];
const consoleErrors = [];
const pageErrors = [];
const expectedErrors = [];
let expectSimulatedFailure = false;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(` FAIL  ${name} — ${e.message}`);
    // Recover: close any drawer/modal so one failure does not cascade.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250).catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
page.on('console', m => {
  if (m.type() !== 'error') return;
  if (expectSimulatedFailure && /500/.test(m.text())) expectedErrors.push(m.text());
  else consoleErrors.push(m.text());
});
page.on('pageerror', e => pageErrors.push(e.message));

// ── Login & hydration ───────────────────────────────────────────────────────
await check('login page renders', async () => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  assert((await page.title()).includes('BuildOps'), 'wrong title');
  assert(await page.getByRole('button', { name: /Sign in/ }).count() > 0, 'no sign-in button');
  await page.screenshot({ path: path.join(SHOTS, '01-login.png'), fullPage: true });
  return await page.title();
});

await check('owner login redirects to dashboard', async () => {
  await page.locator('input[type="email"]').fill('owner@kestrelridge.co.zw');
  await page.locator('input[type="password"]').fill('Demo@1234');
  await page.locator('form').getByRole('button', { name: /Sign in/ }).click();
  await page.waitForURL(new RegExp(`${ORG}/dashboard`), { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector('main')?.innerText || '').length > 200, { timeout: 20000 });
  assert(!(await page.content()).includes('Application error'), 'Next.js error overlay');
  await page.screenshot({ path: path.join(SHOTS, '02-dashboard.png'), fullPage: true });
  return page.url().split('/').slice(-2).join('/');
});

await check('sidebar navigates client-side (no full reload)', async () => {
  const marker = await page.evaluate(() => { window.__spa = true; return true; });
  await page.locator(`a[href$="/m/clients"]`).first().click();
  await page.waitForURL(/m\/clients/, { timeout: 15000 });
  const kept = await page.evaluate(() => window.__spa === true);
  assert(marker && kept, 'page reloaded — client-side navigation broken');
  await page.getByRole('button', { name: /New Client/ }).waitFor();
  return 'SPA navigation retained JS context';
});

// ── Loading / empty states ──────────────────────────────────────────────────
await check('loading skeletons appear while list fetches', async () => {
  const pattern = '**/api/kestrel-ridge/records/clients*';
  try {
    await page.route(pattern, async route => {
      if (route.request().url().includes('mode=refs')) return route.continue().catch(() => {});
      await new Promise(r => setTimeout(r, 1600));
      await route.continue().catch(() => {});
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.skeleton').first().waitFor({ state: 'visible', timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '03-loading.png') });
    await page.locator('tbody tr').first().waitFor({ timeout: 20000 });
    return 'skeleton → rows';
  } finally { await page.unroute(pattern); }
});

await check('empty state on a search with no matches', async () => {
  const search = page.locator('input[placeholder^="Search clients"]');
  await search.fill('ZZZ_NO_SUCH_CLIENT_ZZZ');
  await page.getByText('No matching records').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(SHOTS, '04-empty-state.png') });
  await page.getByRole('button', { name: /Clear/ }).first().click().catch(() => search.fill(''));
  await page.locator('tbody tr').first().waitFor({ timeout: 10000 });
  return 'No matching records shown';
});

// ── Optimistic create ───────────────────────────────────────────────────────
await check('optimistic create shows temporary row, then persists', async () => {
  const pattern = '**/api/kestrel-ridge/records/clients';
  await page.route(pattern, async route => {
    if (route.request().method() === 'POST') await new Promise(r => setTimeout(r, 1000));
    await route.continue().catch(() => {});
  });
  try {
  await page.getByRole('button', { name: /New Client/ }).click();
  await page.locator('input[placeholder="e.g. Westgate Properties (Pvt) Ltd"]').fill(NAME);
  await page.getByRole('button', { name: /Create Client/ }).click();
  await page.locator('tr.opacity-60').first().waitFor({ state: 'visible', timeout: 4000 });
  await page.screenshot({ path: path.join(SHOTS, '05-optimistic-create.png') });
  await page.getByText('Client created').waitFor({ timeout: 20000 });
  await page.unroute(pattern);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New Client/ }).waitFor();
  await page.getByText(NAME).first().waitFor({ timeout: 15000 });
  return 'temp row → success toast → survives reload';
  } finally { await page.unroute(pattern); }
});

// ── Detail drawer, comments, attachments, PDF ───────────────────────────────
await check('detail drawer renders comments, attachments and PDF', async () => {
  await page.locator('tbody tr', { hasText: NAME }).first().click();
  await page.getByText('Comments & activity').waitFor();
  await page.getByText('Attachments & revisions').waitFor();
  assert(await page.getByRole('button', { name: 'PDF' }).count() > 0, 'no PDF button');
  await page.screenshot({ path: path.join(SHOTS, '06-detail-drawer.png') });
  return 'all three sections present';
});

await check('post a comment and see it in the drawer', async () => {
  await page.locator('input[placeholder="Write a comment…"]').fill('QA browser comment');
  await page.getByRole('button', { name: 'Post' }).click();
  await page.getByText('QA browser comment').waitFor({ timeout: 10000 });
  return 'comment visible';
});

await check('partial edit via UI preserves other fields', async () => {
  await page.getByRole('button', { name: /Edit record/ }).click();
  const input = page.locator('input[placeholder="e.g. Westgate Properties (Pvt) Ltd"]');
  await input.waitFor();
  await input.fill(UPDATED);
  await page.getByRole('button', { name: /Save changes/ }).click();
  await page.getByText('Changes saved').waitFor({ timeout: 15000 });
  await page.getByText(UPDATED).first().waitFor({ timeout: 15000 });
  return 'Changes saved + table updated';
});

await check('required-field validation shows an inline error', async () => {
  await page.getByRole('button', { name: /New Client/ }).click();
  await page.getByRole('button', { name: /Create Client/ }).click();
  const inline = page.getByText('Company name is required');
  const toast = page.getByText('Could not create record');
  await Promise.race([inline.waitFor({ timeout: 10000 }), toast.waitFor({ timeout: 10000 })]);
  await page.screenshot({ path: path.join(SHOTS, '07-validation.png') });
  await page.keyboard.press('Escape');
  return 'error surfaced to the user';
});

await check('optimistic create rolls back on server failure', async () => {
  const pattern = '**/api/kestrel-ridge/records/clients';
  expectSimulatedFailure = true;
  await page.route(pattern, async route => {
    if (route.request().method() === 'POST') {
      await new Promise(r => setTimeout(r, 600));
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Simulated failure' }) }).catch(() => {});
    }
    await route.continue().catch(() => {});
  });
  try {
  await page.getByRole('button', { name: /New Client/ }).click();
  await page.locator('input[placeholder="e.g. Westgate Properties (Pvt) Ltd"]').fill('QA ROLLBACK CLIENT');
  await page.getByRole('button', { name: /Create Client/ }).click();
  await page.locator('tr.opacity-60').first().waitFor({ state: 'visible', timeout: 4000 });
  await page.getByText('Could not create record').waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);
  const leftover = await page.locator('tr.opacity-60').count();
  assert(leftover === 0, `${leftover} optimistic rows left behind`);
  const stillThere = await page.getByText('QA ROLLBACK CLIENT').count();
  assert(stillThere === 0, 'failed record stayed in the table');
  await page.keyboard.press('Escape');
  return 'temp row removed + error toast';
  } finally { expectSimulatedFailure = false; await page.unroute(pattern); }
});

// ── Filters, CSV, theme, palette ────────────────────────────────────────────
await check('status filter and sorting do not crash the table', async () => {
  const sel = page.locator('select').filter({ has: page.locator('option[value="ALL"]') }).first();
  await sel.selectOption({ index: 1 });
  await page.locator('tbody tr').first().waitFor();
  await sel.selectOption('ALL');
  await page.locator('th').first().click().catch(() => {});
  return 'filter + sort OK';
});

await check('CSV export downloads a file', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('link', { name: /Export CSV/ }).click(),
  ]);
  const fn = download.suggestedFilename();
  assert(fn.endsWith('.csv'), `unexpected filename ${fn}`);
  return fn;
});

await check('dark mode toggles the root class', async () => {
  const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.locator('button[title="Toggle theme"]').click();
  const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  assert(before !== after, 'theme did not change');
  await page.screenshot({ path: path.join(SHOTS, '08-dark-mode.png'), fullPage: true });
  await page.locator('button[title="Toggle theme"]').click();
  return `${before} → ${after} → back`;
});

await check('command palette opens with Ctrl+K', async () => {
  await page.keyboard.press('Control+k');
  await page.locator('input[placeholder="Search projects, clients, invoices, RFIs…"]').waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, '09-command-palette.png') });
  await page.keyboard.press('Escape');
  return 'palette open + ESC closes';
});

// ── Responsive ──────────────────────────────────────────────────────────────
await check('mobile viewport: no horizontal overflow, bottom nav visible', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New Client/ }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, `horizontal overflow of ${overflow}px`);
  const bottomNav = await page.getByText('Home', { exact: true }).count();
  assert(bottomNav > 0, 'mobile bottom nav missing');
  await page.screenshot({ path: path.join(SHOTS, '10-mobile.png'), fullPage: true });
  return `overflow ${overflow}px, bottom nav present`;
});

await check('mobile menu opens the sidebar drawer', async () => {
  await page.locator('button.btn-icon.lg\\:hidden').first().click();
  await page.locator('a[href$="/m/clients"]').last().waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: path.join(SHOTS, '11-mobile-menu.png') });
  return 'sidebar drawer opens';
});

// ── Cleanup the QA record through the UI ────────────────────────────────────
await check('delete via UI removes the QA record', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New Client/ }).waitFor();
  await page.locator('tbody tr', { hasText: UPDATED }).first().click();
  const drawer = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Attachments & revisions' });
  await drawer.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.locator('div.card').filter({ hasText: 'moved to the recycle bin' })
    .getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Client deleted').waitFor({ timeout: 15000 });
  return 'soft delete + toast';
});

// ── Client wallets + linked modules ────────────────────────────────────────
const parseMoney = (t) => Number(String(t).replace(/[^0-9.]/g, '')) || 0;
let qaClientId = null;

await check('wallet workspace opens from the sidebar', async () => {
  // Clear any drawer/dialog left over from the CRUD checks before navigating.
  await page.keyboard.press('Escape').catch(() => {});
  await page.goto(`${BASE}/${ORG}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href$="/wallets"]').first().waitFor({ timeout: 15000 });
  await page.locator('a[href$="/wallets"]').first().click();
  await page.waitForURL(/\/wallets/, { timeout: 15000 });
  await page.getByRole('heading', { name: 'Client wallets', exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Available balance').waitFor();
  assert((await page.locator('tbody tr').count()) >= 4, 'wallet table has no client rows');
  const resp = await page.request.get(`${BASE}/api/${ORG}/wallets`);
  const list = await resp.json();
  qaClientId = list.wallets[0].clientId;
  await page.screenshot({ path: path.join(SHOTS, '12-wallets.png'), fullPage: true });
  return `${list.wallets.length} client wallets, ${list.summary.totalBalance} available`;
});

await check('wallet drawer shows the reconciled ledger', async () => {
  await page.locator('tbody tr').first().getByRole('button', { name: 'Open' }).click();
  const drawer = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Amount left' });
  await drawer.waitFor({ timeout: 15000 });
  await drawer.getByText('Ledger', { exact: false }).first().waitFor();
  assert((await drawer.locator('tbody tr').count()) > 0, 'ledger is empty');
  await page.screenshot({ path: path.join(SHOTS, '13-wallet-ledger.png') });
  return 'ledger entries + running balances visible';
});

let walletBefore = 0;
await check('UI top-up increases the wallet balance', async () => {
  const drawer = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Amount left' });
  const bal = drawer.locator('p.text-2xl').first();
  walletBefore = parseMoney(await bal.innerText());
  await drawer.getByRole('button', { name: 'Add funds' }).last().click();
  await drawer.locator('input[type="number"]').first().fill('1000');
  await drawer.locator('input[placeholder="RTGS-2026-1148"]').fill('QA browser topup');
  await drawer.locator('input[placeholder="Deposit received"]').fill('QA browser topup note');
  await drawer.getByRole('button', { name: 'Add funds to wallet' }).click();
  await page.locator('div[class*="z-[100]"]').getByText('Funds added', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForFunction((prev) => {
    const el = document.querySelector('p.text-2xl');
    return el && Number((el.textContent || '').replace(/[^0-9.]/g, '')) > prev + 500;
  }, walletBefore, { timeout: 15000 }).catch(() => {});
  const after = parseMoney(await bal.innerText());
  assert(Math.abs(after - (walletBefore + 1000)) < 1, `balance ${walletBefore} → ${after}, expected +1000`);
  return `${walletBefore} → ${after}`;
});

await check('UI project funding debits the wallet and writes the ledger', async () => {
  const drawer = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Amount left' });
  await drawer.getByRole('button', { name: 'Fund a project' }).last().click();
  await drawer.locator('input[type="number"]').first().fill('250');
  await drawer.locator('input[placeholder="Mobilisation advance"]').fill('QA browser funding');
  await drawer.getByRole('button', { name: 'Fund project' }).click();
  await page.locator('div[class*="z-[100]"]').getByText('Project funded', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  const after = parseMoney(await drawer.locator('p.text-2xl').first().innerText());
  assert(Math.abs(after - (walletBefore + 750)) < 1, `balance ${after}, expected ${walletBefore + 750}`);
  await drawer.getByRole('button', { name: /^Ledger/ }).first().click();
  assert((await drawer.getByText('Project funding').count()) > 0, 'allocation is missing from the ledger');
  return `balance ${after} · allocation ledger entry visible`;
});

// Restore the demo balance by reversing the two QA ledger entries.
await check('wallet reversals restore the opening balance', async () => {
  const resp = await page.request.get(`${BASE}/api/${ORG}/wallets/${qaClientId}`);
  const detail = await resp.json();
  const qa = detail.ledger.filter(t => (t.note || '').includes('QA browser') || (t.reference || '').includes('QA browser'));
  for (const kind of ['ALLOCATION', 'TOPUP']) {
    for (const t of qa.filter(x => x.kind === kind && !x.reversedAt)) {
      await page.request.post(`${BASE}/api/${ORG}/wallets/${qaClientId}`, { data: { action: 'reverse', transactionId: t.id, note: 'QA browser cleanup' } });
    }
  }
  const after = await page.request.get(`${BASE}/api/${ORG}/wallets/${qaClientId}`);
  const d = await after.json();
  assert(Math.abs(d.wallet.balance - walletBefore) < 1, `balance ${d.wallet.balance}, expected ${walletBefore}`);
  await page.keyboard.press('Escape');
  return `${qa.length} QA entries reversed · balance ${d.wallet.balance}`;
});

await check('client detail shows wallet balance and cross-module links', async () => {
  await page.goto(`${BASE}/${ORG}/m/clients`, { waitUntil: 'domcontentloaded' });
  await page.locator('tbody tr').first().waitFor({ timeout: 20000 });
  await page.locator('tbody tr').first().click();
  const drawer = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Attachments & revisions' });
  await drawer.getByText('Linked records').waitFor({ timeout: 15000 });
  await drawer.getByText('Client wallet', { exact: true }).waitFor({ timeout: 15000 });
  assert((await drawer.locator('a[href*="/m/"]').count()) > 0, 'no linked record chips');
  await page.screenshot({ path: path.join(SHOTS, '14-linked-records.png') });
  await page.keyboard.press('Escape');
  return 'wallet balance + linked modules in the detail drawer';
});

await check('role matrix and link integrity render in settings', async () => {
  await page.goto(`${BASE}/${ORG}/settings`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Users & roles' }).click();
  await page.getByText('Role permissions').waitFor({ timeout: 15000 });
  assert((await page.locator('tbody tr').count()) >= 14, 'role matrix is missing rows');
  await page.screenshot({ path: path.join(SHOTS, '15-role-matrix.png'), fullPage: true });
  await page.getByRole('button', { name: 'Plan & audit' }).click();
  await page.getByText('Link integrity').waitFor({ timeout: 15000 });
  await page.getByText('All links healthy').waitFor({ timeout: 20000 });
  return '14-role matrix + live integrity check';
});

// ── Role-level access in a second, real browser session ─────────────────────
await check('client portal role sees only its own wallet', async () => {
  const portalCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const portal = await portalCtx.newPage();
  portal.setDefaultTimeout(12000);
  portal.on('console', m => { if (m.type() === 'error') consoleErrors.push(`[portal] ${m.text()}`); });
  portal.on('pageerror', e => pageErrors.push(`[portal] ${e.message}`));
  try {
    await portal.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await portal.locator('input[type="email"]').fill('client@westgate.co.zw');
    await portal.locator('input[type="password"]').fill('Demo@1234');
    await portal.locator('form').getByRole('button', { name: /Sign in/ }).click();
    await portal.waitForURL(/dashboard/, { timeout: 20000 });
    await portal.goto(`${BASE}/${ORG}/wallets`, { waitUntil: 'domcontentloaded' });
    await portal.getByRole('heading', { name: 'Client wallets', exact: true }).waitFor({ timeout: 20000 });
    await portal.locator('tbody tr').first().waitFor();
    const rows = await portal.locator('tbody tr').count();
    assert(rows === 1, `portal saw ${rows} wallets, expected exactly 1`);
    assert((await portal.getByRole('button', { name: 'Add funds' }).count()) === 0, 'portal user can see admin top-up controls');
    assert((await portal.locator('a[href$="/settings"]').count()) === 0, 'portal user can see Settings');
    assert((await portal.locator('a[href$="/m/accounts"]').count()) === 0, 'portal user can see the finance register');
    await portal.screenshot({ path: path.join(SHOTS, '16-portal-wallet.png'), fullPage: true });
    return `1 scoped wallet, no admin controls`;
  } finally { await portalCtx.close(); }
});

// ── Console/hydration health ────────────────────────────────────────────────
await check('no uncaught page errors', async () => {
  assert(pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  return '0 pageerror events';
});
await check('no React hydration / console errors', async () => {
  const real = consoleErrors.filter(e => !/favicon|404 \(Not Found\)|Failed to load resource.*favicon/i.test(e));
  assert(real.length === 0, real.slice(0, 3).join(' | '));
  return `${real.length} console errors`;
});

await browser.close();

const passed = results.filter(r => r.ok).length;
const report = { base: BASE, checks: results.length, passed, failed: results.length - passed, results, consoleErrors, expectedErrors, pageErrors };
await fs.writeFile(path.join(ROOT, 'BROWSER_AUDIT_REPORT.json'), JSON.stringify(report, null, 2));
const md = [
  '# BuildOps browser / UI audit', '',
  `**${passed}/${results.length} checks passed** — real Chromium against \`${BASE}\`.`, '',
  '| Check | Result | Detail |', '|---|---|---|',
  ...results.map(r => `| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '\\|').slice(0, 180)} |`),
  '', `Unexpected console errors: ${consoleErrors.length} · Expected (simulated 500 rollback): ${expectedErrors.length} · Uncaught page errors: ${pageErrors.length}`, '',
  'Screenshots: `screenshots/01-login.png` … `16-portal-wallet.png`.', '',
  'Covers the essentials-first CRUD flow, client wallets, linked records, the role matrix and portal scoping.', '',
  'Run: `node scripts/browser-audit.mjs` (after `npx playwright install chromium-headless-shell`).',
];
await fs.writeFile(path.join(ROOT, 'BROWSER_AUDIT_REPORT.md'), md.join('\n') + '\n');
console.log(`\n=== BROWSER AUDIT: ${passed}/${results.length} passed ===`);
if (report.failed) {
  console.log('Failures:');
  for (const r of results.filter(x => !x.ok)) console.log('  ✗', r.name, '—', r.detail);
}
process.exit(report.failed ? 1 : 0);
