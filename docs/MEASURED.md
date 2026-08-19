# MEASURED — Fixel pixel metrics, derived from the reference

**Two parts.** Part 1 (density, palette, edges) was measured with `docs/BAR.md` unopened, as the
protocol requires. Part 2 (structural) was added afterwards, once Part 1 was on disk and BAR.md was
unblocked; `docs/DIFF.md` is the diff between the two readings. The live band is
`docs/band-pixel-v2.json` (60 metrics). `docs/band-pixel-v1.json` is kept for provenance — scoring
against it still works but silently covers only 34 metrics, and `tools/metrics.mjs` prints a warning
naming the ones it could not score.

## Part 1 — density, palette, edges (band `pixel-v1`, measured blind)

Every number in this file was produced by `tools/metrics.mjs` on this machine. Nothing here is
copied from anywhere else. `docs/BAR.md` was not opened while producing Part 1.

## How it was produced

```
node tools/metrics.mjs refs/EBY-LA-Hot-Dog-175k.png
node tools/metrics.mjs refs/EBY-LA-Hot-Dog-175k.png --crops 128 --size 320 --seed fixel-band-v1
node tools/metrics.mjs --emit-band docs/band-pixel-v1.json refs/EBY-LA-Hot-Dog-175k.png \
    --crops 128 --size 320 --seed fixel-band-v1
```

Reference: `refs/EBY-LA-Hot-Dog-175k.png`, 1189x840, 8-bit RGBA, non-interlaced.
Crops: 128 unscaled 320x320 windows from the interior, inset 24px from every edge, positioned
only by `new Rng('fixel-band-v1').stream('crops')`. The first four rects are
`(716,121) (356,224) (696,201) (643,260)`. Emitting the band three times in three separate
processes produced byte-identical files.

**Sanity check: the whole-image change rate reproduces exactly.** `changeRate.h = 0.2920` and
`changeRate.v = 0.2892`, matching the independently measured values for this file to four decimal
places. The reader is measuring the same pixels the same way.

## Table A — the reference: whole image vs. 128 seeded 320x320 interior crops

| metric | whole image | crop p05 | crop p50 | crop p95 |
|---|---:|---:|---:|---:|
| `changeRate.h` | 0.2920 | 0.2666 | 0.2916 | 0.3246 |
| `changeRate.v` | 0.2892 | 0.2452 | 0.2899 | 0.3363 |
| `changeRate.combined` | 0.2906 | 0.2568 | 0.2904 | 0.3301 |
| `runLen.mean` | 3.418 | 3.061 | 3.403 | 3.718 |
| `runLen.median` | 2.00 | 2.00 | 2.00 | 2.00 |
| `runLen.p90` | 8.00 | 7.00 | 8.00 | 9.00 |
| `runLen.p99` | 23.00 | 20.00 | 22.00 | 27.65 |
| `runLen.fracGt8` | 0.4118 | 0.3509 | 0.3957 | 0.4563 |
| `runLen.fracGt16` | 0.1880 | 0.1254 | 0.1637 | 0.2280 |
| `colorsPerTile.mean16` | 8.300 | 7.286 | 8.654 | 10.486 |
| `colorsPerTile.median16` | 7.00 | 7.00 | 8.00 | 9.00 |
| `colorsPerTile.mean32` | 17.29 | 14.61 | 18.18 | 22.71 |
| `colorsPerTile.median32` | 15.00 | 13.00 | 17.00 | 20.32 |
| `palette.distinct` | 3021 | 337 | 500 | 747 |
| `palette.n50` | 48 | 13 | 16 | 21 |
| `palette.n90` | 512 | 81 | 116 | 160 |
| `palette.n99` | 1588 | 205 | 298 | 447 |
| `palette.top1Share` | 0.0484 | 0.0553 | 0.0769 | 0.1268 |
| `hue.buckets1pct` | 17 | 11 | 14 | 18 |
| `hue.meanSat` | 0.3225 | 0.2862 | 0.3356 | 0.4040 |
| `hue.fracNearGrey` | 0.5789 | 0.5096 | 0.5907 | 0.6695 |
| `edge.fracLowContrast` (was `edge.fracSoft`) | 0.0422 | 0.0142 | 0.0338 | 0.0762 |
| `edge.fracHard` | 0.8693 | 0.8299 | 0.8780 | 0.9239 |
| `edge.meanDelta` | 205.73 | 192.70 | 207.64 | 228.07 |
| `tileRepeat.fracNonUnique` | 0.0209 | 0.0000 | 0.0128 | 0.0506 |
| `tileRepeat.largestCluster` | 0.0006 | 0.0007 | 0.0020 | 0.0033 |
| `flat.frac3x3` | 0.3467 | 0.2957 | 0.3354 | 0.4053 |
| `flat.largestRegion` | 0.0088 | 0.0145 | 0.0185 | 0.0313 |
| `vGrad.rowMean` | 0.2906 | 0.2568 | 0.2904 | 0.3301 |
| `vGrad.rowMin64` | 0.2425 | 0.2101 | 0.2558 | 0.2875 |
| `vGrad.rowMin64Ratio` | 0.8345 | 0.7819 | 0.8911 | 0.9386 |
| `vGrad.colMean` | 0.2907 | 0.2569 | 0.2905 | 0.3300 |
| `vGrad.colMin64` | 0.2197 | 0.1663 | 0.2413 | 0.2936 |
| `vGrad.colMin64Ratio` | 0.7559 | 0.6530 | 0.8290 | 0.9166 |

### Read the whole-image column with care

Four metric families are **area-dependent**, and their whole-image value is not comparable to the
crop band: `palette.*` (3021 distinct colours over the full frame vs. 500 in a typical crop),
`flat.largestRegion` and `tileRepeat.largestCluster` (both are fractions of the frame, and the
frame is 9.7x bigger). The band is defined on 320x320 crops because the duel is fought on 320x320
crops. **Never score a whole image against `band-pixel-v1`.** `tools/metrics.mjs --band` enforces
this: it re-crops the target with the band's own size and seed and scores the median crop.

## What each metric detects, and which direction is the failure

**`changeRate`** — fraction of horizontally / vertically adjacent pixel pairs that differ. The most
direct "is anything happening" number. *Fails low* on sparseness: flat fills, empty sky, untextured
slabs. *Fails high* on noise or dithering. The reference sits at 0.29 on both axes, and the two axes
agree to within 0.003 — a Pixorama is isotropic, it has as much going on vertically as horizontally.
A generator that draws horizontal bands will show a v/h split long before either number leaves band.

**`runLen`** — horizontal run-length distribution. Higher resolution on sparseness than
`changeRate`: the mean says how often colour changes, the tail says whether the frame is made of
many medium runs or a few enormous ones. `p99 = 22` means even the longest 1% of runs are only ~22px
in a 320px-wide crop — there is no dead slab anywhere. `fracGt8 = 0.40` / `fracGt16 = 0.16`: only 16%
of pixels live inside a run longer than 16. *Fails high* on sparseness, *fails low* on noise (every
pixel its own run). Note `runLen.mean` is close to `1/changeRate.h` by construction; the percentiles
are the part that carries new information.

**`colorsPerTile`** — distinct colours per non-overlapping 16x16 and 32x32 tile. This is the metric
closest to what a judge means by "dense": the reference puts ~8.7 distinct colours in every 16x16
tile and ~18 in every 32x32. *Fails low* on empty or monotone tiles. *Fails high* on gradients and
antialiasing, which manufacture dozens of near-identical colours per tile without adding structure.

**`paletteConcentration`** — total distinct colours plus how many are needed to cover 50/90/99% of
pixels. This is the numeric form of "few hues, dense pixels": in a typical crop, **16 colours cover
half the frame** while the full palette is ~500. That shape — a short dominant head and a long thin
detail tail — is the signature. *Fails low* on flatness (one colour eating the frame); *fails high*
on colour soup. `top1Share = 0.077` says no single colour owns more than about a twelfth of any crop.

**`hueCount`** — 15-degree hue buckets holding at least 1% of chromatic pixels (saturation >= 0.15
and value >= 0.10), plus mean saturation and the near-grey fraction. 14 live hue families, mean
saturation 0.336, and **59% of pixels are near-grey**. That last number is the surprising one and it
is load-bearing: the reference reads as colourful because a moderate number of saturated hues sit
against a large neutral concrete/asphalt mass. *Fails low* on monochrome, *fails high* on rainbow
soup. A generator that saturates everything will fail `fracNearGrey` low while its hue count looks fine.

**`edgeHardness`** — RGB L2 delta across every differing adjacent pair, bucketed soft (<24) and hard
(>72). The reference is emphatically bimodal: **87.8% of transitions are hard jumps, only 3.4% are
soft**, mean delta 208 out of a possible 441. This is the antialiasing detector. *Fails high on
`fracSoft`* — that is the loud failure, and it is what a scaled, rendered, or gradient-filled image
looks like. *Fails low* more quietly: zero soft transitions means no shading vocabulary at all.

**`tileRepeat`** — every 16x16 tile hashed at 8px stride; fraction non-unique and largest cluster.
The reference has 1.3% non-unique tiles and its largest single cluster is 0.2% of tiles — essentially
nothing repeats. *Fails high*: a stamped generator lights this up immediately. The floor is not a
real defect and is labelled `oneSidedInPractice: "high"` in the band file.

**`flatness`** — fraction of pixels whose full 3x3 neighbourhood is one colour, plus the largest
4-connected same-colour region. 33.5% of pixels sit in the interior of a flat fill, which is *normal
and required* — hard-edged flat fill is the style. What is not normal is one big region:
the largest connected same-colour blob in a typical crop is **1.9% of the crop**. *Fails high* on
both. `largestRegion` is the acute detector: a frame can hold its average `changeRate` and still have
a 40%-of-frame dead sky, and only this number and `vGrad` will see it.

**`vGrad`** — per-row and per-column local activity (change rate within the line plus change rate to
the next line), reported as the mean, the minimum over any 64-line band, and their ratio. The
reference's quietest 64-row band still runs at **89% of its own mean activity** (columns: 83%). There
is no dead band anywhere in the frame. *Fails low*: this is the empty-sky detector, and the ratio
form makes it scale-free — a generator cannot pass by being uniformly busy at the wrong density,
because `rowMean` is banded separately. High is not a defect and is labelled one-sided.

## Table B — calibration against the other three references

Bold = outside the band. EBY, Lufthansa and Shift-Bild are scored as the median of 128 seeded
320x320 crops. The Horse is 223x243 and **cannot** yield a 320x320 interior crop, so it is scored
whole-image and is advisory only (see the scale-dependence note above — its `palette.*` and
`largestRegion` figures are not strictly comparable).

| metric | band [p05,p95] | EBY (p50) | Lufthansa (p50) | Shift-Bild-03 (p50) | Horse (whole) |
|---|---:|---:|---:|---:|---:|
| `changeRate.h` | [0.2666, 0.3246] | 0.2916 | 0.2685 | **0.1230** | **0.0660** |
| `changeRate.v` | [0.2452, 0.3363] | 0.2899 | **0.2216** | **0.1316** | **0.0624** |
| `changeRate.combined` | [0.2568, 0.3301] | 0.2904 | **0.2504** | **0.1267** | **0.0642** |
| `runLen.mean` | [3.061, 3.718] | 3.403 | 3.693 | **7.953** | **14.249** |
| `runLen.median` | [1.50, 2.50] | 2.00 | 2.00 | 2.00 | 2.00 |
| `runLen.p90` | [7.00, 9.00] | 8.00 | 9.00 | **17.00** | **47.00** |
| `runLen.p99` | [20.00, 27.65] | 22.00 | **29.00** | **112.00** | **141.98** |
| `runLen.fracGt8` | [0.3509, 0.4563] | 0.3957 | **0.4773** | **0.7627** | **0.9016** |
| `runLen.fracGt16` | [0.1254, 0.2280] | 0.1637 | 0.2269 | **0.6741** | **0.8211** |
| `colorsPerTile.mean16` | [7.286, 10.486] | 8.654 | **6.223** | **3.147** | **2.779** |
| `colorsPerTile.median16` | [7.00, 9.00] | 8.00 | **6.00** | **2.00** | **1.00** |
| `colorsPerTile.mean32` | [14.61, 22.71] | 18.18 | **11.54** | **4.28** | **4.62** |
| `colorsPerTile.median32` | [13.00, 20.32] | 17.00 | **11.00** | **3.00** | **3.50** |
| `palette.distinct` | [337, 747] | 500 | **190** | **17** | **22** |
| `palette.n50` | [13, 21] | 16 | **11** | **1** | **1** |
| `palette.n90` | [81, 160] | 116 | **45** | **5** | **4** |
| `palette.n99` | [205, 447] | 298 | **113** | **13** | **12** |
| `palette.top1Share` | [0.0553, 0.1268] | 0.0769 | 0.1036 | **0.7849** | **0.6675** |
| `hue.buckets1pct` | [11, 18] | 14 | 11 | **6** | **3** |
| `hue.meanSat` | [0.2862, 0.4040] | 0.3356 | **0.2631** | **0.0567** | **0.0998** |
| `hue.fracNearGrey` | [0.5096, 0.6695] | 0.5907 | **0.4742** | **0.8888** | **0.7386** |
| `edge.fracLowContrast` (was `edge.fracSoft`) | [0.0142, 0.0762] | 0.0338 | **0.0069** | **0.0000** | **0.1599** |
| `edge.fracHard` | [0.8299, 0.9239] | 0.8780 | 0.8943 | **0.9988** | **0.5442** |
| `edge.meanDelta` | [192.70, 228.07] | 207.64 | 220.82 | **267.46** | **134.78** |
| `tileRepeat.fracNonUnique` | [0.0000, 0.0506] | 0.0128 | 0.0217 | **0.6236** | **0.5119** |
| `tileRepeat.largestCluster` | [0.0007, 0.0033] | 0.0020 | **0.0072** | **0.2613** | **0.4523** |
| `flat.frac3x3` | [0.2957, 0.4053] | 0.3354 | 0.4022 | **0.6985** | **0.8334** |
| `flat.largestRegion` | [0.0145, 0.0313] | 0.0185 | 0.0212 | **0.1211** | **0.2976** |
| `vGrad.rowMean` | [0.2568, 0.3301] | 0.2904 | **0.2504** | **0.1268** | **0.0643** |
| `vGrad.rowMin64` | [0.2101, 0.2875] | 0.2558 | 0.2119 | **0.0717** | **0.0484** |
| `vGrad.rowMin64Ratio` | [0.7819, 0.9386] | 0.8911 | 0.8599 | **0.6056** | **0.7528** |
| `vGrad.colMean` | [0.2569, 0.3300] | 0.2905 | **0.2504** | **0.1267** | **0.0643** |
| `vGrad.colMin64` | [0.1663, 0.2936] | 0.2413 | 0.2205 | **0.0528** | **0.0482** |
| `vGrad.colMin64Ratio` | [0.6530, 0.9166] | 0.8290 | 0.8793 | **0.4559** | 0.7487 |

### Verdicts

| file | result | hard fails | worst metric |
|---|---|---:|---|
| `EBY-LA-Hot-Dog-175k.png` (the bar) | **PASS 34/34** | 0 | — |
| `C3L Lufthansa Frankfurt Pixorama 45k.png` | **FAIL, narrowly** | 17 | `tileRepeat.largestCluster` +1.50 bw |
| `Shift-Bild-03.png` | **FAIL, catastrophically** | 32 | `tileRepeat.largestCluster` +98.13 bw |
| `PT-ePaul-Horse-05t.png` (advisory) | **FAIL, catastrophically** | 32 | `tileRepeat.largestCluster` +170.72 bw |

**The Lufthansa Pixorama is close, as expected.** Same craft family, and it passes `changeRate.h`,
`runLen.mean/median/p90`, `runLen.fracGt16`, `palette.top1Share`, `hue.buckets1pct`, `edge.fracHard`,
`edge.meanDelta`, `flat.frac3x3`, `flat.largestRegion` and every `vGrad` min/ratio. It fails 17
metrics but almost all by less than half a band-width, and in a consistent direction: it is a
*smaller, simpler* Pixorama — fewer colours (189 vs 500 per crop), fewer colours per tile (6.2 vs
8.7), slightly longer runs. It is a legitimately less dense piece of the same craft, and the band
says so with small numbers rather than large ones. That is the behaviour we want.

**`Shift-Bild-03.png` fails the density metrics hard, which is the calibration that matters.** It is
a sparse wireframe-ish plan, and it is rejected on 32 of 34 metrics: `changeRate.h` 0.1230 against a
floor of 0.2666 (-2.48 band-widths), `runLen.p99` 112 against a ceiling of 27.65 (+11.03),
`runLen.fracGt16` 0.674 against 0.228 (+4.35), `colorsPerTile.median16` 2 against a floor of 7
(-2.50), `palette.top1Share` 0.785 against 0.127 (+9.21 — one colour owns 78% of the frame),
`flat.frac3x3` 0.699 (+2.67), `flat.largestRegion` 0.121 (+5.34), `vGrad.rowMin64` 0.072 against a
floor of 0.210 (-1.79), and `tileRepeat.largestCluster` 0.261 against a ceiling of 0.0033 (+98.13).
It clears exactly one metric, `runLen.median`, and only because that metric is integer-quantised
(see weaknesses). **The density metrics have teeth.**

The Horse is a small centred sprite on a flat ground — it fails the same way but harder, and it is
the only reference that fails `edge.fracSoft` on the *high* side (0.160 against a ceiling of 0.076,
+1.35 band-widths). It is antialiased. The edge-hardness metric works as intended.

## Adversarial check — the cheats a generator would actually try

Four synthetic 320x320 images, scored against the same band. None of them are in the repo; this
was a one-off check that the ceilings are not decorative.

| cheat | hard fails | what caught it |
|---|---:|---|
| uniform RGB noise | 25/34 | `palette.n50` +6360 bw, `colorsPerTile.mean16` +76.7 bw, `changeRate.h` +11.7 bw |
| noise quantised to the reference's own top 48 colours | 23/34 | `colorsPerTile.median16` +19.5 bw, `changeRate.h` +11.3 bw, `runLen.mean` -3.10 bw |
| one real 16x16 reference patch stamped across the frame | 15/34 | `tileRepeat.largestCluster` +98.8 bw, `tileRepeat.fracNonUnique` +18.8 bw |
| a **real reference crop** with its top 128 rows flattened to sky | 28/34 | `vGrad.rowMin64Ratio` -4.99 bw, `flat.largestRegion` +21.9 bw, `vGrad.rowMin64` -2.72 bw |

The fourth is the important one. It is genuine reference pixels over 60% of the frame, and its
`changeRate.h` only drops to 0.179 — a single-sided density floor would have let it through at
-1.52 band-widths while `vGrad.rowMin64Ratio` collapses to 0.000 at -4.99. The composition metrics
are doing work the density metrics cannot.

The second is the reason every band is two-sided. Palette-quantised noise has the reference's exact
palette and clears every "few hues" floor; it is rejected purely on ceilings.

## Known weaknesses — read this before trusting a pass

1. **`tileRepeat` is an exact-match hash and is the weakest metric here.** A generator that recolours
   the same silhouette per instance, or jitters one pixel per stamp, will read as fully unique while
   still looking repetitive to a judge. A perceptual-hash or autocorrelation version would be
   strictly better. Do not treat a `tileRepeat` pass as evidence of variety.
2. **`runLen.median` is degenerate.** Every one of the 128 reference crops measured exactly 2, so the
   raw band was zero-width. It is widened to [1.5, 2.5] by half the observed quantisation step, and
   the band file records that under `widenedFromDegenerate`. In practice this metric carries almost
   no information; `p90`/`p99`/`fracGt16` carry it instead.
3. **`runLen.mean` is largely redundant** with `changeRate.h` (`mean ~ 1/changeRate.h`). Passing both
   is not two pieces of evidence.
4. **`flat.frac3x3` and `flat.largestRegion` are cheap to game** by sprinkling isolated pixels into
   big flat areas: the area still reads as empty to a judge but both numbers move. Cross-check
   against `colorsPerTile` and `vGrad` before believing a pass.
5. **34 metrics on 128 crops of one image.** The metrics are not independent — `changeRate.combined`,
   `vGrad.rowMean` and `vGrad.colMean` are near-identical by construction (0.2904 / 0.2904 / 0.2905),
   so "PASS 30/34" overstates the evidence. Weight the hard-fail list, not the pass count.
6. **The band is p05..p95 of one artwork.** 10% of the reference's own crops fall outside it by
   construction. It is a target distribution, not a proof of quality.
7. **No structural or semantic metric exists here.** Nothing in this file can tell isometric
   architecture from a dense field of correctly-coloured confetti. Every number can be in band and
   the scene can still be nonsense. That is what the blind judge is for; these metrics only
   guarantee we do not waste a judge on something obviously sparse or obviously stamped.

---

# Part 2 — structural metrics (band `pixel-v2`)

Everything above counts how often pixels differ. None of it can tell isometric architecture from a
dense field of correctly-coloured confetti — that was the closing warning in Part 1, and it was
right. `docs/BAR.md` (opened only after Part 1 was on disk) named five structural properties we were
blind to. All five are now measured. `docs/band-pixel-v2.json` carries 60 metrics: the 34 from
Part 1, byte-identical, plus 26 new ones.

Same derivation as before:

```
node tools/metrics.mjs --emit-band docs/band-pixel-v2.json refs/EBY-LA-Hot-Dog-175k.png \
    --crops 128 --size 320 --seed fixel-band-v1
```

Verified: all 34 v1 metrics reproduce byte-identically under the v2 build, and three separate
processes emit an identical v2 band file.

## Table C — did BAR.md's expectations reproduce?

These were not copied. Each was re-derived by `tools/metrics.mjs` from the reference and only then
compared. Whole-image LA values.

| BAR.md claim | BAR.md | my measurement | reproduced? |
|---|---:|---:|---|
| staircase vote 1:1 (LA) | 14.5% | 20.6% | no — mine runs high |
| staircase vote 2:1 (LA) | 71.9% | 69.3% | close (69.3 vs 71.9) |
| staircase vote 3:1 (LA) | 8.4% | 5.1% | no — mine runs low |
| staircase vote 4:1 (LA) | 5.2% | 5.0% | no — mine runs low |
| outline-mask +/-2 peak > +/-1 | yes | 1.189 (>1) | YES |
| outline-mask +/-2 peak > +/-3 | yes | 1.339 (>1) | YES |
| flat 5x5, LA | 16.6% | 16.6% | EXACT |
| 2x2 checkerboard (dither) rate | 1.7-2.1% | 2.13% | yes (top of range) |
| canvas below luma 45, LA | 15.95% | 15.95% | EXACT |
| dark runs len 1+2 (run-weighted) | 91% | 89.4% | close (89.4 vs 91) |
| black mediates diff-material | 41-43% | 49.4% | NO — mine reads 49.4% |
| black mediates same-material | 34-35% | 28.5% | NO — mine reads 28.5% |
| face luma ratio, median | 0.72 | 0.753 | close (0.753 vs 0.72) |
| hue rotation across dark step | -3.6 deg | -0.15 deg | yes — both ~zero |

**Four exact or near-exact reproductions from independent definitions.** `flat5x5` landed on 16.6%
for LA, 26.4% for Frankfurt and 69.9% for Shift-Bild — all three to the decimal BAR states. The
near-black canvas share landed on 15.95%. Those are not the same code and not the same reader, so
the property is real and not an artefact of either implementation.

**Three disagreements, stated loudly rather than smoothed over:**

1. **The staircase histogram is shifted.** I read LA as 20.6% at 1:1 / 69.3% at 2:1 / 5.1% at 3:1 /
   5.0% at 4:1; BAR reads 14.5 / 71.9 / 8.4 / 5.2. The 2:1 figure agrees within 2.6 points, but my
   1:1 bucket is 6 points fat and my 3:1 bucket 3 points thin. The gap is worse on Shift-Bild, where
   I read 69.7% at 2:1 against BAR's 94.7%. My definition traces the horizontal-boundary mask
   (`pixel != pixel below`) and requires four strictly-adjacent linked runs; a wireframe plan drawn
   in thin lines yields *two* boundaries per line (above and below), which manufactures short runs
   and inflates my 1:1 bucket. **On the architectural refs I trust my number; on thin-line drawings
   I do not.** What both readers agree on, and what actually matters: 2:1 dominates at roughly
   70-80%, and the residual at 1:1 is deliberate and substantial, not noise.
2. **The black-mediation levels do not reproduce.** BAR: 41-43% different-material vs 34-35%
   same-material. Mine: 49.4% vs 28.5%. The *direction* reproduces emphatically — black is biased to
   object-vs-object boundaries — but my gap is +20.9 points against BAR's ~+7. This is my proxy
   being cruder than theirs; see the honesty note below.
3. **`edge.fracAA` does not reproduce BAR's ranking.** BAR: Frankfurt 4.0% > LA 3.0% > Shift 0.5% >
   horse 0%. Mine: horse 3.7% > Shift 1.7% > LA 1.45% > Frankfurt 1.27%. The headline claim — that
   ≥96% of hard edges in every reference are literally hard — reproduces on all four files. The
   ordering does not, and my detector has a demonstrated false positive on the horse (below).

## Table A2 — the reference: whole image vs 128 seeded 320x320 crops

| metric | whole image | crop p05 | crop p50 | crop p95 |
|---|---:|---:|---:|---:|
| `edge.fracLowContrast` | 0.0422 | 0.0142 | 0.0338 | 0.0762 |
| `edge.fracAA` | 0.0145 | 0.0097 | 0.0143 | 0.0193 |
| `slope.r1` | 0.2062 | 0.1304 | 0.1886 | 0.3327 |
| `slope.r2` | 0.6929 | 0.5587 | 0.7229 | 0.7767 |
| `slope.r3` | 0.0507 | 0.0266 | 0.0357 | 0.0619 |
| `slope.r4` | 0.0501 | 0.0298 | 0.0474 | 0.0643 |
| `slope.r5plus` | 0.0637 | 0.0336 | 0.0510 | 0.0803 |
| `slope.corr2v1` | 1.189 | 1.088 | 1.133 | 1.286 |
| `slope.corr2v3` | 1.339 | 1.232 | 1.294 | 1.447 |
| `slope.corrDx0Share` | 0.1547 | 0.1425 | 0.1583 | 0.1736 |
| `flat.frac5x5` | 0.1661 | 0.1228 | 0.1489 | 0.2215 |
| `dither.rate` | 0.0213 | 0.0158 | 0.0194 | 0.0248 |
| `outline.darkShare` | 0.1595 | 0.1445 | 0.1624 | 0.1956 |
| `outline.run1Share` | 0.6495 | 0.6084 | 0.6457 | 0.6926 |
| `outline.run12Share` | 0.8940 | 0.8704 | 0.8913 | 0.9152 |
| `outline.run12PixShare` | 0.6631 | 0.5906 | 0.6524 | 0.7340 |
| `outline.blackMediatedDiff` | 0.4941 | 0.4088 | 0.5208 | 0.5733 |
| `outline.blackMediatedSame` | 0.2846 | 0.2303 | 0.2916 | 0.3333 |
| `outline.mediationGap` | 0.2095 | 0.1384 | 0.2267 | 0.2923 |
| `shade.lumaRatioMedian` | 0.7532 | 0.6193 | 0.7326 | 0.7733 |
| `shade.lumaRatioP25` | 0.6390 | 0.5406 | 0.6419 | 0.7037 |
| `shade.lumaRatioP75` | 0.7871 | 0.7168 | 0.7848 | 0.8298 |
| `shade.hueRotMedian` | -0.1535 | -2.6190 | -0.4022 | 0.0837 |
| `shade.hueRotAbsMedian` | 2.619 | 0.331 | 2.619 | 5.638 |
| `shade.sampleShare` | 0.0172 | 0.0109 | 0.0160 | 0.0291 |
| `tileRepeat.pNearDupFrac` | 0.1589 | 0.0386 | 0.0917 | 0.2086 |
| `tileRepeat.pMaxCluster` | 0.0216 | 0.0046 | 0.0131 | 0.0407 |

## What each structural metric detects

### `flat.frac5x5` — and the tension that is the actual target

**16.6% of the reference sits inside a totally flat 5x5 block, while its change rate is 0.29.** Those
two facts sound contradictory and they are the whole style. Part 1 treated flatness purely as
something to keep low. That was half wrong, and this metric is two-sided for a real reason: below the
floor means the image was rendered or resampled (a Blender downsample, a JPEG round-trip or a
diffusion output scores 0-2%, because none of them can hold 25 adjacent pixels at exactly one value);
above the ceiling means sparse.

**How a generator satisfies both at once — read off the pixels, not from theory.** The density does
not come from texture *inside* surfaces. It comes from the *number of surfaces*. Every face in the
reference is a flat fill of exactly one colour, and those faces are small and packed: 8.7 distinct
colours per 16x16 tile, a new colour boundary every 3.4 pixels on average. The run-length
distribution shows the mechanism directly — median run 2, p90 8, p99 22. Most runs are short because
facet edges are close together; a solid minority are long enough (>= 5 in both axes) to contain a
flat 5x5 core. 34.7% of pixels have a flat 3x3 neighbourhood and 16.6% a flat 5x5, so roughly half
the flat interiors are at least 5px across.

So the generator rule is: **never texture the interior of a face; make faces smaller and more
numerous instead.** A facet should be one flat colour, at least ~5-6px across its short dimension, and
there should be a new facet every few pixels. Noise puts detail inside surfaces and scores 0% here.
A sparse generator makes faces too big and scores 70%+. The reference does neither.

### `edge.fracLowContrast` and `edge.fracAA` — one metric split into two claims

Part 1 shipped a single `edge.fracSoft`: the share of adjacent differing pairs whose RGB L2 delta is
below 24, described as an antialiasing detector. **That description was wrong and it produced a false
positive on a real control.** A deliberately hard-edged generator smoke test
(`out/look/smoke.png` — flat-shaded iso boxes on a checkerboard ground, zero blending anywhere in the
source) scores **0.3118**, against the reference's 0.042. Its ground is a two-step checkerboard of
(90,92,96) against (78,80,84): an L2 delta of 20.8, a completely hard edge that the threshold calls
soft. A critic reading that number would report "the generator is antialiasing", which is false.

The two claims are now two metrics:

- **`edge.fracLowContrast`** (the old number, renamed) — share of transitions below L2 24. A real
  gate: the reference genuinely keeps low-contrast transitions rare, because eBoy steps the palette
  rather than nudging it. But it is a statement about *contrast*, not about antialiasing.
- **`edge.fracAA`** (new, using BAR's definition) — a dark->light step of >= 60 luma measured 2px
  apart with a genuine mid-tone pixel between, at least 25% of the step clear of both neighbours.
  That 1px intermediate is what blending, bilinear scaling and JPEG create and what hand-placed pixel
  art does not. On smoke.png it reads **0.0079**, correctly reporting *not antialiased*.

On the same control the two metrics now disagree by design: `fracLowContrast` +3.80 band-widths FAIL,
`fracAA` −0.19 (advisory, below the floor, which is the ideal direction). That disagreement is the
diagnosis: *low-contrast palette steps, not resampling.*

**This also corrects a claim in the Part 1 report.** I wrote that the horse "is antialiased" on the
strength of `fracSoft` = 0.16. The true detector reads 3.7% on the horse — the same order as LA's
1.45% — and BAR independently reports the horse as having zero partial-alpha edge pixels. The horse
is *not* antialiased; it has low-contrast mid-tone shading steps. My original claim was wrong.

**The low-contrast rate is biased against dark materials, and the generator will hit this.** A luma
ratio of 0.72 between adjacent faces is a large absolute RGB step on a light material and a small one
on a dark one, so an absolute threshold of 24 misfires on shadow and asphalt. Measured, share of
differing horizontal pairs falling below L2 24, split by the mean luma of the pair:

| file | dark (<64) | mid (64-128) | light (>128) |
|---|---:|---:|---:|
| LA reference | **9.60%** | 2.01% | 4.24% |
| Frankfurt | **3.51%** | 0.17% | 1.55% |
| horse | 4.64% | **40.67%** | 0.00% |
| smoke.png control | 0.00% | **40.83%** | 0.19% |

The reference is 4.8x more likely to trip the low-contrast rule on dark materials than on mid-tones,
and Frankfurt 20x. So expect Fixel's asphalt, shadow and night-window families to push
`edge.fracLowContrast` up for reasons that are not defects — check `edge.fracAA` before calling it a
bug. Note also that neither the horse's nor smoke.png's low-contrast mass is in the dark band: both
sit in the mid-tones, which is a different failure (a two-value texture at low contrast) from the
reference's dark-material behaviour.

### `slope.*` — the projection gate

The staircase vote is the metric that will fail Fixel first, exactly as predicted. The reference
spreads its monotone staircases across 69.3% at 2:1, 20.6% at 1:1, 5.1% at 3:1 and 5.0% at 4:1 — the
1:1 population is gables, hips, cross-braces and organic forms, and it is deliberate. **The generator
smoke test reads 91.8% at 2:1 and 8.2% at 1:1**, i.e. mechanically pure by construction, +0.65
band-widths above the ceiling. Both bounds are real: below the floor means no dimetric discipline at
all, above it means a machine drew it.

`slope.corr2v1` and `corr2v3` are the row-shift correlation of the near-black outline mask: on the
reference the ±2 peak stands above both ±1 and ±3 (1.189 and 1.339), confirming BAR's claim that the
z axis is exactly vertical and the ground steps 2:1. On smoke.png both collapse to ~1.00, because
85% of that image is below luma 45 and the "outline mask" is meaningless — a useful reminder that
these two are only interpretable when `outline.darkShare` is itself in band.

### `dither.rate` — manufactured density

2x2 checkerboard rate: LA 2.13%, Frankfurt 1.85%, Shift-Bild 1.74%. Essentially none — eBoy adds a
palette step rather than dithering between two. This is the gate that stops a generator from
manufacturing its change rate out of a checkerboard and passing every Part 1 density metric while
reading as mush. The ceiling is what matters; the floor is not a real defect.

### `outline.*` — the outline system

15.95% of the LA canvas sits below luma 45, and 89.4% of horizontal dark runs are 1 or 2 pixels long
— outlines are exactly 1px, and a 1px line at 2:1 necessarily reads as a 2px horizontal run. Runs of
3+ are reserved for genuinely dark materials. smoke.png shows what the absence of an outline system
looks like numerically: `darkShare` 0.85 (+12.83 band-widths, the whole image is dark) and
`run12Share` 0.00 (−19.45), i.e. no 1px lines anywhere.

**Honest limitation on the discrimination number.** BAR asks what fraction of transitions between
*different materials* are mediated by near-black versus between two faces of the *same* material.
"Material" is not recoverable from pixels. What I actually measure is **hue proximity**: two colours
within 20 degrees of hue, or both achromatic, are called one material. That proxy is wrong in two
known ways — every grey collapses into a single "material", so two different concrete surfaces read
as one; and a deliberately two-tone object reads as two materials. My levels (49.4% / 28.5%) are
correspondingly further apart than BAR's (41-43% / 34-35%). **I could not separate material identity
from hue identity robustly, and I am not going to pretend otherwise.** The direction survives the
error, so the metric to gate on is `outline.mediationGap` = diff − same, which is +0.21 on the
reference, +0.29 on Frankfurt, and **−0.10 on Shift-Bild** (which uses black indiscriminately). Trust
the gap; treat the absolute levels as soft.

### `shade.*` — the face ladder

Median luma ratio between adjacent same-hue faces is 0.753 (BAR: 0.72), with p25 0.639 and p75 0.787
— consistent with a three-value ladder of roughly top 1.00 / left 0.82 / right 0.66. The
load-bearing number is the hue rotation across the darker step: **−0.15 degrees median, 2.62 degrees
median absolute.** The reference does not rotate hue in shadow. Procedural shaders almost always do,
because multiplying by a cool light colour or lerping in HSV drags shadows toward blue. `shade.hueRotAbsMedian` is the gate to use rather than the signed median, because a generator that rotates
+8 degrees on half its faces and −8 on the rest would show a median near zero while being visibly
wrong.

### `tileRepeat.p*` — the perceptual variant

Part 1 flagged the exact tile hash as the weakest metric: recolour each stamp or jitter one pixel and
it reads fully unique. Confirmed and fixed. Against a 16x16 reference patch stamped across a frame
with **per-instance recolouring**, the exact hash catches 0.143 and the perceptual hash 1.000;
with **per-instance 1px jitter**, exact catches 0.583 and perceptual 1.000. The descriptor is a
64-bit dHash over luma (16x16 box-downsampled to 8x8, one bit per horizontal neighbour comparison),
matched at Hamming <= 4, comparing only spatially non-overlapping tiles.

The reference itself reads 0.159 whole-image — that residual is *real* repeated structure (windows,
brick, kerbs at the 16px scale), not degenerate hashing: gating out near-flat tiles by luma variance
moved it only 0.258 -> 0.253 at the looser threshold. Read this metric by its ceiling. It still does
not catch a mirrored, rotated, or re-silhouetted stamp.

## Table B2 — structural calibration

Bold = outside the v2 band. LA / Frankfurt / Shift-Bild are the median of 128 seeded 320x320 crops;
the horse (223x243) and smoke.png (too small or not crop-comparable) are whole-image and advisory.

| metric | band [p05,p95] | LA (p50) | Frankfurt (p50) | Shift-Bild (p50) | Horse (whole) | smoke.png (whole) |
|---|---:|---:|---:|---:|---:|---:|
| `edge.fracLowContrast` | [0.0142, 0.0762] | 0.0338 | **0.0069** | **0.0000** | **0.1599** | **0.3118** |
| `edge.fracAA` | [0.0097, 0.0193] | 0.0143 | 0.0129 | **0.0279** | **0.0372** | **0.0079** |
| `slope.r1` | [0.1304, 0.3327] | 0.1886 | 0.1324 | 0.3000 | **0.4196** | **0.0818** |
| `slope.r2` | [0.5587, 0.7767] | 0.7229 | **0.7880** | 0.6857 | **0.2143** | **0.9182** |
| `slope.r3` | [0.0266, 0.0619] | 0.0357 | 0.0336 | **0.0000** | 0.0536 | **0.0000** |
| `slope.r4` | [0.0298, 0.0643] | 0.0474 | 0.0464 | **0.0000** | **0.3125** | **0.0000** |
| `slope.r5plus` | [0.0336, 0.0803] | 0.0510 | 0.0708 | **0.0000** | **0.0820** | **0.0318** |
| `slope.corr2v1` | [1.088, 1.286] | 1.133 | **1.368** | **1.588** | **0.571** | **0.998** |
| `slope.corr2v3` | [1.232, 1.447] | 1.294 | **1.653** | **1.658** | 1.247 | **1.004** |
| `slope.corrDx0Share` | [0.1425, 0.1736] | 0.1583 | **0.2196** | **0.2811** | **0.2488** | **0.1118** |
| `flat.frac5x5` | [0.1228, 0.2215] | 0.1489 | 0.2080 | **0.5776** | **0.7470** | **0.8734** |
| `dither.rate` | [0.0158, 0.0248] | 0.0194 | 0.0181 | 0.0187 | **0.0050** | **0.0007** |
| `outline.darkShare` | [0.1445, 0.1956] | 0.1624 | **0.1194** | **0.0329** | **0.0252** | **0.8519** |
| `outline.run1Share` | [0.6084, 0.6926] | 0.6457 | **0.7476** | 0.6387 | **0.8735** | **0.0000** |
| `outline.run12Share` | [0.8704, 0.9152] | 0.8913 | **0.9392** | **0.9462** | **0.9416** | **0.0000** |
| `outline.run12PixShare` | [0.5906, 0.7340] | 0.6524 | **0.7929** | **0.8852** | **0.7588** | **0.0000** |
| `outline.blackMediatedDiff` | [0.4088, 0.5733] | 0.5208 | 0.4629 | **0.0862** | **0.6525** | **0.0000** |
| `outline.blackMediatedSame` | [0.2303, 0.3333] | 0.2916 | **0.1803** | **0.1904** | **0.0703** | **0.0000** |
| `outline.mediationGap` | [0.1384, 0.2923] | 0.2267 | 0.2902 | **-0.1031** | **0.5822** | **0.0000** |
| `shade.lumaRatioMedian` | [0.6193, 0.7733] | 0.7326 | 0.6977 | 0.7298 | **0.7883** | 0.6819 |
| `shade.lumaRatioP25` | [0.5406, 0.7037] | 0.6419 | 0.6830 | 0.6298 | **0.7451** | 0.5727 |
| `shade.lumaRatioP75` | [0.7168, 0.8298] | 0.7848 | 0.7568 | 0.7298 | 0.8253 | 0.7212 |
| `shade.hueRotMedian` | [-2.6190, 0.0837] | -0.4022 | -0.4464 | 0.0000 | -0.1176 | 0.0000 |
| `shade.hueRotAbsMedian` | [0.331, 5.638] | 2.619 | **6.245** | **0.000** | **0.211** | **0.199** |
| `shade.sampleShare` | [0.0109, 0.0291] | 0.0160 | 0.0227 | **0.0028** | 0.0166 | **0.0048** |
| `tileRepeat.pNearDupFrac` | [0.0386, 0.2086] | 0.0917 | 0.1479 | **0.7761** | **0.7215** | **0.9549** |
| `tileRepeat.pMaxCluster` | [0.0046, 0.0407] | 0.0131 | **0.0457** | **0.4714** | **0.6074** | **0.8309** |

### Structural verdicts

| file | v2 result | hard fails | worst structural failure |
|---|---|---:|---|
| `EBY-LA-Hot-Dog-175k.png` (the bar) | **PASS 60/60** | 0 | — |
| `C3L Lufthansa Frankfurt Pixorama 45k.png` | FAIL | 27 | `slope.corrDx0Share` +1.48 bw |
| `Shift-Bild-03.png` | FAIL | 47 | `tileRepeat.pMaxCluster` +11.92 bw |
| `out/look/smoke.png` (generator control) | FAIL | 51 | `tileRepeat.pMaxCluster` +21.87 bw |

The generator smoke test is the useful one, because it is the only file here that anybody is trying
to fix. Its structural diagnosis, in priority order: no outline system at all (`darkShare` 0.85,
`run12Share` 0.00), everything stamped (`pMaxCluster` 0.83), faces far too large (`flat.frac5x5`
0.87), and the projection mechanically pure (`slope.r2` 0.918). Its shading ladder is the one thing
already right — `shade.lumaRatioMedian` 0.682 and `hueRotAbsMedian` 0.199 both sit in band.

## Known weaknesses — v2 additions

The Part 1 weakness list still stands. Added:

8. **The staircase histogram disagrees with BAR's by 6 points at 1:1 and is badly wrong on thin-line
   drawings** (69.7% vs 94.7% at 2:1 on Shift-Bild). My boundary-mask definition double-counts thin
   lines. Trust it on architecture, not on wireframes.
9. **`outline.blackMediated*` uses hue proximity as a stand-in for material identity.** All greys
   collapse to one material. Gate on `mediationGap`, not the levels.
10. **`edge.fracAA` has a demonstrated false positive on 1px organic shading** — it reads 3.7% on the
    horse, which has zero antialiased pixels. A shading ladder whose middle face is exactly 1px wide
    trips the mid-tone test. The bias is always upward, never downward, so a *low* reading is
    trustworthy and a high one needs a look.
11. **`slope.corr2v1` / `corr2v3` are only interpretable when `outline.darkShare` is in band.** If an
    image is 85% near-black, its "outline mask" is the whole image and the correlation is noise.
12. **`shade.sampleShare` is ~1.6% of adjacent pairs.** The face-ladder numbers are computed on a
    small, hue-selected subsample; they are stable across 128 crops but they describe the chromatic
    architecture only, not greys — and greys are 59% of the frame.
13. **60 metrics, still one artwork, still not independent.** `slope.r1`..`r4` are compositional by
    construction, and `outline.run1Share`/`run12Share`/`run12PixShare` are three views of one
    distribution. Weight the hard-fail list, never the pass count.

---

# Part 3 — acceptance is a budget, and the budget is not a score

`docs/BAR.md` says the audio side found that only 5 of 38 genuine tracks cleared all 17 audio bands,
moved the gate to a budget at the p95 of the leave-one-out fail-count distribution, and instructed
the pixel side to do the same. `tools/budget.mjs` does exactly that. It also, in the doing, produced
the finding that matters more than the budget: **the 60-metric count cannot rank things.**

Tooling: `node tools/budget.mjs --accept <genuine.png> --reject <artefact.png> --generator <ours.png>`
writes `docs/budget-pixel-v2.json`. `node tools/metrics.mjs --band docs/band-pixel-v2.json --budget
<file.png>` prints ACCEPT/REJECT after the existing table. `docs/band-pixel-v2.json` was **not
touched** — the budget is a sibling file, verified by re-emitting the band and diffing byte-for-byte.

## Leave-one-out over the reference's own crops

For each of the 128 seeded 320x320 crops, the p05/p95 band is rebuilt from the **other 127** (same
widening rule, shared code path `bandIntervals`) and the held-out crop is scored against it.

| LOO fail count | min | p25 | p50 | p75 | p90 | p95 | max | mean |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| hard fails (of 60) | 0 | 1 | 3 | 6 | 13.3 | **19.3** | 40 | 5.41 |
| all out-of-band (incl. advisory) | 0 | 1 | 4 | 8 | 14 | 21.3 | 41 | 6.25 |
| distinct correlation clusters (of 49) | 0 | 1 | 3 | 6 | 10.3 | 14.7 | 30 | 4.35 |

**An all-pass gate accepts 20 of the reference's own 128 crops — it would reject 84% of genuine
siblings of the very artwork it was derived from.** The mean of 6.25 out-of-band is exactly what 60
two-sided 90% intervals predict, so the method is behaving; the p95 of 19.3 and the max of 40 are
the non-independence showing up as a heavy tail, where one sparse beach crop fails a whole correlated
block at once.

## The four files, restated against a budget

Gate quantity is the **median per-crop hard-fail count**, not the median-of-crops composite. A
per-metric median across 128 crops pulls every metric toward the band centre simultaneously and
manufactures a synthetic supercrop that no real crop resembles; it reads systematically low
(Lufthansa: composite 27, median real crop 31). `--budget` refuses to issue a verdict on a
whole-image reading at all, for the same reason.

| file | median crop | p05 | p95 | composite | clusters | verdict vs budget 31 |
|---|---:|---:|---:|---:|---:|---|
| `EBY-LA-Hot-Dog-175k.png` (band source, LOO) | **2.5** | 0 | 18.6 | 0 | 2 | ACCEPT (+28.5) |
| `C3L Lufthansa Frankfurt Pixorama 45k.png` | **31.0** | 24 | 40.0 | 27 | 22 | ACCEPT (+0.0) |
| `out/look/r2check.png` (Fixel) | **23.0** | 17 | 30.6 | 21 | 20 | ACCEPT (+8.0) |
| `Shift-Bild-03.png` | **48.0** | 46 | 49.6 | 47 | 38 | REJECT (-17.0) |

The budget is 31: the LOO p95 of 20 **rejects Lufthansa**, so it was widened to the smallest integer
that accepts genuine work and no further. The widening is recorded in the budget file rather than
folded into the number. It separates Lufthansa from Shift-Bild by 17.

## ...and the separation proves nothing, because the ordering is inverted

**Fixel scores better than a genuine eBoy Pixorama.** 23 against Lufthansa's 31. That is not a
calibration error and no threshold repairs it. Three bands were built to check:

| band built from | held-out crops, SAME artwork | the OTHER genuine Pixorama | Fixel | Shift-Bild |
|---|---:|---:|---:|---:|
| LA full (the shipping band) | LOO p50 3, p95 19.3 | Lufthansa **31** | **23** | 48 |
| Lufthansa | LOO p50 3, p95 18 | LA **36** | **34** | 50 |
| LA **left half** (594x840) | LA right half **17.5** | Lufthansa **40** | **28** | 50 |

Read the third row first. Splitting the one reference artwork in half, building a band from the left
half's crops and scoring the right half's crops gives 17.5 — right at the leave-one-out p95. The band
generalises fine across neighbourhoods of one artwork and then cliffs to 40 at the artwork boundary.
**It measures artwork identity.** Rejection is symmetric: LA rejects Lufthansa at 31, Lufthansa
rejects LA at 36. (Quote the 40, not the 36: Lufthansa's crop window is only 109x216px of freedom, so
its 128 crops cover ~2.2 crop-areas of unique territory against LA's ~8.8, and its band is
correspondingly narrow. The left-half control has LA's own crop freedom and shows the same cliff.)

And the inversion holds under **all three** bands, so it is not overfitting to LA. The mechanism is
structural: every band is a p05..p95 interval, so a generator emitting the statistical **average** of
the band source sits near the centre of all sixty intervals at once, while a genuine artwork is
idiosyncratic and walks outside a third of them. **The count rewards homogeneity** — which is the
defect `docs/ROUNDS.md` already named ("every Fixel scene is, statistically, the same scene"). The
metric suite and the product goal currently point in opposite directions.

`tools/budget.mjs --generator` now runs this check every time and writes `validity.usableAsScore:
false` into the budget file when it fires. `metrics.mjs --budget` closes with "THE COUNT IS NOT THE
PRODUCT".

**What the band is for: a floor, and a defect detector.** Shift-Bild sits at 48-50 under every band
while everything genuine sits at 17-40 — that gap is real and stable, so the count can reject things
outside the craft family. Inside the family it ranks nothing. The hard-fail **list** is the product;
it is what caught the missing outline system, the speckle and the dead sky in both rounds.

## The non-independence, measured rather than repeated

Pearson across the 128 crops, single linkage at |r| >= 0.95: **60 metrics collapse to 49 clusters**,
three of which are multi-member.

| size | cluster |
|---:|---|
| 7 | `changeRate.h` `changeRate.v` `changeRate.combined` `runLen.mean` `runLen.fracGt8` `vGrad.rowMean` `vGrad.colMean` |
| 5 | `colorsPerTile.mean16` `colorsPerTile.mean32` `palette.distinct` `palette.n90` `palette.n99` |
| 2 | `slope.r1` `slope.r2` |

Near-duplicate pairs at |r| >= 0.99 — the pixel equivalents of the audio side's
`spectralCentroidVar`/`spectralCentroidCV`:

| r | rho | pair |
|---:|---:|---|
| **+1.0000** | 0.9999 | `changeRate.combined` <-> `vGrad.rowMean` |
| **+1.0000** | 0.9999 | `changeRate.combined` <-> `vGrad.colMean` |
| **+1.0000** | 0.9999 | `vGrad.rowMean` <-> `vGrad.colMean` |
| -0.9970 | **-1.0000** | `changeRate.h` <-> `runLen.mean` |
| +0.9912 | 0.9892 | `colorsPerTile.mean16` <-> `colorsPerTile.mean32` |

`vGrad.rowMean` and `vGrad.colMean` are `changeRate.combined` computed twice more, to four decimal
places. `runLen.mean` is `1/changeRate.h` by construction (rho exactly -1). So one density
observation currently casts **seven votes** in every fail count this project has quoted.

Recommendation, and the reason it does not help: counting each cluster once is correct, and it
**narrows the Fixel-vs-Lufthansa gap from 8 to 2** (22 vs 20 clusters), to 1 under the Lufthansa
band, and to 5 under the left-half band. The raw count's apparent discrimination was mostly that
seven-metric density cluster firing together. De-duplicating is right and it makes the count a
*worse* discriminator, which is further evidence the count was never discriminating on craft. Do not
drop the duplicated metrics — each is individually readable and `changeRate.h` vs `changeRate.v` is
a real anisotropy check — but never sum them.

---

# Part 4 — the variety gate

`tools/variety.mjs`. Round 1 measured seed-to-seed sameness and left it un-gated. Given Part 3 this
is now the load-bearing gate, because the fail count does not merely fail to see sameness — it
rewards it.

Method: N=16 seeds rendered through `tools/render.mjs` as subprocesses; each cropped at the **same**
K=4 320x320 windows (fixing the windows is what separates seed-to-seed variation from crop-position
variation); per metric, the cross-seed p05..p95 width at the median window, divided by the
reference's own p05..p95 band width. Ratio 1.000 means a new seed moves a metric as much as panning
across the reference artwork does. Ceiling is the p05..p95 width pooled over LA + Lufthansa crops —
the widest spread demonstrably still inside the craft.

**Tree digest `109a3b143c08d69e`, unchanged across the run.** Determinism: PASS, seed
`fixel-variety-0` rendered twice in separate processes, byte-identical at 1,777,375 bytes.

## The inversion test — run before the number is quoted

The 60-metric count died because a generator beat a real artwork on it. So the variety measure ships
its own attack: variant sets with **zero real variety** beside a genuine positive control.

| variant set | median ratio | NARROW/60 | FROZEN/60 | min pair distance |
|---|---:|---:|---:|---:|
| `refregions` — 16 genuinely different regions of the reference (**GENUINE**) | **0.995** | 33 | 1 | 0.0980 |
| **generator (ours)** | **0.685** | 44 | 1 | 0.1198 |
| `jitter` — one scene, <=1px per 16x16 block (adversarial) | 0.041 | 60 | 3 | 0.0038 |
| `recolour` — one scene, luma-preserving repalette (adversarial) | 0.000 | 56 | 36 | 0.0061 |
| `hue` — one scene, global hue rotation (adversarial) | 0.000 | 60 | 34 | 0.0034 |
| `same` — 16 byte-identical copies (adversarial) | 0.000 | 60 | 60 | 0.0000 |

**INVERSION TEST PASSED.** Genuine spread ranks first, ours second, every zero-variety control at or
near zero. `jitter` and `recolour` are the two transforms `docs/MEASURED.md` already records as
defeating `tileRepeat`'s exact hash outright, and both are caught here at 0.041 and 0.000.

Two things this cost, both worth knowing. First, `recolour` must preserve luma to be a fair attack —
a recolour that also randomises luma is changing the picture, not the palette, and beating it proves
nothing. Second, the positive control initially scored a min pairwise distance of 0.0000 because the
reference cannot supply 16 disjoint 320px crops and the sampler was padding with duplicates. Fixed by
relaxing the separation until 16 distinct regions exist (achieved 128px centre separation, worst
pairwise overlap 56% of area) and by comparing the perceptual view against the **3681 strictly
non-overlapping** reference crop pairs instead. The positive control remains a handicapped opponent,
and the generator still loses to it.

The positive control also calibrates away a bias that would otherwise be blamed on the generator: the
band's p05..p95 comes from 128 crops and a variety run has 16, so every ratio reads low for reasons
that have nothing to do with the generator. Measured, that bias is negligible — the positive control
scores 0.995, so **1.000 is a fair floor.**

## The current generator: FAIL

**NARROW 44/60, WIDE 7/60, FROZEN 1/60, median ratio 0.685 against a floor of 0.995.**
A new seed moves the median metric about **two-thirds as much as sliding the window across a single
existing eBoy artwork does.**

Worst-frozen axes, ratio ascending:

| metric | min | max | our width | ref width | ratio |
|---|---:|---:|---:|---:|---:|
| `runLen.median` | 2.000 | 2.000 | 0.000 | 1.000 | **0.000** |
| `shade.hueRotAbsMedian` | 0.250 | 0.778 | 0.225 | 5.307 | **0.042** |
| `shade.lumaRatioMedian` | 0.7389 | 0.7695 | 0.0069 | 0.1540 | **0.045** |
| `shade.hueRotMedian` | -0.212 | 0.339 | 0.319 | 2.703 | 0.118 |
| `shade.lumaRatioP75` | 0.7679 | 0.8073 | 0.0144 | 0.1130 | 0.127 |
| `palette.n99` | 148 | 231 | 42.6 | 242.5 | 0.176 |
| `edge.fracLowContrast` | 0.0080 | 0.0269 | 0.0118 | 0.0620 | 0.191 |
| `palette.distinct` | 229 | 365 | 87.4 | 410.2 | 0.213 |
| `palette.n90` | 65 | 101 | 20.9 | 78.7 | 0.265 |
| `slope.r4` | 0.0133 | 0.0316 | 0.0114 | 0.0345 | 0.331 |

The diagnosis is legible and it is not "add more randomness". **Every seed shades identically**: the
whole `shade.*` family is frozen at ratios 0.04-0.13, so one lighting model with one luma ladder and
one hue policy is being applied to every scene the generator will ever emit. **Every seed has the
same amount of palette**: `palette.distinct` spans 229-365 where the reference's own crops span 410
of width. The reference varies its palette size more between two neighbourhoods of one picture than
we vary it between two different cities.

The 7 WIDE metrics are the other half of the same story and should not be read as healthy variety:

| metric | ratio | ceiling | reading |
|---|---:|---:|---|
| `tileRepeat.largestCluster` | **13.187** | 3.25 | some seeds are heavily stamped and others are not |
| `flat.largestRegion` | 3.172 | 1.35 | some seeds have one big dead region |
| `tileRepeat.fracNonUnique` | 1.414 | 0.77 | same |
| `hue.fracNearGrey` | 1.322 | 1.27 | grey balance is uncontrolled seed to seed |
| `hue.meanSat` | 1.257 | 1.16 | same |
| `edge.fracAA` | 1.054 | 0.93 | |
| `dither.rate` | 1.044 | 1.01 | |

So the generator is uniform where a scene should differ (composition, palette, light) and erratic
where a craft should hold (stamping, dead area, saturation). That is the signature of varying
nuisance parameters instead of content.

## Perceptual variety: also FAIL, and this is the blunt one

Per pair of seeds, at each window: a 4x4x4 RGB histogram L1/2 distance and a 16x16 z-normalised luma
distance, combined as `min(hist, struct)` — a pair is close if *either* view says so.

| window | min pair | p05 | median | closest pair | hist | struct |
|---|---:|---:|---:|---|---:|---:|
| (207,664) | 0.1383 | 0.1908 | 0.2729 | `-8` / `-11` | 0.1383 | 1.1120 |
| (706,263) | **0.1198** | 0.1894 | 0.2635 | `-8` / `-10` | 0.1198 | 0.9992 |
| (662,39) | 0.1670 | 0.1901 | 0.2834 | `-8` / `-12` | 0.1670 | 0.9822 |
| (448,385) | 0.1211 | 0.1740 | 0.2443 | `-9` / `-14` | 0.1211 | 1.0257 |

Reference floor, 3681 **non-overlapping** crop pairs of `EBY-LA-Hot-Dog-175k.png`: min 0.1507,
p05 **0.1950**, median 0.2780.

**Our closest pair of seeds (0.1198) is more alike than ANY two non-overlapping crops of the
reference (min 0.1507).** Two different cities from this generator are more similar to each other
than two arbitrary different neighbourhoods of one eBoy picture. Note the structure distances sit at
0.98-1.11, i.e. essentially unrelated compositions — the binding constraint is entirely colour. The
layouts do differ; the palettes do not.

## How gameable the distance measure is — stated, not buried

- The histogram half is defeated by keeping one layout and re-rolling the palette. The structure half
  is defeated by keeping one palette and translating or mirroring the layout — a 30px pan of an
  identical scene reads as a large distance. Neither is defeated by the same trick, which is the only
  reason to report both; **a generator doing BOTH (jitter the palette AND pan the camera) would pass
  while emitting one scene forever.** The gate survives its inversion test against four attacks; it
  has not been tested against that fifth one, because it would require building it.
- The 16x16 structure grid is far too coarse to notice that every building is the same building. It
  sees composition, not objects — and objects are exactly where round 1's one honest judge caught us.
- Neither half is invariant to anything, so both flatter a generator that varies nuisance parameters
  instead of content — which, per the WIDE table above, is what this generator does.
- The gate is a conjunction and must be read as one. Both `recolour` and `hue` beat several
  individual metrics' spreads; they are caught because the ratio view sees 0.000. Quoting either half
  alone is unsafe.

## Which gates are weak, plainly

1. **The 60-metric fail count is not a score.** Demonstrated, not suspected. Floor gate only.
2. **The budget's Lufthansa margin is exactly 0.0.** One genuine artwork sits precisely on the
   threshold. n=1 for "genuine work that is not the band source"; two would change the number.
3. **`tileRepeat.*` exact-hash variants remain defeated by recolour and 1px jitter** — the perceptual
   variants exist for this and are the ones to read.
4. **The variety ratio has no independent ceiling.** The family ceiling comes from two artworks, one
   of which is the band source, so a WIDE verdict is weaker evidence than a NARROW one.
5. **Nothing here looks at objects.** Every metric in all four parts is a field statistic. The one
   judge that caught the generator in round 1 looked at whether a rooftop AC unit held together, and
   no gate in this repo can do that.
