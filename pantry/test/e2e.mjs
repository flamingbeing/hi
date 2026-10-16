// Browser test of the pantry on a phone: node pantry/test/e2e.mjs   (SHOTS=<dir> also saves screenshots)
// Serves the repo root (the app at /pantry/, the kit at /homedesign/, as on a PR preview) and checks, at 390px:
// add from the catalogue, open one, Used 1 + Undo, expiry on Home, the shopping list (tick -> Bought more sheet),
// sample items, back returns from an item and closes sheets, version lines, backup JSON, demo mode, offline reload
// through the service worker; the welcome on first open (Skip, Next through every card, Add my first item, once per
// phone, never in plain ?demo, no home-screen card when installed, the short invite version) and the guide screen;
// and at 390, 360 and 320px: no sideways scroll and axe clean on every screen, the welcome and the guide.
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
  const { init, ...rest } = opts;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, ...rest });
  if (init) await ctx.addInitScript(init);
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
const hash = page => new URL(page.url()).hash;
const go = async (page, h) => { await page.evaluate(x => { location.hash = x; }, h); await settle(page); };
const toast = page => page.locator('.ha-toast.is-visible');
const welcomeSheet = page => page.locator('dialog.ha-sheet.pa-wsheet[open]');
const cardTitle = async page => (await welcomeSheet(page).locator('.pa-wtitle').textContent()).replace(/^Step \d+ of \d+: /, '');
const waitWelcome = page => welcomeSheet(page).waitFor({ timeout: 3000 }).then(() => settle(page));
const ymdPlus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

try {
  // ---------- the main walk-through, on this phone's own pantry (IndexedDB) ----------
  {
    const { ctx, page, errors } = await open(390, 844);
    // first open: the welcome, once per phone
    await waitWelcome(page);
    ok(await cardTitle(page) === 'Welcome to the pantry', 'first open shows the welcome');
    ok(await welcomeSheet(page).locator('.pa-dot').count() === 4, 'four cards in a browser tab');
    await shot(page, 'w0-first-open');
    await welcomeSheet(page).locator('.ha-sheet-head [data-ha-close]', { hasText: 'Skip' }).click(); await settle(page);
    ok(await welcomeSheet(page).count() === 0 && hash(page) === '#/', 'Skip closes it and stays on Home');
    ok(await page.evaluate(() => localStorage.getItem('pantry:welcomed')) === 'true', 'Skip remembers it');
    await page.reload(); await page.locator('.ha-large-title').waitFor(); await page.waitForTimeout(900);
    ok(await welcomeSheet(page).count() === 0, 'the welcome does not come back after a reload');
    ok(await page.locator('.ha-empty-title', { hasText: 'Nothing here yet' }).isVisible(), 'empty pantry says so');
    ok(await page.locator('.ha-empty a[href="#/guide"]').isVisible(), 'empty Home links to the guide');
    await go(page, '#/shop');
    ok((await page.locator('#h-shop').locator('xpath=..').locator('.ha-section-footer').textContent()).includes('come here by themselves'), 'an empty shopping list says how things get there');
    await go(page, '#/settings');
    if (await page.locator('[data-act="signin"]').count()) ok((await page.locator('#h-family').locator('xpath=..').locator('.ha-section-footer').textContent()).startsWith('Sign in to share'), 'signed out: one line on why to sign in');
    await page.click('.ha-tabbar a[href="#/"]'); await settle(page);
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
    ok((await page.locator('#h-help').locator('xpath=..').innerText()).includes('How to use the pantry'), 'Settings has a Help section');
    await page.click('#main a[href="#/guide"]'); await settle(page);
    ok(hash(page) === '#/guide' && (await page.locator('h1').textContent()) === 'How to use the pantry', 'the guide opens from Settings');
    ok(await page.locator('.ha-back span').textContent() === 'Settings', 'its back button names Settings');
    ok(await page.locator('.ha-tab[aria-current="page"]').getAttribute('href') === '#/settings', 'Settings stays the current tab');
    ok(await page.locator('#main .ha-section').count() === 7, 'seven guide sections');
    await page.goBack(); await settle(page);
    ok(hash(page) === '#/settings', 'back returns to Settings');
    await page.click('#main a[href="#/guide"]'); await settle(page);
    await page.click('.ha-back'); await settle(page);
    ok(hash(page) === '#/settings', 'the back button returns to Settings');
    // show the welcome again from Settings: back closes it
    await page.click('[data-act="welcome"]'); await waitWelcome(page);
    ok(await cardTitle(page) === 'Welcome to the pantry', 'Show the welcome again opens it');
    await page.goBack(); await settle(page);
    ok(await welcomeSheet(page).count() === 0 && hash(page) === '#/settings', 'back closes the welcome');
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

  // ---------- the welcome in the demo (only with ?welcome): every card, Add my first item ----------
  {
    const { ctx, page, errors } = await open(390, 844, BASE + '?demo');
    await page.waitForTimeout(900);
    ok(await welcomeSheet(page).count() === 0, 'plain ?demo shows no welcome');
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open(390, 844, BASE + '?demo&welcome');
    await waitWelcome(page);
    const titles = [await cardTitle(page)];
    ok(await welcomeSheet(page).locator('[data-pa-w="prev"]').isHidden(), 'no Back on the first card');
    await axe(page, 'welcome card 1');
    await shot(page, 'w1-intro');
    for (let i = 2; i <= 4; i++) {
      await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page);
      titles.push(await cardTitle(page));
      ok(await welcomeSheet(page).locator('.pa-dot.is-current').count() === 1
        && await welcomeSheet(page).locator('.pa-dot').nth(i - 1).evaluate(d => d.classList.contains('is-current')), `dot ${i} is current`);
      ok(await page.evaluate(() => document.activeElement?.classList.contains('pa-wtitle')), `card ${i}: focus moves to its title`);
      await axe(page, `welcome card ${i}`);
      await shot(page, `w${i}-${['', '', 'install', 'family', 'first'][i]}`);
    }
    ok(JSON.stringify(titles) === JSON.stringify(['Welcome to the pantry', 'Put it on your home screen', 'Share it with the family', 'Add your first item']), `cards in order: ${titles}`);
    ok(await welcomeSheet(page).locator('[data-pa-w="next"]').count() === 0, 'no Next on the last card');
    ok(await welcomeSheet(page).locator('.ha-sheet-head [data-ha-close]').textContent() === 'Close', 'the last card says Close, not Skip');
    // Back goes to the previous card, Next returns
    await welcomeSheet(page).locator('[data-pa-w="prev"]').click(); await settle(page);
    ok(await cardTitle(page) === 'Share it with the family', 'Back shows the previous card');
    await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page);
    ok(await welcomeSheet(page).locator('[data-pa-w="done"]').textContent() === 'Look around first', 'a quiet Look around first');
    await welcomeSheet(page).locator('[data-pa-w="add"]').click(); await settle(page);
    ok(hash(page) === '#/add' && await welcomeSheet(page).count() === 0, 'Add my first item lands on Add');
    ok(await page.evaluate(() => localStorage.getItem('pantry:welcomed')) === null, 'the demo saves no flag');
    await page.goBack(); await settle(page);
    ok(hash(page) === '#/', 'back from Add returns to Home, not to the welcome');
    ok(errors.length === 0, `welcome: console errors ${errors.join('; ')}`);
    await ctx.close();
  }
  {
    // installed (opened from the home screen): no home-screen card
    const { ctx, page } = await open(390, 844, BASE + '?demo&welcome', { init: () => Object.defineProperty(navigator, 'standalone', { get: () => true }) });
    await waitWelcome(page);
    ok(await welcomeSheet(page).locator('.pa-dot').count() === 3, 'installed: three cards');
    for (let i = 0; i < 2; i++) { await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page); }
    ok(await cardTitle(page) === 'Add your first item', 'installed: the home-screen card is skipped');
    await ctx.close();
  }
  {
    // opened from an invite (the link ends #/settings): short, ends at Sign in, on the Settings screen
    const { ctx, page } = await open(390, 844, BASE + '?demo&welcome#/settings');
    await waitWelcome(page);
    ok(await cardTitle(page) === 'Welcome to the family pantry', 'invite: says they were added');
    ok(await welcomeSheet(page).locator('.pa-dot').count() === 3, 'invite: three cards');
    for (let i = 0; i < 2; i++) { await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page); }
    ok(await cardTitle(page) === 'Sign in to join', 'invite: ends at Sign in');
    await axe(page, 'welcome invite');
    await shot(page, 'w5-invite-signin');
    await welcomeSheet(page).locator('[data-pa-w="signin"]').click(); await settle(page);
    ok(hash(page) === '#/settings' && await welcomeSheet(page).count() === 0, 'Go to sign in leaves them on Settings');
    await ctx.close();
  }
  // the welcome and the guide at 390, 360 and 320, and at 200% text
  for (const [w, h] of [[390, 844], [360, 780], [320, 640]]) {
    const { ctx, page, errors } = await open(w, h, BASE + '?demo&welcome');
    await waitWelcome(page);
    for (let i = 1; i <= 4; i++) {
      await noSideways(page, `welcome ${w} card ${i}`);
      if (w !== 390) await axe(page, `welcome ${w} card ${i}`);
      if (i < 4) { await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page); }
    }
    await welcomeSheet(page).locator('[data-pa-w="done"]').click(); await settle(page);
    ok(await welcomeSheet(page).count() === 0 && hash(page) === '#/', `welcome ${w}: Look around first closes it`);
    await go(page, '#/guide');
    await noSideways(page, `guide ${w}`);
    await axe(page, `guide ${w}`);
    // the bar ("Pantry" back, "How to use it") stays apart, at normal and 200% text
    await page.evaluate(() => scrollTo(0, 900)); await settle(page);
    await barApart(page, `guide ${w} bar`);
    await page.evaluate(() => { document.documentElement.style.fontSize = '212.5%'; }); await settle(page);
    await barApart(page, `guide ${w} bar at 200% text`);
    if (w === 390) await shot(page, 'g0-guide-bar-200pc');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; scrollTo(0, 0); }); await settle(page);
    if (w === 390) {
      await shot(page, 'g1-guide-top');
      await page.evaluate(() => scrollTo(0, 900)); await settle(page);
      await shot(page, 'g2-guide-scrolled');
      await page.evaluate(() => scrollTo(0, 2000)); await settle(page);
      await shot(page, 'g3-guide-more');
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await settle(page);
      await shot(page, 'g4-guide-end');
      // the guide's own "Show the welcome again"
      await page.click('[data-act="welcome"]'); await waitWelcome(page);
      ok(await welcomeSheet(page).count() === 1, 'the guide can show the welcome again');
      await page.goBack(); await settle(page);
      ok(hash(page) === '#/guide', 'closing it stays on the guide');
      // 200% text
      await page.evaluate(() => { document.documentElement.style.fontSize = '212.5%'; });
      await noSideways(page, 'guide 200%');
      await page.click('[data-act="welcome"]'); await waitWelcome(page);
      for (let i = 1; i <= 4; i++) {
        await noSideways(page, `welcome 200% card ${i}`);
        const r = await welcomeSheet(page).evaluate(d => ({ sw: d.querySelector('.ha-sheet-body').scrollWidth, cw: d.querySelector('.ha-sheet-body').clientWidth }));
        ok(r.sw <= r.cw, `welcome 200% card ${i}: no sideways scroll in the sheet`);
        if (i === 4) await shot(page, 'w6-200pc');
        if (i < 4) { await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page); }
      }
    }
    ok(errors.length === 0, `welcome and guide ${w}: console errors ${errors.join('; ')}`);
    await ctx.close();
    console.log(`  welcome and guide ${w}: ok`);
  }

  // ---------- demo mode, every screen at 390, 360 and 320 ----------
  for (const [w, h] of [[390, 844], [360, 780], [320, 640]]) {
    const { ctx, page, errors } = await open(w, h, BASE + '?demo');
    ok((await page.locator('.ha-large-sub').textContent()).includes('Demo'), `demo ${w}: says it is a demo`);
    ok(await page.evaluate(() => window.__pantry.S.mode) === 'demo', `demo ${w}: memory only`);
    const itemId = await page.evaluate(() => [...window.__pantry.S.items.values()].find(i => i.name === 'Light soy sauce').id);
    for (const hsh of ['#/', '#/items', '#/item/' + itemId, '#/add', '#/edit/' + itemId, '#/shop', '#/settings', '#/guide']) {
      await go(page, hsh);
      await noSideways(page, `demo ${w} ${hsh}`);
      if (w !== 390) await axe(page, `demo ${w} ${hsh}`);
      if (w === 320 && SHOTS) await shot(page, `320-${hsh.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'home'}`);
    }
    if (w === 320) {
      // 200% text at the narrowest width: the bar never overlaps on any screen
      await page.evaluate(() => { document.documentElement.style.fontSize = '212.5%'; });
      for (const hsh of ['#/', '#/items', '#/item/' + itemId, '#/add', '#/edit/' + itemId, '#/shop', '#/settings', '#/guide']) {
        await go(page, hsh); await page.evaluate(() => scrollTo(0, 900)); await settle(page);
        await barApart(page, `demo 320 200% ${hsh}`);
      }
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
      for (const hsh of ['#/', '#/items', '#/item/' + itemId, '#/add', '#/edit/' + itemId, '#/shop', '#/settings', '#/guide']) { await go(page, hsh); await noSideways(page, `demo 200% ${hsh}`); await barApart(page, `demo 200% ${hsh}`); }
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
