// THE FALLING LAYER — rain, snow, and blown dust, drawn in front of the ink.
//
// This is the only pass in the generator that runs AFTER the silhouette sweep,
// through `stage.finish({ front })`. It has that privilege for one reason and
// it is a geometric one: falling precipitation is between the camera and every
// object in the frame, so a drop drawn before the sweep would be blackened at
// tag boundaries by the sweep and would grow keylines of its own. Nothing else
// in this project qualifies, and nothing else should use the hook.
//
// It composites over every object's SURFACE and leaves the drawing's own INK
// alone, which is a narrower claim than the hook allows and is the file's
// largest craft decision — see the `mark` guard, where it is measured.
//
// ---------------------------------------------------------------------------
// THE ARITHMETIC, WHICH IS THE WHOLE DESIGN
// ---------------------------------------------------------------------------
//
// Every animated quantity here is a function of `phase(k) = k / FRAMES` and
// must be PERIODIC WITH PERIOD 1, so frame FRAMES is frame 0 by construction.
// A drop therefore cannot simply fall — it has to arrive back where it started.
//
// The only way that closes EXACTLY, with no crossfade and no restart, is to
// make the whole field PERIODIC IN SCREEN SPACE along the direction of travel
// and advance it by exactly one period over the loop:
//
//     the field repeats every P screen pixels along its axis
//     frame k is the frame-0 field translated by round(P * phase(k))
//     at k = FRAMES the translation is P, which is the identity
//
// A drop leaving the bottom of its period is replaced by the identical drop
// entering the top, because the period above it holds the same drop. There is
// no wrap to hide because there is no wrap.
//
// THE CONSEQUENCE NOBODY WOULD GUESS, AND IT SIZES THE WHOLE THING.
//
//     the field's spatial period P must DIVIDE the loop's displacement D.
//
// Shifting by D has to be the identity, so D is a whole number of periods —
// P <= D always, never the other way round. That single line decides more than
// any taste applied on top of it:
//
//   * SLOW PRECIPITATION IS NECESSARILY DENSE ALONG ITS OWN LANE. D is 8 times
//     the per-frame step, so a 2 px/frame snowflake repeats every 16 px and a
//     1000 px column carries 62 of them. There is no way to thin that out
//     without either speeding the flake up or breaking closure. The mitigation
//     is a SET of periods rather than one: each cell repeats at its own P, and
//     the field as a whole repeats only at their lcm — 480 px for snow's
//     {16,24,32,40}, which is half a post. The per-cell repeat is real and
//     visible if you look for it; nothing available closes the loop without it.
//   * THE UNION IS EIGHT TIMES THE INSTANTANEOUS COVER. When streaks tile
//     their own lane (drawn length == per-frame step) the eight frames' drops
//     are disjoint, so the set of pixels that EVER move is exactly FRAMES times
//     the set drawn at any one frame. That is not a tuning constant, it is
//     `U = FRAMES * I`, and it is why this layer animates several per cent of
//     the frame where every other mechanism in the feed animates a fraction of
//     one. Measured and reported rather than hidden.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT THE TWINKLE FAILURE
// ---------------------------------------------------------------------------
//
// `docs/BAR.md` records the one genuinely pixel-scale element in the reference
// videos — a speckle sphere re-randomised every frame, spatial autocorrelation
// 0.341 — as the explicit do-not. Scattered single pixels appearing and
// disappearing is the worst thing this project can ship, and a precipitation
// field is the easiest possible way to ship it: hash every pixel, light the
// ones that pass, move on.
//
// Three properties keep this on the right side of that line, and each is a
// consequence of the geometry rather than a value anyone tuned:
//
//   1. A DROP IS A STREAK, NOT A PIXEL. Its drawn length along the axis is at
//      least its per-frame displacement, so consecutive frames' marks abut or
//      overlap and the mark TRANSLATES instead of being re-rolled.
//   2. THE MASK OF EVER-MOVED PIXELS IS A LANE, NOT A SCATTER. Because the
//      streak tiles its own lane, the union along an active lane is the whole
//      height of the frame, punched only where the lane crosses ink — a mask
//      whose one-pixel holes bridge back into runs of hundreds of pixels,
//      never a scatter of independent points.
//   3. THE FIELD COMES FROM A HASH OF THE CELL, NEVER FROM AN Rng DRAW. `h3`
//      is pure, so the answer for a cell does not depend on the order pixels
//      were visited, and the frame index cannot move a random draw.
//
// The amplitude floor from `docs/BAR.md` — under about one pixel of
// displacement per frame is noise rather than subtlety — binds the slow end.
// The slowest thing here is snow at 3 px/frame.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY ABSENT: WIND-SLANTED RAIN
// ---------------------------------------------------------------------------
//
// A slanted streak closes the loop perfectly well — the field is invariant
// along the streak direction, so travelling one period along it is still the
// identity. It was cut for a measurement reason, not an arithmetic one. A 1 px
// slanted line steps sideways every few rows, and two pixels either side of
// such a step are DIAGONAL neighbours. `tools/animcheck.mjs` 4-connects the
// ever-moved mask, so a slanted rain column stops being one long island and
// becomes a few hundred islands of four. Nothing about the picture got better
// and the only honest summary of the motion's shape got much worse, which is
// the wrong trade for a lean of six degrees. Vertical fall it is, and this
// paragraph is here so nobody re-derives the slant and then wonders why the
// island histogram collapsed.
//
// Snow and dust DO carry a cross-axis component, because theirs is a sway of
// two pixels either side of the lane rather than a constant lean: the drift is
// a function of position ALONG the axis, so the mark's neighbours stay
// 4-adjacent and the ribbon stays one island.

import { FRAMES, phase } from '../../core/frame.js';
import { h3 } from '../palette.js';

/**
 * Where a drop is drawn in the depth buffer.
 *
 * Nothing is drawn after this pass, so the value is only ever compared against
 * the scene beneath it — but it is set honestly rather than left at whatever
 * `put` defaults to, because a later reader asking "what is in front of what"
 * should get the right answer from the buffer.
 */
const FRONT_DEPTH = 1e9;

/**
 * The three falling layers.
 *
 * `periods` is the whole speed model. A cell draws one, its per-frame step is
 * `P / FRAMES`, and its drawn length is `P / FRAMES + lenAdd`. Every period is
 * a multiple of FRAMES so the translation is exact integer pixels at every
 * frame — a rounded step would leave the loop closing to within a pixel, which
 * is not closing.
 *
 * The periods are also chosen so their lcm is at least half a post's height,
 * which is as far as the closure constraint allows the field's own repeat to be
 * pushed. Rain {48,56,64,72,80} has lcm 20160; snow {16,24,32,40} has 480; dust
 * {32,40,48,56} has 1680. Each cell repeats at its own P; the field repeats at
 * the lcm.
 *
 * `tone` indexes a TWO-step ramp minted from ONE family — `.l` for the far
 * drops and `.t` for the near ones, which is exactly one step of the scene's
 * own lit-to-shaded ladder. Slower drops are further away and take the dimmer
 * step, so distance is spelled in the same vocabulary every other surface in
 * the frame uses.
 *
 * IT WAS THREE STEPS AND THAT WAS WRONG. The ladder is multiplicative on RGB
 * (roughly 1.00 / 0.77 / 0.57), so the third step put "far rain" at 57% of the
 * pigment — a mid-grey line over a scene whose walls sit at 60-80%, which does
 * not read as distance, it reads as dirt. Aerial perspective moves a far thing
 * TOWARD the backdrop, not below it, and one ladder step is as far as that can
 * go before it crosses.
 */
const SPEC = {
  // RAIN IS FAST, AND IN THIS PROJECT ONLY RAIN IS. 6-10 px per frame against
  // the shore swell's 1.4-2.6 and the canopy's 2. The loop-closure arithmetic
  // demands it: a period short enough to look like drizzle would put the drops
  // 24 px apart down a column.
  rain: {
    axis: 0, dir: 1, cell: 12, dens: 0.45,
    periods: [48, 56, 64, 72, 80],
    thick: [1, 1, 1, 1, 1],
    tone: [0, 0, 0, 1, 1],
    lenAdd: 2, tail: 1,
    swayAmp: 0, swayLo: 1, swayHi: 1,
    hsl: [206, 0.22, 0.93],
  },
  // SNOW DRIFTS. The sway is a function of the flake's position DOWN the
  // screen, not of the frame, so the field is still a rigid translation and the
  // flake follows a fixed sinuous path through space — which is what a flake
  // does. Its wavelength is bounded below at 4x the amplitude times the step so
  // the sideways move between frames never exceeds one pixel; at two the 2 px
  // wide mark would step clear of itself and the ribbon would break into
  // islands.
  snow: {
    axis: 0, dir: 1, cell: 8, dens: 0.25,
    periods: [16, 24, 32, 40],
    thick: [1, 1, 2, 2],
    tone: [0, 0, 1, 1],
    lenAdd: 0, tail: 0,
    swayAmp: 2, swayLo: 30, swayHi: 58,
    hsl: [212, 0.09, 0.96],
  },
  // DUST IS BLOWN, so its axis is the other one. Everything else is identical,
  // which is the point of writing the pass on an axis flag: a horizontal field
  // that was written separately would have grown its own bugs.
  //
  // Its colour is the desert's own sand family — hue 40, the `sandy` row of the
  // family table — lifted and drained rather than whitened, because dust in the
  // air is the ground with the light behind it.
  //
  // `dirVary` lets the wind blow either way, drawn once per scene. Rain and snow
  // do not get it: they fall, and "down" is not a coin toss.
  dust: {
    axis: 1, dir: 1, dirVary: 1, cell: 10, dens: 0.28,
    periods: [32, 40, 48, 56],
    thick: [1, 1, 2, 2],
    tone: [0, 0, 1, 1],
    lenAdd: 2, tail: 1,
    swayAmp: 2, swayLo: 44, swayHi: 88,
    hsl: [40, 0.34, 0.90],
  },
};

/** Per-layer hash salt, so rain and dust on one seed are not the same field. */
const SALT = { rain: 0x51ce, snow: 0x2f0e, dust: 0x7a3d };

/** Triangle wave on [0,1], period 1. Exact float arithmetic — no `Math.sin`,
 *  whose last bit is not specified across engines and would put the web build
 *  and the node harness on different pixels. */
function tri01(t) {
  const f = t - Math.floor(t);
  return f < 0.5 ? f + f : 2 - (f + f);
}

/**
 * Build the `front` callback for a stage, or null if this post has no weather.
 *
 * Returning null rather than a no-op closure is deliberate: `stage.finish`
 * tests `if (o.front)`, so a clear post does not enter this file at all and is
 * byte-identical to the same post before it existed.
 */
export function precipFront(stage) {
  const kind = stage.cond && stage.cond.precip;
  if (!kind || !SPEC[kind]) return null;
  return (cv) => paintPrecip(stage, cv, kind);
}

/**
 * THE COMPOSITION PROBLEM, AND WHY THIS PASS READS THE RECORDER.
 *
 * A drop can land on a pixel that is ALREADY animating — a stretch of swell, a
 * canopy clump. The loop stores one dense row of K values per offset and the
 * last pass to claim it wins, so if this pass simply recorded "drop, drop,
 * background, background" using the frame-0 canvas as the background, the four
 * frames where no drop covers the pixel would freeze water that the slow
 * re-render shows moving. `tools/animcheck.mjs` fails on one differing pixel
 * and it would find those.
 *
 * So the background series for a pixel is the EXISTING record's series where
 * there is one, and the flat canvas value where there is not — and the existing
 * record is only trusted if it would survive `AnimRec.finish`'s own filter,
 * which is the same two comparisons. A record that a later object already
 * invalidated is not a background, it is a stale claim.
 *
 * Measured over ten precipitation seeds, 84-318 pixels per post take their
 * background from another pass's record — 0.50-2.30% of the pixels this layer
 * touches, and highest on the shore, where the water is the other mover.
 *
 * NOT ASSUMED — DISCONFIRMED. Stubbing this function out to always return the
 * flat canvas value makes `tools/animcheck.mjs`'s oracle report 195, 208, 349
 * and 456 differing pixels on a city, a desert, a highland and a shore seed
 * respectively, and restoring it returns all four to zero. A few hundred pixels
 * is small; it is also four hard gate failures.
 */
function backgroundAt(cv, A, prev, off, K, out) {
  let r = prev ? prev[off] : -1;
  if (r >= 0) {
    const b = r * K;
    if (A.val[b] !== cv.idx[off] || A.tag[r] !== cv.tag[off]) r = -1;
  }
  if (r < 0) {
    const v = cv.idx[off];
    for (let k = 0; k < K; k++) out[k] = v;
  } else {
    const b = r * K;
    for (let k = 0; k < K; k++) out[k] = A.val[b + k];
  }
}

function paintPrecip(stage, cv, kind) {
  const S = SPEC[kind];
  const W = cv.w, H = cv.h;
  const K = stage.frames;
  const FR = stage.frame;
  const salt = SALT[kind];
  const seedN = stage.seedN;

  // THE COLOUR IS MINTED, NOT NAMED. `C.mk` is the one choke point every tone
  // in this generator passes through, so a drop goes cool and dim at night, and
  // drains and flattens under the overcast that rain and snow themselves set,
  // without this file knowing that either mechanism exists. A drop is not
  // white: rain is a pale cool step of the scene's light, snow is near-white
  // with a blue cast rather than the shared black's opposite, and dust is the
  // sand family's own hue.
  //
  // ONE family, two steps of its ladder — far and near. Minting two families
  // instead would spend twice the palette to say the same thing, and the ladder
  // IS the scene's light, which is what makes the far drops recede rather than
  // merely being greyer.
  const F = stage.C.mk(S.hsl[0], S.hsl[1], S.hsl[2]);
  const RAMP = [F.l, F.t];

  // The drop layer gets one tag. It is allocated after the silhouette sweep has
  // already run, so nothing will ever draw a keyline around a raindrop — which
  // is correct, and is a property of WHERE this pass runs rather than of a flag
  // it had to remember to set.
  const TAG = stage.tag();

  // WHICH WAY THE WIND BLOWS, drawn once per scene from the same pure hash
  // everything else here uses. It flips the sign of the per-frame shift, which
  // is the only thing direction can mean to a field that is periodic along its
  // own axis — the lattice is unchanged, so closure is untouched.
  const dir = S.dirVary && (h3(seedN, 7, salt) & 1) ? -S.dir : S.dir;

  const axisY = S.axis === 0;
  const along = axisY ? H : W;      // the coordinate a drop travels along
  const cross = axisY ? W : H;      // the coordinate lanes are indexed on
  const nCell = Math.ceil(cross / S.cell) + 1;

  // ---- the sparse record under construction --------------------------------
  //
  // One slot per pixel this pass ever touches, holding its whole K-frame series
  // — initialised to the background and overwritten frame by frame as drops
  // land on it. `slotOf` is canvas-sized and costs 1.8 MB transient on a
  // 440x1000 post; it is allocated only for the ~6% of posts that carry
  // weather, and it buys an O(1) answer to "have I already claimed this pixel",
  // which a Map over tens of thousands of offsets would not.
  const slotOf = new Int32Array(W * H).fill(-1);
  let cap = 1 << 13, nSlot = 0;
  let sOff = new Uint32Array(cap);
  let sVal = new Uint16Array(cap * K);
  let sHere = new Uint8Array(cap);      // is a drop on this pixel at frame FR?

  // The recorder's existing claims, indexed by offset. Last writer wins, which
  // is the rule `AnimRec.finish` resolves ties by, so this reads the same
  // record that would have survived.
  const A = stage.anim;
  let prev = null;
  if (K > 1 && A.n > 0) {
    prev = new Int32Array(W * H).fill(-1);
    for (let i = 0; i < A.n; i++) prev[A.off[i]] = i;
  }
  const bg = new Uint16Array(K);

  const grow = () => {
    cap *= 2;
    const o = new Uint32Array(cap); o.set(sOff); sOff = o;
    const v = new Uint16Array(cap * K); v.set(sVal); sVal = v;
    const h = new Uint8Array(cap); h.set(sHere); sHere = h;
  };

  // ---- INK IS NOT A SURFACE, AND A DROP DOES NOT ERASE IT ------------------
  //
  // This one line is the largest craft decision in the file, and it was made by
  // measurement rather than by argument. A drop is physically in front of the
  // keyline; a drop drawn ON the keyline punches a one-pixel hole in it. Letting
  // drops cover ink cost, on the same seed measured both ways (median of the
  // nine 320px crops `tools/colour.mjs` uses):
  //
  //     cells   201 -> 181  (-10%)      every hole merges two ink-enclosed
  //     faces  1285 -> 1351  (+5%)      regions that the outline separated
  //     inkClosure 6.37 -> 7.34 (+15%)  on a metric where the reference is 3.2
  //                                     and this generator is already at 8.3
  //
  // Ink closure is the one diagnostic in this repo that has ever ordered
  // genuine work above ours correctly, so a fifteen per cent regression on it
  // is not a rounding error, it is the thing the project is trying to fix
  // getting worse on one post in seventeen. With the line in, the same
  // comparison reads dCells 0 and darkShare 0.000pp, and over eighteen daylit
  // precipitation seeds the whole remaining regression is +1.3% to +6.2% —
  // added flat faces only, which is what a drop honestly is.
  //
  // AND THE PICTURE IS THE SAME EITHER WAY. Measured over eleven seeds, 5.5% to
  // 13.3% of this pass's writes land on ink — it is the frame's own dark share,
  // as it must be. Leaving those out puts single-pixel gaps in a 1 px streak
  // where it crosses a keyline, which is not visible at any zoom this project
  // ships at. The whole difference is in the numbers, and the numbers are
  // one-sided.
  //
  // WHAT IT COSTS, STATED PLAINLY, because it is not free. `animcheck` decomposes
  // the ever-moved mask into 4-connected islands, and single-pixel holes cut a
  // 1000 px rain column into pieces: the precipitation-only island p50 falls
  // from 222 to 8 and the speck share rises from 0.04% to about 2%. That is the
  // ink lattice being measured, not the motion — bridging the one-pixel holes
  // restores the columns (see the report) and the speck share is still an order
  // of magnitude inside `animcheck`'s 25% floor. A floor that is comfortably
  // cleared is worth spending to protect a metric that is not.
  //
  // It also gives the `front` hook a sharper job than "draw over everything":
  // the falling layer composites over every object's SURFACE and leaves the
  // drawing's own ink alone. Drawing before the sweep could not do that — the
  // sweep would blacken drops at tag boundaries and the drops would generate
  // keylines of their own.
  const INK = stage.C.black;

  /** Put palette index `ci` on (x,y) at frame `k`, through the slot table. */
  const mark = (x, y, k, ci) => {
    const off = y * W + x;
    if (cv.idx[off] === INK) return;
    let s = slotOf[off];
    if (s < 0) {
      if (nSlot === cap) grow();
      s = nSlot++;
      slotOf[off] = s;
      sOff[s] = off;
      backgroundAt(cv, A, prev, off, K, bg);
      const b = s * K;
      for (let i = 0; i < K; i++) sVal[b + i] = bg[i];
    }
    sVal[s * K + k] = ci;
    if (k === FR) sHere[s] = 1;
  };

  // ---- the field -----------------------------------------------------------
  for (let ci = 0; ci < nCell; ci++) {
    const hA = h3(seedN, ci, salt);

    // GUSTS. A uniform per-cell coin lands a field of even density, and real
    // weather does not have one — it thickens and thins across the frame. A
    // second hash over blocks of four cells modulates the coin between 0.55x
    // and 1.45x, which is enough to read as bands of heavier fall without
    // opening a hole anywhere.
    const hG = h3(seedN, (ci >> 2) + 4093, salt);
    const gust = 0.55 + 0.9 * (((hG >>> 11) & 255) / 255);
    if (((hA >>> 8) & 0xffff) / 65536 >= S.dens * gust) continue;

    const pi = (hA >>> 3) % S.periods.length;
    const P = S.periods[pi];
    const step = P / FRAMES;
    const T = S.thick[pi];
    const CI = RAMP[S.tone[pi]];
    const CT = RAMP[Math.max(0, S.tone[pi] - 1)];   // the fading tail
    const len = step + S.lenAdd;

    const c0 = ci * S.cell + ((hA >>> 24) % S.cell);

    const hB = h3(seedN, ci, salt + 7919);
    const a0 = (hB >>> 5) % P;
    const swayPhase = ((hB >>> 17) & 1023) / 1024;
    const swayLen = S.swayLo + (((hB >>> 9) & 63) / 64) * (S.swayHi - S.swayLo);
    // ONLY A MARK TWO PIXELS ACROSS MAY DRIFT, and this line is the whole
    // reason the island histogram is what it is. A drifting mark steps one
    // pixel sideways between frames; on a 2 px mark the two positions still
    // share a column and the ribbon is one island, while on a 1 px mark they
    // are diagonal neighbours and `animcheck`'s 4-connection cuts the lane into
    // five-pixel pieces. Measured before the gate: snow's own union came out as
    // 1503 islands at p50 5. After it, the thin far layer falls straight and
    // the near layer drifts, which is also what distance does to drift.
    const swayAmp = T > 1 ? S.swayAmp : 0;

    for (let k = 0; k < K; k++) {
      // THE ONLY THING THE FRAME INDEX IS ALLOWED TO DO. `phase(k)` is periodic
      // with period 1 by construction and P is a multiple of FRAMES, so this is
      // an exact integer and at k = FRAMES it is exactly P — one whole period,
      // the identity. There is no accumulation anywhere: frame k is computed
      // from k, never from frame k-1.
      const shift = Math.round(P * phase(k)) * dir;
      const head = (((a0 + shift) % P) + P) % P;
      for (let a = head - P; a < along; a += P) {
        for (let j = 0; j < len; j++) {
          const q = a + j;
          if (q < 0 || q >= along) continue;
          const dc = swayAmp
            ? Math.round(swayAmp * (2 * tri01(q / swayLen + swayPhase) - 1))
            : 0;
          // The trailing pixel takes the step below — a streak that fades out
          // behind its head rather than one that stops dead. On a 1 px mark
          // this is the whole of the modelling available. Which end is the tail
          // follows the wind: a streak with its soft end leading would read as
          // travelling backwards.
          const tone = (S.tail && j === (dir > 0 ? 0 : len - 1) && len > 2) ? CT : CI;
          for (let t = 0; t < T; t++) {
            const c = c0 + dc + t;
            if (c < 0 || c >= cross) continue;
            if (axisY) mark(c, q, k, tone);
            else mark(q, c, k, tone);
          }
        }
      }
    }
  }

  // ---- hand the pass's own frame to the canvas, and the rest to the loop ----
  //
  // Only pixels a drop actually covers AT THIS FRAME are written. A pixel that
  // is only wet on some other frame is left exactly as the scene left it, and
  // is recorded against the tag it already carries — which is what makes
  // `AnimRec.finish`'s filter keep it instead of reading it as a stale claim.
  const scratch = new Uint16Array(K);
  for (let s = 0; s < nSlot; s++) {
    const off = sOff[s], b = s * K;
    const x = off % W, y = (off / W) | 0;
    let tag = cv.tag[off];
    if (sHere[s]) {
      cv.put(x, y, sVal[b + FR], FRONT_DEPTH, TAG);
      tag = TAG;
    }
    if (K > 1) {
      for (let k = 0; k < K; k++) scratch[k] = sVal[b + k];
      stage.anim.push(off, tag, scratch);
    }
  }
}
