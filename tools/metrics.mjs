#!/usr/bin/env node
// tools/metrics.mjs — the one shared measuring stick for Fixel's pixel half.
//
// WHY THIS FILE EXISTS
// The duel is blind and subjective: a fresh judge sees an unscaled 320x320 crop
// of the reference beside an unscaled 320x320 crop from inside a generated
// scene. Judges are expensive, slow, and noisy. This script is the objective
// half of the same test — it says how far the generator is from the reference
// BEFORE anyone asks a judge. If a number is out of band, the judge will pick
// the reference and we already know why.
//
// WHAT WE ARE ACTUALLY AFRAID OF
// Two failure modes, both of which a critic feels instantly but struggles to
// name: SPARSE (empty sky, big flat fills, long runs, nothing happening per
// tile) and REPETITIVE (the same 16x16 stamp pasted across the scene). Every
// metric below exists to put a number on one of those two, or on the third,
// quieter tell: SOFT EDGES (antialiasing / gradients), which is how a scene
// stops being pixel art even when it is dense.
//
// ANTI-GAMING NOTE (read before adding a metric)
// Every density metric here can be blown past with pure RGB noise. That is why
// every band is TWO-SIDED — a floor AND a ceiling. A noise field has
// changeRate ~1.0, run length ~1.0, thousands of colours per tile, and 24 live
// hue buckets: it fails the ceiling of nearly everything. Never relax a ceiling
// to make a generator pass a floor.
//
// DETERMINISM
// Crop positions come from src/core/rng.js seeded with --seed. Same seed, same
// crops, same numbers, in any process, on any machine. There is no
// Math.random() and no hardcoded crop list anywhere in this file.

import { readPNG, crop } from '../src/core/png.js';
import { Rng } from '../src/core/rng.js';
import { writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, basename, join } from 'node:path';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** Interpolated percentile over an already-sorted numeric array/typed array. */
export function pct(sorted, p) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return Number(sorted[0]);
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Number(sorted[lo]);
  return Number(sorted[lo]) + (Number(sorted[hi]) - Number(sorted[lo])) * (idx - lo);
}

/**
 * Pack RGBA into one uint32 so "is this the same colour" is an integer compare.
 * Alpha is part of the identity on purpose: a transparent hole and a black
 * pixel are not the same colour, and a generator that leaves holes should not
 * be able to hide them inside a colour count.
 */
function packKeys(img) {
  const n = img.w * img.h;
  const k = new Uint32Array(n);
  const d = img.data;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    k[i] = ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  }
  return k;
}

/** FNV-1a over a uint32 window, two different offset bases combined. */
function hashTile(keys, w, x0, y0, size) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let y = 0; y < size; y++) {
    let i = (y0 + y) * w + x0;
    for (let x = 0; x < size; x++, i++) {
      const v = keys[i];
      h1 = Math.imul(h1 ^ (v & 0xffff), 0x01000193) >>> 0;
      h1 = Math.imul(h1 ^ (v >>> 16), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (v >>> 8), 0x85ebca6b) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    }
  }
  // 64-ish bits of key space; collisions across ~15k tiles are negligible.
  return h1.toString(36) + ':' + h2.toString(36);
}

// ---------------------------------------------------------------------------
// the metrics
// ---------------------------------------------------------------------------

/**
 * changeRate — fraction of adjacent pixel pairs that differ, horizontally and
 * vertically.
 *
 * DETECTS: raw pixel density. This is the single most direct "is anything
 * happening" number. eBoy Pixoramas sit near 0.29 in both axes.
 * FAILS LOW: sparse — flat fills, empty sky, big untextured slabs.
 * FAILS HIGH: noise or dithering — a generator that sprinkles per-pixel jitter
 * to fake density lands at 0.7-1.0 and is instantly out the top of the band.
 * GAMEABLE BY: uniform noise (caught by the ceiling), and by a fine 1px
 * checkerboard (changeRate 1.0, caught by the ceiling and by runLen.mean ~1).
 */
function changeRate(keys, w, h) {
  let hd = 0;
  let vd = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 1; x < w; x++) if (keys[row + x] !== keys[row + x - 1]) hd++;
  }
  for (let y = 1; y < h; y++) {
    const row = y * w;
    const prev = row - w;
    for (let x = 0; x < w; x++) if (keys[row + x] !== keys[prev + x]) vd++;
  }
  const hp = (w - 1) * h;
  const vp = w * (h - 1);
  return {
    h: hd / hp,
    v: vd / vp,
    combined: (hd + vd) / (hp + vp),
  };
}

/**
 * runLen — horizontal run-length distribution.
 *
 * DETECTS: sparseness, with more resolution than changeRate. changeRate says
 * how often colour changes on average; runLen says whether the image is made of
 * lots of medium runs (dense detail) or a few enormous ones (a sky, a wall, a
 * road). The p90/p99 tail and the "fraction of pixels living inside runs longer
 * than 8/16" are the real sparseness detectors — a scene can hit the mean while
 * hiding a 300px-wide dead band.
 * FAILS LOW: mean below band = noise; every pixel is its own run.
 * FAILS HIGH: mean/p90/p99 above band, or too many pixels in long runs = flat.
 * NOTE: runLen.mean is close to 1/changeRate.h by construction. It is kept
 * because the percentiles are not, and because it makes the table readable.
 * GAMEABLE BY: breaking every long run with a single stray pixel — that fixes
 * the tail but not colorsPerTile, flatness, or the 3x3 measure.
 */
function runLen(keys, w, h) {
  const lens = [];
  let gt8 = 0;
  let gt16 = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let run = 1;
    for (let x = 1; x <= w; x++) {
      if (x < w && keys[row + x] === keys[row + x - 1]) {
        run++;
      } else {
        lens.push(run);
        if (run > 8) gt8 += run;
        if (run > 16) gt16 += run;
        run = 1;
      }
    }
  }
  const arr = Float64Array.from(lens).sort();
  const total = w * h;
  return {
    mean: total / arr.length,
    median: pct(arr, 0.5),
    p90: pct(arr, 0.9),
    p99: pct(arr, 0.99),
    fracGt8: gt8 / total,
    fracGt16: gt16 / total,
  };
}

/**
 * colorsPerTile — distinct colours inside each non-overlapping 16x16 and 32x32
 * tile.
 *
 * DETECTS: local richness. This is the metric that most closely matches what a
 * judge means by "dense". A Pixorama has many small objects in every tile, so
 * every tile carries a lot of distinct colours; a sparse generator has tiles
 * that are one roof and one shadow.
 * FAILS LOW: monotone / empty tiles.
 * FAILS HIGH: gradients or antialiasing manufacturing dozens of near-identical
 * colours per tile — which is why the ceiling matters as much as the floor.
 * GAMEABLE BY: per-tile colour jitter (raises colorsPerTile without adding
 * structure) — caught by edge.fracSoft and by the changeRate ceiling.
 */
function colorsPerTile(keys, w, h, size) {
  const tx = Math.floor(w / size);
  const ty = Math.floor(h / size);
  if (tx === 0 || ty === 0) return { mean: 0, median: 0 };
  const counts = new Float64Array(tx * ty);
  const seen = new Set();
  let t = 0;
  for (let j = 0; j < ty; j++) {
    for (let i = 0; i < tx; i++) {
      seen.clear();
      for (let y = 0; y < size; y++) {
        let p = (j * size + y) * w + i * size;
        for (let x = 0; x < size; x++, p++) seen.add(keys[p]);
      }
      counts[t++] = seen.size;
    }
  }
  let sum = 0;
  for (let i = 0; i < counts.length; i++) sum += counts[i];
  const sorted = counts.slice().sort();
  return { mean: sum / counts.length, median: pct(sorted, 0.5) };
}

/**
 * paletteConcentration — total distinct colours, and how many distinct colours
 * are needed to cover 50% / 90% / 99% of pixels.
 *
 * DETECTS: "few hues doing a LOT of work". The reference is not low-colour in
 * the total sense — it is low-colour in the sense that a small set of hues
 * covers most of the frame while a long thin tail supplies detail. n50/n90 is
 * the shape of that curve.
 * FAILS LOW (n50/n90): one colour eating the frame — a dead sky, a flat ground
 * plane. FAILS HIGH: no palette discipline; photographic/AA colour soup.
 * top1Share is the blunt version: what fraction of the image is the single most
 * common colour.
 * GAMEABLE BY: quantising noise to a fixed palette — passes n50/n90 and the
 * distinct ceiling, but fails runLen (all runs of 1) and flatness (nothing
 * flat at all).
 */
function paletteConcentration(keys) {
  const hist = new Map();
  for (let i = 0; i < keys.length; i++) hist.set(keys[i], (hist.get(keys[i]) || 0) + 1);
  const counts = Array.from(hist.values()).sort((a, b) => b - a);
  const total = keys.length;
  const need = (frac) => {
    let acc = 0;
    for (let i = 0; i < counts.length; i++) {
      acc += counts[i];
      if (acc / total >= frac) return i + 1;
    }
    return counts.length;
  };
  return {
    distinct: counts.length,
    n50: need(0.5),
    n90: need(0.9),
    n99: need(0.99),
    top1Share: counts[0] / total,
  };
}

const SAT_MIN = 0.15; // below this a pixel is treated as grey
const VAL_MIN = 0.10; // hue is meaningless in near-black; exclude it

/**
 * hueCount — how many 15-degree hue buckets hold at least 1% of the chromatic
 * pixels, plus mean saturation and the near-grey fraction.
 *
 * DETECTS: "few hues". A Pixorama reads as a coherent palette: a handful of
 * strong hue families plus a lot of structural grey/concrete. A generator that
 * picks random RGB per object lights up all 24 buckets and reads as clown vomit
 * even when its density numbers are perfect.
 * FAILS LOW: monochrome / two-tone; nothing to look at.
 * FAILS HIGH: rainbow soup — no palette identity.
 * The 1% threshold is deliberately coarse: it counts hue FAMILIES that actually
 * carry area, not stray pixels.
 * GAMEABLE BY: hue-quantising a noise field. Caught elsewhere.
 */
function hueStats(img) {
  const d = img.data;
  const n = img.w * img.h;
  const buckets = new Float64Array(24);
  let chromatic = 0;
  let grey = 0;
  let satSum = 0;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const r = d[o], g = d[o + 1], b = d[o + 2];
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    satSum += s;
    if (s < SAT_MIN || v < VAL_MIN) { grey++; continue; }
    chromatic++;
    const c = mx - mn;
    let hdeg;
    if (mx === r) hdeg = 60 * (((g - b) / c) % 6);
    else if (mx === g) hdeg = 60 * ((b - r) / c + 2);
    else hdeg = 60 * ((r - g) / c + 4);
    if (hdeg < 0) hdeg += 360;
    buckets[Math.min(23, Math.floor(hdeg / 15))]++;
  }
  let live = 0;
  if (chromatic > 0) for (let i = 0; i < 24; i++) if (buckets[i] / chromatic >= 0.01) live++;
  return {
    buckets1pct: live,
    meanSat: satSum / n,
    fracNearGrey: grey / n,
  };
}

const SOFT_MAX = 24; // RGB L2 below this: an antialiasing/gradient step
const HARD_MIN = 72; // RGB L2 above this: a deliberate pixel-art edge

/**
 * edgeHardness — the RGB L2 delta distribution across every differing adjacent
 * pair.
 *
 * DETECTS: whether edges are drawn or rendered. Hand-placed pixel art has a
 * bimodal delta distribution: a big population of hard jumps (object against
 * object) and a modest population of small steps (a two-step shading ramp
 * inside one material). Antialiasing, bilinear scaling, or any gradient fill
 * produces a FAT low-delta population — that fat low bin is the signature of
 * "this was rendered and resampled, not placed".
 * FAILS HIGH (fracSoft): antialiased / scaled / gradient output. This is the
 * loud failure.
 * FAILS LOW (fracSoft): also real, but quieter — zero soft transitions means no
 * shading vocabulary at all, everything is flat poster colour.
 * GAMEABLE BY: nothing cheap. You cannot post-process AA away without changing
 * the pixels, and dithering to fake hardness wrecks runLen and flatness.
 */
function edgeHardness(img, keys) {
  const { w, h, data: d } = img;
  let soft = 0, hard = 0, n = 0, sum = 0;
  const acc = (a, b) => {
    const oa = a * 4, ob = b * 4;
    const dr = d[oa] - d[ob], dg = d[oa + 1] - d[ob + 1], db = d[oa + 2] - d[ob + 2];
    const delta = Math.sqrt(dr * dr + dg * dg + db * db);
    n++; sum += delta;
    if (delta < SOFT_MAX) soft++;
    else if (delta > HARD_MIN) hard++;
  };
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 1; x < w; x++) if (keys[row + x] !== keys[row + x - 1]) acc(row + x, row + x - 1);
  }
  for (let y = 1; y < h; y++) {
    const row = y * w, prev = row - w;
    for (let x = 0; x < w; x++) if (keys[row + x] !== keys[prev + x]) acc(row + x, prev + x);
  }
  if (n === 0) return { fracSoft: 0, fracHard: 0, meanDelta: 0 };
  return { fracSoft: soft / n, fracHard: hard / n, meanDelta: sum / n };
}

/**
 * tileRepeat — hash every 16x16 tile at every 8px stride; report the fraction
 * of tiles whose hash is not unique and the largest single hash cluster.
 *
 * DETECTS: a stamped generator. The most likely shape of our first real output
 * is "pick a building from a table, paste it on a grid" — which produces
 * hundreds of byte-identical tiles. The 8px stride matters: a stride equal to
 * the tile size would miss a stamp that lands on a half-offset.
 * FAILS HIGH: repetitive. This is the direction that matters.
 * FAILS LOW: not a real failure — a fully unique image is fine. The floor is
 * kept in the band anyway (per project rule: all bands two-sided) but is
 * flagged one-sided in the band file, and a low reading should be read as
 * "no evidence of stamping", not as a defect.
 * BLIND SPOT (be honest): this is an EXACT-match hash. A generator that
 * recolours the same silhouette per instance, or jitters one pixel per stamp,
 * reads as fully unique here while still looking repetitive to a judge. This is
 * the weakest metric in the set. A perceptual-hash or autocorrelation version
 * would be strictly better.
 */
function tileRepeat(keys, w, h, size = 16, stride = 8) {
  if (w < size || h < size) return { fracNonUnique: 0, largestCluster: 0 };
  const counts = new Map();
  let total = 0;
  for (let y = 0; y + size <= h; y += stride) {
    for (let x = 0; x + size <= w; x += stride) {
      const k = hashTile(keys, w, x, y, size);
      counts.set(k, (counts.get(k) || 0) + 1);
      total++;
    }
  }
  let dup = 0, max = 0;
  for (const c of counts.values()) {
    if (c > 1) dup += c;
    if (c > max) max = c;
  }
  return { fracNonUnique: dup / total, largestCluster: max / total };
}

/**
 * flatness — fraction of pixels whose full 3x3 neighbourhood is a single
 * colour, and the largest 4-connected same-colour region as a fraction of the
 * image.
 *
 * DETECTS: dead area. frac3x3 is the diffuse version (how much of the frame is
 * interior-of-a-flat-fill); largestRegion is the acute version (is there ONE
 * enormous empty sky / ground slab). A scene can pass changeRate on average and
 * still have a 40%-of-frame blank region — largestRegion catches exactly that.
 * FAILS HIGH: sparse. This is the direction that matters for both.
 * FAILS LOW: frac3x3 at zero means literally nothing is flat, i.e. noise; the
 * floor is real. largestRegion has no meaningful floor and is flagged
 * one-sided in the band file.
 * GAMEABLE BY: sprinkling isolated pixels into big flats — kills frac3x3 and
 * largestRegion cheaply while the area still reads as empty. Cross-check with
 * colorsPerTile and vGrad before trusting a pass here.
 */
function flatness(keys, w, h) {
  let flat = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const k = keys[i];
      if (
        keys[i - 1] === k && keys[i + 1] === k &&
        keys[i - w] === k && keys[i - w - 1] === k && keys[i - w + 1] === k &&
        keys[i + w] === k && keys[i + w - 1] === k && keys[i + w + 1] === k
      ) flat++;
    }
  }
  // largest 4-connected same-colour region, iterative flood fill
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let best = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const k = keys[s];
    let sp = 0, size = 0;
    stack[sp++] = s;
    seen[s] = 1;
    while (sp > 0) {
      const i = stack[--sp];
      size++;
      const x = i % w;
      if (x > 0 && !seen[i - 1] && keys[i - 1] === k) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && !seen[i + 1] && keys[i + 1] === k) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (i >= w && !seen[i - w] && keys[i - w] === k) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (i < n - w && !seen[i + w] && keys[i + w] === k) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    if (size > best) best = size;
  }
  const inner = Math.max(1, (w - 2) * (h - 2));
  return { frac3x3: flat / inner, largestRegion: best / n };
}

/**
 * vGrad — local activity as a function of row, and of column.
 *
 * DETECTS: a dead sky band (or a dead margin). Per-row activity is the change
 * rate WITHIN the row plus the change rate between it and the next row —
 * combined, because a dead band is flat in both axes and a pure row-to-row
 * measure would score a horizontally striped sky as active.
 * The headline is min64: the lowest mean activity over any 64 consecutive rows.
 * A scene with a big empty sky has a 64-row window far below its own image
 * mean, so min64Ratio (min64 / mean) collapses towards 0 even when the image
 * mean looks healthy.
 * FAILS LOW: dead band — sparse composition, the classic "city at the bottom,
 * gradient sky on top" mistake.
 * FAILS HIGH: not really a failure; a high min64Ratio just means the frame is
 * uniformly busy. Flagged one-sided in the band file.
 * GAMEABLE BY: putting noise in the sky. Caught by the changeRate ceiling and
 * by edge.fracHard.
 */
function vGrad(keys, w, h, band = 64) {
  const rowAct = new Float64Array(Math.max(0, h - 1));
  for (let y = 0; y < h - 1; y++) {
    const row = y * w, next = row + w;
    let c = 0;
    for (let x = 1; x < w; x++) if (keys[row + x] !== keys[row + x - 1]) c++;
    for (let x = 0; x < w; x++) if (keys[next + x] !== keys[row + x]) c++;
    rowAct[y] = c / (w - 1 + w);
  }
  const colAct = new Float64Array(Math.max(0, w - 1));
  for (let x = 0; x < w - 1; x++) {
    let c = 0;
    for (let y = 1; y < h; y++) if (keys[y * w + x] !== keys[(y - 1) * w + x]) c++;
    for (let y = 0; y < h; y++) if (keys[y * w + x + 1] !== keys[y * w + x]) c++;
    colAct[x] = c / (h - 1 + h);
  }
  const summarise = (a) => {
    if (a.length === 0) return { mean: 0, min: 0, ratio: 1 };
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i];
    const mean = sum / a.length;
    const bw = Math.min(band, a.length);
    let win = 0;
    for (let i = 0; i < bw; i++) win += a[i];
    let min = win;
    for (let i = bw; i < a.length; i++) { win += a[i] - a[i - bw]; if (win < min) min = win; }
    const minMean = min / bw;
    return { mean, min: minMean, ratio: mean > 0 ? minMean / mean : 1 };
  };
  const r = summarise(rowAct);
  const c = summarise(colAct);
  return {
    rowMean: r.mean, rowMin64: r.min, rowMin64Ratio: r.ratio,
    colMean: c.mean, colMin64: c.min, colMin64Ratio: c.ratio,
  };
}

// ---------------------------------------------------------------------------
// v2: STRUCTURAL metrics
//
// Everything above this line counts how often pixels differ. None of it can
// tell isometric architecture from a dense field of correctly-coloured
// confetti. The metrics below describe how the reference builds a SOLID OBJECT:
// the slope of its staircases, the flatness of its facets, the 1px near-black
// outline system, and the fixed luma ladder across the three visible faces.
// A generator can sit inside every v1 band and fail all of these.
// ---------------------------------------------------------------------------

/**
 * Per-pixel derived channels, computed once and shared by the structural
 * metrics. Kept separate from packKeys() so the v1 metrics keep producing
 * byte-identical numbers against band-pixel-v1.
 *
 * luma is Rec.601. hue is -1 for achromatic pixels (max === min).
 */
function derive(img) {
  const n = img.w * img.h;
  const d = img.data;
  const keys = new Uint32Array(n);
  const luma = new Float32Array(n);
  const hue = new Float32Array(n);
  const sat = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const r = d[o], g = d[o + 1], b = d[o + 2];
    keys[i] = ((r << 24) | (g << 16) | (b << 8) | d[o + 3]) >>> 0;
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    sat[i] = mx === 0 ? 0 : (mx - mn) / mx;
    if (mx === mn) { hue[i] = -1; continue; }
    const c = mx - mn;
    let hd;
    if (mx === r) hd = 60 * (((g - b) / c) % 6);
    else if (mx === g) hd = 60 * ((b - r) / c + 2);
    else hd = 60 * ((r - g) / c + 4);
    if (hd < 0) hd += 360;
    hue[i] = hd;
  }
  return { keys, luma, hue, sat };
}

/** Circular hue distance in degrees, 0..180. */
function hueDist(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
/** Signed circular hue delta b-a, wrapped to (-180, 180]. */
function hueDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

const DARK_LUMA = 45;   // BAR's near-black threshold; the outline system lives below it
const SAME_HUE_DEG = 20; // two colours within this are treated as one material
const LADDER_HUE_DEG = 12; // tighter gate for the face-shading ladder

/**
 * slope — the staircase histogram, and the row-shift correlation of the
 * outline mask.
 *
 * WHAT IT CATCHES: a fake isometric. 2:1 dimetric geometry draws every diagonal
 * as a staircase of horizontal runs stepping one row at a time; the run length
 * IS the slope. A pure-2:1 generator votes ~100% at 2:1 and reads mechanical;
 * a 3D render with a non-orthographic camera, or a hand-drawn 30-degree
 * isometric, spreads across buckets or drifts at the frame edges.
 *
 * DEFINITION (mine, stated because it will differ from other readers'):
 * B[y][x] = 1 where pixel (x,y) differs from (x,y+1) — the set of horizontal
 * region boundaries. Maximal horizontal runs of B are found per row and linked
 * to the next row only on STRICT adjacency: a run [x0,x1] links right to a run
 * starting exactly at x1+1, or left to a run ending exactly at x0-1. A chain of
 * >= 4 linked runs in a consistent direction is a monotone staircase, and every
 * run in it votes its own length. Vertical edges (same x each row) and
 * horizontal edges (one long run, no chain) never form chains, so they are
 * excluded automatically.
 *
 * This works on ANY colour boundary rather than only near-black outlines, so it
 * still reads on the horse, which has no pure black.
 *
 * FAILS LOW on r2 (no dimetric discipline; a soup of angles).
 * FAILS HIGH on r2 (100% 2:1 = mechanical; the reference deliberately keeps
 * 14.5% at 1:1 for gables, hips and organic forms).
 * GAMEABLE BY: drawing deliberate 1:1 noise edges without drawing actual
 * gables. Nothing here checks that the 1:1 population is meaningful geometry.
 */
function slopeStats(keys, luma, w, h) {
  const votes = [0, 0, 0, 0, 0]; // index 0..3 => run length 1..4, index 4 => 5+
  if (h < 6 || w < 6) return { r1: 0, r2: 0, r3: 0, r4: 0, r5plus: 0, chains: 0 };

  // maximal runs of the horizontal-boundary mask, per row
  const rows = [];
  for (let y = 0; y < h - 1; y++) {
    const x0s = [], x1s = [];
    let x = 0;
    const base = y * w, next = base + w;
    while (x < w) {
      if (keys[base + x] !== keys[next + x]) {
        const s = x;
        while (x < w && keys[base + x] !== keys[next + x]) x++;
        x0s.push(s); x1s.push(x - 1);
      } else x++;
    }
    // lookup: which run starts at x / ends at x
    const byStart = new Map(), byEnd = new Map();
    for (let i = 0; i < x0s.length; i++) { byStart.set(x0s[i], i); byEnd.set(x1s[i], i); }
    rows.push({ x0s, x1s, byStart, byEnd });
  }

  let chains = 0;
  for (const dir of [1, -1]) {
    const used = rows.map((r) => new Uint8Array(r.x0s.length));
    for (let y = 0; y < rows.length; y++) {
      for (let i = 0; i < rows[y].x0s.length; i++) {
        if (used[y][i]) continue;
        // follow the chain downward
        const lens = [];
        let cy = y, ci = i;
        while (true) {
          used[cy][ci] = 1;
          lens.push(rows[cy].x1s[ci] - rows[cy].x0s[ci] + 1);
          if (cy + 1 >= rows.length) break;
          const nxt = dir === 1
            ? rows[cy + 1].byStart.get(rows[cy].x1s[ci] + 1)
            : rows[cy + 1].byEnd.get(rows[cy].x0s[ci] - 1);
          if (nxt === undefined || used[cy + 1][nxt]) break;
          cy++; ci = nxt;
        }
        if (lens.length >= 4) {
          chains++;
          for (const L of lens) votes[Math.min(5, L) - 1]++;
        }
      }
    }
  }

  const all = votes.reduce((a, b) => a + b, 0);
  // BAR normalises the vote over buckets 1..4 (its four numbers sum to 100.0),
  // so we report r1..r4 the same way and carry r5plus separately as a share of
  // ALL votes. Reported both ways so neither reader has to guess.
  const q = votes[0] + votes[1] + votes[2] + votes[3];
  return {
    r1: q ? votes[0] / q : 0,
    r2: q ? votes[1] / q : 0,
    r3: q ? votes[2] / q : 0,
    r4: q ? votes[3] / q : 0,
    r5plus: all ? votes[4] / all : 0,
    chains,
  };
}

/**
 * Row-shift correlation of the near-black outline mask. O[y] correlated with
 * O[y+1] shifted by dx. A 2:1 staircase puts its off-diagonal maximum at
 * dx = +/-2; a 1:1 (30-degree) isometric would put it at +/-1; a perspective
 * camera smears it and drifts it across the frame.
 * FAILS LOW on corr2v1 / corr2v3 (below 1 = the wrong projection).
 * FAILS HIGH: an implausibly clean ratio means an over-regular generator.
 */
function outlineCorr(luma, w, h, thr = DARK_LUMA) {
  const C = new Float64Array(9); // dx = -4..+4
  for (let y = 0; y < h - 1; y++) {
    const a = y * w, b = a + w;
    for (let x = 0; x < w; x++) {
      if (luma[a + x] >= thr) continue;
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        if (luma[b + xx] < thr) C[dx + 4]++;
      }
    }
  }
  const g = (dx) => C[dx + 4];
  const sum = C.reduce((a, b) => a + b, 0);
  const p1 = g(1) + g(-1), p2 = g(2) + g(-2), p3 = g(3) + g(-3);
  return {
    corr2v1: p1 > 0 ? p2 / p1 : 0,
    corr2v3: p3 > 0 ? p2 / p3 : 0,
    corrDx0Share: sum > 0 ? g(0) / sum : 0,
  };
}

/**
 * flat5x5 — fraction of pixels whose entire 5x5 neighbourhood is one colour.
 *
 * BAR calls this the one number that separates real pixel art from everything
 * pretending, and it is right: a downsampled 3D render, a JPEG round-trip or a
 * diffusion output scores ~0-2% because none of them can hold 25 pixels at
 * exactly one value.
 *
 * THE POINT IS THE TENSION, NOT THE LEVEL. This is NOT "keep flatness low".
 * The reference holds ~17% of its frame in totally flat 5x5 blocks WHILE its
 * change rate is 0.29. Both bounds are real failures: low = rendered/resampled
 * mush, high = sparse. It must be read together with changeRate, never alone.
 */
function flat5x5(keys, w, h) {
  if (w < 5 || h < 5) return 0;
  let flat = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const k = keys[y * w + x];
      let ok = true;
      for (let j = -2; j <= 2 && ok; j++) {
        const row = (y + j) * w + x;
        for (let i = -2; i <= 2; i++) if (keys[row + i] !== k) { ok = false; break; }
      }
      if (ok) flat++;
    }
  }
  return flat / ((w - 4) * (h - 4));
}

/**
 * dither — 2x2 checkerboard rate, over every sliding 2x2 window.
 *
 * WHAT IT CATCHES: manufactured density. A generator can hit changeRate 0.29
 * and colorsPerTile 8.7 purely by dithering between two tones, pass every v1
 * gate, and read as mush to a judge. eBoy adds a palette step instead of
 * dithering between two, so the reference sits near 2% — incidental 1px detail,
 * not ramps.
 * FAILS HIGH: dithered mush. This is the direction that matters.
 * FAILS LOW: not a real defect; flagged one-sided.
 */
function ditherRate(keys, w, h) {
  if (w < 2 || h < 2) return 0;
  let n = 0;
  for (let y = 0; y < h - 1; y++) {
    const a = y * w, b = a + w;
    for (let x = 0; x < w - 1; x++) {
      const p00 = keys[a + x], p01 = keys[a + x + 1];
      if (p00 === p01) continue;
      if (keys[b + x] === p01 && keys[b + x + 1] === p00) n++;
    }
  }
  return n / ((w - 1) * (h - 1));
}

/**
 * outline — the near-black outline system as a measurable object.
 *
 * (a) darkShare: share of canvas below luma 45. Dense eBoy scenes share ONE
 *     near-black at 8-16% of canvas. Low = no outline system (everything reads
 *     as untethered flat shapes); high = a murky scene.
 * (b) run1Share / run12Share: horizontal run lengths of the dark mask. Outlines
 *     are exactly 1px, and a 1px line at 2:1 necessarily reads as a 2px
 *     horizontal run, so lengths 1 and 2 dominate. Runs >= 3 are genuinely dark
 *     materials. High run12Share = correct; low = fat outlines or dark blobs.
 *     Reported both run-weighted and pixel-weighted, because it is not obvious
 *     which BAR meant and the two differ a lot.
 * (c) blackMediatedDiff / blackMediatedSame: the discrimination number. What
 *     fraction of transitions between DIFFERENT materials are mediated by
 *     near-black, versus between two faces of the SAME material. The reference
 *     biases black to object-vs-object boundaries; face junctions inside one
 *     object more often get only a value step.
 *
 * HONEST LIMITATION ON (c) — READ THIS BEFORE TRUSTING THE NUMBER.
 * "Material" is not recoverable from pixels. What I actually measure is HUE
 * PROXIMITY: two colours within 20 degrees of hue (or both achromatic) are
 * called the same material, anything else different. That is a proxy and it is
 * wrong in two known ways: it cannot separate "two faces of one grey building"
 * from "two different grey materials" (all greys collapse together), and it
 * calls a deliberately two-tone object two materials. The direction of the
 * effect is still informative, so the metric reported is `mediationGap` =
 * diff - same, which survives some of the classification error; the absolute
 * levels should be trusted less than the gap.
 */
function outlineStats(keys, luma, hue, sat, w, h) {
  const n = w * h;
  const isDark = (i) => luma[i] < DARK_LUMA;
  let dark = 0;
  for (let i = 0; i < n; i++) if (isDark(i)) dark++;

  // horizontal dark-run lengths
  let runs = 0, runs1 = 0, runs2 = 0, pix = 0, pix12 = 0;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let x = 0;
    while (x < w) {
      if (!isDark(base + x)) { x++; continue; }
      const s = x;
      while (x < w && isDark(base + x)) x++;
      const L = x - s;
      runs++; pix += L;
      if (L === 1) runs1++;
      if (L === 2) runs2++;
      if (L <= 2) pix12 += L;
    }
  }

  // same-material vs different-material, direct vs black-mediated
  const sameMat = (i, j) => {
    const si = sat[i] >= 0.15, sj = sat[j] >= 0.15;
    if (!si && !sj) return true;          // two neutrals: assumed one material
    if (si !== sj) return false;          // neutral vs chromatic
    return hueDist(hue[i], hue[j]) <= SAME_HUE_DEG;
  };
  let dDiff = 0, dSame = 0, mDiff = 0, mSame = 0;
  const scan = (idx, len, step) => {
    let p = 0;
    while (p < len) {
      const i = idx(p);
      if (isDark(i)) {
        const s = p;
        while (p < len && isDark(idx(p))) p++;
        // mediated transition: the non-dark pixels flanking this dark run
        if (s - 1 >= 0 && p < len) {
          const L = idx(s - 1), R = idx(p);
          if (keys[L] !== keys[R]) { if (sameMat(L, R)) mSame++; else mDiff++; }
        }
        continue;
      }
      // direct transition between two non-dark, differing neighbours
      if (p + 1 < len) {
        const j = idx(p + 1);
        if (!isDark(j) && keys[i] !== keys[j]) { if (sameMat(i, j)) dSame++; else dDiff++; }
      }
      p++;
    }
  };
  for (let y = 0; y < h; y++) scan((p) => y * w + p, w, 1);
  for (let x = 0; x < w; x++) scan((p) => p * w + x, h, w);

  const fDiff = (mDiff + dDiff) > 0 ? mDiff / (mDiff + dDiff) : 0;
  const fSame = (mSame + dSame) > 0 ? mSame / (mSame + dSame) : 0;
  return {
    darkShare: dark / n,
    run1Share: runs ? runs1 / runs : 0,
    run12Share: runs ? (runs1 + runs2) / runs : 0,
    run12PixShare: pix ? pix12 / pix : 0,
    blackMediatedDiff: fDiff,
    blackMediatedSame: fSame,
    mediationGap: fDiff - fSame,
  };
}

/**
 * shade — the face ladder.
 *
 * Between two adjacent faces of the same material, eBoy steps LUMA and leaves
 * HUE alone. Sampling every adjacent pair that shares a hue (within 12 degrees),
 * excluding outline pixels, gives the ladder: the median luma ratio is the step
 * size, and the median hue rotation across that step should be ~0.
 *
 * The hue-rotation number is the load-bearing one and it is a direct spec for
 * the generator's palette: procedural shaders almost always rotate toward blue
 * in shadow (multiply by a cool light colour, or lerp in HSV), and the
 * reference does not. `hueRotAbsMedian` is the gate to actually use, because a
 * generator that rotates +8 degrees on half its faces and -8 on the other half
 * would show a median near zero while being visibly wrong.
 * FAILS on lumaRatio in both directions: too high = no readable face
 * separation, too low = crushed contrast. FAILS HIGH on hueRotAbsMedian.
 */
function shadeStats(keys, luma, hue, sat, w, h) {
  const ratios = [];
  const rots = [];
  let pairs = 0;
  const consider = (i, j) => {
    pairs++;
    if (keys[i] === keys[j]) return;
    if (luma[i] < DARK_LUMA || luma[j] < DARK_LUMA) return; // not an outline step
    if (sat[i] < 0.15 || sat[j] < 0.15) return;             // hue must be defined
    if (hueDist(hue[i], hue[j]) > LADDER_HUE_DEG) return;   // must be one material
    const lo = luma[i] < luma[j] ? i : j;
    const hi = lo === i ? j : i;
    if (luma[hi] <= 0) return;
    const r = luma[lo] / luma[hi];
    if (r < 0.3 || r > 0.97) return; // exclude identical-value and black-vs-colour
    ratios.push(r);
    rots.push(hueDelta(hue[hi], hue[lo])); // rotation introduced by going darker
  };
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) consider(y * w + x, y * w + x - 1);
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) consider(y * w + x, (y - 1) * w + x);
  if (ratios.length === 0) {
    return { lumaRatioMedian: 0, lumaRatioP25: 0, lumaRatioP75: 0, hueRotMedian: 0, hueRotAbsMedian: 0, sampleShare: 0 };
  }
  const rs = Float64Array.from(ratios).sort();
  const ro = Float64Array.from(rots).sort();
  const ra = Float64Array.from(rots.map(Math.abs)).sort();
  return {
    lumaRatioMedian: pct(rs, 0.5),
    lumaRatioP25: pct(rs, 0.25),
    lumaRatioP75: pct(rs, 0.75),
    hueRotMedian: pct(ro, 0.5),
    hueRotAbsMedian: pct(ra, 0.5),
    sampleShare: ratios.length / Math.max(1, pairs),
  };
}

/**
 * Perceptual tile repeat — the fix for the blind spot I flagged in v1.
 *
 * v1 hashes 16x16 tiles exactly, so a generator that recolours each stamp or
 * jitters one pixel reads as fully unique. Here each tile is reduced to a
 * 64-bit dHash over LUMA: box-downsample 16x16 -> 8x8, then one bit per
 * horizontal neighbour comparison (cyclic). Comparing SIGNS of luma gradients
 * makes the descriptor invariant to any global brightness or contrast change
 * and largely invariant to recolouring, and the 2x2 box downsample absorbs
 * 1px jitter. Two tiles match if their Hamming distance is <= 6 of 64.
 *
 * Tiles are enumerated at stride 8 (to catch half-offset stamps) but only
 * SPATIALLY NON-OVERLAPPING pairs are compared — at stride 8 neighbouring tiles
 * share half their pixels and would otherwise all match each other trivially.
 *
 * FAILS HIGH: a stamped or near-stamped generator. One-sided in practice.
 * THRESHOLD, chosen by sweep rather than taste: at Hamming <= 4 the reference
 * reads 0.159 while a per-instance-recoloured stamp and a per-instance 1px-
 * jittered stamp both read 1.000 (the v1 exact hash caught only 0.143 and
 * 0.583 of those). Hamming <= 6 raised the reference to 0.258 for no gain in
 * separation. A luma-variance gate on near-flat tiles was tried and dropped:
 * it moved the reference only 0.258 -> 0.253, so the reference's residual
 * self-similarity is REAL repeated structure (windows, brick, kerbs at 16px),
 * not degenerate hashing of flat tiles. Read this metric by its ceiling.
 * REMAINING BLIND SPOT: a stamp that is mirrored, rotated, or re-silhouetted
 * still reads as unique. This is better than v1, not complete.
 */
function popcount32(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >> 24) & 0xff;
}

function tileRepeatPerceptual(luma, w, h, size = 16, stride = 8, maxHamming = 4) {
  if (w < size || h < size) return { pNearDupFrac: 0, pMaxCluster: 0 };
  const hi = [], lo = [], px = [], py = [];
  const cell = new Float64Array(64);
  const half = size >> 1; // 16 -> 8x8 grid of 2x2 boxes
  for (let y = 0; y + size <= h; y += stride) {
    for (let x = 0; x + size <= w; x += stride) {
      cell.fill(0);
      for (let j = 0; j < size; j++) {
        const row = (y + j) * w + x;
        const cj = (j >> 1) * 8;
        for (let i = 0; i < size; i++) cell[cj + (i >> 1)] += luma[row + i];
      }
      let a = 0, b = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const bit = cell[j * 8 + i] > cell[j * 8 + ((i + 1) & 7)] ? 1 : 0;
          const idx = j * 8 + i;
          if (idx < 32) a |= bit << idx; else b |= bit << (idx - 32);
        }
      }
      hi.push(a >>> 0); lo.push(b >>> 0); px.push(x); py.push(y);
      void half;
    }
  }
  const n = hi.length;
  const matches = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // ignore pairs whose 16x16 footprints overlap
      if (Math.abs(px[i] - px[j]) < size && Math.abs(py[i] - py[j]) < size) continue;
      const d = popcount32(hi[i] ^ hi[j]) + popcount32(lo[i] ^ lo[j]);
      if (d <= maxHamming) { matches[i]++; matches[j]++; }
    }
  }
  let dup = 0, max = 0;
  for (let i = 0; i < n; i++) { if (matches[i] > 0) dup++; if (matches[i] > max) max = matches[i]; }
  return { pNearDupFrac: dup / n, pMaxCluster: (max + 1) / n };
}

/**
 * edgeAA — a TRUE antialiasing detector, as distinct from the low-contrast rate.
 *
 * WHY THIS EXISTS: `edge.fracSoft` (now `edge.fracLowContrast`) thresholds an
 * absolute RGB L2 delta at 24 and calls anything below it "soft". That is a
 * claim about CONTRAST, not about antialiasing, and the two come apart badly.
 * A deliberately hard-edged control with a two-step checkerboard ground of
 * (90,92,96) vs (78,80,84) — L2 delta 20.8, zero blended pixels anywhere —
 * scores 0.31 on the low-contrast rate. Reporting that as "the generator is
 * antialiasing" would be flatly false. So the two claims are now two metrics.
 *
 * DEFINITION (BAR's): a dark->light transition measured 2px apart, with a
 * genuine mid-tone pixel sitting between. For each collinear triple
 * (p-1, p, p+1): if |luma(p+1) - luma(p-1)| >= 60 it is a real value step, and
 * it counts as antialiased if luma(p) lies strictly between the two with a
 * margin of at least 25% of the step from EACH side. The margin is what keeps
 * the three-face shading ladder out: at the edge of a middle face the centre
 * pixel equals one of its neighbours, so the margin test rejects it.
 *
 * Blending, bilinear scaling, and a JPEG round-trip all create exactly this
 * 1px intermediate; hand-placed pixel art does not.
 * FAILS HIGH: the image was rendered/resampled rather than placed.
 * FAILS LOW: not a defect — 0% is the ideal. One-sided.
 * KNOWN FALSE POSITIVE: a shading ladder whose middle face is exactly 1px wide
 * reads as AA. Rare, and it biases the number up, never down.
 */
function edgeAA(luma, w, h, step = 60, marginFrac = 0.25) {
  let total = 0, aa = 0;
  const test = (a, b, c) => {
    const d = luma[c] - luma[a];
    const ad = Math.abs(d);
    if (ad < step) return;
    total++;
    const m = marginFrac * ad;
    const lo = Math.min(luma[a], luma[c]), hi = Math.max(luma[a], luma[c]);
    if (luma[b] >= lo + m && luma[b] <= hi - m) aa++;
  };
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 1; x < w - 1; x++) test(r + x - 1, r + x, r + x + 1);
  }
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h - 1; y++) test((y - 1) * w + x, y * w + x, (y + 1) * w + x);
  }
  return total > 0 ? aa / total : 0;
}

// ---------------------------------------------------------------------------
// metric registry — the flat key space that bands and scoring speak in
// ---------------------------------------------------------------------------

// `oneSided` records the direction in which a metric represents a REAL craft
// failure. Bands are still emitted two-sided for every metric (a one-sided
// floor is trivially cleared by noise, which is the whole point), but where a
// bound is not a genuine defect it is labelled here and copied into the band
// file so nobody silently "fixes" a harmless out-of-band reading.
export const DEFS = [
  ['changeRate.h', 'changeRate', 4, 'sparse (flat fills, empty sky)', 'noise / dither', null],
  ['changeRate.v', 'changeRate', 4, 'sparse', 'noise / dither', null],
  ['changeRate.combined', 'changeRate', 4, 'sparse', 'noise / dither', null],
  ['runLen.mean', 'runLen', 3, 'noise (every pixel its own run)', 'sparse (long flat runs)', null],
  ['runLen.median', 'runLen', 3, 'noise', 'sparse', null],
  ['runLen.p90', 'runLen', 3, 'noise', 'sparse', null],
  ['runLen.p99', 'runLen', 3, 'noise', 'sparse (big dead slabs)', null],
  ['runLen.fracGt8', 'runLen', 4, 'noise', 'sparse', null],
  ['runLen.fracGt16', 'runLen', 4, 'noise', 'sparse', null],
  ['colorsPerTile.mean16', 'colorsPerTile', 2, 'empty / monotone tiles', 'gradient or AA colour soup', null],
  ['colorsPerTile.median16', 'colorsPerTile', 2, 'empty tiles', 'colour soup', null],
  ['colorsPerTile.mean32', 'colorsPerTile', 2, 'empty tiles', 'colour soup', null],
  ['colorsPerTile.median32', 'colorsPerTile', 2, 'empty tiles', 'colour soup', null],
  ['palette.distinct', 'palette', 0, 'too few colours to build a scene', 'no palette discipline / AA', null],
  ['palette.n50', 'palette', 0, 'one colour eats the frame', 'no dominant materials', null],
  ['palette.n90', 'palette', 0, 'few colours carrying everything (flat)', 'colour soup', null],
  ['palette.n99', 'palette', 0, 'flat', 'colour soup', null],
  ['palette.top1Share', 'palette', 4, 'no dominant ground/structure tone', 'ONE colour dominates: dead sky or slab', 'high'],
  ['hue.buckets1pct', 'hue', 0, 'monochrome / two-tone', 'rainbow soup, no palette identity', null],
  ['hue.meanSat', 'hue', 4, 'washed out', 'oversaturated', null],
  ['hue.fracNearGrey', 'hue', 4, 'no neutrals to hold the palette together', 'grey mush', null],
  ['edge.fracLowContrast', 'edge', 4, 'no shading vocabulary at all', 'low-contrast mush (NOT proof of antialiasing — see edge.fracAA)', null],
  ['edge.fracAA', 'edge', 4, 'not a defect — 0 is ideal', 'ANTIALIASED / scaled / resampled output', 'high'],
  ['edge.fracHard', 'edge', 4, 'mushy, nothing reads as an edge', 'high-contrast noise', null],
  ['edge.meanDelta', 'edge', 2, 'low-contrast mush', 'contrast noise', null],
  ['tileRepeat.fracNonUnique', 'tileRepeat', 4, 'no evidence of stamping (not a defect)', 'STAMPED / tiled generator', 'high'],
  ['tileRepeat.largestCluster', 'tileRepeat', 4, 'not a defect', 'one stamp pasted everywhere', 'high'],
  ['flat.frac3x3', 'flat', 4, 'nothing is flat: noise, not pixel art', 'big empty flat areas', null],
  ['flat.largestRegion', 'flat', 4, 'not a defect', 'ONE enormous dead region (sky/ground)', 'high'],
  ['vGrad.rowMean', 'vGrad', 4, 'sparse', 'noise', null],
  ['vGrad.rowMin64', 'vGrad', 4, 'DEAD 64-row band (empty sky)', 'not a defect', 'low'],
  ['vGrad.rowMin64Ratio', 'vGrad', 4, 'DEAD row band relative to own mean', 'not a defect', 'low'],
  ['vGrad.colMean', 'vGrad', 4, 'sparse', 'noise', null],
  ['vGrad.colMin64', 'vGrad', 4, 'dead 64-column band (empty margin)', 'not a defect', 'low'],
  ['vGrad.colMin64Ratio', 'vGrad', 4, 'dead column band relative to own mean', 'not a defect', 'low'],
  ['slope.r1', 'slope', 4, 'no organic/45-deg forms at all', 'angle soup, no dimetric discipline', null],
  ['slope.r2', 'slope', 4, 'not 2:1 dimetric — wrong projection', 'MECHANICAL: 100% 2:1, no gables or hips', null],
  ['slope.r3', 'slope', 4, 'no shallow forms', 'too many shallow slopes', null],
  ['slope.r4', 'slope', 4, 'no shallow forms', 'too many shallow slopes', null],
  ['slope.r5plus', 'slope', 4, 'not a defect', 'near-horizontal edges dominate', 'high'],
  ['slope.corr2v1', 'slope', 3, 'outline steps at +/-1 not +/-2: wrong projection', 'over-regular', null],
  ['slope.corr2v3', 'slope', 3, 'outline steps too shallow', 'over-regular', null],
  ['slope.corrDx0Share', 'slope', 4, 'no vertical z axis', 'everything vertical, no diagonals', null],
  ['flat.frac5x5', 'flat', 4, 'RENDERED/RESAMPLED: nothing holds 25 px at one value', 'sparse: big empty facets', null],
  ['dither.rate', 'dither', 4, 'not a defect', 'DITHERED MUSH: density manufactured from checkerboard', 'high'],
  ['outline.darkShare', 'outline', 4, 'no outline system; shapes float untethered', 'murky, too much near-black', null],
  ['outline.run1Share', 'outline', 4, 'outlines are not 1px', 'no 2px horizontal runs: not 2:1 diagonals', null],
  ['outline.run12Share', 'outline', 4, 'FAT OUTLINES or dark blobs', 'not a defect', 'low'],
  ['outline.run12PixShare', 'outline', 4, 'fat outlines / dark material blobs', 'not a defect', 'low'],
  ['outline.blackMediatedDiff', 'outline', 4, 'objects not separated by black', 'black everywhere, no discrimination', null],
  ['outline.blackMediatedSame', 'outline', 4, 'no interior structure lines', 'black between faces of one object too', null],
  ['outline.mediationGap', 'outline', 4, 'black used INDISCRIMINATELY: no object-vs-face distinction', 'over-separated', null],
  ['shade.lumaRatioMedian', 'shade', 4, 'crushed face contrast', 'faces do not read as separate planes', null],
  ['shade.lumaRatioP25', 'shade', 4, 'crushed', 'no dark face', null],
  ['shade.lumaRatioP75', 'shade', 4, 'no light face', 'faces too close in value', null],
  ['shade.hueRotMedian', 'shade', 3, 'shadows rotate warm', 'shadows rotate cool (toward blue)', null],
  ['shade.hueRotAbsMedian', 'shade', 3, 'not a defect — 0 is ideal', 'HUE ROTATES IN SHADOW: procedural-shader tell', 'high'],
  ['shade.sampleShare', 'shade', 4, 'no same-hue face ladder present at all', 'everything is one hue', null],
  ['tileRepeat.pNearDupFrac', 'tileRepeat', 4, 'not a defect', 'STAMPED (recolour/jitter-proof)', 'high'],
  ['tileRepeat.pMaxCluster', 'tileRepeat', 4, 'not a defect', 'one stamp pasted everywhere (recolour/jitter-proof)', 'high'],
].map(([key, group, dp, failsLow, failsHigh, oneSided]) => ({ key, group, dp, failsLow, failsHigh, oneSided }));

export const KEYS = DEFS.map((d) => d.key);

/** Every metric for one image, as a flat {key: number} map. */
export function measure(img) {
  const keys = packKeys(img);
  const { w, h } = img;
  const cr = changeRate(keys, w, h);
  const rl = runLen(keys, w, h);
  const c16 = colorsPerTile(keys, w, h, 16);
  const c32 = colorsPerTile(keys, w, h, 32);
  const pal = paletteConcentration(keys);
  const hue = hueStats(img);
  const edge = edgeHardness(img, keys);
  const rep = tileRepeat(keys, w, h);
  // --- v2 structural ---
  const der = derive(img);
  const sl = slopeStats(der.keys, der.luma, w, h);
  const oc = outlineCorr(der.luma, w, h);
  const ol = outlineStats(der.keys, der.luma, der.hue, der.sat, w, h);
  const sh = shadeStats(der.keys, der.luma, der.hue, der.sat, w, h);
  const prep = tileRepeatPerceptual(der.luma, w, h);
  const aa = edgeAA(der.luma, w, h);
  const fl = flatness(keys, w, h);
  const vg = vGrad(keys, w, h);
  return {
    'changeRate.h': cr.h,
    'changeRate.v': cr.v,
    'changeRate.combined': cr.combined,
    'runLen.mean': rl.mean,
    'runLen.median': rl.median,
    'runLen.p90': rl.p90,
    'runLen.p99': rl.p99,
    'runLen.fracGt8': rl.fracGt8,
    'runLen.fracGt16': rl.fracGt16,
    'colorsPerTile.mean16': c16.mean,
    'colorsPerTile.median16': c16.median,
    'colorsPerTile.mean32': c32.mean,
    'colorsPerTile.median32': c32.median,
    'palette.distinct': pal.distinct,
    'palette.n50': pal.n50,
    'palette.n90': pal.n90,
    'palette.n99': pal.n99,
    'palette.top1Share': pal.top1Share,
    'hue.buckets1pct': hue.buckets1pct,
    'hue.meanSat': hue.meanSat,
    'hue.fracNearGrey': hue.fracNearGrey,
    'edge.fracLowContrast': edge.fracSoft,
    'edge.fracAA': aa,
    'edge.fracHard': edge.fracHard,
    'edge.meanDelta': edge.meanDelta,
    'tileRepeat.fracNonUnique': rep.fracNonUnique,
    'tileRepeat.largestCluster': rep.largestCluster,
    'flat.frac3x3': fl.frac3x3,
    'flat.largestRegion': fl.largestRegion,
    'vGrad.rowMean': vg.rowMean,
    'vGrad.rowMin64': vg.rowMin64,
    'vGrad.rowMin64Ratio': vg.rowMin64Ratio,
    'vGrad.colMean': vg.colMean,
    'vGrad.colMin64': vg.colMin64,
    'vGrad.colMin64Ratio': vg.colMin64Ratio,
    'slope.r1': sl.r1,
    'slope.r2': sl.r2,
    'slope.r3': sl.r3,
    'slope.r4': sl.r4,
    'slope.r5plus': sl.r5plus,
    'slope.corr2v1': oc.corr2v1,
    'slope.corr2v3': oc.corr2v3,
    'slope.corrDx0Share': oc.corrDx0Share,
    'flat.frac5x5': flat5x5(der.keys, w, h),
    'dither.rate': ditherRate(der.keys, w, h),
    'outline.darkShare': ol.darkShare,
    'outline.run1Share': ol.run1Share,
    'outline.run12Share': ol.run12Share,
    'outline.run12PixShare': ol.run12PixShare,
    'outline.blackMediatedDiff': ol.blackMediatedDiff,
    'outline.blackMediatedSame': ol.blackMediatedSame,
    'outline.mediationGap': ol.mediationGap,
    'shade.lumaRatioMedian': sh.lumaRatioMedian,
    'shade.lumaRatioP25': sh.lumaRatioP25,
    'shade.lumaRatioP75': sh.lumaRatioP75,
    'shade.hueRotMedian': sh.hueRotMedian,
    'shade.hueRotAbsMedian': sh.hueRotAbsMedian,
    'shade.sampleShare': sh.sampleShare,
    'tileRepeat.pNearDupFrac': prep.pNearDupFrac,
    'tileRepeat.pMaxCluster': prep.pMaxCluster,
  };
}

// ---------------------------------------------------------------------------
// seeded interior crops
// ---------------------------------------------------------------------------

/**
 * N seeded crop rectangles from the INTERIOR of the image. Inset keeps us off
 * the frame edge, where a Pixorama (and any generator) behaves differently from
 * the middle — the duel always takes an interior slice, so the band must too.
 * Positions come only from the seed. There is no hand-picked crop list.
 */
export function cropRects(img, n, size, seed, inset = 24) {
  const minX = inset, minY = inset;
  const maxX = img.w - inset - size;
  const maxY = img.h - inset - size;
  if (maxX < minX || maxY < minY) return null;
  const s = new Rng(seed).stream('crops');
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: s.int(minX, maxX), y: s.int(minY, maxY) });
  return out;
}

/**
 * Per-metric p05/p25/p50/p75/p95 across a list of flat metric maps.
 *
 * `quantum` is the smallest gap between distinct observed values. Some metrics
 * are integer-valued and so concentrated that p05 === p95 (runLen.median is
 * 2 in every crop of the reference). A zero-width band is not a band: it makes
 * the signed distance infinite and turns a one-step difference into an
 * unbounded failure. We record the quantum here so buildBand can widen those to
 * a half-step and say that it did.
 */
export function aggregate(rows) {
  const out = {};
  for (const k of KEYS) {
    const a = Float64Array.from(rows.map((r) => r[k])).sort();
    let quantum = Infinity;
    for (let i = 1; i < a.length; i++) {
      const g = a[i] - a[i - 1];
      if (g > 0 && g < quantum) quantum = g;
    }
    if (!Number.isFinite(quantum)) quantum = Math.max(Math.abs(Number(a[0])) * 0.02, 1e-6);
    out[k] = {
      p05: pct(a, 0.05), p25: pct(a, 0.25), p50: pct(a, 0.5),
      p75: pct(a, 0.75), p95: pct(a, 0.95),
      min: Number(a[0]), max: Number(a[a.length - 1]),
      quantum,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// printing
// ---------------------------------------------------------------------------

const fmt = (v, dp) => (Number.isFinite(v) ? v.toFixed(dp) : String(v));

function table(headers, rows) {
  const wds = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells, pad = ' ') =>
    cells.map((c, i) => (i === 0 ? String(c).padEnd(wds[i], pad) : String(c).padStart(wds[i], pad))).join('  ');
  const out = [line(headers), line(wds.map((w) => '-'.repeat(w)), '-')];
  for (const r of rows) out.push(line(r));
  return out.join('\n');
}

function printWhole(file, img, m) {
  console.log(`# ${file}  ${img.w}x${img.h}  (whole image)`);
  console.log();
  const rows = DEFS.map((d) => [d.key, fmt(m[d.key], d.dp)]);
  console.log(table(['metric', 'value'], rows));
}

function printCrops(file, img, agg, rects, size) {
  console.log(`# ${file}  ${img.w}x${img.h}  —  ${rects.length} seeded ${size}x${size} interior crops`);
  console.log();
  const rows = DEFS.map((d) => [
    d.key,
    fmt(agg[d.key].p05, d.dp), fmt(agg[d.key].p25, d.dp), fmt(agg[d.key].p50, d.dp),
    fmt(agg[d.key].p75, d.dp), fmt(agg[d.key].p95, d.dp),
  ]);
  console.log(table(['metric', 'p05', 'p25', 'p50', 'p75', 'p95'], rows));
}

// ---------------------------------------------------------------------------
// band emit + score
// ---------------------------------------------------------------------------

// Bumped whenever the metric SET changes, not when the numbers move.
const BAND_VERSION = 'pixel-v2';

/**
 * The p05/p95 interval for every metric, with the degenerate-band widening rule
 * applied. Split out of buildBand() so that tools/budget.mjs can rebuild a band
 * from a SUBSET of crops (leave-one-out) using byte-identical arithmetic. If
 * this rule and the LOO rule ever drift apart the budget stops describing the
 * band it is a budget FOR, so there must be exactly one copy of it.
 *
 * Returns { intervals: {key: {lo, hi, note}}, widened }.
 */
export function bandIntervals(agg) {
  const intervals = {};
  let widened = 0;
  for (const d of DEFS) {
    const a = agg[d.key];
    let lo = a.p05, hi = a.p95, note = null;
    if (hi - lo === 0) {
      // Integer-valued metric so tight that every crop landed on one value.
      // Widen by half a quantisation step in each direction so the band is a
      // real interval and the signed distance stays finite. Recorded, not silent.
      lo -= a.quantum / 2;
      hi += a.quantum / 2;
      note = `p05 === p95 (${a.p05}); widened by +/- ${a.quantum / 2} (half the observed quantisation step) so the band has non-zero width.`;
      widened++;
    }
    intervals[d.key] = { lo, hi, note };
  }
  return { intervals, widened };
}

export function buildBand(file, img, agg, rects, size, seed, inset) {
  const metrics = {};
  const { intervals, widened } = bandIntervals(agg);
  for (const d of DEFS) {
    const a = agg[d.key];
    const { lo, hi, note } = intervals[d.key];
    metrics[d.key] = {
      band: [lo, hi],
      p05: a.p05, p25: a.p25, p50: a.p50, p75: a.p75, p95: a.p95,
      min: a.min, max: a.max,
      widenedFromDegenerate: note,
      detects: { failsLow: d.failsLow, failsHigh: d.failsHigh },
      // Two-sided always. Where only one bound is a genuine craft failure we say
      // so here instead of quietly dropping the other bound — a one-sided floor
      // is trivially cleared by RGB noise, which is exactly the cheat we are
      // guarding against.
      oneSidedInPractice: d.oneSided,
      comment: d.oneSided
        ? `Band is two-sided, but only the ${d.oneSided.toUpperCase()} side is a real craft failure; ` +
          `an out-of-band reading on the other side is advisory, not a defect.`
        : 'Both bounds are real: low = sparse/flat, high = noisy/soft.',
    };
  }
  return {
    version: BAND_VERSION,
    note:
      'Derived from seeded interior crops of the reference only. Every band is two-sided on purpose: ' +
      'a density floor alone is cleared by uniform RGB noise, so every floor has a matching ceiling. ' +
      'Metrics whose other bound is not a genuine defect carry oneSidedInPractice + comment.',
    source: file,
    sourceSize: { w: img.w, h: img.h },
    sampling: { crops: rects.length, size, seed, inset, rng: 'src/core/rng.js Rng(seed).stream("crops")' },
    bandFrom: ['p05', 'p95'],
    degenerateBandsWidened: widened,
    metrics,
  };
}

export function scoreAgainstBand(band, values) {
  const rows = [];
  let pass = 0, fail = 0;
  for (const d of DEFS) {
    const b = band.metrics[d.key];
    if (!b) continue;
    const [lo, hi] = b.band;
    const v = values[d.key];
    const width = hi - lo;
    let dist = 0;
    if (v < lo) dist = width > 0 ? (v - lo) / width : -Infinity;
    else if (v > hi) dist = width > 0 ? (v - hi) / width : Infinity;
    const ok = dist === 0;
    if (ok) pass++; else fail++;
    rows.push({ key: d.key, dp: d.dp, v, lo, hi, ok, dist, oneSided: b.oneSidedInPractice, def: d });
  }
  return { rows, pass, fail };
}

/**
 * True when a scored row is a HARD failure: out of band on the side that the
 * band file calls a real craft defect. Out of band on the advisory side of a
 * one-sided metric is not a defect and must not be counted.
 *
 * Exported so tools/budget.mjs measures the same thing when it builds the
 * leave-one-out fail-count distribution. A budget derived from one definition
 * of "fail" and applied against another is meaningless.
 */
export function isHardFail(row) {
  if (row.ok) return false;
  if (!row.oneSided) return true;
  return (row.dist < 0 ? 'low' : 'high') === row.oneSided;
}

function printScore(file, label, band, scored) {
  console.log(`# ${file}  scored against band "${band.version}" (${label})`);
  console.log(`# band source: ${band.source}  ${band.sampling.crops} x ${band.sampling.size}px crops, seed "${band.sampling.seed}"`);
  console.log();
  const rows = scored.rows.map((r) => {
    // A failure on the side that the band file marks as "not a real defect" is
    // reported as ADVISORY, so nobody chases a number that is not a craft bug.
    let verdict = r.ok ? 'PASS' : 'FAIL';
    if (!r.ok && r.oneSided) {
      const failedSide = r.dist < 0 ? 'low' : 'high';
      if (failedSide !== r.oneSided) verdict = 'ADVIS';
    }
    return [
      r.key,
      fmt(r.v, r.dp),
      `[${fmt(r.lo, r.dp)}, ${fmt(r.hi, r.dp)}]`,
      verdict,
      r.ok ? '0.00' : (r.dist > 0 ? '+' : '') + r.dist.toFixed(2),
    ];
  });
  console.log(table(['metric', 'value', 'band [p05,p95]', 'verdict', 'dist(bandwidths)'], rows));
  console.log();
  const hard = scored.rows.filter(isHardFail);
  console.log(`PASS ${scored.pass}/${scored.rows.length}   HARD FAIL ${hard.length}   (advisory out-of-band: ${scored.fail - hard.length})`);
  if (hard.length) {
    console.log('\nhard failures, worst first:');
    for (const r of hard.slice().sort((a, b) => Math.abs(b.dist) - Math.abs(a.dist))) {
      const why = r.dist < 0 ? r.def.failsLow : r.def.failsHigh;
      console.log(`  ${r.key.padEnd(26)} ${fmt(r.v, r.dp).padStart(10)}  ${(r.dist > 0 ? '+' : '') + r.dist.toFixed(2)} bandwidths  — ${why}`);
    }
  }
  return hard.length === 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { files: [], json: false, crops: 0, size: 320, seed: 'fixel', inset: 24, band: null, emitBand: null, whole: false, budget: false, budgetFile: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') a.json = true;
    else if (t === '--whole') a.whole = true;
    else if (t === '--budget') a.budget = true;
    else if (t === '--budget-file') { a.budgetFile = argv[++i]; a.budget = true; }
    else if (t === '--crops') a.crops = Number(argv[++i]);
    else if (t === '--size') a.size = Number(argv[++i]);
    else if (t === '--seed') a.seed = String(argv[++i]);
    else if (t === '--inset') a.inset = Number(argv[++i]);
    else if (t === '--band') a.band = argv[++i];
    else if (t === '--emit-band') a.emitBand = argv[++i];
    else if (t.startsWith('--')) { console.error(`unknown flag ${t}`); process.exit(2); }
    else a.files.push(t);
  }
  return a;
}

/**
 * Where the acceptance budget lives, given a band path. Convention, not
 * configuration: docs/band-pixel-v2.json -> docs/budget-pixel-v2.json. The
 * budget is deliberately a SIBLING file rather than a field inside the band,
 * so that adding or re-deriving a budget cannot change a byte of the band that
 * other work is already being scored against.
 */
function defaultBudgetPath(bandPath) {
  const dir = dirname(bandPath);
  const base = basename(bandPath);
  return join(dir, base.startsWith('band-') ? 'budget-' + base.slice(5) : 'budget-' + base);
}

/**
 * ACCEPT / REJECT against a leave-one-out budget instead of all-pass.
 *
 * WHY: an all-pass gate on a 60-metric band derived from one artwork is
 * circular — the artwork scores 60/60 because it defined the intervals, and
 * leave-one-out (tools/budget.mjs) shows only 20 of its own 128 crops would
 * clear all sixty. Demanding all-pass from a generator demands something the
 * reference's own siblings fail 84% of the time. The gate is the HARD-fail
 * count against a measured budget; the hard-fail LIST above stays the
 * diagnosis, per BAR.md ("weight the hard-fail list; never the pass count").
 */
function printBudgetVerdict(b) {
  const accept = b.accept;
  console.log();
  console.log(`# acceptance budget "${b.version}" (${b.path}) — hardFail <= ${b.limit} of ${KEYS.length}`);
  console.log(`per-crop hard fails: min ${b.perCrop.min}  p25 ${b.perCrop.p25.toFixed(1)}  ` +
    `p50 ${b.perCrop.p50.toFixed(1)}  p75 ${b.perCrop.p75.toFixed(1)}  p95 ${b.perCrop.p95.toFixed(1)}  max ${b.perCrop.max}`);
  console.log(`median-of-crops composite: ${b.compositeHardFail} hard fails ` +
    `(reported, NOT gated — the composite is not a crop and reads low by construction)`);
  if (b.clusterLimit !== undefined && b.clusterTotal) {
    console.log(`correlation-cluster view: per-crop p50 ${b.perCropCluster.p50.toFixed(1)} of ${b.clusterTotal} clusters ` +
      `(advisory budget <= ${b.clusterLimit})`);
  }
  console.log(`${accept ? 'ACCEPT' : 'REJECT'}  gate value ${b.gateValue.toFixed(1)} (median crop) vs budget ${b.limit}  ` +
    `(margin ${b.limit - b.gateValue >= 0 ? '+' : ''}${(b.limit - b.gateValue).toFixed(1)})`);
  console.log('THE COUNT IS NOT THE PRODUCT. The hard-failure list above is the diagnosis; this number only ' +
    'says whether the image is inside the envelope a genuine artwork occupies. See docs/MEASURED.md.');
  return accept;
}

/** metric -> cluster id, from a budget file's correlation block. */
function budgetClusterMap(budget) {
  const m = new Map();
  if (budget.correlation && budget.correlation.clusters) {
    for (const c of budget.correlation.clusters) for (const k of c.members) m.set(k, c.id);
  }
  return m;
}

const USAGE = `usage:
  metrics.mjs <file.png> [--json]
  metrics.mjs <file.png> --crops N --size 320 --seed <string> [--json]
  metrics.mjs --band <band.json> <file.png> [--whole] [--json]
  metrics.mjs --band <band.json> --budget <file.png>        ACCEPT/REJECT vs the LOO budget
  metrics.mjs --band <band.json> --budget-file <b.json> <file.png>
  metrics.mjs --emit-band <out.json> <file.png> --crops 128 --size 320 --seed <string>`;

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.files.length !== 1) { console.error(USAGE); process.exit(2); }
  const file = a.files[0];
  const img = readPNG(file);

  // --- score against a stored band --------------------------------------
  if (a.band) {
    const band = JSON.parse(readFileSync(a.band, 'utf8'));
    const size = a.size !== 320 ? a.size : band.sampling.size;
    const n = a.crops || band.sampling.crops;
    const seed = a.seed !== 'fixel' ? a.seed : band.sampling.seed;
    const inset = a.inset;
    let values, label;
    let cropRows = null;
    const rects = a.whole ? null : cropRects(img, n, size, seed, inset);
    if (rects) {
      // The band was measured on crops, so we score on crops. The median crop is
      // the representative sample: it is what a randomly drawn duel crop looks
      // like, and it cannot be cherry-picked.
      cropRows = rects.map((r) => measure(crop(img, r.x, r.y, size, size)));
      const agg = aggregate(cropRows);
      values = {};
      for (const k of KEYS) values[k] = agg[k].p50;
      label = `median of ${n} seeded ${size}x${size} crops, seed "${seed}"`;
    } else {
      values = measure(img);
      label = a.whole ? 'whole image (forced)' : `whole image — TOO SMALL for ${size}px interior crops, NOT band-valid`;
      if (!a.whole) console.error(`WARNING: ${img.w}x${img.h} cannot yield ${size}x${size} crops inset ${inset}px; scoring whole image. Treat as advisory only.`);
    }
    const missing = KEYS.filter((k) => !band.metrics[k]);
    if (missing.length) {
      console.error(`WARNING: band "${band.version}" has no entry for ${missing.length} metric(s) this build computes; they are NOT scored: ${missing.join(', ')}`);
    }
    const scored = scoreAgainstBand(band, values);

    // --- acceptance budget ------------------------------------------------
    // The budget is derived per CROP (tools/budget.mjs leaves one crop out at a
    // time), so the gate must read a per-crop quantity too. The median-of-crops
    // composite scored above is NOT a crop: taking a per-metric median across
    // 128 crops pulls every metric toward the band centre at once, so the
    // composite reads systematically FEWER fails than any real crop of the same
    // image (Lufthansa: composite 27, median real crop 31). Gating the composite
    // against a per-crop budget is the same class of scale mismatch as scoring a
    // whole image against a crop-derived band. So the gate reads the median of
    // the per-crop hard-fail counts, and the composite is reported beside it.
    let budgetInfo = null;
    if (a.budget) {
      const bpath = a.budgetFile || defaultBudgetPath(a.band);
      const budget = JSON.parse(readFileSync(bpath, 'utf8'));
      if (!cropRows) {
        console.error(`REFUSING to issue ACCEPT/REJECT on a whole-image reading: the budget is per-crop and ${img.w}x${img.h} cannot yield ${size}px crops. Scale mismatch.`);
        budgetInfo = { path: bpath, refused: true, reason: 'whole-image reading, budget is per-crop' };
      } else {
        const per = cropRows.map((v) => {
          const sc = scoreAgainstBand(band, v);
          const hard = sc.rows.filter(isHardFail);
          return { hard, n: hard.length };
        });
        const counts = Float64Array.from(per.map((p) => p.n)).sort();
        const clusterOf = budgetClusterMap(budget);
        const clusterCounts = Float64Array.from(
          per.map((p) => new Set(p.hard.map((r) => clusterOf.get(r.key) ?? r.key)).size)).sort();
        const compositeHard = scored.rows.filter(isHardFail);
        budgetInfo = {
          path: bpath,
          version: budget.version,
          limit: budget.budget.hardFail,
          clusterLimit: budget.budget.clusterFail,
          clusterTotal: budget.correlation ? budget.correlation.clusterCount : null,
          perCrop: {
            min: Number(counts[0]), p25: pct(counts, 0.25), p50: pct(counts, 0.5),
            p75: pct(counts, 0.75), p95: pct(counts, 0.95), max: Number(counts[counts.length - 1]),
          },
          perCropCluster: {
            p50: pct(clusterCounts, 0.5), p95: pct(clusterCounts, 0.95),
          },
          compositeHardFail: compositeHard.length,
          gateValue: pct(counts, 0.5),
          accept: pct(counts, 0.5) <= budget.budget.hardFail,
        };
      }
    }

    if (a.json) {
      console.log(JSON.stringify({ file, mode: label, budget: budgetInfo, values, rows: scored.rows.map((r) => ({ key: r.key, value: r.v, band: [r.lo, r.hi], pass: r.ok, dist: r.dist, oneSidedInPractice: r.oneSided })) }, null, 2));
    } else {
      const ok = printScore(file, label, band, scored);
      if (budgetInfo && !budgetInfo.refused) {
        const accept = printBudgetVerdict(budgetInfo);
        process.exitCode = accept ? 0 : 1;
      } else {
        process.exitCode = ok ? 0 : 1;
      }
    }
    return;
  }

  // --- crop-sampled metrics (and optional band emit) --------------------
  if (a.crops > 0 || a.emitBand) {
    const n = a.crops || 128;
    const rects = cropRects(img, n, a.size, a.seed, a.inset);
    if (!rects) { console.error(`image ${img.w}x${img.h} too small for ${a.size}x${a.size} crops inset ${a.inset}px`); process.exit(2); }
    const rows = rects.map((r) => measure(crop(img, r.x, r.y, a.size, a.size)));
    const agg = aggregate(rows);
    if (a.emitBand) {
      const band = buildBand(file, img, agg, rects, a.size, a.seed, a.inset);
      writeFileSync(a.emitBand, JSON.stringify(band, null, 2) + '\n');
      console.error(`wrote band ${a.emitBand}  (${rects.length} crops of ${a.size}px, seed "${a.seed}")`);
    }
    if (a.json) console.log(JSON.stringify({ file, w: img.w, h: img.h, crops: rects, size: a.size, seed: a.seed, agg }, null, 2));
    else if (!a.emitBand) printCrops(file, img, agg, rects, a.size);
    return;
  }

  // --- whole image ------------------------------------------------------
  const m = measure(img);
  if (a.json) console.log(JSON.stringify({ file, w: img.w, h: img.h, metrics: m }, null, 2));
  else printWhole(file, img, m);
}

// Only run the CLI when invoked directly. tools/duel.mjs and the live page need
// to `import { measure, cropRects }` without triggering an argv parse.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
