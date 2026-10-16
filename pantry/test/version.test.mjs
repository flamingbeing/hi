// sw.js must be stamped for the current files (run node pantry/tools/stamp.mjs after changing the app).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampText, files } from '../tools/stamp.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const date = sw.match(/const VERSION = 'pantry-(\d{4}-\d{2}-\d{2})-\w{8}';/)?.[1];
assert.ok(date, 'sw.js has a stamped VERSION');
assert.equal(stampText(sw, date), sw, 'sw.js is out of date: run node pantry/tools/stamp.mjs');
for (const f of ['index.html', 'js/app.js', 'config.js', 'icons/icon-192.png']) assert.ok(files().includes(f), f + ' is cached for offline');
console.log('pantry version: ok');
