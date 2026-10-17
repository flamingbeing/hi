# Pantry: sync safety

Instructions not copies, removal markers, one record per name and place, the listener watchdog, and what is left. Index: [../NOTES.md](../NOTES.md).

- **16 Oct 2026, sync safety, PR-A of three** (owner-approved plan: the sync-safety plan (private notes); goal: nothing a person saw as
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
    phone has the old one: a month after PR-A is live is plenty; an optional one-time migration by the owner's
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
  the sync-safety plan (private notes); owner: 30 days in Recently removed = yes).**
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

- **16 Oct 2026, names by field and places as one record each (sync safety, PR-C of three, the last; the sync-safety plan (private notes);
  owner: "places: one record each", names as dotted merge writes).** Goal: nothing a person saw as saved is lost by another phone,
  online or offline. What stays whole-document is listed under "The picture now" below.
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
  - **Still whole-document, on purpose:** see "What stays whole-document, and why" below.

- **16 Oct 2026, the listener watchdog (commit 5 of the combined PR; evidence from the live harness, `test/live-multidevice.mjs`, scenario 9,
  seed 11, a full run, with `--shadow`, on the emulator dry run `test/run-live-dry.sh`):** before the fix that run failed about half the time
  (found 2 of 4 clean runs): phone A showed an old value (eggs/e2 = 5) while the server and the SDK's own cache had 4. **Root cause, as far
  as it could be taken:** the page last heard `{e2: 5}` while its own write was pending, then nothing. The SDK reported every write
  acknowledged and not `fromCache`, the document stayed flagged `hasPendingWrites` (the SDK clears that flag only when the listen stream
  delivers the server's version), and the app's listener, the harness's shadow listeners AND a listener made again all stayed behind for
  30+ s, until the harness's own server read and a new listener (35 s) woke the connection. So it is not the app dropping a snapshot
  (docChanges is now read with metadata changes and each document compared with what was last delivered: that is kept as a safety net,
  but it was not the cause) and not only a dead listener: **the connection the listeners share was dead after an offline spell** (the
  browser's network was cut and restored; the SDK did not notice). WebKit's "reload while offline, then online" failure ("docFromCache
  error unavailable", right only "after listening again") fits. The owner's long "Waiting for signal (1 change)" on wifi with a VPN
  very likely was this and the false positive of commit 1.
  - **What the app does now** (`js/listen-watch.js`, pure, `test/listen-watch.test.mjs`; the facts are kept in `cloud.js`): a
    timer (every 3 s) and the moments a phone comes back (the browser's `online`, the page becoming visible, `pageshow`, Sync now)
    look for three signs, never while the browser says it is offline: a listener showing only the phone's own copy for 8 s ("cache"); a
    document still flagged pending 6 s after every write of this phone was acknowledged ("flagged"); and, only at a coming-back moment,
    no snapshot from the server for 10 s ("quiet": a quiet household sends nothing for hours, so age alone is never a sign). Then: (1) the
    listeners are replaced (old unsubscribers closed first, never two sets; the new first snapshot only reports documents that
    changed or are gone, a resume token keeps the read to what changed; at most one every 30 s); (2) if the sign is still there 6 s
    later and nothing is unacknowledged, the SDK's network is switched off and on (`disableNetwork`, 300 ms, `enableNetwork`; at
    most one a minute). The restart is allowed only when every write is acknowledged, because a restart sends an unacknowledged write
    again and an increment sent twice counts twice; and that is exactly when a flagged document can be called stuck. Result: seed 11
    now passes (5 of 5 full runs, the stale phone catching up in about 20 s instead of never inside the harness's 30 s).
  - **The chip** uses the same freshness: `syncState` ignores "showing its own copy" when the server was heard from in the last 10 s
    (`recent`), and `pending` already counts only unacknowledged writes (commit 1), so a stale listener with nothing to send says Saved.
  - **Test:** `sync.e2e.mjs` "the listener watchdog" (through `test/proxy.mjs`, whose `dropListen` throws away what the server says on the
    listen stream, a dead stream nothing reports): the phone does not hear a change; at a coming-back moment it listens again and
    catches up inside 15 s, once (a second nudge inside 30 s does nothing); and with a write acknowledged on a dead stream it acts by
    itself (no event) and catches up.

## The picture now and the limits that remain


| Thing | How it is written | Two phones at once |
|---|---|---|
| Stock (use, open, add, freeze, level) | `increment()` and field sets on `batches.<id>.*` | both counted |
| Item fields (place, notes, edit) | only the changed fields | each field its own; the same field: last write |
| Delete / Undo of add | `removedAt` marker; Restore clears it | never brought back; changes land on the hidden item |
| Shopping line (tick, rename, remove) | fields | tick and remove both kept |
| Names | one field per person | both kept |
| Places | one document each; fields | both kept; remove beats rename (Restore shows the rename) |
| History (events) | write-once | nothing edits one |

#### What stays whole-document, and why

- A **new** item, shopping line or place: a new random id, so there is nothing to overwrite (two phones adding "Milk" make two).
- **Restoring a backup, "Copy from this phone", merging two pantries**: deliberate bulk writes the person asked for (the merge
  counts what arrived before it deletes anything; places are merged by name, not overwritten).
- An **old-style array item**: converted once, by one write built from this phone's copy (PR-A).
- **Item name/notes/category edited on two phones at once, the same shopping line's text, the household name**: last write per
  field, on purpose (rare, harmless).
- `settings/places` (the old single list): still allowed by the rules for phones older than PR-C; new phones ignore it once a
  household has place documents.

#### Known limits that remain

- `increment()` is at-least-once: a connection lost in the instant between the server applying a write and the phone hearing so
  can count a unit twice.
- A write the server *refuses* makes the SDK resend the writes queued after it (their increments twice), so refusals must stay rare.
- The 40-place cap is the app's: the rules can't count documents, so two phones adding the 40th place at the same moment can make 41.
- Two places added at the same moment with the same name show once (the other is hidden until the first is removed); removing a
  place removes both.
- A phone that is offline for a long time and then sends a change for a document the sweep purged is refused ("Needs attention").
- Phones older than PR-C still write `settings/places` and whole items; their place edits after the migration are not seen by new
  phones (and vice versa) until they update.
- Names of people who left stay in `settings/people` until cleared (dropped only to make room under the 20-name rule).


## Engine lessons from the real service

- A rule that reads the household with `get()` ERRORS (it does not deny) when the household document no longer exists. The app leaves a dead pantry (`watchHousehold`). Rules `get()` lookups are billed as reads.
- `enableNetwork` while the network is already enabled crashes Firestore 10.14.1 in the tests: only call it after `disableNetwork`.
- `increment()` is at-least-once on the real service; safe counting (idempotent entries) is the next step in [../STATUS.md](../STATUS.md).
