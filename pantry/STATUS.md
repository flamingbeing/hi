# Pantry: status

## Now

- 16 Oct 2026: rebuilt on the home design kit (PR "Pantry: family household inventory on the home design kit"):
  on-phone pantry, demo mode, family sharing code and rules (tested in the emulators), offline, rules deploy workflow.

## Waiting on the owner

- [SETUP.md](SETUP.md): the Firebase project, Google sign-in, the OAuth client, then send the web config to Claude.
- Cloudflare: the custom domain `pantry.flamingbeing.com` (check first that the name isn't used at home: HOSTING.md).
- A look on the phone through the PR preview (`<preview>/_sites/pantry.flamingbeing.com/?demo`).

## Next

- When the config arrives: `node pantry/tools/set-config.mjs '<config>'`, PR, then a first sign-in on the phone.
- Ideas: reminders for things about to expire (needs a server or push), prices per purchase (`price` is already
  accepted on "add" events), receipt photo to items, more catalogue lines, share "use this week" to WhatsApp.

## Decisions

- 16 Oct 2026: rebuilt on `/homedesign/` (no emoji, `pa-` styles, kit icons); hosted on `pantry.flamingbeing.com`
  with sign-in on its own address; deploy-time version stamps; Firebase on Blaze with daily backups (NOTES.md).
