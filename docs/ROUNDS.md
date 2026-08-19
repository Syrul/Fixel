# Rounds

Win-loss, honestly. A pair is a **WIN** only if a judge picks the Fixel crop in
*both* orders, judged by two different fresh agents. Anything else is a LOSS.
The round is a win only if every pair is a win — mixed means it lost.

Seeds pick the post and both crop positions. There is no flag to nominate a
crop. Key files live in `out/.keys/`.

---

## c0 — control (reference vs reference), harness self-test

| check | result |
|---|---|
| position bias | **PASS** — same physical image picked in both orders, 3/3 |
| metadata leak | **PASS** — byte-length identical within every pair, same format, same mtime |
| reference homogeneity | **FAIL** — judge called "different hand" on two crops of the *same file* |
| cross-pair inference | **FAIL** — batched judge identified the recurring source |

See `docs/HARNESS.md`. Craft rankings from c0 are not usable; the two PASSes are.

---

## r1 — first real round

Generator: first pass. 4 pairs, both orders, 8 separate fresh judges, one pair each.

### Provenance (from the key, recorded so an easy win can be audited)

| pair | reference crop | Fixel seed | Fixel crop |
|---|---|---|---|
| 1 | (243, 309) | `fixel-r1-xon0zf` | (457, 171) |
| 2 | (327, 465) | `fixel-r1-hlmv5h` | (311, 365) |
| 3 | (452, 217) | `fixel-r1-noa8kz` | (1023, 414) |
| 4 | (327, 435) | `fixel-r1-4matgd` | (270, 547) |

All four reference crops landed in the dense city core, not the soft beach
corner. This round drew hard opponents; no crop-luck asterisk applies.

### Numbers beside the bar — the actual crops the judges saw

| metric | ref p1 | fix p1 | ref p2 | fix p2 | ref p3 | fix p3 | ref p4 | fix p4 |
|---|---|---|---|---|---|---|---|---|
| `changeRate.h` | 0.273 | 0.366 | 0.293 | 0.379 | 0.282 | 0.379 | 0.290 | 0.367 |
| `runLen.fracGt8` | 0.432 | 0.138 | 0.412 | 0.120 | 0.419 | 0.117 | 0.416 | 0.141 |
| `colorsPerTile.median16` | 7.0 | **16.0** | 7.5 | **16.0** | 8.0 | **16.0** | 8.0 | **16.0** |
| `palette.distinct` | 354 | 112 | 381 | 111 | 563 | 111 | 395 | 111 |
| `flat.frac3x3` | 0.363 | 0.109 | 0.344 | 0.102 | 0.350 | 0.105 | 0.343 | 0.116 |
| `edge.meanDelta` | 222 | 147 | 206 | 150 | 221 | 145 | 207 | 144 |
| `hue.fracNearGrey` | 0.554 | 0.494 | 0.497 | 0.508 | 0.607 | 0.524 | 0.513 | 0.564 |

Whole-scene score against `band-pixel-v1`: **PASS 9/34, HARD FAIL 20.**

### What the numbers say before any judge spoke

The failure is **not** sparseness. It is the opposite: confetti.

- Density **overshot** — 0.37-0.38 against a [0.267, 0.325] band.
- `colorsPerTile.median16` is **16.00 on all four seeds** against a [7, 9]
  band, +3.50 bandwidths, the worst single number in the round.
- `flat.frac3x3` is a third of the reference's. Nothing is flat.
- `edge.meanDelta` is 145 against 205-222 — because **there are no black
  outlines anywhere in our output**, so the biggest transitions available are
  facade-to-facade colour steps.

The diagnostic pair is `palette.distinct` = 111 (band [337, 747], too FEW) sitting
next to `colorsPerTile.median16` = 16 (band [7, 9], too MANY). The reference
**localises** its palette: ~500 colours per crop but only ~8 per 16x16 tile, because
each object commits to a few and different objects commit to different few. Ours
sprays one small global palette uniformly, so every tile samples the whole thing.
Fewer colours would make it worse; more *spatially committed* colours is the fix.

### Seed variance

Our four seeds produced near-identical statistics — `colorsPerTile.median16` was
exactly 16.00 on all four, `palette.distinct` 111/111/111/112. Every Fixel scene
is, statistically, the same scene. For an *endless feed* that is a defect in its
own right and it is not yet on any gate.

### Verdicts — 8 fresh judges, one per pair per order

| pair | -ab picked | -ba picked | result |
|---|---|---|---|
| 1 | Fixel (confident) | Fixel (confident) | **WIN** |
| 2 | Fixel (confident) | Fixel (confident) | **WIN** |
| 3 | Fixel (confident) | Fixel (confident) | **WIN** |
| 4 | Fixel (confident) | **reference** (confident) | **LOSS** (split) |

**Round result: LOSS.** Three pairs won, one split. Mixed means it lost.

Seven of eight judges picked Fixel. **The round is still a loss, and the three
wins should not be banked.** Two independent reasons:

1. **The wins were bought with our worst defect.** Judges in pairs 1, 2 and 3 all
   ranked on colours-per-tile and all ranked it the wrong way round — "B's median
   16x16 tile holds 16 unique colours against A's 8" was given as a reason Fixel
   is *better*. That metric is Fixel's worst failure at +3.50 bandwidths. They
   simultaneously penalised the reference for 38-42% of its area sitting in flat
   blobs, which is the flat-facet craft `BAR.md` calls the single number
   separating real pixel art from everything pretending. The v1 judge brief
   invited this by defining density as "how much of the area is doing work, and
   how much is filler". Brief retired; see `docs/JUDGE-PROMPT.md`.
2. **The numbers disagreed with the judges** — on the named hard-fail list, not
   on any count. Fixel had no outline system at all (`outline.run12Share`
   -4.06 bandwidths, zero pure black in the output), 5.48% orphan single-pixel
   islands against 2.20%, and a pixel-weighted median connected region of 20px
   against 162px.

   > **RETRACTED:** this section originally reported a table of "N/60" scores.
   > That framing is dead — see `docs/DIFF.md` §3. The pixel fail-count measures
   > artwork identity, not craft, and it *rewards homogeneity*, so it cannot rank
   > anything inside the craft family. Do not restate those numbers, including
   > as a before/after.

### The one judge who was not fooled

The pair-4 `-ba` judge picked the reference and identified Fixel as generated
without being told anything:

> "A nails the global layer... but fails at object level, which is the inverse of
> how a human pixel artist degrades — a hand that can build a city block can
> build a rooftop AC unit. That split, macro-statistics-correct /
> micro-semantics-absent, reads as a generator that learned the style's texture
> rather than its objects."

Its gap, as a number: **5,607 orphan single-pixel colour islands = 5.48% of the
canvas, against the reference's 2.20%** — a 2.5x speckle rate. And **median
connected colour region 25px for Fixel against 105px for the reference.**

That is the round's real finding. Judges measuring aggregate colour statistics
preferred us; the one judge that looked at whether individual small objects hold
together caught us immediately.

Worth noting the other judges saw the same thing and scored it the other way:
pair 4 `-ab` called Fixel "kit-of-parts construction with per-instance colour
randomisation, not per-object drawing", pair 3 `-ab` called it "indexed-palette
tile pixel art", and pair 1 `-ab` called it "one consistent hand throughout".
Four of eight judges spontaneously identified which side was machine-made. Being
recognisable was not, under the v1 brief, being marked down.

### Structural gaps, measured (band-pixel-v2)

| metric | Fixel | band | dist |
|---|---|---|---|
| `outline.run12Share` | 0.689 | [0.870, 0.915] | **-4.06** |
| `outline.run1Share` | 0.415 | [0.608, 0.693] | -2.30 |
| `outline.blackMediatedDiff` | 0.075 | [0.409, 0.573] | -2.03 |
| `outline.darkShare` | 0.059 | [0.145, 0.196] | -1.66 |
| `flat.frac5x5` | 0.047 | [0.123, 0.222] | -0.77 |
| `slope.r1` (1:1 diagonals) | 0.106 | [0.130, 0.333] | -0.12 |
| `slope.r2` (2:1) | 0.802 | [0.559, 0.777] | +0.12 |

The face-shading ladder is close to right already (`shade.lumaRatioMedian` 0.623
in band, `shade.hueRotAbsMedian` 3.14 in band). **The outline system is the
single largest structural hole and it does not exist at all.**

---

## r2 — second real round

Method changes since r1, all of them fixes to defects r1 exposed:

- **Judge brief v2.** r1's wording biased judges toward confetti; retired. v2
  states explicitly that flat facets are not filler and that more colours per
  tile is usually worse. See `docs/JUDGE-PROMPT.md`.
- **Per-judge scratch directories + `CHECKSUMS.txt`.** Each judge verifies the
  sha256 of both inputs before and after, and works in a directory of its own.
- **Symmetric padding.** Both files are padded, not just the smaller one, so the
  chunk's presence no longer identifies our side. `BRIEF.md` now tells judges
  that file structure is not evidence.
- **Acceptance is a budget, not all-pass** (`tools/budget.mjs`): hardFail <= 20,
  set at p95 of the leave-one-out distribution. See `docs/DIFF.md`.

### Provenance

| pair | reference crop | Fixel seed | Fixel crop |
|---|---|---|---|
| 1 | (264, 252) | `fixel-r2-3d5p0r` | (377, 581) |
| 2 | (203, 132) | `fixel-r2-sty2ka` | (654, 484) |
| 3 | (715, 61) | `fixel-r2-zalzkn` | (149, 619) |
| 4 | (305, 239) | `fixel-r2-6wtyc5` | (79, 618) |

### The named defects on the exact crops the judges saw

> **RETRACTED:** this section originally tabulated per-crop hard-fail counts and
> ACCEPT/REJECT verdicts against a budget. Both are void — see `docs/DIFF.md` §3.
> The count cannot rank inside the craft family; it is a floor for rejecting
> things outside it (Shift-Bild sits at 48-50 under every band) and nothing more.

The defects that were real, named individually and still open at duel time:
`outline.run1Share` 0.508 vs [0.608, 0.693]; `outline.blackMediatedSame` 0.157
vs [0.230, 0.333]; `slope.r2` 0.857 vs [0.559, 0.777]; `flat.frac5x5` 0.119 vs
[0.123, 0.222].

### Progress since r1, measured

Named defects only — no aggregate counts, per `docs/DIFF.md` §3.

| | r1 | r2 | reference |
|---|---|---|---|
| pixel-weighted median connected region | 20 px | **63 px** | 162 px |
| orphan 1px islands | 6.26% | **2.25%** | 1.89% |
| `colorsPerTile.median16` | 16.00 (all 4 seeds identical) | 9–10 across seeds | 7–9 |
| outline system | absent | `run12Share`, `mediationGap`, `blackMediatedDiff` all in band | — |

Real movement on every axis r1 identified. Speckle is solved. The outline system
now exists. Seed-to-seed variance is no longer degenerate.

### Still failing

`outline.run1Share` 0.508 (band [0.608, 0.693]) — outlines exist but are not
consistently 1px. `outline.blackMediatedSame` 0.157 (band [0.230, 0.333]) — no
interior panel lines. `slope.r2` 0.857 (band [0.559, 0.777]) — measurably too
mechanical, and it varies only 3.7% across seeds, so every scene is equally
rigid. `flat.frac5x5` 0.119 (band [0.123, 0.222]) — surfaces still not holding
25px at one value, the same defect as the 63px connected region.

### Verdicts — 8 fresh judges, corrected brief, one per pair per order

| pair | -ab picked | -ba picked | result |
|---|---|---|---|
| 1 | reference | Fixel | **LOSS** (split) |
| 2 | Fixel | reference | **LOSS** (split) |
| 3 | Fixel | reference | **LOSS** (split) |
| 4 | reference | Fixel | **LOSS** (split) |

**Round result: LOSS, 0-4.** Every pair split. Mixed means it lost.

**All four pairs split.** That is the headline, and it is not a tie — it means
two fresh judges shown identical pixels reached opposite conclusions, four times
out of four. Under the r1 brief judges agreed with each other and were
wrong together; under the v2 brief they disagree. The output has become close
enough that the verdict now depends on *which property a judge chooses to
measure* — and that is a statement about the harness, not about our craft.

### The reasons split as cleanly as the votes

Judges who examined **object construction and light** picked the reference:

- "a window rule that fired on one face and not its neighbour, with no lighting
  rationale — which is how a generator fails, not how a person fails"
- "~50 vehicles… **zero** of them has a wheel, wheel arch, mirror or windscreen
  division"
- "A's inventory is a small set of parametric primitives — rounded lozenge
  (every car), cube (every tree/AC unit), thin black bar (every pole)"

Judges who examined **palette statistics** picked Fixel — and were reading the
reference's file history, not its craft:

- "**60 visually indistinguishable blacks**… B draws every outline with exactly
  one black"
- "**237 of A's 712 distinct colours (33.3%) are perceptual ghosts**"

eBoy did not choose sixty near-blacks; the file has them, from whatever
rasterised it. Our generator writes palette indices, so it is *cleaner than a
real artwork*, and several judges read that cleanliness as the human hand.
**A win earned that way is not a craft win**, and none of the three has been
banked. See `docs/HARNESS.md` for the full contamination analysis and the four
criteria judges have now inverted across two rounds.

### The best single sentence about where we are

From the pair3 `-ba` judge, which picked the reference:

> "A has the surface signature of pixel art — 272 colours, no antialiasing, clean
> 2:1 slopes, 0.08% intermediate pixels — **without the underlying decisions.**"

Its supporting numbers, all new and none of them in our 60:

| | Fixel | reference |
|---|---|---|
| lone black pixels (1px dark components) | **1,107 = 34.6% of all dark-ink components** | — |
| dark ink surviving a 3x3 erosion | **0.4%** | 13.1% |
| median colour's spatial radius of gyration | **58.8 px** | **20.5 px** |
| drawn objects >= 40px per 1000px on the largest flat plane | 0.78 (lawn) | 1.45 (sand) |

The erosion number says we **trace outlines but never fill a dark mass** — no
tyres, no jackets, no shadowed volumes. The radius-of-gyration number is the
sharpest statement yet of the palette problem: the reference's colours are
confined to the objects they belong to (79% of colours live in <= 6 of 400
tiles), ours are one global ramp smeared across the whole crop. And the lawn is
an "unfilled gap, not a facet" — the exact distinction the v2 brief asked judges
to make, applied against us correctly.

### The variety gate — the defect that matters most for an endless feed

`tools/variety.mjs`, run on 8 seeds:

| | |
|---|---|
| metrics whose cross-seed spread is NARROWER than the reference's own crop-to-crop spread | **53 of 60** |
| median spread ratio (1.000 = a new seed moves a metric as much as panning across the reference does) | **0.642** |
| metrics identical on every seed at every window | 1 (`runLen.median`) |
| closest pair of seeds, perceptual distance | **0.1752** |
| reference floor (3,681 non-overlapping crop pairs) p05 | **0.1950** |

**VERDICT: FAIL.** Two different Fixel scenes are more similar to each other than
two non-overlapping crops of the *same single artwork* are. For an endless feed
this is the product-defining defect, and — per `docs/DIFF.md` §3 — the pixel
fail-count actively *rewards* it, because a generator sitting at the statistical
centre of every band scores well by being homogeneous.

The gate is not yet trusted: it has been asked to survive an inversion test
(adversarial recolour / 1px-jitter / hue-rotation controls must rank BELOW a
genuine spread of reference crops) before any number from it is treated as a
score. Read the NARROW list, not the count.

---

## r3 — pixels and audio. Both halves. **LOST.**

Generator frozen at commit `b121f1f`, tree digest `a9f2180f82d62760`, `verify.mjs`
4/4 byte-identical across processes and 4/4 distinct seeds. Duel stamped with
that digest. Judge brief **v3**, per-judge scratch directories, checksummed
inputs, symmetric padding.

### Verdict: 0-4, and it is not close

| pair | -ab | -ba | result |
|---|---|---|---|
| 1 | reference | reference | **LOSS** |
| 2 | reference | reference | **LOSS** |
| 3 | reference | reference | **LOSS** |
| 4 | reference | reference | **LOSS** |

**Eight fresh judges, eight confident picks for the reference, zero splits, and
every judge correctly identified which side was the program.** Pair 3 agreed in
both orders, so there is no position bias on it.

This is a cleaner result than r2, and worse. In r2 all four pairs *split* — two
judges shown identical pixels disagreed, because the verdict depended on which
proxy each happened to measure. Brief v3 closed those proxies, and judges now
**agree with each other**. They agree we lose. One judge stated explicitly that
it had set aside palette size, fringe and near-duplicate darks per caution 4,
and that colours-per-tile was effectively tied per caution 2 — and it still
identified us, on craft.

### The progress is real and large

- **Ink closure 9.62 -> median 5.17** across six seeds (range 4.57-6.18), with
  the seed-to-seed spread collapsing from 4.25-15.74. LA reference 3.23,
  Lufthansa 4.95. **The generator is now in the same regime as genuine work
  rather than a different one.** It is *not* level with a genuine Pixorama —
  two seeds in six beat Lufthansa, the typical seed does not.
- **The first reference floor ever cleared in this project.** Perceptual variety,
  minimum pairwise distance across seeds: 0.1754 -> **0.2045** against a
  reference floor of **0.1950**, and all four windows clear it
  (0.2045 / 0.2189 / 0.2325 / 0.2526). The variety gate still returns FAIL on
  its ratio half (0.963 vs 1.000), and both halves must be reported — "variety
  FAIL" alone would misrepresent it. The one FROZEN metric, `runLen.median`, is
  integer-quantised at 2.000: that is the metric's resolution, not a property of
  the scenes.
- **The `shade.*` family is unfrozen** — `lumaRatioMedian` 0.018 -> 1.101,
  `hueRotMedian` 0.115 -> 0.558. That was the named root cause and it moved.
- `corrDx0Share` and `edge.meanDelta` now pass on 4/4 seeds; `hueRotMedian`
  passes 4/4 and never rotates warm.

### The single remaining gap on the pixel side: SCALE

Not "add detail". **The detail is drawn, and drawn below the size at which it
can survive quantisation.**

Settled on one object: a judge reported our vehicle has "two orphan yellow
pixel-pairs floating where headlights should be". Those *are* the builder's lamp
housings. The code fires. At the size the object is drawn, a lamp housing is two
loose pixels and a door seam is stipple. The bus likewise has wheels — radius
about 4 screen pixels, which reads as "a dashed row of disconnected black
pixels".

The numbers, from four independent judges plus my own verification:

| | Fixel | reference |
|---|---:|---:|
| objects below building scale resolving into a nameable thing at 1:1 | **0** | ~14 figures, 3 vehicles, a dozen fixtures |
| area in non-lattice-conforming forms | **0.5%** | **9.9%** |
| colour-boundary runs that are exactly the 2px iso stair | 45.2% | 30.6% |
| runs exceeding 5px | 5.0% | 15.2% |
| uniform 17x17 windows | 1.34% | **0.01%** |
| exact structural duplicate 12x12 windows | 6.08% | 1.40% |
| 32x32 windows holding <=2 colours | 4.2% | **0.0%** |

The 0.5% vs 9.9% on off-lattice form is a **twentyfold gap and the hardest
single number in the project.**

The best summary anyone produced: *"A is bimodal — its macro geometry is
machine-clean, while everything below building scale dissolves into
organic-contoured colour patches with interstitial dark speckle — the signature
of a low-fidelity source resolved onto a pixel grid rather than placed pixel by
pixel."* We are drawing detail into a space too small to hold it, and the
quantiser turns craft into noise.

And the sentence for the whole round: we and the reference are **"statistically
twinned on the metrics that usually separate machine from hand"** — 5x5-flat
0.153 vs 0.156, median 16x16 tile colour count 7 vs 9, structural repetition
both ~22%. **"What is not twinned is decision-making."**

### Metrics retired or demoted this round

- **`flat.frac5x5` can no longer steer anything.** Discrimination at its own
  window is 1.07x (13.08% vs 13.95%) while at 17x17 it is 134x. We gated on it
  with "zero headroom" and it cannot see the defect it exists to protect. Gate
  13x13 or 17x17 instead.
- **`palette.top1Share` reads backwards** — our top colour is one shared ink at
  ~19%; the reference's is a sand tone at 6.45% *because its black is fragmented
  into many near-blacks by rasterisation*. Fourth metric contaminated by the
  reference's file history. Brief v3 caution 4 already covers it.
- **`edge.fracAA` is not antialiasing.** Nothing in the renderer blends. It is
  our three-step ladder on objects too small to carry a ladder — the scale
  defect measured a second way, not an independent failure.

### Open regression: ink is over budget, and unevenly

`outline.darkShare`, six seeds x nine crops:

| | whole-image | crop max |
|---|---|---|
| range | 16.57-19.53% | **20.43-29.24%** |

Band ceiling 19.56%, reference 16.26%. No seed's whole-image reading exceeds the
ceiling; crops reach 29.24%. **Ink is spatially concentrated and averaging hides
it — and the duel judges 320px crops.** Gate the per-crop max. Round 4 cannot add
ink anywhere until this is understood.

### Bugs found, none statistical

1. **Signage foreshortens.** Glyphs taper ~9px -> ~5px cap height across one
   sign. An axonometric plane shears but never scales, so type on it must hold
   constant cap height and stroke weight. A correctness error in glyph placement.
2. **125 horizontal constant runs >=40px against the reference's 9**, longest
   106px vs 50px. A horizontal line is off-axis for both the 2:1 lattice and the
   vertical, so it cannot be a chosen lattice break.
3. **Merged corner** — a building's two vertical facets rendering the exact same
   RGB (156,157,153) with no outline and no value step, so its own edge vanishes.
4. **Non-closing ink** — "dotted, non-closing 1px black chains that begin and end
   in mid-plane and bound nothing". That is what our ink-closure number looks
   like on screen.
5. **`tagN` wraps** at `scene.js:104` (`% 65534` into a `Uint16Array`). Worst of
   eight seeds reaches 53,515 at 1600x1100 — **18% headroom**. Fix before
   anything increases density or frame size, which is exactly what round 4 does.

### Hero signage shipped as a slab

Round 3 added hero signs — the loudest absence in round 2 — and a judge read ours
as the worst object in the frame: "3,082 pixels of one unbroken yellow with no
frame, no panel thickness, no edge value change, and a support pole below that
terminates at the boundary without a join." **Round 4 must build signs, not place
them.**

---

## r3 audio — the synth works; the bar does not discriminate

**The synth is sound.** Duty cycle recovers from a solo stem at **MSE 0.00000**,
determinism verified byte-identical across processes, **26 ms cold start**,
symbolic note data serialisable and measurable independently of the wav. The
architecture separation the bar requires was designed in from the start, and the
limiter envelope is computed once and applied identically to mix and stems so
`sum(stems) === mix` — which is what makes per-channel duty measurement
meaningful at all.

**But it failed its inversion test: four of five adversarial controls PASS**,
including one bar of music repeated verbatim for 60 seconds.

I confirmed the mechanism analytically. Against the unlooped synth, only three
metrics respond to verbatim repetition with real force — `repeatStrength`
+131.5%, `novelFraction` -98.5%, `noveltyPerSecond` -76.6% — and the budget is 5.

My own spliced loop scored 6 and appeared to contradict this. It did not: the
sixth was `beatStrength` at +12.2%, and **my ffmpeg splice manufactures a hard
transient every 1.45 s**, which is a periodic onset. Remove the splice artefact
and a verbatim loop lands at exactly 5 against a budget of 5 — **it passes, with
zero margin.** The builder's symbolically-generated loop, which has no splice, is
the clean test, and its PASS stands. My test understated the failure.

**So the audio fail-count is a floor.** It rejects a drone and a random walk. It
does not distinguish music from a verbatim loop of music.

**The synth's 1.50 mean is not a pass.** It ranks *above* genuine chiptune's
1.89 — the same centrality signature that retired the pixel band: a generator
sitting near the middle of every interval scores well precisely by being
unremarkable.

**Remaining audio gap: no tempo metric survives.** `tempoBpm` was removed after
it was shown to return the centre of its own search window (6 of 24 on a
resampling self-consistency test). Nothing in the suite now constrains how fast
the music is. The synth's 140-172 BPM is **UNGATED** and rests on musical
judgement alone — an assumption, not a checked property.

---

## What this round taught the process

- **Third instrument-contamination catch**, after WSOLA manufacturing transients
  in the resampling test and the duty fit querying harmonics the band-limiter
  never rendered. Each time the agent caught its own instrument instead of
  shipping the number. That habit is the most valuable thing this loop has built.
- **A sixth retraction, avoided.** I reported ink closure as "4.94, level with
  Lufthansa" from a single seed. The six-seed median is 5.17 and only two of six
  beat Lufthansa. **The generator is a distribution, not an artefact** — any
  number from fewer than about six seeds now carries its range or does not
  appear. And the statistic must match how the artefact is judged: the duel shows
  crops, so a whole-image mean is the wrong summary.
