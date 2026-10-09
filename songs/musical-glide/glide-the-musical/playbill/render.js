// Render playbill.html to GLIDE-The-Musical-Showbill.pdf (and optional page PNGs for review).
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'playbill.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(__dirname, 'GLIDE-The-Musical-Showbill.pdf'), preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log('pdf written');
})();
