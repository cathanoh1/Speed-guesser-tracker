// Generates src/app/icon.png - Next.js's App Router convention for the
// favicon/app icon (any icon.{png,jpg,svg,ico} under app/ is served
// automatically, no <link> tags or metadata needed). Dependency-free, so
// there's no image-editing tool required to regenerate or tweak it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'src', 'app', 'icon.png');

const BRAND_BLUE = [42, 120, 214, 255];
const WHITE = [255, 255, 255, 255];
const SIZE = 256;

function createCanvas(size) {
  return new Uint8ClampedArray(size * size * 4);
}
function setPixel(buf, size, x, y, rgba) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = rgba[0];
  buf[i + 1] = rgba[1];
  buf[i + 2] = rgba[2];
  buf[i + 3] = rgba[3];
}
function fillRect(buf, size, x0, y0, x1, y1, rgba) {
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) setPixel(buf, size, x, y, rgba);
  }
}
function insideRoundedSquare(x, y, size, radius) {
  const inCornerX = x < radius || x > size - radius;
  const inCornerY = y < radius || y > size - radius;
  if (!(inCornerX && inCornerY)) return true;
  const nearestX = Math.min(Math.max(x, radius), size - radius);
  const nearestY = Math.min(Math.max(y, radius), size - radius);
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}
function fillRoundedSquare(buf, size, radiusFrac, rgba) {
  const radius = size * radiusFrac;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (insideRoundedSquare(x, y, size, radius)) setPixel(buf, size, x, y, rgba);
    }
  }
}
function fillArcRing(buf, size, cx, cy, innerR, outerR, startDeg, endDeg, rgba) {
  const minX = Math.floor(cx - outerR);
  const maxX = Math.ceil(cx + outerR);
  const minY = Math.floor(cy - outerR);
  const maxY = Math.ceil(cy + outerR);
  const toRad = (deg) => (((deg % 360) + 360) % 360) * (Math.PI / 180);
  const start = toRad(startDeg);
  const end = toRad(endDeg);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < innerR || dist > outerR) continue;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle += Math.PI * 2;
      const inRange = start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
      if (inRange) setPixel(buf, size, x, y, rgba);
    }
  }
}
function drawTrophySilhouette(buf, size, rgba) {
  const cx = size / 2;
  const bowlTopY = size * 0.18;
  const bowlBottomY = size * 0.48;
  const topHalfWidth = size * 0.22;
  const neckHalfWidth = size * 0.065;
  for (let y = Math.round(bowlTopY); y < Math.round(bowlBottomY); y++) {
    const t = (y - bowlTopY) / (bowlBottomY - bowlTopY);
    const eased = t ** 1.6;
    const halfWidth = topHalfWidth + (neckHalfWidth - topHalfWidth) * eased;
    fillRect(buf, size, cx - halfWidth, y, cx + halfWidth, y + 1, rgba);
  }
  fillRect(buf, size, cx - topHalfWidth, bowlTopY - size * 0.015, cx + topHalfWidth, bowlTopY + size * 0.02, rgba);
  const handleY = bowlTopY + (bowlBottomY - bowlTopY) * 0.34;
  const handleOuterR = size * 0.1;
  const ringThickness = Math.max(size * 0.032, 1.5);
  const handleInnerR = handleOuterR - ringThickness;
  const handleOffsetX = topHalfWidth * 0.72;
  fillArcRing(buf, size, cx - handleOffsetX, handleY, handleInnerR, handleOuterR, 80, 280, rgba);
  fillArcRing(buf, size, cx + handleOffsetX, handleY, handleInnerR, handleOuterR, 260, 100, rgba);
  fillRect(buf, size, cx - size * 0.04, bowlBottomY, cx + size * 0.04, size * 0.72, rgba);
  fillRect(buf, size, size * 0.32, size * 0.72, size * 0.68, size * 0.8, rgba);
  fillRect(buf, size, size * 0.24, size * 0.8, size * 0.76, size * 0.86, rgba);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
function encodePNG(rgba, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  const rgbaBuf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgbaBuf.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, pngChunk('IHDR', ihdrData), pngChunk('IDAT', idatData), pngChunk('IEND', Buffer.alloc(0))]);
}

const canvas = createCanvas(SIZE);
fillRoundedSquare(canvas, SIZE, 0.18, BRAND_BLUE);
drawTrophySilhouette(canvas, SIZE, WHITE);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePNG(canvas, SIZE));
console.log(`Wrote ${path.relative(path.join(here, '..'), outPath)}`);
