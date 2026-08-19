# Fixel — the initial prompt

## The bar

An unlabelled, unresampled same-size crop of `refs/EBY-LA-Hot-Dog-175k.png` — the only reference on
disk big enough to slice freely — set beside an identically sized interior crop of a Fixel post and
judged on craft by a fresh agent that never sees which is which, backed by that file's own measurable
properties (colour-change rate, run length, colours per tile, edge hardness) which the agent measures
itself and must hold to, with the sound half held inside two-sided bands measured off a CC0 chiptune
corpus it downloads and renders against headlessly — and a piece is done only when a fresh judge
stops picking the reference in either order and every measured number sits in band.

## The prompt

```
I want to build Fixel — an endless feed of isometric pixel-art scenes, each with its own chiptune.
Procedural and seeded: the model writes tables, not pixels or notes. No stored bitmaps or samples.

The bar is /Users/avivezra/Repos/Fixel/refs/EBY-LA-Hot-Dog-175k.png — that file only. Duel it blind:
unscaled same-size crops, same format, both from inside a bigger scene, a fresh judge picking craft
not subject. Seeds pick the crops and the post, never you.

Measure the ref, hold to what you find, one shared metrics script. Don't open docs/BAR.md until your
numbers exist, then diff. Few hues, dense pixels — sparse and repetitive is how this fails.

Same for sound: render headlessly into two-sided bands measured off CC0 chiptunes you download, on
metrics a limiter can't fake. Nothing here has ears; no model claims it listened.

Steal craft, never content — no brands, landmarks, real lettering. Invent every sign. Crib the harness
from /Users/avivezra/Repos/slopscroll, minus its resampling.

Cut this into the smallest judgeable pieces. Each gets a builder and a harsh fresh-context critic
duelling real output, naming the biggest gap as a number, handing it back. Several pairs, not one —
mixed means it lost. Real pixels before any dashboard. Keep a live page: same seeds each round,
numbers beside the bar, win-loss. /loop each piece. Don't stop until no judge picks the reference,
either order, and every number's in band, or I stop you. Fan out subagents and ultracode.
```

## Why each clause is there

| clause | what it stops |
|---|---|
| "the model writes tables, not pixels or notes" / "No stored bitmaps or samples" | reaching for an image model, a runtime LLM, or a baked sprite atlas instead of writing a generator |
| "that file only" | duelling against `Shift-Bild-03.png`, a wireframe lot plan that hands a sparse generator a false pass |
| "unscaled same-size crops, same format" | resampling artifacts and RGBA-vs-palette metadata leaking which side is which |
| "both from inside a bigger scene" | comparing a centred vignette against an interior slice of a Pixorama — and it forces post > crop |
| "Seeds pick the crops and the post, never you" | cherry-picking a flattering crop or a tuned seed |
| "Don't open docs/BAR.md until your numbers exist, then diff" | inheriting my measurements instead of believing its own |
| "no brands, landmarks, real lettering. Invent every sign." | tracing real signage, and near-miss wordmarks — density pressure pushes hardest here; invented type is fine, borrowed type is not |
| "Few hues, dense pixels — sparse and repetitive is how this fails" | the one failure mode a critic feels but can't name (see BAR.md) |
| "metrics a limiter can't fake" | mastering its way past the audio bar instead of writing real music |
| "Nothing here has ears; no model claims it listened" | a subagent hallucinating a listening test |
| "Several pairs, not one — mixed means it lost" | declaring victory off a single coin-flip A/B |
| "Real pixels before any dashboard" | an all-scaffolding first pass |
| "either order" | position bias in the blind judge |

See [docs/BAR.md](docs/BAR.md) for the measured invariants behind all of this.
