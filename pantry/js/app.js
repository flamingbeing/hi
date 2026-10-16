// Pantry: the family's household inventory. Screens are plain HTML strings re-rendered from state;
// clicks are handled by one listener reading data-act attributes.
import * as L from './logic.js';
import { CATALOGUE, CATEGORIES, LOCATIONS } from './catalogue.js';
import { openLocal, prefs } from './store.js';
import { sampleData } from './sample.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  items: new Map(), events: new Map(), shop: new Map(),
  backend: null, local: null, mode: 'local', cloud: null, user: null, household: null,
  q: '', where: 'All', sort: 'expiry', draft: null,
};

const ICON = {
  'Sauces & condiments': '🫙', 'Rice, noodles & grains': '🍚', 'Canned & jarred': '🥫', 'Cooking & baking': '🧂',
  'Breakfast & spreads': '🍯', Drinks: '🧃', 'Dairy & eggs': '🥛', 'Bread & bakery': '🍞', 'Fresh produce': '🥬',
  'Meat & seafood': '🍗', Frozen: '🧊', Snacks: '🍪', Baby: '🍼', 'Laundry & cleaning': '🧴', 'Kitchen & paper': '🧻',
  Toiletries: '🪥', 'Medicine & first aid': '💊', Pet: '🐾', Other: '📦',
};
const who = () => prefs.get('name') || S.user?.name?.split(' ')[0] || '';
const items = () => [...S.items.values()].filter(i => !i.archived);
const eventsFor = id => [...S.events.values()].filter(e => e.itemId === id);
function eventsByItem() {
  const m = new Map();
  for (const e of S.events.values()) { if (!m.has(e.itemId)) m.set(e.itemId, []); m.get(e.itemId).push(e); }
  return m;
}
const today = () => L.ymd();

// ---- saving ----------------------------------------------------------------------------------------------------

function save(kind, obj) {
  if (kind === 'items') obj = { ...obj, updatedAt: new Date().toISOString() };
  S[kind].set(obj.id, obj);
  S.backend.put(kind, obj);
  return obj;
}
function remove(kind, id) {
  S[kind].delete(id);
  S.backend.del(kind, id);
}
// Apply a stock change from logic.js ({ item, event }) with an Undo in the toast.
function apply(res, msg) {
  if (!res.event) return toast('Nothing in stock to do that with');
  const before = S.items.get(res.item.id);
  save('items', res.item);
  save('events', res.event);
  render();
  toast(msg, () => { save('items', before); remove('events', res.event.id); render(); });
}

// ---- small pieces --------------------------------------------------------------------------------------------------

function thumb(it, cls = 'thumb') {
  return it.photo ? `<img class="${cls}" src="${esc(it.photo)}" alt="">` : `<span class="${cls} emoji" aria-hidden="true">${ICON[it.category] || '📦'}</span>`;
}
function chip(date) {
  if (!date) return '';
  const st = L.expiryStatus(date, today());
  return `<span class="chip ${st}">${esc(L.expiryLabel(date, today()))}</span>`;
}
const sub = it => [it.brand, it.size].filter(Boolean).map(esc).join(' · ');
function row(it, extra = '') {
  const q = L.totalQty(it);
  return `<li class="row">
    <a class="row-main" href="#item/${esc(it.id)}">${thumb(it)}
      <span class="row-text"><span class="row-name">${esc(it.name)}</span><span class="row-sub">${sub(it)}${it.location ? `${sub(it) ? ' · ' : ''}${esc(it.location)}` : ''}</span>${extra || chip(L.nextUseBy(it))}</span>
      <span class="qty ${q ? '' : 'zero'}" aria-label="${q} in stock">${q}</span></a>
    ${q ? `<button class="mini" data-act="use" data-id="${esc(it.id)}" aria-label="Used up one ${esc(it.name)}">Used 1</button>` : `<button class="mini" data-act="bought" data-id="${esc(it.id)}" aria-label="Bought ${esc(it.name)}">Bought</button>`}
  </li>`;
}
function section(title, body, more = '') {
  return `<section class="card"><h2>${title}</h2>${body}${more}</section>`;
}

// ---- screens ----------------------------------------------------------------------------------------------------

function viewHome() {
  const all = items();
  if (!all.length) {
    return `<section class="card empty">
      <h2>Welcome to your pantry</h2>
      <p>Keep track of what's at home, what's about to expire and what to buy. Add your first item, or try it out with a few sample items.</p>
      <p><a class="btn primary" href="#add">Add an item</a></p>
      <p><button class="btn" data-act="sample">Try with sample items</button></p>
    </section>`;
  }
  const t = today();
  const exp = L.expiring(all, { days: 14, today: t });
  const expired = exp.filter(x => x.date < t), soon = exp.filter(x => x.date >= t);
  const buy = L.toBuy(all, eventsByItem());
  const opened = all.filter(it => (it.batches || []).some(b => b.openedAt && b.qty > 0) && !exp.some(x => x.item.id === it.id));
  const month = t.slice(0, 7);
  const wasted = [...S.events.values()].filter(e => e.type === 'discard' && String(e.at).startsWith(month)).reduce((n, e) => n + e.qty, 0);
  const used = [...S.events.values()].filter(e => e.type === 'use' && String(e.at).startsWith(month)).reduce((n, e) => n + e.qty, 0);
  const inStock = all.filter(it => L.totalQty(it) > 0).length;
  let h = `<div class="stats">
    <a class="stat" href="#items"><b>${inStock}</b><span>in stock</span></a>
    <a class="stat ${expired.length ? 'bad' : ''}" href="#items?sort=expiry"><b>${expired.length}</b><span>expired</span></a>
    <a class="stat ${buy.length ? 'warn' : ''}" href="#shop"><b>${buy.length}</b><span>to buy</span></a>
  </div>`;
  if (expired.length) h += section('Expired', `<ul class="list">${expired.map(x => row(x.item)).join('')}</ul>`);
  h += section('Use soon', soon.length ? `<ul class="list">${soon.map(x => row(x.item)).join('')}</ul>` : '<p class="muted">Nothing expires in the next two weeks.</p>');
  if (opened.length) h += section('Opened', `<ul class="list">${opened.map(x => row(x)).join('')}</ul>`);
  if (buy.length) h += section('Running low', `<ul class="list">${buy.slice(0, 5).map(b => row(b.item, `<span class="chip ${b.why === 'out' ? 'expired' : 'soon'}">${whyText(b)}</span>`)).join('')}</ul>`, buy.length > 5 ? `<p><a href="#shop">All ${buy.length} on the shopping list</a></p>` : '');
  h += `<p class="muted small center">This month: ${used} used up${wasted ? `, ${wasted} thrown away` : ''}.</p>`;
  return h;
}
function whyText(b) {
  if (b.why === 'out') return 'out of stock';
  if (b.why === 'low') return `only ${b.qty} left`;
  const d = L.daysBetween(today(), b.runOut);
  return d <= 0 ? 'runs out about now' : `runs out in ~${d} day${d === 1 ? '' : 's'}`;
}

function viewItems() {
  const all = items();
  const places = ['All', ...LOCATIONS.filter(l => all.some(i => i.location === l))];
  let list = all.filter(i => (S.where === 'All' || i.location === S.where) && (!S.q || L.score(S.q, `${i.name} ${i.brand} ${i.category} ${i.barcode || ''}`)));
  if (S.sort === 'expiry') list.sort((a, b) => (L.nextUseBy(a) || '9999') < (L.nextUseBy(b) || '9999') ? -1 : (L.nextUseBy(a) || '9999') > (L.nextUseBy(b) || '9999') ? 1 : a.name.localeCompare(b.name));
  else if (S.sort === 'category') list.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.localeCompare(b.name));
  let body = '';
  if (S.sort === 'category') {
    let cur = null;
    for (const it of list) {
      if (it.category !== cur) { if (cur !== null) body += '</ul>'; cur = it.category; body += `<h3 class="group">${ICON[cur] || ''} ${esc(cur || 'Other')}</h3><ul class="list">`; }
      body += row(it);
    }
    if (list.length) body += '</ul>';
  } else body = `<ul class="list">${list.map(i => row(i)).join('')}</ul>`;
  return `<div class="search"><input id="q" type="search" placeholder="Search your pantry" value="${esc(S.q)}" aria-label="Search your pantry" autocomplete="off"></div>
    <div class="chips" role="group" aria-label="Where">${places.map(p => `<button class="fchip ${p === S.where ? 'on' : ''}" data-act="where" data-v="${esc(p)}" aria-pressed="${p === S.where}">${esc(p)}</button>`).join('')}</div>
    <div class="sortbar"><label>Sort <select id="sort"><option value="expiry"${S.sort === 'expiry' ? ' selected' : ''}>Use-by date</option><option value="name"${S.sort === 'name' ? ' selected' : ''}>Name</option><option value="category"${S.sort === 'category' ? ' selected' : ''}>Category</option></select></label><span class="muted small">${list.length} item${list.length === 1 ? '' : 's'}</span></div>
    ${list.length ? `<section class="card flush">${body}</section>` : `<p class="muted center">${all.length ? 'Nothing matches.' : 'No items yet.'} <a href="#add">Add an item</a></p>`}`;
}

function viewItem(id) {
  const it = S.items.get(id);
  if (!it) return '<p class="muted center">This item was deleted. <a href="#items">Back to items</a></p>';
  const evs = eventsFor(id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const u = L.usage(evs);
  const ro = L.runOutDate(it, u);
  const q = L.totalQty(it);
  const batches = L.fefo(it);
  const max = Math.max(1, ...u.months.map(m => m.used + m.wasted));
  const bars = `<div class="bars" role="img" aria-label="Used up per month: ${u.months.map(m => `${m.label} ${m.used}`).join(', ')}">${u.months.map(m => `<div class="bar"><span class="b-used" style="height:${(m.used / max) * 100}%"></span><span class="b-waste" style="height:${(m.wasted / max) * 100}%"></span><i>${m.used + m.wasted || ''}</i><em>${esc(m.label)}</em></div>`).join('')}</div>`;
  const verb = { add: 'Bought', use: 'Used up', open: 'Opened', discard: 'Threw away' };
  return `<div class="hero">${thumb(it, 'hero-img')}<div><h1>${esc(it.name)}</h1><p class="muted">${sub(it)}</p><p class="muted small">${esc(it.category || '')}${it.location ? ' · ' + esc(it.location) : ''}</p></div></div>
    <section class="card">
      <h2>In stock: <span class="big">${q}</span></h2>
      ${batches.length ? `<ul class="batches">${batches.map(b => {
        const d = L.batchUseBy(b, it);
        return `<li><span><b>${b.qty}</b> ${b.openedAt ? `<span class="tag">opened ${esc(fmt(b.openedAt))}</span>` : ''} ${d ? chip(d) : '<span class="muted small">no date</span>'}${b.expiry ? `<span class="muted small"> best before ${esc(fmt(b.expiry))}</span>` : ''}</span>
          <span class="b-acts">${!b.openedAt && it.openDays ? `<button class="mini" data-act="open-b" data-id="${esc(it.id)}" data-b="${esc(b.id)}">Open</button>` : ''}<button class="mini" data-act="use-b" data-id="${esc(it.id)}" data-b="${esc(b.id)}">Used 1</button><button class="mini ghost" data-act="toss-b" data-id="${esc(it.id)}" data-b="${esc(b.id)}" aria-label="Threw one away">Bin 1</button></span></li>`;
      }).join('')}</ul>` : '<p class="muted">None left.</p>'}
      <div class="actions">
        <button class="btn primary" data-act="bought" data-id="${esc(it.id)}">+ Bought more</button>
        ${q && it.openDays && batches.some(b => !b.openedAt) ? `<button class="btn" data-act="open" data-id="${esc(it.id)}">Opened one</button>` : ''}
        ${q ? `<button class="btn" data-act="use" data-id="${esc(it.id)}">Used one up</button>` : ''}
      </div>
      ${it.openDays ? `<p class="muted small">Keeps about ${it.openDays} days once opened (check the label).</p>` : ''}
    </section>
    <section class="card">
      <h2>How fast we use it</h2>
      ${u.daysPerUnit ? `<p class="pace"><b>${esc(L.paceLabel(u))}</b>${ro ? ` · at this pace, runs out around <b>${esc(fmt(ro))}</b>` : ''}</p>` : `<p class="muted">Tap “Used 1” each time one is finished. After two, the app learns how fast your family uses it and reminds you before it runs out.</p>`}
      ${bars}
      <p class="muted small">${u.units} used up${u.discards ? ` · <span class="waste-key"></span>${u.discards} thrown away` : ''}${it.lowAt ? ` · on the shopping list at ${it.lowAt} left` : ''}</p>
    </section>
    <section class="card">
      <h2>Buy it</h2>
      <div class="actions"><a class="btn" target="_blank" rel="noopener" href="${L.fairpriceUrl(shopQuery(it))}">FairPrice ↗</a><a class="btn" target="_blank" rel="noopener" href="${L.shengSiongUrl(shopQuery(it))}">Sheng Siong ↗</a><button class="btn" data-act="to-list" data-id="${esc(it.id)}">Add to list</button></div>
    </section>
    <section class="card">
      <h2>History</h2>
      ${evs.length ? `<ul class="history">${evs.slice(0, 15).map(e => `<li><span>${verb[e.type] || e.type} ${e.qty > 1 ? e.qty : ''}</span><span class="muted small">${esc(fmtTime(e.at))}${e.by ? ' · ' + esc(e.by) : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
    </section>
    <div class="actions center"><a class="btn" href="#edit/${esc(it.id)}">Edit</a><button class="btn danger" data-act="delete" data-id="${esc(it.id)}">Delete</button></div>`;
}
const shopQuery = it => [it.brand, it.name].filter(Boolean).join(' ').replace(/\(.*?\)/g, '').trim();
function fmt(ymd) {
  const d = L.parseYmd(ymd);
  if (!d) return ymd || '';
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

// Add / edit form. S.draft holds the fields while the screen is open (so a sync from the family doesn't wipe it).
function blank() {
  return { id: null, name: '', brand: '', size: '', category: 'Other', location: 'Kitchen cabinet', qty: 1, expiry: '', openDays: '', lowAt: 0, barcode: '', photo: '' };
}
function viewForm(id) {
  const editing = !!id;
  if (!S.draft || S.draft._for !== (id || 'new')) {
    const it = id && S.items.get(id);
    S.draft = it ? { ...blank(), ...it, openDays: it.openDays ?? '', _for: id } : { ...blank(), _for: 'new' };
  }
  const d = S.draft;
  const opt = (list, v) => list.map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  return `<h1>${editing ? 'Edit item' : 'Add an item'}</h1>
    ${editing ? '' : `<div class="finder">
      <label for="f-find" class="lbl">What is it?</label>
      <input id="f-find" type="search" placeholder="e.g. soy sauce, Milo, Dynamo" autocomplete="off" value="">
      <ul id="sugg" class="sugg" role="listbox" aria-label="Suggestions"></ul>
      <div class="actions"><button class="btn" data-act="scan" type="button">📷 Scan barcode</button></div>
      <div id="scanner" class="scanner" hidden><video muted playsinline></video><p class="muted small" id="scan-msg">Point the camera at the barcode</p><div class="actions"><label class="btn">Use a photo<input type="file" accept="image/*" id="scan-file" hidden></label><button class="btn" type="button" data-act="scan-stop">Stop</button></div></div>
    </div>`}
    <form id="form" class="card form" novalidate>
      <div class="photo-row">
        <label class="photo-pick">${d.photo ? `<img src="${esc(d.photo)}" alt="Photo of the item">` : '<span>📷<br>Add photo</span>'}<input type="file" accept="image/*" capture="environment" id="f-photo" hidden></label>
        <div class="grow">
          <label class="lbl" for="f-name">Name</label><input id="f-name" name="name" required value="${esc(d.name)}" placeholder="Light soy sauce">
          <label class="lbl" for="f-brand">Brand</label><input id="f-brand" name="brand" value="${esc(d.brand)}" placeholder="Kikkoman">
        </div>
      </div>
      ${d.photo ? '<p class="small"><button type="button" class="linkbtn" data-act="photo-del">Remove photo</button></p>' : ''}
      <div class="two">
        <div><label class="lbl" for="f-size">Size</label><input id="f-size" name="size" value="${esc(d.size)}" placeholder="500 ml"></div>
        ${editing ? '' : `<div><label class="lbl" for="f-qty">How many</label><div class="stepper"><button type="button" data-act="step" data-d="-1" aria-label="One fewer">−</button><input id="f-qty" name="qty" type="number" inputmode="numeric" min="0" value="${esc(d.qty)}"><button type="button" data-act="step" data-d="1" aria-label="One more">+</button></div></div>`}
      </div>
      ${editing ? '' : `<label class="lbl" for="f-exp">Best before / use by</label>
      <input id="f-exp" name="expiry" type="date" value="${esc(d.expiry)}">
      <div class="chips quick">${quickDates().map(([l, v]) => `<button type="button" class="fchip" data-act="date" data-v="${v}" data-for="f-exp">${l}</button>`).join('')}<button type="button" class="fchip" data-act="date" data-v="" data-for="f-exp">No date</button></div>`}
      <div class="two">
        <div><label class="lbl" for="f-cat">Category</label><select id="f-cat" name="category">${opt(CATEGORIES, d.category)}</select></div>
        <div><label class="lbl" for="f-loc">Kept in</label><select id="f-loc" name="location">${opt(LOCATIONS, d.location)}</select></div>
      </div>
      <div class="two">
        <div><label class="lbl" for="f-open">Keeps once opened (days)</label><input id="f-open" name="openDays" type="number" inputmode="numeric" min="0" value="${esc(d.openDays)}" placeholder="—"></div>
        <div><label class="lbl" for="f-low">Shopping list when down to</label><input id="f-low" name="lowAt" type="number" inputmode="numeric" min="0" value="${esc(d.lowAt)}"></div>
      </div>
      <label class="lbl" for="f-bar">Barcode</label><input id="f-bar" name="barcode" inputmode="numeric" value="${esc(d.barcode)}" placeholder="optional">
      <div class="actions"><button class="btn primary" type="submit">${editing ? 'Save' : 'Add to pantry'}</button>${editing ? `<a class="btn" href="#item/${esc(id)}">Cancel</a>` : ''}</div>
    </form>`;
}
function quickDates() {
  const t = today();
  return [['+1 week', L.addDays(t, 7)], ['+1 month', L.addDays(t, 30)], ['+3 months', L.addDays(t, 91)], ['+6 months', L.addDays(t, 182)], ['+1 year', L.addDays(t, 365)]];
}

function viewShop() {
  const buy = L.toBuy(items(), eventsByItem());
  const manual = [...S.shop.values()].sort((a, b) => (a.done - b.done) || (a.at < b.at ? -1 : 1));
  const onList = new Set(manual.filter(m => m.itemId && !m.done).map(m => m.itemId));
  const suggested = buy.filter(b => !onList.has(b.item.id));
  const links = q => `<a class="mini" target="_blank" rel="noopener" href="${L.fairpriceUrl(q)}" aria-label="Search FairPrice for ${esc(q)}">FairPrice</a><a class="mini" target="_blank" rel="noopener" href="${L.shengSiongUrl(q)}" aria-label="Search Sheng Siong for ${esc(q)}">Sheng Siong</a>`;
  return `<h1>Shopping list</h1>
    <form id="shop-add" class="addline"><input id="shop-text" placeholder="Add something to buy" aria-label="Add something to buy" autocomplete="off"><button class="btn primary" type="submit">Add</button></form>
    <section class="card flush"><ul class="list shop">${manual.length ? manual.map(m => `<li class="row ${m.done ? 'done' : ''}">
        <label class="check"><input type="checkbox" data-act="shop-done" data-id="${esc(m.id)}" ${m.done ? 'checked' : ''}><span>${esc(m.name)}</span></label>
        <span class="links">${m.done ? `<button class="mini ghost" data-act="shop-del" data-id="${esc(m.id)}" aria-label="Remove ${esc(m.name)}">Remove</button>` : links(m.name)}</span></li>`).join('') : '<li class="row"><span class="muted">Nothing added by hand.</span></li>'}</ul>
      ${manual.some(m => m.done) ? '<p class="pad"><button class="linkbtn" data-act="shop-clear">Clear ticked items</button></p>' : ''}
    </section>
    <section class="card">
      <h2>Suggested from your pantry</h2>
      ${suggested.length ? `<ul class="list">${suggested.map(b => `<li class="row">
        <a class="row-main" href="#item/${esc(b.item.id)}">${thumb(b.item)}<span class="row-text"><span class="row-name">${esc(b.item.name)}</span><span class="row-sub">${sub(b.item)}</span><span class="chip ${b.why === 'out' ? 'expired' : 'soon'}">${whyText(b)}</span></span></a>
        <button class="mini" data-act="to-list" data-id="${esc(b.item.id)}" aria-label="Add ${esc(b.item.name)} to the list">+ List</button></li>`).join('')}</ul>` : '<p class="muted">Nothing is running low.</p>'}
    </section>
    <div class="actions center"><button class="btn" data-act="share-list">Share list</button></div>`;
}

function viewSettings() {
  const { configured } = S.cloudMod || {};
  let fam;
  if (!configured) {
    fam = `<p>Everything is saved on this phone only.</p><p class="muted small">To share one pantry with the family and sign in with Google, the Firebase project needs setting up once (see SETUP.md in the app's folder).</p>`;
  } else if (!S.user) {
    fam = `<p>Sign in with Google to share one pantry with your family. Only the people you add can see it.</p><p><button class="btn primary" data-act="signin">Sign in with Google</button></p>`;
  } else if (!S.household) {
    fam = `<p>Signed in as <b>${esc(S.user.email)}</b>.</p><p>You're not in a family pantry yet. Start one, or ask whoever started yours to add <b>${esc(S.user.email)}</b>, then tap Check again.</p>
      <div class="actions"><button class="btn primary" data-act="hh-create">Start our family pantry</button><button class="btn" data-act="hh-check">Check again</button></div>
      <p><button class="linkbtn" data-act="signout">Sign out</button></p>`;
  } else {
    const h = S.household;
    fam = `<p>Signed in as <b>${esc(S.user.email)}</b>. Sharing <b>${esc(h.name)}</b> with:</p>
      <ul class="members">${h.members.map(m => `<li><span>${esc(m)}${m === h.owner ? ' <span class="tag">started it</span>' : ''}</span>${m !== h.owner && m !== S.user.email ? `<button class="mini ghost" data-act="member-del" data-v="${esc(m)}" aria-label="Remove ${esc(m)}">Remove</button>` : ''}</li>`).join('')}</ul>
      <form id="member-add" class="addline"><input id="member-email" type="email" placeholder="family member's Gmail address" aria-label="Family member's Google email" autocomplete="off"><button class="btn" type="submit">Add</button></form>
      ${S.localCount ? `<p class="note">This phone still has ${S.localCount} item${S.localCount === 1 ? '' : 's'} saved from before you signed in. <button class="btn" data-act="copy-up">Copy them into the family pantry</button></p>` : ''}
      <p><button class="linkbtn" data-act="signout">Sign out</button></p>`;
  }
  return `<h1>Settings</h1>
    ${section('Family sharing', fam)}
    ${section('You', `<label class="lbl" for="s-name">Your name (shows in each item's history)</label><input id="s-name" value="${esc(prefs.get('name') || '')}" placeholder="${esc(S.user?.name?.split(' ')[0] || 'e.g. Mum')}">`)}
    ${section('Your data', `<div class="actions"><button class="btn" data-act="csv">Export list (CSV)</button><button class="btn" data-act="backup">Back up (JSON)</button><label class="btn">Restore backup<input type="file" accept="application/json,.json" id="restore" hidden></label></div>
      <div class="actions"><button class="btn" data-act="sample">Add sample items</button>${S.mode === 'local' ? '<button class="btn danger" data-act="wipe">Delete everything on this phone</button>' : ''}</div>`)}
    ${section('Put it on your home screen', `<p class="small">iPhone: Safari's Share button, then “Add to Home Screen”. Android: Chrome's ⋮ menu, then “Add to home screen” or “Install app”. It then opens like an app and works without signal.</p>`)}
    ${section('About', `<p class="muted small">Product suggestions are common Singapore supermarket goods; “keeps once opened” days are a rough guide, so check the label. Barcode lookups use Open Food Facts. Shop links open FairPrice and Sheng Siong's own search.</p>`)}
    <p class="ver muted small" id="ver"></p>
    <p class="ver small"><button class="linkbtn muted" data-act="refresh">Not updating? Get the latest version</button></p>`;
}

// ---- rendering and routing --------------------------------------------------------------------------------------

function route() {
  const h = location.hash.slice(1) || 'home';
  const [path, qs] = h.split('?');
  const [view, id] = path.split('/');
  return { view, id, qs: new URLSearchParams(qs || '') };
}
let lastView = '';
function render() {
  const r = route();
  if (r.qs.get('sort')) S.sort = r.qs.get('sort');
  const main = $('#view');
  const key = r.view + '/' + (r.id || '');
  const keepScroll = key === lastView;
  const y = scrollY;
  const focusId = document.activeElement?.id;
  if (r.view !== 'add' && r.view !== 'edit') S.draft = null;
  const views = { home: viewHome, items: viewItems, item: () => viewItem(r.id), add: () => viewForm(null), edit: () => viewForm(r.id), shop: viewShop, settings: viewSettings };
  main.innerHTML = (views[r.view] || viewHome)();
  for (const a of document.querySelectorAll('.tabs a')) a.setAttribute('aria-current', a.dataset.tab === (r.view === 'item' || r.view === 'edit' ? 'items' : r.view) ? 'page' : 'false');
  document.title = { home: 'Pantry', items: 'Items · Pantry', item: (S.items.get(r.id)?.name || 'Item') + ' · Pantry', add: 'Add · Pantry', edit: 'Edit · Pantry', shop: 'Shopping list · Pantry', settings: 'Settings · Pantry' }[r.view] || 'Pantry';
  if (keepScroll) { scrollTo(0, y); if (focusId && $('#' + focusId)) { const el = $('#' + focusId); el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); } }
  else scrollTo(0, 0);
  lastView = key;
  if (r.view === 'settings') showVersion();
  syncBadge();
}
function syncBadge() {
  const b = $('#sync');
  if (S.mode === 'cloud') { b.textContent = navigator.onLine ? 'Shared' : 'Offline'; b.className = 'sync ' + (navigator.onLine ? 'on' : 'off'); b.title = S.household?.name || ''; }
  else { b.textContent = 'This phone'; b.className = 'sync'; }
}

let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="linkbtn" id="undo">Undo</button>' : ''}`;
  t.hidden = false;
  if (undo) $('#undo').onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

// ---- the "bought" sheet ------------------------------------------------------------------------------------------

function boughtSheet(it) {
  const dlg = $('#sheet');
  dlg.innerHTML = `<form method="dialog" id="bought-form" class="sheet">
    <h2>Bought: ${esc(it.name)}</h2>
    <label class="lbl" for="b-qty">How many</label>
    <div class="stepper"><button type="button" data-act="step" data-d="-1" data-for="b-qty" aria-label="One fewer">−</button><input id="b-qty" type="number" inputmode="numeric" min="1" value="1"><button type="button" data-act="step" data-d="1" data-for="b-qty" aria-label="One more">+</button></div>
    <label class="lbl" for="b-exp">Best before / use by</label>
    <input id="b-exp" type="date">
    <div class="chips quick">${quickDates().map(([l, v]) => `<button type="button" class="fchip" data-act="date" data-v="${v}" data-for="b-exp">${l}</button>`).join('')}</div>
    <div class="actions"><button class="btn primary" value="ok">Add to stock</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div>
  </form>`;
  dlg.returnValue = '';
  dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    const qty = Math.max(1, parseInt($('#b-qty', dlg).value, 10) || 1);
    const res = L.addStock(S.items.get(it.id), { qty, expiry: $('#b-exp', dlg).value || null, by: who() });
    apply(res, `Added ${qty} ${it.name}`);
    // tick it off the hand-made list too
    for (const m of S.shop.values()) if (m.itemId === it.id && !m.done) save('shop', { ...m, done: true });
    render();
  };
}

// ---- the add form: suggestions, barcode, photo --------------------------------------------------------------------

function suggestions(q) {
  const out = [];
  if (!q.trim()) return out;
  for (const it of items()) {
    const s = L.score(q, `${it.name} ${it.brand}`);
    if (s) out.push({ s: s + 2, mine: it });
  }
  for (const c of CATALOGUE) {
    const s = L.score(q, `${c.name} ${c.brand} ${c.category}`);
    if (s) out.push({ s, cat: c });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 8);
}
function showSugg() {
  const q = $('#f-find')?.value || '';
  const ul = $('#sugg');
  if (!ul) return;
  const list = suggestions(q);
  ul.innerHTML = list.map((x, i) => x.mine
    ? `<li><button type="button" data-act="sugg-mine" data-id="${esc(x.mine.id)}">${thumb(x.mine, 'thumb sm')}<span><b>${esc(x.mine.name)}</b><small>${sub(x.mine)} · in your pantry (${L.totalQty(x.mine)})</small></span></button></li>`
    : `<li><button type="button" data-act="sugg" data-i="${CATALOGUE.indexOf(x.cat)}"><span class="thumb sm emoji" aria-hidden="true">${ICON[x.cat.category] || '📦'}</span><span><b>${esc(x.cat.name)}</b><small>${[x.cat.brand, x.cat.size].filter(Boolean).map(esc).join(' · ')}</small></span></button></li>`).join('')
    + (q.trim() ? `<li class="shoplinks"><span class="muted small">Look it up:</span> <a target="_blank" rel="noopener" href="${L.fairpriceUrl(q)}">FairPrice ↗</a> <a target="_blank" rel="noopener" href="${L.shengSiongUrl(q)}">Sheng Siong ↗</a></li>` : '');
}
function readForm() {
  const f = $('#form');
  if (!f || !S.draft) return;
  for (const el of f.elements) if (el.name) S.draft[el.name] = el.value;
}
function fillDraft(fields) {
  readForm();
  Object.assign(S.draft, fields);
  render();
}

let scanning = null;
async function startScan() {
  const box = $('#scanner');
  box.hidden = false;
  const msg = $('#scan-msg');
  try {
    const { scanVideo } = await import('./scan.js');
    scanning = scanVideo($('video', box));
    const code = await scanning.done;
    scanning = null;
    if (code) await gotBarcode(code);
  } catch (e) {
    msg.textContent = /Permission|NotAllowed/i.test(e?.name + e?.message) ? 'Camera blocked. Allow the camera, or use a photo of the barcode.' : 'No live camera here. Use a photo of the barcode instead.';
  }
}
async function gotBarcode(code) {
  const mine = items().find(i => i.barcode === code);
  if (mine) { location.hash = '#item/' + mine.id; toast(`Found ${mine.name}`); setTimeout(() => boughtSheet(mine), 50); return; }
  toast('Looking up the barcode…');
  const { lookup } = await import('./scan.js');
  const p = await lookup(code);
  if (!p) { fillDraft({ barcode: code }); toast('Barcode saved. Type the name once and it will be known next time.'); $('#f-name')?.focus(); return; }
  fillDraft({ barcode: code, name: p.name, brand: p.brand, size: p.size });
  toast(`Found: ${p.name}`);
  if (p.image && !S.draft.photo) {
    const { fromUrl } = await import('./photo.js');
    const ph = await fromUrl(p.image);
    if (ph && S.draft) fillDraft({ photo: ph });
  }
}

function submitForm(e) {
  e.preventDefault();
  readForm();
  const d = S.draft;
  if (!d.name.trim()) { $('#f-name').focus(); toast('Give it a name'); return; }
  const base = d._for !== 'new' ? S.items.get(d._for) : null;
  const it = {
    ...(base || { id: L.uid(), batches: [], createdAt: new Date().toISOString() }),
    name: d.name.trim(), brand: d.brand.trim(), size: d.size.trim(), category: d.category, location: d.location,
    openDays: d.openDays === '' || d.openDays == null ? null : Math.max(0, parseInt(d.openDays, 10) || 0) || null,
    lowAt: Math.max(0, parseInt(d.lowAt, 10) || 0), barcode: String(d.barcode || '').trim(), photo: d.photo || '',
  };
  S.draft = null;
  if (base) { save('items', it); location.hash = '#item/' + it.id; toast('Saved'); return; }
  const qty = Math.max(0, parseInt(d.qty, 10) || 0);
  if (qty > 0) {
    const res = L.addStock(it, { qty, expiry: d.expiry || null, by: who() });
    save('items', res.item); save('events', res.event);
  } else save('items', it);
  location.hash = '#item/' + it.id;
  toast(`Added ${it.name}`);
}

// ---- clicks ---------------------------------------------------------------------------------------------------

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  const it = id && S.items.get(id);
  switch (act) {
    case 'use': return apply(L.takeOut(it, { type: 'use', by: who() }), `Used up 1 ${it.name}`);
    case 'use-b': return apply(L.takeOut(it, { type: 'use', by: who(), batchId: b.dataset.b }), `Used up 1 ${it.name}`);
    case 'toss-b': return apply(L.takeOut(it, { type: 'discard', by: who(), batchId: b.dataset.b }), `Threw away 1 ${it.name}`);
    case 'open': return apply(L.openOne(it, { by: who() }), `Opened 1 ${it.name}`);
    case 'open-b': return apply(L.openOne(it, { by: who(), batchId: b.dataset.b }), `Opened 1 ${it.name}`);
    case 'bought': return boughtSheet(it);
    case 'to-list': {
      if ([...S.shop.values()].some(m => m.itemId === id && !m.done)) return toast('Already on the list');
      save('shop', { id: L.uid(), name: [it.brand, it.name].filter(Boolean).join(' '), itemId: id, done: false, at: new Date().toISOString(), by: who() });
      render(); return toast('Added to the shopping list');
    }
    case 'delete': {
      if (!confirm(`Delete ${it.name} and its history?`)) return;
      remove('items', id);
      for (const ev of eventsFor(id)) remove('events', ev.id);
      location.hash = '#items';
      return toast('Deleted');
    }
    case 'where': S.where = b.dataset.v; return render();
    case 'sample': {
      const data = sampleData(who());
      for (const k of ['items', 'events']) for (const o of data[k]) save(k, o);
      render(); return toast(`Added ${data.items.length} sample items`);
    }
    case 'step': {
      const inp = $('#' + (b.dataset.for || 'f-qty'));
      inp.value = Math.max(Number(inp.min) || 0, (parseInt(inp.value, 10) || 0) + Number(b.dataset.d));
      return;
    }
    case 'date': {
      $('#' + b.dataset.for).value = b.dataset.v;
      b.parentElement.querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x === b));
      return;
    }
    case 'sugg': {
      const c = CATALOGUE[Number(b.dataset.i)];
      fillDraft({ name: c.name, brand: c.brand, size: c.size, category: c.category, location: c.location, openDays: c.openDays ?? '' });
      return $('#f-exp')?.focus();
    }
    case 'sugg-mine': location.hash = '#item/' + id; return setTimeout(() => boughtSheet(S.items.get(id)), 50);
    case 'photo-del': return fillDraft({ photo: '' });
    case 'scan': return startScan();
    case 'scan-stop': scanning?.cancel(); $('#scanner').hidden = true; return;
    case 'shop-done': {
      const m = S.shop.get(id);
      save('shop', { ...m, done: b.checked });
      if (b.checked && m.itemId && S.items.get(m.itemId)) boughtSheet(S.items.get(m.itemId));
      return render();
    }
    case 'shop-del': remove('shop', id); return render();
    case 'shop-clear': for (const m of [...S.shop.values()]) if (m.done) remove('shop', m.id); return render();
    case 'share-list': {
      const lines = [...S.shop.values()].filter(m => !m.done).map(m => '• ' + m.name);
      for (const x of L.toBuy(items(), eventsByItem())) if (!S.shop.size || ![...S.shop.values()].some(m => m.itemId === x.item.id)) lines.push('• ' + [x.item.brand, x.item.name].filter(Boolean).join(' '));
      const text = 'Shopping list\n' + (lines.join('\n') || '(empty)');
      if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelled */ } return; }
      try { await navigator.clipboard.writeText(text); toast('Copied the list'); } catch { toast('Could not copy'); }
      return;
    }
    case 'csv': return download('pantry.csv', L.toCsv(items()), 'text/csv');
    case 'backup': return download(`pantry-backup-${today()}.json`, JSON.stringify({ app: 'pantry', v: 1, items: [...S.items.values()], events: [...S.events.values()], shop: [...S.shop.values()] }), 'application/json');
    case 'wipe': {
      if (!confirm('Delete every item, history and list on this phone?')) return;
      await S.local.clear();
      for (const k of ['items', 'events', 'shop']) S[k].clear();
      render(); return toast('Deleted everything on this phone');
    }
    case 'refresh': return getLatest();
    case 'signin': try { await S.cloudMod.signIn(); } catch (err) { toast('Sign-in did not finish: ' + (err?.code || err?.message || err)); } return;
    case 'signout': {
      if (!confirm('Sign out? This phone goes back to its own separate pantry.')) return;
      await S.cloudMod.signOut(); return;
    }
    case 'hh-create': {
      const h = await S.cloudMod.createHousehold(S.user.email, 'Our pantry');
      return useHousehold(h);
    }
    case 'hh-check': {
      const h = await S.cloudMod.findHousehold(S.user.email);
      if (!h) return toast('Not added yet');
      return useHousehold(h);
    }
    case 'member-del': {
      if (!confirm(`Stop sharing with ${b.dataset.v}?`)) return;
      await S.cloudMod.setMembers(S.household.id, S.household.members.filter(m => m !== b.dataset.v));
      return;
    }
    case 'copy-up': {
      const data = await S.local.load();
      for (const k of ['items', 'events', 'shop']) await S.backend.putMany(k, data[k]);
      await S.local.clear();
      S.localCount = 0;
      return toast(`Copied ${data.items.length} items into the family pantry`);
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
  if (t.id === 'sort') { S.sort = t.value; if (location.hash.includes('sort=')) location.hash = '#items'; return render(); }
  if (t.id === 's-name') { prefs.set('name', t.value.trim()); return toast('Saved'); }
  if (t.id === 'f-photo' && t.files[0]) {
    const { shrink } = await import('./photo.js');
    return fillDraft({ photo: await shrink(t.files[0]) });
  }
  if (t.id === 'scan-file' && t.files[0]) {
    try {
      const { scanFile } = await import('./scan.js');
      scanning?.cancel();
      const code = await scanFile(t.files[0]);
      if (code) return gotBarcode(code);
      $('#scan-msg').textContent = 'No barcode found in that photo. Try closer, flat and in focus.';
    } catch { $('#scan-msg').textContent = 'Could not read barcodes on this phone. Type the number into Barcode below.'; }
    return;
  }
  if (t.id === 'restore' && t.files[0]) {
    try {
      const j = JSON.parse(await t.files[0].text());
      if (j.app !== 'pantry') throw new Error('not a pantry backup');
      let n = 0;
      for (const k of ['items', 'events', 'shop']) for (const o of j[k] || []) if (o && o.id) { save(k, o); n++; }
      render(); toast(`Restored ${j.items?.length || 0} items`);
    } catch (err) { toast('That file is not a pantry backup'); }
  }
}
function onInput(e) {
  if (e.target.id === 'q') { S.q = e.target.value; render(); }
  if (e.target.id === 'f-find') showSugg();
}
async function onSubmit(e) {
  if (e.target.id === 'form') return submitForm(e);
  if (e.target.id === 'shop-add') {
    e.preventDefault();
    const v = $('#shop-text').value.trim();
    if (!v) return;
    const mine = items().find(i => L.norm(i.name) === L.norm(v) || L.norm(`${i.brand} ${i.name}`) === L.norm(v));
    save('shop', { id: L.uid(), name: v, itemId: mine?.id || null, done: false, at: new Date().toISOString(), by: who() });
    render();
    return $('#shop-text').focus();
  }
  if (e.target.id === 'member-add') {
    e.preventDefault();
    const v = $('#member-email').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast('Type their Google email address');
    await S.cloudMod.setMembers(S.household.id, [...S.household.members, v]);
    return toast(`Added ${v}. They sign in with that Google account to see the pantry.`);
  }
}

// ---- app version (settings footer) -----------------------------------------------------------------------------

async function showVersion() {
  try {
    const k = (await caches.keys()).find(x => x.startsWith('pantry-'));
    if (!k) return;
    const rest = k.slice('pantry-'.length);
    const m = rest.match(/^(\d{4}-\d{2}-\d{2})-(\w+)$/);
    const el = $('#ver');
    if (el) el.textContent = 'App version ' + (m ? `${m[1]} (${m[2]})` : rest);
  } catch { /* no caches */ }
}
async function getLatest() {
  try { const r = await fetch('sw.js', { cache: 'no-store' }); if (!r.ok) throw 0; }
  catch { return toast('No signal. Try again when online; nothing was changed.'); }
  const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
  const scope = new URL('./', location.href).href;
  for (const r of regs) if (r.scope === scope) await r.unregister();
  for (const k of await caches.keys()) if (k.startsWith('pantry-')) await caches.delete(k);
  location.reload();
}

// ---- start ----------------------------------------------------------------------------------------------------

function loadInto(data) {
  for (const k of ['items', 'events', 'shop']) { S[k].clear(); for (const o of data[k] || []) S[k].set(o.id, o); }
}
function onRemote(kind, docs, removed) {
  for (const d of docs) S[kind].set(d.id, d);
  for (const id of removed) S[kind].delete(id);
  const v = route().view;
  if (v !== 'add' && v !== 'edit' && !$('#sheet').open) render();
}

async function useHousehold(h) {
  S.household = h;
  prefs.set('household', h.id);
  S.backend?.close?.();
  S.backend = await S.cloudMod.openCloud(h.id);
  S.mode = 'cloud';
  loadInto(await S.backend.load());
  S.backend.listen(onRemote);
  S.cloudMod.watchHousehold(h.id, x => { if (x) { S.household = x; if (route().view === 'settings') render(); } });
  const local = await S.local.load();
  S.localCount = local.items.length;
  render();
}
async function useLocal() {
  S.backend?.close?.();
  S.backend = S.local;
  S.mode = 'local';
  S.household = null;
  loadInto(await S.local.load());
  render();
}

async function start() {
  S.local = await openLocal();
  S.backend = S.local;
  loadInto(await S.local.load());
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  addEventListener('hashchange', () => { scanning?.cancel(); render(); });
  addEventListener('online', syncBadge);
  addEventListener('offline', syncBadge);
  render();
  // Family sharing, only when a Firebase project is set up (config.js)
  try {
    S.cloudMod = await import('./cloud.js');
    if (S.cloudMod.configured) {
      if (new URLSearchParams(location.search).has('emulator')) window.__pantry = { S, signIn: S.cloudMod.emulatorSignIn };
      S.cloudMod.onUser(async u => {
        S.user = u;
        if (!u) { if (S.mode !== 'local') await useLocal(); else render(); return; }
        let h = null;
        try { h = await S.cloudMod.findHousehold(u.email); } catch (e) { console.warn(e); }
        if (h) await useHousehold(h); else render();
      });
    }
  } catch (e) { console.warn('sharing unavailable', e); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__pantry = { ...(window.__pantry || {}), S };
}
start();
