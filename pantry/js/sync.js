// Saving to the family: what the chip says, and the changes the server refused. Pure functions (test/sync.test.mjs
// runs them in Node); the app keeps the list in this phone's localStorage and cloud.js reports each refusal.
//
// A write to the family pantry is kept on the phone and sent when there is signal (Firestore's cache), so a change
// is never lost by going offline. A change the SERVER refuses (the account was removed, the item was deleted on
// another phone, a rule) is dropped by the SDK and the screen quietly goes back: so the app keeps a copy of what was
// refused (a small list, on this phone) and says "Needs attention" until the person retries or discards it.

export const MAX_REFUSED = 30;
const MAX_BYTES = 200000;

// The chip near the top of Home and Settings: Saved, Waiting for signal (N changes), or Needs attention.
// `pending`: changes made here that the server hasn't confirmed; `cache`: the phone is showing its own copy (no
// connection to the server); `waited`: ms since the oldest unconfirmed change (a normal save is confirmed in well under
// a second, which isn't worth a "waiting" chip).
export function syncState({ refused = 0, pending = 0, cache = false, offline = false, waited = 0 } = {}) {
  if (refused > 0) return { kind: 'attention', text: refused === 1 ? 'Needs attention' : `Needs attention (${refused})` };
  if (pending > 0 && (cache || offline || waited >= 1500)) return { kind: 'waiting', text: `Waiting for signal (${pending} ${pending === 1 ? 'change' : 'changes'})` };
  return { kind: 'saved', text: 'Saved' };
}

// Why the server said no, in plain words (never the raw error).
export function refusedReason(code) {
  const c = String(code || '').replace(/^firestore\//, '');
  if (c === 'not-found') return 'It was removed on another phone.';
  if (c === 'permission-denied') return 'The family pantry wouldn’t take it. This account may not be in the pantry any more.';
  if (c === 'resource-exhausted') return 'Too many changes at once. Try again in a minute.';
  if (c === 'unauthenticated') return 'You were signed out. Sign in, then try again.';
  if (c === 'invalid-argument' || c === 'failed-precondition') return 'The pantry couldn’t accept it as it was.';
  return 'The family pantry didn’t take it.';
}

// A short line for a refused change: what it was.
export function describeRefused(r, nameOf = id => id) {
  const what = { items: 'item', events: 'history entry', shop: 'shopping list line', settings: 'setting' }[r.kind] || 'change';
  const name = r.name || (r.kind === 'items' ? nameOf(r.id) : '');
  if (r.op === 'del') return `Removing ${name || `a ${what}`}`;
  if (r.op === 'put') return r.kind === 'items' ? `Saving ${name || 'an item'}` : `Saving a ${what}`;
  return `A change to ${name || `${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}`}`;
}

// The list after a new refusal (newest last): at most MAX_REFUSED, and small enough for localStorage.
export function addRefused(list, rec) {
  const out = [...list, rec].slice(-MAX_REFUSED);
  while (out.length > 1 && JSON.stringify(out).length > MAX_BYTES) out.shift();
  return out;
}
export const dropRefused = (list, n) => list.filter(r => r.n !== n);
// Only this pantry's (a phone can be signed in to another one later).
export const refusedFor = (list, hid) => list.filter(r => r.hid === hid);

// Photos aren't kept in the list (up to 150 KB each); everything else is small.
export const keepable = info => !!info && info.kind !== 'photos';
