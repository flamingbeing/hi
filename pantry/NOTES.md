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
  list per household (**since PR-C, 16 Oct 2026, one document per place: see "Names by field and places as one record
  each" below; this paragraph is the original design**), `settings/places` = `{ id: 'places', list: [names], updatedAt }` (`js/places.js`), loaded and
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
  `settings/people` = `{ id: 'people', names: { email: name }, updatedAt }` (`js/people.js`; since PR-C one name is saved as one
  field update, never the whole map), loaded and listened to
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
  batches (photos first; an old-style item's `photo` moves to `photos/<id>`), merges places (`places.js mergeInto`, by name, the kept pantry's
  first) and settings (`js/merge.js`: names joined, the kept pantry's name wins), then COUNTS (`getCountFromServer`: the kept pantry must hold
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
    moments, one change can be overwritten. It happens once per item and only while it is still an array. (4) Names and places
    were whole-document writes until PR-C; they are fields and one document each now (see the PR-C entry).
  - **Tests.** `test/ops.test.mjs` (both shapes, deterministic ids, clamping, `applyOps`, inverse, chip text, refused list);
    `sync.e2e.mjs` (two phones: both use one, offline use then reconnect, add vs use, Edit after another phone's use, offline
    rename, Undo after another phone changed it, an old array read and converted, a refused write kept with Retry and
    Discard, the rules for the map and the array, history write-once); `multidevice.e2e.mjs` (three phones, seeded random
    use/add/open/rename/Undo with phones going offline and back; every batch on the server must equal start + adds - uses,
    phones must show it, the history must match, nothing refused; `SEEDS=1,2 STEPS=60 node test/multidevice.e2e.mjs`
    inside `firebase emulators:exec`; two seeds run in CI, twelve were run by hand). The tests drive the app's own code
    through `window.__pantry.act` (emulator only).

- **16 Oct 2026, deletes that can't bring things back, and the shopping list as fields (sync safety, PR-B of three;
  [PLAN-sync.md](PLAN-sync.md); owner: 30 days in Recently removed = yes).**
  - **A delete is a marker.** Deleting an item or a shopping line sets `removedAt` (ISO time) and `removedBy` (a name, cut to
    40 characters) as ops (`removeOps` in `js/logic.js`) and leaves the document, its history and its photo where they are.
    `isRemoved(x)` / `live(list)` is the one place that says what is hidden; `items()`, `shopLines()` and `liveEvents()` in
    `app.js` are the only doors every list, count, "Use soon", search, Buy again, Say or type, barcode lookup, Home card,
    "Since you last looked", badge, WhatsApp text, guide count and place count read through (`test/removed.test.mjs` fails if
    `app.js` reads `S.items`/`S.shop` in bulk anywhere else, or looks an item up by id without `itemById`). Removed things stay
    in `S.items`/`S.shop` so a change that lands on one is applied to it. The totals on Home leave out a removed item's history.
  - **A change that lands on a removed item never brings it back.** A use, an add, an edit, an Undo are field changes; none
    touches `removedAt`. The item shows in Settings → Recently removed (`#/removed`, a kit list: name, place, removed by (the
    name saved, or the family's name), days left of 30, **Restore**); Restore is `restoreOps` (`deleteField()` on both
    fields), so what landed meanwhile is in the item. When this phone's own change landed on something another phone removed
    (it changed the item at or after the removal, or still had it waiting to send: `touched` in localStorage, `hasPendingWrites`
    from the listener), Home shows a plain note ("Soy: this was removed on another phone; find it in Recently removed. Your
    change is kept.") until Recently removed is opened. Removed shopping lines are listed there too (Restore).
  - **Undo of a delete is Restore** (clear the marker), not re-creating from a snapshot, so Undo after another phone changed
    the item keeps their change. Undo of *adding* something (an item or a line made a moment ago) is also a marker, so the app
    never deletes a document for real except in the sweep and the household merge cleanup; the cost is that an item you
    added and undid sits in Recently removed for 30 days. History lines are still deleted by Undo (events are not removable
    things; the rules allow it).
  - **The sweep.** When the app opens (family pantry: 6 s after the first listener copy; this phone's own pantry: 4 s) and at
    most once a day per phone (`pantry:lastSweep`, `pantry:lastSweepLocal`), the phone deletes up to 20 items and shopping
    lines whose `removedAt` is more than 30 days old, oldest first (`sweepDue`), plus an item's photo and history. It uses the
    items it already holds: no extra listener, no full read. **Each delete is a small transaction** (`purge` in `cloud.js`):
    read the document, delete it only if it is still removed since before the cutoff. So a Restore on another phone a
    moment ago wins over a phone whose copy is old, a document another phone swept first is just skipped, and offline the
    transaction fails and the sweep tries another day (a phone also doesn't sweep from its own old copy: `fromCache`). The cost
    is one read and one write per document, at most 20 a day. A phone whose clock is far ahead could purge early (only things
    already removed, 20 a day); a clock far behind purges late.
  - **Shopping list lines.** A tick (`done`, `doneBy`), a rename and a removal are fields (`patchLine`, `applyFieldOps`;
    `patch('shop', ...)` on all three backends), Clear ticked is one batched update, Undo of a remove is a restore. Put away
    changes items by ops (as before) and removes its lines with markers; its Undo restores them. A new line is a whole
    document under a new random id (create-only in effect), so two phones adding "Milk" make two lines (tolerated; no
    de-duplication on screen). Line text is cut to 80 characters (the rules' limit).
  - **Rules.** Items: `removedAt` / `removedBy` are each absent or a string (`removedAt` ISO-shaped, at most 40 characters;
    `removedBy` at most 40), never null, a number or longer. Shopping lines (`/shop/{id}`, was unlimited): create or update only
    if the resulting line has exactly the fields `id` (= the document id), `name` (string, at most 80), `done` (boolean) and
    optionally `itemId` (null or a string up to 100), `at` (string up to 40), `by` and `doneBy` (strings up to 200), `removedAt`
    / `removedBy` as above; no other field. Whole-line writes (old phones) and field updates are both allowed. Deleting an item or
    a line for real stays allowed for members (the sweep, merging). Still true: members only, outsiders denied. A rules *compile*
    error shows in the emulator as `invalid-argument` on every request (found when `is boolean` was used instead of `is bool`).
  - **Backups, restore, copying, merging.** A backup carries the markers; a backup, a restore, "Copy from this phone" and
    the household merge leave out items and lines removed more than 30 days ago (with their history and photo): `keepLive` in
    `logic.js`, `carryOver` in `merge.js`. Demo mode has two removed items so Recently removed has something to show; the
    Settings "Add sample items" button leaves them out.
  - **Old phones (before PR-A) still do whole-document writes** of items and lines, which can put back an item another phone
    removed (a whole-item write has no `removedAt`). The app updates itself on the next open; no rules change can stop an old
    phone's whole write without also stopping new phones' new-item writes.
  - **Still whole-document writes** (and why): a new item or line (a new random id), restoring a backup, copying up from this
    phone and the household merge (deliberate bulk writes), a new place (a new random id), the migration of the old places list
    (PR-C). A refused whole write is replayed as it was (`replay`).
  - **Tests.** `test/removed.test.mjs` (markers, ops, inverse, days left, sweep selection by age and the 20 cap, backups and
    merging, the in-memory backend, every list uses the doors); `sync.e2e.mjs` (A deletes while B offline uses one; A edits while
    B deletes; both delete; Undo of a delete after the other phone changed it; tick vs remove both orders; two ticks; a new line
    while another is removed; Restore keeps the tick; the sweep deletes only the old ones, a second phone's sweep is harmless, a
    Restore elsewhere beats a stale copy; rules cases for the new fields and the shopping lines, outsiders); `multidevice.e2e.mjs`
    now also deletes, restores, ticks and removes lines at random (see its header for the invariants); `e2e.mjs` has the
    Recently removed screen.

- **16 Oct 2026, names by field and places as one record each (sync safety, PR-C of three, the last; [PLAN-sync.md](PLAN-sync.md);
  owner: "places: one record each", names as dotted merge writes).** Goal: nothing a person saw as saved is lost by another phone,
  online or offline. What stays whole-document is listed in PLAN-sync.md.
  - **Names.** `settings/people` is unchanged in shape (`{ id, names: { email: name }, updatedAt }`, same rules), but saving or
    clearing ONE person's name is now one field: `people.js nameOps` makes a **keyed instruction** (`logic.js keyedOps`:
    `{ keyed: { names: { set: { 'a.b@x.com': 'Mum' }, del: [] } } }`; `applyFieldOps`/`applyOps`/`mergeOps`/`opsValid`/`opsEmpty` know
    it, so the on-phone, demo and cloud backends all do the same). `cloud.js updatePairs` turns it into the field path
    `['names', email]` and `updateArgs` sends every field as a `FieldPath` (never a dotted string: an email has dots) to
    `updateDoc` (or a batch update): set = the value, clear = `deleteField()`, plus `updatedAt`. A phone that doesn't have the
    document yet sends a `setDoc(..., { merge: true })` of the same fields plus `id: 'people'`. So two people naming themselves at
    once, or one naming while another stops sharing with someone, change different fields and keep both. **Stop sharing** clears
    that member's field by the same instruction (after the household update, as before). Saving a name still has no Undo (the
    Save toast has none). Names of people who left stay until someone clears them; they are only dropped in the same write when
    the 20 names the rules allow are full (`orphanNames`). The rules for `settings/people` did not change: they judge the
    document as it will be, so a dotted update passes exactly when the result is a whole valid document (tested: set, clear, the
    21st name, 41 characters, a newline, a number, a key that isn't an email, an unknown field, a deleted `names`).
  - **Places are documents.** `households/{hid}/places/{id}` = `{ id, name (1 to 40 characters, one line), order (a number),
    updatedAt }` and, as items, `removedAt` / `removedBy`. Nothing else. `places.js placeEntries(docs, legacy)` is the one way to
    read them (`placeList()` in `app.js`; `removed.test.mjs` fails if anything else reads `S.places` or the old list): the live
    documents sorted by order, then name, then id; two with the same name (any case) show once (the others' ids are kept, so
    removing the place removes them all). A household with NO place documents shows its old `settings/places` list, or the
    defaults, as *virtual* entries. Place documents sort ahead of the old list for good once any exist.
  - **Migration.** The first change anyone makes to places (add, rename, move, remove) first writes the places the household is
    showing as documents (`materializePlaces`, one batch, not waited for): ids from the name (`p-<slug>-<hash>`: the same name,
    the same id, on every phone), `order` 1, 2, 3, ... and the fixed `updatedAt` `1970-01-01T00:00:00.000Z` (`SEED_AT`). **The
    rules accept a write carrying that time only as a new document or as exactly what is already there**, so two phones migrating
    at once write the same documents, and a phone that was offline with the old list can't overwrite a place someone renamed,
    moved or removed since (every real change carries a real `updatedAt`; its whole seed batch is then refused and that phone's
    copy follows the server; the app swallows that refusal, nothing goes to "Needs attention"). Once migrated the app never
    writes `settings/places` again. **Old phones (before PR-C) still read and write `settings/places`** (the rules still allow
    it): their place edits after the migration do not show on new phones, and new phones' edits do not show on theirs (the app
    updates itself on the next open, so this lasts until each phone updates; nothing extra is shown).
  - **Changes.** Rename = one field (`name`) of one document, and the items kept there move by name with the existing item ops
    batch (`renamePlace`; Undo puts the name and those items back); an item added elsewhere under the old name keeps it and shows
    under "Not in your list" until moved (the existing tolerance). Move one step up or down = one field (`order`) of one
    document, set to the midpoint of its new neighbours (`places.js reorder`); only when there's no room between them (equal
    orders after two phones added at once, or a gap under 1e-6 after many moves) are the places whose order differs
    renumbered 1, 2, 3, ... (rare). Add = a new document under a random id after the last (two phones adding at once keep
    both; the same order is broken by name). Remove = `removedAt`/`removedBy` after the existing "where do the items go" step,
    Undo = Restore; a removed place is hidden everywhere (`placeList()`), listed in Settings → Recently removed → Places (Restore
    brings it back with any rename made since; refused with a toast if a live place has that name), and swept after 30 days by
    the same `purge` transaction. Remove vs rename on two phones: it stays hidden, the new name kept for Restore. The cap of
    40 live places is the app's (`placeProblem`); the rules cap the shape of each document and the id (`[A-Za-z0-9_-]{1,40}`)
    but **cannot count documents**, so another phone adding at the same moment could make 41 (harmless: the lists just get
    one longer).
  - **Rules (places).** `places/{id}`: members read, list and delete; create or update only if the resulting document has exactly
    `id` (= the document id, matching the id pattern), `name` (one line, 1 to 40 characters, one regex), `order` (a number, within
    plus or minus a million), `updatedAt` (a string up to 40), and optionally `removedAt` / `removedBy` under the items'
    constraints; no other field; an update whose `updatedAt` is `SEED_AT` must leave the document exactly as it is. An update
    of a place that isn't there is refused (`permission-denied`, not `not-found`: nothing to build the result from).
    Outsiders: denied everything. Under the 1000-expression limit (about 20 expressions). `settings/places` is unchanged.
  - **Everything that touched places now goes through the new helpers:** Settings → Places, Quick add's Where and the Add/Edit
    forms (`placeNames`, `placeChoices`), Say or type matching (the names), the household merge (`copyHousehold`: the other
    pantry's place documents merged by name into the kept pantry's, its old list too, removed over 30 days dropped, `merge-count`
    checked), backups (`places` in the file; a file from before has the old list in `settings`, read and merged by name) and
    restore, "Copy from this phone", the demo (its places are documents, one of them removed so Recently removed has a place to
    show), the guide. `KINDS` gained `places` (so `load`, the listeners, the on-phone IndexedDB and the in-memory backend all
    carry it; the IndexedDB keys are `places/<id>` in the same object store, so no version bump). One more listener per
    household (the places collection).
  - **Tests.** `places.test.mjs` (normalizing with the old list, none, documents, removed, malformed, same name twice; ids; the
    migration documents; the midpoint and renumbering; merging by name), `people.test.mjs` (one name as a keyed instruction,
    emails with dots, two phones in either order, a removed member), `cloud.test.mjs` (every field a `FieldPath`),
    `merge.test.mjs`, `removed.test.mjs` (places swept, the in-memory backend, the one-door guard); `sync.e2e.mjs` (both name
    themselves at once, online and with one phone offline; a dotted email; Mum names Gran while Dad, offline, stops sharing with
    her; both add a place; a rename and a reorder of one place; a remove and a rename, both orders; a rename while the other
    phone, offline, adds an item under the old name, then moving it out of "Not in your list"; two phones migrating from the old
    list, one offline and behind, and two online; an old phone's write of `settings/places` accepted and ignored; the rules for
    places and for names by field, outsiders included); `multidevice.e2e.mjs` (see its header: names, add, rename, move, remove,
    restore, the default places once, every phone showing the server's list).
  - **Still whole-document, on purpose:** see PLAN-sync.md ("What stays whole-document").
- **16 Oct 2026, small fixes (commit 1 of the combined Items-list PR; owner's queue, "PR-D"):**
  - **A pantry that goes away under an open phone.** Evidence: 11 rules errors at 08:30-08:32 UTC when a phone resumed on a
    household that had been deleted (the rules `get()` the household document, which errors when it is missing). `watchHousehold`
    (`cloud.js`) now says `cb(null)` once when the server says the document is gone or the listener fails (never from the phone's
    own cache: no signal with nothing cached is not "gone"), and `useHousehold`'s callback used to ignore null. Now
    `householdLost` (`app.js`) stops the old listeners, asks the SERVER which households the account is in (`findHouseholds`,
    `getDocsFromServer`: never the phone's copy, which still holds the dead one), and opens the survivor (`pickHousehold`) without a
    reload, with the toast "Your pantry changed: now showing …". With none left (or no signal) the phone shows its own pantry plus
    "Your pantry changed" with Try again on Home and Settings; nothing is started by itself. Test: `sync.e2e.mjs`, "a pantry that
    goes away" (two phones, the owner removes the pantry; the other ends on the survivor with no reload and no console errors; then
    nothing left, Try again before and after the owner adds the account to a new pantry).
  - **Sync now** (Settings → Saving to the family). A button that waits up to 5 s for the SDK to acknowledge every change
    (`waitForPendingWrites`), reads the household document from the server (proves the family can be reached: that read, any
    acknowledgement and any non-cache snapshot set "Last heard from the family"), and says plainly: "Everything is saved", "Still
    waiting: this phone can't reach the family right now" or "Needs attention: …" (a refused change; Retry and Discard below). It
    lists each waiting change in words ("Used one Rice", "Name for Jun", "Added place Garage": `describeWaiting` in `sync.js`) from
    a small record `cloud.js` keeps of the writes it has sent and the server has not answered (each `track()` call carries
    `{ kind, id, op, ops | name }`, cleared when its promise settles); changes left from before the app was last closed are
    listed by document ("A change to Rice (saved before the app was closed)"). **The network switch is offered, not automatic:** if
    the first try is still waiting, a second button "Reconnect and try again" turns the SDK's network off and on once
    (`disableNetwork`, 300 ms, `enableNetwork`; never `enableNetwork` while already enabled, which crashed Firestore 10.14.1 in
    tests). Reason: a change the server applied whose acknowledgement was lost is sent again after a reconnect, and an
    `increment` sent twice counts twice (the same limit as the randomised test's note). The SDK does this on any real reconnect;
    Sync now does not add one unasked.
  - **The "Waiting for signal" chip was wrong in one case, found and fixed.** The owner's phone said "Waiting for signal (1 change)"
    on wifi with a VPN while the server already held everything. `pending` used to be `max(inflight, documents the listeners flag
    hasPendingWrites)`. That flag is `hasLocalMutations || hasCommittedMutations` in the SDK, and a listener that already flagged a
    document keeps flagging it after the server ACKNOWLEDGED the write until the listen stream has delivered the server's version
    (view.mutatedKeys). On a slow or stalled listen stream (a VPN that buffers one of the two streams) that is "for good", so a
    saved change read as waiting. Reproduced in the emulator with `test/proxy.mjs` (a pass-through proxy that holds back what the
    server says on the Listen or the Write stream): the old code said "Waiting for signal (1 change)" with the change on the server;
    now `pending` counts only what the server has not acknowledged: this session's writes whose promise is unresolved, plus the
    documents flagged when the app opened (cleared when `waitForPendingWrites` resolves). The other candidates were checked and
    are fine: a listener that stays `fromCache` only matters with `pending > 0`; `onSyncState`'s 1.5 s grace stays. Not counted
    on purpose (so the chip can undercount, never overcount): `putMany` (copying the phone's pantry up, restoring, seeding the
    default places; the caller waits for those itself) and the daily sweep.
  - **"You → Your name" is gone in a family pantry** (the person's own row in Family sharing is the one place for the name; the
    contact sheet's field says "Your name" on your own row). A name saved on this phone is adopted once per household when the
    family has none for the account (one `names.<email>` field operation, flag `pantry:nameAdopted` = `{ <household id>: true }`),
    only after the family's own copy has come from the server, so it never overwrites a name from a stale cache. The field stays in
    local-only and demo mode, `who()` keeps its order (family name, this phone's name, Google first name), and the welcome check
    (`maybeWelcome`: "already using the app on this phone") still reads `prefs 'name'`.
- **16 Oct 2026, selecting items on the Items list (commit 2 of the combined PR; owner's decisions: "My order" per category only, every
  drag starts from the grip, Bulk edit in the same PR, plain words, phone first, a keyboard and screen-reader way for every drag):**
  - **Three ways in, so nobody is stuck behind a gesture:** the Select button above the list (the way for keyboards and screen
    readers), a press and hold on a row, and, once selecting, a tap anywhere on a row. `js/select.js` holds the selection as plain
    state (by item id, so it survives redraws from other phones; what another phone deletes drops out) and `holdToSelect`, written
    once: 500 ms with the finger still; more than 10 px of movement, a scroll or a cancelled pointer (a scroll starting on a touch
    screen) cancels; a small buzz through the kit's `haHaptic` (Android only, never with reduced motion), a visible cue (the row is
    shaded while it is held, then the bar and ticks appear) and a spoken one ("Selecting. 1 selected"); the click that comes with
    lifting the finger is swallowed (the row is a link); Android's `contextmenu` counts as the hold. The guard excludes only the
    grip, buttons and inputs, never the row's own link. Delegated on `#main`, so rows drawn later work.
  - **Rows while selecting** are `<label>` around a real checkbox (kit `.ha-row` style; the whole row is the target, no link to
    open); Space ticks, Enter too (a checkbox only does Space by itself). The **selection bar** sticks above the tab bar: "N selected"
    (a live region; "(M not shown)" for ticked items the search or place chip hides: a filter never silently changes what an action
    will touch), Select all (the whole filtered result), Select none, Done, and Move to… / Shopping list / Delete. Under a heading,
    "Select these N" ticks that group (also when it is folded), "Unselect these N" takes them off. **Back, the iPhone swipe and
    Escape leave selecting**: it is a history entry shaped like a sheet (`haSheet: 'pa-select'`), so `haGo` replaces it when a link
    is followed and no dead entry is left. Leaving the screen ends it.
  - **The actions end selecting and are each ONE batch and ONE toast with Undo.** Move to… opens a place picker sheet (radio list,
    the button names the count and the place); Shopping list adds one line per item not already on the list (one `putMany`; says how
    many were already there); Delete is the same removal marker as the item screen's (Recently removed). The word is **Delete**,
    not "Bin", on purpose: "Bin 1" on an item already means "throw one unit away" (a history entry counted as waste), and a bar
    button called Bin would suggest that. Undo (`undoBatch`) sends each item the inverse of what was done to it
    (`invertOps` with the item as it is now), so a field another phone changed since is left alone, and says "N changed since, left
    as they are" (an item removed since counts as changed, except when undoing a delete).
  - **Group by Place** is a fourth choice next to Use by, Name and Category (the default sort and look are unchanged): a heading per
    place in the household's order, with its count; a heading folds (the chevron button, `aria-expanded`; kept per phone in
    `pantry:folded`). Each place section carries `data-place`, which is what the drag in the next commit looks for.
  - Rows are now `<li data-id>` and the row `<a>` has `draggable="false"` (a link drags as a native ghost otherwise).
- **16 Oct 2026, dragging by the grip and My order (commit 3 of the combined PR):**
  - **The grip.** Every row on Items ends with a real button (`aria-label` "Reorder or move <item>", 44 px, `touch-action: none`,
    a sibling of the row's link, never inside it: a button inside a link fails axe). Every drag starts there (owner), and a tap, Enter
    or Space on it opens a small sheet (the keyboard and screen-reader way): Move up and Move down in My order, Move to… always;
    each result is spoken ("Eggs moved down: 2 of 2 in Dairy & eggs"). In My order the arrow keys on a focused grip move it a step.
    While selecting, the grip of a ticked row drags the whole selection (the ghost says "3 items"); an unticked row's grip drags that
    row alone.
  - **Where a drag can land** (`js/drag.js` knows nothing of items; `onGripDown` in `app.js` says what is under the finger): on a
    place, which moves it: a heading or section under Group by place (`data-place` on the section), or one of the place chips at the
    top (added so the grip does something in every sort; the chips scroll sideways, so only visible ones can be hit); and, in My
    order, within its own category, which reorders (an insertion line, "After Kaya" / "First in Dairy & eggs", "Stays here" when it
    would not move). Its own place is ignored ("Already in Fridge"), another category's rows give no line, and a drop on nothing does
    nothing. Moves reuse the selection's batch and Undo toast.
  - **Why pointer events, not HTML5 drag and drop:** HTML5 DnD does not work with touch on iOS Safari and gives no control of the
    ghost, the auto-scroll or the label. Adapted from the logbook's Reflections drag: a ghost lifted above the finger (so it isn't
    hidden), the target lit, a tick (`haHaptic`) on each new target, `touchmove` default prevented while dragging (iOS), edge
    auto-scroll that stops above the tab bar and the selection bar and below the top bar, Escape or a cancelled pointer puts
    everything back, ghost marked `aria-hidden`. A drag begins after 6 px, so a tap stays a tap, and the click after a drag is
    swallowed. Remote changes wait (`S.dragging`) and are drawn when it ends.
  - **My order** (`js/order.js`, pure) is a way of ordering inside each category (owner: per category only), chosen under Category
    ("By name | My order"; five labels don't fit one row at 320-390 px, and the segmented control keeps its look). One optional
    number `order` per item; the list sorts by it, numbers before items without one, ties by name then id, so every phone shows the
    same order whatever happened at once. Moving an item sets ONE field on ONE item: the midpoint of its new neighbours (after the
    last: last + 1; before the first: first - 1; first ever: 1). Only when there is no room (equal or too-close neighbours, a
    neighbour before it without a number, numbers near the limit) is the whole category renumbered 1, 2, 3 in one batch. No stamp:
    moving isn't changing. New items have no number and land at the bottom. Undo puts the numbers back only where nobody changed
    them since.
  - **Rules:** an item's `order` is absent or a number, greater than -1,000,000 and less than 1,000,000 (a string, null, NaN, a map or a
    list is refused; a rename in the same update is fine); no `hasOnly` on item keys (test: "order" cases in `sync.e2e.mjs`). Deploys
    on merge.
  - **Known limits.** iOS Safari touch behaviour is NOT verified here (Chromium with real touch events only): `touch-action: none`,
    pointer capture and `touchmove` prevention are the standard way, but a real iPhone needs a try. Two phones putting different items into
    the same gap can write the same number; the tie-break keeps their order the same everywhere. Chips scrolled out of sight can't be
    dropped on. A drag with several ticked items only moves them to a place (reordering several at once isn't offered).
- **16 Oct 2026, Bulk edit (commit 4 of the combined PR; the shape of the logbook's `bulkDialog` / `bulk-change.js`, written for the
  pantry's fields, nothing copied):** a screen, `#/bulk`, reached from the Bulk edit button above Items (or from the same button while
  selecting, which brings the ticked items along). Checkbox rows with the Items search and place chips plus a category, **Select all
  matching** (the whole filtered result; ticked items the filter hides are counted, not forgotten) and Select none. Every field starts
  **Unchanged**; you choose which to change: Place (Move to…), Category, Kept track of (Counting, or Plenty, low, out), Best-before
  (move every date by N days later or earlier, or set one date), Add to the shopping list, Delete. Names stay one at a time. **Review
  changes** says "N items will change" (the headline counts items, not fields), lists each choice, up to three before and after,
  what was skipped and why, and warns when it replaces something; **Save** applies ONE batch (`patchMany`) plus one `putMany` for new
  shopping lines, with ONE toast Undo for both ("N changed since, left as they are", counting an item when ANY of its fields had
  been changed since, even if the rest was put back). `js/bulk-items.js` is the pure part (`test/bulk-items.test.mjs`: every choice as
  ops, skips, warnings, and Undo round trips through `invertOps` for batches of moves, categories, conversions, date changes and
  deletes).
  - **Tracking mode.** Counting → Plenty, low, out sets `measure: 'level'` and `level` from the stock (nothing: Out; at or below its
    "on the list when down to" number: Low; else Plenty). The batches are NOT deleted: they stay, hidden, so switching back brings the
    counts and dates back and Undo is exact; Review warns "N items will stop counting: their numbers and dates are kept, hidden".
    Level → Counting removes `measure` and `level`; an item with no stock counted then shows None left (warned). An item converted to
    Plenty, low, out has no dates, so a best-before choice is skipped for it ("kept as Plenty, Low, Out"). Nothing here is lossy, so
    there is no "lossy" warning beyond those two.
  - **Best-before** works on batches with something left (`fefo`): a shift moves each dated one (undated ones are left); a set date
    goes on all of them. Items with no stock, no dates to shift or kept as Plenty, low, out are skipped and counted in Review.
  - **Delete is applied alone** (every other choice is ignored for it) and is the same removal marker as everywhere (Recently removed).
  - The screen's rows read `items()` only (the live-only door): `removed.test.mjs` still guards every list and was extended for the
    few lookups by id that name an item in a toast or a label.

## How to test

```
node pantry/test/logic.test.mjs        # logic, catalogue, backups (plain node; also in the repo Checks)
node pantry/test/quick.test.mjs        # Say or type: dates, places, quantities, matching
node pantry/test/tour.test.mjs         # first steps: quick-start list, checklist ticks
node pantry/test/places.test.mjs       # places: defaults, one document each (normalizing, ids, midpoint order, merging by name), used-but-unlisted, Say or type matching
node pantry/test/people.test.mjs       # names for the family: cleaning, one name as a keyed instruction, labels
node pantry/test/cloud.test.mjs        # how a change becomes Firestore field updates (FieldPath, increment, deleteField) with a stand-in SDK
node pantry/test/merge.test.mjs        # merging duplicate pantries: members, who may, settings
node pantry/test/scan.test.mjs         # the barcode look-up chain with a stubbed fetch (plain node)
node pantry/test/photo.test.mjs        # thumbnail and photo sizes, stepping down to fit the limits (plain node)
node pantry/test/ops.test.mjs          # both shapes of batches, changes as instructions and their inverse, the chip text (plain node)
node pantry/test/bulk-items.test.mjs   # Bulk edit's rules: each choice as ops, skips, warnings, Undo round trips (plain node)
node pantry/test/order.test.mjs        # My order: midpoints, append, prepend, collisions, renumbering, tie-breaks, 200 random sequences (plain node)
node pantry/test/select.test.mjs       # selecting: the selection state and the press and hold with a fake pointer (plain node)
node pantry/test/syncnow.test.mjs      # Sync now: each waiting change in words, last heard, what it says (plain node)
node pantry/test/removed.test.mjs      # removed markers, Restore, days left, the sweep's choice, backups and merging, every list skips removed (plain node)
node pantry/test/config.test.mjs       # set-config, sign-in choice, plain-word errors, sw.js rules
node pantry/test/e2e.mjs               # phone browser test with axe; SHOTS=<dir> saves screenshots
node pantry/test/items.e2e.mjs         # the Items list with real touch (CDP): selecting, press and hold, the actions and their Undo, group by place, grip drags, My order, Bulk edit, axe
pantry/test/run-sync.sh                # two phones and the stock rules (sync.e2e.mjs), the randomised three-phone run (multidevice.e2e.mjs), sign-in by email link and password (signin.e2e.mjs), family sharing, the rules (photo size caps, places and names too) and moving old-style photos in the
                                       # local emulators (demo-pantry, fake accounts)
node tools/check.mjs && node tools/stamp-versions.mjs --check
```

`e2e.mjs` needs Playwright (`PLAYWRIGHT_PATH`) and axe-core (`AXE_PATH`, or `npm install --no-save axe-core`);
`run-sync.sh` needs Java 21 and fetches `firebase-tools` with npx. The "Pantry checks" workflow runs all of them on PRs
touching `pantry/`, `homedesign/` or `__/`. Never point a test at the live Firebase project.
