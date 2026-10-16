# Hosting: *.flamingbeing.com

One Cloudflare Worker, `flamingbeing-home` (`wrangler.jsonc`, `worker/sites.js`), serves this repo's files. Which
folder each address may see is the `SITES` table in `worker/routes.js`; `/homedesign/` is shared by every host.
Workers Builds deploys it on each merge to `main` and posts a preview link on every PR. No data and no secrets in the
Worker. `flamingbeing.com` itself (the owner's server page) is not served by it.

| Address | Folder | What |
|---|---|---|
| `design.flamingbeing.com` | `homedesign/` | The design system's guide pages |
| `pantry.flamingbeing.com` | `pantry/` (+ `/__/auth/`) | Household inventory (custom domain: owner, `pantry/SETUP.md` step 1) |

- **Previews:** `https://<branch>-flamingbeing-home.<account>.workers.dev/`. A preview serves the whole repo; try a
  host's view at `<preview>/_sites/pantry.flamingbeing.com/?demo`. Sign-in never works on previews (on purpose).
- **Adding an app:** add its host to `SITES` (and a test in `worker/test/routes.test.mjs`) and to `routes` in
  `wrangler.jsonc` (`custom_domain: true`); the deploy on merge creates the address. Ask the owner first whether the
  name is already in use (below).
- **Service-worker versions** are stamped by the build command (`node tools/stamp-versions.mjs`).
- Check a change to `.assetsignore`/`wrangler.jsonc` with `npx wrangler deploy --dry-run`.

## Names already in use

Other names under the domain are already in use; ask the owner before adding a subdomain. A Worker custom domain
takes over only the one name it lists. Keep app names one level deep (`pantry.flamingbeing.com`): Cloudflare's free
certificate covers only one level. The bare `flamingbeing.com` (the owner's server page) is never touched.

## Build minutes

Builds use the account's free plan build minutes, shared with the owner's other sites. Owner's click: Workers →
flamingbeing-home → Settings → Build → **Build watch paths**: include `*`, exclude `*.md`, `songs/**`, `suno-songs/**`, `**/test/**`, `.github/**`.

## One-time setup (the owner, about 10 minutes)

1. <https://dash.cloudflare.com> (the account with flamingbeing.com) → **Workers & Pages → Create → Import a
   repository** (the Workers option). Connect GitHub and give the Cloudflare app access to `flamingbeing/hi` (you can
   add it next to `anawj-site`).
2. Name: **`flamingbeing-home`** (must match `wrangler.jsonc`). Build command: **`node tools/stamp-versions.mjs`**.
   Deploy command: `npx wrangler deploy`. Preview command: `npx wrangler preview`. Root path `/`. **Deploy.**
3. Worker → **Settings → Builds**: on both the **Production** and **Previews Base** tabs pick or create an **API
   token**; on Previews Base turn on **Builds for preview branches** and **Enable Preview URLs**. Keep PR comments on.
4. The addresses (`design.` and `pantry.flamingbeing.com`) come from `routes` in `wrangler.jsonc`: the deploy creates
   each DNS record and certificate itself (16 Oct 2026). If a deploy can't (its API token lacks DNS rights), add them
   by hand: Worker → **Settings → Domains & Routes → Add → Custom domain**.
5. Check: open https://design.flamingbeing.com/ on the phone.
