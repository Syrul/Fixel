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
// --biome OVERRIDES THE SEED'S OWN DRAW, AND IS A MEASUREMENT TOOL ONLY.
//
// The feed picks the biome from the seed; forcing one here renders a picture the
// feed would never show for that seed. That is exactly what you want for
// characterising one biome across many seeds, and exactly what you must not do
// for a duel — see the redraw filter in `tools/duel.mjs`, which finds a seed
// whose OWN biome is a city rather than forcing a city onto a desert's seed.
// Left off, this file behaves as it always has.
const biome = arg('biome', undefined);

// --frame / --frames: WHICH picture of the loop, and how many there are.
//
// Left off, `frames` is 1 and the animation path is provably inert — no
// recorder, no allocation, not a branch inside a shader — so every digest,
// every metric run and every duel crop this repo has ever recorded still
// renders the same bytes. `docs/OWNERSHIP.md` rule 2 depends on that: a metric
// without a tree digest is not evidence, and a tree whose default output moved
// under a feature nobody asked to enable would invalidate all of them at once.
const frames = parseInt(arg('frames', '1'), 10);
const frame = parseInt(arg('frame', '0'), 10);
// Amplitude gain, the `?anim=` knob. A render parameter like --w, never part of
// the seed: the same seed at a different gain is the same post drawn softer.
const gain = parseFloat(arg('gain', '1'));

const t0 = Date.now();
const cv = renderScene(seed, {
  w, h, frames, frame, gain,
  ...(biome ? { biome } : {}),
});
const ms = Date.now() - t0;
mkdirSync(dirname(out), { recursive: true });
writePNG(out, cv.w, cv.h, cv.toRGBA());
process.stderr.write(
  `seed=${seed}${biome ? ` biome=${biome}` : ''} ${cv.w}x${cv.h} palette=${cv.pal.size}` +
  `${frames > 1 ? ` frame=${frame}/${frames} gain=${gain} anim=${cv.anim ? cv.anim.n : 0}px` : ''} ${ms}ms -> ${out}\n`);
