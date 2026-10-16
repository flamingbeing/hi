// Home design system: the behaviour that goes with app.css (DESIGN-APP.md). An ES module, no dependencies.
//   import { haRouter, haGo, haBack, haSheet, haToast, haVersion } from '/homedesign/app.js';
// It knows nothing about any app's data. Every screen and every sheet is a history entry (hash routes), so the iOS
// edge swipe and the Android back button always do the expected thing.

const doc = document, root = doc.documentElement;
export const haReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const haEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// iOS shows :active press states only when the page listens for touches.
doc.addEventListener('touchstart', () => {}, { passive: true });

// ---------- icons ----------
// The sprite's address: icons.svg next to this module (so /homedesign/icons.svg on every host). Override with
// haIcons.base = '/somewhere/icons.svg' if an app vendors the kit elsewhere.
export const haIcons = { base: new URL('icons.svg', import.meta.url).pathname };
// An icon as markup. Decorative (aria-hidden) unless a label is given.
export function haIcon(name, { label = '', cls = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${haEsc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="ha-icon home-icon${cls ? ' ' + haEsc(cls) : ''}" viewBox="0 0 24 24" ${a11y}><use href="${haEsc(haIcons.base)}#i-${haEsc(name)}"/></svg>`;
}

// ---------- small helpers ----------
// A short vibration on Android where allowed; nothing on iOS (no API) or with reduced motion.
export function haHaptic(ms = 10) {
  try { if (!haReducedMotion() && navigator.vibrate && /android/i.test(navigator.userAgent)) navigator.vibrate(ms); } catch { /* not allowed */ }
}
// Say something to screen readers (uses one shared polite live region).
let liveEl = null;
export function haAnnounce(text) {
  if (!liveEl) { liveEl = doc.createElement('div'); liveEl.className = 'ha-sr'; liveEl.setAttribute('aria-live', 'polite'); doc.body.append(liveEl); }
  liveEl.textContent = ''; setTimeout(() => { liveEl.textContent = text; }, 40);
}

// ---------- toast ----------
// haToast('Milk removed', { action: 'Undo', onAction: () => restore() }) -> { hide }
// One at a time, above the tab bar. 4 s, or 6 s when there is an action to take.
let toastEl = null, toastTimer = 0;
export function haToast(text, { action = '', onAction, ms } = {}) {
  if (!toastEl) {
    toastEl = doc.createElement('div');
    toastEl.className = 'ha-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
    doc.body.append(toastEl);
  }
  clearTimeout(toastTimer);
  const span = doc.createElement('span'); span.className = 'ha-toast-text'; span.textContent = text;
  toastEl.replaceChildren(span);
  if (action) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'ha-toast-action'; b.textContent = action;
    b.addEventListener('click', () => { haHideToast(); onAction?.(); });
    toastEl.append(b);
  }
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));
  toastTimer = setTimeout(haHideToast, ms ?? (action ? 6000 : 4000));
  return { hide: haHideToast };
}
export function haHideToast() { clearTimeout(toastTimer); toastEl?.classList.remove('is-visible'); }

// ---------- bottom sheets ----------
// haSheet(options) builds a sheet; haSheet(dialogEl) opens one written in the page's markup.
// options: { title, body (HTML string or Node), footer (HTML or Node), detent: '' | 'medium' | 'large',
//            closeLabel = 'Done', lead (HTML for a leading head button, e.g. Cancel), grey, onClose(value) }
// Returns { el, close(value), closed } (closed is a Promise of the value). Opening pushes a history entry, so back
// closes it; Escape, a tap on the backdrop, [data-ha-close] buttons and dragging the head down close it too.
// Focus moves to the title, and back to the opener afterwards.
let sheetSeq = 0;
const openSheets = [];
export const haSheetOpen = () => openSheets.length > 0;
export function haSheet(src = {}, more = {}) {
  let d;
  if (src instanceof HTMLDialogElement) d = src;
  else {
    const o = src, id = 'ha-sheet-' + (++sheetSeq);
    d = doc.createElement('dialog');
    d.className = 'ha-sheet' + (o.detent ? ' ha-sheet--' + o.detent : '') + (o.grey ? ' ha-sheet--grey' : '');
    d.id = id; d.dataset.haBuilt = '';
    d.innerHTML = `<span class="ha-sheet-grabber" aria-hidden="true"></span>
      <div class="ha-sheet-head">${o.lead || '<span></span>'}<h2 class="ha-sheet-title" id="${id}-t" tabindex="-1">${haEsc(o.title)}</h2><button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-ha-close>${haEsc(o.closeLabel || 'Done')}</button></div>
      <div class="ha-sheet-body"></div>`;
    d.setAttribute('aria-labelledby', id + '-t');
    const body = d.querySelector('.ha-sheet-body');
    if (o.body instanceof Node) body.append(o.body); else body.innerHTML = o.body || '';
    if (o.footer) {
      const f = doc.createElement('div'); f.className = 'ha-sheet-foot';
      if (o.footer instanceof Node) f.append(o.footer); else f.innerHTML = o.footer;
      d.append(f);
    }
    more = { onClose: o.onClose };
    doc.body.append(d);
  }
  if (!d.id) d.id = 'ha-sheet-' + (++sheetSeq);
  if (openSheets.includes(d)) return d._ha;
  d.classList.add('ha-sheet');
  d._haTrigger = doc.activeElement;
  d._haOnClose = more.onClose;
  let resolve; const closed = new Promise(r => { resolve = r; });
  d._haResolve = resolve;
  d._ha = { el: d, close: v => haCloseSheet(d, v), closed };
  if (!d._haWired) wireSheet(d);
  d.style.transform = '';
  d.showModal();
  openSheets.push(d);
  history.pushState({ ...(history.state || {}), haSheet: d.id }, '', location.href);
  const title = d.querySelector('.ha-sheet-title');
  if (title && !d.querySelector('[autofocus]')) { title.tabIndex = -1; requestAnimationFrame(() => title.focus({ preventScroll: true })); }
  return d._ha;
}
// Close a sheet and pop its history entry. Resolves when it has gone.
export function haCloseSheet(d, value) {
  if (!d || !openSheets.includes(d)) return Promise.resolve(value);
  d._haValue = value;
  const done = d._ha.closed;
  if (history.state?.haSheet === d.id) history.back();   // popstate finishes it
  else finishSheet(d);
  return done;
}
// Close every sheet without touching history (a route change, a sign-out).
export function haCloseAllSheets() { for (const d of [...openSheets].reverse()) finishSheet(d, true); }
function finishSheet(d, silent) {
  const i = openSheets.indexOf(d); if (i < 0) return;
  openSheets.splice(i, 1);
  d.classList.remove('is-dragging'); d.style.transform = '';
  if (d.open) d.close();
  if ('haBuilt' in d.dataset) setTimeout(() => d.remove(), haReducedMotion() ? 0 : 450);
  if (!silent && d._haTrigger && doc.contains(d._haTrigger)) d._haTrigger.focus({ preventScroll: true });
  const v = d._haValue; d._haValue = undefined;
  d._haOnClose?.(v);
  d._haResolve(v);
}
addEventListener('popstate', () => {
  const want = history.state?.haSheet;
  for (const d of [...openSheets].reverse()) { if (d.id === want) break; finishSheet(d); }
});
function wireSheet(d) {
  d._haWired = true;
  d.addEventListener('cancel', e => { e.preventDefault(); haCloseSheet(d); });                       // Escape
  d.addEventListener('click', e => {
    if (e.target === d) {                                                                            // the backdrop
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) haCloseSheet(d);
      return;
    }
    const b = e.target.closest('[data-ha-close]');
    if (b && d.contains(b)) { e.preventDefault(); haCloseSheet(d, b.value || undefined); }
  });
  // drag the grabber or head down past a third of the sheet (or flick it) to close
  let y0 = null, dy = 0, t0 = 0;
  const down = e => { if (e.target.closest('button, a, input, select, textarea')) return; y0 = e.clientY; dy = 0; t0 = e.timeStamp; d.classList.add('is-dragging'); };
  const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); d.style.transform = `translateY(${dy}px)`; };
  const up = e => {
    if (y0 == null) return;
    const v = dy / Math.max(1, e.timeStamp - t0); y0 = null; d.classList.remove('is-dragging');
    if (dy > Math.min(160, d.offsetHeight / 3) || (v > 0.6 && dy > 30)) haCloseSheet(d); else d.style.transform = '';
  };
  for (const h of d.querySelectorAll('.ha-sheet-head, .ha-sheet-grabber')) h.addEventListener('pointerdown', down);
  d.addEventListener('pointermove', move); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
}
// A yes/no question as a sheet. Resolves true for the main button.
export function haConfirm({ title, text = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  const s = haSheet({
    title, closeLabel: cancel,
    body: `<p class="ha-text">${haEsc(text)}</p>`,
    footer: `<div class="ha-btn-row"><button type="button" class="ha-btn ha-btn--outline" data-ha-close value="no">${haEsc(cancel)}</button><button type="button" class="ha-btn ${danger ? 'ha-btn--danger' : 'ha-btn--primary'}" data-ha-close value="yes">${haEsc(ok)}</button></div>`,
  });
  return s.closed.then(v => v === 'yes');
}

// ---------- screens: hash routes with native-feeling transitions ----------
// haRouter({ render, tabs }) starts it: render(route) draws the screen for route = { hash, path, parts, nav }, where
// nav is 'push', 'pop', 'tab' or 'none' (first paint). Links to '#/…' are followed by the router; tab links (inside
// .ha-tabbar) get aria-current="page" when the route's first part matches theirs; tabOf(route) can name the tab for a
// pushed screen instead (tabOf: r => r.parts[0] === 'item' ? '#/' : r.hash).
// haGo('#/item/3') pushes a screen; haBack('#/') goes back (or to the fallback when there is no screen to go back to).
let router = null, current = null;
const depth = () => history.state?.haDepth || 0;
function parse(hash) {
  const h = hash && hash.startsWith('#/') ? hash : '#/';
  const path = h.slice(1).split('?')[0];
  return { hash: h, path, parts: path.split('/').filter(Boolean) };
}
function paint(nav) {
  const route = { ...parse(location.hash), nav };
  if (current && current.hash === route.hash && nav !== 'none') return;
  current = route;
  const run = () => {
    const bar = doc.querySelector('.ha-bar'); bar?.classList.add('ha-bar--instant');
    router.render(route);
    markTabs(route);
    if (nav !== 'none') scrollTo(0, 0);
    haLargeTitle();
    requestAnimationFrame(() => requestAnimationFrame(() => bar?.classList.remove('ha-bar--instant')));
  };
  haTransition(run, nav);
}
function markTabs(route) {
  const want = router.tabOf ? parse(router.tabOf(route)).parts[0] || '' : route.parts[0] || '';
  for (const a of doc.querySelectorAll(router.tabs + ' a[href^="#/"]')) {
    const p = parse(a.getAttribute('href')).parts[0] || '';
    if (want === p) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}
// Run fn (which changes the screen) inside a slide: 'push' from the right, 'pop' back, 'tab' a quick fade.
export function haTransition(fn, nav = 'push') {
  if (!doc.startViewTransition || haReducedMotion() || nav === 'none' || doc.visibilityState === 'hidden') { fn(); return Promise.resolve(); }
  root.dataset.haNav = nav;
  const t = doc.startViewTransition(fn);
  return t.finished.catch(() => {}).finally(() => { delete root.dataset.haNav; });
}
export function haRouter({ render, tabs = '.ha-tabbar', tabOf } = {}) {
  router = { render, tabs, tabOf };
  // start on a real route ('#/'), so going back to the first screen never lands on a bare URL
  const start = parse(location.hash).hash;
  history.replaceState({ ...(history.state || {}), haDepth: history.state?.haDepth || 0 }, '', location.hash === start ? location.href : start);
  addEventListener('popstate', () => { if (parse(location.hash).hash !== current?.hash) { haCloseAllSheets(); paint('pop'); } });
  // follow in-app links ourselves, so each one is a history entry with a known depth
  doc.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    e.preventDefault();
    haGo(a.getAttribute('href'), { nav: a.closest(tabs) ? 'tab' : 'push' });
  });
  paint('none');
  return { get route() { return current; }, refresh: () => { current = null; paint('none'); } };
}
export function haGo(hash, { replace = false, nav = 'push' } = {}) {
  const h = parse(hash).hash;
  if (!router) { location.hash = h; return; }
  if (h === current?.hash) return;
  const sheetOnTop = !!history.state?.haSheet;
  haCloseAllSheets();
  const state = { haDepth: replace ? depth() : depth() + 1 };   // a sheet's entry is replaced by the new screen
  if (replace || sheetOnTop) history.replaceState(state, '', h); else history.pushState(state, '', h);
  paint(nav);
}
export function haBack(fallback = '#/') {
  if (depth() > 0) history.back();
  else { history.replaceState({ haDepth: 0 }, '', parse(fallback).hash); paint('pop'); }
}

// ---------- large title that collapses into the bar ----------
// Call after drawing a screen (the router does it for you). The bar turns translucent and shows its small title once
// the visible .ha-large-title has scrolled under it; a screen with no large title gets the solid bar at once.
let titleIO = null;
export function haLargeTitle() {
  titleIO?.disconnect();
  const bar = doc.querySelector('.ha-bar'); if (!bar) return;
  const big = [...doc.querySelectorAll('.ha-large-title')].find(el => el.getClientRects().length);
  if (!big || !('IntersectionObserver' in window)) { bar.classList.toggle('is-collapsed', !big); return; }
  bar.classList.remove('is-collapsed');
  titleIO = new IntersectionObserver(([e]) => bar.classList.toggle('is-collapsed', !e.isIntersecting), { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` });
  titleIO.observe(big);
}

// ---------- stepper ----------
// Markup: <div class="ha-stepper" role="group" aria-label="Quantity"><button data-step="-1" aria-label="Fewer">…</button>
//         <output>1</output><button data-step="1" aria-label="More">…</button></div>
// haStepper(el, { min, max, step, onChange }) -> { get(), set(v) }
export function haStepper(el, { min = 0, max = 99, step = 1, onChange } = {}) {
  const out = el.querySelector('output');
  const less = el.querySelector('[data-step="-1"]'), more = el.querySelector('[data-step="1"]');
  const get = () => Number(out.textContent) || 0;
  const sync = () => { less.setAttribute('aria-disabled', String(get() <= min)); more.setAttribute('aria-disabled', String(get() >= max)); };
  const set = v => { out.textContent = String(Math.min(max, Math.max(min, v))); sync(); };
  out.setAttribute('aria-live', 'polite');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    const v = get(), n = Math.min(max, Math.max(min, v + Number(b.dataset.step) * step));
    if (n === v) return;
    set(n); haHaptic(); onChange?.(n);
  });
  sync();
  return { get, set };
}

// ---------- app version lines (every app with a service worker, at the end of settings) ----------
// haVersion(el, 'pantry') fills el with:
//   App version 2026-10-14 (3f9a2c1d)          read from the cache named 'pantry-2026-10-14-3f9a2c1d'
//   Not updating? Get the latest version        a link-styled button
// The button first fetches the app's sw.js with cache: 'no-store'. No signal: it says so and changes nothing.
// Otherwise it unregisters only this app's service worker, deletes only caches starting 'pantry-', and reloads.
// Saved data (localStorage, IndexedDB, sign-in) is never touched.
// options: { swUrl = 'sw.js' (relative to the page), reload = () => location.reload() }
export async function haVersion(el, prefix, { swUrl = 'sw.js', reload = () => location.reload() } = {}) {
  if (!el) return;
  const pre = prefix.endsWith('-') ? prefix : prefix + '-';
  el.classList.add('ha-version');
  el.innerHTML = '<p class="ha-version-text" hidden></p><button type="button" class="ha-version-btn">Not updating? Get the latest version</button><p class="ha-version-msg" role="status"></p>';
  const text = el.querySelector('.ha-version-text'), btn = el.querySelector('.ha-version-btn'), msg = el.querySelector('.ha-version-msg');
  btn.addEventListener('click', async () => {
    btn.disabled = true; msg.textContent = 'Checking…';
    const sw = new URL(swUrl, location.href);
    let res = null;
    try {
      const check = new URL(sw); check.searchParams.set('ha-check', Date.now());
      res = await fetch(check, { cache: 'no-store' });
    } catch { /* offline */ }
    if (!res?.ok) {
      msg.textContent = res ? 'The app could not be reached, so nothing was changed. Try again later.'
        : 'No signal, so nothing was changed. Try again when you are online.';
      btn.disabled = false; return;
    }
    try {
      if ('serviceWorker' in navigator) {
        for (const reg of await navigator.serviceWorker.getRegistrations()) {
          const urls = [reg.active, reg.waiting, reg.installing].filter(Boolean).map(w => w.scriptURL.split('?')[0]);
          if (urls.includes(sw.href.split('?')[0])) await reg.unregister();
        }
      }
      if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith(pre)) await caches.delete(k);
    } catch { /* storage blocked: reloading still fetches fresh files */ }
    msg.textContent = 'Getting the latest version…';
    reload();
  });
  try {
    const key = ('caches' in window) ? (await caches.keys()).find(k => k.startsWith(pre)) : null;
    if (key) {
      const v = key.slice(pre.length), m = v.match(/^(\d{4}-\d{2}-\d{2})-([0-9a-f]+)$/);
      text.textContent = 'App version ' + (m ? `${m[1]} (${m[2]})` : v);
      text.hidden = false;
    }
  } catch { /* no cache storage (private window, old browser): no version line */ }
}
