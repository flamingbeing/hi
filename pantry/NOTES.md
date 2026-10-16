# Pantry: notes

## Decisions (16 Oct 2026, first build)

- Lives in the public `hi` repo (owner's request): code, made-up sample data and general product names only. Real
  household data stays in Firestore; private notes go in `flamingbeing/life` (`plans/pantry-app.md`).
- Plain HTML/JS modules, no build step, like the anawj.com apps. Firebase SDK from gstatic, loaded only when
  `config.js` has a config, so the app works with no account (on-phone IndexedDB) and Firestore is an add-on.
- One household per family: `households/{hid}` with `members` (Google emails, lower case). Rules allow only members;
  the person who started it can't be removed. Subcollections `items`, `events`, `shop`.
- Photos are shrunk to ~480 px JPEG data URLs inside the item (fits Firestore's 1 MB doc limit; no Storage, which now
  needs the paid plan).
- Stock is batches (qty, best-before, opened date). "Use-by" = earlier of best-before and opened + `openDays`.
  Taking out is first-expiring-first. The consumption pace comes from "use" events: (last − first finish) ÷ units
  after the first; run-out = last finish + stock × pace.
- NTUC FairPrice and Sheng Siong have no public product API and block cross-site requests, so the app has its own
  list of common SG goods (`js/catalogue.js`) and links to each shop's search. Barcodes go to Open Food Facts
  (open, CORS, patchy for SG; unknown barcodes are remembered once named). iPhone has no built-in barcode reader, so
  a ZXing WebAssembly polyfill loads from jsDelivr on first scan.
- Sign-in: popup in a browser tab, redirect in the installed Android app. On iPhone's installed app a redirect
  across domains (github.io ↔ firebaseapp.com) can lose its storage; if that bites, serve the app from a custom
  domain and set `authDomain` to it (as anawj.com's logbook does), or sign in once in Safari.
- Settings ends with "App version …" and "Not updating? Get the latest version" (as on anawj.com apps).

## Testing

```
node pantry/test/logic.test.mjs      # logic and catalogue
node pantry/tools/stamp.mjs          # after changing any app file (sw.js file list and VERSION)
node pantry/test/version.test.mjs
node pantry/test/e2e.mjs             # phone-sized browser run; SHOTS=<dir> saves screenshots
pantry/test/run-sync.sh              # family sharing + rules in the local Firebase emulators (fake accounts)
```

The "Pantry checks" workflow runs all of these on PRs touching `pantry/`.

## Status

- Done: the app, offline, sharing, rules, tests.
- Waits on the owner: SETUP.md steps 1–5 (Pages on, Firebase project, config).
- Ideas next: reminders (a daily push for things expiring needs a server; for now Home shows them), price tracking
  per purchase (`price` is already accepted on "add" events), receipt photo → items, more catalogue lines, a
  household-wide "expiring this week" share to WhatsApp, `pantry.anawj.com` custom domain.
