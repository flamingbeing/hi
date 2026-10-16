// Pantry: the family's household inventory, on the family home app kit (/homedesign/: DESIGN-APP.md).
// Screens are hash routes drawn by haRouter (every screen and sheet is a history entry, so the iPhone edge swipe and
// Android back always work). Each screen is an HTML string drawn from the state S; clicks are handled by one listener
// reading data-act attributes. Data lives in one of three backends (store.js, cloud.js): this phone (IndexedDB),
// the family's shared pantry (Firestore), or memory only (demo mode, ?demo).
import * as L from './logic.js';
import { CATALOGUE, CATEGORIES, shelfDays, freezeDays, freezable, FROZEN_DAYS, THAW_DAYS } from './catalogue.js';
import * as P from './places.js';
import * as PP from './people.js';
import * as MG from './merge.js';
import { openLocal, openMemory, prefs, KINDS, PHOTOS } from './store.js';
import { sampleData, demoBy, DEMO_FAMILY, DEMO_ME, DEMO_NAMES } from './sample.js';
import { openWelcome, viewGuide, welcomed, markWelcomed, installed } from './guide.js';
import { starterChoices, tourTasks } from './tour.js';
import { firebaseConfig } from '../config.js';
import {
  haRouter, haGo, haBack, haSheet, haCloseSheet, haSheetOpen, haConfirm, haToast, haHideToast, haStepper, haVersion, haHaptic,
  haIcon, haEsc as esc, haAnnounce, haLargeTitle,
} from '/homedesign/app.js';

const $ = (s, el = document) => el.querySelector(s);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const EMULATOR = params.has('emulator') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const WELCOME = params.has('welcome');   // show the welcome even in the demo, or again

const S = {
  items: new Map(), events: new Map(), shop: new Map(), settings: new Map(), pics: new Map(),
  backend: null, local: null, mode: DEMO ? 'demo' : 'local', cloud: null, user: null, household: null, pantries: [], lookupFailed: false, creating: false, pending: null, localCount: 0,
  q: '', place: '', sort: prefs.get('sort', 'expiry'),
  draft: null, dirty: false, pendingRender: false, syncError: false,
  since: null,   // when this phone last looked (Since you last looked), an ISO time
  originTab: '#/', backLabel: 'Pantry',
};

// Product pictures: the photo, or a neutral kit icon for the category (no emoji).
const CAT_ICON = {
  'Sauces & condiments': 'bottle', 'Rice, noodles & grains': 'bowl', 'Canned & jarred': 'tin', 'Cooking & baking': 'jar',
  'Breakfast & spreads': 'jar', Drinks: 'cup', 'Dairy & eggs': 'carton', 'Bread & bakery': 'bread', 'Fresh produce': 'leaf',
  'Meat & seafood': 'fish', Frozen: 'snowflake', Snacks: 'cookie', Baby: 'heart', 'Laundry & cleaning': 'sparkle',
  'Kitchen & paper': 'roll', Toiletries: 'droplet', 'Medicine & first aid': 'pill', Pet: 'paw', Leftovers: 'bowl', Other: 'box',
};
const icon = (name, o) => haIcon(name, o);
const chevron = () => icon('chevron-right', { cls: 'ha-row-chevron' });

// Names the family gave its members (settings/people, people.js), shared with everyone in the family pantry.
const names = () => PP.namesOf(S.settings.get(PP.PEOPLE_ID));
// This phone's Google account (in the demo, a made-up family member).
const me = () => S.user?.email || (DEMO ? DEMO_ME : '');
// How a person shows (history, added by, the shopping list): the family's name for them, else what was saved.
const nameOf = by => PP.label(names(), by);
// The name this phone signs changes with: the family's name for me, this phone's own, or my Google first name.
const who = () => (me() && names()[me()]) || prefs.get('name') || S.user?.name?.split(' ')[0] || '';
const items = () => [...S.items.values()].filter(i => !i.archived);
const eventsFor = id => [...S.events.values()].filter(e => e.itemId === id);
function eventsByItem() {
  const m = new Map();
  for (const e of S.events.values()) { if (!m.has(e.itemId)) m.set(e.itemId, []); m.get(e.itemId).push(e); }
  return m;
}
const today = () => L.ymd();
// How many days ahead Home's "Use soon" looks (Settings; per phone; two weeks as before).
const soonDays = () => Number(prefs.get('soonDays', 14)) || 14;
const SOON = { 3: '3 days', 7: '1 week', 14: '2 weeks' };
const soonText = () => SOON[soonDays()] || plural(soonDays(), 'day');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const route = () => R?.route || { parts: [] };
const screen = () => route().parts[0] || 'home';

// ---- saving ----------------------------------------------------------------------------------------------------

function save(kind, obj) {
  if (kind === 'items') {
    obj = { ...obj, updatedAt: new Date().toISOString(), updatedBy: who() };
    if (obj.photo === '') delete obj.photo;   // left by older versions; pictures are `thumb` + photos/<id> now
  }
  S[kind].set(obj.id, obj);
  S.backend.put(kind, obj);
  return obj;
}
function remove(kind, id) {
  S[kind].delete(id);
  S.backend.del(kind, id);
}
// Many at once (moving every item from one place to another): one batch to the family pantry.
function saveMany(kind, list) {
  const at = new Date().toISOString(), by = who();
  const out = list.map(o => {
    if (kind !== 'items') return o;
    const x = { ...o, updatedAt: at, updatedBy: by };
    if (x.photo === '') delete x.photo;
    return x;
  });
  for (const o of out) S[kind].set(o.id, o);
  if (S.backend.putMany) S.backend.putMany(kind, out).catch(err => { S.syncError = S.cloud.explain(err, 'Saving'); redraw(); });
  else for (const o of out) S.backend.put(kind, o);
  return out;
}

// ---- places (places.js): the household's own ordered list, shared with the family ----------------------------------

const placeNames = () => P.placeList(S.settings.get(P.PLACES_ID));
// Every place to offer, the list's order first, then places items still use that aren't in it.
const placeChoices = (extra = '') => P.allPlaces(placeNames(), items(), extra);
const defaultPlace = () => { const l = placeNames(); return l.includes('Kitchen cabinet') ? 'Kitchen cabinet' : l[0]; };
const savePlaces = list => save('settings', P.placesDoc(list));
// A <select>'s options: the list, then "Not in your list" for any other place in use (or the form's own value).
function placeOptions(value) {
  const { listed, unlisted } = placeChoices(value);
  const opt = x => `<option${x === value ? ' selected' : ''}>${esc(x)}</option>`;
  return listed.map(opt).join('') + (unlisted.length ? `<optgroup label="Not in your list">${unlisted.map(opt).join('')}</optgroup>` : '');
}
// ---- photos (photo.js): a tiny `thumb` on the item for every list; the photo itself in photos/<item id>, read only
// when the item is opened (cached here, keyed by the thumb it belongs to, so a family member's new photo is fetched).
// Items from before 16 Oct 2026 may still carry the whole photo as `photo`: shown as it is until migratePhotos() moves it.

const thumbSrc = it => it.thumb || it.photo || '';
function bestPic(it) {
  if (it.photo) return it.photo;
  const c = S.pics.get(it.id);
  return c && c.thumb === (it.thumb || '') && c.data ? c.data : it.thumb || '';
}
const fetching = new Set();
function wantPhoto(it) {
  if (!it.hasPhoto || it.photo || fetching.has(it.id)) return;
  const ver = it.thumb || '', c = S.pics.get(it.id);
  if (c && c.thumb === ver) return;
  fetching.add(it.id);
  Promise.resolve().then(() => S.backend.get(PHOTOS, it.id)).then(doc => {
    S.pics.set(it.id, { thumb: ver, data: doc?.data || null });
    const img = document.getElementById('pa-hero');
    if (doc?.data && img && img.dataset.id === it.id) img.src = doc.data;
  }, () => { /* no signal: the thumbnail stays; tried again next time */ }).finally(() => fetching.delete(it.id));
}
function savePhoto(id, thumb, data) {
  S.pics.set(id, { thumb, data });
  return S.backend.put(PHOTOS, { id, data, updatedAt: new Date().toISOString() });
}
function delPhoto(id) {
  S.pics.delete(id);
  S.backend.del(PHOTOS, id);
}
async function photoOf(it) {
  if (!it.hasPhoto) return null;
  const c = S.pics.get(it.id);
  if (c?.data) return c.data;
  // not fetched yet: ask, but never hold up a delete for long (no signal)
  const got = Promise.resolve().then(() => S.backend.get(PHOTOS, it.id)).then(d => d?.data || null, () => null);
  return Promise.race([got, new Promise(r => setTimeout(() => r(null), 1500))]);
}
// An old-style item (whole photo inside it) as { item, doc }: the item with a thumbnail, and its photos document.
// null when the picture can't be read.
async function splitOld(it) {
  try {
    const { picturesFromData } = await import('./photo.js');
    const p = await picturesFromData(it.photo);
    const item = { ...it, thumb: p.thumb, hasPhoto: true };
    delete item.photo;
    return { item, doc: { id: it.id, data: p.photo, updatedAt: new Date().toISOString() } };
  } catch { return null; }
}
// Before copying or restoring into the family pantry (whose rules refuse old-style photos): split every old-style item.
async function splitAll(data) {
  const have = new Set(data.photos.map(p => p.id));
  data.items = await Promise.all(data.items.map(async it => {
    if (it.photo === '' || (it.photo && typeof it.photo !== 'string')) { const x = { ...it }; delete x.photo; return x; }
    if (!it.photo) return it;
    const s = await splitOld(it);
    if (!s) { const x = { ...it }; delete x.photo; return x; }   // an unreadable picture is left behind
    if (!have.has(it.id)) data.photos.push(s.doc);
    return s.item;
  }));
  return data;
}
// Moves old-style photos out of their items, quietly, a few a second: the photo is written first, and only once it is
// saved does the item lose its `photo` (so a photo is never lost). Runs again whenever items load or change.
let migrating = false;
async function migratePhotos() {
  if (migrating) return;
  migrating = true;
  let moved = 0;
  try {
    const skip = new Set();
    for (;;) {
      const it = [...S.items.values()].find(i => typeof i.photo === 'string' && i.photo && !skip.has(i.id));
      if (!it) break;
      const backend = S.backend;
      const s = await splitOld(it);
      if (!s) { skip.add(it.id); continue; }   // unreadable: left as it is
      if ((await backend.put(PHOTOS, s.doc)) === false) { skip.add(it.id); continue; }
      if (backend !== S.backend) break;   // signed in or out meanwhile: done on the next load
      const cur = S.items.get(it.id);
      if (cur && cur.photo === it.photo) {
        const next = { ...cur, thumb: s.item.thumb, hasPhoto: true };
        delete next.photo;
        S.items.set(next.id, next);
        S.pics.set(next.id, { thumb: next.thumb, data: s.doc.data });
        await backend.put('items', next);
        moved++;
      }
      await new Promise(r => setTimeout(r, 300));
    }
  } finally { migrating = false; }
  if (moved) redraw();
}

// Apply a stock change from logic.js ({ item, event }) and offer Undo.
function apply(res, msg) {
  if (!res.event) { haToast('Nothing in stock to do that with'); return; }
  const before = S.items.get(res.item.id);
  save('items', res.item);
  save('events', res.event);
  redraw();
  haToast(msg, { action: 'Undo', onAction: () => { save('items', before); remove('events', res.event.id); redraw(); haAnnounce('Undone'); } });
}

// ---- small pieces --------------------------------------------------------------------------------------------------

function thumb(it, cls = 'ha-row-thumb') {
  const src = thumbSrc(it);
  return src ? `<img class="${cls}" src="${esc(src)}" alt="">` : `<span class="${cls}">${icon(CAT_ICON[it.category] || 'box')}</span>`;
}
function badge(date) {
  const b = L.shortLabel(date, today());
  if (!b.text) return '';
  const tone = { bad: ' ha-badge--bad', warn: ' ha-badge--warn' }[b.tone] || '';
  return `<span class="ha-badge${tone}">${esc(b.text)}</span>`;
}
const LEVEL_WORD = { plenty: 'Plenty', low: 'Low', out: 'Out' };
// A stock change that means "bought more": a count gets a batch; a staple goes back to Plenty.
const restock = (it, { qty = 1, expiry = null } = {}) => (L.isStaple(it) ? L.setLevel(it, { level: 'plenty', by: who() }) : L.addStock(it, { qty, expiry, by: who() }));
const subOf = it => [it.brand, it.size].filter(Boolean).map(esc).join(' · ');
function itemRow(it, { sub, trail } = {}) {
  const q = L.totalQty(it), staple = L.isStaple(it);
  const s = sub ?? [staple ? LEVEL_WORD[L.levelOf(it)] : q ? `${q} left` : 'None left', esc(it.location || '')].filter(Boolean).join(' · ');
  const t = trail ?? (staple ? '' : badge(L.nextUseBy(it)));
  return `<li><a class="ha-row pa-item" href="#/item/${esc(it.id)}">${thumb(it)}
    <span class="ha-row-body"><span class="ha-row-title">${esc(it.name)}</span>${s ? `<span class="ha-row-sub">${s}</span>` : ''}</span>
    ${t ? `<span class="ha-row-trail">${t}</span>` : ''}${chevron()}</a></li>`;
}
function section(title, body, { count = '', action = '', footer = '', id = '' } = {}) {
  const hid = 'h-' + (id || title.toLowerCase().replace(/[^a-z]+/g, '-'));
  return `<section class="ha-section" aria-labelledby="${hid}"><h2 class="ha-section-header" id="${hid}"><span>${esc(title)}</span>${action || (count !== '' ? `<span class="ha-num">${count}</span>` : '')}</h2>${body}${footer ? `<p class="ha-section-footer">${footer}</p>` : ''}</section>`;
}
function fmt(ymd) {
  const d = L.parseYmd(ymd);
  if (!d) return ymd || '';
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const fmtTime = iso => fmt(L.ymd(new Date(iso)));
function quickDates() {
  const t = today();
  return [['1 week', L.addDays(t, 7)], ['1 month', L.addDays(t, 30)], ['3 months', L.addDays(t, 91)], ['6 months', L.addDays(t, 182)], ['1 year', L.addDays(t, 365)]];
}
// How long, in words: 5 days, 1 week, 3 weeks, 6 months, 2 years.
function daysText(d) {
  if (d === 7) return '1 week';
  if (d < 14) return plural(d, 'day');
  if (d < 60) return plural(Math.round(d / 7), 'week');
  if (d < 330) return plural(Math.round(d / 30.4), 'month');
  return plural(Math.round(d / 365), 'year');
}
// A guessed best-before date from how long a product usually keeps (catalogue.js): { days, date, label } or null.
// In a freezer it keeps as long as frozen food does.
function guessFor(x) {
  const days = P.isFreezer(x.location) && x.category !== 'Frozen' && shelfDays(x) !== null ? freezeDays(x) : shelfDays(x);
  return days ? { days, date: L.addDays(today(), days), label: `About ${daysText(days)}` } : null;
}
// The quick dates under a date field; a guess comes first (selected while it is the date), with a line saying so.
const dateChips = (name, value, guess = null) => `<div class="pa-datebox"><div class="ha-chips ha-chips--wrap pa-dates" role="group" aria-label="Quick dates" data-for="${name}">${
  guess ? `<button type="button" class="ha-chip pa-guess" aria-pressed="${guess.date === value}" data-act="date" data-v="${guess.date}">${esc(guess.label)}</button>` : ''}${
  quickDates().filter(([, v]) => !guess || v !== guess.date).map(([l, v]) =>
  `<button type="button" class="ha-chip" aria-pressed="${v === value}" data-act="date" data-v="${v}">${l}</button>`).join('')}<button type="button" class="ha-chip" aria-pressed="false" data-act="date" data-v="">No date</button></div>${
  guess ? `<p class="ha-field-hint pa-guess-hint">${esc(guess.label)} is a guess from how long it usually keeps. Change it to the date on the pack.</p>` : ''}</div>`;
const shopQuery = it => [it.brand, it.name].filter(Boolean).join(' ').replace(/\(.*?\)/g, '').trim();
const onList = id => [...S.shop.values()].some(m => m.itemId === id && !m.done);

// ---- the bar ----------------------------------------------------------------------------------------------------

function setBar({ title = '', lead = '', trail = '', solid = false }) {
  $('#bar-title').textContent = title;
  $('#bar-lead').innerHTML = lead;
  $('#bar-trail').innerHTML = trail;
  $('.ha-bar').classList.toggle('ha-bar--solid', solid);
}
const backBtn = label => `<button type="button" class="ha-bar-btn ha-back" data-act="back">${icon('chevron-left')}<span>${esc(label)}</span></button>`;
const textBtn = (label, act, extra = '') => `<button type="button" class="ha-bar-btn" data-act="${act}"${extra}>${esc(label)}</button>`;
const iconBtn = (name, label, act) => `<button type="button" class="ha-bar-btn" data-act="${act}" aria-label="${esc(label)}">${icon(name)}</button>`;

// ---- Home -------------------------------------------------------------------------------------------------------

function statusLine() {
  if (S.mode === 'demo') return 'Demo with made-up items. Nothing is saved.';
  if (S.mode === 'cloud') {
    if (!navigator.onLine) return 'Offline. Changes reach the family when there’s signal.';
    const n = S.household?.members?.length || 1;
    return n > 1 ? `Shared with ${plural(n - 1, 'other person', 'other people')}` : 'Shared family pantry';
  }
  return 'Saved on this phone';
}
function viewHome() {
  const all = items();
  let h = `<h1 class="ha-large-title">Pantry</h1><p class="ha-large-sub">${esc(statusLine())}</p>`;
  if (S.syncError) h += `<div class="ha-panel pa-alert" role="status">${icon('alert')}<span>Some changes didn’t reach the family pantry. ${esc(S.syncError)}</span></div>`;
  if (S.mode === 'cloud' && S.pantries.length > 1) h += `<a class="ha-panel pa-alert" href="#/settings">${icon('alert')}<span>You’re in more than one family pantry. Merge them in Settings.</span></a>`;
  h += viewTour();
  h += viewSince();
  if (!all.length) {
    return h + `<div class="ha-card ha-empty">
      <span class="ha-empty-icon">${icon('box')}</span>
      <p class="ha-empty-title">Nothing here yet</p>
      <p class="ha-empty-text">Add what’s in the fridge and cupboards. The pantry then shows what to use first and what to buy.</p>
      <button type="button" class="ha-btn ha-btn--primary" data-act="start">Pick what you have</button>
      <button type="button" class="ha-btn ha-btn--secondary" data-act="go-add">Add one item</button>
      <button type="button" class="ha-btn ha-btn--plain" data-act="sample">Try it with sample items</button>
      <a class="ha-btn ha-btn--plain" href="#/guide">How to use the pantry</a>
    </div>`;
  }
  const t = today();
  const exp = L.expiring(all, { days: soonDays(), today: t });
  const expired = exp.filter(x => x.date < t), soon = exp.filter(x => x.date >= t);
  const buy = L.toBuy(all, eventsByItem());
  const listed = new Set(exp.map(x => x.item.id));
  const opened = all.filter(it => !listed.has(it.id) && (it.batches || []).some(b => b.openedAt && b.qty > 0));
  const m = L.monthStats([...S.events.values()], t.slice(0, 7));
  h += `<div class="ha-btn-row pa-quickrow"><button type="button" class="ha-btn ha-btn--secondary ha-btn--compact" data-act="leftovers">${icon('bowl')}Leftovers</button><button type="button" class="ha-btn ha-btn--secondary ha-btn--compact" data-act="scan-many">${icon('barcode')}Scan many</button></div>`;
  h += `<div class="ha-stats pa-stats" aria-label="Summary">
    <div class="ha-stat"><span class="ha-stat-value">${expired.length}</span><span class="ha-stat-label">Expired</span></div>
    <div class="ha-stat"><span class="ha-stat-value">${soon.length}</span><span class="ha-stat-label">Use soon</span></div>
    <div class="ha-stat"><span class="ha-stat-value">${buy.length}</span><span class="ha-stat-label">To buy</span></div>
  </div>`;
  if (expired.length) h += section('Expired', `<ul class="ha-list">${expired.map(x => itemRow(x.item)).join('')}</ul>`, { count: expired.length, footer: 'Used it or binned it? Open the item and tap Used 1 or Bin 1.' });
  h += section('Use soon', soon.length ? `<ul class="ha-list">${soon.map(x => itemRow(x.item)).join('')}</ul>` : '', { count: soon.length || '', footer: soon.length ? `Within the next ${soonText()}.` : `Nothing runs out of date in the next ${soonText()}.` });
  const week = soon.filter(x => L.daysBetween(t, x.date) <= 7);
  if (week.length) {
    h += `<p class="pa-share-line"><a class="ha-btn ha-btn--secondary ha-btn--compact" id="pa-wa-week" href="${esc(L.waLink(L.useWeekText(week, fmt)))}" target="_blank" rel="noopener">${icon('share')}Send “use this week” on WhatsApp<span class="ha-sr"> (opens WhatsApp)</span></a></p>`;
  }
  if (opened.length) h += section('Opened', `<ul class="ha-list">${opened.map(it => itemRow(it)).join('')}</ul>`, { count: opened.length });
  if (buy.length) {
    h += section('Running low', `<ul class="ha-list">${buy.slice(0, 5).map(b => itemRow(b.item, { sub: esc(L.whyText(b, t)), trail: '' })).join('')}</ul>`,
      { id: 'low', action: `<a href="#/shop">Shopping list</a>`, footer: buy.length > 5 ? `${buy.length - 5} more on the shopping list.` : '' });
  }
  h += section('This month', `<ul class="ha-list">
    <li><div class="ha-row"><span class="ha-row-icon">${icon('check')}</span><span class="ha-row-body"><span class="ha-row-title">Used up</span></span><span class="ha-row-value">${m.used}</span></div></li>
    <li><div class="ha-row"><span class="ha-row-icon ha-row-icon--grey">${icon('cart')}</span><span class="ha-row-body"><span class="ha-row-title">Bought</span></span><span class="ha-row-value">${m.bought}</span></div></li>
    <li><div class="ha-row"><span class="ha-row-icon">${icon('clock')}</span><span class="ha-row-body"><span class="ha-row-title">Used before expiry</span></span><span class="ha-row-value">${m.saved}</span></div></li>
    <li><div class="ha-row"><span class="ha-row-icon ha-row-icon--bad">${icon('trash')}</span><span class="ha-row-body"><span class="ha-row-title">Thrown away</span>${m.expired ? `<span class="ha-row-sub">${m.expired} past ${m.expired === 1 ? 'its' : 'their'} date</span>` : ''}</span><span class="ha-row-value">${m.wasted}</span></div></li>
  </ul>`, { id: 'month' });
  return h;
}

// ---- since you last looked: what the rest of the family did since this phone last opened the pantry ----------------

function viewSince() {
  if (S.mode === 'local') return '';   // on this phone only, everything is this phone's
  const mine = who();
  const list = L.sinceLast({ events: [...S.events.values()], shop: [...S.shop.values()], since: S.since, isMe: by => nameOf(by) === mine });
  if (!list.length) return '';
  const row = x => `<li><div class="ha-row"><span class="ha-row-icon ha-row-icon--grey">${icon('user')}</span><span class="ha-row-body"><span class="ha-row-title">${esc(nameOf(x.by))} ${esc(L.sinceText(x))}</span><span class="ha-row-sub">${esc(L.agoText(x.at))}</span></span></div></li>`;
  return section('Since you last looked', `<ul class="ha-list pa-since">${list.slice(0, 5).map(row).join('')}</ul>`,
    { id: 'since', count: list.length, footer: `${list.length > 5 ? `And ${list.length - 5} more. ` : ''}<button type="button" class="ha-btn ha-btn--plain ha-btn--compact pa-since-ok" data-act="since-ok">Got it</button>` });
}
// This phone looked: remember when (per phone), so the next open shows only what happened after.
function looked() { S.since = new Date().toISOString(); prefs.set('lastSeen', S.since); }

// ---- first steps (tour.js): the Getting started checklist and the quick start --------------------------------------

const tourOn = () => prefs.get('tour') === 'on';
const flags = () => prefs.get('tourFlags', {}) || {};
function flag(k) { if (!tourOn() || flags()[k]) return; prefs.set('tourFlags', { ...flags(), [k]: true }); }
function tasks() {
  const sharing = !S.cloud?.configured ? 'none' : (S.household?.members?.length || 0) > 1 ? 'in' : 'out';
  return tourTasks({ items: items(), events: [...S.events.values()], flags: flags(), installed: installed(), sharing });
}
function viewTour() {
  if (!tourOn()) return '';
  const list = tasks(), done = list.filter(t => t.done).length;
  if (done === list.length) {
    return section('Getting started', `<div class="ha-card pa-tour-done"><p class="ha-card-title">All set</p>
      <p class="ha-card-text">You know your way around. The guide in Settings has the rest.</p>
      <button type="button" class="ha-btn ha-btn--secondary" data-act="tour-hide">Hide this</button></div>`, { id: 'tour' });
  }
  const row = t => `<li><div class="ha-row pa-tour-row${t.done ? ' is-done' : ''}">
      <span class="pa-tour-mark" aria-hidden="true">${t.done ? icon('check') : ''}</span>
      <span class="ha-row-body"><span class="ha-row-title">${esc(t.title)}<span class="ha-sr">${t.done ? ', done' : ', to do'}</span></span><span class="ha-row-sub">${esc(t.sub)}</span></span>
      ${t.done ? '' : `<span class="ha-row-trail"><button type="button" class="ha-btn ha-btn--small" data-act="tour-show" data-task="${t.id}" aria-label="Show me: ${esc(t.title)}">Show me</button></span>`}
    </div></li>`;
  return section('Getting started', `<ul class="ha-list pa-tour">${list.map(row).join('')}</ul>
    <p class="pa-tour-foot"><button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-act="tour-hide">Hide this list</button></p>`,
    { id: 'tour', count: `${done} of ${list.length}` });
}
// Point at a button on the screen just drawn: scroll it into view, ring it for a few seconds, focus it.
function spotlight(sel) {
  setTimeout(() => {
    const el = $(sel); if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.add('pa-spot');
    el.focus({ preventScroll: true });
    setTimeout(() => el.classList.remove('pa-spot'), 4500);
  }, 400);
}
function showMe(task) {
  if (task === 'stock') return openStarter();
  if (task === 'say') return openQuick();
  if (task === 'use') {
    const all = items().filter(it => L.totalQty(it) > 0);
    const first = L.expiring(all, { days: 3650 })[0]?.item || all[0];
    if (!first) { haToast('Add something first'); return openStarter(); }
    haGo('#/item/' + first.id);
    return spotlight('[data-act="use"]');
  }
  if (task === 'shop') { haGo('#/shop'); return spotlight('#pa-shop-text'); }
  if (task === 'install') {
    return haSheet({
      title: 'On your home screen', closeLabel: 'Done', grey: true,
      body: `<ul class="ha-list">
        <li><div class="ha-row"><span class="ha-row-icon">${icon('share')}</span><span class="ha-row-body"><span class="ha-row-title">iPhone</span><span class="ha-row-sub">In Safari, tap Share (the square with an arrow), then Add to Home Screen.</span></span></div></li>
        <li><div class="ha-row"><span class="ha-row-icon">${icon('plus')}</span><span class="ha-row-body"><span class="ha-row-title">Android</span><span class="ha-row-sub">In Chrome, tap the menu (three dots), then Add to home screen or Install app.</span></span></div></li>
      </ul><p class="ha-section-footer">It then opens like an app, full screen, and works without signal.</p>`,
      onClose: () => { flag('installSeen'); afterSheet(); redraw(); },
    });
  }
  if (task === 'family') {
    haGo('#/settings');
    return spotlight('[data-act="signin"], [data-act="hh-create"], #pa-member-email');
  }
}
function openStarter() {
  const choices = starterChoices();
  const have = new Set(items().map(it => L.norm(`${it.brand} ${it.name}`)));
  const groups = [...new Set(choices.map(c => c.group))];
  const chip = c => {
    const at = have.has(L.norm(`${c.cat.brand} ${c.cat.name}`));
    return `<button type="button" class="ha-chip" aria-pressed="false" data-k="${esc(c.key)}"${at ? ' disabled' : ''}>${esc(c.cat.name.replace(/ \(.*\)$/, ''))}${at ? ' <span class="ha-chip-count">at home</span>' : ''}</button>`;
  };
  const s = haSheet({
    title: 'What do you have?', closeLabel: 'Cancel', grey: true, detent: 'large',
    body: `<p class="ha-text pa-start-intro">Tap the everyday things you have at home. Each goes in with a rough best-before date, which you can change on the item.</p>
      ${groups.map((g, i) => `<section class="ha-section" aria-labelledby="pa-sg-${i}"><h3 class="ha-section-header" id="pa-sg-${i}">${esc(g)}</h3>
        <div class="ha-chips ha-chips--wrap pa-start-chips" role="group" aria-labelledby="pa-sg-${i}">${choices.filter(c => c.group === g).map(chip).join('')}</div></section>`).join('')}
      <p class="ha-section-footer">Not here? Add it afterwards with + or the microphone.</p>`,
    footer: `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" id="pa-start-go" disabled>Add items</button>`,
    onClose: afterSheet,
  });
  const go = $('#pa-start-go', s.el);
  const picked = () => [...s.el.querySelectorAll('.pa-start-chips [aria-pressed="true"]')].map(b => choices.find(c => c.key === b.dataset.k));
  s.el.addEventListener('click', e => {
    const b = e.target.closest('.pa-start-chips .ha-chip');
    if (!b || b.disabled) return;
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    const n = picked().length;
    go.disabled = !n; go.textContent = n ? `Add ${plural(n, 'item')}` : 'Add items';
  });
  go.addEventListener('click', async () => {
    const list = picked(); if (!list.length) return;
    const added = [];
    for (const { cat, days } of list) {
      const base = { id: L.uid(), batches: [], createdAt: new Date().toISOString(), createdBy: who(), name: cat.name, brand: cat.brand, size: cat.size,
        category: cat.category, location: cat.location, openDays: cat.openDays ?? null, lowAt: 0, barcode: '' };
      const res = L.addStock(base, { qty: 1, expiry: days ? L.addDays(today(), days) : null, by: who() });
      save('items', res.item); added.push({ id: base.id, ev: save('events', res.event).id });
    }
    await haCloseSheet(s.el);
    if (screen() !== 'home') haGo('#/', { replace: screen() === 'add' }); else redraw();
    haToast(`Added ${plural(added.length, 'item')}`, { action: 'Undo', onAction: () => { for (const a of added) { remove('items', a.id); remove('events', a.ev); } redraw(); haAnnounce('Undone'); } });
  });
  return s;
}

// ---- Items ------------------------------------------------------------------------------------------------------

function viewItems() {
  const all = items();
  const { listed, unlisted } = placeChoices();
  const places = [...listed, ...unlisted].filter(l => all.some(i => i.location === l));
  if (S.place && !places.includes(S.place)) S.place = '';
  const chip = (v, label, n) => `<button type="button" class="ha-chip" aria-pressed="${S.place === v}" data-act="place" data-v="${esc(v)}">${esc(label)} <span class="ha-chip-count">${n}</span></button>`;
  const seg = (v, label) => `<label class="ha-seg"><input type="radio" name="pa-sort" value="${v}"${S.sort === v ? ' checked' : ''}><span>${label}</span></label>`;
  return `<h1 class="ha-large-title">Items</h1>
    <div class="ha-search" role="search">${icon('search')}
      <input type="search" id="pa-q" placeholder="Search the pantry" aria-label="Search the pantry" autocomplete="off" value="${esc(S.q)}">
      <button type="button" class="ha-search-clear" data-act="q-clear" aria-label="Clear search">${icon('close')}</button></div>
    <div class="ha-chips" role="group" aria-label="Where it’s kept">${chip('', 'All', all.length)}${places.map(p => chip(p, p, all.filter(i => i.location === p).length)).join('')}</div>
    <fieldset class="ha-segmented"><legend>Sort by</legend>${seg('expiry', 'Use by')}${seg('name', 'Name')}${seg('category', 'Category')}</fieldset>
    <div id="pa-items-list">${itemsList()}</div>`;
}
function itemsList() {
  const all = items();
  const list = all.filter(i => (!S.place || i.location === S.place) && (!S.q || L.score(S.q, `${i.name} ${i.brand} ${i.category} ${i.barcode || ''}`)));
  const by = it => L.nextUseBy(it) || '9999';
  if (S.sort === 'expiry') list.sort((a, b) => by(a) < by(b) ? -1 : by(a) > by(b) ? 1 : a.name.localeCompare(b.name));
  else if (S.sort === 'category') list.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) {
    return all.length
      ? `<div class="ha-empty"><span class="ha-empty-icon">${icon('search')}</span><p class="ha-empty-title">Nothing found</p><p class="ha-empty-text">No items match. Try another word or place.</p></div>`
      : `<div class="ha-card ha-empty"><span class="ha-empty-icon">${icon('box')}</span><p class="ha-empty-title">No items yet</p><p class="ha-empty-text">Add what’s at home to start.</p><button type="button" class="ha-btn ha-btn--primary" data-act="go-add">Add an item</button></div>`;
  }
  if (S.sort !== 'category') return section(plural(list.length, 'item'), `<ul class="ha-list">${list.map(i => itemRow(i)).join('')}</ul>`, { id: 'items' });
  const groups = new Map();
  for (const it of list) { const c = it.category || 'Other'; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(it); }
  return [...groups].map(([c, l], i) => section(c, `<ul class="ha-list">${l.map(it => itemRow(it)).join('')}</ul>`, { count: l.length, id: 'cat-' + i })).join('');
}
function drawItemsList() {
  const el = $('#pa-items-list'); if (el) el.innerHTML = itemsList();
}

// ---- Item -------------------------------------------------------------------------------------------------------

const VERB = { add: 'Bought', use: 'Used up', open: 'Opened', discard: 'Thrown away', expired: 'Expired, thrown away', freeze: 'Frozen', thaw: 'Thawed' };
function viewItem(it) {
  const evs = eventsFor(it.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const u = L.usage(evs);
  const ro = L.isStaple(it) ? null : L.runOutDate(it, u);
  const q = L.totalQty(it);
  const batches = L.fefo(it);
  const t = today();
  let h = `<h1 class="ha-large-title">${esc(it.name)}</h1>${subOf(it) ? `<p class="ha-large-sub">${subOf(it)}</p>` : ''}`;
  // the thumbnail straight away; the photo replaces it once fetched (wantPhoto)
  const pic = bestPic(it);
  if (pic) h += `<img class="pa-hero" id="pa-hero" data-id="${esc(it.id)}" src="${esc(pic)}" alt="Photo of ${esc(it.name)}">`;
  wantPhoto(it);

  // stock, batch by batch (first to use at the top)
  const batchRow = b => {
    const d = L.batchUseBy(b, it);
    // frozen: marked so, or kept in a freezer (frozen goods); Thaw then. Food elsewhere can be frozen.
    const frozen = !!b.frozenAt || (P.isFreezer(it.location) && !b.thawedAt);
    const what = frozen ? `${b.qty} frozen` : b.openedAt ? `${b.qty} opened` : it.openDays ? `${b.qty} unopened` : plural(b.qty, 'in stock', 'in stock');
    const sub = [b.frozenAt ? `Frozen ${fmt(b.frozenAt)}` : '', b.thawedAt && !frozen ? `Thawed ${fmt(b.thawedAt)}` : '', b.openedAt ? `Opened ${fmt(b.openedAt)}` : '', d ? `use by ${fmt(d)}` : 'No date'].filter(Boolean).join(' · ');
    const desc = d ? `use by ${fmt(d)}` : 'no date';
    return `<li><div class="ha-row pa-batch">
      <span class="ha-row-body"><span class="ha-row-title">${esc(what)}</span><span class="ha-row-sub">${esc(sub.charAt(0).toUpperCase() + sub.slice(1))}</span></span>
      <span class="ha-row-trail">${badge(d)}</span>
      <span class="pa-batch-acts">
        ${!b.openedAt && it.openDays && !frozen ? `<button type="button" class="ha-btn ha-btn--small" data-act="open" data-b="${esc(b.id)}" aria-label="Open 1, ${esc(desc)}">Open</button>` : ''}
        ${frozen ? `<button type="button" class="ha-btn ha-btn--small" data-act="thaw" data-b="${esc(b.id)}" aria-label="Thaw ${esc(plural(b.qty, 'unit'))}, ${esc(desc)}">${icon('droplet')}Thaw</button>`
          : freezable(it) ? `<button type="button" class="ha-btn ha-btn--small" data-act="freeze" data-b="${esc(b.id)}" aria-label="Freeze ${esc(plural(b.qty, 'unit'))}, ${esc(desc)}">${icon('snowflake')}Freeze</button>` : ''}
        <button type="button" class="ha-btn ha-btn--small" data-act="use" data-b="${esc(b.id)}" aria-label="Used 1, ${esc(desc)}">Used 1</button>
        <button type="button" class="ha-btn ha-btn--small ha-btn--quiet" data-act="toss" data-b="${esc(b.id)}" aria-label="Bin 1, ${esc(desc)}">Bin 1</button>
      </span></div></li>`;
  };
  if (L.isStaple(it)) {
    const lv = L.levelOf(it);
    const seg = (v, label) => `<label class="ha-seg"><input type="radio" name="pa-level" value="${v}"${lv === v ? ' checked' : ''}><span>${label}</span></label>`;
    h += section('How much is left', `<fieldset class="ha-segmented pa-level"><legend class="ha-sr">How much is left</legend>${seg('plenty', 'Plenty')}${seg('low', 'Low')}${seg('out', 'Out')}</fieldset>`,
      { id: 'stock', footer: 'Kept without counting. Low or Out puts it on the shopping list; Put away sets it back to Plenty.' });
  } else {
    h += section('In stock', `<ul class="ha-list">${batches.length ? batches.map(batchRow).join('') : `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">None left</span><span class="ha-row-sub">Bought more? Add it below.</span></span></div></li>`}</ul>`,
      { count: q, id: 'stock', footer: it.openDays ? `Keeps about ${plural(it.openDays, 'day')} once opened (the label wins).` : '' });
  }
  h += `<div class="ha-btn-stack pa-actions">
    ${L.isStaple(it) ? '' : `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-act="bought">${icon('plus')}Bought more</button>`}
    <button type="button" class="ha-btn ha-btn--secondary ha-btn--block" data-act="to-list"${onList(it.id) ? ' aria-disabled="true"' : ''}>${icon('cart')}${onList(it.id) ? 'On the shopping list' : 'Add to shopping list'}</button>
  </div>`;

  // how fast the family uses it
  const max = Math.max(1, ...u.months.map(m => m.used + m.wasted));
  const cur = t.slice(0, 7);
  const cols = u.months.map(m => `<li class="ha-col${m.key === cur ? ' is-current' : ''}"><span class="ha-col-value">${m.used + m.wasted}</span><span class="ha-col-bar" style="--v:${Math.round(((m.used + m.wasted) / max) * 100)}%"></span><span>${esc(m.label)}${m.key === cur ? '<span class="ha-sr"> (this month)</span>' : ''}</span></li>`).join('');
  const pace = u.daysPerUnit
    ? `<p class="ha-card-kicker">Usual pace</p><p class="ha-card-title">${esc(L.paceLabel(u).replace(/^./, c => c.toUpperCase()))}</p>${ro ? `<p class="ha-card-text">At this pace it runs out around <strong>${esc(fmt(ro))}</strong>.</p>` : ''}`
    : `<p class="ha-card-text">Tap “Used 1” each time one is finished. After two, the pantry learns how fast you use it and puts it on the shopping list before it runs out.</p>`;
  h += section('How fast we use it', `<div class="ha-card">${pace}
      <p class="pa-cols-label" id="pa-cols-l">Used up or thrown away each month</p>
      <ul class="ha-cols pa-cols" aria-labelledby="pa-cols-l">${cols}</ul></div>`,
    { id: 'pace', footer: [plural(u.units, 'used up', 'used up'), u.discards ? `${u.discards} thrown away` : '', it.lowAt ? `on the shopping list at ${it.lowAt} left` : ''].filter(Boolean).join(' · ') });

  // buy it online
  const sq = shopQuery(it);
  h += section('Buy online', `<ul class="ha-list">
    ${L.SHOPS.map(sh => `<li><a class="ha-row" href="${esc(sh.url(sq))}" target="_blank" rel="noopener"><span class="ha-row-icon ha-row-icon--grey">${icon('cart')}</span><span class="ha-row-body"><span class="ha-row-title">Search ${esc(sh.name)}</span></span>${icon('external', { cls: 'ha-row-chevron' })}<span class="ha-sr"> (opens ${esc(sh.name)})</span></a></li>`).join('')}
  </ul>`, { id: 'online' });

  // details
  const detail = (label, value) => value === '' || value == null ? '' : `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">${label}</span></span><span class="ha-row-value pa-wrap">${esc(value)}</span></div></li>`;
  h += section('Details', `<ul class="ha-list">${detail('Category', it.category)}${detail('Kept in', it.location)}${detail('Keeps once opened', it.openDays ? plural(it.openDays, 'day') : 'Not set')}${L.isStaple(it) ? detail('Kept track of', 'Plenty, low or out') : detail('Shopping list at', it.lowAt ? `${it.lowAt} left` : 'None left')}${detail('Barcode', it.barcode)}${detail('Added by', nameOf(it.createdBy))}${detail('Last changed by', nameOf(it.updatedBy))}</ul>`, { id: 'details' });

  // history
  h += section('History', evs.length
    ? `<ul class="ha-list">${evs.slice(0, 15).map(e => `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">${e.type === 'level' ? `Marked ${esc(LEVEL_WORD[e.level] || e.level || '').toLowerCase()}` : VERB[e.type] || esc(e.type)} ${e.qty > 1 ? e.qty : ''}</span><span class="ha-row-sub">${esc(fmtTime(e.at))}${e.by ? ' · ' + esc(nameOf(e.by)) : ''}</span></span></div></li>`).join('')}</ul>`
    : `<ul class="ha-list"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-sub">Nothing yet.</span></span></div></li></ul>`, { id: 'history', footer: evs.length > 15 ? `The latest 15 of ${evs.length}.` : '' });
  h += `<ul class="ha-list pa-delete"><li><button type="button" class="ha-row ha-row--danger ha-row--center" data-act="delete"><span class="ha-row-body"><span class="ha-row-title">Delete item</span></span></button></li></ul>`;
  return h;
}

// ---- Add and edit -----------------------------------------------------------------------------------------------

function blank() {
  return { id: null, name: '', brand: '', size: '', category: 'Other', location: defaultPlace(), qty: 1, expiry: '', openDays: '', lowAt: 0, barcode: '', pic: '' };
}
// The form's picture: `pic` is what it shows (a thumbnail); `_pics` is { photo, thumb } for a new picture, null when
// removed, and absent when unchanged.
function viewForm(id) {
  const editing = !!id;
  const key = id || 'new';
  if (!S.draft || S.draft._for !== key) {
    const it = id && S.items.get(id);
    S.draft = it ? { ...blank(), ...it, openDays: it.openDays ?? '', pic: thumbSrc(it), _for: key } : { ...blank(), _for: key };
    S.dirty = false;
  }
  const d = S.draft;
  const opt = (list, v) => list.map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const field = (name, label, attrs = '', hint = '') => `<label class="ha-field"><span class="ha-field-label">${label}</span><input class="ha-input" name="${name}" value="${esc(d[name])}" ${attrs}>${hint ? `<span class="ha-field-hint">${hint}</span>` : ''}</label>`;
  let h = `<h1 class="ha-large-title">${editing ? 'Edit item' : 'Add an item'}</h1>`;
  if (!editing) {
    h += `<section class="ha-section pa-finder" aria-label="Find a product">
      <div class="ha-search" role="search">${icon('search')}
        <input type="search" id="pa-find" placeholder="Soy sauce, Milo, Dynamo…" aria-label="Find a product" autocomplete="off" enterkeyhint="search">
        <button type="button" class="ha-search-clear" data-act="find-clear" aria-label="Clear">${icon('close')}</button></div>
      <ul class="ha-list" id="pa-sugg" hidden></ul>
      <div class="ha-btn-row"><button type="button" class="ha-btn ha-btn--secondary" data-act="scan">${icon('barcode')}Scan barcode</button><button type="button" class="ha-btn ha-btn--secondary" data-act="quick">${icon('mic')}Say or type a list</button><button type="button" class="ha-btn ha-btn--secondary" data-act="leftovers">${icon('bowl')}Leftovers</button></div>
      <p class="ha-section-footer" id="pa-find-foot">Pick a common Singapore supermarket product, scan its barcode, or say what you bought, to fill in the details.</p>
    </section>`;
  }
  h += `<form id="pa-form" novalidate>
    <section class="ha-section" aria-labelledby="h-f-details"><h2 class="ha-section-header" id="h-f-details">Details</h2>
      <div class="pa-photo-row">
        <label class="pa-photo">${d.pic ? `<img src="${esc(d.pic)}" alt="">` : icon('camera')}<span>${d.pic ? 'Change photo' : 'Add photo'}</span>
          <input type="file" accept="image/*" capture="environment" class="pa-file" id="pa-photo-file"></label>
        <div class="pa-photo-fields">
          <label class="ha-field"><span class="ha-field-label">Name</span><input class="ha-input" name="name" value="${esc(d.name)}" required autocomplete="off" placeholder="Light soy sauce" aria-describedby="pa-name-err"></label>
          <p class="ha-field-error" id="pa-name-err" hidden>${icon('alert')}Give it a name</p>
        </div>
      </div>
      ${d.pic ? `<p class="pa-photo-del"><button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-act="photo-del">Remove photo</button></p>` : ''}
      <div class="pa-two">${field('brand', 'Brand', 'autocomplete="off" placeholder="Kikkoman"')}${field('size', 'Size', 'autocomplete="off" placeholder="500 ml"')}</div>
      <div class="pa-two">
        <label class="ha-field"><span class="ha-field-label">Category</span><select class="ha-select" name="category">${opt(CATEGORIES, d.category)}</select></label>
        <label class="ha-field"><span class="ha-field-label">Kept in</span><select class="ha-select" name="location">${placeOptions(d.location)}</select></label>
      </div>
    </section>`;
  const track = `<fieldset class="ha-segmented pa-track"><legend>Keep track by</legend>
      <label class="ha-seg"><input type="radio" name="measure" value="count"${d.measure !== 'level' ? ' checked' : ''}><span>Counting</span></label>
      <label class="ha-seg"><input type="radio" name="measure" value="level"${d.measure === 'level' ? ' checked' : ''}><span>Plenty, low, out</span></label></fieldset>`;
  const trackFoot = '<p class="ha-section-footer">For rice, oil or loose vegetables, “Plenty, low, out” is easier than counting.</p>';
  if (!editing && d.measure === 'level') {
    h += `<section class="ha-section" aria-labelledby="h-f-stock"><h2 class="ha-section-header" id="h-f-stock">Stock</h2>${track}${trackFoot}</section>`;
  } else if (!editing) {
    h += `<section class="ha-section" aria-labelledby="h-f-stock"><h2 class="ha-section-header" id="h-f-stock">Stock</h2>${track}
      <ul class="ha-list"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title" id="pa-qty-l">How many</span></span>
        <div class="ha-stepper" role="group" aria-labelledby="pa-qty-l" id="pa-qty"><button type="button" data-step="-1" aria-label="Fewer">${icon('minus')}</button><output>${Number(d.qty) || 0}</output><button type="button" data-step="1" aria-label="More">${icon('plus')}</button></div></div></li></ul>
      <label class="ha-field pa-gap"><span class="ha-field-label">Best before or use by</span><input class="ha-input" type="date" name="expiry" value="${esc(d.expiry)}"></label>
      ${dateChips('expiry', d.expiry, d._guess)}
    </section>`;
  }
  h += `<section class="ha-section" aria-labelledby="h-f-remind"><h2 class="ha-section-header" id="h-f-remind">Reminders</h2>
      ${editing ? `${track}${trackFoot}` : ''}
      <div class="pa-two">${field('openDays', 'Keeps once opened (days)', 'type="number" inputmode="numeric" min="0" placeholder="Not set"')}${field('lowAt', 'On the list when down to', 'type="number" inputmode="numeric" min="0"')}</div>
      <p class="ha-section-footer">Opened items are due the earlier of the printed date and this many days after opening.</p>
    </section>
    <section class="ha-section" aria-labelledby="h-f-code"><h2 class="ha-section-header" id="h-f-code">Barcode</h2>
      ${field('barcode', 'Barcode number', 'inputmode="numeric" autocomplete="off" placeholder="Optional"', 'Scanning it next time finds this item.')}
    </section>
  </form>`;
  return h;
}
function wireForm() {
  const f = $('#pa-form'); if (!f) return;
  const q = $('#pa-qty');
  if (q) haStepper(q, { min: 0, max: 99, onChange: v => { S.draft.qty = v; S.dirty = true; } });
  f.addEventListener('input', e => {
    const t = e.target; if (!t.name || !S.draft) return;
    S.draft[t.name] = t.value; S.dirty = true;
    if (t.name === 'category' || t.name === 'location') { S.draft._picked = { ...S.draft._picked, [t.name]: true }; refreshGuess(); }
    if (t.name === 'name' && t.value.trim()) { t.removeAttribute('aria-invalid'); $('#pa-name-err').hidden = true; }
    if (t.name === 'measure') { const y = scrollY; draw(route(), { keep: true }); scrollTo(0, y); $(`#pa-form [name="measure"][value="${t.value}"]`)?.focus(); return; }
    if (t.name === 'expiry') for (const c of document.querySelectorAll('.pa-dates .ha-chip')) c.setAttribute('aria-pressed', String(c.dataset.v === t.value && !!t.value));
  });
  f.addEventListener('submit', submitForm);
}
// A guessed best-before date for the form's product: filled in while the date is empty or still the last guess.
function withGuess(fields) {
  const d = S.draft, g = guessFor({ ...d, ...fields });
  const keep = d.expiry && d.expiry !== d._guess?.date;   // a date someone chose stays
  return { ...fields, _guess: g, ...(keep ? {} : { expiry: g?.date || '' }) };
}
function refreshGuess() {
  const box = $('#pa-form .pa-datebox'); if (!box || !S.draft) return;
  Object.assign(S.draft, withGuess({}));
  $('#pa-form [name="expiry"]').value = S.draft.expiry;
  box.outerHTML = dateChips('expiry', S.draft.expiry, S.draft._guess);
}
// Fill the form from a suggestion or a barcode lookup, then redraw it where it was.
function fillDraft(fields) {
  Object.assign(S.draft, fields);
  S.dirty = true;
  const y = scrollY;
  draw(route(), { keep: true });
  scrollTo(0, y);
}
function suggestions(q) {
  if (!q.trim()) return [];
  const out = [];
  const have = new Set();
  for (const it of items()) {
    have.add(L.norm(`${it.brand} ${it.name}`));
    const s = L.score(q, `${it.name} ${it.brand}`); if (s) out.push({ s: s + 2, mine: it });
  }
  for (const [i, c] of CATALOGUE.entries()) {
    if (have.has(L.norm(`${c.brand} ${c.name}`))) continue;   // already in the pantry: offer that one only
    const s = L.score(q, `${c.name} ${c.brand} ${c.category}`); if (s) out.push({ s, cat: c, i });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 8);
}
// Suggestion rows (the Add screen's finder and the unknown-barcode sheet): pantry items first, then the catalogue.
function suggRows(list, { mine = 'sugg-mine', cat = 'sugg' } = {}) {
  const row = (act, data, thumbHtml, title, sub, trail = '') => `<li><button type="button" class="ha-row" data-act="${act}" ${data}>${thumbHtml}<span class="ha-row-body"><span class="ha-row-title">${title}</span>${sub ? `<span class="ha-row-sub">${sub}</span>` : ''}</span>${trail}</button></li>`;
  return list.map(x => x.mine
    ? row(mine, `data-id="${esc(x.mine.id)}"`, thumb(x.mine), esc(x.mine.name), subOf(x.mine), `<span class="ha-row-trail"><span class="ha-badge ha-badge--accent">In the pantry</span></span>`)
    : row(cat, `data-i="${x.i}"`, `<span class="ha-row-thumb">${icon(CAT_ICON[x.cat.category] || 'box')}</span>`, esc(x.cat.name), [x.cat.brand, x.cat.size].filter(Boolean).map(esc).join(' · '))).join('');
}
function showSugg() {
  const q = $('#pa-find')?.value || '', ul = $('#pa-sugg');
  if (!ul) return;
  ul.innerHTML = suggRows(suggestions(q))
    + (q.trim() ? `<li><button type="button" class="ha-row ha-row--action" data-act="sugg-own"><span class="ha-row-icon">${icon('plus')}</span><span class="ha-row-body"><span class="ha-row-title">Add “${esc(q.trim())}”</span><span class="ha-row-sub">Not in the list? Type the details below.</span></span></button></li>` : '');
  ul.hidden = !q.trim();
  $('#pa-find-foot').hidden = !!q.trim();
}
function validName() {
  const n = $('#pa-form [name="name"]');
  if (S.draft.name.trim()) return true;
  n.setAttribute('aria-invalid', 'true'); $('#pa-name-err').hidden = false;
  n.focus(); n.scrollIntoView({ block: 'center' });
  return false;
}
function submitForm(e) {
  e.preventDefault();
  const d = S.draft;
  if (!d || !validName()) return;
  const base = d._for !== 'new' ? S.items.get(d._for) : null;
  const num = v => Math.max(0, parseInt(v, 10) || 0);
  const it = {
    ...(base || { id: L.uid(), batches: [], createdAt: new Date().toISOString(), createdBy: who() }),
    name: d.name.trim(), brand: String(d.brand || '').trim(), size: String(d.size || '').trim(), category: d.category, location: d.location,
    openDays: num(d.openDays) || null, lowAt: num(d.lowAt), barcode: String(d.barcode || '').trim(),
  };
  if (d.measure === 'level') { it.measure = 'level'; it.level = L.levelOf(base || {}); } else { delete it.measure; delete it.level; }
  // a new or removed picture: the photo is written (or deleted) first, then the item with its thumbnail
  const pics = d._pics, hadPhoto = !!base?.hasPhoto;
  if (pics !== undefined) {
    delete it.photo;
    if (pics) { it.thumb = pics.thumb; it.hasPhoto = true; savePhoto(it.id, pics.thumb, pics.photo); }
    else { delete it.thumb; delete it.hasPhoto; if (hadPhoto) delPhoto(it.id); }
  }
  S.draft = null; S.dirty = false;
  if (base) {
    save('items', it);
    haBack('#/item/' + it.id);
    haToast('Saved');
    return;
  }
  const qty = num(d.qty);
  let ev = null;
  if (qty > 0 && !L.isStaple(it)) {
    const res = L.addStock(it, { qty, expiry: d.expiry || null, by: who() });
    save('items', res.item); ev = save('events', res.event);
  } else save('items', it);
  haGo('#/item/' + it.id, { replace: true });
  haToast(`${it.name} added`, { action: 'Undo', onAction: () => { remove('items', it.id); if (ev) remove('events', ev.id); if (it.hasPhoto) delPhoto(it.id); redraw(); } });
}

// ---- barcode scanning -------------------------------------------------------------------------------------------

let scanning = null;
async function openScan() {
  const s = haSheet({
    title: 'Scan a barcode', closeLabel: 'Cancel',
    body: `<div class="pa-scan"><video muted playsinline aria-label="Camera view"></video></div>
      <p class="ha-text pa-scan-msg" id="pa-scan-msg" role="status">Point the camera at the barcode.</p>
      <label class="ha-btn ha-btn--secondary ha-btn--block pa-file-btn">${icon('camera')}Use a photo instead<input type="file" accept="image/*" class="pa-file" id="pa-scan-file"></label>`,
    onClose: () => { scanning?.cancel(); scanning = null; afterSheet(); },
  });
  const msg = $('#pa-scan-msg', s.el);
  const found = async code => { await haCloseSheet(s.el); gotBarcode(code); };
  $('#pa-scan-file', s.el).addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    msg.textContent = 'Reading the photo…';
    try {
      const { scanFile } = await import('./scan.js');
      scanning?.cancel();
      const code = await scanFile(file);
      if (code) return found(code);
      msg.textContent = 'No barcode found in that photo. Try closer, flat and in focus.';
    } catch { msg.textContent = 'This phone can’t read barcodes. Type the number into Barcode instead.'; }
  });
  try {
    const { scanVideo } = await import('./scan.js');
    if (!s.el.open) return;
    scanning = scanVideo($('video', s.el));
    const code = await scanning.done;
    scanning = null;
    if (code) found(code);
  } catch (e) {
    msg.textContent = /Permission|NotAllowed/i.test(`${e?.name} ${e?.message}`)
      ? 'The camera is blocked. Allow it in the browser’s settings, or use a photo of the barcode.'
      : 'No live camera here. Use a photo of the barcode instead.';
  }
}
async function gotBarcode(code) {
  const mine = items().find(i => i.barcode === code);
  if (mine) {
    haGo('#/item/' + mine.id, { replace: screen() === 'add' });
    haToast(`Found ${mine.name}`);
    openBought(mine);
    return;
  }
  if (screen() !== 'add') haGo('#/add');
  if (!S.draft) draw(route());
  haToast('Looking up the barcode…');
  const { lookup } = await import('./scan.js');
  const p = await lookup(code);
  if (!S.draft || screen() !== 'add') return;
  if (!p) { haHideToast(); fillDraft({ barcode: code }); openUnknown(code); return; }
  // a household or toiletry database guesses the category and place, unless someone has already chosen them
  const d = S.draft, picked = d._picked || {}, def = blank(), guess = {};
  if (p.category && !picked.category && d.category === def.category) guess.category = p.category;
  if (p.location && !picked.location && d.location === def.location) guess.location = p.location;
  fillDraft(withGuess({ barcode: code, name: p.name, brand: p.brand, size: p.size, ...guess }));
  haToast(`Found ${p.name}`);
  if (p.image && !S.draft.pic) {
    const { fromUrl } = await import('./photo.js');
    const ph = await fromUrl(p.image);
    if (ph && S.draft && !S.draft.pic) fillDraft({ pic: ph.thumb, _pics: ph });
  }
}

// No database knows this barcode: find it in the family's pantry or the Singapore list once, and it's known from
// then on. The barcode is already in the form, so Cancel still keeps it.
function openUnknown(code) {
  const s = haSheet({
    title: 'We don’t know this barcode yet', closeLabel: 'Cancel',
    body: `<p class="ha-text pa-unk-text">${navigator.onLine === false ? 'No signal to look it up online. ' : ''}Find what it is, and scanning barcode <span class="pa-unk-code">${esc(code)}</span> finds it next time.</p>
      <div class="ha-search" role="search">${icon('search')}
        <input type="search" id="pa-unk-find" placeholder="Soy sauce, Dynamo, tissue…" aria-label="Find the product" autocomplete="off" enterkeyhint="search" autofocus>
        <button type="button" class="ha-search-clear" data-act="unk-clear" aria-label="Clear">${icon('close')}</button></div>
      <ul class="ha-list" id="pa-unk-list" aria-label="Matching products" hidden></ul>
      <ul class="ha-list pa-unk-new"><li><button type="button" class="ha-row ha-row--action" data-act="unk-new"><span class="ha-row-icon">${icon('edit')}</span><span class="ha-row-body"><span class="ha-row-title">Type a new name</span><span class="ha-row-sub" id="pa-unk-new-sub">Not in the list? Fill in the details yourself.</span></span></button></li></ul>`,
    onClose: afterSheet,
  });
  const input = $('#pa-unk-find', s.el), ul = $('#pa-unk-list', s.el), sub = $('#pa-unk-new-sub', s.el);
  const show = () => {
    const q = input.value.trim();
    ul.innerHTML = suggRows(suggestions(q), { mine: 'unk-mine', cat: 'unk-cat' });
    ul.hidden = !ul.children.length;
    sub.textContent = q ? `Start with “${q}” and fill in the rest.` : 'Not in the list? Fill in the details yourself.';
  };
  input.addEventListener('input', show);
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-act^="unk-"]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'unk-clear') { input.value = ''; show(); input.focus(); return; }
    const q = input.value.trim();
    await haCloseSheet(s.el);
    if (act === 'unk-mine') {
      const mine = S.items.get(b.dataset.id); if (!mine) return;
      const it = save('items', { ...mine, barcode: code });
      S.draft = null; S.dirty = false;
      haGo('#/item/' + it.id, { replace: screen() === 'add' });
      haToast(`Barcode added to ${it.name}`);
      openBought(it);
      return;
    }
    if (!S.draft || screen() !== 'add') return;
    if (act === 'unk-cat') {
      const c = CATALOGUE[Number(b.dataset.i)];
      fillDraft(withGuess({ name: c.name, brand: c.brand, size: c.size, category: c.category, location: c.location, openDays: c.openDays ?? '', barcode: code }));
      $('#h-f-details')?.scrollIntoView({ block: 'start' });
      haAnnounce(`${c.name} filled in`);
      return;
    }
    if (q && !S.draft.name.trim()) fillDraft({ name: q });
    const n = $('#pa-form [name="name"]');
    n?.focus(); n?.scrollIntoView({ block: 'center' });
  });
}

// ---- scan many in a row: the camera stays open, a mode says what each scan does, a running tally, one Done -------

const SCAN_MODES = { add: 'Bought', use: 'Used up', list: 'Add to list' };
function openScanMany(mode = 'add') {
  const ops = [], tally = new Map(), unknown = new Set();
  let run = null;
  const s = haSheet({
    title: 'Scan many', closeLabel: 'Done',
    body: `<fieldset class="ha-segmented pa-sm-mode"><legend>Each scan</legend>${Object.entries(SCAN_MODES).map(([v, l]) =>
        `<label class="ha-seg"><input type="radio" name="pa-sm-mode" value="${v}"${v === mode ? ' checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
      <div class="pa-scan pa-sm-video"><video muted playsinline aria-label="Camera view"></video></div>
      <p class="ha-text pa-scan-msg" id="pa-sm-msg" role="status">Point the camera at each barcode in turn. Each counts once.</p>
      <section class="ha-section" aria-labelledby="pa-sm-h"><h3 class="ha-section-header" id="pa-sm-h"><span>Scanned</span><span class="ha-num" id="pa-sm-n">0</span></h3>
        <ul class="ha-list" id="pa-sm-tally"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-sub">Nothing yet.</span></span></div></li></ul></section>
      <label class="ha-btn ha-btn--secondary ha-btn--block pa-file-btn">${icon('camera')}Use a photo instead<input type="file" accept="image/*" class="pa-file" id="pa-sm-file"></label>`,
    footer: `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-ha-close>Done</button>`,
    onClose: () => {
      run?.cancel(); run = null;
      afterSheet(); redraw();
      if (ops.length) haToast(`Saved ${plural(ops.length, 'scan')}`, { action: 'Undo', onAction: () => {
        for (const o of ops.reverse()) { if (o.before) save('items', o.before); if (o.ev) remove('events', o.ev); if (o.line) remove('shop', o.line); }
        redraw(); haAnnounce('Undone');
      } });
    },
  });
  const el = s.el, msg = $('#pa-sm-msg', el), ul = $('#pa-sm-tally', el);
  const modeNow = () => el.querySelector('[name="pa-sm-mode"]:checked')?.value || 'add';
  const draw = () => {
    $('#pa-sm-n', el).textContent = [...tally.values()].reduce((n, t) => n + t.n, 0) + unknown.size;
    ul.innerHTML = [...tally.values()].reverse().map(t => `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">${esc(t.name)}</span><span class="ha-row-sub">${esc(SCAN_MODES[t.mode])}</span></span><span class="ha-row-value">× ${t.n}</span></div></li>`).join('')
      + [...unknown].map(c => `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">New barcode</span><span class="ha-row-sub pa-unk-code">${esc(c)}</span></span><span class="ha-row-trail"><button type="button" class="ha-btn ha-btn--small" data-sm-new="${esc(c)}">Add it</button></span></div></li>`).join('')
      || `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-sub">Nothing yet.</span></span></div></li>`;
  };
  const got = code => {
    const m = modeNow(), it = items().find(i => i.barcode === code);
    if (!it) { unknown.add(code); draw(); msg.textContent = `Not in the pantry yet: ${code}. Add it when you’re done.`; return; }
    let op = null, say = '';
    if (m === 'list') {
      const line = addToList(it, { quiet: true });
      if (!line) { msg.textContent = `${it.name} is already on the shopping list.`; return; }
      op = { line: line.id }; say = `${it.name} is on the shopping list`;
    } else {
      const res = m === 'add' ? restock(it, { qty: 1, expiry: guessFor(it)?.date || null })
        : L.isStaple(it) ? L.setLevel(it, { level: 'out', by: who() }) : L.takeOut(it, { type: 'use', by: who() });
      if (!res.event) { msg.textContent = `No ${it.name} left to use.`; return; }
      save('items', res.item);
      op = { before: it, ev: save('events', res.event).id };
      if (m === 'use' && L.isStaple(it)) { const line = addToList(res.item, { quiet: true }); if (line) op.line = line.id; }
      say = m === 'add' ? `Added 1 ${it.name}` : L.isStaple(it) ? `${it.name}: out, on the shopping list` : `Used 1 ${it.name}`;
    }
    ops.push(op);
    const k = `${m}:${it.id}`, t = tally.get(k) || { name: it.name, mode: m, n: 0 };
    t.n++; tally.delete(k); tally.set(k, t);
    draw(); msg.textContent = say; haHaptic();
  };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-sm-new]'); if (!b) return;
    const code = b.dataset.smNew;
    await haCloseSheet(el);
    gotBarcode(code);
  });
  $('#pa-sm-file', el).addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const { scanFile } = await import('./scan.js');
      const code = await scanFile(file);
      if (code) got(code); else msg.textContent = 'No barcode found in that photo. Try closer, flat and in focus.';
    } catch { msg.textContent = 'This phone can’t read barcodes.'; }
    e.target.value = '';
  });
  (async () => {
    try {
      const { scanMany } = await import('./scan.js');
      if (!el.open) return;
      run = scanMany($('video', el), got);
      await run.done;
    } catch (err) {
      msg.textContent = /Permission|NotAllowed/i.test(`${err?.name} ${err?.message}`)
        ? 'The camera is blocked. Allow it in the browser’s settings, or use a photo of each barcode.'
        : 'No live camera here. Use a photo of each barcode instead.';
    }
  })();
  return s;
}

// ---- the "bought more" sheet ----------------------------------------------------------------------------------

function openBought(it, { shopId = null } = {}) {
  const g = guessFor(it);
  const s = haSheet({
    title: 'Bought more', closeLabel: 'Cancel', grey: true,
    body: `<form id="pa-bought" novalidate>
      <ul class="ha-list"><li><div class="ha-row">${thumb(it)}<span class="ha-row-body"><span class="ha-row-title">${esc(it.name)}</span>${subOf(it) ? `<span class="ha-row-sub">${subOf(it)}</span>` : ''}</span></div></li>
        <li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title" id="pa-b-qty-l">How many</span></span>
          <div class="ha-stepper" role="group" aria-labelledby="pa-b-qty-l" id="pa-b-qty"><button type="button" data-step="-1" aria-label="Fewer">${icon('minus')}</button><output>1</output><button type="button" data-step="1" aria-label="More">${icon('plus')}</button></div></div></li></ul>
      <label class="ha-field pa-gap"><span class="ha-field-label">Best before or use by</span><input class="ha-input" type="date" name="expiry" value="${esc(g?.date || '')}"></label>
      ${dateChips('expiry', g?.date || '', g)}
    </form>`,
    footer: `<button type="submit" form="pa-bought" class="ha-btn ha-btn--primary ha-btn--block">Add to stock</button>`,
    onClose: afterSheet,
  });
  const qty = haStepper($('#pa-b-qty', s.el), { min: 1, max: 99 });
  const f = $('#pa-bought', s.el);
  f.addEventListener('input', e => { if (e.target.name === 'expiry') for (const c of s.el.querySelectorAll('.pa-dates .ha-chip')) c.setAttribute('aria-pressed', 'false'); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const n = qty.get(), cur = S.items.get(it.id);
    if (!cur) { haCloseSheet(s.el); return; }
    const res = restock(cur, { qty: n, expiry: f.expiry.value || null });
    const ticked = [...S.shop.values()].filter(m => m.itemId === it.id && !m.done && m.id !== shopId);
    for (const m of ticked) save('shop', { ...m, done: true });
    await haCloseSheet(s.el);
    apply(res, `Added ${n} ${it.name}`);
  });
}
// ---- leftovers: a name, the fridge, use within 3 days, one tap ----------------------------------------------------

const LEFTOVER_DAYS = 3;
function openLeftovers() {
  const fridge = P.placeOfKind(placeNames(), 'fridge'), by = L.addDays(today(), LEFTOVER_DAYS);
  const s = haSheet({
    title: 'Leftovers', closeLabel: 'Cancel', grey: true,
    body: `<form id="pa-left" novalidate>
      <label class="ha-field"><span class="ha-field-label">What is it?</span><input class="ha-input" name="name" id="pa-left-name" autocomplete="off" placeholder="Chicken curry, fried rice…" required aria-describedby="pa-left-err pa-left-when"></label>
      <p class="ha-field-error" id="pa-left-err" hidden>${icon('alert')}Say what it is</p>
      <label class="ha-field pa-gap"><span class="ha-field-label">Kept in</span><select class="ha-select" name="location">${placeOptions(fridge)}</select></label>
      <p class="ha-section-footer" id="pa-left-when">Use within ${plural(LEFTOVER_DAYS, 'day')}, by ${esc(fmt(by))}. It shows under Use soon, and never goes on the shopping list.</p>
    </form>`,
    footer: `<button type="submit" form="pa-left" class="ha-btn ha-btn--primary ha-btn--block">Add leftovers</button>`,
    onClose: afterSheet,
  });
  const f = $('#pa-left', s.el), name = $('#pa-left-name', s.el);
  name.addEventListener('input', () => { if (name.value.trim()) { name.removeAttribute('aria-invalid'); $('#pa-left-err', s.el).hidden = true; } });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const n = name.value.replace(/\s+/g, ' ').trim();
    if (!n) { name.setAttribute('aria-invalid', 'true'); $('#pa-left-err', s.el).hidden = false; name.focus(); return; }
    const base = { id: L.uid(), batches: [], createdAt: new Date().toISOString(), createdBy: who(), name: n, brand: '', size: '', category: 'Leftovers',
      location: f.location.value, openDays: null, lowAt: 0, barcode: '', noRestock: true };
    const res = L.addStock(base, { qty: 1, expiry: by, by: who() });
    save('items', res.item); const ev = save('events', res.event);
    await haCloseSheet(s.el);
    redraw();
    haToast(`${n}: use by ${fmt(by)}`, { action: 'Undo', onAction: () => { remove('items', base.id); remove('events', ev.id); redraw(); haAnnounce('Undone'); } });
  });
  setTimeout(() => name.focus(), 50);
  return s;
}

// ---- "Say or type" (quick.js): a sentence becomes items to confirm -----------------------------------------------

async function openQuick() {
  const Q = await import('./quick.js');
  let found = [], mic = null;
  const s = haSheet({
    title: 'Say or type', closeLabel: 'Cancel', grey: true,
    body: `<form id="pa-quick" novalidate>
      <label class="ha-field"><span class="ha-field-label">What did you buy?</span>
        <textarea class="ha-input pa-quick-text" id="pa-quick-text" autocomplete="off" placeholder="2 Meiji milk in the fridge expires 25 Oct, eggs and 3 tins of sardines"></textarea></label>
      ${Q.canListen() ? `<div class="ha-btn-row"><button type="button" class="ha-btn ha-btn--secondary pa-mic" id="pa-mic" aria-pressed="false">${icon('mic')}<span>Speak</span></button></div>` : ''}
      <p class="ha-section-footer" id="pa-quick-hint">${Q.canListen() ? 'Tap Speak, or type.' : 'Type, or tap the microphone on your keyboard.'} Say how many, where it’s kept and the date; separate things with “and” or commas.</p>
      <ul class="ha-list" id="pa-quick-list" aria-live="polite"></ul>
    </form>`,
    footer: `<button type="submit" form="pa-quick" class="ha-btn ha-btn--primary ha-btn--block" id="pa-quick-go" disabled>Add items</button>`,
    onClose: () => { mic?.stop(); afterSheet(); },
  });
  const ta = $('#pa-quick-text', s.el), ul = $('#pa-quick-list', s.el), go = $('#pa-quick-go', s.el);
  const describe = x => [x.brand, plural(x.qty, 'unit'), x.location, x.expiry ? `use by ${fmt(x.expiry)}` : x.guess ? `about ${fmt(x.guess.date)} (a guess)` : 'no date',
    x.match?.mine ? 'adds to the one at home' : x.match?.cat ? '' : 'new item'].filter(Boolean).join(' · ');
  const show = () => {
    const pc = placeChoices();
    found = Q.parseQuick(ta.value, { today: today(), items: items(), catalogue: CATALOGUE, places: [...pc.listed, ...pc.unlisted] });
    for (const x of found) {
      const m = x.match?.mine || x.match?.cat;
      x.guess = x.expiry ? null : guessFor({ name: x.name, category: m?.category || '', location: x.location || m?.location || '' });
    }
    ul.innerHTML = found.map((x, i) => `<li><label class="ha-row"><input type="checkbox" data-q="${i}" checked>
      <span class="ha-row-body"><span class="ha-row-title">${esc(x.name)}</span><span class="ha-row-sub">${esc(describe(x))}</span></span></label></li>`).join('');
    count();
  };
  const count = () => {
    const n = ul.querySelectorAll('input:checked').length;
    go.disabled = !n;
    go.textContent = n ? `Add ${plural(n, 'item')}` : 'Add items';
  };
  ta.addEventListener('input', show);
  ul.addEventListener('change', count);
  $('#pa-mic', s.el)?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (mic) { mic.stop(); return; }
    const before = ta.value.trim();
    btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true'); btn.lastElementChild.textContent = 'Stop';
    try {
      mic = Q.listen({
        onText: text => { ta.value = [before, text].filter(Boolean).join(', '); show(); },
        onEnd: err => {
          mic = null; btn.classList.remove('is-on'); btn.setAttribute('aria-pressed', 'false'); btn.lastElementChild.textContent = 'Speak';
          if (err && err !== 'no-speech' && err !== 'aborted') haToast(/not-allowed|service/.test(err) ? 'The microphone is blocked. Allow it in the browser’s settings, or type instead.' : 'Didn’t catch that. Try again or type.');
        },
      });
    } catch { mic = null; haToast('Speech isn’t available here. Type instead.'); }
  });
  $('#pa-quick', s.el).addEventListener('submit', async e => {
    e.preventDefault();
    mic?.stop();
    const picked = [...ul.querySelectorAll('input:checked')].map(c => found[Number(c.dataset.q)]);
    if (!picked.length) return;
    const undo = [];
    for (const x of picked) {
      const mine = x.match?.mine && S.items.get(x.match.mine.id);
      const c = x.match?.cat;
      const base = mine || {
        id: L.uid(), batches: [], createdAt: new Date().toISOString(), createdBy: who(),
        name: x.name, brand: x.brand || '', size: c?.size || '', category: c?.category || 'Other',
        location: x.location || c?.location || defaultPlace(), openDays: c?.openDays ?? null, lowAt: 0, barcode: '',
      };
      const res = restock(base, { qty: x.qty, expiry: x.expiry || x.guess?.date || null });
      undo.push({ before: mine || null, id: base.id, ev: save('events', res.event).id });
      save('items', res.item);
    }
    flag('said');
    await haCloseSheet(s.el);
    if (screen() === 'add') { S.draft = null; S.dirty = false; haGo('#/', { replace: true }); } else redraw();
    haToast(`Added ${plural(picked.length, 'item')}`, { action: 'Undo', onAction: () => {
      for (const u of undo.reverse()) { if (u.before) save('items', u.before); else remove('items', u.id); remove('events', u.ev); }
      redraw(); haAnnounce('Undone');
    } });
  });
  setTimeout(() => ta.focus(), 50);
}

// A sheet closed: draw anything the family changed while it was open.
function afterSheet() {
  if (S.pendingRender && !haSheetOpen()) redraw();
}

// ---- Shopping ---------------------------------------------------------------------------------------------------

function shopLists() {
  const buy = L.toBuy(items(), eventsByItem());
  const manual = [...S.shop.values()].sort((a, b) => (a.done - b.done) || (a.at < b.at ? -1 : 1));
  const listed = new Set(manual.filter(m => m.itemId && !m.done).map(m => m.itemId));
  return { manual, suggested: buy.filter(b => !listed.has(b.item.id)) };
}
// The aisle a shopping line belongs to: its pantry item's category, else the catalogue's best match for its name.
const aisleCache = new Map();
function aisleOf(m) {
  const it = m.itemId && S.items.get(m.itemId);
  if (it?.category) return it.category;
  if (!aisleCache.has(m.name)) aisleCache.set(m.name, catMatch(m.name)?.category || 'Other');
  return aisleCache.get(m.name);
}
// The catalogue product a typed name most likely is (or null).
function catMatch(name) {
  let best = null;
  for (const c of CATALOGUE) { const sc = L.score(name, `${c.name} ${c.brand}`); if (sc && (!best || sc > best.sc)) best = { sc, c }; }
  return best?.c || null;
}
// "Buy again": things the family has bought before (two or more), not on the list or suggested already, most bought first.
function buyAgain(suggested) {
  const n = new Map();
  for (const e of S.events.values()) if (e.type === 'add') n.set(e.itemId, (n.get(e.itemId) || 0) + (Number(e.qty) || 1));
  const skip = new Set(suggested.map(b => b.item.id));
  return items().filter(it => (n.get(it.id) || 0) >= 2 && !it.noRestock && !skip.has(it.id) && !onList(it.id))
    .sort((a, b) => n.get(b.id) - n.get(a.id) || a.name.localeCompare(b.name)).slice(0, 8);
}
const canSpeak = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
function viewShop() {
  const { manual, suggested } = shopLists();
  const todo = manual.filter(m => !m.done), done = manual.filter(m => m.done);
  let h = `<h1 class="ha-large-title">Shopping</h1>
    <form class="pa-addline" id="pa-shop-add"><label class="ha-sr" for="pa-shop-text">Add something to buy</label>
      <input class="ha-input" id="pa-shop-text" placeholder="Add something to buy" autocomplete="off" enterkeyhint="done">
      ${canSpeak() ? `<button type="button" class="ha-btn ha-btn--secondary ha-btn--icon pa-mic" id="pa-shop-mic" data-act="shop-mic" aria-pressed="false" aria-label="Say what to buy">${icon('mic')}</button>` : ''}
      <button class="ha-btn ha-btn--compact" type="submit">Add</button></form>`;
  const again = buyAgain(suggested);
  if (again.length) {
    h += section('Buy again', `<div class="ha-chips ha-chips--wrap pa-again" role="group" aria-labelledby="h-again">${again.map(it =>
      `<button type="button" class="ha-chip" data-act="to-list" data-id="${esc(it.id)}" aria-label="Add ${esc(it.name)} to the list">${icon('plus')}${esc(it.name)}</button>`).join('')}</div>`, { id: 'again' });
  }
  const line = m => `<li><label class="ha-row${m.done ? ' is-done' : ''}">
      <input type="checkbox" data-shop="${esc(m.id)}"${m.done ? ' checked' : ''}>
      <span class="ha-row-body"><span class="ha-row-title">${esc(m.name)}</span>${m.by ? `<span class="ha-row-sub">Added by ${esc(nameOf(m.by))}</span>` : ''}</span>
      <button type="button" class="ha-btn ha-btn--quiet ha-btn--icon" data-act="shop-del" data-id="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">${icon('trash')}</button></label></li>`;
  // the lines to buy, by aisle (the catalogue's category order), so the shop is walked once
  const groups = new Map();
  for (const m of todo) { const a = aisleOf(m); if (!groups.has(a)) groups.set(a, []); groups.get(a).push(m); }
  const order = [...groups.keys()].sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  const body = todo.length
    ? order.map((a, i) => `<h3 class="pa-aisle" id="pa-aisle-${i}">${esc(a)}</h3><ul class="ha-list" aria-labelledby="pa-aisle-${i}">${groups.get(a).map(line).join('')}</ul>`).join('')
    : `<ul class="ha-list"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-sub">${done.length ? 'Everything is in the trolley.' : 'Nothing on the list yet.'}</span></span></div></li></ul>`;
  h += section('To buy', `<div id="pa-shop">${body}</div>`, {
    id: 'shop', count: todo.length || '',
    footer: manual.length || suggested.length ? 'Grouped by aisle. Tick things off as they go in the trolley, then Put away.'
      : 'Pantry items come here by themselves when none are left, when they’re down to their “on the list when down to” number, or when they’ll run out within a week at your usual pace. Type anything else above.' });
  if (done.length) {
    h += section('In the trolley', `<ul class="ha-list" id="pa-shop-done">${done.map(line).join('')}</ul>
      <div class="ha-btn-stack pa-putaway-btn"><button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-act="put-away">${icon('box')}Put away ${esc(plural(done.length, 'thing'))}</button></div>`,
    { id: 'trolley', action: `<button type="button" data-act="shop-clear">Clear ticked</button>`, footer: 'Home again? Put away adds them to the pantry, each with its place and date, in one go.' });
  }
  h += section('Suggested from the pantry', suggested.length
    ? `<ul class="ha-list">${suggested.map(b => `<li><div class="ha-row">${thumb(b.item)}<span class="ha-row-body"><span class="ha-row-title">${esc(b.item.name)}</span><span class="ha-row-sub">${esc(L.whyText(b, today()))}</span></span>
        <span class="ha-row-trail"><button type="button" class="ha-btn ha-btn--small" data-act="to-list" data-id="${esc(b.item.id)}" aria-label="Add ${esc(b.item.name)} to the list">Add</button></span></div></li>`).join('')}</ul>`
    : '', { id: 'suggested', footer: suggested.length ? 'Out of stock, running low, or due to run out within a week at your usual pace.' : 'Nothing is running low.' });
  if (todo.length || suggested.length) {
    h += `<p class="pa-share-line pa-going"><a class="ha-btn ha-btn--secondary ha-btn--block" id="pa-wa-going" href="${esc(L.waLink(goingText()))}" target="_blank" rel="noopener">${icon('share')}Going shopping now<span class="ha-sr"> (opens WhatsApp)</span></a></p>
      <p class="ha-section-footer pa-going-foot">Tells the family on WhatsApp, with the list, so they can add anything before you’re back.</p>`;
  }
  return h;
}
const goingText = () => `Going shopping now. Anything to add?\n\n${L.shareText(shareLines())}`;
function shareLines() {
  const { manual, suggested } = shopLists();
  return [...manual.filter(m => !m.done).map(m => m.name), ...suggested.map(b => [b.item.brand, b.item.name].filter(Boolean).join(' '))];
}
function addToList(it, { quiet = false } = {}) {
  if (onList(it.id)) { if (!quiet) haToast('Already on the shopping list'); return null; }
  const m = save('shop', { id: L.uid(), name: [it.brand, it.name].filter(Boolean).join(' '), itemId: it.id, done: false, at: new Date().toISOString(), by: who() });
  if (quiet) return m;
  redraw();
  haToast(`${it.name} is on the shopping list`, { action: 'Undo', onAction: () => { remove('shop', m.id); redraw(); } });
  return m;
}
// A line typed or said: linked to the pantry item of that name, if there is one.
function addLine(v) {
  const mine = items().find(i => L.norm(i.name) === L.norm(v) || L.norm(`${i.brand} ${i.name}`) === L.norm(v));
  if (mine && onList(mine.id)) return null;
  return save('shop', { id: L.uid(), name: v, itemId: mine?.id || null, done: false, at: new Date().toISOString(), by: who() });
}
// The mic on the shopping list: say "milk, eggs and bread"; each becomes a line when the speaking stops.
let shopMic = null;
async function listenShop(btn) {
  if (shopMic) { shopMic.stop(); return; }
  const Q = await import('./quick.js');
  const inp = $('#pa-shop-text');
  let heard = '', ended = false;
  const done = err => {
    if (ended) return;   // browsers may end twice (an error, then the end)
    ended = true;
    shopMic = null;
    const b = $('#pa-shop-mic'); b?.classList.remove('is-on'); b?.setAttribute('aria-pressed', 'false');
    if (err && err !== 'no-speech' && err !== 'aborted') haToast(/not-allowed|service/.test(err) ? 'The microphone is blocked. Allow it in the browser’s settings, or type instead.' : 'Didn’t catch that. Try again or type.');
    const added = Q.splitItems(heard).map(p => addLine(p.replace(/^(buy|get|need|we need|some)\s+/i, '').replace(/^./, c => c.toUpperCase()))).filter(Boolean);
    if (inp) inp.value = '';
    redraw();
    if (added.length) haToast(`Added ${plural(added.length, 'thing')} to the list`, { action: 'Undo', onAction: () => { for (const m of added) remove('shop', m.id); redraw(); haAnnounce('Undone'); } });
  };
  btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true');
  try {
    shopMic = Q.listen({ onText: t => { heard = t; if (inp) inp.value = t; }, onEnd: done });
  } catch { shopMic = null; btn.classList.remove('is-on'); btn.setAttribute('aria-pressed', 'false'); haToast('Speech isn’t available here. Type instead.'); }
}

// ---- Put away: everything ticked on the shopping list goes into the pantry in one sheet -----------------------------

function openPutAway() {
  const lines = [...S.shop.values()].filter(m => m.done).sort((a, b) => (a.at < b.at ? -1 : 1));
  if (!lines.length) return;
  // each line: its pantry item, or a new one (from the catalogue's best match for the name)
  const rows = lines.map(m => {
    const it = m.itemId && S.items.get(m.itemId);
    const c = it ? null : catMatch(m.name);
    const base = it || { name: m.name, brand: '', category: c?.category || 'Other', location: c?.location || defaultPlace() };
    return { m, it, c, g: L.isStaple(it) ? null : guessFor(base), place: base.location || defaultPlace() };
  });
  const row = (r, i) => {
    const staple = L.isStaple(r.it);
    return `<li class="pa-pa"><label class="ha-row"><input type="checkbox" data-pa="${i}" checked>
        <span class="ha-row-body"><span class="ha-row-title" id="pa-pa-t${i}">${esc(r.it ? r.it.name : r.m.name)}</span><span class="ha-row-sub">${r.it ? staple ? 'Back to plenty' : 'Adds to the one at home' : r.c ? `New item · ${esc(r.c.category)}` : 'New item'}</span></span></label>
      <div class="pa-pa-fields">
        <label class="ha-field"><span class="ha-field-label">Kept in</span><select class="ha-select" name="place" data-i="${i}">${placeOptions(r.place)}</select></label>
        ${staple ? '' : `<label class="ha-field"><span class="ha-field-label">Best before</span><input class="ha-input" type="date" name="expiry" data-i="${i}" value="${esc(r.g?.date || '')}"></label>
        <label class="ha-field pa-pa-qty"><span class="ha-field-label">How many</span><input class="ha-input" type="number" inputmode="numeric" min="1" max="99" name="qty" data-i="${i}" value="1"></label>`}
      </div>${r.g ? `<p class="ha-field-hint">${esc(r.g.label)}: a guess. Change it to the date on the pack.</p>` : ''}</li>`;
  };
  const s = haSheet({
    title: 'Put away', closeLabel: 'Cancel', grey: true, detent: 'large',
    body: `<p class="ha-text pa-pa-intro">Check where each goes and its date, then save them all at once. Untick anything that isn’t for the pantry.</p>
      <ul class="ha-list pa-pa-list">${rows.map(row).join('')}</ul>`,
    footer: `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" id="pa-pa-go">Put away ${esc(plural(rows.length, 'thing'))}</button>`,
    onClose: afterSheet,
  });
  const go = $('#pa-pa-go', s.el);
  const picked = () => [...s.el.querySelectorAll('[data-pa]:checked')].map(c => Number(c.dataset.pa));
  s.el.addEventListener('change', e => {
    if (!e.target.dataset.pa) return;
    const n = picked().length;
    go.disabled = !n; go.textContent = n ? `Put away ${plural(n, 'thing')}` : 'Put away';
  });
  go.addEventListener('click', async () => {
    const val = (name, i) => s.el.querySelector(`[name="${name}"][data-i="${i}"]`)?.value || '';
    const undo = { items: [], created: [], events: [], lines: [] };
    for (const i of picked()) {
      const r = rows[i], place = val('place', i), qty = Math.max(1, Math.min(99, parseInt(val('qty', i), 10) || 1));
      let it = r.it && S.items.get(r.it.id);
      if (it) undo.items.push(it);
      else {
        const c = r.c;
        it = { id: L.uid(), batches: [], createdAt: new Date().toISOString(), createdBy: who(), name: c?.name || r.m.name, brand: c?.brand || '', size: c?.size || '',
          category: c?.category || 'Other', location: place, openDays: c?.openDays ?? null, lowAt: 0, barcode: '' };
        undo.created.push(it.id);
      }
      it = { ...it, location: place || it.location };
      const res = restock(it, { qty, expiry: val('expiry', i) || null });
      save('items', res.item);
      if (res.event) undo.events.push(save('events', res.event).id);
      undo.lines.push(r.m); remove('shop', r.m.id);
    }
    await haCloseSheet(s.el);
    redraw();
    const n = undo.lines.length;
    haToast(`Put away ${plural(n, 'thing')}`, { action: 'Undo', onAction: () => {
      for (const it of undo.items) save('items', it);
      for (const id of undo.created) remove('items', id);
      for (const id of undo.events) remove('events', id);
      for (const m of undo.lines) save('shop', m);
      redraw(); haAnnounce('Undone');
    } });
  });
  return s;
}

// ---- Places (Settings → Places, #/places) -------------------------------------------------------------------------

function viewPlaces() {
  const { listed, unlisted } = placeChoices();
  const counts = P.placeCounts(items());
  const row = p => { const n = counts.get(p) || 0; return `<li><button type="button" class="ha-row pa-place" data-act="place-open" data-v="${esc(p)}">
      <span class="ha-row-body"><span class="ha-row-title">${esc(p)}</span></span>
      <span class="ha-row-value">${n}<span class="ha-sr"> ${n === 1 ? 'item' : 'items'}</span></span>${chevron()}</button></li>`; };
  let h = `<h1 class="ha-large-title">Places</h1><p class="ha-large-sub">Where things are kept${S.mode === 'cloud' ? ', shared with the family' : ''}</p>`;
  h += section('Your places', `<ul class="ha-list" id="pa-places">${listed.map(row).join('')}</ul>`,
    { id: 'places-list', count: listed.length, footer: 'Tap a place to rename it, move it up or down, or remove it. Add and Items show them in this order.' });
  if (unlisted.length) {
    h += section('Not in your list', `<ul class="ha-list" id="pa-places-other">${unlisted.map(row).join('')}</ul>`,
      { id: 'places-other', footer: 'Items are still kept here. Tap one to add it to your list or move its items.' });
  }
  h += section('Add a place', `<form class="pa-addline pa-place-add" id="pa-place-add" novalidate><label class="ha-sr" for="pa-place-name">Name of the new place</label>
      <input class="ha-input" id="pa-place-name" maxlength="${P.MAX_NAME}" placeholder="Level 2 fridge" autocomplete="off" aria-describedby="pa-place-err">
      <button class="ha-btn ha-btn--compact" type="submit">Add</button></form>
    <p class="ha-field-error pa-place-err" id="pa-place-err" aria-live="polite" hidden></p>`,
  { id: 'places-add', footer: `Up to ${P.MAX_NAME} letters, like Level 2 fridge or Mum’s room.` });
  return h;
}
function addPlaceFromForm() {
  const inp = $('#pa-place-name'), err = $('#pa-place-err'), list = placeNames();
  const problem = P.placeProblem(list, inp.value);
  if (problem) {
    err.innerHTML = `${icon('alert')}${esc(problem)}`; err.hidden = false;
    inp.setAttribute('aria-invalid', 'true'); inp.focus();
    return;
  }
  const name = P.cleanPlace(inp.value);
  savePlaces(P.addPlace(list, name));
  inp.value = ''; inp.removeAttribute('aria-invalid'); err.hidden = true;
  redraw();
  $('#pa-place-name')?.focus();
  haToast(`Added ${name}`);
}
// A place's sheet: rename it, move it up or down, add it to the list, or remove it.
function openPlace(name) {
  const listed = () => placeNames().includes(name);
  const n = P.placeCounts(items()).get(name) || 0;
  const pos = () => { const l = placeNames(); return `${l.indexOf(name) + 1} of ${l.length} in your list`; };
  const only = listed() && placeNames().length === 1;
  const s = haSheet({
    title: name, closeLabel: 'Done', grey: true,
    body: `<form id="pa-pl-form" novalidate>
        <label class="ha-field"><span class="ha-field-label">Name</span><input class="ha-input" name="name" id="pa-pl-name" value="${esc(name)}" maxlength="${P.MAX_NAME}" autocomplete="off" aria-describedby="pa-pl-err"></label>
        <p class="ha-field-error" id="pa-pl-err" aria-live="polite" hidden></p>
        <button type="submit" class="ha-btn ha-btn--secondary ha-btn--block">Rename</button>
      </form>
      <p class="ha-text pa-pl-count">${n ? `${esc(plural(n, 'item'))} kept here. Renaming moves ${n === 1 ? 'it' : 'them'} too.` : 'No items kept here.'}</p>
      ${listed()
        ? `<section class="ha-section" aria-labelledby="pa-pl-order"><h3 class="ha-section-header" id="pa-pl-order">Order</h3>
          <div class="ha-btn-row pa-pl-move"><button type="button" class="ha-btn ha-btn--secondary" data-pl="up" aria-label="Move up, ${esc(name)}">${icon('chevron-left', { cls: 'pa-up' })}Move up</button><button type="button" class="ha-btn ha-btn--secondary" data-pl="down" aria-label="Move down, ${esc(name)}">${icon('chevron-left', { cls: 'pa-down' })}Move down</button></div>
          <p class="ha-section-footer" id="pa-pl-pos" role="status">${esc(pos())}</p></section>`
        : `<div class="ha-btn-stack pa-pl-add"><button type="button" class="ha-btn ha-btn--secondary ha-btn--block" data-pl="list">${icon('plus')}Add to your list</button></div>`}
      <ul class="ha-list pa-pl-del"><li><button type="button" class="ha-row ha-row--danger ha-row--center" data-pl="remove"${only ? ' aria-disabled="true" aria-describedby="pa-pl-only"' : ''}><span class="ha-row-body"><span class="ha-row-title">${listed() ? 'Remove place' : 'Move its items'}</span></span></button></li></ul>
      ${only ? '<p class="ha-section-footer" id="pa-pl-only">Keep at least one place.</p>' : ''}`,
    onClose: afterSheet,
  });
  const el = s.el;
  const moveBtns = () => {
    const l = placeNames(), i = l.indexOf(name);
    const up = $('[data-pl="up"]', el), down = $('[data-pl="down"]', el);
    if (!up) return;
    const was = document.activeElement;
    up.disabled = i <= 0; down.disabled = i < 0 || i >= l.length - 1;
    if (was?.disabled) (was === up ? down : up).focus();
    $('#pa-pl-pos', el).textContent = pos();
  };
  moveBtns();
  // someone in the family changed it meanwhile: say so instead of acting on an old name
  const stillThere = () => {
    if (listed() || P.placeCounts(items()).get(name)) return true;
    haToast(`${name} was changed on another phone`); haCloseSheet(el); return false;
  };
  $('#pa-pl-form', el).addEventListener('submit', async e => {
    e.preventDefault();
    if (!stillThere()) return;
    const inp = $('#pa-pl-name', el), err = $('#pa-pl-err', el);
    const to = P.cleanPlace(inp.value);
    if (to === name) return haCloseSheet(el);
    const problem = P.placeProblem(placeNames(), inp.value, name);
    if (problem) { err.innerHTML = `${icon('alert')}${esc(problem)}`; err.hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
    await haCloseSheet(el);
    renamePlace(name, to);
  });
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-pl]');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true' || !stillThere()) return;
    const a = b.dataset.pl;
    if (a === 'up' || a === 'down') {
      savePlaces(P.movePlace(placeNames(), name, a === 'up' ? -1 : 1));
      S.pendingRender = true;
      moveBtns();
      haAnnounce(`${name} moved ${a}, ${pos()}`);
    } else if (a === 'list') {
      const problem = P.placeProblem(placeNames(), name);
      if (problem) return haToast(problem);
      savePlaces(P.addPlace(placeNames(), name));
      await haCloseSheet(el);
      redraw();
      haToast(`${name} is in your list`);
    } else if (a === 'remove') {
      const count = P.placeCounts(items()).get(name) || 0;
      await haCloseSheet(el);
      if (count) return openMovePlace(name);
      const before = placeNames();
      savePlaces(P.removeFromList(before, name));
      redraw();
      haToast(`Removed ${name}`, { action: 'Undo', onAction: () => { savePlaces(before); redraw(); haAnnounce('Undone'); } });
    }
  });
  return s;
}
// Renames a place in the list and on every item kept there (one batch), with Undo.
function renamePlace(from, to) {
  const before = placeNames(), moved = items().filter(it => it.location === from);
  if (before.includes(from)) savePlaces(P.renameInList(before, from, to));
  saveMany('items', P.moveItems(moved, from, to));
  if (S.place === from) S.place = to;
  redraw();
  haToast(`Renamed to ${to}`, { action: 'Undo', onAction: () => {
    savePlaces(before);
    saveMany('items', moved.filter(it => S.items.get(it.id)?.location === to).map(it => ({ ...S.items.get(it.id), location: from })));
    if (S.place === to) S.place = from;
    redraw(); haAnnounce('Undone');
  } });
}
// Removing a place that items use: first ask where they go (never leaves items pointing at a removed place).
function openMovePlace(name) {
  const listed = placeNames().includes(name);
  const n = P.placeCounts(items()).get(name) || 0;
  const { listed: l, unlisted } = placeChoices();
  const others = [...l, ...unlisted].filter(p => p !== name);
  const s = haSheet({
    title: listed ? `Remove ${name}` : `Move items from ${name}`, closeLabel: 'Cancel', grey: true,
    body: `<p class="ha-text pa-mv-text">${esc(plural(n, 'item'))} ${n === 1 ? 'is' : 'are'} kept in ${esc(name)}. Choose where ${n === 1 ? 'it goes' : 'they go'}${listed ? ' before the place is removed' : ''}.</p>
      <label class="ha-field"><span class="ha-field-label">Move ${n === 1 ? 'it' : 'them'} to</span><select class="ha-select" id="pa-mv-to">${others.map(p => `<option>${esc(p)}</option>`).join('')}</select></label>`,
    footer: `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" id="pa-mv-go">${listed ? 'Move and remove' : `Move ${esc(plural(n, 'item'))}`}</button>`,
    onClose: afterSheet,
  });
  $('#pa-mv-go', s.el).addEventListener('click', async () => {
    const to = $('#pa-mv-to', s.el).value;
    const before = placeNames(), moved = items().filter(it => it.location === name);
    await haCloseSheet(s.el);
    saveMany('items', P.moveItems(moved, name, to));
    if (before.includes(name)) savePlaces(P.removeFromList(before, name));
    if (S.place === name) S.place = '';
    redraw();
    haToast(listed ? `Removed ${name}; ${plural(moved.length, 'item')} moved to ${to}` : `${plural(moved.length, 'item')} moved to ${to}`, { action: 'Undo', onAction: () => {
      if (before.includes(name)) savePlaces(before);
      saveMany('items', moved.filter(it => S.items.get(it.id)?.location === to).map(it => ({ ...S.items.get(it.id), location: name })));
      redraw(); haAnnounce('Undone');
    } });
  });
  return s;
}

// ---- Settings ---------------------------------------------------------------------------------------------------

// The family: one row per member (the name, with the Gmail under it), each opening their contact sheet; then the line
// to add someone. In the demo, a made-up family that changes in memory only.
function familyList(h, { demo = false, extra = '' } = {}) {
  const n = names();
  const person = m => {
    const sub = [n[m] ? m : '', m === h.owner ? 'Started it' : '', m === me() ? 'You' : ''].filter(Boolean).join(' · ');
    return `<li><button type="button" class="ha-row pa-person" data-act="person" data-v="${esc(m)}"><span class="ha-row-icon ha-row-icon--grey">${icon('user')}</span>
      <span class="ha-row-body"><span class="ha-row-title pa-break">${esc(n[m] || m)}</span>${sub ? `<span class="ha-row-sub pa-break">${esc(sub)}</span>` : ''}</span>${chevron()}</button></li>`;
  };
  return `<ul class="ha-list">
      <li><div class="ha-row"><span class="ha-row-icon">${icon('cloud')}</span><span class="ha-row-body"><span class="ha-row-title">${esc(h.name)}</span><span class="ha-row-sub pa-break">${demo ? 'Demo family' : `Signed in as ${esc(me())}`}</span></span></div></li>
      ${h.members.map(person).join('')}${extra}</ul>
    <form class="pa-addline pa-member" id="pa-member-add"><label class="ha-sr" for="pa-member-email">Family member’s email</label>
      <input class="ha-input" id="pa-member-email" type="email" placeholder="Family member’s email" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="ha-btn ha-btn--compact" type="submit">Add</button></form>`;
}
// Adding or removing someone: the family pantry's members (in the demo, only in memory).
async function setMembers(list) {
  if (S.mode === 'demo') { S.household = { ...S.household, members: list }; redraw(); return; }
  await S.cloud.setMembers(S.household.id, list);
}
const saveNames = n => save('settings', PP.peopleDoc(n));
// A family member's contact sheet: their Gmail, a name everyone sees, email an invite, stop sharing (not for whoever
// started it, nor yourself).
function openPerson(email) {
  const h = S.household; if (!h) return;
  const canRemove = email !== h.owner && email !== me();
  const s = haSheet({
    title: names()[email] || 'Family member', closeLabel: 'Done', grey: true,
    body: `<ul class="ha-list"><li><div class="ha-row"><span class="ha-row-icon">${icon('mail')}</span><span class="ha-row-body"><span class="ha-row-title pa-break">${esc(email)}</span>
        <span class="ha-row-sub">${email === h.owner ? 'Started the family pantry' : 'Google account'}${email === me() ? ' · you' : ''}</span></span></div></li></ul>
      <form id="pa-person" class="pa-person-form" novalidate>
        <label class="ha-field"><span class="ha-field-label">Name</span>
          <input class="ha-input" name="name" id="pa-person-name" value="${esc(names()[email] || '')}" maxlength="${PP.NAME_MAX}" autocomplete="off" placeholder="For example, Mum or Ah Mei" aria-describedby="pa-person-hint"></label>
        <p class="ha-section-footer" id="pa-person-hint">Everyone in the family sees this name instead of the email, in history and on the shopping list. Leave it empty to show the email.</p>
        <button type="submit" class="ha-btn ha-btn--primary ha-btn--block">Save</button>
      </form>
      <ul class="ha-list pa-person-acts">
        ${email !== me() ? `<li><a class="ha-row ha-row--action" href="${esc(inviteHref(email))}"><span class="ha-row-icon">${icon('mail')}</span><span class="ha-row-body"><span class="ha-row-title">Email an invite</span><span class="ha-row-sub">From your own mail app, with the link</span></span></a></li>` : ''}
        ${canRemove ? `<li><button type="button" class="ha-row ha-row--danger ha-row--center" data-pp="remove"><span class="ha-row-body"><span class="ha-row-title">Stop sharing</span></span></button></li>` : ''}
      </ul>`,
    onClose: afterSheet,
  });
  $('#pa-person', s.el).addEventListener('submit', async e => {
    e.preventDefault();
    const v = PP.cleanName($('#pa-person-name', s.el).value);
    const before = names();
    if ((before[email] || '') !== v) saveNames(PP.keepMembers(PP.setName(before, email, v), h.members));
    await haCloseSheet(s.el);
    redraw();
    haToast(v ? `Saved: ${v}` : 'Name removed; the email shows instead');
  });
  s.el.addEventListener('click', async e => {
    if (!e.target.closest('[data-pp="remove"]')) return;
    const label = nameOf(email);
    if (!(await haConfirm({ title: 'Stop sharing?', text: `${label} won’t see the pantry any more. You can add them again later.`, ok: 'Stop sharing', danger: true }))) return;
    try {
      await setMembers(h.members.filter(x => x !== email));
      if (names()[email]) saveNames(PP.setName(names(), email, ''));
      await haCloseSheet(s.el);
      redraw();
      haToast(`Stopped sharing with ${label}`);
    } catch (err) { haToast(S.cloud.explain(err, 'Removing them')); }
  });
  return s;
}


function viewSettings() {
  const configured = !!S.cloud?.configured;
  const row = (inner, cls = '') => `<li><div class="ha-row${cls}">${inner}</div></li>`;
  const btnRow = (act, title, { cls = ' ha-row--action', iconName = '', sub = '' } = {}) => `<li><button type="button" class="ha-row${cls}" data-act="${act}">${iconName ? `<span class="ha-row-icon">${icon(iconName)}</span>` : ''}<span class="ha-row-body"><span class="ha-row-title">${title}</span>${sub ? `<span class="ha-row-sub">${sub}</span>` : ''}</span></button></li>`;
  let fam, famFoot = '';
  if (S.mode === 'demo') {
    fam = familyList(S.household, { demo: true });
    famFoot = 'A made-up family: tap someone to give them a name. Nothing is saved.';
  } else if (!configured) {
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon ha-row-icon--grey">${icon('box')}</span><span class="ha-row-body"><span class="ha-row-title">On this phone only</span><span class="ha-row-sub">Family sharing isn’t set up yet.</span></span>`)}</ul>`;
    famFoot = 'Sharing with the family needs a one-time setup of the pantry’s Firebase project (SETUP.md).';
  } else if (S.pending) {
    // a new password account, not verified yet: no family data until the emailed link has been tapped
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon">${icon('mail')}</span><span class="ha-row-body"><span class="ha-row-title">Check your email</span><span class="ha-row-sub pa-break">We sent a link to ${esc(S.pending.email)}. Tap it, then come back here.</span></span>`)}
      ${btnRow('verified', 'I’ve verified', { iconName: 'check' })}${btnRow('verify-resend', 'Send it again')}${btnRow('signout', 'Use a different email')}</ul>`;
    famFoot = 'The link proves the email is yours. Look in Junk or Spam if it doesn’t arrive in a minute or two.';
  } else if (!S.user) {
    fam = `<ul class="ha-list">${btnRow('signin', 'Continue with Google', { iconName: 'user' })}</ul>
      <p class="pa-quiet"><button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-act="email-open">Use email instead</button></p>`;
    famFoot = 'Sign in to share one pantry with the family: everyone sees the same items and shopping list. Only the people added can see it.';
  } else if (!S.household && S.lookupFailed) {
    // couldn't ask the server (no signal): not "no pantry", so no Start button
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon">${icon('alert')}</span><span class="ha-row-body"><span class="ha-row-title">Can’t check right now</span><span class="ha-row-sub pa-break">${esc(S.user.email)}</span></span>`)}
      ${btnRow('hh-check', 'Try again', { iconName: 'refresh' })}${btnRow('signout', 'Sign out')}</ul>`;
    famFoot = 'Connect to the internet and try again. Your family pantry is looked up first, so a second one is never started by mistake.';
  } else if (!S.household) {
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon">${icon('user')}</span><span class="ha-row-body"><span class="ha-row-title">Signed in</span><span class="ha-row-sub">${esc(S.user.email)}</span></span>`)}
      ${btnRow('hh-create', 'Start our family pantry')}${btnRow('hh-check', 'Check again')}${btnRow('signout', 'Sign out')}</ul>`;
    famFoot = `Not in a family pantry yet. Start one, or ask whoever started yours to add ${esc(S.user.email)}, then tap Check again.`;
  } else {
    fam = familyList(S.household, { extra: `${S.localCount ? btnRow('copy-up', `Copy ${plural(S.localCount, 'item')} from this phone`, { iconName: 'upload', sub: 'Saved here before you signed in' }) : ''}
      ${btnRow('signout', 'Sign out')}` });
    famFoot = 'They sign in with that email (Google, or an emailed link or password) to see the pantry. Tap someone to give them a name, email them the link again, or stop sharing. Whoever started it can’t be removed.';
  }
  return `<h1 class="ha-large-title">Settings</h1>
    ${mergeCard()}
    ${section('Family sharing', fam, { id: 'family', footer: famFoot })}
    ${section('Where things are kept', `<ul class="ha-list"><li><a class="ha-row" href="#/places"><span class="ha-row-icon">${icon('home')}</span><span class="ha-row-body"><span class="ha-row-title">Places</span><span class="ha-row-sub">${esc(plural(placeNames().length, 'place'))}: ${esc(placeNames().slice(0, 3).join(', '))}${placeNames().length > 3 ? '…' : ''}</span></span>${chevron()}</a></li></ul>`,
      { id: 'places', footer: `Rename, reorder or add your own places.${S.mode === 'cloud' ? ' Shared with the family.' : ''}` })}
    ${section('Reminders', `<div class="ha-chips ha-chips--wrap" role="group" aria-label="Use soon means within">${Object.entries(SOON).map(([v, l]) =>
      `<button type="button" class="ha-chip" aria-pressed="${soonDays() === Number(v)}" data-act="soon" data-v="${v}">${l}</button>`).join('')}</div>`,
      { id: 'remind', footer: 'How far ahead “Use soon” looks, on Home. Kept on this phone.' })}
    ${section('Help', `<ul class="ha-list">
      <li><a class="ha-row" href="#/guide"><span class="ha-row-icon">${icon('info')}</span><span class="ha-row-body"><span class="ha-row-title">How to use the pantry</span></span>${chevron()}</a></li>
      ${btnRow('welcome', 'Show the welcome again', { iconName: 'home' })}
      ${tourOn() ? '' : btnRow('tour-on', 'Show the getting-started list', { iconName: 'list' })}
    </ul>`, { id: 'help' })}
    ${section('You', `<ul class="ha-list"><li><label class="ha-row"><span class="ha-row-body"><span class="ha-row-title">Your name</span></span>
      <input class="ha-input ha-input--inline" id="pa-name" value="${esc(prefs.get('name') || '')}" placeholder="${esc(S.user?.name?.split(' ')[0] || 'For example, Mum')}" autocomplete="off"></label></li></ul>`,
      { id: 'you', footer: 'Shows in each item’s history and on the shopping list. Kept on this phone. In a family pantry, the name the family gives you (Family sharing) comes first.' })}
    ${section('Your data', `<ul class="ha-list">
      ${btnRow('csv', 'Export as CSV', { iconName: 'download', sub: 'A spreadsheet of what’s in stock' })}
      ${btnRow('backup', 'Back up', { iconName: 'download', sub: 'Everything, as a JSON file' })}
      <li><label class="ha-row ha-row--action"><span class="ha-row-icon">${icon('upload')}</span><span class="ha-row-body"><span class="ha-row-title">Restore a backup</span><span class="ha-row-sub">Adds the items in a backup file</span></span><input type="file" accept="application/json,.json" class="pa-file" id="pa-restore"></label></li>
      ${btnRow('sample', 'Add sample items', { iconName: 'box', sub: 'Made-up items to try the app with' })}
      ${S.mode === 'local' ? btnRow('wipe', 'Delete everything on this phone', { cls: ' ha-row--danger' }) : ''}
    </ul>`, { id: 'data' })}
    ${section('On your home screen', `<div class="ha-card pa-install"><p class="ha-card-text"><strong>iPhone:</strong> in Safari, tap Share, then Add to Home Screen.</p><p class="ha-card-text"><strong>Android:</strong> in Chrome, open the menu, then Add to home screen or Install app.</p><p class="ha-card-text">It then opens like an app and works without signal.</p></div>`, { id: 'install' })}
    ${section('About', '', { id: 'about', footer: 'Product suggestions are common Singapore supermarket goods; “keeps once opened” days are a rough guide, so check the label. Barcode look-ups use Open Food Facts, Open Products Facts and Open Beauty Facts. Shop links open FairPrice’s, Sheng Siong’s, Cold Storage’s and Shopee’s own search.' })}
    <div id="pa-version"></div>`;
}

// ---- drawing ----------------------------------------------------------------------------------------------------

const TOP = { home: 'Pantry', items: 'Items', shop: 'Shopping', settings: 'Settings' };
const GUIDE = 'How to use the pantry';
function draw(r, { keep = false } = {}) {
  let [name = 'home', id] = r.parts;
  const main = $('#main');
  const task = name === 'add' || name === 'edit';
  if (!task) { S.draft = null; S.dirty = false; }
  let it = null;
  if (name === 'item' || name === 'edit') {
    it = S.items.get(id);
    if (!it) {
      // deleted (here or by the family): go back to where it was opened from, after this draw has finished
      main.innerHTML = '';
      setTimeout(() => { if (route().parts[1] === id) haGo(S.originTab, { replace: true, nav: 'pop' }); });
      return;
    }
  }
  if (!['home', 'items', 'item', 'add', 'edit', 'shop', 'settings', 'guide', 'places'].includes(name)) name = 'home';
  if (TOP[name]) { S.originTab = name === 'home' ? '#/' : '#/' + name; S.backLabel = TOP[name]; }

  document.body.classList.toggle('ha-has-tabbar', !task);
  document.body.classList.toggle('ha-has-toolbar', task);
  $('.ha-tabbar').hidden = task;
  $('#pa-toolbar').hidden = !task;

  let title = TOP[name] || '';
  if (name === 'home') { main.innerHTML = viewHome(); setBar({ title, trail: iconBtn('mic', 'Say or type what you bought', 'quick') + iconBtn('barcode', 'Scan a barcode', 'scan-home') }); }
  else if (name === 'items') { main.innerHTML = viewItems(); setBar({ title }); }
  else if (name === 'item') {
    title = it.name;
    main.innerHTML = viewItem(it);
    setBar({ title, lead: backBtn(S.backLabel), trail: textBtn('Edit', 'edit') });
  } else if (name === 'add' || name === 'edit') {
    title = name === 'add' ? 'Add an item' : 'Edit item';
    main.innerHTML = viewForm(name === 'edit' ? id : null);
    setBar({ title, lead: textBtn('Cancel', 'back') });
    $('#pa-save').textContent = name === 'add' ? 'Add to pantry' : 'Save';
    wireForm();
  } else if (name === 'shop') { flag('shopped'); main.innerHTML = viewShop(); setBar({ title, trail: iconBtn('share', 'Share the list', 'share') }); }
  else if (name === 'places') { title = 'Places'; main.innerHTML = viewPlaces(); setBar({ title, lead: backBtn(S.backLabel) }); }
  else if (name === 'guide') { title = GUIDE; main.innerHTML = viewGuide(); setBar({ title: 'How to use it', lead: backBtn(S.backLabel) }); }
  else if (name === 'settings') {
    main.innerHTML = viewSettings(); setBar({ title });
    haVersion($('#pa-version'), 'pantry');
  }
  document.title = name === 'home' ? 'Pantry' : `${title} · Pantry`;
  drawBadge();
  S.pendingRender = false;
  if (keep) haLargeTitle();
}
// Draw the current screen again after a data change, keeping the scroll position. Not while a form is being filled
// in or a sheet is open: then it waits (a family member's change must never wipe what someone is typing).
function redraw() {
  if (!R) return;
  if (haSheetOpen() || ['add', 'edit'].includes(screen())) { S.pendingRender = true; drawBadge(); return; }
  // someone is typing (a family member's email, a shopping line): draw once they leave the field
  const a = document.activeElement;
  if (a?.matches?.('#main input:not([type=checkbox]):not([type=radio]):not([type=search]), #main textarea') && a.value) {
    S.pendingRender = true;
    a.addEventListener('blur', () => { if (S.pendingRender) setTimeout(redraw); }, { once: true });
    return;
  }
  const y = scrollY, focus = document.activeElement?.id;
  draw(route(), { keep: true });
  scrollTo(0, y);
  if (focus && $('#' + focus)) $('#' + focus).focus({ preventScroll: true });
}
function drawBadge() {
  const left = [...S.shop.values()].filter(m => !m.done).length + shopLists().suggested.length;
  const b = $('#pa-shop-badge');
  b.textContent = left > 99 ? '99+' : left; b.hidden = !left;
  $('#pa-shop-sr').textContent = left ? `, ${left} to buy` : '';
}

// ---- clicks and forms ---------------------------------------------------------------------------------------------

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.getAttribute('aria-disabled') === 'true') return;
  const act = b.dataset.act;
  const it = screen() === 'item' ? S.items.get(route().parts[1]) : (b.dataset.id && S.items.get(b.dataset.id));
  switch (act) {
    case 'back': return haBack(screen() === 'edit' ? '#/item/' + route().parts[1] : S.originTab);
    case 'welcome': return showWelcome({ save: S.mode !== 'demo' });
    case 'go-add': return haGo('#/add');
    case 'scan-home': haGo('#/add'); return openScan();
    case 'scan': return openScan();
    case 'edit': return haGo('#/edit/' + it.id);
    case 'use': return apply(L.takeOut(it, { type: 'use', by: who(), batchId: b.dataset.b || null }), `Used 1 ${it.name}`);
    case 'toss': {
      const res = L.takeOut(it, { type: 'discard', by: who(), batchId: b.dataset.b || null });
      return apply(res, res.event?.type === 'expired' ? `Binned 1 ${it.name} (expired)` : `Binned 1 ${it.name}`);
    }
    case 'quick': return openQuick();
    case 'start': return openStarter();
    case 'tour-show': return showMe(b.dataset.task);
    case 'tour-hide': { prefs.set('tour', 'off'); redraw(); return haToast('Hidden. Settings → Help can show it again.'); }
    case 'tour-on': { prefs.set('tour', 'on'); haGo('#/'); return haToast('The getting-started list is on Home'); }
    case 'soon': { prefs.set('soonDays', Number(b.dataset.v)); redraw(); return haToast(`Use soon: within ${SOON[b.dataset.v]}`); }
    case 'open': return apply(L.openOne(it, { by: who(), batchId: b.dataset.b || null }), `Opened 1 ${it.name}`);
    case 'freeze': {
      const place = P.placeOfKind(placeNames(), 'freezer');
      const res = L.freezeBatch(it, { batchId: b.dataset.b, days: freezeDays(it), place, by: who() });
      const d = res.item.batches.find(x => x.id === b.dataset.b)?.expiry;
      return apply(res, `Frozen: moved to ${place}, keeps till ${fmt(d)}`);
    }
    case 'thaw': {
      const place = P.placeOfKind(placeNames(), 'fridge');
      return apply(L.thawBatch(it, { batchId: b.dataset.b, days: THAW_DAYS, place, by: who() }), `Thawed: moved to ${place}, use within ${plural(THAW_DAYS, 'day')}`);
    }
    case 'leftovers': return openLeftovers();
    case 'scan-many': return openScanMany();
    case 'since-ok': { looked(); redraw(); return haAnnounce('Cleared'); }
    case 'bought': return openBought(it);
    case 'to-list': return addToList(it);
    case 'delete': {
      const evs = eventsFor(it.id);
      const photo = await photoOf(it);   // kept for Undo (already fetched when the item opened)
      remove('items', it.id);
      for (const ev of evs) remove('events', ev.id);
      if (it.hasPhoto) delPhoto(it.id);
      haBack(S.originTab);
      haToast(`${it.name} deleted`, { action: 'Undo', onAction: () => {
        if (photo) savePhoto(it.id, it.thumb || '', photo);
        save('items', it); for (const ev of evs) save('events', ev); redraw();
      } });
      return;
    }
    case 'place': {
      S.place = b.dataset.v;
      for (const c of document.querySelectorAll('[data-act="place"]')) c.setAttribute('aria-pressed', String(c === b));
      return drawItemsList();
    }
    case 'place-open': return openPlace(b.dataset.v);
    case 'q-clear': { S.q = ''; const q = $('#pa-q'); q.value = ''; drawItemsList(); return q.focus(); }
    case 'find-clear': { const f = $('#pa-find'); f.value = ''; showSugg(); return f.focus(); }
    case 'sample': {
      const data = sampleData(who() || 'Sample');
      for (const k of ['items', 'events']) for (const o of data[k]) save(k, o);
      redraw();
      return haToast(`Added ${data.items.length} sample items`);
    }
    case 'date': {
      const box = b.closest('.pa-dates'), input = b.closest('form').querySelector(`[name="${box.dataset.for}"]`);
      input.value = b.dataset.v;
      if (S.draft && input.closest('#pa-form')) { S.draft[input.name] = input.value; S.dirty = true; }
      for (const c of box.querySelectorAll('.ha-chip')) c.setAttribute('aria-pressed', String(c === b));
      return;
    }
    case 'sugg': {
      const c = CATALOGUE[Number(b.dataset.i)];
      $('#pa-find').value = '';
      fillDraft(withGuess({ name: c.name, brand: c.brand, size: c.size, category: c.category, location: c.location, openDays: c.openDays ?? '' }));
      $('#h-f-details')?.scrollIntoView({ block: 'start' });
      haAnnounce(`${c.name} filled in`);
      return;
    }
    case 'sugg-own': {
      const v = $('#pa-find').value.trim();
      $('#pa-find').value = '';
      fillDraft({ name: v });
      const n = $('#pa-form [name="name"]'); n.focus(); return;
    }
    case 'sugg-mine': {
      const mine = S.items.get(b.dataset.id);
      S.draft = null; S.dirty = false;
      haGo('#/item/' + mine.id, { replace: true });
      return openBought(mine);
    }
    case 'photo-del': return fillDraft({ pic: '', _pics: null });
    case 'shop-del': {
      e.preventDefault();
      const m = S.shop.get(b.dataset.id);
      remove('shop', m.id); redraw();
      return haToast(`${m.name} removed`, { action: 'Undo', onAction: () => { save('shop', m); redraw(); } });
    }
    case 'shop-mic': return listenShop(b);
    case 'put-away': return openPutAway();
    case 'shop-clear': {
      const gone = [...S.shop.values()].filter(m => m.done);
      for (const m of gone) remove('shop', m.id);
      redraw();
      return haToast(`Cleared ${plural(gone.length, 'ticked item')}`, { action: 'Undo', onAction: () => { for (const m of gone) save('shop', m); redraw(); } });
    }
    case 'share': {
      const text = L.shareText(shareLines());
      if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelled */ } return; }
      try { await navigator.clipboard.writeText(text); haToast('Copied the list. Paste it into a message.'); } catch { haToast('Couldn’t copy the list on this phone'); }
      return;
    }
    case 'csv': return download('pantry.csv', L.toCsv(items()), 'text/csv');
    case 'backup': {
      let photos;
      try { photos = await S.backend.list(PHOTOS); } catch (err) { return haToast(S.cloud ? S.cloud.explain(err, 'The backup') : 'The backup didn’t work. Try again.'); }
      return download(`pantry-backup-${today()}.json`, JSON.stringify(L.backup({ items: [...S.items.values()], events: [...S.events.values()], shop: [...S.shop.values()], settings: [...S.settings.values()], photos })), 'application/json');
    }
    case 'wipe': {
      if (!(await haConfirm({ title: 'Delete everything?', text: 'Every item, its history and the shopping list on this phone are deleted. This can’t be undone. A backup first keeps a copy.', ok: 'Delete everything', danger: true }))) return;
      await S.local.clear();
      for (const k of KINDS) S[k].clear();
      S.pics.clear();
      redraw(); return haToast('Deleted everything on this phone');
    }
    case 'signin':
      try { await S.cloud.signIn(); } catch (err) { haToast(S.cloud.explain(err, 'Sign-in')); }
      return;
    case 'email-open': return openEmailSheet();
    case 'merge-open': return openMerge();
    case 'verified': return checkVerified();
    case 'verify-resend':
      try { await S.cloud.resendVerification(); haToast('Sent again. Check your email.'); } catch (err) { haToast(S.cloud.explain(err, 'Sending it')); }
      return;
    case 'signout': {
      haToast('Checking everything reached the family…');
      const ok = await S.cloud.synced(4000);
      haHideToast();
      if (!ok && !(await haConfirm({ title: 'Sign out now?', text: 'Some changes on this phone haven’t reached the family yet (no signal?). Signing out now loses them. Wait for signal, then sign out.', ok: 'Sign out anyway', cancel: 'Wait', danger: true }))) return;
      try { await S.cloud.signOut(); haToast('Signed out. This phone is back to its own pantry.'); } catch (err) { haToast(S.cloud.explain(err, 'Signing out')); }
      return;
    }
    case 'hh-create': {
      if (S.creating) return;   // a double tap, or a second try while the first is still going
      S.creating = true;
      try {
        // never a second pantry for someone already in one: ask the server right now (offline this throws, and nothing
        // is created: the create itself also needs the server)
        const had = await locate(S.user.email);
        if (had) { S.lookupFailed = false; await useHousehold(had); return haToast('You’re already in a family pantry; it’s open now.'); }
        await useHousehold(await S.cloud.createHousehold(S.user.email, 'Our pantry'));
        haToast('Family pantry started. Add the family below.');
      } catch (err) { haToast(S.cloud.explain(err, 'Starting the family pantry')); }
      finally { S.creating = false; }
      return;
    }
    case 'hh-check': {
      try {
        const h = await locate(S.user.email);
        S.lookupFailed = false;
        if (!h) { redraw(); return haToast('Not added yet. Ask whoever started it to add you.'); }
        await useHousehold(h);
      } catch (err) { S.lookupFailed = true; redraw(); haToast(S.cloud.explain(err, 'Checking')); }
      return;
    }
    case 'person': return openPerson(b.dataset.v);
    case 'copy-up': {
      try {
        const data = await splitAll({ ...(await S.local.load()), photos: await S.local.list(PHOTOS) });
        data.settings = mergedPlaces(data.settings);   // the family's places first, then any only this phone had
        await S.backend.putMany(PHOTOS, data.photos);   // photos first, so no item points at a missing photo
        for (const k of KINDS) await S.backend.putMany(k, data[k]);
        for (const k of KINDS) for (const o of data[k]) S[k].set(o.id, o);
        await S.local.clear();
        S.localCount = 0; redraw();
        haToast(`Copied ${plural(data.items.length, 'item')} into the family pantry`);
      } catch (err) { haToast(S.cloud.explain(err, 'Copying')); }
      return;
    }
  }
}

// Places from a backup or this phone, added after the pantry's own: [] when there is nothing new to save.
function mergedPlaces(settings = []) {
  const doc = settings.find(P.isPlacesDoc);
  if (!doc) return [];
  const mine = placeNames(), merged = P.mergePlaces(S.settings.has(P.PLACES_ID) ? mine : [], doc.list);
  return merged.join('\n') === mine.join('\n') && S.settings.has(P.PLACES_ID) ? [] : [P.placesDoc(merged)];
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function onChange(e) {
  const t = e.target;
  if (t.name === 'pa-level') {
    const it = S.items.get(route().parts[1]); if (!it) return;
    const before = it, res = L.setLevel(it, { level: t.value, by: who() });
    save('items', res.item); const ev = save('events', res.event);
    const line = t.value !== 'plenty' ? addToList(res.item, { quiet: true }) : null;
    redraw();
    haToast(`${it.name}: ${LEVEL_WORD[t.value].toLowerCase()}${line ? ', on the shopping list' : ''}`, { action: 'Undo', onAction: () => {
      save('items', before); remove('events', ev.id); if (line) remove('shop', line.id); redraw(); haAnnounce('Undone');
    } });
    return;
  }
  if (t.name === 'pa-sort') { S.sort = t.value; prefs.set('sort', t.value); return drawItemsList(); }
  if (t.id === 'pa-name') { prefs.set('name', t.value.trim()); return haToast('Saved'); }
  if (t.dataset.shop) {
    const m = S.shop.get(t.dataset.shop); if (!m) return;
    save('shop', { ...m, done: t.checked, ...(t.checked ? { doneBy: who() } : {}) });
    return redraw();
  }
  if (t.id === 'pa-photo-file' && t.files[0]) {
    const { pictures } = await import('./photo.js');
    try { const p = await pictures(t.files[0]); fillDraft({ pic: p.thumb, _pics: p }); } catch { haToast('Couldn’t read that picture. Try another.'); }
    return;
  }
  if (t.id === 'pa-restore' && t.files[0]) {
    try {
      const data = L.parseBackup(await t.files[0].text());
      data.settings = mergedPlaces(data.settings);
      S.pics.clear();
      if (S.backend.putMany) {
        await splitAll(data);   // the family pantry takes only thumbnails on items
        await S.backend.putMany(PHOTOS, data.photos);
        for (const k of KINDS) await S.backend.putMany(k, data[k]);
      } else for (const p of data.photos) S.backend.put(PHOTOS, p);
      for (const k of KINDS) for (const o of data[k]) { if (S.backend.putMany) S[k].set(o.id, o); else save(k, o); }
      redraw(); haToast(`Restored ${plural(data.items.length, 'item')}`);
      migratePhotos();
    } catch (err) { haToast(err?.message?.startsWith('That file') ? err.message : 'Couldn’t restore that file.'); }
    t.value = '';
  }
}
function onInput(e) {
  if (e.target.id === 'pa-q') { S.q = e.target.value; drawItemsList(); }
  if (e.target.id === 'pa-find') showSugg();
}
async function onSubmit(e) {
  if (e.target.id === 'pa-place-add') { e.preventDefault(); return addPlaceFromForm(); }
  if (e.target.id === 'pa-shop-add') {
    e.preventDefault();
    const inp = $('#pa-shop-text'), v = inp.value.trim();
    if (!v) return inp.focus();
    if (!addLine(v)) { haToast(`${v} is already on the list`); return; }
    inp.value = '';
    redraw();
    $('#pa-shop-text')?.focus();
    return;
  }
  if (e.target.id === 'pa-member-add') {
    e.preventDefault();
    const v = $('#pa-member-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return haToast('Type their email address');
    if (S.household.members.includes(v)) return haToast(`${nameOf(v)} is already in the family pantry`);
    try {
      await setMembers([...S.household.members, v]);
      $('#pa-member-email').value = '';
      haToast(`Added ${v}`, { action: 'Email invite', onAction: () => { location.href = inviteHref(v); }, ms: 10000 });
    } catch (err) { haToast(S.cloud ? S.cloud.explain(err, 'Adding them') : 'Adding them didn’t work.'); }
  }
}

// An invite from the person's own mail app (no email server: the pantry never sends mail itself).
function inviteHref(email) {
  const from = who() || S.user?.name?.split(' ')[0] || '';
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '#/settings';   // lands on Sign in
  const body = `Hi! I've added you to our family pantry, so we can all see what's at home, what to use first and what to buy.\n\n`
    + `1. Open ${link}\n2. Settings → Continue with Google (or Use email instead), using this email address (${email})\n3. Add it to your home screen: Safari's Share button → Add to Home Screen (iPhone), or Chrome's menu → Add to home screen (Android)`
    + (from ? `\n\n${from}` : '');
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Our family pantry')}&body=${encodeURIComponent(body)}`;
}

// ---- data sources ------------------------------------------------------------------------------------------------

function loadInto(data) {
  for (const k of KINDS) { S[k].clear(); for (const o of data[k] || []) S[k].set(o.id, o); }
}
function onRemote(kind, docs, removed) {
  for (const d of docs) S[kind].set(d.id, d);
  for (const id of removed) S[kind].delete(id);
  redraw();
  if (kind === 'items' && docs.some(d => d.photo)) migratePhotos();
}
let unwatch = null;
async function useHousehold(h) {
  S.household = h;
  prefs.set('household', h.id);
  S.backend?.close?.();
  S.backend = await S.cloud.openCloud(h.id, err => { S.syncError = S.cloud.explain(err, 'Saving'); redraw(); });
  S.mode = 'cloud';
  S.pics.clear();
  loadInto(await S.backend.load());
  migratePhotos();
  S.backend.listen(onRemote);
  unwatch?.();
  unwatch = await S.cloud.watchHousehold(h.id, x => { if (x) { S.household = x; redraw(); } });
  S.localCount = (await S.local.load()).items.length;
  redraw();
}
async function useLocal() {
  S.backend?.close?.();
  unwatch?.(); unwatch = null;
  S.backend = S.local;
  S.mode = 'local';
  S.household = null; S.pantries = []; S.lookupFailed = false; S.syncError = false;
  S.pics.clear();
  loadInto(await S.local.load());
  migratePhotos();
  redraw();
}

// ---- two family pantries for one account: merge them into one ---------------------------------------------------------

// The Settings card, only when this account is in more than one family pantry (a second "Start our family pantry"
// made a duplicate). Only an owner can delete a pantry, so someone else is asked to do it.
function mergeCard() {
  if (S.mode !== 'cloud' || S.pantries.length < 2) return '';
  const p = MG.plan(S.pantries, S.household?.id, me());
  const notMine = [...new Set(p.notMine.map(h => nameOf(h.owner)))];
  const body = p.notMine.length && !S.pantries.some(h => h.owner === me())
    ? `<li><div class="ha-row"><span class="ha-row-icon">${icon('alert')}</span><span class="ha-row-body"><span class="ha-row-title">You’re in more than one family pantry</span><span class="ha-row-sub pa-break">Ask ${esc(notMine.join(' or '))} to merge them.</span></span></div></li>`
    : `<li><button type="button" class="ha-row ha-row--action" data-act="merge-open"><span class="ha-row-icon">${icon('alert')}</span><span class="ha-row-body"><span class="ha-row-title">You’re in more than one family pantry</span><span class="ha-row-sub">Merge them into one</span></span>${chevron()}</button></li>`;
  return section('Two family pantries', `<ul class="ha-list">${body}</ul>`, { id: 'merge', footer: 'The same email is in more than one family pantry, so you may see a different one on another phone. Merging moves everything into one.' });
}
// The merge sheet: each pantry (name, who started it, how many people), the one with the most people chosen to keep.
async function openMerge() {
  let all;
  try { all = await S.cloud.findHouseholds(me()); } catch (err) { return haToast(S.cloud.explain(err, 'Looking')); }
  S.pantries = all;
  if (all.length < 2) { redraw(); return haToast('There’s only one family pantry now.'); }
  let keep = S.cloud.pickHousehold(all, '').id;
  const s = haSheet({ title: 'Merge family pantries', closeLabel: 'Cancel', grey: true, body: '', onClose: afterSheet });
  const body = $('.ha-sheet-body', s.el);
  const draw = () => {
    const p = MG.plan(all, keep, me());
    const rows = all.map(h => `<li><label class="ha-row pa-pick"><span class="ha-row-body"><span class="ha-row-title pa-break">${esc(h.name || 'Our pantry')}</span>
      <span class="ha-row-sub pa-break">${esc(plural((h.members || []).length, 'person', 'people'))} · started by ${esc(nameOf(h.owner))}</span></span>
      <input type="radio" name="pa-keep" value="${esc(h.id)}"${h.id === keep ? ' checked' : ''} aria-label="Keep ${esc(h.name || 'Our pantry')}, ${esc(plural((h.members || []).length, 'person', 'people'))}"></label></li>`).join('');
    const why = p.over ? `Together they have ${p.total} people and a family pantry holds ${MG.MAX_MEMBERS}. Remove some people first, then merge.`
      : p.notMine.length ? `Only whoever started a pantry can merge it away. Ask ${[...new Set(p.notMine.map(h => nameOf(h.owner)))].join(' or ')} to merge them.` : '';
    body.innerHTML = `<p class="pa-em-lead">Choose the one to keep. Everything in the others (items, history, shopping lists, photos, places, names and people) moves into it, then the others are deleted.</p>
      <ul class="ha-list" role="radiogroup" aria-label="Pantry to keep">${rows}</ul>
      ${why ? `<p class="ha-field-error" role="alert">${icon('alert')}<span>${esc(why)}</span></p>` : ''}
      <p class="ha-section-footer" id="pa-merge-msg" role="status"></p>
      <button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-pm="go"${p.canMerge ? '' : ' disabled'}>Merge into this one</button>`;
  };
  draw();
  let busy = false;
  s.el.addEventListener('change', e => { if (e.target.name === 'pa-keep' && !busy) { keep = e.target.value; draw(); } });
  s.el.addEventListener('click', async e => {
    if (!e.target.closest('[data-pm="go"]') || busy) return;
    const p = MG.plan(all, keep, me());
    if (!p.canMerge) return;
    if (!(await haConfirm({ title: 'Merge and delete the others?', text: `${plural(p.others.length, 'other pantry', 'other pantries')} will be deleted after everything is copied into ${p.keep.name || 'Our pantry'}. This can’t be undone.`, ok: 'Merge', danger: true }))) return;
    busy = true;
    const say = t => { const m = $('#pa-merge-msg', s.el); if (m) m.textContent = t; };
    body.querySelectorAll('button, input').forEach(b => { b.disabled = true; });
    try {
      say('Copying…');
      for (const o of p.others) await S.cloud.copyHousehold(p.keep.id, o.id, p.members);   // any failure stops here: nothing deleted
      if (p.members.length !== (p.keep.members || []).length) await S.cloud.addMembers(p.keep.id, p.members);
      if (S.household?.id !== p.keep.id) await useHousehold({ ...p.keep, members: p.members });   // leave the ones about to go
      say('Removing the extra pantries…');
      for (const o of p.others) await S.cloud.removeHousehold(o.id);
      S.pantries = [{ ...p.keep, members: p.members }];
      await haCloseSheet(s.el);
      redraw();
      haToast(`Merged. One family pantry now, with ${plural(p.members.length, 'person', 'people')}.`);
    } catch (err) {
      busy = false;
      say(`${S.cloud.explain(err, 'Merging')} Nothing was lost; the pantries are as they were, so you can try again.`);
      body.querySelectorAll('button, input').forEach(b => { b.disabled = false; });
    }
  });
  return s;
}

// ---- signing in by email (besides Google): an emailed link, or a password ----------------------------------------------

// Every change of who is signed in comes here. A new password account is `pending` until the emailed link has been
// tapped: no family lookup, no family data, nothing from Firestore (its rules need a verified email).
async function handleUser(u) {
  S.pending = u && !u.verified ? u : null;
  S.user = u && u.verified ? u : null;
  if (!S.user) { if (S.mode !== 'local') await useLocal(); else redraw(); return; }
  let h = null;
  S.lookupFailed = false;
  try { h = await locate(S.user.email); } catch (e) { console.warn('household', e?.code); S.lookupFailed = true; }   // can't tell (no signal): never "none"
  if (h) await useHousehold(h); else redraw();
}
// Which family pantry this account opens: the one this phone used last, else the biggest. Every one it is in is kept in
// S.pantries (two means a duplicate to merge: Settings offers it).
async function locate(email) {
  const all = await S.cloud.findHouseholds(email);
  S.pantries = all;
  return S.cloud.pickHousehold(all, prefs.get('household') || '');
}
// "I've verified": reload the account and its token, then carry on as signed in (or say it isn't done yet).
async function checkVerified({ quiet = false } = {}) {
  try {
    const u = await S.cloud.refreshUser();
    if (!u) { if (!quiet) haToast('Sign in again, please.'); return; }
    if (!u.verified) { if (!quiet) haToast('Not yet. Tap the link in the email first, then try again.'); return; }
    await handleUser(u);
    haToast('Verified. You’re signed in.');
  } catch (err) { if (!quiet) haToast(S.cloud.explain(err, 'Checking')); }
}
// The one sheet for email: the address, then "Email me a sign-in link" or "Use a password" (Sign in, Create account,
// Forgot password). `confirm` is for an emailed link opened where the address wasn't saved: just ask for it.
function openEmailSheet({ confirm = false, onSubmit = null } = {}) {
  const C = S.cloud;
  let step = confirm ? 'confirm' : 'email', mail = C.savedEmail(), err = '', busy = false;
  const s = haSheet({ title: confirm ? 'Finish signing in' : 'Sign in with email', closeLabel: 'Cancel', grey: true, body: '', onClose: afterSheet });
  const body = $('.ha-sheet-body', s.el);
  const emailField = (hint = '') => `<label class="ha-field"><span class="ha-field-label">Email</span>
      <input class="ha-input" id="pa-em-email" name="email" type="email" value="${esc(mail)}" autocomplete="email" autocapitalize="off" spellcheck="false" inputmode="email" placeholder="you@example.com"${hint ? ' aria-describedby="pa-em-hint"' : ''}></label>${hint ? `<p class="ha-section-footer pa-em-hint" id="pa-em-hint">${hint}</p>` : ''}`;
  const errBox = () => `<p class="ha-field-error" id="pa-em-err" role="alert"${err ? '' : ' hidden'}>${icon('alert')}<span>${esc(err)}</span></p>`;
  const views = {
    email: () => `<form id="pa-em-form" novalidate>${emailField('Use the email the family added. No password needed: we email you a link that signs you in.')}${errBox()}
        <button type="submit" class="ha-btn ha-btn--primary ha-btn--block" data-pe="link">Email me a sign-in link</button>
        <button type="button" class="ha-btn ha-btn--block pa-em-second" data-pe="pw">Use a password</button></form>`,
    password: () => `<form id="pa-em-form" novalidate>${emailField()}
        <label class="ha-field"><span class="ha-field-label">Password</span>
          <input class="ha-input" id="pa-em-pass" name="password" type="password" autocomplete="current-password" minlength="${C.MIN_PASSWORD}" aria-describedby="pa-em-phint"></label>
        <p class="ha-section-footer pa-em-hint" id="pa-em-phint">New here? Choose at least ${C.MIN_PASSWORD} characters, then tap Create account. We email a link to check the address.</p>${errBox()}
        <button type="submit" class="ha-btn ha-btn--primary ha-btn--block" data-pe="signin">Sign in</button>
        <button type="button" class="ha-btn ha-btn--block pa-em-second" data-pe="create">Create account</button>
        <div class="pa-em-links"><button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-pe="forgot">Forgot password?</button>
          <button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-pe="back">Email me a link instead</button></div></form>`,
    sent: () => `<div class="pa-em-note"><span class="ha-row-icon">${icon('mail')}</span><div><p class="pa-em-title">Check your email</p>
        <p>We sent a sign-in link to <strong class="pa-break">${esc(mail)}</strong>. Tap it on this phone and you’re in.</p>
        <p>On an iPhone the link may open in Safari instead of the home-screen app. That’s fine: you’ll be signed in there. In the home-screen app, use a password instead, or ask for the link from inside the home-screen app.</p></div></div>${errBox()}
      <button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-pe="link">Send it again</button>
      <button type="button" class="ha-btn ha-btn--block pa-em-second" data-pe="pw">Use a password instead</button>`,
    reset: () => `<div class="pa-em-note"><span class="ha-row-icon">${icon('mail')}</span><div><p class="pa-em-title">Check your email</p>
        <p>We sent a link to <strong class="pa-break">${esc(mail)}</strong>. Open it, choose a new password, then come back and sign in.</p></div></div>
      <button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-pe="pw">Back to sign in</button>`,
    confirm: () => `<form id="pa-em-form" novalidate><p class="pa-em-lead">You opened a sign-in link. Type the email it was sent to, to finish.</p>${emailField()}${errBox()}
        <button type="submit" class="ha-btn ha-btn--primary ha-btn--block" data-pe="finish">Sign in</button></form>`,
  };
  const draw = (focus = true) => {
    body.innerHTML = views[step]();
    if (focus) requestAnimationFrame(() => (step === 'password' && mail ? $('#pa-em-pass', body) : $('#pa-em-email', body))?.focus({ preventScroll: true }));
  };
  const fail = e => { err = step === 'confirm' && e?.code === 'auth/invalid-email' && C.goodEmail(mail) ? 'That isn’t the email the link was sent to. Check it and try again.' : C.explain(e, 'That'); const box = $('#pa-em-err', body); if (box) { box.hidden = false; box.lastElementChild.textContent = err; } };
  const run = async fn => {
    if (busy) return; busy = true; err = '';
    const box = $('#pa-em-err', body); if (box) box.hidden = true;
    body.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try { await fn(); } catch (e) { fail(e); }
    busy = false;
    body.querySelectorAll('button').forEach(b => { b.disabled = false; });
  };
  const read = () => { const i = $('#pa-em-email', body); if (i) mail = i.value.trim(); return mail; };
  const act = {
    link: () => run(async () => { mail = (read() || mail).toLowerCase(); await C.sendLink(mail); step = 'sent'; draw(); }),
    pw: () => { read(); step = 'password'; err = ''; draw(); },
    back: () => { read(); step = 'email'; err = ''; draw(); },
    signin: () => run(async () => { await C.passwordSignIn(read(), $('#pa-em-pass', body).value); await haCloseSheet(s.el); }),
    create: () => run(async () => {
      await C.passwordCreate(read(), $('#pa-em-pass', body).value);
      await haCloseSheet(s.el);
      haToast('Check your email and tap the link, then come back.');
    }),
    forgot: () => run(async () => { await C.resetPassword(read()); step = 'reset'; draw(); }),
    finish: () => run(async () => { if (await onSubmit(read())) await haCloseSheet(s.el); }),
  };
  s.el.addEventListener('click', e => { const b = e.target.closest('[data-pe]'); if (b && b.type !== 'submit') act[b.dataset.pe]?.(); });
  s.el.addEventListener('submit', e => {
    e.preventDefault();
    const b = e.submitter?.dataset.pe || (step === 'password' ? 'signin' : step === 'confirm' ? 'finish' : 'link');
    act[b]?.();
  });
  draw();
  return s;
}
// A link from the sign-in email opened this page: finish with the saved address, or ask for it (the link was opened in
// another browser, such as Safari instead of the home-screen app). The link's query comes off the address afterwards.
async function finishEmailLink() {
  const C = S.cloud;
  let isLink = false;
  try { isLink = await C.isEmailLink(); } catch { return; }
  if (!isLink) return;
  const href = location.href;
  let used = false;
  const tidy = () => { used = true; history.replaceState(history.state, '', C.stripLinkParams(href)); };
  const attempt = async email => {
    try { await C.finishLink(email, href); tidy(); haToast('Signed in.'); return true; }
    catch (err) {
      if (err?.code === 'auth/invalid-email') throw err;   // wrong address: let them retype it
      tidy(); haToast(C.explain(err, 'Signing in')); return true;
    }
  };
  const saved = C.savedEmail();
  if (saved) { try { if (await attempt(saved)) return; } catch { /* the saved address was wrong: ask */ } }
  // closing the sheet steps back in history, so the address is tidied again once it has gone
  openEmailSheet({ confirm: true, onSubmit: attempt }).closed.then(() => { if (used) tidy(); });
}

// ---- updates: a new version takes over only when nobody is in the middle of something ----------------------------

const idle = () => !haSheetOpen() && !['add', 'edit'].includes(screen()) && !S.dirty
  && !(document.activeElement?.matches?.('input, textarea, select') && document.activeElement.value);
let waiting = null, reloading = false;
function offerUpdate(w) {
  waiting = w;
  if (idle()) { w.postMessage('take-over'); return; }
  haToast('Update ready', { action: 'Restart', ms: 10000, onAction: () => waiting?.postMessage('take-over') });
}
function watchUpdates(reg) {
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  // the app went to the background: a good moment to take the update quietly
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && waiting && idle()) waiting.postMessage('take-over'); });
}

// ---- start ----------------------------------------------------------------------------------------------------

let R = null;
async function start() {
  if (DEMO) {
    S.local = S.backend = openMemory({ ...sampleData(demoBy), settings: [PP.peopleDoc(DEMO_NAMES)] });
    S.household = { ...DEMO_FAMILY };
  } else {
    try { S.local = await openLocal(); }
    catch { S.local = openMemory(); haToast('This browser can’t save here (private mode?). Changes last until you close it.'); }
    S.backend = S.local;
  }
  loadInto(await S.backend.load());
  // Since you last looked: from this phone's last visit (the demo pretends four days ago); then this visit counts
  if (DEMO) S.since = new Date(Date.now() - 4 * 86400000).toISOString();
  else { S.since = prefs.get('lastSeen'); prefs.set('lastSeen', new Date().toISOString()); }
  document.addEventListener('visibilitychange', () => {
    if (DEMO) return;
    if (document.visibilityState === 'hidden') prefs.set('lastSeen', new Date().toISOString());
    else { S.since = prefs.get('lastSeen'); prefs.set('lastSeen', new Date().toISOString()); redraw(); }
  });
  setTimeout(migratePhotos, 1000);   // old-style photos move out quietly, after the first screen is drawn
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  addEventListener('online', () => { if (S.user && !S.household && S.lookupFailed && S.cloud) handleUser(S.user); else redraw(); });
  addEventListener('offline', redraw);
  R = haRouter({
    render: r => draw(r),
    tabOf: r => ['item', 'edit', 'add', 'guide', 'places'].includes(r.parts[0]) ? S.originTab : r.hash,
  });
  // family sharing, only when a Firebase project is set up (config.js) or in the emulator tests
  if (!DEMO && (firebaseConfig || EMULATOR)) {
    try {
      S.cloud = await import('./cloud.js');
      if (S.cloud.configured) {
        if (EMULATOR) window.__pantry = { S, signIn: S.cloud.emulatorSignIn };
        S.cloud.onUser(handleUser).catch(() => { /* no signal on the very first open: stays on this phone's pantry */ });
        finishEmailLink();
        // someone verified their email in the mail app and came back: carry on without asking
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.pending) checkVerified({ quiet: true }); });
      }
    } catch { /* sharing unavailable (no signal on the first open) */ }
    redraw();
  }
  if ('serviceWorker' in navigator && !EMULATOR) {
    navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => { /* no offline copy (private window) */ });
  }
  window.__pantry = { ...(window.__pantry || {}), S };
  setTimeout(maybeWelcome, 300);
}

// ---- the welcome, once per phone (guide.js) -------------------------------------------------------------------------

// Someone opening an invite: the email's link ends #/settings, where Sign in is.
const INVITED = /^#\/settings/.test(location.hash);
function maybeWelcome() {
  if (!WELCOME) {
    if (DEMO || EMULATOR || welcomed()) return;
    // already using the app on this phone (from before the welcome existed): never interrupt them
    if (S.items.size || prefs.get('household') || prefs.get('name')) { markWelcomed(); return; }
  }
  if (haSheetOpen() || ['add', 'edit'].includes(screen())) return;
  // a first-time user: the Getting started checklist goes on Home too (never for anyone already using the app)
  if (!DEMO && prefs.get('tour') == null) { prefs.set('tour', 'on'); redraw(); }
  showWelcome({ invited: INVITED && !S.user, save: !DEMO });
}
function showWelcome({ invited = false, save = true } = {}) {
  openWelcome({
    invited, save, signedIn: !!S.user,
    onDone: v => {
      afterSheet();
      if (v === 'add') haGo('#/add');
      else if (v === 'start') openStarter();
      else if (v === 'signin') {
        if (screen() !== 'settings') haGo('#/settings');
        requestAnimationFrame(() => $('[data-act="signin"]')?.focus());
      }
    },
  });
}
start();
