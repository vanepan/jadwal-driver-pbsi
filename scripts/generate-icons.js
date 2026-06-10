/**
 * generate-icons.js — Sarpras Operations PWA icon generator
 * Uses puppeteer to render a clean icon and export as PNG.
 * Run: node scripts/generate-icons.js
 */

'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ICON_512_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 512px; height: 512px; overflow: hidden; background: #A8292F; }
.icon {
  width: 512px;
  height: 512px;
  background: #A8292F;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.letter {
  font-size: 316px;
  font-weight: 800;
  color: rgba(255,255,255,0.97);
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1;
  letter-spacing: -12px;
  margin-bottom: 18px;
}
.bar {
  width: 148px;
  height: 10px;
  background: rgba(255,255,255,0.55);
  border-radius: 5px;
}
</style>
</head>
<body>
<div class="icon">
  <span class="letter">S</span>
  <div class="bar"></div>
</div>
</body>
</html>`;

const ICON_192_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 192px; height: 192px; overflow: hidden; background: #A8292F; }
.icon {
  width: 192px;
  height: 192px;
  background: #A8292F;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.letter {
  font-size: 118px;
  font-weight: 800;
  color: rgba(255,255,255,0.97);
  font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1;
  letter-spacing: -4px;
  margin-bottom: 7px;
}
.bar {
  width: 55px;
  height: 4px;
  background: rgba(255,255,255,0.55);
  border-radius: 2px;
}
</style>
</head>
<body>
<div class="icon">
  <span class="letter">S</span>
  <div class="bar"></div>
</div>
</body>
</html>`;

async function generateIcons() {
  const iconsDir = path.join(__dirname, '..', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  console.log('Launching puppeteer…');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // 512x512
    const page512 = await browser.newPage();
    await page512.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    await page512.setContent(ICON_512_HTML, { waitUntil: 'networkidle0' });
    const out512 = path.join(iconsDir, 'icon-512.png');
    await page512.screenshot({
      path: out512,
      clip: { x: 0, y: 0, width: 512, height: 512 },
      omitBackground: false,
    });
    await page512.close();
    console.log(`✓ icon-512.png → ${out512}`);

    // 192x192
    const page192 = await browser.newPage();
    await page192.setViewport({ width: 192, height: 192, deviceScaleFactor: 1 });
    await page192.setContent(ICON_192_HTML, { waitUntil: 'networkidle0' });
    const out192 = path.join(iconsDir, 'icon-192.png');
    await page192.screenshot({
      path: out192,
      clip: { x: 0, y: 0, width: 192, height: 192 },
      omitBackground: false,
    });
    await page192.close();
    console.log(`✓ icon-192.png → ${out192}`);

    console.log('\nAll icons generated successfully.');
  } finally {
    await browser.close();
  }
}

generateIcons().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
