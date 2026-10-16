// Renders icons/icon.svg to the PNG sizes phones want (run once after changing the icon).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad] of [['icon-180.png', 180, 0], ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1]]) {
  await p.setViewportSize({ width: size, height: size });
  const inner = pad ? svg.replace('rx="112"', 'rx="0"') : svg;
  await p.setContent(`<style>html,body{margin:0;background:${pad ? '#1e6b4a' : 'transparent'}}svg{display:block;width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px;margin:${size * pad}px}</style>${inner}`);
  await p.screenshot({ path: join(dir, name), omitBackground: !pad });
}
await b.close();
