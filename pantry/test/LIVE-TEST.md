# Pantry live-service harness: runbook for firetop

`pantry/test/live-multidevice.mjs` runs the pantry's real sync code (`js/cloud.js` and `js/logic.js`, no UI) in three
simulated phones per scenario against the **real** Firestore and Auth service, to find what the emulator can't show:
`increment()` being applied twice, writes queued behind a refused write, persistence across a reload, reconnect timing,
the "stale phone" flake, WebKit. It only touches one throwaway household (`robust-test-<date>`) and three throwaway
accounts. Nothing here is for the owner to run; he asked for firetop to.

Traffic: the default run is about 1,300 reads + 500 writes (it prints its own estimate; `--budget 2000` stops further
scenarios when the estimate passes it). Firestore's free tier is 50,000 reads and 20,000 writes a day.

## What firetop sets up (never in the repo, never in logs)

1. Three throwaway users in the project's Authentication (email and password, **email verified**: the rules need
   `email_verified`). Their addresses are only for this test.
2. One household document `households/robust-test-<date>` (for example `robust-test-2026-10-17`) with
   `{ name, owner, members: [the three emails, lower case], createdAt }`. The rules let a new household start with only its
   owner as a member, so create it as user 1 and then add the other two (or write it with the Admin SDK). **The three users
   must be the only members**; the harness refuses to run otherwise.
3. A creds file anywhere outside the repo, for example `C:\secrets\robust-creds.json`:

```json
{
  "project": "<the Firebase project id>",
  "household": "robust-test-2026-10-17",
  "apiKey": "<the project's web API key>",
  "users": {
    "u1": { "email": "...", "password": "..." },
    "u2": { "email": "...", "password": "..." },
    "u3": { "email": "...", "password": "..." }
  }
}
```

`apiKey` is only used if the key in `pantry/config.js` is restricted to the app's own address and refuses `localhost`
(then the harness switches by itself, in the browser only, and says so; `--key creds` forces it, `--key config` forbids it).
If the key is restricted by referrer, add `http://localhost/*` to its allowed referrers for the test, or use an
unrestricted key just for these users.

## Run it (Windows, PowerShell)

```powershell
git clone https://github.com/flamingbeing/hi.git ; cd hi
npm install --no-save playwright@1.56.1
npx playwright install chromium firefox webkit      # "chrome" uses the installed Google Chrome instead
node pantry/test/live-guards.test.mjs                # the safety guards; needs no Firebase
$env:ROBUST_CREDS = "C:\secrets\robust-creds.json"
node pantry/test/live-multidevice.mjs --engine chromium --reset --out report-chromium.json
node pantry/test/live-multidevice.mjs --engine firefox  --reset --out report-firefox.json
node pantry/test/live-multidevice.mjs --engine webkit   --reset --out report-webkit.json
node pantry/test/live-multidevice.mjs --engine chrome   --reset --out report-chrome.json
```

There is no separate server to start: the harness serves the repo itself on a free port (`--port 4173` to fix one; it is
the same static server as `pantry/test/serve.mjs`). If `playwright` can't be found, set `PLAYWRIGHT_PATH` to its
`index.mjs`. Exit code 0 means every scenario passed; non-zero means a FAIL or ERROR (or the harness refused to start).

Useful options: `--only 1,2,5` (scenarios; `--only none` runs none, which with `--reset` is the cleanup run),
`--seeds 11,2026,7 --steps 40` (scenario 9; more seeds means more traffic, about 330 reads + 90 writes a seed),
`--toggle raw` (scenario 9: phones may drop offline with changes still unsent; the default `safe` confirms first, as the
emulator test does), `--shadow` (a second listener per phone, to tell a stale page from a stopped listener; roughly doubles
scenario 9's reads), `--converge 30` (seconds to wait for phones to match the server), `--settle 1500` (ms to wait after
cutting a phone's connection), `--keep` (don't delete a scenario's documents when it ends), `--headed` (watch it),
`--allow-host <host>` (if a block is listed in the report and something needed it), `--budget N`.

`--reset` deletes the test household's `items`, `events`, `shop`, `settings` and `photos` documents first (members may
delete under the rules); it never deletes or edits the household document. Without `--keep`, each scenario also deletes
what it created when it passes.

## What to send back

The JSON report of each engine (`--out`; it holds no passwords, keys or tokens) and the console output. The things most worth
reading first:

- scenario 4: `verdict` and `timesApplied` (does a refused write in the queue make later increments count twice?);
- scenario 5: `doubleApplies`, `doubleApplyDetail` and `byDelay` (how often, and how soon after a cut), and `awaitedWrong`
  (must be empty);
- scenario 9: `stale…` and `staleDetail…` entries, `drain…` and `converged…` timings, `pendingAtEnd`;
- `blockedHosts` (requests the guard refused) and `phoneErrors`;
- the `estimate` (reads and writes).

## The scenarios

Each prints PASS or FAIL per engine. 4, 5 and the second half of 6 are measurements: they report what the live service
does, flag a double-count, and fail only if something unexplained happens.

| # | What it does | Measures / fails when |
|---|---|---|
| 1 | Three phones online change the same items at once (use, add to the same new batch, open, rename). | Server totals must equal the sum of issued increments, names and history lines must all arrive, every phone must match the server. Prints drain time (`waitForPendingWrites`) and time to converge. |
| 2 | Phone B is cut off (`context.setOffline`) while A and C carry on; B changes the same batch; B comes back. | Checks the server holds A's and C's changes and none of B's while B is away; then exact totals; time for B's drain after reconnect. |
| 3 | B is offline, changes things, the page is **reloaded while offline**, then B comes back. | Persistence must keep the queue (pending after the reload, B still shows its own changes); then every change lands exactly once. |
| 4 | B queues, offline: valid change, a write the rules refuse (batch quantity 99999), valid change, on one document, on three documents, and three valid + refused + three valid. Each valid write bumps its own batch by 1, so the batch quantity is how many times it was applied. | `verdict`: `exactly-once`, `DOUBLE-COUNT` or `LOST-WRITE`; how each write was answered. Fails only if the refused write is accepted, never reported refused, or phones don't converge. |
| 5 | 20 increments, each with the connection cut 0 to 220 ms after the call, then restored; each increment has its own batch. Then 10 increments with every acknowledgement awaited and no cut. | Number applied twice and which (`doubleApplyDetail`, `byDelay`); fails if an increment is lost or any awaited, uncut increment is not applied exactly once. |
| 6 | An old phone saves an item as the old array; a new phone's change converts it; another changes the map; an old phone writes a whole array over the map; a new phone converts again; two phones convert one array item at the same moment. | `normalizeItem` and the server agree on all phones at every step; reports the units lost to the old phone's overwrite and to the concurrent conversion (the documented once-per-item window). Fails if a loss is outside that. |
| 7 | A removes an item while B (offline) uses a unit, and the other way round; shopping line ticked while removed, both ways; then Restore. | Items stay hidden with the use applied; lines end ticked and removed; Restore clears `removedAt` and `removedBy` and keeps the use and the tick. |
| 8 | 37 write attempts on the test household: allowed and denied shapes (60 and 61 batches, bad ids, quantity range, `removedAt` type, events write-once, shop line fields, 41-character names, thumbnails, settings). | Each allowed case succeeds; each denied case fails with `permission-denied`. |
| 9 | Seeded random run: use, add, open, rename, delete, restore, tick, remove line, restore line on three phones that randomly go offline and online (the logic of `multidevice.e2e.mjs` at the `cloud.js` level). | At the end: confirm, read the server, compare it, every phone and the expected totals. Prints the seed on failure, each phone's pending count and timings, and for a stale phone: whether the SDK cache or the page state is behind, what the page last heard, what each SDK read path says, and whether listening again fixes it. |

## Safety, in short

The household id must start with `robust-test-` (checked at the start and inside every function that builds a document
path); only that household is read or written; the household document itself is only read; the only deletes are of
documents under it; the browsers may reach only `localhost`, `www.gstatic.com` and Firebase (anything else is blocked and
listed); nothing prints passwords, keys or tokens; `--dry` never reads the creds file. `node pantry/test/live-guards.test.mjs`
tests these.

## After the runs

Run `node pantry/test/live-multidevice.mjs --reset --only none` once to empty the test household. The household document and
the three users stay until firetop deletes them.

## Testing the harness itself (no Firebase account needed)

`pantry/test/run-live-dry.sh [options]` starts the local emulators (project `demo-pantry`, ports 18085 and 19099) and runs the
harness against them with made-up accounts (`--dry`). The harness sends the real Firebase SDK to the emulators by swapping two
SDK files for thin wrappers in the browser, so the app's code is not changed and the same persistence settings are used.
`--selftest-break` makes the expected totals wrong on purpose: the run must then FAIL.

## Known limits

- Real network latency, throttling and mobile Safari can't be reproduced; WebKit on Windows is Playwright's build, not iPhone Safari.
- `context.setOffline` cuts the browser's network; the SDK may take a few seconds to notice, hence `--settle`.
- Scenario 3 reloads a page whose files the harness serves from memory while offline; if a browser refuses that, the scenario
  reports an ERROR rather than passing.
- Quantities are compared by batch; the rules check only the first 12 batches' ranges (see `firestore.rules`), and so does scenario 8.
