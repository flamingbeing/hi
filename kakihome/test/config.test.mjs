// node kakihome/test/config.test.mjs: the config tool, sign-in choice, plain-word errors and the service worker rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseConfig, files } from '../tools/set-config.mjs';
import { redirectFirst, explain, configured } from '../js/cloud.js';
import { firebaseConfig } from '../config.js';

// set-config reads Firebase's snippet as shown (unquoted keys, single quotes, trailing comma) and pins authDomain
const snippet = `const firebaseConfig = {
  apiKey: "AIzaFAKE-not-a-real-key",
  authDomain: "family-pantry.firebaseapp.com", // Firebase's own
  projectId: 'family-pantry',
  storageBucket: "family-pantry.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
};`;
const cfg = parseConfig(snippet);
assert.equal(cfg.authDomain, 'kakihome.flamingbeing.com');
assert.equal(cfg.projectId, 'family-pantry');
assert.deepEqual(parseConfig(JSON.stringify(cfg)), cfg);
assert.throws(() => parseConfig('{ "apiKey": "x" }'), /no projectId/);
assert.throws(() => parseConfig('nothing here'), /No \{/);
const out = files(cfg);
assert.match(out['config.js'], /export const firebaseConfig = \{/);
assert.equal(JSON.parse(out['auth/firebase/init.json']).authDomain, 'kakihome.flamingbeing.com');

// the committed config (written by set-config.mjs) signs in on the app's own address; with none, on-phone only
if (firebaseConfig) {
  assert.equal(firebaseConfig.authDomain, 'kakihome.flamingbeing.com');
  assert.ok(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
  assert.equal(configured, true);
} else assert.equal(configured, false);

// installed apps and Firefox on Android sign in by redirect; browser tabs by popup
assert.equal(redirectFirst({ standalone: true, ua: 'iPhone' }), true);
assert.equal(redirectFirst({ standalone: false, ua: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0' }), true);
assert.equal(redirectFirst({ standalone: false, ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36' }), false);
assert.equal(redirectFirst({ standalone: false, ua: 'Mozilla/5.0 (iPhone) Safari' }), false);

// plain words, never the raw error
assert.equal(explain({ code: 'auth/popup-closed-by-user' }), 'Sign-in was cancelled.');
assert.match(explain({ code: 'auth/network-request-failed' }), /No signal/);
assert.match(explain({ code: 'permission-denied' }), /isn’t in that household/);
assert.equal(explain({ code: 'auth/internal-error', message: 'INTERNAL ASSERTION FAILED' }, 'Sign-in'), 'Sign-in didn’t work. Try again in a moment.');

// the service worker: plain VERSION, waits to take over, kit files offline
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.match(sw, /const VERSION = 'kakihome-v\d+'/);
assert.ok(!/addEventListener\('install'[\s\S]*?skipWaiting[\s\S]*?\}\);/.test(sw.split("addEventListener('activate'")[0]), 'no skipWaiting on install');
assert.match(sw, /'take-over'\) self\.skipWaiting\(\)/);
for (const f of ['/homedesign/tokens.css', '/homedesign/app.css', '/homedesign/app.js', '/homedesign/icons.svg']) assert.ok(sw.includes(`'${f}'`), f);
console.log('kakihome config: ok');
