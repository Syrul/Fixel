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

export function box(cv, iso, x, y, z, w, d, h, mat, tag) {
  rawBox(cv, iso, x, y, z, w, d, h, mat, tag);
  // Gate at 0.8: dropping it to 0.55 buys outline.run1Share by carpeting the
  // frame with vertical arrises, and slope.corrDx0Share — the metric that
  // exists to catch exactly that — blows out. Measured, twice. Do not lower it.
  if (!INK || w < 0.8 || d < 0.8 || h < 0.6) return;
  const X = x + w, Y = y + d;
  const sx = Math.round(iso.ox + 2 * (X - Y));
  const yBase = Math.round(iso.oy + (X + Y) - 2 * z);
  const yTop = Math.round(iso.oy + (X + Y) - 2 * (z + h));
  for (let sy = yTop; sy <= yBase; sy++) {
    const zz = (iso.oy + X + Y - sy) / 2;
    cv.putZ(sx, sy, INK, X + Y + zz + 0.12, tag);
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
  if (ridgeX) {
    const ym = y0 + d / 2, k = hr / (d / 2);
    const slope = (a, b, pts, shade) => {
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
    const slopeX = (a, b, pts, shade) => {
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
