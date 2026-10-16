// node pantry/test/config.test.mjs: the config tool, sign-in choice, plain-word errors and the service worker rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseConfig, files } from '../tools/set-config.mjs';
import { redirectFirst, explain, configured, pickHousehold } from '../js/cloud.js';
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
assert.equal(cfg.authDomain, 'pantry.flamingbeing.com');
assert.equal(cfg.projectId, 'family-pantry');
assert.deepEqual(parseConfig(JSON.stringify(cfg)), cfg);
assert.throws(() => parseConfig('{ "apiKey": "x" }'), /no projectId/);
assert.throws(() => parseConfig('nothing here'), /No \{/);
const out = files(cfg);
assert.match(out['config.js'], /export const firebaseConfig = \{/);
assert.equal(JSON.parse(out['auth/firebase/init.json']).authDomain, 'pantry.flamingbeing.com');

// the committed config (written by set-config.mjs) signs in on the app's own address; with none, on-phone only
if (firebaseConfig) {
  assert.equal(firebaseConfig.authDomain, 'pantry.flamingbeing.com');
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
assert.match(explain({ code: 'permission-denied' }), /isn’t in that family pantry/);
assert.equal(explain({ code: 'auth/internal-error', message: 'INTERNAL ASSERTION FAILED' }, 'Sign-in'), 'Sign-in didn’t work. Try again in a moment.');

// the service worker: plain VERSION, waits to take over, kit files offline
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.match(sw, /const VERSION = 'pantry-v\d+'/);
assert.ok(!/addEventListener\('install'[\s\S]*?skipWaiting[\s\S]*?\}\);/.test(sw.split("addEventListener('activate'")[0]), 'no skipWaiting on install');
assert.match(sw, /'take-over'\) self\.skipWaiting\(\)/);
for (const f of ['/homedesign/tokens.css', '/homedesign/app.css', '/homedesign/app.js', '/homedesign/icons.svg']) assert.ok(sw.includes(`'${f}'`), f);
console.log('pantry config: ok');

// which family pantry opens when an account is in more than one: the remembered one, else the one with most people
{
  const a = { id: 'a', members: ['x@e.com'], createdAt: '2026-10-01' }, b = { id: 'b', members: ['x@e.com', 'y@e.com', 'z@e.com'], createdAt: '2026-10-05' };
  assert.equal(pickHousehold([]), null);
  assert.equal(pickHousehold([a]).id, 'a');
  assert.equal(pickHousehold([a, b]).id, 'b', 'most people');
  assert.equal(pickHousehold([b, a], 'a').id, 'a', 'the remembered one');
  assert.equal(pickHousehold([a, b], 'gone').id, 'b', 'a remembered one that is gone');
  assert.equal(pickHousehold([{ ...a, id: 'q' }, a]).id, 'a', 'same size: the oldest, then the lower id');
}
console.log('pickHousehold ok');
