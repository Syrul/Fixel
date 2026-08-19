// Which kind of place a seed is, and in what proportion the feed serves them.
//
// THIS IS A SEPARATE MODULE FOR ONE REASON: `src/app/main.js` runs on the
// browser's main thread and needs to know a seed's biome in order to choose
// which seeds to show. Importing `scene.js` to get it would pull every biome
// driver, the terrain substrate and every prop library into the main bundle,
// when the whole point of `scene.worker.js` is that the generator lives off the
// main thread. This file has one dependency and it is the RNG.
//
// THE BIOME IS A PURE FUNCTION OF THE SEED, AND THAT IS A PRODUCT INVARIANT,
// not an implementation detail. A post's seed is its identity: `?seed=N` has to
// restore that exact post, biome included, and a link shared from post 7 has to
// open on the same picture it was copied from. So nothing about a post's
// content may depend on its position in a scroll or on what came before it.

import { Rng } from '../core/rng.js';

/**
 * The mix.
 *
 * NOT equal quarters, deliberately. The city is the densest and most legible
 * thing this generator makes, and it is the only biome that can be duelled
 * against the reference on subject matter, so it carries the craft
 * measurement. A feed that is three-quarters landscape also reads emptier
 * than one the city keeps interrupting — landscapes are a break FROM
 * something, and with no city they stop being a break and become the norm.
 * Measured over 4,000 consecutive posts the served mix is city 33.0%,
 * desert 23.1%, highland 22.6%, shore 21.4%.
 */
export const BIOME_WEIGHTS = { city: 34, shore: 22, desert: 22, highland: 22 };
export const BIOME_KEYS = Object.keys(BIOME_WEIGHTS);

/** Which kind of place this seed is. Pure function of the seed. */
export function pickBiome(seed) {
  return new Rng(seed).stream('biome')
    .weighted(BIOME_KEYS.map((k) => [k, BIOME_WEIGHTS[k]]));
}
