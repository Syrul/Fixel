#!/usr/bin/env node
// The two numbers that decide round 3, and which none of the 60 band metrics see.
//
// They exist as ONE shared script for the same reason tools/metrics.mjs does:
// three agents independently found these defects, and if each implements its
// own version we will spend the round arguing about definitions instead of
// fixing the generator.
//
//   1. COLOUR RADIUS OF GYRATION — is a colour confined to the object it
//      belongs to, or smeared across the frame? In the reference a colour
//      MEANS something: green is a lawn, orange is a pylon, sand is a beach.
//      Reference ~20.5px, generator ~58.8px. One global ramp vs local
//      material commitment. This is the load-bearing fix: the variety gate
//      found seed-to-seed structure already differs (0.98-1.11, essentially
//      unrelated compositions) while palettes do not, so colour is the entire
//      binding constraint on variety AND the critic's top craft complaint.
//
//   2. INK CLOSURE RATIO — flat faces per ink-enclosed cell. Reference 2.94,
//      generator 8.25. The ink BUDGET is already right (14.12% vs 14.74%) and
//      the flat-face SIZE distribution is already right (median 38 vs 42px).
//      What is wrong is TOPOLOGY: long lattice-aligned strokes instead of
//      closed small loops. So the fix is to REDISTRIBUTE ink, never to add it
//      — adding ink that does not close a loop measurably worsened three
//      metrics last round.
//
// Usage:
//   node tools/colour.mjs <file.png> [--crop x,y,size]
//   node tools/colour.mjs --compare <ours.png> <ref.png> [--size 320] [--seed s] [--crops 9]

import path from 'node:path';
import { readPNG, crop } from '../src/core/png.js';
import { Rng } from '../src/core/rng.js';
import { treeHash } from './treehash.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const LUMA_INK = 50;      // near-black threshold, same as the outline metrics
const MIN_COLOUR_PX = 12; // ignore colours too rare to have a meaningful centroid
const MIN_FACE_PX = 8;    // a "flat face" must be big enough to read as a surface
const MIN_CELL_PX = 4;

function lumaOf(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

/** key each pixel by packed RGB; alpha is forced opaque everywhere in Fixel */
function keyed(img) {
  const { w, h, data } = img;
  const k = new Int32Array(w * h);
  const ink = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < k.length; i++, p += 4) {
    k[i] = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    ink[i] = lumaOf(data[p], data[p + 1], data[p + 2]) < LUMA_INK ? 1 : 0;
  }
  return { w, h, k, ink };
}

/**
 * Radius of gyration per colour: RMS distance of a colour's pixels from that
 * colour's own centroid. Small = the colour lives on one object. Large = it is
 * sprayed across the frame.
 *
 * Reported as the median over colours, and as the PIXEL-WEIGHTED median (the
 * value for the colour the median pixel belongs to). The weighted one is what
 * the eye reads, for the same reason the connected-region metric needed it:
 * unweighted medians are dominated by rare colours.
 */
function radiusOfGyration({ w, h, k }) {
  const n = new Map(), sx = new Map(), sy = new Map(), sxx = new Map();
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const c = k[i];
      n.set(c, (n.get(c) || 0) + 1);
      sx.set(c, (sx.get(c) || 0) + x);
      sy.set(c, (sy.get(c) || 0) + y);
      sxx.set(c, (sxx.get(c) || 0) + x * x + y * y);
    }
  }
  const rows = [];
  for (const [c, cnt] of n) {
    if (cnt < MIN_COLOUR_PX) continue;
    const mx = sx.get(c) / cnt, my = sy.get(c) / cnt;
    const varSum = sxx.get(c) / cnt - (mx * mx + my * my);
    rows.push({ rg: Math.sqrt(Math.max(0, varSum)), cnt });
  }
  rows.sort((a, b) => a.rg - b.rg);
  const med = rows.length ? rows[Math.floor(rows.length / 2)].rg : NaN;
  const total = rows.reduce((s, r) => s + r.cnt, 0);
  let acc = 0, wmed = NaN;
  for (const r of rows) { acc += r.cnt; if (acc >= total / 2) { wmed = r.rg; break; } }
  // Also: how localised is the typical colour, as a fraction of frame size?
  return { colours: rows.length, medianRg: med, pixelWeightedRg: wmed,
           rgOverFrame: wmed / Math.max(w, h) };
}

/** 4-connected component sizes over a predicate, returned as a count. */
function components({ w, h }, sameFn, minPx) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !sameFn.valid(s)) continue;
    let sp = 0; stack[sp++] = s; seen[s] = 1; let size = 0;
    while (sp) {
      const p = stack[--sp]; size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !seen[p - 1] && sameFn.link(p, p - 1)) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && !seen[p + 1] && sameFn.link(p, p + 1)) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && !seen[p - w] && sameFn.link(p, p - w)) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && !seen[p + w] && sameFn.link(p, p + w)) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (size >= minPx) count++;
  }
  return count;
}

/**
 * Ink closure: how many flat faces exist per region that ink actually encloses.
 *
 * A cell is a connected run of NON-ink pixels — the thing an outline loop
 * contains. A flat face is a connected run of one colour. If ink closes small
 * loops around objects, each cell holds only a few faces. If ink is drawn as
 * long unclosed strokes, one huge cell contains dozens of faces and the ratio
 * blows up. That is exactly the difference between an outlined drawing and a
 * shaded diagram with lines on it.
 */
function inkClosure(img) {
  const { w, h, k, ink } = img;
  const cells = components(img, { valid: (p) => !ink[p], link: (a, b) => !ink[b] }, MIN_CELL_PX);
  const faces = components(img, { valid: () => true, link: (a, b) => k[a] === k[b] }, MIN_FACE_PX);
  let inkPx = 0; for (let i = 0; i < ink.length; i++) inkPx += ink[i];
  return { cells, faces, ratio: cells ? faces / cells : NaN, inkShare: inkPx / (w * h) };
}

function measure(img) {
  const kk = keyed(img);
  return { ...radiusOfGyration(kk), ...inkClosure(kk) };
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

/**
 * Every number this repo reports carries the digest of the generator source.
 *
 * Here it is weaker evidence than in verify.mjs or duel.mjs, and the banner
 * says so: this script measures a PNG that already exists, so the digest is the
 * tree RIGHT NOW, not necessarily the tree that rendered the file. It is still
 * worth printing — quoting a colour number beside a digest that turns out to
 * have moved is exactly how round 2's torn measurements were caught. Render and
 * measure in one go if you want the digest to actually bind.
 */
function banner() {
  console.log(`# tree ${treeHash().digest}   (tree AS OF NOW — binds only if the PNG was just rendered)\n`);
}

function report(label, m) {
  console.log(`${label.padEnd(30)} rg(med)=${fmt(m.medianRg)}  rg(pixel-weighted)=${fmt(m.pixelWeightedRg)}  ` +
    `inkClosure=${fmt(m.ratio)}  cells=${m.cells}  faces=${m.faces}  ink=${fmt(m.inkShare * 100, 2)}%`);
}

const argv = process.argv.slice(2);
const a = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const nx = argv[i + 1];
    a[argv[i].slice(2)] = nx === undefined || nx.startsWith('--') ? true : (i++, nx);
  } else pos.push(argv[i]);
}

const SIZE = Number(a.size ?? 320);
const NCROPS = Number(a.crops ?? 9);

banner();

if (a.compare) {
  // Median over seeded interior crops, so a single lucky window cannot decide.
  const files = [String(a.compare), ...pos];
  for (const f of files) {
    const img = readPNG(f);
    const st = new Rng(String(a.seed ?? 'fixel-colour-v1')).stream('crops');
    const rgs = [], ratios = [];
    for (let i = 0; i < NCROPS; i++) {
      const x = st.int(24, Math.max(24, img.w - SIZE - 24));
      const y = st.int(24, Math.max(24, img.h - SIZE - 24));
      const m = measure(crop(img, x, y, SIZE, SIZE));
      rgs.push(m.pixelWeightedRg); ratios.push(m.ratio);
    }
    rgs.sort((p, q) => p - q); ratios.sort((p, q) => p - q);
    const mid = (arr) => arr[Math.floor(arr.length / 2)];
    console.log(`${f.split('/').pop().padEnd(34)} rg(pixel-weighted, median of ${NCROPS} crops)=${fmt(mid(rgs))}  inkClosure=${fmt(mid(ratios))}`);
  }
} else {
  const file = pos[0];
  let img = readPNG(file);
  if (a.crop) { const [x, y, s] = String(a.crop).split(',').map(Number); img = crop(img, x, y, s, s); }
  report(file.split('/').pop(), measure(img));
  // Targets are measured by THIS script off the reference, never transcribed
  // from another agent's number. Radius of gyration is definition-sensitive —
  // an independent implementation reported 20.5 vs 58.8 where this one reports
  // ~13.6 vs ~24.9 on the same images — so absolute values are not comparable
  // across implementations and only the ratio to the reference is. (Ink closure
  // is robust: this script gets 3.18/8.29 where the other got 2.94/8.25.)
  // Two digest conventions already cost us once; do not repeat it with metrics.
  const ref = measure(readPNG(path.join(REPO, 'refs/EBY-LA-Hot-Dog-175k.png')));
  console.log('\nreference, same script, whole image:');
  report('  EBY-LA-Hot-Dog', ref);
  console.log('\ntarget: match the reference AS MEASURED BY THIS SCRIPT. Ratio is the number that travels.');
}
