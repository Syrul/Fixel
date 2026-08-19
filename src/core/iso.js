// The projection.
//
// A 2:1 pixel isometric with INTEGER steps, which is the only kind that gives
// eBoy-hard edges without antialiasing:
//
//     +1 in world x  ->  (+2, +1) on screen
//     +1 in world y  ->  (-2, +1) on screen
//     +1 in world z  ->  ( 0, -2) on screen
//
// so   sx = OX + 2*(x - y)
//      sy = OY + (x + y) - 2*z
//
// The view ray is (1,1,1): moving equally in x, y and z does not move a point
// on screen. Depth is therefore x+y+z, larger = nearer the camera, and on any
// axis-aligned face it is a LINEAR function of (sx, sy) — which is what lets
// Canvas.fillPoly depth-test a whole face from three coefficients instead of
// inverting the projection per pixel.

export const OX_DEFAULT = 0;
export const OY_DEFAULT = 0;

export class Iso {
  constructor(ox = OX_DEFAULT, oy = OY_DEFAULT) { this.ox = ox; this.oy = oy; }

  /** world -> screen, exact integers when x, y, z are integers */
  proj(x, y, z) {
    return [this.ox + 2 * (x - y), this.oy + (x + y) - 2 * z];
  }

  /** depth coefficients for a top face at world z = zt */
  topDepth(zt) { return [0, 1, 3 * zt - this.oy]; }
  /** depth coefficients for the +x face at world x = xr */
  rightDepth(xr) { return [-0.75, -0.5, 3 * xr + 0.75 * this.ox + 0.5 * this.oy]; }
  /** depth coefficients for the +y face at world y = yl */
  leftDepth(yl) { return [0.75, -0.5, 3 * yl - 0.75 * this.ox + 0.5 * this.oy]; }
}

/**
 * A box, drawn as its three camera-facing faces.
 *
 * `mat` is { top, left, right } where each entry is either a palette index or
 * a shade function (sx, sy, depth) => palette index (-1 skips the pixel).
 * Shade functions are how texture, dither and window grids get in without a
 * second pass over the buffer.
 */
export function drawBox(cv, iso, x0, y0, z0, sx, sy, sz, mat, tag = 0) {
  const x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
  const P = (a, b, c) => iso.proj(a, b, c);

  // +y face (screen left)
  if (mat.left !== undefined && mat.left !== null) {
    const d = iso.leftDepth(y1);
    cv.fillPoly(
      [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
      d[0], d[1], d[2], asShade(mat.left), tag);
  }
  // +x face (screen right)
  if (mat.right !== undefined && mat.right !== null) {
    const d = iso.rightDepth(x1);
    cv.fillPoly(
      [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)],
      d[0], d[1], d[2], asShade(mat.right), tag);
  }
  // top face
  if (mat.top !== undefined && mat.top !== null) {
    const d = iso.topDepth(z1);
    cv.fillPoly(
      [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
      d[0], d[1], d[2], asShade(mat.top), tag);
  }
}

/** A flat quad on the ground plane (or any constant z) — roads, plazas, water. */
export function drawSlab(cv, iso, x0, y0, z, sx, sy, shade, tag = 0) {
  const d = iso.topDepth(z);
  const P = (a, b) => iso.proj(a, b, z);
  cv.fillPoly(
    [P(x0, y0), P(x0 + sx, y0), P(x0 + sx, y0 + sy), P(x0, y0 + sy)],
    d[0], d[1], d[2], asShade(shade), tag);
}

export function asShade(v) {
  return typeof v === 'function' ? v : () => v;
}

/**
 * Screen-space bounds of a box, for cheap culling before rasterising.
 * Returns [minX, minY, maxX, maxY].
 */
export function boxBounds(iso, x0, y0, z0, sx, sy, sz) {
  const x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
  const a = iso.proj(x0, y1, z0), b = iso.proj(x1, y0, z0);
  const t = iso.proj(x0, y0, z1), u = iso.proj(x1, y1, z0);
  return [a[0], t[1], b[0], u[1]];
}
