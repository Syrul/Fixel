// drawBox, plus the one edge the silhouette sweep can never find.
//
// The near vertical arris — where a box's two lit faces meet — is interior to
// the object, so no outline pass sees it. Without it two adjacent flat faces
// slide together and the box stops reading as a volume. It is also, in this
// projection, exactly screen-vertical: measured against the reference, black
// runs are 65% one pixel wide horizontally, and a scene whose black is all 2:1
// staircase sits at half that. Vertical keylines are how the histogram is won.

import { drawBox as rawBox, asShade } from '../core/iso.js';

let INK = 0;
export function setInk(i) { INK = i; }

/**
 * A FACE NARROWER THAN ~2px CANNOT CARRY A SHADING LADDER.
 *
 * In this projection the +y face is 2*w px across and the +x face is 2*d px, so
 * a 0.7-unit parapet return or a 0.8-unit lamp post presents a face one or two
 * pixels wide holding the RIGHT or DARK step of the ladder. One pixel of a
 * mid-value sitting between a lit face and black ink is the literal definition
 * of `edge.fracAA` — the metric whose failure message is "ANTIALIASED / scaled
 * / resampled output". Mapping the AA pixels showed them lying almost entirely
 * on poles, parapet returns and railing posts; nothing in this generator
 * blends, it just draws slivers of the middle of its own ladder.
 *
 * So a sliver takes its neighbour's value. Two consequences beyond the metric,
 * both wanted: a pole becomes ONE flat colour plus its keyline, which is what
 * eBoy poles are, and two 1px faces stop counting as two separate flat faces —
 * and the face count is 2.6x the reference's.
 */
function unsliver(w, d, mat, q) {
  // The thresholds here are SCREEN sizes — "a face two pixels across" — so they
  // are expressed in world units times q. Left unscaled they would have meant
  // "a face four pixels across" the moment the world got bigger, and every
  // genuinely two-pixel-wide detail on a now-larger object would have been
  // flattened into its neighbour.
  const thinL = w < 1.05 * q, thinR = d < 1.05 * q;
  if (!thinL && !thinR) return mat;
  const fn = (v) => typeof v === 'function';
  // A long thin box — a parapet, a rail, a sign panel — also presents a TOP
  // face one or two pixels across, and the AA map showed that strip lit along
  // the top of every parapet and cornice in the frame: a 1px band of the LEFT
  // step between the roof above and the RIGHT step below is a textbook
  // antialiased triple. The cap takes the front face's value unless the front
  // is a shade callback, in which case its face coordinates are meaningless on
  // the top plane and it is left alone.
  const side = thinR ? mat.left : mat.right;
  const top = fn(side) ? mat.top : side;
  if (thinL && thinR) return { top, left: mat.left, right: mat.left };
  if (thinR) return { top, left: mat.left, right: mat.left };
  return { top, left: mat.right, right: mat.right };
}

export function box(cv, iso, x, y, z, w, d, h, mat, tag) {
  const s = iso.s === undefined ? 1 : iso.s, q = 1 / s;
  rawBox(cv, iso, x, y, z, w, d, h, unsliver(w, d, mat, q), tag);
  // Gate at 0.8: dropping it to 0.55 buys outline.run1Share by carpeting the
  // frame with vertical arrises, and slope.corrDx0Share — the metric that
  // exists to catch exactly that — blows out. Measured, twice. Do not lower it.
  //
  // The upper gate is new and is the same argument as unsliver(): on a post
  // 3px wide the arris separates two faces that now hold the SAME value, so it
  // is a vertical black stroke that encloses nothing. Ink is currently over
  // budget, not under, and `slope.corrDx0Share` is +1.65 bandwidths of "too
  // much of the outline mass is vertical". This is ink taken back.
  if (!INK || w < 0.8 * q || d < 0.8 * q || h < 0.6 * q) return;
  if (w < 1.05 * q && d < 1.05 * q) return;
  const X = x + w, Y = y + d;
  const a = iso.proj(X, Y, z + h), b = iso.proj(X, Y, z);
  const sx = Math.round(a[0]);
  const yTop = Math.round(a[1]), yBase = Math.round(b[1]);
  const XY = s * (X + Y);
  for (let sy = yTop; sy <= yBase; sy++) {
    const zz = (iso.oy + XY - sy) / 2;
    cv.putZ(sx, sy, INK, XY + zz + 0.12, tag);
  }
}

/**
 * A pitched roof, drawn as two sloped quads and a gable end.
 *
 * Deliberately OFF the 2:1 lattice. On a plane z = a + b*y the depth x+y+z is
 * still linear in screen space, so the face rasterises with the same three
 * coefficients as any other; the eaves, though, run at a slope set by the
 * pitch, and at pitch ~0.5 they land at 1:1. Measured on the reference the
 * staircase vote is 71.9% at 2:1 but a deliberate 14.5% at 1:1 — a generator
 * that puts every edge on the lattice reads mechanical however dense it is,
 * and roofs are the honest place to break it.
 */
export function gable(cv, iso, x0, y0, z, w, d, hr, ridgeX, mat, tag) {
  const P = (a, b, c) => iso.proj(a, b, c);
  const ox = iso.ox, oy = iso.oy;
  // The plane z = a + b*y becomes Z = s*a + b*Y once the world is scaled: the
  // PITCH b is a ratio and does not move, the intercept is a length and does.
  // Every coefficient below is linear in `a`, so scaling the intercept is
  // exact rather than an approximation of the sloped-face depth.
  const s = iso.s === undefined ? 1 : iso.s;
  if (ridgeX) {
    const ym = y0 + d / 2, k = hr / (d / 2);
    const slope = (a0, b, pts, shade) => {
      const a = s * a0;
      const dB = (1 + b / 2) / (1 - b);
      const dA = -(1 + b / 2) * b / (2 * (1 - b)) - b / 4;
      const kk = dB * 2 * a + a;
      cv.fillPoly(pts, dA, dB, kk - dA * ox - dB * oy, asShade(shade), tag);
    };
    slope(z + hr + k * ym, -k,
      [P(x0, y0 + d, z), P(x0 + w, y0 + d, z), P(x0 + w, ym, z + hr), P(x0, ym, z + hr)], mat.left);
    slope(z + hr - k * ym, k,
      [P(x0, y0, z), P(x0 + w, y0, z), P(x0 + w, ym, z + hr), P(x0, ym, z + hr)], mat.top);
    const dr = iso.rightDepth(x0 + w);
    cv.fillPoly([P(x0 + w, y0, z), P(x0 + w, y0 + d, z), P(x0 + w, ym, z + hr)],
      dr[0], dr[1], dr[2], asShade(mat.right), tag);
  } else {
    const xm = x0 + w / 2, k = hr / (w / 2);
    const slopeX = (a0, b, pts, shade) => {
      const a = s * a0;
      const dB = (1 + b / 2) / (1 - b);
      const dA = (1 + b / 2) * b / (2 * (1 - b)) + b / 4;
      const kk = dB * 2 * a + a;
      cv.fillPoly(pts, dA, dB, kk - dA * ox - dB * oy, asShade(shade), tag);
    };
    slopeX(z + hr + k * xm, -k,
      [P(x0 + w, y0, z), P(x0 + w, y0 + d, z), P(xm, y0 + d, z + hr), P(xm, y0, z + hr)], mat.right);
    slopeX(z + hr - k * xm, k,
      [P(x0, y0, z), P(x0, y0 + d, z), P(xm, y0 + d, z + hr), P(xm, y0, z + hr)], mat.top);
    const dl = iso.leftDepth(y0 + d);
    cv.fillPoly([P(x0, y0 + d, z), P(x0 + w, y0 + d, z), P(xm, y0 + d, z + hr)],
      dl[0], dl[1], dl[2], asShade(mat.left), tag);
  }
}
