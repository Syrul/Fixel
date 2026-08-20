# Fixel audio bar — measured

Every number on this page was produced by `tools/audio-metrics.mjs` on the files in
`corpus/chiptune/wav/`. Nothing here was heard. There are no ears anywhere in this project; each
figure is a computed statistic, and the calibration section exists specifically so the band cannot
be trusted on assertion.

- Corpus: **38 CC0 chiptune tracks** (licences verified per track in `corpus/chiptune/SOURCES.md`)
- Band: `docs/band-audio-v1.json`
- Reproduce: `node tools/audio-metrics.mjs --corpus corpus/chiptune/wav --emit-band docs/band-audio-v1.json`

## How long tracks are handled

Track lengths run from 14.7 s to 252.1 s, so raw whole-track statistics would not be
comparable. Each track is cut into consecutive non-overlapping **30 s windows**; a trailing
remainder under 15 s is dropped, a track shorter than 30 s is analysed whole, and at most 8 windows
are taken. Every metric is computed independently per window, and the track's value is the **median
across its windows**. A 4-minute track and a 40-second track therefore each contribute exactly one
value per metric, and the band is a percentile across tracks, not across windows — so a long track
cannot outvote a short one.

## What gates and what does not

The gating metrics were chosen on one criterion: **a limiter must not be able to fake them.**
Loudness, peak, RMS and crest factor are all trivially mastered to any target, so they are computed
and reported but marked NON-GATING and excluded from the verdict. Their job is to show that the band
is not a loudness band in disguise — see the calibration below, where the controls are deliberately
mastered onto the corpus loudness median and still fail.

## Acceptance rule

A track PASSES if **at most 6 of the 14 gating metrics** fall outside their p05..p95 band.

The budget is not a guess; it is the p95 of the leave-one-out fail-count distribution of the corpus
against itself. Demanding all 14 metrics be in band is the wrong gate and the corpus proves it: with
14 two-sided p05..p95 bands a track is expected to miss ~1.4 by construction, and measured
leave-one-out only **6 of 38** genuine CC0 chiptunes clear all 14. Mean leave-one-out failures per
real track: **1.97**, max **6**. At a budget of 6, **38 of 38** real tracks are accepted.

> **The budget was 5 and is now 6, and that is a LOOSENING — read it as a cost, not a result.**
> It moved as a consequence of the chroma rebuild below, in the same way `polyphony`'s band widened
> 78% in the round before: a detector that no longer compresses its output spreads the corpus out.
> `pitchClassEntropy`'s band width went 0.528 → 0.618 and `chromaChangeRate`'s 0.586 → 0.888, which
> put a second track on 6 leave-one-out failures and carried the p95 over the boundary.
>
> **What it costs is stated in band-widths, not adjectives.** The best-scoring fake still misses 9
> gating metrics, so its clearance over the budget fell from **4 to 3**. Corpus acceptance rose from
> 37/38 to 38/38. A more permissive gate is exactly what a synth tuned to the metric would want, so
> it is recorded here rather than in a footnote: *the separation is one notch narrower than it was.*

> ~~"a track is expected to miss ~1.7"~~ and ~~"only 5 of 38 clear all 14"~~ — **CORRECTED.** Both
> were carried over unchanged from the 17-gate derivation and never re-measured when the set was cut
> to 14. Read off `acceptance.leaveOneOut.failCounts` in `docs/band-audio-v1.json`, the count of
> tracks clearing all 14 was **8** before the `polyphony` rebuild, **9** after it, and **6** after the
> chroma rebuild — never 5; and 14 two-sided p05..p95 bands put the expectation at 1.4, not 1.7. The
> direction of the error flattered the argument — it made an all-pass gate look more absurd than it
> is — which is exactly the direction a stale number is least likely to get questioned. The
> conclusion is unchanged either way: 6 of 38 is an 84% rejection rate on the corpus's own music.

## Metrics that were retired, and why

This suite shipped with 17 gating metrics. It now has 14. Three were removed after measurement, not
after review — a metric earns a gate only if it **(a)** reports one quantity regardless of input,
**(b)** is not a restatement of another gate, and **(c)** actually discriminates.

### `tempoBpm` — REMOVED ENTIRELY (fails a)

Not merely demoted: deleted from the output. The original estimator took the argmax of the onset
autocorrelation, which locks onto whichever periodicity is strongest — and on dense music that is the
**bar**, not the beat. It reported 32.5 BPM for music plainly at ~130 while sparse tracks reported the
beat directly at ~161. The 32.5..142.9 band was therefore a *mixture of two different quantities*,
which is why it was wide enough to admit a sustained square wave.

Two repairs were attempted and measured:

1. **Harmonic-sum salience over a canonical 90..180 BPM octave.** Every reading became beat-level and
   musically plausible — the ratio of beat period to median inter-onset interval moved from an absurd
   14.4 (celestial-8bit-thing) to a coherent 2-4 across the corpus. But a 3:2 hemiola error remained:
   a 150 BPM ground truth read as 99.4.
2. **Multiplicative salience**, requiring the candidate period to be a strong peak in its own right
   rather than winning on its multiples alone. This fixed the hemiola cases.

Both were then tested for the only property that matters here: *does it report one quantity?* Real
corpus tracks were resampled by known factors and the reading checked against the expected scaling.

> **Test validity was itself controlled.** ffmpeg's `atempo` cannot be used — `onsetRate` fails to
> scale under it (126-134% of expected at 0.8x), so WSOLA is manufacturing transients and any result
> would be an artefact. Pure resampling (`asetrate`) preserves onset structure exactly: `onsetRate`
> scales at 94-105%. The confounded test was discarded and re-run.

**Result: 6 of 24 correct.** And the failures were not noise — `junkala-level2` reported 105.5 BPM at
both 1.0x and 1.25x; `sketchy-boss` reported 120.2 at both 1.0x and 1.5x. The estimator returns the
centre of its own search window, not the music's tempo. A metric that tracks its search window rather
than its input cannot be fixed by widening a band, and shipping it at 25% accuracy is worse than
shipping nothing.

`beatStrength` survives and still gates. It is the strongest periodicity **anywhere** in 30..300 BPM,
so it never has to choose a metrical level — it answers "is there a beat at all". Under the same
resampling test it drifts only +17%/-24% in magnitude without ever changing quantity, and it catches
all six adversarial controls.

### `ioiEntropy` — demoted to reported-only (fails b and c)

No octave ambiguity, but **r = -0.63 with `onsetRate`** across the corpus: it is substantially a
readout of how many onsets the detector fired rather than of how varied the note durations are. It
also caught **0 of 6** controls (all three sat mid-band at 1.94-2.06 against a band of 0.964..3.324).
Still computed and reported as a descriptive statistic.

### `spectralCentroidVar` — demoted to reported-only (fails b)

**r = 0.710 with `spectralCentroidCV`** — the same measurement in Hz² rather than scale-free. Counting
both inflated every static-timbre fail count by one. `CV` is kept because it is the better
discriminator of the two on every control (control-a: CV -0.26 band-widths vs Var -0.08; control-c:
-0.19 vs -0.06) and because Hz² is scale-dependent. This is a deliberate departure from the original
metric list.

**Effect on the bar:** leave-one-out mean fail count fell from 2.26 to 1.89 and the worst genuine
track from 7 to 6, while the controls stayed at 9-13. The budget re-derived to the same value of 5,
so the margin between the best-scoring fake and the budget is **unchanged at 4**.

### `polyphony` — REBUILT, not retired (failed a). Seventh instrument in this repo to measure something other than its name

`polyphony` was the `voices` field of `noteSalience`. **That field cannot count voices**, and the
band shipped with it for five rounds. The defect was localised by an independent researcher who
built a per-block voice counter, ran it against controlled mixtures, rejected its own instrument at
**18% exact / mean error −0.90 voices**, and then found that its counter and this metric were the
same code path.

**The reported root cause was partly wrong, and reproducing it first is what showed that.** The
stated cause was bin quantisation collapsing adjacent semitones, with two reproductions: sines at
midi 60/64/67 returning 2 voices, and a 392 Hz sine producing *no candidate at all*.

| reproduction | claimed | measured |
|---|---|---|
| sines midi 60/64/67 | 2 voices | **2 voices — confirmed** |
| 392 Hz sine | no candidate | **one candidate, at midi 66** — a candidate is produced, mislabelled a semitone flat |

The second is not a missing candidate; it is a *wrong* one, and that distinction is the whole
mechanism. Instrumenting the salience curve directly:

```
sine midi 60 (261.6 Hz) — normalised salience
  58:0.3045  59:1.0000  60:1.0000  61:0.7644  62:0.0849
```

The response to **one** note is a **plateau 3–4 semitones wide**. Salience at semitone *m* is the
MAX magnitude over a quarter-tone bin range; at NC=4096 / 44.1 kHz a quarter-tone at midi 60 spans
15.2 Hz against a 10.8 Hz bin, `floor`/`ceil` widens that to 3–4 bins, and the Hann main lobe is
itself ~4 bins. Two consequences, both measured:

1. **Two notes closer than the plateau width produce one strict local maximum.** Sines at midi 64+67
   return **1** voice; the G is swallowed by the shoulder of the E. Voices are lost at exactly the
   intervals chords are built from.
2. **Which plateau member survives is arbitrary**, decided by leakage-level differences in the
   higher-harmonic terms rather than by which pitch is present — hence the mislabel.

**Raising NC does not fix it.** Swept on 102 controlled mixtures, shipped counter:

| NC | bin | window | exact | mean err | low register | wide-register (spread) |
|---:|---:|---:|---:|---:|---:|---:|
| 2048 | 21.5 Hz | 46 ms | 40% | +0.48 | 13% | 33% |
| **4096** | **10.8 Hz** | **93 ms** | **48%** | **−0.17** | **13%** | **43%** |
| 8192 | 5.4 Hz | 186 ms | 59% | −0.43 | 50% | 40% |
| 16384 | 2.7 Hz | 372 ms | 62% | −0.51 | 63% | 43% |
| 32768 | 1.3 Hz | 743 ms | 64% | −0.50 | 75% | **37%** |

Exactness plateaus at 64% for a 3.4x runtime cost, and the wide-register stratum gets **worse** — at
NC=32768 sharper resolution lands a bass note's true harmonics precisely on the `+12/+19/...`
suppression stencil and deletes genuine upper voices. Quarter-tone bands below ~400 Hz are the wrong
parameterisation because a semitone at 65 Hz is 3.9 Hz, which no window short enough to sit inside a
chiptune note can resolve; but the fix was never more FFT. **The grid had to be rebuilt.**

**What replaced it:** explicit spectral peaks with parabolic sub-bin interpolation, so a partial's
frequency is estimated to a few cents regardless of bin width; then iterative F0 selection with
harmonic cancellation of the partials an accepted F0 actually explains, instead of a flat 0.08 wipe
of a fixed semitone stencil. NC stays at **4096** — every other STFT #2 metric is untouched.

**SELF-CONSISTENCY (standing rule 7).** 612 controlled mixtures of known voice count, stratified over
voice count 1–5, four registers, chordal (≥3 semitones) vs wide (≥7) spacing, three dynamic balances
(flat / 6 dB / 12 dB) and six timbres. Parameters were chosen on 204 mixtures from two seeds; the
figures below are the **408 held out on four disjoint seeds**, and the analogous statistic to the
tempo audit's resampling check is the **response slope** — regress reading on truth, a true
instrument gives 1.000.

| | shipped | rebuilt |
|---|---:|---:|
| **response slope** (want 1.000) | **0.602** | **0.967** |
| exact match | 48% | **73%** |
| within ±1 voice | 81% | **92%** |
| mean abs error (voices) | 0.76 | **0.42** |
| mean reading at true 1 / 3 / 5 voices | 1.46 / 3.17 / 3.82 | 1.00 / 3.13 / 4.84 |

*(chiptune timbres, n=334; over all six timbres including pure sines, n=408: slope 0.581 → 0.925,
exact 49% → 73%.)*

A slope of 0.602 is **the same failure shape as the retired `tempoBpm` estimator**: it compressed a
true 1..5 voice span into a 1.46..3.82 reading, so most of what it reported was its own centre. That
is why the researcher's counter scored 18% and why "it is biased identically on corpus and Fixel" was
not a safe assumption to rest on — a metric with slope 0.6 is only two-thirds a voice counter.

**This is a counter with a known residual, not an exact one.** It still under-counts dense mixtures
(mean −0.9 voices at 5 simultaneous notes) and the low register remains the worst stratum (53% exact,
up from 26%). Wide-register mixtures spanning more than two octaves reach only 58%. Reported at 73%,
not claimed as solved.

**Cost:** 2.1x runtime on a 6-minute track (0.97 s → 2.08 s). The corpus band had to be re-derived,
and exactly one band row moved.

**Effect on the bar — nothing retracts.** See the re-verification section at the end of this file.

### `pitchClassEntropy` and `chromaChangeRate` — REBUILT (failed a). The same plateau, one layer down

The plateau that broke the voice count also mislabels pitch, and chroma is accumulated from accepted
notes only, so the wrong pitch class receives the mass. This was disclosed at the end of the
`polyphony` round and left unfixed; it is now fixed, and the disclosure itself needed correcting.

**FIRST, A CORRECTION TO MY OWN NUMBER.** The figures carried into `docs/BAR.md` as
"85% correct overall, 60% correct below 124 Hz" ~~85% / 60%~~ **included pure sine tones**, which no
chiptune waveform and no corpus track produces. Sines are the worst case for this defect because they
give the harmonic sum nothing to disambiguate with. Re-measured over 300 single notes:

| timbre set | overall label correct | below 124 Hz |
|---|---:|---:|
| ~~with sine (what was reported)~~ | ~~85%~~ | ~~60%~~ |
| chiptune timbres only (square/pulse/tri/saw) | **95%** | **73%** |
| sine alone | 47% | 8% |

That is the same mistake shape as the counter's sine stratum, made by the same author one round
later. **But the corrected label figure flatters, and the metric-relevant statistic is worse than
either number.** `pitchClassEntropy` is computed from chroma MASS, not from the top label, and the
mass includes every accepted peak. Measured on chiptune timbres at the shipped NC=4096:

| stratum | label correct | **chroma mass on the TRUE pitch class** |
|---|---:|---:|
| C2–B2 (65–124 Hz) | 73% | **45%** |
| C3–B3 | 100% | 95% |
| C4 and above | 100% | 100% |
| bass chords, 2–4 notes | — | **47–49%** |
| chords spread over 2+ octaves | — | 60–73% |

**`NC` was the promising lead, and it half-works.** Unlike the voice count, every chroma stratum
improves monotonically with NC, wide-register included — bass mass 45% → 96% at NC=8192, spread
chords 60% → 88% at 16384. The asymmetry has a mechanism, and it was tested rather than asserted:

| two sounding notes | NC=4096 | 8192 | 16384 | 32768 |
|---|---:|---:|---:|---:|
| octave pair (+12), voices (want 2) | 1.50 | 1.50 | 1.50 | 1.50 |
| octave pair, chroma mass on true class | 84% | **100%** | 100% | 100% |

Three of the seven suppression-stencil offsets — `+12`, `+24`, `+36` — are exactly ≡ 0 mod 12. **The
errors that resist NC are octave errors, and an octave is pitch-class-invariant.** Deleting an octave
costs the counter a voice permanently and costs chroma nothing, which is precisely why the cheap fix
that was unavailable to the counter is available here.

**But NC is not the fix, because it breaks the other gate.** A longer analysis window smears chord
boundaries, and `chromaChangeRate` is measured on 0.5 s blocks:

| config | window | `chromaChangeRate` slope (want 1.000) | intercept (want 0.00) |
|---|---:|---:|---:|
| **NC=4096 (shipped)** | 93 ms | 0.814 | **0.04** |
| NC=8192, hop held | 186 ms | 0.627 | **0.47** |
| NC=16384, hop held | 372 ms | 0.676 | **0.62** |
| NC=16384, hop scaled | 372 ms | 0.892 | 0.36 |

An intercept of 0.5 means a piece whose chords change every four seconds reads 0.46 changes/second —
it invents chord changes in music that has none. Raising NC buys pitch placement and sells
change-rate. **It was rejected for that reason, not adopted.**

**What replaced it:** chroma is now accumulated from the same interpolated-peak F0 set the rebuilt
voice counter already produces, at an unchanged NC=4096 and an unchanged 93 ms window. One estimator
now feeds `polyphony` and chroma, so the two cannot drift apart, and one F0 search per frame serves
both — the voice-count set is exactly the prefix of the chroma set, asserted under `--self-test`.

**SELF-CONSISTENCY (standing rule 7), held out from tuning.** Parameters were chosen on entropy seeds
3/11/29 and chord-rate seeds 7/21/99; the figures below use seeds 101/202/303/404 and 55/66/77/88,
which share nothing with those.

| | shipped | rebuilt |
|---|---:|---:|
| `pitchClassEntropy` slope / intercept, bass-heavy | 0.581 / 1.53 | **0.845 / 0.63** |
| `pitchClassEntropy` slope / intercept, full range | 0.675 / 1.17 | **0.907 / 0.34** |
| `pitchClassEntropy` slope / intercept, mid register | 0.932 / 0.29 | 0.922 / 0.28 |
| `chromaChangeRate` slope / intercept | 0.819 / 0.19 | **0.925 / 0.11** |

**The intercept is the damning number, not the slope.** The shipped detector read **1.0–1.26 bits of
pitch-class entropy for signals containing exactly ONE pitch class.** It manufactured entropy out of a
monotone. The rebuilt one reads 0.30–0.49. That is a reduced floor, **not an eliminated one**, and the
bass-heavy stratum still carries an intercept of 0.63. Reported, not claimed as solved.

Note the mid register barely moves (0.932 → 0.922, inside the noise at n=96). The whole of this fix
is in the bass and in wide-register chords; anything already above C4 was never broken.

**Two thresholds, and the second is measured not assumed.** The chroma path stops at `stopRel` 0.12
where the voice count stops at 0.17. Counting voices and distributing pitch-class mass are different
questions: a marginal voice flickering between frames costs the count nothing but flips the template
label of a 0.5 s block. Measured jointly on the tuning set, 0.17 buys entropy and sells change-rate;
**0.12 was the only value tried that beats the shipped detector on both.**

**BLAST RADIUS — five gating metrics move, not two.** The structural feature is 12 dimensions of
chroma plus 4 of band energy, so the self-similarity metrics ride on it. Measured across all 38
corpus tracks:

| metric | tracks changed | max abs delta |
|---|---:|---:|
| `pitchClassEntropy` | 38/38 | 0.650 |
| `chromaChangeRate` | 36/38 | 0.567 |
| `repeatStrength` | 38/38 | 0.276 |
| `novelFraction` | 38/38 | 0.274 |
| `noveltyPerSecond` | 31/38 | 0.095 |
| the other nine gating metrics | **0/38** | **byte-identical** |

`polyphony`, `stepFrac`, `leapFrac`, `bigLeapFrac`, `onsetRate`, `beatStrength`, both centroid
metrics and `silenceFraction` are bit-for-bit unchanged. The melodic line still rides the OLD peak
picker deliberately — correcting it would move three more gates that this round did not validate.

Only two of the five moved metrics were validated above, so the other three were tested against
**known sectional form** — pieces built from 1–4 distinct 4 s sections in known arrangements:

| | shipped chroma | rebuilt chroma |
|---|---:|---:|
| `repeatStrength` vs distinct-section count (want negative) | r = −0.687 | r = −0.621 |
| `novelFraction` vs distinct-section count (want positive) | r = 0.785 | r = 0.777 |

**At n=7 those differences are no result in either direction** — standing rule 10, and they favour
the old detector, so saying so costs me the cleaner story. The honest verdict is that the chroma
change neither demonstrably improves nor demonstrably breaks the three structural gates. The clearest
single case does improve: on a piece that is one section repeated eight times, `repeatStrength` goes
0.980 → 0.995 and `novelFraction` 0.025 → 0.000, both toward the correct extreme.

**Cost:** no runtime cost — one F0 search per frame now serves both consumers, so a 6-minute track
still takes 2.0x the original (0.97 s → 1.97 s), the same as after the `polyphony` round.

### `noveltyPerSecond` inverts on long loops — MEASURED, NOT FIXED, and it is not caused by the above

Found while validating the structural gates, present identically under both chroma detectors, and
therefore a pre-existing defect rather than a consequence of this change. One section, repeated
verbatim for 32 s. **True structural novelty is zero in every row.**

| loop period | `noveltyPerSecond` | in the corpus band 0.194 .. 0.350? |
|---:|---:|---|
| 1 s | 0.000 | no — below |
| 2 s | 0.000 | no — below |
| 3 s | 0.000 | no — below |
| **4 s** | **0.387** | above |
| **5 s** | **0.426** | above |
| **6 s** | **0.349** | **YES — passes** |
| **8 s** | **0.310** | **YES — passes** |

The step is at 4 s and `CFG.novHalfSec` is 2.0, so the checkerboard kernel is exactly 4 s wide: the
metric appears to fire on the loop boundary once the loop period reaches the kernel width. Where
structure genuinely exists the metric is excellent — against real section-boundary rate it scores
**r = 1.000 over six forms** — and then it inverts completely on the one case with no structure at all.

**The adversarial consequence is concrete.** `control-c-one-bar-loop` is caught by this gate only
because its loop is 2 s. **Lengthen that control's loop to 6 s and `noveltyPerSecond` flips from FAIL
to PASS**, while the piece remains exactly as structureless. `repeatStrength` (0.965–0.977 against a
band ceiling of 0.642) still catches it, so the bar as a whole holds — but this gate contributes
nothing against a long-loop fake and actively vouches for it. A `control-d-long-loop` belongs in
`corpus/controls/`. Not added this round: it is outside what was commissioned and it changes the
calibration set, which is the lead's call.

## The band

| Metric | p05 | p95 | median | min | max | Gates? |
|---|---:|---:|---:|---:|---:|:--|
| `onsetRate` | 4.584 | 9.591 | 6.921 | 0.817 | 10.517 | yes |
| `beatStrength` | 0.282 | 0.816 | 0.701 | 0.122 | 0.837 | yes |
| `pitchClassEntropy` | 2.821 | 3.438 | 3.291 | 2.630 | 3.470 | yes |
| `chromaChangeRate` | 0.735 | 1.624 | 1.170 | 0.704 | 1.654 | yes |
| `stepFrac` | 0.176 | 0.458 | 0.271 | 0.111 | 0.638 | yes |
| `leapFrac` | 0.295 | 0.552 | 0.420 | 0.084 | 0.590 | yes |
| `bigLeapFrac` | 0.064 | 0.502 | 0.287 | 0.014 | 0.518 | yes |
| `repeatStrength` | 0.177 | 0.709 | 0.392 | 0.168 | 0.793 | yes |
| `novelFraction` | 0.357 | 0.882 | 0.757 | 0.343 | 0.920 | yes |
| `spectralCentroidMean` | 2201.520 | 4670.696 | 3489.504 | 1284.874 | 5427.580 | yes |
| `spectralCentroidCV` | 0.125 | 0.558 | 0.218 | 0.109 | 0.975 | yes |
| `polyphony` | 2.456 | 5.971 | 4.390 | 1.892 | 6.170 | yes — **rebuilt, see below** |
| `silenceFraction` | 0.000 | 0.125 | 0.001 | 0.000 | 0.172 | yes |
| `noveltyPerSecond` | 0.171 | 0.385 | 0.275 | 0.155 | 0.394 | yes |
| `peakDbfs` | -5.523 | 0.000 | -1.215 | -6.668 | 0.000 | **no — limiter-fakeable** |
| `rmsDbfs` | -20.850 | -9.422 | -15.677 | -21.284 | -9.028 | **no — limiter-fakeable** |
| `crestFactorDb` | 9.422 | 17.203 | 14.277 | 9.028 | 18.170 | **no — limiter-fakeable** |

## Per-track measurements

Values are the median across each track's 30 s windows.

### Rhythm and pitch content

| Track | `onsetRate` | `beatStrength` | `pitchClassEntropy` | `chromaChangeRate` |
|---|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 4.617 | 0.122 | 3.470 | 1.117 |
| celestial-8bit-thing | 6.893 | 0.755 | 3.225 | 1.622 |
| celestial-pulsar | 9.538 | 0.651 | 2.838 | 1.304 |
| celestial-summer-sunday | 10.517 | 0.784 | 2.966 | 1.067 |
| centurion-delayed-chips | 6.560 | 0.727 | 3.422 | 1.347 |
| centurion-unstable-field | 7.133 | 0.726 | 3.045 | 1.083 |
| congus-lasso-lady | 7.971 | 0.646 | 3.370 | 1.291 |
| congus-napping-cloud | 6.433 | 0.735 | 2.722 | 0.950 |
| hydrogene-mechanical-complex | 7.875 | 0.753 | 3.465 | 1.174 |
| hydrogene-perilous-dungeon | 8.574 | 0.769 | 3.371 | 1.056 |
| junkala-adv-bossfight | 7.067 | 0.810 | 3.434 | 1.217 |
| junkala-adv-stage1 | 5.600 | 0.814 | 3.375 | 1.367 |
| junkala-level1 | 6.774 | 0.806 | 3.335 | 0.967 |
| junkala-level2 | 7.408 | 0.646 | 3.230 | 0.736 |
| junkala-level3 | 7.333 | 0.825 | 3.315 | 0.733 |
| junkala-title-screen | 6.204 | 0.710 | 3.108 | 1.295 |
| nene-theme-song-8bit | 6.950 | 0.747 | 3.261 | 0.867 |
| obscure-moon-chime | 4.400 | 0.307 | 3.298 | 1.317 |
| pmiller-nes-jazz | 6.172 | 0.690 | 2.932 | 1.163 |
| randommind-old-tower-inn | 6.567 | 0.735 | 3.143 | 1.433 |
| sketchy-boss | 8.417 | 0.577 | 3.308 | 1.433 |
| sketchy-mars | 6.184 | 0.518 | 2.630 | 0.704 |
| sketchy-mercury | 7.333 | 0.445 | 3.343 | 1.100 |
| sketchy-venus | 7.268 | 0.466 | 3.253 | 0.816 |
| skrjablin-c64-uptempo | 7.733 | 0.381 | 3.255 | 1.167 |
| springspring-great-boss | 7.383 | 0.567 | 3.327 | 1.350 |
| tinyworlds-happy-adventure | 8.246 | 0.657 | 3.025 | 1.132 |
| wolfgang-battle-loop | 9.889 | 0.837 | 3.099 | 1.011 |
| wolfgang-haunted-house | 6.377 | 0.747 | 3.043 | 1.654 |
| zane-100-victories | 6.133 | 0.610 | 3.312 | 1.267 |
| zane-aura-horizon | 0.817 | 0.142 | 3.288 | 0.900 |
| zane-dizzy-racing | 6.433 | 0.731 | 3.238 | 1.100 |
| zane-face-the-facts | 7.233 | 0.545 | 3.425 | 1.283 |
| zane-insect-factory | 5.700 | 0.743 | 3.295 | 1.633 |
| zane-poker-night | 6.567 | 0.745 | 3.335 | 1.300 |
| zane-sinister-abode | 5.333 | 0.693 | 3.418 | 1.100 |
| zane-space-cadet | 6.983 | 0.636 | 3.259 | 1.383 |
| zane-starlight-city | 5.900 | 0.537 | 3.362 | 1.367 |

### Melodic shape and structure

| Track | `stepFrac` | `leapFrac` | `bigLeapFrac` | `repeatStrength` | `novelFraction` | `noveltyPerSecond` |
|---|---:|---:|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 0.425 | 0.448 | 0.127 | 0.168 | 0.920 | 0.271 |
| celestial-8bit-thing | 0.278 | 0.524 | 0.198 | 0.793 | 0.350 | 0.394 |
| celestial-pulsar | 0.270 | 0.590 | 0.140 | 0.501 | 0.676 | 0.309 |
| celestial-summer-sunday | 0.397 | 0.084 | 0.518 | 0.695 | 0.358 | 0.310 |
| centurion-delayed-chips | 0.188 | 0.300 | 0.512 | 0.430 | 0.705 | 0.288 |
| centurion-unstable-field | 0.223 | 0.453 | 0.341 | 0.438 | 0.729 | 0.271 |
| congus-lasso-lady | 0.179 | 0.432 | 0.389 | 0.178 | 0.838 | 0.366 |
| congus-napping-cloud | 0.173 | 0.374 | 0.442 | 0.321 | 0.755 | 0.232 |
| hydrogene-mechanical-complex | 0.219 | 0.486 | 0.295 | 0.340 | 0.807 | 0.287 |
| hydrogene-perilous-dungeon | 0.219 | 0.486 | 0.281 | 0.269 | 0.780 | 0.252 |
| junkala-adv-bossfight | 0.385 | 0.455 | 0.160 | 0.255 | 0.879 | 0.252 |
| junkala-adv-stage1 | 0.246 | 0.547 | 0.207 | 0.253 | 0.790 | 0.232 |
| junkala-level1 | 0.400 | 0.543 | 0.071 | 0.384 | 0.730 | 0.349 |
| junkala-level2 | 0.405 | 0.327 | 0.135 | 0.431 | 0.761 | 0.194 |
| junkala-level3 | 0.632 | 0.344 | 0.096 | 0.399 | 0.832 | 0.232 |
| junkala-title-screen | 0.638 | 0.348 | 0.014 | 0.323 | 0.782 | 0.191 |
| nene-theme-song-8bit | 0.414 | 0.383 | 0.268 | 0.342 | 0.739 | 0.155 |
| obscure-moon-chime | 0.281 | 0.378 | 0.268 | 0.453 | 0.757 | 0.290 |
| pmiller-nes-jazz | 0.282 | 0.338 | 0.380 | 0.546 | 0.480 | 0.385 |
| randommind-old-tower-inn | 0.340 | 0.290 | 0.370 | 0.424 | 0.543 | 0.387 |
| sketchy-boss | 0.208 | 0.480 | 0.312 | 0.324 | 0.771 | 0.349 |
| sketchy-mars | 0.194 | 0.305 | 0.501 | 0.464 | 0.603 | 0.176 |
| sketchy-mercury | 0.307 | 0.548 | 0.146 | 0.466 | 0.753 | 0.155 |
| sketchy-venus | 0.111 | 0.513 | 0.376 | 0.792 | 0.343 | 0.278 |
| skrjablin-c64-uptempo | 0.269 | 0.552 | 0.179 | 0.219 | 0.757 | 0.271 |
| springspring-great-boss | 0.420 | 0.552 | 0.026 | 0.523 | 0.763 | 0.329 |
| tinyworlds-happy-adventure | 0.405 | 0.409 | 0.186 | 0.654 | 0.531 | 0.294 |
| wolfgang-battle-loop | 0.273 | 0.448 | 0.280 | 0.412 | 0.555 | 0.267 |
| wolfgang-haunted-house | 0.409 | 0.297 | 0.293 | 0.405 | 0.575 | 0.331 |
| zane-100-victories | 0.428 | 0.402 | 0.175 | 0.483 | 0.616 | 0.290 |
| zane-aura-horizon | 0.233 | 0.453 | 0.275 | 0.498 | 0.709 | 0.232 |
| zane-dizzy-racing | 0.311 | 0.323 | 0.323 | 0.270 | 0.875 | 0.232 |
| zane-face-the-facts | 0.233 | 0.345 | 0.437 | 0.170 | 0.898 | 0.310 |
| zane-insect-factory | 0.229 | 0.296 | 0.459 | 0.328 | 0.797 | 0.349 |
| zane-poker-night | 0.250 | 0.437 | 0.309 | 0.361 | 0.766 | 0.174 |
| zane-sinister-abode | 0.176 | 0.340 | 0.457 | 0.357 | 0.808 | 0.271 |
| zane-space-cadet | 0.196 | 0.463 | 0.341 | 0.272 | 0.876 | 0.271 |
| zane-starlight-city | 0.262 | 0.395 | 0.350 | 0.218 | 0.852 | 0.290 |

### Timbre, voices, silence

| Track | `spectralCentroidMean` | `spectralCentroidCV` | `polyphony` | `silenceFraction` |
|---|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 3383.8 | 0.149 | 5.443 | 0.003 |
| celestial-8bit-thing | 2330.3 | 0.540 | 2.303 | 0.172 |
| celestial-pulsar | 3605.0 | 0.308 | 3.166 | 0.003 |
| celestial-summer-sunday | 2895.7 | 0.124 | 3.415 | 0.001 |
| centurion-delayed-chips | 2752.3 | 0.265 | 4.192 | 0.000 |
| centurion-unstable-field | 3669.6 | 0.224 | 4.970 | 0.000 |
| congus-lasso-lady | 3480.4 | 0.355 | 4.428 | 0.003 |
| congus-napping-cloud | 1284.9 | 0.438 | 2.884 | 0.011 |
| hydrogene-mechanical-complex | 3181.5 | 0.213 | 3.990 | 0.000 |
| hydrogene-perilous-dungeon | 3505.7 | 0.142 | 4.827 | 0.000 |
| junkala-adv-bossfight | 3692.4 | 0.280 | 5.051 | 0.000 |
| junkala-adv-stage1 | 3516.7 | 0.321 | 3.665 | 0.000 |
| junkala-level1 | 4280.1 | 0.194 | 4.049 | 0.000 |
| junkala-level2 | 4416.7 | 0.195 | 4.352 | 0.000 |
| junkala-level3 | 4781.5 | 0.148 | 4.794 | 0.000 |
| junkala-title-screen | 4035.1 | 0.217 | 3.402 | 0.048 |
| nene-theme-song-8bit | 3498.6 | 0.444 | 5.138 | 0.000 |
| obscure-moon-chime | 3099.7 | 0.336 | 5.049 | 0.000 |
| pmiller-nes-jazz | 2743.5 | 0.264 | 2.800 | 0.050 |
| randommind-old-tower-inn | 4110.5 | 0.109 | 2.750 | 0.000 |
| sketchy-boss | 2673.8 | 0.156 | 5.279 | 0.001 |
| sketchy-mars | 3074.1 | 0.161 | 3.285 | 0.013 |
| sketchy-mercury | 2424.7 | 0.171 | 5.095 | 0.003 |
| sketchy-venus | 3424.3 | 0.222 | 4.946 | 0.005 |
| skrjablin-c64-uptempo | 3071.5 | 0.195 | 2.975 | 0.000 |
| springspring-great-boss | 4084.2 | 0.183 | 5.712 | 0.000 |
| tinyworlds-happy-adventure | 1471.9 | 0.975 | 2.483 | 0.000 |
| wolfgang-battle-loop | 3367.9 | 0.215 | 3.823 | 0.000 |
| wolfgang-haunted-house | 2547.7 | 0.458 | 1.892 | 0.141 |
| zane-100-victories | 3817.4 | 0.259 | 5.544 | 0.002 |
| zane-aura-horizon | 2336.1 | 0.192 | 5.964 | 0.000 |
| zane-dizzy-racing | 4534.5 | 0.125 | 6.012 | 0.000 |
| zane-face-the-facts | 4651.1 | 0.187 | 5.915 | 0.004 |
| zane-insect-factory | 3408.9 | 0.659 | 3.387 | 0.122 |
| zane-poker-night | 3705.8 | 0.520 | 4.197 | 0.030 |
| zane-sinister-abode | 5427.6 | 0.209 | 5.519 | 0.005 |
| zane-space-cadet | 4254.6 | 0.316 | 5.080 | 0.004 |
| zane-starlight-city | 4479.2 | 0.218 | 6.170 | 0.002 |

### Loudness — NON-GATING

A limiter and a gain stage set every column below to whatever you ask for. They gate nothing.

| Track | `peakDbfs` | `rmsDbfs` | `crestFactorDb` | duration (s) | 30 s windows |
|---|---:|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | -3.60 | -14.87 | 11.27 | 60.0 | 2 |
| celestial-8bit-thing | -5.13 | -18.07 | 12.94 | 29.6 | 1 |
| celestial-pulsar | -3.25 | -17.70 | 14.45 | 26.8 | 1 |
| celestial-summer-sunday | -3.64 | -19.73 | 16.09 | 64.2 | 2 |
| centurion-delayed-chips | -5.23 | -20.80 | 15.57 | 45.5 | 2 |
| centurion-unstable-field | -2.86 | -20.41 | 16.46 | 128.0 | 4 |
| congus-lasso-lady | -1.29 | -19.45 | 18.17 | 17.8 | 1 |
| congus-napping-cloud | -0.00 | -12.45 | 12.45 | 248.4 | 8 |
| hydrogene-mechanical-complex | -0.42 | -12.65 | 12.23 | 57.3 | 2 |
| hydrogene-perilous-dungeon | -0.68 | -13.50 | 12.83 | 76.1 | 3 |
| junkala-adv-bossfight | -0.00 | -14.17 | 14.17 | 71.8 | 2 |
| junkala-adv-stage1 | -0.08 | -14.15 | 14.08 | 41.2 | 1 |
| junkala-level1 | 0.00 | -9.04 | 9.04 | 80.4 | 3 |
| junkala-level2 | 0.00 | -9.03 | 9.03 | 80.4 | 3 |
| junkala-level3 | 0.00 | -9.49 | 9.49 | 91.1 | 3 |
| junkala-title-screen | 0.00 | -10.66 | 10.66 | 14.7 | 1 |
| nene-theme-song-8bit | -5.41 | -21.28 | 15.97 | 236.0 | 8 |
| obscure-moon-chime | 0.00 | -9.97 | 9.97 | 127.0 | 4 |
| pmiller-nes-jazz | -6.67 | -19.57 | 12.90 | 22.4 | 1 |
| randommind-old-tower-inn | -2.30 | -15.24 | 12.95 | 101.0 | 3 |
| sketchy-boss | -0.02 | -13.68 | 13.66 | 66.2 | 2 |
| sketchy-mars | -1.77 | -18.89 | 17.12 | 46.9 | 2 |
| sketchy-mercury | -1.15 | -16.24 | 15.10 | 40.4 | 1 |
| sketchy-venus | -3.13 | -17.59 | 14.45 | 25.7 | 1 |
| skrjablin-c64-uptempo | -1.29 | -13.08 | 11.79 | 152.6 | 5 |
| springspring-great-boss | -1.31 | -11.99 | 10.68 | 111.0 | 4 |
| tinyworlds-happy-adventure | -0.95 | -16.05 | 15.10 | 46.8 | 2 |
| wolfgang-battle-loop | -4.58 | -20.00 | 15.41 | 26.7 | 1 |
| wolfgang-haunted-house | -4.96 | -21.14 | 16.18 | 56.0 | 2 |
| zane-100-victories | 0.00 | -14.21 | 14.21 | 133.8 | 4 |
| zane-aura-horizon | -6.18 | -20.52 | 14.35 | 252.1 | 8 |
| zane-dizzy-racing | 0.00 | -12.77 | 12.77 | 136.5 | 5 |
| zane-face-the-facts | 0.00 | -14.68 | 14.68 | 130.6 | 4 |
| zane-insect-factory | -2.48 | -20.25 | 17.65 | 153.0 | 5 |
| zane-poker-night | -0.99 | -17.96 | 16.97 | 126.8 | 4 |
| zane-sinister-abode | 0.00 | -15.30 | 15.30 | 147.0 | 5 |
| zane-space-cadet | -0.78 | -17.14 | 16.36 | 73.0 | 2 |
| zane-starlight-city | -1.75 | -18.70 | 17.10 | 106.5 | 4 |

### Leave-one-out fail counts

Each track scored against a band built from the other 37. This is the distribution the
acceptance budget of 6 is derived from.

| Track | gating metrics out of band (of 14) |
|---|---:|
| celestial-8bit-thing | 6 |
| celestial-summer-sunday | 6 |
| 3xblast-pop-punk-1 | 5 |
| junkala-level3 | 4 |
| celestial-pulsar | 3 |
| congus-napping-cloud | 3 |
| randommind-old-tower-inn | 3 |
| sketchy-mars | 3 |
| sketchy-venus | 3 |
| tinyworlds-happy-adventure | 3 |
| wolfgang-haunted-house | 3 |
| zane-aura-horizon | 3 |
| zane-face-the-facts | 3 |
| zane-insect-factory | 3 |
| junkala-title-screen | 2 |
| obscure-moon-chime | 2 |
| springspring-great-boss | 2 |
| wolfgang-battle-loop | 2 |
| zane-dizzy-racing | 2 |
| zane-sinister-abode | 2 |
| centurion-delayed-chips | 1 |
| congus-lasso-lady | 1 |
| hydrogene-mechanical-complex | 1 |
| junkala-adv-bossfight | 1 |
| junkala-adv-stage1 | 1 |
| junkala-level1 | 1 |
| junkala-level2 | 1 |
| nene-theme-song-8bit | 1 |
| pmiller-nes-jazz | 1 |
| sketchy-mercury | 1 |
| skrjablin-c64-uptempo | 1 |
| zane-starlight-city | 1 |
| centurion-unstable-field | 0 |
| hydrogene-perilous-dungeon | 0 |
| sketchy-boss | 0 |
| zane-100-victories | 0 |
| zane-poker-night | 0 |
| zane-space-cadet | 0 |

## Calibration — do the metrics have teeth?

A band nobody has attacked is worthless. Three deliberately bad control signals are **generated in
code** (`node tools/audio-metrics.mjs --make-controls <dir>` — no samples, just oscillators), then
**mastered onto the corpus loudness centre** with ffmpeg, then scored.

| Control | What it is |
|---|---|
| **a** | a single sustained square-wave note, 90 s, no change of any kind |
| **b** | uniformly-random notes from a chromatic scale (3 octaves) at a fixed 8 notes/s |
| **c** | one 2-bar-per-loop C-major bar at 120 BPM, repeated verbatim for 90 s |

### The mastering

`tremolo=f=4:d=0.7, alimiter=level_in=1:limit=0.98:attack=5:release=50, volume=<g>dB`

Two variants of each control are emitted: one with **RMS placed dead centre** of the corpus
(-15.68 dBFS) and one with **peak placed dead centre** (-1.22 dBFS). Every loudness statistic is
therefore dead centre in at least one variant. Both variants are scored, and the verdicts match.

The tremolo is kept **even though it helps the fakes** — it hands control **a** a 4 Hz amplitude
envelope that lifts its `onsetRate` from 19.9/s to 4.87/s, squarely inside the band, and gives it a
tempo. Handing the adversary free metrics is the conservative choice.

**Crest factor could not be driven into the corpus band, and that is a measured result, not an
omission.** A constant-amplitude square oscillator has crest 0 dB by construction and a limiter can
only *reduce* crest. A sine tremolo tops out at 4.28 dB (the crest of a sine envelope). Stacking
tremolos or adding `compand` expansion buys crest only by going near-silent between peaks: measured,
5.71 dB crest costs `silenceFraction` 0.176 and 6.12 dB costs 0.240, both outside the corpus band of
0.000..0.125. Real music reaches 14 dB crest through millisecond transients inside otherwise loud
frames — that is a property of having drums, not of mastering. Crest is non-gating, so no verdict
depends on it.

### Result: all three controls FAIL, at every variant

| Control | variant | gating metrics out of band | budget | verdict |
|---|---|---:|---:|:--|
| control-a-sustained-square | peak dead centre | **13** | 6 | **FAIL** |
| control-a-sustained-square | RMS dead centre | **12** | 6 | **FAIL** |
| control-b-random-notes | peak dead centre | **10** | 6 | **FAIL** |
| control-b-random-notes | RMS dead centre | **10** | 6 | **FAIL** |
| control-c-one-bar-loop | peak dead centre | **9** | 6 | **FAIL** |
| control-c-one-bar-loop | RMS dead centre | **9** | 6 | **FAIL** |

For comparison, real corpus tracks average **1.97** out-of-band metrics (worst: 6).

### Which metric caught which control, and by how much

Signed distance is in band-widths: 0 means inside, negative means below `lo`, positive above `hi`.
Showing the RMS-dead-centre variant of each.

**control-a-sustained-square** — 12 of 14 out of band

| Metric | value | band | distance (band-widths) |
|---|---:|---|---:|
| `pitchClassEntropy` | 0.000 | 2.821 .. 3.438 | -4.57 |
| `leapFrac` | 0.000 | 0.295 .. 0.552 | -1.15 |
| `chromaChangeRate` | 0.000 | 0.735 .. 1.624 | -0.83 |
| `noveltyPerSecond` | 0.000 | 0.171 .. 0.385 | -0.80 |
| `spectralCentroidMean` | 6557.998 | 2201.520 .. 4670.696 | +0.76 |
| `novelFraction` | 0.007 | 0.357 .. 0.882 | -0.67 |
| `stepFrac` | 0.000 | 0.176 .. 0.458 | -0.62 |
| `repeatStrength` | 1.000 | 0.177 .. 0.709 | +0.55 |
| `polyphony` | 1.000 | 2.456 .. 5.971 | -0.41 |
| `beatStrength` | 0.964 | 0.282 .. 0.816 | +0.28 |
| `spectralCentroidCV` | 0.013 | 0.125 .. 0.558 | -0.26 |
| `bigLeapFrac` | 0.000 | 0.064 .. 0.502 | -0.15 |

**control-b-random-notes** — 10 of 14 out of band

| Metric | value | band | distance (band-widths) |
|---|---:|---|---:|
| `spectralCentroidMean` | 5979.850 | 2201.520 .. 4670.696 | +0.53 |
| `polyphony` | 1.288 | 2.456 .. 5.971 | -0.33 |
| `onsetRate` | 10.733 | 4.584 .. 9.591 | +0.23 |
| `repeatStrength` | 0.062 | 0.177 .. 0.709 | -0.22 |
| `pitchClassEntropy` | 3.568 | 2.821 .. 3.438 | +0.21 |
| `chromaChangeRate` | 1.800 | 0.735 .. 1.624 | +0.20 |
| `beatStrength` | 0.875 | 0.282 .. 0.816 | +0.11 |
| `novelFraction` | 0.908 | 0.357 .. 0.882 | +0.05 |
| `leapFrac` | 0.283 | 0.295 .. 0.552 | -0.05 |
| `bigLeapFrac` | 0.514 | 0.064 .. 0.502 | +0.03 |

**control-c-one-bar-loop** — 9 of 14 out of band

| Metric | value | band | distance (band-widths) |
|---|---:|---|---:|
| `pitchClassEntropy` | 2.036 | 2.821 .. 3.438 | -1.27 |
| `leapFrac` | 0.779 | 0.295 .. 0.552 | +0.89 |
| `noveltyPerSecond` | 0.000 | 0.171 .. 0.385 | -0.80 |
| `novelFraction` | 0.151 | 0.357 .. 0.882 | -0.39 |
| `repeatStrength` | 0.885 | 0.177 .. 0.709 | +0.33 |
| `chromaChangeRate` | 0.467 | 0.735 .. 1.624 | -0.30 |
| `beatStrength` | 0.948 | 0.282 .. 0.816 | +0.25 |
| `spectralCentroidCV` | 0.044 | 0.125 .. 0.558 | -0.19 |
| `bigLeapFrac` | 0.000 | 0.064 .. 0.502 | -0.15 |

## Where this band is still gameable

Stated bluntly, because a bar you cannot attack is a bar you do not understand.

**The load-bearing metrics are six**: `pitchClassEntropy`, `chromaChangeRate`, `repeatStrength`,
`novelFraction`, `noveltyPerSecond`, `polyphony`. Those six caught all three controls on both
mastering variants. If a future synth is tuned against this band, these are the ones doing the work.

> Read that as the six *collectively* covering all three controls, which is what the per-control
> tables show. Individually `polyphony` fails control-a and control-b and **passes control-c** at
> 2.873 against a lower edge of 2.456 — the one-bar loop has two real voices, so a working counter
> reads it correctly and correctly declines to object. It was never a three-for-three metric, before
> or after the rebuild.

**`onsetRate` and `beatStrength` are the weakest surviving gates.** Before mastering, the
sustained-square control scored `onsetRate` 19.93/s and `beatStrength` 0.95 with *no notes in it at
all* — a naive square oscillator's period jitters between 50 and 51 samples at 440 Hz, and that
broadband fizz peak-picks as a 20 Hz note stream. Four successive fixes (band-summed flux, relative
flux normalisation, an absolute floor, and a prominence test) reduced but did not remove this; what
finally caught it was the *upper* side of the two-sided band, i.e. 19.93/s is not a plausible note
rate. Then the mastering tremolo handed it a real 4 Hz envelope and `onsetRate` landed in band at
4.87. Treat these two as evidence that *something happens at a rate*, not that notes are played.
`beatStrength` additionally drifts +17%/-24% in magnitude under pure resampling — it reports one
quantity consistently, but not a precise one.

**`stepFrac` passed both the random-note and the one-bar-loop control.** Only `leapFrac` and
`bigLeapFrac` had teeth on the interval distribution. The melodic line is tracked as the highest
strong voice confined to a two-octave register around its own median; on dense polyphony it still
swaps voices, which is why the corpus `bigLeapFrac` band is wide (0.064..0.502).

**`silenceFraction` has never gated anything** — every control measured 0.000. It guards against dead
air, which is worth having, but it is not a music test and should not be counted as one.

**The margin over real music is real but not comfortable.** The worst genuine corpus track misses 6
metrics; the best-scoring fake misses 9. The budget sits at 6 (it was 5 before the chroma rebuild —
see the Acceptance rule). This band reliably rejects *crude*
fakes — a drone, a random-note generator, a single looped bar. A more competent fake (Markov-chain
melody over a ii-V-I with a genuine repeated 8-bar section and a couple of timbre changes) would
very plausibly land under the budget while still being bad music. **This is a floor, not a ceiling:
passing it means a synth is not obviously broken, not that it is good.**

**No tempo metric survives.** Nothing in this suite constrains how fast the music is. A synth can
emit anything from a crawl to a blur and no gate will notice, provided the onset *rate* stays in
4.58..9.59/s. Fixing that needs a beat tracker that passes the resampling self-consistency test in
the retirement section above, which the autocorrelation approach did not.

**Corpus monoculture.** All 38 tracks come from OpenGameArt, and two artists supply 15 of them
(Zane Little Music 9, Juhani Junkala 6). Band widths partly encode those artists' habits rather than
chiptune in general.

**Harmonic suppression assumes strong fundamentals.** ~~The salience grid suppresses accepted notes'
harmonics at +12/19/24/28/31/34/36 semitones, so a melody sitting exactly an octave or an
octave-plus-fifth above a bass note is suppressed and undercounted in `polyphony` and chroma.~~
**Still true for chroma; no longer the mechanism for `polyphony`,** which no longer uses the stencil
— see the rebuild above. What replaced it under-counts a true octave for a different and honest
reason: a note and its octave share every partial, so no single spectrum can separate them.

Measured on two-voice mixtures across six roots, four chiptune timbres and three dynamic balances,
correct-count rate on the stencil intervals `+12/19/24/28/31/34/36` (n=492) versus every other
interval from +1 to +18 (n=1224):

| | stencil intervals | other intervals |
|---|---:|---:|
| shipped counter | 37% | 51% |
| rebuilt counter | 62% | 87% |

Two things follow, and the first corrects a smaller probe of mine that pointed the other way. The
stencil intervals **were** genuinely the worse ones for the shipped counter (37% vs 51%), so
`HARMONIC_SHADOW` in `src/audio/theory.js` was aimed in the right direction — a single-configuration
probe at one root and one timbre said otherwise and was wrong, which is standing rule 8 collecting
again. But the stencil is a **weak predictor** of where voices were actually lost: `+12` scored 54%
while `+10`, `+13` and `+18` — none of them avoided — scored 35–40%. After the rebuild the
non-stencil intervals reach 87–100% and the residual loss concentrates in the true octave family,
which is a physical ambiguity rather than a grid artefact.

~~**Pitch LABELS are wrong in the bass, and this is NOT fixed.**~~ — **NOW FIXED**, and the figures
in this paragraph were wrong twice over. The table below measured five timbres *including pure
sines*, which no chiptune waveform produces; on chiptune timbres the label figures are 95% overall
and 73% below 124 Hz, not 85% and 60%. And the label statistic was the wrong statistic: chroma is
accumulated as MASS, and only **45%** of it landed on the true pitch class in the bass. The rebuilt
detector is described under "`pitchClassEntropy` and `chromaChangeRate` — REBUILT" above; the
numbers below are kept as the record of what the shipped detector did.

| register | ~~NC=4096 (shipped)~~ | NC=8192 | NC=16384 |
|---|---:|---:|---:|
| C2–B2 (65–124 Hz) | ~~**60%** correct~~ | 82% | 88% |
| C3–B3 (131–247 Hz) | ~~80%~~ | 87% | 98% |
| C4–B4 (262–494 Hz) | ~~87%~~ | 98% | 100% |
| C5–B5 (523–988 Hz) | ~~98%~~ | 100% | 100% |
| C6–B6 (1047+ Hz) | ~~100%~~ | 100% | 100% |
| **all** | ~~**85%**, mean error −0.19 semitones~~ | 93% | 97% |

The error was one-sided (always flat, never sharp) and confined below ~500 Hz. Raising NC would have
fixed the placement and broken `chromaChangeRate`; interpolated peaks fixed it at an unchanged
window. **Figures in this document for `pitchClassEntropy`, `chromaChangeRate`, `repeatStrength`,
`novelFraction` and `noveltyPerSecond` are now from the rebuilt detector.** The melodic-interval
gates `stepFrac`, `leapFrac` and `bigLeapFrac` still ride the OLD peak picker and are the remaining
consumers of the plateau — they are byte-identical to their pre-rebuild values and have not been
validated against known melodic content.


---

## Lead re-verification after the tempo audit

Gating set is now **14** (`tempoBpm`, `ioiEntropy`, `spectralCentroidVar` removed);
`peakDbfs`, `rmsDbfs`, `crestFactorDb` remain non-gating. Budget re-derived, still 5.

| | out of band (budget 5) | |
|---|---:|---|
| sustained square, peak-centred | 13 | FAIL |
| sustained square, rms-centred | 12 | FAIL |
| random notes, peak / rms | 9 / 9 | FAIL |
| one-bar loop, peak / rms | 9 / 9 | FAIL |
| 8 genuine CC0 tracks | 0, 1, 1, 2, 3, 4, 4, 4 | all PASS |

**Margin preserved: worst genuine 4, best fake 9.** Removing three gates did not
cost separation — which is the point, since they were not contributing any.

## Re-verification after the `polyphony` rebuild — NO PAST VERDICT MOVES

The question this had to answer was not "is the metric better" but "did any conclusion rest on the
broken one". The researcher's note that the bias applies to corpus and Fixel identically was a
reason to check, not a finding. Checked three ways, on all 38 corpus tracks and all 9 control
variants, with only the voice counter changed and NC held at 4096 so nothing else moves:

| | shipped `polyphony` | rebuilt `polyphony` | `polyphony` ABLATED (13 gates) |
|---|---:|---:|---:|
| budget (ceil p95 of LOO) | 5 | **5** | 4 |
| LOO mean fail count | 1.89 | **1.89** | 1.74 |
| worst genuine track (LOO) | 6 | **6** | 6 |
| corpus accepted | 37/38 | **37/38** | 37/38 |
| best-scoring fake | 9 | **9** | 8 |
| margin, worst genuine → best fake | 6 → 9 | **6 → 9** | 6 → 8 |
| control fail counts | 13,12,9,9,9,9,9,9,9 | **identical** | 12,11,8,8,9,9,9,9,9 |
| controls failing | 9 of 9 | **9 of 9** | 9 of 9 |

**(a) The controls still fail** — all nine variants, at identical fail counts.
**(b) The budget re-derives to 5.**
**(c) The margin survives** — worst genuine 6, best fake 9, unchanged.
**(d) Exactly one band row moved:** `polyphony` 2.951..4.929 → **2.456..5.971**. Every other gating
band is byte-identical, because the rebuild touches nothing else.

**The ablation column is the load-bearing one.** It does not depend on the rebuilt counter being
right: it asks what survives if `polyphony` is worth *nothing at all*. Answer — all nine controls
still fail, by 4 to 8 metrics clear of a budget of 4. So the bar's teeth were never imaginary; the
worst case for this defect was already covered by the other thirteen gates.

**What IS retracted:** the two band-width distances. `polyphony` caught the sustained square at
**−0.41** band-widths, not −0.99, and the random-note control at **−0.33**, not −0.68 — the rebuilt
corpus spread is 78% wider (1.978 → 3.515 band-width units), so the same catch is a smaller fraction
of it. Both are struck through in the tables above. The *claim* those numbers supported — that
`polyphony` is one of the six load-bearing gates catching all three controls on both mastering
variants — **still holds**: it fails control-a and control-b and, as before, passes control-c.

Two honest caveats on this section. The corpus is still 38 OpenGameArt tracks with two artists
supplying 15, so these band widths still partly encode those artists' habits. And a re-derive is not
an independent test: the corpus defined the band it is being scored against, which is why the
leave-one-out column rather than the raw fail count is the number to read.

## Re-verification after the chroma rebuild — NO PAST CONCLUSION MOVES, AND THE GATE IS ONE NOTCH LOOSER

Same three-way check as the `polyphony` round, on all 38 corpus tracks and all 9 control variants.

| | before chroma rebuild | after | `pitchClassEntropy` ABLATED | `chromaChangeRate` ABLATED | BOTH ABLATED | ALL FIVE chroma-fed gates ABLATED |
|---|---:|---:|---:|---:|---:|---:|
| gates | 14 | 14 | 13 | 13 | 12 | 9 |
| budget | 5 | **6** | 5 | 5 | 5 | 4 |
| LOO mean | 1.89 | 1.97 | 1.82 | 1.82 | 1.66 | 1.24 |
| worst genuine (LOO) | 6 | 6 | 6 | 6 | 6 | 5 |
| corpus accepted | 37/38 | 38/38 | 36/38 | 37/38 | 37/38 | 37/38 |
| best-scoring fake | 9 | 9 | 8 | 8 | 7 | 5 |
| controls failing | 9/9 | **9/9** | 9/9 | 9/9 | 9/9 | 9/9 |
| fake's clearance over budget | 4 | **3** | 3 | 3 | 2 | 1 |
| worst-genuine → best-fake gap | 3 | 3 | 2 | 2 | 1 | **0** |

**(a) The controls still fail** — all nine variants, and two of them fail *harder*: control-b and
control-c each pick up one more out-of-band metric because the corrected chroma places their pitch
classes properly.
**(b) The budget does NOT hold at 5. It re-derives to 6.** Stated as a cost above, not buried here.
**(c) The margin survives but narrows.** Worst genuine 6, best fake 9, gap unchanged at 3 — but the
budget moved under it, so the fake's clearance fell 4 → 3.
**(d) Nothing is retracted.** The band rows and per-track values for five metrics are re-derived
above, and the ablation column shows the direction of every conclusion is unchanged.

**The last column is the disclosure that matters.** With all five chroma-fed gates worth nothing, the
nine controls still fail — but **worst-genuine and best-fake both sit at 5, a gap of zero.** The
chroma-derived metrics collectively carry the separation between real music and these fakes. The bar
does not survive their loss with any headroom at all; it survives it only because the budget
re-derives downward at the same time. That is a much thinner dependency than the `polyphony` ablation
showed, and it is the strongest argument in this document for getting chroma right.

### The two conclusions that were flagged as resting on chroma — neither does

**1. The chord-vocabulary refutation at 2.771.** It does not rest on the chroma detector, and the
`HARMONIC_SHADOW` magnitude figures do not either: `docs/BAR.md` records them as measured *on the
symbolic score*, i.e. counted from the composed notes, not detected from audio. **A detector that is
45% right in the bass cannot have influenced a number that never went through the detector.**

Measured anyway, three ways, over all 31 progressions in `PROGRESSIONS`, rendered as block chords
over a bass root. "Hot" means above the `pitchClassEntropy` p95:

| method | n | min | median | mean | max | **above the p95** |
|---|---:|---:|---:|---:|---:|---:|
| symbolic, from the score | 31 | 2.449 | 2.700 | 2.717 | 2.931 | **0** |
| audio, shipped detector | 31 | 2.621 | 2.874 | 2.855 | 3.049 | **0** |
| audio, rebuilt detector | 31 | 2.564 | 2.904 | 2.886 | 3.117 | **0** |

The quoted 2.771 sits inside the symbolic range and near its mean, which is consistent with a
symbolic derivation. Under the rebuilt detector the vocabulary reads slightly *higher* — mean 2.886
against 2.855 — and the worst single progression reaches 3.117, still 0.32 band-widths below the
ceiling. **The refutation stands on all three methods with no progression anywhere near hot.**

> ~~"the chord vocabulary sits at 2.771 — comfortably inside the band"~~ — **the verdict stands, the
> word does not.** Against the band as it stood, 2.771 was **0.0018 BELOW the p05 edge of 2.7728** —
> marginally *outside*, on the low side, at −0.0035 band-widths. Under standing rule 10 a margin that
> size is no result in either direction, so the correct statement is that the vocabulary sits *on* the
> bottom edge of the band and a full band-width below the top. What the refutation needed was the
> distance from the TOP, and that was never in doubt.

**2. The `HARMONIC_SHADOW` removal.** Its justification — fired on 87% of harmony notes, achieved its
purpose on 17% of those — is symbolic, so the chroma correction cannot touch it. The removal stands
on exactly the grounds it was made.

## THE GAP THIS OPENS — carry it into every audio verdict

**No tempo metric survives. Nothing in the suite constrains how fast the music
is.** A synth can emit a crawl or a blur unnoticed, provided `onsetRate` stays
inside 4.58-9.59 onsets/sec.

This bears directly on the synth, whose range is 140-172 BPM: **that range is now
UNGATED.** Its correctness rests on musical judgement alone and must be stated in
any report as an *assumption*, never implied to have passed a check.

Restoring a tempo gate requires an accent-aware beat tracker that passes the
**resampling self-consistency test** — transform by a known factor, confirm the
reading scales — *before* it is given a gate. The previous attempt passed every
plausibility check and still failed that one at 6 of 24.

## The inversion failure, confirmed analytically by the lead

The synth builder reported that its adversarial controls PASS — including one
bar repeated verbatim for 60 seconds — and gave the arithmetic: too few of the
14 gating metrics can respond to verbatim repetition for a loop to exceed a
budget of 5.

I tested it and initially appeared to contradict it, then found my own
instrument was contaminating the result. Both halves are worth recording.

**My test:** spliced a 1.4545 s bar out of the synth's own 165 BPM output with
ffmpeg and concatenated it 42 times. Result: **FAIL at 6** — caught, but by one.

**Why that was wrong:** the splice manufactures a hard transient every 1.45 s.
Metric-by-metric against the unlooped synth:

| metric | synth | loop | delta |
|---|---:|---:|---:|
| `repeatStrength` | 0.425 | 0.984 | **+131.5%** |
| `novelFraction` | 0.716 | 0.011 | **-98.5%** |
| `noveltyPerSecond` | 0.329 | 0.077 | **-76.6%** |
| `stepFrac` | 0.254 | 0.118 | -53.5% |
| `spectralCentroidCV` | 0.213 | 0.134 | -37.1% |
| `leapFrac` | 0.590 | 0.764 | +29.5% |
| `beatStrength` | 0.773 | 0.867 | **+12.2%  <- my splice** |
| `polyphony` | 4.608 | 4.633 | +0.5% |
| `silenceFraction` | 0.000 | 0.000 | 0.0% |

`beatStrength` is the sixth out-of-band metric and it moved because a periodic
splice discontinuity *is* a periodic onset. **Remove the splice artefact and a
verbatim loop lands at exactly 5 against a budget of 5 — it passes, with zero
margin.**

> **This section needs re-measuring, and the two things that moved both point the
> wrong way.** The budget is now **6**, not 5, so "lands at exactly 5 against a
> budget of 5" is now a pass with one metric to spare rather than zero. And
> `noveltyPerSecond` — one of the gates a verbatim loop is supposed to fail — is
> measured above to stop catching loops once the loop period reaches the 4 s
> novelty kernel. Scored end to end against this band, verbatim loops of a single
> rendered section are caught by `noveltyPerSecond` at periods of 1, 2, 3, 4 and
> 5 s and **not caught at 6 s or 8 s**. A loop longer than the kernel therefore
> loses one of the few gates that responds to verbatim repetition at all.
>
> Not re-run against the synth here: its output has been substantially rewritten
> this round, so the 1.4545 s splice experiment above cannot be reproduced, and
> driving the synth is not the bar owner's to do. The synthetic loops used for
> the `noveltyPerSecond` measurement fail 10-12 gates on unrelated grounds — they
> are single-instrument sketches — so they are evidence about `noveltyPerSecond`
> and about nothing else. **The inversion claim stands unrefuted and is now
> likelier, not less likely, to hold.** The builder's symbolically-generated loop, which has no splice, is the
clean test and its PASS stands.

**Conclusion: the audio fail-count does not discriminate music from a verbatim
loop of music.** Only three metrics respond to repetition with real force, and
the budget is 5. It rejects a drone and a random walk; that is a floor, not a
score. The synth's own 1.50 mean must not be reported as a pass — it ranks
*above* genuine chiptune's 1.89, which is the same centrality signature that
retired the pixel band: a generator sitting near the middle of every interval
scores well precisely by being unremarkable.

**Third instrument-contamination catch in this project**, after WSOLA
manufacturing transients in the resampling test and the duty fit querying
harmonics the band-limiter never rendered. In all three the agent caught its own
instrument instead of shipping the number.
