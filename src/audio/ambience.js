// src/audio/ambience.js — the sound of the place the picture is of.
//
// WHY THIS IS ONE MODULE WITH THE CONDITIONS AND NOT A SET OF EFFECTS.
//
// The invariant that matters is that the audio and the picture can never
// disagree about the weather. `src/gen/conditions.js` resolves a post's time
// and weather exactly once, `src/app/main.js` hands the SAME resolved object to
// the scene worker and to the audio worker, and this file reads it. Nothing
// here re-derives anything from the seed: a second resolution of the same seed
// would be a second opinion, and two opinions is how a rendered picture ends up
// raining over a track that is not.
//
// IT GOES UNDER THE MUSIC, NOT BESIDE IT.
//
// Ambience that competes is a second arrangement, and the complaint this whole
// round is answering is that there is already too much going on. Every layer
// here is a NOISE BED, 20-30 dB below the tune, with no pitch and no rhythm, so
// it can only ever be read as the room the music is in. The one place it
// becomes audible on its own terms is the rest this composer now has: when the
// bass drops out for a bar the silence is not digital zero any more, it is
// surf, or rain, or the wind. That interaction is the point of building both.
//
// NOTHING HERE IS SAMPLED AND NOTHING HERE IS QUOTED. Each layer is the
// engine's own 15-bit LFSR noise (the same one the hats and snare use)
// sample-and-held at a chosen rate, one-pole filtered, and swelled by a slow
// raised-cosine. A "wind" is a dark bed with a 12-second breath in it; "surf"
// is the same bed with a deeper, slower breath and a little more top.

/**
 * What each WEATHER puts in the air.
 *
 *   period  sample-and-hold length in samples. 1 is bright hiss; 12 is a dark
 *           rumble. This is the LFSR's clock, exactly as on the drum channel.
 *   lp      one-pole lowpass coefficient, 0..1. Small is dark.
 *   hp      one-pole highpass corner in Hz, or 0. Rain needs it; wind must not
 *           have it or it stops being weight and becomes hiss.
 *   swellHz how often the bed breathes.
 *   depth   how much of the level the breath takes, 0..1.
 *   gain    linear, before the time-of-day trim.
 *
 * THE GAINS ARE SET ON A MEASUREMENT, not on a feeling. The first draft put the
 * bed 26.2-40.7 dB under the mix RMS across 56 condition combinations, and a
 * clear-day biome bed at -50 dBFS is not quiet, it is absent. These put it
 * roughly 20-30 dB under: inaudible as a layer while the tune is playing, and
 * the thing you hear in the bar the bass drops out of. The ceiling on them is
 * the rest itself — a bed loud enough to fill the holes would delete the
 * quiet this round spent two commits creating.
 */
export const WEATHER_AIR = {
  clear:    null,
  overcast: { period: 6, lp: 0.030, hp: 0, swellHz: 0.055, depth: 0.55, gain: 0.032 },
  fog:      { period: 9, lp: 0.018, hp: 0, swellHz: 0.032, depth: 0.45, gain: 0.040 },
  haze:     { period: 7, lp: 0.026, hp: 0, swellHz: 0.045, depth: 0.50, gain: 0.028 },
  rain:     { period: 1, lp: 0.520, hp: 700, swellHz: 0.130, depth: 0.22, gain: 0.060 },
  snow:     { period: 3, lp: 0.075, hp: 0, swellHz: 0.048, depth: 0.55, gain: 0.026 },
  dust:     { period: 4, lp: 0.048, hp: 120, swellHz: 0.070, depth: 0.65, gain: 0.048 },
};

/**
 * What each PLACE sounds like with nothing happening — the bed a clear day
 * still has. The city is deliberately the quietest and dullest of the four: a
 * distant rumble is the most a city can contribute without becoming traffic,
 * and traffic is a sound effect, not weather.
 */
export const BIOME_AIR = {
  shore:    { period: 3, lp: 0.055, hp: 90, swellHz: 0.105, depth: 0.80, gain: 0.102 },
  desert:   { period: 6, lp: 0.030, hp: 0, swellHz: 0.062, depth: 0.70, gain: 0.058 },
  highland: { period: 5, lp: 0.038, hp: 0, swellHz: 0.078, depth: 0.72, gain: 0.065 },
  city:     { period: 11, lp: 0.014, hp: 0, swellHz: 0.040, depth: 0.35, gain: 0.044 },
};

/**
 * NIGHT QUIET. Not an extra layer — a trim on the ones already there, plus one
 * very dark, very slow bed. Night in this feed is a change of key (see the note
 * in src/gen/conditions.js), and a change of key is quieter, not busier.
 */
export const NIGHT_AIR = { period: 14, lp: 0.011, hp: 0, swellHz: 0.026, depth: 0.40, gain: 0.028 };

/** Level trim by time of day, applied to every layer. */
const TIME_TRIM = { day: 1, golden: 0.88, night: 0.62 };

/**
 * Build the ambience spec for a post.
 *
 * @param cond  the RESOLVED conditions object, or null for none.
 * @param st    an Rng stream, for the small per-post variation. Its own named
 *              stream in the caller, per law 2 in src/core/rng.js.
 * @returns { layers: [...], reg } or null when the post has no air at all.
 */
export function planAmbience(cond, st) {
  if (!cond) return null;
  const layers = [];
  const trim = TIME_TRIM[cond.time] ?? 1;

  const push = (spec, why) => {
    if (!spec) return;
    // Per-post variation, small: two posts in the same rain are the same
    // weather, not the same recording.
    layers.push({
      why,
      period: Math.max(1, Math.round(spec.period * st.range(0.85, 1.18))),
      lp: spec.lp * st.range(0.88, 1.14),
      hp: spec.hp,
      swellHz: spec.swellHz * st.range(0.80, 1.25),
      swellPhase: st.range(0, 1),
      depth: spec.depth,
      gain: spec.gain * trim * st.range(0.85, 1.15),
    });
  };

  push(BIOME_AIR[cond.biome], `biome:${cond.biome}`);
  push(WEATHER_AIR[cond.weather], `weather:${cond.weather}`);
  if (cond.night) push(NIGHT_AIR, 'time:night');

  if (!layers.length) return null;
  // One LFSR seed for the whole bed. Deterministic, and never the clock.
  return { layers, reg: (st.int(1, 0x7ffe) | 1) };
}
