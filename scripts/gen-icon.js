'use strict';
// Generates assets/icon.ico (multi-size) from the same drawing code as app-icon.js
const zlib = require('node:zlib');
const fs   = require('node:fs');
const path = require('node:path');

const ACCENT = [94, 155, 146]; // teal

function drawIcon(W, H) {
  const S  = W / 100;
  const sc = (v) => Math.round(v * S);
  const buf = new Uint8Array(W * H * 4);

  function setPixel(x, y, [r, g, b, a = 255]) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    if (a >= 255) {
      buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255;
    } else {
      const aa = a/255, ia = 1-aa;
      buf[i]   = Math.round(buf[i]   * ia + r * aa);
      buf[i+1] = Math.round(buf[i+1] * ia + g * aa);
      buf[i+2] = Math.round(buf[i+2] * ia + b * aa);
      buf[i+3] = Math.min(255, Math.round(buf[i+3] + a * (1 - buf[i+3]/255)));
    }
  }
  function fillRect(x, y, w, h, c) {
    for (let py = Math.max(0,y); py < Math.min(H,y+h); py++)
      for (let px = Math.max(0,x); px < Math.min(W,x+w); px++)
        setPixel(px, py, c);
  }
  function fillRounded(rx, ry, rw, rh, cr, c) {
    for (let y = ry; y < ry+rh; y++)
      for (let x = rx; x < rx+rw; x++) {
        const ncx = Math.max(rx+cr, Math.min(rx+rw-cr, x));
        const ncy = Math.max(ry+cr, Math.min(ry+rh-cr, y));
        if ((x-ncx)**2 + (y-ncy)**2 <= cr*cr) setPixel(x, y, c);
      }
  }
  function fillCircle(cx, cy, radius, c) {
    for (let y = cy-radius-1; y <= cy+radius+1; y++)
      for (let x = cx-radius-1; x <= cx+radius+1; x++)
        if ((x-cx)**2 + (y-cy)**2 <= radius*radius) setPixel(x, y, c);
  }

  fillRounded(sc(3), sc(3), sc(94), sc(94), sc(22), [32,35,39]);
  fillRounded(sc(3), sc(3), sc(94), sc(94), sc(22), [255,255,255,23]);
  fillRounded(sc(3)+1, sc(3)+1, sc(94)-2, sc(94)-2, sc(22)-1, [32,35,39]);

  fillCircle(sc(30), sc(34), sc(4.6), ACCENT);
  fillRect(sc(42), sc(31), sc(30), sc(6), [199,204,210]);
  fillCircle(sc(30), sc(50), sc(4.6), [126,133,142]);
  fillRect(sc(42), sc(47), sc(22), sc(6), [135,141,149]);
  fillCircle(sc(30), sc(66), sc(4.6), [90,96,104]);
  fillRect(sc(42), sc(63), sc(26), sc(6), [103,109,117]);

  return buf;
}

function encodePNG(pixels, w, h) {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1);
    crcTable[i] = c;
  }
  function crc32(data) {
    let c = 0xFFFFFFFF;
    for (const b of data) c = crcTable[(c^b)&0xFF] ^ (c>>>8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length);
    const tb = Buffer.from(type,'ascii');
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb,data])));
    return Buffer.concat([lb,tb,data,cb]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6;
  const raw = Buffer.alloc(h*(1+w*4));
  for (let y = 0; y < h; y++) {
    raw[y*(1+w*4)] = 0;
    for (let x = 0; x < w; x++) {
      const si=(y*w+x)*4, di=y*(1+w*4)+1+x*4;
      raw[di]=pixels[si]; raw[di+1]=pixels[si+1]; raw[di+2]=pixels[si+2]; raw[di+3]=pixels[si+3];
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw)),
    chunk('IEND',Buffer.alloc(0)),
  ]);
}

// Build ICO with sizes: 16, 32, 48, 256
const SIZES = [16, 32, 48, 256];
const pngs  = SIZES.map(s => encodePNG(drawIcon(s, s), s, s));

// ICO format: ICONDIR + ICONDIRENTRYs + PNG data
const headerSize = 6 + SIZES.length * 16;
let offset = headerSize;
const entries = pngs.map((png, i) => {
  const s = SIZES[i];
  const entry = Buffer.alloc(16);
  entry[0] = s === 256 ? 0 : s;  // width  (0 = 256)
  entry[1] = s === 256 ? 0 : s;  // height
  entry[2] = 0;   // color count
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);           // reserved
iconDir.writeUInt16LE(1, 2);           // type: ICO
iconDir.writeUInt16LE(SIZES.length, 4);

const ico = Buffer.concat([iconDir, ...entries, ...pngs]);
const out = path.join(__dirname, '..', 'assets', 'icon.ico');
fs.writeFileSync(out, ico);
console.log(`Written ${out} (${(ico.length/1024).toFixed(1)} KB)`);
