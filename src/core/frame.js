// THE FRAME INDEX — the only thing that makes an animated Fixel post move.
//
// Animation turns the output from a function of (seed) into a function of
// (seed, TIME), and time is where determinism dies. slopscroll banned
// `performance.now()` from anything that animates and wrote `src/clock.js` in
// response; this file is the same law, made stricter by the fact that Fixel
// pre-renders.
//
// THE LAW: nothing in `src/gen/**` may read a clock. Every animated quantity is
// a function of an INTEGER FRAME INDEX `k` in [0, FRAMES), handed down from the
// caller. `performance.now()` and `Date.now()` appear in `src/app/**` only, and
// only to decide WHICH integer to show — never to compute a pixel. That is the
// same split slopscroll draws when it says of its frame budget "this is
// scheduling, not animation".
//
// WHY AN INTEGER AND NOT A FLOAT PHASE. A float phase would be a clock by
// another name: it would let a caller ask for frame 3.5, which is a picture the
// generator can produce and the harness can never check. The generator emits
// exactly FRAMES pictures per seed, the harness can render all of them, and
// byte-identity is decidable. `tools/verify.mjs --frames` depends on this.
//
// SEAMLESSNESS IS A PROPERTY OF THE ARITHMETIC, NOT OF A CROSSFADE. Every
// animated quantity reads `phase(k)`, which is `k / FRAMES`, and must be
// PERIODIC WITH PERIOD 1 in it. Then frame FRAMES is frame 0 by construction —
// the step from the last frame back to the first is the same size as every
// other step, and there is no wrap to hide. slopscroll's `loopStep` records the
// failure this avoids: a grid that does not divide the loop leaves one runt
// interval, landing exactly at the wrap, which is the single moment a viewer
// sees on every repeat.

/**
 * Frames in one loop.
 *
 * Chosen against the references in `refs/`, not by taste — see docs/ANIM.md.
 * It is a power of two so a sub-cycle (a two-pose sprite, a four-phase swell)
 * divides it exactly and therefore also closes seamlessly.
 */
export const FRAMES = 8;

/**
 * Frames shown per second.
 *
 * NOT the display refresh rate. The page runs at whatever rAF gives it and
 * SAMPLES this grid, exactly as slopscroll quantises a world's time while
 * leaving the app clock continuous. A feed whose scrolling snapped to 8fps
 * would read as a dropped frame rather than as a choice.
 */
export const FPS = 8;

/** Loop length in seconds. */
export const LOOP_SECONDS = FRAMES / FPS;

/**
 * Phase of frame `k`, in [0, 1). The ONLY thing an animated quantity may read.
 *
 * Wraps rather than clamping, so a caller that hands over a raw counter gets
 * the right picture instead of a pinned one.
 */
export function phase(k) {
  const n = ((k | 0) % FRAMES + FRAMES) % FRAMES;
  return n / FRAMES;
}

/**
 * A periodic triangle on the phase, in [0, 1], with period 1.
 *
 * The shape most subtle motion wants: a thing that drifts out and comes back
 * rather than one that snaps home at the wrap. `tri(0) === tri(1) === 0` and
 * the derivative is symmetric about the wrap, so a quantity built on it has no
 * kick at the seam — the invariant slopscroll's easing section states as "every
 * curve ARRIVES at rest".
 */
export function triPhase(k, offset = 0) {
  const u = phase(k) + offset;
  const f = u - Math.floor(u);
  return f < 0.5 ? f * 2 : (1 - f) * 2;
}

/**
 * The integer frame a wall-clock time lands on.
 *
 * THE ONE PLACE A CLOCK IS ALLOWED TO TOUCH THE ANIMATION, and it is in the app
 * layer by construction: it converts a continuous quantity into the integer the
 * generator will accept, and the generator never sees the float. Floors rather
 * than rounds, because a frame is HELD from the moment it is struck.
 */
export function frameAt(seconds) {
  const n = Math.floor(seconds * FPS);
  return ((n % FRAMES) + FRAMES) % FRAMES;
}

// ---------------------------------------------------------------------------
// AMPLITUDE GAIN — the one knob, and it belongs to the user rather than to us.
//
// "Slightly breathing" is the user's phrase. They are the only one who knows
// what they meant by it, and they will judge it on a phone. Every other number
// in this round has a derivation: the loop length comes from the closure
// constraint, the frame rate from the same, the motion's spatial shape from a
// measurement. THE AMPLITUDE HAS NONE — the reference files that were supposed
// to supply it turned out not to be pixel art, not to be loops, and to move
// 6-10 px per frame (see docs/BAR.md, "FALSIFIED"). What is left is taste, and
// taste is not ours to settle on someone else's picture.
//
// So `?anim=` multiplies every amplitude in the generator by one scalar and the
// answer arrives in four seconds on the device that matters, instead of one
// round trip per guess.
//
// IT IS NOT PART OF THE SEED AND IT MUST NEVER BECOME PART OF IT. A post's
// identity is its seed; the frame it happens to be drawn at is not. Amplitude
// is a render parameter exactly like the viewport width, which already varies
// per device without breaking `?seed=N`. Nothing in the seed walk reads it,
// nothing in the generator's Rng draws depends on it, and a link copied at
// gain 2.5 restores the same post at gain 1.
//
// IT IS ONE PATH WITH A PARAMETER, NOT TWO PATHS. There is no branch anywhere
// on the gain — every amplitude is a multiply. When the user picks a step, the
// chosen value becomes the constant, this table is DELETED, and the parameter
// goes with it. This project already carries enough retired machinery; a knob
// that outlives its decision is the next piece of it.

/**
 * Named steps, coarse enough to tell apart at a glance on a phone.
 *
 * THE BRACKET RUNS UPWARD ONLY, AND THAT IS MEASURED RATHER THAN CHOSEN. The
 * first version of this table had a `faint: 0.5` between `still` and `default`,
 * on the assumption that "slightly" means the question is how far DOWN to go.
 * It is not. Both shipped amplitudes sit at a FLOOR: below roughly one pixel of
 * displacement a band edge cannot move AS AN EDGE, so only the pixels whose
 * threshold happens to fall inside the gap flip, and independent pixels
 * flipping is the one thing this animation may not be. Measured with the swell
 * alone over six seeds, half the shipped amplitude puts 13.6-45.5% of moving
 * pixels into 1-2px islands and fails the twinkle gate on four seeds of six;
 * 0.5x of that fails all six.
 *
 * So `faint` would have shipped a knob whose only effect was to make the water
 * sparkle, and it is gone. `still` is the honest control — the same picture
 * with nothing moving — and everything else is at or above the floor.
 */
export const AMP_STEPS = {
  still: 0,       // the control: same picture, nothing moves at all
  default: 1,     // the floor, and what we believe is right
  more: 1.8,
  most: 3,        // deliberately past what we think is right, to bracket it
};

/**
 * Resolve `?anim=`. Accepts a step name or a raw multiplier, so the user can
 * bisect between two steps without being handed a new vocabulary.
 */
export function gainFor(v) {
  if (v === null || v === undefined || v === '') return 1;
  const s = String(v).trim().toLowerCase();
  if (s in AMP_STEPS) return AMP_STEPS[s];
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 8 ? n : 1;
}

/** The step name for a gain, for the caption. An A/B you cannot label is not one. */
export function gainName(g) {
  for (const k of Object.keys(AMP_STEPS)) if (AMP_STEPS[k] === g) return k;
  return String(g);
}
