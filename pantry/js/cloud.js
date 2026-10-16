// Family sharing: Google sign-in and one shared pantry ("household") in Firestore.
// Loaded only when config.js has a Firebase config (or ?emulator on localhost for tests), so the app works on
// one phone with no account at all until the family pantry is set up (SETUP.md).
//
// Firestore layout (rules in firestore.rules):
//   households/{hid}                 { name, owner: email, members: [emails], createdAt }
//   households/{hid}/items/{id}      one product with its stock batches (and a small photo)
//   households/{hid}/events/{id}     bought / opened / used up / thrown away, for the consumption pattern
//   households/{hid}/shop/{id}       things added to the shopping list by hand

import { firebaseConfig } from '../config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

const emulator = (() => {
  try {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
    const v = new URLSearchParams(location.search).get('emulator');
    if (v === null) return null;
    const [fs, auth] = v.split(':').map(Number);
    return { fs: fs || 8085, auth: auth || 9099 };
  } catch { return null; }
})();

export const configured = !!emulator || !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let fb = null;
const sdk = () => (fb ||= load());
async function load() {
  const [app, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js'),
  ]);
  const cfg = emulator ? { apiKey: 'demo-key', projectId: 'demo-pantry', authDomain: 'localhost', appId: 'demo' } : firebaseConfig;
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

export async function onUser(cb) {
  const { A, auth } = await sdk();
  A.getRedirectResult(auth).catch(() => {});
  A.onAuthStateChanged(auth, u => cb(u ? { email: lc(u.email), name: u.displayName || u.email, photo: u.photoURL || '' } : null));
}

// The installed app (home-screen icon) signs in by redirect; a browser tab uses a popup and falls back to redirect.
const REDIRECT_CODES = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/cancelled-popup-request'];
const installedApp = () => {
  try { return !!(matchMedia('(display-mode: standalone)').matches || navigator.standalone); } catch { return false; }
};
export async function signIn() {
  const { A, auth } = await sdk();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (installedApp() && /Android/i.test(navigator.userAgent)) return A.signInWithRedirect(auth, provider);
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

export async function openCloud(hid) {
  const { F, db } = await sdk();
  const col = kind => F.collection(db, 'households', hid, kind);
  const unsubs = [];
  return {
    kind: 'cloud',
    async load() {
      const out = {};
      for (const k of ['items', 'events', 'shop']) {
        const s = await F.getDocs(col(k));
        out[k] = s.docs.map(d => d.data());
      }
      return out;
    },
    // Writes go to the phone's copy at once and reach the family when there's signal; don't wait for the server.
    put: (kind, obj) => { F.setDoc(F.doc(col(kind), obj.id), clean(obj)).catch(e => console.warn('save failed', e)); },
    del: (kind, id) => { F.deleteDoc(F.doc(col(kind), id)).catch(e => console.warn('delete failed', e)); },
    // Write many at once (copying the phone's pantry up), 400 to a batch.
    async putMany(kind, list) {
      for (let i = 0; i < list.length; i += 400) {
        const b = F.writeBatch(db);
        for (const o of list.slice(i, i + 400)) b.set(F.doc(col(kind), o.id), clean(o));
        await b.commit();
      }
    },
    listen(cb) {
      for (const k of ['items', 'events', 'shop']) {
        unsubs.push(F.onSnapshot(col(k), s => {
          const docs = [], removed = [];
          for (const c of s.docChanges()) (c.type === 'removed' ? removed.push(c.doc.id) : docs.push(c.doc.data()));
          if (docs.length || removed.length) cb(k, docs, removed);
        }, e => console.warn('sync', k, e)));
      }
    },
    close() { unsubs.splice(0).forEach(u => u()); },
  };
}
