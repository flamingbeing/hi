# Hosting: *.flamingbeing.com

One Cloudflare Worker, `flamingbeing-home` (`wrangler.jsonc`, `worker/sites.js`), serves this repo's files. Which
folder each address may see is the `SITES` table in `worker/routes.js`; `/homedesign/` is shared by every host.
Workers Builds deploys it on each merge to `main` and posts a preview link on every PR. No data and no secrets in the
Worker. `flamingbeing.com` itself (the owner's server page) is not served by it.

| Address | Folder | What |
|---|---|---|
| `design.flamingbeing.com` | `homedesign/` | The design system's guide pages |
| `pantry.flamingbeing.com` | `pantry/` (+ `/__/auth/`) | Household inventory (coming) |

- **Previews:** `https://<branch>-flamingbeing-home.<account>.workers.dev/`. A preview serves the whole repo; try a
  host's view at `<preview>/_sites/pantry.flamingbeing.com/?demo`. Sign-in never works on previews (on purpose).
- **Adding an app:** add its host to `SITES` (and a test in `worker/test/routes.test.mjs`), merge, then the owner adds
  the custom domain (below).
- **Service-worker versions** are stamped by the build command (`node tools/stamp-versions.mjs`).
- Check a change to `.assetsignore`/`wrangler.jsonc` with `npx wrangler deploy --dry-run`.

## One-time setup (the owner, about 10 minutes)

1. <https://dash.cloudflare.com> (the account with flamingbeing.com) → **Workers & Pages → Create → Import a
   repository** (the Workers option). Connect GitHub and give the Cloudflare app access to `flamingbeing/hi` (you can
   add it next to `anawj-site`).
2. Name: **`flamingbeing-home`** (must match `wrangler.jsonc`). Build command: **`node tools/stamp-versions.mjs`**.
   Deploy command: `npx wrangler deploy`. Preview command: `npx wrangler preview`. Root path `/`. **Deploy.**
3. Worker → **Settings → Builds**: on both the **Production** and **Previews Base** tabs pick or create an **API
   token**; on Previews Base turn on **Builds for preview branches** and **Enable Preview URLs**. Keep PR comments on.
4. Worker → **Settings → Domains & Routes → Add → Custom domain**: `design.flamingbeing.com`. Cloudflare makes the
   DNS record and certificate itself. (Later, the same for `pantry.flamingbeing.com`.)
5. Check: open https://design.flamingbeing.com/ on the phone.
