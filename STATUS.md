# Status (site-wide)

## Now
- Kaki Home (`kakihome/`, 16 Oct): a separate household inventory to try out a product idea; status in
  `kakihome/STATUS.md`. Its Firebase project was requested from the owner's helper.
- Home design system (`homedesign/`): merged (#8); the pantry PR adds 22 household icons to it.
- Pantry: rebuilt on the design system (PR "Pantry: family household inventory on the home design kit"; first version
  was PR #5, closed). Status in `pantry/STATUS.md`.

## Waiting on the owner
- Cloudflare: Worker `flamingbeing-home` connected (16 Oct). Still to do: custom domain `design.flamingbeing.com`,
  preview settings and build watch paths (HOSTING.md).
- Pantry: `pantry/SETUP.md` (Firebase project, sign-in client, rules-deploy secret and variable, custom domain
  `pantry.flamingbeing.com`).

## Decisions
- 16 Oct 2026: Firestore rules deploy on merge (`.github/workflows/deploy-firestore-rules.yml`, one matrix entry per
  app, project id from a repo variable); it skips cleanly until the secret and variable are set.
- 16 Oct 2026: home apps live on `*.flamingbeing.com`, code public in `hi`, private notes in `life`. One Cloudflare
  Worker like anawj.com's; a subdomain per data app. Design: calm and minimal, light only. Firebase on Blaze with
  daily backups.
- 16 Oct 2026: other names under `flamingbeing.com` are already in use; app names are checked with the owner
  first. Push once per finished step to save build minutes.
