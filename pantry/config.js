// Firebase web config for the family pantry (Google sign-in and sharing). While it is null the app keeps everything
// on each phone only. Don't edit by hand: run  node pantry/tools/set-config.mjs '<the config Firebase shows>'
// (SETUP.md step 6), which also writes auth/firebase/init.json and sets authDomain to the app's own address.
// These values are a public client ID, not a secret: the Firestore rules decide who sees what.
export const firebaseConfig = null;
