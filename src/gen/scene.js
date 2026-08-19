// renderScene(seed, opts) -> Canvas
//
// The frame is always FULL. The world is generated wider and deeper than the
// viewport in every direction and simply overflows it, so there is no sky band,
// no ground border and no vignette — a 320x320 crop taken anywhere inside the
// output lands in the middle of somewhere.
//
// This file is now a DISPATCHER. It decides what kind of place a seed is and
// hands a `stage` to that biome's own layout driver. Two things are worth being
// exact about.
//
// WHY A REGISTRY AND NOT A PARAMETER. The cheap version of biomes is a `biome`
// argument threaded down into `planCity` that selects a palette and a prop
// table, and it produces four dialects of one city. What actually distinguishes
// a desert from a city is not its colours, it is that it has no street grid, no
// blocks, no parcels and no land-use mix at all — its layout comes from an
// analytic height field and its structures are admitted by slope and by
// distance to a track. Those are different programs, so they are different
// modules, and the only things they share are the things that are genuinely
// true of every post: the projection, the tagged canvas, the silhouette sweep,
// the contour ladder and per-neighbourhood colour commitment.
//
// WHY THE BIOME DRAW IS ITS OWN Rng STREAM. Law 2 in `src/core/rng.js` is that
// new randomness opens its own named stream, never appends to an existing one.
// Choosing the biome from `stream('biome')` means every city seed still draws
// exactly the sequence it drew before this file existed, and `?seed=N` restores
// the same post it always restored. That is checked, not assumed: the city path
// is byte-identical across the refactor.

import { makeStage } from './stage.js';
import { BIOME_WEIGHTS, BIOME_KEYS, pickBiome } from './biome-mix.js';
import { pickConditions } from './conditions.js';
import { paintCity } from './biomes/city.js';
import { paintDesert } from './biomes/desert.js';
import { paintShore } from './biomes/shore.js';
import { paintHighland } from './biomes/highland.js';

/**
 * The feed's mix.
 *
 * The city keeps the largest single share for two reasons, one product and one
 * epistemic. A feed that opens on four different landscapes in a row reads as a
 * screensaver; the city is the thing the other biomes are a break FROM. And the
 * city is the only biome that can be duelled against an urban Pixorama on
 * subject matter, so it is the one that carries the craft measurement.
 *
 * `backPad` is how far behind the frame that biome's world must be generated.
 * A flat city needs none: the ground plane fills the frame by construction. A
 * landscape does, because a pixel looking just over a low foreground sees along
 * the (1,1,1) view ray to terrain further back, and how much further is
 * proportional to the relief. Get it wrong and the horizon renders as untouched
 * background in a picture that has no sky. Nothing in the harness would fail.
 */
const BIOMES = {
  city: { paint: paintCity, backPad: 0 },
  shore: { paint: paintShore, backPad: 60 },
  desert: { paint: paintDesert, backPad: 80 },
  highland: { paint: paintHighland, backPad: 190 },
};

export { BIOME_KEYS, BIOME_WEIGHTS, pickBiome };
export { pickConditions };

export function renderScene(seed, opts = {}) {
  const kind = BIOMES[opts.biome] ? opts.biome : pickBiome(seed);
  const B = BIOMES[kind];
  // --cond OVERRIDES THE SEED'S OWN DRAW, and is a measurement tool only, for
  // the same reason --biome is: it renders a picture the feed would never show
  // for that seed. Sweeping one condition across many seeds is exactly what it
  // is for; a duel input is exactly what it is not.
  const cond = opts.cond || pickConditions(seed, kind);
  const stage = makeStage(seed, { ...opts, cond, backPad: B.backPad });
  stage.biome = kind;
  B.paint(stage);
  return stage.finish({ outline: opts.outline !== false && !opts.noOut });
}
