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
