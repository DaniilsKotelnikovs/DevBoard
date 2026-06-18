'use strict';

const { nativeImage } = require('electron');
const zlib = require('node:zlib');

const W = 256, H = 256;
const S = 2.56; // scale: SVG viewBox 100×100 → 256×256
const sc = (v) => Math.round(v * S);

function setPixel(buf, x, y, [r, g, b, a = 255]) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  if (a >= 255) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
  } else {
    const aa = a / 255, ia = 1 - aa;
    buf[i]     = Math.round(buf[i]     * ia + r * aa);
    buf[i + 1] = Math.round(buf[i + 1] * ia + g * aa);
    buf[i + 2] = Math.round(buf[i + 2] * ia + b * aa);
    buf[i + 3] = Math.min(255, Math.round(buf[i + 3] + a * (1 - buf[i + 3] / 255)));
  }
}

function fillRect(buf, x, y, w, h, color) {
  for (let py = Math.max(0, y); py < Math.min(H, y + h); py++)
    for (let px = Math.max(0, x); px < Math.min(W, x + w); px++)
      setPixel(buf, px, py, color);
}

function fillRoundedRect(buf, rx, ry, rw, rh, cr, color) {
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const ncx = Math.max(rx + cr, Math.min(rx + rw - cr, x));
      const ncy = Math.max(ry + cr, Math.min(ry + rh - cr, y));
      if ((x - ncx) ** 2 + (y - ncy) ** 2 <= cr * cr)
        setPixel(buf, x, y, color);
    }
  }
}

function fillCircle(buf, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius - 1; y <= cy + radius + 1; y++)
    for (let x = cx - radius - 1; x <= cx + radius + 1; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2)
        setPixel(buf, x, y, color);
}

function drawIcon(accent = [94, 155, 146]) {
  const buf = new Uint8Array(W * H * 4);

  fillRoundedRect(buf, sc(3), sc(3), sc(94), sc(94), sc(22), [32, 35, 39]);
  // 1px border: paint full rounded rect white at low alpha, then re-fill interior
  fillRoundedRect(buf, sc(3), sc(3), sc(94), sc(94), sc(22), [255, 255, 255, 23]);
  fillRoundedRect(buf, sc(3) + 1, sc(3) + 1, sc(94) - 2, sc(94) - 2, sc(22) - 1, [32, 35, 39]);

  fillCircle(buf, sc(30), sc(34), sc(4.6), accent);
  fillRect(buf,   sc(42), sc(31), sc(30), sc(6),  [199, 204, 210]);

  fillCircle(buf, sc(30), sc(50), sc(4.6), [126, 133, 142]);
  fillRect(buf,   sc(42), sc(47), sc(22), sc(6),  [135, 141, 149]);

  fillCircle(buf, sc(30), sc(66), sc(4.6), [90, 96, 104]);
  fillRect(buf,   sc(42), sc(63), sc(26), sc(6),  [103, 109, 117]);

  return buf;
}

function encodePNG(pixels, w, h) {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[i] = c;
  }
  function crc32(data) {
    let c = 0xFFFFFFFF;
    for (const b of data) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf  = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter type: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (1 + w * 4) + 1 + x * 4;
      raw[di]     = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ACCENTS = {
  teal:         [94,  155, 146],
  'slate-blue': [110, 134, 166],
  clay:         [174, 124, 109],
};

function createAppIcon(theme = 'teal') {
  const accent = ACCENTS[theme] || ACCENTS.teal;
  const png    = encodePNG(drawIcon(accent), W, H);
  return nativeImage.createFromBuffer(png, { width: W, height: H });
}

module.exports = { createAppIcon };
