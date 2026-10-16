# Pantry sync safety: plan (approved by the owner, 16 Oct 2026)

Goal: nothing a person saw as "saved" is lost or brought back by another phone, online or offline; no logbook-sized queue.

Rule of the design: **never save a whole item from a stale copy.** Say what changed (a field, an "add/subtract") and let the server combine.

## Pieces, one PR each, each merged before the next

1. **Foundations and safety net (small).** "Saved on this phone, waiting for signal" chip (Firestore pending-writes metadata); a refused write keeps its copy and says "needs attention" instead of vanishing. Check whether anything edits or deletes `events`; if not, rules make events create-only.
2. **Batches as a map.** `items/{id}.batches` becomes `{ <batchId>: {qty, expiry, ...} }` (today an array). Readers accept both shapes; items convert the next time they are saved. Rules accept both for a transition period (old phones still on the old app can write arrays; readers cope).
3. **Changes as instructions, not snapshots.** Use/open/add change `batches.<id>.qty` with `increment()` (server adds, so two phones each using one gives two, also offline), and other fields with `updateDoc` dotted paths. Batch used up = qty 0, tidied later. Undo becomes the inverse instruction (increment back), not a rewrite of the old copy. Stock never below 0 on screen.
4. **Deletes that can't bring things back.** Item and shopping-line delete = `removedAt` marker (doc stays); a "Recently removed" list in Settings for 30 days restores; an owner/any-member sweep purges after 30 days. An offline edit of a removed item lands on the hidden item and shows in Recently removed, never resurrects it.
5. **Shopping list.** Tick/untick and rename are field updates; remove uses the marker; Put away is one batch of instructions.
6. **Names and places (done in PR-C).** Names: `settings/people` written with dotted `names.<email>` (merge), so two people naming themselves don't overwrite each other. Places: one doc per place `places/{id}` {name, order}; rename = field update; the item's place stays by name until renamed (rename updates items, as now, and an item added meanwhile with the old name is tolerated by the existing "not in your list" handling). Optional: leave places last-save-wins if you prefer less change.
7. **Tests.** Unit: instruction helpers, shape conversion, both array/map. Emulator two-device scenarios (use/use, add/use, offline use then reconnect, edit vs delete both orders, tick vs remove, rename vs add item, names on both phones). Randomised 3-5 phones going offline (seeded, like the logbook's tools/test-multidevice.sh), invariant: stock = bought − used from events, no deleted thing returns, no lost shopping line. Rules tests for the new shapes.

## Costs
Writes are smaller (fields, not whole items). No transactions (they fail offline). No extra listeners or full reads; photos unchanged. Recently-removed sweep: one small query when the app opens, at most once a day per household.

## Risks
- Phones on the old app version during rollout: readers accept both shapes; the app updates itself on next open (service worker); a very old phone could still write a whole array, which readers convert.
- `increment()` can go below zero if two phones use the last unit; the screen clamps at 0 and shows the batch as used up.
- Rules change deploys live on merge (run rules tests first; no loosening).

## What stays last-save-wins on purpose
Item name/notes/category edited on two phones at once (rare, harmless), shopping line text, household name.

## The owner's answers (16 Oct 2026)

1. 30 days in "Recently removed": **yes**.
2. Places: **one record each** (`places/{id}`), not one list.
3. Build it **PR by PR**, each merged before the next. PR-A (this one): pieces 1, 2, 3 and the first part of 7 (tests).
   PR-B: soft deletes, Recently removed and the shopping list (pieces 4, 5). PR-C: names written by field and places one
   record each (piece 6).

## PR-B: done (pieces 4 and 5), what building it taught

- A delete is `removedAt` + `removedBy` as field sets; `isRemoved` / `live` is the one door; a test fails if a list skips it.
  Undo of a delete is Restore; Undo of *adding* a thing is a marker too (so the app deletes for real only in the sweep and the
  merge), at the price of a just-added-then-undone item sitting in Recently removed.
- The sweep is a small **transaction per document** (read, delete only if still removed and old), not a bare `deleteDoc`: a
  Restore on another phone, or another phone's sweep, can't be undone or doubled by a phone with an old copy. At most 20 a day.
- Shopping lines had no rules at all; now fields and lengths are capped (`id` = the document id, `name` at most 80 characters,
  `done` a bool, optional `itemId`, `at`, `by`, `doneBy`, the two removal fields, nothing else). The merge test had seeded a line
  with a `text` field the app never wrote; the new rules refuse it, so the test seed now uses the real shape.
- A rules **compile** error looks like `invalid-argument` on every request in the emulator (`is boolean` should be `is bool`).
- "My change landed on a removed item" is told from `touched` (this phone's own changes, kept in localStorage) against
  `removedAt`, plus the listener's `hasPendingWrites`, so it also works after a long offline spell.
- Put away is still several writes (items by field, lines by marker), each safe on its own, not one atomic batch.

## PR-C: done (piece 6, plus the last of piece 7), what building it taught

- Names are saved one person at a time: a **keyed instruction** (`keyed: { names: { set, del } }` in the ops of `logic.js`) that
  `cloud.js` sends as a `FieldPath` update (`names`, the whole email), so an email's dots are never a path; the other backends
  apply the same instruction (`applyFieldOps`). The rules for `settings/people` needed no change: they judge the resulting document.
- Places are **one document each** (`places/{id}`: `name`, `order`, `updatedAt`, `removedAt`/`removedBy`). Rename and move are
  one field; a move sets `order` to the midpoint of the new neighbours (renumbering only when no room is left); add is a new
  document; remove is the same marker as items (Recently removed, the 30-day sweep).
- **Migration from the single list is made safe by the rules, not by hoping phones agree**: documents made from the old list carry
  a fixed `updatedAt` (1970), ids made from the name, and the rules accept such a write only as a new document or as exactly what
  is there. Two phones migrating at once write the same documents; a phone offline with the old list can never overwrite a place
  someone changed since (its whole seed batch is refused and its copy follows the server).
- An update of a document that isn't there is refused as `permission-denied` for places and names (the rules have no document to
  build the result from), where items give `not-found`; the app only meets this if a place is purged by the sweep while a phone
  still has a change queued for it (30 days later).
- The randomised run found no app bug, but its first run of the new invariants failed on a test mistake: names and places persist
  from one seed to the next in the same pantry, so each seed starts from what the last left.

### The picture now (nothing a person saw as saved is lost by another phone)

| Thing | How it is written | Two phones at once |
|---|---|---|
| Stock (use, open, add, freeze, level) | `increment()` and field sets on `batches.<id>.*` | both counted |
| Item fields (place, notes, edit) | only the changed fields | each field its own; the same field: last write |
| Delete / Undo of add | `removedAt` marker; Restore clears it | never brought back; changes land on the hidden item |
| Shopping line (tick, rename, remove) | fields | tick and remove both kept |
| Names | one field per person | both kept |
| Places | one document each; fields | both kept; remove beats rename (Restore shows the rename) |
| History (events) | write-once | nothing edits one |

### What stays whole-document, and why

- A **new** item, shopping line or place: a new random id, so there is nothing to overwrite (two phones adding "Milk" make two).
- **Restoring a backup, "Copy from this phone", merging two pantries**: deliberate bulk writes the person asked for (the merge
  counts what arrived before it deletes anything; places are merged by name, not overwritten).
- An **old-style array item**: converted once, by one write built from this phone's copy (PR-A, known limit 3).
- **Item name/notes/category edited on two phones at once, the same shopping line's text, the household name**: last write per
  field, on purpose (rare, harmless).
- `settings/places` (the old single list): still allowed by the rules for phones older than PR-C; new phones ignore it once a
  household has place documents.

### Known limits that remain

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

## How PR-A differs from the draft above (what building it taught)

- Undo is the *inverse instructions*, and a field is put back only if nobody changed it since (`invertOps` in `js/logic.js`).
- The rules cap 60 batches and check every id, but type-check only the first 12 batches' `qty` and `expiry` (the rules
  engine allows 1000 expressions a request, and 16 such checks use them up; tested with 60 batches). The app clamps
  any quantity it reads.
- `qty` may go to -99 in the database (two phones using the last unit both count; the screen shows 0).
- An old array turns into a map in one write that carries a `convertedAt` token; the rules refuse a second, stale
  conversion, and the app then applies that phone's change to the map (no loss, no Retry tap needed).
- History (events) is write-once in the rules (create, delete for Undo, and a rewrite identical to what is there).
