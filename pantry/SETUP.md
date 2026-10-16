# Setting up family sharing (once, about 10 minutes)

Without this, the app works fully but keeps everything on each phone separately. These steps make one shared pantry
the family signs into with Google. All free (Firebase Spark plan; photos are stored inside items, so no Storage
bucket or billing is needed).

1. **Turn on GitHub Pages**: github.com/flamingbeing/hi → Settings → Pages → Source: **GitHub Actions**. The app is
   then at https://flamingbeing.github.io/hi/pantry/ after the next merge (or run the "Pages" workflow).
2. **Create a Firebase project**: https://console.firebase.google.com → Add project → name it e.g. `family-pantry`
   (Google Analytics not needed).
3. **Google sign-in**: Build → Authentication → Get started → Sign-in method → Google → Enable (pick your support
   email) → Save. Then Authentication → Settings → Authorised domains → Add `flamingbeing.github.io`.
4. **Database**: Build → Firestore Database → Create database → location `asia-southeast1 (Singapore)` → production
   mode. Then the Rules tab: replace everything with the contents of `pantry/firestore.rules` → Publish.
5. **Web app config**: Project settings (gear) → Your apps → Web (`</>`) → nickname "pantry" → Register (no
   hosting). Copy the `firebaseConfig = { … }` it shows and send it to Claude (or paste it into `pantry/config.js`
   as `export const firebaseConfig = { … };` and run `node pantry/tools/stamp.mjs`). It is a public client ID,
   not a secret: the rules decide who sees what.
6. **On your phone**: open the app → Settings → Sign in with Google → **Start our family pantry** → add each family
   member's Google (Gmail) address. If you'd already added items on that phone, tap "Copy them into the family
   pantry". Family members open the same link and sign in; they see the pantry straight away.

Tip: on iPhone, signing in works best in Safari first; then Add to Home Screen.
