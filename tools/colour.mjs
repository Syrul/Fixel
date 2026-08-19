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
//
//      *** READ THIS BEFORE USING IT AS A TARGET ***
//
//      rg(med) INVERTS and must never be a score or a target:
//          LA reference 19.17  <  Fixel 23.98  <  Lufthansa 27.02
//      The generator beats genuine eBoy work on it. That is precisely the
//      failure that retired the 60-metric band (docs/DIFF.md section 3), and
//      it is the reason this file refuses to print rg(med) without a warning.
//
//      rg(pixel-weighted) is usable but ONLY AS A FLOOR: LA 178.70 and
//      Lufthansa 161.74 against Fixel 529.17 separates genuine from generated
//      cleanly, but does NOT order the two genuine works. So it can say we are
//      outside the craft family; it can never say we are winning inside it.
//      Same status as the fail count.
//
//   2. INK CLOSURE RATIO — flat faces per ink-enclosed cell. Reference 2.94,
//      generator 8.25. The ink BUDGET is already right (14.12% vs 14.74%) and
//      the flat-face SIZE distribution is already right (median 38 vs 42px).
//      What is wrong is TOPOLOGY: long lattice-aligned strokes instead of
//      closed small loops. So the fix is to REDISTRIBUTE ink, never to add it
//      — adding ink that does not close a loop measurably worsened three
//      metrics last round.
//
//      *** AND IT IS ONLY INK TOPOLOGY IN DAYLIGHT ***
//
//      LUMA_INK = 50 is a DAYLIGHT calibration. It was chosen when every
//      picture this repo made was a clear day, and "luma < 50" meant outline.
//      After dark it means "dark", and inkClosure stops measuring topology and
//      starts measuring exposure — the tempoBpm failure in a new costume (a
//      metric that measures a different quantity depending on its input; see
//      docs/AUDIO-MEASURED.md, "Metrics that were retired, and why").
//
//      MEASURED, not asserted. 8 seeds (fixel-1..8, biomes city x3, desert x3,
//      shore, highland) x 7 conditions, rendered at tools/render.mjs defaults
//      1600x1100, tree 31dfcf35210b0704, digest intact across the render:
//
//        inkShare %, WHOLE FRAME              n     min    p50     max
//          day/golden, all weathers          40    6.76  13.47   18.92
//            day/clear                        8    7.74  16.40   18.92
//            golden/clear                     8    7.02  14.17   15.30
//            day/overcast                     8    6.79  12.65   13.98
//            day/rain                         8    6.81  13.46   14.14
//            day/fog                          8    6.76  11.72   13.82
//          night, all weathers               16   33.51  48.89   85.25
//            night/clear                      8   38.68  50.15   79.46
//            night/rain                       8   33.51  46.02   85.25
//
//      OVERCAST AND PRECIPITATION DO NOT SIT BETWEEN THE TWO REGIMES. They sit
//      slightly BELOW plain day — they flatten the ladder rather than darken
//      the frame, so they LOWER inkShare. Night is the only thing that moves
//      it. At whole-frame scale the separation is total: 18.92 against 33.51,
//      a gap of 14.6 points with no overlap in 56 images.
//
//      AT CROP SCALE IT IS NOT TOTAL, and a threshold read off whole frames
//      alone would have been wrong. The same 56 images, 9 seeded 320x320 crops
//      each — the crops the --compare path actually measures:
//
//        inkShare %, 320x320 CROPS            n     min    p50     max
//          day/golden, all weathers         360    4.70  13.58   26.93
//          night, all weathers              144   21.47  51.61   86.60
//
//      So the distributions OVERLAP over roughly 21.5-27%: 8 of 360 daylight
//      crops land at or above 21.5, and 7 of 144 night crops land at or below
//      27. This is the docs/OWNERSHIP.md rule 8 corollary again — a whole-image
//      summary hides what a judge-sized crop does. There is therefore NO single
//      clean cut point, and this file does not invent one. It reports three
//      states, with the band edges rounded OUTWARD from the extremes above.
//
//      It LABELS rather than REFUSES, deliberately. Refusing would make the
//      tool unable to say anything about a night frame, and night-against-night
//      comparison is still meaningful. More importantly a refusal is a binary
//      verdict, and the crop data above shows the underlying question is not
//      binary — rule 10. So the reading is always printed, and the banner says
//      which of the three states it is in.
//
//      For reference this script reads EBY-LA-Hot-Dog at ink=16.26% whole image
//      (crops 13.41-17.36) and Lufthansa at 10.49%. Both genuine works sit
//      squarely in the daylight regime, so the guard never fires on them.
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

// The two edges of the measured overlap band, in PERCENT of pixels under
// LUMA_INK. Rounded outward from the extremes in the header block, so each edge
// is on the safe side of every sample actually observed:
//   INK_DAY_MAX  27.0 — the highest daylight sample was 26.93 (a 320px crop of
//                       a day/clear city). Above this, nothing daylight was
//                       ever seen, so the frame is dark.
//   INK_DAY_ONLY 21.0 — the lowest night sample was 21.47 (a 320px crop of a
//                       night/clear shore). Below this, nothing night was ever
//                       seen, so the frame is in the calibrated regime.
// Between them both regimes occur and the pixels cannot decide which.
//
// These trigger off the MEASURED inkShare of the image in hand, never off a
// filename or a flag: this script measures a PNG that already exists and has no
// way to know how it was rendered — the same reason banner() hedges the digest.
const INK_DAY_MAX = 27.0;
const INK_DAY_ONLY = 21.0;

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

/**
 * The exposure guard. Returns null in the daylight regime — so a daylight
 * reading prints EXACTLY the bytes it printed before this guard existed — and
 * an unmissable block otherwise.
 *
 * Worked example of what it is for, same tree, seed fixel-1: the day/clear
 * frame reads inkClosure 7.11, the night/clear frame 4.68. The night frame
 * looks like a large win against the reference's 3.13. It is not a win, it is
 * 49.90% of the pixels falling under LUMA_INK and shattering the non-ink cell
 * count (3526 -> 5351). Across 8 seeds day/clear spans 5.29-7.19 while
 * night/clear spans 4.37-22.20, and the move is DOWN on 3 seeds and UP on 5 —
 * a decoupling, not an offset. Nothing about that reading is a topology.
 */
function inkRegimeNote(m) {
  const pc = m.inkShare * 100;
  if (pc < INK_DAY_ONLY) return null;
  if (pc > INK_DAY_MAX) {
    return `  !! ${fmt(pc)}% of pixels are under LUMA_INK=${LUMA_INK}. DARK FRAME.\n` +
      `  !! No daylight sample in the calibration reached ${INK_DAY_MAX}% (max 26.93%, n=400).\n` +
      `  !! inkClosure=${fmt(m.ratio)} HERE LARGELY MEASURES HOW DARK THE PICTURE IS,\n` +
      `  !! not ink topology, and is NOT comparable to the daylight references\n` +
      `  !! below. Compare it only against frames of the same exposure.`;
  }
  return `  ?? ${fmt(pc)}% of pixels are under LUMA_INK=${LUMA_INK}, inside the measured\n` +
    `  ?? OVERLAP band ${INK_DAY_ONLY}-${INK_DAY_MAX}%, where daylight 320px crops (8/360) and\n` +
    `  ?? night crops (7/144) both occur. Whether inkClosure=${fmt(m.ratio)} is topology\n` +
    `  ?? or exposure CANNOT BE DECIDED from these pixels. Reading is unresolved.`;
}

function report(label, m) {
  console.log(`${label.padEnd(30)} inkClosure=${fmt(m.ratio)}  cells=${m.cells}  faces=${m.faces}  ` +
    `ink=${fmt(m.inkShare * 100, 2)}%  |  rg(pw)=${fmt(m.pixelWeightedRg)} [floor only]  ` +
    `rg(med)=${fmt(m.medianRg)} [INVERTS - NOT A TARGET]`);
  // Inside report(), so EVERY path that prints a reading is guarded, including
  // the reference line — if someone points this script at a darker reference
  // one day, the guard is already there rather than needing to be remembered.
  const note = inkRegimeNote(m);
  if (note) console.log(note);
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
    const rgs = [], ratios = [], inks = [];
    for (let i = 0; i < NCROPS; i++) {
      const x = st.int(24, Math.max(24, img.w - SIZE - 24));
      const y = st.int(24, Math.max(24, img.h - SIZE - 24));
      const m = measure(crop(img, x, y, SIZE, SIZE));
      rgs.push(m.pixelWeightedRg); ratios.push(m.ratio); inks.push(m.inkShare * 100);
    }
    rgs.sort((p, q) => p - q); ratios.sort((p, q) => p - q);
    const mid = (arr) => arr[Math.floor(arr.length / 2)];
    console.log(`${f.split('/').pop().padEnd(34)} rg(pixel-weighted, median of ${NCROPS} crops)=${fmt(mid(rgs))}  inkClosure=${fmt(mid(ratios))}`);
    // This path is the one MOST exposed to the exposure problem, because the
    // overlap band was measured on exactly these 320px crops. The median above
    // is left untouched; the count of crops outside the calibrated regime is
    // added, because a median of nine crops hides how many of them were dark.
    const dark = inks.filter((v) => v > INK_DAY_MAX).length;
    const amb = inks.filter((v) => v >= INK_DAY_ONLY && v <= INK_DAY_MAX).length;
    if (dark || amb) {
      const is = [...inks].sort((p, q) => p - q);
      console.log(`  !! ${dark} of ${NCROPS} crops are DARK (ink > ${INK_DAY_MAX}%) and ${amb} are in the ` +
        `undecidable ${INK_DAY_ONLY}-${INK_DAY_MAX}% band;\n` +
        `  !! crop ink spans ${fmt(is[0])}-${fmt(is[is.length - 1])}%. The inkClosure median above is NOT\n` +
        `  !! comparable to a daylight reference — see the calibration at the top of this file.`);
    }
  }
} else {
  const file = pos[0];
  let img = readPNG(file);
  if (a.crop) { const [x, y, s] = String(a.crop).split(',').map(Number); img = crop(img, x, y, s, s); }
  const subject = measure(img);
  report(file.split('/').pop(), subject);
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
  console.log('\ninkClosure is the ONLY column here that is safe to chase: it orders');
  console.log('LA < Lufthansa < Fixel, so genuine work beats the generator on it, and its');
  console.log('absolutes travel across implementations. rg(pw) is a floor. rg(med) INVERTS');
  console.log('(Fixel 23.98 beats genuine Lufthansa 27.02) and must not be targeted.');
  // The "safe to chase" claim above is itself conditional on the daylight
  // calibration, so on a frame outside it the claim is withdrawn HERE rather
  // than left standing for the next reader to trip over. Printed only when the
  // guard fired, so a daylight run's output is unchanged to the byte.
  if (inkRegimeNote(subject)) {
    console.log('\nBUT NOT ON THIS IMAGE. The reading above is outside the daylight regime');
    console.log('LUMA_INK=50 was calibrated for, so "inkClosure is safe to chase" does not');
    console.log('apply to it and the comparison against LA and Lufthansa is not meaningful.');
    console.log('Re-measure at --time day --weather clear to compare against the references.');
  }
}
