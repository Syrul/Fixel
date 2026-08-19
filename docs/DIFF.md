# Our numbers vs docs/BAR.md

`docs/MEASURED.md` and `docs/band-pixel-v1.json` were produced without opening
`BAR.md`. This file is the diff, written after.

## Where we independently agreed

| quantity | ours | BAR.md | |
|---|---|---|---|
| horizontal colour-change rate, whole image | 0.2920 | 29% | match |
| mean horizontal run | 3.43 (=1/0.292) | 3.4px | match |
| distinct colours, whole image | 3021 | 3021 | match |
| soft/antialiased transitions | 3.4% (`edge.fracSoft` p50) | 3.0% | match, different definitions |
| colours per 32x32 tile | 18.2 mean (p50 crop) | 15 median / 29 p90 | same ballpark |

Two independently-defined edge metrics landing on 3.0 vs 3.4% is the strongest
evidence that both readers are measuring the real property and not an artefact.

## What we found that BAR.md does not state

- **`palette.n50` = 16.** Sixteen colours cover half of any 320px crop, out of
  ~500 present. This is the sharpest single expression of "few hues, dense
  pixels" and it is a better generator target than a global colour count.
- **`hue.fracNearGrey` = 0.59.** Fifty-nine percent of pixels are near-neutral.
  The reference is not a saturated image; it is a large grey/asphalt/concrete
  mass carrying a moderate number of saturated accents. A generator that makes
  everything colourful will miss badly while passing every density gate.
- **Two-sided calibration against synthetic cheats.** Noise quantised to the
  reference's own top 48 colours clears every "few hues" floor and dies on the
  ceilings — which is the argument for two-sided bands, made with numbers.
- **`vGrad.rowMin64Ratio`.** A real reference crop with only its top 128 rows
  flattened to sky still scores 0.179 change rate (−1.52 band-widths, survivable)
  but collapses this metric to 0.000 (−4.99). Density metrics alone do not catch
  a dead sky; a composition metric does.

## What BAR.md found that WE ARE BLIND TO — the actionable half

These are five properties our metrics do not measure at all. Every one is a way
to sit inside our band and still look wrong.

1. **Projection is 2:1 dimetric and deliberately impure.** Monotone staircase
   vote on the reference: 71.9% at 2:1, **14.5% at 1:1**, 8.4% 3:1, 5.2% 4:1.
   A 100%-2:1 image "reads mechanical". Our `src/core/iso.js` is pure 2:1, so
   Fixel currently sits at the mechanical extreme by construction. We need
   gables, hips, cross-braces and organic forms at 45 degrees, and a metric that
   counts the slope histogram.

2. **The 5x5 single-colour test — BAR calls it the one number that separates
   real pixel art from everything pretending.** Reference = **16.6%** of pixels
   sit in a totally flat 5x5 neighbourhood; a downsampled 3D render or a
   diffusion image scores 0–2%. We measure 3x3 flatness, not 5x5, and we treat
   flatness purely as a thing to keep LOW. That is half wrong. The real target
   is a **tension**: 16.6% of the frame in flat 5x5 blocks *while* the change
   rate is 0.29. Dense and flat at once — that is what facet-shaded solid
   volumes look like, and it is exactly what noise cannot fake.

3. **No dithering.** 2x2 checkerboard rate is only 1.7–2.1%. eBoy adds a palette
   step instead of dithering between two. Our change-rate gate would happily
   pass a generator that manufactured its density out of dither, and a judge
   would call it mush.

4. **Outlines are a measured system, not a style choice.** One shared near-black
   at **8–16% of canvas** (LA: 15.95% below luma 45), outlines exactly **1px**
   (dark-run lengths 1 and 2 together = 91%), and black mediates **41–43%** of
   object-vs-object transitions but only **34–35%** of face-vs-face transitions
   within one object. We measure no outline statistics whatsoever.

5. **Face shading is a fixed ladder with no hue rotation.** Luma ratio between
   adjacent same-hue faces: median **0.72**, giving top 1.00 / left 0.82 /
   right 0.66. And the load-bearing part: **the darker step does not shift hue**
   (median rotation −3.6 degrees). Procedural shaders almost always rotate
   toward blue in shadow. This is a direct spec for `src/gen/palette.js` and we
   did not derive it.

## Audio — one flat contradiction to resolve

We briefed the audio builder that crest factor is limiter-fakeable and therefore
non-gating. **BAR.md claims the opposite and shows its working:** three unrelated
human chiptunes cluster at 2.69 / 2.83 / 2.95, and the obvious cheat (lowpass →
limiter at 10x gain → loudnorm to −11 LUFS) moved a naive generator from 17.3
only to 11.6 — still 4x out of band. The claim is that crest factor cannot be
mastered *down* to 2.7 without genuinely having three-plus voices sounding
near-continuously plus percussion.

We do not get to pick which is true by preference. Our own corpus + our own
mastering-cheat control decides it, and that control is already specified. If
our cheat lands inside the band, BAR is wrong for our corpus; if it stays out,
crest factor is promoted to gating.

BAR also names a design requirement we had not planned for: duty cycle is only
recoverable from an **isolated voice** (fit MSE 0.0004 solo vs 47.5% wrong on a
polyphonic mixture), so the synth must be able to render **per-channel solo
stems** or duty verification is impossible. And a trap: ffmpeg's `Flat factor`
detects aliasing, not chip timbre — it scores 21.5 on a naive aliasing square
and 0.0 on a correct band-limited pulse, i.e. it rewards the wrong
implementation. Do not gate on it.

## Verdict

Our density, palette and edge-softness readings are sound and independently
confirmed. Our **structural** readings do not exist. The five gaps above are all
of the same kind: they describe how the reference builds a *solid object* —
slope variety, flat facets, hard 1px outlines, a fixed luma ladder — and none of
them are visible to a metric that only counts how often pixels differ.

That is also the honest read on our own metrics author's warning: *"nothing here
is structural; every number can sit in band on a dense field of correctly
coloured confetti."* BAR.md is the list of the structural gates we still owe.

---

# Round 2: the band is overfit, and we can prove it

Two corrections to how every number in this project should be read.

## 1. All-pass was the wrong gate (leave-one-out)

`tools/budget.mjs` rebuilds the band from 127 of the reference's 128 crops and
scores the held-out one. The distribution of hard-fail counts:

| min | p25 | p50 | p75 | p90 | p95 | max | mean |
|---|---|---|---|---|---|---|---|
| 0 | 1 | 3 | 6 | 13.3 | 19.3 | 40 | 5.41 |

Budget set at p95 -> **hardFail <= 20**, which accepts 122/128.
**An all-pass gate accepts only 20 of 128 — it rejects 84% of the reference's
own siblings.** Every "N/60 PASS" figure quoted before this point, including
"the reference scores 60/60", was circular and meaningless.

## 2. Seven of the sixty metrics are one metric

Correlation across the 128 crops, single linkage at |r| >= 0.95:

- **[7]** `changeRate.h`, `changeRate.v`, `changeRate.combined`, `runLen.mean`,
  `runLen.fracGt8`, `vGrad.rowMean`, `vGrad.colMean` — several pairs at
  **r = 1.0000**.
- **[5]** `colorsPerTile.mean16`, `colorsPerTile.mean32`, `palette.distinct`,
  `palette.n90`, `palette.n99`.
- **[2]** `slope.r1`, `slope.r2`.

These are the pixel equivalents of the audio side's `spectralCentroidVar` /
`spectralCentroidCV` duplication. Fail counts were inflated accordingly.

## 3. RETRACTED, then proved worse: the count is not a craft score at all

My first version of this section reported a table of hard-fail counts and
concluded the band was "overfit". That was right in direction and far too weak,
and the table itself was wrong — it used whole-image and composite scoring,
which reads systematically low because taking a per-metric median across crops
pulls every metric toward band centre and manufactures a synthetic supercrop
that no real crop resembles. **Gate the per-crop median only.** That artefact was
the source of a 27-vs-33 disagreement I could not explain at the time.

The metrics builder then settled it properly. Scored per-crop, across three
independently-built bands:

| band built from | Fixel | genuine eBoy held out |
|---|---|---|
| LA (the bar) | **23** | Lufthansa **31** |
| Lufthansa | **34** | LA **36** |
| LA left half only | **28** | Lufthansa **40** |

**Fixel beats a held-out genuine eBoy Pixorama under all three.** And rejection
is symmetric: LA rejects Lufthansa at 31, Lufthansa rejects LA at 36. Two
Pixoramas from the same studio reject each other by the same magnitude.

The control that settles it: a band built from LA's **left half**, scored on
LA's **right half**, gives 17.5 — right at the leave-one-out p95. Then it cliffs
to **40** at the artwork boundary. The band generalises across neighbourhoods of
one artwork and falls off a cliff at the edge of it.

**It measures artwork identity, not craft.**

### Why no threshold fixes this

Every band is a p05–p95 interval. A generator emitting the *statistical average*
of the band source sits near the centre of all sixty intervals at once. A
genuine artwork is idiosyncratic and walks outside a third of them. **The count
rewards homogeneity.** Any threshold admitting Lufthansa at 31 admits Fixel with
8 to spare.

De-duplicating the correlated metrics makes it *worse*, not better: clustering
at |r| >= 0.95 cuts the gap from 8 to 2, and to 1 under the Lufthansa band —
because the apparent discrimination was mostly the one seven-metric density
cluster firing together.

And the sting: "rewards homogeneity" is the *same defect* `docs/ROUNDS.md`
already named in our own output — every Fixel scene is statistically the same
scene. **The metric suite and the product goal point in opposite directions.**

### What the count is still good for

A **floor**, and only a floor. Shift-Bild sits at 48–50 under every band while
everything genuine sits at 17–40. Use it to reject things outside the craft
family. Never to rank things inside it.

### Consequences, binding

1. **The blind duel is the bar.** Metrics are a diagnostic: they say *which*
   craft property is missing, never *whether* we have arrived.
2. Round verdicts are written on the duel result plus the **named hard-fail
   list**. Never on an aggregate or a pass count.
3. **The "reference 60/60, Fixel 17/60" framing is dead** and must not be
   restated, including as a before/after. `tools/budget.mjs` now writes
   `validity.usableAsScore: false` and prints an inversion warning.
4. Importing the audio side's leave-one-out budget to the pixel band — which
   `BAR.md` recommended and I acted on — was wrong. Audio's corpus is 38 tracks
   by 16 artists; the pixel "corpus" is 128 crops of **one** artwork. Leave-one-out
   across crops of a single image measures within-artwork consistency, and there
   is no second artwork for it to generalise to.
