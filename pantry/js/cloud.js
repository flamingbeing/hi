// Family sharing: Google sign-in and one shared pantry ("household") in Firestore.
// Loaded only when config.js has a Firebase config (or ?emulator on localhost for tests), so the app works on
// one phone with no account at all until the family pantry is set up (SETUP.md).
//
// Firestore layout (rules in firestore.rules):
//   households/{hid}                 { name, owner: email, members: [emails], createdAt }
//   households/{hid}/items/{id}      one product with its stock batches (and a tiny thumbnail, `thumb`)
//   households/{hid}/photos/{id}     the item's photo (same id), read only when the item is opened: never listened to,
//                                    so opening the app downloads thumbnails, not photos (photo.js)
//   households/{hid}/events/{id}     bought / opened / used up / thrown away, for the consumption pattern
//   households/{hid}/shop/{id}       things added to the shopping list by hand
//   households/{hid}/settings/places the family's list of places ({ id: 'places', list: [names], updatedAt }; places.js)
//   households/{hid}/settings/people the names members give each other ({ id: 'people', names: { email: name }, updatedAt }; people.js)
//
// Sign-in happens on the app's own address: authDomain is pantry.flamingbeing.com (config.js, written by
// tools/set-config.mjs), and the Worker serves Firebase's helper pages at /__/auth/ and the project's init.json at
// /__/firebase/. A redirect then never crosses to another site, so installed iPhone apps keep their sign-in state
// (the anawj.com logbook's fix for "missing initial state").

import { firebaseConfig } from '../config.js';
import { KINDS } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
export const APP_HOST = 'pantry.flamingbeing.com';

const emulator = (() => {
  try {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    const v = new URLSearchParams(location.search).get('emulator');
    if (v === null) return null;
    const [fs, auth] = v.split(':').map(Number);
    return { fs: fs || 8085, auth: auth || 9099 };
  } catch { return null; }
})();
export const usingEmulator = !!emulator;

export const configured = !!emulator || !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

// The SDK loads once: every caller shares one promise (v1 loaded it twice when two calls raced, and the second
// initializeApp broke the auth emulator). A failed load (no signal on the very first open) is tried again next time.
let fb = null;
export function sdk() {
  if (fb) return fb;
  fb = load();
  fb.catch(() => { fb = null; });
  return fb;
}
async function load() {
  const [app, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
  ]);
  const cfg = emulator
    ? { apiKey: 'demo-key', projectId: 'demo-pantry', authDomain: 'localhost', appId: 'demo' }
    : { ...firebaseConfig, authDomain: firebaseConfig.authDomain || APP_HOST };
  const a = app.initializeApp(cfg);
  const auth = A.getAuth(a);
  let db;
  if (emulator) {
    db = F.getFirestore(a);
    F.connectFirestoreEmulator(db, '127.0.0.1', emulator.fs);
    A.connectAuthEmulator(auth, `http://127.0.0.1:${emulator.auth}`, { disableWarnings: true });
  } else {
    // keeps a copy on the phone, so the pantry opens and saves with no signal and catches up later
    try { db = F.initializeFirestore(a, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch { db = F.getFirestore(a); }
  }
  return { A, F, auth, db };
}

const lc = s => String(s || '').trim().toLowerCase();

// Plain words for anything that goes wrong (never the raw error text).
export function explain(err, doing = 'That') {
  const code = String(err?.code || '');
  if (/popup-closed-by-user|cancelled-popup-request|user-cancelled/.test(code)) return 'Sign-in was cancelled.';
  if (/network-request-failed|unavailable|deadline-exceeded/.test(code) || err?.name === 'TypeError') return 'No signal, so that didn’t work. Try again when you’re online.';
  if (/unauthorized-domain/.test(code)) return 'This address isn’t allowed to sign in yet. The pantry’s setup needs finishing (SETUP.md).';
  if (/permission-denied/.test(code)) return 'This Google account isn’t in that family pantry.';
  if (/too-many-requests|resource-exhausted/.test(code)) return 'Too many tries. Wait a minute and try again.';
  if (/user-disabled/.test(code)) return 'This Google account can’t sign in.';
  return `${doing} didn’t work. Try again in a moment.`;
}

// Sign in by redirect straight away in the installed app (display-mode standalone, or iOS's navigator.standalone)
// and on Firefox for Android (a popup there opens as a separate tab that can't hand back; the anawj.com lesson).
// Elsewhere, a popup, falling back to a redirect when popups are blocked or unsupported.
export const redirectFirst = ({ standalone = false, ua = '' } = {}) => standalone || (/Android/i.test(ua) && /Firefox\//i.test(ua));
const installedApp = () => {
  try { return !!(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.matchMedia?.('(display-mode: fullscreen)').matches || globalThis.navigator?.standalone); } catch { return false; }
};
const REDIRECT_CODES = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/cancelled-popup-request'];

export async function onUser(cb) {
  const { A, auth } = await sdk();
  // finishes a redirect sign-in when the page loads again
  A.getRedirectResult(auth).catch(e => console.warn('Redirect sign-in failed', e?.code || e));
  A.onAuthStateChanged(auth, u => cb(u ? { email: lc(u.email), name: u.displayName || u.email, photo: u.photoURL || '' } : null));
}
export async function signIn() {
  const { A, auth } = await sdk();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (redirectFirst({ standalone: installedApp(), ua: globalThis.navigator?.userAgent || '' })) return A.signInWithRedirect(auth, provider);
  try { await A.signInWithPopup(auth, provider); }
  catch (e) {
    if (!REDIRECT_CODES.includes(e?.code)) throw e;
    await A.signInWithRedirect(auth, provider);
  }
}
// Tests only (?emulator): sign in as a made-up Google account.
export async function emulatorSignIn(email) {
  if (!emulator) throw new Error('Only with ?emulator');
  const { A, auth } = await sdk();
  await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: lc(email).replace(/\W/g, ''), email: lc(email), email_verified: true })));
}
// True when every change made on this phone has reached the family within ms (false offline or on a timeout), so
// signing out doesn't silently drop changes still waiting for signal.
export async function synced(ms = 4000) {
  const { F, db } = await sdk();
  return Promise.race([F.waitForPendingWrites(db).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), ms))]);
}
export async function signOut() {
  const { A, auth } = await sdk();
  await A.signOut(auth);
}

// The household this account belongs to (the owner adds family members by their Google email). An account can end up
// in more than one (a second "Start our family pantry" tapped when the first couldn't be found), and a query's
// first match is arbitrary: so pick the one this phone used last (`prefer`), else the one with the most members,
// else the oldest.
export const pickHousehold = (list, prefer = '') => list.length < 2 ? (list[0] || null)
  : list.find(h => h.id === prefer) || [...list].sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || (a.id < b.id ? -1 : 1))[0];
export async function findHousehold(email, prefer = '') {
  const { F, db } = await sdk();
  const q = F.query(F.collection(db, 'households'), F.where('members', 'array-contains', lc(email)), F.limit(10));
  const s = await F.getDocs(q);
  return pickHousehold(s.docs.map(d => ({ id: d.id, ...d.data() })), prefer);
}
export async function createHousehold(email, name = 'Our pantry') {
  const { F, db } = await sdk();
  const ref = F.doc(F.collection(db, 'households'));
  const data = { name, owner: lc(email), members: [lc(email)], createdAt: new Date().toISOString() };
  await F.setDoc(ref, data);
  return { id: ref.id, ...data };
}
export async function setMembers(hid, members) {
  const { F, db } = await sdk();
  await F.updateDoc(F.doc(db, 'households', hid), { members: [...new Set(members.map(lc).filter(Boolean))] });
}
export async function watchHousehold(hid, cb) {
  const { F, db } = await sdk();
  return F.onSnapshot(F.doc(db, 'households', hid), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null));
}

// Firestore can't store undefined; drop it.
const clean = o => JSON.parse(JSON.stringify(o));

export async function openCloud(hid, onError = () => {}) {
  const { F, db } = await sdk();
  const col = kind => F.collection(db, 'households', hid, kind);
  const unsubs = [];
  return {
    kind: 'cloud',
    async load() {
      const out = {};
      for (const k of KINDS) {
        const s = await F.getDocs(col(k));
        out[k] = s.docs.map(d => d.data());
      }
      return out;
    },
    // Writes go to the phone's copy at once and reach the family when there's signal; don't wait for the server.
    // The promise (which callers may ignore) says whether the server took it: true, or false when refused.
    put: (kind, obj) => F.setDoc(F.doc(col(kind), obj.id), clean(obj)).then(() => true, e => { console.warn('save failed', e?.code); onError(e); return false; }),
    del: (kind, id) => { F.deleteDoc(F.doc(col(kind), id)).catch(e => { console.warn('delete failed', e?.code); onError(e); }); },
    // One document (an item's photo, when the item is opened), or null when there is none. Offline it is the
    // phone's copy if it has one; otherwise it throws, and the app tries again next time.
    async get(kind, id) {
      const s = await F.getDoc(F.doc(col(kind), id));
      return s.exists() ? s.data() : null;
    },
    // Every document of one kind (a backup's photos): only when someone asks for it.
    async list(kind) { return (await F.getDocs(col(kind))).docs.map(d => d.data()); },
    // Write many at once (copying the phone's pantry up, restoring a backup): at most 400 documents or about 4 MB
    // to a batch (photos are up to 150 KB each; Firestore takes about 10 MB a request).
    async putMany(kind, list) {
      let b = null, n = 0, bytes = 0;
      for (const o of list) {
        const c = clean(o), size = JSON.stringify(c).length;
        if (b && (n >= 400 || bytes + size > 4e6)) { await b.commit(); b = null; }
        if (!b) { b = F.writeBatch(db); n = 0; bytes = 0; }
        b.set(F.doc(col(kind), o.id), c); n++; bytes += size;
      }
      if (b) await b.commit();
    },
    listen(cb) {
      for (const k of KINDS) {
        unsubs.push(F.onSnapshot(col(k), s => {
          const docs = [], removed = [];
          for (const c of s.docChanges()) (c.type === 'removed' ? removed.push(c.doc.id) : docs.push(c.doc.data()));
          if (docs.length || removed.length) cb(k, docs, removed);
        }, e => { console.warn('sync', k, e?.code); onError(e); }));
      }
    },
    close() { unsubs.splice(0).forEach(u => u()); },
  };
}
