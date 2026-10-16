# Kaki Home: notes

Lasting decisions and how to test. Now: [STATUS.md](STATUS.md). Setup: [SETUP.md](SETUP.md). Trying it: [TRY.md](TRY.md).

## Decisions

- **16 Oct 2026, a separate app** (owner): Kaki Home tries out a product idea and stays apart from the family pantry:
  own subdomain (`kakihome.flamingbeing.com`), own IndexedDB and localStorage names (`kakihome`), own cache prefix
  (`kakihome-`), own Firebase project. Started as a copy of `pantry/` (16 Oct, after the pantry's welcome PR); the two
  are now separate code. Lessons that apply to both go to the pantry as their own PR.
- **No AI** (owner, 16 Oct: no API credits). The proposal's "zero manual entry" is approximated with what a phone
  does on its own: barcode scan (Open Food Facts), the catalogue (which also gives the "suggested storage location"),
  and **Say or type** (`js/quick.js`): the phone's speech-to-text (Web Speech API where the browser has it, otherwise
  the keyboard's microphone), then plain rules pick out quantity, place and date and match the rest against the
  household's items and the catalogue. Nothing leaves the phone. Everything is shown to confirm before it's added.
- **The main measure** (the proposal's North Star, "household waste prevented"): **used before expiry**, units used
  up while their batch was still in date (dated batches only), counted on the event as `saved` when it happens
  (`takeOut` in `logic.js`). Binning a batch already past its date is recorded as type `expired`, apart from other
  throwing away (`discard`); both count as wasted. Old events without these fields simply count as before.
- **Home** shows the proposal's dashboard: tiles for items at home, expiring soon, low in stock and added this week,
  then the used-before-expiry card, then Expired, Use soon, Opened, Running low, Recently added and This month.
- **Expiring soon** is a per-phone setting (3 days, 1 week, 2 weeks; default 1 week). Low stock stays per item ("on
  the list when down to").
- **Who changed what:** items carry `createdBy` and `updatedBy` (the name from Settings, or the Google first name);
  every event already had `by`. Shown in the item's details, its history and Recently added.
- **Demo `?demo`** is a made-up household of three (Mum, Dad, Helper) with months of history, so the measures and
  "who" have something to show.
- **Not built (needs a server or AI):** push reminders, photo or receipt reading, learned recommendations, linked
  households and roles (the proposal's release 2).
- **Hands-on first steps** (16 Oct, same as the pantry's; `js/tour.js`): a two-card welcome ending at a quick start
  ("What do you have?": everyday goods as chips, added with a rough best-before date) and a Getting started
  checklist on Home whose steps tick themselves off, each with Show me. Only for new users or when turned on in
  Settings → Help.
- Everything else as in `pantry/NOTES.md` (stock as batches, undo over confirm, a household member's change never
  wipes what someone is typing, sign-in on the app's own address, the service worker waits to take over, rules deploy
  on merge with the `KAKIHOME_FIREBASE_PROJECT` variable).

## How to test

```
node kakihome/test/logic.test.mjs      # logic, measures, catalogue, backups
node kakihome/test/quick.test.mjs      # Say or type: dates, places, quantities, matching
node kakihome/test/tour.test.mjs       # first steps: quick-start list, checklist ticks
node kakihome/test/config.test.mjs     # set-config, sign-in choice, plain-word errors, sw.js rules
node kakihome/test/e2e.mjs             # phone browser test with axe; SHOTS=<dir> saves screenshots
kakihome/test/run-sync.sh              # household sharing and the rules in the local emulators (demo-kakihome)
```

The "Kaki Home checks" workflow runs them on PRs touching `kakihome/`, `homedesign/` or `__/`. Never point a test at the
live Firebase project.
