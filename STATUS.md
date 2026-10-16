# Status (site-wide)

## Now
- Koh family home design system (`homedesign/`): in progress on its own PR.
- Pantry: rebuilt on the design system after both merge (first version was PR #5, closed; its code carries over).

## Waiting on the owner
- Cloudflare: Worker `flamingbeing-home` connected (16 Oct). Still to do: custom domain `design.flamingbeing.com`,
  preview settings and build watch paths (HOSTING.md).
- Firebase project for the pantry (pantry/SETUP.md, comes with the Pantry PR).

## Decisions
- 16 Oct 2026: home apps live on `*.flamingbeing.com`, code public in `hi`, private notes in `life`. One Cloudflare
  Worker like anawj.com's; a subdomain per data app. Design: calm and minimal, light only. Firebase on Blaze with
  daily backups.
- 16 Oct 2026: `*.flamingbeing.com` also carries the owner's home/Tailscale catch-all; app names are checked with the
  owner first. Push once per finished step to save build minutes.
