# Pantry: status

## Now

- 16 Oct 2026: rebuilt on the home design kit (PR "Pantry: family household inventory on the home design kit"):
  on-phone pantry, demo mode, family sharing code and rules (tested in the emulators), offline, rules deploy workflow.

- 16 Oct 2026: live at https://pantry.flamingbeing.com (custom domain from `wrangler.jsonc`). Firebase project
  `flamingbeing-pantry` created (Firestore asia-southeast1); web config committed; rules deployed on merge (the
  workflow ran green once).

- 16 Oct 2026: first-time help (PR "Pantry: welcome walkthrough and how-to guide for first-time users"): a welcome on
  first open (once per phone), the guide screen `#/guide`, quiet hints; the invite link now lands on Settings.

## Waiting on the owner

- Billing: waiting on the owner (Blaze), then the US$5 budget and daily backups.
- Google sign-in clicks (SETUP.md steps 6–7): Authentication → Get started → Google → Enable; the OAuth web client's
  origin `https://pantry.flamingbeing.com` and redirect `https://pantry.flamingbeing.com/__/auth/handler`; publish the
  "Pantry" consent screen. Then the authorised domain is added. Until then sign-in shows an error and
  the app keeps working on the phone.

## Next

- After the sign-in clicks: a first sign-in on the phone, Start our family pantry, add the family.
- Ideas: reminders for things about to expire (needs a server or push), prices per purchase (`price` is already
  accepted on "add" events), receipt photo to items, more catalogue lines, share "use this week" to WhatsApp.

## Decisions

- 16 Oct 2026: first-time help is a once-per-phone welcome sheet plus a guide screen, no popups elsewhere (NOTES.md).

- 16 Oct 2026: rebuilt on `/homedesign/` (no emoji, `pa-` styles, kit icons); hosted on `pantry.flamingbeing.com`
  with sign-in on its own address; deploy-time version stamps; Firebase on Blaze with daily backups (NOTES.md).
