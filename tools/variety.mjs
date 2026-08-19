#!/usr/bin/env node
// tools/variety.mjs — does a new seed produce a new scene?
//
// WHY THIS FILE EXISTS
// Fixel is an ENDLESS FEED. Nothing in the band, the budget or the duel looks
// at more than one seed at a time, so the single most product-relevant defect
// is invisible to every gate we own. docs/ROUNDS.md round 1, measured and then
// left un-gated:
//
//   "Our four seeds produced near-identical statistics — colorsPerTile.median16
//    was exactly 16.00 on all four, palette.distinct 111/111/111/112. Every
//    Fixel scene is, statistically, the same scene."
//
// It is worse than a missing gate. tools/budget.mjs showed the 60-metric fail
// count RANKS OUR GENERATOR ABOVE A GENUINE eBoy PIXORAMA under three different
// bands, because every band is a p05..p95 interval and a generator emitting the
// statistical average of the band source sits near the centre of all sixty
// intervals at once while a real artwork walks outside a third of them. The
// band therefore REWARDS the homogeneity this file measures. Metric suite and
// product goal currently point in opposite directions.
//
// WHAT "ENOUGH VARIETY" MEANS, AND WHERE THE NUMBER COMES FROM
// Nobody can assert a spread target honestly, so both bounds are measured:
//
//   FLOOR   = the reference's own within-artwork spread, i.e. the p05..p95 band
//             width in docs/band-pixel-v2.json. That width is what you get by
//             MOVING THE WINDOW across a single eBoy artwork. A new seed is
//             supposed to be a new scene, so it must change a metric at least
//             as much as panning across one existing picture does. Ratio < 1
//             means a fresh seed is a smaller event than a fresh crop of the
//             same artwork — one scene, repeated.
//
//   CEILING = the pooled p05..p95 width across crops of EVERY genuine artwork
//             in the family (LA + Lufthansa by default). That is the widest
//             spread demonstrably still inside the craft. Above it the seeds are
//             not variations of one style, they are different things, which in
//             practice means some seeds are broken.
//
// ...AND THE FLOOR IS THEN CORRECTED FOR SAMPLE SIZE BY A POSITIVE CONTROL.
// The band's p05..p95 comes from 128 crops; a variety run has only N (default
// 16). The p05..p95 of 16 samples is a biased-low estimate of the p05..p95 of
// the population, so EVERY ratio reads low by a constant factor that has
// nothing to do with the generator. The `refregions` control measures that
// factor directly — N genuinely different regions of the reference, run through
// the identical pipeline — and its median ratio is the honest floor. Compare
// the generator to the positive control, not to 1.000.
//
// THE GATE MUST SURVIVE ITS OWN INVERSION TEST
// The 60-metric fail count died because a generator emitting the average of the
// band beat a real artwork on it. A variety number can die the same way, so this
// file ships the attack: `--controls` runs adversarial variant sets that have
// ZERO real variety (one scene recoloured, one scene jittered 1px, one scene
// hue-rotated, one scene copied N times) beside the genuine positive control,
// and prints the ordering. If an adversarial control outranks genuine spread,
// the number is not a score and this file says so in its own output.
//
// SEED-TO-SEED, NOT CROP-TO-CROP
// Every variant is cropped at the SAME K window positions. If each were cropped
// somewhere different, crop-position variance would be folded into the answer
// and a generator that emits one scene forever would still show spread. Fixing
// the windows isolates the only thing being asked: does changing the seed change
// the picture. K windows rather than one, median window reported, so a single
// unlucky patch of sky cannot decide the verdict.
//
// DETERMINISM AND PROVENANCE
// Seeds are `<prefix>-<i>`. Crop windows come from src/core/rng.js. Renders go
// through tools/render.mjs as a subprocess, so the same-seed determinism
// assertion is a real cross-process check rather than a claim about one Node
// heap. The whole run is bracketed by tools/treehash.mjs: a source tree that
// moves mid-run makes the result VOID, not merely suspect. See docs/OWNERSHIP.md
// — this cost the project half an hour of numbers once already.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readPNG, crop } from '../src/core/png.js';
import { Rng } from '../src/core/rng.js';
import { treeHash } from './treehash.mjs';
import { measure, cropRects, aggregate, DEFS, pct } from './metrics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

const CONTROLS = ['same', 'jitter', 'recolour', 'hue', 'refregions'];

const USAGE = `usage:
  node tools/variety.mjs [--seeds 16] [--prefix fixel-variety]
                         [--band docs/band-pixel-v2.json]
                         [--crops 4] [--size 320] [--inset 24]
                         [--w 1600] [--h 1100]
                         [--family <file.png>]  (repeatable; default: band source + Lufthansa)
                         [--out out/variety] [--json] [--no-determinism]
                         [--controls]           run the inversion test as well
                         [--only <control>]     run ONE variant set and stop

  controls: ${CONTROLS.join(', ')}
    same       N byte-identical copies of one scene. Zero variety by
               construction; anything scoring at or below this is not varying.
    jitter     one scene, each variant offset by <=1px in 16x16 blocks. Known to
               defeat tileRepeat's exact hash, so it is the obvious attack.
    recolour   one scene, geometry untouched, every distinct colour nudged per
               variant. The other known tileRepeat defeat.
    hue        one scene, global hue rotation only. Moves every palette and hue
               metric while the picture is identical.
    refregions THE POSITIVE CONTROL. N genuinely different regions of the
               reference artwork through the same pipeline. This is what real
               spread looks like, and its ratio is the sample-size-corrected
               floor the generator should be compared against.`;

function parseArgs(argv) {
  const a = {
    seeds: 16, prefix: 'fixel-variety', band: 'docs/band-pixel-v2.json',
    crops: 4, size: 320, inset: 24, w: 1600, h: 1100,
    family: [], out: 'out/variety', json: false, determinism: true,
    controls: false, only: null, cropSeed: 'fixel-variety-crops',
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--seeds') a.seeds = Number(argv[++i]);
    else if (t === '--prefix') a.prefix = String(argv[++i]);
    else if (t === '--band') a.band = argv[++i];
    else if (t === '--crops') a.crops = Number(argv[++i]);
    else if (t === '--size') a.size = Number(argv[++i]);
    else if (t === '--inset') a.inset = Number(argv[++i]);
    else if (t === '--w') a.w = Number(argv[++i]);
    else if (t === '--h') a.h = Number(argv[++i]);
    else if (t === '--family') a.family.push(argv[++i]);
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--json') a.json = true;
    else if (t === '--no-determinism') a.determinism = false;
    else if (t === '--controls') a.controls = true;
    else if (t === '--only') a.only = String(argv[++i]);
    else { console.error(USAGE); process.exit(2); }
  }
  return a;
}

const a = parseArgs(process.argv.slice(2));
const TREE_BEFORE = treeHash().digest;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells, pad = ' ') =>
    cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i], pad) : String(c).padStart(w[i], pad))).join('  ');
  return [line(headers), line(w.map((x) => '-'.repeat(x)), '-'), ...rows.map((r) => line(r))].join('\n');
}

function render(seed, outPath) {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/render.mjs'),
    '--seed', seed, '--out', outPath, '--w', String(a.w), '--h', String(a.h)],
  { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.error(`render failed for seed ${seed}:\n${r.stderr}`); process.exit(2); }
  return outPath;
}

function dstats(values) {
  const s = Float64Array.from(values).sort();
  let sum = 0;
  for (const v of s) sum += v;
  const mean = sum / s.length;
  let v2 = 0;
  for (const v of s) v2 += (v - mean) ** 2;
  const sd = Math.sqrt(v2 / s.length);
  return {
    min: Number(s[0]), max: Number(s[s.length - 1]),
    p05: pct(s, 0.05), p50: pct(s, 0.5), p95: pct(s, 0.95),
    mean, sd, cv: mean !== 0 ? sd / Math.abs(mean) : 0,
    width: pct(s, 0.95) - pct(s, 0.05),
  };
}

// ---------------------------------------------------------------------------
// perceptual distance
//
// Aggregate statistics can look varied while the pictures are the same: swap
// two building colours and half the palette metrics move. So every PAIR of
// variants is compared directly, at the same window, and the MINIMUM over all
// pairs is the headline — one pair of near-identical scenes is a hard fail no
// matter how healthy the averages are.
//
// A pair is close if EITHER view says so, hence min(hist, struct): the two
// views have disjoint blind spots and taking the max would let each cover for
// the other.
//
// HOW GAMEABLE IS THIS? Honestly: quite. Stated in full because a distance
// measure whose weaknesses are not written down gets quoted as if it had none.
//  - The histogram half is defeated by keeping one layout and re-rolling the
//    palette. The structure half is defeated by keeping one palette and
//    translating or mirroring the layout — a 30px pan of an identical scene
//    reads as a large distance. Neither is defeated by the same trick, which is
//    the only reason to report both; a generator doing BOTH (jitter the palette
//    AND pan the camera) would pass while emitting one scene forever. The
//    `--controls` runs attack exactly this and their ordering is the evidence.
//  - The 16x16 structure grid is far too coarse to notice that every building
//    is the same building. It sees composition, not objects — and objects are
//    where round 1's one honest judge caught us.
//  - Neither is invariant to anything, so both flatter a generator that varies
//    nuisance parameters instead of content.
// It is a FLOOR: it catches literal and near duplicates, which is the failure
// this generator actually has. It is not a similarity metric and must never be
// reported as one.
// ---------------------------------------------------------------------------

/** 4x4x4 RGB histogram, L1/2 distance in [0,1]. Blind to arrangement. */
function histo(img) {
  const h = new Float64Array(64);
  const d = img.data;
  const n = img.w * img.h;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    h[((d[o] >> 6) << 4) | ((d[o + 1] >> 6) << 2) | (d[o + 2] >> 6)]++;
  }
  for (let i = 0; i < 64; i++) h[i] /= n;
  return h;
}
function histoDist(x, y) {
  let s = 0;
  for (let i = 0; i < 64; i++) s += Math.abs(x[i] - y[i]);
  return s / 2;
}

/**
 * 16x16 box-downsampled luma, z-normalised per image. Normalising removes
 * global brightness and contrast, so this measures WHERE the light and dark
 * masses sit, not how bright the picture is — the case the histogram misses.
 */
function structure(img, g = 16) {
  const s = new Float64Array(g * g);
  const cnt = new Float64Array(g * g);
  const d = img.data;
  for (let y = 0; y < img.h; y++) {
    const gy = Math.min(g - 1, Math.floor((y * g) / img.h));
    for (let x = 0; x < img.w; x++) {
      const o = (y * img.w + x) * 4;
      const gi = gy * g + Math.min(g - 1, Math.floor((x * g) / img.w));
      s[gi] += 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      cnt[gi]++;
    }
  }
  let mean = 0;
  for (let i = 0; i < s.length; i++) { s[i] /= cnt[i]; mean += s[i]; }
  mean /= s.length;
  let sd = 0;
  for (let i = 0; i < s.length; i++) sd += (s[i] - mean) ** 2;
  sd = Math.sqrt(sd / s.length) || 1;
  for (let i = 0; i < s.length; i++) s[i] = (s[i] - mean) / sd;
  return s;
}
function structureDist(x, y) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  // RMS of a z-score difference; two unrelated standardised fields average
  // sqrt(2), identical fields give 0. Divided by sqrt(2) so "unrelated" ~ 1.
  return Math.sqrt(s / x.length) / Math.SQRT2;
}

function overlaps(p, q, size) {
  return Math.abs(p.x - q.x) < size && Math.abs(p.y - q.y) < size;
}

// ---------------------------------------------------------------------------
// adversarial transforms — all deterministic, all geometry-preserving
// ---------------------------------------------------------------------------

function copyImg(img) {
  return { w: img.w, h: img.h, data: Buffer.from(img.data) };
}

/**
 * Per-instance recolour: every DISTINCT colour in the scene is given a new
 * chroma, with its LUMA PRESERVED EXACTLY. Pixel-for-pixel identical geometry,
 * identical light-and-dark structure, a visibly different palette.
 *
 * Luma preservation is what makes this a faithful attack rather than noise. A
 * generator that recolours each stamp still draws the same building with the
 * same shading ladder, so its downsampled luma field is unchanged; a recolour
 * that also randomised luma would be changing the picture, not the palette, and
 * beating it would prove nothing. docs/MEASURED.md records that per-instance
 * recolour defeats tileRepeat's exact hash entirely (1.000 vs the reference's
 * 0.143), so it is the first thing a variety gate must not be fooled by.
 */
function recolour(img, seed) {
  const s = new Rng(seed).stream('recolour');
  const out = copyImg(img);
  const map = new Map();
  const d = out.data;
  for (let o = 0; o < d.length; o += 4) {
    const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
    let v = map.get(key);
    if (v === undefined) {
      const r = d[o], g = d[o + 1], b = d[o + 2];
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      // New chroma, same Y. Magnitude scaled to the pixel's own chroma so flat
      // greys stay grey and saturated faces stay saturated.
      const I = 0.596 * r - 0.274 * g - 0.322 * b;
      const Q = 0.211 * r - 0.523 * g + 0.312 * b;
      const mag = Math.hypot(I, Q);
      const ang = s.range(0, Math.PI * 2);
      const I2 = mag * Math.cos(ang), Q2 = mag * Math.sin(ang);
      v = [
        Math.max(0, Math.min(255, Math.round(Y + 0.956 * I2 + 0.621 * Q2))),
        Math.max(0, Math.min(255, Math.round(Y - 0.272 * I2 - 0.647 * Q2))),
        Math.max(0, Math.min(255, Math.round(Y - 1.106 * I2 + 1.703 * Q2))),
      ];
      map.set(key, v);
    }
    d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2];
  }
  return out;
}

/**
 * Per-instance 1px jitter: each 16x16 block sampled from a seeded offset of
 * up to 1px. The other documented defeat of the exact tile hash.
 */
function jitter(img, seed, block = 16) {
  const s = new Rng(seed).stream('jitter');
  const out = copyImg(img);
  const bx = Math.ceil(img.w / block), by = Math.ceil(img.h / block);
  const offs = [];
  for (let i = 0; i < bx * by; i++) offs.push([s.int(-1, 1), s.int(-1, 1)]);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const [dx, dy] = offs[Math.floor(y / block) * bx + Math.floor(x / block)];
      const sx = Math.max(0, Math.min(img.w - 1, x + dx));
      const sy = Math.max(0, Math.min(img.h - 1, y + dy));
      img.data.copy(out.data, (y * img.w + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
    }
  }
  return out;
}

/** Global hue rotation. Identical picture, different colours. */
function hueRotate(img, deg) {
  const out = copyImg(img);
  const d = out.data;
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad), sn = Math.sin(rad);
  // YIQ rotation: cheap, exact enough, and it leaves luma untouched by
  // construction — which is the point, the structure view must see no change.
  for (let o = 0; o < d.length; o += 4) {
    const r = d[o], g = d[o + 1], b = d[o + 2];
    const Y = 0.299 * r + 0.587 * g + 0.114 * b;
    const I = 0.596 * r - 0.274 * g - 0.322 * b;
    const Q = 0.211 * r - 0.523 * g + 0.312 * b;
    const I2 = I * c - Q * sn, Q2 = I * sn + Q * c;
    d[o] = Math.max(0, Math.min(255, Math.round(Y + 0.956 * I2 + 0.621 * Q2)));
    d[o + 1] = Math.max(0, Math.min(255, Math.round(Y - 0.272 * I2 - 0.647 * Q2)));
    d[o + 2] = Math.max(0, Math.min(255, Math.round(Y - 1.106 * I2 + 1.703 * Q2)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// build a variant set: N variants x K fixed windows of 320px crops
// ---------------------------------------------------------------------------

const band = JSON.parse(readFileSync(join(ROOT, a.band), 'utf8'));
const outDir = resolve(ROOT, a.out);
mkdirSync(outDir, { recursive: true });

const seeds = Array.from({ length: a.seeds }, (_, i) => `${a.prefix}-${i}`);

/** The generator itself: N seeds, K fixed windows. */
function generatorSet() {
  const files = seeds.map((s, i) => render(s, join(outDir, `s${String(i).padStart(2, '0')}.png`)));
  const probe = readPNG(files[0]);
  const windows = cropRects(probe, a.crops, a.size, a.cropSeed, a.inset);
  if (!windows) { console.error(`canvas ${probe.w}x${probe.h} too small for ${a.size}px crops inset ${a.inset}`); process.exit(2); }
  const imgs = files.map((f) => {
    const im = readPNG(f);
    return windows.map((wnd) => crop(im, wnd.x, wnd.y, a.size, a.size));
  });
  return { label: 'generator', names: seeds, windows, imgs, files };
}

/** One scene, N transformed copies. Zero real variety by construction. */
function transformSet(name) {
  const base = readPNG(render(seeds[0], join(outDir, '_base.png')));
  const windows = cropRects(base, a.crops, a.size, a.cropSeed, a.inset);
  const imgs = [];
  const names = [];
  for (let i = 0; i < a.seeds; i++) {
    let v;
    if (name === 'same') v = base;
    else if (name === 'recolour') v = recolour(base, `${a.prefix}-ctl-${i}`);
    else if (name === 'jitter') v = jitter(base, `${a.prefix}-ctl-${i}`);
    else if (name === 'hue') v = hueRotate(base, (i * 360) / a.seeds);
    else throw new Error(`unknown control ${name}`);
    imgs.push(windows.map((wnd) => crop(v, wnd.x, wnd.y, a.size, a.size)));
    names.push(`${name}-${i}`);
  }
  return { label: name, names, windows, imgs };
}

/**
 * THE POSITIVE CONTROL. N genuinely different regions of the reference artwork,
 * one per "variant", at K independent window groups. This is what real
 * seed-to-seed spread should look like, measured through the identical
 * pipeline, at the identical sample size — so its ratio absorbs the
 * small-N percentile bias that would otherwise make every ratio read low.
 *
 * Crops are drawn from the same interior region the band used. They can overlap,
 * which if anything UNDERSTATES genuine spread, so this control is conservative:
 * a generator that fails to beat it is failing against a handicapped opponent.
 */
function refRegionSet() {
  const im = readPNG(resolve(ROOT, band.source));
  const groups = [];
  let worstOverlap = 0;
  let achievedSep = Infinity;
  for (let k = 0; k < a.crops; k++) {
    // Rejection-sample N positions whose centres are at least size/2 apart, so
    // "genuinely different regions" is enforced rather than hoped for. Random
    // interior crops overlap constantly on a 1189x840 artwork, and an
    // overlapping pair scores a near-zero perceptual distance that would drag
    // the genuine floor below the adversarial controls — an artefact of the
    // control, not a property of the measure.
    const pool = cropRects(im, a.seeds * 200, a.size, `${a.cropSeed}-region-${k}`, a.inset);
    if (!pool) { console.error(`reference too small for ${a.size}px crops`); process.exit(2); }
    // Relax the separation until N distinct positions exist, and record what it
    // took. Never pad with duplicates: a duplicated crop scores distance 0 and
    // would drag the genuine floor to zero, which is precisely the artefact
    // that would make an adversarial control look competitive.
    let sep = a.size / 2;
    let picked = [];
    while (sep >= 8) {
      picked = [];
      for (const r of pool) {
        if (picked.length >= a.seeds) break;
        if (picked.every((q) => Math.abs(q.x - r.x) >= sep || Math.abs(q.y - r.y) >= sep)) picked.push(r);
      }
      if (picked.length >= a.seeds) break;
      sep = Math.floor(sep * 0.8);
    }
    if (picked.length < a.seeds) {
      console.error(`positive control: only ${picked.length}/${a.seeds} distinct regions at window ${k}; using what exists.`);
    }
    achievedSep = Math.min(achievedSep, sep);
    for (let i = 0; i < picked.length; i++) {
      for (let j = i + 1; j < picked.length; j++) {
        const ox = Math.max(0, a.size - Math.abs(picked[i].x - picked[j].x));
        const oy = Math.max(0, a.size - Math.abs(picked[i].y - picked[j].y));
        worstOverlap = Math.max(worstOverlap, (ox * oy) / (a.size * a.size));
      }
    }
    groups.push(picked);
  }
  const imgs = [];
  const names = [];
  for (let i = 0; i < a.seeds; i++) {
    imgs.push(groups.map((rs) => crop(im, rs[i].x, rs[i].y, a.size, a.size)));
    names.push(`region-${i}`);
  }
  // One representative rect per window group, so `windows` has length K like
  // every other set. groups[k] holds N rects (one per variant), not K.
  return { label: 'refregions', names, windows: groups.map((rs) => rs[0]), imgs, worstOverlap, achievedSep };
}

// ---------------------------------------------------------------------------
// analysis, identical for every variant set
// ---------------------------------------------------------------------------

// The family ceiling: pooled p05..p95 across crops of every genuine artwork.
const familyFiles = (a.family.length ? a.family : [band.source, 'refs/C3L Lufthansa Frankfurt Pixorama 45k.png'])
  .map((f) => (existsSync(resolve(ROOT, f)) ? resolve(ROOT, f) : null))
  .filter(Boolean);
const familyRows = [];
for (const f of familyFiles) {
  const im = readPNG(f);
  const rs = cropRects(im, band.sampling.crops, band.sampling.size, band.sampling.seed, band.sampling.inset);
  if (!rs) continue;
  for (const r of rs) familyRows.push(measure(crop(im, r.x, r.y, band.sampling.size, band.sampling.size)));
}
const familyAgg = aggregate(familyRows);

function analyse(set) {
  const metricsByVariant = set.imgs.map((cs) => cs.map((c) => measure(c)));

  const rows = [];
  for (const d of DEFS) {
    const k = d.key;
    // Cross-variant spread at each fixed window, then the MEDIAN window. One
    // window can land on sky in every variant; the median cannot.
    const widths = Float64Array.from(
      set.windows.map((_, wi) => dstats(metricsByVariant.map((ms) => ms[wi][k])).width)).sort();
    const medianWidth = pct(widths, 0.5);
    const pooled = dstats(metricsByVariant.flatMap((ms) => ms.map((m) => m[k])));

    const [lo, hi] = band.metrics[k].band;
    const refWidth = hi - lo;                              // FLOOR unit
    const famWidth = familyAgg[k].p95 - familyAgg[k].p05;  // CEILING unit
    const ratio = refWidth > 0 ? medianWidth / refWidth : 0;
    const ceilRatio = refWidth > 0 ? famWidth / refWidth : Infinity;

    rows.push({
      key: k, dp: d.dp,
      min: pooled.min, max: pooled.max, sd: pooled.sd, cv: pooled.cv,
      crossSeedWidth: medianWidth, refWidth, famWidth, ratio, ceilRatio,
      verdict: ratio < 1 ? 'NARROW' : ratio > ceilRatio ? 'WIDE' : 'OK',
    });
  }

  const perceptual = set.windows.map((_, wi) => {
    const cl = set.imgs.map((cs) => cs[wi]);
    const H = cl.map((c) => histo(c));
    const S = cl.map((c) => structure(c));
    const ds = [];
    for (let i = 0; i < cl.length; i++) {
      for (let j = i + 1; j < cl.length; j++) {
        ds.push({ i, j, hist: histoDist(H[i], H[j]), struct: structureDist(S[i], S[j]) });
      }
    }
    const combo = ds.map((x) => Math.min(x.hist, x.struct));
    let wi2 = 0;
    for (let i = 1; i < combo.length; i++) if (combo[i] < combo[wi2]) wi2 = i;
    const c = Float64Array.from(combo).sort();
    return {
      window: wi,
      min: Number(c[0]), p05: pct(c, 0.05), median: pct(c, 0.5),
      worstPair: { a: set.names[ds[wi2].i], b: set.names[ds[wi2].j], hist: ds[wi2].hist, struct: ds[wi2].struct },
    };
  });

  const narrow = rows.filter((r) => r.verdict === 'NARROW');
  const wide = rows.filter((r) => r.verdict === 'WIDE');
  const frozen = rows.filter((r) => r.crossSeedWidth === 0);
  return {
    label: set.label,
    names: set.names,
    windows: set.windows,
    worstOverlap: set.worstOverlap,
    achievedSep: set.achievedSep,
    rows,
    perceptual,
    summary: {
      narrow: narrow.length,
      wide: wide.length,
      frozen: frozen.length,
      frozenKeys: frozen.map((r) => r.key),
      medianRatio: pct(Float64Array.from(rows.map((r) => r.ratio)).sort(), 0.5),
      minPairDistance: Math.min(...perceptual.map((p) => p.min)),
    },
  };
}

// ---------------------------------------------------------------------------
// reference perceptual floor: NON-overlapping crop pairs of one artwork.
// Overlapping crops share pixels and would set a floor no honest generator has
// to clear, so they are excluded.
// ---------------------------------------------------------------------------

function referenceFloor() {
  const im = readPNG(resolve(ROOT, band.source));
  const rects = cropRects(im, band.sampling.crops, band.sampling.size, band.sampling.seed, band.sampling.inset);
  const cs = rects.map((r) => crop(im, r.x, r.y, band.sampling.size, band.sampling.size));
  const H = cs.map((c) => histo(c));
  const S = cs.map((c) => structure(c));
  const ds = [];
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      if (overlaps(rects[i], rects[j], band.sampling.size)) continue;
      ds.push(Math.min(histoDist(H[i], H[j]), structureDist(S[i], S[j])));
    }
  }
  const s = Float64Array.from(ds).sort();
  return { pairs: ds.length, min: Number(s[0]), p05: pct(s, 0.05), p50: pct(s, 0.5) };
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

let determinism = null;
if (a.determinism && !a.only) {
  // Two separate render.mjs processes, same seed, byte-compared. Catches
  // Math.random(), Date.now(), iteration order — anything that makes the feed
  // unreproducible. A variety report on a nondeterministic generator measures
  // nondeterminism, so this runs first and is fatal.
  const p1 = render(seeds[0], join(outDir, '_det-a.png'));
  const p2 = render(seeds[0], join(outDir, '_det-b.png'));
  const A = readFileSync(p1), B = readFileSync(p2);
  determinism = { seed: seeds[0], identical: A.length === B.length && A.equals(B), bytesA: A.length, bytesB: B.length };
}

const results = [];
if (a.only) {
  results.push(analyse(a.only === 'generator' ? generatorSet()
    : a.only === 'refregions' ? refRegionSet() : transformSet(a.only)));
} else {
  results.push(analyse(generatorSet()));
  if (a.controls) {
    for (const c of CONTROLS) results.push(analyse(c === 'refregions' ? refRegionSet() : transformSet(c)));
  }
}

const floor = referenceFloor();
const gen = results.find((r) => r.label === 'generator') || results[0];
const positive = results.find((r) => r.label === 'refregions') || null;
const adversarial = results.filter((r) => ['same', 'jitter', 'recolour', 'hue'].includes(r.label));

// THE INVERSION TEST. If a variant set with ZERO real variety scores at or
// above the genuine positive control, the number is not a score — exactly the
// failure that killed the 60-metric fail count.
//
// Judged on three things, because the gate is a CONJUNCTION and a conjunction
// can survive a view that individually fails. Both views are reported per
// control so the weakness is visible, and the fatal check is whether any
// adversarial control would PASS THE WHOLE GATE.
const inversions = [];
let advWouldPass = [];
if (positive) {
  const floorRatio = positive.summary.medianRatio;
  for (const adv of adversarial) {
    if (adv.summary.medianRatio >= floorRatio) {
      inversions.push({ control: adv.label, view: 'medianRatio', fatal: false, adv: adv.summary.medianRatio, genuine: floorRatio });
    }
    // Genuine reference for the perceptual view is floor.p05 — the p05 of 3681
    // STRICTLY non-overlapping crop pairs of the reference. The positive
    // control's own min is a poor estimator here: at N=16 the artwork cannot
    // supply 16 disjoint crops, so its minimum is depressed by forced overlap.
    if (adv.summary.minPairDistance >= floor.p05) {
      inversions.push({ control: adv.label, view: 'minPairDistance', fatal: false, adv: adv.summary.minPairDistance, genuine: floor.p05 });
    }
    // The fatal case: this control clears BOTH halves of the shipped gate.
    if (adv.summary.medianRatio >= floorRatio && adv.summary.minPairDistance >= floor.p05) {
      advWouldPass.push(adv.label);
    }
  }
}
const gateUsable = !positive ? null : advWouldPass.length === 0;

const TREE_AFTER = treeHash().digest;
const torn = TREE_BEFORE !== TREE_AFTER;

// The floor the generator is actually judged against: the positive control's
// own ratio when it is available (it absorbs the small-N percentile bias), else
// the raw 1.000.
const effectiveFloor = positive ? positive.summary.medianRatio : 1;
const verdict = torn ? 'VOID (source tree moved mid-run)'
  : (determinism && !determinism.identical) ? 'NONDETERMINISTIC'
    : (gen.summary.medianRatio >= effectiveFloor && gen.summary.minPairDistance >= floor.p05) ? 'PASS' : 'FAIL';

const report = {
  version: 'variety-v1',
  treeDigest: TREE_BEFORE, treeDigestAfter: TREE_AFTER, torn,
  seeds, canvas: { w: a.w, h: a.h }, cropSize: a.size, cropSeed: a.cropSeed,
  band: a.band, familySources: familyFiles,
  determinism, referencePerceptualFloor: floor,
  effectiveFloor, inversionTest: { ran: !!positive, inversions, adversarialWouldPassGate: advWouldPass, gateUsableAsScore: gateUsable, positiveControlWorstOverlap: positive ? positive.worstOverlap : null },
  results, verdict,
};

if (a.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const f = (v, dp) => (Number.isFinite(v) ? v.toFixed(dp) : String(v));
  console.log(`# variety across ${a.seeds} variants, ${a.crops} fixed ${a.size}x${a.size} windows`);
  console.log(`# tree ${TREE_BEFORE}${torn ? ` -> ${TREE_AFTER}  *** TORN ***` : ''}`);
  console.log(`# floor  = p05..p95 width of ${band.source} (${band.sampling.crops} crops) — one artwork's own spread`);
  console.log(`# ceiling= p05..p95 width pooled over ${familyFiles.length} genuine artworks — the craft family's spread\n`);

  if (determinism) {
    console.log(determinism.identical
      ? `determinism: PASS — seed "${determinism.seed}" rendered twice in separate processes, byte-identical (${determinism.bytesA} bytes)`
      : `determinism: FAIL — ${determinism.bytesA} vs ${determinism.bytesB} bytes for the same seed`);
    console.log();
  }

  const sorted = gen.rows.slice().sort((x, y) => x.ratio - y.ratio);
  console.log(`# ${gen.label}: per-metric cross-seed spread, worst first`);
  console.log(table(
    ['metric', 'min', 'max', 'sd', 'cv', 'ourWidth', 'refWidth', 'ratio', 'ceil', 'verdict'],
    sorted.map((r) => [
      r.key, f(r.min, r.dp), f(r.max, r.dp), f(r.sd, Math.max(r.dp, 3)), f(r.cv, 3),
      f(r.crossSeedWidth, Math.max(r.dp, 3)), f(r.refWidth, Math.max(r.dp, 3)),
      f(r.ratio, 3), f(r.ceilRatio, 2), r.verdict,
    ]),
  ));
  console.log(`\nNARROW ${gen.summary.narrow}/60   WIDE ${gen.summary.wide}/60   FROZEN ${gen.summary.frozen}/60`);
  if (gen.summary.frozen) console.log(`frozen (identical on every seed at every window): ${gen.summary.frozenKeys.join(', ')}`);
  console.log(`median ratio: ${gen.summary.medianRatio.toFixed(3)}`);

  console.log('\n# perceptual variety — min pairwise distance across variants, per window');
  console.log(table(
    ['window', 'min pair', 'p05', 'median', 'closest pair', 'hist', 'struct'],
    gen.perceptual.map((p) => [
      `(${gen.windows[p.window].x},${gen.windows[p.window].y})`,
      p.min.toFixed(4), p.p05.toFixed(4), p.median.toFixed(4),
      `${p.worstPair.a} / ${p.worstPair.b}`, p.worstPair.hist.toFixed(4), p.worstPair.struct.toFixed(4),
    ]),
  ));
  console.log(`reference floor (${floor.pairs} NON-overlapping crop pairs of ${band.source}): min ${floor.min.toFixed(4)}  p05 ${floor.p05.toFixed(4)}  median ${floor.p50.toFixed(4)}`);

  if (results.length > 1) {
    console.log('\n# INVERSION TEST — adversarial controls (zero real variety) vs the genuine positive control');
    console.log(table(
      ['variant set', 'median ratio', 'NARROW/60', 'FROZEN/60', 'min pair dist'],
      results.slice().sort((x, y) => y.summary.medianRatio - x.summary.medianRatio).map((r) => [
        r.label + (r.label === 'refregions' ? '  (GENUINE)' : r.label === 'generator' ? '  (ours)' : '  (adversarial)'),
        r.summary.medianRatio.toFixed(3), r.summary.narrow, r.summary.frozen,
        r.summary.minPairDistance.toFixed(4),
      ]),
    ));
    if (!positive) console.log('\n(no positive control in this run — inversion test not performed)');
    else {
      console.log(`\npositive control: ${a.seeds} regions per window, min centre separation ${positive.achievedSep}px, ` +
        `worst pairwise crop overlap ${(100 * (positive.worstOverlap || 0)).toFixed(0)}% of area.`);
      console.log(`  The reference cannot supply ${a.seeds} fully disjoint ${a.size}px crops, so genuine spread is UNDERSTATED —`);
      console.log('  the positive control is a handicapped opponent and the generator still loses to it.');
      console.log(`  Perceptual comparisons therefore use the ${floor.pairs} STRICTLY non-overlapping reference pairs (p05 ${floor.p05.toFixed(4)}).`);
      if (gateUsable) {
        console.log('INVERSION TEST PASSED: no adversarial control clears both halves of the gate.');
      } else {
        console.log('\n*** INVERSION TEST FAILED — THE VARIETY NUMBER IS NOT A SCORE ***');
        console.log(`  these zero-variety controls would PASS the shipped gate: ${advWouldPass.join(', ')}`);
        console.log('  Fix the measure or retire it. Do not quote the number.');
      }
      const single = inversions.filter((iv) => !advWouldPass.includes(iv.control));
      if (single.length) {
        console.log('\n  single-view weaknesses (caught by the OTHER half of the gate, so not fatal — but do not');
        console.log('  quote either half on its own):');
        for (const iv of single) {
          console.log(`    "${iv.control}" scores ${iv.adv.toFixed(4)} on ${iv.view}, at or above genuine ${iv.genuine.toFixed(4)}`);
        }
      }
    }
    console.log(`\neffective floor = the positive control's own median ratio (${effectiveFloor.toFixed(3)}), NOT 1.000:`);
    console.log('  the band p05..p95 comes from 128 crops and a variety run has only ' + a.seeds +
      ', so every ratio reads low by a sample-size factor that has nothing to do with the generator.');
  }

  console.log(`\nVERDICT: ${verdict}`);
  if (!torn) console.log(`generator median ratio ${gen.summary.medianRatio.toFixed(3)} vs floor ${effectiveFloor.toFixed(3)}   |   min pair ${gen.summary.minPairDistance.toFixed(4)} vs floor ${floor.p05.toFixed(4)}`);
  console.log('Read the NARROW list, not the count: it names which axes of the scene are frozen.');
  process.exitCode = verdict === 'PASS' ? 0 : 1;
}
