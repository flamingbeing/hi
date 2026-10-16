# Status (site-wide)

## Now
- Repo foundation (Worker, checks, instructions): this PR.
- Koh family home design system (`homedesign/`): in progress on its own PR.
- Pantry: rebuilt on the design system after both merge (first version was PR #5, closed; its code carries over).

## Waiting on the owner
- Cloudflare: connect Workers Builds to this repo and add `design.flamingbeing.com` (HOSTING.md, one-time setup).
- Firebase project for the pantry (pantry/SETUP.md, comes with the Pantry PR).

## Decisions
- 16 Oct 2026: home apps live on `*.flamingbeing.com`, code public in `hi`, private notes in `life`. One Cloudflare
  Worker like anawj.com's; a subdomain per data app. Design: calm and minimal, light only. Firebase on Blaze with
  daily backups.
