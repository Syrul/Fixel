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
