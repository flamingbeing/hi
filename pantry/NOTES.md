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
- **Shops:** items link to FairPrice, Sheng Siong, Cold Storage and Shopee search (`SHOPS` in `js/logic.js`; Cold Storage and Shopee added 16 Oct 2026 at the owner's request). FairPrice and Sheng Siong have no public product API and block cross-site requests, so the app has its own
  list of common Singapore goods (`js/catalogue.js`) and links to each shop's search. Barcodes: see below. iPhone has no built-in
  barcode reader, so a ZXing WebAssembly polyfill loads from jsDelivr on the first scan (then works offline).
- **Barcode look-ups (16 Oct 2026, owner):** a scan first checks the family's own pantry (found: the item opens with
  Bought more, nothing asked online). Otherwise `lookup()` in `js/scan.js` asks Open Food Facts, Open Products Facts
  (household goods) and Open Beauty Facts (toiletries) at once, same API (`/api/v2/product/<code>.json`), all
  `access-control-allow-origin: *`, each with a 6 second limit; the first hit in that order wins and the slower ones are
  stopped. Errors, 404s, 500s and no signal all count as "not known" (it never throws). A household hit guesses Laundry
  & cleaning / Store room, a toiletry hit Toiletries / Bathroom, used only while the form still has the default and
  nobody has picked one. The product picture is fetched as before. **Unknown barcodes** open the sheet "We don't know
  this barcode yet" (a history entry; Cancel keeps the barcode in the form): a search over the pantry and the
  catalogue (the Add screen's own scoring; a catalogue product already in the pantry shows once, as the pantry item).
  A catalogue pick fills the form with the barcode; a pantry pick saves the barcode on that item (replacing any older
  one) and opens Bought more; "Type a new name" focuses Name, starting with what was typed. The browser test fakes the
  camera (a canvas stream and a stub `BarcodeDetector` reading `window.__scanCode`) and routes the three hosts; the
  app itself has no test hook.
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

- **16 Oct 2026, from Kaki Home** (`kakihome/`, a separate app built from this one; owner asked for its lessons to
  come back here):
  - **Used before expiry and expired are recorded when they happen.** Whether a unit was still in date is lost once
    its batch is gone, so a "used up" event stores `saved` (units from dated batches still in date) and binning a
    batch already past its date is recorded as type `expired` (counted with thrown away). This month on Home shows
    "Used before expiry" and how many of the thrown away were past their date.
  - **Say or type** (`js/quick.js`, mic on Home and on Add): the phone's own speech-to-text (or the keyboard's mic),
    then plain rules for quantity, place and date, matched against the pantry and the catalogue; a list to confirm
    before anything is added, with one Undo. No AI; nothing leaves the phone.
  - **Who added and last changed an item** (`createdBy`, `updatedBy`), in its details.
  - **"Use soon" setting** (Settings → Reminders: 3 days, 1 week or 2 weeks; default 2 weeks as before; per phone).

- **16 Oct 2026, hands-on first steps** (owner: "the pantry needs a better walkthrough"; `js/tour.js`):
  - The welcome is two cards for someone new ("what it's for", then "fill it in a minute"); the home-screen and family
    cards became checklist steps. Invited people keep their short version ending at Sign in.
  - **Quick start** ("What do you have?"): about 26 everyday Singapore goods as chips grouped by where they're kept;
    tapped ones go in with their catalogue details and a rough best-before date (a typical shelf life), so an empty
    pantry is useful in under a minute. Things already in the pantry show "at home" and can't be picked twice.
  - **Getting started checklist** on Home: add what you have, say what you bought, mark one used, look at the
    shopping list, home screen, share with the family (only when sharing is set up). Each ticks itself from the data
    or a per-phone flag; "Show me" opens the right screen and rings the button (`pa-spot`, no animation with reduced
    motion). Only for people who start with this version (`pantry:tour` = 'on', set on the first welcome) or who turn
    it on in Settings → Help: families already using the pantry see nothing new. Hide puts it away for good.

## How to test

```
node pantry/test/logic.test.mjs        # logic, catalogue, backups (plain node; also in the repo Checks)
node pantry/test/quick.test.mjs        # Say or type: dates, places, quantities, matching
node pantry/test/tour.test.mjs         # first steps: quick-start list, checklist ticks
node pantry/test/scan.test.mjs         # the barcode look-up chain with a stubbed fetch (plain node)
node pantry/test/config.test.mjs       # set-config, sign-in choice, plain-word errors, sw.js rules
node pantry/test/e2e.mjs               # phone browser test with axe; SHOTS=<dir> saves screenshots
pantry/test/run-sync.sh                # family sharing and the rules in the local emulators (demo-pantry, fake accounts)
node tools/check.mjs && node tools/stamp-versions.mjs --check
```

`e2e.mjs` needs Playwright (`PLAYWRIGHT_PATH`) and axe-core (`AXE_PATH`, or `npm install --no-save axe-core`);
`run-sync.sh` needs Java 21 and fetches `firebase-tools` with npx. The "Pantry checks" workflow runs all of them on PRs
touching `pantry/`, `homedesign/` or `__/`. Never point a test at the live Firebase project.
