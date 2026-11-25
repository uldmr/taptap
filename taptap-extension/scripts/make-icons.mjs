// Extension icons, drawn from scratch so the repo carries no binary assets it
// cannot explain: a dark rounded tile, the bopbop-family sky-blue window frame,
// and the green tap arrow. Rendered at 8x and box-filtered down.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SIZES = [16, 32, 48, 128];
const SS = 8; // supersampling factor

const BG = [0x0d, 0x0d, 0x0d];
const BLUE = [0x38, 0xbd, 0xf8];
const GREEN_TOP = [0x00, 0xff, 0x41];
const GREEN_BOTTOM = [0x00, 0xcc, 0x33];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Signed distance to a rounded rect: negative inside. */
function rr(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return Math.hypot(x - cx, y - cy) - r;
}

function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The tap arrow, in a 0..1 box.
const ARROW = [
  [0.33, 0.27],
  [0.33, 0.79],
  [0.46, 0.66],
  [0.55, 0.87],
  [0.65, 0.82],
  [0.56, 0.61],
  [0.72, 0.61],
];

function sample(x, y) {
  // x, y in 0..1
  const outer = rr(x, y, 0.03, 0.03, 0.97, 0.97, 0.22);
  if (outer > 0) return null; // transparent outside the tile

  const arrowBottom = Math.max(...ARROW.map((p) => p[1]));
  if (inPolygon(x, y, ARROW)) {
    const t = clamp01((y - 0.27) / (arrowBottom - 0.27));
    return mix(GREEN_TOP, GREEN_BOTTOM, t);
  }

  const frame = rr(x, y, 0.17, 0.17, 0.83, 0.83, 0.09);
  const stroke = Math.abs(frame) <= 0.035;
  const titleBar = Math.abs(y - 0.36) <= 0.028 && x > 0.17 + 0.05 && x < 0.83 - 0.05 && frame < 0;
  if (stroke || titleBar) return BLUE;

  return BG;
}

function render(size) {
  const big = size * SS;
  const acc = new Float64Array(size * size * 4);
  for (let by = 0; by < big; by++) {
    const y = (by + 0.5) / big;
    for (let bx = 0; bx < big; bx++) {
      const x = (bx + 0.5) / big;
      const color = sample(x, y);
      const oy = Math.floor(by / SS);
      const ox = Math.floor(bx / SS);
      const i = (oy * size + ox) * 4;
      if (!color) continue;
      acc[i] += color[0];
      acc[i + 1] += color[1];
      acc[i + 2] += color[2];
      acc[i + 3] += 255;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const per = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = acc[i * 4 + 3] / per;
    const alpha = Math.round(a);
    // premultiplied average -> straight alpha
    const k = acc[i * 4 + 3] === 0 ? 0 : 255 / acc[i * 4 + 3];
    out[i * 4] = Math.round(acc[i * 4] * k);
    out[i * 4 + 1] = Math.round(acc[i * 4 + 1] * k);
    out[i * 4 + 2] = Math.round(acc[i * 4 + 2] * k);
    out[i * 4 + 3] = alpha;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = join(root, 'icons');
mkdirSync(dir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(dir, `${size}.png`), encodePng(size, size, render(size)));
}
console.log(`icons: ${SIZES.map((s) => `${s}px`).join(', ')} -> ${dir}`);
