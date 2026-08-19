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

// The share of moving pixels allowed to live in islands of 1-2 px. A design in
// which independent pixels flip puts nearly all of its mass here; coherent
// regional motion puts almost none. Set where it separates those two
// categorically rather than where it flatters anything — it is a floor.
const SPECK_MAX = Number(arg('speck-max', 0.25));

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

  // ---- WHY PIXELS WERE DROPPED, AND THE ONE QUESTION THE ORACLE CANNOT ASK --
  //
  // The oracle above proves the fast path equals a full re-render. It cannot
  // prove the picture is right, and there is a specific way both can be wrong
  // together: if the animated thing is DRAWN AND THEN PAINTED OVER, the fast
  // path drops those pixels and the slow path never shows them either. Both
  // agree, both are gates-green, and the animation is quietly more subtle than
  // it was designed to be. A matching oracle is not a correct picture.
  //
  // So the drop total is broken into its reasons, and the one reason that is
  // CORRECT BY DESIGN is separated from the two that are not:
  //
  //   dropInk   the silhouette sweep blackened it. This is the intended
  //             behaviour and the reason animation cannot regress ink closure:
  //             ink is immovable by construction, not by anyone's care.
  //   dropTag   a later object covered it. Genuinely invisible — but if this is
  //             large, the animated surface is being buried under props and the
  //             fix is upstream, not in the recorder.
  //   dropSame  overdrawn by its own kind, same tag, different index. Usually
  //             means a pass is shading the same pixel twice, which is pure
  //             waste.
  //
  // And the direct experiment for the disjunction: render again with the
  // silhouette sweep OFF and compare the surviving union. If n jumps, motion is
  // being buried under ink rather than over-recorded.
  const noInk = renderScene(seed, { ...o, frame: 0, noOut: true });
  const nNoInk = noInk.anim ? noInk.anim.n : 0;

  // Loop closure: frame K must be frame 0.
  const wrap = renderScene(seed, { ...o, frame: K });
  let wd = 0;
  for (let i = 0; i < wrap.idx.length; i++) if (wrap.idx[i] !== base.idx[i]) wd++;

  // ---- THE SHAPE OF THE MOTION, WHICH IS A GATE AND NOT A REPORT LINE -------
  //
  // NOTHING MAY TWINKLE. This is a do-not-ship rule, not a preference, and it
  // is here rather than in a builder's report because a rule that is only
  // checked by reading a report is a rule that erodes.
  //
  // The one genuinely pixel-scale element in either reference video is a
  // speckle sphere that re-randomises every frame: spatial autocorrelation
  // lag-1 of 0.341, which is pure per-pixel white noise, with no translation
  // explaining any of it. Per-pixel noise animation is the worst thing this
  // project could ship. It would also read as dithering, which `docs/BAR.md`
  // records as absent from every reference at a 2x2 checkerboard rate of
  // 1.7-2.1%, and it manufactures orphan 1px islands, which are already at the
  // ceiling on desert and highland.
  //
  // So: take the mask of pixels that EVER move, 4-connect it, and ask how much
  // of the motion lives in islands too small to be anything. Independent
  // per-pixel flipping puts nearly all of its mass there. Coherent regional
  // motion — a stretch of swell surging, a canopy clump leaning a pixel — puts
  // almost none.
  //
  // IT IS A FLOOR, NEVER A SCORE, which is this repo's standing rule about
  // every count in it. It rejects noise. It does not rank two designs that both
  // clear it, and a lower speck share is not "better" — the duel is the bar.
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < loop.n; i++) mask[loop.off[i]] = 1;
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(loop.n + 1);
  const sizes = [];
  for (let i = 0; i < loop.n; i++) {
    const s0 = loop.off[i];
    if (seen[s0]) continue;
    let sp = 0, sz = 0;
    stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const q = stack[--sp]; sz++;
      const x = q % W, y = (q / W) | 0;
      if (x > 0 && mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[sp++] = q - 1; }
      if (x + 1 < W && mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[sp++] = q + 1; }
      if (y > 0 && mask[q - W] && !seen[q - W]) { seen[q - W] = 1; stack[sp++] = q - W; }
      if (y + 1 < H && mask[q + W] && !seen[q + W]) { seen[q + W] = 1; stack[sp++] = q + W; }
    }
    sizes.push(sz);
  }
  sizes.sort((a, b) => b - a);
  let speck = 0;
  for (const s of sizes) if (s <= 2) speck += s;
  const speckShare = loop.n ? speck / loop.n : 0;
  const big = sizes.slice(0, 3).reduce((a, b) => a + b, 0);
  const bigShare = loop.n ? big / loop.n : 0;
  const p = (f) => sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor((1 - f) * sizes.length))] : 0;
  const twinkles = loop.n > 0 && speckShare > SPECK_MAX;

  const px = W * H;
  const ok = mism === 0 && wd === 0 && !twinkles;
  if (!ok) bad++;
  rows.push({
    seed, n: loop.n, share: 100 * loop.n / px,
    dropped: loop.dropped, flat: loop.flat, shadowed: loop.shadowed,
    mism, mismFrames, firstAt, wd, tFast, tSlow, ok,
    islands: sizes.length, largest: sizes[0] || 0, p50: p(0.5), p90: p(0.9),
    speckShare, bigShare, twinkles, nNoInk,
    dropInk: loop.dropInk, dropTag: loop.dropTag, dropSame: loop.dropSame,
  });
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${seed.padEnd(16)} animated ${String(loop.n).padStart(7)} px ` +
    `(${String((100 * loop.n / px).toFixed(2)).padStart(5)}%)  ` +
    `dropped ${String(loop.dropped).padStart(6)}  ` +
    `mismatch ${String(mism).padStart(6)}${mism ? ` @${firstAt % W},${(firstAt / W) | 0}` : ''}  ` +
    `wrap ${wd}  ${tFast.toFixed(0)}ms vs ${tSlow.toFixed(0)}ms`);
  console.log(
    `      kept ${String(loop.n).padStart(7)}  flat ${String(loop.flat).padStart(7)}  ` +
    `dropped ${String(loop.dropped).padStart(6)} = ink ${loop.dropInk} + covered ${loop.dropTag} + overdrawn ${loop.dropSame}   ` +
    `sweep off -> n ${nNoInk} (${loop.n ? ((nNoInk / loop.n - 1) * 100).toFixed(0) : '0'}%)`);
  console.log(
    `      islands ${String(sizes.length).padStart(6)}  largest ${String(sizes[0] || 0).padStart(6)}  ` +
    `p50 ${String(p(0.5)).padStart(5)}  p90 ${String(p(0.9)).padStart(5)}  ` +
    `in 1-2px specks ${(100 * speckShare).toFixed(1)}%${twinkles ? '  <-- TWINKLES' : ''}  ` +
    `in largest 3 ${(100 * bigShare).toFixed(1)}%`);
}

const tot = rows.reduce((a, r) => a + r.n, 0) / rows.length;
const shares = rows.map((r) => r.share).sort((a, b) => a - b);
const specks = rows.map((r) => r.speckShare).sort((a, b) => a - b);
const p50s = rows.map((r) => r.p50).sort((a, b) => a - b);
const twinkling = rows.filter((r) => r.twinkles).length;
const fast = rows.reduce((a, r) => a + r.tFast, 0) / rows.length;
const slow = rows.reduce((a, r) => a + r.tSlow, 0) / rows.length;
console.log(`\nanimated pixels: mean ${tot.toFixed(0)}  range ${shares[0].toFixed(2)}%-${shares[shares.length - 1].toFixed(2)}% of frame`);
console.log(`motion shape:    island p50 ${p50s[0]}-${p50s[p50s.length - 1]} px, ` +
  `${(100 * specks[0]).toFixed(1)}-${(100 * specks[specks.length - 1]).toFixed(1)}% of moving pixels in 1-2px specks ` +
  `(ceiling ${(100 * SPECK_MAX).toFixed(0)}%) — a FLOOR that rejects per-pixel noise, never a score`);
console.log(`cost: fast path ${fast.toFixed(0)}ms for the whole loop, against ${slow.toFixed(0)}ms to render it frame by frame ` +
  `(${(slow / Math.max(fast, 0.001)).toFixed(1)}x)`);
{
  const kept = rows.reduce((a, r) => a + r.n, 0);
  const dInk = rows.reduce((a, r) => a + (r.dropInk || 0), 0);
  const dTag = rows.reduce((a, r) => a + (r.dropTag || 0), 0);
  const dSame = rows.reduce((a, r) => a + (r.dropSame || 0), 0);
  const noInk = rows.reduce((a, r) => a + (r.nNoInk || 0), 0);
  console.log(`drops:  ink ${dInk}  covered ${dTag}  overdrawn ${dSame}   against ${kept} kept`);
  console.log(`buried? with the silhouette sweep OFF the union is ${noInk} against ${kept} ` +
    `(${kept ? ((noInk / kept - 1) * 100).toFixed(0) : 0}%). A large jump means motion is being ` +
    `buried under ink, not over-recorded — and it is the one failure the oracle above cannot see.`);
}

const after = treeHash().digest;
if (after !== TREE) { console.error(`\nTORN RUN: tree moved ${TREE} -> ${after}. Void.`); process.exit(2); }
if (bad) {
  console.error(`\nANIMCHECK FAILED on ${bad} seed(s)` +
    (twinkling ? ` — ${twinkling} of them TWINKLE: the motion is independent pixels flipping, ` +
      `not a region moving. Shrinking the amplitude will not fix this; the design is wrong.` : ''));
  process.exit(1);
}
console.log(`\nANIMCHECK OK   tree ${after}`);
