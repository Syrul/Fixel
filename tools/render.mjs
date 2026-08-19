#!/usr/bin/env node
// node tools/render.mjs --seed <string> --out out/scene.png [--w 1600 --h 1100]
//
// Deterministic: the same seed produces a byte-identical PNG across processes.

import { renderScene } from '../src/gen/scene.js';
import { writePNG } from '../src/core/png.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}

const seed = arg('seed', 'fixel-0');
const out = arg('out', 'out/scene.png');
const w = parseInt(arg('w', '1600'), 10);
const h = parseInt(arg('h', '1100'), 10);

const t0 = Date.now();
const cv = renderScene(seed, { w, h });
const ms = Date.now() - t0;
mkdirSync(dirname(out), { recursive: true });
writePNG(out, cv.w, cv.h, cv.toRGBA());
process.stderr.write(`seed=${seed} ${cv.w}x${cv.h} palette=${cv.pal.size} ${ms}ms -> ${out}\n`);
