# Pantry

A phone app (PWA) for the family's household inventory: what's at home, what's about to expire, how fast we get
through things, and what to buy. Live at **https://flamingbeing.github.io/hi/pantry/** once GitHub Pages is on.

## What it does

- **Add an item** by searching ~190 common Singapore supermarket goods (Kikkoman, Tai Hua, Milo, Gardenia, Dynamo…):
  name, brand, size, category, where it's kept and a rough "keeps N days once opened" fill in. Or scan the barcode
  (looked up in Open Food Facts, then remembered), or type it. Take a photo of it.
- **Stock with dates**: each purchase is a batch with its best-before date. "Opened one" starts the once-opened clock
  (soy sauce: the earlier of the printed date and 90 days after opening). Used 1 / Bin 1 take from the batch that
  expires first. Every action has Undo.
- **Home**: expired, use soon (2 weeks), opened, running low; this month's used vs thrown away.
- **Consumption pattern**: after two "used up"s it learns the pace (e.g. "1 every 3 weeks"), shows a 6-month chart
  (used and wasted) and predicts the run-out date.
- **Shopping list**: suggestions (out, at the "running low" level, or running out within a week) plus things added
  by hand; each links to FairPrice and Sheng Siong search; ticking a pantry item asks how many were bought and its
  date. Share the list to WhatsApp.
- **Family sharing** (after SETUP.md): sign in with Google; one pantry shared with the Google accounts you add.
  Works offline and syncs later.
- Export CSV, back up / restore JSON. Works offline (service worker).

## Files

`index.html`, `app.css`, `js/app.js` (screens), `js/logic.js` (expiry, stock, patterns, shopping list: pure, unit
tested), `js/catalogue.js` (the SG product list), `js/store.js` (on-phone storage), `js/cloud.js` (Google sign-in,
Firestore), `js/scan.js` (barcodes), `js/photo.js`, `js/sample.js`, `config.js` (Firebase config), `sw.js`,
`firestore.rules`. Decisions and how to test: [NOTES.md](NOTES.md). Setting up sharing: [SETUP.md](SETUP.md).
