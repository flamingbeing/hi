# Status (site-wide)

## Now
- Family apps only: songs moved out (21 Oct 2026, repo split S4); previews off.
- Pantry and Kaki Home moved to `flamingbeing/pantry` and `flamingbeing/kakihome` (22 Oct 2026); their folders,
  checks and the rules workflow left this repo the same day.
- Home design system (`homedesign/`): shared by every home app; status in `homedesign/STATUS.md`.

## Next
- Kit: `homedesign/STATUS.md`; apps: their own repos. Account and setup items are in the owner's private notes.

## Decisions
- 16 Oct 2026: home apps live on `*.flamingbeing.com`, code public here. One Cloudflare Worker; a subdomain per data app.
  Design: calm and minimal, light only. Push once per finished step to save build minutes.
