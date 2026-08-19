#!/usr/bin/env node
// Native-scale crop utility, for looking at pixels.
//
// Exists because every "let me just check the output" script anyone writes
// eventually grows a resize call, and one resize anywhere in this repo makes
// the whole pixel argument unfalsifiable. There is exactly one crop path
// (src/core/png.js) and it cannot scale.
//
// The --zoom flag magnifies by INTEGER nearest-neighbour replication only, for
// inspecting edges by eye. A zoomed image is for looking at; it must never be
// measured, duelled or shipped, so it is written with a `.zoom` in the name to
// make an accident obvious.
//
// Usage:
//   node tools/crop.mjs <in.png> --x 300 --y 260 --size 320 --out out/look.png
//   node tools/crop.mjs <in.png> --grid 3 --size 320 --out out/look   (9 crops)
//   node tools/crop.mjs <in.png> --x 300 --y 260 --size 96 --zoom 6 --out out/e.png

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readPNG, writePNG, crop } from '../src/core/png.js';

const a = {};
for (let i = 2; i < process.argv.length; i++) {
  const v = process.argv[i];
  if (v.startsWith('--')) {
    const n = process.argv[i + 1];
    a[v.slice(2)] = n === undefined || n.startsWith('--') ? true : (i++, n);
  } else if (!a._) a._ = v;
}

const img = readPNG(a._);
const SIZE = Number(a.size ?? 320);
const OUT = String(a.out ?? 'out/crop.png');
const ZOOM = Number(a.zoom ?? 1);

function zoomed(c, k) {
  if (k <= 1) return c;
  const w = c.w * k, h = c.h * k;
  const d = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < w; x++) {
      const sx = (x / k) | 0;
      c.data.copy(d, (y * w + x) * 4, (sy * c.w + sx) * 4, (sy * c.w + sx) * 4 + 4);
    }
  }
  return { w, h, data: d };
}

function emit(c, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const z = zoomed(c, ZOOM);
  const f = ZOOM > 1 ? file.replace(/\.png$/, `.zoom${ZOOM}.png`) : file;
  writePNG(f, z.w, z.h, z.data);
  console.log(`${f}  ${z.w}x${z.h}`);
}

if (a.grid) {
  const n = Number(a.grid);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = Math.round((img.w - SIZE) * (n === 1 ? 0.5 : i / (n - 1)));
      const y = Math.round((img.h - SIZE) * (n === 1 ? 0.5 : j / (n - 1)));
      emit(crop(img, x, y, SIZE, SIZE), `${OUT}-${j}${i}.png`);
    }
  }
} else {
  const x = Number(a.x ?? Math.floor((img.w - SIZE) / 2));
  const y = Number(a.y ?? Math.floor((img.h - SIZE) / 2));
  emit(crop(img, x, y, SIZE, SIZE), OUT);
}
