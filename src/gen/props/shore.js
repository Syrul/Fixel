// Shore props — everything the coast needs that the city never had.
//
// THIS FILE EXISTS FOR TWO REASONS AND THE SECOND ONE IS THE INTERESTING ONE.
//
// The first is prosaic: a beach is not a street, so it needs beach things —
// huts, groynes, dinghies, weed, gulls, deck chairs, marram.
//
// The second is `docs/BAR.md` section 5. The reference puts 9.9% of its area in
// NON-LATTICE-CONFORMING form and this generator managed 0.5% — a twentyfold
// gap and the hardest single number in the project. A city is boxes, and boxes
// are the lattice. A shore is the one biome whose entire subject matter is
// curves: a hull, a boulder, a kelp raft, a gull, a dune brink, a waterline.
// So almost everything below is built from a CONTINUOUS FORM sampled onto the
// grid rather than from `box()`:
//
//   - `wallQuad` draws a vertical face along an ARBITRARY world direction by
//     solving its depth plane in closed form, which is what lets a groyne, a
//     boardwalk fascia and the pier run off the 2:1 lattice while still
//     depth-testing exactly. Verified against `Iso.rightDepth`/`leftDepth`:
//     substituting the axis-aligned directions reproduces them coefficient for
//     coefficient.
//   - the hulls are a sheer curve rasterised from a polynomial half-beam,
//     extruded downward by their freeboard, so the silhouette is a genuine
//     curve at every angle and the hull side is exactly the camera-facing one.
//   - the organic masses (weed, rock, driftwood) are unions of ellipses rather
//     than scaled tables. `docs/CRAFT.md` records that scaling an authored table
//     by k multiplies every 1px jog into a k-px jog, i.e. straight back onto the
//     2:1 stair — enlarging a table makes a silhouette MORE machine-like. A
//     union of ellipses is generated at its final size and its boundary crosses
//     every angle.
//
// NO TRANSCENDENTALS anywhere here, per the determinism law: the ellipse test
// is `dx*dx + dy*dy <= 1` and the sheer curve is `sqrt(1 - u*u)` times a
// polynomial. `Math.sin`/`cos`/`atan2` do not appear.
//
// Sprite tables are cached on their generating key, so a frame with ninety
// gulls and forty weed piles rasterises each distinct one once.

import { drawSlab, asShade } from '../../core/iso.js';
import { box, gable } from '../draw.js';
import { topFace, leftFace, rightFace } from '../faces.js';
import { h3 } from '../palette.js';
import { dep, projR } from '../view.js';
import { FRAMES, triPhase } from '../../core/frame.js';

const M = (f) => ({ top: f.t, left: f.l, right: f.r });
const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

// ---------------------------------------------------------------------------
// Off-lattice geometry primitives
// ---------------------------------------------------------------------------

/**
 * A horizontal polygon at constant z.
 *
 * `iso.topDepth(z)` depends on z alone, so it is exact for ANY polygon on that
 * plane, not just an axis-aligned rectangle. That single fact is what lets the
 * promenade, the pier deck and the tide terraces be curves instead of stairs.
 * `fillPoly` scans between the min and max crossing per row, so the polygon
 * must be convex — every caller here passes a quad.
 */
export function polyTop(cv, iso, pts, z, shade, tag) {
  const d = iso.topDepth(z);
  const P = [];
  for (const p of pts) P.push(iso.proj(p[0], p[1], z));
  cv.fillPoly(P, d[0], d[1], d[2], asShade(shade), tag);
}

/**
 * A VERTICAL FACE ALONG AN ARBITRARY WORLD DIRECTION.
 *
 * Derivation, because a depth that is wrong by a constant draws in the wrong
 * ORDER and its only visual signature is an absence:
 *
 *   a point on the face is (ax + t*ex, ay + t*ey, z)
 *   sx = ox + 2s[(ax-ay) + t(ex-ey)]           so t is linear in sx, provided
 *                                              ex != ey (else the face is
 *                                              edge-on and has no width)
 *   sy = oy + s[(ax+ay) + t(ex+ey)] - 2sz      so s*z = (oy + sP - sy)/2
 *   D  = s(x+y+z) = sP + sz = 1.5*sP + (oy - sy)/2
 *
 * and sP is linear in sx, so D = A*sx + B*sy + C with
 *   A = 0.75*(ex+ey)/(ex-ey)   B = -0.5
 * Setting (ex,ey) = (0,1) at x=xr gives A=-0.75, C = 3*s*xr + 0.75ox + 0.5oy,
 * which is `Iso.rightDepth` exactly; (1,0) at y=yl gives `leftDepth` exactly.
 */
export function wallQuad(cv, iso, ax, ay, bx, by, z0, z1, shade, tag) {
  const s = iso.s === undefined ? 1 : iso.s;
  const ex = bx - ax, ey = by - ay;
  const den = ex - ey;
  if (den > -0.0015 && den < 0.0015) return;   // edge-on: zero screen width
  const A = 0.75 * (ex + ey) / den;
  const B = -0.5;
  const C = 1.5 * (s * (ax + ay) - s * (ex + ey) * (ax - ay) / den)
    - A * iso.ox + iso.oy / 2;
  const P = (x, y, z) => iso.proj(x, y, z);
  cv.fillPoly([P(ax, ay, z0), P(bx, by, z0), P(bx, by, z1), P(ax, ay, z1)],
    A, B, C, asShade(shade), tag);
}

/** True when the outward normal (ey,-ex) of a->b points at the camera. */
export function facesCamera(ax, ay, bx, by) {
  return (by - ay) - (bx - ax) > 0;
}

// ---------------------------------------------------------------------------
// Organic sprite masses
// ---------------------------------------------------------------------------

const CACHE = new Map();

/** One-pixel keyline by four-neighbour dilation, exactly as the canopies do. */
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
 * A lumpy mass as a UNION OF ELLIPSES.
 *
 * Four to seven overlapping ellipses at hashed offsets. The union boundary is
 * piecewise-elliptic, so it crosses every screen angle and lands on the 2:1
 * lattice only by coincidence — which is the point. `flat` squashes it for a
 * thing lying on the ground; `lift` biases the light ramp for a thing standing
 * up.
 */
function ellipseMass(R, variant, flat, salt, shift = 0) {
  const key = 'M' + R + ':' + variant + ':' + (flat * 100 | 0) + ':' + salt + ':' + shift;
  const had = CACHE.get(key);
  if (had) return had;
  const u = (a) => (h3(a, variant, salt) >>> 8) / 16777216;
  const n = 4 + (h3(91, variant, salt) & 3);
  const E = [];
  for (let k = 0; k < n; k++) {
    E.push([(u(k * 4 + 1) - 0.5) * R * 1.05,
      (u(k * 4 + 2) - 0.5) * R * flat * 1.05,
      R * (0.40 + 0.34 * u(k * 4 + 3)),
      R * flat * (0.40 + 0.34 * u(k * 4 + 4))]);
  }
  const G = GUSTS[(h3(93, variant, salt) >>> 5) & 7], GX = G[0], GY = G[1];
  const RX = Math.ceil(R * 1.6), RY = Math.ceil(R * flat * 1.6) + 1;
  const core = [];
  for (let j = -RY; j <= RY; j++) {
    let line = '';
    for (let i = -RX; i <= RX; i++) {
      let inside = false;
      for (let k = 0; k < n; k++) {
        const dx = (i - E[k][0]) / E[k][2], dy = (j - E[k][1]) / E[k][3];
        if (dx * dx + dy * dy <= 1) { inside = true; break; }
      }
      if (!inside) { line += '.'; continue; }
      // THE GUST: inside one sector the clumping is READ ONE CLUMP OVER, so
      // that patch of the raft translates rigidly while the outline, the
      // keyline and the tag stay exactly where they were. `shift` is 0 for
      // every caller but `weedPile`, so a rock does not stir.
      let ti = i;
      const dd = Math.sqrt(i * i + j * j);
      if (shift && dd > 0 && (i * GX + j * GY) / dd > GUST_COS) ti = i - shift;
      // Two octaves of clumping over a light ramp, exactly the canopy recipe:
      // one at ~3px (the grain of the material) and one at ~8px (the lumps of
      // the mass), so the interior is faceted rather than either flat or noisy.
      const n1 = ((h3(ti >> 1, j >> 1, salt + 0x2f1b + variant) >>> 8) & 15) / 15 - 0.5;
      const n2 = ((h3((ti >> 3), (j >> 3), salt + 0x71c3 + variant) >>> 8) & 15) / 15 - 0.5;
      const sh = (ti * 0.34 + j * 0.94) / (R * 1.15) + n1 * 0.26 + n2 * 0.46;
      line += sh < -0.48 ? 'a' : sh < -0.02 ? 'l' : sh < 0.48 ? 'm' : 'x';
    }
    core.push(line);
  }
  const out = ring(core);
  CACHE.set(key, out);
  return out;
}


// ---------------------------------------------------------------------------
// HOW MUCH THE STRANDLINE MOVES, IN SCREEN PIXELS. One grep finds every
// amplitude in this file; the unit is a whole screen pixel of displacement at
// the extreme of the loop. Set at 0 in this commit.
//
// NOTE FOR WHOEVER OWNS `src/gen/biomes/shore.js`: none of this is reachable
// yet. The prop takes the stage as an optional trailing argument and does
// nothing without it, and the seven `weedPile(...)` call sites in the shore
// biome do not pass one. Adding `, stage` to those calls is the whole change.

/**
 * A raft of stranded weed: how far one clump of it travels at the extreme of
 * the loop. Only the weed's COLOURS move — its outline, its keyline and its tag
 * are identical in every pose, for the reason `blob` in
 * `src/gen/props/nature.js` sets out at length.
 *
 * Three, matching `SALTBUSH_SHIFT_PX` in `src/gen/props/desert.js`, because a
 * weed raft is the same size as a saltbush and the floor on a coherent
 * displacement is set by the 2px octave in the clumping, not by taste. UNTESTED
 * BY THE ORACLE: nothing calls this with a stage yet.
 */
const WEED_SHIFT_PX = 3;
/** One weed pile in this many moves at all. */
const WEED_MOVES_ONE_IN = 3;
/**
 * The gust sector, as the cosine of its half-angle, and eight unit directions
 * to point it along, as literal vectors.
 */
const GUST_COS = 0.50;
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

const massMap = (C, g) => ({ d: C.black, x: g.k, m: g.r, l: g.l, a: g.t, '.': -1 });

/** Blit a cached table centred on a world point. */
function stamp(cv, iso, rows, map, x, y, z, bias, dy) {
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - (rows.length >> 1) - (dy || 0),
    rows, map, dep(iso, x, y, z, bias));
}

/**
 * A raft of stranded weed. This is the shore's answer to the tree: a large
 * organic mass in a colour that means exactly one thing, sitting on the line
 * the last tide reached.
 */
export function weedPile(cv, iso, C, st, x, y, z, big, A) {
  const g = st.pick([C.leaf, C.green, C.teal, C.grass, C.leaf]);
  const gg = C.mk(g._h + st.range(-16, 16), Math.min(1, g._s * st.range(0.45, 0.95)),
    Math.min(0.62, g._L * st.range(0.52, 0.86)));
  const R = big ? st.int(8, 13) : st.int(4, 8), variant = st.int(0, 23);
  const off = movePhase(x, y, 0x6f2ad1, WEED_MOVES_ONE_IN);
  const ps = poseSet(A, off, WEED_SHIFT_PX, (m) => ellipseMass(R, variant, 0.52, 0x5b17, m));
  const p = projR(iso, x, y, z);
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - (ps[0].length >> 1) - 1, ps,
    massMap(C, gg), dep(iso, x, y, z, 0.55), A);
}

/** A boulder or a riprap block. Same generator, stone tones, less squashed. */
export function rock(cv, iso, C, st, x, y, z, big) {
  const s0 = st.pick([C.stone, C.slate, C.taupe, C.concrete, C.steel]);
  const g = C.mk(s0._h + st.range(-9, 9), s0._s * st.range(0.6, 1.4),
    Math.min(0.92, s0._L * st.range(0.72, 1.08)));
  const rows = ellipseMass(big ? st.int(7, 12) : st.int(4, 7), st.int(0, 23), 0.74, 0x31a9);
  stamp(cv, iso, rows, massMap(C, g), x, y, z, 0.8, big ? 3 : 2);
}

/** A bleached log. One long ellipse plus two stubs, and a grain line. */
export function driftwood(cv, iso, C, st, x, y, z) {
  const w0 = st.pick([C.taupe, C.stone, C.wood, C.concrete]);
  const g = C.mk(w0._h + st.range(-12, 12), w0._s * st.range(0.4, 1.0),
    Math.min(0.94, w0._L * st.range(0.82, 1.18)));
  const L = st.int(11, 20), variant = st.int(0, 15), flip = st.bool(0.5) ? 1 : -1;
  const key = 'L' + L + ':' + variant + ':' + flip;
  let rows = CACHE.get(key);
  if (!rows) {
    const RY = 6, core = [];
    const u = (a) => (h3(a, variant, 0x7c31) >>> 8) / 16777216;
    const tilt = (u(1) - 0.5) * 0.55;
    for (let j = -RY; j <= RY; j++) {
      let line = '';
      for (let i = -L; i <= L; i++) {
        const jj = j - tilt * i * flip;
        const t = i / L;
        const r = 2.6 * (1 - t * t * 0.55) * (0.7 + 0.5 * u(3 + ((i + L) >> 2)));
        const stub = (i > L * 0.2 && i < L * 0.5 && jj < 0 && jj > -5.5
          && (i + L) % 7 < 3) ? 1 : 0;
        if (jj * jj <= r * r || stub) {
          const sh = jj / (r + 0.001);
          line += sh < -0.45 ? 'l' : sh < 0.35 ? 'm' : 'x';
        } else line += '.';
      }
      core.push(line);
    }
    rows = ring(core);
    CACHE.set(key, rows);
  }
  stamp(cv, iso, rows, massMap(C, g), x, y, z, 0.6, 1);
}

/**
 * A marram tuft — a fan of blades from one root.
 *
 * Nothing about it is a box and nothing about it is 2:1. It is also the
 * cheapest way to make a dune read as vegetated rather than as bare terrace,
 * which is the "83% one flat mass" failure `docs/BAR.md` records verbatim.
 */
export function marram(cv, iso, C, st, x, y, z) {
  const g0 = st.pick([C.grass, C.lime, C.leaf, C.sandy, C.grass]);
  const g = C.mk(g0._h + st.range(-14, 14), g0._s * st.range(0.35, 0.9),
    Math.min(0.86, g0._L * st.range(0.72, 1.12)));
  const H = st.int(7, 13), variant = st.int(0, 23);
  const key = 'T' + H + ':' + variant;
  let rows = CACHE.get(key);
  if (!rows) {
    const u = (a) => (h3(a, variant, 0x2cd7) >>> 8) / 16777216;
    const n = 5 + (h3(3, variant, 0x2cd7) & 3);
    const RX = H, W = 2 * RX + 1;
    const g2 = [];
    for (let j = 0; j <= H; j++) g2.push(new Array(W).fill('.'));
    const put = (i, j, c) => {
      const ii = i + RX;
      if (j < 0 || j > H || ii < 0 || ii >= W) return;
      if (g2[j][ii] === '.') g2[j][ii] = c;
    };
    for (let b = 0; b < n; b++) {
      const dir = (u(b * 3 + 1) - 0.5) * 2.1;
      const len = H * (0.55 + 0.45 * u(b * 3 + 2));
      const tone = u(b * 3 + 3) < 0.42 ? 'm' : 'l';
      for (let s = 0; s <= len; s += 0.5) {
        const t = s / len;
        const px = Math.round(dir * t * t * len * 0.72);
        const py = H - Math.round(s * 0.5);   // the tuft leans back in y as it rises
        put(px, py, tone);
        if (t < 0.35) put(px + (dir > 0 ? -1 : 1), py, 'x');
      }
    }
    rows = ring(g2.map((r) => r.join('')));
    CACHE.set(key, rows);
  }
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    massMap(C, g), dep(iso, x, y, z, 0.7));
}

// ---------------------------------------------------------------------------
// Gulls
// ---------------------------------------------------------------------------
//
// The reference's beach corner carries a dozen of them and they are 25-30px
// across, which is `docs/CRAFT.md`'s scale ladder made concrete: a bird small
// enough to be "ambient texture" is below its own legibility floor and should
// not be drawn at all. These are authored at final size — never scaled.

const GULL_STAND = [
  '...ww.........',
  '..wwww........',
  '..wwwwy.......',
  '..wwwww.......',
  '...wwwwwwgg...',
  '..wwwwwwwgggk.',
  '..wwwwwwwwggk.',
  '...wwwwwwww...',
  '....y....y....',
  '...yy....yy...',
];

const GULL_FLY = [
  'kk..........................',
  '.kww......................ww',
  '..wwww..................wwwk',
  '...wwwww..............wwwk..',
  '.....wwwww..........wwwww...',
  '.......wwwwwwwwwwwwwwww.....',
  '...ww...wwwwwwwwwwwwww......',
  '..wwyy...wwwwwwwwww.........',
  '...ww......wwwwww...........',
];

function gullMap(C, g) {
  return { w: C.white.t, g: g.l, k: g.k, y: C.amber.t, d: C.black, '.': -1 };
}

export function gull(cv, iso, C, st, x, y, z, flying) {
  const g = st.pick([C.metal, C.steel, C.slate, C.concrete]);
  const rows = flying ? FLY_R[st.int(0, 1)] : STAND_R[st.int(0, 1)];
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    gullMap(C, g), dep(iso, x, y, z, flying ? 6 : 0.8));
}

function mirrorRows(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}
const STAND_R = [ring(GULL_STAND), ring(mirrorRows(GULL_STAND))];
const FLY_R = [ring(GULL_FLY), ring(mirrorRows(GULL_FLY))];

// ---------------------------------------------------------------------------
// Craft
// ---------------------------------------------------------------------------

/**
 * A HULL, AS A SHEER CURVE EXTRUDED DOWN BY ITS FREEBOARD.
 *
 * `ax` picks which world axis the length runs along, so the sprite is drawn in
 * the projection's own two long directions and the boat sits in the world
 * rather than on the screen. The half-beam is
 *
 *     hb(t) = (Bm/2) * sqrt(1 - (2t-1)^2) * (0.66 + 0.34t)
 *
 * — an ellipse pulled full aft, which is a boat rather than a lozenge. The
 * outboard side is generated by taking, for each screen column, the lowest
 * pixel of the deck footprint and extruding `4*fb` rows below it, so the hull
 * side is exactly the camera-facing one and its lower silhouette is the sheer
 * curve again rather than a straight cut.
 *
 * Interior, gunwale, waterline stripe and thwarts are all cut in the same pass,
 * so the object arrives with six or seven flat fields already enclosed by its
 * own keyline — which is the ink-closure argument `docs/CRAFT.md` makes about
 * the reference's police car, applied to the thing a beach actually has.
 */
function hullRows(L, Bm, fb, ax, variant) {
  const key = 'B' + L + ':' + Bm + ':' + fb + ':' + ax + ':' + variant;
  const had = CACHE.get(key);
  if (had) return had;
  const S = 2;                                  // world -> screen, view.js SCALE
  const hb = (t) => {
    const u = 2 * t - 1;
    const q = 1 - u * u;
    return (Bm * 0.5) * Math.sqrt(q < 0 ? 0 : q) * (0.66 + 0.34 * t);
  };
  // a,b from sprite (i,j): the two forms differ only by which is which
  const ab = ax === 0
    ? (i, j) => [i / (4 * S) + j / (2 * S), j / (2 * S) - i / (4 * S)]
    : (i, j) => [j / (2 * S) - i / (4 * S), i / (4 * S) + j / (2 * S)];
  const spanI = Math.ceil(2 * S * (L + Bm)) + 3;
  const spanJ = Math.ceil(S * (L + Bm)) + Math.ceil(2 * S * fb) + 4;
  const W = 2 * spanI + 1;
  const grid = [];
  for (let j = 0; j <= spanJ + 2; j++) grid.push(new Array(W).fill('.'));
  const at = (i, j) => grid[j] && grid[j][i + spanI] !== undefined ? grid[j][i + spanI] : null;
  const set = (i, j, c) => { if (grid[j] && grid[j][i + spanI] !== undefined) grid[j][i + spanI] = c; };

  const inHull = (i, j, shrinkB, shrinkA) => {
    const [a, b] = ab(i, j);
    if (a < shrinkA || a > L - shrinkA) return false;
    const r = hb(a / L) - shrinkB;
    return r > 0 && b >= -r && b <= r;
  };
  const bside = new Int8Array(W);
  bside.fill(0);
  let jTop = 1e9;
  for (let j = 0; j <= spanJ; j++) {
    for (let i = -spanI; i <= spanI; i++) {
      if (!inHull(i, j, 0, 0)) continue;
      if (j < jTop) jTop = j;
      // interior floor / gunwale / thwart, decided in hull coordinates
      const [a] = ab(i, j);
      const t = a / L;
      const thwart = (t > 0.34 && t < 0.40) || (t > 0.60 && t < 0.66);
      if (inHull(i, j, 0.42, 0.9)) set(i, j, thwart ? 'T' : 'I');
      else set(i, j, 'G');
    }
  }
  // outboard side: extrude each column down from its lowest deck pixel
  const fbpx = Math.max(2, Math.round(2 * S * fb));
  for (let i = -spanI; i <= spanI; i++) {
    let low = -1;
    for (let j = spanJ; j >= 0; j--) if (at(i, j) !== '.' && at(i, j) !== null) { low = j; break; }
    if (low < 0) continue;
    const [, b] = ab(i, low);
    const lit = b > 0 ? 'H' : 'h';
    for (let k = 1; k <= fbpx; k++) {
      if (at(i, low + k) !== '.') continue;
      set(i, low + k, k >= fbpx - 1 ? 'W' : lit);
    }
  }
  const core = [];
  for (let j = 0; j <= spanJ + 2; j++) core.push(grid[j].join(''));
  // trim empty leading rows so the caller's anchor means something
  let a0 = 0;
  while (a0 < core.length && core[a0].indexOf('.') === core[a0].length - core[a0].length && !/[^.]/.test(core[a0])) a0++;
  const out = ring(core.slice(a0));
  CACHE.set(key, out);
  return out;
}

/**
 * A boat. `kind` 0 dinghy, 1 skiff, 2 fishing boat.
 *
 * Individually-owned mobile objects are the one class `docs/BAR.md` explicitly
 * allows a per-instance colour, and a beach full of hulls is exactly where a
 * frame gets its several hundred distinct colours. Two rocks on one slope may
 * not; two boats may.
 */
export function boat(cv, iso, C, st, x, y, z, ax, kind) {
  const spec = kind === 2 ? [12.5, 4.2, 1.7] : kind === 1 ? [9.0, 3.1, 1.35] : [6.6, 2.5, 1.0];
  const base = st.pick(C.accents);
  const hull = C.mk(base._h + st.range(-18, 18), Math.min(1, base._s * st.range(0.5, 1.15)),
    Math.min(0.94, base._L * st.range(0.78, 1.2)));
  const trim = st.bool(0.5) ? C.white : C.cream;
  const wood = st.pick([C.wood, C.taupe, C.sandy, C.terra]);
  const rows = hullRows(spec[0], spec[1], spec[2], ax, st.int(0, 7));
  const map = {
    G: trim.t, I: hull.k, T: wood.l, H: hull.t, h: hull.r, W: trim.l,
    d: C.black, '.': -1,
  };
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + Math.round(2 * spec[1]),
    rows, map, dep(iso, x, y, z, 1.1));
  // A mast, an outboard or a pair of oars — drawn as world geometry so they
  // stand up out of the sprite and give the object a vertical.
  if (kind === 2 && st.bool(0.62)) {
    const mx = x + (ax === 0 ? spec[0] * 0.34 : spec[1] * 0.4);
    const my = y + (ax === 0 ? spec[1] * 0.4 : spec[0] * 0.34);
    box(cv, iso, mx, my, z + 1.0, 0.55, 0.55, st.range(9, 15), MD(wood));
  } else if (st.bool(0.45)) {
    const mx = x + (ax === 0 ? spec[0] * 0.5 : spec[1] * 0.5);
    const my = y + (ax === 0 ? spec[1] * 0.5 : spec[0] * 0.5);
    box(cv, iso, mx, my, z + 1.0, 0.5, 0.5, st.range(3.4, 5.2), MD(C.slate));
  }
}

/** A buoy or a mooring float: a drum, a collar and a topmark. */
export function buoy(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.red, C.orange, C.yellow, C.lime, C.white]);
  const h = st.range(1.5, 2.4);
  box(cv, iso, x, y, z, 2.0, 2.0, h, M(c));
  box(cv, iso, x - 0.2, y - 0.2, z + h * 0.45, 2.4, 2.4, 0.4, { top: c.k, left: c.k, right: c.k });
  box(cv, iso, x + 0.7, y + 0.7, z + h, 0.6, 0.6, st.range(2.0, 3.6), MD(C.slate));
  if (st.bool(0.5)) {
    const t = st.pick(C.accents);
    box(cv, iso, x + 0.35, y + 0.35, z + h + 2.0, 1.3, 1.3, 1.1, M(t));
  }
}

/** A board stuck upright in the sand, or leaning on a hut. */
export function surfboard(cv, iso, C, st, x, y, z) {
  const a = st.pick(C.accents);
  const c = C.mk(a._h + st.range(-20, 20), Math.min(1, a._s * st.range(0.6, 1.2)),
    Math.min(0.95, a._L * st.range(0.85, 1.2)));
  const H = st.int(19, 27), variant = st.int(0, 7);
  const key = 'S' + H + ':' + variant;
  let rows = CACHE.get(key);
  if (!rows) {
    const RX = 4, core = [];
    const u = (a2) => (h3(a2, variant, 0x1f7d) >>> 8) / 16777216;
    const lean = (u(1) - 0.5) * 0.30;
    for (let j = 0; j < H; j++) {
      let line = '';
      const t = j / (H - 1);
      const w = 3.1 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1) * 0.92));
      const cx = lean * (H - j);
      for (let i = -RX; i <= RX; i++) {
        const d = i - cx;
        if (d * d > w * w) { line += '.'; continue; }
        line += d < -w * 0.45 ? 'l' : d < w * 0.3 ? 'a' : 'm';
      }
      core.push(line);
    }
    rows = ring(core);
    CACHE.set(key, rows);
  }
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    { d: C.black, a: c.t, l: c.l, m: c.r, x: c.k, '.': -1 }, dep(iso, x, y, z, 1.4));
}

// ---------------------------------------------------------------------------
// Built things, on and behind the berm
// ---------------------------------------------------------------------------

/**
 * A beach hut. A gabled cabin with a stable door, a plinth and a painted front.
 *
 * These are laid in a ROW along a contour by the biome, not scattered, and that
 * is the whole structural argument of the shore: a settlement whose line is the
 * coastline rather than a grid.
 */
export function beachHut(cv, iso, C, st, x, y, z, ax, paint) {
  const w = ax === 0 ? st.range(5.2, 6.6) : st.range(4.4, 5.4);
  const d = ax === 0 ? st.range(4.4, 5.4) : st.range(5.2, 6.6);
  const h = st.range(4.6, 6.2);
  const trim = st.bool(0.6) ? C.white : C.cream;
  // plinth on stilts: a hut on a beach stands off the sand
  for (const [px, py] of [[x, y], [x + w - 0.8, y], [x, y + d - 0.8], [x + w - 0.8, y + d - 0.8]])
    box(cv, iso, px, py, z - 0.9, 0.8, 0.8, 1.2, MD(C.wood));
  const FL = leftFace(iso, y + d, x, z + 0.3);
  const FR = rightFace(iso, x + w, y, z + 0.3);
  // Vertical board cladding, cut in face coordinates: a 1px seam every ~1.1
  // world units in the paint's OWN contour step, never in the shared ink.
  const clad = (F) => (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu;
    const v = F.av * sx + F.bv * sy + F.cv;
    if (v < 0.55) return paint.k;
    if ((u % 1.15) < 0.5 * F.q) return paint.k;
    return v > h * 0.62 ? paint.t : paint.l;
  };
  box(cv, iso, x, y, z + 0.3, w, d, h, {
    top: null, left: clad(FL), right: clad(FR),
  });
  // The door faces the sea. One recessed panel, its own frame, a step.
  const dw = Math.min(2.4, w * 0.42), dh = h * 0.72;
  if (ax === 0) {
    box(cv, iso, x + w * 0.5 - dw * 0.5, y + d - 0.12, z + 0.3, dw, 0.12, dh,
      { top: trim.t, left: paint.k, right: trim.r });
    box(cv, iso, x + w * 0.5 - dw * 0.5 + 0.35, y + d - 0.2, z + 0.6, dw - 0.7, 0.12, dh - 0.7,
      { top: trim.l, left: trim.l, right: trim.r });
  } else {
    box(cv, iso, x + w - 0.12, y + d * 0.5 - dw * 0.5, z + 0.3, 0.12, dw, dh,
      { top: trim.t, left: trim.r, right: paint.k });
    box(cv, iso, x + w - 0.2, y + d * 0.5 - dw * 0.5 + 0.35, z + 0.6, 0.12, dw - 0.7, dh - 0.7,
      { top: trim.l, left: trim.l, right: trim.r });
  }
  const ridgeX = w >= d;
  const roof = st.pick([C.slate, C.steel, C.terra, C.stone, C.metal]);
  // Pitch off the dead zone, per docs/CRAFT.md: k ~ 1 votes nothing.
  const kk = st.bool(0.5) ? st.range(0.24, 0.30) : st.range(0.68, 0.80);
  gable(cv, iso, x - 0.5, y - 0.5, z + 0.3 + h, w + 1.0, d + 1.0,
    (ridgeX ? d + 1 : w + 1) * kk, ridgeX,
    { top: roof.t, left: roof.l, right: roof.r });
}

/** A deck chair: two frames, a slung canvas, an arm. */
export function deckChair(cv, iso, C, st, x, y, z, ax) {
  const a = st.pick(C.accents);
  const c = C.mk(a._h + st.range(-16, 16), Math.min(1, a._s * st.range(0.7, 1.15)),
    Math.min(0.94, a._L * st.range(0.86, 1.16)));
  const w = 2.6, d = 3.4;
  const W = ax === 0 ? w : d, D = ax === 0 ? d : w;
  box(cv, iso, x, y, z, 0.36, 0.36, 1.5, MD(C.wood));
  box(cv, iso, x + W - 0.36, y, z, 0.36, 0.36, 1.5, MD(C.wood));
  box(cv, iso, x, y + D - 0.36, z, 0.36, 0.36, 3.3, MD(C.wood));
  box(cv, iso, x + W - 0.36, y + D - 0.36, z, 0.36, 0.36, 3.3, MD(C.wood));
  // seat, then the raked back as a second slab a step higher
  const F = topFace(iso, z + 1.5, x, y);
  const stripe = (p, q) => (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
    return (Math.floor((ax === 0 ? u : v) / 0.72) & 1) ? p : q;
  };
  drawSlab(cv, iso, x, y, z + 1.5, W, D * 0.55, stripe(c.l, C.white.t));
  box(cv, iso, x + (ax === 0 ? 0 : D * 0.62), y + (ax === 0 ? D * 0.62 : 0),
    z + 1.5, ax === 0 ? W : 0.3, ax === 0 ? 0.3 : D, 1.9,
    { top: c.t, left: c.l, right: c.r });
}

/** A windbreak: striped cloth between three poles, standing across the wind. */
export function windbreak(cv, iso, C, st, x, y, z, len, ax) {
  const a = st.pick(C.accents), b = st.pick(C.accents);
  const h = st.range(2.6, 3.6);
  const n = Math.max(2, Math.round(len / 3.2));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    box(cv, iso, x + (ax === 0 ? t : 0), y + (ax === 0 ? 0 : t), z, 0.4, 0.4, h + 0.7, MD(C.wood));
  }
  const F = ax === 0 ? leftFace(iso, y + 0.16, x, z) : rightFace(iso, x + 0.16, y, z);
  const cloth = (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
    if (v > h - 0.35 * F.q) return C.black;
    return (Math.floor(u / 1.6) & 1) ? a.l : b.t;
  };
  box(cv, iso, x, y, z, ax === 0 ? len : 0.16, ax === 0 ? 0.16 : len, h,
    { top: null, left: cloth, right: cloth });
}

/** A towel: a flat field of two colours with its own ink rim. */
export function towel(cv, iso, C, st, x, y, z, ax) {
  const a = st.pick(C.accents), b = st.bool(0.5) ? C.white : st.pick(C.accents);
  const w = ax === 0 ? st.range(4.6, 6.0) : st.range(2.6, 3.4);
  const d = ax === 0 ? st.range(2.6, 3.4) : st.range(4.6, 6.0);
  const F = topFace(iso, z, x, y);
  const pitch = st.range(0.8, 1.5);
  drawSlab(cv, iso, x, y, z, w, d, (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu - x, v = F.av * sx + F.bv * sy + F.cv - y;
    const e = 0.5 * F.q;
    if (u < e || v < e || u > w - e || v > d - e) return C.black;
    return (Math.floor((ax === 0 ? v : u) / pitch) & 1) ? a.l : b.t;
  });
}

/** A lifeguard stand: a hut on four legs with a ladder and a rail. */
export function lifeguardTower(cv, iso, C, st, x, y, z) {
  const H = st.range(5.5, 8.0);
  const c = st.pick([C.white, C.cream, C.amber, C.aqua]);
  const t = st.pick([C.red, C.orange, C.blue]);
  for (const [px, py] of [[x, y], [x + 4.4, y], [x, y + 4.4], [x + 4.4, y + 4.4]])
    box(cv, iso, px, py, z, 0.7, 0.7, H, MD(C.wood));
  box(cv, iso, x - 0.6, y - 0.6, z + H, 6.3, 6.3, 0.5, MD(C.wood));
  box(cv, iso, x - 0.2, y - 0.2, z + H + 0.5, 5.5, 5.5, 3.4, M(c));
  box(cv, iso, x + 0.4, y + 5.0, z + H + 1.6, 4.3, 0.2, 1.6, M(C.glass));
  gable(cv, iso, x - 0.9, y - 0.9, z + H + 3.9, 6.9, 6.9, 2.0, true,
    { top: t.t, left: t.l, right: t.r });
  // the ladder, on the landward face
  for (let i = 0; i < Math.round(H / 1.1); i++)
    box(cv, iso, x + 1.4, y - 0.9, z + i * 1.1, 2.2, 0.22, 0.22, MD(C.wood));
}

/** A flag on a pole. Every scene needs one vertical it can be read against. */
export function flagPole(cv, iso, C, st, x, y, z, ax) {
  const H = st.range(9, 15);
  box(cv, iso, x, y, z, 0.5, 0.5, H, MD(C.metal));
  box(cv, iso, x - 0.25, y - 0.25, z + H, 1.0, 1.0, 0.6, M(C.amber));
  const a = st.pick(C.accents);
  const fl = st.range(2.6, 4.2), fh = st.range(1.8, 2.8);
  if (ax === 0) {
    box(cv, iso, x + 0.5, y + 0.18, z + H - fh - 0.8, fl, 0.14, fh,
      { top: a.t, left: (sx, sy) => ((sx + sy) & 7) < 4 ? a.l : a.t, right: a.r });
  } else {
    box(cv, iso, x + 0.18, y + 0.5, z + H - fh - 0.8, 0.14, fl, fh,
      { top: a.t, left: a.l, right: (sx, sy) => ((sx - sy) & 7) < 4 ? a.r : a.t });
  }
}

/** A square pile, the unit the pier and the groynes are built out of. */
export function pile(cv, iso, C, st, x, y, z0, z1, w) {
  const t = st.pick([C.wood, C.taupe, C.slate, C.wood]);
  box(cv, iso, x, y, z0, w, w, z1 - z0, { top: t.l, left: t.l, right: t.r });
  // a collar of weed at the waterline is where a pile stops being a stick
  if (z0 < 0.2 && st.bool(0.55)) {
    const g = st.pick([C.leaf, C.green, C.teal]);
    box(cv, iso, x - 0.18, y - 0.18, z0 + st.range(0.0, 0.8), w + 0.36, w + 0.36, 0.6,
      { top: g.k, left: g.k, right: g.k });
  }
}

/** A bin, a shower, a hose stand — the small vertical furniture of a promenade. */
export function shorePost(cv, iso, C, st, x, y, z, kind) {
  if (kind === 0) {                       // rinse shower
    box(cv, iso, x, y, z, 1.1, 1.1, 0.5, MD(C.concrete));
    box(cv, iso, x + 0.2, y + 0.2, z + 0.5, 0.7, 0.7, 6.4, MD(C.metal));
    box(cv, iso, x + 0.1, y + 0.1, z + 6.4, 1.6, 1.6, 0.4, MD(C.steel));
    box(cv, iso, x + 0.55, y + 0.55, z + 6.0, 0.5, 0.5, 0.4, MD(C.slate));
  } else if (kind === 1) {                 // litter drum
    const c = st.pick([C.green, C.blue, C.slate, C.teal]);
    box(cv, iso, x, y, z, 2.2, 2.2, 3.0, { top: c.d, left: c.l, right: c.r });
    box(cv, iso, x - 0.05, y - 0.05, z + 1.4, 2.3, 2.3, 0.3, { top: c.k, left: c.k, right: c.k });
    box(cv, iso, x - 0.3, y - 0.3, z + 3.0, 2.8, 2.8, 0.45, M(c));
  } else {                                 // a marker post with a painted band
    const c = st.pick(C.accents);
    box(cv, iso, x, y, z, 0.8, 0.8, st.range(3.2, 4.6), MD(C.wood));
    box(cv, iso, x - 0.1, y - 0.1, z + 2.2, 1.0, 1.0, 0.7, M(c));
  }
}
