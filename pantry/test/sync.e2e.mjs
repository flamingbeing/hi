// Family sharing against the local Firebase emulators (fake accounts, demo project; never the live one):
// one person starts the pantry and adds another, both see each other's changes, an outsider sees nothing.
// Run: test/run-sync.sh
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');

const srv = await serve();
const browser = await chromium.launch();
const url = srv.url.replace('127.0.0.1', 'localhost') + '/pantry/?emulator#settings';
const errors = [];
async function person(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(email + ': ' + e.message));
  if (process.env.DEBUG) page.on('console', m => console.log(email, m.type(), m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__pantry?.signIn);
  await page.evaluate(e => window.__pantry.signIn(e), email);
  await page.getByText('Signed in as').waitFor();
  return page;
}
try {
  const mum = await person('mum@example.com');
  await mum.getByRole('button', { name: 'Start our family pantry' }).click();
  await mum.locator('#sync', { hasText: 'Shared' }).waitFor();
  assert.equal(await mum.locator('#sync').innerText(), 'Shared');
  await mum.locator('#member-email').fill('Dad@Example.com');
  await mum.getByRole('button', { name: 'Add', exact: true }).click();
  await mum.locator('.members', { hasText: 'dad@example.com' }).waitFor();
  await mum.getByRole('button', { name: 'Add sample items' }).click();

  const dad = await person('dad@example.com');
  await dad.locator('#sync', { hasText: 'Shared' }).waitFor();
  await dad.goto(url.replace('#settings', '#items'));
  await dad.locator('.row', { hasText: 'Kaya' }).waitFor();
  // dad uses up the kaya; mum's screen follows
  await mum.goto(url.replace('#settings', '#items'));
  await mum.locator('.row', { hasText: 'Kaya' }).locator('.qty', { hasText: '1' }).waitFor();
  await dad.locator('.row', { hasText: 'Kaya' }).getByRole('button', { name: /Used up one/ }).click();
  await mum.locator('.row', { hasText: 'Kaya' }).locator('.qty', { hasText: '0' }).waitFor();

  // an outsider is not in any pantry and can't read this one
  const stranger = await person('stranger@example.com');
  await stranger.getByRole('button', { name: 'Start our family pantry' }).waitFor();
  const hid = await mum.evaluate(() => window.__pantry.S.household.id);
  const denied = await stranger.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore();
    const out = [];
    for (const p of [['households', hid], ['households', hid, 'items', 'x']]) {
      try { await F.getDoc(F.doc(db, ...p)); out.push('read'); } catch (e) { out.push(e.code); }
    }
    try { await F.updateDoc(F.doc(db, 'households', hid), { members: ['stranger@example.com', 'mum@example.com'] }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', 'fake'), { name: 'x', owner: 'mum@example.com', members: ['mum@example.com', 'stranger@example.com'] }); out.push('wrote'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(denied, ['permission-denied', 'permission-denied', 'permission-denied', 'permission-denied']);
  // dad can't remove the owner
  const ownerKept = await dad.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    try { await F.updateDoc(F.doc(F.getFirestore(), 'households', hid), { members: ['dad@example.com'] }); return 'wrote'; } catch (e) { return e.code; }
  }, hid);
  assert.equal(ownerKept, 'permission-denied');
  assert.deepEqual(errors, []);
  console.log('pantry sync e2e: ok');
} finally {
  await browser.close();
  srv.close();
}
