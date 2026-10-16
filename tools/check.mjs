// Repo checks (run on every PR by the Checks workflow): node tools/check.mjs
// - every app page carries <meta name="robots" content="noindex, nofollow"> (apps stay out of search engines)
// - every service worker has a plain VERSION ('<app>-v<N>'; the deploy stamps it, never by hand), deletes only its
//   own '<app>-' caches, and lists SHELL files that exist
// - no Firebase debug logs or obvious secrets committed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = /(^|\/)(\.git|node_modules|\.wrangler|songs|suno-songs|test)(\/|$)/;
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const f = path.join(dir, d.name), rel = path.relative(ROOT, f);
  if (SKIP.test(rel)) return [];
  return d.isDirectory() ? walk(f) : [rel];
});
const files = walk(ROOT);
const problems = [];

for (const f of files.filter(f => f.endsWith('.html') && !f.startsWith('__/'))) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) problems.push(`${f}: missing <meta name="robots" content="noindex, nofollow">`);
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${f}: missing <title>`);
}
for (const f of files.filter(f => /(^|\/)sw\.js$/.test(f))) {
  const app = path.dirname(f);
  const sw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const v = sw.match(/const VERSION = '([^']+)'/)?.[1];
  if (!v) problems.push(`${f}: no VERSION`);
  else if (!new RegExp(`^${app}-v\\d+$`).test(v)) problems.push(`${f}: VERSION should be '${app}-v<N>' (the deploy stamps it), not '${v}'`);
  if (!/startsWith\(\s*['"`]/.test(sw) && !/PREFIX/.test(sw)) problems.push(`${f}: must delete only caches starting '${app}-'`);
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] || '';
  for (const [, s] of shell.matchAll(/'([^']+)'/g)) {
    if (s === './' || /^https?:/.test(s)) continue;
    const p = s.startsWith('/') ? path.join(ROOT, s) : path.join(ROOT, app, s);
    if (!fs.existsSync(p)) problems.push(`${f}: SHELL file ${s} does not exist`);
  }
}
for (const f of files) {
  if (/-debug\.log$/.test(f)) problems.push(`${f}: debug log committed`);
  if (/\.(js|mjs|json|html|md|jsonc)$/.test(f)) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t) || /"private_key"\s*:/.test(t) || /ghp_[A-Za-z0-9]{30,}/.test(t)) problems.push(`${f}: looks like a secret`);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`repo check: ok (${files.length} files)`);
