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

> **RETRACTED.** This originally read "ink closure 8.98 -> 4.94, level with
> Lufthansa's 4.95... the first time anything in this project has reached
> genuine-work level on a discriminating metric." **That was one seed, quoted as
> if typical, and it sat at the good end of the distribution.** It would have
> been the sixth claim this project had to retract, and it is the crest-factor
> failure in miniature: a real improvement, characterised from too few samples,
> stated one notch stronger than the data supports.

Measured across **six seeds**, nine crops each:

| seed | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---:|---:|---:|---:|---:|---:|
| ink closure | 4.94 | 6.18 | 4.90 | 4.57 | 5.84 | 5.39 |

**Median 5.17, mean 5.30, range 4.57-6.18.** LA reference 3.23, Lufthansa 4.95.
**Two seeds in six beat Lufthansa; the typical seed does not.**

The honest claim, still a strong one: ink closure moved from ~9.6 to a median
near 5.2, and the seed-to-seed spread collapsed from 4.25-15.74 to 4.57-6.18.
**The generator is now in the same regime as genuine work rather than a
different one. It is not level with a genuine Pixorama.**

Radius of gyration barely moved (117.32 -> 111.03) and remains ~1.85x the
reference. It is a floor metric only, so this is not a verdict, but it says the
palette localisation work is not done.

### Confirmed open regression: ink is now OVER budget

Quoting a single seed's 0.1975 made this look like a marginal touch of the
ceiling. It is not. Measured six seeds x nine crops, and **the whole-image and
per-crop readings disagree in a way that is itself the finding**:

| seed | whole-image | crop min | crop median | **crop MAX** |
|---|---:|---:|---:|---:|
| 1 | 19.53% | 17.93 | 19.61 | 19.92 |
| 2 | 16.57% | 14.21 | 16.62 | 17.67 |
| 3 | 16.91% | 14.63 | 16.58 | 18.45 |
| 4 | 17.79% | 14.80 | 16.51 | 19.88 |
| 5 | 17.37% | 15.80 | 17.77 | 20.43 |
| 6 | 19.34% | 16.75 | 17.60 | **29.24** |

Band ceiling 19.56%, reference 16.26%.

**Whole-image averaging hides it.** No seed's whole-image reading exceeds the
ceiling, yet crops reach 20.43% and 29.24% — nearly a third of one crop is ink.
Ink is not uniformly over; it is **spatially concentrated**, and averaging over
1600x1100 dilutes exactly the concentration that matters.

**And the duel judges 320px crops, not whole images.** So the crop-level figure
is the one that counts: the judges are shown precisely the windows where this is
worst. Gate `darkShare` on the per-crop max, never the whole-image mean.

Round 4 cannot add ink anywhere until this is understood.

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

## A concrete projection bug in signage, found by an r3 judge

**Our sign lettering foreshortens. It must not.**

> "on the yellow fascia at x~266-306, y~116-134 the glyphs taper from ~9px to
> ~5px cap height across the sign. An axonometric plane does not foreshorten
> along the receding axis, so type on it must hold constant height; [the
> reference's] green sign does exactly that — uniform 7px caps, uniform 1px
> stroke, open counters, correctly sheared onto the plane."

This is a genuine error in how `src/gen/font.js` glyphs are placed onto a face,
not a style choice: an axonometric projection has no vanishing point, so a
receding plane shears but never scales. Type drawn on it keeps constant cap
height and constant stroke weight, and only the baseline slopes.

It is cheap to fix and it is one of the few defects in this round that is a
*correctness* error rather than a scale limitation.

## The scale defect, as three judges have now measured it

| | Fixel | reference |
|---|---:|---:|
| 16x16 windows holding <=2 colours | 8.2% (33/400) | 1.0% (4/400) |
| 32x32 windows holding <=2 colours | 4.2% | **0.0%** |
| exact structural duplicate 12x12 windows | 6.08% | 1.40% |
| six largest single-colour regions, share of crop | 15.8% | — |

The reference has **not one 32x32 patch anywhere carrying fewer than three
colours.** Ours has 4.2% of its area in such patches.

And the shape of it: our scale hierarchy is **bimodal** — large undetailed
facets plus a field of near-identical small boxes, with nothing in between —
against the reference's continuous ladder from 3px sign glyphs through 14px
figures to 60px vehicles, with detail budgeted proportionally to size.

## flat.frac5x5 measures at the one window size where the defect is invisible

Verified by the lead on the r3 pair4 crops, after a judge measured it first:

| uniform-window share | 5x5 | 9x9 | 13x13 | 17x17 |
|---|---:|---:|---:|---:|
| reference | 13.08% | 1.79% | 0.23% | **0.01%** |
| Fixel | 13.95% | 5.51% | 2.84% | **1.34%** |
| ratio | **1.07x** | 3.1x | 12x | **134x** |

**At 5x5 the two are indistinguishable.** The reference has essentially zero
pixels inside a uniform 17x17 patch; we have 1.34%. The defect is invisible at
the window we gate on and grows superlinearly with window size.

We have been treating `flat.frac5x5` as a hard constraint with "zero headroom"
(0.1134 against a 0.1228 floor) and steering the generator by it. It is the
wrong instrument: it cannot see the thing it was introduced to protect. The
judge's phrasing is the right way to hold it — *A's flat areas are facet-sized,
B's are region-sized*: in the reference every flat is a plank, a car panel, a
step riser; ours are blank walls and empty roadway.

**Round 4 should gate on the 13x13 or 17x17 share, not 5x5.** A metric whose
discriminating power at the chosen window is 1.07x is not a gate.

## A second projection bug: long horizontal runs

| | runs >=40px | longest | near-black among them |
|---|---:|---:|---:|
| reference | **9** | 50px | 0 |
| Fixel | **125** | 106px | 1 |

Fourteen times as many, and the judge's reasoning for why this is a *bug* rather
than a style difference is exact: **a perfectly horizontal line is off-axis for
both the 2:1 lattice and the vertical, so it cannot be a chosen lattice break.**
In a 2:1 dimetric projection almost nothing should produce a long horizontal
constant run; the reference's nine are short (max 50px) and none are ink. One of
ours is a 103px pure-black horizontal line crossing open ground and terminating
in nothing.

Together with the signage foreshortening error, that is two genuine
*correctness* bugs in the projection layer, distinct from the scale limitation.

## The scale defect, settled on one object

A judge described our bus as "a red prism on a yellow prism... its lower edge
degrading into a dashed row of disconnected black pixels rather than resolving
into an edge", and said it had no wheels.

Checked in code: **it has wheels.** `src/gen/props/vehicles.js` gives every kind
— bus included — wheels in arches with a lit hub, a waist seam and door seams,
all in black ink. The bus spec carries a wheel radius of 2.10 world units and
four seams.

At bus scale that wheel radius is about **4 screen pixels**. So the judge was
describing the wheels: at 4px they are a dashed row of dark pixels, not a wheel.

That is round 3 in one object. **Every fix is correct in kind and drawn at
roughly a third of the size needed to resolve.** The round-3 work is not wrong
and should not be redone — it is invisible. A judge comparing it against a
reference police car of 78x55px with a two-lens light bar, a raked windscreen,
a push-bumper of individually drawn bars, four wheels with rim highlights and a
whip antenna is not seeing worse drawing; it is seeing the same drawing at a
third of the scale, below the threshold where any of it reads.

**Round 4 is scale, and only scale.** The builder judged that re-tuning every
world dimension at once was too large to gamble inside a round it could not
re-validate. That judgement was right, and it is the whole of the next round.


---

## Dark vocabulary: one ink for a whole city

The leak battery kept finding the same root cause from three different angles,
and the third measurement is the starkest. Distinct colours by luma band, whole
frame:

| band | eBoy reference | Fixel PRE-P2 | Fixel POST-P2 s1 | POST-P2 s4 |
|---|---:|---:|---:|---:|
| 0-16 (near-black) | **200 cols**, 14.34% | **1 col**, 18.84% | **1 col**, 11.31% | **1 col**, 9.11% |
| 16-40 | 103 cols | 49 | 24 | 5 |
| 40-70 | 286 cols | 395 | 185 | 106 |
| 70-110 | 627 cols | 706 | 286 | 252 |
| total distinct | 3021 | 2172 | 945 | 713 |

**We have exactly ONE colour below luma 16. eBoy has two hundred.**

This is a craft finding before it is a fingerprint. One dark colour for an entire
city is precisely why judges report "form signalled only by black outline plus
flat facet fill" and "no interior-contour technique anywhere". eBoy's ~200 darks
are what a light model on solids produces: every material's own shadow tone is a
different dark.

### What P2 did and did not do

**Ink MASS: fixed, and possibly overshot.** darkShare 18.84% -> 11.31% (seed 1)
and 17.77% -> 9.11% (seed 4), against the reference's 14.34%. We went from over
the ceiling to under the reference. Seed 4 in particular may now be under-inked.

**Dark VOCABULARY: not fixed, and it went the wrong way.** Distinct near-blacks
is still exactly **1**. Worse, every dark band got *narrower*: 16-40 fell 49 ->
24 -> 5 colours, 40-70 fell 395 -> 185 -> 106, and total distinct fell 2172 ->
945 -> 713.

So "the object's own darker tone for interior form" has reduced the palette
rather than diversified it. Whatever landed, it is not yet producing many
distinct darks. **This is the one real generator invariant the leak battery
found, it is unchanged, and it is the same work as the craft fix.**

Target the reference's order of magnitude, not its exact count: tens to hundreds
of distinct darks, not one.

---

## CORRECTED: the long horizontal runs are not a projection bug, they are one flat face too big

Round 3 recorded "125 horizontal constant runs >=40px against the reference's 9" as one of
two genuine *correctness* bugs in the projection layer, on a judge's reasoning that "a
perfectly horizontal line is off-axis for both the 2:1 lattice and the vertical, so it cannot
be a chosen lattice break." **The observation is right and the diagnosis is wrong**, and the
difference matters because the two need opposite fixes.

Measured on six city seeds at 1600x1100, whole-image, by grouping every >=40px horizontal run
into contiguous vertical stacks at the same x:

| | |
|---|---|
| runs >=40px, per seed | ~840 |
| **share belonging to a stack >=4px tall** | **74.1 / 77.3 / 81.9 / 84.3 / 85.0 / 85.6%** — median ~83% |
| stack height | median 6px, p90 20px, max 62px |

A long horizontal run in this generator is almost never a stray one-pixel line. It is a **2D
rectangle** — the horizontal cross-section of a wide, unarticulated wall face. And that is not
an error: in this projection a +y face at `y1` spans `x0..x1` with vertical sides, so *every*
scanline crossing a flat wall `w` units wide produces a run of `2w` screen pixels. A 20-unit
wall necessarily makes a 40px run. There is no way to draw a wide flat face in a 2:1 dimetric
projection without one.

The top offenders by colour are the saturated mid-tones — the painted accent families — which
is to say **painted walls**, confirmed by the stacks: one tone produced a 21px-tall, 79px-wide
flat rectangle at a single x.

**So the reference does not avoid horizontals. It avoids wide flat faces.** Its longest run is
50px and its largest single-colour region anywhere is 8,780px = 0.88% of the frame. Ours are
8,808-9,249px absolute but only 0.50-0.53% of a larger frame, so on that number we are level —
the difference is entirely in how many *mid-sized* flat rectangles each picture carries.

Three consequences:

1. **This is the same defect as `flat.largestRegion`, the uniform 13x13/17x17 windows and the
   32x32-with-<=2-colours share.** One root cause, four readouts. Fixing articulation on wide
   faces moves all of them; hunting the horizontal run on its own moves none.
2. **Do not "fix" it by breaking horizontals.** Adding a value step every N pixels across a
   wall is texture, and texture is the failure mode in `docs/BAR.md` §Density. The fix is
   windows, panels, seams, signage and openings — articulation that means something.
3. **It is the specific hazard a terraced landscape introduces.** A terrace top is a wide flat
   face by construction. A biome that draws 40-unit contour bands will manufacture these at a
   rate no city ever could.

Measured with the lead's probe; the definition is the one used above and is worth keeping by
hand until a shared tool carries it.

---

## flat5x5 is dead as a score and alive as a floor, and the difference is the discrimination ratio

Round 3 retired `flat.frac5x5` with a specific argument: at its own window its discrimination
between Fixel and the reference was **1.07x** (13.95% vs 13.08%) while at 17x17 it was 134x, so
it "cannot see the defect it exists to protect" and must not steer the generator. That stands.

**It does not follow that the number is useless**, and the biome work is where the distinction
became load-bearing. Measured at 440x900, three seeds each, city as the live same-size control:

| | flat5x5 | verdict |
|---|---|---|
| city | 0.147 - 0.190 | in family |
| LA reference | 0.166 | — |
| desert (ground + props) | 0.122 - 0.239 | in family |
| **shore, ground stage** | **0.584 - 0.620** | **fail** |
| **highland, ground stage** | **0.456 - 0.510** | **fail** |
| Shift-Bild (wireframe lot plan) | 0.699 | the degenerate case |

The retirement argument was about **fine discrimination inside the craft family**, where the
ratio is 1.07x and the metric is blind. This is **coarse rejection outside it**, where the ratio
is 3.9x and it is not remotely blind. A landscape ground made of a few enormous tonal fields
sits between the city and a wireframe lot plan, and flat5x5 says so immediately.

That is the same epistemic status `docs/BAR.md` already assigns the pixel fail count and
`rg(pixel-weighted)`: **a floor that rejects things outside the craft family, never a score that
ranks things inside it.** Use it that way and it is one of the cheapest checks in the repo. Use
it to steer and it will mislead exactly as it did in round 3.

### The process rule this produced

**Measure flat5x5 on a biome's GROUND STAGE and accept or reject it there, before any props.**

The tempting framing — "these are ground-stage numbers, the props will fix them" — is correct
for `darkShare`, colour count and largest-region share, all of which genuinely arrive with the
objects. It is **wrong for flat5x5**, and the mechanism is worth stating because it is not
obvious: the city's ground is *itself* articulated (kerbs, slab seams, parcel aprons, verges,
resurfacing patches), so props land on a surface that already has structure. A landscape ground
of a few large tonal fields gives props nothing to integrate with, and scattering them on top
reproduces the round-3 signature exactly — sharp objects separated by unarticulated plane, which
a judge named *interstitial mush* and called "what assembly-from-parts leaves behind".

### And check whether it is flatness or blending before prescribing anything

A large-flat-region picture and a blended picture look alike in a thumbnail and need opposite
fixes. The soft-transition rate — a mid-tone pixel between two neighbours 60+ luma apart —
separates them:

| | soft transitions |
|---|---|
| city | 0.0084 - 0.0094 |
| shore ground | 0.0002 - 0.0004 |
| highland ground | 0.0007 - 0.0008 |

The landscape grounds are an order of magnitude **cleaner**-edged than the city. Nothing is
filtering or antialiasing anywhere — the renderer has no blending path at all — so the smooth
appearance is entirely region size. Sending a builder to hunt for a blend would have cost a
cycle. (Absolute values depend on the definition; this one is horizontal-only with a ±12 luma
margin. An independent implementation read the city at 0.0346 and the shore at 0.0005 — three
to four times higher on both, same ratio. **Quote the control measured by the same script in the
same breath**, as `docs/CRAFT.md` already requires for radius of gyration.)

---

## The content law had a hole, and it was in WHERE the filter ran, not in what was on the list

`PROMPT.md`: *"Steal craft, never content — no brands, landmarks, real lettering. Invent every
sign."* Every sign is coined by `coinWord`/`coinTag` in `src/gen/font.js` from a nonsense
syllabary and screened against two regexes. Found while reviewing a desert render whose hero
sign read **OREO**; a shore render earlier in the same session read **TUI**. Both are real
marks.

**The mechanism: signs are TRUNCATED and the filters ran on the untruncated word.**
`signSize` in `props/street.js` cuts the string to fit the panel —
`word.slice(0, o.disc ? 3 : (o.maxChars || 6))` — so what a viewer sees is a PREFIX, and no
prefix was ever checked. That is a correctness gap, not a coverage gap: adding entries to the
list cannot fix a check applied to a string nobody sees.

Measured, 200,000 coined words against a list of ~200 well-known marks:

| | before | after |
|---|---|---|
| exact collisions | 1 in 948 | 0 |
| **truncated-prefix collisions** | **1 in 394** | 0 |

TUI alone was 549 of the 719 hits. **The prefixes were the larger half of the exposure and
were entirely unguarded.**

A second branch of the same bug: three of `coinTag`'s four modes assembled letters directly
and never saw either list. The shore builder hit it — its source records the function
producing **PEE** on the hero sign of a frame — and worked around it by refusing to call
`coinTag` at all, which is a fix in one biome for a bug in the shared file. All lettered
branches now re-roll through the same check.

### The honest residual, measured on a HOLDOUT

Reporting "0 collisions" against the list I had just added to the filter would be a metric
selecting for its own success — the same failure as the tempo estimator returning the centre
of its own search window and the normaliser K-sweep. So the fix was re-measured against **147
real marks deliberately NOT added to `FORBIDDEN`**:

| | rate |
|---|---|
| coinWord, exact | 1 in 8,333 |
| coinWord, truncated prefix | **1 in 2,020** |
| coinTag | 0 in 200,000 |
| hits | PRET x43, LEON x40, MOOG x21, GRAB x5, REWE, RODE, SKODA, RADO |

So against marks the filter has never seen, the rate improved from ~1 in 394 to ~1 in 2,020 —
about five-fold, from the mechanism fix alone rather than from the list.

**It is not zero and it cannot be made zero this way.** A trademark register holds millions of
marks and this file carries a few hundred. A short nonsense syllabary WILL sometimes coin a
real mark, and the only complete remedies are a much longer word — which stops looking like
signage — or a register lookup this generator cannot carry. **Stated as a bounded, measured,
residual risk rather than as a fix.** A feed drawing tens of signs per scene should expect a
collision every few hundred scenes.
