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

A track PASSES if **at most 5 of the 14 gating metrics** fall outside their p05..p95 band.

The budget is not a guess; it is the p95 of the leave-one-out fail-count distribution of the corpus
against itself. Demanding all 14 metrics be in band is the wrong gate and the corpus proves it: with
14 two-sided p05..p95 bands a track is expected to miss ~1.7 by construction, and measured
leave-one-out only **5 of 38** genuine CC0 chiptunes clear all 14. Mean leave-one-out failures per
real track: **1.89**, max **6**. At a budget of 5, **37 of 38** real tracks are accepted.

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

## The band

| Metric | p05 | p95 | median | min | max | Gates? |
|---|---:|---:|---:|---:|---:|:--|
| `onsetRate` | 4.584 | 9.591 | 6.921 | 0.817 | 10.517 | yes |
| `beatStrength` | 0.282 | 0.816 | 0.701 | 0.122 | 0.837 | yes |
| `pitchClassEntropy` | 2.773 | 3.301 | 3.119 | 2.637 | 3.371 | yes |
| `chromaChangeRate` | 0.990 | 1.576 | 1.330 | 0.833 | 1.602 | yes |
| `stepFrac` | 0.176 | 0.458 | 0.271 | 0.111 | 0.638 | yes |
| `leapFrac` | 0.295 | 0.552 | 0.420 | 0.084 | 0.590 | yes |
| `bigLeapFrac` | 0.064 | 0.502 | 0.287 | 0.014 | 0.518 | yes |
| `repeatStrength` | 0.154 | 0.642 | 0.321 | 0.117 | 0.782 | yes |
| `novelFraction` | 0.503 | 0.929 | 0.810 | 0.397 | 0.963 | yes |
| `spectralCentroidMean` | 2201.520 | 4670.696 | 3489.504 | 1284.874 | 5427.580 | yes |
| `spectralCentroidCV` | 0.125 | 0.558 | 0.218 | 0.109 | 0.975 | yes |
| `polyphony` | 2.951 | 4.929 | 4.206 | 2.860 | 5.414 | yes |
| `silenceFraction` | 0.000 | 0.125 | 0.001 | 0.000 | 0.172 | yes |
| `noveltyPerSecond` | 0.194 | 0.350 | 0.288 | 0.174 | 0.366 | yes |
| `peakDbfs` | -5.523 | 0.000 | -1.215 | -6.668 | 0.000 | **no — limiter-fakeable** |
| `rmsDbfs` | -20.850 | -9.422 | -15.677 | -21.284 | -9.028 | **no — limiter-fakeable** |
| `crestFactorDb` | 9.422 | 17.203 | 14.277 | 9.028 | 18.170 | **no — limiter-fakeable** |

## Per-track measurements

Values are the median across each track's 30 s windows.

### Rhythm and pitch content

| Track | `onsetRate` | `beatStrength` | `pitchClassEntropy` | `chromaChangeRate` |
|---|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 4.617 | 0.122 | 3.245 | 1.233 |
| celestial-8bit-thing | 6.893 | 0.755 | 2.953 | 1.216 |
| celestial-pulsar | 9.538 | 0.651 | 2.999 | 1.379 |
| celestial-summer-sunday | 10.517 | 0.784 | 2.873 | 1.133 |
| centurion-delayed-chips | 6.560 | 0.727 | 3.272 | 1.327 |
| centurion-unstable-field | 7.133 | 0.726 | 3.221 | 1.333 |
| congus-lasso-lady | 7.971 | 0.646 | 3.147 | 1.572 |
| congus-napping-cloud | 6.433 | 0.735 | 3.204 | 1.383 |
| hydrogene-mechanical-complex | 7.875 | 0.753 | 3.362 | 1.362 |
| hydrogene-perilous-dungeon | 8.574 | 0.769 | 3.213 | 1.067 |
| junkala-adv-bossfight | 7.067 | 0.810 | 3.072 | 1.300 |
| junkala-adv-stage1 | 5.600 | 0.814 | 2.992 | 1.267 |
| junkala-level1 | 6.774 | 0.806 | 2.786 | 0.833 |
| junkala-level2 | 7.408 | 0.646 | 2.954 | 1.000 |
| junkala-level3 | 7.333 | 0.825 | 2.928 | 1.000 |
| junkala-title-screen | 6.204 | 0.710 | 2.933 | 1.432 |
| nene-theme-song-8bit | 6.950 | 0.747 | 3.130 | 1.433 |
| obscure-moon-chime | 4.400 | 0.307 | 3.177 | 1.183 |
| pmiller-nes-jazz | 6.172 | 0.690 | 2.964 | 1.476 |
| randommind-old-tower-inn | 6.567 | 0.735 | 3.371 | 1.533 |
| sketchy-boss | 8.417 | 0.577 | 3.067 | 1.433 |
| sketchy-mars | 6.184 | 0.518 | 2.699 | 1.061 |
| sketchy-mercury | 7.333 | 0.445 | 3.084 | 1.300 |
| sketchy-venus | 7.268 | 0.466 | 3.083 | 1.205 |
| skrjablin-c64-uptempo | 7.733 | 0.381 | 3.290 | 1.467 |
| springspring-great-boss | 7.383 | 0.567 | 3.117 | 1.195 |
| tinyworlds-happy-adventure | 8.246 | 0.657 | 3.127 | 1.267 |
| wolfgang-battle-loop | 9.889 | 0.837 | 3.198 | 1.236 |
| wolfgang-haunted-house | 6.377 | 0.747 | 3.196 | 1.602 |
| zane-100-victories | 6.133 | 0.610 | 3.060 | 1.367 |
| zane-aura-horizon | 0.817 | 0.142 | 2.637 | 0.933 |
| zane-dizzy-racing | 6.433 | 0.731 | 3.241 | 1.433 |
| zane-face-the-facts | 7.233 | 0.545 | 3.113 | 1.183 |
| zane-insect-factory | 5.700 | 0.743 | 2.827 | 1.600 |
| zane-poker-night | 6.567 | 0.745 | 3.122 | 1.467 |
| zane-sinister-abode | 5.333 | 0.693 | 3.228 | 1.567 |
| zane-space-cadet | 6.983 | 0.636 | 3.147 | 1.383 |
| zane-starlight-city | 5.900 | 0.537 | 3.263 | 1.461 |

### Melodic shape and structure

| Track | `stepFrac` | `leapFrac` | `bigLeapFrac` | `repeatStrength` | `novelFraction` | `noveltyPerSecond` |
|---|---:|---:|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 0.425 | 0.448 | 0.127 | 0.117 | 0.963 | 0.252 |
| celestial-8bit-thing | 0.278 | 0.524 | 0.198 | 0.782 | 0.397 | 0.355 |
| celestial-pulsar | 0.270 | 0.590 | 0.140 | 0.350 | 0.659 | 0.265 |
| celestial-summer-sunday | 0.397 | 0.084 | 0.518 | 0.639 | 0.507 | 0.329 |
| centurion-delayed-chips | 0.188 | 0.300 | 0.512 | 0.450 | 0.644 | 0.333 |
| centurion-unstable-field | 0.223 | 0.453 | 0.341 | 0.420 | 0.742 | 0.290 |
| congus-lasso-lady | 0.179 | 0.432 | 0.389 | 0.169 | 0.880 | 0.366 |
| congus-napping-cloud | 0.173 | 0.374 | 0.442 | 0.234 | 0.845 | 0.271 |
| hydrogene-mechanical-complex | 0.219 | 0.486 | 0.295 | 0.155 | 0.902 | 0.266 |
| hydrogene-perilous-dungeon | 0.219 | 0.486 | 0.281 | 0.226 | 0.859 | 0.232 |
| junkala-adv-bossfight | 0.385 | 0.455 | 0.160 | 0.147 | 0.934 | 0.310 |
| junkala-adv-stage1 | 0.246 | 0.547 | 0.207 | 0.280 | 0.823 | 0.310 |
| junkala-level1 | 0.400 | 0.543 | 0.071 | 0.274 | 0.817 | 0.309 |
| junkala-level2 | 0.405 | 0.327 | 0.135 | 0.305 | 0.897 | 0.194 |
| junkala-level3 | 0.632 | 0.344 | 0.096 | 0.339 | 0.919 | 0.194 |
| junkala-title-screen | 0.638 | 0.348 | 0.014 | 0.254 | 0.903 | 0.286 |
| nene-theme-song-8bit | 0.414 | 0.383 | 0.268 | 0.366 | 0.798 | 0.194 |
| obscure-moon-chime | 0.281 | 0.378 | 0.268 | 0.286 | 0.833 | 0.252 |
| pmiller-nes-jazz | 0.282 | 0.338 | 0.380 | 0.406 | 0.640 | 0.330 |
| randommind-old-tower-inn | 0.340 | 0.290 | 0.370 | 0.385 | 0.698 | 0.349 |
| sketchy-boss | 0.208 | 0.480 | 0.312 | 0.354 | 0.803 | 0.329 |
| sketchy-mars | 0.194 | 0.305 | 0.501 | 0.438 | 0.730 | 0.195 |
| sketchy-mercury | 0.307 | 0.548 | 0.146 | 0.432 | 0.838 | 0.232 |
| sketchy-venus | 0.111 | 0.513 | 0.376 | 0.656 | 0.483 | 0.325 |
| skrjablin-c64-uptempo | 0.269 | 0.552 | 0.179 | 0.216 | 0.783 | 0.310 |
| springspring-great-boss | 0.420 | 0.552 | 0.026 | 0.508 | 0.692 | 0.333 |
| tinyworlds-happy-adventure | 0.405 | 0.409 | 0.186 | 0.378 | 0.806 | 0.294 |
| wolfgang-battle-loop | 0.273 | 0.448 | 0.280 | 0.383 | 0.720 | 0.222 |
| wolfgang-haunted-house | 0.409 | 0.297 | 0.293 | 0.383 | 0.672 | 0.312 |
| zane-100-victories | 0.428 | 0.402 | 0.175 | 0.380 | 0.703 | 0.213 |
| zane-aura-horizon | 0.233 | 0.453 | 0.275 | 0.322 | 0.815 | 0.232 |
| zane-dizzy-racing | 0.311 | 0.323 | 0.323 | 0.174 | 0.925 | 0.232 |
| zane-face-the-facts | 0.233 | 0.345 | 0.437 | 0.161 | 0.928 | 0.271 |
| zane-insect-factory | 0.229 | 0.296 | 0.459 | 0.312 | 0.764 | 0.310 |
| zane-poker-night | 0.250 | 0.437 | 0.309 | 0.319 | 0.787 | 0.174 |
| zane-sinister-abode | 0.176 | 0.340 | 0.457 | 0.274 | 0.820 | 0.271 |
| zane-space-cadet | 0.196 | 0.463 | 0.341 | 0.197 | 0.920 | 0.310 |
| zane-starlight-city | 0.262 | 0.395 | 0.350 | 0.168 | 0.903 | 0.329 |

### Timbre, voices, silence

| Track | `spectralCentroidMean` | `spectralCentroidCV` | `polyphony` | `silenceFraction` |
|---|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 3383.8 | 0.149 | 4.580 | 0.003 |
| celestial-8bit-thing | 2330.3 | 0.540 | 2.960 | 0.172 |
| celestial-pulsar | 3605.0 | 0.308 | 3.490 | 0.003 |
| celestial-summer-sunday | 2895.7 | 0.124 | 4.374 | 0.001 |
| centurion-delayed-chips | 2752.3 | 0.265 | 4.767 | 0.000 |
| centurion-unstable-field | 3669.6 | 0.224 | 4.637 | 0.000 |
| congus-lasso-lady | 3480.4 | 0.355 | 4.057 | 0.003 |
| congus-napping-cloud | 1284.9 | 0.438 | 3.130 | 0.011 |
| hydrogene-mechanical-complex | 3181.5 | 0.213 | 3.852 | 0.000 |
| hydrogene-perilous-dungeon | 3505.7 | 0.142 | 4.597 | 0.000 |
| junkala-adv-bossfight | 3692.4 | 0.280 | 3.752 | 0.000 |
| junkala-adv-stage1 | 3516.7 | 0.321 | 3.587 | 0.000 |
| junkala-level1 | 4280.1 | 0.194 | 3.670 | 0.000 |
| junkala-level2 | 4416.7 | 0.195 | 3.442 | 0.000 |
| junkala-level3 | 4781.5 | 0.148 | 4.064 | 0.000 |
| junkala-title-screen | 4035.1 | 0.217 | 3.318 | 0.048 |
| nene-theme-song-8bit | 3498.6 | 0.444 | 4.638 | 0.000 |
| obscure-moon-chime | 3099.7 | 0.336 | 4.739 | 0.000 |
| pmiller-nes-jazz | 2743.5 | 0.264 | 2.860 | 0.050 |
| randommind-old-tower-inn | 4110.5 | 0.109 | 3.917 | 0.000 |
| sketchy-boss | 2673.8 | 0.156 | 4.279 | 0.001 |
| sketchy-mars | 3074.1 | 0.161 | 3.594 | 0.013 |
| sketchy-mercury | 2424.7 | 0.171 | 4.191 | 0.003 |
| sketchy-venus | 3424.3 | 0.222 | 5.414 | 0.005 |
| skrjablin-c64-uptempo | 3071.5 | 0.195 | 3.957 | 0.000 |
| springspring-great-boss | 4084.2 | 0.183 | 4.837 | 0.000 |
| tinyworlds-happy-adventure | 1471.9 | 0.975 | 3.174 | 0.000 |
| wolfgang-battle-loop | 3367.9 | 0.215 | 4.377 | 0.000 |
| wolfgang-haunted-house | 2547.7 | 0.458 | 2.900 | 0.141 |
| zane-100-victories | 3817.4 | 0.259 | 4.525 | 0.002 |
| zane-aura-horizon | 2336.1 | 0.192 | 4.445 | 0.000 |
| zane-dizzy-racing | 4534.5 | 0.125 | 4.900 | 0.000 |
| zane-face-the-facts | 4651.1 | 0.187 | 4.611 | 0.004 |
| zane-insect-factory | 3408.9 | 0.659 | 3.013 | 0.122 |
| zane-poker-night | 3705.8 | 0.520 | 4.221 | 0.030 |
| zane-sinister-abode | 5427.6 | 0.209 | 4.456 | 0.005 |
| zane-space-cadet | 4254.6 | 0.316 | 4.269 | 0.004 |
| zane-starlight-city | 4479.2 | 0.218 | 5.087 | 0.002 |

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
acceptance budget of 5 is derived from.

| Track | gating metrics out of band (of 14) |
|---|---:|
| celestial-summer-sunday | 6 |
| celestial-8bit-thing | 5 |
| 3xblast-pop-punk-1 | 4 |
| randommind-old-tower-inn | 4 |
| sketchy-venus | 4 |
| zane-aura-horizon | 4 |
| junkala-level1 | 3 |
| junkala-level3 | 3 |
| wolfgang-haunted-house | 3 |
| zane-insect-factory | 3 |
| celestial-pulsar | 2 |
| congus-napping-cloud | 2 |
| hydrogene-mechanical-complex | 2 |
| junkala-adv-bossfight | 2 |
| junkala-title-screen | 2 |
| obscure-moon-chime | 2 |
| sketchy-mars | 2 |
| springspring-great-boss | 2 |
| tinyworlds-happy-adventure | 2 |
| wolfgang-battle-loop | 2 |
| zane-dizzy-racing | 2 |
| zane-face-the-facts | 2 |
| zane-sinister-abode | 2 |
| centurion-delayed-chips | 1 |
| congus-lasso-lady | 1 |
| junkala-adv-stage1 | 1 |
| pmiller-nes-jazz | 1 |
| skrjablin-c64-uptempo | 1 |
| zane-poker-night | 1 |
| zane-starlight-city | 1 |
| centurion-unstable-field | 0 |
| hydrogene-perilous-dungeon | 0 |
| junkala-level2 | 0 |
| nene-theme-song-8bit | 0 |
| sketchy-boss | 0 |
| sketchy-mercury | 0 |
| zane-100-victories | 0 |
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
| control-a-sustained-square | peak dead centre | **13** | 5 | **FAIL** |
| control-a-sustained-square | RMS dead centre | **12** | 5 | **FAIL** |
| control-b-random-notes | peak dead centre | **9** | 5 | **FAIL** |
| control-b-random-notes | RMS dead centre | **9** | 5 | **FAIL** |
| control-c-one-bar-loop | peak dead centre | **9** | 5 | **FAIL** |
| control-c-one-bar-loop | RMS dead centre | **9** | 5 | **FAIL** |

For comparison, real corpus tracks average **1.89** out-of-band metrics (worst: 6).

### Which metric caught which control, and by how much

Signed distance is in band-widths: 0 means inside, negative means below `lo`, positive above `hi`.
Showing the RMS-dead-centre variant of each.

**control-a-sustained-square** — 12 of 14 out of band

| Metric | value | band | distance (band-widths) |
|---|---:|---|---:|
| `pitchClassEntropy` | 0.000 | 2.773 .. 3.301 | -5.25 |
| `chromaChangeRate` | 0.000 | 0.990 .. 1.576 | -1.69 |
| `noveltyPerSecond` | 0.000 | 0.194 .. 0.350 | -1.24 |
| `novelFraction` | 0.007 | 0.503 .. 0.929 | -1.16 |
| `leapFrac` | 0.000 | 0.295 .. 0.552 | -1.15 |
| `polyphony` | 1.000 | 2.951 .. 4.929 | -0.99 |
| `spectralCentroidMean` | 6557.998 | 2201.520 .. 4670.696 | +0.76 |
| `repeatStrength` | 1.000 | 0.154 .. 0.642 | +0.73 |
| `stepFrac` | 0.000 | 0.176 .. 0.458 | -0.62 |
| `beatStrength` | 0.964 | 0.282 .. 0.816 | +0.28 |
| `spectralCentroidCV` | 0.013 | 0.125 .. 0.558 | -0.26 |
| `bigLeapFrac` | 0.000 | 0.064 .. 0.502 | -0.15 |

**control-b-random-notes** — 9 of 14 out of band

| Metric | value | band | distance (band-widths) |
|---|---:|---|---:|
| `polyphony` | 1.598 | 2.951 .. 4.929 | -0.68 |
| `spectralCentroidMean` | 5979.850 | 2201.520 .. 4670.696 | +0.53 |
| `pitchClassEntropy` | 3.564 | 2.773 .. 3.301 | +0.50 |
| `chromaChangeRate` | 1.800 | 0.990 .. 1.576 | +0.38 |
| `onsetRate` | 10.733 | 4.584 .. 9.591 | +0.23 |
| `repeatStrength` | 0.068 | 0.154 .. 0.642 | -0.18 |
| `beatStrength` | 0.875 | 0.282 .. 0.816 | +0.11 |
| `leapFrac` | 0.283 | 0.295 .. 0.552 | -0.05 |
| `bigLeapFrac` | 0.514 | 0.064 .. 0.502 | +0.03 |

**control-c-one-bar-loop** — 9 of 14 out of band

| Metric | value | band | distance (band-widths) |
|---|---:|---|---:|
| `noveltyPerSecond` | 0.000 | 0.194 .. 0.350 | -1.24 |
| `leapFrac` | 0.779 | 0.295 .. 0.552 | +0.89 |
| `pitchClassEntropy` | 2.314 | 2.773 .. 3.301 | -0.87 |
| `novelFraction` | 0.165 | 0.503 .. 0.929 | -0.79 |
| `repeatStrength` | 0.915 | 0.154 .. 0.642 | +0.56 |
| `beatStrength` | 0.948 | 0.282 .. 0.816 | +0.25 |
| `chromaChangeRate` | 0.867 | 0.990 .. 1.576 | -0.21 |
| `spectralCentroidCV` | 0.044 | 0.125 .. 0.558 | -0.19 |
| `bigLeapFrac` | 0.000 | 0.064 .. 0.502 | -0.15 |

## Where this band is still gameable

Stated bluntly, because a bar you cannot attack is a bar you do not understand.

**The load-bearing metrics are six**: `pitchClassEntropy`, `chromaChangeRate`, `repeatStrength`,
`novelFraction`, `noveltyPerSecond`, `polyphony`. Those six caught all three controls on both
mastering variants. If a future synth is tuned against this band, these are the ones doing the work.

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
metrics; the best-scoring fake misses 9. The budget sits at 5. This band reliably rejects *crude*
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

**Harmonic suppression assumes strong fundamentals.** The salience grid suppresses accepted notes'
harmonics at +12/19/24/28/31/34/36 semitones, so a melody sitting exactly an octave or an
octave-plus-fifth above a bass note is suppressed and undercounted in `polyphony` and chroma. Chiptune
waveforms all carry strong fundamentals, which is what makes the approximation survivable here.


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
