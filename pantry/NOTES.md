# Pantry: notes

Lasting decisions and how to test. What's going on now: [STATUS.md](STATUS.md). The owner's setup: [SETUP.md](SETUP.md).

## Decisions

- **16 Oct 2026, first build (PR #5, closed):** plain HTML and JS modules, no build step. Data lives on the phone
  (IndexedDB) until family sharing is set up; then in Firestore, one household per family: `households/{hid}` with
  `members` (emails, lower case; Google, emailed link or password), and `items`, `events`, `shop` under it. Rules: only members read or write; the
  person who started it can't be removed and stays owner. Real household data never goes in this public repo.
- **Stock is batches** (qty, best-before, opened date). An opened item is due by the earlier of its printed date and
  opened + "keeps once opened" days. Taking out is first expiring first (opened ones first). The pace comes from
  "used up" events: (last − first finish) ÷ units after the first; run-out = last finish + stock × pace. The shopping
  list suggests anything out, at or below its "on the list when down to", or due to run out within a week.
- **Photos** are small JPEG data URLs in Firestore (no Storage bucket to pay for or secure). Since 16 Oct 2026 (owner,
  see below) each one is kept twice: a thumbnail on the item and the photo in its own document.
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

- **16 Oct 2026, thumbnails on items, photos only when opened** (owner): with the whole photo (30-60 KB) inside each
  item, every app open downloaded every photo (the `items` listener), which for hundreds of photographed items and a
  family opening the app often could pass Firestore's free 10 GB a month of downloads. Now an item holds only
  `thumb` (96px JPEG, quality 0.6; measured about 1.5-3 KB, at most 10 KB after stepping down) and `hasPhoto: true`;
  the photo (480px, quality 0.72; measured about 25-60 KB, at most 140 KB) is `photos/<item id>` = `{ id, data,
  updatedAt }`. Lists, rows, suggestions and Home use the thumbnail; the item screen shows it at once and swaps in the
  photo, fetched once (`get`, never a listener) and cached in memory by thumbnail. Taking, removing or deleting writes
  or deletes both (photo first); backups carry `photos`; copying the phone's pantry into the family's copies them.
  **Old-style items** (`photo` inside the item) still show, and `migratePhotos()` moves them quietly, about three a
  second, on every load and family change: it writes the photo, and only once that is saved drops `photo` from the
  item (local: omitted; Firestore: the item is rewritten without it). **Rules** (`firestore.rules`): `photos` is
  members-only like the rest; `thumb` at most 12 KB; photo `data` at most 150 KB with only `id`, `data`, `updatedAt`;
  no item may gain or change a `photo` (keeping it unchanged, removing it or an empty one from older versions is fine).
  Older app versions still on a phone can't add photos until they update (their writes are refused).

- **16 Oct 2026, places the family can edit** (owner: "add ability to see and edit locations? and make custom
  locations", and default places Level 1 fridge, Level 1 freezer, Basement store): the places ("Kept in") are an ordered
  list per household, `settings/places` = `{ id: 'places', list: [names], updatedAt }` (`js/places.js`), loaded and
  listened to with the other kinds so the whole family shares it, kept on the phone too, in backups, and merged (theirs
  first, then any only this phone had) when restoring or copying this phone's pantry into the family's. With nothing
  saved the list is `DEFAULT_PLACES`: the catalogue's places with the owner's three next to their kind. Items keep their
  place as plain text: the catalogue's generic place is kept as it is, and any place an item uses that isn't in the list
  still shows in Add, Items and Places ("Not in your list"). **Settings → Places** (`#/places`): each place with its item
  count; its sheet renames it (every item kept there moves in one batch, with Undo), moves it up or down (the order of
  Add and Items), or removes it (with items: a sheet asks where they go first; never orphaned; at least one place
  stays). Say or type matches the household's names first (multi-word, digits said as words, and a place the family
  added without its last kind word: "basement"), then the everyday words, landing on a household place of that kind.
  **Rules:** `settings` is members-only; only the id `places`, only `id`, `list`, `updatedAt`; `list` 1 to 40 strings of
  1 to 40 characters (one `is string` check per index, then the names joined by newlines matched by one pattern: 40
  separate length checks passed the 1000-expression limit).

- **16 Oct 2026, names for the family** (owner; Kaki Home's design, PR #28, ported): Settings → Family sharing lists
  each member as a row (the name, with the Gmail under it, or the Gmail alone); tapping one opens their contact sheet:
  Gmail, a Name field and Save, Email an invite (the same mailto as before), Stop sharing (asks first; not for whoever
  started it, nor yourself). The envelope and bin icons on each row moved into the sheet. Names are
  `settings/people` = `{ id: 'people', names: { email: name }, updatedAt }` (`js/people.js`), loaded and listened to
  with the other settings (no new listener). The family's name for you signs your changes (`who()`), and names show
  wherever a person does (history, added and changed by, shopping list "Added by"): `nameOf()` maps an email to its
  name and leaves older name-signed entries as they are. Stop sharing also drops that person's name. **Rules:** settings
  ids `places` and `people` only; people exactly `id`, `names`, `updatedAt` (`updatedAt` a string), `names` a map of at
  most 20, each value a string of 1 to 40 characters with no new line, each key an email (no spaces, one @). Same trick
  as places to stay under the 1000-expression limit: one `is string` per index of `names.values()`, then one pattern
  over the values joined by new lines and one over the keys. An empty map is allowed (all names removed). Backups keep
  `people` but a restore takes only places (names belong to a family, not a file). The demo has a made-up family (Mum is
  "you", Dad, and Grandma with no name), changed in memory only.
- **16 Oct 2026, from the pantry research (items 1 to 8, owner):**
  - **Guessed best-before:** `shelfDays()` in `js/catalogue.js` (a product's own rule by name, else its category;
    `null` where no date matters: salt, tissue, soap; frozen goods ignore the name rules). Add, Bought more, Put away,
    Say or type and scan-many Bought fill the guess; on Add and Bought more it is a selected "About 1 week" chip with a
    line saying it's a guess. A date someone typed is never replaced; a change of category or place re-guesses only
    while the date is still the guess. In a freezer the guess is the frozen keep (3 months, bread 1).
  - **Since you last looked** (Home): events and shopping-list lines signed by someone else after this phone's
    `pantry:lastSeen` (per phone; set on open and when the app goes to the background; "Got it" sets it now). Never in
    on-this-phone mode (everything there is this phone's). **"Use this week"** under Use soon and **"Going shopping
    now"** on the list are `https://wa.me/?text=…` links with plain text: WhatsApp asks which chat, nothing is sent by
    the app.
  - **Freeze / Thaw** on a batch (food only): Freeze marks the batch `frozenAt`, keeps it till the later of its own
    date and 3 months (bread 1) and moves the **item** to the household's first place with "freezer" in its name; Thaw
    clears `frozenAt`, sets `thawedAt`, gives 2 days and moves the item to the first "fridge" place. Places belong to
    items, not batches, so freezing one of several batches moves the whole item (simplest; the batch rows say which is
    frozen). While frozen, opening doesn't count; after a thaw an opened batch counts from the thaw. A batch kept in a
    freezer place (frozen goods) offers Thaw. Events `freeze` and `thaw` show in history only.
  - **Leftovers** (Home and Add): a name, the fridge place, use within 3 days; category Leftovers, `noRestock`.
  - **Shopping list:** lines grouped by aisle (the pantry item's category, else the catalogue's best match for the
    typed name, in `CATEGORIES` order); **Buy again** chips (items bought two or more units in total, not on the list or
    suggested, most bought first, at most 8); a mic on the add line when the browser has speech recognition (each
    thing said becomes a line, one Undo). **Ticking no longer opens Bought more**: a ticked line goes to "In the
    trolley", and **Put away** opens one sheet listing every ticked line with its place, guessed date and how many
    (new items take the catalogue match's details), one Save adds them all and removes the lines, one Undo.
  - **Plenty / Low / Out** (staples): item `measure: 'level'`, `level`. Chosen on Add or Edit ("Keep track by"); the
    item shows a three-way control instead of batches. Low or Out adds a list line (Undo takes both back); Put away,
    Bought more, Say or type and scan-many Bought set Plenty; scan-many Used up sets Out. `toBuy` lists Low/Out staples;
    staples never show under Use soon; events `level` ("Marked low").
  - **Scan many** (Home): one sheet, the camera stays open (`scanMany()` in `js/scan.js`: each barcode once while it
    stays in view, 2.5 s), mode Bought / Used up / Add to list, a running tally, barcodes not in the pantry wait with
    "Add it" (opens Add with the look-up), Done gives one toast with one Undo for every scan.
  - Data cost: nothing new is listened to or read in full; all of it is the existing items, events, shop and settings.

- **16 Oct 2026, which family pantry opens** (owner report: after saving a name, "the list of my family members
  disappeared"; saving names itself never hides anyone, tested with three members on three phones, with reloads): an
  account can be in more than one household (a second "Start our family pantry" when the first lookup failed), and
  the lookup's first match is arbitrary, so a one-person duplicate could open instead of the family's. `findHousehold`
  now takes the one this phone last used (`pantry:household`), else the one with most members, else the oldest
  (`pickHousehold`); "Start our family pantry" first looks for an existing one.

- **16 Oct 2026, sign in by email too** (owner; Google stays the main button): Settings → Family sharing shows
  **Continue with Google** and a quiet **Use email instead** (a sheet: the address, then **Email me a sign-in link** or
  **Use a password** with Sign in, Create account and Forgot password). Not offered in the demo or on-this-phone mode.
  - **Rules still need `request.auth.token.email_verified == true`** (unchanged). Google and email-link sign-ins are
    verified already. A new password account is not: `userInfo().verified` is false, the app keeps it as `S.pending`
    (never `S.user`), does no household lookup and reads nothing from Firestore, and Settings shows "Check your email"
    with **I've verified** (`reload()` + `getIdToken(true)`, then carries on) and **Send it again**. Coming back to the
    app checks quietly too.
  - **Email link:** `sendSignInLinkToEmail` with `handleCodeInApp: true`, continue URL `https://pantry.flamingbeing.com/`
    (localhost: the page itself, `continueUrl()`). The address is saved in `localStorage pantry:emailForSignIn`. On
    load, `isSignInWithEmailLink` finishes it with that address, or, when the link was opened elsewhere (Safari instead
    of the home-screen app), a small sheet asks for it. Then the link's query comes off the address and the saved
    address is cleared. The "link sent" text says that on an iPhone the link may open in Safari, that's fine, and to use
    a password in the home-screen app.
  - Errors in plain words through `explain()` (wrong password, no account, already in use, weak password (8+ here),
    bad or missing email, expired or used link, "This way of signing in isn't switched on yet."). Passwords are
    only ever sent to Firebase Auth; nothing is stored here.
  - **The owner must switch it on** (SETUP.md step 6): Authentication → Sign-in method → Email/Password, with "Email
    link (passwordless sign-in)" ticked. Until then the sheet says it isn't switched on yet.
  - Tests: `test/signin.e2e.mjs` (run by `run-sync.sh`, reads the Auth emulator's `oobCodes`), helpers in
    `test/config.test.mjs`.

- **16 Oct 2026, never a second pantry from a bad signal** (owner: "can the app create a second pantry offline?"): yes,
  it could. The lookup used `getDocs` on the persistent cache, which answers from the phone's copy when offline (empty or
  old = "no pantry"), then "Start our family pantry" queued a `setDoc` that committed whenever signal came back. Now
  `findHouseholds` uses `getDocsFromServer`: offline it throws, the app shows "Can't check right now" with Try again
  (retries by itself when the phone is back online) and no Start button; `createHousehold` is a transaction, which needs
  the server and never queues; Start looks the account up on the server first and refuses a second tap while one is
  going. Test: Firestore blocked in the browser (`sync.e2e.mjs`).
- **16 Oct 2026, merge duplicate pantries** (owner: "we should merge duplicate emails into 1 pantry"; the real cause of
  the disappeared list was an account in two households, one a stray one-person pantry). `S.pantries` holds every
  household the account is in (`findHouseholds`, at most 10). With two or more, Settings shows "Two family pantries"
  and Home a one-line note; the sheet (`openMerge`) lists each (people, who started it) with the one with most people
  chosen to keep. **Merge into this one** (after a confirm): `copyHousehold` copies items, events, shop and photos in
  batches (photos first; an old-style item's `photo` moves to `photos/<id>`), merges settings (`js/merge.js`: places by
  `mergePlaces`, names joined, the kept pantry's name wins), then COUNTS (`getCountFromServer`: the kept pantry must hold
  at least what was copied); members are unioned (over 20: refused, nothing done); the app switches to the kept pantry;
  only then `removeHousehold` deletes the other's documents and the household, one pantry at a time. Any error before
  that deletes nothing and says so (re-running is safe: the same ids are written again). Only the owner of a pantry that
  would be deleted may merge it away (the rules: household delete is owner only); otherwise it says "Ask <owner> to merge
  them". No rules change. Tests: `test/merge.test.mjs`, and the merge section of `test/sync.e2e.mjs` (merge, non-owner,
  failed copy).

- **16 Oct 2026, sync safety, PR-A of three** (owner-approved plan: [PLAN-sync.md](PLAN-sync.md); goal: nothing a person saw as
  saved is lost or brought back by another phone, online or offline). The rule of the design: **never save a whole item
  from a stale copy; say what changed and let the server combine.** No transactions (they fail offline).
  - **Batches are a map.** `items/{id}.batches` is now `{ <batchId>: { qty, expiry, openedAt, addedAt, ... } }` (was an array).
    `normalizeItem()` in `js/logic.js` is the one door every item comes through (load, listen, restore, import, backup,
    demo, sample, the household merge): either shape in, an array of batches that each carry their `id` out, quantities
    clamped to 0 or more (so stock never shows below 0). An old array's own batch ids are kept when good and unique, else
    derived from the item id and position (`legacyBatchId`), so two phones that read the same old item agree. `toStored()`
    is the one door out. Backups keep arrays (readable by every version). **Old phones:** a phone on the old app writing a
    whole item puts the array back; readers cope and the next change converts it again. An old app version cannot *read*
    a map item (it expects an array), so it stops working until the service worker updates it (on the next open, or when
    the app goes to the background); the transition is a day or two for a family. **Arrays can be dropped** (the
    array branch of `normalizeBatches`, the rules' `list` branch) once every item has been saved by a new version and no
    phone has the old one: a month after PR-A is live is plenty; an optional one-time migration by the owner's home-computer
    session (read every item, write it in map shape) would close the window sooner.
  - **Changes are instructions** (`ops = { set: {path: value}, inc: {path: n}, del: [path] }`, dotted paths such as
    `location`, `batches.<id>.qty`, `batches.<id>`). `applyOps(item, ops)` (pure, `js/logic.js`) does them in memory; the
    cloud backend sends the same ops as one `updateDoc` (a field set, `increment()`, `deleteField()`); the on-phone and demo
    stores call `applyOps` too (`patch` in `store.js`), so all three behave alike. Use, Bin, Open, Bought more, put away,
    scan, Say or type, Freeze, Thaw, Plenty/Low/Out, moving a place's items and moving old photos are all ops. Two phones
    each using one unit make two `inc -1` and the server adds them, also offline. Opening one unit moves it to a batch
    whose id is the source's plus the day (`<id>-o20261016`), so two phones opening on one day add to the same one. **Undo
    is the inverse instructions** (`invertOps`): an `inc` is taken back by the opposite `inc` (what another phone did
    meanwhile stays); a field is put back only if it still holds what this change set, and the stamps are never put back.
    **Edit** saves only the fields changed against the copy the form opened with. New items and restores are whole-document
    writes (`save()`); so are deleting an item and undoing a delete (PR-B turns deletes into markers).
  - **Spent batches** stay in the item at quantity 0 (hidden) and are tidied only when an item has 40 batches: deleting one
    from a copy a moment out of date could remove a unit another phone had just given back with Undo (the randomised test
    found exactly that). The rules allow 60.
  - **Rules (stock).** `batches` may be the old array (at most 60) or the map (at most 60; every id 1 to 40 of `A-Za-z0-9_-`,
    one pattern over the ids joined by newlines); the first 12 batches of a map are also checked (`qty` a number from -99 to
    9999, `expiry` a string or empty). Only 12 because the rules engine allows 1000 expressions a request and about 16 such
    checks use them up (measured in the emulator: 60 batches pass with 12); the app clamps any quantity it reads. `qty`
    may be as low as -99 because two phones using the last unit both count (the screen shows 0). Anything else (a string,
    a number, a bad id, 61 batches) is refused.
  - **Rules (history).** `events` are write-once: create; delete (Undo, deleting an item, merging); and a rewrite identical to
    what is there (restoring a backup or re-running a merge writes the same line again). Nothing in the app edits an event
    (checked: `save('events')` only ever creates, Undo and delete use `remove`), so an update that changes anything is denied.
  - **Saved / Waiting / Needs attention.** The existing listeners now use `includeMetadataChanges`: `hasPendingWrites` per
    document and `fromCache` give the chip near the top of Home and in Settings → Saving to the family (cloud mode only): *Saved*,
    *Waiting for signal (N changes)* (unconfirmed for 1.5 s, or offline), *Needs attention*. History lines and photos aren't
    counted (each belongs to a change that is). No extra listener or read. A write the **server refuses** (`not-found` because
    another phone deleted the item, `permission-denied`, ...) is dropped by the SDK and the screen quietly goes back, so the
    app keeps a copy (`js/sync.js`, localStorage `pantry:refused`, newest 30, under 200 KB: the instructions, or a new
    item's document) and shows Needs attention with plain words and **Retry** (instructions are re-applied to the item as it
    now is; never brings a deleted item back) and **Discard**. Not captured: a write queued, the app closed, and refused by the
    server only after it is opened again (the SDK keeps the queue across a reload but the app has no promise to hear it).
  - **Known limits, honestly.** (1) `increment` is at-least-once: if the connection drops between the server applying a write
    and the phone hearing so, the phone sends it again and the unit counts twice (the randomised test drains before it
    drops a phone offline for that reason). (2) In the Firestore emulator (and possibly the live service) a write the server
    *refuses* makes the SDK resend the writes queued after it, applying their increments twice; so refusals must stay rare.
    That is why the rules do **not** refuse a stale old-array conversion (an earlier version did, with a token, and the
    test showed the doubled increments). (3) The one write built from a copy that may be stale is turning an old array into
    a map (the first change to an item still stored as an array): if another phone changes that same array item in the same
    moments, one change can be overwritten. It happens once per item and only while it is still an array. (4) Names, places
    and shopping lines are still whole-document writes until PR-B and PR-C.
  - **Tests.** `test/ops.test.mjs` (both shapes, deterministic ids, clamping, `applyOps`, inverse, chip text, refused list);
    `sync.e2e.mjs` (two phones: both use one, offline use then reconnect, add vs use, Edit after another phone's use, offline
    rename, Undo after another phone changed it, an old array read and converted, a refused write kept with Retry and
    Discard, the rules for the map and the array, history write-once); `multidevice.e2e.mjs` (three phones, seeded random
    use/add/open/rename/Undo with phones going offline and back; every batch on the server must equal start + adds - uses,
    phones must show it, the history must match, nothing refused; `SEEDS=1,2 STEPS=60 node test/multidevice.e2e.mjs`
    inside `firebase emulators:exec`; two seeds run in CI, twelve were run by hand). The tests drive the app's own code
    through `window.__pantry.act` (emulator only).

## How to test

```
node pantry/test/logic.test.mjs        # logic, catalogue, backups (plain node; also in the repo Checks)
node pantry/test/quick.test.mjs        # Say or type: dates, places, quantities, matching
node pantry/test/tour.test.mjs         # first steps: quick-start list, checklist ticks
node pantry/test/places.test.mjs       # places: defaults, rename/move/remove, used-but-unlisted, Say or type matching
node pantry/test/people.test.mjs       # names for the family: cleaning, setting, labels
node pantry/test/merge.test.mjs        # merging duplicate pantries: members, who may, settings
node pantry/test/scan.test.mjs         # the barcode look-up chain with a stubbed fetch (plain node)
node pantry/test/photo.test.mjs        # thumbnail and photo sizes, stepping down to fit the limits (plain node)
node pantry/test/ops.test.mjs          # both shapes of batches, changes as instructions and their inverse, the chip text (plain node)
node pantry/test/config.test.mjs       # set-config, sign-in choice, plain-word errors, sw.js rules
node pantry/test/e2e.mjs               # phone browser test with axe; SHOTS=<dir> saves screenshots
pantry/test/run-sync.sh                # two phones and the stock rules (sync.e2e.mjs), the randomised three-phone run (multidevice.e2e.mjs), sign-in by email link and password (signin.e2e.mjs), family sharing, the rules (photo size caps, places and names too) and moving old-style photos in the
                                       # local emulators (demo-pantry, fake accounts)
node tools/check.mjs && node tools/stamp-versions.mjs --check
```

`e2e.mjs` needs Playwright (`PLAYWRIGHT_PATH`) and axe-core (`AXE_PATH`, or `npm install --no-save axe-core`);
`run-sync.sh` needs Java 21 and fetches `firebase-tools` with npx. The "Pantry checks" workflow runs all of them on PRs
touching `pantry/`, `homedesign/` or `__/`. Never point a test at the live Firebase project.
