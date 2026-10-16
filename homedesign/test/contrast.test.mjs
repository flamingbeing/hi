// Contrast check for the home design tokens: node homedesign/test/contrast.test.mjs
// Reads every "@pair <fg> on <bg> >= <min> (<ratio>)" line in tokens.css, resolves both tokens to colours, and checks
// that the pair meets its minimum (WCAG 2.2: 4.5 for text, 3 for controls and focus rings) and that the ratio written
// in the comment is the real one (to one decimal place), so DESIGN.md and the comments can't drift from the values.
// Also checks that every colour token used as text in the kit has at least one documented pair.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../', import.meta.url);
const css = fs.readFileSync(new URL('tokens.css', dir), 'utf8');

// --home-name: value; (first definition on :root wins; later blocks such as media queries don't redefine colours)
const tokens = {};
for (const [, name, value] of css.matchAll(/--home-([a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!(name in tokens)) tokens[name] = value.trim();

function resolve(name, seen = new Set()) {
  assert.ok(name in tokens, `unknown token --home-${name}`);
  assert.ok(!seen.has(name), `token loop at --home-${name}`);
  seen.add(name);
  const v = tokens[name];
  const ref = v.match(/^var\(--home-([a-z0-9-]+)\)$/);
  return ref ? resolve(ref[1], seen) : v;
}
function rgb(v) {
  const m = v.match(/^#([0-9a-f]{6})$/i);
  assert.ok(m, `expected a #rrggbb colour, got ${v}`);
  return m[1].match(/../g).map(h => parseInt(h, 16) / 255);
}
const lum = c => { const [r, g, b] = c.map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function ratio(a, b) { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

const pairs = [...css.matchAll(/@pair ([a-z0-9-]+) on ([a-z0-9-]+) >= ([\d.]+) \(([\d.]+)\)/g)];
assert.ok(pairs.length >= 20, `expected the documented pairs, found ${pairs.length}`);
const fails = [];
for (const [, fg, bg, min, said] of pairs) {
  const r = ratio(resolve(fg), resolve(bg));
  const line = `${fg} on ${bg}: ${r.toFixed(2)}:1 (needs ${min}, comment says ${said})`;
  if (process.env.VERBOSE) console.log(line);
  if (r < Number(min)) fails.push('too low: ' + line);
  if (Math.abs(r - Number(said)) > 0.06) fails.push('comment is out of date: ' + line);
}
// every text colour has at least one documented pair
for (const t of ['ink', 'ink-2', 'muted', 'placeholder', 'accent', 'on-accent', 'ok', 'warn', 'bad', 'on-toast', 'toast-action', 'control', 'focus']) {
  if (!pairs.some(p => p[1] === t)) fails.push(`--home-${t} has no documented contrast pair`);
}
// DESIGN.md's colour table quotes the same ratios: each "| `--home-x` | `#hex` |" row must match tokens.css
const md = fs.readFileSync(new URL('DESIGN.md', dir), 'utf8');
const rows = [...md.matchAll(/\|\s*`--home-([a-z0-9-]+)`(?:\s*\/\s*`--home-([a-z0-9-]+)`)?\s*\|\s*`(#[0-9a-f]{6})`(?:\s*\/\s*`(#[0-9a-f]{6})`)?/gi)]
  .flatMap(m => [[m[1], m[3]], ...(m[2] && m[4] ? [[m[2], m[4]]] : [])]);
assert.ok(rows.length >= 20, `DESIGN.md colour table: found ${rows.length} rows`);
for (const [name, hex] of rows) {
  if (!(name in tokens)) fails.push(`DESIGN.md lists --home-${name}, which tokens.css doesn't define`);
  else if (resolve(name).toLowerCase() !== hex.toLowerCase()) fails.push(`DESIGN.md says --home-${name} is ${hex}, tokens.css says ${resolve(name)}`);
}
if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`contrast: ok (${pairs.length} pairs)`);
