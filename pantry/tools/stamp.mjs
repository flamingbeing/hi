// Stamps sw.js: lists the app's files and sets VERSION to pantry-<date>-<hash of the files>.
// Run after changing any file the app uses: node pantry/tools/stamp.mjs (test/version.test.mjs checks).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['sw.js', 'test', 'tools', 'NOTES.md', 'README.md', 'SETUP.md', 'STATUS.md', 'firestore.rules', 'firebase.json']);
function walk(dir) {
  return readdirSync(dir).sort().flatMap(n => {
    if (SKIP.has(n) || n.startsWith('.')) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p).split('\\').join('/')];
  });
}
export function files() { return walk(root); }
export function hash() {
  const h = createHash('sha256');
  for (const f of files()) { h.update(f); h.update(readFileSync(join(root, f))); }
  const sw = readFileSync(join(root, 'sw.js'), 'utf8').replace(/const VERSION = '[^']*';/, '').replace(/const FILES = \[[^\]]*\];/, '');
  h.update(sw);
  return h.digest('hex').slice(0, 8);
}
export function stampText(sw, date) {
  return sw.replace(/const VERSION = '[^']*';/, `const VERSION = 'pantry-${date}-${hash()}';`)
    .replace(/const FILES = \[[^\]]*\];/, `const FILES = [${files().map(f => `'${f}'`).join(', ')}];`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = join(root, 'sw.js');
  const sw = readFileSync(p, 'utf8');
  const old = sw.match(/const VERSION = 'pantry-(\d{4}-\d{2}-\d{2})-(\w+)';/);
  const h = hash();
  if (old && old[2] === h && stampText(sw, old[1]) === sw) { console.log('sw.js already current:', `pantry-${old[1]}-${h}`); process.exit(0); }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  writeFileSync(p, stampText(sw, date));
  console.log('stamped', `pantry-${date}-${h}`);
}
