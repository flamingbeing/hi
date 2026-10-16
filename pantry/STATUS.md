# Pantry: status

## Now

- 16 Oct 2026: rebuilt on the home design kit (PR "Pantry: family household inventory on the home design kit"):
  on-phone pantry, demo mode, family sharing code and rules (tested in the emulators), offline, rules deploy workflow.

- 16 Oct 2026: live at https://pantry.flamingbeing.com (custom domain from `wrangler.jsonc`). Firebase project
  `flamingbeing-pantry` created (Firestore asia-southeast1); web config committed; rules deployed on merge (the
  workflow ran green once).

- 16 Oct 2026: first-time help (PR "Pantry: welcome walkthrough and how-to guide for first-time users"): a welcome on
  first open (once per phone), the guide screen `#/guide`, quiet hints; the invite link now lands on Settings.

- 16 Oct 2026: improvements from Kaki Home (PR "Pantry: used before expiry, Say or type and who changed what"):
  used-before-expiry and expired recorded, Say or type quick entry, added and changed by, Use soon setting.

- 16 Oct 2026: hands-on walkthrough for first-time users (PR "Pantry: hands-on walkthrough for first-time users"): two-card
  welcome, quick start chips, Getting started checklist with Show me.

- 16 Oct 2026: photos (PR "Pantry: small thumbnails in lists, full photos only when opened, size caps in the rules"):
  items keep a ~2 KB thumbnail, the photo is read only when its item opens; old-style photos move by themselves; the
  rules cap thumbnails at 12 KB and photos at 150 KB (deploy on merge).

- 16 Oct 2026: places (PR "Pantry: see, edit and add your own places"): Settings → Places lists each place with its
  count; rename, reorder, remove (asks where items go) and add your own; defaults gain Level 1 fridge, Level 1 freezer
  and Basement store; shared with the family through `settings/places` (rules change, deploys on merge).

- 16 Oct 2026: names and the research items (branch, PR to follow): names for family members (contact sheet;
  `settings/people`, rules change, deploys on merge); guessed best-before dates; Since you last looked and WhatsApp
  links; Freeze and Thaw; Leftovers; shopping list by aisle with Buy again, mic, Going shopping and Put away; Plenty /
  Low / Out for staples; Scan many.

- 16 Oct 2026: sign in by email link and password besides Google (branch, PR to follow); also the household pick fix
  (an account in two pantries opened the wrong one).

- 16 Oct 2026: merge duplicate pantries (Settings card and sheet; copies, counts, then deletes the extra one; owner only).

- 16 Oct 2026: sync safety, PR-A of three (plan: PLAN-sync.md): batches as a map (both shapes read), every stock change sent as
  instructions (increment, field sets) and Undo as the inverse, Edit sends only changed fields, the Saved / Waiting for signal /
  Needs attention chip with Retry and Discard in Settings, history write-once in the rules (rules change, deploys on merge).
  Next: PR-B (deletes as markers, Recently removed 30 days, shopping list as field updates), PR-C (names by field, one record per place).

- 16 Oct 2026: sync safety, PR-B of three (branch, PR to follow): deleting an item or shopping line is a marker (`removedAt`,
  `removedBy`) that every list skips; Settings → Recently removed (30 days, Restore); a change that lands on a removed item
  never brings it back, and Home says so when it was yours; a daily sweep deletes what is over 30 days old; shopping ticks,
  renames and removals are field changes; shopping lines now have rules (fields and lengths; rules change, deploys on merge).
  (PR-C followed: see the next entry.)

- 16 Oct 2026: sync safety, PR-C of three, the last (branch, PR to follow): a name is saved as one field (`names.<email>`, a
  FieldPath update), so two people naming themselves or one naming while another stops sharing never overwrite each other; every
  place is its own document (`places/{id}`): rename and reorder are field changes (reorder sets `order` to the midpoint of the new
  neighbours), add is a new document, remove is a marker with Restore in Recently removed and the 30-day sweep; the old single
  list migrates on the first change (same documents on every phone; the rules refuse a late copy over a real change). Rules change
  (new `places` collection; deploys on merge). Phones older than this version still write the old list: their place edits don't
  show on new phones until they update. Plan complete: PLAN-sync.md has the picture and the limits that remain.

- 16 Oct 2026: one combined PR after sync safety (the owner's queue), as separate commits. Commit 1, small fixes: a pantry deleted or
  merged away under an open phone (the phone moves to the one left, or says "Your pantry changed" with Try again); Sync now in
  Settings → Saving to the family (waiting changes in words, last heard from the family); the "Waiting for signal" chip no longer
  reads an acknowledged change as waiting (reproduced in the emulator); no "Your name" field in a family pantry (adopted once as
  the family name). Commit 2: select mode on Items (Select button, press and hold, checkboxes, a bar with Move to… / Shopping list /
  Delete and one Undo each) and Group by place. Next in the PR: drag by grip and My order, Bulk edit.

## Waiting on the owner

- Billing: waiting on the owner (Blaze), then the US$5 budget and daily backups.
- Email sign-in switch (Firebase console, project `flamingbeing-pantry`, via Firetop if easier): Authentication →
  Sign-in method → **Email/Password** → Enable, and tick **Email link (passwordless sign-in)** → Save. The authorised
  domain `pantry.flamingbeing.com` is already there. Until then "Use email instead" says "This way of signing in isn't
  switched on yet."
- Google sign-in clicks (SETUP.md steps 6–7): Authentication → Get started → Google → Enable; the OAuth web client's
  origin `https://pantry.flamingbeing.com` and redirect `https://pantry.flamingbeing.com/__/auth/handler`; publish the
  "Pantry" consent screen. Then the authorised domain is added. Until then sign-in shows an error and
  the app keeps working on the phone.

## Next

- After the sign-in clicks: a first sign-in on the phone, Start our family pantry, add the family.
- Ideas: reminders for things about to expire (needs a server or push), prices per purchase (`price` is already
  accepted on "add" events), receipt photo to items, more catalogue lines. From the research still open: real
  reminders (push, needs a Worker cron), money saved or wasted, recipe-idea links, pasting an online order.

## Decisions

- 16 Oct 2026: names are one field each (keyed instruction, FieldPath); places are one document each with a midpoint `order`;
  migrating from the old list is made safe by the rules (fixed 1970 `updatedAt`: only as new or identical), not by luck; old
  phones keep writing `settings/places` and are ignored after the migration (owner: places "one record each"; NOTES.md).

- 16 Oct 2026: a delete is a marker, never a document delete (except the daily sweep of things removed over 30 days ago, and
  merging pantries); Undo is Restore; Recently removed keeps 30 days (owner's yes); shopping lines are fields with caps in the
  rules (NOTES.md).

- 16 Oct 2026: never save a whole item from a stale copy: changes travel as instructions (no transactions); batches are a map;
  spent batches linger at 0 until 40; history is write-once; refused writes are kept and shown, not dropped (NOTES.md).

- 16 Oct 2026: three ways in: Google, emailed link, password; rules keep requiring a verified email, so a new password
  account sees nothing until it taps the emailed link (NOTES.md).

- 16 Oct 2026: names live in `settings/people` (members only, at most 20, 1-40 characters); ticking the shopping list
  no longer opens Bought more: Put away does them all at once; freezing moves the whole item (places are per item)
  (NOTES.md).

- 16 Oct 2026: places are a per-household list in `settings/places`; items keep their place as text, so nothing is
  lost when a place leaves the list (NOTES.md).

- 16 Oct 2026: thumbnails on items, photos in `photos/<id>` read only when an item opens, to stay inside Firestore's
  free downloads (NOTES.md).

- 16 Oct 2026: first-time help is a once-per-phone welcome sheet plus a guide screen, no popups elsewhere (NOTES.md).

- 16 Oct 2026: rebuilt on `/homedesign/` (no emoji, `pa-` styles, kit icons); hosted on `pantry.flamingbeing.com`
  with sign-in on its own address; deploy-time version stamps; Firebase on Blaze with daily backups (NOTES.md).
