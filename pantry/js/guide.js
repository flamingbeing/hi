// Pantry: help for first-time users. Two parts, kept here so app.js stays small:
// 1. The welcome: a short, skippable sheet of three or four cards (what it's for, the home screen, family sharing,
//    the first item), shown once per phone (localStorage 'pantry:welcomed'). Never in ?demo unless ?welcome is added;
//    never for someone who already uses the app (items, a family pantry or a name on this phone). Someone opening an
//    invite (the link ends #/settings) gets a shorter version that ends at Sign in. Skip, back, Escape or dragging
//    the sheet down all close it, and it never comes back on its own ("Show the welcome again" in Settings).
// 2. The guide screen (#/guide, "How to use the pantry"): short grouped sections, linked from Settings and from the
//    empty Home screen.
// Everything is kit components (/homedesign/); the few own styles are pa-w* and pa-dots in pantry.css.
import { haSheet, haCloseSheet, haIcon as icon, haEsc as esc, haAnnounce } from '/homedesign/app.js';
import { prefs } from './store.js';

const FLAG = 'welcomed';   // prefs key: localStorage 'pantry:welcomed'
export const welcomed = () => !!prefs.get(FLAG, false);
export const markWelcomed = () => prefs.set(FLAG, true);
// Running from the home screen already (no need for the home-screen card).
export function installed() {
  try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; }
}

const row = (iconName, title, sub = '', trail = '') => `<li><div class="ha-row"><span class="ha-row-icon">${icon(iconName)}</span>
  <span class="ha-row-body"><span class="ha-row-title">${title}</span>${sub ? `<span class="ha-row-sub">${sub}</span>` : ''}</span>${trail}</div></li>`;
const plainRow = (title, sub = '', trail = '') => `<li><div class="ha-row"><span class="ha-row-body"><span class="ha-row-title">${title}</span>${sub ? `<span class="ha-row-sub">${sub}</span>` : ''}</span>${trail ? `<span class="ha-row-trail">${trail}</span>` : ''}</div></li>`;
const list = rows => `<ul class="ha-list">${rows.join('')}</ul>`;

// ---------- the welcome ----------

const FOR = list([
  row('box', 'What’s at home', 'In the fridge, freezer and cupboards'),
  row('clock', 'What to use first', 'Things near their date come to the top'),
  row('cart', 'What to buy', 'Running low goes on the shopping list'),
]);
const CARDS = {
  intro: {
    icon: 'home', title: 'Welcome to the pantry',
    text: 'One list of what’s at home, for the whole family.',
    body: FOR,
  },
  invited: {
    icon: 'users', title: 'Welcome to the family pantry',
    text: 'Someone in the family added you. Once you sign in, you see the same items and shopping list as them.',
    body: FOR,
  },
  install: {
    icon: 'download', title: 'Put it on your home screen',
    text: 'It then opens like an app, full screen, and works without signal.',
    body: list([
      row('share', 'iPhone', 'In Safari, tap Share, then Add to Home Screen.'),
      row('plus', 'Android', 'In Chrome, tap the menu (three dots), then Add to home screen or Install app.'),
    ]),
  },
  family: {
    icon: 'users', title: 'Share it with the family',
    text: 'Everyone then sees the same pantry and shopping list. You can skip this and use it on this phone alone.',
    body: list([
      row('user', 'Starting it', 'Settings, then Sign in with Google and Start our family pantry. Add each person’s Gmail.'),
      row('mail', 'Already added by someone?', 'Sign in with the Gmail they added. Your family pantry appears.'),
      row('info', 'Who can see it', 'Only the people added. No one else.'),
    ]),
  },
  first: {
    icon: 'plus', title: 'Add your first item',
    text: 'Start with a few things you use every week. You can add the rest as you go.',
    body: list([
      row('search', 'Tap + and search', 'Type soy sauce, Milo, eggs… Common Singapore products fill in the details.'),
      row('barcode', 'Or scan the barcode', 'Point the camera at it.'),
      row('calendar', 'Set the best-before date', 'From the pack, or a rough one like 1 month.'),
    ]),
  },
  signin: {
    icon: 'user', title: 'Sign in to join',
    text: 'Sign in once and the family pantry appears on this phone.',
    body: list([
      row('user', 'Tap Sign in with Google', 'On the Settings screen, under Family sharing.'),
      row('mail', 'Use the Gmail they added', 'The address the invite was sent to. Another account sees an empty pantry.'),
    ]),
  },
};

// Which cards: invited people get a short version ending at Sign in; someone signed in already skips sharing.
export function welcomeCards({ invited = false, signedIn = false, isInstalled = installed() } = {}) {
  const ids = invited ? ['invited', 'install', 'signin'] : signedIn ? ['intro', 'install', 'first'] : ['intro', 'install', 'family', 'first'];
  return ids.filter(id => id !== 'install' || !isInstalled);
}

// Open the welcome sheet. onDone(choice) runs after it closes: 'add' (Add my first item), 'signin' (Go to sign in) or
// undefined (skipped or Look around first). The flag is set however it closes (unless save is false: the demo).
export function openWelcome({ invited = false, signedIn = false, save = true, onDone } = {}) {
  const ids = welcomeCards({ invited, signedIn });
  let at = 0;
  const s = haSheet({
    title: 'Getting started', closeLabel: 'Skip', grey: true, detent: 'large',
    lead: `<button type="button" class="ha-btn ha-btn--plain ha-btn--compact" data-pa-w="prev" hidden>Back</button>`,
    body: `<div class="pa-welcome" id="pa-welcome"></div>`,
    footer: `<div class="pa-dots" aria-hidden="true">${ids.map(() => '<span class="pa-dot"></span>').join('')}</div><div class="ha-btn-stack pa-wbtns" id="pa-wbtns"></div>`,
    onClose: v => { if (save) markWelcomed(); onDone?.(v); },
  });
  const el = s.el;
  el.classList.add('pa-wsheet');
  const card = el.querySelector('#pa-welcome'), btns = el.querySelector('#pa-wbtns');
  const prev = el.querySelector('[data-pa-w="prev"]'), skip = el.querySelector('.ha-sheet-head [data-ha-close]');
  const draw = (focus = false) => {
    const id = ids[at], c = CARDS[id], last = at === ids.length - 1;
    card.dataset.card = id;
    card.innerHTML = `<div class="pa-wtop"><span class="pa-wicon">${icon(c.icon)}</span>
      <h3 class="pa-wtitle" tabindex="-1"><span class="ha-sr">Step ${at + 1} of ${ids.length}: </span>${esc(c.title)}</h3>
      <p class="pa-wtext">${esc(c.text)}</p></div>${c.body}`;
    el.querySelectorAll('.pa-dot').forEach((d, i) => d.classList.toggle('is-current', i === at));
    prev.hidden = at === 0;
    skip.textContent = last ? 'Close' : 'Skip';
    btns.innerHTML = !last
      ? `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-pa-w="next">Next</button>`
      : invited
        ? `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-pa-w="signin">Go to sign in</button>
           <button type="button" class="ha-btn ha-btn--plain ha-btn--block" data-pa-w="done">Look around first</button>`
        : `<button type="button" class="ha-btn ha-btn--primary ha-btn--block" data-pa-w="add">Add my first item</button>
           <button type="button" class="ha-btn ha-btn--plain ha-btn--block" data-pa-w="done">Look around first</button>`;
    el.querySelector('.ha-sheet-body').scrollTop = 0;
    if (focus) { el.querySelector('.pa-wtitle').focus({ preventScroll: true }); }
  };
  const step = d => {
    const n = Math.min(ids.length - 1, Math.max(0, at + d));
    if (n === at) return;
    at = n; draw(true);
    haAnnounce(`Step ${at + 1} of ${ids.length}`);
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-pa-w]'); if (!b) return;
    const a = b.dataset.paW;
    if (a === 'next') step(1);
    else if (a === 'prev') step(-1);
    else haCloseSheet(el, a === 'done' ? undefined : a);
  });
  // swipe sideways between cards (optional; the buttons do the same)
  let x0 = null, y0 = 0;
  card.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; });
  card.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  card.addEventListener('pointercancel', () => { x0 = null; });
  draw();
  return s;
}

// ---------- the guide screen ----------

const badge = (text, tone = '') => `<span class="ha-badge${tone ? ' ha-badge--' + tone : ''}">${esc(text)}</span>`;
function section(id, title, rows, footer = '') {
  return `<section class="ha-section" aria-labelledby="h-g-${id}"><h2 class="ha-section-header" id="h-g-${id}"><span>${esc(title)}</span></h2>${list(rows)}${footer ? `<p class="ha-section-footer">${footer}</p>` : ''}</section>`;
}

export function viewGuide() {
  return `<h1 class="ha-large-title">How to use the pantry</h1>
    <p class="ha-large-sub">Everything it does, in a few words each.</p>
    ${section('adding', 'Adding things', [
      row('search', 'Search the list', 'Tap + and type a name, like soy sauce or Milo. Picking a common Singapore product fills in the brand, size and where it’s kept.'),
      row('barcode', 'Scan a barcode', 'Tap Scan barcode and point the camera at it. Once something is named, its barcode finds it next time.'),
      row('camera', 'Add a photo', 'So everyone knows which one it is.'),
      row('plus', 'How many', 'How many you have now. Tap + or − to change it.'),
      row('calendar', 'Best before', 'Type the date on the pack, or tap 1 week, 1 month… for a rough one.'),
      row('clock', 'Keeps once opened', 'How many days it lasts after opening, like 5 for milk. Leave it empty for things that don’t go off.'),
    ])}
    ${section('daily', 'Every day', [
      row('check', 'Used 1', 'Tap on the item when one is finished. It takes one out of stock.'),
      row('box', 'Open', 'Tap when you open one. Its countdown starts (only for things with “keeps once opened”).'),
      row('trash', 'Bin 1', 'Tap when one is thrown away. Home counts what gets wasted each month.'),
      row('refresh', 'Undo', 'Tapped the wrong thing? Tap Undo in the message at the bottom.'),
      row('cart', 'Bought more', 'On the item, add what you bought and its date.'),
    ])}
    ${section('soon', 'Use soon and expired', [
      plainRow('Past its date', 'Use it today or throw it away.', badge('Expired', 'bad')),
      plainRow('Within a week', 'Use these first. Home lists everything due in the next two weeks.', badge('2 days', 'warn')),
      plainRow('Within a month', 'Fine for now.', badge('3 weeks')),
    ], 'Opened items count down from the day they were opened, or to the printed date if that comes first.')}
    ${section('shop', 'Shopping list', [
      row('cart', 'It fills itself', 'Items land here when none are left, when they’re down to their “on the list when down to” number, or when they’ll run out within a week at your usual pace.'),
      row('plus', 'Add anything', 'Type it at the top of the list.'),
      row('check', 'Tick when bought', 'For a pantry item, it asks how many you bought and the new date.'),
      row('external', 'FairPrice and Sheng Siong', 'Each item links to their search, to buy online.'),
      row('share', 'Share the list', 'Tap Share at the top to send it in WhatsApp or a message.'),
    ])}
    ${section('pace', 'How fast we use it', [
      row('clock', 'Two “Used 1”s', 'After the second, the item shows how long one lasts and when it will run out, and puts it on the list in time.'),
    ])}
    ${section('family', 'Family sharing', [
      row('user', 'Start it', 'One person: Settings, Sign in with Google, then Start our family pantry.'),
      row('users', 'Add the family', 'Type each person’s Gmail and tap Add. The envelope emails them the link.'),
      row('mail', 'When you’re invited', 'Open the link, then Settings, Sign in with Google, using the Gmail that was added.'),
      row('info', 'Who can see it', 'Only the people added. Whoever started it can stop sharing with anyone else.'),
    ])}
    ${section('phone', 'Phone tips', [
      row('download', 'On your home screen', 'iPhone: in Safari, Share, then Add to Home Screen. Android: in Chrome, the menu, then Add to home screen.'),
      row('cloud', 'No signal', 'It still works. Changes reach the family when you’re back online.'),
      row('refresh', 'Looks out of date?', 'At the bottom of Settings, tap Get the latest version. Your items are kept.'),
    ])}
    <ul class="ha-list pa-gagain"><li><button type="button" class="ha-row ha-row--action ha-row--center" data-act="welcome"><span class="ha-row-body"><span class="ha-row-title">Show the welcome again</span></span></button></li></ul>`;
}
