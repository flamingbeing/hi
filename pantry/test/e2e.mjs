// Browser test of the pantry on a phone: node pantry/test/e2e.mjs   (SHOTS=<dir> also saves screenshots)
// Serves the repo root (the app at /pantry/, the kit at /homedesign/, as on a PR preview) and checks, at 390px:
// add from the catalogue, open one, Used 1 + Undo, expiry on Home, the shopping list (tick -> Bought more sheet),
// sample items, back returns from an item and closes sheets, version lines, backup JSON, demo mode, offline reload
// through the service worker; and at 390, 360 and 320px: no sideways scroll and axe clean on every screen.
// Needs Playwright (PLAYWRIGHT_PATH) and axe-core (AXE_PATH, or node_modules/axe-core found from the repo or cwd).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
function findAxe() {
  if (process.env.AXE_PATH) return process.env.AXE_PATH;
  for (const base of [ROOT, process.cwd()]) {
    try { return createRequire(path.join(base, 'noop.js')).resolve('axe-core/axe.min.js'); } catch { /* next */ }
  }
  throw new Error('axe-core not found: npm install --no-save axe-core (or set AXE_PATH)');
}
const AXE = fs.readFileSync(findAxe(), 'utf8');

const srv = await serve();
const BASE = srv.url + '/pantry/';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const settle = page => page.waitForTimeout(450);   // sheets, toasts and view transitions

async function open(width, height, url = BASE, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.locator('.ha-large-title').first().waitFor();
  await settle(page);
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
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); };
const hash = page => new URL(page.url()).hash;
const go = async (page, h) => { await page.evaluate(x => { location.hash = x; }, h); await settle(page); };
const toast = page => page.locator('.ha-toast.is-visible');
const ymdPlus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

try {
  // ---------- the main walk-through, on this phone's own pantry (IndexedDB) ----------
  {
    const { ctx, page, errors } = await open(390, 844);
    ok(await page.locator('.ha-empty-title', { hasText: 'Nothing here yet' }).isVisible(), 'empty pantry says so');
    ok(await page.locator('.ha-tab[aria-current="page"]').getAttribute('href') === '#/', 'Pantry tab current');
    await axe(page, 'empty home');
    await shot(page, '01-empty');

    // add from the Singapore catalogue
    await page.click('.ha-tab--action'); await settle(page);
    ok(hash(page) === '#/add', 'Add opens the add screen');
    ok(await page.locator('.ha-tabbar').isHidden() && await page.locator('#pa-toolbar').isVisible(), 'a task swaps the tab bar for a toolbar');
    await page.fill('#pa-find', 'kikkoman soy');
    await page.locator('#pa-sugg [data-act="sugg"]').first().click(); await settle(page);
    ok(await page.inputValue('#pa-form [name="name"]') === 'Light soy sauce', 'catalogue fills the name');
    ok(await page.inputValue('#pa-form [name="brand"]') === 'Kikkoman', 'and the brand');
    ok(await page.inputValue('#pa-form [name="openDays"]') === '90', 'and keeps-once-opened days');
    await page.click('#pa-qty [data-step="1"]');
    ok(await page.locator('#pa-qty output').textContent() === '2', 'stepper adds one');
    await page.click('.pa-dates [data-act="date"]:has-text("1 year")');
    ok(await page.inputValue('#pa-form [name="expiry"]') === ymdPlus(365), 'quick date fills the date');
    await axe(page, 'add form');
    await shot(page, '02-add', true);
    await page.click('#pa-save'); await settle(page);
    ok(/^#\/item\//.test(hash(page)), 'saving opens the item');
    ok(await page.locator('h1').textContent() === 'Light soy sauce', 'item title');
    ok(await page.locator('#h-stock .ha-num').textContent() === '2', 'two in stock');

    // open one, then Used 1 and Undo
    await page.locator('[data-act="open"]').first().click(); await settle(page);
    ok((await toast(page).textContent()).includes('Opened 1 Light soy sauce'), 'open says so');
    ok(await page.locator('.pa-batch .ha-row-title', { hasText: '1 opened' }).count() === 1, 'an opened batch appears');
    await page.locator('.pa-batch', { hasText: '1 opened' }).locator('[data-act="use"]').click(); await settle(page);
    ok(await page.locator('#h-stock .ha-num').textContent() === '1', 'Used 1 takes one out');
    await toast(page).locator('.ha-toast-action').click(); await settle(page);
    ok(await page.locator('#h-stock .ha-num').textContent() === '2', 'Undo puts it back');
    await axe(page, 'item');
    await shot(page, '03-item', true);

    // Bought more sheet: back closes it and stays on the item
    const itemHash = hash(page);
    await page.click('[data-act="bought"]'); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open]').count() === 1, 'Bought more opens a sheet');
    await axe(page, 'bought sheet');
    await shot(page, '04-bought');
    await page.goBack(); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open]').count() === 0 && hash(page) === itemHash, 'back closes the sheet, stays on the item');

    // add to the shopping list from the item
    await page.click('[data-act="to-list"]'); await settle(page);
    ok(await page.locator('[data-act="to-list"]').textContent().then(t => t.includes('On the shopping list')), 'item shows it is on the list');

    // back from the item returns to where Add was opened from (Home)
    await page.goBack(); await settle(page);
    ok(hash(page) === '#/', 'back from the item returns to Home (the add screen was replaced)');

    // something that expires in 2 days shows under Use soon on Home
    await page.click('.ha-tab--action'); await settle(page);
    await page.fill('#pa-form [name="name"]', 'Baby spinach');
    await page.selectOption('#pa-form [name="category"]', 'Fresh produce');
    await page.selectOption('#pa-form [name="location"]', 'Fridge');
    await page.fill('#pa-form [name="expiry"]', ymdPlus(2));
    await page.click('#pa-save'); await settle(page);
    await page.click('.ha-tabbar a[href="#/"]'); await settle(page);
    ok(await page.locator('#h-use-soon').locator('xpath=..').locator('.ha-row', { hasText: 'Baby spinach' }).count() === 1, 'expiring item under Use soon');
    ok(await page.locator('.ha-row', { hasText: 'Baby spinach' }).locator('.ha-badge--warn').textContent() === '2 days', 'with a 2 days badge');
    // an empty name is refused in words
    await page.click('.ha-tab--action'); await settle(page);
    await page.click('#pa-save');
    ok(await page.locator('#pa-name-err').isVisible(), 'empty name shows an error');
    await page.click('[data-act="back"]'); await settle(page);
    ok(hash(page) === '#/', 'Cancel goes back');

    // shopping: add a line by hand, tick the pantry item -> Bought more sheet
    await page.click('.ha-tabbar a[href="#/shop"]'); await settle(page);
    await page.fill('#pa-shop-text', 'Bananas');
    await page.click('#pa-shop-add button[type=submit]'); await settle(page);
    ok(await page.locator('#pa-shop .ha-row-title', { hasText: 'Bananas' }).count() === 1, 'a line added by hand');
    await page.locator('#pa-shop label', { hasText: 'Kikkoman Light soy sauce' }).locator('input').check(); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open] .ha-sheet-title').textContent() === 'Bought more', 'ticking a pantry item asks what was bought');
    await page.click('dialog.ha-sheet[open] [data-act="date"]:has-text("1 month")');
    await page.click('dialog.ha-sheet[open] .ha-sheet-foot .ha-btn--primary'); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open]').count() === 0, 'the sheet closes');
    ok((await toast(page).textContent()).includes('Added 1 Light soy sauce'), 'stock added');
    ok(await page.locator('#pa-shop label.is-done', { hasText: 'Light soy sauce' }).count() === 1, 'ticked line struck through');
    // remove a line, then Undo
    await page.click('#pa-shop [data-act="shop-del"][aria-label="Remove Bananas"]'); await settle(page);
    ok(await page.locator('#pa-shop .ha-row-title', { hasText: 'Bananas' }).count() === 0, 'bin removes a line');
    await toast(page).locator('.ha-toast-action').click(); await settle(page);
    ok(await page.locator('#pa-shop .ha-row-title', { hasText: 'Bananas' }).count() === 1, 'Undo brings it back');
    await axe(page, 'shopping');
    await shot(page, '05-shop', true);

    // sample items, and the expired one on Home
    await page.click('.ha-tabbar a[href="#/settings"]'); await settle(page);
    await page.click('[data-act="sample"]'); await settle(page);
    ok((await toast(page).textContent()).includes('sample items'), 'sample items added');
    await page.click('.ha-tabbar a[href="#/"]'); await settle(page);
    ok(await page.locator('#h-expired').locator('xpath=..').locator('.ha-row', { hasText: 'Wholemeal bread' }).count() === 1, 'expired sample under Expired');
    await axe(page, 'home');
    await shot(page, '06-home', true);

    // items: search, place chips, sort
    await page.click('.ha-tabbar a[href="#/items"]'); await settle(page);
    await page.fill('#pa-q', 'kaya');
    ok(await page.locator('#pa-items-list .ha-row').count() === 1, 'search finds one');
    await page.click('[data-act="q-clear"]');
    await page.click('[data-act="place"][data-v="Fridge"]');
    ok(await page.locator('#pa-items-list .ha-row-sub', { hasText: 'Kitchen cabinet' }).count() === 0, 'place chip filters');
    await page.click('.ha-seg:has(input[value="category"])');
    ok(await page.locator('#pa-items-list .ha-section').count() > 1, 'category sort groups the list');
    await page.click('[data-act="place"][data-v=""]');
    await axe(page, 'items');
    await shot(page, '07-items', true);
    // open an item from the list, back returns to Items
    await page.locator('#pa-items-list a.ha-row', { hasText: 'Kaya' }).click(); await settle(page);
    ok(await page.locator('.ha-back span').textContent() === 'Items', 'back button names Items');
    await page.click('.ha-back'); await settle(page);
    ok(hash(page) === '#/items', 'back button returns to Items');

    // settings: backup JSON, version lines
    await page.click('.ha-tabbar a[href="#/settings"]'); await settle(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
    const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(backup.app === 'pantry' && backup.items.length >= 14 && backup.events.length > 10 && backup.shop.length === 2, 'backup holds items, history and the list');
    // the service worker has installed by now: reload so it controls the page, then the version lines show
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.locator('.ha-large-title').waitFor(); await settle(page);
    await page.waitForFunction(() => !document.querySelector('#pa-version .ha-version-text')?.hidden);
    ok(/^App version (v1|\d{4}-\d{2}-\d{2} \([0-9a-f]{8}\))$/.test(await page.locator('#pa-version .ha-version-text').textContent()), 'version line from the cache name');
    ok(await page.locator('#pa-version .ha-version-btn').textContent() === 'Not updating? Get the latest version', 'get-latest button');
    ok(await page.evaluate(() => document.querySelector('#main').lastElementChild.id) === 'pa-version', 'version lines come last');
    await axe(page, 'settings');
    await shot(page, '08-settings', true);
    // no signal: says so, keeps the caches
    srv.swOffline = true;
    await page.click('#pa-version .ha-version-btn');
    await page.waitForFunction(() => /No signal|could not be reached/.test(document.querySelector('#pa-version .ha-version-msg').textContent));
    ok((await page.evaluate(() => caches.keys())).some(k => k.startsWith('pantry-')), 'no signal leaves the cache');
    srv.swOffline = false;

    // offline: the app and its data still open
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
    await ctx.setOffline(true);
    await page.reload(); await page.locator('.ha-large-title').waitFor(); await settle(page);
    await go(page, '#/items');
    if (process.env.DEBUG) console.log(await page.locator('#main').innerText());
    ok(await page.locator('#pa-items-list .ha-row', { hasText: 'Baby spinach' }).count() === 1, 'offline reload shows the pantry');
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.ha-tabbar')).position) === 'fixed', 'offline: the kit styles load from the cache');
    await ctx.setOffline(false);

    ok(errors.length === 0, `console errors: ${errors.join('; ')}`);
    await ctx.close();
    console.log('  walk-through: ok');
  }

  // ---------- demo mode, every screen at 390, 360 and 320 ----------
  for (const [w, h] of [[390, 844], [360, 780], [320, 640]]) {
    const { ctx, page, errors } = await open(w, h, BASE + '?demo');
    ok((await page.locator('.ha-large-sub').textContent()).includes('Demo'), `demo ${w}: says it is a demo`);
    ok(await page.evaluate(() => window.__pantry.S.mode) === 'demo', `demo ${w}: memory only`);
    const itemId = await page.evaluate(() => [...window.__pantry.S.items.values()].find(i => i.name === 'Light soy sauce').id);
    for (const hsh of ['#/', '#/items', '#/item/' + itemId, '#/add', '#/edit/' + itemId, '#/shop', '#/settings']) {
      await go(page, hsh);
      await noSideways(page, `demo ${w} ${hsh}`);
      if (w !== 390) await axe(page, `demo ${w} ${hsh}`);
      if (w === 320 && SHOTS) await shot(page, `320-${hsh.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'home'}`);
    }
    if (w === 390) {
      // edit: change the name, save goes back to the item
      await go(page, '#/item/' + itemId);
      await page.click('[data-act="edit"]'); await settle(page);
      await page.fill('#pa-form [name="name"]', 'Light soy sauce (big)');
      await page.click('#pa-save'); await settle(page);
      ok(hash(page) === '#/item/' + itemId && (await page.locator('h1').textContent()) === 'Light soy sauce (big)', 'edit saves and returns');
      // delete with Undo
      await page.click('[data-act="delete"]'); await settle(page);
      ok(!(await page.evaluate(id => window.__pantry.S.items.has(id), itemId)), 'delete removes it');
      await toast(page).locator('.ha-toast-action').click(); await settle(page);
      ok(await page.evaluate(id => window.__pantry.S.items.has(id), itemId), 'Undo restores it');
      // 200% text: still no sideways scroll
      await page.evaluate(() => { document.documentElement.style.fontSize = '212.5%'; });
      for (const hsh of ['#/', '#/items', '#/item/' + itemId, '#/add', '#/shop', '#/settings']) { await go(page, hsh); await noSideways(page, `demo 200% ${hsh}`); }
    }
    ok(errors.length === 0, `demo ${w}: console errors ${errors.join('; ')}`);
    await ctx.close();
    console.log(`  demo ${w}: ok`);
  }
  console.log(`pantry e2e: ok (${checks} checks)`);
} finally {
  await browser.close();
  srv.close();
}
