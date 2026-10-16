# Kaki Home: status

## Now

- 16 Oct 2026: fixes only, at the owner's request ("go ahead and improve"): photo thumbnails and size limits (this PR),
  then email sign-in (the Firebase side is switched on), then edits not lost between phones.

- **Feature freeze (owner, 16 Oct 2026): no new features.** Kaki Home is being shared with people outside the family
  to try out. Only fixes (bugs, security, cost) from now on, and only when the owner asks. The family's own app is the
  pantry: new ideas go there.

- 16 Oct 2026: names for household members (PR "Kaki Home: names for household members"); the owner's household
  ("Our home") was created with the pantry family's members by the owner's helper.

- 16 Oct 2026: hands-on walkthrough (PR "Kaki Home: hands-on walkthrough for first-time users"), same as the pantry's.
- 16 Oct 2026: first version (PR "Kaki Home: household inventory to try out the Kaki Home idea"): copied from the
  pantry, plus the dashboard tiles, used before expiry and expired, Say or type, who added and changed what, the
  expiring-soon setting and a made-up demo household. Household sharing on since the config PR (16 Oct).

## Waiting on the owner

- Nothing. (16 Oct: the Firebase project, Google sign-in, authorised domain, sign-in client, rules deployer and the
  repo variable were all set up by the owner's helper; the config is committed and the rules deploy on merge.)

## Next

- Nothing planned (feature freeze). If the owner asks: the pantry's photo thumbnails (cost) and its barcode name
  clean-up are the fixes worth porting.

- Ideas from the proposal that need a server or AI: push reminders, receipt and photo reading, recommendations,
  linked households with view / notify / update roles.

## Decisions

- 16 Oct 2026: Firebase on the free Spark plan for now (no backups yet); consent screen published, so any Google
  account can sign in and the rules alone decide who sees a household.

- 16 Oct 2026: separate app, own subdomain and Firebase project; no AI; "used before expiry" as the main measure
  (NOTES.md).
