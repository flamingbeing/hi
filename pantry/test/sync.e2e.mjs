// Family sharing against the local Firebase emulators (fake accounts, demo-pantry project; never the live one):
// one person starts the pantry and adds another, both see each other's changes, an outsider sees nothing, the owner
// can't be removed, and signing out goes back to the phone's own pantry. Photos: members read and write photos/<id>,
// outsiders can't; thumbnails over 12 KB and photos over 150 KB are refused; no item may gain or change an old-style
// `photo` (keeping or removing one is fine); and an old-style item in the family pantry is moved by the app itself.
// Places: settings/places for members only (that id and fields only, at most 40 names of 1-40 characters), and a
// rename on one phone shows on the other, items included.
// Run: pantry/test/run-sync.sh
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');

const srv = await serve();
const browser = await chromium.launch();
const url = srv.url + '/pantry/?emulator';
const errors = [];
const settle = p => p.waitForTimeout(400);
async function person(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(email + ': ' + e.message));
  if (process.env.DEBUG) page.on('console', m => console.log(email, m.type(), m.text()));
  await page.goto(url + '#/settings');
  await page.waitForFunction(() => window.__pantry?.signIn);
  await page.evaluate(e => window.__pantry.signIn(e), email);
  await page.locator('#main', { hasText: email }).waitFor();
  return page;
}
// The emulator's admin door ("Bearer owner" skips the rules): seeds what today's rules no longer let anyone write.
const FS = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085'}/v1/projects/demo-pantry/databases/(default)/documents/`;
const val = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { mapValue: { fields: fields(v) } };
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const unval = v => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue)
  : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(unval) : 'mapValue' in v ? unfields(v.mapValue.fields || {}) : undefined;
const unfields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, unval(v)]));
const admin = {
  async put(path, o) { const r = await fetch(FS + path, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields(o) }) }); assert.ok(r.ok, 'seed ' + path); },
  async get(path) { const r = await fetch(FS + path, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? unfields((await r.json()).fields || {}) : null; },
};
const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await settle(p); };
const sub = (p, name) => p.locator('#pa-items-list .ha-row', { hasText: name }).locator('.ha-row-sub');
try {
  const mum = await person('mum@example.com');
  await mum.click('[data-act="hh-create"]');
  await mum.locator('#main .ha-row-title', { hasText: 'Our pantry' }).waitFor();
  await mum.fill('#pa-member-email', 'Dad@Example.com');
  await mum.click('#pa-member-add button[type=submit]');
  await mum.locator('#main .ha-row-title', { hasText: 'dad@example.com' }).waitFor();
  // an invite from Mum's own mail app: the toast offers it, and Dad's row keeps an envelope for later
  await mum.locator('.ha-toast-action', { hasText: 'Email invite' }).waitFor();
  const invite = await mum.getAttribute('a[aria-label="Email an invite to dad@example.com"]', 'href');
  assert.match(invite, /^mailto:dad%40example\.com\?subject=Our%20family%20pantry&body=/);
  assert.match(decodeURIComponent(invite), /Sign in with Google, using this account \(dad@example\.com\)/);
  assert.equal(await mum.inputValue('#pa-member-email'), '');
  await mum.click('[data-act="sample"]');
  await settle(mum);

  const dad = await person('dad@example.com');
  await dad.locator('#main .ha-row-title', { hasText: 'Our pantry' }).waitFor();
  await go(dad, '#/items');
  await dad.locator('#pa-items-list .ha-row', { hasText: 'Kaya' }).waitFor();
  // dad uses up the kaya; mum's screen follows
  await go(mum, '#/items');
  await sub(mum, 'Kaya').filter({ hasText: '1 left' }).waitFor();
  await dad.locator('#pa-items-list a.ha-row', { hasText: 'Kaya' }).click(); await settle(dad);
  await dad.locator('[data-act="use"]').first().click(); await settle(dad);
  await sub(mum, 'Kaya').filter({ hasText: 'None left' }).waitFor();
  // and the history says who
  const kaya = await mum.evaluate(() => [...window.__pantry.S.items.values()].find(i => i.name === 'Kaya').id);
  await go(mum, '#/item/' + kaya);
  await mum.locator('#main .ha-row-sub', { hasText: 'dad' }).first().waitFor();

  // an outsider is not in any pantry and can't read or join this one
  const stranger = await person('stranger@example.com');
  await stranger.locator('[data-act="hh-create"]').waitFor();
  const hid = await mum.evaluate(() => window.__pantry.S.household.id);
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
    return out;
  }, hid);
  assert.deepEqual(denied, Array(6).fill('permission-denied'), 'outsider denied: ' + denied.join(', '));
  // dad can't remove the owner, or hand the pantry to himself
  const ownerKept = await dad.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const out = [];
    try { await F.updateDoc(F.doc(F.getFirestore(), 'households', hid), { members: ['dad@example.com'] }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.updateDoc(F.doc(F.getFirestore(), 'households', hid), { owner: 'dad@example.com' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(ownerKept, ['permission-denied', 'permission-denied']);

  // ---- photos: thumbnails on items, photos in photos/{id}, size caps, old-style photos ----
  const rules = await mum.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), d = (...p) => F.doc(db, 'households', hid, ...p);
    const out = {};
    const tryIt = async (name, fn) => { try { await fn(); out[name] = 'ok'; } catch (e) { out[name] = e.code; } };
    const item = (id, extra = {}) => ({ id, name: 'Rules ' + id, batches: [], ...extra });
    await tryIt('photo write', () => F.setDoc(d('photos', 'p1'), { id: 'p1', data: 'data:image/jpeg;base64,' + 'A'.repeat(100000), updatedAt: 'x' }));
    await tryIt('photo read', async () => { if (!(await F.getDoc(d('photos', 'p1'))).exists()) throw { code: 'missing' }; });
    await tryIt('photo over 150 KB', () => F.setDoc(d('photos', 'p2'), { id: 'p2', data: 'data:image/jpeg;base64,' + 'A'.repeat(153600) }));
    await tryIt('photo extra field', () => F.setDoc(d('photos', 'p3'), { id: 'p3', data: 'data:x', name: 'x' }));
    await tryIt('thumb 10 KB', () => F.setDoc(d('items', 't1'), item('t1', { thumb: 'data:image/jpeg;base64,' + 'A'.repeat(10000), hasPhoto: true })));
    await tryIt('thumb over 12 KB', () => F.setDoc(d('items', 't2'), item('t2', { thumb: 'A'.repeat(12289) })));
    await tryIt('new item with a photo', () => F.setDoc(d('items', 't3'), item('t3', { photo: 'data:image/jpeg;base64,AAAA' })));
    await tryIt('new item with an empty photo', () => F.setDoc(d('items', 't4'), item('t4', { photo: '' })));
    await tryIt('item gains a photo', () => F.setDoc(d('items', 't1'), item('t1', { photo: 'data:image/jpeg;base64,AAAA' })));
    await tryIt('item gains a photo (merge)', () => F.updateDoc(d('items', 't4'), { photo: 'data:image/jpeg;base64,AAAA' }));
    return out;
  }, hid);
  assert.deepEqual(rules, {
    'photo write': 'ok', 'photo read': 'ok', 'photo over 150 KB': 'permission-denied', 'photo extra field': 'permission-denied',
    'thumb 10 KB': 'ok', 'thumb over 12 KB': 'permission-denied', 'new item with a photo': 'permission-denied',
    'new item with an empty photo': 'ok', 'item gains a photo': 'permission-denied', 'item gains a photo (merge)': 'permission-denied',
  });
  // an old-style item (seeded past the rules; its picture can't be read, so the app leaves it alone): it can still be
  // edited with its photo unchanged, its photo can't be changed, and it can be removed
  const OLD = 'data:image/jpeg;base64,' + 'B'.repeat(200000);
  await admin.put(`households/${hid}/items/old1`, { id: 'old1', name: 'Old one', batches: [], photo: OLD });
  await settle(mum);
  const old = await mum.evaluate(async ([hid, OLD]) => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const ref = F.doc(F.getFirestore(), 'households', hid, 'items', 'old1');
    const out = [];
    for (const data of [{ id: 'old1', name: 'Old one, renamed', batches: [], photo: OLD }, { id: 'old1', name: 'x', batches: [], photo: OLD + 'C' }, { id: 'old1', name: 'Old one, renamed', batches: [] }]) {
      try { await F.setDoc(ref, data); out.push('ok'); } catch (e) { out.push(e.code); }
    }
    return out;
  }, [hid, OLD]);
  assert.deepEqual(old, ['ok', 'permission-denied', 'ok'], 'old-style photo: kept, changed, removed');
  // an outsider can't read, list or write photos
  const outsider = await stranger.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), out = [];
    try { await F.getDoc(F.doc(db, 'households', hid, 'photos', 'p1')); out.push('read'); } catch (e) { out.push(e.code); }
    try { await F.getDocs(F.collection(db, 'households', hid, 'photos')); out.push('listed'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', hid, 'photos', 'p9'), { id: 'p9', data: 'data:x' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(outsider, Array(3).fill('permission-denied'), 'outsider and photos: ' + outsider.join(', '));
  // the app moves a real old-style photo by itself: photo first, then the item keeps only a thumbnail
  const real = await mum.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360; const g = c.getContext('2d');
    g.fillStyle = '#c33'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#fff'; g.fillRect(60, 60, 200, 120);
    return c.toDataURL('image/jpeg', 0.72);
  });
  await admin.put(`households/${hid}/items/old2`, { id: 'old2', name: 'Old photo', batches: [], photo: real, createdBy: 'mum' });
  let moved = null;
  for (let i = 0; i < 40 && !(moved && moved.hasPhoto && !('photo' in moved)); i++) { await settle(mum); moved = await admin.get(`households/${hid}/items/old2`); }
  assert.ok(moved && moved.hasPhoto === true && !('photo' in moved) && moved.thumb.startsWith('data:image/jpeg') && moved.thumb.length <= 12288, 'the old item now holds a thumbnail only');
  assert.equal(moved.name, 'Old photo');
  assert.equal((await admin.get(`households/${hid}/photos/old2`))?.data, real, 'its photo moved to photos/old2 unchanged');
  // and the family sees it: dad's list shows the thumbnail, his item screen the photo
  await go(dad, '#/items');
  await dad.waitForFunction(t => [...document.querySelectorAll('#pa-items-list img.ha-row-thumb')].some(i => i.getAttribute('src') === t), moved.thumb);
  await go(dad, '#/item/old2');
  await dad.waitForFunction(d => document.querySelector('#pa-hero')?.src === d, real);
  // deleting an item in the app deletes its photo
  await dad.click('[data-act="delete"]'); await settle(dad); await settle(dad);
  assert.equal(await admin.get(`households/${hid}/photos/old2`), null, 'deleting the item deleted its photo');

  // ---- places: settings/places is members-only, only that id, only id/list/updatedAt, at most 40 names of 1-40 characters ----
  const placeRules = await mum.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), d = id => F.doc(db, 'households', hid, 'settings', id);
    const out = {};
    const tryIt = async (name, fn) => { try { await fn(); out[name] = 'ok'; } catch (e) { out[name] = e.code; } };
    const doc = list => ({ id: 'places', list, updatedAt: 'x' });
    await tryIt('40 places of 40 characters', () => F.setDoc(d('places'), doc(Array.from({ length: 40 }, (_, i) => String(i).padEnd(40, 'x')))));
    await tryIt('read', async () => { if (!(await F.getDoc(d('places'))).exists()) throw { code: 'missing' }; });
    await tryIt('41 places', () => F.setDoc(d('places'), doc(Array.from({ length: 41 }, (_, i) => 'P' + i))));
    await tryIt('a 41-character name', () => F.setDoc(d('places'), doc(['Fridge', 'x'.repeat(41)])));
    await tryIt('a long name at the end', () => F.setDoc(d('places'), doc([...Array.from({ length: 39 }, (_, i) => 'P' + i), 'x'.repeat(41)])));
    await tryIt('an empty name', () => F.setDoc(d('places'), doc(['Fridge', ''])));
    await tryIt('a name with a newline', () => F.setDoc(d('places'), doc(['x'.repeat(30) + '\n' + 'x'.repeat(30)])));
    await tryIt('a number', () => F.setDoc(d('places'), doc(['Fridge', 3])));
    await tryIt('no places', () => F.setDoc(d('places'), doc([])));
    await tryIt('not a list', () => F.setDoc(d('places'), doc('Fridge')));
    await tryIt('another field', () => F.setDoc(d('places'), { ...doc(['Fridge']), colour: 'red' }));
    await tryIt('another id', () => F.setDoc(d('theme'), { id: 'places', list: ['Fridge'], updatedAt: 'x' }));
    await tryIt('a mismatched id field', () => F.setDoc(d('places'), { id: 'theme', list: ['Fridge'], updatedAt: 'x' }));
    return out;
  }, hid);
  assert.deepEqual(placeRules, {
    '40 places of 40 characters': 'ok', read: 'ok', '41 places': 'permission-denied', 'a 41-character name': 'permission-denied',
    'a long name at the end': 'permission-denied', 'an empty name': 'permission-denied', 'a name with a newline': 'permission-denied', 'a number': 'permission-denied',
    'no places': 'permission-denied', 'not a list': 'permission-denied', 'another field': 'permission-denied',
    'another id': 'permission-denied', 'a mismatched id field': 'permission-denied',
  });
  const outsiderPlaces = await stranger.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), out = [];
    try { await F.getDoc(F.doc(db, 'households', hid, 'settings', 'places')); out.push('read'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', hid, 'settings', 'places'), { id: 'places', list: ['Mine'], updatedAt: 'x' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.deleteDoc(F.doc(db, 'households', hid, 'settings', 'places')); out.push('deleted'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(outsiderPlaces, Array(3).fill('permission-denied'), 'outsider and places: ' + outsiderPlaces.join(', '));
  // back to a real list, then mum renames a place in the app and dad's phone follows (list and items)
  await mum.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    await F.deleteDoc(F.doc(F.getFirestore(), 'households', hid, 'settings', 'places'));
  }, hid);
  await settle(mum); await settle(dad);
  await go(mum, '#/places');
  await mum.locator('[data-act="place-open"][data-v="Fridge"]').click(); await settle(mum);
  await mum.fill('#pa-pl-name', 'Kitchen fridge');
  await mum.locator('#pa-pl-form button[type=submit]').click(); await settle(mum);
  await go(dad, '#/places');
  await dad.locator('[data-act="place-open"][data-v="Kitchen fridge"]').waitFor();
  assert.equal(await dad.locator('[data-act="place-open"][data-v="Fridge"]').count(), 0, 'dad sees the rename');
  const dadSees = await dad.evaluate(() => [...window.__pantry.S.items.values()].filter(i => /fridge/i.test(i.location || '')).map(i => i.location));
  assert.ok(dadSees.length && dadSees.every(l => l === 'Kitchen fridge'), 'and his items moved with it: ' + dadSees.join(', '));
  const saved = await admin.get(`households/${hid}/settings/places`);
  assert.equal(saved.list[1], 'Kitchen fridge');
  assert.deepEqual(Object.keys(saved).sort(), ['id', 'list', 'updatedAt']);

  // mum signs out: back to this phone's own (empty) pantry
  await go(mum, '#/settings');
  await mum.click('[data-act="signout"]');
  await mum.locator('[data-act="signin"]').waitFor();
  await go(mum, '#/');
  assert.equal(await mum.locator('.ha-large-sub').textContent(), 'Saved on this phone');
  assert.deepEqual(errors, []);
  console.log('pantry sync e2e: ok');
} finally {
  await browser.close();
  srv.close();
}
