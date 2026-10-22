# Status (site-wide)

## Now
- Family apps only: songs moved out (21 Oct 2026, repo split S4); previews off.
- Pantry and Kaki Home moved to `flamingbeing/pantry` and `flamingbeing/kakihome` (22 Oct 2026); the `pantry/` and
  `kakihome/` folders here are unserved until the clean-up PR.
- Home design system (`homedesign/`): shared by every home app; status in `homedesign/STATUS.md`.
- Rules deploy on merge (`.github/workflows/deploy-firestore-rules.yml`, one matrix entry per app, project id from a repo
  variable); it skips cleanly until the secret and variable are set.

## Next
- See each app's `STATUS.md`. Account and setup items are in the owner's private notes.

## Decisions
- 16 Oct 2026: home apps live on `*.flamingbeing.com`, code public here. One Cloudflare Worker; a subdomain per data app.
  Design: calm and minimal, light only. Push once per finished step to save build minutes.
