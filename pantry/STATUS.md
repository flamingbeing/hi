# Pantry: status

Lasting decisions and code facts: [NOTES.md](NOTES.md) and [docs/](docs/). The dated log and the owner's plans are in the
owner's private notes.

## Now
- Live on its own subdomain. Merged and working: family sharing, email and Google sign-in, places and names, sync safety
  (instructions not copies, removal markers, one record per place), select mode, Group by place, grip drag, My order,
  Bulk edit, Sync now, the listener watchdog. Every dated item shows its expiry in words ("in 2 weeks", "Expired 3 days
  ago"; amber within 3 days, red once past).
- Nothing blocks the build. iPhone touch behaviour is untested (only real touch events in Chromium).

## Next (in this order)
1. **Safe counting (PR-E):** each use or add is its own entry keyed by a unique op id inside the batch
   (`batches.<id>.d.<opId>`); stock is the base quantity plus the sum of entries, so a resend changes nothing. Fold old
   entries into the base (online, per item); rules caps (at most 40 entries per batch, op id pattern, number range);
   `normalizeItem` reads `qty` plus the entries. Replaces `increment()`, which can apply twice if the connection is cut
   shortly after sending.
2. **Harness v2 and a full live-service run** (smaller default; see `test/` and the owner's private notes).
3. **The Items tab (PR-F), after PR-E:** a pinned-places bar under the search bar (`pinned` on the place records);
   compact rows with a stepper and a menu; drop My order (dragging only moves an item to a place); sync status as one
   icon in the top bar of every screen.
- Ideas: expiry reminders (push, needs a Worker cron), prices, receipt photo, more catalogue lines, recipe links.
