// node worker/test/routes.test.mjs
import assert from 'node:assert/strict';
import { resolve, SITES, SHARED } from '../routes.js';

SITES['app.example.test'] = { root: 'pantry/', also: { '/__/auth/': '__/auth/', '/__/firebase/': 'pantry/auth/firebase/' } };
SITES['pages.example.test'] = { prefixes: { '/a/': 'alpha/' } };

assert.deepEqual(resolve('design.flamingbeing.com', '/'), { file: 'homedesign/' });
assert.deepEqual(resolve('design.flamingbeing.com', '/app.html'), { file: 'homedesign/app.html' });
assert.deepEqual(resolve('DESIGN.flamingbeing.com:443', '/homedesign/tokens.css'), { file: 'homedesign/tokens.css' });
assert.deepEqual(resolve('app.example.test', '/'), { file: 'pantry/' });
assert.deepEqual(resolve('app.example.test', '/js/app.js'), { file: 'pantry/js/app.js' });
assert.deepEqual(resolve('app.example.test', '/pantry'), { redirect: '/pantry/' });
assert.deepEqual(resolve('app.example.test', '/__/auth/handler'), { file: '__/auth/handler' });
assert.deepEqual(resolve('app.example.test', '/__/firebase/init.json'), { file: 'pantry/auth/firebase/init.json' });
assert.deepEqual(resolve('app.example.test', '/homedesign/app.css'), { file: 'homedesign/app.css' });
assert.deepEqual(resolve('app.example.test', '/homedesign'), { redirect: '/homedesign/' });
// a host can't reach another app's folder
assert.deepEqual(resolve('app.example.test', '/songs/x.txt'), { file: 'pantry/songs/x.txt' });
assert.deepEqual(resolve('pages.example.test', '/pantry/'), { notFound: true });
assert.deepEqual(resolve('pages.example.test', '/a/x.html'), { file: 'alpha/x.html' });
// no escaping the folder
assert.deepEqual(resolve('app.example.test', '/..%2fsongs/x'), { notFound: true });
assert.deepEqual(resolve('app.example.test', '/%2e%2e/x'), { notFound: true });
assert.deepEqual(resolve('app.example.test', '/a/../../x'), { notFound: true });
// previews serve the repo, and /_sites/<host>/ tries a host before it exists
assert.deepEqual(resolve('flamingbeing-home.x.workers.dev', '/pantry/index.html'), { file: 'pantry/index.html' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/app.example.test'), { redirect: '/_sites/app.example.test/' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/app.example.test/js/a.js'), { file: 'pantry/js/a.js' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/app.example.test/pantry'), { redirect: '/_sites/app.example.test/pantry/' });
// the pantry: its own folder, the kit, and Firebase's sign-in pages; nothing else in the repo
assert.deepEqual(resolve('pantry.flamingbeing.com', '/'), { file: 'pantry/' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/sw.js'), { file: 'pantry/sw.js' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/js/app.js'), { file: 'pantry/js/app.js' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/homedesign/app.js'), { file: 'homedesign/app.js' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/__/auth/handler'), { file: '__/auth/handler' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/__/auth/iframe.js'), { file: '__/auth/iframe.js' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/__/firebase/init.json'), { file: 'pantry/auth/firebase/init.json' });
assert.deepEqual(resolve('pantry.flamingbeing.com', '/songs/x.txt'), { file: 'pantry/songs/x.txt' });
assert.deepEqual(resolve('x.workers.dev', '/_sites/pantry.flamingbeing.com/?demo'.split('?')[0]), { file: 'pantry/' });
// Kaki Home: its own folder and sign-in pages; never the pantry's
assert.deepEqual(resolve('kakihome.flamingbeing.com', '/'), { file: 'kakihome/' });
assert.deepEqual(resolve('kakihome.flamingbeing.com', '/js/quick.js'), { file: 'kakihome/js/quick.js' });
assert.deepEqual(resolve('kakihome.flamingbeing.com', '/__/firebase/init.json'), { file: 'kakihome/auth/firebase/init.json' });
assert.deepEqual(resolve('kakihome.flamingbeing.com', '/__/auth/handler'), { file: '__/auth/handler' });
assert.deepEqual(resolve('kakihome.flamingbeing.com', '/pantry/index.html'), { file: 'kakihome/pantry/index.html' });
assert.deepEqual(resolve('design.flamingbeing.com', '/__/auth/handler'), { file: 'homedesign/__/auth/handler' });
assert.ok(SHARED.every(s => s.startsWith('/') && s.endsWith('/')));
console.log('worker routes: ok');
