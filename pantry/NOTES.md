# Pantry: notes

Lasting decisions and how to test. What's going on now: [STATUS.md](STATUS.md). The owner's setup: [SETUP.md](SETUP.md).

## Decisions

- **16 Oct 2026, first build (PR #5, closed):** plain HTML and JS modules, no build step. Data lives on the phone
  (IndexedDB) until family sharing is set up; then in Firestore, one household per family: `households/{hid}` with
  `members` (Google emails, lower case), and `items`, `events`, `shop` under it. Rules: only members read or write; the
  person who started it can't be removed and stays owner. Real household data never goes in this public repo.
- **Stock is batches** (qty, best-before, opened date). An opened item is due by the earlier of its printed date and
  opened + "keeps once opened" days. Taking out is first expiring first (opened ones first). The pace comes from
  "used up" events: (last − first finish) ÷ units after the first; run-out = last finish + stock × pace. The shopping
  list suggests anything out, at or below its "on the list when down to", or due to run out within a week.
- **Photos** are shrunk to about 480px JPEG data URLs inside the item (fits Firestore's 1 MB document limit; no
  Storage bucket to pay for or secure).
- **Shops:** FairPrice and Sheng Siong have no public product API and block cross-site requests, so the app has its own
  list of common Singapore goods (`js/catalogue.js`) and links to each shop's search. Barcodes go to Open Food Facts
  (open, CORS, patchy for Singapore; an unknown barcode is remembered once the item is named). iPhone has no built-in
  barcode reader, so a ZXing WebAssembly polyfill loads from jsDelivr on the first scan (then works offline).
- **16 Oct 2026, rebuilt on the home design kit** (owner): `/homedesign/tokens.css`, `app.css`, `app.js`; the app's own
  CSS is only `pantry.css` with a `pa-` prefix; no emoji (category icons from the kit's sprite, which gained 22 icons for
  household things). Every screen (`#/`, `#/items`, `#/item/<id>`, `#/add`, `#/edit/<id>`, `#/shop`, `#/settings`) and
  every sheet is a history entry, so the iPhone swipe and Android back always work. Add and Edit are task screens: the
  tab bar gives way to a toolbar with the one primary button. Saving an add replaces the add screen with the item, so
  back returns to where Add was opened.
- **Undo over confirm:** Used 1, Bin 1, Open, Bought more, delete item, remove a list line, clear ticked: done at once
  with Undo in the toast. Only "Delete everything on this phone", stopping sharing with someone and signing out with
  unsent changes ask first.
- **A family member's change never wipes what someone is doing:** while a form is open, a sheet is up or a field has
  text in it, changes from the family wait and are drawn afterwards.
- **Help for first-time users (16 Oct 2026, owner: "a walkthrough or guide for first time users"):** `js/guide.js`.
  The **welcome** is a kit sheet of three or four cards (what it's for; put it on your home screen, left out when it
  already runs installed; share with the family; add your first item, ending "Add my first item" or "Look around
  first"), with Next, Back, Skip, dots and an optional sideways swipe. It shows once per phone: the flag is
  `localStorage 'pantry:welcomed'` (through `prefs`, so wrapped in try/catch), set however the sheet closes. Never in
  `?demo` (or the emulator tests) unless `?welcome` is added; `?welcome` forces it anywhere. Someone already using the
  app on that phone (items, a family pantry or a name saved) never sees it: the flag is set quietly. The invite email's
  link ends `#/settings`; opening it gives a short version ending "Go to sign in" (Settings, Sign in focused). The
  **guide** is the screen `#/guide` ("How to use the pantry"), linked from Settings (Help: the guide and "Show the
  welcome again") and the empty Home. **Hints** stay quiet text: the empty shopping list says how things get there, the
  item explains the pace before two "Used 1"s, Settings signed out says why to sign in. Note: an iPhone home-screen app
  has its own storage, separate from Safari, so the welcome shows once more there (without the home-screen card).
- **Demo mode `?demo`:** made-up items in memory only, no Firebase, nothing saved. Makes PR previews useful.
- **Hosting:** `pantry.flamingbeing.com` (Worker `SITES`, HOSTING.md), with `/__/auth/` (Firebase's generic sign-in
  helper pages, copied from Firebase into the repo's `__/auth/`) and `/__/firebase/init.json` (`pantry/auth/firebase/`).
- **Sign-in** (the anawj.com logbook's lessons): `authDomain` is the app's own address, so redirects never cross sites
  and installed iPhone apps keep their sign-in state ("missing initial state"). Installed apps and Firefox on Android
  sign in by redirect; browser tabs by popup, falling back to redirect when popups are blocked. `getRedirectResult`
  runs on every start. Errors show in plain words (`explain()` in `cloud.js`), never the raw message.
- **The Firebase SDK loads once** (one shared promise, reset on failure): v1 loaded it twice when two calls raced, and
  the second `initializeApp` broke the auth emulator.
- **Signing out** first waits up to 4 seconds for unsent changes (`waitForPendingWrites`); if some are still waiting
  (no signal) it asks before signing out, since they would be lost.
- **Config:** `config.js` stays `null` (on-phone only) until the owner sends the web config; then
  `node pantry/tools/set-config.mjs '<config>'` writes `config.js` and `auth/firebase/init.json` with
  `authDomain: 'pantry.flamingbeing.com'`. These are public client IDs, not secrets.
- **Service worker** (`sw.js`): `VERSION = 'pantry-v1'`, stamped only at deploy (`tools/stamp-versions.mjs`); never by
  hand. Install is all or nothing (every SHELL file, kit files included) and does not `skipWaiting`. The page tells a
  waiting version to take over only when idle (no sheet open, not on Add/Edit, nothing typed) or when the app goes to the
  background; otherwise it shows "Update ready · Restart". Activate deletes only `pantry-` caches. The Firebase SDK and
  the barcode reader are cached on first use. `/__/` (sign-in pages) and `sw.js` always go to the network.
- **Rules deploy on merge** through `.github/workflows/deploy-firestore-rules.yml` (project id from the repo variable
  `PANTRY_FIREBASE_PROJECT`, key from the secret `FIREBASE_SERVICE_ACCOUNT`); it skips cleanly until both are set.

## How to test

```
node pantry/test/logic.test.mjs        # logic, catalogue, backups (plain node; also in the repo Checks)
node pantry/test/config.test.mjs       # set-config, sign-in choice, plain-word errors, sw.js rules
node pantry/test/e2e.mjs               # phone browser test with axe; SHOTS=<dir> saves screenshots
pantry/test/run-sync.sh                # family sharing and the rules in the local emulators (demo-pantry, fake accounts)
node tools/check.mjs && node tools/stamp-versions.mjs --check
```

`e2e.mjs` needs Playwright (`PLAYWRIGHT_PATH`) and axe-core (`AXE_PATH`, or `npm install --no-save axe-core`);
`run-sync.sh` needs Java 21 and fetches `firebase-tools` with npx. The "Pantry checks" workflow runs all of them on PRs
touching `pantry/`, `homedesign/` or `__/`. Never point a test at the live Firebase project.
