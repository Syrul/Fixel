// WHEN a post is, and WHAT THE WEATHER IS DOING. One system, not two.
//
// This file is the sibling of `biome-mix.js` and it exists for the same two
// reasons. It is a pure function of the seed, because a post's identity is its
// seed and `?seed=N` has to restore the same picture including its light. And
// it has ONE dependency — the RNG — so `src/app/main.js` can read a seed's
// conditions on the main thread without pulling the generator, the terrain
// substrate and every prop library into the main bundle.
//
// WHY TIME AND WEATHER ARE ONE MODULE AND NOT TWO.
//
// They are not independent and building them separately produces nonsense.
// Night rain is not night plus rain: the light that a wet road reflects at
// night comes from windows and lamps rather than from the sky, so the same
// "wet" modifier that darkens a road at noon has to brighten its specular
// steps after dark. Fog at dusk is not dusk plus fog: fog removes the
// directional light that IS dusk, so the two cancel rather than add. A single
// resolved `conditions` object lets the palette answer those as one question.
//
// WHY WEATHER IS ADMITTED BY BIOME.
//
// The same rule the placement axes already follow. Snow in the desert is
// wrong, dust on the shore is wrong, and a weather system that draws from one
// global table produces exactly those. Each biome gets a VOCABULARY — the
// weathers that can happen there — and a weight for each. It is the same move
// as `BIOME_WEIGHTS`: the mix is a decision, not an accident.
//
// THE MIX IS THE FEATURE, NOT THE EFFECT.
//
// Learned once already with the biome weighting, and it applies harder here.
// CLEAR DOMINATES on every biome. A feed where every post has weather is a
// feed with no weather — the exception is what makes a clear post read as
// clear, and if there is no clear there is no exception. Likewise night: a
// night post is a CHANGE OF KEY, and a change of key stops working when it is
// as common as the key.
//
// THE WEIGHTS ARE SET ON THE JOINT DISTRIBUTION, NOT ON THE MARGINALS, and the
// first draft got that wrong in a way worth recording. Time and weather are
// independent draws, so the share of posts that are a PLAIN CLEAR DAY — the
// reference condition, the light every craft number in `docs/` was measured
// under — is the PRODUCT of the two. Day at 60% and clear at 65% each read as
// comfortably dominant on their own, and together they left only 39.4% of the
// feed unmodified: a scroll of twelve had one plain post in it. Both marginals
// looked conservative and the feed did not.
//
// Set on the product instead. Measured over 4,000 consecutive posts of the real
// seed walk: day 72.4% / golden 16.4% / night 11.2%, clear 80.8%, a falling
// layer on 5.9% — about one post in seventeen — and 58.4% of posts a plain
// clear day. The longest run of consecutive night posts is 3.
//
// Checked at the HEAD of the feed separately, because the walk in `main.js`
// redraws a seed until its biome differs from its predecessor's and a redraw
// that correlated with conditions would bias exactly the twelve posts anyone
// actually sees. Over the first twelve posts of 400 different `?seed=` values:
// plain 58.1%, night 11.7%, falling layer 5.9%. It does not bias them.

import { Rng } from '../core/rng.js';
import { pickBiome } from './biome-mix.js';

/**
 * The times of day. `day` is the reference condition — the light every craft
 * number in `docs/` was measured under — and it stays the common case.
 *
 * `golden` is the cheapest of the three to build and the largest change per
 * unit of risk: it is a low warm sun, which is a ladder and a hue, and it
 * needs no new mechanism at all.
 */
export const TIME_WEIGHTS = { day: 72, golden: 16, night: 12 };
export const TIME_KEYS = Object.keys(TIME_WEIGHTS);

/**
 * What each biome's sky is allowed to do.
 *
 * `clear` is not merely the largest weight, it is the majority on every biome.
 * The rest are ordered by how much they change the picture: `overcast` is a
 * ladder change only, `fog` and `haze` are a contrast and distance change,
 * `rain` and `snow` add a moving layer in front of the scene and are therefore
 * the rarest and the most expensive.
 *
 * The desert has no rain and no snow, and that is the whole point of admitting
 * weather by biome rather than globally. It gets `haze` and `dust` instead,
 * which are its own two ways of losing the horizon.
 */
export const WEATHER_BY_BIOME = {
  city:     { clear: 82, overcast: 10, rain: 5, fog: 3 },
  shore:    { clear: 80, overcast: 10, rain: 5, fog: 5 },
  desert:   { clear: 88, haze: 9, dust: 3 },
  highland: { clear: 76, overcast: 11, rain: 6, snow: 4, fog: 3 },
};

/** Every weather name that exists anywhere, for tools that sweep them. */
export const WEATHER_KEYS = [...new Set(
  Object.values(WEATHER_BY_BIOME).flatMap((w) => Object.keys(w)))];

/**
 * Which weathers put a moving layer IN FRONT of the scene.
 *
 * Kept here rather than in the drawing code because the recorder, the metrics
 * and the app all need to know whether a post carries one, and the answer must
 * not be a string comparison scattered across four files.
 */
export const PRECIP = new Set(['rain', 'snow', 'dust']);

/**
 * The conditions of a post. A pure function of the seed.
 *
 * ITS OWN NAMED STREAM, per law 2 in `src/core/rng.js`. Drawing conditions from
 * an existing stream would re-roll every subsequent draw in it and move every
 * scene in the feed. `cond` is new, so every seed still draws exactly the
 * sequence it drew before this file existed, and a day/clear post is
 * byte-identical to the same post before conditions existed.
 */
export function pickConditions(seed, biome = null) {
  const b = biome || pickBiome(seed);
  const s = new Rng(seed).stream('cond');
  const time = s.weighted(TIME_KEYS.map((k) => [k, TIME_WEIGHTS[k]]));
  const table = WEATHER_BY_BIOME[b] || WEATHER_BY_BIOME.city;
  const weather = s.weighted(Object.keys(table).map((k) => [k, table[k]]));
  return resolveConditions(time, weather, b);
}

/**
 * The interaction resolver, separated from the draw so a tool can ask for a
 * named condition without inventing one.
 *
 * A sweep that overrode `time` and `weather` on an already-resolved object
 * would keep the OLD `sun`, `warmth` and `wet` and produce a state this
 * function would never emit — a golden night, a dry rain. Every caller goes
 * through here, so there is one definition of what a condition means.
 */
export function resolveConditions(time, weather, b) {
  // AN UNKNOWN NAME IS REFUSED HERE, AT THE ONE PLACE THAT CANNOT BE BYPASSED.
  //
  // This function used to validate nothing, and `docs/CRAFT.md` records what
  // that cost: any unknown time fell through to `daySun 0.10` and any unknown
  // weather fell through to the FOG branch, so `--time nite --weather rian`
  // rendered a silent night and printed `nite/rian` back at you. A 56-render
  // calibration sweep was VOIDED by it, via a zsh word-splitting mistake that
  // handed every render `--time "day clear" --weather ""`.
  //
  // `tools/render.mjs` and `tools/strip.mjs` were then each given their own
  // guard, which fixed the two doors anyone had walked through and left the
  // room open. IT HAPPENED AGAIN, IN THIS SESSION, to a scratch instrument
  // driven by the same zsh mistake: five different condition cells printed five
  // byte-identical tables, and it was caught by noticing they were identical
  // rather than by any exit code. Four copies of a validator at four callers is
  // four things that can go stale; the resolver is the one place that cannot be
  // walked around, so the check belongs here and the callers' guards become a
  // better error message rather than the only line of defence.
  //
  // A THROW RATHER THAN A FALLBACK, on this repo's standing rule about silent
  // discards: a tool that echoes your typo back as a successful parameter is
  // worse than one that crashes. Nothing reachable can trip it — `pickConditions`
  // draws from the weighted tables above, and every tool validates before
  // calling — so this changes no pixel and refuses only a mistake.
  if (!TIME_KEYS.includes(time)) {
    throw new Error(`unknown time "${time}"; one of: ${TIME_KEYS.join(' ')}`);
  }
  if (!WEATHER_KEYS.includes(weather)) {
    throw new Error(`unknown weather "${weather}"; one of: ${WEATHER_KEYS.join(' ')}`);
  }

  // ---- the interactions, resolved once, here -----------------------------
  //
  // These are the reason the two are one module. Each is a fact about how two
  // conditions combine that the palette would otherwise have to rediscover,
  // and that a drawing pass would otherwise get wrong in its own way.
  //
  // `sun` is how much DIRECTIONAL light there is: it drives the spread of the
  // shading ladder, because the ladder IS the sun. Overcast and fog do not
  // darken a scene so much as flatten it, and night has almost no directional
  // light at all — what little it has comes from lamps, not from the sky.
  const overcastness = weather === 'clear' ? 0
    : weather === 'haze' ? 0.35
      : weather === 'dust' ? 0.5
        : weather === 'overcast' ? 0.7
          : weather === 'rain' ? 0.8
            : weather === 'snow' ? 0.75
              : /* fog */ 0.9;
  const daySun = time === 'day' ? 1 : time === 'golden' ? 0.82 : 0.10;
  const sun = daySun * (1 - 0.82 * overcastness);

  // Fog at dusk is not dusk plus fog. Fog removes the directional light that
  // IS dusk, so the warm low-sun cast has to fade with the same quantity that
  // flattens the ladder, or a golden post in fog comes out orange and flat —
  // which is a colour nothing in the world does.
  const warmth = time === 'golden' ? 1 - 0.85 * overcastness : 0;

  // Wet ground. Rain makes it, fog and snow leave it damp, and the SIGN of
  // what wet does flips after dark: a wet road at noon is darker than a dry
  // one because it reflects the sky away from the camera, and a wet road at
  // night is BRIGHTER in its highlights because it reflects the lamps back.
  const wet = weather === 'rain' ? 1 : weather === 'fog' ? 0.35
    : weather === 'snow' ? 0.5 : 0;

  // NIGHT UNDER A LAYER IS BRIGHTER THAN CLEAR NIGHT, NOT DARKER, and this is
  // the third interaction that only exists because time and weather are one
  // module. It has exactly the shape of the golden/fog cancellation above: two
  // conditions that each darken, which must not simply be applied twice.
  //
  // A fog or cloud deck TRAPS ground light and scatters it back down. That is
  // why an overcast night sky glows orange over a city and a clear one is
  // black, and `palette.js` already states the daylight half of it — "fog is
  // BRIGHT, not dark, and that is the part procedural weather usually gets
  // backwards". After dark the generator was getting the same thing backwards
  // in the other direction: night compressed the ramp toward 0.07, and then
  // the veil pulled what was left toward 0.16, and nothing floored the result.
  //
  // Measured, on highland at night+fog, which is where it is worst because the
  // terrain is the whole frame and there are no lit windows in it: 99.1% of the
  // picture sat below luma 48 and the ENTIRE tonal range lived in three 16-wide
  // luma bins. Eight different seeds were 0.0006 apart on the cross-seed
  // histogram — indistinguishable, the "two unrelated scenes converge on the
  // colour of the dark" failure in its most complete form, worse than the
  // 0.0035 that first raised it.
  //
  // So the ambient floor is a CONDITION, resolved here once, rather than the
  // module constant `AMB = 0.07` that `palette.js` used to hold. Clear night is
  // unchanged by construction: overcastness is 0, so the floor is still 0.07
  // and every clear-night post renders exactly as before.
  //
  // 0.16 IS A KNEE BETWEEN TWO ANCHORS, not a number that looked right. Swept
  // over 8 seeds at 0.08 / 0.12 / 0.16 / 0.20:
  //
  //   * the LOWER anchor is variety. Highland night+fog has to be as
  //     distinguishable seed-to-seed as city night+fog already was, which is a
  //     closest-pair of 0.0557. It reads 0.0133, 0.0246, 0.0566, 0.0581 — so
  //     anything below 0.16 leaves the highland collapse only partly fixed.
  //   * the UPPER anchor is that a foggy night must still be darker than a
  //     clear day. City night+fog whole-frame darkShare runs 15.5-23.0% at 0.16
  //     against day's 13.7-17.3%, and per-crop 17.9-28.9% against day's
  //     15.8-24.6% — darker on both. At 0.20 it falls to 14.4-16.2%, INSIDE the
  //     day range, and a night stops reading as a night.
  //
  // Both anchors are held at 0.16 and the upper one fails at 0.20, so the knee
  // is where the sweep put it rather than where it would have been guessed.
  const ambient = time === 'night' ? 0.07 + 0.16 * overcastness : 0.07;

  return {
    time, weather, biome: b,
    night: time === 'night',
    /** Directional light, 0 (none) to 1 (full sun). Drives the ladder spread. */
    sun,
    /** How much the sky is doing instead of the sun, 0 to 1. */
    overcast: overcastness,
    /** Low warm sun, already cancelled against overcast. */
    warmth,
    /** Wet ground, 0 to 1. Its effect INVERTS at night; see palette.js. */
    wet,
    /** The floor every tone approaches, in HSL lightness. Rises at night under
     *  a layer, because the layer scatters ground light back down. 0.07 on a
     *  clear night and by day, which is the value this used to be fixed at. */
    ambient,
    /** Ground cover, for snow. Not the falling layer — the layer already down. */
    settled: weather === 'snow' ? 1 : 0,
    /** Whether a moving layer is drawn in front of the scene. */
    precip: PRECIP.has(weather) ? weather : null,
    /** True when nothing about this post differs from the pre-conditions feed. */
    reference: time === 'day' && weather === 'clear',
  };
}

/** A short caption, for the post meta line. */
export function conditionLabel(c) {
  return c.reference ? 'clear day'
    : `${c.weather === 'clear' ? '' : c.weather + ' '}${c.time}`.trim();
}
