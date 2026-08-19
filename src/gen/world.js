// The world model: analytic fields, evaluated as pure functions.
//
// This is the layer Project Frostwind states better than we had: terrain, water,
// slope and habitability are FIELDS, and everything downstream — what the ground
// is made of, where a shack may stand, where a tree may grow, where a track may
// run — is READ OUT of those fields rather than decided separately. A biome is
// then a choice of field parameters plus a choice of what the readouts mean, and
// two biomes differ structurally because their fields differ, not because their
// palettes do.
//
// THREE PROPERTIES ARE LOAD-BEARING AND ALL THREE ARE ABOUT DETERMINISM.
//
// 1. Every function here is PURE in (x, y, seedN). No Rng, no module state, no
//    cache keyed on call order. That is what lets the same field be evaluated at
//    plan time (to place a hut) and at raster time (to shade the pixel under it)
//    and agree exactly. A field that disagreed between those two calls would put
//    the hut in the air, and nothing in the harness would see it.
//
// 2. NO TRANSCENDENTALS. `Math.sin`/`cos`/`exp`/`pow` are not required by
//    IEEE-754 to be correctly rounded and are not guaranteed identical between
//    engines or versions; `+ - * /` and `Math.sqrt` are. The determinism gate
//    renders in two node processes so it would not catch an engine difference,
//    but the feed renders in a browser worker and the duel renders in node, and
//    `?seed=N` has to restore the same post in both. Smoothing is polynomial and
//    periodicity is triangle-wave for exactly this reason.
//
// 3. The randomness comes from `h3`, the same integer hash the road patches and
//    pavement stains already use, so nothing here consumes an Rng draw and no
//    field can shift another stream by being added, removed or reordered.

import { h3 } from './palette.js';

/** Hash to a float in [0, 1). 24 bits — more than the fields can resolve. */
function u1(a, b, s) { return (h3(a, b, s) >>> 8) / 16777216; }

/**
 * Value noise on the integer lattice, smoothstep-interpolated.
 *
 * Value rather than gradient noise on purpose: gradient noise is zero at every
 * lattice point, which reads as a regular grid of saddles once it is terraced
 * into contour bands — the same "eye finds the period in a second" failure the
 * street grid was built to avoid. Value noise terraces into blobs.
 */
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = u1(xi, yi, s), b = u1(xi + 1, yi, s);
  const c = u1(xi, yi + 1, s), d = u1(xi + 1, yi + 1, s);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/** Fractal sum. Returns [0, 1]. */
export function fbm(x, y, s, oct = 4, lac = 2.03, gain = 0.5) {
  let f = 1, amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 1013);
    norm += amp;
    f *= lac; amp *= gain;
  }
  return sum / norm;
}

/**
 * Ridged sum — the |2n-1| fold, which puts a crease at every zero crossing.
 * This is what makes a mountain read as arêtes and gullies rather than as
 * lumps, and the creases are where scree and treeline detail belong.
 */
export function ridged(x, y, s, oct = 4, lac = 2.03, gain = 0.5) {
  let f = 1, amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = vnoise(x * f, y * f, s + i * 2029);
    sum += amp * (1 - Math.abs(2 * n - 1));
    norm += amp;
    f *= lac; amp *= gain;
  }
  return sum / norm;
}

/**
 * Triangle wave of unit period, in [0, 1]. Stands in for every place a sine
 * would be reached for — dune crests, wave bands, ripple sets. It also happens
 * to be the right shape: a dune's windward and lee slopes are not symmetric
 * sinusoids, and a linear ramp terraces into even contour bands where a sine
 * bunches them at the crest.
 */
export function tri(t) {
  const f = t - Math.floor(t);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

/**
 * A biome's height field, as a closure over its own parameters.
 *
 * `kind` selects the composition, not just the constants — this is the
 * difference between a biome and a preset. Dunes are a directional ramp folded
 * by a triangle wave (so crests run in a wind direction and repeat at a
 * spacing), a shore is a single monotone gradient toward the water with an
 * irregular coastline riding on it, and a highland is a ridged sum. Terracing
 * the same fbm three times with different constants would have produced three
 * sets of the same lumps, which is the "city with a different palette" failure
 * moved one layer down.
 */
export function heightField(kind, p) {
  const s = p.seedN | 0;
  if (kind === 'dune') {
    // Crests run along the wind vector (wx, wy); the fold gives them a period,
    // and a low-frequency fbm bends the whole set so no two crests are parallel
    // for long. `sharp` biases the fold to a slip face on the lee side.
    const { wx, wy, period, warp, amp, base, sharp } = p;
    return (x, y) => {
      const w = fbm(x * 0.011, y * 0.011, s + 41, 3) - 0.5;
      const t = (x * wx + y * wy) / period + w * warp;
      const f = tri(t);
      // ASYMMETRY IS THE WHOLE FORM. A dune has a long windward ramp and a
      // short slip face at the angle of repose, and it is the slip face that
      // makes it read as a dune rather than as a contour map: on the ramp the
      // terraces come out wide and pale, on the slip face they stack into a
      // dark cliff band a few pixels apart. A symmetric fold gives two identical
      // ramps and the picture turns into topography.
      const crest = f < sharp ? f / sharp : 1 - (f - sharp) / (1 - sharp);
      // Smoothstep only the WINDWARD half, so the crest is rounded and the brink
      // stays a brink.
      const dune = f < sharp ? crest * crest * (3 - 2 * crest) : crest;
      const roll = fbm(x * 0.024, y * 0.024, s + 97, 3);
      return base + amp * (dune * 0.72 + roll * 0.28);
    };
  }
  if (kind === 'shore') {
    // ONE MONOTONE GRADIENT DECIDES EVERYTHING. Height falls toward the water
    // along (nx, ny); the coastline is wherever that crossing lands, and it is
    // irregular because a low-frequency fbm is added to the gradient rather
    // than to a mask. Bays, spits and headlands then come out of the same
    // field that decides the beach width and the dune line behind it, which is
    // Frostwind's "one hydrology field resolves..." applied to a coast.
    const { nx, ny, slope, rough, base, bar } = p;
    return (x, y) => {
      const g = (x * nx + y * ny) * slope;
      const coast = (fbm(x * 0.0075, y * 0.0075, s + 17, 4) - 0.5) * rough;
      const fine = (fbm(x * 0.041, y * 0.041, s + 53, 3) - 0.5) * rough * 0.20;
      // A longshore bar: one shallow ridge parallel to the coast, so the water
      // is not a single flat plane out to the frame edge.
      const off = g + coast;
      const b = off < -bar.at ? bar.h * (1 - Math.abs(off + bar.at) / bar.w) : 0;
      return base + off + coast * 0.0 + fine + (b > 0 ? b : 0);
    };
  }
  if (kind === 'highland') {
    const { amp, base, freq, warpAmp } = p;
    return (x, y) => {
      const wx = (fbm(x * freq * 0.42, y * freq * 0.42, s + 311, 2) - 0.5) * warpAmp;
      const wy = (fbm(x * freq * 0.42, y * freq * 0.42, s + 733, 2) - 0.5) * warpAmp;
      const r = ridged((x + wx) * freq, (y + wy) * freq, s + 7, 5);
      const bed = fbm(x * freq * 0.31, y * freq * 0.31, s + 601, 3);
      return base + amp * (r * r * 0.78 + bed * 0.22);
    };
  }
  // flat: the city's own ground, kept in the same interface so a biome that
  // wants no relief does not need a second code path anywhere downstream.
  return () => p.base || 0;
}
