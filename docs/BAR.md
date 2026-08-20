# The bar — measured

Everything here was measured off the files in `refs/` by agents running real pixel and audio
analysis, before a line of Fixel existed. It is **reference material, not a spec**. The prompt
deliberately does not contain these numbers: the lead agent should re-derive its own from the refs,
because a bar you measured yourself is one you believe. Use this to check the agent's homework.

## The reference files, and which one is the bar

| file | size | colours | role |
|---|---|---|---|
| `EBY-LA-Hot-Dog-175k.png` | 1189×840 | 3021 | **the bar.** The only ref big enough to crop freely |
| `C3L Lufthansa Frankfurt Pixorama 45k.png` | 476×583 | 321 | second opinion; too small to slice repeatedly |
| `Shift-Bild-03.png` | 669×859 | 22, **100% web-safe** | the *method* exposed — a numbered lot plan with one built tower |
| `PT-ePaul-Horse-05t.png` | 223×243 | 21, not web-safe | single-object craft: outline and shading policy |

`Shift-Bild-03` must never be the A/B reference. It is a wireframe lot plan, so a sparse generator
scores well against it and learns the wrong lesson.

Web-safe is a *choice*, not an eBoy law — `Shift-Bild` is 100% web-safe (every channel a multiple of
51, neutral ramp exactly 0/51/102/153/204/255), the horse is not. Declare it or don't, then hold it.

## Projection — 2:1 dimetric, not 30° isometric

Built geometry locks to slope ±1/2 = **±26.565°**. Four-step monotone staircase vote:

| file | 1:1 | **2:1** | 3:1 | 4:1 |
|---|---|---|---|---|
| Frankfurt | 11.8% | **82.0%** | 4.1% | 2.1% |
| LA Hot Dog | 14.5% | **71.9%** | 8.4% | 5.2% |
| Shift-Bild | 1.6% | **94.7%** | 2.5% | 1.2% |
| Horse (organic) | 48.7% | 30.3% | 12.6% | 8.4% |

The horse matters: the rule is scoped to **architecture**. A 100%-2:1 image reads mechanical — the
12–15% at 1:1 is deliberate (gables, hips, cross-braces, organic forms).

The z axis is exactly vertical. Row-shift correlation of the outline mask peaks at dx=0, with
secondary peaks at **dx=±2** above ±1 and ±3 — and that ±2 peak is the off-diagonal maximum in all
four quadrants of all three architectural refs. Any perspective convergence, or a 3D render with a
non-orthographic camera, drifts it at the frame edges. That is how you catch a faked isometric.

Zero drift: the `Shift-Bild` tower's storey slabs recur at exactly **27px, eight times running**. Lot
lines sit at 23–24px vertical → 46–48px horizontal, an integer 2:1 ground tile. Nothing accumulates
fractional error.

**Do not adopt cabinet projection** (`screen_y = world_y/2 − world_z`, as Project Frostwind uses). It
yields axis-aligned silhouettes and no cube stacking — it kills the 2px staircase that *is* the style.

## Anti-aliasing — the strongest single test

Fraction of dark→light 2px transitions with a mid-tone pixel between them: Frankfurt **4.0%**, LA
**3.0%**, Shift-Bild 0.5%, horse **0%**. ≥96% of hard edges are literally hard.

The horse's alpha channel holds exactly three values: `{0, 51, 255}` — binary alpha, one flat 20%
shadow, zero partial-alpha edge pixels.

**The one number that separates real pixel art from everything pretending:** fraction of pixels whose
entire 5×5 neighbourhood is a single colour — Frankfurt **26.4%**, LA **16.6%**, Shift-Bild 69.9%. A
downsampled Blender render, a JPEG round-trip, or a diffusion output scores **~0–2%**.

No dithering either: 2×2 checkerboard rate is only 1.7–2.1% (incidental 1px detail, not ramps). eBoy
adds a palette step rather than dithering between two.

## Density — the failure mode nobody names

| | colours | occupancy | horiz. colour-change rate | mean run |
|---|---|---|---|---|
| Project Frostwind frame | **21** | 44% | **2%** | ~50px |
| eBoy Frankfurt | 321 | 91% | 24% | 4.2px |
| eBoy LA Hot Dog | 3021 | **95%** | **29%** | **3.4px** |

Frostwind's palette discipline is right to copy. Frostwind's **sparsity is exactly wrong to copy**.
These properties are independent — you can have 21 colours *and* a 29% change rate, and that
combination is what Fixel needs and what neither reference gives alone.

A procedural generator's default failure mode is sparse-and-repetitive: Frostwind-shaped, not
eBoy-shaped. It is the gap a fresh critic is most likely to *feel* and least likely to *name*.

## Outlines

Dense scenes share **one near-black at 8–16% of canvas** (Frankfurt: pure black alone 8.69%; LA:
15.95% below luma 45). Outlines are exactly **1px** — dark-run lengths 1 and 2 together are 94%/91%,
since a 1px 2:1 line necessarily reads as a 2px horizontal run. Runs ≥3px are reserved for genuinely
dark materials.

Black mediates **41–43%** of transitions between different materials but only **34–35%** between two
faces of the same material — biased to object-vs-object boundaries; face junctions within one object
more often get only a value step.

Isolated hero objects get **no pure black**: the horse has 0.00% below luma 20 and rings itself in its
own darkest tone at 0.49 of interior luma.

## Palette — local, not global

Global colour count is the wrong check. Unique colours **per 32×32 tile**:

| | median | p90 |
|---|---|---|
| Frankfurt | 10 | 16 |
| LA Hot Dog | 15 | 29 |
| Shift-Bild | 2 | 6 |

A Blender downsample or diffusion image gives **150–800**. This catches "too many colours" without
punishing a big picture for having many objects. Per object, the horse's three dominant tones carry
**86%** of its body.

## Shading — three flat values, hue locked

Luma ratio between adjacent same-hue faces: median **0.72**, bimodal at 0.66–0.70 and 0.79–0.86 →
top 1.00 / left 0.82 / right 0.66, matching the web-safe ladder 255→204→153→102.

Counterintuitive and load-bearing: **the darker step does not shift hue** (median rotation −0.3°
Frankfurt, −3.6° LA). Procedural shaders almost always rotate hue toward blue in shadow. eBoy doesn't.

## Audio — how to judge a chiptune without ears

An agent cannot hear. It can render deterministically and measure. Validated in-session against
**Juhani Junkala's Retro Game Music Pack (CC0 1.0)**, script-downloadable, plus a from-scratch
70-line WebAudio chip engine as the challenger.

| metric | human band | 3 human tracks | naive generated | + mastering cheat |
|---|---|---|---|---|
| **crest factor** | 2.3–3.6 | 2.69 / 2.83 / 2.95 | **17.3** | **11.6** |
| % energy >12kHz | 0–1.5 | 0.49–1.23 | 21.3 | 0.31 |
| % energy >16kHz | 0–0.2 | 0.033–0.084 | 14.2 | 0.003 |
| LUFS integrated | −13..−9 | −10.6 / −10.6 / −11.6 | −36.7 | −20.5 |
| spectral entropy | 0.6–1.4 | 0.83–1.09 | 0.059 | 0.232 |

**Crest factor is un-gameable.** Three unrelated human chiptunes cluster at 2.69/2.83/2.95 — a ±5%
band across different tempos and keys. The obvious cheat (lowpass → limiter at 10× gain → loudnorm to
−11 LUFS) moved 17.3 only to 11.6, still 4× out of band. You cannot master your way to 2.7; it takes
three-plus voices sounding near-continuously plus a percussion channel plus bus limiting. One
`ffmpeg astats` call, and it encodes "a finished arrangement, not a sequence of isolated beeps."

**Energy >12kHz is the timbre gate.** The signature failure of hand-rolled chip synths is unfiltered
harmonics and white noise — shrill aliasing hiss, physically unpleasant in a scroll feed. Unlike
crest it *is* fixable by a master lowpass, so it is cheap and actionable. The split between
"fixable by mastering" (centroid, band-limit) and "requires real music" (rolloff, entropy, LUFS,
crest, tail energy) is the critic's diagnostic value: it says *which kind* of failure you have.

**Duty cycle is exactly recoverable.** A pulse of duty *d* has harmonic amplitudes |sin(kπd)/k|, with
nulls at k=m/d. Fitting recovered a requested 12.5% at MSE **0.0004** (a sine control scored 0.0416).
But only from an isolated voice — a polyphonic mixture returned 47.5%. **This imposes a design
requirement: the engine must render per-channel solo stems**, or duty verification is impossible.

**One trap.** ffmpeg's `Flat factor` reads 21.5 on a naive aliasing square and **0.0** on a correct
band-limited `PeriodicWave` pulse. It detects aliasing, not chip timbre — it rewards the wrong
implementation. Do not use it as a chip-voice test.

A ProTracker `.mod` is fully parseable in ~131 lines of stdlib Python, so real human chiptunes are
also available as **symbolic note data** for pattern-level comparison — tempo, key stability, voice
budget, notes per channel, section structure at 4/8/16 bars.

## Two laws worth stealing outright

From Project Frostwind, which states the discipline better than anyone:

> Nothing is drawn that can be derived. Nothing is chosen that can be measured. Nothing is claimed
> that cannot be checked.

> The model is the guardrail. The LLM writes tables, not pixels.

And, for when the world and the medium disagree: *the medium wins, and the deviation is recorded.*

---

# Independent replication (round 2)

`tools/metrics.mjs` re-derived these numbers from scratch, without reading this file. Where we agree,
trust the number. Where we disagree, **trust `metrics.mjs`** — it is the code the loop actually runs,
and its definitions are written down.

**Reproduced exactly, from independent code:**

| claim | this doc | metrics.mjs |
|---|---|---|
| flat 5×5 — LA / Frankfurt / Shift-Bild | 16.6 / 26.4 / 69.9% | **16.6 / 26.4 / 69.9%** |
| canvas below luma 45, LA | 15.95% | **15.95%** |
| 2×2 dither rate | 1.7–2.1% | 2.13% |
| dark runs length 1+2 | 91% | 89.4% |
| face luma ratio, median | 0.72 | 0.753 |
| hue rotation in shadow | −3.6° | **−0.15°** — both ≈ zero, the load-bearing part holds |
| outline ±2 peak > ±1 and ±3 | yes | confirmed (1.189, 1.339) |

**Three disagreements — prefer `metrics.mjs`:**

1. **Staircase histogram.** LA measured 20.6 / 69.3 / 5.1 / 5.0 against this doc's 14.5 / 71.9 / 8.4 /
   5.2, and Shift-Bild **69.7% vs 94.7%** at 2:1. The boundary-mask definition yields *two* boundaries
   per line on a thin-line wireframe, inflating the 1:1 bucket — so these readings are reliable on
   architecture and unreliable on wireframes. Both readers agree on what matters: **2:1 dominates at
   ~70–80% and the 1:1 residual is substantial and deliberate.**
2. **Black mediation levels don't reproduce** (49.4% / 28.5% vs 41–43% / 34–35%). Cause is known and
   stated: separating "different material" from "two faces of one material" uses hue proximity as a
   stand-in, which collapses every grey into one material — and greys are 59% of the frame.
   **Gate on `outline.mediationGap`, never the absolute levels.**
3. **`edge.fracAA` does not reproduce the ranking above.** The headline claim — ≥96% of hard edges are
   literally hard — holds on all four files. The detector false-positives on 1px organic shading (3.7%
   on the horse, which has zero partial-alpha pixels). Bias is always upward: a low reading is
   trustworthy, a high one needs eyes.

## What `flat5x5` actually means

The apparent tension between "16.6% flat 5×5 neighbourhoods" and "29% colour-change rate" resolves
like this, and it is the single most useful sentence for a builder:

> Density comes from the **number of surfaces**, not from texture **within** them.

Every face is one flat colour, ≥5–6px across its short dimension, with a new facet every ~3.4px
(median run 2, p90 8, p99 22). Noise puts detail *inside* surfaces and scores ~0%. A sparse generator
makes faces too big and scores 70%+. The target is neither.

## How to read the band

60 metrics measured off one artwork are **not independent**. Weight the hard-fail list; never the
pass count.

---

# Correction: crest factor is NOT the un-gameable metric

The audio section above claims crest factor is the load-bearing gate, on the evidence that three
human chiptunes clustered at 2.69 / 2.83 / 2.95 — "a ±5% band". **That cluster was an artifact of
n=3.** Measured across a 38-track CC0 corpus (16 artists, licence-verified before download),
`crestFactorDb` spans **9.42–17.20 dB** ≈ 2.96–7.24 linear. That is far too wide to gate on, and it
is now marked non-gating: no verdict depends on it.

Crest still fails *both* kinds of fake, in opposite directions — a sparse beepy track sits too high,
a sustained drone too low (~4.28 dB, and a limiter can only *reduce* crest, so it cannot be raised
into band; forcing it via compand costs `silenceFraction` 0.176–0.240, out of band). It is real
evidence. It is not a gate.

**Trust `docs/band-audio-v1.json` and `docs/AUDIO-MEASURED.md` over the audio section above.**
The gating metrics that actually caught all three synthetic controls are `repeatStrength` (which
catches from both sides — 1.00 and 0.915 too high, 0.068 too low), `pitchClassEntropy`,
`noveltyPerSecond`, `novelFraction` and `polyphony`.

## Acceptance is a budget, not all-pass — and this applies to the pixel band too

Leave-one-out over the corpus: only **5 of 38 genuine tracks clear all 17 bands**. An all-pass gate
would reject **87% of real chiptune**. The budget was set at p95 of the LOO fail-count distribution —
**≤5 of 17 fails** — which accepts 37/38. Real tracks average 2.26 fails; the synthetic controls
scored 9, 10 and 13–14.

The pixel band has the same structure and the same hazard: a "60/60" score on the source artwork is
circular, and demanding all-pass from a generator is demanding something the reference's own siblings
would fail. Set the pixel budget by leave-one-out across crops the same way.

**Known weaknesses, stated by the author of the band:** `tempoBpm` and `ioiEntropy` passed all six
control files and are near-useless as gates; `silenceFraction` never gated anything;
`spectralCentroidVar` and `spectralCentroidCV` are the same measurement twice and inflate fail counts
on static timbre; the margin is real but not comfortable (worst genuine track 7 fails, random-note
control 9, budget 5) — a Markov melody over a ii-V-I with a real repeated 8-bar section would
plausibly slip under the budget while still being bad. **It is a floor, not a ceiling.** The corpus is
also a monoculture: all OpenGameArt, 15 of 38 tracks from two artists.

---

# Correction: the pixel fail-count is NOT a score, and no threshold makes it one

The section above recommends importing the audio leave-one-out budget to the pixel band. **That
recommendation was wrong.** The audio budget works because it separates real tracks from fakes. The
pixel count does not separate anything — it ranks a *generator* above a *genuine eBoy Pixorama*.

Measured, gate value = median per-crop hard fails of 60:

| band built from | held-out crops, same artwork | the other genuine Pixorama | Fixel | Shift-Bild |
|---|---|---|---|---|
| LA full (shipping band) | LOO p50 3, p95 19.3 | Lufthansa **31** | **23** | 48 |
| Lufthansa | LOO p50 3, p95 18 | LA **36** | **34** | 50 |
| LA **left half** → scored on right half | **17.5** | Lufthansa **40** | **28** | 50 |

**Fixel beats the held-out genuine artwork under all three bands** (23<31, 34<36, 28<40). This is not
overfitting to LA. Rejection is symmetric — LA rejects Lufthansa at 31, Lufthansa rejects LA at 36:
two Pixoramas from the same studio reject each other at equal magnitude.

Row three is the control that settles it. One artwork was split in half, a band built from the left
half's crops, the right half's crops scored against it: **17.5**, right at the LOO p95. So the band
generalises across neighbourhoods of one artwork and then falls off a cliff at the artwork boundary
(40). **It measures artwork identity, not craft.**

## Why — the mechanism is structural, not a calibration error

Every band is a p05–p95 interval. A generator emitting the statistical *average* of the band source
sits near the centre of all sixty intervals at once. A genuine artwork is idiosyncratic and walks
outside a third of them. **The count rewards homogeneity** — which is exactly the defect the variety
gate exists to catch ("every Fixel scene is, statistically, the same scene"). Round 1's biased judge
brief was this same failure seen from the judge side. Any threshold admitting Lufthansa at 31 admits
Fixel with 8 to spare.

De-duplicating correlated metrics makes it worse, not better: clustering at |r|≥0.95 (60 metrics → 49)
cuts the LA-band gap from 8 to **2** (Lufthansa 22 clusters vs Fixel 20), and to **1** under the
Lufthansa band. The apparent discrimination was mostly one seven-metric density cluster firing
together — the exact analogue of `spectralCentroidVar`/`CV` on the audio side.

## What the count IS good for

A **floor**, not a score. Shift-Bild sits at 48–50 under every band while everything genuine sits at
17–40. That gap is real and stable. Use it to reject things outside the craft family; never to rank
things inside it.

`tools/budget.mjs` now runs an ordering check independent of the threshold: if a generator outranks a
genuine accept-file it prints `*** ORDERING INVERTED — THE COUNT IS NOT A SCORE ***` and writes
`validity.usableAsScore: false` into the budget JSON, so the number cannot be quoted without the
caveat. `docs/budget-pixel-v2.json` records the honest LOO budget (20) widened to 31 — the smallest
integer accepting Lufthansa's median crop and no further — with the inversion recorded rather than
tuned away.

**Also corrected:** an earlier "Lufthansa = 27" was a composite artefact. Scoring a per-metric median
across 128 crops pulls every metric toward band centre at once, producing a synthetic supercrop no
real crop resembles, which reads systematically low. Gate the **per-crop median**; never a whole-image
or composite reading.

**Consequence for the bar.** The blind duel is the bar. The metrics are a floor and a diagnostic —
they tell you *which* craft property is missing, never *whether* you have arrived.

---

# The ink closure ratio — the law none of the 60 metrics measures

**Ink closure ratio = flat faces ÷ ink-enclosed cells.**
**Reference 2.94. Generator 8.25. 2.81× under-inked.**

In the reference roughly every third flat patch is wrapped in black. In the generator eight flat
patches sit inside one ink loop, separated only by value steps.

This is the finding that matters because **every adjacent metric passes while it is 2.8× off.** The
ink *budget* is already correct (`outline.darkShare` 0.1426 vs 0.1624; ink below L20 at 14.12% vs
14.74%) and the flat-face size distribution is now correct (9,794 faces ≥16px/Mpx vs 7,279; median
38px vs 42px). The earlier "median colour region 25px vs 105px" gap is **fixed**. What is wrong is not
how much ink, nor how big the faces — it is **ink topology: where the ink goes.** The generator spends
its correct ink budget on long lattice-aligned strokes (building silhouettes, mullion columns, kerb
lines) and almost none on closing small loops.

Measured as: mask ink at luma < 20, take 4-connected components of the *complement*, count those
≥12px — each is one flat field the outline network has closed off (a car roof, a window pane, a sign
face). Threshold-independent: across luma < 12/20/30/45 the generator reads 1182/1187/1193/1245 cells
per megapixel and the reference 1933/2480/2541/2612.

The calibration to remember:

> **The generator's average city block (19.9 cells per 100×100px) is as busy as eBoy's empty ocean
> and sky (19.4).**

Ink is not the same as outlines. **Do not add ink globally to fix this — redistribute it.** Adding ink
where it does not close a loop measurably worsened three metrics.

## Two metrics that read backwards — do not chase them

- **`outline.blackMediatedSame`** — direct measurement shows the generator has *more* interior panel
  lines than the reference (28,060 vs 17,437 interior runs per Mpx). The metric collapses all greys
  via its hue proxy, and greys are 59% of the frame. Chasing it makes the picture worse. Gate on
  `outline.mediationGap`, as stated above.
- **`outline.run1Share`** — not an independent defect. It is a readout of `slope.r2`: a 1px 2:1 line
  necessarily produces 2px horizontal runs. Generator run1:run2 = 1.40, reference 2.72. Fix the slope
  distribution and this follows for free. **Do not thin the outlines to chase it.**

## What "machine-made at a glance" measures as

- **Repeating lattices.** 2D autocorrelation of the ink mask over a 128×128 window: the generator's
  market canopies peak at (dx=48, dy=24) r=**0.369**, exactly 2:1, with harmonics at (16,8) and
  (32,16). The reference's strongest object-scale peak in an equivalent window is (54,−53)=**0.115** —
  3.2× weaker. Its only strong peak, (8,4)=0.294, is roof-tile texture *within one roof*, which is
  legitimate. Pavement seams show the same tell: a harmonic ladder across seven lags where the
  reference's dies after two.
- **No dynamic range in density.** Per-tile cell count p90/p10 = **2.33** vs the reference's **3.79**
  (generator 5–50, reference 7–69). Uniformly medium everywhere reads generated even when the grid is
  genuinely aperiodic.
- **One scale for everything.** Vehicles 24px, people 11px, props 5px — three sizes, nothing between
  or beyond, and no hero object. The reference carries a 300px palm, a two-storey figure, a statue.
- **Colour assigned rather than motivated.** 8 colours cover 50% of the generator's frame
  (`palette.n50` 8 vs band [13,21]; reference 16); top-20 cover 57.4% vs 34.3%. Every building is one
  randomly chosen saturated hue. In the reference **a colour means something** — green is a lawn,
  orange is a pylon, sand is a beach.

## Do not break these — they were hard-won

Flat-face size distribution (`flat.frac5x5` 0.1190 against a floor of 0.1228 — no headroom); the ink
budget; the shading vocabulary (`shade.lumaRatioMedian` 0.7402 in band, `hueRotMedian` **+0.078°** —
no hue rotation into shadow, the counterintuitive property procedural shaders always get wrong); local
palette discipline (all four `colorsPerTile` in band); no dithering; the aperiodic street grid (no ink
autocorrelation peak past dx=2 out to dx=140); flat-banded water; and mid-rise facades, which are the
one place the picture is already eBoy-shaped.

---

# The variety gate, and the order you must read things in

`tools/variety.mjs`. It survived its own inversion test — but only after its author found and fixed
two flaws in the attack harness that would have shipped a false pass (a `recolour` attack that was
randomising luma, so not a faithful attack; and a positive control padding with duplicate crops).

| variant set | median ratio | NARROW/60 | min pair dist |
|---|---|---|---|
| 16 genuinely different regions of the reference (**genuine**) | 0.995 | 33 | 0.0980 |
| **the generator** | **0.685** | **44** | 0.1198 |
| 1px jitter per 16×16 block | 0.041 | 60 | 0.0038 |
| luma-preserving repalette | 0.000 | 56 | 0.0061 |
| global hue rotation | 0.000 | 60 | 0.0034 |
| 16 byte-identical copies | 0.000 | 60 | 0.0000 |

**Generator verdict: FAIL.** A new seed moves the median metric about two-thirds as much as sliding
the window across a single existing eBoy artwork. And perceptually, the blunt version:

> Our closest pair of seeds (0.1198) is more alike than **any** two non-overlapping crops of one eBoy
> picture (min 0.1507 across 3,681 pairs).

Structure distances sit at 0.98–1.11 — compositions are essentially unrelated. **The binding
constraint is entirely colour: the layouts do differ, the palettes do not.**

## READ PART 4 BEFORE PART 3

A builder fixing variety while tuning against the 60-metric band will be optimising **the thing that
rewards sameness**. The count sits near the centre of all sixty intervals precisely when every scene
is the same scene. These two objectives are in direct opposition, and the band is the one that must
lose. `docs/MEASURED.md` Part 4 (variety) before Part 3 (budget).

The diagnosis is legible and it is **not** "add more randomness". The whole `shade.*` family is frozen
at 0.04–0.13 — one lighting model, one luma ladder, one hue policy for every scene the feed will ever
emit — and `palette.distinct` spans 229–365 across 16 seeds where the reference's own crops span 410
of width. The reference varies its palette size more between two neighbourhoods of one picture than
this generator varies it between two different cities.

The 7 WIDE metrics are the same story from the other side and are not healthy variety:
`tileRepeat.largestCluster` 13.187 against a ceiling of 3.25, `flat.largestRegion` 3.172 against 1.35.
**Uniform where a scene should differ, erratic where a craft should hold — the signature of varying
nuisance parameters instead of content.**

## The palette is the load-bearing fix — three agents found it independently

- *critic:* median colour radius of gyration **58.8px vs 20.5px**; "colour is assigned, not motivated"
- *generator:* 2,430 distinct colours globally but only ~280 per 320px crop
- *variety gate:* "the layouts do differ, the palettes do not"

One global ramp smeared across the frame, instead of colours that live on the objects they belong to.

## The blind spot nobody has closed

**Nothing in this repo looks at objects.** The variety gate's 16×16 structure grid sees composition,
not objects — it cannot notice that every building is the same building. The band measures pixel
statistics. The duel is the only thing that has ever caught it, via round 1's one honest judge:
*"nails the global layer but fails at object level, which is the inverse of how a human pixel artist
degrades."* Until an object-level gate exists, **the duel is not a formality, it is the only real
test.**

One attack also remains untested: a generator that jitters the palette **and** pans the camera
defeats both halves of the variety distance at once, since the histogram half falls to a repalette and
the structure half falls to a translation.

---

# Why `tempoBpm` is useless — diagnosed

`tempoBpm` and `ioiEntropy` were recorded above as near-useless gates: both passed all six synthetic
control files. The synth builder found the mechanism while choosing a tempo range.

**The autocorrelation estimator locks to the bar, not the beat, on dense music.** A track genuinely at
140–172 BPM measures as 35–43 BPM — a factor of four out, because the bar (1.40–1.71 s) is what the
autocorrelation actually finds. The corpus band of 32.5–142.9 BPM is therefore not a band of tempi at
all; it is a mixture of beat-rate readings from sparse tracks and bar-rate readings from dense ones,
which is exactly why it is wide enough to admit anything.

Two consequences:

1. **Do not treat `tempoBpm` as a tempo.** Either fix the estimator to disambiguate beat from bar
   (onset-interval histogram rather than raw autocorrelation), or retire the metric. Leaving a metric
   in the suite that measures a different quantity for sparse and dense inputs is how the pixel band
   came to measure artwork identity.
2. **A musically correct tempo that reads out of band should be reported out of band.** It is one of
   the cheapest fails to spend against the ≤5-of-17 budget, and the alternative — choosing tempi to
   satisfy a broken estimator — is writing to the test.

## Resolved: `tempoBpm` is removed, and the obvious fix did not work

The recommendation above — "fix the estimator with an onset-interval histogram, or retire the
metric" — was acted on. **The fix was built and it failed.** Recording that, because the failure is
more instructive than the fix would have been.

Harmonic-sum salience over a canonical 90–180 BPM octave **looked** correct: the absurd 32.5 BPM
readings vanished and beat-to-`ioiMedian` ratios moved from 14.4 to a coherent 2–4 corpus-wide. Ground
truth then exposed a 3:2 hemiola error (150 BPM read as 99.4), fixed by requiring a candidate period
to be a strong peak in its own right rather than winning on its multiples.

Then the property that actually matters was tested — **resample real tracks by known factors and check
the reading scales**. It scored **6 of 24**, and the failures were systematic rather than noisy:
one track read 105.5 BPM at both 1.0× and 1.25×, another read 120.2 at both 1.0× and 1.5×.

> **The estimator was returning the centre of its own search window, not the music's tempo.**
> The octave fix made the numbers look right while the metric still measured its own search range.
> **Plausibility was not evidence.**

The test instrument also had to be controlled before the test could be believed: an initial run using
ffmpeg's `atempo` was invalid, because WSOLA manufactures transients and `onsetRate` failed to scale
under it (126–134% of expected at 0.8×). Pure resampling via `asetrate` preserves onset structure
(94–105%). The confounded run was discarded and redone.

`tempoBpm` is therefore **removed, not demoted**, with the measurement recorded in-code so nobody
re-adds it without redoing the resampling test.

**Two more demotions from the same audit.** `ioiEntropy` is not the same disease (there is no metrical
level to choose) but correlates at **r = −0.63 with `onsetRate`** — substantially a readout of how many
onsets the detector fired — and caught 0 of 6 controls; reported-only now. `spectralCentroidVar`
correlates at **r = 0.710** with `CV`; `CV` is kept as the better discriminator on every control and
the only one that is not scale-dependent. `beatStrength` **keeps its gate**: it takes the max ACF
anywhere in 30–300 BPM so it never chooses a metrical level, and under the same resampling test it
drifts only +17%/−24% in magnitude without changing quantity.

Net: **17 gating metrics → 14**, budget re-derived and still 5, LOO mean/max improved 2.26/7 → 1.89/6,
corpus acceptance held at 37/38, all six synthetic controls still fail, **margin preserved at 4**, and
best-control-vs-worst-real improved from 2 to 3.

**Known gap, documented rather than papered over: no tempo metric survives.** Nothing in the suite
constrains how fast the music is — a synth may emit a crawl or a blur unnoticed provided `onsetRate`
stays in 4.58–9.59/s. Restoring it requires an accent-aware beat tracker that passes the resampling
self-consistency test **before** it is given a gate.

---

# The audio fail-count is not a score either — and here the proof is arithmetic

The pixel band was retired empirically: it ranked a generator above genuine eBoy work. The audio band
fails for a reason that needs no experiment at all.

**Only 5 of the 14 gating metrics can respond to verbatim repetition** — `repeatStrength`,
`novelFraction`, `noveltyPerSecond`, `chromaChangeRate`, `beatStrength`. **The budget is 5.**

> A perfect loop cannot exceed the budget even if every development-sensitive metric fires.

Measured, with every control played through the *same* engine and master chain and mastered onto the
corpus loudness centre (best variant taken, giving the adversary its best shot):

| control | fails of 14 | verdict |
|---|---|---|
| 1 bar of real music, repeated verbatim for 60 s | 3 | **PASS** |
| 8 bars repeated verbatim | 3 | **PASS** |
| uniformly-random note walk | 3 | **PASS** |
| strict uniform (random pitch *and* rhythm, no sections) | 4 | **PASS** |
| sustained drone | 10 | FAIL |

A one-bar loop ties or beats **10 of 38** genuine chiptunes. The strict-uniform control beats **6 of 38**.

**Why the bar's own controls scored 9–13 and these score 3–4:** the original controls were caught by a
**timbre floor**, not by structure — polyphony 1.000–1.627 and centroid 5983–6561 Hz, both out of band.
Every control here sits *in band* on polyphony (3.0–4.5) and centroid (2485–2806). **Give a fake a
correct band-limited chip timbre and four voices, and the structural metrics catch almost nothing.**
The bar was testing whether something sounds like a chip, never whether it is music.

And the same homogeneity signature as the pixel side: the synth's mean of **1.50 ranks above genuine
chiptune's LOO mean of 1.89**. Read that as centrality, not quality.

**The audio bar is a floor that rejects a drone.** The duel is the bar.

## What the audio work does establish

- **Duty cycle is exactly recoverable from a solo stem, and only from a solo stem.** 12.5% → 12.50%,
  25% → 25.00%, 50% → 50.00%, all at MSE 0.00000 — including from a *mastered* stem with the master
  LPF divided out. A three-voice mixture returns MSE 0.01275, worse than a pure sine's 0.00887: the
  mixture is not a pulse by the only criterion available, whatever number it reports. The solo-stem
  requirement is fully vindicated.
- **The identities hold.** `sum(stems) − mix` max error 1.35e-7 (float32 accumulation only), and a
  first-0.5 s render is bit-identical to that span of the 60 s render, because phase integrates from
  each note's own onset.
- **Determinism and latency are real.** Two processes, identical SHA-256 on the mix and all five
  stems. Cold start 26.32 ms, warm median 5.95 ms, a 60 s render in 243 ms — 247× realtime.

## Two disclosures the builder made unprompted, both correct to disclose

`HARMONIC_SHADOW` in `theory.js` avoids voicing notes at +12/19/24/28/31/34/36 semitones above a lower
voice **because the analyser's salience grid suppresses them there**. It is also ordinary voicing
practice — but it exists because of the analyser, and is labelled as such in the source. The 10.5 kHz
master lowpass is likewise a real choice with a real effect on `spectralCentroidMean` (a raw pulse
stack measures ~5.5 kHz against a corpus p95 of 4671), fixed rather than a per-seed knob, disclosed in
`render.js`.

**Standing rule, from a real incident:** commit path-scoped, never `git add -A`, while more than one
builder is writing. Commit `4d59427` is titled "audio: first working chiptune engine" and contains
only another builder's `src/gen/props/vehicles.js`. Nothing was lost and the history is not being
rewritten while builders hold working state — but the message and the content disagree permanently.

---

# Round 3: lost 0–4, and the loss is the most informative result yet

Eight fresh judges, four pairs, both orders, brief v3, per-judge scratch dirs, checksummed inputs.
**Eight confident picks for the reference. Zero splits. Every judge correctly identified which side
was the program.**

That is a cleaner result than round 2 and a worse one. In r2 every pair *split*, because the verdict
depended on which contaminated proxy each judge happened to measure. Brief v3 closed those proxies —
and the judges now agree with each other. **They agree we lose.**

## The progress was real and large

- **Ink closure 9.62 → 5.17 median** across six seeds (range 4.57–6.18), spread collapsed from
  4.25–15.74. LA 3.23, Lufthansa 4.95. The same *regime* as genuine work, **not level with it** — two
  seeds in six beat Lufthansa; the typical seed does not.
- ~~**The first reference floor ever cleared in this project**~~ — **RETRACTED under standing rule 10.**
  Perceptual variety minimum pairwise distance moved 0.1754 → 0.2045 against a floor of 0.1950, which
  looked like a clearance and was reported as a milestone in the round 3 verdict and repeated three
  times. **The margin is +0.0095 at n=4** — inside the ~0.02 noise band. It is no result, not a
  clearance. Symmetrically, the post-P2 reading of 0.1747 (margin −0.0203) is **not** evidence the
  clearance was lost: both are no result in either direction, and neither should be quoted as a
  finding. The ratio half did move genuinely: median 0.685 → **0.913**, FROZEN 1 → 0.
- The `shade.*` family unfroze. The named root cause moved.

## The single remaining pixel gap is SCALE — and it is not "add detail"

**The detail is already drawn. It is drawn below the size that survives quantisation.** The vehicles'
"two orphan yellow pixel-pairs" *are* the lamp housings the builder added; the bus's wheels are 4px
and read as dashes. The code fires and the quantiser turns craft into noise.

> A's macro geometry is machine-clean, while everything below building scale dissolves into
> organic-contoured colour patches with interstitial dark speckle — the signature of a low-fidelity
> source resolved onto a pixel grid rather than placed pixel by pixel.

Three numbers, each from a different judge:

- **Zero** objects below building scale resolve into a nameable thing at 1:1 — 0 people, 0 vehicles
  with wheels or windows, 0 fixtures with facets. The reference: ~14 figures with faces and limbs,
  3 vehicles, a dozen articulated fixtures.
- **Zero** of our ~20 largest objects has an off-lattice silhouette — no curve, no 45° plane, no hip,
  no gable. The reference has ~12 at the same scale.
- **0.5% of our area in non-lattice-conforming form against the reference's 9.9%** — a twentyfold gap,
  and the hardest single number in the project.

So round 4 is: **make objects large enough to carry the detail already being drawn, then delete
anything still drawn below its own legibility floor.** Not more detail. Not more ink.

## The sentence that closes the measurement programme

A judge measuring both sides blind found us **statistically twinned** with the reference — 5×5-flat
0.153 vs 0.156, tile colour count 7 vs 9, structural repetition both ~22%.

> **What is not twinned is decision-making.**

We have matched the reference's pixel statistics and not its choices. That is why every count here had
to be retired as a score, arrived at independently by someone who did not know the history.
`flat.frac5x5` can no longer steer anything: it is blind at its own window size.

## Open, and blocking round 4

1. **`tagN` wraps at 65,534** (`scene.js:102`), worst seed already at 53,515 — 18% headroom. Wraps
   silently; two adjacent objects sharing a tag lose the keyline between them. **Fix before increasing
   scale**, which round 4 is entirely about.
2. **`outline.darkShare` is an open regression** — per-crop max 29.24% against a 19.56% ceiling
   (reference 16.26%). Round 4 cannot add ink anywhere until this is understood.
3. Four recorded, unfixed bugs: signage foreshortening; 125 horizontal runs ≥40px against the
   reference's 9; the merged corner (two lit facets at identical RGB, no outline, no value step); and
   non-closing ink chains that begin and end mid-plane and bound nothing.
4. **No tempo metric survives**, so the synth's 140–172 BPM is ungated and rests on musical judgement.

## Audio: the synth is sound, the bar is not

Duty recovers at **MSE 0.00000** from a solo stem, determinism byte-identical across processes, **26 ms
cold start**, 247× realtime. But the bar failed inversion — four of five adversarial controls pass,
and unspliced, a verbatim one-bar loop lands at **exactly the budget and passes with zero margin.**

The synth's 1.50 mean ranks *above* genuine chiptune's LOO 1.89 — the same centrality signature that
retired the pixel band. **Every count in this project is a floor, never a score. The duel is the bar.**

---

# The duel leaks, and the obvious remedy is worse than the leak

A leak control was shown **no images at all** — only colour histograms, quantities invariant under
shuffling every pixel. It recovered the reference-vs-generator partition **perfectly across four
pairs, with infinite margin, and labelled every one backwards.**

Both halves matter. Perfect recovery proves provenance rides in the colour multiset. The inverted sign
proves **no instruction to a judge can suppress it** — round 3's judges said they set palette evidence
aside, several by name, and the signal was still sitting there.

**The direction is counter-intuitive: the side with pure black and clean cube corners is the human
artwork.** eBoy spends 67,160px on cube-corner colours including 34,672px of true (0,0,0). Fixel has
zero of either, and one exact ink `#08080a` at ~0.18 of frame.

## Why quantising both sides to a shared palette does not fix it

**The threshold does not travel, and the relationship is not monotonic.** Closing points were measured
at K≤64, K≤64 and K≤24 on the same data — and the last two are *both median cut*, differently
implemented. The same nominal algorithm flips the result; the dominant knob is the box-selection rule
(select by max channel range vs by mass × range), not the split weighting. A normaliser was once
shipped on-by-default at K=192 and did not close the leak it existed for.

"Coarser is safer" is **false in both directions**. In one implementation at K=16 and K=24 the
separator does not close — it **inverts**, the reference becoming the more concentrated side
(top-1 [.226 .306 .225 .281] against ours [.208 .192 .191 .210]). That is still a perfect leak with the
sign flipped. A sweep must test |separation| in both directions, and must not assume monotonicity: one
implementation goes inverted-separated → closed → separated as K rises. Assert on the specific
deployed K, measured, never on a threshold with an assumed direction.

**And at the K where it does close, there is not enough colour left to judge.** Mean pixel-mass-weighted
L1 shift at K≤24 is 41–47 (~14–16 per channel), P95 above 100. The reference collapses from ~450
distinct colours to 23, ours from ~280 to 21. A judge would be scoring two posterised derivatives.

**A suspected asymmetry did NOT reproduce, and is not asserted.** One median-cut implementation showed
the reference absorbing more distortion at all eight K values (29 of 32 per-pair cells positive, ~25%
more at K=48). *Another median-cut implementation* gave a sign-changing ±1, the reference absorbing
*less* at four of eight. Recorded as **implementation-specific and unconfirmed** — and note this is two
implementations of the same algorithm disagreeing on the sign, not two different algorithms. It is left here because a
biased normaliser is a real hazard worth measuring for — not because it was established. The fidelity
argument below retires the normaliser without it, which is cleaner than leaning on a claim that would
have had to be retracted.

> A remedy for the leak that biases the judgment it was built to protect is worse than no remedy,
> because the bias is invisible in the leak metric it was tuned against.

Caveats stated by its author: per-pair asymmetry is noisy (two pairs flip sign at some K), and it
rests on n_reference = 1.

**If a normaliser is ever revived, fidelity and asymmetry are acceptance criteria alongside the
separator outcome.** A sweep that only asks "does the leak close" will select a K that closes it by
destroying the reference — a metric selecting for its own success, the same failure as the tempo
estimator returning the centre of its own search window.

**The real fix is at source:** the strongest separator is our own ink regression. If `darkShare` brings
our ink share into the reference's 0.05–0.10 band, the separator dies with no colour destroyed on
either side and no normaliser needed.

## Standing rule 9

**Test independence before treating shared structure as evidence.** "36 exact RGB triples shared across
four images" is overwhelming evidence of a fixed palette — and a tautology when the four images are
four crops of one file. The disconfirming evidence was in hand (pairwise intersections 170, 74, 76,
90, 128, 81; a stable-palette generator would show *flat* intersections) and was read as noise.

## Standing rule 10: a binary verdict at n=4 is not a finding — record the margin

Most of the leak thread was conducted in "separates 4/4" / "closed" verdicts. Those discard the margin,
and on four samples they carry almost no information. Measured afterwards: a "separates 4/4, cleanly"
verdict turned out to rest on a top-1-share margin of **+0.0077** in one implementation and **+0.0028**
in another — one sample away from closing, in a quantity that ranges over tenths.

**Record margins with the sample count attached. Treat a margin under ~0.02 at n=4 as no result in
either direction.** Any acceptance criterion built on a bare verdict inherits the verdict's blindness.

This is why the normaliser was retired on the **fidelity** argument rather than on any leak verdict.
Fidelity is a magnitude measurement, not a binary one, and two independent implementations agree on it.
The other durable result is the **un-normalised** leak, which is categorical — cube-corner presence 4/4
present versus 4/4 absent, infinite margin, and un-normalised top-1 separating by +0.066. Everything
said about *post*-normalisation leak verdicts should be held far more loosely than it was stated.

---

# FALSIFIED: the two mp4s in `refs/` are not an animation reference

**The claim, asserted twice and confidently by the lead of the animation round:**
that `#spheretales.mp4` and `I am four seconds old.mp4` are vertical, phone-shaped,
**animated pixel art** — characters moving subtly against a still ground — and that five
rounds had misread them as composition references. The instruction that followed was to
extract frames and set Fixel's animation amplitude and frequency from them.

**Measured, and every part of the claim is wrong.**

| claim | measurement |
|---|---|
| pixel art | **no native pixel grid.** Phase energy at k=4 is [0.430, 0.656, 0.432, 0.795]; an integer upscale would show three near-zero phases. 38,805–51,515 unique RGB **per frame**. Edges anti-aliased at a median 3.0 px transition width, only 1.3–4.2% hard 1px. Screen captures of smooth 3D creature generators rendered natively at 720x1280. |
| a loop | **not a loop.** The lag curve rises monotonically from k=1 in every window, global minimum always at k=1, never within 11–63x of the noise floor. "four seconds" has 90-frame cycles, but each is a 60-frame plateau then a 30-frame cross-dissolve to a **new creature and a new background** — a sequence, not a loop. |
| subtle motion | **median block displacement 6–10 px per 1/30 s** = 185–300 px/s. Sub-2px motion is only 6–9% of moving blocks. 7.5% of pixels change per frame in one video. |

Taking amplitude from these would have put 6–10 px/frame into a 375x812 pixel-art post,
which is a screensaver. **No amplitude in the animation round has a measured provenance,
and the record says so rather than implying one.**

## Where the amplitude actually came from, stated plainly

1. **The loop-closure constraint**, which is the only hard mathematical bound in play and
   the one that killed the obvious design on its own. A crest that marches closes the loop
   only if it advances a whole period across it; the swell pitch is 115–205 screen px, so
   one period over 8 frames is 14–26 px **per frame**. The arithmetic rejects a marching
   lattice before any taste is applied.
2. **The user's own words** — "slightly breathing", the amplitude where you are not sure
   whether it moved.
3. **A strip review by eye** (`tools/strip.mjs`).

Taste, disciplined by a strip review. That is weaker provenance than a measurement and it
is what we have; stating it as measured would be the fifth thing this project retracted.

## What DOES transfer, and it is worth more than the amplitude would have been

The references are useless for amplitude and genuinely informative about **spatial
structure**:

- **Coherent and regional, never scattered.** In every window a single connected component
  carries **78–99.8%** of all changed pixels. The size distribution is bimodal — dozens of
  1–4 px specks, which are compression noise, plus 1–3 components over 1000 px. **There is
  no mid-size population.**
- **Translation, not substitution.** 65–84% of moving blocks are explained by a rigid
  shift; motion compensation removes 65–78% of frame-to-frame error. Things move; they do
  not flicker in place.
- **A still world with one moving subject.** The camera is locked and the ground is
  **0.00% ever-changed** across every segment; the creature plus its shadow carries 70–92%
  of all changed pixels. Fewer things moving, more decisively, beats everything moving a
  little.
- **THE EXPLICIT DO-NOT.** The one genuinely pixel-scale element in either file — a speckle
  sphere — is **re-randomised every frame**: spatial autocorrelation lag-1 **0.341** (pure
  per-pixel white noise), motion-compensated ratio 0.98 (no translation explains it), a new
  colour at 58 of 60 frames. Per-pixel noise animation. **Nothing in Fixel may twinkle.** It
  would also read as dithering, which every reference in this file lacks (2x2 checkerboard
  rate 1.7–2.1%), and it manufactures orphan 1px islands, already at the ceiling on desert
  and highland.

`tools/animcheck.mjs` gates the last of these: it 4-connects the ever-moved mask and fails a
seed whose motion lives in 1–2 px specks. **A floor, never a score** — it rejects per-pixel
noise and does not rank two designs that clear it.

## The one tension, resolved deliberately rather than by deference

Fixel's water surges across **spatially offset** stretches, which is distributed motion; the
references say coherent motion is **one island**. These disagree.

The design stands, because the references are neither pixel art nor a loop and so do not get
to overrule a constraint derived from loop closure — and because the reasoning holds on its
own: real swell arrives in sets, and a sea pulsing in unison would be worse than a still one.
The finding is taken at the level where it does transfer: **each surging stretch must be
internally coherent**, its offset fieldlow-frequency enough that a contiguous run of coastline
moves as one region rather than adjacent pixels sitting at different phases. Distributed
regions, each coherent — not one region, and not noise.

## The process note

This is the second time in this project a load-bearing assumption about the reference files
went unstated and untested while decisions were built on it — the first being standing rule 9,
where "36 exact RGB triples shared across four images" was overwhelming evidence of a fixed
palette and a tautology about four crops of one file. Here the assumption was "these are
pixel art", it was never checked in five rounds, and it was about to set a number.

**Measure the reference before you take a number from it, including when the number is the
whole reason you looked.**

---

# THE AMPLITUDE FLOOR — subtler than about one pixel is not subtler, it is noise

**The most transferable result of the animation round, and it was found twice, by two
subsystems, through different mechanisms, without either knowing the other's number.**

The intuition going in — stated in the user's brief, in the lead's dispatch, and in both
builders' first drafts — was that "slightly" poses a question about how far DOWN to go, and
that the risk all lay above. It does not, and it does not.

> **A band edge displaced by less than a pixel cannot move AS AN EDGE.** Only the pixels
> whose threshold happens to fall inside the displacement flip, and independent pixels
> flipping is per-pixel noise by construction.

Measured, with each mechanism running ALONE so the others could not dilute the ratio, six
seeds each, using `tools/animcheck.mjs`'s island test (share of moving pixels living in 1–2px
components):

| mechanism | amplitude | specks | verdict |
|---|---|---|---|
| shore swell | 0.0060 (~0.5 px) | 44–65% | fails 6/6 |
| shore swell | 0.0090 (~0.8 px) | 13.6–45.5% | fails 4/6 |
| **shore swell** | **0.0125 (~1.4–2.6 px)** | **1.5–13.8%** | **passes 6/6 — shipped** |
| shore foam | 0.26 (1 px, the brief's target) | 18.8–41.0% | fails 5/6 |
| **shore foam** | **0.40 (1.4–2.1 px)** | **2.9–13.9%** | **passes 6/6 — shipped** |
| city canopy | 1 px | 22.3–38.8% | fails |
| **city canopy** | **2 px** | **5.6–15.9%** | **passes — shipped** |

Water finds the floor at about one pixel; foliage finds it at two, because a canopy's tone
field is itself noisy at the 2px octave so a one-pixel displacement flips a scatter along
every contour instead of moving a contour. **Different mechanisms, different exact values,
same conclusion.** Every shipped amplitude in the round sits ON its floor, not comfortably
above it — which is why `AMP_STEPS` in `src/core/frame.js` brackets the user's A/B **upward
only**, and why a "fainter" step was cut: it would have shipped a knob whose sole effect was
to make the water sparkle.

The corollary is the useful part, because it inverts the obvious tuning move:

> **When motion reads as noise, the fix is MORE amplitude, not less.** Coherence improves
> monotonically with it — across the shipped steps, specks fall 5.6–10.7% → 0.6–1.7% →
> 0.3–0.8% as gain goes 1 → 1.8 → 3.

One caution on the foam row, recorded because it is the kind of pass this repo has learned to
distrust: **0.26 clears the gate when measured in the finished frame** — the swell's coherent
arcs dilute the ratio — and fails it when measured alone. A component must clear a floor **on
its own**, not on its neighbours' coherence. Same shape as the composite-supercrop artefact
that produced the bogus "Lufthansa = 27".

## The related law, for anything blitted

`Canvas.blitAnim` carries the contract, and it is narrower than its first doc comment claimed:

> **A sprite may animate its COLOURS, at pixels whose tag, depth and silhouette are identical
> in every pose.**

Silhouette motion is not available. **The oracle established that; nobody reasoned it out.** A
grown silhouette wins depth tests it lost at frame 0 (252 px on the measured seed) and changes
tag ADJACENCY, so `outlinePass` un-blackens a pixel of the building behind it — 36 px that no
sprite touched and no recorder saw. Two designs that both looked correct, both rejected by
rendering the whole scene at frame k and comparing.

This is why palms and desert tussocks ship at zero silhouette motion: a frond is a tapered arc
1–5 px wide, every additive motion it has adds one or two loose pixels, and loose pixels are
the one thing that may not ship. **A reasoned exclusion is a result.** What remains available
to them is colour over a fixed silhouette — a frond turning and catching the light, which is
what a palm looks like at this scale anyway.

---

# Standing rule 11: every instrument in this repo has been wrong at least once

Not a series of anecdotes any more. Six, across three subsystems, and **every one was caught
by looking at the OUTPUT rather than at the number**:

1. **WSOLA manufacturing transients** — `atempo` invalidated the tempo resampling test;
   `onsetRate` read 126–134% of expected at 0.8x. Caught by controlling the instrument before
   trusting the test.
2. **The duty fit querying harmonics the band-limiter never rendered** — a mixture returning
   47.5% for a 12.5% pulse.
3. **The tempo estimator returning the centre of its own search window** — 6 of 24 on a
   self-consistency check, after an octave fix that made every number look right.
4. **A non-interleaved A/B reading run-to-run drift as an effect** — dirty bands "9% slower",
   which vanished when the runs were interleaved.
5. **`tools/strip.mjs` reading island quantiles off the wrong end of a descending sort** —
   printing p50 4 and p90 2. A p90 below the median is not a distribution; it is an indexing
   bug wearing a finding's clothes, and it was one report away from being quoted.
6. **The `polyphony` metric reporting its own plateau width rather than the voice count** —
   caught by plotting the salience curve for a single known note rather than by reading the
   number. The salience response to ONE note is a plateau 3-4 semitones wide, so two notes
   closer than that merge into a single local maximum: **voices are lost at exactly the
   intervals chords are built from.** Sines at midi 64 and 67 returned one voice.

**A number you have not seen the shape of is a number you do not have.** Plot it, strip it,
render it, sort it and read both ends — before it goes in a table.

---

# Standing rule 12: DISCLOSURE IS NOT MITIGATION — measure the size of every disclosed compromise

`HARMONIC_SHADOW` in `src/audio/theory.js` avoids voicing notes at +12/19/24/28/31/34/36
semitones above a lower voice **because the analyser's salience grid suppresses them there**.
It was disclosed three times over. The synth builder raised it unprompted in its own report as
"one disclosed tune-to-the-metric". It is labelled as such in the source. `theory.js` calls it
"the one place the composer is shaped by the measurement rather than only by the music", and
`docs/BAR.md` above records it approvingly as one of "two disclosures the builder made
unprompted, both correct to disclose".

Every reader of that disclosure — the builder, two rounds of critics, and the lead — treated it
as handled. **Nobody asked how big it was.** Measured, on the symbolic score:

| | |
|---|---|
| harmony notes displaced a semitone off the chord by the rule | **87.3%** |
| of those, still inside the shadow after being moved | **84.4%** |
| median octave headroom available to the escape path `m + 12 <= HARM_HI ? m + 12 : m - 1` | **0.0%** |

The third row is what makes the first two damning. The octave escape never fires, so the branch
always falls through to `m - 1`, which adds a chromatic pitch class every single time it runs.
**The rule fails at its own purpose on five notes in six while detuning almost an entire voice
to satisfy an analyser it does not satisfy.**

The compromise was honest, labelled, and unmeasured, and its size was roughly seven times what
any reader assumed. An honest label on an unmeasured compromise is how a project convinces
itself it has a small problem.

> **A disclosed compromise carries its magnitude, or it is not disclosed.** "I tuned this to the
> metric" is the beginning of the report, not the end of it. State what fraction of the artefact
> it touches, and state whether it achieves what it was traded for.

## The refutation that found it, recorded because the wrong answer was mine

The standing hypothesis — carried by a previous builder, restated by the lead of this round, and
handed down as the thing to test first — was that `pitchClassEntropy` running hot was driven by
**chord vocabulary**: sevenths, borrowed cadences and secondary dominants. `theory.js` says so in
a comment: those chromatic degrees exist "to push `pitchClassEntropy` off a bare seven-note
diatonic collection toward the corpus median of 3.119".

**Measured, the chord vocabulary sits at 2.771 — comfortably inside the band. The hypothesis is
refuted.** The entropy was coming from the shadow rule's `m - 1` fallback, not from the harmony.

The lead read that source comment and restated it as a causal finding without measuring it. That
is standing rule 7 — **plausibility is not evidence** — failing in the cheapest possible way: a
comment in the code is a claim about the code, not a measurement of its output. Do not chase
sevenths. The record says so instead of quietly correcting itself.

---

# Standing rule 13: delete what a compensation was compensating FOR — and check your assertion still means anything

Two catches from one task, both made by the builder against its own work, and the
second is the more valuable.

## The fix that would have passed its own test

The emissive opt-out lets a lamp skip the night lightness compression. But the
lamps were minted at lightness **0.99**, and that 0.99 was itself
**pre-compensation for exactly the compression the new flag now skips**. Left in
place, an emissive lamp renders **rgb(254, 253, 251)** — white — because HSL
chroma vanishes as lightness approaches 1.

The builder's own sentence, and it is the rule:

> **"That would have passed a hue check while throwing the amber away."**

The planned gate was "assert the lamp's hue lands in the warm band". White has no
meaningful hue. The assertion would have evaluated on an ill-conditioned quantity,
returned a number, and gone green while the defect it existed to catch shipped
underneath it. **An assertion is only as good as the conditioning of the quantity
it asserts on**, and a test can pass while the thing it tests has quietly become
meaningless.

This repo already knew that, in the same file, from the other end of the range —
`palette.js` on its hue jitter: *"Jitter only bites on pigments that HAVE a hue.
On a near-neutral the hue angle is ill-conditioned and rotating it is noise in the
measurement rather than a decision in the picture."* Hue is ill-conditioned at low
chroma. It is equally ill-conditioned at high lightness, and that second case was
the trap.

The general form, which is cheap to apply and would have caught this:

> **When you remove a compensation, find what it was compensating for and remove
> that too.** A pre-compensation and its correction are a matched pair. Delete one
> and the other becomes a bug pointing the opposite way — and it will look like a
> fix, because the numbers it was tuned against still move in the right direction.

## The probe that measured nothing and said so

The same builder's palette-collision probe returned zero collisions. Zero is the
answer it wanted. It rejected it: the probe patched `mk` **after the pigments were
already minted**, so it was observing a run in which nothing it cared about could
still happen. It rewrote the probe rather than believing it.

**Two instruments checked in one task**, neither of them the one it was asked to
check. That is the habit this project values above any number, and it is why the
standing-rule list keeps growing rather than the metric list.

## The defect this uncovered, which was wider than the task

While fixing lamps the builder found and refused to paper over a defect it
correctly judged out of scope: **hue ROTATION is the wrong operator near an
antipode.** The veil target is 214 with its antipode at 34, and the warm families
sit on it. Rendered, under night+fog, a city ships **a magenta roof, magenta
facades where terra and wood should be, and pink signage** — amber reads 310-326,
orange 301-317, terra 297-314, wood 304-320, and `sandy` straddles the antipode at
night+clear, reading **66 on one seed and 347 on another**.

> **Rotation passes through magenta, which lies nowhere between amber and
> blue-grey.**

The fix is to change the operator, not the parameters. Fog does not rotate a
surface's hue toward the fog's hue; it **mixes its own colour in front of it**
(Koschmieder — the same law that justifies keeping the veil on emitters). A warm
tone washed by cool fog travels toward the fog's colour **through grey**, because
that is what desaturation is. A blend in a linear space has no antipode, no
discontinuity and no branch — and it retires the hue cap that existed only to dodge
the sign flip. Moonlight is the same argument: a light source has a colour, and a
surface moves toward that colour rather than around a wheel toward it.

**Reporting a defect you were not asked to fix, in a file you own, without fixing
it in the same commit, is correct behaviour** — and it is what let this be scoped,
measured and gated instead of arriving as an untested side effect of a lamp fix.

---

# The `polyphony` rebuild — and why nothing had to be retracted

`polyphony` is one of the six metrics that caught all three synthetic controls on both
mastering variants, so a broken `polyphony` would have meant part of the bar's teeth were
imaginary. It was broken. **The teeth were not imaginary, and the ablation is why we can say
so rather than hope so.**

## The answer to "did any past conclusion rest on it": no, and here is the test

Not "the bias was symmetric across corpus and Fixel, so it probably cancels" — that was the
available hand-waving answer and it is not a finding. Instead the metric was **ablated to worth
nothing at all**, and the controls re-scored:

> **With `polyphony` contributing zero, nine of nine synthetic controls still fail, by 4-8
> metrics clear of budget.**

That is a stronger result than symmetry would have been, because it does not depend on the
broken metric behaving consistently. Two numbers were retracted in place — struck, not deleted,
per this file's convention.

## It falsified the bug report it was handed, and the falsification WAS the mechanism

The defect was reported as "a 392 Hz sine produces no candidate at all". **It does not vanish.
It returns one candidate, mislabelled as midi 66.** A wrong candidate, not a missing one — and
that distinction is the whole diagnosis, because a missing candidate points at a detection
threshold while a mislabelled one points at the plateau. **Chasing the reported cause would have
fixed the wrong thing.** It said so and declined to fix the defect as described.

Reproducing a bug before fixing it is standing practice here. This is the case that shows why:
the report was *nearly* right, and nearly right is where the wasted round lives.

## The obvious fix would have made it worse, in the stratum that matters

Raising `CFG.NC` is the fix everyone would try first. Measured across a sweep: exactness
**plateaus at 64%**, and the wide-register stratum **DEGRADES, 43% -> 37%**. The mechanism is
specific and worth carrying: sharper frequency resolution lands a bass note's true harmonics
*precisely* on the suppression stencil, so it deletes genuine upper voices. **Measured rather
than assumed, and the assumption was wrong.**

## A stale number that flattered us — read this next to standing rule 12

Two figures in `docs/AUDIO-MEASURED.md` were carried unchanged from the 17-gate era into the
14-gate one: "only 5 of 38 genuine tracks clear all 14" and "a track is expected to miss ~1.7 by
construction". Measured now, they are **9 of 38** and **1.4**.

> **The error flattered the argument, which is the direction a stale number is least likely to
> be questioned.**

Both stale figures made the all-pass gate look more absurd and the budget look better justified
— i.e. they supported the conclusion the document was already making. Standing rule 12 says a
disclosed compromise carries its magnitude; this is its sibling: **a number that agrees with you
is the one to re-derive**, because nobody audits a number that is making their case for them.

## `HARMONIC_SHADOW` partially rehabilitated — the intent was sound, the stencil was weak

The band owner corrected **itself** here, and the correction goes against the simpler story.
Over 6 roots x 4 timbres x 3 balances, the stencil intervals genuinely *were* worse for the
shipped counter — **37% against 51%**. Its own earlier n=1 probe had said the opposite and was
wrong.

So the honest statement is **not** "the rule was pointless". The compromise was **aimed in the
right direction**; the stencil was simply a weak predictor of which intervals actually get lost:
`+12` scored 54%, while `+10`, `+13` and `+18` — none of them avoided by the stencil — scored
35-40%. The removal stands and was correct, on the separate ground that the rule fired on 87% of
harmony notes and achieved its purpose on 17% of those. **A compromise can be well aimed and
still be worth deleting**, and that is a different sentence from "it never did anything".

## The two self-caveats, kept verbatim because they are the load-bearing part

- The rebuilt counter is **73% exact — reported, not claimed as solved.** It still under-counts
  dense mixtures by 0.9 voices at five notes, with the low register worst at **53%**.
- **A re-derive is not an independent test.** The corpus defined the band it is then scored
  against, so **the leave-one-out column is the number to read**, not the in-band count.

## THE OPEN DEFECT, deliberately not fixed, and it is larger than the one that was

**The same plateau mislabels PITCH: 85% correct overall, and 60% correct below 124 Hz.** That
feeds `pitchClassEntropy` and `chromaChangeRate` — two more load-bearing gates.

> **Every entropy reading in this audio investigation rests on a chroma detector that is 60%
> right in the bass.** That includes the readings that refuted the chord-vocabulary hypothesis
> at 2.771, and the readings that justified removing `HARMONIC_SHADOW`.

Stopping was correct: fixing chroma moves five gating metrics at once, and only the counter had
been validated. But this cannot sit as a footnote, and it is commissioned as its own task with
the same ablation discipline. One promising asymmetry to start from: **unlike the voice count,
chroma DOES respond to `NC` — 97% at 16384** — so the cheap fix that was unavailable to the
counter may be available here.

## How to cite the `HARMONIC_SHADOW` removal — the two halves must stay apart

There are two independent arguments for removing that rule, and **only one of them
is currently trustworthy**:

| the argument | rests on | status |
|---|---|---|
| the rule **fired on 87%** of harmony notes and **achieved its purpose on 17%** of those | a firing-rate count over the symbolic score | **sound. Does not touch chroma at all.** |
| removing it did not move `pitchClassEntropy`, which sits at 2.771 | the chroma detector | **not yet trustworthy — 60% correct below 124 Hz** |

The removal stands, on the first row alone. But the tempting shorthand is
**"we measured it and removed it"**, and that sentence quietly borrows credibility
from the untrustworthy half. Cite the firing rate, not the entropy, until the
chroma task reports.

The same caution applies to the refutation of the chord-vocabulary hypothesis. It
was refuted at 2.771 — a chroma reading. If the corrected detector moves that
number, the refutation is re-opened, and the `theory.js` comment claiming those
chromatic degrees were added to lift entropy becomes live again rather than
merely wrong. **A conclusion inherits the reliability of its weakest instrument,
and it keeps inheriting it until that instrument is fixed.**
