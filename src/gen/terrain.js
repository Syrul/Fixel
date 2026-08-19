// A terraced heightfield, and the affordance readouts that go with it.
//
// WHY TERRACES AND NOT A SMOOTH SURFACE. A smooth surface cannot be drawn in
// this renderer at all: `Canvas.fillPoly` depth-tests a face from three linear
// coefficients, which is exactly why every face in Fixel is planar. But it is
// also the right answer rather than a concession. Contour banding is the
// landscape form of the thing the generator already does everywhere else — a
// flat field, a value step, a 1px keyline — and a terrace edge is a closing
// stroke in the sense `docs/CRAFT.md` means: it bounds a field. Smooth shading
// would have been a gradient, and a gradient is the one thing a 2:1 pixel
// landscape must not contain.
//
// WHAT THIS DELIBERATELY DOES NOT DO IS DRAW A LATTICE. The cells are square
// and regular; the visible EDGES are the contours of an analytic field, which
// are not. Two neighbouring cells on the same terrace draw as two coplanar
// slabs in the same tag, so nothing separates them and the cell grid leaves no
// mark. The only geometry that ever appears is a level CHANGE. That distinction
// is why the ink autocorrelation is allowed to stay clean: pavement seams on a
// rigid pitch were the single worst object in the picture, and this is the same
// hazard avoided by construction rather than by tuning.
//
// TAGS ARE PER TERRACE LEVEL, NOT PER CELL. Per-cell tags would have made the
// silhouette sweep ink every cell boundary — a 12px grid of black over the
// whole frame, the worst thing this generator has ever been asked not to do.
// Per level, the sweep inks exactly the contour breaks, which is what a
// terrace edge looks like and what closes each band into a cell.

import { drawSlab, asShade } from '../core/iso.js';
import { topFace, leftFace, rightFace } from './faces.js';

/**
 * Sample a height field onto a cell grid and terrace it.
 *
 * `cell` is in world units and is the resolution of the LAND FORM, not of the
 * drawing: detail finer than a cell still arrives through the top shader, which
 * is evaluated per pixel. Making the cell small enough to carry detail would
 * cost thousands of extra faces for nothing.
 */
export function makeTerrain(o) {
  const { X0, Y0, X1, Y1, cell, step, height } = o;
  const gx = Math.ceil((X1 - X0) / cell) + 1;
  const gy = Math.ceil((Y1 - Y0) / cell) + 1;
  const raw = new Float32Array(gx * gy);
  const lvl = new Int16Array(gx * gy);
  const wet = new Uint8Array(gx * gy);
  const seaH = o.seaH === undefined ? -1e9 : o.seaH;
  const seaLvl = Math.floor(seaH / step);

  for (let j = 0; j < gy; j++) {
    const wy = Y0 + j * cell;
    for (let i = 0; i < gx; i++) {
      const wx = X0 + i * cell;
      const h = height(wx, wy);
      const k = j * gx + i;
      raw[k] = h;
      if (h < seaH) { wet[k] = 1; lvl[k] = seaLvl; }
      else lvl[k] = Math.max(seaLvl, Math.floor(h / step));
    }
  }

  const ci = (x) => {
    let i = Math.floor((x - X0) / cell);
    return i < 0 ? 0 : i >= gx ? gx - 1 : i;
  };
  const cj = (y) => {
    let j = Math.floor((y - Y0) / cell);
    return j < 0 ? 0 : j >= gy ? gy - 1 : j;
  };

  const T = {
    X0, Y0, X1, Y1, cell, step, gx, gy, raw, lvl, wet, seaH, seaLvl,
    seaZ: seaLvl * step,
    /** Terrace level under a world point. */
    levelAt(x, y) { return lvl[cj(y) * gx + ci(x)]; },
    /** The z an object standing at (x, y) rests on. */
    surfaceZ(x, y) { return lvl[cj(y) * gx + ci(x)] * step; },
    /** Un-terraced height — the field itself, for bands that should not step. */
    heightAt(x, y) { return raw[cj(y) * gx + ci(x)]; },
    isWet(x, y) { return wet[cj(y) * gx + ci(x)] === 1; },
    /**
     * Slope in world units of rise per world unit of run, from the raw field
     * rather than the terraced one — a terraced slope is quantised to 0 or a
     * step and cannot admit or reject anything sensibly.
     */
    slopeAt(x, y) {
      const i = ci(x), j = cj(y);
      const k = j * gx + i;
      const dx = (raw[j * gx + Math.min(gx - 1, i + 1)] - raw[j * gx + Math.max(0, i - 1)]) / (2 * cell);
      const dy = (raw[Math.min(gy - 1, j + 1) * gx + i] - raw[Math.max(0, j - 1) * gx + i]) / (2 * cell);
      return Math.sqrt(dx * dx + dy * dy) + 0 * k;
    },
    /**
     * How far, in world units, the point is from the nearest cell of a
     * different wetness — the shoreline distance, positive on land.
     *
     * Computed by a bounded ring search because a full distance transform over
     * the grid costs more than every use of it put together, and every caller
     * wants "within about a hut's distance of the water", not the exact metric.
     */
    shoreDist(x, y, max = 40) {
      const i0 = ci(x), j0 = cj(y);
      const want = wet[j0 * gx + i0];
      const R = Math.ceil(max / cell);
      for (let r = 1; r <= R; r++) {
        for (let d = -r; d <= r; d++) {
          const pts = [[i0 + d, j0 - r], [i0 + d, j0 + r], [i0 - r, j0 + d], [i0 + r, j0 + d]];
          for (const [i, j] of pts) {
            if (i < 0 || j < 0 || i >= gx || j >= gy) continue;
            if (wet[j * gx + i] !== want) return r * cell;
          }
        }
      }
      return max;
    },
  };
  return T;
}

/**
 * The whole affordance layer, in one call.
 *
 * "Placement is admitted by affordance" is the line worth stealing, and it only
 * means something if the admission is a MEASUREMENT of the world rather than a
 * second random draw. Everything a biome needs to know about a candidate point
 * — how high, how steep, how near the water, how near the track — is read out
 * of the same field that drew the pixel underneath it. A hut on a 40% slope, a
 * tree in the surf and a cactus on a dune crest are all rejected by arithmetic,
 * not by a lucky roll.
 */
export function affordance(T, x, y, track) {
  const h = T.heightAt(x, y);
  return {
    x, y, h,
    z: T.surfaceZ(x, y),
    lvl: T.levelAt(x, y),
    slope: T.slopeAt(x, y),
    wet: T.isWet(x, y),
    shore: T.shoreDist(x, y),
    track: track ? track.dist(x, y) : 1e9,
  };
}

/**
 * Walk a track across the terrain.
 *
 * A road in a city is a decision. A track in a landscape is a CONSEQUENCE: it
 * goes where the ground lets it, which is why a desert road bends around a
 * dune and a mountain path switches back instead of climbing straight. The walk
 * is a greedy least-cost step — among a fan of candidate headings, take the one
 * whose height change is smallest, with a turn penalty so it does not oscillate
 * — and the result is a polyline that is off the 2:1 lattice everywhere,
 * which is the twentyfold gap in `docs/ROUNDS.md` attacked at its source
 * rather than decorated over.
 */
export function walkTrack(T, st, o = {}) {
  const steps = o.steps || 90;
  const len = o.len || 6;
  const fan = o.fan || 0.55;
  const climb = o.climb === undefined ? 1 : o.climb;
  let x = o.x0, y = o.y0;
  let dx = o.dx, dy = o.dy;
  const n0 = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= n0; dy /= n0;
  const pts = [[x, y]];
  for (let s = 0; s < steps; s++) {
    let best = null, bestC = Infinity;
    for (let k = -2; k <= 2; k++) {
      const a = k * fan * 0.5;
      // Rotation without trigonometry: a small-angle rotation matrix built from
      // a rational approximation, renormalised. Exact in IEEE arithmetic and
      // therefore identical in node and in the browser worker.
      const c = (1 - a * a / 2), sn = a - a * a * a / 6;
      let nx = dx * c - dy * sn, ny = dx * sn + dy * c;
      const nn = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nn; ny /= nn;
      const px = x + nx * len, py = y + ny * len;
      if (px < T.X0 + 2 || px > T.X1 - 2 || py < T.Y0 + 2 || py > T.Y1 - 2) continue;
      const rise = Math.abs(T.heightAt(px, py) - T.heightAt(x, y));
      const cost = rise * climb + Math.abs(k) * 0.35 + (T.isWet(px, py) ? 50 : 0);
      if (cost < bestC) { bestC = cost; best = [nx, ny, px, py]; }
    }
    if (!best) break;
    // A trace wanders. Without the jitter the least-cost walk produces long
    // perfectly straight runs on flat ground, and a perfectly straight line at
    // an arbitrary angle is the one thing the 2:1 lattice reads worst.
    const w = st.range(-0.06, 0.06);
    const c = (1 - w * w / 2), sn = w - w * w * w / 6;
    dx = best[0] * c - best[1] * sn;
    dy = best[0] * sn + best[1] * c;
    const nn = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= nn; dy /= nn;
    x = best[2]; y = best[3];
    pts.push([x, y]);
  }
  return {
    pts,
    /** Distance from a point to the polyline, capped — used for admission. */
    dist(px, py) {
      let best = 1e9;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const ex = bx - ax, ey = by - ay;
        const L = ex * ex + ey * ey;
        let t = L > 0 ? ((px - ax) * ex + (py - ay) * ey) / L : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + ex * t - px, cy = ay + ey * t - py;
        const d = cx * cx + cy * cy;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    },
  };
}

/**
 * Draw the terrain.
 *
 * `mats.top(u, v, z, lvl, wet)` and `mats.side(u, v, z, lvl, axis)` are shade
 * callbacks in WORLD coordinates — the face inverse is done here once per
 * terrace rather than once per cell, so a biome writes what the ground is made
 * of and never touches the projection.
 */
export function drawTerrain(cv, iso, T, mats, o) {
  const { X0, Y0, cell, step, gx, gy, lvl, wet } = T;
  const tagFor = o.tagFor;
  const W = cv.w, H = cv.h;
  const s = iso.s === undefined ? 1 : iso.s;
  const ink = o.ink;
  const topCache = new Map();
  const sideCache = new Map();

  const topShader = (z, isWet) => {
    const key = z * 4 + (isWet ? 1 : 0);
    let f = topCache.get(key);
    if (f) return f;
    const F = topFace(iso, z, 0, 0);
    const g = isWet ? mats.water : mats.top;
    f = (sx, sy) => g(F.au * sx + F.bu * sy + F.cu, F.av * sx + F.bv * sy + F.cv, z, F.q);
    topCache.set(key, f);
    return f;
  };

  // A side face inverts differently on the +x and +y walls, and the v axis is
  // HEIGHT there rather than a ground coordinate. Cached on (axis, plane) since
  // a long cliff is many cells sharing one plane.
  const sideShader = (axis, plane, u0, z0) => {
    const key = axis + '|' + plane + '|' + u0 + '|' + z0;
    let f = sideCache.get(key);
    if (f) return f;
    // The two wall inverses already exist and are the ones every other face in
    // this generator uses. Re-deriving them here would have been a second copy
    // of the projection, which is the one thing `src/core` exists to prevent.
    const F = axis === 1 ? rightFace(iso, plane, u0, z0) : leftFace(iso, plane, u0, z0);
    f = (sx, sy) => mats.side(
      F.au * sx + F.bu * sy + F.cu,          // along the wall, world units
      F.av * sx + F.bv * sy + F.cv,          // height above the wall's foot
      plane, axis, F.q, z0);
    sideCache.set(key, f);
    return f;
  };

  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const k = j * gx + i;
      const L = lvl[k];
      const x0 = X0 + i * cell, y0 = Y0 + j * cell;
      const z = L * step;
      // Screen cull. The top face's four corners bound the cell's own drawing;
      // walls only ever hang DOWNWARD from it, so one extra allowance below is
      // enough and no wall is ever clipped away by this test.
      const a = iso.proj(x0, y0 + cell, z), b = iso.proj(x0 + cell, y0, z);
      const t = iso.proj(x0, y0, z), u = iso.proj(x0 + cell, y0 + cell, z);
      if (b[0] < -8 || a[0] > W + 8 || t[1] > H + 8) continue;
      const Lr = i + 1 < gx ? lvl[k + 1] : L;
      const Ll = j + 1 < gy ? lvl[k + gx] : L;
      const drop = Math.max(L - Lr, L - Ll, 0) * step;
      if (u[1] + 2 * s * drop < -8) continue;

      const isWet = wet[k] === 1;
      cv.t = tagFor(L, isWet);
      drawSlab(cv, iso, x0, y0, z, cell, cell, topShader(z, isWet), cv.t);

      // +x wall — exposed only where the cell NEARER the camera in x is lower.
      if (Lr < L) {
        const zb = Lr * step;
        const d = iso.rightDepth(x0 + cell);
        const P = (yy, zz) => iso.proj(x0 + cell, yy, zz);
        cv.fillPoly([P(y0, zb), P(y0 + cell, zb), P(y0 + cell, z), P(y0, z)],
          d[0], d[1], d[2], asShade(sideShader(1, x0 + cell, y0, zb)), cv.t);
      }
      if (Ll < L) {
        const zb = Ll * step;
        const d = iso.leftDepth(y0 + cell);
        const P = (xx, zz) => iso.proj(xx, y0 + cell, zz);
        cv.fillPoly([P(x0, zb), P(x0 + cell, zb), P(x0 + cell, z), P(x0, z)],
          d[0], d[1], d[2], asShade(sideShader(0, y0 + cell, x0, zb)), cv.t);
      }
      // THE SPUR ARRIS, AND ONLY ON A SPUR.
      //
      // `box()` draws the near vertical corner on every solid because without
      // it two lit faces slide together. On terrain that rule would carpet the
      // frame: every cell on a slope has two exposed walls, so an unconditional
      // arris is a vertical black stroke every 12 pixels, which is the
      // `slope.corrDx0Share` blow-out that `docs/CRAFT.md` records as measured
      // twice. It is drawn here only where the cell stands proud of BOTH its
      // near neighbours by at least two terraces — a promontory, a boulder
      // shoulder, a cut bank — where the corner is a real edge and the stroke
      // closes the two walls into one form.
      if (ink && L - Lr >= 2 && L - Ll >= 2) {
        const X = x0 + cell, Y = y0 + cell;
        const zb = Math.max(Lr, Ll) * step;
        const pa = iso.proj(X, Y, z), pb = iso.proj(X, Y, zb);
        const sx = Math.round(pa[0]);
        const XY = s * (X + Y);
        for (let sy = Math.round(pa[1]); sy <= Math.round(pb[1]); sy++) {
          const zz = (iso.oy + XY - sy) / 2;
          cv.putZ(sx, sy, ink, XY + zz + 0.12, cv.t);
        }
      }
    }
  }
}
