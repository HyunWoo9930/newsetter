// cutout.js — pure-Node PNG background remover (flood fill from edges) + crop
// usage: node cutout.js <in.png> <out.png> [threshold] [x,y,w,h crop-first]
const fs = require('fs'), zlib = require('zlib');

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------- PNG decode (8-bit RGB/RGBA, no interlace) ----------
function readPNG(path) {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('not a PNG');
  let pos = 8, w, h, colorType, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      const bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0)
        throw new Error(`unsupported PNG: depth=${bitDepth} color=${colorType} interlace=${data[12]}`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let x = line[i];
      switch (filter) {
        case 0: break;
        case 1: x = (x + a) & 0xFF; break;
        case 2: x = (x + b) & 0xFF; break;
        case 3: x = (x + ((a + b) >> 1)) & 0xFF; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          x = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xFF; break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      cur[i] = x;
    }
    for (let px = 0; px < w; px++) {
      out[(y * w + px) * 4] = cur[px * bpp];
      out[(y * w + px) * 4 + 1] = cur[px * bpp + 1];
      out[(y * w + px) * 4 + 2] = cur[px * bpp + 2];
      out[(y * w + px) * 4 + 3] = bpp === 4 ? cur[px * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { w, h, rgba: out };
}

// ---------- PNG encode (RGBA, filter 0) ----------
function writePNG(path, w, h, rgba) {
  const chunks = [Buffer.from('\x89PNG\r\n\x1a\n', 'binary')];
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    chunks.push(len, body, crc);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  chunk('IHDR', ihdr);
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  chunk('IEND', Buffer.alloc(0));
  fs.writeFileSync(path, Buffer.concat(chunks));
}

// ---------- background removal ----------
function dist(rgba, i, r, g, b) {
  return Math.sqrt((rgba[i] - r) ** 2 + (rgba[i + 1] - g) ** 2 + (rgba[i + 2] - b) ** 2);
}
function cutout(img, thr) {
  const { w, h, rgba } = img;
  // sample bg color: average of 4 corners (5px in)
  let r = 0, g = 0, b = 0;
  for (const [cx, cy] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]]) {
    const i = (cy * w + cx) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2];
  }
  r /= 4; g /= 4; b /= 4;
  const removed = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (removed[p]) continue;
    if (dist(rgba, p * 4, r, g, b) >= thr) continue;
    removed[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (removed[p]) {
    rgba[p * 4] = 255; rgba[p * 4 + 1] = 255; rgba[p * 4 + 2] = 255; rgba[p * 4 + 3] = 0;
  }
  // feather: soften pixels adjacent to removed ones based on bg distance
  for (let p = 0; p < w * h; p++) {
    if (removed[p]) continue;
    const x = p % w, y = (p / w) | 0;
    const nearRemoved = (x > 0 && removed[p - 1]) || (x < w - 1 && removed[p + 1]) ||
      (y > 0 && removed[p - w]) || (y < h - 1 && removed[p + w]);
    if (nearRemoved) {
      const d = dist(rgba, p * 4, r, g, b);
      rgba[p * 4 + 3] = Math.min(255, Math.round(d * 2.2));
    }
  }
  const pct = (removed.reduce((s, v) => s + v, 0) / (w * h) * 100).toFixed(1);
  console.log(`bg=(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)}) thr=${thr} removed=${pct}%`);
}
function crop(img, x0, y0, cw, ch) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    img.rgba.copy(out, y * cw * 4, ((y0 + y) * img.w + x0) * 4, ((y0 + y) * img.w + x0 + cw) * 4);
  return { w: cw, h: ch, rgba: out };
}
function autocrop(img, margin) {
  const { w, h, rgba } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > 0) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return img;
  minX = Math.max(0, minX - margin); minY = Math.max(0, minY - margin);
  maxX = Math.min(w - 1, maxX + margin); maxY = Math.min(h - 1, maxY + margin);
  return crop(img, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

// ---------- main ----------
const [, , inPath, outPath, thrArg, cropArg] = process.argv;
const thr = Number(thrArg || 45);
let img = readPNG(inPath);
if (cropArg) {
  const [x, y, cw, ch] = cropArg.split(',').map(Number);
  img = crop(img, x, y, cw, ch);
}
cutout(img, thr);
img = autocrop(img, 6);
writePNG(outPath, img.w, img.h, img.rgba);
console.log(`wrote ${outPath} (${img.w}x${img.h})`);
