# Operations: accounts, settings, costs

| Account / service | What it holds | Settings that matter |
|---|---|---|
| GitHub `flamingbeing/hi` (public) | Code and docs only | Checks and Pantry checks workflows; for rules deploys the `FIREBASE_SERVICE_ACCOUNT` secret and the `PANTRY_FIREBASE_PROJECT` variable (pantry/SETUP.md step 9) |
| Cloudflare (account with `flamingbeing.com`, same as `anawj.com`) | DNS; Worker `flamingbeing-home` | Workers Builds connected to `flamingbeing/hi`; custom domains per app ([HOSTING.md](HOSTING.md)). Free plan: 100,000 requests a day |
| Domain `flamingbeing.com` | The domain | **Owner: fill in the registrar and renewal date.** If it lapses, every app address stops |
| Firebase `flamingbeing-pantry` (created 16 Oct 2026 by the home computer; **not on Blaze yet**: the billing account's project quota is full, so no backups or budget yet) | The family's pantry data | Blaze (pay as you go) with daily Firestore backups and a budget alert (owner, 16 Oct 2026); Google sign-in; authorised domain `pantry.flamingbeing.com`; OAuth client redirect `https://pantry.flamingbeing.com/__/auth/handler`; asia-southeast1; rules deploy on merge |

## Costs

- Cloudflare Worker: free.
- Firebase Blaze for one family: expected about US$0 a month (well inside the free quota); backups cost cents. Set a
  budget alert (e.g. US$5) when creating it.

## Handing over

Private details (project ids, who's in the family pantry) live in `flamingbeing/life` (`plans/`), not here.
