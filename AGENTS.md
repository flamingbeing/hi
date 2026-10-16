# flamingbeing/hi

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).

This **public** repo holds two things:

- `songs/`, `suno-songs/`: song lyrics and Suno style prompts (not served anywhere).
- **The Koh family home apps** on `*.flamingbeing.com`, served by one Cloudflare Worker ([HOSTING.md](HOSTING.md)):
  - `homedesign/`: the Koh family home design system (web and phone app kit), shared by every home app at
    `/homedesign/`; its own guide at `design.flamingbeing.com`. Start with `homedesign/README.md`.
  - `pantry/`: the family's household inventory at `pantry.flamingbeing.com`. Start with `pantry/NOTES.md`.

Accounts, settings and costs: [OPERATIONS.md](OPERATIONS.md). Site-wide work in progress: [STATUS.md](STATUS.md).

## Public here, private in `life`

Anything merged here is public. Keep in this repo only code, docs, general rules and **made-up** sample data.
Personal notes, real household data, family names and email addresses, and anything worked out from them go in the
owner's private repo `flamingbeing/life` (`plans/`, `data/<app>/`); attach it with `add_repo` if the session lacks
it. Never copy anything from `life` into this repo, a PR or an issue. Never commit secrets; public Firebase web configs
are fine (the rules are the protection).

## Rules that bite

- **One subdomain per app that saves data or signs people in** (`pantry.flamingbeing.com`), so apps can't read each
  other's offline data or sign-in. Static pages may share a host. The bare `flamingbeing.com` is the owner's own
  server page: this Worker never serves it.
- **Apps stay unlisted:** every page has `<meta name="robots" content="noindex, nofollow">` (the Worker also sends
  `X-Robots-Tag`); never link the apps from anywhere public.
- **Design:** every home app uses `homedesign/` (calm and minimal, light only; owner, 16 Oct 2026): link
  `/homedesign/tokens.css` and, for phone apps, the app kit `app.css` + `app.js`. App-specific styles take an app
  prefix. Don't fork the kit: improve it in `homedesign/` and note it in its `STATUS.md`.
- **Service workers:** `sw.js` has `const VERSION = '<app>-v<N>'`; never stamp it by hand. The deploy runs
  `tools/stamp-versions.mjs`, giving `<app>-<date>-<hash>`. Change `<N>` only when the service worker's own logic
  changes. A new version never takes over while someone is typing or has a sheet open; delete only `<app>-` caches.
- **App version lines:** every app with a service worker ends its settings screen with `App version 2026-10-14
  (3f9a2c1d)` and a `Not updating? Get the latest version` button (checks for signal first, then removes only that
  app's service worker and caches and reloads; never touches saved data or sign-in). The kit's `haVersion()` does
  both; a browser test checks them.
- **Google sign-in** happens on the app's own address: `authDomain` is the app's subdomain, with Firebase's helper
  pages copied into `__/auth/` and the project's `init.json` in `<app>/auth/firebase/` (the anawj.com logbook's fix
  for "missing initial state" in installed iPhone apps). Installed apps sign in by redirect, browser tabs by popup.
  Never add `*.workers.dev` previews to Firebase or the OAuth client.
- **Firebase is live family data:** sessions never sign in to, read or change live Firebase projects; the local
  emulator with fake accounts and a `demo-*` project is always fine. Firestore rules deploy on merge through
  `.github/workflows/deploy-firestore-rules.yml` (once set up): run the rules tests first, merge only when Checks are
  green, confirm the deploy run, and say what the rules now allow or deny. Never loosen rules to make a test pass.

## Checks before merging

```
node tools/check.mjs
node tools/stamp-versions.mjs --check
for f in */test/*.test.mjs; do node "$f"; done
```

Plus each app's browser tests when it changes (listed in its `NOTES.md`; the app's workflow runs them on PRs).

## Working with the owner

- Instructions mostly come from a phone. Work through a request to the end; ask only when a decision is genuinely
  the owner's. When asked to plan, plan and wait.
- PR titles start with the app: "Pantry: …", "Home design: …", "Repo: …". Keep each PR small and finished on its own.
- **Build minutes are limited:** every push to a branch with a PR starts a Cloudflare build, and the account's free
  plan has 3,000 build minutes a month shared with anawj.com. Commit freely but push once per finished step, never just
  to save work in progress.
- Merge your own PRs once the Checks are green, then report with the PR link. Merge by the number the PR's creation
  returned. Exceptions: anything touching live data or rules waits for the checks above; the owner may ask to wait.
- Show UI changes with 390 px phone screenshots and the PR preview link (`<preview>/_sites/<host>/?demo`).
- Plain words, short; explain technical terms briefly the first time.
- Each app keeps `NOTES.md` (lasting decisions, how to test) and `STATUS.md` (now, waiting on the owner, next,
  dated decisions). Update them when a task finishes and before a session ends.
