// Highland props.
//
// Everything a mountainside contains that no other biome in this project draws:
// conifers with a branch-tier silhouette, faceted boulders, drystone walls that
// follow a contour, cairns, sheep, a stone bothy, a lattice pylon with its
// cable, and the viaduct that is this biome's authored place.
//
// THREE RULES SHAPE EVERY TABLE IN HERE.
//
// 1. SILHOUETTES ARE GENERATED AT SIZE, NEVER SCALED. `src/gen/props/nature.js`
//    records the finding the hard way: scaling a hand-drawn table by k turns
//    every 1px jog in its outline into a k-pixel jog, and a 2px jog IS the 2:1
//    iso stair. Enlarging a table makes a silhouette MORE machine-like. So a
//    conifer's zigzag, a boulder's facet break and a krummholz mat's ragged top
//    are all computed at the pixel size they will be drawn at.
//
// 2. INTERIORS ARE FEW, LARGE AND FLAT. `docs/CRAFT.md`: flat interiors plus
//    1px outlines plus many objects is the only combination that is dense and
//    flat at once. A boulder is three facets and a keyline, not a noise field;
//    a conifer is four vertical tone bands broken by tier shadows.
//
// 3. INTERIOR FORM IS THE MATERIAL'S OWN DARK, NEVER THE SHARED INK. Bed joints
//    in masonry, the shadow under a branch tier, the contact shadow at the foot
//    of a boulder are all `.k` on the family. `outline.darkShare` is an open
//    regression and this file may not add to it.
//
//   sprite alphabet:  a brightest   l lit   m mid   x dark   k contour
//                     w trunk lit   v trunk dark    s snow    d keyline (black)

import { drawBox, drawSlab } from '../../core/iso.js';
import { box, gable } from '../draw.js';
import { leftFace, rightFace, topFace } from '../faces.js';
import { h3 } from '../palette.js';
import { dep, projR } from '../view.js';
import { FRAMES, triPhase } from '../../core/frame.js';

const CACHE = new Map();

/** Add a fresh one-pixel keyline by four-neighbour dilation, as nature.js does:
 *  any orthogonal path out of the mass crosses the ring, so the interior is a
 *  closed cell under the 4-connectivity the closure metric counts with. */
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

const u1 = (a, b, s) => (h3(a, b, s) >>> 8) / 16777216;

// ---------------------------------------------------------------------------
// HOW MUCH THE TREE LINE MOVES, IN SCREEN PIXELS. One grep finds every
// amplitude in this file; the unit is a whole screen pixel of displacement at
// the extreme of the loop. Set at 0 in this commit: the plumbing lands first
// and is provably inert, then the motion lands on top of it.

/** A conifer: how far the SHADING of its tip travels sideways. The base holds. */
const CONIFER_SWAY_PX = 3.6;
/** One conifer in this many moves at all. The rest are the still mountain. */
const CONIFER_MOVES_ONE_IN = 4;
/**
 * Below this sprite height a conifer never moves. A 1px sway on an 8px tree at
 * the tree line is a tenth of the tree, and the tree line is where the stand is
 * densest — so the smallest trees are exactly the ones that must hold still.
 */
const CONIFER_MIN_PX = 16;

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
// displacement in a fixed-width slot, so a displacement that overflowed its
// slot collided with a NEIGHBOURING VARIANT'S key and handed back a mask of a
// different shape. It is kept even though the shipped amplitude cannot reach
// it: the clamp is what makes the slot width a PROPERTY of the cache rather
// than a coincidence of the current constant. Found by the oracle, as 39 pixels
// whose tag changed under a sprite that cannot change its own silhouette.
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
  // FRAME 0 IS THE STILL PICTURE, because `swing` is anchored to zero at k = 0.
  // That is what keeps every craft number in `docs/` describing the frame the
  // metrics are taken on, and it is why the animation could be added without
  // re-deriving five rounds of measurement.
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



// ---------------------------------------------------------------------------
// CONIFERS
//
// The silhouette is a SAWTOOTH, and that is the whole reason a conifer belongs
// in this project. Its half-width is a smooth taper times a per-tier ramp that
// sweeps out along the tier and snaps back at the next one, so the outline
// steps by 3 or 4 pixels out and 5 back — an angle the 2:1 lattice does not
// contain, repeated forty times up one tree. Round 4's hardest open number is
// 0.5% of area in non-lattice-conforming form against the reference's 9.9%, and
// a mountainside carrying three hundred of these is the largest single attack
// on it available anywhere in the generator.

function treeRows(hpx, wpx, variant, kind, sway = 0) {
  const key = 'T' + kind + '|' + hpx + '|' + wpx + '|' + variant + '|' + sway;
  const had = CACHE.get(key);
  if (had) return had;
  const S = 0x9d21 + variant * 613;
  const H = Math.max(6, hpx);
  const halfMax = Math.max(2, wpx * 0.5);
  const tier = kind === 'spruce' ? 3 + (h3(3, variant, S) % 3) : 4 + (h3(3, variant, S) % 4);
  const lean = (u1(7, variant, S) - 0.5) * 0.55;
  const trunk = kind === 'krummholz' || kind === 'scrub' ? 0 : Math.max(2, Math.round(H * 0.10));
  const half = new Int32Array(H);
  const mid = new Int32Array(H);
  const swayAt = new Int32Array(H);
  for (let j = 0; j < H; j++) {
    const t = j / (H - 1);
    let taper;
    if (kind === 'spruce') taper = t * (0.22 + 0.78 * t);
    else if (kind === 'pine') taper = t * (0.52 + 0.48 * t);
    else if (kind === 'krummholz') taper = 0.30 + 0.70 * Math.sqrt(t);
    else taper = 0.34 + 0.66 * Math.sqrt(t);
    const ph = (j % tier) / tier;
    // sweep out along the tier, snap back at the next one
    const saw = kind === 'krummholz' ? 0.86 + 0.30 * ph : 0.70 + 0.42 * ph;
    const jit = (u1(j, variant, S) - 0.42) * (kind === 'krummholz' ? 3.4 : 1.9);
    half[j] = Math.max(0, Math.round(halfMax * taper * saw + jit));
    // wind-flagged: the mat leans downwind and the lean grows with height
    //
    mid[j] = Math.round(lean * (H - j) * (kind === 'krummholz' ? 0.55 : 0.16));
    // THE SWAY IS A DISPLACEMENT OF THE CROWN'S SHADING, NOT OF ITS OUTLINE.
    // `sway` is a whole number of screen pixels at the TIP, weighted by the
    // square of the height fraction, so the trunk and the lower tiers do not
    // move at all and the rows that do move are CONTIGUOUS: what travels is a
    // block of the crown's tone, one crown catching the wind rather than a rash
    // of needles flickering.
    //
    // It may not move the silhouette, and that is not a taste. `blob` in
    // `src/gen/props/nature.js` carries the measurement: a sprite whose outline
    // changes wins depth tests it lost at frame 0 and rewrites the keyline of
    // whatever stands behind it, and neither is representable in the record.
    // What a sprite may animate is its COLOURS at pixels whose tag, depth and
    // silhouette are identical in every pose.
    const w = (H - 1 - j) / (H - 1);
    swayAt[j] = Math.round(sway * w * w);
  }
  // SWAY_MARGIN is added unconditionally, in the still table too: the extra
  // columns are '.', `blit` skips them, and the blit origin is `p - (width >>
  // 1)` on an odd width, so widening the table moves no drawn pixel. Adding it
  // only when animating would have made the animated frame 0 a different
  // picture from the still one.
  const RX = Math.max(...half) + Math.max(...mid.map(Math.abs)) + 1;
  const core = [];
  for (let j = 0; j < H + trunk; j++) {
    let line = '';
    for (let i = -RX; i <= RX; i++) {
      if (j >= H) {
        const tw = kind === 'pine' ? 2 : 1;
        line += (i >= mid[H - 1] - tw && i <= mid[H - 1] + tw) ? ((i <= mid[H - 1]) ? 'w' : 'v') : '.';
        continue;
      }
      const hw = half[j], c = mid[j], sw = swayAt[j];
      if (i < c - hw || i > c + hw) { line += '.'; continue; }
      // sampled one pixel over: the tone bands travel, the outline does not
      let s = (i - sw - c) / (hw + 0.7);
      if (s < -1) s = -1; else if (s > 1) s = 1;
      const ph = (j % tier) / tier;
      // The shadow a branch tier throws on the one below it: the object's own
      // contour step, one or two rows deep, and only on the shaded half.
      const shade = ph < (kind === 'krummholz' ? 0.34 : 0.26) && j > tier;
      if (shade && s > -0.35) { line += s > 0.45 ? 'k' : 'x'; continue; }
      line += s < -0.52 ? 'a' : s < 0.02 ? 'l' : s < 0.56 ? 'm' : 'x';
    }
    core.push(line);
  }
  const out = ring(core);
  CACHE.set(key, out);
  return out;
}

/**
 * A conifer. `hw` is its world height; the sprite is generated at exactly the
 * pixel size that height projects to.
 */
export function conifer(cv, iso, C, x, y, z, o, A) {
  const s = iso.s === undefined ? 1 : iso.s;
  const hpx = Math.max(7, Math.round(o.hw * 2 * s));
  const wpx = Math.max(4, Math.round(hpx * o.aspect));
  const off = hpx < CONIFER_MIN_PX ? -1 : movePhase(x, y, 0x4d19a3, CONIFER_MOVES_ONE_IN);
  const ps = poseSet(A, off, CONIFER_SWAY_PX, (m) => treeRows(hpx, wpx, o.variant, o.kind, m));
  const g = o.tone, tr = o.trunk;
  const p = projR(iso, x, y, z);
  putPoses(cv, p[0] - (ps[0][0].length >> 1), p[1] - ps[0].length + 2, ps, {
    d: C.black, k: g.k, x: g.r, m: g.l, l: g.t, a: o.tip || g.t,
    w: tr.r, v: tr.k, '.': -1,
  }, dep(iso, x, y, z + o.hw * 0.85, 1.2), A);
}

// ---------------------------------------------------------------------------
// BOULDERS — an irregular silhouette cut into three large flat facets.
//
// Twelve unit directions as literal constants rather than a trig call: nothing
// in `src/gen/**` that decides a pixel may use a transcendental, because they
// are not required to be correctly rounded and the feed renders in a browser
// worker while the duel renders in node.

const DIRS = [
  [1, 0], [0.866, 0.5], [0.5, 0.866], [0, 1], [-0.5, 0.866], [-0.866, 0.5],
  [-1, 0], [-0.866, -0.5], [-0.5, -0.866], [0, -1], [0.5, -0.866], [0.866, -0.5],
];

function boulderRows(R, variant) {
  const key = 'B' + R + '|' + variant;
  const had = CACHE.get(key);
  if (had) return had;
  const S = 0x31c7 + variant * 877;
  const SQ = 0.60;                       // a boulder seen in 2:1 is squat
  const vx = [], vy = [];
  for (let i = 0; i < DIRS.length; i++) {
    const r = R * (0.68 + 0.52 * u1(i, variant, S));
    vx.push(DIRS[i][0] * r);
    vy.push(DIRS[i][1] * r * SQ);
  }
  const RX = Math.ceil(R * 1.25) + 1, RY = Math.ceil(R * 1.25 * SQ) + 1;
  // two straight facet breaks, both off the lattice
  const a1 = -0.45 - 0.55 * u1(21, variant, S), b1 = -0.30 + 0.20 * u1(22, variant, S);
  const c1 = -RY * (0.10 + 0.30 * u1(23, variant, S));
  const a2 = 0.55 + 0.75 * u1(24, variant, S), b2 = -0.65 - 0.40 * u1(25, variant, S);
  const core = [];
  for (let j = -RY; j <= RY; j++) {
    let line = '';
    for (let i = -RX; i <= RX; i++) {
      // ray-crossing test against the twelve-gon
      let inside = false;
      for (let k = 0, m = DIRS.length - 1; k < DIRS.length; m = k++) {
        if ((vy[k] > j) !== (vy[m] > j)
          && i < (vx[m] - vx[k]) * (j - vy[k]) / (vy[m] - vy[k]) + vx[k]) inside = !inside;
      }
      if (!inside) { line += '.'; continue; }
      if (j > RY - 2 || (j > vy[3] * 0.86 && j > RY * 0.55)) { line += 'k'; continue; }
      if (a1 * i + b1 * j > c1 * 0 + (a1 * 0 + b1 * c1)) line += 'a';
      else if (a2 * i + b2 * j > 0) line += 'x';
      else line += 'm';
    }
    core.push(line);
  }
  const out = ring(core);
  CACHE.set(key, out);
  return out;
}

export function boulder(cv, iso, C, x, y, z, o) {
  const rows = boulderRows(o.R, o.variant);
  const g = o.tone;
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 3, rows, {
    d: C.black, k: g.k, x: g.r, m: g.l, a: g.t, '.': -1,
  }, dep(iso, x, y, z, 1.1));
}

// ---------------------------------------------------------------------------
// MASONRY — a face of coursed stone.
//
// The bed and perpend joints are the stone's OWN contour step. Every joint
// CLOSES a block, which is the one case `docs/BAR.md` names where a lattice of
// strokes is right rather than wrong, and none of it is drawn in the shared ink
// that is already over budget.

export function masonry(F, g, seed, o = {}) {
  const px = 0.5 * F.q;
  const course = o.course === undefined ? 1.45 : o.course;
  const blk = course * (o.ratio === undefined ? 1.95 : o.ratio);
  const dark = o.dark || g.r, base = o.base || g.l, lit = o.lit || g.t;
  const cut = o.cut;
  return (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
    if (cut) { const c = cut(u, v); if (c !== 0) return c > 0 ? c : -1; }
    const row = Math.floor(v / course);
    if (v - row * course < px) return g.k;
    const off = (h3(row, 3, seed) & 7) * (blk * 0.12);
    const col = Math.floor((u + off) / blk);
    if ((u + off) - col * blk < px) return g.k;
    const q = h3(col, row, seed) & 15;
    return q < 3 ? lit : q < 6 ? dark : base;
  };
}

// ---------------------------------------------------------------------------
// DRYSTONE WALL — a chain of blocks along a polyline, all under ONE tag.
//
// One tag matters twice. The silhouette sweep then inks the RUN rather than
// each block, so a wall reads as one continuous 8px band with a keyline instead
// of as a comb of separate boxes; and `drawBox` is called directly rather than
// `draw.js`'s `box`, because that one draws the near vertical arris on every
// solid and forty arrises four pixels apart along a wall is a black comb, which
// is exactly the `slope.corrDx0Share` blow-out the terrain code records.

export function wallRun(cv, iso, C, st, pts, zAt, o = {}) {
  const g = o.tone;
  const h = o.h === undefined ? 2.0 : o.h;
  const t = o.t === undefined ? 1.15 : o.t;
  const stepLen = o.step === undefined ? 1.0 : o.step;
  const gap = o.gap === undefined ? 0 : o.gap;
  const seed = st.int(1, 1 << 26);
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-6) continue;
    const k = Math.max(1, Math.round(L / stepLen));
    for (let q = 0; q < k; q++) {
      n++;
      if (gap > 0 && (h3(n, 5, seed) & 63) < gap) continue;
      const x = ax + dx * (q / k), y = ay + dy * (q / k);
      if (o.cull && !o.cull(x, y)) continue;
      const z = zAt(x, y);
      const jj = ((h3(n, 7, seed) & 7) - 3.5) * 0.045;
      drawBox(cv, iso, x - t * 0.5, y - t * 0.5, z - 0.35, t + jj, t + jj, h,
        { top: g.l, left: g.l, right: g.r });
      // The cap course. A drystone wall's coping is what makes it read as
      // built rather than as a berm, and it is a second flat band 2px deep in
      // the stone's own lit step.
      drawBox(cv, iso, x - t * 0.62, y - t * 0.62, z - 0.35 + h, t * 1.24 + jj, t * 1.24 + jj, 0.55,
        { top: g.t, left: g.r, right: g.k });
    }
  }
}

/** Post-and-wire, for the ground a wall does not justify. */
export function postWire(cv, iso, C, st, pts, zAt, o = {}) {
  const w = o.tone;
  const h = o.h === undefined ? 2.6 : o.h;
  const pitch = o.pitch === undefined ? 4.2 : o.pitch;
  let carry = 0, prev = null;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1e-6) continue;
    for (let d = carry; d < L; d += pitch) {
      const x = ax + dx * (d / L), y = ay + dy * (d / L);
      if (o.cull && !o.cull(x, y)) { prev = null; continue; }
      const z = zAt(x, y);
      drawBox(cv, iso, x, y, z - 0.3, 0.55, 0.55, h, { top: w.t, left: w.l, right: w.k });
      if (prev) {
        const a = projR(iso, prev[0] + 0.27, prev[1] + 0.27, prev[2] + h - 0.5);
        const b = projR(iso, x + 0.27, y + 0.27, z - 0.3 + h - 0.5);
        cv.line(a[0], a[1], b[0], b[1], w.k, dep(iso, x, y, z + h, 1.4));
      }
      prev = [x, y, z - 0.3];
      carry = d + pitch - L;
    }
  }
}

// ---------------------------------------------------------------------------

export function cairn(cv, iso, C, st, x, y, z, o = {}) {
  const g = o.tone;
  const n = st.int(4, 6);
  const R = o.R === undefined ? 1.5 : o.R;
  let zz = z - 0.3;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const r = R * (1 - 0.62 * t) * st.range(0.86, 1.12);
    const hh = st.range(0.55, 0.95);
    drawBox(cv, iso, x - r + st.range(-0.2, 0.2), y - r + st.range(-0.2, 0.2), zz,
      r * 2, r * 2, hh, { top: i === n - 1 ? g.t : g.l, left: g.l, right: g.r });
    zz += hh;
  }
  drawBox(cv, iso, x - 0.4, y - 0.4, zz, 0.8, 0.8, 0.9, { top: g.t, left: g.r, right: g.k });
}

/** Sheep. Recorded deviation: at 2.4 world units nose to tail this animal is
 *  two and a half metres long. A correct 1.2m sheep is 5 screen pixels and its
 *  legs are one, which is below the legibility floor `docs/BAR.md` sets — and
 *  when the canons conflict the medium wins. */
const SHEEP = [
  '..llllll..', '.llllllll.', 'llllllllm.', 'llllllllm.', 'mllllllmm.',
  '.mm.mm.mm.', '.xx.xx.xx.',
];
const SHEEP_R = [
  '..llllll..', '.llllllll.', '.mllllllll', '.mllllllll', '.mmllllllm',
  '.mm.mm.mm.', '.xx.xx.xx.',
];
export function sheep(cv, iso, C, x, y, z, o) {
  const key = 'S' + (o.flip ? 1 : 0);
  let rows = CACHE.get(key);
  if (!rows) { rows = ring(o.flip ? SHEEP_R : SHEEP); CACHE.set(key, rows); }
  const g = o.tone;
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    { d: C.black, l: g.t, m: g.l, x: g.k, '.': -1 }, dep(iso, x, y, z, 1.3));
  // the head, in its own dark, on the end the animal faces
  const hx = o.flip ? p[0] + 3 : p[0] - 6;
  cv.blit(hx, p[1] - rows.length + 4, ['ddd', 'dxd', '.d.'],
    { d: C.black, x: g.k, '.': -1 }, dep(iso, x, y, z, 1.4));
}

// ---------------------------------------------------------------------------
// A STONE BOTHY / BYRE. Pitch is held near 0.55 or 1.45 and never near 1.0:
// `docs/CRAFT.md` measures the 1:1 slope vote at 0.036 for k in 0.9-1.0 against
// 0.35-0.40 at k = 0.5 or 1.5. Our building code sits dead centre of that dead
// zone; a mountain roof does not have to.

export function bothy(cv, iso, C, st, x, y, z, w, d, o = {}) {
  const g = o.tone, rf = o.roof;
  const wallH = o.wallH === undefined ? st.range(4.4, 6.2) : o.wallH;
  const seed = st.int(1, 1 << 26);
  const FL = leftFace(iso, y + d, x, z), FR = rightFace(iso, x + w, y, z);
  const ridgeX = w >= d;
  const dr = o.dark || C.slate;
  // SOMEBODY IS IN, OR NOBODY IS. `o.lamp` is an EMISSIVE family or null, and it
  // is the whole of the highland's night light: a hut with a fire in it is what
  // is actually up there after dark, and it is not a street lamp with a mountain
  // behind it. Null by day and on an empty bothy, so both of those paths are
  // byte-identical to the render before this existed.
  //
  // THE OPENINGS ARE NOT RESIZED WHEN THEY ARE LIT, and that is deliberate
  // rather than lazy. Adding a second window on the night branch would make the
  // same seed a different BUILDING at a different hour, which is the kind of
  // inconsistency nobody notices in one post and everybody notices in a feed —
  // and it would put a geometry change inside a lighting commit, which this
  // repo has a standing rule about. Only the colour behind the hole moves.
  const lamp = o.lamp || null;
  const px = 0.5 * (FL.q === undefined ? 1 : FL.q);
  // openings, cut in the masonry shader so the reveal is part of the wall
  const doorU = st.range(1.6, Math.max(1.7, w - 3.4)), winU = st.range(1.4, Math.max(1.5, w - 3.0));
  const cutL = (u, v) => {
    if (u > doorU && u < doorU + 2.0 && v < 3.3) {
      if (u < doorU + 0.3 || u > doorU + 1.7 || v > 3.0) return g.k;
      if (!lamp) return dr.k;
      // A DOORWAY IS A HOLE AND THE FLOOR OF THE ROOM IS AT THE BOTTOM OF IT.
      // One flat rectangle of light reads as a sticker; the lower band is the
      // lamp's own shaded step, which is the floor catching it, and that is the
      // whole of the modelling an opening six pixels wide can carry.
      return v < 0.8 ? lamp.l : lamp.t;
    }
    if (u > winU && u < winU + 1.5 && v > 3.9 && v < 5.3 && wallH > 5.6) {
      if (!lamp) return dr.k;
      // A transom in the lamp's own dark, so the opening reads as a WINDOW and
      // not as a hole punched through the gable. One screen pixel, via `q`.
      if (v > 4.58 && v < 4.58 + px) return lamp.k;
      return lamp.t;
    }
    return 0;
  };
  const cutR = (u, v) => {
    if (u > 1.6 && u < 3.1 && v > 2.2 && v < 3.7) {
      if (!lamp) return dr.k;
      // The gable window is on the far side of the room from the door, so it is
      // one rung down: the same light, further from it.
      return v > 3.62 - px ? lamp.k : lamp.l;
    }
    return 0;
  };
  drawBox(cv, iso, x, y, z, w, d, wallH, {
    top: g.l,
    left: masonry(FL, g, seed, { cut: cutL, course: 1.35, base: g.l, lit: g.t, dark: g.r }),
    right: masonry(FR, g, seed + 11, { cut: cutR, course: 1.35, base: g.r, lit: g.l, dark: g.k }),
  });
  const span = ridgeX ? d : w;
  const k = st.bool(0.5) ? st.range(0.48, 0.62) : st.range(1.34, 1.56);
  const hr = span * 0.5 * k;
  gable(cv, iso, x - 0.7, y - 0.7, z + wallH, w + 1.4, d + 1.4, hr, ridgeX, {
    top: rf.l, left: rf.t, right: rf.r,
  });
  // ridge and a chimney: the two things that make a roof a roof at this size
  if (ridgeX) drawBox(cv, iso, x - 0.7, y + d * 0.5 - 0.3, z + wallH + hr, w + 1.4, 0.6, 0.45, { top: rf.t, left: rf.r, right: rf.k });
  else drawBox(cv, iso, x + w * 0.5 - 0.3, y - 0.7, z + wallH + hr, 0.6, d + 1.4, 0.45, { top: rf.t, left: rf.r, right: rf.k });
  if (o.chimney !== false) {
    const cx = x + (ridgeX ? st.range(0.6, w - 2.2) : w * 0.5 - 0.85);
    const cy = y + (ridgeX ? d * 0.5 - 0.85 : st.range(0.6, d - 2.2));
    box(cv, iso, cx, cy, z + wallH, 1.7, 1.7, hr + st.range(1.6, 2.8), { top: g.t, left: g.l, right: g.r });
    box(cv, iso, cx - 0.25, cy - 0.25, z + wallH + hr + 2.4, 2.2, 2.2, 0.6, { top: dr.k, left: g.t, right: g.r });
  }
}

/** Stacked cordwood against a gable — a highland yard is never empty. */
export function logStack(cv, iso, C, st, x, y, z, o = {}) {
  const g = o.tone;
  const n = st.int(3, 5), rowsN = st.int(2, 4);
  for (let r = 0; r < rowsN; r++) {
    for (let i = 0; i < n; i++) {
      const jitter = (r & 1) ? 0.45 : 0;
      drawBox(cv, iso, x + jitter, y + i * 1.25, z + r * 1.15, 3.4, 1.15, 1.15,
        { top: g.l, left: g.r, right: ((i + r) & 1) ? g.t : g.l });
    }
  }
}

// ---------------------------------------------------------------------------
// A LATTICE PYLON AND ITS CABLE. The cable is the one stroke in this biome that
// crosses open air, and it is drawn in the metal's own contour step rather than
// in the shared ink: it is a wire, not a silhouette.

// THE BEACON ON THE HEAD OF THE TALLEST PYLON.
//
// The second of the highland's two emitters, and the argument for it is the
// same as the bothy's: it is a light that is ACTUALLY up there. A steel line
// walking over a ridge carries an obstruction lamp because the ridge is the
// reason it has to; it is not a street lamp with a mountain behind it, which is
// what a highland gets if you reach for the city's furniture.
//
// IT IS A COLOUR OVER A FIXED SILHOUETTE AND NOTHING ELSE. Three poses, six
// pixels each, identical shape, identical origin, identical depth, identical
// tag — which is the whole of what `Canvas.blitAnim`'s contract allows, and the
// reason a beacon is the right thing to animate here and a swinging cable is
// not. A grown or moved silhouette wins depth tests it lost at frame 0 and
// changes tag adjacency, and `outlinePass` then un-blackens a pixel of whatever
// is behind it — 36 px that no sprite touches and no recorder sees. See
// `docs/BAR.md`, "the related law, for anything blitted".
//
// SIX PIXELS, NOT ONE. A single flashing pixel is per-pixel noise with a story
// attached: `animcheck.mjs` 4-connects the ever-moved mask and fails a seed
// whose motion lives in 1-2 px islands, and it would be right to. 3x2 is one
// island of six and the smallest thing that can read as a lamp rather than as a
// stuck pixel.
const BEACON = {
  a: ['aaa', 'aaa'],
  b: ['bbb', 'bbb'],
  c: ['ccc', 'ccc'],
};
const BEACON_CH = 'abc';

/**
 * Which rung the beacon is on at frame `k`.
 *
 * A THRESHOLDED `triPhase`, NOT A HAND-WRITTEN TABLE, and the difference is
 * the loop closing by arithmetic rather than by somebody counting entries.
 * `triPhase` is periodic with period 1 in `phase(k)` and has no kick at the
 * wrap; a threshold of a periodic function is periodic, so frame FRAMES is
 * frame 0 whatever the table would have said. A literal 8-entry sequence would
 * be a second place the loop length is written down, and it would close only
 * for as long as nobody changed `FRAMES`.
 *
 * ANCHORED AT 0.5 SO FRAME 0 IS THE LIT ONE. Everywhere else in this file the
 * anchor exists to make frame 0 the STILL picture; here there is no still
 * picture to preserve — the beacon is new — so the anchor is spent on the other
 * thing it can buy, which is that a one-frame render shows a lamp that is on.
 * A still render of a beacon caught at its darkest would be a lamp nobody can
 * see, in the only picture most tools ever look at.
 */
function beaconRung(k) {
  const b = triPhase(k, 0.5);
  return b > 0.70 ? 0 : b > 0.30 ? 1 : 2;
}

export function pylon(cv, iso, C, st, x, y, z, h, o = {}, A) {
  const m = o.tone;
  const base = o.base === undefined ? 2.4 : o.base, top = 1.2;
  const legs = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [i, j] of legs) {
    // battered legs, approximated as three stacked segments
    for (let s = 0; s < 3; s++) {
      const t0 = s / 3, t1 = (s + 1) / 3;
      const w0 = base + (top - base) * t0, w1 = base + (top - base) * t1;
      drawBox(cv, iso, x + i * w0 - 0.3, y + j * w0 - 0.3, z + h * t0, 0.62, 0.62, h * (t1 - t0) + 0.05,
        { top: m.t, left: m.l, right: m.k });
      if (s === 2) drawBox(cv, iso, x + i * w1 - 0.3, y + j * w1 - 0.3, z + h, 0.62, 0.62, 0.1, { top: m.t, left: m.l, right: m.k });
    }
  }
  for (let s = 1; s <= 3; s++) {
    const t = s / 3.4;
    const w = base + (top - base) * t;
    drawBox(cv, iso, x - 0.3, y - 0.3, z + h * t, w + 0.6, 0.42, 0.42, { top: m.l, left: m.r, right: m.k });
    drawBox(cv, iso, x - 0.3, y - 0.3, z + h * t, 0.42, w + 0.6, 0.42, { top: m.l, left: m.r, right: m.k });
  }
  // the head beam the cable runs over
  drawBox(cv, iso, x - 1.4, y + top * 0.5 - 0.4, z + h + 0.1, top + 2.8, 0.9, 0.85, { top: m.t, left: m.l, right: m.r });
  const hx = x + top * 0.5, hy = y + top * 0.5, hz = z + h + 0.95;
  // `o.lamp` is three palette indices — bright, mid, ember — or absent. Absent
  // by day and on every pylon but one, so both of those paths draw exactly the
  // pixels they drew before this existed.
  if (o.lamp) {
    const p = projR(iso, hx, hy, hz);
    // TWO THINGS WERE MEASURED HERE AND BOTH FIRST GUESSES WERE WRONG. Counted,
    // not reasoned: the lamp writes six pixels and only two or three of them
    // reached the frame, on 5 of 5 seeds, with nothing erroring anywhere.
    //
    // ONE: THE DEPTH BIAS. `dep` is s*(x+y+z), exactly what `topDepth` resolves
    // to at the same point, so +2.2 looked like "two units in front of the beam
    // it sits on". It is not — `hx, hy` is the CENTRE of the beam's top face and
    // depth varies ACROSS that face. The beam spans 4.0 units in x and 0.9 in y,
    // so its near half is up to s*(2.0 + 0.45) = 4.9 deeper than its centre, and
    // a 2.2 bias lost the depth test over half the lamp. 6.0 clears the whole
    // face with margin: three world units of "in front", i.e. a lamp on a short
    // bracket. It does mean an object standing within three units nearer would
    // be drawn through, and at the top of a pylon there is nothing there.
    //
    // TWO, AND THIS IS THE ONE THAT MATTERED: THE SILHOUETTE SWEEP ATE IT. The
    // rendered-vs-`noOut` counts were 2 and 6 — so the depth was not the whole
    // story, and the missing four pixels were being BLACKENED rather than lost.
    // The head beam's top face is a 4.0 x 0.9 rectangle, and in this projection
    // that projects to a sliver about four pixels thick perpendicular to its own
    // long axis. A 3x2 lamp cannot fit inside it, so the lamp's edge pixels sat
    // against the terrain's tag, and `outlinePass` correctly inked the near side
    // of every one of them. A LIGHT IS NOT AN OBJECT AND HAS NO SILHOUETTE, so
    // it takes a `tagRaw` tag and opts out of the sweep — the same reason a
    // pedestrian does, arrived at from the opposite direction.
    const d = dep(iso, hx, hy, hz, 6.0);
    const map = { a: o.lamp[0], b: o.lamp[1], c: o.lamp[2] };
    const K = A && A.frames > 1 ? A.frames : 1;
    const ps = new Array(K);
    for (let j = 0; j < K; j++) ps[j] = BEACON[BEACON_CH[beaconRung((A ? A.frame : 0) + j)]];
    const keep = cv.t;
    if (o.lampTag) cv.t = o.lampTag;
    putPoses(cv, p[0] - 1, p[1] - 2, ps, map, d, A);
    cv.t = keep;
  }
  return [hx, hy, hz];
}

/** A catenary, as a parabola. No transcendental anywhere near a pixel. */
export function cable(cv, iso, C, a, b, sag, ci) {
  const p = projR(iso, a[0], a[1], a[2]), q = projR(iso, b[0], b[1], b[2]);
  const d = Math.max(dep(iso, a[0], a[1], a[2]), dep(iso, b[0], b[1], b[2])) + 2.0;
  let px = p[0], py = p[1];
  const N = 14;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const nx = Math.round(p[0] + (q[0] - p[0]) * t);
    const ny = Math.round(p[1] + (q[1] - p[1]) * t + 4 * sag * t * (1 - t));
    cv.line(px, py, nx, ny, ci, d);
    px = nx; py = ny;
  }
}

/** The bucket that hangs from it — small, but it is what says "cable". */
export function skip(cv, iso, C, x, y, z, o) {
  const c = o.tone;
  drawBox(cv, iso, x, y, z, 0.35, 0.35, 1.6, { top: c.t, left: c.l, right: c.k });
  drawBox(cv, iso, x - 1.5, y - 1.5, z - 2.4, 3.4, 3.4, 2.4, { top: c.d, left: c.l, right: c.r });
}

// ---------------------------------------------------------------------------
// THE VIADUCT — this biome's authored place.
//
// Everything else in the frame is admitted by the land: a tree stands where the
// elevation lets it, a wall follows a contour, scree lies where a cliff put it.
// The viaduct is the one thing that was DECIDED, and it is decided first so the
// ambient scatter can read its distance field and yield to it.
//
// It is also the only object in this project that draws a VOID. Every arch is a
// hole in a solid through which the hillside behind is visible, and the ring
// around that hole is a curve — neither the 2:1 lattice nor the vertical — so a
// six-bay viaduct is twelve long curved edges in a picture whose measured
// non-lattice-conforming share is half a percent.

export function viaduct(cv, iso, C, st, o) {
  const { x0, y0, len, wide, ax, zDeck, groundZ } = o;
  const g = o.tone, dk = o.deck;
  const seed = st.int(1, 1 << 26);
  const bays = o.bays;
  const bayL = len / bays;
  const springH = Math.min(o.rise, bayL * 0.46);
  const tagOf = o.tag;

  const along = (t) => (ax === 0 ? [x0 + t, y0] : [x0, y0 + t]);
  const W = (l, t) => (ax === 0 ? [l, t] : [t, l]);

  // ---- piers, from the ground up to the arch springing
  for (let b = 0; b <= bays; b++) {
    const t = b * bayL;
    const pw = b === 0 || b === bays ? 3.4 : 2.6;
    const [px, py] = along(t - pw * 0.5);
    const gz = groundZ(...along(t));
    const [sw, sd] = W(pw, wide);
    const top = zDeck - springH - 0.6;
    if (top - gz < 0.8) continue;
    // battered: three lifts, each a little narrower than the one below
    const lifts = Math.max(1, Math.min(4, Math.round((top - gz) / 7)));
    for (let l = 0; l < lifts; l++) {
      const f0 = l / lifts, f1 = (l + 1) / lifts;
      const k = 1 + 0.30 * (1 - f0);
      const [w2, d2] = W(sw * k, sd * (1 + 0.16 * (1 - f0)));
      const bx = px - (w2 - sw) * 0.5, by = py - (d2 - sd) * 0.5;
      const zz = gz - 1.4 + (top - gz + 1.4) * f0;
      const hh = (top - gz + 1.4) * (f1 - f0) + 0.05;
      const FL = leftFace(iso, by + d2, bx, zz), FR = rightFace(iso, bx + w2, by, zz);
      cv.t = tagOf();
      drawBox(cv, iso, bx, by, zz, w2, d2, hh, {
        top: g.l,
        left: masonry(FL, g, seed + b, { course: 1.5, base: g.l, lit: g.t, dark: g.r }),
        right: masonry(FR, g, seed + b + 3, { course: 1.5, base: g.r, lit: g.l, dark: g.k }),
      });
    }
  }

  // ---- spandrels with their arches
  for (let b = 0; b < bays; b++) {
    const t0 = b * bayL;
    const [bx, by] = along(t0);
    const [sw, sd] = W(bayL, wide);
    const z0 = zDeck - springH - 0.6;
    const hh = springH + 0.6;
    const FL = leftFace(iso, by + sd, bx, z0);
    const FR = rightFace(iso, bx + sw, by, z0);
    const r = bayL * 0.5 - 1.3;
    const cu = bayL * 0.5, cvv = 0.0;
    // the arch: a void inside the soffit, a voussoir ring 1.3 units thick
    // around it, coursed stone outside that
    const archCut = (u, v) => {
      const du = u - cu, dv = v - cvv;
      if (dv < -0.2) return du > -r && du < r ? -1 : 0;
      const d = Math.sqrt(du * du + dv * dv);
      if (d < r) return -1;
      if (d < r + 1.3) {
        // voussoirs: the ring is cut into wedges by radial joints
        const q = Math.floor((du / (d + 0.001)) * 7.5);
        return ((q + 32) & 1) ? g.t : g.l;
      }
      return 0;
    };
    cv.t = tagOf();
    drawBox(cv, iso, bx, by, z0, sw, sd, hh, {
      top: null,
      left: masonry(FL, g, seed + 40 + b, { cut: archCut, course: 1.5, base: g.l, lit: g.t, dark: g.r }),
      right: b === bays - 1 ? masonry(FR, g, seed + 60, { course: 1.5, base: g.r, lit: g.l, dark: g.k }) : null,
    });
  }

  // ---- the deck: a string course, ballast, and a parapet on both edges
  const [dx0, dy0] = [x0, y0];
  const [dw, dd] = W(len, wide);
  cv.t = tagOf();
  drawBox(cv, iso, dx0 - 0.8, dy0 - 0.8, zDeck - 0.6, dw + 1.6, dd + 1.6, 0.9,
    { top: g.t, left: g.l, right: g.r });
  cv.t = tagOf();
  const FT = topFace(iso, zDeck + 0.3, dx0, dy0);
  drawSlab(cv, iso, dx0, dy0, zDeck + 0.3, dw, dd, (sx, sy) => {
    const u = FT.au * sx + FT.bu * sy + FT.cu, v = FT.av * sx + FT.bv * sy + FT.cv;
    const l = ax === 0 ? u : v, c = ax === 0 ? v : u;
    if (c < 1.5 || c > wide - 1.5) return dk.r;
    const q = h3(Math.floor(l / 2.2), Math.floor(c / 2.0), seed) & 7;
    // two sleeper-scale tones and a pair of rails
    if (c > wide * 0.5 - 2.4 && c < wide * 0.5 - 1.9) return dk.k;
    if (c > wide * 0.5 + 1.9 && c < wide * 0.5 + 2.4) return dk.k;
    return q < 3 ? dk.l : q < 6 ? dk.t : dk.r;
  });
  for (const side of [0, 1]) {
    cv.t = tagOf();
    const off = side === 0 ? -0.8 : (ax === 0 ? dd - 0.2 : dw - 0.2);
    const [px, py] = ax === 0 ? [dx0 - 0.8, dy0 + off + 0.8] : [dx0 + off + 0.8, dy0 - 0.8];
    const [pw, pd] = W(len + 1.6, 1.0);
    const FP = ax === 0 ? leftFace(iso, py + pd, px, zDeck + 0.3) : rightFace(iso, px + pw, py, zDeck + 0.3);
    drawBox(cv, iso, px, py, zDeck + 0.3, pw, pd, 2.3, {
      top: g.t,
      left: masonry(FP, g, seed + 90 + side, { course: 1.05, ratio: 1.6, base: g.l, lit: g.t, dark: g.r }),
      right: masonry(FP, g, seed + 95 + side, { course: 1.05, ratio: 1.6, base: g.r, lit: g.l, dark: g.k }),
    });
    cv.t = tagOf();
    drawBox(cv, iso, px - 0.25, py - 0.25, zDeck + 2.6, pw + 0.5, pd + 0.5, 0.55,
      { top: g.t, left: g.r, right: g.k });
  }
}
