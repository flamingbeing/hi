# Pantry: tests to add for fixed bugs

Bugs already fixed in the notes, and whether a test guards them. Index: [../NOTES.md](../NOTES.md). Remove a line once its
test lands.

| Fixed bug | Where it is written up | Guarded by a test? | Test to add |
|---|---|---|---|
| "Waiting for signal (1 change)" while the server held everything (`pending` counted `hasPendingWrites`) | [items-list.md](items-list.md) | Yes: `sync.e2e.mjs` (through `test/proxy.mjs`) | — |
| Dead shared connection after an offline spell (a phone stuck on an old value) | [sync/watchdog.md](sync/watchdog.md) | Yes: `sync.e2e.mjs` "the listener watchdog", `listen-watch.test.mjs` | — |
| `enableNetwork` while already enabled crashes Firestore 10.14.1 | [../NOTES.md](../NOTES.md), [items-list.md](items-list.md) | No direct guard; both `cloud.js` restarts call `disableNetwork` first | A check (in `cloud.test.mjs` or `tools/check.mjs`) that every `enableNetwork` in `js/` follows a `disableNetwork` in the same block |
| Resuming on a deleted household errored the rules (`get()` on a missing household) | [items-list.md](items-list.md) | Partly: `sync.e2e.mjs` checks the deleted pantry's items leave the list | Assert no `permission-denied` or rules errors are logged after the household is deleted (the app leaves it via `watchHousehold`) |
| `increment()` counted twice after a cut connection | [sync-safety.md](sync-safety.md), [../PLAN-sync.md](../PLAN-sync.md) | Not fixed yet (PR-E in [../STATUS.md](../STATUS.md)) | With PR-E: resend the same op id twice in `ops.test.mjs` and through `test/proxy.mjs`; stock changes once |
| Freezer fixes (21 Oct 2026: 1 year frozen, 3 days thawed, Not frozen, moving in or out of a freezer) | [places-photos-names.md](places-photos-names.md) | Partly: freeze, thaw and `moveFreezeOps` in `logic.test.mjs` | An Undo round trip (`invertOps`) of `moveFreezeOps` in and out of a freezer, if not already covered |
