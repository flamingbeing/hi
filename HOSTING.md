# Hosting: *.flamingbeing.com

One Cloudflare Worker, `flamingbeing-home` (`wrangler.jsonc`, `worker/sites.js`), serves this repo's files. Which
folder each address may see is the `SITES` table in `worker/routes.js`; `/homedesign/` is shared by every host.
Workers Builds deploys it on each merge to `main` and posts a preview link on every PR. No data and no secrets in the
Worker. `flamingbeing.com` itself (the owner's server page) is not served by it.

| Address | Folder | What |
|---|---|---|
| `design.flamingbeing.com` | `homedesign/` | The design system's guide pages |
| `pantry.flamingbeing.com` | `pantry/` (+ `/__/auth/`) | Household inventory (custom domain: owner, `pantry/SETUP.md` step 1) |
| `kakihome.flamingbeing.com` | `kakihome/` (+ `/__/auth/`) | Kaki Home, a household inventory to try out a product idea (own data and Firebase project) |

- **Previews:** `https://<branch>-flamingbeing-home.<account>.workers.dev/`. A preview serves the whole repo; try a
  host's view at `<preview>/_sites/pantry.flamingbeing.com/?demo`. Sign-in never works on previews (on purpose).
- **Adding an app:** add its host to `SITES` (and a test in `worker/test/routes.test.mjs`) and to `routes` in
  `wrangler.jsonc` (`custom_domain: true`); the deploy on merge creates the address. Ask the owner first whether the
  name is already in use.
- **Service-worker versions** are stamped by the build command (`node tools/stamp-versions.mjs`).
- Check a change to `.assetsignore`/`wrangler.jsonc` with `npx wrangler deploy --dry-run`.

Account setup (Workers Builds connection, build watch paths, domain names already in use, one-time clicks) is in the
owner's private notes. Ask the owner before adding a subdomain, and keep app names one level deep
(`pantry.flamingbeing.com`): Cloudflare's free certificate covers only one level.
