import { dep, projR } from '../view.js';
import { h3 } from '../palette.js';
import { FRAMES, triPhase } from '../../core/frame.js';
// Pedestrians.
//
// REBUILT AT THE SCALE THE REFERENCE ACTUALLY WORKS AT. The old table was 5x11
// — eleven rows for a whole person, of which four were legs and one was a head.
// At that size a face is not small, it is absent: there is no row to put it on.
// Three rounds of judges reported zero objects below building scale resolving
// into a nameable thing at 1:1, and a five-pixel-wide figure is the clearest
// case in the frame. The reference's are 22-30px with a head, a face, arms that
// leave the body, separated legs and shoes.
//
// These are 9x20 before the keyline, 11x22 after — the reference's range, and
// the size at which every one of the following is a decision rather than an
// accident: which way the head is turned, whether the arms swing, whether the
// figure carries something, where the hem of the coat falls.
//
// SLOTS, NOT COLOURS. Each character is a MATERIAL SLOT, so one table produces
// thousands of distinct people once the slots are filled from the palette. That
// is also where a large part of a crop's several hundred distinct colours comes
// from: many small objects each committing to a colour of its own.
//
//   h hair/hat   H hat brim / hair shadow   s skin   f face mark (skin's own
//   dark — eyes and brow, drawn in the CONTOUR step, never in the shared ink)
//   t shirt   T shirt shadow   S shirt highlight   c collar/lapel
//   p trousers  q trouser shadow   P shoe   b bag/accent   . skip

// ---------------------------------------------------------------------------
// HOW MUCH A FIGURE MOVES, IN SCREEN PIXELS. One grep finds every amplitude in
// this file. Set at 0 in this commit: the plumbing lands first and is provably
// inert, then the motion lands on top of it.
//
// SWAPPING BETWEEN THE POSES ABOVE IS THE CARTOON FAILURE AND IS NOT DONE HERE.
// The tables differ from each other enormously — standing against striding —
// and a figure that alternates between two of them is animation in the sense a
// flipbook is. What is allowed is a MICRO-VARIANT of the SAME table: one
// coherent part of one figure translated by one pixel.

/** How far a figure's head travels sideways. One pixel is the whole budget. */
const FIGURE_SHIFT_PX = 0;
/** One figure in this many moves at all. A crowd in unison is a chorus line. */
const FIGURE_MOVES_ONE_IN = 4;

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
const stepPx = (v, amp) => { const a = amp * v; return a < 0 ? -Math.round(-a) : Math.round(a); };

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
  const out = new Array(A.frames);
  for (let j = 0; j < A.frames; j++) out[j] = make(stepPx(swing(A.frame + j, off), amp));
  return out;
}

const ORIGINS = new Map();
function origins(K) {
  let o = ORIGINS.get(K);
  if (!o) { o = []; for (let i = 0; i < K; i++) o.push([0, 0]); ORIGINS.set(K, o); }
  return o;
}

/** Draw pose 0 exactly as `blit` would; record the rest only when recording. */
function putPoses(cv, x0, y0, ps, map, d, A) {
  if (ps.length > 1 && A && A.anim) cv.blitAnim(x0, y0, ps, origins(ps.length), map, d, A.anim);
  else cv.blit(x0, y0, ps[0], map, d);
}

const POSES = [
  // stand, facing the camera
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'stttttttS', 'sttttttts', 'sTtttttS.',
   '.TtttttS.', '..TTTSS..', '..ppppp..', '..pp.pp..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // walking, arms swinging, one leg forward
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', '.tttttttS', 'sttttttt.', 'sTttttt..',
   '.Ttttt.s.', '..TTTS...', '..ppppp..', '..ppppp..', '..pp..pp.', '..qp..pq.',
   '.pp....p.', 'PPP...PPP'],
  // striding the other way
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'Sttttttt.', '.ttttttts', '..tttttTs',
   '.s.tttttT', '...STTT..', '..ppppp..', '..ppppp..', '.pp..pp..', '.qp..pq..',
   '.p....pp.', 'PPP...PPP'],
  // wide-brimmed hat, hands in pockets
  ['....h....', '...hhh...', '.hhhhhhh.', 'HHHHHHHHH', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'sttttttts', 'sttttttts', '.Ttttttt.',
   '.TtttttS.', '..TTTSS..', '..ppppp..', '..pp.pp..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // carrying a bag in one hand
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'stttttttS', 'sttttttts', '.Tttttts.',
   'b.ttttts.', 'bbTTTSS..', 'bbbppppp.', 'bbbpp.pp.', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // long hair, standing talking, one arm raised
  ['...hhh...', '..hhhhh..', '.hhhhhhh.', '.hHsssHh.', '.hfsssfh.', '.hsssssh.',
   '.h.sss.h.', '..ccccc..', 'stttttttS', 'sttttttts', '.ttttttts', '.Ttttttt.',
   '.TtttttS.', '..TTTSS..', '..ppppp..', '..ppppp..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // child — shorter, bigger head, the reference has several
  ['...hhh...', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..', '...sss...',
   '..ttttt..', '.sttttts.', '.sttttts.', '..TtttS..', '..TTTS...', '..ppppp..',
   '..pp.pp..', '..pp.pp..', '..PP.PP..'],
  // seated — bench, kerb, cafe
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'sttttttts', 'sttttttts', '.Tttttttp',
   '.TttttppP', '..pppppp.', '..pp.....', '..pp.....', '..qq.....', '..PP.....'],
  // standing with a coat, back to the camera (no face)
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..hhhhh..', '..sssss..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'sttttttts', 'sttttttts', 'sttttttts',
   '.ttttttt.', '.TttttTT.', '.TtttttT.', '..TTTTT..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
];

/**
 * EVERY FIGURE CARRIES ITS OWN 1px KEYLINE.
 *
 * The pose tables have no black in them, and pedestrians are tagged no-outline
 * precisely so the silhouette sweep does not eat a figure. Between the two, a
 * crowd was a scatter of unoutlined colour blobs lying flat on the pavement:
 * nothing separated a person from the ground they stood on, so eighty figures
 * in a crop contributed eighty flat faces and NOT ONE closed cell.
 *
 * Dilating by the FOUR-neighbourhood is the cheap correct ring: any orthogonal
 * path out of the figure must cross it, so the interior is enclosed under the
 * 4-connectivity the closure metric uses, and it costs a perimeter rather than
 * a perimeter plus corners. It also stays exactly one pixel at any world scale,
 * because it is authored in screen pixels and the figure is a sprite.
 */
function outlined(rows) {
  const h = rows.length, w = rows[0].length;
  const solid = (j, i) => j >= 0 && j < h && i >= 0 && i < w && rows[j][i] !== '.';
  const out = [];
  for (let j = -1; j <= h; j++) {
    let line = '';
    for (let i = -1; i <= w; i++) {
      if (solid(j, i)) { line += rows[j][i]; continue; }
      line += (solid(j - 1, i) || solid(j + 1, i) || solid(j, i - 1) || solid(j, i + 1)) ? 'o' : '.';
    }
    out.push(line);
  }
  return out;
}

const OUTLINED = POSES.map(outlined);

export function drawPerson(cv, iso, C, st, wx, wy, wz, opt, A) {
  const pi = opt && opt.pose !== undefined ? opt.pose : st.int(0, POSES.length - 1);
  const pose = OUTLINED[pi];
  // A crowd is not fourteen people repeated. Each figure mints its own shirt
  // and trousers off a family, which is where a large part of a reference
  // crop's several hundred distinct colours actually comes from: many small
  // objects each committing to a colour of their own, not one ramp sprayed
  // over everything.
  const own = C.ownColour === undefined ? 1 : C.ownColour;
  const mix = (f, dh, ds, dl) => (st.bool(own)
    ? C.mk(f._h + st.range(-dh, dh),
      Math.min(1, f._s * st.range(1 - ds, 1 + ds)),
      Math.min(0.97, f._L * st.range(1 - dl, 1 + dl)))
    : f);
  const shirt = mix(st.pick(C.accents), 18, 0.3, 0.18);
  const trous = st.bool(0.4) ? mix(st.pick(C.accents), 16, 0.3, 0.16)
    : mix(st.pick([C.steel, C.slate, C.wood, C.indigo, C.concrete]), 12, 0.4, 0.16);
  const bag = mix(st.pick(C.accents), 20, 0.3, 0.2);
  const hair = st.pick(C.hair);
  const skin = st.pick(C.skin);
  // The face is drawn in the SKIN's own contour step, not in the shared ink.
  // Two eyes and a brow line on a 22px figure are interior form on a solid, and
  // interior form on a solid is the one thing this generator had no vocabulary
  // for. It is also two more colours per figure that belong to that figure.
  const map = {
    h: hair.t, H: hair.r, s: skin.t, f: skin.k,
    t: shirt.l, T: shirt.r, S: shirt.t, c: shirt.k,
    p: trous.r, q: trous.k, P: st.bool(0.5) ? C.white.t : C.slate.k,
    b: bag.l, o: C.black, '.': -1,
  };
  const p = projR(iso, wx, wy, wz);
  const off = movePhase(wx, wy, 0x3ce27b, FIGURE_MOVES_ONE_IN);
  const ps = poseSet(A, off, FIGURE_SHIFT_PX, () => pose);
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - (ps[0].length - 3), ps, map,
    dep(iso, wx, wy, wz, 0.7), A);
}

/** A queue / cluster of people along a line — how crowds actually read. */
export function drawCrowd(cv, iso, C, st, x, y, z, dx, dy, n, A) {
  for (let i = 0; i < n; i++) {
    drawPerson(cv, iso, C, st,
      x + dx * i + st.range(-0.6, 0.6),
      y + dy * i + st.range(-0.6, 0.6), z, undefined, A);
  }
}
