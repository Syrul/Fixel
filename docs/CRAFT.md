# Where the density actually comes from

Observed at 5x nearest-neighbour on a 110px window of the reference
(`node tools/crop.mjs refs/EBY-LA-Hot-Dog-175k.png --x 640 --y 380 --size 110 --zoom 5`).
This is the craft note that the numbers alone will mislead you about.

## The trap in our own metric

`changeRate = 0.29` says "one pixel in three differs from its neighbour". The
obvious way to hit that is per-pixel variation: noise, dither, texture, jitter.
**That is not how the reference does it, and a generator that reaches 0.29 that
way will lose every duel while passing every gate we currently have.**

In the reference, the density comes from **object count and outlines**, not from
per-pixel variation. Concretely, in one 110x110 window:

- Every object silhouette carries a **1px pure-black outline**. Not a darker
  shade of itself — black.
- Black is also used **inside** objects as panel lines: the car's window
  divisions, door seams, light housings, wheel arches are 1px black strokes on
  otherwise flat panels.
- Object **interiors are flat**. The car roof, the awning field, the sign face,
  the pavement slabs are single flat colours over large areas. This is where the
  16.6% flat-5x5 comes from.
- The change rate is then produced by **how many separately-outlined things are
  packed into the area** — a car, a signpost, a signal head, an awning, a tree
  pit, a kerb, a hydrant, a pedestrian, a palm trunk, a wall, a window band, all
  inside 110 pixels.

So the two numbers that look contradictory are two halves of one construction:

> **Flat interiors + 1px black outlines + very many small objects = dense and
> flat at the same time.**

Noise gives you dense-and-not-flat. Big empty parcels give you flat-and-not-dense.
Only object density gives you both.

## Other things visible at 5x

- **Not everything is 2:1.** The car's body, the palm trunk and a concrete stain
  on the pavement all use free-angle and 1:1 contours. Only the built geometry —
  walls, kerbs, signboards, awning boxes — locks to the 2:1 lattice. This is the
  14.5%-at-1:1 from `docs/DIFF.md` made visible: organic and vehicular forms are
  where the lattice is deliberately broken.
- **Three values plus black plus a highlight** is the whole shading vocabulary
  on a solid object. The car is ~3 greys, black lines, one near-white.
- **Ground is never a flat fill.** The pavement carries a large pale organic
  stain with hand-drawn contours, slab seams, and value variation. The road
  carries markings and grime. A generator that fills streets with one asphalt
  colour has already lost, and this is the most likely thing for it to do.
- **Signage motifs are authored, not random.** The awning's repeated notch
  pattern is a designed motif repeated at a fixed pitch, not per-pixel noise.

## The rule this gives the generator

Do not chase `changeRate` with texture. Chase it with **more objects, each
smaller, each outlined**. If a region is under-dense, the fix is another prop,
never more noise. If `flat5x5` is under target at the same time, the fix is
*larger flat interiors on those props*, not fewer props.

## Content law, restated because this window is full of violations

The window contains a fuel-brand pylon, a fast-food wordmark and a real transit
livery. **None of that may cross.** The craft crosses: pylon-shaped signs on
poles, awning motifs, panel-lined vehicles, 1px black outlines. The content does
not: no wordmark, no near-miss wordmark, no real logo silhouette, no real livery.
Every sign Fixel draws is invented from a seeded table and its own pixel font.

---

## The measurement that caught us, and how to read it

A round-1 judge identified our output as machine-made without being told
anything, and gave its reason as a number: connected same-colour region size.
No metric in `band-pixel-v2` measures this. It is worth keeping by hand until
one does.

Measured on a 320x320 crop, 4-connectivity, reporting the **pixel-weighted
median** — the region size that the median *pixel* belongs to:

| | regions | pixel-weighted median | orphan 1px islands |
|---|---|---|---|
| reference | 8,564 | **162.0 px** | 1.89% |
| Fixel r1 | 17,671 | 20.0 px | 6.26% |
| Fixel after r2 build 1 | 9,517 | **63.0 px** | **2.25%** |

**Use the pixel-weighted median, not the plain median.** The plain median is
2.0px on every image including the reference, because outline pixels dominate
the region *count*. It cannot distinguish good work from confetti and will tell
you everything is fine. The pixel-weighted version is what the eye reads.

Two readings:

- **Orphan speckle is solved.** 6.26% -> 2.25% against 1.89%. This was the
  specific thing the judge named. Do not regress it.
- **Region size is the remaining gap: 63px vs 162px, 2.6x too small.** Note the
  region *count* is already right (9,517 vs 8,564) — so the fix is not fewer
  objects, it is bigger, flatter faces on the objects already there. Any surface
  being subdivided by per-pixel variation should become either one flat colour
  or a few deliberate facets separated by 1px black lines. That second option
  also moves `outline.blackMediatedSame`, so it is one edit for two metrics.

---

## Diagonal continuity — the outline property none of the 60 metrics measure

Handed over by a builder during the concurrent-write incident, and it is the
most useful craft finding of round 2.

**Reference 1px dark runs continue DIAGONALLY 19.3% of the time. Ours do so
about 8%.**

That single deficit produces *two* of our named hard fails at once:

- `slope.corrDx0Share` overshoots (too much of the outline mass is vertical)
- `slope.r1` undershoots (not enough 1:1 diagonal steps)

They are the same defect seen from two directions, and neither metric names it.
Chasing them separately is how the `box()` guard trap happened: dropping the
arris guard from `w < 0.8` to `w < 0.55` bought `outline.run1Share`
0.4979 -> 0.7845, straight through the ceiling, while `corrDx0Share` went
+0.45 -> **+2.69 bandwidths**. It carpeted the frame with vertical arrises.

**`outline.run1Share` and `slope.corrDx0Share` are anti-correlated by
construction**: vertical black raises one and wrecks the other. A hard-fail list
alone will never surface that — it needs someone to know which pairs trade
against each other. Diagonal continuity is the number that separates them, and
it is the thing to actually fix.

## Roof pitch is currently tuned to the worst possible value

Measured by sweeping gable pitch `k = hr / (span/2)` against the slope statistic:

| k | 1:1 vote (`slope.r1`) |
|---|---|
| ~0.5 | 0.353 |
| 0.9–1.0 | **0.036–0.044** |
| ~1.5 | 0.403 |

`building.js` uses **k = 0.80–1.16 — dead centre of the dead zone.** At k≈0.5 or
k≈1.5 a gable's two slopes land on or near the 1:1 lattice and register; at k≈1
they fall between and register as nothing. Moving off it is a free 3–10x on the
1:1 vote with no new geometry.

## A note on digests

Two digest conventions were in play during round 2 and they do not agree:
`shasum` defaults to **SHA-1**, while `tools/treehash.mjs` uses **SHA-256**. A
builder correctly reported it could not verify hand-quoted digests against the
tool's. Quote `node tools/treehash.mjs --short` and nothing else; if you need
per-file digests use `shasum -a 256`.

---

## CORRECTED: ONE metric passes the ordering test the band failed, not two

`tools/colour.mjs`. Median over 9 seeded 320px interior crops:

> **This section originally claimed BOTH metrics order correctly. That was
> wrong and is corrected below.** Only ink closure does. Radius of gyration was
> checked more carefully across all three images and its median form *inverts*.

| | ink closure | rg (median) | rg (pixel-weighted) |
|---|---:|---:|---:|
| **LA reference** — the bar | **3.13** | 19.17 | 178.70 |
| Lufthansa — genuine, same craft family | 4.70 | **27.02** | **161.74** |
| **Fixel** | **10.76** | **23.98** | 529.17 |

**Ink closure orders correctly** — 3.13 < 4.70 < 10.76, genuine work ahead of
the generator — and it is the test the 60-metric band failed, where Fixel *beat*
Lufthansa. It is robust across implementations too (2.94/8.25 from an
independent critic). **It is the best diagnostic in this repo. Chase it.**

**rg(median) INVERTS: Fixel 23.98 beats genuine Lufthansa 27.02.** That is the
identical failure mode that retired the band. It cannot be a target or a score,
and `tools/colour.mjs` now prints it flagged.

**rg(pixel-weighted) is a FLOOR only.** It separates genuine (161.74, 178.70)
from generated (529.17) cleanly, but does not order the two genuine works —
Lufthansa scores *lower* than the bar. So it can say we are outside the craft
family; it can never say we are winning inside it. Same epistemic status as the
fail count.

The generalisation I first drew — "absolutes do not travel, direction does" —
was too broad. The correct, narrower version: **ink closure travels in both
absolute and ratio; radius of gyration travels only as a genuine-vs-generated
separator, and only pixel-weighted.**

### The closure problem, stated as plainly as it can be

**Fixel has 29,970 faces against the reference's 11,686 — 2.6x as many — while
having FEWER closed cells (2,785 vs 3,730).** Far more flat patches, fewer loops
around them.

So **"add more small detail" is the wrong instinct**: the faces already exist and
are not being enclosed. And **ink is now slightly OVER** — 17.44% against the
reference's 16.26% — so the budget headroom is gone and any fix that raises ink
share further is going the wrong way. Redistribution is the whole job.

That does not make them a score. Two numbers cannot be a verdict and the duel
remains the bar. But it does make them the two best diagnostics we have, and
they are the ones round 3 is aimed at.

**Ink closure is robust across implementations** — this script reports 3.23/8.98
where an independent critic implementation reported 2.94/8.25 on the same
images. **Radius of gyration is not**: the same critic reported 20.5 vs 58.8
where this script reports 59.96 vs 117.32. Same direction, same rough ratio,
completely different absolutes. So for radius of gyration **only the ratio to
the reference travels between agents** — quote the reference measured by the
same script in the same breath, or the number means nothing. Two digest
conventions already cost us a round of confusion; do not repeat it with metrics.

---

## Round 3, verified by the lead at frozen digest a9f2180f82d62760

Median of 9 seeded 320px crops, `tools/colour.mjs`:

| | ink closure | rg (pixel-weighted) |
|---|---:|---:|
| LA reference — the bar | **3.23** | 59.96 |
| Lufthansa — genuine, same family | **4.95** | 87.69 |
| **Fixel round 3** | **4.94** | 111.03 |
| Fixel round 2 | 8.98 | 117.32 |

**Ink closure 8.98 -> 4.94, which is Lufthansa's 4.95 to two decimal places.**
On the one diagnostic that passes the ordering test — the test the 60-metric
band failed — Fixel now sits level with a genuine eBoy Pixorama and behind only
the bar itself. That is the first time anything in this project has reached
genuine-work level on a discriminating metric.

Radius of gyration barely moved (117.32 -> 111.03) and remains ~1.85x the
reference. It is a floor metric only, so this is not a verdict, but it says the
palette localisation work is not done.

### Confirmed open regression: ink is now OVER budget

`outline.darkShare` **0.1975** against a band ceiling of **0.1956** — FAIL, and
the reference is 0.1626. Round 2's brief said "redistribute, do not add"; ink
went from slightly under, through correct, to over. Redistribution became
addition somewhere. This belongs in the verdict as an open regression, not
buried in a metric table.

`flat.frac5x5` also slipped from 0.1190 to **0.1134** against a floor of 0.1228.

### Two metrics that must NOT be read at face value

- **`edge.fracAA` 0.0350 (+1.63), labelled "ANTIALIASED / scaled / resampled".
  That label is wrong here.** Nothing in the renderer blends — there is no
  filtering path in the codebase at all. It is our own three-step luma ladder
  appearing as consecutive 1px rows on objects too small to carry a ladder. It
  is the SCALE defect measured a second way, not an independent failure, and
  reporting it as antialiasing would send a builder hunting a bug that does not
  exist.
- **`palette.top1Share` 0.1901 (+0.89) reads backwards.** Our top colour is the
  single shared ink at ~19% of the crop; the reference's top is a sand tone at
  6.45% *because its black is fragmented into many near-blacks* — a rasterisation
  artefact of the file. **This is the fourth metric contaminated by the
  reference's file history rather than its craft**, after the near-black count,
  the colour-ghost fraction and edge fringe. Judge brief v3's caution 4 already
  covers it ("how concentrated the single most-used colour is" is named
  explicitly), so no fifth proxy is needed — but the metric itself should be
  treated as non-discriminating.

### Live bug, disclosed and deliberately not fixed this round

`src/gen/scene.js:104` — `tagN = (tagN % 65534) + 1` into a `Uint16Array` tag
buffer. The worst of eight variety seeds already reaches 53,515 at 1600x1100:
**18% headroom.** On a denser seed or a larger frame it wraps silently and two
adjacent objects sharing a tag lose the keyline between them.

The builder disclosed it and deliberately left it, because fixing it would have
moved the digest after the gates had run. That was the right call for a round
that could not be re-validated, and it is the wrong state to begin round 4 in.
**Fix it before anything increases density or frame size** — which is exactly
what round 4 (scale) will do.
