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
// Usage: node tools/verify.mjs [--seeds 6] [--w 800 --h 560]

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Rng } from '../src/core/rng.js';
import { treeHash } from './treehash.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1]]);
  return a;
}, []));

const N = Number(args.seeds ?? 6);
const W = Number(args.w ?? 800);
const H = Number(args.h ?? 560);
const TMP = path.join(REPO, 'out', '.verify');

function sha(f) { return createHash('sha256').update(readFileSync(f)).digest('hex'); }

function render(seed, out) {
  execFileSync('node', [
    path.join(REPO, 'tools/render.mjs'),
    '--seed', seed, '--out', out, '--w', String(W), '--h', String(H),
  ], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
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
let bad = 0;
for (let i = 0; i < N; i++) {
  const seed = `verify-${st.int(0, 0x7fffffff).toString(36)}`;
  const a = path.join(TMP, `a${i}.png`), b = path.join(TMP, `b${i}.png`);
  render(seed, a);
  render(seed, b);                       // separate process, deliberately
  const ha = sha(a), hb = sha(b);
  const ok = ha === hb;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${seed}  ${ha.slice(0, 16)}  ${hb.slice(0, 16)}`);
}

// A generator that emits the same bytes for DIFFERENT seeds is broken in the
// opposite direction and would sail through the check above.
const distinct = new Set();
for (let i = 0; i < N; i++) distinct.add(sha(path.join(TMP, `a${i}.png`)));
const collided = N - distinct.size;

const TREE_AFTER = treeHash().digest;
if (TREE_AFTER !== TREE_BEFORE) {
  console.error(`\nTORN RUN: source tree changed during verification (${TREE_BEFORE} -> ${TREE_AFTER}).`);
  console.error('This result is void. Serialise writers, then re-run.');
  rmSync(TMP, { recursive: true, force: true });
  process.exit(2);
}

console.log(`\ndeterminism: ${N - bad}/${N} byte-identical across processes`);
console.log(`distinctness: ${distinct.size}/${N} distinct seeds gave distinct pixels`);
rmSync(TMP, { recursive: true, force: true });

if (bad || collided) {
  console.error(bad ? 'VERIFY FAILED: nondeterministic render' : 'VERIFY FAILED: seeds collide');
  process.exit(1);
}
console.log(`VERIFY OK   tree ${TREE_AFTER}`);
