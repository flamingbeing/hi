# Pantry: status

## Now

- 16 Oct 2026: rebuilt on the home design kit (PR "Pantry: family household inventory on the home design kit"):
  on-phone pantry, demo mode, family sharing code and rules (tested in the emulators), offline, rules deploy workflow.

- 16 Oct 2026: live at https://pantry.flamingbeing.com (custom domain from `wrangler.jsonc`). Firebase project
  `flamingbeing-pantry` created (Firestore asia-southeast1); web config committed; rules deployed on merge (the
  workflow ran green once).

## Waiting on the owner

- Billing: link `flamingbeing-pantry` to Blaze (the billing account's 5-project quota is full: unlink one or ask for
  more), then the US$5 budget and daily backups (the home computer does these).
- Google sign-in clicks (SETUP.md steps 6–7): Authentication → Get started → Google → Enable; the OAuth web client's
  origin `https://pantry.flamingbeing.com` and redirect `https://pantry.flamingbeing.com/__/auth/handler`; publish the
  "Pantry" consent screen. The home computer then adds the authorised domain. Until then sign-in shows an error and
  the app keeps working on the phone.

## Next

- After the sign-in clicks: a first sign-in on the phone, Start our family pantry, add the family.
- Ideas: reminders for things about to expire (needs a server or push), prices per purchase (`price` is already
  accepted on "add" events), receipt photo to items, more catalogue lines, share "use this week" to WhatsApp.

## Decisions

- 16 Oct 2026: rebuilt on `/homedesign/` (no emoji, `pa-` styles, kit icons); hosted on `pantry.flamingbeing.com`
  with sign-in on its own address; deploy-time version stamps; Firebase on Blaze with daily backups (NOTES.md).
