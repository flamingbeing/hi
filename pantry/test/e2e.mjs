// Browser test of the pantry on a phone: node pantry/test/e2e.mjs   (SHOTS=<dir> also saves screenshots)
// Serves the repo root (the app at /pantry/, the kit at /homedesign/, as on a PR preview) and checks, at 390px:
// add from the catalogue, open one, Used 1 + Undo, expiry on Home, the shopping list (tick -> Bought more sheet),
// sample items, back returns from an item and closes sheets, version lines, backup JSON, demo mode, offline reload
// through the service worker; the welcome on first open (Skip, Next through every card, Add my first item, once per
// phone, never in plain ?demo, no home-screen card when installed, the short invite version) and the guide screen;
// barcode look-ups (three databases routed to fake answers, a fake camera; the unknown-barcode sheet);
// photos (a thumbnail on the item, the photo in photos/<id> read when the item opens, remove, delete, backup, an
// old-style item moved by itself; prints the measured sizes);
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
    ok(await welcomeSheet(page).locator('.pa-dot').count() === 2, 'two cards for someone new');
    await shot(page, 'w0-first-open');
    await welcomeSheet(page).locator('.ha-sheet-head [data-ha-close]', { hasText: 'Skip' }).click(); await settle(page);
    ok(await welcomeSheet(page).count() === 0 && hash(page) === '#/', 'Skip closes it and stays on Home');
    ok(await page.evaluate(() => localStorage.getItem('pantry:welcomed')) === 'true', 'Skip remembers it');
    await page.reload(); await page.locator('.ha-large-title').waitFor(); await page.waitForTimeout(900);
    ok(await welcomeSheet(page).count() === 0, 'the welcome does not come back after a reload');
    // a first-time user gets the Getting started checklist on Home; hiding it puts it away (Settings can bring it back)
    ok(await page.locator('#h-tour').count() === 1, 'first open: Getting started on Home');
    await page.click('[data-act="tour-hide"]'); await settle(page);
    ok(await page.locator('#h-tour').count() === 0, 'Hide this list hides it');
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
    // Buy online: one search link per shop, opening in a new tab
    const shops = await page.$$eval('section[aria-labelledby="h-online"] a.ha-row', as => as.map(a => [a.querySelector('.ha-row-title').textContent, a.href, a.target]));
    ok(shops.map(x => x[0]).join('|') === 'Search FairPrice|Search Sheng Siong|Search Cold Storage|Search Shopee', 'four shop links');
    ok(shops.every(x => x[2] === '_blank') && /^https:\/\/shopee\.sg\/search\?keyword=Kikkoman/.test(shops[3][1]) && /^https:\/\/coldstorage\.com\.sg\/search\?q=/.test(shops[2][1]), 'shop links search for the item');
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

    // binning the expired bread counts as expired
    await page.locator('#h-expired').locator('xpath=..').locator('a.ha-row', { hasText: 'Wholemeal bread' }).click(); await settle(page);
    await page.locator('[data-act="toss"]').first().click(); await settle(page);
    ok((await toast(page).textContent()).includes('(expired)'), 'binning past its date says expired');
    ok((await page.locator('#h-history').locator('xpath=..').innerText()).includes('Expired, thrown away'), 'history says expired');
    await page.click('.ha-back'); await settle(page);
    ok((await page.locator('#h-month').locator('xpath=..').innerText()).includes('Used before expiry'), 'This month counts used before expiry');

    // Say or type: a sentence becomes items to confirm
    await page.click('#bar-trail [data-act="quick"]'); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open] .ha-sheet-title').textContent() === 'Say or type', 'the mic opens Say or type');
    await page.fill('#pa-quick-text', '2 Meiji milk in the fridge expires 25 Oct, salmon fillet freezer in 3 months and 3 tins of sardines');
    await settle(page);
    ok(await page.locator('#pa-quick-list li').count() === 3, 'three things heard');
    await page.locator('#pa-quick-list input').nth(2).uncheck();
    ok(await page.locator('#pa-quick-go').textContent() === 'Add 2 items', 'unticking one leaves it out');
    await axe(page, 'say or type');
    await shot(page, '06b-quick');
    const before = await page.evaluate(() => window.__pantry.S.items.size);
    await page.click('#pa-quick-go'); await settle(page);
    ok((await toast(page).textContent()).includes('Added 2 items'), 'adds them');
    ok(await page.evaluate(() => window.__pantry.S.items.size) === before + 1, 'milk adds to the one at home, salmon is new');
    await toast(page).locator('.ha-toast-action').click(); await settle(page);
    ok(await page.evaluate(() => window.__pantry.S.items.size) === before, 'Undo takes them back out');

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
    await page.click('[data-act="soon"][data-v="7"]'); await settle(page);
    ok(await page.locator('[data-act="soon"][data-v="7"]').getAttribute('aria-pressed') === 'true', 'Use soon can be 1 week');
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
    await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page);
    titles.push(await cardTitle(page));
    ok(await welcomeSheet(page).locator('.pa-dot').nth(1).evaluate(d => d.classList.contains('is-current')), 'dot 2 is current');
    ok(await page.evaluate(() => document.activeElement?.classList.contains('pa-wtitle')), 'card 2: focus moves to its title');
    await axe(page, 'welcome card 2');
    await shot(page, 'w2-fill');
    ok(JSON.stringify(titles) === JSON.stringify(['Welcome to the pantry', 'Fill it in a minute']), `cards in order: ${titles}`);
    ok(await welcomeSheet(page).locator('[data-pa-w="next"]').count() === 0, 'no Next on the last card');
    ok(await welcomeSheet(page).locator('.ha-sheet-head [data-ha-close]').textContent() === 'Close', 'the last card says Close, not Skip');
    await welcomeSheet(page).locator('[data-pa-w="prev"]').click(); await settle(page);
    ok(await cardTitle(page) === 'Welcome to the pantry', 'Back shows the previous card');
    await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page);
    ok(await welcomeSheet(page).locator('[data-pa-w="done"]').textContent() === 'Look around first', 'a quiet Look around first');
    await welcomeSheet(page).locator('[data-pa-w="start"]').click(); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open] .ha-sheet-title').textContent() === 'What do you have?', 'Pick what you have opens the quick start');
    ok(await page.evaluate(() => localStorage.getItem('pantry:welcomed')) === null, 'the demo saves no flag');
    ok(errors.length === 0, `welcome: console errors ${errors.join('; ')}`);
    await ctx.close();
  }
  {
    // installed (opened from the home screen): no home-screen card
    const { ctx, page } = await open(390, 844, BASE + '?demo&welcome', { init: () => Object.defineProperty(navigator, 'standalone', { get: () => true }) });
    await waitWelcome(page);
    ok(await welcomeSheet(page).locator('.pa-dot').count() === 2, 'installed: two cards');
    await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page);
    ok(await cardTitle(page) === 'Fill it in a minute', 'installed: straight to filling it in');
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
    for (let i = 1; i <= 2; i++) {
      await noSideways(page, `welcome ${w} card ${i}`);
      if (w !== 390) await axe(page, `welcome ${w} card ${i}`);
      if (i < 2) { await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page); }
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
      for (let i = 1; i <= 2; i++) {
        await noSideways(page, `welcome 200% card ${i}`);
        const r = await welcomeSheet(page).evaluate(d => ({ sw: d.querySelector('.ha-sheet-body').scrollWidth, cw: d.querySelector('.ha-sheet-body').clientWidth }));
        ok(r.sw <= r.cw, `welcome 200% card ${i}: no sideways scroll in the sheet`);
        if (i === 2) await shot(page, 'w6-200pc');
        if (i < 2) { await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page); }
      }
    }
    ok(errors.length === 0, `welcome and guide ${w}: console errors ${errors.join('; ')}`);
    await ctx.close();
    console.log(`  welcome and guide ${w}: ok`);
  }

  // ---------- first steps: the quick start and the Getting started checklist, on a fresh phone ----------
  {
    const { ctx, page, errors } = await open(390, 844);
    await waitWelcome(page);
    await welcomeSheet(page).locator('[data-pa-w="next"]').click(); await settle(page);
    await welcomeSheet(page).locator('[data-pa-w="start"]').click(); await settle(page);
    const sheet = page.locator('dialog.ha-sheet[open]');
    ok(await sheet.locator('.pa-start-chips .ha-chip').count() >= 20, 'the quick start offers everyday things');
    for (const n of ['Fresh milk', 'Eggs', 'Thai hom mali rice', 'Bathroom tissue']) await sheet.locator('.pa-start-chips .ha-chip', { hasText: n }).first().click();
    ok(await page.locator('#pa-start-go').textContent() === 'Add 4 items', 'the button counts the picks');
    await axe(page, 'quick start');
    await shot(page, 't1-quick-start');
    await page.click('#pa-start-go'); await settle(page);
    ok((await toast(page).textContent()).includes('Added 4 items'), 'adds them');
    ok(await page.evaluate(() => window.__pantry.S.items.size) === 4, 'four items in the pantry');
    const milk = await page.evaluate(() => [...window.__pantry.S.items.values()].find(i => i.name === 'Fresh milk'));
    ok(milk.batches[0].expiry && milk.location === 'Fridge', 'with a rough date and its usual place');
    const count = async () => (await page.locator('#h-tour .ha-num').textContent()).trim();
    const total = await page.locator('#h-tour').locator('xpath=..').locator('.pa-tour-row').count();
    ok(await count() === `1 of ${total}`, `the checklist ticks "Add what you have" (${await count()})`);
    await axe(page, 'home with the checklist');
    await shot(page, 't2-checklist', true);
    // Show me: Used 1 is pointed at on an item
    await page.click('[data-act="tour-show"][data-task="use"]'); await settle(page);
    ok(/^#\/item\//.test(hash(page)), 'Show me opens an item');
    await page.waitForSelector('.pa-spot');
    ok(await page.locator('[data-act="use"].pa-spot').count() === 1, 'and rings Used 1');
    await shot(page, 't3-show-me');
    await page.locator('[data-act="use"]').first().click(); await settle(page);
    await page.click('.ha-back'); await settle(page);
    ok(await count() === `2 of ${total}`, 'Used 1 ticks it');
    // the shopping list, the home-screen tip, and Say or type
    await page.click('[data-act="tour-show"][data-task="shop"]'); await settle(page);
    ok(hash(page) === '#/shop', 'Show me opens the shopping list');
    await page.click('.ha-tabbar a[href="#/"]'); await settle(page);
    await page.click('[data-act="tour-show"][data-task="install"]'); await settle(page);
    ok(await page.locator('dialog.ha-sheet[open] .ha-sheet-title').textContent() === 'On your home screen', 'the home-screen steps');
    await page.click('dialog.ha-sheet[open] [data-ha-close]'); await settle(page);
    await page.click('[data-act="tour-show"][data-task="say"]'); await settle(page);
    await page.fill('#pa-quick-text', 'kaya in the fridge');
    await settle(page);
    await page.click('#pa-quick-go'); await settle(page);
    ok(await count() === `5 of ${total}`, `shopping, home screen and Say or type tick (${await count()})`);
    if (total === 6) {
      await page.click('[data-act="tour-show"][data-task="family"]'); await settle(page);
      ok(hash(page) === '#/settings', 'Show me for the family opens Settings');
      await page.waitForSelector('.pa-spot');
      ok(await page.locator('.pa-spot').count() === 1, 'and rings the sign-in button');
    }
    // hide it, then bring it back from Settings
    await go(page, '#/');
    await page.click('[data-act="tour-hide"]'); await settle(page);
    await go(page, '#/settings');
    await page.click('[data-act="tour-on"]'); await settle(page);
    ok(hash(page) === '#/' && await page.locator('#h-tour').count() === 1, 'Settings brings the checklist back');
    ok(errors.length === 0, `first steps: console errors ${errors.join('; ')}`);
    await ctx.close();
    console.log('  first steps: ok');
  }
  // an existing family (items already on the phone, from before the checklist): nothing new shows
  {
    const { ctx, page } = await open(390, 844, BASE, { init: () => { localStorage.setItem('pantry:welcomed', 'true'); } });
    await page.waitForTimeout(700);
    ok(await page.locator('#h-tour').count() === 0, 'no checklist for someone already using it');
    await ctx.close();
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

  // ---------- photos: a tiny thumbnail on the item, the photo itself read only when the item opens (this phone) ----------
  {
    const init = () => { try { localStorage.setItem('pantry:welcomed', 'true'); localStorage.setItem('pantry:tour', '"off"'); } catch { /* none */ } };
    const { ctx, page, errors } = await open(390, 844, BASE, { init });
    // a photo-like test picture (colours, shapes, text, a little grain), or pure noise for the worst case
    const picture = (w, h, noise = false) => page.evaluate(async ([w, h, noise]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c0392b'); gr.addColorStop(0.5, '#f1c40f'); gr.addColorStop(1, '#2c3e50');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${rnd() * 360},60%,${30 + rnd() * 40}%)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 20 + rnd() * w / 6, 0, 7); g.fill(); }
      g.font = `bold ${Math.round(h / 8)}px sans-serif`; g.fillStyle = '#fff'; g.fillText('SOY SAUCE 500 ml', w * 0.1, h * 0.55);
      const img = g.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = noise ? 0 : (rnd() - 0.5) * 24; for (let k = 0; k < 3; k++) d[i + k] = noise ? rnd() * 255 : d[i + k] + n; }
      g.putImageData(img, 0, 0);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      return [...new Uint8Array(await b.arrayBuffer())];
    }, [w, h, noise]).then(a => Buffer.from(a));
    const idb = (key, val) => page.evaluate(([k, v]) => new Promise((res, rej) => {
      const r = indexedDB.open('pantry');
      r.onsuccess = () => {
        const t = r.result.transaction('docs', v === undefined ? 'readonly' : 'readwrite'), st = t.objectStore('docs');
        const q = v === undefined ? st.get(k) : st.put(v, k);
        t.oncomplete = () => { r.result.close(); res(v === undefined ? q.result ?? null : null); };
        t.onerror = () => rej(t.error);
      };
    }), [key, val]);
    const item = id => page.evaluate(id => window.__pantry.S.items.get(id) || null, id);

    // an item saved before 16 Oct 2026, with the whole photo inside it, moves to a thumbnail + photos/<id> by itself
    const legacy = await page.evaluate(async () => {
      const { pictures } = await import('/pantry/js/photo.js');
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
      g.fillStyle = '#2a7'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.fillRect(100, 100, 300, 200);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      return (await pictures(b)).photo;
    });
    await idb('items/legacy1', { id: 'legacy1', name: 'Old photo item', brand: '', size: '', category: 'Other', location: 'Kitchen cabinet', openDays: null, lowAt: 0, barcode: '', photo: legacy, batches: [], createdAt: '2026-10-01T00:00:00Z' });
    await page.reload(); await page.locator('.ha-large-title').waitFor();
    await page.waitForFunction(() => { const i = window.__pantry.S.items.get('legacy1'); return i && !('photo' in i) && i.hasPhoto; }, null, { timeout: 8000 });
    await page.waitForTimeout(300);
    const migrated = await idb('items/legacy1'), legacyDoc = await idb('photos/legacy1');
    ok(migrated && !('photo' in migrated) && migrated.hasPhoto === true && migrated.thumb.startsWith('data:image/jpeg') && migrated.thumb.length <= 12288, 'old photo moved: the saved item keeps only a thumbnail');
    ok(legacyDoc?.data === legacy, 'and its photo, unchanged, is in photos/<id>');
    ok(migrated.name === 'Old photo item' && migrated.updatedBy === undefined, 'nothing else about the item changed');

    // add an item with a camera picture
    const jpeg = await picture(1600, 1200);
    await go(page, '#/add');
    await page.fill('#pa-form [name="name"]', 'Photo test sauce');
    await page.setInputFiles('#pa-photo-file', { name: 'camera.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.locator('.pa-photo img').waitFor();
    ok(await page.locator('[data-act="photo-del"]').isVisible(), 'the form offers Remove photo');
    await page.click('#pa-save'); await settle(page);
    const id = hash(page).split('/')[2];
    const added = await item(id), doc = await idb('photos/' + id);
    ok(added.hasPhoto === true && !('photo' in added) && added.thumb.startsWith('data:image/jpeg'), 'the item holds a thumbnail, not the photo');
    ok(doc && doc.id === id && doc.data.startsWith('data:image/jpeg') && doc.data.length > added.thumb.length * 3, 'the photo is saved on its own');
    const dims = await page.evaluate(async ([a, b]) => {
      const size = src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; });
      return [await size(a), await size(b)];
    }, [added.thumb, doc.data]);
    ok(dims[0][0] === 96 && dims[0][1] === 72 && dims[1][0] === 480 && dims[1][1] === 360, `thumbnail 96x72, photo 480x360 (${dims.join(' / ')})`);
    await page.waitForFunction(d => document.querySelector('#pa-hero')?.src === d, doc.data);
    ok(true, 'the item screen shows the photo');
    await axe(page, 'item with a photo');
    await noSideways(page, 'item with a photo');
    await shot(page, '30-item-photo');
    // lists use the thumbnail
    await go(page, '#/items');
    ok(await page.locator('#pa-items-list a.ha-row', { hasText: 'Photo test sauce' }).locator('img.ha-row-thumb').getAttribute('src') === added.thumb, 'the list shows the thumbnail');
    ok(await page.locator('#pa-items-list a.ha-row', { hasText: 'Old photo item' }).locator('img.ha-row-thumb').getAttribute('src') === migrated.thumb, 'and the moved item its thumbnail');
    await go(page, '#/');
    ok(await page.evaluate(() => [...document.querySelectorAll('img')].every(i => !i.src.startsWith('data:') || i.src.length <= 12288)), 'Home has no full photos');

    // a fresh start reads the photo only when the item opens
    await page.reload(); await page.locator('.ha-large-title').waitFor(); await settle(page);
    ok(await page.evaluate(() => window.__pantry.S.pics.size) === 0, 'nothing but thumbnails loaded at start');
    await go(page, '#/item/' + id);
    await page.waitForFunction(d => document.querySelector('#pa-hero')?.src === d, doc.data);
    ok(await page.evaluate(id => window.__pantry.S.pics.get(id)?.data?.length, id) === doc.data.length, 'opening the item fetched its photo');

    // remove the photo: both go
    await page.click('[data-act="edit"]'); await settle(page);
    ok(await page.locator('.pa-photo img').getAttribute('src') === added.thumb, 'edit shows the thumbnail');
    await page.click('[data-act="photo-del"]'); await settle(page);
    await page.click('#pa-save'); await settle(page);
    const bare = await item(id);
    ok(!bare.thumb && !bare.hasPhoto && !('photo' in bare), 'Remove photo clears the thumbnail');
    ok(await idb('photos/' + id) === null, 'and deletes the photo');
    ok(await page.locator('#pa-hero').count() === 0, 'the item shows no picture');

    // a new photo again, then delete the item: its photo goes too, and Undo brings both back
    await page.click('[data-act="edit"]'); await settle(page);
    await page.setInputFiles('#pa-photo-file', { name: 'camera.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.locator('.pa-photo img').waitFor();
    await page.click('#pa-save'); await settle(page);
    const again = await idb('photos/' + id);
    ok(again?.data?.startsWith('data:image/jpeg'), 'a new photo is saved');
    await page.click('[data-act="delete"]'); await settle(page);
    ok(await idb('photos/' + id) === null && await idb('items/' + id) === null, 'deleting the item deletes its photo');
    await toast(page).locator('.ha-toast-action').click(); await settle(page);
    ok((await idb('photos/' + id))?.data === again.data && (await idb('items/' + id))?.hasPhoto, 'Undo brings the item and its photo back');
    await go(page, '#/item/' + id);
    await page.click('[data-act="delete"]'); await settle(page);
    ok(await idb('photos/' + id) === null, 'deleted again: the photo is gone');

    // the backup holds the photos
    await go(page, '#/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
    const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(backup.photos?.length === 1 && backup.photos[0].id === 'legacy1' && backup.photos[0].data === legacy, 'the backup includes the photos');
    ok(backup.items.find(i => i.id === 'legacy1')?.thumb === migrated.thumb, 'and the items their thumbnails');

    // sizes, for the record: a photo-like camera picture and pure noise (the worst case)
    const noise = await picture(1600, 1200, true);
    const sizes = await page.evaluate(async bufs => {
      const { pictures } = await import('/pantry/js/photo.js');
      const out = [];
      for (const b of bufs) { const p = await pictures(new Blob([new Uint8Array(b)], { type: 'image/jpeg' })); out.push([p.thumb.length, p.photo.length]); }
      return out;
    }, [[...jpeg], [...noise]]);
    ok(sizes.every(([t, p]) => t <= 12288 && p <= 153600), 'every picture fits the rules');
    console.log(`  photo sizes (data URL bytes): camera-like 1600x1200 JPEG (${jpeg.length} B) -> thumb ${added.thumb.length}, photo ${doc.data.length}; noise (${noise.length} B) -> thumb ${sizes[1][0]}, photo ${sizes[1][1]}; old item -> thumb ${migrated.thumb.length}`);

    ok(errors.length === 0, `photos: console errors ${errors.join('; ')}`);
    await ctx.close();
    console.log('  photos: ok');
  }

  // ---------- barcode look-ups: three databases, and naming an unknown barcode (demo, no real camera or network) ----------
  {
    // a fake camera and barcode reader: the reader "sees" whatever the test puts in window.__scanCode
    const init = () => {
      window.__scanCode = null;
      globalThis.BarcodeDetector = class {
        static async getSupportedFormats() { return ['ean_13']; }
        async detect() { const c = window.__scanCode; window.__scanCode = null; return c ? [{ rawValue: c }] : []; }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').fillRect(0, 0, 16, 16);
        return c.captureStream();
      };
    };
    const { ctx, page, errors } = await open(390, 844, BASE + '?demo', { init });
    const HOUSEHOLD = '1111111111116', UNKNOWN = '2222222222222', UNKNOWN2 = '3333333333333';
    const asked = [];
    const answer = (host, hits) => ctx.route(`https://${host}/**`, route => {
      const code = (new URL(route.request().url()).pathname.match(/product\/(\d+)\.json/) || [])[1];
      asked.push(`${host} ${code}`);
      if (hits[code]) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 1, product: hits[code] }) });
      if (host.includes('beauty')) return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'oops' });
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"status":0}' });
    });
    await answer('world.openfoodfacts.org', {});
    await answer('world.openproductsfacts.org', { [HOUSEHOLD]: { product_name: 'Laundry liquid test', brands: 'Testbrand', quantity: '3 L' } });
    await answer('world.openbeautyfacts.org', {});
    const scan = async code => {
      await page.evaluate(c => { window.__scanCode = c; }, code);
      await page.click('[data-act="scan"]');
    };
    const unknown = page.locator('dialog.ha-sheet[open]', { has: page.locator('#pa-unk-find') });

    // a household-products hit fills the name and guesses the category and place
    await go(page, '#/add');
    await scan(HOUSEHOLD);
    await page.waitForFunction(() => document.querySelector('#pa-form [name="name"]')?.value === 'Laundry liquid test', null, { timeout: 8000 }); await settle(page);
    ok(asked.some(a => a.startsWith('world.openfoodfacts.org')) && asked.some(a => a.startsWith('world.openproductsfacts.org')) && asked.some(a => a.startsWith('world.openbeautyfacts.org')), 'all three databases asked');
    ok(await page.inputValue('#pa-form [name="brand"]') === 'Testbrand' && await page.inputValue('#pa-form [name="size"]') === '3 L', 'products database fills brand and size');
    ok(await page.inputValue('#pa-form [name="category"]') === 'Laundry & cleaning' && await page.inputValue('#pa-form [name="location"]') === 'Store room', 'and guesses Laundry & cleaning, Store room');
    ok(await page.inputValue('#pa-form [name="barcode"]') === HOUSEHOLD, 'the barcode is kept');
    // a category already chosen is not overridden
    await go(page, '#/'); await go(page, '#/add');
    await page.selectOption('#pa-form [name="category"]', 'Pet');
    await scan(HOUSEHOLD);
    await page.waitForFunction(() => document.querySelector('#pa-form [name="name"]')?.value === 'Laundry liquid test', null, { timeout: 8000 }); await settle(page);
    ok(await page.inputValue('#pa-form [name="category"]') === 'Pet' && await page.inputValue('#pa-form [name="location"]') === 'Store room', 'a chosen category stays; the place is still guessed');

    // an unknown barcode opens the sheet, search field focused, barcode already in the form
    await go(page, '#/'); await go(page, '#/add');
    await scan(UNKNOWN);
    await unknown.waitFor({ timeout: 8000 }); await settle(page);
    ok(await unknown.locator('.ha-sheet-title').textContent() === 'We don’t know this barcode yet', 'unknown barcode: the sheet says so');
    ok(await page.evaluate(() => document.activeElement?.id) === 'pa-unk-find', 'the search field has focus');
    ok((await unknown.locator('.pa-unk-code').textContent()) === UNKNOWN, 'the sheet shows the barcode');
    ok(await page.inputValue('#pa-form [name="barcode"]') === UNKNOWN, 'the barcode is already in the form');
    ok(await unknown.locator('#pa-unk-list').isHidden(), 'no list before typing');
    const targets = await unknown.locator('.ha-row, .ha-sheet-head button').evaluateAll(els => els.filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().height));
    ok(targets.every(h => h >= 43.5), `sheet targets are 44px (${targets.join(', ')})`);
    await axe(page, 'unknown barcode sheet');
    await noSideways(page, 'unknown barcode sheet');
    await shot(page, '20-unknown-barcode');
    // back closes it and stays on Add with the barcode
    await page.goBack(); await settle(page);
    ok(await unknown.count() === 0 && hash(page) === '#/add', 'back closes the sheet and stays on Add');
    ok(await page.inputValue('#pa-form [name="barcode"]') === UNKNOWN, 'the barcode stays after closing');

    // picking a catalogue product fills the form with the barcode
    await scan(UNKNOWN);
    await unknown.waitFor({ timeout: 8000 }); await settle(page);
    await page.fill('#pa-unk-find', 'laundry liquid');
    await unknown.locator('#pa-unk-list [data-act="unk-cat"]').first().waitFor();
    const subs = await unknown.locator('#pa-unk-list .ha-row-sub').allTextContents();
    ok(subs.filter(t => t.startsWith('Dynamo')).length === 1 && await unknown.locator('#pa-unk-list [data-act="unk-mine"] .ha-row-sub').first().textContent().then(t => t.startsWith('Dynamo')), 'a product already in the pantry is offered once, as the pantry item');
    await axe(page, 'unknown barcode sheet with a search');
    await noSideways(page, 'unknown barcode sheet with a search');
    await shot(page, '21-unknown-barcode-search');
    await page.fill('#pa-unk-find', 'breeze');
    await unknown.locator('#pa-unk-list [data-act="unk-cat"]').first().click(); await settle(page);
    ok(await unknown.count() === 0 && hash(page) === '#/add', 'picking closes the sheet, still on Add');
    ok(await page.inputValue('#pa-form [name="name"]') === 'Laundry liquid' && await page.inputValue('#pa-form [name="brand"]') === 'Breeze', 'the catalogue product fills name and brand');
    ok(await page.inputValue('#pa-form [name="size"]') === '3.6 kg' && await page.inputValue('#pa-form [name="category"]') === 'Laundry & cleaning' && await page.inputValue('#pa-form [name="location"]') === 'Laundry', 'and size, category and place');
    ok(await page.inputValue('#pa-form [name="barcode"]') === UNKNOWN, 'with the barcode attached');

    // Type a new name: closes and focuses Name, starting with what was typed
    await go(page, '#/'); await go(page, '#/add');
    await scan(UNKNOWN2);
    await unknown.waitFor({ timeout: 8000 }); await settle(page);
    await page.fill('#pa-unk-find', 'Grandma’s chilli oil');
    await unknown.locator('[data-act="unk-new"]').click(); await settle(page);
    ok(await unknown.count() === 0 && await page.evaluate(() => document.activeElement?.name) === 'name', 'Type a new name focuses Name');
    ok(await page.inputValue('#pa-form [name="name"]') === 'Grandma’s chilli oil' && await page.inputValue('#pa-form [name="barcode"]') === UNKNOWN2, 'it starts with the search text and keeps the barcode');

    // picking an item already in the pantry attaches the barcode to it and opens Bought more
    await go(page, '#/'); await go(page, '#/add');
    await scan(UNKNOWN2);
    await unknown.waitFor({ timeout: 8000 }); await settle(page);
    await page.fill('#pa-unk-find', 'kaya');
    await unknown.locator('#pa-unk-list [data-act="unk-mine"]').first().click(); await settle(page);
    const kaya = await page.evaluate(() => [...window.__pantry.S.items.values()].find(i => i.name === 'Kaya'));
    ok(kaya.barcode === UNKNOWN2, 'the barcode is saved on the pantry item');
    ok(hash(page) === '#/item/' + kaya.id && await page.locator('dialog.ha-sheet[open] .ha-sheet-title').textContent() === 'Bought more', 'its item opens with Bought more');
    await page.goBack(); await settle(page);
    ok(hash(page) === '#/item/' + kaya.id && await page.locator('dialog.ha-sheet[open]').count() === 0, 'back closes Bought more');
    // and scanning it again finds it straight away (no look-up)
    const before = asked.length;
    await go(page, '#/add');
    await scan(UNKNOWN2);
    await page.locator('dialog.ha-sheet[open] .ha-sheet-title', { hasText: 'Bought more' }).waitFor({ timeout: 8000 }); await settle(page);
    ok(hash(page) === '#/item/' + kaya.id && asked.length === before, 'the next scan finds the item without asking online');

    ok(errors.length === 0, `barcode: console errors ${errors.join('; ')}`);
    await ctx.close();
    console.log('  barcode look-ups: ok');
  }
  console.log(`pantry e2e: ok (${checks} checks)`);
} finally {
  await browser.close();
  srv.close();
}
