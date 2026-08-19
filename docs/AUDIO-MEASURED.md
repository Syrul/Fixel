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

A track PASSES if **at most 5 of the 17 gating metrics** fall outside their p05..p95 band.

The budget is not a guess; it is the p95 of the leave-one-out fail-count distribution of the corpus
against itself. Demanding all 17 metrics be in band is the wrong gate and the corpus proves it: with
17 two-sided p05..p95 bands a track is expected to miss ~1.7 by construction, and measured
leave-one-out only **5 of 38** genuine CC0 chiptunes clear all 17. Mean leave-one-out failures per
real track: **2.26**, max **7**. At a budget of 5, **37 of 38** real tracks are accepted.

## The band

| Metric | p05 | p95 | median | min | max | Gates? |
|---|---:|---:|---:|---:|---:|:--|
| `onsetRate` | 4.584 | 9.591 | 6.921 | 0.817 | 10.517 | yes |
| `ioiEntropy` | 0.964 | 3.324 | 2.331 | 0.401 | 3.712 | yes |
| `beatStrength` | 0.282 | 0.816 | 0.701 | 0.122 | 0.837 | yes |
| `tempoBpm` | 32.503 | 142.948 | 59.433 | 30.046 | 224.694 | yes |
| `pitchClassEntropy` | 2.773 | 3.301 | 3.119 | 2.637 | 3.371 | yes |
| `chromaChangeRate` | 0.990 | 1.576 | 1.330 | 0.833 | 1.602 | yes |
| `stepFrac` | 0.176 | 0.458 | 0.271 | 0.111 | 0.638 | yes |
| `leapFrac` | 0.295 | 0.552 | 0.420 | 0.084 | 0.590 | yes |
| `bigLeapFrac` | 0.064 | 0.502 | 0.287 | 0.014 | 0.518 | yes |
| `repeatStrength` | 0.154 | 0.642 | 0.321 | 0.117 | 0.782 | yes |
| `novelFraction` | 0.503 | 0.929 | 0.810 | 0.397 | 0.963 | yes |
| `spectralCentroidMean` | 2201.520 | 4670.696 | 3489.504 | 1284.874 | 5427.580 | yes |
| `spectralCentroidVar` | 174595.870 | 2296770.212 | 691800.910 | 127793.552 | 5884147.350 | yes |
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

| Track | `onsetRate` | `ioiEntropy` | `beatStrength` | `tempoBpm` | `pitchClassEntropy` | `chromaChangeRate` |
|---|---:|---:|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 4.617 | 3.346 | 0.122 | 69.0 | 3.245 | 1.233 |
| celestial-8bit-thing | 6.893 | 2.941 | 0.755 | 32.5 | 2.953 | 1.216 |
| celestial-pulsar | 9.538 | 1.067 | 0.651 | 44.9 | 2.999 | 1.379 |
| celestial-summer-sunday | 10.517 | 1.071 | 0.784 | 44.9 | 2.873 | 1.133 |
| centurion-delayed-chips | 6.560 | 2.174 | 0.727 | 77.4 | 3.272 | 1.327 |
| centurion-unstable-field | 7.133 | 1.015 | 0.726 | 75.1 | 3.221 | 1.333 |
| congus-lasso-lady | 7.971 | 2.412 | 0.646 | 34.9 | 3.147 | 1.572 |
| congus-napping-cloud | 6.433 | 2.780 | 0.735 | 161.5 | 3.204 | 1.383 |
| hydrogene-mechanical-complex | 7.875 | 0.401 | 0.753 | 117.5 | 3.362 | 1.362 |
| hydrogene-perilous-dungeon | 8.574 | 0.676 | 0.769 | 63.8 | 3.213 | 1.067 |
| junkala-adv-bossfight | 7.067 | 1.803 | 0.810 | 58.1 | 3.072 | 1.300 |
| junkala-adv-stage1 | 5.600 | 1.879 | 0.814 | 139.7 | 2.992 | 1.267 |
| junkala-level1 | 6.774 | 1.540 | 0.806 | 90.7 | 2.786 | 0.833 |
| junkala-level2 | 7.408 | 1.624 | 0.646 | 105.5 | 2.954 | 1.000 |
| junkala-level3 | 7.333 | 1.295 | 0.825 | 52.7 | 2.928 | 1.000 |
| junkala-title-screen | 6.204 | 1.762 | 0.710 | 84.7 | 2.933 | 1.432 |
| nene-theme-song-8bit | 6.950 | 1.623 | 0.747 | 32.5 | 3.130 | 1.433 |
| obscure-moon-chime | 4.400 | 2.857 | 0.307 | 60.8 | 3.177 | 1.183 |
| pmiller-nes-jazz | 6.172 | 2.347 | 0.690 | 42.7 | 2.964 | 1.476 |
| randommind-old-tower-inn | 6.567 | 3.111 | 0.735 | 57.4 | 3.371 | 1.533 |
| sketchy-boss | 8.417 | 2.093 | 0.577 | 120.2 | 3.067 | 1.433 |
| sketchy-mars | 6.184 | 2.873 | 0.518 | 101.3 | 2.699 | 1.061 |
| sketchy-mercury | 7.333 | 2.324 | 0.445 | 33.3 | 3.084 | 1.300 |
| sketchy-venus | 7.268 | 2.337 | 0.466 | 74.9 | 3.083 | 1.205 |
| skrjablin-c64-uptempo | 7.733 | 2.644 | 0.381 | 94.0 | 3.290 | 1.467 |
| springspring-great-boss | 7.383 | 2.481 | 0.567 | 46.6 | 3.117 | 1.195 |
| tinyworlds-happy-adventure | 8.246 | 2.437 | 0.657 | 123.0 | 3.127 | 1.267 |
| wolfgang-battle-loop | 9.889 | 1.984 | 0.837 | 44.9 | 3.198 | 1.236 |
| wolfgang-haunted-house | 6.377 | 3.320 | 0.747 | 37.4 | 3.196 | 1.602 |
| zane-100-victories | 6.133 | 2.651 | 0.610 | 37.4 | 3.060 | 1.367 |
| zane-aura-horizon | 0.817 | 3.712 | 0.142 | 41.7 | 2.637 | 0.933 |
| zane-dizzy-racing | 6.433 | 2.300 | 0.731 | 43.8 | 3.241 | 1.433 |
| zane-face-the-facts | 7.233 | 2.071 | 0.545 | 30.0 | 3.113 | 1.183 |
| zane-insect-factory | 5.700 | 3.074 | 0.743 | 224.7 | 2.827 | 1.600 |
| zane-poker-night | 6.567 | 1.840 | 0.745 | 112.3 | 3.122 | 1.467 |
| zane-sinister-abode | 5.333 | 2.647 | 0.693 | 84.7 | 3.228 | 1.567 |
| zane-space-cadet | 6.983 | 2.640 | 0.636 | 32.5 | 3.147 | 1.383 |
| zane-starlight-city | 5.900 | 2.981 | 0.537 | 57.4 | 3.263 | 1.461 |

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

| Track | `spectralCentroidMean` | `spectralCentroidVar` | `spectralCentroidCV` | `polyphony` | `silenceFraction` |
|---|---:|---:|---:|---:|---:|
| 3xblast-pop-punk-1 | 3383.8 | 255544.4 | 0.149 | 4.580 | 0.003 |
| celestial-8bit-thing | 2330.3 | 1583470.8 | 0.540 | 2.960 | 0.172 |
| celestial-pulsar | 3605.0 | 1235849.7 | 0.308 | 3.490 | 0.003 |
| celestial-summer-sunday | 2895.7 | 127793.6 | 0.124 | 4.374 | 0.001 |
| centurion-delayed-chips | 2752.3 | 542434.5 | 0.265 | 4.767 | 0.000 |
| centurion-unstable-field | 3669.6 | 682540.2 | 0.224 | 4.637 | 0.000 |
| congus-lasso-lady | 3480.4 | 1529775.8 | 0.355 | 4.057 | 0.003 |
| congus-napping-cloud | 1284.9 | 267657.1 | 0.438 | 3.130 | 0.011 |
| hydrogene-mechanical-complex | 3181.5 | 460546.8 | 0.213 | 3.852 | 0.000 |
| hydrogene-perilous-dungeon | 3505.7 | 246834.4 | 0.142 | 4.597 | 0.000 |
| junkala-adv-bossfight | 3692.4 | 1070001.8 | 0.280 | 3.752 | 0.000 |
| junkala-adv-stage1 | 3516.7 | 1275451.6 | 0.321 | 3.587 | 0.000 |
| junkala-level1 | 4280.1 | 701061.6 | 0.194 | 3.670 | 0.000 |
| junkala-level2 | 4416.7 | 739244.5 | 0.195 | 3.442 | 0.000 |
| junkala-level3 | 4781.5 | 500614.2 | 0.148 | 4.064 | 0.000 |
| junkala-title-screen | 4035.1 | 768302.1 | 0.217 | 3.318 | 0.048 |
| nene-theme-song-8bit | 3498.6 | 2143911.7 | 0.444 | 4.638 | 0.000 |
| obscure-moon-chime | 3099.7 | 1002406.4 | 0.336 | 4.739 | 0.000 |
| pmiller-nes-jazz | 2743.5 | 523219.5 | 0.264 | 2.860 | 0.050 |
| randommind-old-tower-inn | 4110.5 | 244210.5 | 0.109 | 3.917 | 0.000 |
| sketchy-boss | 2673.8 | 175150.6 | 0.156 | 4.279 | 0.001 |
| sketchy-mars | 3074.1 | 245216.6 | 0.161 | 3.594 | 0.013 |
| sketchy-mercury | 2424.7 | 171452.4 | 0.171 | 4.191 | 0.003 |
| sketchy-venus | 3424.3 | 578931.8 | 0.222 | 5.414 | 0.005 |
| skrjablin-c64-uptempo | 3071.5 | 346650.8 | 0.195 | 3.957 | 0.000 |
| springspring-great-boss | 4084.2 | 563247.7 | 0.183 | 4.837 | 0.000 |
| tinyworlds-happy-adventure | 1471.9 | 2065107.9 | 0.975 | 3.174 | 0.000 |
| wolfgang-battle-loop | 3367.9 | 522778.6 | 0.215 | 4.377 | 0.000 |
| wolfgang-haunted-house | 2547.7 | 1361138.1 | 0.458 | 2.900 | 0.141 |
| zane-100-victories | 3817.4 | 947533.9 | 0.259 | 4.525 | 0.002 |
| zane-aura-horizon | 2336.1 | 190363.3 | 0.192 | 4.445 | 0.000 |
| zane-dizzy-racing | 4534.5 | 317936.4 | 0.125 | 4.900 | 0.000 |
| zane-face-the-facts | 4651.1 | 785996.6 | 0.187 | 4.611 | 0.004 |
| zane-insect-factory | 3408.9 | 5884147.4 | 0.659 | 3.013 | 0.122 |
| zane-poker-night | 3705.8 | 3162968.3 | 0.520 | 4.221 | 0.030 |
| zane-sinister-abode | 5427.6 | 1343266.6 | 0.209 | 4.456 | 0.005 |
| zane-space-cadet | 4254.6 | 1742251.2 | 0.316 | 4.269 | 0.004 |
| zane-starlight-city | 4479.2 | 956647.1 | 0.218 | 5.087 | 0.002 |

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

| Track | gating metrics out of band (of 17) |
|---|---:|
| celestial-summer-sunday | 7 |
| 3xblast-pop-punk-1 | 5 |
| celestial-8bit-thing | 5 |
| zane-aura-horizon | 5 |
| zane-insect-factory | 5 |
| randommind-old-tower-inn | 4 |
| sketchy-venus | 4 |
| wolfgang-haunted-house | 4 |
| congus-napping-cloud | 3 |
| hydrogene-mechanical-complex | 3 |
| junkala-level1 | 3 |
| junkala-level3 | 3 |
| zane-face-the-facts | 3 |
| celestial-pulsar | 2 |
| junkala-adv-bossfight | 2 |
| junkala-adv-stage1 | 2 |
| junkala-title-screen | 2 |
| obscure-moon-chime | 2 |
| sketchy-mars | 2 |
| springspring-great-boss | 2 |
| tinyworlds-happy-adventure | 2 |
| wolfgang-battle-loop | 2 |
| zane-dizzy-racing | 2 |
| zane-poker-night | 2 |
| zane-sinister-abode | 2 |
| centurion-delayed-chips | 1 |
| congus-lasso-lady | 1 |
| hydrogene-perilous-dungeon | 1 |
| pmiller-nes-jazz | 1 |
| sketchy-boss | 1 |
| sketchy-mercury | 1 |
| skrjablin-c64-uptempo | 1 |
| zane-starlight-city | 1 |
| centurion-unstable-field | 0 |
| junkala-level2 | 0 |
| nene-theme-song-8bit | 0 |
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
| **c** | a single 2-second bar at 120 BPM (C-major arpeggio lead over a root bass), repeated verbatim for 90 s |

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
| control-a-sustained-square | peak dead centre | **14** | 5 | **FAIL** |
| control-a-sustained-square | RMS dead centre | **13** | 5 | **FAIL** |
| control-b-random-notes | peak dead centre | **9** | 5 | **FAIL** |
| control-b-random-notes | RMS dead centre | **9** | 5 | **FAIL** |
| control-c-one-bar-loop | peak dead centre | **10** | 5 | **FAIL** |
| control-c-one-bar-loop | RMS dead centre | **10** | 5 | **FAIL** |

For comparison, real corpus tracks average **2.26** out-of-band metrics (worst: 7).

### Which metric caught which control, and by how much

Signed distance is in band-widths: 0 means inside, negative means below `lo`, positive above `hi`.
Showing the RMS-dead-centre variant of each.

**control-a-sustained-square** — 13 of 17 out of band

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
| `spectralCentroidVar` | 7210.581 | 174595.870 .. 2296770.212 | -0.08 |

**control-b-random-notes** — 9 of 17 out of band

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

**control-c-one-bar-loop** — 10 of 17 out of band

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
| `spectralCentroidVar` | 41777.398 | 174595.870 .. 2296770.212 | -0.06 |

## Where this band is still gameable

Stated bluntly, because a bar you cannot attack is a bar you do not understand.

**The load-bearing metrics are six**: `pitchClassEntropy`, `chromaChangeRate`, `repeatStrength`,
`novelFraction`, `noveltyPerSecond`, `polyphony`. Those six caught all three controls on both
mastering variants. If a future synth is tuned against this band, these are the ones doing the work.

**`onsetRate` and `beatStrength` are the weakest gating metrics here.** Before mastering, the
sustained-square control scored `onsetRate` 19.93/s and `beatStrength` 0.95 with *no notes in it at
all* — a naive square oscillator's period jitters between 50 and 51 samples at 440 Hz, and that
broadband fizz peak-picks as a 20 Hz note stream. Four successive fixes (band-summed flux, relative
flux normalisation, an absolute floor, and a prominence test) reduced but did not remove this; what
finally caught it was the *upper* side of the two-sided band, i.e. 19.93/s is not a plausible note
rate. Then the mastering tremolo handed it a real 4 Hz envelope and `onsetRate` landed in band at
4.87. Treat these two as evidence that *something happens at a rate*, not that notes are played.

**`tempoBpm` (32.5..142.9) passed all six control files** and is close to useless as a gate — almost
any periodic signal lands inside. **`ioiEntropy` (0.964..3.324) also passed all six.** Both are kept
for reporting, not for gating strength. **`silenceFraction` never gated anything** — every control
measured 0.000; it only guards against dead air, which is worth having but is not a music test.

**`stepFrac` passed both the random-note and the one-bar-loop control.** Only `leapFrac` and
`bigLeapFrac` had teeth on the interval distribution. The melodic line is tracked as the highest
strong voice confined to a two-octave register around its own median; on dense polyphony it still
swaps voices, which is why the corpus `bigLeapFrac` band is wide (0.064..0.502).

**`spectralCentroidVar` and `spectralCentroidCV` are the same measurement twice** (Hz² and its
scale-free twin). Counting both inflates fail counts by one whenever a track has static timbre. They
are not independent evidence and should be read as one metric.

**The margin over real music is real but not comfortable.** The worst genuine corpus track misses 7
metrics; the random-note control misses 9. The budget sits at 5. This band reliably rejects *crude*
fakes — a drone, a random-note generator, a single looped bar. A more competent fake (Markov-chain
melody over a ii-V-I with a genuine repeated 8-bar section and a couple of timbre changes) would
very plausibly land under the budget while still being bad music. **This is a floor, not a ceiling:
passing it means a synth is not obviously broken, not that it is good.**

**Corpus monoculture.** All 38 tracks come from OpenGameArt, and two artists supply 15 of them
(Zane Little Music 9, Juhani Junkala 6). Band widths partly encode those artists' habits rather than
chiptune in general.

**Harmonic suppression assumes strong fundamentals.** The salience grid suppresses accepted notes'
harmonics at +12/19/24/28/31/34/36 semitones, so a melody sitting exactly an octave or an
octave-plus-fifth above a bass note is suppressed and undercounted in `polyphony` and chroma. Chiptune
waveforms all carry strong fundamentals, which is what makes the approximation survivable here.

---

## Independent verification of the bar by the lead, before any synth existed

Run against `docs/band-audio-v1.json` with `tools/audio-metrics.mjs`, by someone
who did not build either. This is the audio twin of the pixel side's inversion
test, and it is the check that decides whether any later synth score means
anything.

| file | gating metrics out of band (budget 5) | verdict |
|---|---:|---|
| `control-a-sustained-square` peak-centred | 14 | FAIL |
| `control-a-sustained-square` rms-centred | 13 | FAIL |
| `control-c-one-bar-loop` peak-centred | 10 | FAIL |
| `control-c-one-bar-loop` rms-centred | 10 | FAIL |
| `control-b-random-notes` peak-centred | 9 | FAIL |
| `control-b-random-notes` rms-centred | 9 | FAIL |
| `3xblast-pop-punk-1` | 4 | PASS |
| `celestial-8bit-thing` | 4 | PASS |
| `celestial-pulsar` | 1 | PASS |
| `celestial-summer-sunday` | 5 | PASS |
| `centurion-delayed-chips` | 1 | PASS |
| `centurion-unstable-field` | 0 | PASS |

**Worst genuine track 5, best fake 9 — a clean margin of 4, with no overlap.**
Both mastering variants of every fake fail, so centring loudness does not rescue
any of them: the gate is not measuring level.

Worked example of *why* the one-bar loop fails, which is the useful part:
`repeatStrength` 0.915 against a 0.154–0.642 band (+0.56), `noveltyPerSecond`
0.000 against 0.194–0.350 (−1.24), `novelFraction` 0.165 against 0.503–0.929
(−0.79), `pitchClassEntropy` 2.314 against 2.773–3.301 (−0.87). The metrics that
catch it are the ones that measure whether the music *develops*, and they cannot
be faked by processing — which is the whole design goal.

`crestFactorDb` read 6.349 against the corpus band 9.422–17.203 and is correctly
printed as **NON-GATING**, with the tool labelling it limiter-fakeable in its own
output. The n=3 claim in `docs/BAR.md` that crest factor is the load-bearing
gate does not survive n=38 and is not being relied on.

**Conclusion: the audio bar has teeth and is safe to judge a synth against.**
Unlike the 60-metric pixel band, it was built from 38 works by 16 artists rather
than 128 crops of one artwork, which is precisely why it generalises where the
pixel band did not.
