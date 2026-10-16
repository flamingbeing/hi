// Browser test on a phone-sized screen: add items, use them, expiry, the shopping list, offline, settings.
// node pantry/test/e2e.mjs   (SHOTS=<dir> also saves screenshots)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');

const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const srv = await serve();
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const shot = async name => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const base = srv.url + '/pantry/';

try {
  await page.goto(base);
  await page.getByText('Welcome to your pantry').waitFor();
  await shot('01-empty');

  // add from the Singapore catalogue
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page.locator('#f-find').fill('kikkoman soy');
  await page.locator('.sugg button').first().click();
  assert.equal(await page.locator('#f-name').inputValue(), 'Light soy sauce');
  assert.equal(await page.locator('#f-brand').inputValue(), 'Kikkoman');
  assert.equal(await page.locator('#f-open').inputValue(), '90');
  await page.getByRole('button', { name: 'One more' }).click();
  await page.getByRole('button', { name: '+1 year' }).click();
  await shot('02-add');
  await page.getByRole('button', { name: 'Add to pantry' }).click();
  await page.getByRole('heading', { name: 'Light soy sauce' }).waitFor();
  assert.match(await page.locator('h2', { hasText: 'In stock' }).innerText(), /2/);

  // open one: the opened bottle's use-by is 90 days, sooner than the printed year
  await page.getByRole('button', { name: 'Opened one' }).click();
  await page.locator('.tag', { hasText: 'opened' }).waitFor();
  assert.match(await page.locator('.batches').innerText(), /90 days left|3 months left/);

  // used one up, then undo
  await page.getByRole('button', { name: 'Used one up' }).click();
  assert.match(await page.locator('h2', { hasText: 'In stock' }).innerText(), /1/);
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.match(await page.locator('h2', { hasText: 'In stock' }).innerText(), /2/);

  // an item typed by hand with a near date shows under "Use soon" on Home
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await page.locator('#f-name').fill('Tau kwa');
  await page.locator('#f-cat').selectOption('Dairy & eggs');
  await page.locator('#f-loc').selectOption('Fridge');
  await page.getByRole('button', { name: '+1 week' }).click();
  await page.getByRole('button', { name: 'Add to pantry' }).click();
  await page.getByRole('heading', { name: 'Tau kwa' }).waitFor();
  await page.getByRole('link', { name: 'Home' }).click();
  await page.locator('section', { hasText: 'Use soon' }).getByText('Tau kwa').waitFor();

  // using the last one puts it on the shopping list as out of stock
  await page.locator('.row', { hasText: 'Tau kwa' }).getByRole('button', { name: /Used up one/ }).click();
  await page.getByRole('link', { name: 'Shopping' }).click();
  await page.locator('section', { hasText: 'Suggested from your pantry' }).getByText('out of stock').waitFor();
  await page.getByRole('button', { name: 'Add Tau kwa to the list' }).click();
  await page.locator('#shop-text').fill('Bananas');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  assert.equal(await page.locator('.shop .row').count(), 2);
  assert.match(await page.getByRole('link', { name: 'Search FairPrice for Bananas' }).getAttribute('href'), /fairprice\.com\.sg\/search\?query=Bananas/);
  await shot('05-shop');
  // ticking an item from the pantry asks how many were bought
  await page.locator('.shop .row', { hasText: 'Tau kwa' }).locator('input[type=checkbox]').check();
  await page.locator('#sheet[open]').waitFor();
  await page.getByRole('button', { name: 'Add to stock' }).click();
  await page.getByRole('link', { name: 'Items' }).click();
  await page.locator('.row', { hasText: 'Tau kwa' }).locator('.qty', { hasText: '1' }).waitFor();

  // sample data: patterns and the item screen
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Add sample items' }).click();
  await page.getByRole('link', { name: 'Home' }).click();
  await page.locator('section', { hasText: 'Expired' }).getByText('Wholemeal bread').waitFor();
  await shot('03-home');
  await page.getByRole('link', { name: 'Items' }).click();
  await page.locator('#q').fill('milk');
  await page.locator('.row', { hasText: 'Fresh milk' }).waitFor();
  assert.equal(await page.locator('.row').count(), 1);
  await shot('04-items');
  await page.locator('.row-main', { hasText: 'Fresh milk' }).click();
  await page.getByText(/1 every \d+ days/).waitFor();
  await shot('06-item');

  // survives a reload and works offline once the service worker has the files
  await page.goto(base + '#items');
  await page.reload();
  await page.locator('.row', { hasText: 'Tau kwa' }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('.row', { hasText: 'Kaya' }).first().waitFor();
  await ctx.setOffline(false);

  // settings ends with the app version and "Get the latest version"
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.locator('#ver', { hasText: /App version \d{4}-\d{2}-\d{2} \([0-9a-f]{8}\)/ }).waitFor();
  await page.getByRole('button', { name: 'Not updating? Get the latest version' }).waitFor();
  await shot('07-settings');

  // backup is valid JSON with everything in it
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up (JSON)' }).click()]);
  const j = JSON.parse(await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8'));
  assert.equal(j.app, 'pantry');
  assert.ok(j.items.length >= 14);

  // nothing sticks out sideways on a phone
  for (const h of ['#home', '#items', '#add', '#shop', '#settings']) {
    await page.goto(base + h);
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(w <= 0, `${h} scrolls sideways by ${w}px`);
  }
  assert.deepEqual(errors, []);
  console.log('pantry e2e: ok');
} finally {
  await browser.close();
  srv.close();
}
