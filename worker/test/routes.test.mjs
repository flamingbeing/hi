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
assert.ok(SHARED.every(s => s.startsWith('/') && s.endsWith('/')));
console.log('worker routes: ok');
