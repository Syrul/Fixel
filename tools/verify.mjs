#!/usr/bin/env node
// Cross-process determinism gate.
//
// Cribbed from slopscroll/tools/verify.mjs. The reason it renders in CHILD
// PROCESSES rather than calling renderScene twice in one process is that
// in-process re-rendering hides the whole interesting class of bugs: module
// top-level state, a Map iteration order that depends on insertion history, a
// cached palette that survives between calls. Those all reproduce perfectly
// within one process and diverge across two.
//
// Determinism is not a nicety here. The duel picks the post seed from the
// round seed, and the live page must show the same seeds every round. If a
// seed does not reproduce byte-for-byte, the round is not repeatable and the
// win-loss record means nothing.
//
// ANIMATION MAKES THE OUTPUT A FUNCTION OF (SEED, FRAME), AND A GATE AT FRAME 0
// CANNOT SEE HALF OF IT.
//
// A generator that is byte-identical at frame 0 and drifts at frame 40 passes
// every check this file made before `--frames` existed. Three ways it could
// drift, all of them plausible and none of them visible at frame 0:
//
//   * a clock leaking into an animated quantity — the failure slopscroll banned
//     `performance.now()` outright to prevent;
//   * a phase accumulated across frames rather than computed from the index, so
//     floating-point error compounds and frame 40 is not frame 0;
//   * an animated quantity that is not periodic in `phase(k)`, so the loop does
//     not close and every repeat shows a visible restart.
//
// So `--frames K` renders at frame 0, at frames inside the loop, at frame K and
// at frame 40 — twice each, in separate processes — and asserts four things:
//
//   1. every frame is byte-identical across processes (determinism);
//   2. frame K is byte-identical to frame 0 (THE LOOP CLOSES);
//   3. frame 40 is byte-identical to frame 40 mod K (no accumulated drift);
//   4. some frame in the loop DIFFERS from frame 0 (the animation exists).
//
// The fourth matters as much as the first three. Every one of the others is
// satisfied perfectly by an animation that does nothing, and "deterministic,
// closed, drift-free and completely still" is the single easiest thing to ship
// by accident.
//
// Usage: node tools/verify.mjs [--seeds 6] [--w 800 --h 560] [--frames 8]

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Rng } from '../src/core/rng.js';
import { pickBiome } from '../src/gen/biome-mix.js';
import { treeHash } from './treehash.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1]]);
  return a;
}, []));

const N = Number(args.seeds ?? 6);
const W = Number(args.w ?? 800);
const H = Number(args.h ?? 560);
const K = Number(args.frames ?? 1);
const BIOME = typeof args.biome === 'string' ? args.biome : null;
const TMP = path.join(REPO, 'out', '.verify');

// WHICH FRAMES, AND WHY THESE. 0 is the base every measurement in this repo was
// taken at. 1 is the first step, where a shader that forgot to be periodic will
// already be wrong. K-1 is the last frame before the wrap. K must equal 0. 40
// is deliberately far outside the loop and deliberately NOT a multiple of 8:
// with FRAMES at 8 it lands on frame 0, and with any other loop length it lands
// somewhere the arithmetic still has to agree about. It is the frame the brief
// named, and it is the one an accumulated phase gets wrong.
const FRAME_SET = K > 1
  ? [...new Set([0, 1, K - 1, K, 40])].sort((a, b) => a - b)
  : [0];

function sha(f) { return createHash('sha256').update(readFileSync(f)).digest('hex'); }

/**
 * A CHILD THAT CRASHES IS NOT AUTOMATICALLY A BUG IN THE GENERATOR.
 *
 * The digest bracket below catches a torn tree by comparing before and after —
 * but it only runs if this file SURVIVES to compare. A builder saving a module
 * mid-run leaves a half-written file on disk, the child fails to import it, and
 * `execFileSync` throws. Before this guard existed the exception propagated
 * uncaught and the run died printing an ESM stack trace, which reads as a code
 * bug in somebody's generator rather than as the race it is.
 *
 * That happened, was briefly diagnosed as a real import failure, and passed on
 * a re-run once the tree went quiet. **A guard that misreports its own failure
 * mode as somebody else's bug is standing rule 11's category**, and it is worse
 * than the bug it hides because it sends the next reader to the wrong file.
 *
 * So a child failure re-checks the digest FIRST and answers the only question
 * that matters: did the ground move under us, or is this real?
 */
function bail(err, seed, frame) {
  const after = treeHash().digest;
  rmSync(TMP, { recursive: true, force: true });
  if (after !== TREE_BEFORE) {
    console.error(`\nTORN RUN: a render child failed AND the source tree moved during verification`);
    console.error(`  ${TREE_BEFORE} -> ${after}`);
    console.error(`  (child was seed ${seed}, frame ${frame})`);
    console.error('A half-written module does not import. THIS RESULT IS VOID, NOT A FAILURE —');
    console.error('do not go looking for a bug in the generator. Serialise writers, then re-run.');
    process.exit(2);
  }
  console.error(`\nVERIFY FAILED: a render child exited non-zero while the tree was STABLE.`);
  console.error(`  tree ${TREE_BEFORE} before and after, so this is NOT a race — it is real.`);
  console.error(`  child was seed ${seed}, frame ${frame}`);
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}

function render(seed, out, frame) {
  const a = [
    path.join(REPO, 'tools/render.mjs'),
    '--seed', seed, '--out', out, '--w', String(W), '--h', String(H),
  ];
  if (K > 1) a.push('--frames', String(K), '--frame', String(frame));
  if (BIOME) a.push('--biome', BIOME);
  try {
    execFileSync('node', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (e) {
    bail(e, seed, frame);
  }
}

// The tree digest brackets the whole run. If it moves, this gate proves
// nothing: a "nondeterministic render" and "someone edited the generator while
// we measured" are indistinguishable from the pixels alone, and only one of
// them is a bug in the generator. This cost us half an hour of measurements
// once; it does not get to happen twice.
const TREE_BEFORE = treeHash().digest;
console.log(`tree ${TREE_BEFORE}\n`);

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const st = new Rng('fixel-verify').stream('seeds');
let bad = 0, unclosed = 0, drifted = 0, still = 0, movers = 0;
const seeds = [];
for (let i = 0; i < N; i++) {
  const seed = `verify-${st.int(0, 0x7fffffff).toString(36)}`;
  seeds.push(seed);
  const h = new Map();                   // frame -> hash
  let seedBad = 0;
  for (const f of FRAME_SET) {
    const a = path.join(TMP, `a${i}f${f}.png`), b = path.join(TMP, `b${i}f${f}.png`);
    render(seed, a, f);
    render(seed, b, f);                  // separate process, deliberately
    const ha = sha(a), hb = sha(b);
    if (ha !== hb) { seedBad++; console.log(`FAIL  ${seed}  frame ${f}  ${ha.slice(0, 16)} != ${hb.slice(0, 16)}`); }
    h.set(f, ha);
  }
  if (seedBad) bad++;

  let note = '';
  if (K > 1) {
    // 2. The loop closes. Frame K is frame 0.
    if (h.get(K) !== h.get(0)) { unclosed++; note += '  LOOP DOES NOT CLOSE'; }
    // 3. No accumulated drift, 40 frames out.
    if (h.get(40) !== h.get(40 % K)) { drifted++; note += `  FRAME 40 != FRAME ${40 % K}`; }
    // 4. Something actually moves. A still loop satisfies every other check.
    //
    // EVERY SEED MUST MOVE, unconditionally.
    //
    // This was briefly weakened to "strict only when a biome is named", because
    // three of four biomes did not animate yet and a mixed run failing with
    // "NOTHING MOVES" was a gate reporting the feed's composition rather than a
    // defect. The weakening was written with its expiry attached: once every
    // biome animates, drop the branch. All four animate, so it is dropped. A
    // gate that quietly stopped checking is worse than no gate.
    const moved = FRAME_SET.some((f) => f % K !== 0 && h.get(f) !== h.get(0));
    if (moved) movers++; else { still++; note += '  NOTHING MOVES'; }
  }
  const bio = BIOME || pickBiome(seed);
  console.log(`${seedBad || note ? 'FAIL' : 'ok  '}  ${seed}  ${h.get(0).slice(0, 16)}` +
    (K > 1 ? `  ${bio.padEnd(8)} ${FRAME_SET.some((f) => f % K !== 0 && h.get(f) !== h.get(0)) ? 'moves' : 'still'}` : '') + note);
}

// A generator that emits the same bytes for DIFFERENT seeds is broken in the
// opposite direction and would sail through the check above.
const distinct = new Set();
for (let i = 0; i < N; i++) distinct.add(sha(path.join(TMP, `a${i}f0.png`)));
const collided = N - distinct.size;

const TREE_AFTER = treeHash().digest;
if (TREE_AFTER !== TREE_BEFORE) {
  console.error(`\nTORN RUN: source tree changed during verification (${TREE_BEFORE} -> ${TREE_AFTER}).`);
  console.error('This result is void. Serialise writers, then re-run.');
  rmSync(TMP, { recursive: true, force: true });
  process.exit(2);
}

console.log(`\ndeterminism: ${N - bad}/${N} byte-identical across processes` +
  (K > 1 ? ` at frames ${FRAME_SET.join(',')}` : ''));
console.log(`distinctness: ${distinct.size}/${N} distinct seeds gave distinct pixels`);
if (K > 1) {
  console.log(`loop closure: ${N - unclosed}/${N} frame ${K} === frame 0`);
  console.log(`no drift:     ${N - drifted}/${N} frame 40 === frame ${40 % K}`);
  console.log(`motion:       ${movers}/${N} seeds have a frame differing from frame 0 (all required)`);
}
rmSync(TMP, { recursive: true, force: true });

const noneMoved = K > 1 && movers === 0;
if (bad || collided || unclosed || drifted || still || noneMoved) {
  console.error(
    bad ? 'VERIFY FAILED: nondeterministic render'
      : collided ? 'VERIFY FAILED: seeds collide'
        : unclosed ? 'VERIFY FAILED: the loop does not close — every repeat shows a restart'
          : drifted ? 'VERIFY FAILED: the loop drifts — a phase is accumulating instead of being indexed'
            : 'VERIFY FAILED: nothing moves — a still loop passes every other check here');
  process.exit(1);
}
console.log(`VERIFY OK   tree ${TREE_AFTER}`);
