// Planting.
//
// Canopies are authored blob tables rather than boxes: a cube tree reads as a
// crate, and the reference's trees are irregular masses with a hard dark edge
// on the shadow side.
//
// FOLIAGE IS WHERE THIS GENERATOR GETS ITS OFF-LATTICE FORM, and that is the
// hardest number in the project — 0.5% of our area in non-lattice-conforming
// shapes against the reference's 9.9%, a twentyfold gap. Every other mass in a
// dimetric city is a box and steps 2 across for 1 down. A canopy steps by
// whatever it likes. So a tree is not decoration here; at 26-34px it is one of
// the few things in the frame whose silhouette is genuinely organic, and it has
// to be big enough for that silhouette to be a shape rather than a smudge.
//
// The tables are therefore authored as a CORE and grown: the outer keyline is
// derived by dilation AFTER scaling, so it stays exactly one pixel however
// large the canopy is. Scaling a table that already contained its own ring
// would have produced a two-pixel outline, which the dark-run histogram reads
// as a fat outline and which is the easiest available way to lose `run1Share`.
//
//   l light leaf   m mid leaf   x leaf shadow (the leaf's OWN dark, not ink)
//   . skip                      d is added by grow(), never authored

import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { topFace, leftFace, rightFace } from '../faces.js';
import { h3 } from '../palette.js';
import { dep, projR } from '../view.js';
import { FRAMES, triPhase } from '../../core/frame.js';


// ---------------------------------------------------------------------------
// HOW MUCH THE PLANTING MOVES, IN SCREEN PIXELS. Every one of these is here so
// that a single grep finds every amplitude in the file and one edit retunes it.
//
// The unit is always a whole screen pixel of DISPLACEMENT AT THE EXTREME OF THE
// LOOP, and the loop spends most of its frames somewhere between 0 and that.
// They are set at 0 in this commit: the plumbing lands first and is provably
// inert, then the motion lands on top of it.

/**
 * A street or park canopy: how far one clump of its foliage travels, at the
 * extreme of the loop. The silhouette never moves — see `blob`.
 *
 * TWO IS THE FLOOR, NOT A PREFERENCE, and the sweep says so. At 1 the canopy's
 * tone field is noisy at the 2px octave, so a one-pixel displacement flips a
 * scatter of pixels along every contour instead of moving a contour: 22.3-38.8%
 * of the motion lands in 1-2px islands across three city seeds and
 * `tools/animcheck.mjs` rejects it as a twinkle. At 2 the same seeds read
 * 5.6-15.9% with island p50 3-6. Shrinking the constant does not make the
 * motion subtler, it makes it noise.
 */
const CANOPY_SHIFT_PX = 2;
/** A bush: the whole canopy IS about one clump at this size. */
const BUSH_SHIFT_PX = 2;
/**
 * A palm: ZERO, and this is a reasoned exclusion rather than an omission.
 *
 * `Canvas.blitAnim` can only represent a pose whose silhouette CONTAINS pose
 * 0's (see `blob`), so the only motions available are ones that add pixels. A
 * frond is a tapered arc one to five pixels wide; every additive motion it has
 * — a longer tip, a fatter blade — adds one or two loose pixels at a time, and
 * loose pixels are the one thing that may not ship. Swinging it, which is what
 * a palm actually does, is a TRANSLATION and needs the core change noted in the
 * report. Until then the palms are part of the still world.
 */
const FROND_SWING_PX = 0;

// WHAT A PALM DOES INSTEAD, AND WHY IT IS NOT A CONSOLATION PRIZE.
//
// The exclusion above is about DISPLACEMENT, and it is correct. It is not about
// motion. `Canvas.blitAnim`'s contract reads
//
//     A SPRITE MAY ANIMATE ITS COLOURS, at pixels whose tag, depth and
//     SILHOUETTE ARE IDENTICAL IN EVERY POSE.
//
// and a palm at 30-45px across does not read as a translating crown anyway. It
// reads as fronds TURNING AND CATCHING THE LIGHT. That is colour over a fixed
// silhouette: entirely inside the contract, no core change, and it is what the
// thing actually looks like.
//
// THE TWO AMPLITUDES BELOW ARE THE TONE AND THE SECTOR, and neither is a
// displacement. Every displacement amplitude in this file has a measured floor
// in screen pixels; these have a floor of a different kind, stated on each.

/**
 * HOW DIFFERENT THE LIT FROND IS FROM THE UNLIT ONE, in steps of the frond's
 * OWN colour family: +1 is one rung up the same ladder every other tone in the
 * crown is drawn from, i.e. exactly the tone `blob` gives a canopy's lit side.
 *
 * THE FLOOR HERE IS STRUCTURAL RATHER THAN TUNED, and that is the point of
 * spending a ladder rung instead of minting a lighter green. The failure this
 * round keeps finding is a step so small that only SOME pixels of a moving
 * thing cross a threshold — a scatter of independent pixels, i.e. a twinkle.
 * A ladder rung cannot do that: it is one whole tone, applied to one whole
 * frond, so either the frond changes colour or nothing does. There is no
 * amplitude between "no motion" and "one frond", by construction.
 *
 * UP RATHER THAN DOWN, AND THE REASON IS STRUCTURAL RATHER THAN TASTE. Both
 * directions were built and rendered. They move IDENTICAL PIXELS — six city
 * seeds, 966-2819 moving px, 10.4-16.2% in specks, island p50 2-3, the same
 * three figures to the digit — because which fronds change is not a function of
 * what they change to. They do not look the same at all. One rung DOWN lands
 * the frond core on `g.r`, which is the tone its own blade EDGES are already
 * drawn in, so a lit frond loses its keyline, merges into its neighbours and
 * reads as a frond going missing rather than one turning. One rung UP lands on
 * `g.t`, which is in neither the core nor the edge, so the frond keeps all
 * three of its tones and reads as a blade catching the sun — which is also the
 * thing a palm frond actually does. Whole-frame craft cannot tell the two
 * apart (every metric identical to 3 dp bar orphan 1px at 0.013 pp, which is
 * noise); the picture can tell them apart instantly.
 *
 * IT SATURATES AT ONE RUNG AND THAT IS HONEST. `stage.gain` multiplies it like
 * every other amplitude here, but the ladder has exactly one rung above the
 * frond core, so gain 1.8 and gain 3 buy the same tone. Above gain 1 the knob's
 * remaining travel goes into the sector width below.
 */
const FROND_LIT_STEPS = 1;
/**
 * HOW WIDE THE LIT SECTOR IS at the peak of the gust: the half-angle, in
 * degrees, at gain 1. Sixty is the same wedge `GUST_COS` cuts out of a canopy
 * rim — a third of the crown — and it is the width at which the sector holds
 * two or three of a palm's seven-to-nine fronds, so the thing that lights up is
 * a CLUMP rather than a frond doing something on its own.
 *
 * SWEPT 30 / 45 / 60 / 90, the palm rendering ALONE with the canopy and bush
 * amplitudes zeroed — because `docs/BAR.md` records a component clearing the
 * speck floor on its neighbours' coherence and not on its own, and that reading
 * had to be thrown away. Six city seeds each; median moving pixels and the
 * largest single moving island:
 *
 *   30 deg   1010 px   largest island  43-96      about ONE frond
 *   45 deg   1337 px   largest island  56-112
 *   60 deg   1447 px   largest island  75-112     two to three fronds
 *   90 deg   1584 px   largest island  95-118     most of the crown at once
 *
 * The speck share is flat across all four at 10.0-16.9%, so coherence does not
 * choose between them — the READING does, and the numbers say what the pictures
 * say. At 30 the sector holds one frond and four of the eight frames are
 * effectively still, so the crown blinks a blade instead of catching a gust. At
 * 90 the largest island is nearly the whole crown's core and the palm pulses as
 * a unit, which is the failure `GUST_COS` names on the canopy side. And the
 * curve flattens after 45: widening past 60 buys 9% more motion and a whole
 * frond's worth of coherence, which is the wrong trade.
 *
 * 60 is also, deliberately, the same wedge `GUST_COS` cuts out of a canopy rim.
 * The two things that move in a city post should mean the same thing by "a
 * clump", and now one number says so for both.
 */
const FROND_GUST_DEG = 60;
/**
 * The sector's quantisation, and its slot in the crown cache key. The half
 * angle is `FROND_GUST_DEG * wid / GUST_STEPS`, so `wid` is a whole number of
 * steps for the same reason `stepPx` is a whole number of pixels: a sector
 * whose edge sat between two steps would light a frond on one frame and not the
 * next for no reason a viewer could name.
 *
 * `GUST_MAX` clamps it, and the clamp is not cosmetic — it is the same one
 * `DISP_MAX` makes below. `?anim=` reaches gain 8, and a `wid` that overflowed
 * its four-bit slot would collide with a NEIGHBOURING CROWN'S key and hand back
 * a crown of a different shape. That exact bug was caught by the oracle at gain
 * 3 on desert last round; it does not get to happen twice.
 */
const GUST_STEPS = 4;
const GUST_MAX = 15;
/**
 * Sector centre positions around a crown: one per frame, so the gust travels a
 * WHOLE TURN over the loop and the wrap step is the same size as every other
 * step. The alternative — sweeping back and forth on `triPhase` — closes just
 * as exactly; a whole turn was chosen because it is the only one of the two
 * whose every frame-to-frame transition is identical, so `strip.mjs`'s wrap
 * panel has nothing to be denser than.
 */
const CROWN_SECTORS = FRAMES;
/**
 * How wide the gust sector is, as the cosine of its half-angle: 0.50 is +/-60
 * degrees, a third of the rim. Not an amplitude — it is what makes the moving
 * thing a CLUMP. Widen it and the whole canopy pulses; narrow it far enough and
 * the arc gets too short to stay one connected island.
 */
const GUST_COS = 0.50;
/**
 * Spare columns each side of a palm crown, inert in the still table. Kept
 * because `frondCrown` still takes a displacement it does not currently use.
 */
const FROND_MARGIN = 3;

/** One canopy in this many moves at all. The rest are the still world. */
const CANOPY_MOVES_ONE_IN = 3;
/** One bush in this many moves at all. */
const BUSH_MOVES_ONE_IN = 3;
/** One palm in this many moves at all. */
const PALM_MOVES_ONE_IN = 3;

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
// The gust's WIDTH, in whole steps, off the same anchored triangle. Unsigned,
// because a sector has no direction: a negative half-angle is not a wedge
// pointing the other way, it is the same wedge. Dropping the sign leaves a
// quantity that is still exactly zero at frame 0 for every instance — which is
// what keeps an animated frame 0 byte-identical to the still render — and still
// periodic with period 1, so the loop closes.
const gustPx = (v, amp) => {
  const a = Math.round(amp * (v < 0 ? -v : v));
  return a > GUST_MAX ? GUST_MAX : a < 0 ? 0 : a;
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
 * K crowns, one per frame — `poseSet`'s sibling for the palm, which animates a
 * COLOUR rather than a displacement and therefore needs three numbers per pose
 * where a canopy needs one.
 *
 * It is a separate function and not a wider `poseSet` because the two say
 * different things. `poseSet` hands its maker ONE quantity, a signed count of
 * screen pixels, and that unit is the whole reason the canopy's motion is
 * legible as a translation. A crown's pose is (displacement, sector centre,
 * sector width), and only the first of those is a distance.
 *
 * THE THREE QUANTITIES, AND WHY EACH ONE CLOSES.
 *
 *   displacement  `FROND_SWING_PX`, which is 0 and stays 0 — see its comment.
 *                 Threaded per pose anyway, so the day it stops being zero
 *                 there is no second code path to remember.
 *   sector centre `(k + m) mod CROWN_SECTORS`, an integer that advances one
 *                 position per frame and wraps. A WHOLE TURN over the loop, so
 *                 frame FRAMES is frame 0 by construction and every
 *                 frame-to-frame step is the same size — including the wrap,
 *                 which is the step `tools/strip.mjs`'s first diff panel shows
 *                 and the one a gate at frame 0 cannot see. `m` is this crown's
 *                 own offset, so two palms in one street are not in step.
 *   sector width  `gustPx(swing(k, off), ...)`, zero at frame 0 for every
 *                 instance, periodic with period 1. The gust ARRIVES, sweeps
 *                 round the crown and dies, rather than being permanently on.
 *
 * The width being zero at frame 0 is what makes this whole design free: with no
 * sector there are no lit fronds, so the frame-0 crown IS the still crown,
 * character for character, and every number in `docs/` still describes it.
 *
 * NO Rng DRAW HAPPENS HERE, for the reason stated above `swing`: `off` is a
 * hash of the palm's own world position, and the frame index reaches nothing
 * but arithmetic.
 */
function crownPoses(A, off, make) {
  if (!A || A.frames < 2 || off < 0) return [make(0, 0, 0)];
  const g = A.gain === undefined ? 1 : A.gain;
  // Whole sectors, so the rotation is an integer walk rather than an angle that
  // has to be re-quantised. `off` is already a multiple of 1 / FRAMES.
  const m = Math.round(off * FRAMES);
  const out = new Array(A.frames);
  for (let j = 0; j < A.frames; j++) {
    const k = A.frame + j;
    out[j] = make(stepPx(swing(k, off), FROND_SWING_PX * g),
      ((k + m) % CROWN_SECTORS + CROWN_SECTORS) % CROWN_SECTORS,
      gustPx(swing(k, off), GUST_STEPS * g));
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

const CANOPY = [
  ['...mmmm...', '..mmlllmm.', '.mllllllmm', 'mllllllllm', 'mlllllllmm',
   'mmlllllmmx', '.mmmmmmmxx', '..xmmmmxx.', '...xxxx...'],
  ['....mmm...', '..mmlllmm.', '.mllllmmmm', 'mlllllmmmm', 'mllllmmmmx',
   '.mmmmmmmxx', '..mmmmmxx.', '...xxxxx..'],
  ['..mmm..mmm..', '.mlllmmlllm.', 'mlllllmllllm', 'mllllmmllllm',
   '.mmlllmmmmm.', '..mmmmmmxx..', '...xmmmxx...', '....xxxx....'],
  ['...mmm...', '..mlllm..', '.mllllmm.', 'mlllllmm.', '.mmlllmx.', '..xmmxx..'],
];

// A palm crown: the fronds radiate, so its outline is nowhere near the lattice.
const FROND = [
  '..m.........m..', '.mlm.......mlm.', 'mlllm.....mlllm', '.mlllm...mlllm.',
  '..mlllm.mlllm..', '...mlllmlllm...', '....mlllllm....', '...mlllllllm...',
  '..mllmlmlmllm..', '.mllm...x...mllm', 'mllm....x....mllm',
];

/**
 * A CANOPY GROWN FROM A RADIUS FUNCTION, NOT FROM A SCALED TABLE.
 *
 * The first attempt at big foliage scaled the authored tables by 2 or 3, and
 * measured OFF-LATTICE FORM WENT DOWN. Obvious in hindsight and worth writing
 * down: scaling a table by k multiplies every step in its outline by k, so a
 * hand-drawn 1-pixel jog becomes a 2-pixel jog — which is exactly the 2:1 iso
 * stair, i.e. the lattice. Enlarging a table makes its silhouette MORE
 * machine-like, not less. The only way to keep an organic contour at size is to
 * generate it at that size.
 *
 * So the outline is a periodic radius, r(theta) = R * (1 + sum of three
 * harmonics), sampled per pixel. Three harmonics with incommensurate phases
 * never repeat around the circle, the boundary crosses every angle, and none of
 * those angles is 2:1 except by coincidence. The vertical axis is squashed
 * because a tree seen in this projection is wider than it is deep.
 *
 * Interior tones are a light ramp plus a clumping hash, so the canopy reads as
 * a mass with a lit side rather than as a flat blob — and the shadow side is
 * the leaf's OWN dark, `g.k`, not the shared ink.
 */
function blob(R, variant, shift = 0) {
  const key = (R * 16 + variant) * 64 + (shift + 32);
  const had = BLOB_CACHE.get(key);
  if (had) return had;
  const h = (a, b) => (h3(a, b, 0x51ed + variant * 977) >>> 0) / 4294967296;
  const A = [0.09 + 0.07 * h(1, 0), 0.06 + 0.05 * h(2, 0), 0.035 + 0.03 * h(3, 0)];
  const P = [h(4, 0) * 6.283, h(5, 0) * 6.283, h(6, 0) * 6.283];
  const SQ = 0.78;                       // vertical squash
  const rad = (th) => R * (1 + A[0] * Math.sin(3 * th + P[0])
    + A[1] * Math.sin(5 * th + P[1]) + A[2] * Math.sin(7 * th + P[2]));
  // THE GUST SECTOR, AND WHAT IS ALLOWED TO MOVE INSIDE IT.
  //
  // `shift` is a whole number of screen pixels by which the canopy's INTERIOR
  // is rigidly displaced inside one stretch of the crown — a third of it, from
  // `GUST_COS` — while the silhouette, the keyline and every tag stay exactly
  // where they are. Its sign picks the direction; which stretch is fixed per
  // variant, so a tree always stirs in the same part of its crown.
  //
  // WHY THE SILHOUETTE MAY NOT MOVE, WHICH IS THE FINDING OF THIS ROUND AND
  // COST THE MOST TO GET. A canopy that gains a pixel at its rim is the exact
  // motion `Canvas.blitAnim` was written for, and `tools/animcheck.mjs` fails
  // it — measured on city seeds, 289 pixels per seed change in the full render
  // that the recorder never claimed, and another 290 that it claimed and had to
  // drop. Two causes, both structural and neither fixable from this file:
  //
  //   * a grown silhouette WINS DEPTH TESTS IT LOST AT FRAME 0 against objects
  //     drawn after it, and those pixels are filtered out at finish because
  //     frame 0's canvas disagrees with what the recorder saw;
  //   * a grown silhouette CHANGES TAG ADJACENCY, and `outlinePass` decides
  //     every keyline from tag adjacency and depth. A canopy reaching one pixel
  //     further un-blackens a pixel of the BUILDING BEHIND IT — a pixel no
  //     sprite ever touched and no recorder ever saw.
  //
  // So the contract is narrower than its own doc comment claims: what a sprite
  // may animate is its COLOURS, at pixels whose tag, depth and silhouette are
  // identical in every pose. Everything below obeys that, and it is why the
  // motion here is a clump of foliage stirring inside a crown that holds its
  // shape rather than a crown that changes shape.
  //
  // IT IS STILL A TRANSLATION, WHICH IS THE PROPERTY THAT MATTERS. The tone
  // field is SAMPLED at a displaced point, so an entire region of leaf detail
  // moves rigidly by one pixel — not a scatter of pixels each deciding for
  // itself. A sub-pixel perturbation would flip only those pixels that happened
  // to sit near a tone threshold, scattered everywhere: that is per-pixel
  // substitution, it reads as dithering, `docs/BAR.md` records dithering as
  // absent from every reference, and `animcheck` fails a seed whose motion sits
  // in 1-2px islands.
  const GA = h(7, 0) * 6.283, GX = Math.cos(GA), GY = Math.sin(GA);
  const RX = Math.ceil(R * 1.4), RY = Math.ceil(R * 1.4 * SQ);
  const core = [];
  for (let j = -RY; j <= RY; j++) {
    let line = '';
    for (let i = -RX; i <= RX; i++) {
      const jj = j / SQ;
      const d = Math.sqrt(i * i + jj * jj);
      const th = Math.atan2(jj, i);
      if (d > rad(th)) { line += '.'; continue; }
      // The gust: inside the sector the tone field is read one pixel over, so
      // that whole patch of leaf detail translates as a piece.
      let ti = i, tjj = jj, tj = j;
      if (shift && d > 0 && (i * GX + jj * GY) / d > GUST_COS) {
        ti = i - shift; tj = j; tjj = jj;
      }
      // FOUR TONES, CLUMPED AT TWO SCALES. A canopy is 30-50px across now, and
      // at three tones in big smooth bands it read as a green slab with one
      // lighter patch — the same "large undetailed facet" failure the round is
      // about, moved onto foliage. The ramp is the light; the two octaves of
      // hash are the clumps of leaf that break it, one at 3px and one at 7px,
      // so the mass has structure at both the size of a branch and the size of
      // a leaf cluster.
      const n1 = ((h3(ti >> 1, tj >> 1, 0x2f1b + variant) >>> 8) & 15) / 15 - 0.5;
      const n2 = ((h3(ti / 7 | 0, tj / 7 | 0, 0x71c3 + variant) >>> 8) & 15) / 15 - 0.5;
      const s = (ti * 0.5 + tjj * 0.86) / R + n1 * 0.34 + n2 * 0.40;
      line += s < -0.52 ? 'a' : s < -0.06 ? 'l' : s < 0.44 ? 'm' : 'x';
    }
    core.push(line);
  }
  const out = ring(core);
  BLOB_CACHE.set(key, out);
  return out;
}
const BLOB_CACHE = new Map();

/**
 * A palm crown as radiating fronds rather than one mass.
 *
 * Seven to nine tapered arcs swept from the crown centre at irregular angles.
 * Nothing in it is axis-aligned and nothing in it is 2:1; a palm is the single
 * most off-lattice object a street can legitimately contain, and the reference
 * uses them for exactly that.
 *
 * THE GUST SECTOR, AND WHY IT IS A COLOUR AND NOT A DISPLACEMENT.
 *
 * `sec` is a sector centre, one of `CROWN_SECTORS` positions round the crown;
 * `wid` is its half-angle in whole steps. Every frond whose BASE ANGLE falls
 * inside that wedge has its core drawn in `L` instead of `l` — one whole frond
 * at a time, all the fronds in the wedge together, which is the same "a clump
 * moved, not a scatter of pixels" property `blob`'s gust has and the reason
 * neither of them twinkles.
 *
 * THE UNIT IS A WHOLE FROND AND THE CODE MAKES THAT STRUCTURAL. The lit/unlit
 * decision is taken ONCE per frond, before its arc is swept, from `a0` alone.
 * Nothing inside a frond can disagree with the rest of it, so the smallest
 * island this design can produce is one frond's core — a connected arc of some
 * 20-60 px — and not a pixel.
 *
 * `wid === 0` LIGHTS NOTHING AND THAT IS THE STILL CROWN. It is the value every
 * caller passes at frame 0 and the only value the still path ever passes, so
 * this function's output at `wid = 0` is byte-for-byte what it emitted before
 * the sector existed. Gain 0 reaches the same place by arithmetic rather than
 * by a branch: it drives `wid` to 0 and `FROND_LIT_STEPS * gain` to 0 rungs.
 */
function frondCrown(R, variant, swingPx = 0, sec = 0, wid = 0) {
  // EVERY PARAMETER THAT CHANGES A PIXEL IS IN THE KEY, in its own fixed-width
  // slot. A memo keyed on less than it depends on serves one crown's poses for
  // another crown, and this project has now found that class of bug twice —
  // most recently as a displacement overflowing its slot at gain 3 and handing
  // back a mask of a different shape.
  //
  // Slots: variant < 16, swingPx + 32 < 64 (clamped by DISP_MAX), sec <
  // CROWN_SECTORS = 8 < 16, wid <= GUST_MAX = 15 < 16. The 100000 offset keeps
  // the whole range disjoint from `blob`'s keys, which are
  // (R * 16 + variant) * 64 + (shift + 32) and so stay under 100000 for any R
  // below 97 — the largest canopy this file draws is R = 14.
  const key = 100000 + ((((R * 16 + variant) * 64 + (swingPx + 32)) * 16 + sec) * 16 + wid);
  const had = BLOB_CACHE.get(key);
  if (had) return had;
  const rnd = (a) => (h3(a, variant, 0x77c1) >>> 0) / 4294967296;
  const n = 7 + (h3(1, variant, 0x31) & 3);
  const SQ = 0.62;
  // FROND_MARGIN is added to the half-width UNCONDITIONALLY, including in the
  // still table, and that is deliberate. The extra columns are all '.', which
  // `blit` skips, and the blit origin is `p - (width >> 1)` on an odd width, so
  // widening the table does not move a single drawn pixel. Adding it only when
  // animating would have made the animated frame 0 a different picture from the
  // still one.
  const RX = R + 3 + FROND_MARGIN, RY = Math.ceil(R * SQ) + 4;
  const g = [];
  for (let j = 0; j < 2 * RY + 1; j++) g.push(new Array(2 * RX + 1).fill('.'));
  // `L` CARRIES EXACTLY `l`'S WRITE PRIORITY, and that is what makes the whole
  // scheme legal rather than merely plausible. Fronds overwrite each other as
  // they are swept, so if the lit core lost a race the still core wins, the two
  // tables would disagree about which CELL is filled and not merely about its
  // colour — a silhouette change, which `blitAnim` cannot represent. With equal
  // priority the write sequence is identical in both, so the lit table differs
  // from the still one at a subset of `l` cells and nowhere else: same
  // silhouette, same tags, same depth, one contract satisfied structurally.
  const put = (i, j, c) => {
    const jj = j + RY, ii = i + RX;
    if (jj < 0 || jj >= g.length || ii < 0 || ii >= g[0].length) return;
    if (g[jj][ii] === '.' || c === 'l' || c === 'L') g[jj][ii] = c;
  };
  // The wedge. Clamped at a half-turn because past 180 degrees a cosine
  // threshold stops widening the sector and starts cutting a hole in it, and
  // `?anim=` can ask for gain 8.
  const SA = (sec / CROWN_SECTORS) * 6.283185307;
  const SX = Math.cos(SA), SY = Math.sin(SA);
  const COS_HALF = Math.cos(Math.min(Math.PI,
    (FROND_GUST_DEG * Math.PI / 180) * (wid / GUST_STEPS)));
  for (let f = 0; f < n; f++) {
    const a0 = (f / n) * 6.283 + rnd(f + 2) * 0.5;
    // ONE DECISION PER FROND, taken here and read by every pixel of its arc.
    const core = wid && (Math.cos(a0) * SX + Math.sin(a0) * SY) > COS_HALF ? 'L' : 'l';
    const droop = 0.5 + rnd(f + 30) * 0.7;
    const len = R * (0.72 + rnd(f + 60) * 0.42);
    for (let t = 0; t <= 1.0001; t += 0.045) {
      const rr = len * t;
      const a = a0 + t * t * 0.55 * (Math.cos(a0) >= 0 ? 1 : -1);
      // The outer half of every frond swings together — one coherent piece of
      // the crown, weighted by t*t so the fronds are still where they leave the
      // trunk. All fronds go the same way: a crown that streams is one clump,
      // a crown whose fronds each did their own thing is a twinkle.
      const px = Math.round(Math.cos(a) * rr) + Math.round(swingPx * t * t);
      const py = Math.round((Math.sin(a) * rr + t * t * droop * R * 0.45) * SQ);
      const wdt = Math.max(0, Math.round(2.2 * (1 - t * 0.85)));
      for (let q = -wdt; q <= wdt; q++) {
        // The blade EDGES stay `m` whether the frond is lit or not. Only the
        // core turns: a frond catching the light is a bright line inside its
        // own edge, not a wider frond, and leaving the edge alone is also what
        // keeps the lit island the shape of a frond rather than of a blob.
        put(px, py + q, Math.abs(q) === wdt && wdt > 0 ? 'm' : core);
      }
    }
  }
  // a heart of shadow where the fronds meet
  for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) {
    if (i * i + j * j * 3 <= 9) put(i, j, 'x');
  }
  const out = ring(g.map((r) => r.join('')));
  BLOB_CACHE.set(key, out);
  return out;
}

/** Add a fresh one-pixel keyline by four-neighbour dilation. */
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

/**
 * Scale a core table by k and give it a fresh one-pixel keyline.
 *
 * The dilation is by the FOUR-neighbourhood for the same reason it is on the
 * figures: any orthogonal path out of the mass must cross the ring, so the
 * interior is a closed cell under the 4-connectivity the closure metric uses.
 */
function grow(rows, k) {
  const w0 = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => r + '.'.repeat(w0 - r.length));
  const core = [];
  for (const r of padded) {
    let s = '';
    for (const c of r) s += c.repeat(k);
    for (let i = 0; i < k; i++) core.push(s);
  }
  return ring(core);
}

const SMALL = CANOPY.map((r) => grow(r, 1));

/**
 * `L` is the LIT frond core and it defaults to the unlit one, so every caller
 * that has no lit tone — every canopy, every bush, the pot plant — maps it to
 * exactly what it maps `l` to and could not tell the difference if a table
 * contained one.
 */
const leafMap = (C, g, lit) => ({
  d: C.black, x: g.k, m: g.r, l: g.l, L: lit === undefined ? g.l : lit, a: g.t, '.': -1,
});

/**
 * The lit tone: `steps` rungs up the frond's OWN colour family.
 *
 * A rung rather than a lightened mint, for two reasons. The ladder belongs to
 * the scene's light — `src/gen/palette.js` draws LEFT/RIGHT/DARK per seed —
 * so a tone taken off it varies with the scene exactly as every other tone in
 * the crown does, instead of being a fifth constant sitting outside the
 * lighting model. And it adds no colour to the palette: `g.t` is already in
 * this crown's map (it is what a canopy's lit side is drawn in), so a lit palm
 * spends nothing on `palette.distinct` and cannot manufacture a near-duplicate.
 *
 * Clamped at both ends, so `FROND_LIT_STEPS * gain` can be any number the knob
 * produces and the worst it can do is ask for a rung that does not exist.
 */
function litTone(g, steps) {
  const ramp = [g.k, g.r, g.l, g.t];       // the family's own ladder, dark to light
  const i = 2 + steps;                     // `l`, the frond core, is rung 2
  return ramp[i < 0 ? 0 : i > 3 ? 3 : i];
}

export function tree(cv, iso, C, st, x, y, z, big, A) {
  const g = st.pick([C.leaf, C.grass, C.grass, C.green]);
  const th = big ? st.range(5.0, 9.0) : st.range(3.0, 5.0);
  const tr = st.pick([C.wood, C.terra, C.slate]);
  // A trunk with a base flare, not a stick: at this scale a 3px pole under a
  // 30px canopy reads as a lollipop.
  const tw = big ? 1.5 : 1.1;
  box(cv, iso, x, y, z, tw, tw, th, { top: tr.l, left: tr.l, right: tr.r });
  box(cv, iso, x - 0.2, y - 0.2, z, tw + 0.4, tw + 0.4, Math.max(0.5, th * 0.16),
    { top: tr.l, left: tr.k, right: tr.r });
  const R = big ? st.int(9, 14) : st.int(6, 9);
  const variant = st.int(0, 7);
  const off = movePhase(x, y, 0x1f3a5b, CANOPY_MOVES_ONE_IN);
  const ps = poseSet(A, off, CANOPY_SHIFT_PX, (m) => blob(R, variant, m));
  const p = projR(iso, x + tw * 0.5, y + tw * 0.5, z + th);
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - ps[0].length + 2, ps,
    leafMap(C, g), dep(iso, x, y, z + th, 1.2), A);
}

export function palm(cv, iso, C, st, x, y, z, A) {
  const h = st.range(14, 28);
  const tr = st.pick([C.sandy, C.wood, C.concrete]);
  const lean = st.range(-0.06, 0.06);
  const seg = Math.max(5, Math.round(h / 2.6));
  // The trunk tapers and its scars are every THIRD segment, not every other
  // one. Alternating two tones up a pole is a barber pole, not a palm, and at
  // the new scale it was the most conspicuous repeat in the frame.
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const wdt = 1.35 - 0.45 * t;
    box(cv, iso, x + lean * i * 1.2 + (1.35 - wdt) * 0.5, y + lean * i * 0.5 + (1.35 - wdt) * 0.5,
      z + t * h, wdt, wdt, h / seg + 0.1,
      { top: tr.l, left: (i % 3) === 0 ? tr.r : tr.l, right: (i % 3) === 0 ? tr.k : tr.r });
  }
  const g = st.pick([C.leaf, C.green, C.grass]);
  const p = projR(iso, x + 0.5 + lean * seg * 1.2, y + 0.5 + lean * seg * 0.5, z + h);
  const cR = st.int(15, 21), cV = st.int(0, 7);
  const off = movePhase(x, y, 0x2c81d7, PALM_MOVES_ONE_IN);
  // The lit tone is a property of the CROWN, not of a pose: it lives in the
  // map, which `blitAnim` reads once for every pose. What changes per frame is
  // only which fronds are drawn in it.
  const lit = litTone(g, Math.round(FROND_LIT_STEPS * (A && A.gain !== undefined ? A.gain : 1)));
  const ps = crownPoses(A, off, (m, sec, wid) => frondCrown(cR, cV, m, sec, wid));
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - ps[0].length + 4, ps,
    leafMap(C, g, lit), dep(iso, x, y, z + h, 2), A);
  if (st.bool(0.35)) {
    const c = st.pick([C.amber, C.orange, C.lime]);
    cv.blit(p[0] - 2, p[1] - 3, ['.##.', '####', '####', '.##.'],
      { '#': c.l, '.': -1 }, dep(iso, x, y, z + h, 2.2));
  }
}

export function hedge(cv, iso, C, st, x, y, z, w, d, h) {
  const g = st.pick([C.leaf, C.grass, C.green]);
  const F = topFace(iso, z + h, x, y);
  const seed = st.int(1, 9999);
  const FL = leftFace(iso, y + d, x, z);
  const FR = rightFace(iso, x + w, y, z);
  // A clipped hedge is a solid with a shadow under its own overhang: the lower
  // band of each side face takes the leaf's contour step, and the face carries
  // the same two-scale clumping the canopies do. Left flat it was a 40x30px
  // slab of one green.
  const side = (Fx, lit, mid) => (sxp, syp) => {
    const u = Fx.au * sxp + Fx.bu * syp + Fx.cu, v = Fx.av * sxp + Fx.bv * syp + Fx.cv;
    if (v < h * 0.24) return g.k;
    const k = h3(Math.floor(u / 1.1), Math.floor(v / 1.1), seed) & 7;
    return k < 5 ? mid : lit;
  };
  box(cv, iso, x, y, z, w, d, h, {
    top: (sxp, syp) => {
      const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
      const k = h3(Math.floor(u / 1.4), Math.floor(v / 1.4), seed) & 7;
      return k < 6 ? g.l : g.t;
    },
    left: side(FL, g.t, g.l), right: side(FR, g.l, g.r),
  });
}

export function bush(cv, iso, C, st, x, y, z, A) {
  const g = st.pick([C.leaf, C.grass, C.grass, C.green]);
  const R = st.int(5, 8), variant = st.int(0, 7);
  const off = movePhase(x, y, 0x63b0e5, BUSH_MOVES_ONE_IN);
  const ps = poseSet(A, off, BUSH_SHIFT_PX, (m) => blob(R, variant, m));
  const p = projR(iso, x, y, z);
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - ps[0].length + 2, ps,
    leafMap(C, g), dep(iso, x, y, z, 0.9), A);
}

export function flowerBed(cv, iso, C, st, x, y, z, w, d) {
  const g = st.pick([C.grass, C.grass]);
  const a = st.pick(C.accents), b = st.pick(C.accents);
  const seed = st.int(1, 9999);
  const F = topFace(iso, z, x, y);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    const k = h3(Math.floor(u / 1.1), Math.floor(v / 1.1), seed) & 15;
    if (k === 0) return a.t;
    if (k === 1) return b.t;
    return k < 9 ? g.l : g.t;
  });
}

export function grassPlot(cv, iso, C, st, x, y, z, w, d) {
  const g = st.pick([C.grass, C.grass]);
  const seed = st.int(1, 9999);
  const F = topFace(iso, z, x, y);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    // mown stripes: flat bands, structured, and never a uniform 16x16 field
    const band = (Math.floor(v / 2.4) & 1);
    const k = h3(Math.floor(u / 4), Math.floor(v / 4), seed) & 15;
    if (k === 0) return g.k;
    if (k === 1) return g.t;
    return band ? g.l : g.t;
  });
}

/**
 * SMALL is retained deliberately: a 1x-grown canopy is 12px and is the largest
 * thing that still fits in a window box or a roof planter. It is not used for
 * street trees, where a 12px blob is exactly the defect this file was rebuilt
 * to remove.
 */
export function potPlant(cv, iso, C, st, x, y, z) {
  const g = st.pick([C.leaf, C.grass, C.green]);
  const pot = st.pick([C.terra, C.brick, C.concrete]);
  box(cv, iso, x, y, z, 1.5, 1.5, 1.3, { top: pot.k, left: pot.l, right: pot.r });
  const rows = SMALL[st.int(0, SMALL.length - 1)];
  const p = projR(iso, x + 0.75, y + 0.75, z + 1.3);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    leafMap(C, g), dep(iso, x, y, z + 1.3, 0.9));
}
