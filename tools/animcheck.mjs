#!/usr/bin/env node
// THE ORACLE. The only reason the fast animation path is allowed to exist.
//
// `src/core/anim.js` builds a loop by having each shader emit all K frames'
// values while it computes frame 0's, then filtering the record against the
// finished canvas. That is a few per cent of a render instead of seven hundred,
// and it is also a pile of assumptions about what a later pass might have drawn
// over, what the silhouette sweep blackened, and which of two passes owns a
// pixel they both claimed.
//
// This tool does not reason about any of that. It renders the WHOLE SCENE, from
// the seed, at frame k — the slow, obviously-correct way — for every k, and
// asserts the loop reproduces those pixels exactly. A single differing pixel is
// a failure and it prints where.
//
// This is the habit `docs/BAR.md` calls the most valuable thing the loop has
// built: `Canvas.putZ` writing to a fractional index went undiagnosed across
// three rounds and eight judges because nobody counted the blits. INSTRUMENT
// BEFORE BELIEVING. A fast path that is merely plausible is not a fast path.
//
// It also checks the two laws the whole scheme rests on:
//
//   THE FRAME INDEX MAY NOT MOVE A RANDOM DRAW. If it did, frame 2 would be a
//   different scene rather than the same scene two frames later, and the
//   difference would be most of the canvas. Caught here as a diff far larger
//   than the loop's own union.
//
//   THE LOOP MUST CLOSE. Frame K is frame 0 by construction — every animated
//   quantity is periodic in `phase(k) = k / FRAMES` — so a render at frame K
//   must be byte-identical to a render at frame 0. A loop that drifts is a
//   visible restart on every repeat, and it is exactly the failure a gate at
//   frame 0 alone cannot see.
//
// Usage: node tools/animcheck.mjs [--seeds 6] [--w 440 --h 1000] [--biome shore]

import { renderScene } from '../src/gen/scene.js';
import { FRAMES } from '../src/core/frame.js';
import { Rng } from '../src/core/rng.js';
import { treeHash } from './treehash.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const N = Number(arg('seeds', 6));
const W = Number(arg('w', 440));
const H = Number(arg('h', 1000));
const BIOME = arg('biome', undefined);
const K = Number(arg('frames', FRAMES));

const TREE = treeHash().digest;
console.log(`tree ${TREE}   ${W}x${H}   frames ${K}${BIOME ? `   biome ${BIOME}` : ''}\n`);

const st = new Rng('fixel-anim').stream('seeds');
const seeds = [];
for (let i = 0; i < N; i++) seeds.push(`anim-${st.int(0, 0x7fffffff).toString(36)}`);

let bad = 0;
const rows = [];

for (const seed of seeds) {
  const o = { w: W, h: H, frames: K };
  if (BIOME) o.biome = BIOME;

  const t0 = process.hrtime.bigint();
  const base = renderScene(seed, { ...o, frame: 0 });
  const tFast = Number(process.hrtime.bigint() - t0) / 1e6;
  const loop = base.anim;

  // Reconstruct every frame from the loop, then render the same frame the slow
  // way and compare. `plane` is reused so this measures the generator, not the
  // allocator.
  const plane = new Uint16Array(base.idx.length);
  let mism = 0, firstAt = -1, mismFrames = 0;
  let tSlow = 0;
  for (let k = 0; k < K; k++) {
    plane.set(base.idx);
    for (let i = 0; i < loop.n; i++) plane[loop.off[i]] = loop.val[k * loop.n + i];
    const t1 = process.hrtime.bigint();
    const full = renderScene(seed, { ...o, frame: k });
    tSlow += Number(process.hrtime.bigint() - t1) / 1e6;
    let d = 0;
    for (let i = 0; i < plane.length; i++) {
      if (plane[i] !== full.idx[i]) { d++; if (firstAt < 0) firstAt = i; }
    }
    if (d) { mism += d; mismFrames++; }
    if (full.pal.size !== base.pal.size) {
      console.log(`  ${seed}: PALETTE MOVED at frame ${k} (${base.pal.size} -> ${full.pal.size}) ` +
        `— the frame index changed a random draw, which is the one thing it may never do`);
      bad++;
    }
  }

  // Loop closure: frame K must be frame 0.
  const wrap = renderScene(seed, { ...o, frame: K });
  let wd = 0;
  for (let i = 0; i < wrap.idx.length; i++) if (wrap.idx[i] !== base.idx[i]) wd++;

  const px = W * H;
  const ok = mism === 0 && wd === 0;
  if (!ok) bad++;
  rows.push({
    seed, n: loop.n, share: (100 * loop.n / px).toFixed(2),
    dropped: loop.dropped, flat: loop.flat, shadowed: loop.shadowed,
    mism, mismFrames, firstAt, wd, tFast, tSlow, ok,
  });
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${seed.padEnd(16)} animated ${String(loop.n).padStart(7)} px ` +
    `(${String((100 * loop.n / px).toFixed(2)).padStart(5)}%)  ` +
    `dropped ${String(loop.dropped).padStart(6)}  shadowed ${String(loop.shadowed ?? 0).padStart(5)}  ` +
    `mismatch ${String(mism).padStart(6)}${mism ? ` @${firstAt % W},${(firstAt / W) | 0}` : ''}  ` +
    `wrap ${wd}  fast ${tFast.toFixed(0)}ms vs full-loop ${tSlow.toFixed(0)}ms`);
}

const tot = rows.reduce((a, r) => a + r.n, 0) / rows.length;
const shares = rows.map((r) => Number(r.share)).sort((a, b) => a - b);
const fast = rows.reduce((a, r) => a + r.tFast, 0) / rows.length;
const slow = rows.reduce((a, r) => a + r.tSlow, 0) / rows.length;
console.log(`\nanimated pixels: mean ${tot.toFixed(0)}  range ${shares[0]}%-${shares[shares.length - 1]}% of frame`);
console.log(`cost: fast path ${fast.toFixed(0)}ms for the whole loop, against ${slow.toFixed(0)}ms to render it frame by frame ` +
  `(${(slow / Math.max(fast, 0.001)).toFixed(1)}x)`);

const after = treeHash().digest;
if (after !== TREE) { console.error(`\nTORN RUN: tree moved ${TREE} -> ${after}. Void.`); process.exit(2); }
if (bad) { console.error(`\nANIMCHECK FAILED on ${bad} seed(s)`); process.exit(1); }
console.log(`\nANIMCHECK OK   tree ${after}`);
