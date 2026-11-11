#!/usr/bin/env node
/* Full-viewport overlay QA.
 *
 * Checks that drawers, confirmation modals, the mobile navigation, the command
 * palette and the library drop layer all paint a faded backdrop from viewport
 * y=0 to the bottom, with no unfaded strip above them. Also verifies that the
 * overlay root is portalled directly to document.body with zero margin.
 *
 * Run: npm run audit:overlay
 * Or:  QA_BASE=https://… npm run audit:overlay
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, request } from 'playwright';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BASE = (process.env.QA_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ORG = 'kestrel-ridge';
const EMAIL = 'owner@kestrelridge.co.zw';
const PASSWORD = 'Demo@1234';
const HEADER_STRIP = { x: 300, y: 1, w: 120, h: 8 };
const MOBILE_STRIP = { x: 300, y: 1, w: 60, h: 8 };

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
let failures = 0;
function ok(name, detail = '') { results.push({ name, ok: true, detail }); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
function fail(name, detail = '') { failures++; results.push({ name, ok: false, detail }); console.error(`FAIL  ${name} — ${detail}`); }
async function check(name, fn) { try { ok(name, await fn()); } catch (e) { fail(name, e.message); } }
function near(a, b, tolerance = 1) { return Math.abs(Number(a) - Number(b)) <= tolerance; }

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

await check('every full-screen overlay uses one body-level portal root', async () => {
  const overlay = read('src/components/Overlay.tsx');
  assert.match(overlay, /'use client'/, 'Overlay must be a client component');
  assert.match(overlay, /createPortal/, 'Overlay must portal to document.body');
  assert.match(overlay, /data-overlay-root/, 'Overlay root needs a stable data attribute');
  assert.match(overlay, /margin:\s*0/, 'Overlay root needs an explicit zero margin');
  const offenders = walk(path.join(ROOT, 'src'))
    .filter(f => f.endsWith('.tsx') && !f.endsWith(`${path.sep}Overlay.tsx`))
    .filter(f => /fixed inset-0/.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(ROOT, f));
  assert.deepEqual(offenders, [], `full-screen roots still outside the portal: ${offenders.join(', ')}`);
  const source = ['src/components/ui.tsx', 'src/components/AppShell.tsx', 'src/app/[org]/library/page.tsx'].map(read).join('\n');
  for (const kind of ['drawer', 'confirm-dialog', 'mobile-nav', 'command-palette', 'library-drop']) {
    assert.ok(source.includes(`kind="${kind}"`), `missing overlay kind ${kind}`);
  }
  return '5 overlay kinds · one portal root · no loose fixed inset-0 layer';
});

const api = await request.newContext({ baseURL: BASE });
const login = await api.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } });
assert.equal(login.status(), 200, `login returned ${login.status()}`);
const state = await api.storageState();
const browser = await chromium.launch({ headless: true });
const probe = await browser.newPage({ colorScheme: 'light' });
const desktop = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
const mobile = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light', isMobile: true, hasTouch: true });
const page = await desktop.newPage();
const mobilePage = await mobile.newPage();

const consoleErrors = [];
const pageErrors = [];
for (const p of [page, mobilePage]) {
  p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p.on('pageerror', e => pageErrors.push(e.message));
}

async function stripLuminance(buffer, region) {
  const src = `data:image/png;base64,${buffer.toString('base64')}`;
  return probe.evaluate(async ({ src, region }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(region.x, region.y, region.w, region.h).data;
    let total = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      count++;
    }
    return total / count;
  }, { src, region });
}

async function waitForNoOverlay(p) {
  await p.waitForFunction(() => document.querySelectorAll('div[data-overlay-root]').length === 0, null, { timeout: 5000 });
}

async function clearOverlays(p) {
  await p.keyboard.press('Escape').catch(() => {});
  const backdrop = p.locator('div[data-overlay-root] > div.absolute.inset-0').first();
  if (await backdrop.count()) {
    await backdrop.click({ position: { x: 330, y: 400 }, force: true }).catch(() => {});
  }
  await p.evaluate(() => {
    const el = document.querySelector('[data-testid="library-page"]');
    if (!el) return;
    for (let i = 0; i < 4; i++) {
      const dt = new DataTransfer();
      dt.items.add(new File(['overlay-qa'], 'overlay-qa.txt', { type: 'text/plain' }));
      el.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }).catch(() => {});
  await waitForNoOverlay(p).catch(() => {});
}

async function measureOverlay({ p, kind, minZ, baseline, region, fullPanel = false, rootBackground = false, shotPath }) {
  const selector = `div[data-overlay-kind="${kind}"]`;
  await p.locator(selector).waitFor({ timeout: 15000 });
  const data = await p.evaluate(({ selector, region, fullPanel }) => {
    const alpha = value => {
      const m = String(value || '').match(/rgba?\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return parts.length >= 4 ? parts[3] : 1;
    };
    const box = r => ({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom });
    const root = document.querySelector(selector);
    if (!root) return null;
    const cs = getComputedStyle(root);
    const children = Array.from(root.children);
    const backdrop = children.find(c => c.classList.contains('absolute') && c.classList.contains('inset-0'));
    const panel = fullPanel ? children.find(c => c.classList.contains('relative')) : null;
    const bcs = backdrop ? getComputedStyle(backdrop) : null;
    const hit = document.elementFromPoint(region.x + 2, region.y + 2);
    const stack = document.elementsFromPoint(region.x + 2, region.y + 2);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      count: document.querySelectorAll('div[data-overlay-root]').length,
      root: {
        ...box(root.getBoundingClientRect()),
        parentIsBody: root.parentElement === document.body,
        position: cs.position,
        zIndex: cs.zIndex,
        marginTop: cs.marginTop,
        pointerEvents: cs.pointerEvents,
        backgroundColor: cs.backgroundColor,
        alpha: alpha(cs.backgroundColor),
      },
      backdrop: backdrop ? {
        ...box(backdrop.getBoundingClientRect()),
        backgroundColor: bcs.backgroundColor,
        alpha: alpha(bcs.backgroundColor),
      } : null,
      panel: panel ? box(panel.getBoundingClientRect()) : null,
      topHit: {
        insideOverlay: !!hit && (hit === root || root.contains(hit)),
        stackHasOverlay: stack.some(el => el === root || root.contains(el)),
        className: String(hit?.className || ''),
      },
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  }, { selector, region, fullPanel });

  assert.ok(data, `${kind} overlay root not found`);
  assert.equal(data.count, 1, `expected exactly one overlay root, found ${data.count}`);
  assert.ok(data.root.parentIsBody, `${kind} is not portalled to document.body`);
  assert.equal(data.root.position, 'fixed', `${kind} is not fixed`);
  assert.equal(data.root.marginTop, '0px', `${kind} has a ${data.root.marginTop} top margin`);
  assert.ok(Number(data.root.zIndex) >= minZ, `${kind} z-index ${data.root.zIndex} is below ${minZ}`);
  for (const key of ['top', 'left']) assert.ok(near(data.root[key], 0), `${kind} ${key}=${data.root[key]}, expected 0`);
  assert.ok(near(data.root.width, data.viewport.width), `${kind} width=${data.root.width}, viewport=${data.viewport.width}`);
  assert.ok(near(data.root.height, data.viewport.height), `${kind} height=${data.root.height}, viewport=${data.viewport.height}`);
  assert.ok(near(data.root.bottom, data.viewport.height), `${kind} bottom=${data.root.bottom}, viewport=${data.viewport.height}`);

  if (rootBackground) {
    assert.ok(data.root.alpha > 0.1, `${kind} root background is not faded (${data.root.backgroundColor})`);
  } else {
    assert.ok(data.backdrop, `${kind} has no full-bleed backdrop`);
    assert.ok(near(data.backdrop.top, 0), `${kind} backdrop top=${data.backdrop.top}, expected 0`);
    assert.ok(near(data.backdrop.height, data.viewport.height), `${kind} backdrop height=${data.backdrop.height}, viewport=${data.viewport.height}`);
    assert.ok(data.backdrop.alpha > 0.1, `${kind} backdrop is not faded (${data.backdrop.backgroundColor})`);
    assert.ok(data.topHit.insideOverlay, `${kind} top strip is not covered by the backdrop (hit ${data.topHit.className})`);
    assert.ok(data.topHit.stackHasOverlay, `${kind} overlay is not painted at the top strip`);
  }
  if (fullPanel) {
    assert.ok(data.panel, `${kind} has no full-height panel`);
    assert.ok(near(data.panel.top, 0), `${kind} panel top=${data.panel.top}, expected 0`);
    assert.ok(near(data.panel.height, data.viewport.height), `${kind} panel height=${data.panel.height}, viewport=${data.viewport.height}`);
    assert.ok(near(data.panel.bottom, data.viewport.height), `${kind} panel bottom=${data.panel.bottom}, viewport=${data.viewport.height}`);
  }
  if (kind === 'drawer') assert.equal(data.bodyOverflow, 'hidden', 'drawer did not lock body scrolling');

  const shot = await p.screenshot({ animations: 'disabled' });
  if (shotPath) fs.writeFileSync(shotPath, shot);
  const before = await stripLuminance(baseline, region);
  const after = await stripLuminance(shot, region);
  assert.ok(after < before - 20, `${kind} top strip did not visibly fade (${before.toFixed(1)} → ${after.toFixed(1)})`);
  return `top 0 · ${Math.round(data.root.width)}×${Math.round(data.root.height)} · z${data.root.zIndex} · fade ${Math.round(before)}→${Math.round(after)}`;
}

async function gotoClients(p) {
  await p.goto(`${BASE}/${ORG}/m/clients`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, { timeout: 20000 });
  await clearOverlays(p);
}

async function dragLibrary(p, type) {
  await p.evaluate(type => {
    const el = document.querySelector('[data-testid="library-page"]');
    if (!el) throw new Error('library page not ready');
    const dt = new DataTransfer();
    dt.items.add(new File(['overlay-qa'], 'overlay-qa.txt', { type: 'text/plain' }));
    el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, type);
}

await gotoClients(page);
const desktopBaseline = await page.screenshot({ animations: 'disabled' });

await check('record drawer fills the viewport and dims the top strip', async () => {
  await clearOverlays(page);
  await page.getByRole('button', { name: /^Edit / }).first().click();
  try {
    return await measureOverlay({
      p: page, kind: 'drawer', minZ: 50, baseline: desktopBaseline,
      region: HEADER_STRIP, fullPanel: true, shotPath: '/home/user/overlay-qa-drawer.png',
    });
  } finally {
    await page.getByRole('button', { name: 'Close drawer' }).click().catch(() => {});
    await clearOverlays(page);
  }
});

await check('confirmation modal fills the viewport and dims the top strip', async () => {
  await clearOverlays(page);
  await page.locator('button[aria-label^="Delete "]').first().click();
  try {
    return await measureOverlay({
      p: page, kind: 'confirm-dialog', minZ: 60, baseline: desktopBaseline,
      region: HEADER_STRIP, shotPath: '/home/user/overlay-qa-confirm-dialog.png',
    });
  } finally {
    await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
    await clearOverlays(page);
  }
});

await check('command palette fills the viewport and dims the top strip', async () => {
  await clearOverlays(page);
  await page.getByRole('button', { name: /Search anything/ }).click();
  try {
    return await measureOverlay({
      p: page, kind: 'command-palette', minZ: 70, baseline: desktopBaseline,
      region: HEADER_STRIP, shotPath: '/home/user/overlay-qa-command-palette.png',
    });
  } finally {
    await page.keyboard.press('Escape').catch(() => {});
    await clearOverlays(page);
  }
});

await check('library drag layer fills the viewport and dims the top strip', async () => {
  await page.goto(`${BASE}/${ORG}/library`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="library-page"]').waitFor({ timeout: 20000 });
  await clearOverlays(page);
  const libraryBaseline = await page.screenshot({ animations: 'disabled' });
  await dragLibrary(page, 'dragenter');
  await dragLibrary(page, 'dragover');
  try {
    return await measureOverlay({
      p: page, kind: 'library-drop', minZ: 40, baseline: libraryBaseline,
      region: HEADER_STRIP, rootBackground: true, shotPath: '/home/user/overlay-qa-library-drop.png',
    });
  } finally {
    await dragLibrary(page, 'dragleave').catch(() => {});
    await clearOverlays(page);
  }
});

await gotoClients(mobilePage);
const mobileBaseline = await mobilePage.screenshot({ animations: 'disabled' });

await check('mobile navigation fills the viewport and dims the top strip', async () => {
  await clearOverlays(mobilePage);
  await mobilePage.getByRole('button', { name: 'Open navigation' }).click();
  try {
    return await measureOverlay({
      p: mobilePage, kind: 'mobile-nav', minZ: 50, baseline: mobileBaseline,
      region: MOBILE_STRIP, fullPanel: true, shotPath: '/home/user/overlay-qa-mobile-nav.png',
    });
  } finally {
    await mobilePage.mouse.click(330, 400).catch(() => {});
    await clearOverlays(mobilePage);
  }
});

await check('body scrolling is restored after every overlay closes', async () => {
  for (const p of [page, mobilePage]) {
    await waitForNoOverlay(p);
    const overflow = await p.evaluate(() => getComputedStyle(document.body).overflow);
    assert.notEqual(overflow, 'hidden', `body overflow remained ${overflow}`);
  }
  return 'visible on desktop and mobile';
});

await check('overlay QA produced no browser errors', async () => {
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(' | ')}`);
  return '0 page errors · 0 console errors';
});

await desktop.close();
await mobile.close();
await probe.close();
await browser.close();
await api.dispose();
console.log(`\nOVERLAY QA: ${results.length - failures}/${results.length} checks passed`);
if (failures) process.exitCode = 1;
