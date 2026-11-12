/* Whole-platform responsive regression test.
 *
 * Signs in through the real UI, visits every list section, every settings tab,
 * the special workspaces, record detail / quote editor / print preview and the
 * public auth screens, then resizes each one through ten viewport widths.
 * Fails on horizontal page overflow, broken mobile/desktop navigation, clipped
 * text, undersized interactive targets and overlays that leave the viewport.
 *
 * Usage:
 *   QA_BASE=http://127.0.0.1:3000 node scripts/responsive-qa.mjs
 *   QA_BASE=https://myla-construction-erp.vercel.app QA_QUICK=1 node scripts/responsive-qa.mjs
 *
 * Optional: QA_ORG, QA_EMAIL, QA_PASSWORD, QA_OUT, QA_REPORT_ONLY=1, QA_QUICK=1
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = process.env.QA_ORG || 'kestrel-ridge';
const EMAIL = process.env.QA_EMAIL || 'owner@kestrelridge.co.zw';
const PASSWORD = process.env.QA_PASSWORD || 'Demo@1234';
const OUT = process.env.QA_OUT || '/home/user/responsive-audit.json';
const REPORT_ONLY = process.env.QA_REPORT_ONLY === '1';
const QUICK = process.env.QA_QUICK === '1';

const ALL_VIEWPORTS = [
  { name: 'small-phone', width: 320, height: 568 },
  { name: 'phone', width: 375, height: 667 },
  { name: 'phone-large', width: 414, height: 896 },
  { name: 'phone-landscape', width: 667, height: 375 },
  { name: 'phablet', width: 540, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];
const QUICK_VIEWPORTS = ['small-phone', 'phone', 'tablet', 'tablet-landscape', 'laptop'];
const VIEWPORTS = QUICK ? ALL_VIEWPORTS.filter(v => QUICK_VIEWPORTS.includes(v.name)) : ALL_VIEWPORTS;
const isMobile = (v) => v.width < 1024;

const RESOURCES = [
  'clients','contacts','leads','estimates','bids','projects','tasks','contracts','changeOrders',
  'rfis','submittals','documents','dailyLogs','meetings','punchLists','permits','vendors',
  'subcontractors','requisitions','purchaseOrders','goodsReceipts','inventory','warehouses',
  'equipment','workOrders','employees','departments','crews','timesheets','leaveRequests',
  'payRuns','expenses','certifications','training','toolboxTalks','incidents','inspections',
  'ncrs','itps','accounts','journals','budgets','arInvoices','paymentApps','apBills',
  'payments','units','rentalContracts','commissioning',
];
const SETTINGS_TABS = ['general','branding','currency','modules','users','setup','data','notifications','system'];

const PUBLIC = [
  ['login', '/login'],
  ['verify-email', '/verify-email'],
  ['reset-password', '/reset-password'],
  ['unsubscribe', '/notifications/unsubscribe'],
];
const SPECIAL = [
  ['dashboard', `/${ORG}/dashboard`],
  ['my-work', `/${ORG}/my-work`],
  ['wallets', `/${ORG}/wallets`],
  ['reports', `/${ORG}/reports`],
  ['profitability', `/${ORG}/profitability`],
  ['documentation', `/${ORG}/documentation`],
  ['library', `/${ORG}/library`],
  ['three-way-match', `/${ORG}/three-way-match`],
  ['support', `/${ORG}/support`],
  ['billing', `/${ORG}/billing`],
  ['quote-new', `/${ORG}/quotes/new`],
];
const QUICK_SPECIAL = new Set(['dashboard','wallets','profitability','three-way-match','billing','quote-new']);
const QUICK_LISTS = new Set(['clients','projects','arInvoices','employees','timesheets']);
const QUICK_TABS = new Set(['general','users','modules','system']);

/* Runs in the page. Returns concrete layout defects, not screenshots. */
function probe() {
  const vw = window.innerWidth;
  const overflow = document.documentElement.scrollWidth - vw;
  const bad = [], clipped = [], tiny = [];
  const desc = (el) => {
    const cls = typeof el.className === 'string' && el.className
      ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
    const txt = (el.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' ');
    return `${el.tagName.toLowerCase()}${cls}${txt ? ` "${txt}"` : ''}`;
  };
  const inScrollableOrClipped = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true;
      p = p.parentElement;
    }
    return false;
  };
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (overflow > 1 && (r.right > vw + 1 || r.left < -1)) {
      if (!inScrollableOrClipped(el)) bad.push({ el: desc(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
    if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap'
      && el.children.length === 0 && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2
      && (el.textContent || '').trim()) {
      clipped.push({ el: desc(el), scroll: el.scrollWidth, client: el.clientWidth });
    }
    if (el.matches('button, a[href], select, input[type="checkbox"], input[type="radio"]')
      && (r.width < 24 || r.height < 24)) {
      // WCAG 2.5.8 explicitly exempts inline links in a sentence.
      if (el.tagName === 'A' && cs.display === 'inline') continue;
      tiny.push({ el: desc(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  const bottomNav = document.querySelector('nav.fixed.bottom-0');
  const sidebar = document.querySelector('aside.fixed');
  const header = document.querySelector('header.sticky');
  return {
    overflow,
    bad: bad.slice(0, 6), badCount: bad.length,
    clipped: clipped.slice(0, 4), clippedCount: clipped.length,
    tiny: tiny.slice(0, 4), tinyCount: tiny.length,
    bottomNavVisible: bottomNav ? getComputedStyle(bottomNav).display !== 'none' : null,
    sidebarVisible: sidebar ? getComputedStyle(sidebar).display !== 'none' : null,
    headerRight: header ? Math.round(header.getBoundingClientRect().right) : null,
    headerLeft: header ? Math.round(header.getBoundingClientRect().left) : null,
    headerClipped: header ? header.scrollWidth > header.clientWidth + 2 : false,
  };
}

const issues = [];
const results = [];
const consoleErrors = [];
let checks = 0;
let currentPage = 'startup';
const notFoundPages = new Set();
const flag = (name, viewport, message) => {
  issues.push({ name, viewport, message });
  console.log(`FAIL  ${name} @ ${viewport}: ${message}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => consoleErrors.push({ page: currentPage, text: String(e.message).slice(0, 160) }));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ page: currentPage, text: m.text().slice(0, 160) }); });

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: /Sign in/ }).click();
    await page.waitForURL(new RegExp(`${ORG}/`), { timeout: 60000 });

    // Resolve real record ids so detail / edit / print screens are covered too.
    const ids = {};
    for (const resource of ['projects', 'estimates', 'arInvoices']) {
      try {
        const j = await (await page.request.get(`${BASE}/api/${ORG}/records/${resource}?pageSize=1`)).json();
        ids[resource] = (j.rows || [])[0]?.id || null;
      } catch { ids[resource] = null; }
    }
    const DYNAMIC = [];
    if (ids.projects) DYNAMIC.push(['project-detail', `/${ORG}/projects/${encodeURIComponent(ids.projects)}`]);
    if (ids.estimates) DYNAMIC.push(['quote-edit', `/${ORG}/quotes/${encodeURIComponent(ids.estimates)}/edit`]);
    // Only estimates and AR invoices are previewable (see document-preview.ts).
    if (ids.estimates) DYNAMIC.push(['print-preview-quote', `/preview/${ORG}/estimates/${encodeURIComponent(ids.estimates)}`]);
    if (ids.arInvoices) DYNAMIC.push(['print-preview-invoice', `/preview/${ORG}/arInvoices/${encodeURIComponent(ids.arInvoices)}`]);
    console.log(`Detail screens: ${DYNAMIC.map(d => d[0]).join(', ') || 'none (no records found)'}`);

    const LISTS = QUICK ? RESOURCES.filter(r => QUICK_LISTS.has(r)) : RESOURCES;
    const TABS = QUICK ? SETTINGS_TABS.filter(t => QUICK_TABS.has(t)) : SETTINGS_TABS;
    const SPECIALS = QUICK ? SPECIAL.filter(s => QUICK_SPECIAL.has(s[0])) : SPECIAL;
    const targets = [
      ...PUBLIC,
      ...SPECIALS,
      ...LISTS.map(r => [`list-${r}`, `/${ORG}/m/${r}`]),
      ...TABS.map(t => [`settings-${t}`, `/${ORG}/settings?tab=${t}`]),
      ...DYNAMIC,
    ];

    for (const [name, path] of targets) {
      currentPage = name;
      let status = 0;
      try {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        status = resp ? resp.status() : 0;
        if (status === 404) notFoundPages.add(name);
        await page.waitForFunction(
          () => (document.querySelector('main')?.innerText || document.body.innerText || '').length > 60,
          { timeout: 20000 },
        ).catch(() => {});
        await page.waitForTimeout(200);
        const row = { name, path, status, viewports: {} };
        for (const v of VIEWPORTS) {
          await page.setViewportSize({ width: v.width, height: v.height });
          await page.waitForTimeout(60);
          const r = await page.evaluate(probe);
          row.viewports[v.name] = r;
          checks++;
          if (r.overflow > 1) {
            const culprit = r.bad[0] ? ` — ${r.bad[0].el}` : '';
            flag(name, v.name, `horizontal overflow ${r.overflow}px${culprit}`);
          }
          if (name !== 'unsubscribe' && !name.startsWith('print-preview')) {
            if (isMobile(v) && r.bottomNavVisible === false && r.sidebarVisible !== null) flag(name, v.name, 'mobile bottom nav hidden');
            if (isMobile(v) && r.sidebarVisible === true) flag(name, v.name, 'desktop sidebar visible on mobile');
            if (!isMobile(v) && r.sidebarVisible === false) flag(name, v.name, 'desktop sidebar hidden');
            if (!isMobile(v) && r.bottomNavVisible === true) flag(name, v.name, 'mobile nav visible on desktop');
            if (r.headerRight !== null && (r.headerRight > v.width + 1 || r.headerLeft < -1)) {
              flag(name, v.name, `top bar extends past viewport (${r.headerLeft}..${r.headerRight})`);
            }
            if (r.headerClipped) flag(name, v.name, 'top bar contents are clipped');
          }
          if (r.tinyCount > 0) flag(name, v.name, `${r.tinyCount} undersized tap target(s) — ${r.tiny[0]?.el}`);
          if (r.clippedCount > 0) flag(name, v.name, `${r.clippedCount} clipped text node(s) — ${r.clipped[0]?.el}`);
        }
        results.push(row);
        const n = issues.filter(i => i.name === name).length;
        console.log(`${n ? 'FAIL  ' : 'ok    '} ${name.padEnd(26)} status=${status} ${n ? `${n} issue(s)` : `all ${VIEWPORTS.length} widths clean`}`);
      } catch (e) {
        results.push({ name, path, status, error: e.message.slice(0, 200) });
        flag(name, 'load', e.message.slice(0, 160));
      }
    }

    /* ---- interactive overlays at the hardest widths ---- */
    const closeAll = async () => {
      await page.keyboard.press('Escape');
      const close = page.getByRole('button', { name: 'Close navigation' });
      if (await close.count() && await close.isVisible().catch(() => false)) await close.click().catch(() => {});
      await page.waitForTimeout(120);
    };
    for (const v of [ALL_VIEWPORTS[0], ALL_VIEWPORTS[1], ALL_VIEWPORTS[5]]) {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(`${BASE}/${ORG}/m/clients`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(450);
      const cases = [
        ['mobile-nav', async () => { const b = page.getByRole('button', { name: 'Open navigation' }); if (await b.isVisible()) await b.click(); }],
        ['command-palette', async () => { await page.keyboard.press('Control+k'); }],
        ['notifications', async () => { await page.getByRole('button', { name: /Notifications/ }).click(); }],
        ['account-menu', async () => { await page.getByRole('button', { name: 'Account menu' }).click(); }],
        ['quick-create', async () => { await page.getByRole('button', { name: 'Quick create' }).click(); }],
        ['record-form', async () => { const b = page.getByRole('button', { name: /New Client/ }); if (await b.count()) await b.first().click(); }],
      ];
      for (const [label, open] of cases) {
        currentPage = `overlay-${label}`;
        try {
          await closeAll();
          await open();
          await page.waitForTimeout(200);
          const m = await page.evaluate(() => {
            const vw = window.innerWidth, vh = window.innerHeight;
            const panels = [...document.querySelectorAll('[data-overlay-root], [data-overlay-root] > div, [role="dialog"], .panel.fixed')];
            const off = [];
            for (const el of panels) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1) {
                off.push({ el: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.slice(0, 50) : ''), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) });
              }
            }
            return { docOverflow: document.documentElement.scrollWidth - vw, vh, off: off.slice(0, 4), count: panels.length };
          });
          checks++;
          if (m.docOverflow > 1) flag(`overlay-${label}`, v.name, `page overflow ${m.docOverflow}px`);
          if (m.off.length) flag(`overlay-${label}`, v.name, `panel off-screen: ${JSON.stringify(m.off[0])}`);
          console.log(`ok     overlay-${label.padEnd(18)} @ ${v.name}: ${m.count} layer(s), overflow ${m.docOverflow}px`);
        } catch (e) {
          flag(`overlay-${label}`, v.name, e.message.slice(0, 140));
        }
      }
      await closeAll();
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
  // 404s from intentionally-visited disabled-module routes are expected, not defects.
  const realConsole = consoleErrors.filter(e => !notFoundPages.has(e.page) || !/404/.test(e.text));
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, quick: QUICK, viewports: VIEWPORTS, results, consoleErrors: realConsole, ignoredConsole: consoleErrors.length - realConsole.length, notFoundPages: [...notFoundPages], issues }, null, 2));
  console.log(`\n${checks} viewport checks across ${new Set(results.map(r => r.name)).size} screens`);
  if (realConsole.length) {
    console.log(`FAIL  ${realConsole.length} console/page error(s): ${realConsole.slice(0, 3).map(e => e.text).join(' | ')}`);
    issues.push({ name: 'console', viewport: 'all', message: realConsole.slice(0, 3).map(e => e.text).join(' | ') });
  }
  console.log(`Responsive QA: ${issues.length} issue(s). Report: ${OUT}`);
  if (!REPORT_ONLY && issues.length) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
