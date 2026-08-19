// Desert props — everything the erg contains that no other biome needed.
//
// TWO KINDS OF OBJECT LIVE HERE AND THEY ARE DRAWN DIFFERENTLY ON PURPOSE.
//
// Built things — a shack, a canopy, a tank stand, a fence, a drum — are boxes,
// so they lock to the 2:1 lattice and read as construction. Grown and weathered
// things — a tussock, a boulder, a drift tail, a bone — are masses generated at
// their final size from a periodic radius, so their silhouettes are off the
// lattice at every angle. `docs/ROUNDS.md` records 0.5% of our area in
// non-lattice-conforming form against the reference's 9.9%, and a desert's
// stones and scrub are one of the few honest chances this generator has at it.
//
// NO TRANSCENDENTALS ANYWHERE IN THIS FILE. `src/gen/props/nature.js` builds
// its canopies with `Math.sin`/`Math.atan2`; that is grandfathered, not a
// licence. The harmonic radius below is evaluated by Chebyshev recursion on the
// unit vector (dx, dy) — cos(2t) = dx*dx - dy*dy and so on — so every number in
// a mask comes out of `+ - * / sqrt` and is identical in node and in the
// browser worker. A phase is a hashed UNIT VECTOR rather than an angle, for the
// same reason.

import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { topFace, leftFace, rightFace } from '../faces.js';
import { h3 } from '../palette.js';
import { dep, projR } from '../view.js';
import { FRAMES, triPhase } from '../../core/frame.js';

const M = (f) => ({ top: f.t, left: f.l, right: f.r });
const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

// ---------------------------------------------------------------------------
// Organic masses.

/** Fresh one-pixel keyline by four-neighbour dilation. */
function ring(core) {
  const H = core.length, W = core[0].length;
  const solid = (j, i) => j >= 0 && j < H && i >= 0 && i < W && core[j][i] !== '.';
  const out = [];
  for (let j = -1; j <= H; j++) {
    let line = '';
    for (let i = -1; i <= W; i++) {
      if (solid(j, i)) { line += core[j][i]; continue; }
      line += (solid(j - 1, i) || solid(j + 1, i) || solid(j, i - 1) || solid(j, i + 1)) ? 'd' : '.';
    }
    out.push(line);
  }
  return out;
}

const MASKS = new Map();

/**
 * A rounded mass, generated at its final pixel size.
 *
 * `nature.js` records why this cannot be a scaled table: scaling multiplies
 * every jog in the outline by k, so a hand-drawn 1px step becomes a 2px step,
 * which IS the 2:1 stair. The contour has to be generated at the size it will
 * be drawn, and it is here — three harmonics on incommensurate phases, so the
 * boundary crosses every angle and almost none of them is on the lattice.
 */
function organic(R, sqN, variant, shift = 0) {
  const key = ((R * 32 + sqN) * 64 + variant) * 64 + (shift + 32);
  const had = MASKS.get(key);
  if (had) return had;
  const sq = sqN / 10;
  const u = (a) => (h3(a, variant, 0x5eed01) >>> 8) / 16777216;
  const A = [0.10 + 0.12 * u(1), 0.07 + 0.09 * u(2), 0.035 + 0.055 * u(3)];
  const ph = [];
  for (let n = 0; n < 3; n++) {
    const c = u(10 + n) * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - c * c)) * (u(20 + n) < 0.5 ? -1 : 1);
    ph.push(c, s);
  }
  const G = GUSTS[(h3(41, variant, 0x5eed01) >>> 5) & 7], GX = G[0], GY = G[1];
  const RX = Math.ceil(R * 1.35) + 1, RY = Math.ceil(R * 1.35 * sq) + 1;
  const core = [];
  for (let j = -RY; j <= RY; j++) {
    let line = '';
    for (let i = -RX; i <= RX; i++) {
      const jj = j / sq;
      const d = Math.sqrt(i * i + jj * jj);
      let rad = R;
      if (d > 0.0001) {
        const dx = i / d, dy = jj / d;
        const c2 = dx * dx - dy * dy, s2 = 2 * dx * dy;
        const c3 = c2 * dx - s2 * dy, s3 = s2 * dx + c2 * dy;
        const c5 = c3 * c2 - s3 * s2, s5 = s3 * c2 + c3 * s2;
        rad = R * (1 + A[0] * (c2 * ph[0] - s2 * ph[1])
          + A[1] * (c3 * ph[2] - s3 * ph[3])
          + A[2] * (c5 * ph[4] - s5 * ph[5]));
      }
      if (d > rad) { line += '.'; continue; }
      // THE GUST: inside one sector the clumping is READ ONE PIXEL OVER, so
      // that patch of the mass translates rigidly while the outline, the
      // keyline and every tag stay exactly where they were. `shift` is 0 for
      // every caller but `saltbush`, so a stone, a boulder and the sand mound
      // under a nebkha are as still as they should be.
      let ti = i, tj = j, tjj = jj;
      if (shift && d > 0 && (i * GX + jj * GY) / d > GUST_COS) ti = i - shift;
      // Two octaves of clumping on top of the light ramp, so a 20px stone is a
      // mass with a lit shoulder and a shaded flank rather than a flat blob.
      const n1 = ((h3(ti >> 1, tj >> 1, 0x2f1b + variant) >>> 8) & 15) / 15 - 0.5;
      const n2 = ((h3((ti / 6) | 0, (tj / 6) | 0, 0x71c3 + variant) >>> 8) & 15) / 15 - 0.5;
      const t = (ti * 0.55 + tjj * 0.86) / R + n1 * 0.26 + n2 * 0.34;
      line += t < -0.52 ? 'a' : t < -0.04 ? 'l' : t < 0.46 ? 'm' : 'x';
    }
    core.push(line);
  }
  const out = ring(core);
  MASKS.set(key, out);
  return out;
}

/**
 * A spray of tapered blades from one root — a bunchgrass tussock.
 *
 * The blade directions come from repeated multiplication by ONE fixed rotor
 * near the golden angle (a literal unit vector, not a trig call), so n blades
 * spread evenly without ever landing on a common divisor of the circle. A ring
 * of blades at 2*pi/n would have produced a rosette with n-fold symmetry, which
 * at 14px reads as a snowflake.
 */
function spray(R, n, variant, sqN, sec = 0, wid = 0) {
  // EVERY PARAMETER THAT CHANGES A PIXEL IS IN THE KEY, in its own fixed-width
  // slot. Slots: variant < 64, sec < SCRUB_SECTORS = 8 < 16, wid <=
  // SCRUB_GUST_MAX = 15 < 16. The 100000000 offset keeps the range disjoint
  // from `organic`'s keys, which are ((R * 32 + sqN) * 64 + variant) * 64 +
  // (shift + 32) and so stay under 100000000 for any R below 762 — the largest
  // mass this file draws is a nebkha mound at R = 12.
  const key = 100000000 + (((((R * 32 + n) * 16 + sqN) * 64 + variant) * 16 + sec) * 16 + wid);
  const had = MASKS.get(key);
  if (had) return had;
  const sq = sqN / 10;
  const u = (a) => (h3(a, variant, 0x71a3b9) >>> 8) / 16777216;
  const RX = R + 2, RY = Math.ceil(R * sq) + R + 2;
  const g = [];
  for (let j = 0; j < RY + R + 3; j++) g.push(new Array(2 * RX + 1).fill('.'));
  const BASE = RY;                                  // root row
  const put = (i, j, c) => {
    const jj = j + BASE, ii = i + RX;
    if (jj < 0 || jj >= g.length || ii < 0 || ii >= g[0].length) return;
    if (g[jj][ii] === '.' || c === 'l' || c === 'L') g[jj][ii] = c;
  };
  // The lit wedge. `SCRUB_GUST[0]` is above 1, so `wid = 0` lights nothing and
  // this function's output is byte-for-byte what it emitted before the sector
  // existed — which is what every caller passes at frame 0 and the only thing
  // the still path ever passes.
  const G = GUSTS[sec & 7], GX = G[0], GY = G[1];
  const COS_HALF = SCRUB_GUST[wid];
  const RC = -0.7373688, RS = 0.6754904;            // ~137.5 degrees
  let vx = 1, vy = 0.18;
  for (let k = 0; k < n; k++) {
    const nn = Math.sqrt(vx * vx + vy * vy) || 1;
    let bx = vx / nn, by = vy / nn;
    // ONE DECISION PER BLADE, taken from its own direction before it is drawn.
    const core = bx * GX + by * GY > COS_HALF ? 'L' : 'l';
    const len = R * (0.68 + 0.44 * u(k + 3));
    // the blade arcs over: its tip falls away from the root
    const droop = 0.35 + 0.75 * u(k + 40);
    let px = 0, py = 0;
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const rr = len * t;
      const ix = Math.round(bx * rr);
      const iy = Math.round((by * rr - rr * 0.92 + t * t * droop * len * 0.55) * sq);
      const wdt = t > 0.72 ? 0 : 1;
      for (let q = -wdt; q <= wdt; q++) put(ix + q, iy, q === 0 ? core : 'm');
      px = ix; py = iy;
    }
    put(px, py, 'x');
    const rx = bx * RC - by * RS, ry = bx * RS + by * RC;
    vx = rx; vy = ry;
  }
  // a dark heart where the blades meet, so the root reads as one thing
  for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) put(i, j, 'x');
  const out = ring(g.map((r) => r.join('')));
  MASKS.set(key, out);
  return out;
}


// ---------------------------------------------------------------------------
// HOW MUCH THE SCRUB MOVES. One grep finds every amplitude in this file.
//
// TWO UNITS, AND THEY ARE NOT INTERCHANGEABLE. A displacement is a whole screen
// pixel travelled at the extreme of the loop, and it is available only to a
// form with an interior to slide — the saltbush. A tussock has no interior, so
// its amplitudes are a TONE (whole rungs of its own colour family) and a SECTOR
// (the wedge of blades that takes that tone), and neither is a distance. See
// `TUSSOCK_LEAN_PX` for why the distinction is the whole finding here.
//
// The desert is the biome with the least headroom here. Orphan 1px islands are
// already over on three seeds in six, and scrub is exactly the kind of small
// ragged mass that manufactures them — so the scrub moves as whole clumps or it
// does not move.

/**
 * A bunchgrass tussock, and the shrub on a nebkha: ZERO, and the exclusion
 * still stands — but only for the half of it that was ever true.
 *
 * WHAT STAYS. A tussock has no interior to displace and the motion it actually
 * has is its blades LEANING, which moves the silhouette, which `blitAnim`
 * cannot represent. That needs the core change and is not in this round.
 *
 * WHAT WAS WRONG, AND IT WAS THE CONCLUSION. This comment used to read that
 * "every colour it could change is a loose pixel or two on a blade", and take
 * that as ruling out colour motion as well. Built and measured, it is false. A
 * blade's core IS one pixel wide — but every blade's core RUNS INTO THE ROOT,
 * so a wedge of blades lit together is one connected fan, not a scatter. Six
 * desert seeds, tussocks rendering alone with `SALTBUSH_SHIFT_PX` zeroed so
 * their coherence could not dilute the ratio: 11.8-15.4% of moving pixels in
 * 1-2px specks against a 25% ceiling, largest island 35-50 px, which is two to
 * four blade cores joined at the root. That is a clump. The blades were never
 * too thin; the cores were never separate.
 *
 * So the tussock now animates its COLOUR, on the same sector that runs round a
 * palm crown, and its lean stays at zero for the reason above.
 *
 * ONE MORE THING THIS COMMIT FOUND, AND IT WAS SILENT. `tussock` and `nebkha`
 * called `spray(R, n, variant, sqN, m)` — a FIFTH argument to a function with
 * four parameters. The lean was discarded on the floor and was never in the
 * cache key. Harmless while the constant was 0, and it would have shipped as
 * "the tussocks do not move" the moment it was not, which is the failure mode
 * this file's staging comment claims to have ruled out. Exactly the class of
 * bug the crown cache key was audited for; it was hiding one file over.
 */
const TUSSOCK_LEAN_PX = 0;
/**
 * A saltbush: how far one clump of its foliage travels at the extreme of the
 * loop. A saltbush is a solid mass with an interior, so unlike the tussock it
 * has something to move. Two, for the reason `CANOPY_SHIFT_PX` is two.
 */
const SALTBUSH_SHIFT_PX = 3;
/**
 * HOW DIFFERENT A LIT BLADE IS FROM AN UNLIT ONE, in rungs of the plant's own
 * colour family. One rung UP, and both directions were built and rendered.
 *
 * They move IDENTICAL PIXELS — six desert seeds, 942-1673 moving px, 11.8-15.4%
 * specks, largest island 35-50, the same figures to the digit — because which
 * blades change is not a function of what they change to. They do not look
 * alike. One rung DOWN lands the blade core on `f.r`, which is the tone
 * `massMap` already gives the blade's own EDGE, so a lit blade loses its own
 * line and the tuft reads as uniform in every frame. One rung up lands on
 * `f.t`, which is in neither, so the blade keeps all three of its tones.
 *
 * Same finding, same reason, on the palm in `src/gen/props/nature.js`. It is a
 * property of the ladder rather than of either plant: the rung below a core is
 * always the rung its edge is drawn in.
 *
 * The floor is structural, not tuned. A rung is one whole tone applied to one
 * whole blade, so either the blade changes colour or nothing does — there is no
 * amplitude between "no motion" and "one blade", and therefore no setting at
 * which only some pixels of a blade cross a threshold.
 */
const SCRUB_LIT_STEPS = 1;
/** One saltbush in this many moves at all. The rest are the still desert. */
const SCRUB_MOVES_ONE_IN = 3;
/**
 * The gust sector, as the cosine of its half-angle, and eight unit directions
 * to point it along. LITERAL VECTORS, NOT A TRIG CALL: nothing in this file
 * that decides a pixel may use a transcendental (see the file header).
 */
const GUST_COS = 0.50;
/**
 * The SCRUB's lit sector, as a cosine of its half-angle, one entry per step of
 * `wid`. A table of literals rather than a call to `Math.cos`, because nothing
 * in this file that decides a pixel may use a transcendental (see the header).
 *
 * Entry 0 is deliberately ABOVE 1: no unit vector's dot product can exceed it,
 * so `wid = 0` lights nothing at all and is the still tussock. Entry 4 is 0.50,
 * the same wedge `GUST_COS` cuts and the same one a palm crown uses — a clump
 * means one thing in this generator. The tail is padded to 16 so `?anim=`
 * reaching gain 8 clamps into a full circle rather than off the end of the
 * table or, worse, past a half turn where a cosine threshold stops widening a
 * sector and starts cutting a hole in it.
 */
const SCRUB_GUST = [
  2,          // wid 0 — nothing
  0.9659258,  // 15 deg
  0.8660254,  // 30
  0.7071068,  // 45
  0.5,        // 60 — the peak at gain 1
  0.2588190,  // 75
  0,          // 90
  -0.2588190, // 105
  -0.5,       // 120
  -0.7071068, // 135
  -0.8660254, // 150
  -0.9659258, // 165
  -1, -1, -1, -1,   // 180 and past it: the whole tussock
];
/**
 * Which entry of the table the gust reaches at its PEAK, at gain 1: 4 is 60
 * degrees. Swept at 2 / 3 / 4 / 6 — 30 / 45 / 60 / 90 degrees — on six desert
 * seeds with the tussocks rendering alone:
 *
 *   30 deg   1085 px median   largest island  31-39
 *   45 deg   1623 px median   largest island  35-50
 *   60 deg   1623 px median   largest island  35-50   <- shipped
 *   90 deg   2260 px median   largest island  48-58
 *
 * 45 AND 60 ARE THE SAME PICTURE, TO THE PIXEL, and that is a fact about this
 * plant rather than a coincidence. A tussock's blade directions come from ONE
 * fixed rotor near the golden angle applied to one fixed start vector, so every
 * tussock with the same blade count has the same set of directions, and the
 * sector is pointed along one of eight fixed `GUSTS` vectors. The dot products
 * therefore take a small discrete set of values, and there is simply no blade
 * lying between 30 and 45 degrees of any sector centre to be gained. Widening
 * the wedge does not widen the effect continuously; it steps.
 *
 * 60 is kept anyway, because it is what `GUST_COS` means next door and what a
 * palm crown uses, and because 90 costs a third more moving pixels for an
 * island that is starting to be the whole tussock.
 */
const SCRUB_GUST_STEPS = 4;
const SCRUB_GUST_MAX = 15;
const SCRUB_SECTORS = 8;            // the GUSTS table's length: one per frame
const GUSTS = [
  [1, 0], [0.7071068, 0.7071068], [0, 1], [-0.7071068, 0.7071068],
  [-1, 0], [-0.7071068, -0.7071068], [0, -1], [0.7071068, -0.7071068],
];

// ---------------------------------------------------------------------------
// MOTION. Everything in this file that moves goes through these few lines, and
// they are the same few lines in every props file so one grep finds them all.
//
// PERIODIC IN phase(k), ANCHORED AT FRAME 0. `swing` is `triPhase` minus its
// own value at k = 0. `triPhase` has period 1 in `phase(k)` and no kick at the
// wrap, so frame FRAMES is frame 0 by construction and the loop closes.
// Subtracting the k = 0 value makes the swing exactly zero at frame 0 for EVERY
// offset, which is what keeps an animated frame 0 byte-identical to the still
// render every number in `docs/` was measured on.
//
// WHOLE PIXELS, NEVER A FRACTION. `stepPx` rounds to a signed integer count of
// screen pixels before anything reads it. A fractional displacement moves only
// those edge pixels whose distance happened to sit near the boundary — that is
// scattered single-pixel substitution, i.e. flicker, i.e. the thing
// `tools/animcheck.mjs` fails a seed for. An integer displacement moves a whole
// stretch of contour together, which is what "a clump moved" means.
//
// NO Rng DRAW HAPPENS HERE. Whether an instance moves at all, and on what
// phase, come from a hash of its own world position. Drawing them from `st`
// would shift every draw after it and the still render would stop being the
// still render; drawing them from anything that saw the frame index would make
// frame 2 a different scene rather than the same scene two frames later.
const swing = (k, off) => triPhase(k, off) - triPhase(0, off);
// Whole screen pixels, symmetric about zero, and CLAMPED TO +/-DISP_MAX. The
// clamp is not cosmetic: every table cache in this file keys on the
// displacement in a fixed-width slot, and `?anim=` lets the user ask for a gain
// of 8. A displacement that overflowed its slot collided with a NEIGHBOURING
// VARIANT'S key and handed back a mask of a different shape — caught by the
// oracle at gain 3 on desert as 39 pixels whose tag changed under a sprite that
// cannot change its own silhouette.
const DISP_MAX = 31;
const stepPx = (v, amp) => {
  let a = amp * v;
  a = a < 0 ? -Math.round(-a) : Math.round(a);
  return a > DISP_MAX ? DISP_MAX : a < -DISP_MAX ? -DISP_MAX : a;
};
// The lit sector's WIDTH, in whole steps, off the same anchored triangle.
// Unsigned: a sector has no direction, so a negative half-angle is not a wedge
// pointing the other way, it is the same wedge. Still exactly zero at frame 0
// for every instance, still periodic with period 1.
const gustPx = (v, amp) => {
  const a = Math.round(amp * (v < 0 ? -v : v));
  return a > SCRUB_GUST_MAX ? SCRUB_GUST_MAX : a < 0 ? 0 : a;
};

/**
 * This instance's phase offset, or -1 when it is one of the ones that holds
 * still. One in `oneIn` moves; the rest are the still world the moving ones are
 * read against, which is the shape the reference measurement argued for.
 */
function movePhase(wx, wy, salt, oneIn) {
  const u = h3(Math.round(wx * 8), Math.round(wy * 8), salt) >>> 0;
  return (u % oneIn) ? -1 : ((u >>> 7) % FRAMES) / FRAMES;
}

/**
 * K tables, one per frame, starting at the stage's CURRENT frame — so pose 0 is
 * always the picture this render is meant to be, and the recorder's k-th entry
 * is the frame k steps later.
 */
function poseSet(A, off, amp, make) {
  if (!A || A.frames < 2 || off < 0) return [make(0)];
  // `stage.gain` is the user's `?anim=` knob and it multiplies HERE, at the one
  // site every amplitude in this file is applied, so there is no second code
  // path to keep alive: gain 0 is the still picture by arithmetic rather than by
  // a branch, and frame 0 is the still picture at EVERY gain because `swing` is
  // anchored to zero at k = 0 before the multiply. It cannot reach an Rng draw
  // or a layout decision — it only scales a displacement that is already a pure
  // function of the frame index.
  const g = A.gain === undefined ? 1 : A.gain;
  const out = new Array(A.frames);
  for (let j = 0; j < A.frames; j++) out[j] = make(stepPx(swing(A.frame + j, off), amp * g));
  return out;
}

/**
 * K sprays, one per frame — `poseSet`'s sibling for a tussock, which animates a
 * COLOUR over a fixed silhouette rather than a displacement, and so needs three
 * numbers per pose where a saltbush needs one. Same shape as `crownPoses` in
 * `src/gen/props/nature.js`, and deliberately so: the palm and the scrub are
 * the same problem, a thin radiating form that cannot move its outline.
 *
 * The sector centre advances one `GUSTS` entry per frame — a WHOLE TURN over
 * the loop, so the wrap step is the same size as every other step — and the
 * width comes off `swing`, so it is zero at frame 0 for every instance and the
 * frame-0 tussock IS the still tussock, character for character.
 */
function sprayPoses(A, off, make) {
  // TUSSOCK_LEAN_PX IS ASSERTED HERE RATHER THAN MULTIPLIED, and that is the
  // whole point of reading it in this function. `spray` has no displacement
  // parameter, because a lean moves the silhouette and that is the excluded
  // motion — so there is nothing for an amplitude to scale, and a constant that
  // is passed somewhere it cannot act is decoration. The code this replaced
  // handed it to a four-parameter function as a fifth argument and JavaScript
  // discarded it without a word; the day someone set it to 2 the tussocks would
  // have gone on not moving and nothing would have said so. A throw is what
  // `drawTerrain` does with its own silent-hole guard, for the same reason.
  if (TUSSOCK_LEAN_PX !== 0) {
    throw new Error('TUSSOCK_LEAN_PX is not implemented: a spray cannot displace ' +
      'its blades without moving its silhouette, which Canvas.blitAnim cannot ' +
      'represent. See the comment on the constant.');
  }
  if (!A || A.frames < 2 || off < 0) return [make(0, 0)];
  const g = A.gain === undefined ? 1 : A.gain;
  const m = Math.round(off * FRAMES);
  const out = new Array(A.frames);
  for (let j = 0; j < A.frames; j++) {
    const k = A.frame + j;
    out[j] = make(((k + m) % SCRUB_SECTORS + SCRUB_SECTORS) % SCRUB_SECTORS,
      gustPx(swing(k, off), SCRUB_GUST_STEPS * g));
  }
  return out;
}

const ORIGINS = new Map();
function origins(K) {
  let o = ORIGINS.get(K);
  if (!o) { o = []; for (let i = 0; i < K; i++) o.push([0, 0]); ORIGINS.set(K, o); }
  return o;
}

/**
 * Draw pose 0 exactly as `blit` would; record the rest only when recording.
 *
 * THE DEPTH IS ROUNDED TO FLOAT32 BEFORE IT IS HANDED OVER, and that is a
 * workaround for a bug in `Canvas.blitAnim`, not a stylistic choice. `Canvas`
 * stores depth in a `Float32Array`, so `blit` writes `fround(d)`; `blitAnim`
 * then re-tests each pose with `d >= this.depth[o]`, comparing the ORIGINAL
 * DOUBLE against its own float32 rounding. Whenever that rounding goes up — for
 * roughly half of all depths — the test fails on a pixel pose 0 itself just
 * drew, the pose is treated as not covering it, and the motion is silently
 * dropped. Measured on one city seed: 67 pixels recorded where 279 changed.
 *
 * Passing a depth that is already exactly representable makes the comparison
 * agree with itself. The proper fix is one line in `src/core/canvas.js` and is
 * in the report; this keeps the rounding identical on both branches so the
 * still render and the animated frame 0 stay the same picture.
 */
function putPoses(cv, x0, y0, ps, map, d, A) {
  const df = Math.fround(d);
  if (ps.length > 1 && A && A.anim) cv.blitAnim(x0, y0, ps, origins(ps.length), map, df, A.anim);
  else cv.blit(x0, y0, ps[0], map, df);
}

const massMap = (C, f, lit) => ({
  d: C.black, a: f.t, l: f.l, m: f.r, x: f.k,
  // `L` is the LIT blade core and defaults to the unlit one, so every caller
  // without a lit tone maps it to exactly what it maps `l` to.
  L: lit === undefined ? f.l : lit, '.': -1,
});

/**
 * The lit tone: `steps` rungs up the plant's OWN colour family. A rung off the
 * scene's ladder rather than a minted lighter green, so it varies with the
 * scene's light like every other tone here and costs the palette nothing.
 */
function litTone(f, steps) {
  const ramp = [f.k, f.r, f.l, f.t];       // the family's own ladder, dark to light
  const i = 2 + steps;                     // `l`, the blade core, is rung 2
  return ramp[i < 0 ? 0 : i > 3 ? 3 : i];
}

// ---------------------------------------------------------------------------
// Ground-level scatter.

/** A stone lying on the pavement. The workhorse of hamada density. */
export function stone(cv, iso, C, st, x, y, z, f, R) {
  const rows = organic(R, st.int(5, 7), st.int(0, 15));
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    massMap(C, f), dep(iso, x, y, z, 0.8));
}

/** A boulder: a stone with a shaded skirt where it beds into the ground. */
export function boulder(cv, iso, C, st, x, y, z, f, R) {
  const skirt = organic(Math.max(4, Math.round(R * 1.15)), 4, st.int(0, 15));
  const ps = projR(iso, x, y, z);
  cv.blit(ps[0] - (skirt[0].length >> 1), ps[1] - (skirt.length >> 1), skirt,
    { d: -1, a: f.k, l: f.k, m: f.k, x: f.k, '.': -1 }, dep(iso, x, y, z, 0.4));
  const rows = organic(R, st.int(6, 8), st.int(0, 15));
  cv.blit(ps[0] - (rows[0].length >> 1), ps[1] - rows.length + 3, rows,
    massMap(C, f), dep(iso, x, y, z, 1.0));
}

/** Bunchgrass — never on mobile sand. */
export function tussock(cv, iso, C, st, x, y, z, f, R, A) {
  const n = st.int(7, 11), variant = st.int(0, 15), sqN = st.int(6, 8);
  const off = movePhase(x, y, 0x7ae413, SCRUB_MOVES_ONE_IN);
  const lit = litTone(f, Math.round(SCRUB_LIT_STEPS * (A && A.gain !== undefined ? A.gain : 1)));
  const ps = sprayPoses(A, off, (sec, wid) => spray(R, n, variant, sqN, sec, wid));
  const p = projR(iso, x, y, z);
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - ps[0].length + 3, ps,
    massMap(C, f, lit), dep(iso, x, y, z, 0.9), A);
}

/**
 * A nebkha: a shrub that has trapped its own mound of sand.
 *
 * The margin species, and the one object in the biome that is literally made of
 * the placement axis — a nebkha exists exactly where sand is mobile enough to
 * be caught and not so mobile that it buries the plant.
 */
export function nebkha(cv, iso, C, st, x, y, z, sandF, bushF, R, A) {
  const mound = organic(Math.round(R * 1.5), 4, st.int(0, 15));
  const p = projR(iso, x, y, z);
  // The MOUND never moves. Sand that has been sitting there long enough to bury
  // a shrub is the stillest thing in the biome; only the shrub on top of it
  // catches the wind.
  cv.blit(p[0] - (mound[0].length >> 1), p[1] - mound.length + 3, mound,
    { d: C.black, a: sandF.t, l: sandF.t, m: sandF.l, x: sandF.r, '.': -1 },
    dep(iso, x, y, z, 0.5));
  const n = st.int(6, 9), variant = st.int(0, 15), sqN = st.int(7, 9);
  const off = movePhase(x, y, 0x2b90cf, SCRUB_MOVES_ONE_IN);
  const lit = litTone(bushF, Math.round(SCRUB_LIT_STEPS * (A && A.gain !== undefined ? A.gain : 1)));
  const ps = sprayPoses(A, off, (sec, wid) => spray(R, n, variant, sqN, sec, wid));
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - ps[0].length - 1, ps,
    massMap(C, bushF, lit), dep(iso, x, y, z + 1.2, 1.2), A);
}

/** A low woody saltbush, on pavement and pan margin. */
export function saltbush(cv, iso, C, st, x, y, z, f, R, A) {
  const sqN = st.int(5, 6), variant = st.int(0, 15);
  const off = movePhase(x, y, 0x51c7a9, SCRUB_MOVES_ONE_IN);
  const ps = poseSet(A, off, SALTBUSH_SHIFT_PX, (m) => organic(R, sqN, variant, m));
  const rows = ps[0];
  const p = projR(iso, x, y, z);
  // Three stems, so it is bedded in the ground rather than floating on it.
  //
  // THEY ARE DRAWN BEFORE THE MASS, WHICH IS A CORRECTNESS FIX AND NOT A TIDY-
  // UP. They sit 0.05 nearer than the mass, so they win the depth test either
  // way and the picture is byte-identical — but drawn AFTER, they overwrite
  // pixels `blitAnim` has already recorded, and where a stem's colour happens
  // to equal the mass's own dark the record survives the filter and then lies
  // about a pixel the stem owns. One pixel on one seed in six, found by the
  // oracle. Drawn first, the depth test rejects those pixels at record time and
  // the recorder never claims them.
  for (let k = -1; k <= 1; k++) {
    cv.putZ(p[0] + k * 2, p[1] - 1, f.k, dep(iso, x, y, z, 0.95));
    cv.putZ(p[0] + k * 2, p[1], f.k, dep(iso, x, y, z, 0.95));
  }
  putPoses(cv, p[0] - (rows[0].length >> 1), p[1] - rows.length + 3, ps,
    massMap(C, f), dep(iso, x, y, z, 0.9), A);
}

/**
 * A drift tail: the sand shadow every obstacle in a wind field carries.
 *
 * Cut as a teardrop in GROUND coordinates rather than blitted, so it lies in
 * the plane and its contour is a quadratic curve at an arbitrary angle. This is
 * the cheapest large off-lattice ground facet in the biome, and there is one
 * behind every object big enough to make one.
 */
export function driftTail(cv, iso, C, x, y, z, dx, dy, len, wid, f) {
  const R = len + wid + 2;
  const F = topFace(iso, z, x - R, y - R);
  const px = -dx, py = -dy;                        // downwind, from the obstacle
  const rim = 0.5;
  drawSlab(cv, iso, x - R, y - R, z, R * 2, R * 2, (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu - R;
    const v = F.av * sx + F.bv * sy + F.cv - R;
    const a = u * px + v * py;                     // along the tail
    if (a < -wid * 0.7 || a > len) return -1;
    const b = u * py - v * px;                     // across it
    // half-width tapers from `wid` at the obstacle to nothing at the tip
    const t = a < 0 ? 1 + a / (wid * 0.7) : 1 - a / len;
    const hw = wid * t * (0.45 + 0.55 * t);
    const e = hw - (b < 0 ? -b : b);
    if (e < 0) return -1;
    if (e < rim) return f.r;
    return e < rim * 3 ? f.l : f.t;
  });
}

/** Bleached bone: a skull and a short run of ribs. */
export function bones(cv, iso, C, st, x, y, z, f) {
  const p = projR(iso, x, y, z);
  const d = dep(iso, x, y, z, 0.6);
  const sk = ['.###.', '#####', '##.##', '#####', '.###.', '..#..'];
  cv.blit(p[0] - 2, p[1] - 5, sk, { '#': f.t, '.': -1 }, d);
  cv.blit(p[0] - 3, p[1] - 6, ['.###.'], { '#': f.k, '.': -1 }, d);
  const n = st.int(3, 5);
  for (let i = 0; i < n; i++) {
    const j = p[1] + i;
    cv.blit(p[0] + 3 + i * 2, j, ['####'], { '#': i & 1 ? f.l : f.t }, d);
  }
}

/** A tyre, dumped. Round, dark, and its own material rather than a hole. */
export function tyre(cv, iso, C, st, x, y, z) {
  const rows = organic(st.int(4, 5), 4, st.int(0, 15));
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - (rows.length >> 1), rows,
    { d: C.black, a: C.rubber.l, l: C.rubber.l, m: C.rubber.r, x: C.rubber.k, '.': -1 },
    dep(iso, x, y, z, 0.7));
}

// ---------------------------------------------------------------------------
// Markers and fences.

/** A cairn: the one place-kind a landform that will not hold a road can make. */
export function cairn(cv, iso, C, st, x, y, z, f) {
  const n = st.int(3, 5);
  let s = st.range(2.6, 3.4), zz = z;
  for (let i = 0; i < n; i++) {
    const j = st.range(-0.3, 0.3);
    box(cv, iso, x + j, y - j, zz, s, s, s * st.range(0.52, 0.78),
      { top: i & 1 ? f.t : f.l, left: f.r, right: f.k });
    zz += s * 0.62;
    s *= st.range(0.72, 0.88);
  }
}

/** A painted marker post beside the track. */
export function markerPost(cv, iso, C, st, x, y, z, a) {
  box(cv, iso, x, y, z, 0.9, 0.9, st.range(4.2, 5.6), MD(C.concrete));
  box(cv, iso, x - 0.1, y - 0.1, z + 3.0, 1.1, 1.1, 1.0,
    { top: a.t, left: a.t, right: a.l });
}

/**
 * A sand fence: slats with gaps, which is what makes it work and what makes it
 * draw. The gaps are cut in face coordinates so the fence reads as a comb at
 * any length instead of as a wall.
 */
export function windFence(cv, iso, C, st, x, y, z, len, ax, f) {
  const h = st.range(2.8, 4.0);
  const w = ax === 0 ? len : 0.5, d = ax === 0 ? 0.5 : len;
  const F = ax === 0 ? leftFace(iso, y + d, x, z) : rightFace(iso, x + w, y, z);
  const pitch = st.range(1.4, 2.0);
  const slat = (lit, dk) => (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu;
    const v = F.av * sx + F.bv * sy + F.cv;
    if (v > h - 0.5) return dk;                    // a top rail closes the comb
    return ((u % pitch) < pitch * 0.55) ? lit : -1;
  };
  box(cv, iso, x, y, z, w, d, h, {
    top: f.t,
    left: ax === 0 ? slat(f.l, f.k) : f.r,
    right: ax === 0 ? f.r : slat(f.r, f.k),
  });
  for (let i = 0; i < len; i += st.range(5.5, 8.5)) {
    box(cv, iso, x + (ax === 0 ? i : -0.35), y + (ax === 0 ? -0.35 : i),
      z, 1.2, 1.2, h + 0.9, { top: f.t, left: f.k, right: f.r });
  }
}

/** A wire fence: posts, a top rail and two strands in the post's own dark. */
export function wireFence(cv, iso, C, st, x, y, z, len, ax, f) {
  const h = st.range(3.0, 3.8);
  const pitch = st.range(5.0, 7.0);
  for (let i = 0; i <= len; i += pitch) {
    const px = x + (ax === 0 ? i : 0), py = y + (ax === 0 ? 0 : i);
    box(cv, iso, px, py, z, 0.8, 0.8, h, { top: f.t, left: f.k, right: f.r });
  }
  for (const t of [0.42, 0.74, 1.0]) {
    const zz = z + h * t;
    const a = projR(iso, x + 0.4, y + 0.4, zz);
    const b = projR(iso, x + (ax === 0 ? len : 0) + 0.4, y + (ax === 0 ? 0 : len) + 0.4, zz);
    cv.line(a[0], a[1], b[0], b[1], t === 1 ? f.r : f.k,
      dep(iso, x, y, zz, 1.4));
  }
}

/** Wind-blown litter caught against a fence line. */
export function litter(cv, iso, C, st, x, y, z, ax, a) {
  const w = ax === 0 ? st.range(1.4, 2.6) : 0.25;
  const d = ax === 0 ? 0.25 : st.range(1.4, 2.6);
  box(cv, iso, x, y, z, w, d, st.range(1.0, 2.0), { top: a.t, left: a.l, right: a.k });
}

// ---------------------------------------------------------------------------
// Track furniture.

/**
 * A telegraph pole. The wires are drawn in the pole's OWN dark, never in the
 * shared ink: a black hairline across open sand encloses nothing, and
 * `docs/BAR.md` is explicit that a stroke which bounds nothing is worse than no
 * stroke. In the pole's contour step the same line is a wire.
 */
export function telegraphPole(cv, iso, C, st, x, y, z, f, next) {
  const h = st.range(11, 15);
  box(cv, iso, x, y, z, 1.1, 1.1, h, { top: f.t, left: f.l, right: f.r });
  box(cv, iso, x - 0.25, y - 0.25, z, 1.6, 1.6, 0.9, { top: f.l, left: f.k, right: f.r });
  // crossarm, square to the wind rather than to the world
  const arm = st.range(4.6, 6.2);
  box(cv, iso, x - arm * 0.5, y + 0.3, z + h - 1.6, arm, 0.55, 0.7, MD(f));
  for (const t of [0.08, 0.5, 0.92]) {
    box(cv, iso, x - arm * 0.5 + arm * t, y + 0.28, z + h - 0.9, 0.6, 0.6, 0.7,
      { top: C.glass.t, left: C.glass.l, right: C.glass.r });
  }
  if (!next) return;
  const d = dep(iso, x, y, z + h, 2.0);
  for (const t of [0.08, 0.92]) {
    const ax0 = x - arm * 0.5 + arm * t, ay0 = y + 0.55;
    const bx0 = next[0] - arm * 0.5 + arm * t, by0 = next[1] + 0.55;
    const a = projR(iso, ax0, ay0, z + h - 0.4);
    const b = projR(iso, bx0, by0, next[2] + h - 0.4);
    // a parabolic sag: three chords, so the span is a curve and not a chord
    let px = a[0], py = a[1];
    for (let s = 1; s <= 4; s++) {
      const q = s / 4;
      const nx = Math.round(a[0] + (b[0] - a[0]) * q);
      const ny = Math.round(a[1] + (b[1] - a[1]) * q + 4 * q * (1 - q) * 3.2);
      cv.line(px, py, nx, ny, f.k, d);
      px = nx; py = ny;
    }
  }
}

/** A steel drum, standing or on its side. */
export function drum(cv, iso, C, st, x, y, z, a, lying) {
  if (lying) {
    box(cv, iso, x, y, z, 3.6, 2.1, 2.1, { top: a.t, left: a.l, right: a.r });
    box(cv, iso, x + 0.9, y - 0.06, z, 0.35, 2.22, 2.1, { top: a.k, left: a.k, right: a.k });
    box(cv, iso, x + 2.4, y - 0.06, z, 0.35, 2.22, 2.1, { top: a.k, left: a.k, right: a.k });
    return;
  }
  box(cv, iso, x, y, z, 2.2, 2.2, 3.6, { top: a.l, left: a.l, right: a.r });
  for (const t of [0.28, 0.62]) {
    box(cv, iso, x - 0.08, y - 0.08, z + 3.6 * t, 2.36, 2.36, 0.3,
      { top: a.k, left: a.k, right: a.k });
  }
  box(cv, iso, x - 0.12, y - 0.12, z + 3.6, 2.44, 2.44, 0.35,
    { top: a.t, left: a.r, right: a.k });
}

/** A stack of drums or crates, for a yard corner. */
export function drumStack(cv, iso, C, st, x, y, z, C2) {
  const n = st.int(2, 4);
  for (let i = 0; i < n; i++) {
    const a = st.pick(C2.accents);
    drum(cv, iso, C, st, x + st.range(0, 2.4), y + st.range(0, 2.4), z + (i > 1 ? 3.6 : 0), a, false);
  }
}

/**
 * A culvert where the track crosses a wash: two headwalls and a pipe mouth.
 * The one piece of civil engineering in the frame and the only place the track
 * is built rather than merely graded.
 */
export function culvert(cv, iso, C, st, x, y, z, ax, len, f) {
  const w = ax === 0 ? len : 2.4, d = ax === 0 ? 2.4 : len;
  box(cv, iso, x, y, z - 2.6, w, d, 2.9, { top: f.l, left: f.r, right: f.k });
  for (const t of [0, 1]) {
    const hx = x + (ax === 0 ? t * (len - 2.2) : -1.2);
    const hy = y + (ax === 0 ? -1.2 : t * (len - 2.2));
    box(cv, iso, hx, hy, z - 2.6, ax === 0 ? 2.2 : w + 2.4, ax === 0 ? d + 2.4 : 2.2, 3.4,
      { top: f.t, left: f.l, right: f.r });
  }
  const p = projR(iso, x + (ax === 0 ? -0.4 : w * 0.5), y + (ax === 0 ? d * 0.5 : -0.4), z - 1.9);
  cv.blit(p[0] - 3, p[1] - 3, ['.####.', '######', '######', '.####.'],
    { '#': C.black, '.': -1 }, dep(iso, x, y, z, 2.2));
}

/** A wrecked trailer, stripped: a frame, a shell and no wheels left on it. */
export function wreck(cv, iso, C, st, x, y, z, ax, a) {
  const L = st.range(9, 13), W = 3.6;
  const w = ax === 0 ? L : W, d = ax === 0 ? W : L;
  box(cv, iso, x, y, z, w, d, 1.0, MD(C.rubber));       // chassis
  const F = ax === 0 ? leftFace(iso, y + d, x, z + 1.0) : rightFace(iso, x + w, y, z + 1.0);
  const rib = (lit, dk) => (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu;
    const v = F.av * sx + F.bv * sy + F.cv;
    if (v > 2.6) return dk;
    return ((u % 4.4) < 0.7) ? dk : lit;
  };
  box(cv, iso, x, y, z + 1.0, w, d, 3.2, {
    top: a.l,
    left: ax === 0 ? rib(a.t, a.k) : a.r,
    right: ax === 0 ? a.r : rib(a.r, a.k),
  });
  // one end torn open, and the frame showing under it
  const ex = x + (ax === 0 ? L - 1.0 : 0), ey = y + (ax === 0 ? 0 : L - 1.0);
  box(cv, iso, ex, ey, z + 1.0, ax === 0 ? 1.0 : W, ax === 0 ? W : 1.0, 3.2,
    { top: a.k, left: a.k, right: a.k });
  for (let i = 1.2; i < L - 1.6; i += 3.0) {
    box(cv, iso, x + (ax === 0 ? i : 0.3), y + (ax === 0 ? 0.3 : i), z - 1.2,
      ax === 0 ? 0.7 : W - 0.6, ax === 0 ? W - 0.6 : 0.7, 1.3, MD(C.rubber));
  }
}

// ---------------------------------------------------------------------------
// The way-station.

/**
 * A low block with a plinth, a recessed window band and a parapet.
 *
 * Every interior line here is the wall's own contour step, never the shared
 * ink: `docs/BAR.md` records that drawing interior form in black is why a fifth
 * of the frame was once near-black, and a building's reveals are shadow in its
 * own material.
 */
export function lowBlock(cv, iso, C, st, x, y, z, w, d, h, wall, trim) {
  box(cv, iso, x - 0.5, y - 0.5, z, w + 1.0, d + 1.0, 0.8,
    { top: trim.l, left: trim.r, right: trim.k });
  const FL = leftFace(iso, y + d, x, z + 0.8);
  const FR = rightFace(iso, x + w, y, z + 0.8);
  const band = (F, lit, mid, glass) => (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu;
    const v = F.av * sx + F.bv * sy + F.cv;
    if (v > h - 1.1) return mid;                       // the parapet's shadow
    if (v > h * 0.42 && v < h * 0.78) {
      const p = u % 7.2;
      if (p < 0.9 || p > 6.3) return mid;
      return v > h * 0.74 || v < h * 0.46 ? mid : glass;
    }
    if (v < 0.9) return mid;
    return lit;
  };
  box(cv, iso, x, y, z + 0.8, w, d, h, {
    top: wall.l,
    left: band(FL, wall.t, wall.k, C.glass.r),
    right: band(FR, wall.l, wall.k, C.glass.d),
  });
  // parapet, with a coping in the trim colour so the roof line is a band
  box(cv, iso, x - 0.4, y - 0.4, z + 0.8 + h, w + 0.8, d + 0.8, 1.3,
    { top: trim.t, left: trim.l, right: trim.r });
  box(cv, iso, x + 0.5, y + 0.5, z + 0.8 + h, w - 1.0, d - 1.0, 0.2,
    { top: wall.k, left: wall.k, right: wall.k });
  // a door on the +y face
  const dx0 = x + w * 0.62;
  box(cv, iso, dx0, y + d - 0.16, z + 0.8, 3.2, 0.18, 5.2,
    { top: trim.r, left: trim.k, right: trim.k });
  box(cv, iso, dx0 + 0.4, y + d - 0.26, z + 0.8, 2.4, 0.14, 4.6,
    { top: trim.l, left: wall.d, right: trim.k });
}

/**
 * The canopy: a deep flat shade roof on posts, with a fascia band.
 *
 * This is the hero's silhouette — a big horizontal plate floating clear of the
 * ground on four thin legs is structurally unlike anything else in a landscape
 * of mounds and stones, and it is what the eye lands on in the first second.
 */
export function canopy(cv, iso, C, st, x, y, z, w, d, h, post, fascia, deck) {
  for (const [px, py] of [[x, y], [x + w - 1.3, y], [x, y + d - 1.3], [x + w - 1.3, y + d - 1.3]]) {
    box(cv, iso, px, py, z, 1.3, 1.3, h, { top: post.t, left: post.k, right: post.r });
    box(cv, iso, px - 0.3, py - 0.3, z, 1.9, 1.9, 0.7, { top: post.l, left: post.k, right: post.r });
  }
  // the underside, in the deck's own dark — a deep canopy is mostly shadow
  box(cv, iso, x - 1.4, y - 1.4, z + h - 0.9, w + 2.8, d + 2.8, 0.9,
    { top: deck.t, left: deck.k, right: deck.k });
  // the fascia band: one saturated colour that means "this is the station"
  box(cv, iso, x - 1.7, y - 1.7, z + h, w + 3.4, d + 3.4, 1.5, {
    top: deck.l,
    left: (sx, sy) => (((sx + sy) >> 2) & 3) === 0 ? fascia.k : fascia.t,
    right: fascia.r,
  });
  box(cv, iso, x - 1.4, y - 1.4, z + h + 1.5, w + 2.8, d + 2.8, 0.35,
    { top: deck.l, left: deck.r, right: deck.k });
}

/** A water tank on a braced stand — the tallest thing for a long way. */
export function tankStand(cv, iso, C, st, x, y, z, legH, R, leg, tank) {
  const s = R * 2;
  for (const [px, py] of [[x, y], [x + s - 1.1, y], [x, y + s - 1.1], [x + s - 1.1, y + s - 1.1]]) {
    box(cv, iso, px, py, z, 1.1, 1.1, legH, { top: leg.t, left: leg.k, right: leg.r });
  }
  for (const t of [0.34, 0.72]) {
    box(cv, iso, x, y + 0.2, z + legH * t, s, 0.4, 0.4, { top: leg.l, left: leg.r, right: leg.k });
    box(cv, iso, x + 0.2, y, z + legH * t, 0.4, s, 0.4, { top: leg.l, left: leg.k, right: leg.r });
  }
  box(cv, iso, x - 0.7, y - 0.7, z + legH, s + 1.4, s + 1.4, 0.7,
    { top: leg.l, left: leg.r, right: leg.k });
  // the tank: a stack of three rings, so it is a cylinder and not a crate
  const rings = [[0.0, 0.0, s, 1.0], [-0.5, -0.5, s + 1.0, R * 1.5], [0.0, 0.0, s, 1.1]];
  let zz = z + legH + 0.7;
  for (const [ox, oy, sz, hh] of rings) {
    box(cv, iso, x + ox, y + oy, zz, sz, sz, hh, {
      top: tank.t,
      left: (sx, sy) => (((sx - sy) >> 1) % 7 === 0) ? tank.k : tank.l,
      right: tank.r,
    });
    zz += hh;
  }
  box(cv, iso, x + R - 1.4, y + R - 1.4, zz, 2.8, 2.8, 0.9,
    { top: tank.t, left: tank.r, right: tank.k });
  // a ladder up the near leg
  for (let t = 0.1; t < 1.0; t += 0.13) {
    box(cv, iso, x + s - 1.3, y + s + 0.1, z + legH * t, 1.5, 0.2, 0.22,
      { top: leg.r, left: leg.k, right: leg.k });
  }
}

/** A fuel island: a kerb, two pumps and a hose gantry. */
export function pumpIsland(cv, iso, C, st, x, y, z, n, kerb, a) {
  const L = 3.0 + n * 5.0;
  box(cv, iso, x, y, z, L, 4.2, 0.9, { top: kerb.l, left: kerb.r, right: kerb.k });
  for (let i = 0; i < n; i++) {
    const px = x + 2.0 + i * 5.0;
    box(cv, iso, px, y + 1.1, z + 0.9, 2.6, 2.0, 5.4, { top: a.l, left: a.t, right: a.r });
    box(cv, iso, px + 0.4, y + 1.0, z + 4.2, 1.8, 0.16, 1.5,
      { top: a.k, left: C.white.t, right: a.k });
    box(cv, iso, px - 0.2, y + 0.9, z + 6.3, 3.0, 2.4, 0.7,
      { top: a.t, left: a.r, right: a.k });
    box(cv, iso, px + 2.6, y + 1.6, z + 3.4, 0.5, 0.5, 1.4, MD(C.rubber));
  }
}

/** A rough shack: mono-pitch corrugated roof on a boarded box. */
export function shack(cv, iso, C, st, x, y, z, w, d, h, wall, roof) {
  const FL = leftFace(iso, y + d, x, z);
  const FR = rightFace(iso, x + w, y, z);
  const boards = (F, lit, dk) => (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu;
    const v = F.av * sx + F.bv * sy + F.cv;
    if (v < 0.5) return dk;
    return ((u % 2.6) < 0.42) ? dk : lit;
  };
  box(cv, iso, x, y, z, w, d, h, {
    top: wall.l, left: boards(FL, wall.t, wall.k), right: boards(FR, wall.r, wall.k),
  });
  // the roof leans: a stepped wedge, one step per unit, so the eaves come off
  // the lattice at a pitch the box grammar cannot make
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    box(cv, iso, x - 0.6 + w * t * 0.0, y - 0.6 + (d + 1.2) * t, z + h + t * 1.9,
      w + 1.2, (d + 1.2) / steps + 0.1, 0.55,
      { top: roof.t, left: roof.k, right: roof.r });
  }
  const dw = Math.min(2.6, w * 0.4);
  box(cv, iso, x + w * 0.3, y + d - 0.14, z, dw, 0.16, Math.min(h - 0.4, 5.0),
    { top: roof.r, left: wall.d, right: wall.k });
}

/** A tent: two sloped planes and a ridge, guyed at the corners. */
export function tent(cv, iso, C, st, x, y, z, w, d, cloth) {
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const hh = (1 - Math.abs(t * 2 - 1)) * d * 0.55;
    box(cv, iso, x, y + d * (i / steps), z, w, d / steps + 0.05, Math.max(0.4, hh), {
      top: cloth.t,
      left: (sx, sy) => (((sx + sy) >> 2) & 3) === 0 ? cloth.k : cloth.l,
      right: cloth.r,
    });
  }
  for (const [px, py] of [[x - 1.0, y - 1.0], [x + w + 0.4, y + d + 0.4]]) {
    box(cv, iso, px, py, z, 0.5, 0.5, 1.2, MD(C.wood));
  }
}
