// Three phones on one family pantry, doing random things while going offline and coming back (the emulator: demo-pantry,
// fake accounts; never the live project). Each action is the app's own code (window.__pantry.act: the same functions the
// buttons call), so a run makes dozens of real changes in seconds. Seeded, so a failure can be run again.
//
// What must hold when everyone is back online and everything has been sent:
//   - for every batch of every item: the server's quantity = what it started with + every add - every use the phones
//     issued (undo is the opposite instruction). Instructions add up, so no use or add is lost or counted twice, whoever
//     was offline. (The screen shows max(0, that): stock never below 0.)
//   - all three phones show what the server has (quantities and names); a name is one of the names someone saved;
//   - the history (events) on the server is exactly the lines created and not undone;
//   - no change was refused and left in "Needs attention".
// Run by pantry/test/run-sync.sh; one seed: SEED=7 node test/multidevice.e2e.mjs (inside the emulators), more: SEEDS=1,2,3.
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import * as Lg from '../js/logic.js';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');

const SEEDS = (process.env.SEEDS || process.env.SEED || '11,2026').split(',').map(Number);
const STEPS = Number(process.env.STEPS || 36);
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const FSJS = 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const FS = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085'}/v1/projects/demo-pantry/databases/(default)/documents/`;
const val = v => v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { mapValue: { fields: fields(v) } };
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const unval = v => 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(unval) : 'mapValue' in v ? unfields(v.mapValue.fields || {}) : undefined;
const unfields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, unval(v)]));
const admin = {
  async put(path, o) { const r = await fetch(FS + path, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields(o) }) }); assert.ok(r.ok, 'seed ' + path); },
  async list(path) {   // every page
    const out = []; let token = '';
    do {
      const r = await fetch(FS + path + '?pageSize=300' + (token ? '&pageToken=' + token : ''), { headers: { Authorization: 'Bearer owner' } });
      const j = r.ok ? await r.json() : {};
      out.push(...(j.documents || []).map(d => unfields(d.fields || {}))); token = j.nextPageToken || '';
    } while (token);
    return out;
  },
  async get(path) { const r = await fetch(FS + path, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? unfields((await r.json()).fields || {}) : null; },
};

const srv = await serve();
const browser = await chromium.launch();
const errors = [];
const url = srv.url + '/pantry/?emulator';
async function person(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.who = email;
  page.on('pageerror', e => errors.push(email + ': ' + e.message));
  page.on('crash', () => console.error(email, 'PAGE CRASHED')); page.on('pageerror', e => console.error(email, 'pageerror', e.message.slice(0, 200)));
  if (process.env.MD_DEBUG) { page.on('framenavigated', f => console.log(email, 'navigated', f.url())); page.on('console', m => console.log(email, m.type(), m.text())); }
  await page.goto(url + '#/settings');
  await page.waitForFunction(() => window.__pantry?.signIn);
  await page.evaluate(e => window.__pantry.signIn(e), email);
  await page.locator('#main', { hasText: email }).waitFor();
  return page;
}
const net = async (p, on) => { try { await p.evaluate(async ([on, u]) => { const F = await import(u); const db = F.getFirestore(); await (on ? F.enableNetwork(db) : F.disableNetwork(db)); }, [on, FSJS]); } catch (e) { console.error('network switch failed on', p.who, on, e.message); throw e; } };
const drain = async p => { try { await p.evaluate(async u => { const F = await import(u); await F.waitForPendingWrites(F.getFirestore()); }, FSJS); } catch (e) { console.error('drain failed on', p.who, e.message); throw e; } };
const act = (p, name, ...args) => p.evaluate(([n, a]) => window.__pantry.act[n](...a), [name, args]);
const local = (p, id) => p.evaluate(id => { const it = window.__pantry.S.items.get(id); return it && { name: it.name, batches: it.batches.map(b => [b.id, b.qty]) }; }, id);

let seedNow = null;
try {
  const mum = await person('mdmum@example.com');
  await mum.click('[data-act="hh-create"]');
  await mum.locator('#main .ha-row-title', { hasText: 'Our pantry' }).waitFor();
  for (const e of ['mddad@example.com', 'mdgran@example.com']) { await mum.waitForTimeout(600); await mum.fill('#pa-member-email', e); await mum.click('#pa-member-add button[type=submit]'); await mum.locator('#main [data-act="person"]', { hasText: e }).waitFor(); }
  const phones = [mum, await person('mddad@example.com'), await person('mdgran@example.com')];
  for (const p of phones) await p.waitForFunction(() => window.__pantry.S.household?.members?.length === 3);
  const hid = await mum.evaluate(() => window.__pantry.S.household.id);
  const base = { category: 'Other', location: 'Fridge', brand: '', size: '', barcode: '', lowAt: 0, openDays: 7, createdAt: '2026-10-16T00:00:00.000Z', createdBy: 'Mum' };

  for (const seed of SEEDS) {
    seedNow = seed;
    const t0 = Date.now();
    const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
    // two items stored as maps and one as the old array (the first change to it converts it)
    const tag = 's' + seed;
    const ids = [`${tag}-rice`, `${tag}-milk`, `${tag}-eggs`];
    const start = {};
    let events0 = null;
    const seedItem = async (id, name, batches, asArray) => {
      start[id] = Object.fromEntries(batches.map(b => [b.id, b.qty]));
      const stored = asArray ? batches.map(b => ({ ...b })) : Object.fromEntries(batches.map(({ id, ...b }) => [id, b]));
      await admin.put(`households/${hid}/items/${id}`, { id, name, ...base, batches: stored });
    };
    const mk = (id, qty, expiry) => ({ id, qty, expiry, openedAt: null, addedAt: '2026-01-01' });
    await seedItem(ids[0], 'Rice', [mk('r1', 6, '2027-01-01'), mk('r2', 6, '2027-03-01'), mk('r3', 6, null)], false);
    await seedItem(ids[1], 'Milk', [mk('m1', 5, '2026-12-01'), mk('m2', 5, '2027-02-01')], false);
    await seedItem(ids[2], 'Eggs', [mk('e1', 6, '2027-01-01'), mk('e2', 6, '2027-04-01')], true);
    for (const p of phones) for (const id of ids) await p.waitForFunction(id => window.__pantry.S.items.has(id), id);
    // the old array item is converted by one change from one phone first (NOTES.md: while an item is still an array, a phone
    // with a stale copy converting it can overwrite another's change: a window that closes for each item once, and that the
    // test doesn't try to hit)
    { const res = await act(phones[0], 'use', ids[2], 'e1'); start[ids[2]].e1 -= 1; await drain(phones[0]); for (const p of phones) await p.waitForFunction(id => !window.__pantry.S.items.get(id)._arr, ids[2]); events0 = res.event.id; }
    const expected = Object.fromEntries(ids.map(id => [id, { ...start[id] }]));
    const names = Object.fromEntries(ids.map(id => [id, new Set([Object.keys(start).length && null])]));
    for (const id of ids) names[id] = new Set();
    const events = new Set([events0]);
    const offline = [false, false, false];
    const history = {};
    let nowStep = 0, nowWho = 0, nowKind = '';
    const tally = (id, ops) => { for (const [path, d] of Object.entries(ops?.inc || {})) { const b = path.split('.')[1]; expected[id][b] = (expected[id][b] || 0) + d; (history[`${id}/${b}`] ||= []).push(`step ${nowStep} phone ${nowWho} ${nowKind} ${d > 0 ? '+' : ''}${d}`); } };
    const counts = { use: 0, add: 0, open: 0, rename: 0, undo: 0, toggles: 0 };

    for (let step = 0; step < STEPS; step++) {
      const i = Math.floor(R() * 3), p = phones[i], id = pick(ids);
      nowStep = step; nowWho = i;
      const r = R();
      if (process.env.MD_DEBUG) console.log('STEP', step, 'phone', i, 'id', id.split('-')[1], 'r', r.toFixed(2), 'offline', offline.join());
      if (r < 0.14 && !process.env.NOTOGGLE) {
        // (a phone that comes back online sends everything it has before it may drop offline again: toggling the SDK's
        // network switch faster than its write stream can settle trips an internal assertion in Firestore 10.14.1 that
        // real phones, whose connectivity the SDK watches itself, don't hit)
        // (and a phone drops offline only once what it has sent is confirmed: cutting the line between the server applying a
        // write and the phone hearing so makes the phone send that write again, and an increment applied twice counts
        // twice. That is how Firestore's `increment` works; NOTES.md says so. It needs a connection lost within a
        // fraction of a second of a save, and the test can't make it come out right, so it avoids it.)
        if (!offline[i]) await drain(p);
        offline[i] = !offline[i]; await net(p, !offline[i]); if (!offline[i]) await drain(p); counts.toggles++;
      }
      else if (r < 0.46) {
        const mine = (await local(p, id)).batches.filter(([, q]) => q > 0);
        if (!mine.length) continue;
        nowKind = 'use'; const res = await act(p, 'use', id, pick(mine)[0]);
        if (res) { tally(id, res.ops); events.add(res.event.id); counts.use++; }
      } else if (r < 0.62) {
        nowKind = 'add'; const res = await act(p, 'add', id, 1 + Math.floor(R() * 3), '2027-0' + (1 + Math.floor(R() * 9)) + '-15', `a${step}`);
        if (res) { tally(id, res.ops); events.add(res.event.id); counts.add++; }
      } else if (r < 0.72) {
        nowKind = 'open'; const res = await act(p, 'open', id);
        if (res) { tally(id, res.ops); events.add(res.event.id); counts.open++; }
      } else if (r < 0.84) {
        const name = `${id.split('-')[1]}-${step}`;
        await act(p, 'set', id, 'name', name); names[id].add(name); counts.rename++;
      } else {
        nowKind = 'undo'; const res = await act(p, 'undo');
        if (res?.ops) { /* the opposite instructions */ for (const idd of ids) if (res.event.itemId === idd) tally(idd, res.ops); events.delete(res.event.id); counts.undo++; }
      }
      await p.waitForTimeout(Math.floor(R() * 60));
    }
    // everyone back online; everything sent; then every phone and the server must agree
    for (let i = 0; i < 3; i++) if (offline[i]) await net(phones[i], true);   // (switching the network on when it is already on trips an assertion in Firestore 10.14.1)
    let problem = '';
    for (let attempt = 0; attempt < 40; attempt++) {
      for (const p of phones) await drain(p);
      problem = '';
      for (const id of ids) {
        const raw = await admin.get(`households/${hid}/items/${id}`);
        const rawQty = Array.isArray(raw.batches) ? Object.fromEntries(raw.batches.map(b => [b.id, b.qty])) : Object.fromEntries(Object.entries(raw.batches).map(([k, v]) => [k, v.qty]));
        // batches that were tidied away count as 0 on the server
        const want = Object.fromEntries(Object.entries(expected[id]));
        for (const b of new Set([...Object.keys(want), ...Object.keys(rawQty)])) if ((rawQty[b] ?? 0) !== (want[b] ?? 0)) problem += `${id}/${b}: server ${rawQty[b] ?? 0}, expected ${want[b] ?? 0}; `;
        for (const [n, p] of phones.entries()) {
          const l = await local(p, id);
          const shown = Object.fromEntries(l.batches.filter(([, q]) => q > 0));
          const should = Object.fromEntries(Object.entries(rawQty).filter(([, q]) => q > 0));
          if (JSON.stringify(Object.entries(shown).sort()) !== JSON.stringify(Object.entries(should).sort())) problem += `${id}: phone ${n} shows ${JSON.stringify(shown)} but the server has ${JSON.stringify(should)}; `;
          if (l.name !== raw.name) problem += `${id}: phone ${n} name ${l.name} vs server ${raw.name}; `;
        }
        if (names[id].size && !names[id].has(raw.name) && raw.name !== { [ids[0]]: 'Rice', [ids[1]]: 'Milk', [ids[2]]: 'Eggs' }[id]) problem += `${id}: name ${raw.name} was never saved; `;
      }
      const onServer = new Set((await admin.list(`households/${hid}/events`)).map(e => e.id).filter(x => [...events].includes(x) || true));
      const mineOnServer = [...onServer].filter(x => x);
      for (const e of events) if (!onServer.has(e)) problem += `event ${e} missing; `;
      for (const p of phones) { const n = await p.evaluate(() => window.__pantry.S.refused.length); if (n) problem += `a phone has ${n} refused change(s); `; }
      if (!problem) break;
      await mum.waitForTimeout(500);
    }
    if (problem) for (const [n, p] of phones.entries()) console.error('  phone', n, JSON.stringify(await p.evaluate(() => ({ sync: window.__pantry.S.sync, refused: window.__pantry.S.refused.length, mode: window.__pantry.S.mode }))));
    if (problem) for (const id of ids) console.error('  server', id, JSON.stringify((await admin.get(`households/${hid}/items/${id}`)).batches));
    if (problem) for (const m of problem.matchAll(/(s\d+-\w+\/[\w-]+):/g)) console.error('  history', m[1], JSON.stringify(history[m[1]] || []));
    assert.equal(problem, '', problem);
    // events of this seed on the server are exactly those not undone
    const evOnServer = (await admin.list(`households/${hid}/events`)).filter(e => ids.includes(e.itemId)).map(e => e.id).sort();
    assert.deepEqual(evOnServer, [...events].sort(), 'history on the server = lines created and not undone');
    console.log(`  seed ${seed}: ok (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}; ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  assert.deepEqual(errors, []);
  console.log('pantry multidevice e2e: ok');
} catch (e) {
  console.error(`pantry multidevice e2e FAILED with seed ${seedNow} (re-run: SEEDS=${seedNow} node test/multidevice.e2e.mjs inside the emulators)`);
  throw e;
} finally {
  await browser.close();
  srv.close();
}
