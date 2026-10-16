// Pantry: the family's household inventory, on the family home app kit (/homedesign/: DESIGN-APP.md).
// Screens are hash routes drawn by haRouter (every screen and sheet is a history entry, so the iPhone edge swipe and
// Android back always work). Each screen is an HTML string drawn from the state S; clicks are handled by one listener
// reading data-act attributes. Data lives in one of three backends (store.js, cloud.js): this phone (IndexedDB),
// the family's shared pantry (Firestore), or memory only (demo mode, ?demo).
import * as L from './logic.js';
import { CATALOGUE, CATEGORIES, LOCATIONS } from './catalogue.js';
import { openLocal, openMemory, prefs, KINDS } from './store.js';
import { sampleData } from './sample.js';
import { openWelcome, viewGuide, welcomed, markWelcomed } from './guide.js';
import { firebaseConfig } from '../config.js';
import {
  haRouter, haGo, haBack, haSheet, haCloseSheet, haSheetOpen, haConfirm, haToast, haHideToast, haStepper, haVersion,
  haIcon, haEsc as esc, haAnnounce, haLargeTitle,
} from '/homedesign/app.js';

const $ = (s, el = document) => el.querySelector(s);
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const EMULATOR = params.has('emulator') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const WELCOME = params.has('welcome');   // show the welcome even in the demo, or again

const S = {
  items: new Map(), events: new Map(), shop: new Map(),
  backend: null, local: null, mode: DEMO ? 'demo' : 'local', cloud: null, user: null, household: null, localCount: 0,
  q: '', place: '', sort: prefs.get('sort', 'expiry'),
  draft: null, dirty: false, pendingRender: false, syncError: false,
  originTab: '#/', backLabel: 'Pantry',
};

// Product pictures: the photo, or a neutral kit icon for the category (no emoji).
const CAT_ICON = {
  'Sauces & condiments': 'bottle', 'Rice, noodles & grains': 'bowl', 'Canned & jarred': 'tin', 'Cooking & baking': 'jar',
  'Breakfast & spreads': 'jar', Drinks: 'cup', 'Dairy & eggs': 'carton', 'Bread & bakery': 'bread', 'Fresh produce': 'leaf',
  'Meat & seafood': 'fish', Frozen: 'snowflake', Snacks: 'cookie', Baby: 'heart', 'Laundry & cleaning': 'sparkle',
  'Kitchen & paper': 'roll', Toiletries: 'droplet', 'Medicine & first aid': 'pill', Pet: 'paw', Other: 'box',
};
const icon = (name, o) => haIcon(name, o);
const chevron = () => icon('chevron-right', { cls: 'ha-row-chevron' });

const who = () => prefs.get('name') || S.user?.name?.split(' ')[0] || '';
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
  if (kind === 'items') obj = { ...obj, updatedAt: new Date().toISOString(), updatedBy: who() };
  S[kind].set(obj.id, obj);
  S.backend.put(kind, obj);
  return obj;
}
function remove(kind, id) {
  S[kind].delete(id);
  S.backend.del(kind, id);
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
  return it.photo ? `<img class="${cls}" src="${esc(it.photo)}" alt="">` : `<span class="${cls}">${icon(CAT_ICON[it.category] || 'box')}</span>`;
}
function badge(date) {
  const b = L.shortLabel(date, today());
  if (!b.text) return '';
  const tone = { bad: ' ha-badge--bad', warn: ' ha-badge--warn' }[b.tone] || '';
  return `<span class="ha-badge${tone}">${esc(b.text)}</span>`;
}
const subOf = it => [it.brand, it.size].filter(Boolean).map(esc).join(' · ');
function itemRow(it, { sub, trail } = {}) {
  const q = L.totalQty(it);
  const s = sub ?? [q ? `${q} left` : 'None left', esc(it.location || '')].filter(Boolean).join(' · ');
  const t = trail ?? badge(L.nextUseBy(it));
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
const dateChips = (name, value) => `<div class="ha-chips ha-chips--wrap pa-dates" role="group" aria-label="Quick dates" data-for="${name}">${quickDates().map(([l, v]) =>
  `<button type="button" class="ha-chip" aria-pressed="${v === value}" data-act="date" data-v="${v}">${l}</button>`).join('')}<button type="button" class="ha-chip" aria-pressed="false" data-act="date" data-v="">No date</button></div>`;
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
  if (!all.length) {
    return h + `<div class="ha-card ha-empty">
      <span class="ha-empty-icon">${icon('box')}</span>
      <p class="ha-empty-title">Nothing here yet</p>
      <p class="ha-empty-text">Add what’s in the fridge and cupboards. The pantry then shows what to use first and what to buy.</p>
      <button type="button" class="ha-btn ha-btn--primary" data-act="go-add">Add an item</button>
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
  h += `<div class="ha-stats pa-stats" aria-label="Summary">
    <div class="ha-stat"><span class="ha-stat-value">${expired.length}</span><span class="ha-stat-label">Expired</span></div>
    <div class="ha-stat"><span class="ha-stat-value">${soon.length}</span><span class="ha-stat-label">Use soon</span></div>
    <div class="ha-stat"><span class="ha-stat-value">${buy.length}</span><span class="ha-stat-label">To buy</span></div>
  </div>`;
  if (expired.length) h += section('Expired', `<ul class="ha-list">${expired.map(x => itemRow(x.item)).join('')}</ul>`, { count: expired.length, footer: 'Used it or binned it? Open the item and tap Used 1 or Bin 1.' });
  h += section('Use soon', soon.length ? `<ul class="ha-list">${soon.map(x => itemRow(x.item)).join('')}</ul>` : '', { count: soon.length || '', footer: soon.length ? `Within the next ${soonText()}.` : `Nothing runs out of date in the next ${soonText()}.` });
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

// ---- Items ------------------------------------------------------------------------------------------------------

function viewItems() {
  const all = items();
  const places = LOCATIONS.filter(l => all.some(i => i.location === l));
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

const VERB = { add: 'Bought', use: 'Used up', open: 'Opened', discard: 'Thrown away', expired: 'Expired, thrown away' };
function viewItem(it) {
  const evs = eventsFor(it.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const u = L.usage(evs);
  const ro = L.runOutDate(it, u);
  const q = L.totalQty(it);
  const batches = L.fefo(it);
  const t = today();
  let h = `<h1 class="ha-large-title">${esc(it.name)}</h1>${subOf(it) ? `<p class="ha-large-sub">${subOf(it)}</p>` : ''}`;
  if (it.photo) h += `<img class="pa-hero" src="${esc(it.photo)}" alt="Photo of ${esc(it.name)}">`;

  // stock, batch by batch (first to use at the top)
  const batchRow = b => {
    const d = L.batchUseBy(b, it);
    const what = b.openedAt ? `${b.qty} opened` : it.openDays ? `${b.qty} unopened` : plural(b.qty, 'in stock', 'in stock');
    const sub = [b.openedAt ? `Opened ${fmt(b.openedAt)}` : '', d ? `use by ${fmt(d)}` : 'No date'].filter(Boolean).join(' · ');
    const desc = d ? `use by ${fmt(d)}` : 'no date';
    return `<li><div class="ha-row pa-batch">
      <span class="ha-row-body"><span class="ha-row-title">${esc(what)}</span><span class="ha-row-sub">${esc(sub.charAt(0).toUpperCase() + sub.slice(1))}</span></span>
      <span class="ha-row-trail">${badge(d)}</span>
      <span class="pa-batch-acts">
        ${!b.openedAt && it.openDays ? `<button type="button" class="ha-btn ha-btn--small" data-act="open" data-b="${esc(b.id)}" aria-label="Open 1, ${esc(desc)}">Open</button>` : ''}
        <button type="button" class="ha-btn ha-btn--small" data-act="use" data-b="${esc(b.id)}" aria-label="Used 1, ${esc(desc)}">Used 1</button>
        <button type="button" class="ha-btn ha-btn--small ha-btn--quiet" data-act="toss" data-b="${esc(b.id)}" aria-label="Bin 1, ${esc(desc)}">Bin 1</button>
      </span></div></li>`;
  };
  h += section('In stock', `<ul class="ha-list">${batches.length ? batches.map(batchRow).join('') : `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">None left</span><span class="ha-row-sub">Bought more? Add it below.</span></span></div></li>`}</ul>`,
    { count: q, id: 'stock', footer: it.openDays ? `Keeps about ${plural(it.openDays, 'day')} once opened (the label wins).` : '' });
  h += `<div class="ha-btn-stack pa-actions">
    <button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-act="bought">${icon('plus')}Bought more</button>
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
    <li><a class="ha-row" href="${esc(L.fairpriceUrl(sq))}" target="_blank" rel="noopener"><span class="ha-row-icon ha-row-icon--grey">${icon('cart')}</span><span class="ha-row-body"><span class="ha-row-title">Search FairPrice</span></span>${icon('external', { cls: 'ha-row-chevron' })}<span class="ha-sr"> (opens FairPrice)</span></a></li>
    <li><a class="ha-row" href="${esc(L.shengSiongUrl(sq))}" target="_blank" rel="noopener"><span class="ha-row-icon ha-row-icon--grey">${icon('cart')}</span><span class="ha-row-body"><span class="ha-row-title">Search Sheng Siong</span></span>${icon('external', { cls: 'ha-row-chevron' })}<span class="ha-sr"> (opens Sheng Siong)</span></a></li>
  </ul>`, { id: 'online' });

  // details
  const detail = (label, value) => value === '' || value == null ? '' : `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">${label}</span></span><span class="ha-row-value pa-wrap">${esc(value)}</span></div></li>`;
  h += section('Details', `<ul class="ha-list">${detail('Category', it.category)}${detail('Kept in', it.location)}${detail('Keeps once opened', it.openDays ? plural(it.openDays, 'day') : 'Not set')}${detail('Shopping list at', it.lowAt ? `${it.lowAt} left` : 'None left')}${detail('Barcode', it.barcode)}${detail('Added by', it.createdBy || '')}${detail('Last changed by', it.updatedBy || '')}</ul>`, { id: 'details' });

  // history
  h += section('History', evs.length
    ? `<ul class="ha-list">${evs.slice(0, 15).map(e => `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">${VERB[e.type] || esc(e.type)} ${e.qty > 1 ? e.qty : ''}</span><span class="ha-row-sub">${esc(fmtTime(e.at))}${e.by ? ' · ' + esc(e.by) : ''}</span></span></div></li>`).join('')}</ul>`
    : `<ul class="ha-list"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-sub">Nothing yet.</span></span></div></li></ul>`, { id: 'history', footer: evs.length > 15 ? `The latest 15 of ${evs.length}.` : '' });
  h += `<ul class="ha-list pa-delete"><li><button type="button" class="ha-row ha-row--danger ha-row--center" data-act="delete"><span class="ha-row-body"><span class="ha-row-title">Delete item</span></span></button></li></ul>`;
  return h;
}

// ---- Add and edit -----------------------------------------------------------------------------------------------

function blank() {
  return { id: null, name: '', brand: '', size: '', category: 'Other', location: 'Kitchen cabinet', qty: 1, expiry: '', openDays: '', lowAt: 0, barcode: '', photo: '' };
}
function viewForm(id) {
  const editing = !!id;
  const key = id || 'new';
  if (!S.draft || S.draft._for !== key) {
    const it = id && S.items.get(id);
    S.draft = it ? { ...blank(), ...it, openDays: it.openDays ?? '', _for: key } : { ...blank(), _for: key };
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
      <div class="ha-btn-row"><button type="button" class="ha-btn ha-btn--secondary" data-act="scan">${icon('barcode')}Scan barcode</button><button type="button" class="ha-btn ha-btn--secondary" data-act="quick">${icon('mic')}Say or type a list</button></div>
      <p class="ha-section-footer" id="pa-find-foot">Pick a common Singapore supermarket product, scan its barcode, or say what you bought, to fill in the details.</p>
    </section>`;
  }
  h += `<form id="pa-form" novalidate>
    <section class="ha-section" aria-labelledby="h-f-details"><h2 class="ha-section-header" id="h-f-details">Details</h2>
      <div class="pa-photo-row">
        <label class="pa-photo">${d.photo ? `<img src="${esc(d.photo)}" alt="">` : icon('camera')}<span>${d.photo ? 'Change photo' : 'Add photo'}</span>
          <input type="file" accept="image/*" capture="environment" class="pa-file" id="pa-photo-file"></label>
        <div class="pa-photo-fields">
          <label class="ha-field"><span class="ha-field-label">Name</span><input class="ha-input" name="name" value="${esc(d.name)}" required autocomplete="off" placeholder="Light soy sauce" aria-describedby="pa-name-err"></label>
          <p class="ha-field-error" id="pa-name-err" hidden>${icon('alert')}Give it a name</p>
        </div>
      </div>
      ${d.photo ? `<p class="pa-photo-del"><button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-act="photo-del">Remove photo</button></p>` : ''}
      <div class="pa-two">${field('brand', 'Brand', 'autocomplete="off" placeholder="Kikkoman"')}${field('size', 'Size', 'autocomplete="off" placeholder="500 ml"')}</div>
      <div class="pa-two">
        <label class="ha-field"><span class="ha-field-label">Category</span><select class="ha-select" name="category">${opt(CATEGORIES, d.category)}</select></label>
        <label class="ha-field"><span class="ha-field-label">Kept in</span><select class="ha-select" name="location">${opt(LOCATIONS, d.location)}</select></label>
      </div>
    </section>`;
  if (!editing) {
    h += `<section class="ha-section" aria-labelledby="h-f-stock"><h2 class="ha-section-header" id="h-f-stock">Stock</h2>
      <ul class="ha-list"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title" id="pa-qty-l">How many</span></span>
        <div class="ha-stepper" role="group" aria-labelledby="pa-qty-l" id="pa-qty"><button type="button" data-step="-1" aria-label="Fewer">${icon('minus')}</button><output>${Number(d.qty) || 0}</output><button type="button" data-step="1" aria-label="More">${icon('plus')}</button></div></div></li></ul>
      <label class="ha-field pa-gap"><span class="ha-field-label">Best before or use by</span><input class="ha-input" type="date" name="expiry" value="${esc(d.expiry)}"></label>
      ${dateChips('expiry', d.expiry)}
    </section>`;
  }
  h += `<section class="ha-section" aria-labelledby="h-f-remind"><h2 class="ha-section-header" id="h-f-remind">Reminders</h2>
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
    if (t.name === 'name' && t.value.trim()) { t.removeAttribute('aria-invalid'); $('#pa-name-err').hidden = true; }
    if (t.name === 'expiry') for (const c of document.querySelectorAll('.pa-dates .ha-chip')) c.setAttribute('aria-pressed', String(c.dataset.v === t.value && !!t.value));
  });
  f.addEventListener('submit', submitForm);
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
  for (const it of items()) { const s = L.score(q, `${it.name} ${it.brand}`); if (s) out.push({ s: s + 2, mine: it }); }
  for (const [i, c] of CATALOGUE.entries()) { const s = L.score(q, `${c.name} ${c.brand} ${c.category}`); if (s) out.push({ s, cat: c, i }); }
  return out.sort((a, b) => b.s - a.s).slice(0, 8);
}
function showSugg() {
  const q = $('#pa-find')?.value || '', ul = $('#pa-sugg');
  if (!ul) return;
  const list = suggestions(q);
  const row = (act, data, thumbHtml, title, sub, trail = '') => `<li><button type="button" class="ha-row" data-act="${act}" ${data}>${thumbHtml}<span class="ha-row-body"><span class="ha-row-title">${title}</span>${sub ? `<span class="ha-row-sub">${sub}</span>` : ''}</span>${trail}</button></li>`;
  ul.innerHTML = list.map(x => x.mine
    ? row('sugg-mine', `data-id="${esc(x.mine.id)}"`, thumb(x.mine), esc(x.mine.name), subOf(x.mine), `<span class="ha-row-trail"><span class="ha-badge ha-badge--accent">In the pantry</span></span>`)
    : row('sugg', `data-i="${x.i}"`, `<span class="ha-row-thumb">${icon(CAT_ICON[x.cat.category] || 'box')}</span>`, esc(x.cat.name), [x.cat.brand, x.cat.size].filter(Boolean).map(esc).join(' · '))).join('')
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
    openDays: num(d.openDays) || null, lowAt: num(d.lowAt), barcode: String(d.barcode || '').trim(), photo: d.photo || '',
  };
  S.draft = null; S.dirty = false;
  if (base) {
    save('items', it);
    haBack('#/item/' + it.id);
    haToast('Saved');
    return;
  }
  const qty = num(d.qty);
  let ev = null;
  if (qty > 0) {
    const res = L.addStock(it, { qty, expiry: d.expiry || null, by: who() });
    save('items', res.item); ev = save('events', res.event);
  } else save('items', it);
  haGo('#/item/' + it.id, { replace: true });
  haToast(`${it.name} added`, { action: 'Undo', onAction: () => { remove('items', it.id); if (ev) remove('events', ev.id); redraw(); } });
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
  if (!S.draft) return;
  if (!p) { fillDraft({ barcode: code }); haToast('Barcode saved. Type the name once and it’s known next time.'); $('#pa-form [name="name"]')?.focus(); return; }
  fillDraft({ barcode: code, name: p.name, brand: p.brand, size: p.size });
  haToast(`Found ${p.name}`);
  if (p.image && !S.draft.photo) {
    const { fromUrl } = await import('./photo.js');
    const ph = await fromUrl(p.image);
    if (ph && S.draft && !S.draft.photo) fillDraft({ photo: ph });
  }
}

// ---- the "bought more" sheet ----------------------------------------------------------------------------------

function openBought(it, { shopId = null } = {}) {
  const s = haSheet({
    title: 'Bought more', closeLabel: 'Cancel', grey: true,
    body: `<form id="pa-bought" novalidate>
      <ul class="ha-list"><li><div class="ha-row">${thumb(it)}<span class="ha-row-body"><span class="ha-row-title">${esc(it.name)}</span>${subOf(it) ? `<span class="ha-row-sub">${subOf(it)}</span>` : ''}</span></div></li>
        <li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title" id="pa-b-qty-l">How many</span></span>
          <div class="ha-stepper" role="group" aria-labelledby="pa-b-qty-l" id="pa-b-qty"><button type="button" data-step="-1" aria-label="Fewer">${icon('minus')}</button><output>1</output><button type="button" data-step="1" aria-label="More">${icon('plus')}</button></div></div></li></ul>
      <label class="ha-field pa-gap"><span class="ha-field-label">Best before or use by</span><input class="ha-input" type="date" name="expiry"></label>
      ${dateChips('expiry', '')}
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
    const res = L.addStock(cur, { qty: n, expiry: f.expiry.value || null, by: who() });
    const ticked = [...S.shop.values()].filter(m => m.itemId === it.id && !m.done && m.id !== shopId);
    for (const m of ticked) save('shop', { ...m, done: true });
    await haCloseSheet(s.el);
    apply(res, `Added ${n} ${it.name}`);
  });
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
  const describe = x => [x.brand, plural(x.qty, 'unit'), x.location, x.expiry ? `use by ${fmt(x.expiry)}` : 'no date',
    x.match?.mine ? 'adds to the one at home' : x.match?.cat ? '' : 'new item'].filter(Boolean).join(' · ');
  const show = () => {
    found = Q.parseQuick(ta.value, { today: today(), items: items(), catalogue: CATALOGUE });
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
        location: x.location || c?.location || 'Kitchen cabinet', openDays: c?.openDays ?? null, lowAt: 0, barcode: '', photo: '',
      };
      const res = L.addStock(base, { qty: x.qty, expiry: x.expiry || null, by: who() });
      undo.push({ before: mine || null, id: base.id, ev: save('events', res.event).id });
      save('items', res.item);
    }
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
function viewShop() {
  const { manual, suggested } = shopLists();
  const left = manual.filter(m => !m.done).length, done = manual.length - left;
  let h = `<h1 class="ha-large-title">Shopping</h1>
    <form class="pa-addline" id="pa-shop-add"><label class="ha-sr" for="pa-shop-text">Add something to buy</label>
      <input class="ha-input" id="pa-shop-text" placeholder="Add something to buy" autocomplete="off" enterkeyhint="done">
      <button class="ha-btn ha-btn--compact" type="submit">Add</button></form>`;
  const line = m => `<li><label class="ha-row${m.done ? ' is-done' : ''}">
      <input type="checkbox" data-shop="${esc(m.id)}"${m.done ? ' checked' : ''}>
      <span class="ha-row-body"><span class="ha-row-title">${esc(m.name)}</span>${m.by ? `<span class="ha-row-sub">Added by ${esc(m.by)}</span>` : ''}</span>
      <button type="button" class="ha-btn ha-btn--quiet ha-btn--icon" data-act="shop-del" data-id="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">${icon('trash')}</button></label></li>`;
  h += section('To buy', manual.length ? `<ul class="ha-list" id="pa-shop">${manual.map(line).join('')}</ul>`
    : `<ul class="ha-list" id="pa-shop"><li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-sub">Nothing on the list yet.</span></span></div></li></ul>`,
  { id: 'shop', action: done ? `<button type="button" data-act="shop-clear">Clear ticked</button>` : (left ? `<span class="ha-num">${left}</span>` : ''),
    footer: manual.length || suggested.length ? 'Tick things off as you buy them. A pantry item asks how many you bought and the date.'
      : 'Pantry items come here by themselves when none are left, when they’re down to their “on the list when down to” number, or when they’ll run out within a week at your usual pace. Type anything else above.' });
  h += section('Suggested from the pantry', suggested.length
    ? `<ul class="ha-list">${suggested.map(b => `<li><div class="ha-row">${thumb(b.item)}<span class="ha-row-body"><span class="ha-row-title">${esc(b.item.name)}</span><span class="ha-row-sub">${esc(L.whyText(b, today()))}</span></span>
        <span class="ha-row-trail"><button type="button" class="ha-btn ha-btn--small" data-act="to-list" data-id="${esc(b.item.id)}" aria-label="Add ${esc(b.item.name)} to the list">Add</button></span></div></li>`).join('')}</ul>`
    : '', { id: 'suggested', footer: suggested.length ? 'Out of stock, running low, or due to run out within a week at your usual pace.' : 'Nothing is running low.' });
  return h;
}
function shareLines() {
  const { manual, suggested } = shopLists();
  return [...manual.filter(m => !m.done).map(m => m.name), ...suggested.map(b => [b.item.brand, b.item.name].filter(Boolean).join(' '))];
}
function addToList(it) {
  if (onList(it.id)) { haToast('Already on the shopping list'); return; }
  const m = save('shop', { id: L.uid(), name: [it.brand, it.name].filter(Boolean).join(' '), itemId: it.id, done: false, at: new Date().toISOString(), by: who() });
  redraw();
  haToast(`${it.name} is on the shopping list`, { action: 'Undo', onAction: () => { remove('shop', m.id); redraw(); } });
}

// ---- Settings ---------------------------------------------------------------------------------------------------

function viewSettings() {
  const configured = !!S.cloud?.configured;
  const row = (inner, cls = '') => `<li><div class="ha-row${cls}">${inner}</div></li>`;
  const btnRow = (act, title, { cls = ' ha-row--action', iconName = '', sub = '' } = {}) => `<li><button type="button" class="ha-row${cls}" data-act="${act}">${iconName ? `<span class="ha-row-icon">${icon(iconName)}</span>` : ''}<span class="ha-row-body"><span class="ha-row-title">${title}</span>${sub ? `<span class="ha-row-sub">${sub}</span>` : ''}</span></button></li>`;
  let fam, famFoot = '';
  if (S.mode === 'demo') {
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon ha-row-icon--grey">${icon('info')}</span><span class="ha-row-body"><span class="ha-row-title">Not in the demo</span><span class="ha-row-sub">The demo uses made-up items and saves nothing.</span></span>`)}</ul>`;
  } else if (!configured) {
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon ha-row-icon--grey">${icon('box')}</span><span class="ha-row-body"><span class="ha-row-title">On this phone only</span><span class="ha-row-sub">Family sharing isn’t set up yet.</span></span>`)}</ul>`;
    famFoot = 'Sharing with the family needs a one-time setup of the pantry’s Firebase project (SETUP.md).';
  } else if (!S.user) {
    fam = `<ul class="ha-list">${btnRow('signin', 'Sign in with Google', { iconName: 'user' })}</ul>`;
    famFoot = 'Sign in to share one pantry with the family: everyone sees the same items and shopping list. Only the people added can see it.';
  } else if (!S.household) {
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon">${icon('user')}</span><span class="ha-row-body"><span class="ha-row-title">Signed in</span><span class="ha-row-sub">${esc(S.user.email)}</span></span>`)}
      ${btnRow('hh-create', 'Start our family pantry')}${btnRow('hh-check', 'Check again')}${btnRow('signout', 'Sign out')}</ul>`;
    famFoot = `Not in a family pantry yet. Start one, or ask whoever started yours to add ${esc(S.user.email)}, then tap Check again.`;
  } else {
    const h = S.household;
    fam = `<ul class="ha-list">${row(`<span class="ha-row-icon">${icon('cloud')}</span><span class="ha-row-body"><span class="ha-row-title">${esc(h.name)}</span><span class="ha-row-sub">Signed in as ${esc(S.user.email)}</span></span>`)}
      ${h.members.map(m => row(`<span class="ha-row-icon ha-row-icon--grey">${icon('user')}</span><span class="ha-row-body"><span class="ha-row-title pa-wrap">${esc(m)}</span>${m === h.owner ? '<span class="ha-row-sub">Started it</span>' : ''}</span>
        ${m !== S.user.email ? `<a class="ha-btn ha-btn--quiet ha-btn--icon" href="${esc(inviteHref(m))}" aria-label="Email an invite to ${esc(m)}">${icon('mail')}</a>` : ''}
        ${m !== h.owner && m !== S.user.email ? `<button type="button" class="ha-btn ha-btn--quiet ha-btn--icon" data-act="member-del" data-v="${esc(m)}" aria-label="Stop sharing with ${esc(m)}">${icon('trash')}</button>` : ''}`)).join('')}
      ${S.localCount ? btnRow('copy-up', `Copy ${plural(S.localCount, 'item')} from this phone`, { iconName: 'upload', sub: 'Saved here before you signed in' }) : ''}
      ${btnRow('signout', 'Sign out')}</ul>
      <form class="pa-addline pa-member" id="pa-member-add"><label class="ha-sr" for="pa-member-email">Family member’s Google email</label>
        <input class="ha-input" id="pa-member-email" type="email" placeholder="Family member’s Gmail" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="ha-btn ha-btn--compact" type="submit">Add</button></form>`;
    famFoot = 'They sign in with that Google account to see the pantry. The envelope emails them the link from your own mail app. Whoever started it can’t be removed.';
  }
  return `<h1 class="ha-large-title">Settings</h1>
    ${section('Family sharing', fam, { id: 'family', footer: famFoot })}
    ${section('Reminders', `<div class="ha-chips ha-chips--wrap" role="group" aria-label="Use soon means within">${Object.entries(SOON).map(([v, l]) =>
      `<button type="button" class="ha-chip" aria-pressed="${soonDays() === Number(v)}" data-act="soon" data-v="${v}">${l}</button>`).join('')}</div>`,
      { id: 'remind', footer: 'How far ahead “Use soon” looks, on Home. Kept on this phone.' })}
    ${section('Help', `<ul class="ha-list">
      <li><a class="ha-row" href="#/guide"><span class="ha-row-icon">${icon('info')}</span><span class="ha-row-body"><span class="ha-row-title">How to use the pantry</span></span>${chevron()}</a></li>
      ${btnRow('welcome', 'Show the welcome again', { iconName: 'home' })}
    </ul>`, { id: 'help' })}
    ${section('You', `<ul class="ha-list"><li><label class="ha-row"><span class="ha-row-body"><span class="ha-row-title">Your name</span></span>
      <input class="ha-input ha-input--inline" id="pa-name" value="${esc(prefs.get('name') || '')}" placeholder="${esc(S.user?.name?.split(' ')[0] || 'For example, Mum')}" autocomplete="off"></label></li></ul>`,
      { id: 'you', footer: 'Shows in each item’s history and on the shopping list. Kept on this phone.' })}
    ${section('Your data', `<ul class="ha-list">
      ${btnRow('csv', 'Export as CSV', { iconName: 'download', sub: 'A spreadsheet of what’s in stock' })}
      ${btnRow('backup', 'Back up', { iconName: 'download', sub: 'Everything, as a JSON file' })}
      <li><label class="ha-row ha-row--action"><span class="ha-row-icon">${icon('upload')}</span><span class="ha-row-body"><span class="ha-row-title">Restore a backup</span><span class="ha-row-sub">Adds the items in a backup file</span></span><input type="file" accept="application/json,.json" class="pa-file" id="pa-restore"></label></li>
      ${btnRow('sample', 'Add sample items', { iconName: 'box', sub: 'Made-up items to try the app with' })}
      ${S.mode === 'local' ? btnRow('wipe', 'Delete everything on this phone', { cls: ' ha-row--danger' }) : ''}
    </ul>`, { id: 'data' })}
    ${section('On your home screen', `<div class="ha-card pa-install"><p class="ha-card-text"><strong>iPhone:</strong> in Safari, tap Share, then Add to Home Screen.</p><p class="ha-card-text"><strong>Android:</strong> in Chrome, open the menu, then Add to home screen or Install app.</p><p class="ha-card-text">It then opens like an app and works without signal.</p></div>`, { id: 'install' })}
    ${section('About', '', { id: 'about', footer: 'Product suggestions are common Singapore supermarket goods; “keeps once opened” days are a rough guide, so check the label. Barcode look-ups use Open Food Facts. Shop links open FairPrice’s and Sheng Siong’s own search.' })}
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
  if (!['home', 'items', 'item', 'add', 'edit', 'shop', 'settings', 'guide'].includes(name)) name = 'home';
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
  } else if (name === 'shop') { main.innerHTML = viewShop(); setBar({ title, trail: iconBtn('share', 'Share the list', 'share') }); }
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
    case 'soon': { prefs.set('soonDays', Number(b.dataset.v)); redraw(); return haToast(`Use soon: within ${SOON[b.dataset.v]}`); }
    case 'open': return apply(L.openOne(it, { by: who(), batchId: b.dataset.b || null }), `Opened 1 ${it.name}`);
    case 'bought': return openBought(it);
    case 'to-list': return addToList(it);
    case 'delete': {
      const evs = eventsFor(it.id);
      remove('items', it.id);
      for (const ev of evs) remove('events', ev.id);
      haBack(S.originTab);
      haToast(`${it.name} deleted`, { action: 'Undo', onAction: () => { save('items', it); for (const ev of evs) save('events', ev); redraw(); } });
      return;
    }
    case 'place': {
      S.place = b.dataset.v;
      for (const c of document.querySelectorAll('[data-act="place"]')) c.setAttribute('aria-pressed', String(c === b));
      return drawItemsList();
    }
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
      fillDraft({ name: c.name, brand: c.brand, size: c.size, category: c.category, location: c.location, openDays: c.openDays ?? '' });
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
    case 'photo-del': return fillDraft({ photo: '' });
    case 'shop-del': {
      e.preventDefault();
      const m = S.shop.get(b.dataset.id);
      remove('shop', m.id); redraw();
      return haToast(`${m.name} removed`, { action: 'Undo', onAction: () => { save('shop', m); redraw(); } });
    }
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
    case 'backup': return download(`pantry-backup-${today()}.json`, JSON.stringify(L.backup({ items: [...S.items.values()], events: [...S.events.values()], shop: [...S.shop.values()] })), 'application/json');
    case 'wipe': {
      if (!(await haConfirm({ title: 'Delete everything?', text: 'Every item, its history and the shopping list on this phone are deleted. This can’t be undone. A backup first keeps a copy.', ok: 'Delete everything', danger: true }))) return;
      await S.local.clear();
      for (const k of KINDS) S[k].clear();
      redraw(); return haToast('Deleted everything on this phone');
    }
    case 'signin':
      try { await S.cloud.signIn(); } catch (err) { haToast(S.cloud.explain(err, 'Sign-in')); }
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
      try { await useHousehold(await S.cloud.createHousehold(S.user.email, 'Our pantry')); haToast('Family pantry started. Add the family below.'); } catch (err) { haToast(S.cloud.explain(err, 'Starting the family pantry')); }
      return;
    }
    case 'hh-check': {
      try {
        const h = await S.cloud.findHousehold(S.user.email);
        if (!h) return haToast('Not added yet. Ask whoever started it to add you.');
        await useHousehold(h);
      } catch (err) { haToast(S.cloud.explain(err, 'Checking')); }
      return;
    }
    case 'member-del': {
      const m = b.dataset.v;
      if (!(await haConfirm({ title: 'Stop sharing?', text: `${m} won’t see the pantry any more. You can add them again later.`, ok: 'Stop sharing', danger: true }))) return;
      try { await S.cloud.setMembers(S.household.id, S.household.members.filter(x => x !== m)); } catch (err) { haToast(S.cloud.explain(err, 'Removing them')); }
      return;
    }
    case 'copy-up': {
      try {
        const data = await S.local.load();
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
  if (t.name === 'pa-sort') { S.sort = t.value; prefs.set('sort', t.value); return drawItemsList(); }
  if (t.id === 'pa-name') { prefs.set('name', t.value.trim()); return haToast('Saved'); }
  if (t.dataset.shop) {
    const m = S.shop.get(t.dataset.shop); if (!m) return;
    save('shop', { ...m, done: t.checked });
    const item = t.checked && m.itemId && S.items.get(m.itemId);
    if (item) { S.pendingRender = true; openBought(item, { shopId: m.id }); return; }
    return redraw();
  }
  if (t.id === 'pa-photo-file' && t.files[0]) {
    const { shrink } = await import('./photo.js');
    try { fillDraft({ photo: await shrink(t.files[0]) }); } catch { haToast('Couldn’t read that picture. Try another.'); }
    return;
  }
  if (t.id === 'pa-restore' && t.files[0]) {
    try {
      const data = L.parseBackup(await t.files[0].text());
      if (S.backend.putMany) for (const k of KINDS) await S.backend.putMany(k, data[k]);
      for (const k of KINDS) for (const o of data[k]) { if (S.backend.putMany) S[k].set(o.id, o); else save(k, o); }
      redraw(); haToast(`Restored ${plural(data.items.length, 'item')}`);
    } catch (err) { haToast(err?.message?.startsWith('That file') ? err.message : 'Couldn’t restore that file.'); }
    t.value = '';
  }
}
function onInput(e) {
  if (e.target.id === 'pa-q') { S.q = e.target.value; drawItemsList(); }
  if (e.target.id === 'pa-find') showSugg();
}
async function onSubmit(e) {
  if (e.target.id === 'pa-shop-add') {
    e.preventDefault();
    const inp = $('#pa-shop-text'), v = inp.value.trim();
    if (!v) return inp.focus();
    const mine = items().find(i => L.norm(i.name) === L.norm(v) || L.norm(`${i.brand} ${i.name}`) === L.norm(v));
    save('shop', { id: L.uid(), name: v, itemId: mine?.id || null, done: false, at: new Date().toISOString(), by: who() });
    redraw();
    $('#pa-shop-text')?.focus();
    return;
  }
  if (e.target.id === 'pa-member-add') {
    e.preventDefault();
    const v = $('#pa-member-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return haToast('Type their Google email address');
    try {
      await S.cloud.setMembers(S.household.id, [...S.household.members, v]);
      $('#pa-member-email').value = '';
      haToast(`Added ${v}`, { action: 'Email invite', onAction: () => { location.href = inviteHref(v); }, ms: 10000 });
    } catch (err) { haToast(S.cloud.explain(err, 'Adding them')); }
  }
}

// An invite from the person's own mail app (no email server: the pantry never sends mail itself).
function inviteHref(email) {
  const from = who() || S.user?.name?.split(' ')[0] || '';
  const link = location.origin + location.pathname.replace(/[^/]*$/, '') + '#/settings';   // lands on Sign in
  const body = `Hi! I've added you to our family pantry, so we can all see what's at home, what to use first and what to buy.\n\n`
    + `1. Open ${link}\n2. Settings → Sign in with Google, using this account (${email})\n3. Add it to your home screen: Safari's Share button → Add to Home Screen (iPhone), or Chrome's menu → Add to home screen (Android)`
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
}
let unwatch = null;
async function useHousehold(h) {
  S.household = h;
  prefs.set('household', h.id);
  S.backend?.close?.();
  S.backend = await S.cloud.openCloud(h.id, err => { S.syncError = S.cloud.explain(err, 'Saving'); redraw(); });
  S.mode = 'cloud';
  loadInto(await S.backend.load());
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
  S.household = null; S.syncError = false;
  loadInto(await S.local.load());
  redraw();
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
    S.local = S.backend = openMemory(sampleData('Sample'));
  } else {
    try { S.local = await openLocal(); }
    catch { S.local = openMemory(); haToast('This browser can’t save here (private mode?). Changes last until you close it.'); }
    S.backend = S.local;
  }
  loadInto(await S.backend.load());
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  addEventListener('online', redraw);
  addEventListener('offline', redraw);
  R = haRouter({
    render: r => draw(r),
    tabOf: r => ['item', 'edit', 'add', 'guide'].includes(r.parts[0]) ? S.originTab : r.hash,
  });
  // family sharing, only when a Firebase project is set up (config.js) or in the emulator tests
  if (!DEMO && (firebaseConfig || EMULATOR)) {
    try {
      S.cloud = await import('./cloud.js');
      if (S.cloud.configured) {
        if (EMULATOR) window.__pantry = { S, signIn: S.cloud.emulatorSignIn };
        S.cloud.onUser(async u => {
          S.user = u;
          if (!u) { if (S.mode !== 'local') await useLocal(); else redraw(); return; }
          let h = null;
          try { h = await S.cloud.findHousehold(u.email); } catch (e) { console.warn('household', e?.code); }
          if (h) await useHousehold(h); else redraw();
        }).catch(() => { /* no signal on the very first open: stays on this phone's pantry */ });
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
  showWelcome({ invited: INVITED && !S.user, save: !DEMO });
}
function showWelcome({ invited = false, save = true } = {}) {
  openWelcome({
    invited, save, signedIn: !!S.user,
    onDone: v => {
      afterSheet();
      if (v === 'add') haGo('#/add');
      else if (v === 'signin') {
        if (screen() !== 'settings') haGo('#/settings');
        requestAnimationFrame(() => $('[data-act="signin"]')?.focus());
      }
    },
  });
}
start();
