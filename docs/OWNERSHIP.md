# Ownership — who may write what

**Git now exists** (local commits only — do not push). Commit before any
destructive edit; that is the undo. This file exists because for the first two
rounds there was no version control and concurrent writers clobbered each other
irrecoverably. The ownership rules stay: git makes a clobber *recoverable*, it
does not make concurrent writes to one file *correct*.

## The incident

Two builders were writing `src/gen/**` at the same time. The identical seed,
rendered ten minutes apart, produced different pixels:

```
palette 16400 -> 16677    sha 110bd555 -> 84b43867
outline.run1Share 0.4979 -> 0.7845    slope.corrDx0Share 0.1876 -> 0.2575
```

The generator was deterministic throughout. **The generator was not the same
generator.** Nothing in the process could tell those two situations apart, and
they need opposite fixes. Roughly half an hour of measurements had to be
discarded. The `box()` guard in `src/gen/draw.js` was demonstrably written at
least twice by different hands, and at least one of those writes was lost.

This is the same shape as the shared-scratchpad race in `docs/HARNESS.md`, where
concurrent judges overwrote each other's working crops — mutable state shared by
concurrent agents, with no way to detect a torn read after the fact. It has now
cost us twice.

## The table

| path | owner | notes |
|---|---|---|
| `src/gen/**`, `tools/render.mjs` | **the generator builder** (one agent, at any time exactly one) | sole writer; ownership is granted by the lead, never claimed |
| `src/core/**` | the lead | projection, canvas, rng, png — changing these moves every metric at once |
| `tools/metrics.mjs`, `tools/budget.mjs`, `tools/variety.mjs`, `docs/band-*.json`, `docs/budget-*.json` | **the metrics builder** | a band that moves under a measurement is the bug we are fixing |
| `tools/duel.mjs`, `tools/page.mjs`, `tools/treehash.mjs`, `tools/crop.mjs`, `tools/verify.mjs` | the lead | the harness must not be edited by anyone it judges |
| `docs/ROUNDS.md`, `docs/HARNESS.md`, `docs/JUDGE-PROMPT.md`, `docs/DIFF.md`, `docs/CRAFT.md`, `docs/OWNERSHIP.md` | the lead | the record of what happened |
| `src/audio/**` | **the synth builder** | the engine. May NOT touch the bar it is measured against |
| `corpus/**`, `tools/audio-metrics.mjs`, `tools/calibrate-audio-band.mjs`, `docs/AUDIO-MEASURED.md`, `docs/band-audio-v1.json` | **the audio-bar owner** | the bar. Frozen while a synth is being measured against it |

A builder needing a change outside its own files messages the lead with the
exact change. It does not make it "just this once".

Critics and judges write **only** to their own scratch directory. They never
write into the repo.

## The two audio domains are deliberately separate

`src/audio/**` (the synth) and the audio bar (`tools/audio-metrics.mjs`,
`docs/band-audio-v1.json`, `corpus/**`) have **different owners, and the synth
builder may not write the bar.** This is not bureaucracy. A builder that can
edit the metric it is judged by will eventually widen a band rather than fix a
tune, and it will do so honestly, believing the band was wrong. The pixel side
already lost a whole scoring framework to a subtler version of this — see
`docs/DIFF.md` section 3, where a generator tuned against a band ended up beating
a genuine artwork on it.

`src/gen/**` and `src/audio/**` are independent and may run in parallel.

## The rules that came out of it

1. **One writer per path, always.** Ownership is assigned by the lead. An agent
   cannot grant itself exclusive ownership, though asking for it is correct.
2. **A metric without a tree digest is not evidence.** `tools/treehash.mjs`
   digests every file that can change a rendered pixel. Quote it beside any
   number you report.
3. **Measurements are bracketed.** `tools/verify.mjs` records the digest before
   and after and exits 2 on a mismatch — a torn run is void, not a data point.
   `tools/duel.mjs` refuses to build a round whose source moved mid-render, and
   stamps the surviving digest into the key file.
4. **Snapshot before destructive edits.** There is no undo.
5. **Never optimise one band while breaking two others.** A builder that buys
   its assigned metric at the cost of two unassigned ones is the pixel-side twin
   of the biased judge brief in `docs/JUDGE-PROMPT.md`: it wins the thing being
   measured and loses the thing that matters. Critics check the whole hard-fail
   list, not the metric the builder was given.
6. **A correct artefact that reads out of band is REPORTED out of band.**
   Never bend the artefact to fit a metric you have just shown measures the
   wrong thing. Worked example: the synth builder found that `tempoBpm` locks
   to the **bar** rather than the beat on dense music, so a genuine 140-172 BPM
   track reports as 35-43. Measured across the corpus, the readings fall into
   three clusters — bar-rate (32.5-44.9), half-bar (63.8-77.4) and true
   beat-rate (117.5, 161.5). The band "32.5-142.9 BPM" is therefore not a band
   of tempi at all but a mixture of three different quantities, which is exactly
   why it was wide enough to admit a sustained square wave.

   The right response was to keep the music correct and report the metric as
   broken. This is also **why the synth builder may not edit the bar**: a
   builder who could widen the band might have done so in good faith, and the
   defect would have been buried instead of found. The separation paid for
   itself the first time it was tested.

7. **PLAUSIBILITY IS NOT EVIDENCE.** A fix that makes the numbers look right is
   not a fix. Before a metric is given a gate, it must pass a
   *self-consistency* test: transform the input by a known factor and confirm
   the reading scales by that factor.

   Worked example, and it cost two agents to learn. `tempoBpm` was diagnosed as
   locking to the bar rather than the beat. The obvious fix — harmonic-sum
   salience over a canonical 90-180 BPM octave — was proposed independently by
   two of us, built, and **looked fixed**: the absurd 32.5 BPM readings vanished
   and beat-to-onset-interval ratios moved from 14.4 to a coherent 2-4
   corpus-wide. A ground-truth check then exposed a 3:2 hemiola error (150 BPM
   read as 99.4), which a second refinement fixed.

   Then someone resampled real tracks by known factors and checked the reading
   scaled. **It scored 6 of 24**, and the failures were systematic: one track
   read 105.5 BPM at both 1.0x and 1.25x, another 120.2 at both 1.0x and 1.5x.
   **The estimator was returning the centre of its own search window.** The
   octave fix made the numbers look right while the metric still measured its
   own search range.

   Second-order lesson from the same audit: **control the test instrument
   before trusting the test.** The first resampling run used ffmpeg's `atempo`,
   which is WSOLA and manufactures transients — `onsetRate` came out at 126-134%
   of expected at 0.8x. Pure resampling via `asetrate` preserves onset structure
   (94-105%). The confounded run was discarded and redone.

8. **THE GENERATOR IS A DISTRIBUTION, NOT AN ARTEFACT.** Any number measured on
   fewer than about six seeds carries its range, or it does not appear. This
   project has now made the same error repeatedly: a seed-varying quantity
   characterised from one or two renders and stated one notch stronger than the
   data supports. Ink closure was quoted as "4.94, level with Lufthansa" from a
   single seed when the six-seed median is 5.17 and only two of six beat
   Lufthansa.

   **Corollary: match the statistic to how the artefact is judged.** The duel
   shows judges 320x320 crops, so a whole-image mean is the wrong summary.
   `darkShare` reads 16.57-19.53% whole-image with nothing over the 19.56%
   ceiling, while per-crop it reaches 20.43% and 29.24%. Averaging over the
   frame dilutes precisely the local concentration a judge sees.

9. **TEST INDEPENDENCE BEFORE TREATING SHARED STRUCTURE AS EVIDENCE.** Sits
   next to "plausibility is not evidence" and has the same shape.

   The leak control's strongest argument was "36 exact RGB triples shared across
   all four images, carrying 29-53% of pixels" — overwhelming evidence of a
   fixed palette *if the four images are independent artworks*. They were four
   crops of one file, where it is a tautology. The assumption was never stated
   and never tested, and it was load-bearing.

   The disconfirming evidence was already in hand and got read as noise: that
   side's pairwise palette intersections were wildly uneven (170, 74, 76, 90,
   128, 81) with reuse spanning 31.7-65.8% — the signature of crops covering
   different regions of one picture, not a generator emitting from a stable
   palette. A stable-palette generator would show *flat* intersections.

10. **BINARY VERDICTS AT SMALL n ARE NOT FINDINGS.** Record the MARGIN with the
    sample count attached. **A margin under ~0.02 at n=4 is no result in either
    direction** — including when it favours us.

    "SEP vs closed", "PASS 4/4", "FAIL 4/4", "separates 4/4" all discard the
    margin, and on four samples a bare verdict carries almost no information.
    A control retracted its own "K=128 still separates 4/4, CLEANLY": true for
    one implementation at a margin of +0.065, false for another where the same
    4/4 verdict rested on +0.0077, and a third on **+0.0028** — three
    thousandths, in a quantity ranging over tenths, one sample from closing.

    Some of this project's binary summaries ARE categorical and stay: the
    un-normalised cube-corner leak is 4/4 present vs 4/4 absent with infinite
    margin; the round-3 duel is 8 confident judges agreeing. Others were thin
    verdicts dressed as facts — see the round-3 variety retraction below.

11. **Never report a PASS count as progress.** Leave-one-out shows an all-pass
   gate rejects 84% of the reference's own crops, and seven of the sixty metrics
   correlate at r=1.0000. 36 vs 35 PASS is noise; the direction of a specific
   hard fail is the signal.

## Known casualty

Round r2's duel crops were rendered during the incident, so they correspond to a
tree state nobody recorded. The pixels are real and the judges' verdicts about
those pixels are valid, but **the r2 scenes cannot be re-rendered**, so a losing
pair cannot be re-examined after a fix. `tools/duel.mjs` now prevents this.
