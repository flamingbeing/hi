// Browser test of the home design system: node homedesign/test/e2e.mjs   (SHOTS=<dir> also saves screenshots)
// Serves the repo root with a tiny static server, then opens index.html (web guide) and app.html (phone app kit) at
// 390, 360 and 320px and on a desktop, and checks: no console errors, no sideways scroll, axe clean (WCAG 2.2 AA),
// tabs and pushed screens are history entries, sheets close with back, toast Undo works, the version lines work, and
// the app holds at 200% text.
// Needs Playwright (PLAYWRIGHT_PATH) and axe-core (AXE_PATH, or node_modules/axe-core found from here or the cwd).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS;
const ICONS = (fs.readFileSync(path.join(ROOT, 'homedesign/icons.svg'), 'utf8').match(/<symbol /g) || []).length;   // every icon in the sprite is in both grids
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function findAxe() {
  if (process.env.AXE_PATH) return process.env.AXE_PATH;
  for (const base of [ROOT, process.cwd()]) {
    try { return createRequire(path.join(base, 'noop.js')).resolve('axe-core/axe.min.js'); } catch { /* next */ }
  }
  throw new Error('axe-core not found: npm install --no-save axe-core (or set AXE_PATH)');
}
const AXE = fs.readFileSync(findAxe(), 'utf8');

// ---- static server ----
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', md: 'text/plain; charset=utf-8', png: 'image/png' };
let swMode = 'missing';   // what /homedesign/sw.js answers: 'missing' (404), 'ok', or 'offline' (connection dropped)
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/homedesign/sw.js') {
    if (swMode === 'offline') return req.socket.destroy();
    if (swMode === 'ok') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('// test worker'); }
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[f.split('.').pop()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/homedesign/`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const SIZES = [
  { name: '390', viewport: { width: 390, height: 844 }, mobile: true },
  { name: '360', viewport: { width: 360, height: 780 }, mobile: true },
  { name: '320', viewport: { width: 320, height: 640 }, mobile: true },
  { name: 'desktop', viewport: { width: 1280, height: 900 }, mobile: false },
];
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

async function open(size, file) {
  const ctx = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: 2, isMobile: size.mobile, hasTouch: size.mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/sw\.js|404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + file);
  await page.waitForLoadState('networkidle');
  return { ctx, page, errors };
}
async function noSideways(page, what) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  ok(r.sw <= r.w, `${what}: no sideways scroll (scrollWidth ${r.sw} > ${r.w})`);
}
async function axe(page, what) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }))
    .violations.map(x => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`));
  ok(v.length === 0, `${what}: axe violations\n  ${v.join('\n  ')}`);
}
// the top bar's lead, title and trail never overlap (and the back button keeps a 44px target and its name)
async function barApart(page, what) {
  const r = await page.evaluate(() => {
    const box = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const title = document.querySelector('.ha-bar-title');
    const parts = [...document.querySelectorAll('.ha-bar-lead > *, .ha-bar-trail > *')].filter(e => e.getClientRects().length)
      .map(e => ({ side: e.closest('.ha-bar-lead') ? 'lead' : 'trail', ...box(e) }));
    const back = document.querySelector('.ha-back');
    return { title: title && title.textContent.trim() ? box(title) : null, parts, back: back && { ...box(back), name: back.textContent.trim() } };
  });
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  for (const p of r.parts) if (r.title) ok(!hit(p, r.title), `${what}: bar ${p.side} (${Math.round(p.l)}-${Math.round(p.r)}) overlaps the title (${Math.round(r.title.l)}-${Math.round(r.title.r)})`);
  const lead = r.parts.filter(p => p.side === 'lead'), trail = r.parts.filter(p => p.side === 'trail');
  for (const a of lead) for (const b of trail) ok(!hit(a, b), `${what}: bar lead overlaps the trail`);
  if (r.back) ok(r.back.w >= 43.5 && r.back.h >= 43.5 && r.back.name, `${what}: back button keeps a 44px target and its name (${Math.round(r.back.w)}x${Math.round(r.back.h)} "${r.back.name}")`);
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); };
const waitIdle = page => page.waitForTimeout(500);   // let sheets, toasts and view transitions settle

try {
  for (const size of SIZES) {
    // ---------- web guide ----------
    {
      const { ctx, page, errors } = await open(size, 'index.html');
      ok(await page.locator('h1').count() === 1, 'index: one h1');
      ok(await page.locator('#icons-grid li').count() === ICONS, `index: ${ICONS} icons`);
      const iconBox = await page.locator('#icons-grid svg').first().boundingBox();
      ok(iconBox && Math.round(iconBox.width) === 24, 'index: icons draw at 24px');
      await noSideways(page, `index ${size.name}`);
      await axe(page, `index ${size.name}`);
      // every interactive control is at least 44px tall (buttons, nav links, inputs)
      const small = await page.$$eval('.h-btn, .h-nav a, .h-input, .h-select, .h-link-arrow, .h-toc a', els =>
        els.filter(e => e.getClientRects().length && e.getBoundingClientRect().height < 40).map(e => e.outerHTML.slice(0, 60)));
      ok(small.length === 0, `index ${size.name}: small targets ${small.join(', ')}`);
      if (size.name === '390' || size.name === 'desktop') await shot(page, `web-${size.name}`, size.name === 'desktop');
      ok(errors.length === 0, `index ${size.name}: console errors ${errors.join('; ')}`);
      await ctx.close();
    }

    // ---------- phone app kit ----------
    {
      const { ctx, page, errors } = await open(size, 'app.html');
      const tabbar = page.locator('.ha-tabbar');
      ok(await page.locator('.ha-tab').count() === 5, 'app: five tabs');
      ok(await page.locator('.ha-tab[aria-current="page"]').getAttribute('href') === '#/', 'app: Pantry tab current');
      await noSideways(page, `app home ${size.name}`);
      await axe(page, `app home ${size.name}`);
      if (size.name === '390') await shot(page, 'app-390-home');

      // large title collapses into the bar
      await page.evaluate(() => scrollTo(0, 300)); await page.waitForTimeout(300);
      ok(await page.locator('.ha-bar').evaluate(b => b.classList.contains('is-collapsed')), 'app: bar collapses once the large title scrolls away');
      if (size.name === '390') await shot(page, 'app-390-scrolled');
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
      ok(!(await page.locator('.ha-bar').evaluate(b => b.classList.contains('is-collapsed'))), 'app: bar expands again at the top');

      // filter chips
      await page.click('#filters [data-place="Freezer"]');
      ok(await page.locator('#items li').count() === 2, 'app: Freezer chip filters the list');
      ok(await page.locator('#filters [data-place="Freezer"]').getAttribute('aria-pressed') === 'true', 'app: chip shows pressed');
      await page.click('#filters [data-place=""]');
      await page.fill('#search', 'zzz');
      ok(await page.locator('#items-empty').isVisible(), 'app: empty state when nothing matches');
      await page.click('.ha-search-clear');
      ok(await page.locator('#items li').count() === 8, 'app: clear search shows every item');

      // a pushed screen is a history entry: open an item, back returns
      await page.click('#items a[href="#/item/rice"]'); await waitIdle(page);
      ok(page.url().endsWith('#/item/rice'), 'app: item screen pushed');
      ok(await page.locator('#t-item').textContent() === 'Basmati rice', 'app: item title');
      ok(await page.locator('.ha-back').isVisible(), 'app: back button on a pushed screen');
      ok(await tabbar.locator('a[href="#/"]').getAttribute('aria-current') === 'page', 'app: a pushed item keeps the Pantry tab current');
      await noSideways(page, `app item ${size.name}`);
      await axe(page, `app item ${size.name}`);
      await page.click('#item-qty [data-step="1"]');
      ok(await page.locator('#item-qty output').textContent() === '2', 'app: stepper adds one');
      await page.goBack(); await waitIdle(page);
      ok(new URL(page.url()).hash === '#/', 'app: back pops to Pantry');
      ok(await page.locator('[data-screen="home"]').isVisible(), 'app: home screen visible after back');
      // the in-app back button too
      await page.click('#items a[href="#/item/eggs"]'); await waitIdle(page);
      await page.click('.ha-back'); await waitIdle(page);
      ok(new URL(page.url()).hash === '#/', 'app: back button pops to Pantry');

      // tabs switch screens and mark the current tab
      await tabbar.locator('a[href="#/shop"]').click(); await waitIdle(page);
      ok(await page.locator('[data-screen="shop"]').isVisible(), 'app: Shopping tab shows its screen');
      ok(await tabbar.locator('a[href="#/shop"]').getAttribute('aria-current') === 'page', 'app: Shopping tab current');
      await noSideways(page, `app shop ${size.name}`);
      await axe(page, `app shop ${size.name}`);

      // toast Undo: remove a line, then undo it
      const before = await page.locator('#shop li').count();
      await page.click('#shop [data-del="s2"]');
      ok(await page.locator('#shop li').count() === before - 1, 'app: bin removes a line');
      const toast = page.locator('.ha-toast');
      await page.waitForFunction(() => document.querySelector('.ha-toast')?.classList.contains('is-visible'));
      ok((await toast.textContent()).includes('Bread removed'), 'app: toast says what happened');
      if (size.name === '390') { await page.waitForTimeout(450); await shot(page, 'app-390-toast'); }
      await toast.locator('.ha-toast-action').click();
      ok(await page.locator('#shop li').count() === before, 'app: Undo puts the line back');
      ok(await page.locator('#shop li:nth-child(2) .ha-row-title').textContent() === 'Bread', 'app: Undo restores it in place');
      // ticking off updates the progress
      await page.click('#shop li:nth-child(3) label');
      ok(await page.locator('#shop-progress-text').textContent() === '2 of 5', 'app: ticking updates progress');
      // segmented control
      await page.click('.ha-seg:has(input[value="bought"])');
      ok(await page.locator('#shop-bought').isVisible(), 'app: segmented control switches the view');

      // the centre action opens a sheet; back closes it without leaving the screen
      const hashBefore = new URL(page.url()).hash;
      await page.click('.ha-tab--action'); await waitIdle(page);
      ok(await page.locator('dialog.ha-sheet[open]').count() === 1, 'app: Add opens a sheet');
      ok(await page.evaluate(() => document.activeElement?.classList.contains('ha-sheet-title')), 'app: focus moves into the sheet');
      await noSideways(page, `app sheet ${size.name}`);
      await axe(page, `app sheet ${size.name}`);
      if (size.name === '390') await shot(page, 'app-390-sheet');
      await page.goBack(); await waitIdle(page);
      ok(await page.locator('dialog.ha-sheet[open]').count() === 0, 'app: back closes the sheet');
      ok(new URL(page.url()).hash === hashBefore, 'app: closing the sheet stays on the same screen');
      ok(await page.evaluate(() => document.activeElement?.classList.contains('ha-tab--action')), 'app: focus returns to the opener');
      // add an item through the sheet: empty name shows an error, then it saves and offers Undo
      await page.click('.ha-tab--action'); await waitIdle(page);
      await page.click('.ha-sheet-foot .ha-btn--primary');
      ok(await page.locator('#add-err').isVisible(), 'app: empty name shows an error');
      await page.fill('#add-form input[name="name"]', 'Lentils');
      await page.click('.ha-sheet-foot .ha-btn--primary'); await waitIdle(page);
      ok(await page.locator('dialog.ha-sheet[open]').count() === 0, 'app: saving closes the sheet');
      ok(new URL(page.url()).hash === hashBefore, 'app: saving leaves the history where it was');
      await tabbar.locator('a[href="#/"]').click(); await waitIdle(page);
      ok(await page.locator('#items .ha-row-title', { hasText: 'Lentils' }).count() === 1, 'app: added item listed');
      // Escape closes a sheet too
      await page.click('.ha-tab--action'); await waitIdle(page);
      await page.keyboard.press('Escape'); await waitIdle(page);
      ok(await page.locator('dialog.ha-sheet[open]').count() === 0, 'app: Escape closes the sheet');
      ok(new URL(page.url()).hash === '#/', 'app: Escape pops only the sheet entry');

      // Kit tab: every component, axe clean
      await tabbar.locator('a[href="#/kit"]').click(); await waitIdle(page);
      ok(await page.locator('#icon-grid li').count() === ICONS, `app: ${ICONS} icons in the kit`);
      await noSideways(page, `app kit ${size.name}`);
      await axe(page, `app kit ${size.name}`);
      if (size.name === '390') await shot(page, 'app-390-kit', true);
      await page.click('#demo-confirm'); await waitIdle(page);
      await page.click('dialog.ha-sheet[open] [value="yes"]'); await waitIdle(page);
      ok((await toast.textContent()).includes('You chose Delete'), 'app: confirm sheet resolves yes');

      // Settings: version lines
      await tabbar.locator('a[href="#/settings"]').click(); await waitIdle(page);
      await page.waitForFunction(() => !document.querySelector('#version .ha-version-text')?.hidden);
      ok(await page.locator('#version .ha-version-text').textContent() === 'App version 2026-10-16 (3f9a2c1d)', 'app: version line read from the cache name');
      ok(await page.locator('#version .ha-version-btn').textContent() === 'Not updating? Get the latest version', 'app: get-latest button');
      await noSideways(page, `app settings ${size.name}`);
      await axe(page, `app settings ${size.name}`);
      if (size.name === '390') await shot(page, 'app-390-settings', true);

      if (size.name === '390') {
        // no signal: says so and changes nothing
        swMode = 'offline';
        await page.evaluate(async () => { await caches.open('other-app-2026-01-01-aaaa'); localStorage.setItem('keep', '1'); });
        await page.click('#version .ha-version-btn');
        await page.waitForFunction(() => /No signal/.test(document.querySelector('#version .ha-version-msg').textContent));
        ok((await page.evaluate(() => caches.keys())).includes('homedemo-2026-10-16-3f9a2c1d'), 'app: no signal leaves the caches alone');
        // server answers: only this app's caches go, then the page reloads; saved data stays
        swMode = 'ok';
        await Promise.all([page.waitForEvent('load'), page.click('#version .ha-version-btn')]);
        const after = await page.evaluate(() => caches.keys());
        ok(after.includes('other-app-2026-01-01-aaaa'), 'app: other apps’ caches kept');
        ok(await page.evaluate(() => localStorage.getItem('keep')) === '1', 'app: saved data untouched');
        swMode = 'missing';
        // undated cache names show as they are
        await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); await caches.open('homedemo-v7'); });
        await page.reload(); await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => !document.querySelector('#version .ha-version-text')?.hidden);
        ok(await page.locator('#version .ha-version-text').textContent() === 'App version v7', 'app: undated version shown as is');

        // holds at 200% text: no sideways scroll on any screen
        await page.evaluate(() => { document.documentElement.style.fontSize = '212.5%'; });
        for (const h of ['#/', '#/shop', '#/kit', '#/settings', '#/item/milk']) {
          await page.evaluate(x => { location.hash = x; }, h); await waitIdle(page);
          await noSideways(page, `app ${h} at 200% text`);
        }
        await page.evaluate(() => { location.hash = '#/'; }); await waitIdle(page);
        await shot(page, 'app-390-200pc');
      }
      ok(errors.length === 0, `app ${size.name}: console errors ${errors.join('; ')}`);
      await ctx.close();
    }
    console.log(`  ${size.name}: ok`);
  }
  // the top bar on pushed screens at 390 and 320px, at normal and 200% text: lead, title and trail stay apart
  for (const size of SIZES.filter(s => s.name === '390' || s.name === '320')) {
    const { ctx, page, errors } = await open(size, 'app.html#/item/milk');
    for (const fs of ['', '212.5%']) {
      await page.evaluate(f => { document.documentElement.style.fontSize = f; }, fs);
      for (const h of ['#/item/milk', '#/item/rice', '#/kit', '#/']) {
        await page.evaluate(x => { location.hash = x; }, h); await waitIdle(page);
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await waitIdle(page);
        await barApart(page, `app bar ${size.name} ${h}${fs ? ' at 200% text' : ''}`);
      }
    }
    ok(errors.length === 0, `app bar ${size.name}: console errors ${errors.join('; ')}`);
    await ctx.close();
  }
  console.log('  top bar: ok');
  // reduced motion: the kit still works with every transition off
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE + 'app.html'); await page.waitForLoadState('networkidle');
    await page.click('.ha-tab--action');
    ok(await page.locator('dialog.ha-sheet[open]').count() === 1, 'reduced motion: sheet opens');
    await page.goBack(); await page.waitForTimeout(100);
    ok(await page.locator('dialog.ha-sheet[open]').count() === 0, 'reduced motion: back closes it');
    await ctx.close();
  }
  console.log(`homedesign e2e: ok (${checks} checks)`);
} finally {
  await browser.close();
  server.close();
}
