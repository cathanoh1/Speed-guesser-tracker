// Generates the two placeholder Teams app icons (teamsapp/icons/color.png at
// 192x192 and outline.png at 32x32) as plain, dependency-free PNGs - a solid
// brand-blue trophy silhouette. Swap these files for real artwork whenever
// you like; this script only exists so the repo doesn't need a binary image
// checked in from day one, and so you can regenerate a variant by editing
// the shape math below (no image editor or extra npm packages required).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'teamsapp', 'icons');

const BRAND_BLUE = [42, 120, 214, 255]; // #2a78d6 - matches the dashboard's accent color
const WHITE = [255, 255, 255, 255];

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
    for (let x = Math.round(x0); x < Math.round(x1); x++) {
      setPixel(buf, size, x, y, rgba);
    }
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
  const toRad = (deg) => ((deg % 360) + 360) % 360 * (Math.PI / 180);
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

/** A simple trophy/cup silhouette (rounded bowl + side handles), sized as fractions of the canvas. */
function drawTrophySilhouette(buf, size, rgba) {
  const cx = size / 2;
  const bowlTopY = size * 0.18;
  const bowlBottomY = size * 0.48;
  const topHalfWidth = size * 0.22;
  const neckHalfWidth = size * 0.065;

  for (let y = Math.round(bowlTopY); y < Math.round(bowlBottomY); y++) {
    const t = (y - bowlTopY) / (bowlBottomY - bowlTopY);
    // Convex (ease-in) taper, not a straight line, so it reads as a rounded
    // bowl rather than a martini-glass cone.
    const eased = t ** 1.6;
    const halfWidth = topHalfWidth + (neckHalfWidth - topHalfWidth) * eased;
    fillRect(buf, size, cx - halfWidth, y, cx + halfWidth, y + 1, rgba);
  }

  // Rim cap so the bowl reads as an open cup rather than a point.
  fillRect(buf, size, cx - topHalfWidth, bowlTopY - size * 0.015, cx + topHalfWidth, bowlTopY + size * 0.02, rgba);

  // Side handles: a ring, keeping only the outward-facing half-arc so each
  // one reads as a "C" hugging the bowl rather than a solid blob.
  const handleY = bowlTopY + (bowlBottomY - bowlTopY) * 0.34;
  const handleOuterR = size * 0.1;
  const ringThickness = Math.max(size * 0.032, 1.5);
  const handleInnerR = handleOuterR - ringThickness;
  const handleOffsetX = topHalfWidth * 0.72;
  fillArcRing(buf, size, cx - handleOffsetX, handleY, handleInnerR, handleOuterR, 80, 280, rgba);
  fillArcRing(buf, size, cx + handleOffsetX, handleY, handleInnerR, handleOuterR, 260, 100, rgba);

  // Stem
  fillRect(buf, size, cx - size * 0.04, bowlBottomY, cx + size * 0.04, size * 0.72, rgba);
  // Two-tier base
  fillRect(buf, size, size * 0.32, size * 0.72, size * 0.68, size * 0.8, rgba);
  fillRect(buf, size, size * 0.24, size * 0.8, size * 0.76, size * 0.86, rgba);
}

// ---- minimal PNG encoder (RGBA8, no interlace, filter-none scanlines) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
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
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type 6 = RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  const rgbaBuf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: None
    rgbaBuf.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildColorIcon(size) {
  const canvas = createCanvas(size);
  fillRoundedSquare(canvas, size, 0.18, BRAND_BLUE);
  drawTrophySilhouette(canvas, size, WHITE);
  return canvas;
}

function buildOutlineIcon(size) {
  // Teams requires the outline icon to be a simple white shape on a fully
  // transparent background (no other colors, no background fill).
  const canvas = createCanvas(size);
  canvas.fill(0); // start fully transparent
  drawTrophySilhouette(canvas, size, WHITE);
  return canvas;
}

fs.mkdirSync(outDir, { recursive: true });

const colorPng = encodePNG(buildColorIcon(192), 192);
fs.writeFileSync(path.join(outDir, 'color.png'), colorPng);

const outlinePng = encodePNG(buildOutlineIcon(32), 32);
fs.writeFileSync(path.join(outDir, 'outline.png'), outlinePng);

console.log(`Wrote ${path.join('teamsapp', 'icons', 'color.png')} (192x192) and outline.png (32x32).`);
console.log('These are plain placeholder icons - swap them for real artwork whenever you like.');
