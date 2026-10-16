# Kaki Home: status

## Now

- 16 Oct 2026: first version (PR "Kaki Home: household inventory to try out the Kaki Home idea"): copied from the
  pantry, plus the dashboard tiles, used before expiry and expired, Say or type, who added and changed what, the
  expiring-soon setting and a made-up demo household. Household sharing on since the config PR (16 Oct).

## Waiting on the owner

- Nothing. (16 Oct: the Firebase project, Google sign-in, authorised domain, sign-in client, rules deployer and the
  repo variable were all set up by the owner's helper; the config is committed and the rules deploy on merge.)

## Next

- Ideas from the proposal that need a server or AI: push reminders, receipt and photo reading, recommendations,
  linked households with view / notify / update roles.

## Decisions

- 16 Oct 2026: Firebase on the free Spark plan for now (no backups yet); consent screen published, so any Google
  account can sign in and the rules alone decide who sees a household.

- 16 Oct 2026: separate app, own subdomain and Firebase project; no AI; "used before expiry" as the main measure
  (NOTES.md).
