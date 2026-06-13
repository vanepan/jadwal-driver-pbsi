/**
 * generate-icons.js — Sarpras Operations PWA icon generator
 *
 * Single source of truth: icons/Sarpras-Icon.ico
 * Extracts the highest-resolution image from the ICO (256x256, 32bpp BGRA),
 * encodes it as a transparent PNG, then uses puppeteer to scale it to the
 * PWA icon sizes (192 and 512) while preserving the alpha channel.
 *
 * The ICO stores the crest flattened onto a solid, fully-opaque black
 * background. We restore transparency by flood-filling the black region
 * that is connected to the image borders (so the crest's own dark outlines
 * are never touched), with a soft threshold for feathered, halo-free edges.
 *
 * - Transparent background (black keyed out; no white fill ever added).
 * - Aspect ratio maintained, logo centered (object-fit: contain).
 * - Highest-quality source available from the ICO (256x256, 32bpp).
 *
 * Run: node scripts/generate-icons.js
 */

'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '..', 'icons');
const icoPath = path.join(iconsDir, 'Sarpras-Icon.ico');

// ---------------------------------------------------------------------------
// 1. Extract the largest image from the ICO as raw RGBA
// ---------------------------------------------------------------------------
function extractLargestFromIco(buf) {
  const count = buf.readUInt16LE(4);
  let best = null;
  let off = 6;
  for (let i = 0; i < count; i++) {
    const w = buf[off] || 256;
    const h = buf[off + 1] || 256;
    const size = buf.readUInt32LE(off + 8);
    const dataOffset = buf.readUInt32LE(off + 12);
    if (!best || w * h > best.w * best.h) best = { w, h, size, dataOffset };
    off += 16;
  }
  const slice = buf.subarray(best.dataOffset, best.dataOffset + best.size);

  // Embedded PNG?
  if (slice[0] === 0x89 && slice[1] === 0x50) {
    return { png: slice, w: best.w, h: best.h };
  }

  // Otherwise it's a DIB (BITMAPINFOHEADER + pixel data, bottom-up BGRA).
  const headerSize = slice.readUInt32LE(0);
  const bpp = slice.readUInt16LE(14);
  if (bpp !== 32) {
    throw new Error(`Unsupported DIB bpp ${bpp}; expected 32 for high-quality alpha source.`);
  }
  const w = best.w;
  const h = best.h;
  const pixels = slice.subarray(headerSize); // BGRA, bottom-up, w*h*4
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4; // bottom-up
    const dstRow = y * w * 4;
    for (let x = 0; x < w; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      rgba[d] = pixels[s + 2];     // R
      rgba[d + 1] = pixels[s + 1]; // G
      rgba[d + 2] = pixels[s];     // B
      rgba[d + 3] = pixels[s + 3]; // A
    }
  }
  return { rgba, w, h };
}

// ---------------------------------------------------------------------------
// 1b. Remove the black background by border-connected flood fill
//     T_HARD: at/below this max-channel -> fully transparent (pure background)
//     T_SOFT: between hard and soft -> partial alpha (feathered edge)
// ---------------------------------------------------------------------------
function removeBlackBackground(rgba, w, h, T_HARD = 16, T_SOFT = 90) {
  const maxCh = (i) => Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
  const bg = new Uint8Array(w * h); // 1 = background (border-connected, <T_SOFT)
  const stack = [];

  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (bg[p]) return;
    if (maxCh(p * 4) < T_SOFT) { bg[p] = 1; stack.push(p); }
  };

  // Seed from every border pixel
  for (let x = 0; x < w; x++) { pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIf(0, y); pushIf(w - 1, y); }

  // 8-connected flood fill
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0;
    pushIf(x - 1, y); pushIf(x + 1, y); pushIf(x, y - 1); pushIf(x, y + 1);
    pushIf(x - 1, y - 1); pushIf(x + 1, y - 1); pushIf(x - 1, y + 1); pushIf(x + 1, y + 1);
  }

  let cleared = 0, feathered = 0;
  for (let p = 0; p < w * h; p++) {
    if (!bg[p]) continue;
    const i = p * 4;
    const m = maxCh(i);
    if (m <= T_HARD) { rgba[i + 3] = 0; cleared++; }
    else {
      // Feather: scale alpha by how far above hard threshold (0..1)
      const a = Math.round((255 * (m - T_HARD)) / (T_SOFT - T_HARD));
      rgba[i + 3] = Math.min(rgba[i + 3], a);
      feathered++;
    }
  }
  console.log(`Background removed: ${cleared} px cleared, ${feathered} px feathered`);
  return rgba;
}

// ---------------------------------------------------------------------------
// 2. Minimal PNG encoder (RGBA, no external deps)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // 10-12 left 0 (compression, filter, interlace)

  // Add filter byte (0) per scanline
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 3. Scale a source PNG to a target size via puppeteer (transparent).
//    Returns the PNG Buffer; also writes to outPath when provided.
// ---------------------------------------------------------------------------
async function scale(browser, sourceDataUri, sizePx, outPath) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${sizePx}px; height:${sizePx}px; overflow:hidden; background:transparent; }
    .wrap { width:${sizePx}px; height:${sizePx}px; display:flex; align-items:center; justify-content:center; }
    img { width:100%; height:100%; object-fit:contain; image-rendering:auto; }
  </style></head><body><div class="wrap"><img src="${sourceDataUri}"></div></body></html>`;

  const page = await browser.newPage();
  await page.setViewport({ width: sizePx, height: sizePx, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const img = document.querySelector('img');
    return img.complete ? null : new Promise(r => { img.onload = r; });
  });
  const buf = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: sizePx, height: sizePx },
    omitBackground: true, // preserve transparency, no white fill
  });
  await page.close();
  if (outPath) {
    fs.writeFileSync(outPath, buf);
    console.log(`✓ ${path.basename(outPath)} (${sizePx}x${sizePx})`);
  }
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// 3b. Build a transparent multi-resolution ICO from PNG buffers.
//     Uses PNG-embedded entries (supported by all modern browsers + Windows
//     Vista+), so the alpha channel is preserved in the favicon itself.
// ---------------------------------------------------------------------------
function buildIco(entries) {
  // entries: [{ size, buf }]
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((e, i) => {
    const d = i * 16;
    dir[d] = e.size >= 256 ? 0 : e.size;     // width  (0 => 256)
    dir[d + 1] = e.size >= 256 ? 0 : e.size; // height (0 => 256)
    dir[d + 2] = 0;  // color count
    dir[d + 3] = 0;  // reserved
    dir.writeUInt16LE(1, d + 4);   // color planes
    dir.writeUInt16LE(32, d + 6);  // bits per pixel
    dir.writeUInt32LE(e.buf.length, d + 8);  // bytes in resource
    dir.writeUInt32LE(offset, d + 12);       // image offset
    offset += e.buf.length;
  });

  return Buffer.concat([header, dir, ...entries.map(e => e.buf)]);
}

async function main() {
  if (!fs.existsSync(icoPath)) {
    throw new Error(`Source ICO not found: ${icoPath}`);
  }
  console.log(`Source: ${path.basename(icoPath)}`);

  const ico = fs.readFileSync(icoPath);
  const extracted = extractLargestFromIco(ico);

  let sourcePng;
  if (extracted.png) {
    sourcePng = extracted.png; // already-PNG ICO entry: assume it carries its own alpha
  } else {
    removeBlackBackground(extracted.rgba, extracted.w, extracted.h);
    sourcePng = encodePng(extracted.rgba, extracted.w, extracted.h);
  }
  console.log(`Extracted source image: ${extracted.w}x${extracted.h}`);

  const sourceDataUri = 'data:image/png;base64,' + sourcePng.toString('base64');

  console.log('Launching puppeteer…');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    // PWA icons
    await scale(browser, sourceDataUri, 512, path.join(iconsDir, 'icon-512.png'));
    await scale(browser, sourceDataUri, 192, path.join(iconsDir, 'icon-192.png'));

    // Transparent multi-resolution favicon ICO (replaces the opaque original).
    // Back up the original opaque artwork once, so it is never lost.
    const backupPath = path.join(iconsDir, 'Sarpras-Icon-opaque-original.ico');
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, ico);
      console.log(`↪ backed up original opaque ICO → ${path.basename(backupPath)}`);
    }

    const icoSizes = [16, 32, 48, 64, 128, 256];
    const entries = [];
    for (const s of icoSizes) {
      entries.push({ size: s, buf: await scale(browser, sourceDataUri, s, null) });
    }
    fs.writeFileSync(icoPath, buildIco(entries));
    console.log(`✓ ${path.basename(icoPath)} (transparent, sizes: ${icoSizes.join(', ')})`);

    console.log('\nAll icons generated successfully from Sarpras-Icon.ico.');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
