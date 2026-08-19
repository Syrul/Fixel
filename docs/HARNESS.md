# The duel harness, and what its self-test found

`tools/duel.mjs` builds blind pairs. `tools/metrics.mjs` is the shared numeric
half. Neither is trusted until the harness has been run against itself.

## Round c0 — the control (reference vs reference)

3 pairs, each emitted in both orders, 6 blind comparisons. **Both sides of every
pair were crops of `refs/EBY-LA-Hot-Dog-175k.png`.** Fixel's generator was not
involved. A single fresh judge, told only what `BRIEF.md` says, ranked all six.

### PASS — position bias

The judge picked the *same physical image* in all three pairs under both label
orders (A in `-ab`, B in `-ba`, three times out of three). Zero flips. Label
position is not steering the verdict, so a real result read in both orders is
interpretable.

### PASS — metadata leak

Within every pair the two files are byte-length identical (86219 / 87484 / 99069),
same dimensions, same colour type, same interlace flag, same mtime. `file` and
`ls -la` separate nothing. The `pxPd` padding chunk in `duel.mjs` is what buys
the equal byte length; without it a sparse generator's crop would deflate to a
fraction of a dense reference crop's size and the listing alone would give it
away.

### FAIL — the reference is not homogeneous

This is the finding that changes how every later round must be read.

On pair 3 the judge answered **yes, different hand** — on two crops of the *same
file*. Its reasons were specific and correct: one crop was the flat cel-shaded
city core (274 distinct colours, hard keylines, everything locked to the 2:1
lattice); the other was the beach and ocean corner, which the artist rendered
with soft multi-step gradients, off-lattice contours and **796 distinct colours,
345 of them appearing fewer than ten times** — roughly triple the palette and
about triple the rate of isolated single pixels.

Consequences we have to hold to:

1. **The band is wide because the reference is wide.** A single p05..p95 band
   derived from random crops spans both the dense flat core and the soft beach.
   A generator can sit inside the band by matching the loose end while looking
   nothing like the part of the reference that is actually good.
2. **Which crop the seed draws decides how hard the duel is.** A seed that
   lands on the ocean gives us a weak opponent. We do not get to choose, and we
   must not start choosing — but every round record must log the reference crop
   coordinates so a suspiciously easy win can be checked against where it came
   from.
3. **"Different hand: yes" is not by itself a loss.** The reference disagrees
   with itself by that test. What matters is the *direction* of the reason.

### FAIL — cross-pair inference

The judge spotted that several crops shared overlapping content ("the same sign
and statue appear in both, pixel-for-pixel"). All reference crops come from one
1189x840 file, so a judge shown several pairs at once can identify the recurring
side as the common source and infer provenance without judging craft at all.

**Rule adopted:** in scoring rounds, every pair gets its own fresh-context
judge that sees exactly one pair. Never batch pairs into one judge again. The
c0 control was batched deliberately — that is how this leak was found — and its
craft rankings are therefore not usable for anything except the two PASSes above.

## Standing rules

- Seeds pick the post and both crop positions. There is no flag to nominate a
  crop, and adding one would void the round.
- Every pair is judged in both orders, by separate judges. A win counts only if
  it holds in both.
- Several pairs, not one. Mixed means it lost.
- The key is written to `out/.keys/`, never inside the duel directory.
- No round is interpretable unless a control round from the same code is at
  chance on position.

---

## Round r1 — three more harness defects, all found by judges

### FIXED — the padding chunk identified our side

`duel.mjs` padded only the *smaller* file to equalise byte lengths. Since the
generated crop always deflates smaller than a dense reference crop, exactly one
image per pair carried a `pxPd` chunk, and that image was always ours. A judge
parsed the PNG structure and reported it verbatim:

> "B's PNG carries a 70,074-byte private `pxPd` padding chunk that equalises the
> two file sizes; the actual IDAT payloads are A 155,058 bytes vs B 84,972."

A second judge flagged the same thing from the outside: "both files are exactly
150,769 bytes, which for two different 320x320 images is essentially impossible
by chance."

Fixed: both files are now padded to `max(len) + 65536`, so both always carry a
chunk of non-trivial size and presence carries no information. The IDAT lengths
still differ and cannot be equalised without re-encoding one side, so `BRIEF.md`
must state that internal chunk sizes are not evidence of origin.

### FIXED — the judge brief was biased toward confetti

See `docs/JUDGE-PROMPT.md`. The v1 criteria line "density: how much of the area
is doing work, and how much is filler" caused judges to rank on per-pixel
variation and to score the reference's flat facets as dead area. Retired.

### OPEN — concurrent judges shared a scratchpad

One r1 judge reported that the session scratchpad was being written by another
process while it worked, that it contained `A_q0.png`…`B_q3.png` from a
different judge, and that its own crops were overwritten mid-run, causing it to
briefly analyse two images that were not its own. It detected the collision by a
dimension mismatch, re-ran in an isolated directory, and its reported
conclusions come from verified crops.

That judge caught it. **A judge that did not catch it would have silently
compared the wrong pixels and we would have had no way to tell.** Every judge in
a round works on the same two filenames in the same shared scratchpad, so this
is a systematic hazard, not a one-off.

**FIXED before r2.** Three changes, all verified:

1. Every judge is given its own scratch directory in its prompt and told that
   other judges are running concurrently on the same two filenames.
2. `duel.mjs` writes a `CHECKSUMS.txt` into every pair directory holding the
   sha256 of both images. The judge computes both hashes before it looks at
   anything and again before it reports, and is told to stop and report a
   mismatch rather than a ranking. Hashes of both sides leak nothing — they are
   equally opaque for the reference and for us.
3. `BRIEF.md` now states that both files are padded to identical byte length and
   that chunk sizes are not evidence of origin, closing the r1 structural leak
   at the brief level as well as in the encoder.

Verified on control round c2: `CHECKSUMS.txt` hashes match the files on disk,
both PNGs carry a `pxPd` chunk, and both are exactly 164920 bytes.

---

## Round c2 — the control's own control was broken

The corrected judge brief (v2) was validated on a ref-vs-ref control. The judge
verified both sha256 hashes before and after, worked only in its own scratch
directory, and reasoned carefully about flatness rather than reflexively — it
distinguished "a building face, a facet of a solid, legitimately flat" from
"2,909px of contiguous beach sand, a ground plane". So v2 has not simply
inverted v1's bias.

**But it found a bug in the control itself.** By brute-force offset search it
established that the two supposedly-different reference crops shared **24,344
RGBA-identical pixels — 23.8% of each frame** — flush in one corner of each and
with no paste seam, and correctly concluded they were two windows onto one
raster.

Cause: the non-overlap condition rejected a candidate crop only when *both*
axes were within `SIZE/2`, which plenty of overlapping pairs satisfy. Two equal
squares are disjoint only if separated by at least `SIZE` on *either* axis.
Fixed, and verified on round c3: crops now separated by dx=324 and dx=441.

Consequence for c2's verdicts: a judge comparing two crops that share a quarter
of their pixels is not being asked the question the control exists to ask, so
c2's craft ranking is not usable. What c2 *does* establish, and these stand:

- **Scratch isolation and the checksum step work.** The judge verified both
  hashes twice and reported doing so.
- **The v2 brief is not inverted.** It weighed flat area on whether it was a
  facet or a gap, exactly as intended.
- **"Different hand" answered No, and proved it rather than asserting it** —
  24,344 identical pixels is not an impression.

One incidental observation worth keeping: the judge read the reference's own
small signage as "garbled pseudo-lettering" and counted it as evidence of a
program. The reference's real signs are simply small. Tiny lettering reads as
machine-made to a judge regardless of who drew it, so our invented signage is
unlikely to be what gives us away — and equally, we get no credit for fixing it.

---

## CORRECTION: r1's "no position bias" PASS was an artifact of batching

r1's control was judged by **one** agent across both orders. It picked the same
physical image both times, and I recorded that as a position-bias PASS.

That conclusion does not survive separate judges. In control round c2 the two
orders went to two different fresh agents, and **they contradicted each other —
each picked the image labelled A**, which are different physical images:

| | A.png | picked |
|---|---|---|
| c2 pair1-ab | `8ec9ff48…` | **A** (`8ec9ff48`) |
| c2 pair1-ba | `b5ea2dfb…` | **A** (`b5ea2dfb`) |

One judge holding a view across two orders measures that judge's consistency,
not the harness's freedom from position bias. It is the cheaper experiment and
it answers a different question. Two fresh judges on the same pixels is the
honest test, and on n=2 it disagreed.

This does not by itself prove a label-A bias: r2's real pairs split both ways
(pair1 both judges picked A, pair2 both picked B). The more defensible reading
is that **when two crops are close in craft, separate judges are near chance**,
and a split verdict is the harness telling us so rather than a failure to
decide. c2's control was also degenerate (24% pixel overlap between the two
"different" crops, since fixed), so it is weak evidence either way.

**Standing correction:** we do not currently have a clean position-bias result.
Getting one needs a non-degenerate control judged by separate agents, with
enough pairs to distinguish label bias from near-chance disagreement. Until
then, split verdicts are reported as splits and not adjudicated.

## The light-model claim, verified

An r2 judge said Fixel's building solids have "no light model at all", with
"100% of the three largest buildings' vertical corners at a luminance
difference of 0.000". I measured it independently across every vertical dark
seam of 10px or more, comparing mean luminance 2px either side:

| | seams | mean abs dL | median | fraction under 2 |
|---|---|---|---|---|
| reference | 160 | **53.3** | 46.1 | 3.8% |
| Fixel | 117 | **35.4** | 24.9 | 4.3% |

**Partially confirmed, and the correction matters.** Fixel's faces are not
undifferentiated — the fraction of effectively-equal seams is 4.3% against the
reference's 3.8%, essentially the same. What is true is that our light model is
much *weaker*: median contrast across a seam is 24.9 against 46.1, a factor of
1.85. The judge generalised from three buildings where two faces of the same
material happened to meet; the real defect is not absence but insufficiency.

Note this passed `shade.lumaRatioMedian`, which measures the ratio between
*adjacent same-hue faces* and does not see that the overall face-to-face
contrast is too low. Another case of a metric passing while the property it was
meant to protect is visibly wrong.

---

## The r2 contamination: judges are ranking on the reference's FILE HISTORY

Round r2's judges split cleanly into two camps, and which camp a judge fell into
predicted its verdict almost perfectly.

**Camp 1 — judges that analysed palette hygiene concluded the REFERENCE is
machine-made, and picked Fixel:**

- "A spreads its 15,784 near-black pixels across **60 visually indistinguishable
  blacks**… B draws every outline with exactly one black `(8,8,10)`."
- "**237 of A's 712 distinct colours (33.3%) are perceptual ghosts** within
  L1 <= 3 of a more-used colour; B's figure is 12 of 272 (4.4%)."
- "eight indistinguishable near-blacks inside one car… the signature of a
  continuous-tone stage — a generative model or a blend/resample step — dressed
  as pixel art."
- "**48 distinct near-blacks**, eleven of them over 250 px each… no hand picks
  eleven identical blacks."

**Camp 2 — judges that analysed object construction and light concluded FIXEL is
machine-made, and picked the reference:**

- "B's ~50 vehicles are 2-3 tone lozenges with **no wheel, wheel arch or
  windscreen division**."
- "a window rule that fired on one face and not its neighbour, with no lighting
  rationale — which is how a generator fails, not how a person fails."
- "A's inventory is a small set of parametric primitives — rounded lozenge
  (every car), cube (every tree/AC unit), thin black bar (every pole)."

**Camp 1 is measuring the reference's production pipeline, not its craft.** The
reference is a rasterised artwork carrying colour jitter and edge fringe from
whatever produced the file. eBoy did not choose sixty near-blacks; the file has
them. Our generator emits an exact indexed palette because it writes palette
indices, so it is *cleaner than a real artwork* — and several judges read that
cleanliness as the mark of the human hand.

So a Fixel "win" from a Camp 1 judge is not a craft win. It is the judge
detecting file provenance and scoring it backwards.

**This is the third time a judge has ranked on a proxy rather than craft**, after
r1's "more colours per tile is better" and c2's degenerate overlap. The proxy
changes; the failure does not. The v2 brief closed r1's proxy and opened room for
this one.

**What v3 must add**, without telling the judge which side is which: near-duplicate
palette entries, colour fringe on edges, and the count of near-identical darks are
artifacts of a file's production history and are **not evidence of craft in either
direction** — a picture assembled from an exact indexed palette is not thereby
better made, and one carrying rasteriser jitter is not thereby machine-made.

**And the deeper problem this exposes:** these tells are reliable enough to
identify the sides, which means the duel is not blind on craft alone. Every
future round should include a control that tests whether a judge given only
palette statistics — no picture — can identify which side is the generator. If
it can, the duel is leaking and the leak must be closed before the verdicts mean
anything.

### A fourth inversion: lattice purity read as the human hand

The r2 pair4-ba judge traced every colour boundary and found:

| | steps at exactly +/-2px (the 2:1 iso slope) | steps at +/-1 | ratio | straight 45-degree runs >= 8px |
|---|---|---|---|---|
| **Fixel** | 43.1% | 4.6% | **9.5 : 1** | **zero** |
| reference | 25.0% | 18.2% | 1.37 : 1 | 44 |

It then concluded: *"disciplined-and-on-grid is the hand, sloppy-and-off-grid is
the machine tell"*, and picked Fixel.

**That is exactly backwards, and we have the measurement to prove it.**
`docs/BAR.md` establishes from four files that built geometry locks to 2:1 but a
100%-2:1 image "reads mechanical", and that the reference's ~14.5% at 1:1 is
deliberate — gables, hips, cross-braces, organic forms. `slope.r2` too high and
`slope.r1` too low is one of our **named open hard fails**. The judge measured
our defect precisely, and scored it as a virtue.

So the tally of criteria judges have inverted across two rounds:

1. r1: colours per tile — more read as better.
2. r1: flat facets read as dead filler.
3. r2: palette hygiene — the reference's rasteriser jitter read as machine origin.
4. r2: lattice purity — our over-regular projection read as the human hand.

Every one of these is a real, measurable property. Every one was read with the
wrong sign. The pattern is not that judges are careless — these judges did
careful, quantitative work — it is that **a proxy correlated with provenance
will always be found, and its direction is a coin flip unless the brief pins it
down.** The brief can only pin down proxies we have already seen fail.

This is the strongest argument yet that no single duel round is decisive, and
that the verdict must rest on the *reasons* judges give, not the tally.


---

## The colour-histogram leak, and the fix

### The control

A judge was given **no images at all** — only quantities invariant under
shuffling every pixel: colour multisets, distinct counts, near-duplicate counts,
top-colour share, near-black clouds. It was asked which side of each pair was
the program.

**It recovered the partition perfectly across four pairs, with infinite margin,
and labelled every one of them backwards.**

Both halves matter. Perfect recovery proves provenance rides in the colour
multiset alone. The inverted sign proves the signal is not something a judge can
be *instructed* out of using — round 3's judges said they set palette evidence
aside, several by name, and it was still sitting there for anyone who looked.
The control's own sentence is the correct reading:

> "a judge that misreads the sign still leaks; 0/8 is perfectly anti-correlated,
> which is perfectly informative. The harness is compromised by the EXISTENCE of
> the deterministic signal, not by any judge's skill at decoding it."

### The two fingerprints, measured

| | eBoy LA reference | Fixel r3 |
|---|---|---|
| cube-corner colours | 7, over **67,160 px** | **0** |
| true (0,0,0) | **34,672 px** | **0** |
| top colour | (179,173,164) at **4.84%** | (8,8,10) at **18.84%** |
| distinct | 3021 | 2172 |

Two separate giveaways. **Exact-palette cleanliness**: a generator writing
palette indices emits an exact small palette, while a rasterised artwork
accumulates near-duplicate ghosts as a production artefact. **Palette identity
across crops**: the reference's four crops come from ONE file so they share
colours exactly; ours come from four seeds with per-scene palette commitment and
share almost nothing.

Note the direction, because the control got it backwards and so would most
people: **the side with pure black and clean cube corners is the human artwork.**

### The remedy that was NOT taken

Read literally, "eliminate the program's fixed-palette-reuse signature" means
eliminating **per-scene palette commitment** — the round 3 change that unfroze
the `shade.*` family and produced the only reference floor this project has ever
cleared (perceptual variety 0.2045 against 0.1950). Applying the control's
remedy as written would have destroyed the single best result in the project.
An inverted sign matters even when the conclusion holds.

### The fix

`tools/normalise.mjs`, wired into `duel.mjs` and **on by default** (`--raw`
disables). Both crops are quantised to ONE palette derived from their union by
weighted median cut, through the same code path. Neither "has an exact clean
palette" nor "shares colours with its siblings" can then distinguish them.

Measured on pair 1 after normalisation:

| | before | after |
|---|---|---|
| distinct (ref / fixel) | 3021 / 2172 | **142 / 135** |
| pure black (ref / fixel) | 34,672 px / 0 | **0 / 0** |
| cube-corner (ref / fixel) | 7 / 0 | 2 / 0 |
| top-colour share | 0.0484 / 0.1884 | 0.0750 / **0.1658** |

**Craft survives it.** Ink closure keeps its ordering and its gap
(ref 2.45 -> 3.23, fixel 4.68 -> 5.56), and at 4x the reference's police car
still carries its light bar, windows, wheels, panel seams and door shield, with
figures keeping their faces.

### The residual, and why it is not a leak

`top1Share` still separates the sides after normalisation, 0.075 vs 0.166. That
is **not** a file-history artefact — it is our real ink regression: we genuinely
spend ~17% of the frame on one near-black. A judge noticing that is noticing a
craft defect, which is what a judge is for. It should disappear when the
`darkShare` regression is fixed, and if it does not, the leak is our drawing and
not our encoder.

**Standing rule:** a signal that survives instruction must be removed from the
artefact, not forbidden in the brief. Cautions in a judge brief are a fallback,
never the primary control.

### CORRECTION: the normaliser as first shipped did not work, and the ordering was wrong

I built the normaliser and turned it **on by default at K=192 before sweeping
it.** Sweeping the real median-cut pipeline afterwards:

| K | 16 | 24 | 32 | 48 | 64 | 96 | 128 | 192 |
|---|---|---|---|---|---|---|---|---|
| top-1 share | overlaps | overlaps | **SEP 4/4** | SEP 4/4 | SEP 4/4 | SEP 4/4 | SEP 4/4 | SEP 4/4 |

**A finer palette is leakier**, which is the opposite of the intuition that
"higher fidelity is safer". A coarse shared palette merges the reference's
fragmented near-black cloud into one slot and lifts its top-1 share to meet
ours; a fine palette keeps our single exact ink in a slot of its own with its
full ~0.18 mass. An independent k-means simulation closed at K=64 where median
cut only closes at K<=24, so **the threshold is pipeline-dependent and must be
asserted inside the real pipeline, never guessed.**

Normalisation is now **off by default**. The ordering was also wrong: the
strongest surviving separator is our own ink regression, whose fix is already a
round-4 prerequisite. If it brings our ink share into the reference's 0.05-0.10
band, the separator dies at source and no normaliser is needed. Re-measure the
leak on post-fix output first, then decide.

### THE QUESTION NOBODY ASKED: does the cure destroy the patient?

At the K where the leak closes, is there enough colour left to judge craft?
Measured **inside the real median-cut normaliser**, mean pixel-mass-weighted L1
shift per side:

| K | 16 | **24** | 32 | 48 | 64 | 96 | 128 | 192 |
|---|---|---|---|---|---|---|---|---|
| err REF | 49.6 | **40.7** | 36.0 | 26.6 | 21.4 | 15.0 | 12.3 | 8.4 |
| err FIX | 44.8 | **39.2** | 34.2 | 27.0 | 22.4 | 16.1 | 12.4 | 7.2 |
| P95 REF | 149 | **123** | 113 | 81 | 70 | 49 | 42 | 28 |
| slots REF | 16 | **24** | 32 | 47 | 61 | 87 | 107 | 146 |

**At the closing threshold K<=24 the reference collapses from ~450 distinct
colours to 24 slots**, with a mean shift near 40 L1 (about 13 per channel) and a
P95 of 123 (about 41 per channel for the worst 5% of pixels). A judge shown
those pairs is not judging the artworks; it is judging two heavily posterised
derivatives. **The remedy has a fidelity floor, and on this corpus there may be
no K that both closes the leak and leaves the craft signal intact.**

That alone retires the normaliser as an approach, not merely as a tuning.

### Asymmetry: reported by k-means, NOT reproduced by median cut

An independent k-means run found the distortion biased against the reference at
**all eight** K values (+5.71 to +1.49), which would hand us an unearned craft
advantage — "a remedy for the leak that biases the judgment it was built to
protect is worse than no remedy, because the bias is invisible in the leak
metric it was tuned against."

**Measured in this pipeline, that bias does not reproduce.** Median cut gives
+4.76, +1.52, +1.84, **-0.40, -0.99, -1.05, -0.09**, +1.20 — small and
sign-changing. So the asymmetry claim is **pipeline-specific and is not asserted
here.** The fidelity argument kills the normaliser on its own and does not need
it.

This is the fourth independent demonstration that quantiser behaviour does not
travel: k-means closed at K=64, its median cut at K<=64, this median cut at
K<=24, and now the asymmetry sign differs too. **Assert inside the real
pipeline, never inherit a threshold.**

### The normaliser CREATED a leak while trying to close one — demonstrated, not projected

A verification control run against the normalised pairs recovered the partition
perfectly again, on four statistics, two of which work on a **single image**
without needing the pair. Three of the four turned out to be artefacts of the
normaliser itself. Measured on RAW output, tree `fc6eeb818b719f1c`:

| | min | max | reaches 255 | reaches 0 |
|---|---|---|---|---|
| eBoy LA reference | 0 | 255 | yes | yes |
| Fixel raw, seed 1 | 0 | 255 | **yes** | yes |
| **Fixel NORMALISED crop** | 0 | **253** | **no** | yes |
| eBoy NORMALISED crop | 0 | **255** | **yes** | yes |

**Our raw renders reach both 0 and 255. After joint quantisation ours no longer
reaches 255 and the reference still does.** Median cut allocates slots by pixel
mass: our sparse extreme highlights carry little mass and get merged away, while
eBoy's extremes carry 67,160 px and survive as their own slots. So the
normaliser destroyed OUR data preferentially and manufactured a brand-new
single-image fingerprint.

That is a **second and stronger reason to keep it retired** than the fidelity
argument, because it is a demonstrated harm rather than a projected one. It also
means "max channel 255" and "extreme share" must NOT be sent to the generator as
defects — they are measurement artefacts.

### Notes for a revival that probably should not happen

Three corrections to the record, none of which change the retirement:

- **The asymmetry divergence was not k-means versus median cut.** Both numbers
  came from median-cut implementations. So it is **two median cuts disagreeing
  on the SIGN of the same quantity**, which strengthens "behaviour does not
  travel" rather than weakening it.
- **The knob is box SELECTION, not split weighting.** Selecting boxes by max
  channel range gives asymmetry positive at all 8 K; selecting by mass x range
  gives the small sign-changing values this pipeline produces. `normalise.mjs`
  selects by `ext * log2(1+mass)`, which is mass-weighted — that one line
  plausibly explains both divergences. Checkable, worth confirming only on
  revival.
- **"Coarser is safer" is FALSE.** At coarse K the separator can **invert**
  rather than close, the reference's top-1 overshooting ours once quantisation
  merges its fragmented black hard enough. Still a perfect leak, opposite sign.
  So a sweep must test **|separation| in both directions** and must not assume
  monotonicity: one implementation goes inverted-separated, then closed, then
  separated again as K rises.

### Why the retirement decision holds regardless

**The normaliser was retired on the FIDELITY argument** — a magnitude
measurement that two independent implementations reproduce — **not on any leak
verdict.** Every leak verdict in that thread was a binary at n=4, and several
turned out to rest on margins of +0.0077 and +0.0028. The fidelity numbers are
margins by construction: 24 slots and a mean shift of 40 L1 is not a verdict
that can flip on one sample.

And the un-normalised leak stands untouched and **categorical**: 4/4 cube-corner
present vs 4/4 absent, infinite margin, ~200 distinct near-blacks vs exactly 1.

That the surviving argument is the one that does not rest on a thin verdict is
worth recording as a reason rather than as luck: **prefer the argument that is a
measured magnitude over the one that is a verdict, especially at small n.**

### Two acceptance criteria, if the normaliser is ever revived

Not optional, and neither is "does the leak close":

1. **FIDELITY** — mean and P95 colour shift, and slots actually used, on both sides.
2. **ASYMMETRY** — the per-side difference, measured in the pipeline being shipped.

A sweep that only checks whether the leak closes will happily select a K that
closes it by destroying the reference. **That is a metric selecting for its own
success** — the same failure as the tempo estimator returning the centre of its
own search window.

### THE LIMIT THIS ALL RUNS INTO: n_reference = 1

All four reference crops come from one file. **So the entire leak battery
distinguishes that file's rasterisation pipeline from our generator — not
hand-made art from machine-made art.** Corner-colour presence and black
fragmentation are properties of how a given file was rasterised, not properties
of craft.

Consequences, and they are binding:

- Requiring the control to "land at chance" is **much weaker validation than it
  sounds** and would NOT license a claim that the harness no longer leaks.
- The eight directories are **four comparisons mirrored** — 8 looks like 8
  samples; it is 4 comparisons over 5 distinct sources.
- Any chance-level result is **provisional** and must be reported as such.

This is the third time the single-file bar has surfaced as a root cause, after
the 60-metric band was found to measure artwork identity rather than craft. The
root cause is that the bar is one file.
