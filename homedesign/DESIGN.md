# Koh family home design language (web)

The look for every family home app on `*.flamingbeing.com`. **Calm and minimal**: mostly white and soft greys, one
quiet slate-blue accent, generous space, a clear hierarchy and no decoration. Think of the built-in apps on an
iPhone. Light only.

This file covers web pages and simple sites (`tokens.css` + `web.css`, `h-` classes, shown in `index.html`).
Installable phone apps use the app kit instead: [DESIGN-APP.md](DESIGN-APP.md). How to link the files:
[README.md](README.md).

## Principles

1. **Quiet by default.** White and soft greys carry the page. The accent marks only what you can do or what is
   selected: links, the main button, the current tab, a chosen chip, the focus ring.
2. **One accent.** Slate blue `#3a6390`. No second brand colour, no gradients, no decorative shadows. Status colours
   (ok, warn, bad) mean only that, and always come with a word.
3. **Space and type make the hierarchy**, not lines and boxes. Big, bold titles; plain 17px body; muted secondary
   text. Hairlines only where rows meet.
4. **The phone's own font** (San Francisco, Segoe UI, Roboto). No font files: nothing to load, and it feels native.
5. **Readable for everyone in the family:** body 17px, no sentence under 16px, 44px targets, contrast checked by a
   test, works at 200% text.
6. **Plain British English**, sentence case, no emoji in the interface.

## Why slate blue

The owner asked for one calm accent. Slate blue `#3a6390` is a muted, slightly grey blue:

- **Calm:** low saturation, so it never shouts, and it sits quietly next to white and grey, as the system blue does
  in Apple's own apps, but softer and less "tech".
- **Accessible:** 6.2:1 on white and 5.7:1 on the grey ground, so it works for text and links as well as fills
  (the floor is 4.5:1), and white on it is 6.2:1.
- **Distinct from the status colours:** it can't be mistaken for ok (green), warn (amber) or bad (red), so "this is
  an action" and "this is a state" never blur.
- **Not the anaesthesia sites' colours** (wine on anantf.com, NUHS navy on anawj.com): the home apps are their own
  thing.

## Colour

Every colour is a custom property in `tokens.css`. Contrast ratios are WCAG 2.2; `test/contrast.test.mjs` checks every
pair listed in `tokens.css` and that this table matches the file.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--home-surface` | `#ffffff` | Page (web), cards, rows, sheets, inputs | — |
| `--home-bg` | `#f5f5f7` | Grey ground: grouped lists, quiet panels | — |
| `--home-surface-2` | `#fafafb` | Hover on white | — |
| `--home-fill` | `#ececf0` | Search field, segmented track, progress track, skeleton | — |
| `--home-fill-strong` | `#e3e3e8` | Switch track when off | — |
| `--home-pressed` | `#ebebef` | Press fill on white | — |
| `--home-pressed-bg` | `#e4e4e9` | Press fill on the grey ground | — |
| `--home-ink` | `#1d1d1f` | Headings and body | 16.8 on white, 15.5 on bg |
| `--home-ink-2` | `#3c3c43` | Secondary copy close to ink | 10.9 on white |
| `--home-muted` | `#636368` | Subtitles, captions, footers, inactive tabs | 6.0 on white, 5.5 on bg, 5.1 on fill |
| `--home-placeholder` | `#636368` | Placeholders (same as muted, so they pass on fill too) | 5.1 on fill |
| `--home-line` | `#e3e3e8` | Hairlines between rows, card edges (decorative) | — |
| `--home-line-strong` | `#8a8a91` | Link underlines, chevrons | 3.4 on white |
| `--home-control` | `#8a8a91` | Borders of inputs, outline buttons, chips, switch | 3.4 on white, 3.2 on bg |
| `--home-accent` | `#3a6390` | Links, primary buttons, selected states, focus ring | 6.2 on white, 5.7 on bg, 5.3 on accent-soft |
| `--home-accent-press` | `#2d4f74` | Pressed / hover on accent fills | white on it 8.5 |
| `--home-accent-soft` | `#e8eef5` | Secondary (tinted) buttons, selected chips, current-tab pill | ink on it 14.4 |
| `--home-accent-soft-press` | `#dbe4ef` | Pressed tinted button, chart columns | — |
| `--home-on-accent` | `#ffffff` | Text on accent | 6.2 |
| `--home-ok` / `--home-ok-bg` | `#1e6b3c` / `#e6f2ea` | Fresh, done, saved | 5.7 |
| `--home-warn` / `--home-warn-bg` | `#8a5300` / `#fbefd9` | Use soon, needs attention | 5.6 |
| `--home-bad` / `--home-bad-bg` | `#b3261e` / `#fbe8e6` | Expired, error, delete | 5.5 |
| `--home-toast` | `#1d1d1f` | Toast background | white on it 16.8 |
| `--home-toast-action` | `#a9c6ec` | Undo in a toast | 9.6 |

Translucent bars use `--home-bar` (`rgb(250 250 251 / .9)` with a blur); sheets dim the page with `--home-backdrop`.

**Status is never colour alone.** A status badge always has a word ("Expired", "2 days", "Fresh") and a shape: a
filled dot for bad, a ring for warn, a tick for ok.

**Dark mode: not now.** `color-scheme: light` and `<meta name="color-scheme" content="light">` on every page. Because
every colour is a token, a dark set can be added later as one `:root` block without touching components.

## Type

System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
Sizes are rem, so they follow the reader's text size (on the web 1rem = 16px; in the app kit 1rem = 17px and the
tokens adjust, so each token stays the px in its name).

| Token | Size / line | Weight | Web use |
|---|---|---|---|
| `--home-t-display` | 40 / 1.15 (32 on small phones) | 700, −0.025em | Page title (`.h-title`) |
| `--home-t-title1` | 28 / 1.2 | 700, −0.02em | Section heading (`.h-h2`) |
| `--home-t-title2` | 22 / 1.25 | 600 | Sub-heading (`.h-h3`) |
| `--home-t-title3` | 20 / 1.5 | 400 | Lead paragraph (`.h-lead`) |
| `--home-t-body` | 17 / 1.47 (1.6 for reading) | 400 | Body, prose, inputs |
| `--home-t-small` | 16 / 1.5 | 400–600 | Buttons, captions, hints, footers, tables: **the floor for any sentence** |
| `--home-t-label` | 13 / 1.4 | 600 | Short labels only: kickers, table headers, badges |

Inputs are never under 16px (iOS zooms into smaller ones). Numbers in tables and stats use tabular figures
(`.home-num`, `.h-num`).

## Space, shape, elevation

- **Space:** a 4px grid: `--home-s1` 4, `s2` 8, `s3` 12, `s4` 16, `s5` 20, `s6` 24, `s8` 32, `s10` 40, `s12` 48,
  `s16` 64. Side gutter 16px on phones, 24px from 768px.
- **Corners:** 6 badges, 8 thumbnails, 12 buttons, inputs and notes, 16 cards and grouped lists, 24 the top of a
  sheet, round for pills, chips and switches. Corners nest: something inside a 16px card is 12px or less.
- **Elevation:** none on content. A hairline (`--home-line`) edges cards on white; a barely-there shadow
  (`--home-shadow-card`) on the grey page. `--home-shadow-float` only for things that float (sheets, toasts).

## Layout (web)

- `body.h-body` (white) or `.h-body--grey`. Content in `.h-wrap` (max 1080px, 16/24px gutters plus safe areas);
  `.h-wrap--narrow` (720px) for reading pages. `main.h-main` clips sideways overflow.
- Header: `.h-header` (sticky, translucent, a hairline under it) with `.h-brand` and `.h-nav`
  (`aria-current="page"` gets the accent and an underline: shape as well as colour).
- `.h-split` puts a contents list (`.h-toc`) beside the content from 900px; on phones it becomes pills above.
- Footer: `.h-footer`, muted 16px.
- Test at 390, 360 and 320px and on a desktop; nothing scrolls sideways except a wide table inside `.h-table-wrap`.

## Components

```html
<p class="h-kicker">Design system</p>
<h1 class="h-title">Calm, clear and quiet</h1>
<p class="h-lead">One sentence on what this page is for.</p>

<a class="h-btn h-btn--primary" href="…">Main action</a>      <!-- one per page -->
<button class="h-btn">Secondary</button>                       <!-- tinted -->
<button class="h-btn h-btn--outline">Outline</button>
<button class="h-btn h-btn--plain">Plain</button>
<button class="h-btn h-btn--danger">Delete</button>             <!-- sizes: --large, --block -->

<a class="h-link" href="…">link in a sentence</a>              <!-- underlined, never colour alone -->
<a class="h-link-arrow" href="…">Standalone action <svg class="home-icon"><use href="icons.svg#i-chevron-right"/></svg></a>

<a class="h-card" href="…"><span class="h-card-icon">…</span><h3 class="h-card-title">Pantry</h3>
  <p class="h-card-text">What is in the cupboards.</p></a>      <!-- in .h-grid -->

<span class="h-badge h-badge--bad">Expired</span>               <!-- --ok, --warn, --bad, --accent -->

<div class="h-table-wrap"><table class="h-table">…</table></div> <!-- .h-num right-aligns numbers -->

<div class="h-field"><label class="h-label" for="x">Name</label><input class="h-input" id="x">
  <span class="h-hint">Help text</span></div>                  <!-- .h-select, .h-textarea, .h-check -->
<input class="h-input" aria-invalid="true" aria-describedby="e"><p class="h-error" id="e">…</p>

<div class="h-note h-note--warn"><svg class="home-icon">…</svg><p><span class="h-note-title">Soon</span>…</p></div>

<div class="h-prose">…long reading…</div>
```

Icons: `<svg class="home-icon" aria-hidden="true"><use href="/homedesign/icons.svg#i-cart"/></svg>`. 24 line icons,
24px, 1.75 stroke, round ends, drawn in the text colour: home, list, plus, minus, cart, settings, search, camera,
barcode, check, close, chevron-right, chevron-left, trash, edit, share, calendar, clock, box, bell, user, users, info,
alert. An icon next to a word is decorative (`aria-hidden`); an icon alone needs an `aria-label` on its button.

## Behaviour and motion

- Hover only changes a fill or underline colour; nothing important is hover-only.
- Press: buttons scale to 0.98 for 90ms. Fades and colour changes 150ms on the standard curve
  `cubic-bezier(.2,0,0,1)`.
- **Reduced motion:** every duration token drops to about zero (`tokens.css` also stops animations outright).

## Accessibility

- WCAG 2.2 AA: text 4.5:1 and controls 3:1 (every token pair above passes; the test fails the build otherwise).
- Focus: a 2px accent ring, 2px offset, on everything (`:focus-visible`), 6.2:1 on white.
- Targets at least 44×44 (buttons, nav links, inputs, checkboxes' labels).
- One `h1` per page, headings in order, landmarks (`header`, `nav`, `main`, `footer`), a skip link.
- Errors are text plus `aria-invalid`, linked with `aria-describedby`; never a red border alone.
- `[hidden]` always hides, whatever a component's `display` (`!important` in `tokens.css`).
- Holds at 200% text: rem sizes, wrapping text, `overflow-wrap` on long words.
- `test/e2e.mjs` runs axe (WCAG 2.2 AA and best practice) at 390, 360, 320px and desktop.

## Copy

- Plain British English: colour, organise, centre; dates as 16 Oct 2026 in prose.
- Sentence case for titles, buttons and labels ("Add to shopping list", not "Add To Shopping List").
- Buttons say what happens: a verb first ("Save", "Remove from pantry"). Confirmations name the thing ("Remove oat
  milk?").
- Say what went wrong and what to do: "No signal, so nothing was changed. Try again when you are online."
- No emoji, no exclamation marks, no "please" in buttons.

## Do and don't

**Do**
- Use the tokens and `h-` classes; put page-specific styles under the app's own prefix.
- Keep one primary button per page; let everything else be tinted, outline or plain.
- Use white space before adding a line or a box.

**Don't**
- Add colours beyond the tokens, a second accent, gradients, or shadows on content.
- Signal state by colour alone, or put any sentence below 16px.
- Add a dark theme or a theme toggle (yet), or load web fonts.
- Use the accent for decoration (it means "you can act here").
- Put names, family details, emails or real household data in pages or samples: this repo is public.
