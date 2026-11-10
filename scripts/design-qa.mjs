/* Visual / responsive QA for the MYLA design refinement.
 * Run against a production server: node scripts/design-qa.mjs
 * Writes DESIGN_QA_REPORT.json/.md and screenshots/design-after/. */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.env.AUDIT_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SHOTS = path.join(ROOT, 'screenshots', 'design-after');
await fs.mkdir(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
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

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const authCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await authCtx.newPage();
page.setDefaultTimeout(10000);
page.on('console', m => {
  if (m.type() !== 'error') return;
  const url = m.location()?.url || '';
  if (/\/favicon\.ico|\/icon\.svg/.test(url)) return;
  consoleErrors.push(`${m.text()} @ ${url}`);
});
page.on('pageerror', e => pageErrors.push(e.message));

const special = [
  { path: `/${ORG}/dashboard`, title: 'Dashboard' },
  { path: `/${ORG}/documentation`, title: 'Documentation' },
  { path: `/${ORG}/reports`, title: 'Reports & BI' },
  { path: `/${ORG}/settings`, title: 'Settings' },
  { path: `/${ORG}/wallets`, title: 'Client wallets' },
];

async function waitForContent(target = page) {
  await target.waitForFunction(
    () => document.querySelectorAll('.skeleton').length === 0 && (document.querySelector('main')?.innerText || '').length > 200,
    null,
    { timeout: 20000 },
  );
  await target.waitForTimeout(250);
}

async function goto(pathName, expectedTitle, ready = false) {
  const res = await page.goto(`${BASE}${pathName}`, { waitUntil: 'domcontentloaded' });
  assert(res && res.status() === 200, `HTTP ${res?.status()}`);
  await page.locator('header h1').waitFor({ state: 'visible', timeout: 10000 });
  if (expectedTitle) {
    await page.waitForFunction(
      (t) => document.querySelector('header h1')?.textContent?.trim() === t,
      expectedTitle,
      { timeout: 10000 },
    );
  }
  if (ready) await waitForContent();
  else await page.waitForTimeout(180);
  return res;
}

async function layoutAudit(label) {
  return page.evaluate((label) => {
    const de = document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;
    const bodyOverflow = document.body.scrollWidth - document.body.clientWidth;
    const badHeader = Array.from(document.querySelector('header')?.children || [])
      .map(el => el.getBoundingClientRect())
      .filter(r => r.right > de.clientWidth + 2 || r.left < -2).length;
    const aside = document.querySelector('aside');
    const main = document.querySelector('main');
    const sidebarOverlap = aside && aside.getBoundingClientRect().right > 10 && main
      ? aside.getBoundingClientRect().right - main.getBoundingClientRect().left
      : 0;
    const controls = Array.from(document.querySelectorAll('.card, .panel, .btn, .badge, .chip, .input, .select'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width >= 16 || r.height >= 16;
      });
    const radiusViolations = controls.filter(el => parseFloat(getComputedStyle(el).borderTopLeftRadius) > 12).length;
    const gradientClasses = document.querySelectorAll('[class*="bg-gradient-to"]').length;
    const blurClasses = document.querySelectorAll('[class*="backdrop-blur"]').length;
    const nestedCards = document.querySelectorAll('.card .card').length;
    const brokenImages = Array.from(document.images)
      .filter(img => img.getAttribute('src')?.startsWith('/brand/') && (!img.complete || img.naturalWidth === 0))
      .map(img => img.getAttribute('src'));
    const headerTitle = document.querySelector('header h1')?.textContent?.trim() || '';
    return { label, overflow, bodyOverflow, badHeader, sidebarOverlap, radiusViolations, gradientClasses, blurClasses, nestedCards, brokenImages, headerTitle };
  }, label);
}

try {
  await check('owner signs in', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill('owner@kestrelridge.co.zw');
    await page.locator('input[type="password"]').fill('Demo@1234');
    await page.locator('form').getByRole('button', { name: /Sign in/ }).click();
    await page.waitForURL(new RegExp(`${ORG}/dashboard`), { timeout: 20000 });
    await page.locator('header h1').waitFor();
    return `${ORG}/dashboard`;
  });

  const meta = await (await page.request.get(`${BASE}/api/${ORG}/meta`)).json();
  const projectRefs = await (await page.request.get(`${BASE}/api/${ORG}/records/projects?mode=refs`)).json();
  const projectId = projectRefs.options?.[0]?.value;
  assert(meta.config?.resources?.length, 'no enabled resources in meta');
  const resourceRoutes = meta.config.resources.map(id => ({
    path: `/${ORG}/m/${id}`,
    title: meta.resources.find(r => r.id === id)?.label || id,
  }));
  if (projectId) resourceRoutes.push({ path: `/${ORG}/projects/${projectId}`, title: 'Project detail' });
  const routes = [...special, ...resourceRoutes];
  const titleByPath = new Map(routes.map(r => [r.path, r.title]));

  await check('metadata exposes the full connected module set', async () =>
    `${meta.config.resources.length} resources · ${meta.config.modules.length} modules`);

  const viewports = [
    { name: 'large desktop', width: 1920, height: 1080, routes: special },
    { name: 'desktop', width: 1440, height: 900, routes },
    { name: 'laptop', width: 1024, height: 768, routes: special },
    { name: 'tablet', width: 768, height: 1024, routes: special },
    { name: 'mobile', width: 390, height: 844, routes },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    let maxOverflow = 0;
    for (const route of vp.routes) {
      await goto(route.path, route.title);
      const l = await layoutAudit(`${vp.name}: ${route.path}`);
      maxOverflow = Math.max(maxOverflow, l.overflow, l.bodyOverflow);
      assert(l.overflow <= 2 && l.bodyOverflow <= 2, `horizontal overflow ${l.overflow}/${l.bodyOverflow}px`);
      assert(l.badHeader === 0, `${l.badHeader} header item(s) outside viewport`);
      assert(l.sidebarOverlap <= 2, `sidebar overlaps main by ${l.sidebarOverlap}px`);
      assert(l.radiusViolations === 0, `${l.radiusViolations} control(s) with radius > 12px`);
      assert(l.gradientClasses === 0, `${l.gradientClasses} gradient class(es)`);
      assert(l.blurClasses === 0, `${l.blurClasses} backdrop-blur class(es)`);
      assert(l.nestedCards === 0, `${l.nestedCards} nested card(s)`);
      assert(l.brokenImages.length === 0, `broken logo(s): ${l.brokenImages.join(', ')}`);
      assert(!l.headerTitle.includes('Dashboard') || route.title.includes('Dashboard'), `stale header title “${l.headerTitle}”`);
    }
    await check(`${vp.name}: ${vp.routes.length} routes, no overflow / decoration / stale titles`, async () =>
      `${vp.width}×${vp.height} · ${vp.routes.length} routes · max overflow ${maxOverflow}px`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const shotRoutes = [
    ['dashboard', `/${ORG}/dashboard`],
    ['documentation', `/${ORG}/documentation`],
    ['clients', `/${ORG}/m/clients`],
    ['projects', `/${ORG}/m/projects`],
    ['reports', `/${ORG}/reports`],
    ['settings', `/${ORG}/settings`],
    ['wallets', `/${ORG}/wallets`],
  ];
  if (projectId) shotRoutes.push(['project-detail', `/${ORG}/projects/${projectId}`]);
  for (const [name, route] of shotRoutes) {
    await goto(route, titleByPath.get(route), true);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  }
  await check('desktop after screenshots captured', async () => `${shotRoutes.length} views`);

  await goto(`/${ORG}/m/clients`, 'Clients', true);
  await page.locator('tbody tr').first().locator('td').nth(1).click();
  await page.getByText('Comments & activity').waitFor({ timeout: 10000 });
  await waitForContent();
  await page.screenshot({ path: path.join(SHOTS, 'detail-drawer.png') });
  await check('detail drawer after screenshot captured', async () => 'drawer open');

  await page.setViewportSize({ width: 390, height: 844 });
  await goto(`/${ORG}/dashboard`, 'Dashboard', true);
  await page.screenshot({ path: path.join(SHOTS, 'mobile-dashboard.png'), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await goto(`/${ORG}/dashboard`, 'Dashboard', true);
  await page.screenshot({ path: path.join(SHOTS, 'tablet-dashboard.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await goto(`/${ORG}/dashboard`, 'Dashboard', true);
  await page.screenshot({ path: path.join(SHOTS, 'wide-dashboard.png'), fullPage: true });
  await check('mobile / tablet / wide dashboard after screenshots captured', async () => '3 viewports');

  // Fresh-context login screenshots and focus / reduced-motion checks.
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await loginCtx.newPage();
  await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await login.screenshot({ path: path.join(SHOTS, 'login-desktop.png'), fullPage: true });
  await login.setViewportSize({ width: 390, height: 844 });
  await login.screenshot({ path: path.join(SHOTS, 'login-mobile.png'), fullPage: true });
  const logoState = await login.evaluate(() => Array.from(document.images)
    .filter(img => img.getAttribute('src')?.startsWith('/brand/'))
    .map(img => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })));
  assert(logoState.length > 0, 'no brand logo images found');
  assert(logoState.every(i => i.loaded), `unloaded logo: ${logoState.filter(i => !i.loaded).map(i => i.src).join(', ')}`);
  await check('authentic MYLA logo loads on fresh login views', async () => `${logoState.length} logo variants`);

  await login.setViewportSize({ width: 1440, height: 900 });
  await login.keyboard.press('Tab');
  const focus = await login.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { tag: el?.tagName, outline: s.outlineStyle, outlineWidth: s.outlineWidth, shadow: s.boxShadow };
  });
  assert(focus.outline !== 'none' || focus.shadow !== 'none', `no focus indicator: ${JSON.stringify(focus)}`);
  await check('keyboard focus has a visible indicator', async () => `${focus.tag}: ${focus.outline} / ${focus.shadow.slice(0, 48)}`);
  await loginCtx.close();

  const reducedCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const reduced = await reducedCtx.newPage();
  await reduced.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const motion = await reduced.evaluate(() => {
    const btn = document.querySelector('button');
    const s = btn ? getComputedStyle(btn) : null;
    return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, transition: s?.transitionDuration, animation: s?.animationDuration };
  });
  assert(motion.matches, 'prefers-reduced-motion not active');
  assert(parseFloat(motion.transition) < 0.001, `transition duration ${motion.transition}`);
  await check('reduced-motion preference suppresses transitions', async () => `${motion.transition} / ${motion.animation}`);
  await reducedCtx.close();

  // Dark-mode consistency with the same authenticated workspace.
  const darkCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await darkCtx.addInitScript(() => localStorage.setItem('buildops-theme', 'dark'));
  const dark = await darkCtx.newPage();
  await dark.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dark.locator('input[type="email"]').fill('owner@kestrelridge.co.zw');
  await dark.locator('input[type="password"]').fill('Demo@1234');
  await dark.locator('form').getByRole('button', { name: /Sign in/ }).click();
  await dark.waitForURL(new RegExp(`${ORG}/dashboard`), { timeout: 20000 });
  await waitForContent(dark);
  assert(await dark.evaluate(() => document.documentElement.classList.contains('dark')), 'dark class not applied');
  await dark.screenshot({ path: path.join(SHOTS, 'dark-dashboard.png'), fullPage: true });
  await check('dark mode after screenshot captured', async () => 'dark class applied');
  await darkCtx.close();

  await check('no console or page errors during visual QA', async () => {
    assert(consoleErrors.length === 0, `${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
    assert(pageErrors.length === 0, `${pageErrors.length} page error(s): ${pageErrors.slice(0, 3).join(' | ')}`);
    return '0 errors';
  });
} finally {
  await browser.close();
}

const passed = results.filter(r => r.ok).length;
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  summary: { passed, total: results.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length },
  results,
  consoleErrors,
  pageErrors,
};
await fs.writeFile(path.join(ROOT, 'DESIGN_QA_REPORT.json'), JSON.stringify(report, null, 2));
const rows = results.map(r => `| ${r.ok ? 'PASS' : 'FAIL'} | ${r.name} | ${String(r.detail).replace(/\|/g, '\\|')} |`).join('\n');
await fs.writeFile(path.join(ROOT, 'DESIGN_QA_REPORT.md'), `# MYLA design QA\n\n**${passed}/${results.length} checks passed** against \`${BASE}\`.\n\n| Result | Check | Detail |\n|---|---|---|\n${rows}\n\nScreenshots: \`screenshots/design-after/\`. Browser console errors: ${consoleErrors.length}; uncaught page errors: ${pageErrors.length}.\n`);
console.log(`\n=== DESIGN QA: ${passed}/${results.length} passed ===`);
if (passed !== results.length) process.exitCode = 1;
