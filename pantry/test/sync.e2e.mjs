// Family sharing against the local Firebase emulators (fake accounts, demo-pantry project; never the live one):
// one person starts the pantry and adds another, both see each other's changes, an outsider sees nothing, the owner
// can't be removed, and signing out goes back to the phone's own pantry. Photos: members read and write photos/<id>,
// outsiders can't; thumbnails over 12 KB and photos over 150 KB are refused; no item may gain or change an old-style
// `photo` (keeping or removing one is fine); and an old-style item in the family pantry is moved by the app itself.
// Places: settings/places for members only (that id and fields only, at most 40 names of 1-40 characters), and a
// rename on one phone shows on the other, items included. Names: settings/people for members only (that id, exactly
// id/names/updatedAt, at most 20 names of 1-40 characters on one line, keyed by emails); a name given on one phone
// shows on the other, and signs that person's changes.
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
  async list(path) { const r = await fetch(FS + path + '?pageSize=100', { headers: { Authorization: 'Bearer owner' } }); const j = r.ok ? await r.json() : {}; return (j.documents || []).map(d => unfields(d.fields || {})); },
  async del(path) { const r = await fetch(FS + path, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }); assert.ok(r.ok, 'delete ' + path); },
  async get(path) { const r = await fetch(FS + path, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? unfields((await r.json()).fields || {}) : null; },
};
const SYNC_REFUSED = list => list.length;
const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await settle(p); };
const sub = (p, name) => p.locator('#pa-items-list .ha-row', { hasText: name }).locator('.ha-row-sub');
try {
  const mum = await person('mum@example.com');
  await mum.click('[data-act="hh-create"]');
  await mum.locator('#main .ha-row-title', { hasText: 'Our pantry' }).waitFor();
  await mum.fill('#pa-member-email', 'Dad@Example.com');
  await mum.click('#pa-member-add button[type=submit]');
  await mum.locator('#main .ha-row-title', { hasText: 'dad@example.com' }).waitFor();
  // an invite from Mum's own mail app: the toast offers it, and Dad's contact sheet keeps it for later
  await mum.locator('.ha-toast-action', { hasText: 'Email invite' }).waitFor();
  await mum.click('[data-act="person"][data-v="dad@example.com"]'); await settle(mum);
  const card = mum.locator('dialog.ha-sheet[open]');
  assert.equal(await card.locator('.ha-sheet-title').textContent(), 'Family member');
  assert.equal(await card.locator('[data-pp="remove"]').count(), 1, 'Stop sharing on someone else');
  const invite = await card.locator('a', { hasText: 'Email an invite' }).getAttribute('href');
  assert.match(invite, /^mailto:dad%40example\.com\?subject=Our%20family%20pantry&body=/);
  assert.match(decodeURIComponent(invite), /Continue with Google \(or Use email instead\), using this email address \(dad@example\.com\)/);
  // name him: the list shows the name with the email underneath
  await mum.fill('#pa-person-name', '  Dad  ');
  await card.locator('button[type=submit]').click(); await settle(mum);
  await mum.locator('[data-act="person"][data-v="dad@example.com"] .ha-row-title', { hasText: 'Dad' }).waitFor();
  assert.match(await mum.locator('[data-act="person"][data-v="dad@example.com"] .ha-row-sub').textContent(), /dad@example\.com/);
  // the owner's own card: no Stop sharing
  await mum.click('[data-act="person"][data-v="mum@example.com"]'); await settle(mum);
  assert.equal(await mum.locator('dialog.ha-sheet[open] [data-pp="remove"]').count(), 0, 'the owner can’t be removed');
  await mum.click('dialog.ha-sheet[open] [data-ha-close]'); await settle(mum);
  assert.equal(await mum.inputValue('#pa-member-email'), '');
  await mum.click('[data-act="sample"]');
  await settle(mum);

  const dad = await person('dad@example.com');
  await dad.locator('#main .ha-row-title', { hasText: 'Our pantry' }).waitFor();
  // the name reached Dad's phone too, and his changes now carry it
  await dad.locator('[data-act="person"][data-v="dad@example.com"] .ha-row-title', { hasText: 'Dad' }).waitFor();
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
  await mum.locator('#main .ha-row-sub', { hasText: 'Dad' }).first().waitFor();

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
    try { await F.getDoc(F.doc(db, 'households', hid, 'settings', 'people')); out.push('read'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', hid, 'settings', 'people'), { id: 'people', names: { 'stranger@example.com': 'x' }, updatedAt: 'x' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.deleteDoc(F.doc(db, 'households', hid, 'settings', 'people')); out.push('deleted'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(denied, Array(9).fill('permission-denied'), 'outsider denied: ' + denied.join(', '));
  // names: only settings/people, exactly id/names/updatedAt, at most 20 names of 1-40 characters on one line, keyed by emails
  const peopleRules = await dad.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), d = id => F.doc(db, 'households', hid, 'settings', id);
    const out = {};
    const tryIt = async (name, fn) => { try { await fn(); out[name] = 'ok'; } catch (e) { out[name] = e.code; } };
    const doc = names => ({ id: 'people', names, updatedAt: 'x' });
    const many = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}@example.com`, String(i).padEnd(40, 'x')]));
    await tryIt('20 names of 40 characters', () => F.setDoc(d('people'), doc(many(20))));
    await tryIt('read', async () => { if (!(await F.getDoc(d('people'))).exists()) throw { code: 'missing' }; });
    await tryIt('no names', () => F.setDoc(d('people'), doc({})));
    await tryIt('21 names', () => F.setDoc(d('people'), doc(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}@example.com`, 'x'])))));
    await tryIt('a 41-character name', () => F.setDoc(d('people'), doc({ 'a@example.com': 'A', 'b@example.com': 'x'.repeat(41) })));
    await tryIt('an empty name', () => F.setDoc(d('people'), doc({ 'a@example.com': '' })));
    await tryIt('a name with a newline', () => F.setDoc(d('people'), doc({ 'a@example.com': 'Ah\nMei' })));
    await tryIt('a number', () => F.setDoc(d('people'), doc({ 'a@example.com': 3 })));
    await tryIt('a key that is not an email', () => F.setDoc(d('people'), doc({ 'Mum': 'Mum' })));
    await tryIt('not a map', () => F.setDoc(d('people'), doc(['Mum'])));
    await tryIt('another field', () => F.setDoc(d('people'), { ...doc({ 'a@example.com': 'A' }), colour: 'red' }));
    await tryIt('no updatedAt', () => F.setDoc(d('people'), { id: 'people', names: { 'a@example.com': 'A' } }));
    await tryIt('a mismatched id field', () => F.setDoc(d('people'), { id: 'places', names: {}, updatedAt: 'x' }));
    await tryIt('another id', () => F.setDoc(d('theme'), { id: 'people', names: {}, updatedAt: 'x' }));
    await tryIt('back to Dad', () => F.setDoc(d('people'), doc({ 'dad@example.com': 'Dad' })));
    return out;
  }, hid);
  assert.deepEqual(peopleRules, {
    '20 names of 40 characters': 'ok', read: 'ok', 'no names': 'ok', '21 names': 'permission-denied', 'a 41-character name': 'permission-denied',
    'an empty name': 'permission-denied', 'a name with a newline': 'permission-denied', 'a number': 'permission-denied',
    'a key that is not an email': 'permission-denied', 'not a map': 'permission-denied', 'another field': 'permission-denied',
    'no updatedAt': 'permission-denied', 'a mismatched id field': 'permission-denied', 'another id': 'permission-denied', 'back to Dad': 'ok',
  }, 'people rules');
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

  // ---- names never hide anyone (owner report: after saving a name "the list of my family members disappeared") ----
  // three members on three phones each name themselves; after every save and after a reload each phone still lists
  // all three, with the right names
  const listed = p => p.$$eval('#main [data-act="person"]', bs => bs.map(b => b.dataset.v));
  const everyone = ['mum@example.com', 'dad@example.com', 'gran@example.com'];
  await go(mum, '#/settings');
  await mum.fill('#pa-member-email', 'Gran@Example.com');
  await mum.click('#pa-member-add button[type=submit]');
  await mum.locator('#main [data-act="person"][data-v="gran@example.com"]').waitFor();
  const gran = await person('gran@example.com');
  await gran.locator('#main [data-act="person"][data-v="mum@example.com"]').waitFor();
  const nameSelf = async (p, email, n) => {
    await p.click(`#main [data-act="person"][data-v="${email}"]`); await settle(p);
    await p.fill('#pa-person-name', n);
    await p.locator('dialog.ha-sheet[open] button[type=submit]').click(); await settle(p);
    await p.locator('.ha-toast', { hasText: `Saved: ${n}` }).waitFor();
  };
  await nameSelf(mum, 'mum@example.com', 'Jun');
  assert.deepEqual(await listed(mum), everyone, 'mum still lists everyone right after saving her own name');
  await go(dad, '#/settings');
  await nameSelf(dad, 'dad@example.com', 'Dad');
  await nameSelf(gran, 'gran@example.com', 'Gran');
  const rowsOf = p => p.$$eval('#main [data-act="person"]', bs => bs.map(b => `${b.dataset.v}=${b.querySelector('.ha-row-title').textContent}`));
  for (const [who, p] of [['mum', mum], ['dad', dad], ['gran', gran]]) {
    await go(p, '#/settings');
    await p.waitForFunction(() => document.querySelectorAll('#main [data-act="person"][data-v="gran@example.com"] .ha-row-title')[0]?.textContent === 'Gran');
    assert.deepEqual(await rowsOf(p), ['mum@example.com=Jun', 'dad@example.com=Dad', 'gran@example.com=Gran'], `${who} lists everyone with names`);
    await p.reload();
    await p.waitForFunction(() => window.__pantry?.S.household?.members?.length === 3);
    await go(p, '#/settings');
    await p.waitForFunction(() => document.querySelector('#main [data-act="person"][data-v="gran@example.com"] .ha-row-title')?.textContent === 'Gran');
    assert.deepEqual(await listed(p), everyone, `${who} lists everyone after a reload`);
  }
  // a second, one-person pantry for Mum (what a second "Start our family pantry" leaves behind) that sorts first must
  // not hide the family: the phone keeps its own, and starting a pantry again opens the existing one
  await admin.put('households/0000stray', { name: 'Our pantry', owner: 'mum@example.com', members: ['mum@example.com'] });
  await mum.reload();
  await mum.waitForFunction(() => window.__pantry?.S.household);
  await go(mum, '#/settings');
  assert.equal(await mum.evaluate(() => window.__pantry.S.household.id), hid, 'a stray pantry did not take over');
  assert.deepEqual(await listed(mum), everyone, 'mum still lists everyone with a stray pantry around');
  await mum.evaluate(() => { localStorage.removeItem('pantry:household'); });
  await mum.reload();
  await mum.waitForFunction(() => window.__pantry?.S.household);
  assert.equal(await mum.evaluate(() => window.__pantry.S.household.id), hid, 'with nothing remembered, the pantry with the most people wins');
  await admin.del('households/0000stray');

  if (process.env.SHOTS) { await go(mum, '#/settings'); await mum.screenshot({ path: process.env.SHOTS + '/m06-family-after-names.png' }); }

  // ---- stock changes are instructions: two phones never overwrite each other (online or not) ----
  const FSJS = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
  const net = (p, on) => p.evaluate(async ([on, u]) => { const F = await import(u); const db = F.getFirestore(); await (on ? F.enableNetwork(db) : F.disableNetwork(db)); }, [on, FSJS]);
  const drain = p => p.evaluate(async u => { const F = await import(u); await F.waitForPendingWrites(F.getFirestore()); }, FSJS);
  const act = (p, name, ...args) => p.evaluate(([n, a]) => window.__pantry.act[n](...a), [name, args]);
  const rawItem = id => admin.get(`households/${hid}/items/${id}`);
  const rawQty = async id => Object.fromEntries(Object.entries((await rawItem(id)).batches).map(([k, v]) => [k, v.qty]));
  const has = (p, id) => p.waitForFunction(id => window.__pantry.S.items.has(id), id);
  const shown = (p, id) => p.evaluate(id => Object.fromEntries(window.__pantry.S.items.get(id).batches.map(b => [b.id, b.qty])), id);
  const both = async (id, want, what) => {   // the server and both phones agree
    let got;
    for (let i = 0; i < 25; i++) {   // a refused conversion is applied again by the app a moment after the refusal
      await drain(mum); await drain(dad);
      got = await rawQty(id);
      if (JSON.stringify(got) === JSON.stringify(want)) break;
      await mum.waitForTimeout(300);
    }
    assert.deepEqual(got, want, what + ' (server)');
    for (const [who, p] of [['mum', mum], ['dad', dad]]) { await p.waitForFunction(([id, w]) => JSON.stringify(Object.fromEntries(window.__pantry.S.items.get(id).batches.map(b => [b.id, Math.max(0, b.qty)]))) === w, [id, JSON.stringify(Object.fromEntries(Object.entries(want).map(([k, v]) => [k, Math.max(0, v)])))]); }
  };
  const base = { category: 'Sauces & condiments', location: 'Fridge', brand: '', size: '', barcode: '', lowAt: 0, openDays: null, createdAt: '2026-10-16T00:00:00.000Z', createdBy: 'Mum' };
  await admin.put(`households/${hid}/items/soy`, { id: 'soy', name: 'Soy', ...base, batches: { ba: { qty: 5, expiry: '2027-01-01', openedAt: null, addedAt: '2026-10-01' }, bb: { qty: 2, expiry: '2027-06-01', openedAt: null, addedAt: '2026-10-02' } } });
  await has(mum, 'soy'); await has(dad, 'soy');
  // 1. both use one of the same batch at once: two uses, not one
  await Promise.all([act(mum, 'use', 'soy'), act(dad, 'use', 'soy')]);
  await both('soy', { ba: 3, bb: 2 }, 'both phones used one: 5 - 2');
  // 2. dad has no signal and uses one; mum uses one; dad's phone says it is waiting; then the signal returns: both count
  await net(dad, false);
  await act(dad, 'use', 'soy', 'ba');
  await go(dad, '#/');
  await dad.locator('.pa-sync', { hasText: 'Waiting for signal (1 change)' }).waitFor();
  if (process.env.SHOTS) await dad.screenshot({ path: process.env.SHOTS + '/s02-waiting.png' });
  await act(mum, 'use', 'soy', 'ba'); await drain(mum);
  assert.deepEqual(await rawQty('soy'), { ba: 2, bb: 2 }, 'the server has only mum’s use while dad is offline');
  await net(dad, true);
  await both('soy', { ba: 1, bb: 2 }, 'dad came back: 3 - 2');
  await dad.locator('.pa-sync', { hasText: 'Saved' }).waitFor();
  if (process.env.SHOTS) await dad.screenshot({ path: process.env.SHOTS + '/s01-saved.png' });
  // 3. one phone adds a batch while the other uses from another: both kept
  await Promise.all([act(mum, 'add', 'soy', 3, '2027-03-03', 'bnew'), act(dad, 'use', 'soy', 'bb')]);
  await both('soy', { ba: 1, bb: 1, bnew: 3 }, 'an added batch and a use from another batch');
  // 4. Edit: dad opens the form, mum uses one meanwhile, dad saves a new name: the stock keeps mum's use
  await go(dad, '#/edit/soy');
  await dad.fill('#pa-form [name="name"]', 'Soy sauce');
  await act(mum, 'use', 'soy', 'bnew'); await drain(mum);
  await dad.waitForFunction(() => window.__pantry.S.items.get('soy').batches.find(b => b.id === 'bnew').qty === 2);
  await dad.click('#pa-save'); await settle(dad);
  await both('soy', { ba: 1, bb: 1, bnew: 2 }, 'a form saved after another phone used one');
  assert.equal((await rawItem('soy')).name, 'Soy sauce');
  // ... and the same offline: dad renames with no signal, mum uses one, dad reconnects: the new name and mum's use
  await go(dad, '#/edit/soy'); await net(dad, false);
  await dad.fill('#pa-form [name="name"]', 'Light soy sauce'); await dad.click('#pa-save'); await settle(dad);
  await act(mum, 'use', 'soy', 'bnew'); await drain(mum);
  await net(dad, true);
  await both('soy', { ba: 1, bb: 1, bnew: 1 }, 'an offline rename and a use');
  assert.equal((await rawItem('soy')).name, 'Light soy sauce');
  await mum.waitForFunction(() => window.__pantry.S.items.get('soy').name === 'Light soy sauce');
  // 5. Undo after another phone changed the item gives back only this phone's change
  const used = await act(mum, 'use', 'soy', 'bb');   // bb 1 -> 0
  await act(dad, 'use', 'soy', 'ba'); await drain(dad);   // ba 1 -> 0
  await act(mum, 'undo'); await drain(mum);
  await both('soy', { ba: 0, bb: 1, bnew: 1 }, 'undo gave back mum’s unit only');
  assert.deepEqual(Object.keys(used.ops.inc), ['batches.bb.qty']);
  // 6. an old-style item (an array): both phones read it; the first change converts it, with ids both phones agree on
  const Lg = await import('../js/logic.js');
  await admin.put(`households/${hid}/items/old`, { id: 'old', name: 'Old', ...base, batches: [{ id: 'x1', qty: 2, expiry: '2027-01-01' }, { qty: 1, expiry: null }] });
  await has(mum, 'old'); await has(dad, 'old');
  const legacy = Lg.legacyBatchId('old', 1);
  assert.deepEqual(await shown(mum, 'old'), { x1: 2, [legacy]: 1 }); assert.deepEqual(await shown(dad, 'old'), { x1: 2, [legacy]: 1 });
  await act(mum, 'use', 'old'); await drain(mum);
  const conv = await rawItem('old');
  assert.ok(!Array.isArray(conv.batches), 'the first change turned it into a map');
  assert.deepEqual(Object.fromEntries(Object.entries(conv.batches).map(([k, v]) => [k, v.qty])), { x1: 1, [legacy]: 1 }, 'ids kept and derived, the dated batch used first');
  // another old item, converted by a use on one phone, then (an older phone) written back as an array: readers cope
  await admin.put(`households/${hid}/items/old2`, { id: 'old2', name: 'Old two', ...base, batches: [{ id: 'y1', qty: 4, expiry: '2027-01-01' }] });
  await has(mum, 'old2'); await has(dad, 'old2');
  await act(mum, 'use', 'old2', 'y1');
  await both('old2', { y1: 3 }, 'an old item converted by a use');
  assert.equal(SYNC_REFUSED(await dad.evaluate(() => window.__pantry.S.refused)), 0, 'nothing refused');
  // an older phone writes the array back over a map item: readers cope, and the next change converts it again
  await admin.put(`households/${hid}/items/old2`, { id: 'old2', name: 'Old two', ...base, batches: [{ id: 'y1', qty: 3, expiry: '2027-01-01' }] });
  await dad.waitForFunction(() => window.__pantry.S.items.get('old2')._arr === true);
  assert.deepEqual(await shown(dad, 'old2'), { y1: 3 });
  await act(dad, 'use', 'old2'); await both('old2', { y1: 2 }, 'converted again');
  // 7. a change the server refuses is kept on the phone and says Needs attention, with Retry and Discard
  await admin.put(`households/${hid}/items/gone`, { id: 'gone', name: 'Gone soon', ...base, batches: { g1: { qty: 2, expiry: '2027-01-01' } } });
  await has(dad, 'gone');
  await net(dad, false);
  await admin.del(`households/${hid}/items/gone`);
  await act(dad, 'use', 'gone');
  await net(dad, true);
  await go(dad, '#/');
  await dad.locator('.pa-sync', { hasText: 'Needs attention' }).waitFor();
  assert.equal(await dad.evaluate(() => window.__pantry.S.refused.length), 1);
  assert.equal(await dad.evaluate(() => JSON.parse(localStorage.getItem('pantry:refused')).length), 1, 'kept on the phone');
  await go(dad, '#/settings');
  await dad.locator('#main .pa-refused', { hasText: 'Gone soon' }).waitFor();
  assert.match(await dad.locator('#main .pa-refused').textContent(), /removed on another phone/);
  assert.equal(await dad.locator('[data-act="refused-retry"]').count(), 1); assert.equal(await dad.locator('[data-act="refused-discard"]').count(), 1);
  if (process.env.SHOTS) await dad.screenshot({ path: process.env.SHOTS + '/s03-attention.png' });
  // retry: the item is gone, so there is nothing to change; the entry goes
  await dad.click('[data-act="refused-retry"]'); await settle(dad);
  await dad.locator('.pa-sync', { hasText: 'Saved' }).waitFor();
  assert.equal(await dad.evaluate(() => window.__pantry.S.refused.length), 0);
  assert.equal(await admin.get(`households/${hid}/items/gone`), null, 'a retry never brings a deleted item back');
  // discard
  await admin.put(`households/${hid}/items/gone2`, { id: 'gone2', name: 'Gone too', ...base, batches: { g1: { qty: 2, expiry: '2027-01-01' } } });
  await has(dad, 'gone2'); await net(dad, false);
  await admin.del(`households/${hid}/items/gone2`);
  await act(dad, 'use', 'gone2'); await net(dad, true);
  await dad.locator('.pa-sync', { hasText: 'Needs attention' }).waitFor();
  await dad.click('[data-act="refused-discard"]'); await settle(dad);
  await dad.locator('.pa-sync', { hasText: 'Saved' }).waitFor();
  assert.equal(await dad.evaluate(() => JSON.parse(localStorage.getItem('pantry:refused')).length), 0);
  assert.equal(await admin.get(`households/${hid}/items/gone2`), null);

  // ---- the rules for stock: the map and the array both accepted, anything else refused; history is write-once ----
  const stockRules = await mum.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), d = (...p) => F.doc(db, 'households', hid, ...p);
    const out = {};
    const tryIt = async (name, fn) => { try { await fn(); out[name] = 'ok'; } catch (e) { out[name] = e.code; } };
    const item = (id, batches) => ({ id, name: 'Rules ' + id, ...(batches === undefined ? {} : { batches }) });
    const many = (n, f = i => ({ qty: i, expiry: null })) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['b' + i, f(i)]));
    await tryIt('map', () => F.setDoc(d('items', 'r1'), item('r1', { a: { qty: 2, expiry: '2027-01-01' }, 'b-2_X': { qty: 0, expiry: null }, c: { qty: 1 } })));
    await tryIt('empty map', () => F.setDoc(d('items', 'r2'), item('r2', {})));
    await tryIt('array', () => F.setDoc(d('items', 'r3'), item('r3', [{ id: 'a', qty: 1, expiry: null }])));
    await tryIt('no batches', () => F.setDoc(d('items', 'r4'), item('r4')));
    await tryIt('60 batches', () => F.setDoc(d('items', 'r5'), item('r5', many(60))));
    await tryIt('61 batches', () => F.setDoc(d('items', 'r6'), item('r6', many(61))));
    await tryIt('61 in an array', () => F.setDoc(d('items', 'r7'), item('r7', Array.from({ length: 61 }, (_, i) => ({ id: 'a' + i, qty: 1 })))));
    await tryIt('an id with a dot', () => F.setDoc(d('items', 'r8'), item('r8', { 'a.b': { qty: 1 } })));
    await tryIt('an id with a space', () => F.setDoc(d('items', 'r9'), item('r9', { 'a b': { qty: 1 } })));
    await tryIt('a 41-character id', () => F.setDoc(d('items', 'r10'), item('r10', { ['x'.repeat(41)]: { qty: 1 } })));
    await tryIt('a 40-character id', () => F.setDoc(d('items', 'r11'), item('r11', { ['x'.repeat(40)]: { qty: 1 } })));
    await tryIt('a bad id late in the map', () => F.setDoc(d('items', 'r12'), item('r12', { ...many(30), 'zz zz': { qty: 1 } })));
    await tryIt('qty a string', () => F.setDoc(d('items', 'r13'), item('r13', { a: { qty: '2' } })));
    await tryIt('qty 10000', () => F.setDoc(d('items', 'r14'), item('r14', { a: { qty: 10000 } })));
    await tryIt('qty 9999', () => F.setDoc(d('items', 'r15'), item('r15', { a: { qty: 9999 } })));
    await tryIt('qty -99', () => F.setDoc(d('items', 'r16'), item('r16', { a: { qty: -99 } })));
    await tryIt('qty -100', () => F.setDoc(d('items', 'r17'), item('r17', { a: { qty: -100 } })));
    await tryIt('a bad qty among the first 12', () => F.setDoc(d('items', 'r18'), item('r18', { ...many(5), z: { qty: 'x' } })));
    await tryIt('a bad qty after the first 12 (known limit: not checked)', () => F.setDoc(d('items', 'r18b'), item('r18b', { ...many(30), z: { qty: 'x' } })));
    await tryIt('expiry a number', () => F.setDoc(d('items', 'r19'), item('r19', { a: { qty: 1, expiry: 5 } })));
    await tryIt('a batch that is not a map', () => F.setDoc(d('items', 'r20'), item('r20', { a: 3 })));
    await tryIt('batches a string', () => F.setDoc(d('items', 'r21'), item('r21', 'lots')));
    await tryIt('batches a number', () => F.setDoc(d('items', 'r22'), item('r22', 5)));
    // changes by field: an add, a use, a new batch, a removal, all on a map item
    await tryIt('inc a quantity', () => F.updateDoc(d('items', 'r1'), { 'batches.a.qty': F.increment(-1) }));
    await tryIt('a new batch by fields', () => F.updateDoc(d('items', 'r1'), { 'batches.n1.qty': F.increment(3), 'batches.n1.expiry': '2027-02-02' }));
    await tryIt('remove a batch', () => F.updateDoc(d('items', 'r1'), { 'batches.c': F.deleteField() }));
    await tryIt('inc below the floor', () => F.updateDoc(d('items', 'r1'), { 'batches.b-2_X.qty': F.increment(-100) }));
    await tryIt('inc to the floor', () => F.updateDoc(d('items', 'r1'), { 'batches.b-2_X.qty': F.increment(-99) }));
    await tryIt('a bad id by field', () => F.updateDoc(d('items', 'r1'), { 'batches.bad id.qty': F.increment(1) }));
    // an old array turned into a map by one write (what the app does for an old-style item)
    await tryIt('convert an array', () => F.updateDoc(d('items', 'r3'), { batches: { a: { qty: 1, expiry: null } } }));
    await tryIt('a whole item with an array over a map', () => F.setDoc(d('items', 'r3'), item('r3', [{ id: 'a', qty: 1, expiry: null }])));
    // history: created once, never edited; deleting a line (Undo) is fine; writing it again exactly as it is is fine
    const e = (id, qty = 1) => ({ id, itemId: 'r1', type: 'use', qty, at: '2026-10-16T00:00:00.000Z', by: 'Mum' });
    await tryIt('event create', () => F.setDoc(d('events', 'ev1'), e('ev1')));
    await tryIt('event rewritten as it is', () => F.setDoc(d('events', 'ev1'), e('ev1')));
    await tryIt('event changed', () => F.setDoc(d('events', 'ev1'), e('ev1', 5)));
    await tryIt('event field changed', () => F.updateDoc(d('events', 'ev1'), { qty: 7 }));
    await tryIt('event field added', () => F.updateDoc(d('events', 'ev1'), { note: 'x' }));
    await tryIt('event delete', () => F.deleteDoc(d('events', 'ev1')));
    await tryIt('event create again', () => F.setDoc(d('events', 'ev1'), e('ev1')));
    await tryIt('shop line create and change', async () => { await F.setDoc(d('shop', 'sl1'), { id: 'sl1', name: 'Milk', done: false }); await F.updateDoc(d('shop', 'sl1'), { done: true }); });
    return out;
  }, hid);
  assert.deepEqual(stockRules, {
    map: 'ok', 'empty map': 'ok', array: 'ok', 'no batches': 'ok', '60 batches': 'ok', '61 batches': 'permission-denied', '61 in an array': 'permission-denied',
    'an id with a dot': 'permission-denied', 'an id with a space': 'permission-denied', 'a 41-character id': 'permission-denied', 'a 40-character id': 'ok',
    'a bad id late in the map': 'permission-denied', 'qty a string': 'permission-denied', 'qty 10000': 'permission-denied', 'qty 9999': 'ok', 'qty -99': 'ok',
    'qty -100': 'permission-denied', 'a bad qty among the first 12': 'permission-denied', 'a bad qty after the first 12 (known limit: not checked)': 'ok', 'expiry a number': 'permission-denied', 'a batch that is not a map': 'permission-denied',
    'batches a string': 'permission-denied', 'batches a number': 'permission-denied',
    'inc a quantity': 'ok', 'a new batch by fields': 'ok', 'remove a batch': 'ok', 'inc below the floor': 'permission-denied', 'inc to the floor': 'ok', 'a bad id by field': 'permission-denied',
    'convert an array': 'ok', 'a whole item with an array over a map': 'ok',
    'event create': 'ok', 'event rewritten as it is': 'ok', 'event changed': 'permission-denied', 'event field changed': 'permission-denied', 'event field added': 'permission-denied',
    'event delete': 'ok', 'event create again': 'ok', 'shop line create and change': 'ok',
  }, 'stock rules');
  const outsiderStock = await stranger.evaluate(async hid => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    const db = F.getFirestore(), out = [];
    try { await F.setDoc(F.doc(db, 'households', hid, 'items', 'x1'), { id: 'x1', name: 'x', batches: { a: { qty: 1 } } }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.updateDoc(F.doc(db, 'households', hid, 'items', 'r1'), { 'batches.a.qty': F.increment(1) }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.setDoc(F.doc(db, 'households', hid, 'events', 'evx'), { id: 'evx', type: 'use' }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.updateDoc(F.doc(db, 'households', hid, 'events', 'ev1'), { qty: 1 }); out.push('wrote'); } catch (e) { out.push(e.code); }
    try { await F.deleteDoc(F.doc(db, 'households', hid, 'events', 'ev1')); out.push('deleted'); } catch (e) { out.push(e.code); }
    return out;
  }, hid);
  assert.deepEqual(outsiderStock, Array(5).fill('permission-denied'), 'outsider and stock: ' + outsiderStock.join(', '));
  assert.ok(await admin.get(`households/${hid}/events/ev1`), 'the outsider didn’t delete history');

  // ---- merging two pantries for one email (owner: "merge duplicate emails into 1 pantry") ----
  const KINDS5 = ['items', 'events', 'shop', 'photos'];
  const seedPantry = async (id, owner, members, tag, { items = 2, extra = {} } = {}) => {
    await admin.put(`households/${id}`, { name: 'Our pantry', owner, members, createdAt: '2026-10-16T00:00:00.000Z' });
    for (let i = 0; i < items; i++) {
      await admin.put(`households/${id}/items/${tag}i${i}`, { id: `${tag}i${i}`, name: `${tag} item ${i}`, batches: i === 0 ? [{ id: `${tag}q`, qty: 2, expiry: null }] : [], hasPhoto: true, thumb: 'data:image/jpeg;base64,AAAA', ...extra });
      await admin.put(`households/${id}/photos/${tag}i${i}`, { id: `${tag}i${i}`, data: 'data:image/jpeg;base64,BBBB', updatedAt: 'x' });
    }
    await admin.put(`households/${id}/events/${tag}e1`, { id: `${tag}e1`, itemId: `${tag}i0`, type: 'add', at: '2026-10-16T00:00:00.000Z' });
    await admin.put(`households/${id}/shop/${tag}s1`, { id: `${tag}s1`, text: `${tag} milk` });
    await admin.put(`households/${id}/settings/places`, { id: 'places', list: tag === 'A' ? ['Fridge', 'Garage'] : ['Fridge', 'Cellar'], updatedAt: 'x' });
    await admin.put(`households/${id}/settings/people`, { id: 'people', names: Object.fromEntries(members.map(m => [m, tag + ':' + m.split('@')[0]])), updatedAt: 'x' });
  };
  // two pantries, both started by twin: the bigger one is kept, everything of the other moves in
  await seedPantry('dupA', 'twin@example.com', ['twin@example.com', 'pal1@example.com'], 'A');
  await seedPantry('dupB', 'twin@example.com', ['twin@example.com', 'pal2@example.com', 'pal3@example.com'], 'B', { items: 3 });
  const twin = await person('twin@example.com');
  await twin.locator('#main [data-act="merge-open"]').waitFor();
  assert.equal(await twin.evaluate(() => window.__pantry.S.household.id), 'dupB', 'the bigger one opens');
  await go(twin, '#/');
  await twin.locator('a.pa-alert', { hasText: 'more than one family pantry' }).waitFor();
  await go(twin, '#/settings');
  await twin.click('[data-act="merge-open"]'); await settle(twin);
  const sheet = twin.locator('dialog.ha-sheet[open]');
  assert.equal(await sheet.locator('input[name="pa-keep"]').count(), 2);
  assert.equal(await sheet.locator('input[name="pa-keep"]:checked').getAttribute('value'), 'dupB', 'most people preselected');
  assert.match(await sheet.textContent(), /3 people/);
  assert.match(await sheet.textContent(), /2 people/);
  if (process.env.SHOTS) await twin.screenshot({ path: process.env.SHOTS + '/m07-merge.png' });
  await sheet.locator('[data-pm="go"]').click(); await settle(twin);
  await twin.locator('dialog[open] button', { hasText: /^Merge$/ }).click();
  await twin.locator('.ha-toast', { hasText: 'Merged' }).waitFor();
  await settle(twin);
  assert.equal(await admin.get('households/dupA'), null, 'the other household is gone');
  for (const k of [...KINDS5, 'settings']) assert.equal((await admin.list(`households/dupA/${k}`)).length, 0, 'dupA ' + k + ' deleted');
  const kept = await admin.get('households/dupB');
  assert.deepEqual(kept.members, ['twin@example.com', 'pal2@example.com', 'pal3@example.com', 'pal1@example.com'], 'members joined');
  assert.equal(kept.owner, 'twin@example.com');
  const counts = {};
  for (const k of KINDS5) counts[k] = (await admin.list(`households/dupB/${k}`)).length;
  assert.deepEqual(counts, { items: 5, events: 2, shop: 2, photos: 5 }, 'everything of both is in the kept pantry');
  // an item still holding the old array of batches arrives in the new shape (the merge copies through the one door)
  const arrived = await admin.get('households/dupB/items/Ai0');
  assert.ok(arrived.batches && !Array.isArray(arrived.batches) && arrived.batches.Aq?.qty === 2, 'the old array became a map: ' + JSON.stringify(arrived.batches));
  assert.deepEqual((await admin.get('households/dupB/settings/places')).list, ['Fridge', 'Cellar', 'Garage'], 'places merged');
  const names = (await admin.get('households/dupB/settings/people')).names;
  assert.deepEqual(names, { 'twin@example.com': 'B:twin', 'pal2@example.com': 'B:pal2', 'pal3@example.com': 'B:pal3', 'pal1@example.com': 'A:pal1' }, 'names joined, the kept pantry’s names win');
  assert.equal(await twin.evaluate(() => window.__pantry.S.pantries.length), 1);
  assert.equal(await twin.locator('[data-act="merge-open"]').count(), 0, 'the card is gone');
  assert.equal(await twin.evaluate(() => [...window.__pantry.S.items.values()].length), 5, 'the app shows all five items');
  await twin.reload(); await twin.waitForFunction(() => window.__pantry?.S.household?.id === 'dupB');
  assert.equal(await twin.evaluate(() => window.__pantry.S.pantries.length), 1);

  // someone else's pantry can't be merged away by a member (and the rules say the same)
  await seedPantry('dupC', 'boss@example.com', ['boss@example.com', 'twin2@example.com'], 'C');
  await seedPantry('dupD', 'twin2@example.com', ['twin2@example.com'], 'D');
  const twin2 = await person('twin2@example.com');
  await twin2.locator('#main [data-act="merge-open"]').waitFor();
  await twin2.click('[data-act="merge-open"]'); await settle(twin2);
  const sh2 = twin2.locator('dialog.ha-sheet[open]');
  await sh2.locator('input[name="pa-keep"][value="dupD"]').check(); await settle(twin2);
  assert.match(await sh2.textContent(), /Only whoever started a pantry can merge it away\. Ask C:boss to merge them/);
  assert.equal(await sh2.locator('[data-pm="go"]').isDisabled(), true);
  const denyDelete = await twin2.evaluate(async () => {
    const F = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
    try { await F.deleteDoc(F.doc(F.getFirestore(), 'households', 'dupC')); return 'deleted'; } catch (e) { return e.code; }
  });
  assert.equal(denyDelete, 'permission-denied', 'a member who isn’t the owner can’t delete the household');
  assert.ok(await admin.get('households/dupC'), 'still there');
  await sh2.locator('[data-ha-close]').click(); await settle(twin2);

  // a copy that fails deletes nothing: an item the rules refuse (thumbnail over 12 KB) stops the merge
  await seedPantry('dupE', 'twin3@example.com', ['twin3@example.com'], 'E', { extra: { thumb: 'A'.repeat(13000) } });
  await seedPantry('dupF', 'twin3@example.com', ['twin3@example.com', 'x1@example.com'], 'F');
  const twin3 = await person('twin3@example.com');
  await twin3.locator('#main [data-act="merge-open"]').waitFor();
  await twin3.click('[data-act="merge-open"]'); await settle(twin3);
  await twin3.locator('dialog.ha-sheet[open] [data-pm="go"]').click(); await settle(twin3);
  await twin3.locator('dialog[open] button', { hasText: /^Merge$/ }).click();
  await twin3.locator('#pa-merge-msg', { hasText: 'Nothing was lost' }).waitFor();
  assert.ok(await admin.get('households/dupE'), 'the other pantry is still there');
  assert.equal((await admin.list('households/dupE/items')).length, 2, 'and its items');
  assert.equal((await admin.list('households/dupE/photos')).length, 2, 'and its photos');
  assert.ok(await admin.get('households/dupF'));

  // ---- no signal: "can't tell" is never "no pantry", and nothing is created offline ----
  const owned = async email => (await admin.list('households')).filter(h => h.owner === email).length;
  await admin.put('households/offH', { name: 'Our pantry', owner: 'off@example.com', members: ['off@example.com'], createdAt: '2026-10-16T00:00:00.000Z' });
  const offCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await offCtx.route(/:8085\//, r => r.abort());   // the family pantry's server can't be reached
  const off = await offCtx.newPage();
  off.on('pageerror', e => errors.push('off: ' + e.message));
  await off.goto(url + '#/settings');
  await off.waitForFunction(() => window.__pantry?.signIn);
  await off.evaluate(e => window.__pantry.signIn(e), 'off@example.com');
  await off.locator('#main', { hasText: "Can’t check right now" }).waitFor({ timeout: 60000 });
  assert.equal(await off.locator('[data-act="hh-create"]').count(), 0, 'offline: no Start our family pantry');
  assert.equal(await off.locator('[data-act="hh-check"]').count(), 1, 'a Try again instead');
  assert.equal(await owned('off@example.com'), 1, 'nothing was created');
  await off.click('[data-act="hh-check"]');
  await off.locator('.ha-toast').waitFor();
  assert.equal(await off.locator('[data-act="hh-create"]').count(), 0, 'still offline: still no Start');
  await offCtx.unroute(/:8085\//);
  await off.click('[data-act="hh-check"]');
  await off.waitForFunction(() => window.__pantry.S.household?.id === 'offH', null, { timeout: 30000 });
  assert.equal(await owned('off@example.com'), 1, 'online again: the existing pantry opened, no second one');
  // a double tap on Start our family pantry makes one pantry, not two
  const quick = await person('quick@example.com');
  await quick.locator('[data-act="hh-create"]').dblclick();
  await quick.locator('#main .ha-row-title', { hasText: 'Our pantry' }).waitFor();
  await settle(quick);
  assert.equal(await owned('quick@example.com'), 1, 'one pantry after a double tap');

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
