# Kaki Home: status

## Now

- 16 Oct 2026: first version (PR "Kaki Home: household inventory to try out the Kaki Home idea"): copied from the
  pantry, plus the dashboard tiles, used before expiry and expired, Say or type, who added and changed what, the
  expiring-soon setting and a made-up demo household. On-phone until the Firebase project's config arrives.

## Waiting on the owner

- Firebase project for Kaki Home: asked of the owner's helper (16 Oct). When its web config arrives:
  `node kakihome/tools/set-config.mjs '<config>'` in a PR. Then the owner's console clicks (SETUP.md steps 6–7).

## Next

- Ideas from the proposal that need a server or AI: push reminders, receipt and photo reading, recommendations,
  linked households with view / notify / update roles.

## Decisions

- 16 Oct 2026: separate app, own subdomain and Firebase project; no AI; "used before expiry" as the main measure
  (NOTES.md).
