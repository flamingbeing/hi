// Household sharing against the local Firebase emulators (fake accounts, demo-kakihome project; never the live one):
// one person starts Kaki Home and adds another, both see each other's changes, an outsider sees nothing, the owner
// can't be removed, and signing out goes back to the phone's own list.
// Run: kakihome/test/run-sync.sh
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');

const srv = await serve();
const browser = await chromium.launch();
const url = srv.url + '/kakihome/?emulator';
const errors = [];
const settle = p => p.waitForTimeout(400);
async function person(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(email + ': ' + e.message));
  if (process.env.DEBUG) page.on('console', m => console.log(email, m.type(), m.text()));
  await page.goto(url + '#/settings');
  await page.waitForFunction(() => window.__kakihome?.signIn);
  await page.evaluate(e => window.__kakihome.signIn(e), email);
  await page.locator('#main', { hasText: email }).waitFor();
  return page;
}
const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await settle(p); };
const sub = (p, name) => p.locator('#kh-items-list .ha-row', { hasText: name }).locator('.ha-row-sub');
try {
  const mum = await person('mum@example.com');
  await mum.click('[data-act="hh-create"]');
  await mum.locator('#main .ha-row-title', { hasText: 'Our home' }).waitFor();
  await mum.fill('#kh-member-email', 'Dad@Example.com');
  await mum.click('#kh-member-add button[type=submit]');
  await mum.locator('#main .ha-row-title', { hasText: 'dad@example.com' }).waitFor();
  // an invite from Mum's own mail app: the toast offers it, and Dad's card keeps it for later
  await mum.locator('.ha-toast-action', { hasText: 'Email invite' }).waitFor();
  await mum.click('[data-act="person"][data-v="dad@example.com"]'); await settle(mum);
  const card = mum.locator('dialog.ha-sheet[open]');
  assert.equal(await card.locator('.ha-sheet-title').textContent(), 'Household member');
  assert.equal(await card.locator('[data-act="member-del"]').count(), 1, 'Stop sharing on someone else');
  const invite = await card.locator('a', { hasText: 'Email an invite' }).getAttribute('href');
  assert.match(invite, /^mailto:dad%40example\.com\?subject=Our%20household%20on%20Kaki%20Home&body=/);
  assert.match(decodeURIComponent(invite), /Sign in with Google, using this account \(dad@example\.com\)/);
  // name him: the list shows the name with the email underneath
  await mum.fill('#kh-person-name', '  Dad  ');
  if (process.env.SHOTS) await mum.screenshot({ path: process.env.SHOTS + '/person-card.png' });
  await card.locator('button[type=submit]').click(); await settle(mum);
  await mum.locator('[data-act="person"][data-v="dad@example.com"] .ha-row-title', { hasText: 'Dad' }).waitFor();
  assert.match(await mum.locator('[data-act="person"][data-v="dad@example.com"] .ha-row-sub').textContent(), /dad@example\.com/);
  if (process.env.SHOTS) await mum.screenshot({ path: process.env.SHOTS + '/people-list.png', fullPage: true });
  // the owner's own card: no Stop sharing
  await mum.click('[data-act="person"][data-v="mum@example.com"]'); await settle(mum);
  assert.equal(await mum.locator('dialog.ha-sheet[open] [data-act="member-del"]').count(), 0, 'the owner can’t be removed');
  await mum.click('dialog.ha-sheet[open] [data-ha-close]'); await settle(mum);
  assert.equal(await mum.inputValue('#kh-member-email'), '');
  await mum.click('[data-act="sample"]');
  await settle(mum);

  const dad = await person('dad@example.com');
  await dad.locator('#main .ha-row-title', { hasText: 'Our home' }).waitFor();
  // the name reached Dad's phone too, and his changes now carry it
  await dad.locator('[data-act="person"][data-v="dad@example.com"] .ha-row-title', { hasText: 'Dad' }).waitFor();
  await go(dad, '#/items');
  await dad.locator('#kh-items-list .ha-row', { hasText: 'Kaya' }).waitFor();
  // dad uses up the kaya; mum's screen follows
  await go(mum, '#/items');
  await sub(mum, 'Kaya').filter({ hasText: '1 left' }).waitFor();
  await dad.locator('#kh-items-list a.ha-row', { hasText: 'Kaya' }).click(); await settle(dad);
  await dad.locator('[data-act="use"]').first().click(); await settle(dad);
  await sub(mum, 'Kaya').filter({ hasText: 'None left' }).waitFor();
  // and the history says who
  const kaya = await mum.evaluate(() => [...window.__kakihome.S.items.values()].find(i => i.name === 'Kaya').id);
  await go(mum, '#/item/' + kaya);
  await mum.locator('#main .ha-row-sub', { hasText: 'Dad' }).first().waitFor();

  // an outsider is not in any household and can't read or join this one
  const stranger = await person('stranger@example.com');
  await stranger.locator('[data-act="hh-create"]').waitFor();
  const hid = await mum.evaluate(() => window.__kakihome.S.household.id);
  const denied = await stranger.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore();
    const out = [];
    for (const p of [['households', hid], ['households', hid, 'items', 'x']]) {
      try { await F.getDoc(F.doc(db, ...p)); out.push('read'); } catch (e) { out.push(e.code); }
    }
    try { await F.getDocs(F.collection(db, 'households', hid, 'items')); out.push('listed'); } catch (e) { out.push(e.code); }
    try { await F.updateDoc(F.doc(db, 'households', hid), { members: ['stranger@example.com', 'mum@example.com'] }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', 'fake'), { name: 'x', owner: 'mum@example.com', members: ['mum@example.com', 'stranger@example.com'] }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', hid, 'items', 'evil'), { id: 'evil', name: 'x' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.getDoc(F.doc(db, 'households', hid, 'settings', 'people')); out.push('read'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', hid, 'settings', 'people'), { id: 'people', names: { 'mum@example.com': 'x' } }); out.push('wrote'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(denied, Array(8).fill('permission-denied'), 'outsider denied: ' + denied.join(', '));
  // members' names: only the 'people' document, only id/names/updatedAt, at most 20 names
  const shapes = await dad.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), out = [];
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}@example.com`, 'x']));
    for (const [id, data] of [['other', { id: 'other', names: {} }], ['people', { id: 'people', names: many }], ['people', { id: 'people', names: {}, extra: 1 }], ['people', { id: 'people', names: { 'dad@example.com': 'Dad' }, updatedAt: 'now' }]]) {
      try { await F.setDoc(F.doc(db, 'households', hid, 'settings', id), data); out.push('ok'); } catch (e) { out.push(e.code); }
    }
    return out;
  }, hid);
  assert.deepEqual(shapes, ['permission-denied', 'permission-denied', 'permission-denied', 'ok'], 'settings shapes: ' + shapes.join(', '));
  // dad can't remove the owner, or hand Kaki Home to himself
  const ownerKept = await dad.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const out = [];
    try { await F.updateDoc(F.doc(F.getFirestore(), 'households', hid), { members: ['dad@example.com'] }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.updateDoc(F.doc(F.getFirestore(), 'households', hid), { owner: 'dad@example.com' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(ownerKept, ['permission-denied', 'permission-denied']);

  // mum signs out: back to this phone's own (empty) list
  await go(mum, '#/settings');
  await mum.click('[data-act="signout"]');
  await mum.locator('[data-act="signin"]').waitFor();
  await go(mum, '#/');
  assert.equal(await mum.locator('.ha-large-sub').textContent(), 'Saved on this phone');
  assert.deepEqual(errors, []);
  console.log('kakihome sync e2e: ok');
} finally {
  await browser.close();
  srv.close();
}
