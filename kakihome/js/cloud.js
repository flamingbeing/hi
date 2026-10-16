// Household sharing: Google sign-in and one shared household ("household") in Firestore.
// Loaded only when config.js has a Firebase config (or ?emulator on localhost for tests), so the app works on
// one phone with no account at all until the household is set up (SETUP.md).
//
// Firestore layout (rules in firestore.rules):
//   households/{hid}                 { name, owner: email, members: [emails], createdAt }
//   households/{hid}/items/{id}      one product with its stock batches (and a small photo)
//   households/{hid}/events/{id}     bought / opened / used up / thrown away, for the consumption pattern
//   households/{hid}/shop/{id}       things added to the shopping list by hand
//
// Sign-in happens on the app's own address: authDomain is kakihome.flamingbeing.com (config.js, written by
// tools/set-config.mjs), and the Worker serves Firebase's helper pages at /__/auth/ and the project's init.json at
// /__/firebase/. A redirect then never crosses to another site, so installed iPhone apps keep their sign-in state
// (the anawj.com logbook's fix for "missing initial state").

import { firebaseConfig } from '../config.js';
import { KINDS } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
export const APP_HOST = 'kakihome.flamingbeing.com';

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
    ? { apiKey: 'demo-key', projectId: 'demo-kakihome', authDomain: 'localhost', appId: 'demo' }
    : { ...firebaseConfig, authDomain: firebaseConfig.authDomain || APP_HOST };
  const a = app.initializeApp(cfg);
  const auth = A.getAuth(a);
  let db;
  if (emulator) {
    db = F.getFirestore(a);
    F.connectFirestoreEmulator(db, '127.0.0.1', emulator.fs);
    A.connectAuthEmulator(auth, `http://127.0.0.1:${emulator.auth}`, { disableWarnings: true });
  } else {
    // keeps a copy on the phone, so Kaki Home opens and saves with no signal and catches up later
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
  if (/unauthorized-domain/.test(code)) return 'This address isn’t allowed to sign in yet. Kaki Home’s setup needs finishing (SETUP.md).';
  if (/permission-denied/.test(code)) return 'This Google account isn’t in that household.';
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
// True when every change made on this phone has reached the household within ms (false offline or on a timeout), so
// signing out doesn't silently drop changes still waiting for signal.
export async function synced(ms = 4000) {
  const { F, db } = await sdk();
  return Promise.race([F.waitForPendingWrites(db).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), ms))]);
}
export async function signOut() {
  const { A, auth } = await sdk();
  await A.signOut(auth);
}

// The household this account belongs to (the owner adds family members by their Google email).
export async function findHousehold(email) {
  const { F, db } = await sdk();
  const q = F.query(F.collection(db, 'households'), F.where('members', 'array-contains', lc(email)), F.limit(1));
  const s = await F.getDocs(q);
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
}
export async function createHousehold(email, name = 'Our home') {
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
    // Writes go to the phone's copy at once and reach the household when there's signal; don't wait for the server.
    put: (kind, obj) => { F.setDoc(F.doc(col(kind), obj.id), clean(obj)).catch(e => { console.warn('save failed', e?.code); onError(e); }); },
    del: (kind, id) => { F.deleteDoc(F.doc(col(kind), id)).catch(e => { console.warn('delete failed', e?.code); onError(e); }); },
    // Write many at once (copying the phone's list up, restoring a backup), 400 to a batch.
    async putMany(kind, list) {
      for (let i = 0; i < list.length; i += 400) {
        const b = F.writeBatch(db);
        for (const o of list.slice(i, i + 400)) b.set(F.doc(col(kind), o.id), clean(o));
        await b.commit();
      }
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
