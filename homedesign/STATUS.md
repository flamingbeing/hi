# homedesign: status

## Now

- First version built (16 Oct 2026): tokens, web components and guide, phone app kit and working specimen, icon
  sprite, docs, contrast and browser tests, PR workflow.

## Waiting on the owner

- A look at `app.html` and `index.html` on the phone (via the PR preview, or `design.flamingbeing.com` once the
  custom domain is added) and a yes or no on the slate-blue accent.

## Next

- Kit notes from the pantry go in "Decisions" below, with fixes made here rather than in the app.
- Later, if the owner wants it: a dark colour set as one `:root` block (every colour is already a token).

## Decisions

- 16 Oct 2026: **Calm and minimal, light only** (owner): near-white and soft greys, one quiet accent, generous space,
  no decoration. `color-scheme: light`; every colour a custom property so a dark set can be added later.
- 16 Oct 2026: **Accent slate blue `#3a6390`** (proposed): muted, 6.2:1 on white, white on it 6.2:1, clearly apart
  from the ok/warn/bad colours and from the anaesthesia sites' wine and navy. Reasons in `DESIGN.md`.
- 16 Oct 2026: **Two versions**, like the owner's other systems: web (`web.css`, `h-`) and phone app (`app.css` +
  `app.js`, `ha-`), sharing `tokens.css` (`--home-*`).
- 16 Oct 2026: **System font, no font files.** Body 17px; no sentence under 16px; 13px only for short labels (tab
  labels, section headers, badges). If the owner wants a strict 16px floor everywhere, raise `--home-t-label` to
  `calc(16rem / var(--home-root))` in one place.
- 16 Oct 2026: **Type tokens follow the root size** (`--home-root`: 16 on the web, 17 in the app kit), so on iPhone
  the app follows Dynamic Type and each token stays at its named size by default.
- 16 Oct 2026: **Status badges carry a word and a shape** (dot, ring, tick), never colour alone. Placeholders use the
  muted colour so they pass 4.5:1 on the grey search field too.
- 16 Oct 2026: **History:** hash routes; every screen and sheet is a history entry; a new screen opened from a sheet
  replaces the sheet's entry. `haRouter` normalises a bare URL to `#/` so back never lands on an empty route.
- 16 Oct 2026: **Undo over confirm** for deletions that can be undone; `haConfirm` only for the irreversible.
- 16 Oct 2026: **Version lines** in the kit (`haVersion`): read from the `<app>-` cache name, and "Get the latest
  version" checks `sw.js` with `no-store` first, then removes only that app's worker and caches.
- 16 Oct 2026: Tests: `contrast.test.mjs` (plain node, also checks DESIGN.md's table matches tokens.css) runs in the
  repo Checks; `e2e.mjs` (Playwright + axe) runs in `homedesign-checks.yml` on PRs touching `homedesign/`.
- 16 Oct 2026: **22 more icons** for household things and actions (from the pantry): bottle, jar, tin, bowl, cup,
  carton, bread, leaf, fish, snowflake, cookie, sparkle, roll, droplet, pill, paw, heart, download, upload, external,
  refresh, cloud (46 in all). The guide and specimen list them; the e2e test counts the sprite instead of a fixed 24.
- 16 Oct 2026: **Top bar never overlaps** (seen in the pantry guide at 200% text): the bar's grid gives each side
  column at least its buttons' width and the title what is left (ellipsis, still at most 40vw, centred while the sides
  are equal); a back label truncates and, when its column is under 4.5em, shows only the chevron (label kept as the
  accessible name, 44px target). Looks the same at normal sizes. `e2e.mjs` (and the pantry's) check the lead, title
  and trail boxes stay apart at 390 and 320px, at normal and 200% text.
