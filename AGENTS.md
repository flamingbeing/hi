# flamingbeing/hi

Instructions for every AI assistant working here (Claude Code reads this through `CLAUDE.md`).

This **public** repo holds the **family home apps** only (songs live in the owner's private notes):

- **The family home apps** on `*.flamingbeing.com`, served by one Cloudflare Worker ([HOSTING.md](HOSTING.md)):
  `homedesign/` (the design system every home app uses; start with `homedesign/README.md`), `pantry/` (household
  inventory; start with `pantry/NOTES.md`) and `kakihome/` (a separate household inventory to try out a product idea,
  with its own data and Firebase project; start with `kakihome/NOTES.md`).

Accounts and costs: in the owner's private notes; hosting: [HOSTING.md](HOSTING.md). Site-wide work in progress: [STATUS.md](STATUS.md).

## Public repo

Anything merged here is public: code, docs, general rules and **made-up** sample data only. Personal notes, real
household data, names, emails and account details are in the owner's private notes; ask the owner. Never commit secrets
(public Firebase web configs are fine).

## Rules that bite

- **One subdomain per app that saves data or signs people in**, so apps can't read each other's offline data or sign-in.
  The bare `flamingbeing.com` is the owner's own server page: this Worker never serves it.
- **Apps stay unlisted:** every page has `<meta name="robots" content="noindex, nofollow">`; never link the apps publicly.
- **Design:** every home app uses `homedesign/` (calm, minimal, light only): `/homedesign/tokens.css`, and for phone apps
  `app.css` + `app.js`. App styles take an app prefix. Don't fork the kit.
- **Service workers:** `sw.js` has `const VERSION = '<app>-v<N>'`; never stamp it by hand (the deploy runs
  `tools/stamp-versions.mjs`). Change `<N>` only when the worker's own logic changes. Delete only `<app>-` caches.
- **App version lines:** an app with a service worker ends its settings with `App version <date> (<hash>)` and a
  `Not updating? Get the latest version` button; the kit's `haVersion()` does both.
- **Google sign-in** happens on the app's own address (`authDomain` is the app's subdomain; Firebase's helper pages in
  `__/auth/`, `init.json` in `<app>/auth/firebase/`). Never add `*.workers.dev` previews to Firebase or the OAuth client.
- **Firebase is live family data:** never sign in to, read or change live projects; the local emulator with a `demo-*`
  project is fine. Rules deploy on merge (`.github/workflows/deploy-firestore-rules.yml`): run the rules tests, merge only
  when Checks are green, confirm the deploy run, and say what the rules now allow or deny. Never loosen rules to pass a test.
- **Live cloud changes** (Firebase, Auth, IAM, budgets, Cloudflare DNS or Workers) are not made from a session: ask the
  owner. Never send secrets or real household data.

## Checks before merging

```
node tools/check.mjs
node tools/stamp-versions.mjs --check
for f in */test/*.test.mjs; do node "$f"; done
```

Plus each app's browser tests when it changes (listed in its `NOTES.md`; the app's workflow runs them on PRs).

## Working here

- PR titles start with the app: "Pantry: …", "Home design: …", "Repo: …". Keep each PR small and finished on its own;
  merge your own once the Checks are green, then report with the PR link.
- Push once per finished step: every push to a PR branch starts a Cloudflare build, and build minutes are limited.
- Show UI changes with 390 px screenshots.
- Each app keeps `NOTES.md` (lasting decisions, how to test) and `STATUS.md` (now, next, dated decisions). Update them
  when a task finishes and before a session ends.
- Plain words, short. When asked to plan, plan and wait.
- Token savers: `.claude/settings.json` denies reading `__/` (Firebase hosting files). Ask the owner if one is really needed.
