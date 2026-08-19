// Inverse projection per FACE.
//
// A shade callback is handed screen (sx, sy) and must decide what material that
// pixel is. To draw window grids, paving seams, roof gravel or road markings as
// part of the fill — rather than as a second pass that would soften the edges —
// the callback needs the surface coordinates back. Every face of an
// axis-aligned box in this projection inverts to a LINEAR map, so each is three
// coefficients per axis and two multiply-adds per pixel.
//
//   left  face (+y at y1):  u = along +x from x0,  v = height above z0
//   right face (+x at x1):  u = along +y from y0,  v = height above z0
//   top   face (z = zt):    u = along +x from x0,  v = along +y from y0

export function leftFace(iso, y1, x0, z0) {
  return {
    au: 0.5, bu: 0, cu: -0.5 * iso.ox + y1 - x0,
    av: 0.25, bv: -0.5, cv: -0.25 * iso.ox + y1 + 0.5 * iso.oy - z0,
  };
}

export function rightFace(iso, x1, y0, z0) {
  return {
    au: -0.5, bu: 0, cu: 0.5 * iso.ox + x1 - y0,
    av: -0.25, bv: -0.5, cv: 0.25 * iso.ox + x1 + 0.5 * iso.oy - z0,
  };
}

export function topFace(iso, zt, x0, y0) {
  return {
    au: 0.25, bu: 0.5, cu: -0.25 * iso.ox - 0.5 * iso.oy + zt - x0,
    av: -0.25, bv: 0.5, cv: 0.25 * iso.ox - 0.5 * iso.oy + zt - y0,
  };
}

/** World (x, y) of a ground-plane pixel at z = zt. */
export function groundInv(iso, zt) {
  return {
    ax: 0.25, bx: 0.5, cx: -0.25 * iso.ox - 0.5 * iso.oy + zt,
    ay: -0.25, by: 0.5, cy: 0.25 * iso.ox - 0.5 * iso.oy + zt,
  };
}

/**
 * Blit a text bitmap onto an isometric face so the letters lie in the plane.
 * side 'l' runs along +x (screen +2,+1 per unit), side 'r' runs along -y
 * (screen +2,-1). One text pixel is half a world unit, so one screen pixel
 * across and half a pixel down — the stair-step that iso lettering has.
 */
export function blitFace(cv, rows, map, sx0, sy0, side, d, tag = 0) {
  const s = side === 'r' ? -1 : 1;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ci = map[row[i]];
      if (ci === undefined || ci < 0) continue;
      cv.putZ(sx0 + i, sy0 + s * (i >> 1) + j, ci, d, tag);
    }
  }
}

/** Width/height in screen px of a face-blitted bitmap. */
export function faceBlitSize(rows) {
  const w = rows[0] ? rows[0].length : 0;
  return [w, rows.length + (w >> 1)];
}
