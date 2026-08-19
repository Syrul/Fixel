# Fixel

An endless, phone-shaped feed of procedurally generated isometric pixel-art scenes. Every post
is a city, a shore, a desert or a highland, drawn at native resolution with no antialiasing and
no resampling anywhere in the path — and every post comes with its own chiptune, composed from
the same seed that drew the picture.

**Live: <https://fixel-alpha.vercel.app>** · `?seed=N` restores any post exactly.

Nothing is stored. There are no sprites on disk, no sample library, no textures, no model
weights at runtime. A post is a pure function of one 32-bit integer.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5177
```

```bash
npm run build        # production bundle
npm run render -- --seed hello --out out/scene.png --w 440 --h 1000
```

Node 20.19+ (Vite 8). The app has no runtime dependencies; `vite` and `pngjs` are dev-only.

---

## How it works

`src/gen/scene.js` is a dispatcher. It asks the seed what kind of place it is and hands a
**stage** to that biome's own layout driver.

`src/gen/stage.js` holds only what is true of *every* post: the 2:1 dimetric projection, a
tagged indexed canvas, the palette with its contour ladder, per-neighbourhood colour commitment,
and the silhouette sweep. Everything below that line is **layout**, and layout is what a biome
actually is — a street grid and a parcel mix, or a dune field and a caravan track, or a
coastline and a boardwalk. Each biome owns its driver end to end and admits structures on its
own axis: the city on parcel land-use, the shore on wave exposure, the desert on sand mobility,
the highland on an elevation ceiling for woody growth. That is the test of whether four biomes
are one biome wearing four palettes.

The canvas (`src/core/canvas.js`) is **indexed** — one palette index per pixel, not RGBA — with
a per-pixel depth buffer and a per-pixel object tag. The tag is what makes the outline pass
possible: after everything is drawn, one sweep blackens the boundary pixel of the nearer object
at every tag change, on one side only. `src/gen/world.js` supplies analytic height fields and
`src/gen/terrain.js` terraces them onto a cell grid.

The audio side (`src/audio/**`) is a from-scratch chip engine — band-limited pulse, triangle and
noise voices, a composer that writes ~42 bars with real sections, and a master chain. It renders
per-channel solo stems as well as the mix, because duty cycle is only recoverable from an
isolated voice. A 60-second track renders in ~240 ms.

### Animation

Each post breathes. Water surges, foliage leans, figures shift — one or two pixels, at 8 fps,
on an 8-frame loop.

The whole design falls out of one constraint: **animation makes the output a function of
(seed, time), and time is where determinism dies.** So there is no time. Every animated quantity
is a function of an integer frame index, and must be *periodic with period 1* in
`phase(k) = k / FRAMES` — which makes frame `FRAMES` equal frame 0 by construction, so the loop
closes with no visible restart and no crossfade hiding the wrap. A clock appears exactly once,
in the app layer, to decide *which integer to show*.

Storing eight RGBA frames per post would cost 14 MB against a ~1.2 MB pixel footprint, so
nothing stores a frame. `src/core/anim.js` keeps the *set of pixels that ever move* — typically
0.3–2.5% of the frame — with one palette index per member per frame. The frames are produced by
a **recorder**: a shader already knows every frame's answer when it computes frame 0's, because
the field lookups dominate and the phase term is eight adds. That makes a loop cost a few
percent of a render rather than seven hundred.

That fast path is a pile of assumptions about what got painted over, so it is not trusted.
`tools/animcheck.mjs` is an **oracle**: it renders the whole scene from the seed at every frame
the slow way and asserts the loop reproduces it byte for byte. It has already rejected two
designs that both looked correct.

---

## Determinism is the foundation

1. **Every random draw comes from a named `Rng` stream** seeded off the post seed.
   `Math.random()` is banned in `src/gen/**` and `src/audio/**`.
2. **New randomness opens its own named stream.** Appending a draw to an existing stream
   re-rolls every subsequent draw in it and moves the whole feed.
3. **`performance.now()` and `Date.now()` may not reach a pixel.** The generator takes an
   integer frame index.
4. **A post's content may never depend on its position in a scroll.** The feed chooses *which*
   seeds to show; it never chooses what a seed *is*. That is what makes `?seed=N` a real
   permalink.

`node tools/verify.mjs --seeds 6 --frames 8` renders in **child processes** — in-process
re-rendering hides module top-level state, Map iteration order and cached palettes, which all
reproduce perfectly within one process and diverge across two.

---

## The harness

| tool | what it gates |
|---|---|
| `verify.mjs` | cross-process byte-identity at frames 0, 1, K−1, K and 40; that the loop closes; that it does not drift; and that **something moves** |
| `animcheck.mjs` | the oracle — every frame re-rendered the slow way and compared; plus a floor that rejects per-pixel noise |
| `strip.mjs` | the loop as a strip, a motion heatmap with island sizes, and a frame-to-frame diff including the wrap |
| `treehash.mjs` | digests every file that can change a pixel; **a metric without a tree digest is not evidence** |
| `metrics.mjs` | ~60 pixel measurements against a band derived from the reference |
| `variety.mjs` | cross-seed spread — whether two Fixel scenes differ as much as two crops of one artwork |
| `budget.mjs` | acceptance, with an ordering check that refuses to let the count be quoted as a score |
| `duel.mjs` | builds the blind A/B round, refuses to build one whose source moved mid-render |
| `audio-metrics.mjs` | 14 gating measurements over a 38-track CC0 corpus |

`verify.mjs` and `duel.mjs` record the tree digest before and after and **exit 2 on a mismatch**:
a torn run is void, not a data point. That rule exists because two agents once wrote
`src/gen/**` concurrently, the same seed produced different pixels ten minutes apart, and nothing
in the process could distinguish "the generator is nondeterministic" from "the generator is not
the same generator any more". Those need opposite fixes. Half an hour of measurements went in
the bin.

---

## How this was built, honestly

A person wrote one short prompt. Everything else — the generator, the synth, the harness, the
adversarial critics, the docs — was written by AI agents across successive rounds of adversarial
development, with the person reviewing and deciding.

**The best thing in this repository is not the code. It is
[`docs/ROUNDS.md`](docs/ROUNDS.md) and [`docs/BAR.md`](docs/BAR.md),** which record what was
tried, what was measured, and what turned out to be wrong. Claims that were later falsified are
marked as falsified in place rather than quietly deleted. A partial list:

- **The generator lost every blind duel it ran.** Round 1 lost on a split, rounds 2 and 3 lost
  0–4. In round 3, eight fresh judges made eight confident picks for the reference, and every one
  of them also correctly identified which side was the program. That is the most useful result
  the project has produced.
- **The 60-metric score was retired**, because it ranked the generator *above* a genuine eBoy
  Pixorama. Every band is a p05–p95 interval, so a generator emitting the statistical average of
  the band sits near the centre of all sixty at once: **the count rewards homogeneity.** It is a
  floor that rejects things outside the craft family, never a score that ranks things inside it.
- **The audio band has the same defect, provably.** Only 5 of its 14 gating metrics can respond
  to verbatim repetition, and the budget is 5 — so a perfect loop cannot exceed it. A one-bar
  loop repeated for 60 seconds passes.
- **`Canvas.putZ` once wrote to a fractional typed-array index.** A typed array silently ignores
  that write. Every pedestrian, tree canopy, palm crown and blitted glyph — 100% of sprite blits
  — was discarded before reaching the raster, for three rounds, while the code reported success.
  Eight judges across three rounds diagnosed it as a craft defect. It was found by counting the
  calls. A near-identical bug shipped again later: fractional-width terrain cells leaving ~1,300
  unwritten pixels per frame that rendered as true black on a regular lattice.
- **Every measurement instrument here has been wrong at least once** — WSOLA manufacturing
  transients, a duty fit querying harmonics the band-limiter never rendered, a tempo estimator
  returning the centre of its own search window, a non-interleaved A/B reading run-to-run drift
  as an effect, and a quantile read off the wrong end of a descending sort. Each was caught by
  looking at the *output* rather than at the number.
- **The reference videos were misread for five rounds.** Two clips in `refs/` were treated as
  animated pixel-art references. Measured, they are neither pixel art nor loops, and they move
  6–10 px per frame. No amplitude in this project has a measured provenance, and the record says
  so instead of implying one.

The standing rules that came out of all this live in [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md).
The two that generalise furthest: **a binary verdict at small n is not a finding — record the
margin with the sample count**, and **plausibility is not evidence**.

Also worth reading: [`docs/CRAFT.md`](docs/CRAFT.md) on where pixel density actually comes from,
and [`docs/HARNESS.md`](docs/HARNESS.md) on how the blind duel leaks and why the obvious remedy
is worse than the leak.

---

## `refs/` is deliberately absent

The comparison artwork is third-party (eBoy Pixoramas and others) and is **not committed and
never will be**. The measurement harness expects those files on disk locally; `metrics.mjs`,
`duel.mjs` and `budget.mjs` will not run without them. The app does not need them, and nothing
in `refs/` has ever reached a public URL — it is excluded from git and from the deploy.

The CC0 chiptune corpus is likewise re-fetchable rather than vendored; provenance is tracked in
`corpus/chiptune/SOURCES.md`.

Fixel draws no real brand, wordmark, livery or logo. Every sign in the frame is invented from a
seeded table and rendered in its own pixel font, and there is a content filter that checks every
prefix a sign can actually display, not just the word it started from.
