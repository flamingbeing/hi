# Koh family home app design language (phone)

The phone-app version of [DESIGN.md](DESIGN.md), for installable web apps (anything with a service worker or a
home-screen icon; first: the pantry). Opened from the home screen, an app should be hard to tell from a native iPhone
or Android app, and still calm and plainly "home". The kit is `app.css` + `app.js` (`ha-` classes); every component is
shown working in `app.html`. Pages and simple sites keep `web.css`.

## What carries over, and what changes

**Carries over unchanged:** every token in `tokens.css` (colours, contrast, space, radii, motion), the one slate-blue
accent, the phone's own font, light only, the 16px floor for sentences, plain British English, sentence case, no
emoji, status always with a word and a shape.

| Web (`DESIGN.md`) | App (`DESIGN-APP.md`) | Why |
|---|---|---|
| White page | Grey ground `#f5f5f7` with white grouped sections | The iOS Settings / grouped-list pattern is the strongest "this is an app" cue, and gives sections an edge without lines. |
| Body 17px at a 16px root | Body 17px at a **17px root** (`--home-root:17`) | iOS's own body size; on iPhone the root follows Dynamic Type (`font: -apple-system-body`). |
| Page title 40px | Large title 34px that collapses into a 44px bar | Matches the iOS large title and leaves room at 390px. |
| Header, nav, footer | Top bar, bottom tab bar (with a centre action), sheets, toasts | Native navigation; a site header looks like a web page in a frame. |
| Links in text | Rows and buttons for actions | Underlined links are for reading, not for doing. |
| Hover states | Press states within 100ms; hover only with a mouse | Phones have no hover; instant press feedback is what feels native. |
| Pages | Hash routes: every screen and every sheet is a history entry | The iOS edge swipe and Android back must always work, with no dead ends in standalone mode. |

## Tokens

All in `tokens.css` (`--home-*`; see the colour table in `DESIGN.md`). The kit adds only bar sizes and safe areas:
`--ha-bar-h` 44px, `--ha-tab-h` 50px, `--ha-safe-t/r/b/l` (`env(safe-area-inset-*)`), and the bar blur.

**Type in the app** (1rem = 17px):

| Token | Size | Weight | Use |
|---|---|---|---|
| `--home-t-large` | 34 / 1.18, −0.022em | 700 | Large screen title |
| `--home-t-title1` | 28 | 700 | Stat numbers |
| `--home-t-title2` | 22 / 1.25 | 700 | Card titles, empty-state titles, in-content headings |
| `--home-t-body` | 17 / 1.47 | 400 (600 for bar and sheet titles, buttons) | Rows, buttons, text |
| `--home-t-small` | 16 / 1.45 | 400–600 | Row subtitles, section footers, chips, segments, toasts, field labels, version lines |
| `--home-t-label` | 13 / 1.4 | 500–600 | Tab labels, section headers (capitals, +0.05em), badges |

Nothing that reads as a sentence is under 16px; only the short labels in the last row are 13px.

## Layout at 390×844

- `<html lang="en-SG" class="ha">`, `<body class="ha-body ha-has-tabbar">` (or `ha-has-toolbar` during a task).
- **Top:** `header.ha-bar` (sticky, safe-area top) > `.ha-bar-row` > `.ha-bar-lead` (back) · `.ha-bar-title`
  (small, centred, hidden until the large title scrolls away) · `.ha-bar-trail` (icon or text buttons).
  Transparent at rest; then translucent white with a blur and a hairline (`.is-collapsed`, set by `haLargeTitle()`).
- **Content:** `main.ha-main`, max 680px, 16px gutters plus side safe areas, bottom padding clears the tab bar, and it
  clips sideways overflow. Each screen starts with `h1.ha-large-title` (top level) or has a back button (pushed).
- **Bottom:** `nav.ha-tabbar` (50px plus the home-indicator inset), 3 to 5 tabs. The centre one may be the primary
  action (`.ha-tab--action`: a round accent button that opens a sheet, such as "Add item").
- Nothing scrolls sideways except a chip row. Test at 390×844, 360×780 and 320×640.
- **Larger screens:** from 768px the gutter is 24px and sheets become centred dialogs; from 1024px the tab bar
  becomes a 96px left rail and content stays a centred 680px column.

## Components

All in `app.css`, all in `app.html`.

**Large title and bar**

```html
<header class="ha-bar"><div class="ha-bar-row">
  <div class="ha-bar-lead"><button class="ha-bar-btn ha-back"><svg class="ha-icon">…chevron-left…</svg><span>Pantry</span></button></div>
  <div class="ha-bar-title" aria-hidden="true">Baby spinach</div>
  <div class="ha-bar-trail"><button class="ha-bar-btn">Edit</button></div>
</div></header>
<main class="ha-main" id="main"><h1 class="ha-large-title">Baby spinach</h1><p class="ha-large-sub">Use soon · Fridge</p>…
```

`.ha-bar--solid` for a bar that is always solid; the router adds `.ha-bar--instant` for one frame on a screen change.

**Tab bar**

```html
<nav class="ha-tabbar" aria-label="Tabs"><div class="ha-tabbar-inner">
  <a class="ha-tab" href="#/" aria-current="page"><span class="ha-tab-icon"><svg class="ha-icon">…</svg></span><span class="ha-tab-label">Pantry</span></a>
  <a class="ha-tab" href="#/shop"><span class="ha-tab-icon">…<span class="ha-tab-badge" aria-hidden="true">4</span></span><span class="ha-tab-label">Shopping</span><span class="ha-sr">, 4 to buy</span></a>
  <button class="ha-tab ha-tab--action" type="button"><span class="ha-tab-icon">…plus…</span><span class="ha-tab-label">Add item</span></button>
  …
</div></nav>
```

Current tab: accent label at 600 **and** a soft pill behind the icon (shape and colour). The router sets
`aria-current`.

**Grouped list and rows**

```html
<section class="ha-section">
  <h2 class="ha-section-header">Items <span>8</span></h2>
  <ul class="ha-list">
    <li><a class="ha-row" href="#/item/milk">
      <span class="ha-row-thumb"><svg class="ha-icon">…</svg></span>          <!-- or <img class="ha-row-thumb" alt=""> -->
      <span class="ha-row-body"><span class="ha-row-title">Oat milk</span><span class="ha-row-sub">Fridge · 1 left</span></span>
      <span class="ha-row-trail"><span class="ha-badge ha-badge--bad">Expired</span></span>
      <svg class="ha-icon ha-row-chevron" aria-hidden="true"><use href="/homedesign/icons.svg#i-chevron-right"/></svg>
    </a></li>
  </ul>
  <p class="ha-section-footer">A note under the group.</p>
</section>
```

Rows are `a`, `button` or `label` (the whole row is the target), at least 50px. Leading: `.ha-row-icon` (30px tinted
tile; `--grey`, `--bad`) or `.ha-row-thumb` (44px). Trailing: `.ha-row-value` (muted text), `.ha-row-trail` (badge,
button), `.ha-row-chevron`, a `.ha-switch`, or a `.ha-stepper`. Hairlines are inset to the text. Variants
`.ha-row--action` (accent title), `--danger`, `--center`; `.is-done` strikes a ticked item through. At large text
sizes the trailing part wraps under the title instead of squeezing it.

**Cards and stats:** `.ha-card` (`.ha-card-kicker`, `.ha-card-title`, `.ha-card-text`, `.ha-card-actions`); a pressable
card is an `a` or `button`. `.ha-stats > .ha-stat > .ha-stat-value + .ha-stat-label` for two to four numbers.
`.ha-panel` for a quiet note.

**Buttons:** `.ha-btn` (tinted, the default secondary) + `--primary` (accent; **one per screen**), `--secondary`,
`--outline`, `--plain`, `--quiet` (muted icon buttons in rows), `--danger`; sizes `--compact` (44px), `--small`
(36px drawn, 44px to tap), `--icon` (44px round), `--block` (full width). Default 50px, 17px 600. Pressed: scale 0.97
and a darker fill. Disabled: `disabled` or `aria-disabled="true"`. Rows of buttons `.ha-btn-row`, stacks
`.ha-btn-stack`.

**Segmented control** (2 to 4 short options, one row):

```html
<fieldset class="ha-segmented"><legend>Show</legend>
  <label class="ha-seg"><input type="radio" name="v" value="buy" checked><span>To buy</span></label>
  <label class="ha-seg"><input type="radio" name="v" value="bought"><span>Bought</span></label>
</fieldset>
```

Selected: a raised white thumb and 600 text. Radios give arrow keys and screen readers for free. More than four
options, or long labels: radio rows in a list instead.

**Switch:** `<label class="ha-row">…<input type="checkbox" role="switch" class="ha-switch"></label>`: 51×31, accent
when on, the knob slides and stretches while pressed. On/off settings only (not for choosing between things).

**Chips:** `.ha-chips > button.ha-chip[aria-pressed]` (+ `.ha-chip-count`). One row that scrolls sideways and bleeds
to the screen edge; `.ha-chips--wrap` to wrap instead. On: tinted, an accent border and a tick.

**Badges and pills:** `.ha-badge` (`--accent`, `--ok`, `--warn`, `--bad`). Status badges for use-by dates:
**Expired** (`--bad`, filled dot), **2 days / Use soon** (`--warn`, ring), **Fresh** (`--ok`, tick). Always a word.
`.ha-pill` for counters ("3 of 7").

**Search:** `.ha-search` > icon + `input[type=search]` + `.ha-search-clear` (shows only when there is text). Give the
wrapper `role="search"` and the input a label.

**Fields:** `label.ha-field > .ha-field-label + .ha-input` (text, date, textarea) or `.ha-select`;
`.ha-field-hint`; errors with `aria-invalid="true"` and `.ha-field-error` (icon and words). `.ha-input--inline` puts a
value inside a row, as in iOS Settings. Inputs are at least 16px so iOS never zooms.

**Stepper:** `div.ha-stepper[role=group][aria-labelledby] > button[data-step="-1"] + output + button[data-step="1"]`,
wired by `haStepper()`; 44px buttons, the ends disable at the limits.

**Progress and charts:** `progress.ha-progress` (6px, accent; `--ok`), with `.ha-progress-label` above. Horizontal bars:
`ul.ha-chart > li.ha-chart-row > .ha-chart-label + .ha-chart-track > .ha-chart-fill[style="--v:60%"] + .ha-chart-value`.
Columns: `ul.ha-cols > li.ha-col > .ha-col-value + .ha-col-bar[style="--v:40%"] + label`, `.is-current` for today.
Always print the numbers as text; the bars are the picture, not the data.

**Bottom sheet:** `haSheet({ title, body, footer })` builds `dialog.ha-sheet` with a grabber, a head (title centred,
Done / Cancel at the right, an optional leading button), a scrolling `.ha-sheet-body` and a sticky `.ha-sheet-foot`
above the safe area. Detents: `--medium` (60dvh), `--large` (92dvh), or fit content. `--grey` for a sheet of grouped
lists. Closes with back, Escape, a tap on the backdrop, dragging the head down or a `[data-ha-close]` button; focus
returns to the opener. A sheet in the page's markup works too: `haSheet(document.querySelector('#my-sheet'))`.

**Toast:** `haToast('Bread removed', { action: 'Undo', onAction })`: dark, above the tab bar, one at a time, 4 seconds
(6 with an action). Every destructive action that can be undone offers Undo instead of asking first.

**Empty state:** `.ha-empty > .ha-empty-icon + .ha-empty-title + .ha-empty-text + one button`.

**Skeleton:** `.ha-skeleton` (`--line`, `--short`, `--thumb`) inside real row shapes, `aria-busy="true"` on the list.
No spinners.

**Version lines:** `haVersion(el, '<app>')` at the very end of settings (see Behaviour).

## Behaviour

- **Native basics (in the kit):** no tap highlight, `touch-action: manipulation` (no double-tap zoom delay),
  `user-select: none` and no long-press callout on controls, `overscroll-behavior-y: contain` (no accidental
  pull-to-refresh), `100dvh`, safe areas on every edge bar. `app.js` adds the empty passive `touchstart` listener iOS
  needs before it shows `:active` press states.
- **History:** `haRouter({ render })` draws screens from hash routes (`#/`, `#/shop`, `#/item/3`). Every pushed screen
  and every sheet is a history entry, so the iOS edge swipe and Android back always work. `haBack(fallback)` goes back,
  or to the fallback when the app was opened straight onto a deep link. Going to a new screen with a sheet open
  replaces the sheet's entry, so back never needs pressing twice.
- **Undo over confirm:** remove at once and offer Undo in a toast; ask first (`haConfirm`) only for things that can't be
  undone, such as clearing everything.
- **Haptics:** `haHaptic()` gives a 10ms tick on Android where allowed (the stepper uses it); nothing on iOS.
- **Respond within 100ms** of every tap; save on every change so a killed app resumes where it was.
- **App version lines** (the owner's rule for every app with a service worker), last on the settings screen, as small
  muted text:
  - `App version 2026-10-14 (3f9a2c1d)`, read from `caches.keys()`: the cache starting `<app>-` (the deploy names it
    `<app>-<date>-<hash>`). A cache name without a date shows as it is; no cache, no line.
  - A link-styled button `Not updating? Get the latest version`. It fetches the app's `sw.js` with
    `cache: 'no-store'` first; with no signal it says so and changes nothing. Then it unregisters only this app's
    service worker, deletes only caches starting `<app>-`, and reloads. Saved data (localStorage, IndexedDB, sign-in)
    is never touched.
  - `haVersion(document.getElementById('version'), 'pantry')` does all of it.

## Motion

| What | Duration | Curve |
|---|---|---|
| Press in | 90ms | standard `cubic-bezier(.2,0,0,1)` |
| Fades, tab switch, chip and segment change | 150ms | standard |
| Switch knob, bar changes | 250ms | iOS `cubic-bezier(.32,.72,0,1)` |
| Push and pop screens | 350ms | iOS curve: the new screen slides in from the right, the old one shifts 30% left |
| Sheet up and down | 420ms | iOS curve; the backdrop fades to 32% ink |
| Toast in / out | 420ms / 250ms | arriving `cubic-bezier(.05,.7,.1,1)` / leaving `cubic-bezier(.3,0,.8,.15)` |
| Chart bars | 600ms, once | arriving |

Screen pushes use the View Transitions API (`html[data-ha-nav="push" | "pop" | "tab"]`); without it, screens swap
instantly. **Reduced motion:** every duration drops to about zero, the skeleton stops shimmering, pushes become plain
swaps. No confetti, sounds or looping animation.

## Accessibility

- WCAG 2.2 AA: text 4.5:1, controls and focus 3:1; every pair is checked by `test/contrast.test.mjs`.
- Targets at least 44×44: rows 50, buttons 50 (compact 44, small 36 drawn with a 44 tap area), segments 44, chips 44,
  bar buttons 44, tabs 50, stepper buttons 44.
- Focus visible on everything: 2px accent ring, 2px offset; inset inside rows and tabs so rounded groups don't clip it.
- Landmarks: `header` bar, `main`, `nav` tab bar with `aria-current="page"`. Icon-only buttons have `aria-label`;
  toggles use `aria-pressed`; switches `role="switch"`; the toast is `role="status"`; sheets are labelled dialogs and
  move focus to their title.
- State is never colour alone: ticks on chips, a pill behind the current tab, words and shapes on status badges,
  strike-through on done items, words for screen readers (`.ha-sr`).
- **Dimmed text uses colour, not opacity** (opacity drops contrast below 4.5:1). Only disabled controls use opacity.
- `[hidden]` always hides a kit component (`!important`), so `el.hidden = true` is enough.
- Holds at 200% text: rem sizes, wrapping rows, stats reflow to one column, `main` clips sideways overflow (the
  e2e test checks every screen).
- axe clean (WCAG 2.2 AA and best practice) at 390, 360 and 320px and on a desktop.

## Do and don't

**Do**
- Use the kit's classes; add app-specific CSS (under the app's own prefix) only for content.
- Give every screen a large title (top level) or a back button (pushed).
- Keep one primary button per screen, and one centre action in the tab bar at most.
- Put settings and lists in grouped sections; end settings with `haVersion`.
- Offer Undo after deleting; confirm only what can't be undone.

**Don't**
- Don't add colours beyond the tokens, a second accent, gradients or shadows on content.
- Don't put more than five tabs in the tab bar or more than four segments in a control.
- Don't use hover-only affordances, spinners, emoji, or any sentence under 16px.
- Don't dim text with opacity; don't signal state by colour alone.
- Don't fork the kit inside an app: improve it here and note it in `STATUS.md`.
- Don't put real names, family details or household data in samples: the repo is public.
