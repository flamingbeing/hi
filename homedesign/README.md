# homedesign: the home design system

Shared by every family home app on `*.flamingbeing.com` (first: the pantry). Calm and minimal, light only, the
phone's own font, one slate-blue accent. Two versions:

- **Web** (pages and simple sites): `tokens.css` + `web.css`, `h-` classes. Rules: [DESIGN.md](DESIGN.md). Guide:
  `index.html` (at `design.flamingbeing.com`).
- **Phone app** (installable PWAs): `tokens.css` + `app.css` + `app.js`, `ha-` classes. Rules:
  [DESIGN-APP.md](DESIGN-APP.md). Working specimen: `app.html` (open it on a phone).

| File | What |
|---|---|
| `tokens.css` | `--home-*` custom properties (colour with contrast notes, type, space, radii, elevation, motion) and a minimal base |
| `web.css` | Web components (`h-`) |
| `app.css` | Phone app kit (`ha-`) |
| `app.js` | The kit's behaviour, an ES module (sheets, toasts, routes and history, collapsing title, stepper, version lines) |
| `icons.svg` | 46 line icons as an SVG sprite (`#i-<name>`) |
| `index.html`, `app.html` | The web guide and the phone specimen |
| `test/contrast.test.mjs` | Checks every documented colour pair (plain node, runs in Checks) |
| `test/e2e.mjs` | Browser test: both pages at 390, 360, 320px and desktop, axe, history, sheets, Undo, version lines, 200% text |

## Serving

The Worker serves this folder at `/homedesign/` on **every** `*.flamingbeing.com` host (and as the root of
`design.flamingbeing.com`), so apps link it by absolute path and never copy it. Inside this folder, files link each
other relatively, so the guide works at both addresses.

**Apps in other repos** link the kit at `https://design.flamingbeing.com/v1/` (the same files; the kit files allow any
origin). `/v1/` never breaks: a breaking change goes in `/v2/`. Loaded that way, `app.js` puts the icon sprite into the
page itself (browsers refuse `<use>` across addresses), so static icon markup writes `<use href="#i-cart"/>` and
`haIcon()` does the same on its own (`haIconsReady` resolves once the sprite is in). Offline: list the four kit URLs in
the app's service worker `SHELL` and answer `https://design.flamingbeing.com/v1/` requests from the cache.

## Using it in a web page

```html
<!doctype html>
<html lang="en-SG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#ffffff">
<title>Page name</title>
<link rel="stylesheet" href="/homedesign/tokens.css">
<link rel="stylesheet" href="/homedesign/web.css">
</head>
<body class="h-body">…</body>
```

## Using it in a phone app

```html
<!doctype html>
<html lang="en-SG" class="ha">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#f5f5f7">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<title>Pantry</title>
<link rel="stylesheet" href="/homedesign/tokens.css">
<link rel="stylesheet" href="/homedesign/app.css">
<link rel="stylesheet" href="app.css">  <!-- the app's own content styles, under its own prefix -->
</head>
<body class="ha-body ha-has-tabbar">
  <a class="ha-skip" href="#main">Skip to content</a>
  <header class="ha-bar">…</header>
  <main class="ha-main" id="main">…</main>
  <nav class="ha-tabbar" aria-label="Tabs">…</nav>
  <script type="module">
    import { haRouter, haGo, haBack, haSheet, haToast, haVersion } from '/homedesign/app.js';
    haRouter({ render(route) { /* show the screen for route.parts */ } });
    haVersion(document.getElementById('version'), 'pantry');   // at the end of settings
  </script>
</body>
```

**Offline:** add the kit to the app's service worker `SHELL` list so it works without signal:
`'/homedesign/tokens.css', '/homedesign/app.css', '/homedesign/app.js', '/homedesign/icons.svg'`. The deploy's
version stamp covers the app's own files; when the kit changes, the app's next deploy picks it up (bump nothing by
hand).

### Page setup checklist (installed apps)

- [ ] `viewport-fit=cover` in the viewport meta (the kit pads bars with the safe-area insets).
- [ ] `theme-color` `#f5f5f7` (the grey ground) and `color-scheme` `light`.
- [ ] `manifest.webmanifest`: `"display": "standalone"`, `"start_url": "./#/"`, `"scope": "./"`,
      `"background_color": "#f5f5f7"`, `"theme_color": "#f5f5f7"`, icons at 192 and 512px **plus a maskable icon**
      (`"purpose": "maskable"`, the symbol inside the central 80% safe zone, a solid background).
- [ ] `apple-touch-icon` (180×180 PNG, no transparency); iOS ignores manifest icons.
- [ ] `<meta name="robots" content="noindex, nofollow">` on every page (apps stay unlisted).
- [ ] `lang="en-SG"`, a `<title>`, a skip link, one `h1` per screen (the large title).
- [ ] Inputs are `.ha-input`/`.ha-select` (16px or more, so iOS never zooms).
- [ ] Settings end with `haVersion(el, '<app>')`, and a browser test checks both lines.
- [ ] Test at 390×844, 360×780, 320×640 and desktop, with axe; no sideways scroll; back closes sheets.

## app.js API

```js
// screens and history
haRouter({ render(route), tabs = '.ha-tabbar', tabOf(route) })  // route = { hash, path, parts, nav }; returns { route, refresh() }
haGo(hash, { replace = false, nav = 'push' })                   // push a screen ('push' | 'pop' | 'tab' | 'none')
haBack(fallback = '#/')                                         // back, or to the fallback on a deep link
haTransition(fn, nav = 'push')                                  // run a DOM change inside a slide (View Transitions)
haLargeTitle()                                                  // re-check the collapsing large title (the router calls it)

// sheets and toasts
haSheet({ title, body, footer, detent, closeLabel, lead, grey, onClose }) // -> { el, close(value), closed: Promise }
haSheet(dialogElement)                                          // open a sheet written in the page's markup
haCloseSheet(el, value)  haCloseAllSheets()  haSheetOpen()
haConfirm({ title, text, ok, cancel, danger })                  // -> Promise<boolean>
haToast(text, { action, onAction, ms })                         // -> { hide }; haHideToast()

// controls and helpers
haStepper(el, { min, max, step, onChange })                     // -> { get(), set(v) }
haVersion(el, prefix, { swUrl = 'sw.js', reload })              // the two version lines
haIcon(name, { label, cls })  haIcons.base                      // icon markup; sprite address ('' when inlined)
haIconsReady                                                    // promise: sprite in the page (cross-origin kit)
haHaptic(ms)  haAnnounce(text)  haEsc(s)  haReducedMotion()
```

## Tests

```
node homedesign/test/contrast.test.mjs
npm install --no-save axe-core      # once, anywhere above the repo or in it (or set AXE_PATH)
node homedesign/test/e2e.mjs        # SHOTS=<dir> also saves screenshots; PLAYWRIGHT_PATH points at Playwright
```

`.github/workflows/homedesign-checks.yml` runs both on every PR that touches `homedesign/`.
