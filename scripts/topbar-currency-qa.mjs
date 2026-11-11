/* Read-only browser QA for the top-bar personal display currency and
 * click-away menus. No records, settings or workspace currency are changed. */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const results = [];
const errors = [];
const mutating = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: String(detail || '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { email: 'owner@kestrelridge.co.zw', password: 'Demo@1234' },
    });
    check('demo owner signs in', login.status() === 200, `status ${login.status()}`);

    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', req => {
      const method = req.method().toUpperCase();
      if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
      if (req.url().includes('/api/auth/login')) return;
      mutating.push(`${method} ${req.url()} ${req.postData() || ''}`);
    });

    await page.goto(`${BASE}/${ORG}/m/estimates`, { waitUntil: 'networkidle' });
    await page.getByTestId('topbar-currency').waitFor({ timeout: 30000 });
    const currencyButton = page.getByTestId('topbar-currency');
    check('top bar shows a display-currency control', await currencyButton.isVisible(), await currencyButton.innerText());

    await currencyButton.click();
    await page.getByTestId('topbar-currency-panel').waitFor({ timeout: 10000 });
    check('currency menu opens', await page.getByTestId('topbar-currency-panel').isVisible(), 'Display currency panel');

    // Clicking the sidebar (outside the top bar) must dismiss the panel.
    await page.locator('aside').first().click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(150);
    check('currency menu closes after an outside click', await page.getByTestId('topbar-currency-panel').count() === 0, 'clicked sidebar');

    const notificationButton = page.getByRole('button', { name: /Notifications/ }).first();
    await notificationButton.click();
    await page.getByTestId('topbar-notifications-panel').waitFor({ timeout: 10000 });
    check('notifications menu opens', await page.getByTestId('topbar-notifications-panel').isVisible(), 'Notifications panel');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    check('notifications menu closes after an outside click', await page.getByTestId('topbar-notifications-panel').count() === 0, 'clicked main content');

    await page.getByRole('button', { name: 'Quick create' }).click();
    await page.getByTestId('topbar-quick-panel').waitFor({ timeout: 10000 });
    check('quick-create menu opens', await page.getByTestId('topbar-quick-panel').isVisible(), 'Quick create panel');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    check('quick-create menu closes after an outside click', await page.getByTestId('topbar-quick-panel').count() === 0, 'clicked main content');

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByTestId('topbar-user-panel').waitFor({ timeout: 10000 });
    check('account menu opens', await page.getByTestId('topbar-user-panel').isVisible(), 'Account panel');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    check('account menu closes after an outside click', await page.getByTestId('topbar-user-panel').count() === 0, 'clicked main content');

    await currencyButton.click();
    await page.getByTestId('topbar-currency-panel').waitFor({ timeout: 10000 });
    await page.getByTestId('topbar-currency-panel').getByRole('button', { name: /ZWG/ }).click();
    await page.waitForTimeout(250);
    const chosen = await currencyButton.innerText();
    const stored = await page.evaluate(() => localStorage.getItem('buildops-display-currency'));
    check('personal display currency can be changed to ZWG', chosen.includes('ZWG') && stored === 'ZWG', `${chosen.trim()} · localStorage ${stored}`);

    const converted = await page.locator('main').getByText(/≈/).count();
    check('record list shows converted amounts', converted > 0, `${converted} converted values`);
    const subtitle = await page.locator('header p').first().innerText();
    check('top bar identifies the personal view', subtitle.includes('ZWG view'), subtitle.trim());

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('topbar-currency').waitFor({ timeout: 30000 });
    check('display currency persists after reload', (await page.getByTestId('topbar-currency').innerText()).includes('ZWG'), 'ZWG');

    await page.goto(`${BASE}/${ORG}/dashboard`, { waitUntil: 'networkidle' });
    const dashboardConverted = await page.locator('main').getByText(/≈/).count();
    check('dashboard converts personal display amounts', dashboardConverted > 0, `${dashboardConverted} converted values`);

    await page.goto(`${BASE}/${ORG}/wallets`, { waitUntil: 'networkidle' });
    const walletConverted = await page.locator('main').getByText(/≈/).count();
    check('client wallets convert personal display amounts', walletConverted > 0, `${walletConverted} converted values`);

    await page.goto(`${BASE}/${ORG}/reports`, { waitUntil: 'networkidle' });
    const reportConverted = await page.locator('main').getByText(/≈/).count();
    check('reports still use workspace base currency', reportConverted === 0, `${reportConverted} converted values`);
    check('reports explain the workspace-base exception', await page.getByText(/Reports stay in the workspace base currency/).isVisible(), 'base currency note');
    const csv = await context.request.get(`${BASE}/api/${ORG}/records/estimates?format=csv`);
    const csvText = await csv.text();
    check('CSV export is unchanged', csv.status() === 200 && !csvText.includes('≈'), `status ${csv.status()}`);

    // Escape must close an open top-bar menu too.
    await page.getByRole('button', { name: /Notifications/ }).first().click();
    await page.getByTestId('topbar-notifications-panel').waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('Escape closes top-bar menus', await page.getByTestId('topbar-notifications-panel').count() === 0, 'Escape');

    // Return the QA browser to workspace default; this is local only.
    await page.getByTestId('topbar-currency').click();
    await page.getByTestId('topbar-currency-panel').getByRole('button', { name: /Workspace default/ }).click();
    await page.waitForTimeout(200);
    check('workspace default can be restored', !(await page.getByTestId('topbar-currency').innerText()).includes('ZWG'), 'workspace default');

    // Narrow screens: every top-bar popover must stay inside the viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/${ORG}/m/estimates`, { waitUntil: 'networkidle' });
    const fit = async (name, testid) => {
      const box = await page.getByTestId(testid).boundingBox();
      check(`${name} fits a 390px mobile viewport`, !!box && box.x >= -1 && box.x + box.width <= 391, box ? `x ${Math.round(box.x)} · width ${Math.round(box.width)}` : 'no bounding box');
    };
    await page.getByTestId('topbar-currency').click();
    await fit('currency menu', 'topbar-currency-panel');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    for (const [button, label, testid] of [
      [page.getByRole('button', { name: /Notifications/ }).first(), 'notifications menu', 'topbar-notifications-panel'],
      [page.getByRole('button', { name: 'Quick create' }), 'quick-create menu', 'topbar-quick-panel'],
      [page.getByRole('button', { name: 'Account menu' }), 'account menu', 'topbar-user-panel'],
    ]) {
      await button.click();
      await fit(label, testid);
      await page.locator('main').click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(100);
    }
    check('mobile outside clicks close the last popover', await page.getByTestId('topbar-user-panel').count() === 0, 'clicked main content');

    check('no workspace settings or business writes', mutating.length === 0, mutating.length ? mutating.slice(0, 2).join(' | ') : '0 mutating requests');
    check('no browser console errors', errors.length === 0, errors.length ? errors.slice(0, 2).join(' | ') : '0 errors');
  } catch (e) {
    check('QA run completed without a fatal error', false, e.message);
  } finally {
    await browser.close();
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    const report = results.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`).join('\n');
    fs.writeFileSync('/tmp/topbar-currency-qa-report.txt', `${report}\n\nRESULT ${pass} PASS / ${fail} FAIL\n`);
    console.log(`\nRESULT ${pass} PASS / ${fail} FAIL`);
  }
  if (results.some(r => !r.ok)) process.exitCode = 1;
})();
