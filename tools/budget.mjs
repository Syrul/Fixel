#!/usr/bin/env node
// tools/budget.mjs — how many of the 60 pixel metrics is a GENUINE artwork
// allowed to fail?
//
// WHY THIS FILE EXISTS
// docs/band-pixel-v2.json is derived from 128 seeded interior crops of ONE
// artwork, and then every candidate is scored all-pass against it. That gate is
// circular twice over. The reference scores 60/60 because it IS the band
// source; and no other image — not even another eBoy Pixorama — has any reason
// to clear all sixty two-sided p05..p95 intervals, because clearing all sixty
// is a much stronger claim than "looks like the reference". Sixty independent
// 90% intervals would be cleared by chance 0.9^60 = 0.2% of the time. They are
// not independent, so the true figure is better than that, but it is nowhere
// near 100%.
//
// docs/BAR.md records that the audio half of this project already walked into
// this and measured its way out: leave-one-out over a 38-track corpus found
// only 5 of 38 genuine tracks cleared all 17 audio bands, so the acceptance
// gate was moved from all-pass to a BUDGET set at p95 of the leave-one-out
// fail-count distribution. This file does the identical thing for pixels, with
// crops of the reference standing in for corpus tracks:
//
//   for each crop i of 128:
//     rebuild the p05/p95 band from the OTHER 127 crops
//     count how many of the 60 metrics crop i fails against that band
//
// Crop i never contributes to the band it is judged by, so its fail count is
// an honest sample of "what does a genuine sibling of the reference score".
// The p95 of that distribution is the budget.
//
// TWO SCALES ARE REPORTED, because BAR.md's other instruction —
//   "60 metrics measured off one artwork are not independent.
//    Weight the hard-fail list; never the pass count."
// — is a claim we can now check rather than repeat. This file computes the
// correlation matrix across the 128 crops, single-linkage clusters it, and
// reports a second budget on the number of distinct CLUSTERS failed. A pack of
// six views of one underlying quantity can push six fails onto the raw count
// while being one defect; the cluster count is immune to that.
//
// DETERMINISM
// Everything comes from the band file's own sampling block: same source image,
// same crop count, same crop size, same crop seed, same inset. No new sampling
// decisions are taken here, so the budget describes the band it ships beside.

import { readFileSync, writeFileSync } from 'node:fs';
import { readPNG, crop } from '../src/core/png.js';
import {
  measure, cropRects, aggregate, bandIntervals, scoreAgainstBand, isHardFail,
  DEFS, KEYS, pct,
} from './metrics.mjs';

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

const USAGE = `usage:
  node tools/budget.mjs [--band docs/band-pixel-v2.json]
                        [--out docs/budget-pixel-v2.json]
                        [--corr 0.95] [--dup 0.99] [--json]

  --band  band file to derive a budget FOR. Its sampling block supplies the
          source image, crop count, crop size, crop seed and inset.
  --out   where to write the budget. Written as a SIBLING of the band file,
          never into it, so that nothing already being scored against
          band-pixel-v2.json changes underfoot.
  --corr  |pearson r| for single-linkage clustering of near-duplicate metrics.
  --dup   |pearson r| above which two metrics are called the same measurement.
  --accept <file.png>  genuine work in the same craft family that MUST accept.
  --reject <file.png>  work that MUST NOT accept.
  --generator <file.png>  our own output. Expected to accept, but ALSO required
          to rank WORSE than every --accept file. If it ranks better, the gate
          is reporting an inverted order and no threshold can repair that; the
          run says so and marks the budget not-valid-as-a-score.

  --accept / --reject are the sanity check that decides whether the budget is
  any good. A budget derived only from crops of ONE artwork describes how a
  sibling CROP behaves, not how a sibling ARTWORK behaves; the calibration
  files are the only evidence available about the second, larger source of
  variation. The budget is widened to the smallest integer that satisfies every
  --accept, and the run reports FAILURE if that value would also accept a
  --reject.`;

function parseArgs(argv) {
  const a = {
    band: 'docs/band-pixel-v2.json',
    out: 'docs/budget-pixel-v2.json',
    corr: 0.95,
    dup: 0.99,
    json: false,
    calib: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--band') a.band = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--corr') a.corr = Number(argv[++i]);
    else if (t === '--dup') a.dup = Number(argv[++i]);
    else if (t === '--json') a.json = true;
    else if (t === '--accept') a.calib.push({ file: argv[++i], expect: 'accept' });
    else if (t === '--reject') a.calib.push({ file: argv[++i], expect: 'reject' });
    else if (t === '--generator') a.calib.push({ file: argv[++i], expect: 'generator' });
    else { console.error(USAGE); process.exit(2); }
  }
  return a;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** Distribution summary of an integer-valued sample, in the shape BAR.md asks for. */
function dist(values) {
  const a = Float64Array.from(values).sort();
  let sum = 0;
  for (const v of a) sum += v;
  return {
    n: a.length,
    min: Number(a[0]),
    p25: pct(a, 0.25),
    p50: pct(a, 0.5),
    p75: pct(a, 0.75),
    p90: pct(a, 0.9),
    p95: pct(a, 0.95),
    max: Number(a[a.length - 1]),
    mean: sum / a.length,
  };
}

/**
 * Pearson r. Returns null when either column is constant across the 128 crops —
 * a constant metric has no correlation structure, and pretending otherwise
 * would silently glue every constant metric into one giant cluster.
 */
function pearson(x, y) {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Ranks with ties averaged, for a Spearman cross-check on monotone-but-curved pairs. */
function ranks(v) {
  const idx = v.map((x, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Float64Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return Array.from(r);
}

/** Single-linkage clustering over an |r| >= thr adjacency, via union-find. */
function cluster(keys, rmat, thr) {
  const parent = keys.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const r = rmat[i][j];
      if (r !== null && Math.abs(r) >= thr) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < keys.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(keys[i]);
  }
  // Stable ordering: biggest cluster first, then by first member's registry order.
  return Array.from(groups.values()).sort((a, b) => b.length - a.length || KEYS.indexOf(a[0]) - KEYS.indexOf(b[0]));
}

function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells, pad = ' ') =>
    cells.map((c, i) => (i === 0 ? String(c).padEnd(w[i], pad) : String(c).padStart(w[i], pad))).join('  ');
  return [line(headers), line(w.map((x) => '-'.repeat(x)), '-'), ...rows.map((r) => line(r))].join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const a = parseArgs(process.argv.slice(2));
const band = JSON.parse(readFileSync(a.band, 'utf8'));
const { crops: N, size: SIZE, seed: SEED, inset: INSET } = band.sampling;
const img = readPNG(band.source);
const rects = cropRects(img, N, SIZE, SEED, INSET);
if (!rects || rects.length !== N) {
  console.error(`could not reproduce ${N} crops of ${band.source}`);
  process.exit(2);
}

// The one expensive step: 60 metrics x 128 crops.
const rows = rects.map((r) => measure(crop(img, r.x, r.y, SIZE, SIZE)));

// --- correlation structure, computed BEFORE the LOO so the cluster count can
// --- be carried through it in one pass -------------------------------------
const cols = KEYS.map((k) => rows.map((r) => r[k]));
const rmat = KEYS.map(() => new Array(KEYS.length).fill(null));
const smat = KEYS.map(() => new Array(KEYS.length).fill(null));
const rankCols = cols.map(ranks);
for (let i = 0; i < KEYS.length; i++) {
  for (let j = i + 1; j < KEYS.length; j++) {
    const r = pearson(cols[i], cols[j]);
    const s = pearson(rankCols[i], rankCols[j]);
    rmat[i][j] = rmat[j][i] = r;
    smat[i][j] = smat[j][i] = s;
  }
}
const clusters = cluster(KEYS, rmat, a.corr);
const clusterOf = new Map();
clusters.forEach((g, ci) => g.forEach((k) => clusterOf.set(k, ci)));

// Near-identical PAIRS, the pixel equivalent of the audio side's
// spectralCentroidVar / spectralCentroidCV finding.
const dupPairs = [];
for (let i = 0; i < KEYS.length; i++) {
  for (let j = i + 1; j < KEYS.length; j++) {
    const r = rmat[i][j];
    if (r !== null && Math.abs(r) >= a.dup) dupPairs.push({ a: KEYS[i], b: KEYS[j], r, spearman: smat[i][j] });
  }
}
dupPairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

// --- leave one out ---------------------------------------------------------
// Each crop is scored against a band built from the OTHER 127. Nothing about
// crop i touches the interval it is judged by, so its fail count is what a
// genuine sibling of the reference actually scores.
const perCrop = [];
const failsByMetric = new Map(KEYS.map((k) => [k, 0]));
const hardByMetric = new Map(KEYS.map((k) => [k, 0]));

for (let i = 0; i < N; i++) {
  const others = rows.filter((_, j) => j !== i);
  const { intervals } = bandIntervals(aggregate(others));
  // scoreAgainstBand wants a band-file shape; give it exactly that so the
  // arithmetic (signed distance in bandwidths, one-sided handling) is the same
  // code that scores a candidate PNG.
  const looBand = { metrics: {} };
  for (const d of DEFS) {
    looBand.metrics[d.key] = {
      band: [intervals[d.key].lo, intervals[d.key].hi],
      oneSidedInPractice: d.oneSided,
    };
  }
  const scored = scoreAgainstBand(looBand, rows[i]);
  const hard = scored.rows.filter(isHardFail);
  const failedClusters = new Set(hard.map((r) => clusterOf.get(r.key)));
  for (const r of scored.rows) if (!r.ok) failsByMetric.set(r.key, failsByMetric.get(r.key) + 1);
  for (const r of hard) hardByMetric.set(r.key, hardByMetric.get(r.key) + 1);
  perCrop.push({
    i,
    x: rects[i].x, y: rects[i].y,
    anyFail: scored.fail,
    hardFail: hard.length,
    clusterFail: failedClusters.size,
    worst: hard.slice().sort((p, q) => Math.abs(q.dist) - Math.abs(p.dist)).slice(0, 3).map((r) => r.key),
  });
}

const dAny = dist(perCrop.map((c) => c.anyFail));
const dHard = dist(perCrop.map((c) => c.hardFail));
const dClus = dist(perCrop.map((c) => c.clusterFail));

// p95, rounded UP to an integer, because fail counts are integers and the gate
// is "<= budget". Rounding down would reject crops the p95 was chosen to accept.
const looBudgetHard = Math.ceil(dHard.p95);
const budgetAny = Math.ceil(dAny.p95);
const budgetCluster = Math.ceil(dClus.p95);
const allPass = perCrop.filter((c) => c.hardFail === 0).length;
const allPassStrict = perCrop.filter((c) => c.anyFail === 0).length;

// ---------------------------------------------------------------------------
// calibration — the sanity check that decides whether the budget is any good
//
// The LOO corpus is 128 crops of ONE artwork. It measures crop-to-crop
// variation and nothing else. BAR.md flags exactly this failure on the audio
// side ("the corpus is also a monoculture"), and here it is worse: n=1 artwork.
// So the LOO p95 is treated as a FLOOR — a budget tighter than that rejects the
// reference's own siblings — and the genuine second artwork is what says how
// much wider the real world is.
// ---------------------------------------------------------------------------

function scoreFile(file) {
  const im = readPNG(file);
  const rs = cropRects(im, N, SIZE, SEED, INSET);
  if (!rs) return null;
  const cropRows = rs.map((r) => measure(crop(im, r.x, r.y, SIZE, SIZE)));
  // Composite = median of crops, which is exactly what `metrics.mjs --band`
  // scores. The gate must be calibrated on the quantity the gate reads.
  const ag = aggregate(cropRows);
  const median = Object.fromEntries(KEYS.map((k) => [k, ag[k].p50]));
  const composite = scoreAgainstBand(band, median);
  const compositeHard = composite.rows.filter(isHardFail);
  const per = cropRows.map((v) => {
    const s = scoreAgainstBand(band, v);
    const hard = s.rows.filter(isHardFail);
    return { hard: hard.length, any: s.fail, clusters: new Set(hard.map((r) => clusterOf.get(r.key))).size };
  });
  const perCropHard = dist(per.map((p) => p.hard));
  return {
    file,
    size: { w: im.w, h: im.h },
    // THE GATE QUANTITY. The budget is built per crop, so it is compared to a
    // per-crop number. The median-of-crops composite is carried alongside only
    // to document how much lower it reads: a per-metric median across N crops
    // pulls every metric toward the band centre simultaneously, so the
    // composite is a synthetic supercrop that no real crop resembles.
    gateValue: perCropHard.p50,
    compositeHardFail: compositeHard.length,
    compositeAnyFail: composite.fail,
    compositeClusterFail: new Set(compositeHard.map((r) => clusterOf.get(r.key))).size,
    worst: compositeHard.slice().sort((p, q) => Math.abs(q.dist) - Math.abs(p.dist)).slice(0, 5)
      .map((r) => ({ key: r.key, dist: r.dist })),
    perCropHard,
    perCropCluster: dist(per.map((p) => p.clusters)),
  };
}

const calibration = a.calib.map((c) => ({ expect: c.expect, ...scoreFile(c.file) }));
const mustAccept = calibration.filter((c) => c.expect === 'accept');
const mustReject = calibration.filter((c) => c.expect === 'reject');
const generators = calibration.filter((c) => c.expect === 'generator');

// ORDERING CHECK. This is the check that decides whether the count means
// anything at all, and it is independent of where the threshold sits. If our
// own generator scores FEWER hard fails than genuine work in the same craft
// family, the count is not measuring craft: it is measuring distance to the
// centre of this particular band, and a generator that outputs the statistical
// average of the reference will always win that contest against an idiosyncratic
// real artwork. No threshold repairs an inverted order.
const inversions = [];
for (const g of generators) {
  for (const c of mustAccept) {
    if (g.gateValue < c.gateValue) {
      inversions.push({ generator: g.file, beats: c.file, by: c.gateValue - g.gateValue });
    }
  }
}
const rankingValid = inversions.length === 0;

// Widen only as far as the evidence forces. Never further: an unnecessarily
// loose gate is the thing this whole exercise is trying to avoid.
const acceptFloor = mustAccept.length ? Math.ceil(Math.max(...mustAccept.map((c) => c.gateValue))) : 0;
const generatorsAccepted = generators.filter((g) => g.gateValue <= Math.max(looBudgetHard, acceptFloor));
const budgetHard = Math.max(looBudgetHard, acceptFloor);
const widenedBy = budgetHard - looBudgetHard;
const rejectMargin = mustReject.length
  ? Math.min(...mustReject.map((c) => c.gateValue)) - budgetHard
  : null;
const separates = rejectMargin === null ? null : rejectMargin > 0;

const acceptedAtHard = perCrop.filter((c) => c.hardFail <= budgetHard).length;
const acceptedAtCluster = perCrop.filter((c) => c.clusterFail <= budgetCluster).length;

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

const budgetDoc = {
  version: 'budget-pixel-v2',
  forBand: a.band,
  bandVersion: band.version,
  method:
    'Leave-one-out across the band\'s own crops. For each crop i the p05/p95 band is rebuilt from ' +
    'the other N-1 crops (identical widening rule, via metrics.mjs bandIntervals) and crop i is ' +
    'scored against it. The budget is p95 of the resulting fail-count distribution, rounded up. ' +
    'Mirrors the audio side (docs/BAR.md): an all-pass gate rejects genuine work.',
  sampling: band.sampling,
  source: band.source,
  gate: 'hardFail',
  gateComment:
    'Score with tools/metrics.mjs --band <band> --budget <file.png>. ACCEPT when the number of HARD ' +
    'failures (out of band on the side the band file calls a real craft defect) is <= budget.hardFail. ' +
    'Advisory-side out-of-band readings are not defects and are not counted, exactly as in printScore. ' +
    'The gate reads the median-of-crops composite, which is what metrics.mjs --band already scores.',
  budget: { hardFail: budgetHard, anyFail: budgetAny, clusterFail: budgetCluster },
  budgetDerivation: {
    looP95: dHard.p95,
    looBudget: looBudgetHard,
    widenedToAcceptGenuineWork: widenedBy,
    widenComment: widenedBy > 0
      ? `The leave-one-out p95 over crops of a single artwork is ${looBudgetHard}. That budget rejects ` +
        `genuine work in the same craft family (${mustAccept.map((c) => `${c.file} = ${c.compositeHardFail}`).join(', ')}), ` +
        'because crop-to-crop variation within one artwork is a strict subset of artwork-to-artwork ' +
        'variation and the LOO corpus contains exactly one artwork. Widened to the smallest integer ' +
        'that accepts every --accept file, and no further.'
      : 'No widening needed: the leave-one-out p95 already accepts every --accept file.',
    rejectMargin,
    separatesAcceptFromReject: separates,
  },
  validity: {
    // Read this before quoting the budget as a score.
    usableAsFloorGate: separates === true,
    usableAsScore: rankingValid,
    inversions,
    comment: rankingValid
      ? 'No --generator file outranked genuine work; the count orders the corpus correctly.'
      : 'RANKING INVERTED: a --generator file scores FEWER hard fails than genuine work in the same ' +
        'craft family. The count therefore measures proximity to this band\'s centre, not craft. ' +
        'Use the budget only to reject things outside the family; use the HARD-FAIL LIST, never the ' +
        'count, to say how good something is. This is BAR.md\'s "weight the hard-fail list; never the ' +
        'pass count" showing up as a measurement rather than as advice.',
  },
  looDistribution: { hardFail: dHard, anyFail: dAny, clusterFail: dClus },
  looAcceptance: {
    crops: N,
    acceptedAtHardBudget: acceptedAtHard,
    acceptedAtClusterBudget: acceptedAtCluster,
    clearingAllSixtyHard: allPass,
    clearingAllSixtyIncludingAdvisory: allPassStrict,
  },
  calibration,
  correlation: {
    linkageThreshold: a.corr,
    duplicateThreshold: a.dup,
    clusterCount: clusters.length,
    clusters: clusters.map((g, ci) => ({ id: ci, size: g.length, members: g })),
    duplicatePairs: dupPairs,
  },
  perMetricLooFails: Object.fromEntries(KEYS.map((k) => [k, { hard: hardByMetric.get(k), any: failsByMetric.get(k) }])),
  perCrop,
};

if (a.json) {
  console.log(JSON.stringify(budgetDoc, null, 2));
} else {
  const f = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  console.log(`# leave-one-out budget for band "${band.version}"`);
  console.log(`# ${band.source}  ${N} seeded ${SIZE}x${SIZE} interior crops, seed "${SEED}", inset ${INSET}`);
  console.log(`# each crop scored against a band rebuilt from the other ${N - 1}\n`);

  console.log(table(
    ['LOO fail count', 'min', 'p25', 'p50', 'p75', 'p90', 'p95', 'max', 'mean'],
    [
      ['hard fails (of 60)', f(dHard.min), f(dHard.p25), f(dHard.p50), f(dHard.p75), f(dHard.p90), f(dHard.p95), f(dHard.max), dHard.mean.toFixed(2)],
      ['all out-of-band', f(dAny.min), f(dAny.p25), f(dAny.p50), f(dAny.p75), f(dAny.p90), f(dAny.p95), f(dAny.max), dAny.mean.toFixed(2)],
      [`clusters (of ${clusters.length})`, f(dClus.min), f(dClus.p25), f(dClus.p50), f(dClus.p75), f(dClus.p90), f(dClus.p95), f(dClus.max), dClus.mean.toFixed(2)],
    ],
  ));

  console.log(`\nLOO budget (p95 of hard fails, rounded up): <= ${looBudgetHard} of 60`);
  console.log(`an ALL-PASS gate would accept ${allPass}/${N} of the reference's own crops (${(100 * (1 - allPass / N)).toFixed(0)}% of genuine siblings rejected).`);

  if (calibration.length) {
    console.log('\n# calibration — does the budget separate genuine work from the artefact?');
    console.log(table(
      ['file', 'expect', 'GATE p50/crop', 'p05', 'p95', 'clusters p50', 'composite (not gated)'],
      calibration.map((c) => [
        c.file, c.expect, c.perCropHard.p50.toFixed(1),
        c.perCropHard.min, c.perCropHard.p95.toFixed(1),
        c.perCropCluster.p50.toFixed(1), c.compositeHardFail,
      ]),
    ));
    // Ordering is the check that matters more than the threshold. A gate whose
    // ranking is inverted cannot be repaired by moving the number.
    const order = calibration.slice().sort((x, y) => x.gateValue - y.gateValue);
    console.log(`\nranking, best first: ${order.map((c) => `${c.file.replace(/^.*\//, '')} ${c.gateValue.toFixed(1)}`).join('  <  ')}`);
    if (widenedBy > 0) {
      console.log(`\nWIDENED: LOO p95 = ${looBudgetHard} would REJECT ${mustAccept.filter((c) => c.gateValue > looBudgetHard).map((c) => c.file).join(', ')}.`);
      console.log(`The LOO corpus is 128 crops of ONE artwork; it measures crop-to-crop variation only.`);
      console.log(`Widened to ${budgetHard} — the smallest integer that accepts every --accept file, and no further.`);
    }
  }

  console.log(`\nBUDGET:  hardFail <= ${budgetHard} of 60   [advisory scales: anyFail <= ${budgetAny}, clusterFail <= ${budgetCluster} of ${clusters.length}]`);
  console.log(`accepts ${acceptedAtHard}/${N} of the reference's own crops.`);
  if (separates !== null) {
    console.log(separates
      ? `SEPARATION OK: nearest --reject file is ${rejectMargin} hard fails above the budget.`
      : `SEPARATION FAILED: a --reject file scores at or below the budget (margin ${rejectMargin}). The budget is wrong.`);
  }
  if (generators.length) {
    if (rankingValid) {
      console.log('ORDERING OK: no --generator file outranks genuine work.');
    } else {
      console.log('\n*** ORDERING INVERTED — THE COUNT IS NOT A SCORE ***');
      for (const iv of inversions) {
        console.log(`  ${iv.generator} scores ${iv.by.toFixed(1)} FEWER hard fails than ${iv.beats}, which is genuine work.`);
      }
      console.log('  No threshold fixes this. A generator that emits the statistical average of the band');
      console.log('  source sits nearer the centre of every interval than a real, idiosyncratic artwork does,');
      console.log('  so the count rewards exactly the homogeneity we are trying to eliminate.');
      console.log('  Use the budget as a FLOOR (is this in the craft family at all) and read the hard-fail');
      console.log('  LIST for everything else.');
    }
  }

  console.log(`\n# metrics that fail leave-one-out most often (hard fails over ${N} crops)`);
  const worst = KEYS.map((k) => [k, hardByMetric.get(k), failsByMetric.get(k)])
    .filter((r) => r[2] > 0).sort((x, y) => y[2] - x[2]).slice(0, 15);
  console.log(table(['metric', 'hard', 'any', 'cluster'], worst.map((r) => [r[0], r[1], r[2], clusterOf.get(r[0])])));

  console.log(`\n# correlation clusters across the ${N} crops (single linkage, |r| >= ${a.corr})`);
  console.log(`${clusters.length} clusters for 60 metrics; ${clusters.filter((g) => g.length > 1).length} contain more than one metric.`);
  for (const g of clusters.filter((x) => x.length > 1)) console.log(`  [${g.length}] ${g.join('  ')}`);

  console.log(`\n# near-duplicate pairs (|r| >= ${a.dup}) — the pixel equivalents of spectralCentroidVar/CV`);
  if (!dupPairs.length) console.log('  none');
  for (const p of dupPairs) console.log(`  r=${p.r >= 0 ? '+' : ''}${p.r.toFixed(4)}  (rho ${p.spearman === null ? 'n/a' : p.spearman.toFixed(4)})  ${p.a}  <->  ${p.b}`);
}

writeFileSync(a.out, JSON.stringify(budgetDoc, null, 2) + '\n');
console.error(`\nwrote ${a.out}`);
