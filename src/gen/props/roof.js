// Rooftops. In the reference no roof is ever bare: tanks, plant, vents, huts,
// dishes, solar, aerials, crates. A flat roof colour is a hole in the density.

import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { topFace, leftFace, rightFace, blitFace, textPanel } from '../faces.js';
import { h3 } from '../palette.js';
import { textBitmap, scaleBitmap, signInk } from '../font.js';

const M = (f) => ({ top: f.t, left: f.l, right: f.r });
const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

export function acUnit(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.metal, C.concrete, C.steel, C.white]);
  const w = st.range(1.8, 3.2), d = st.range(1.8, 3.0), h = st.range(1.0, 1.8);
  const F = leftFace(iso, y + d, x, z);
  box(cv, iso, x, y, z, w, d, h, {
    top: c.t,
    left: (sxp, syp) => {
      const u = F.au * sxp + F.cu;
      return (Math.floor(u / 1.5) & 1) ? c.l : c.r;
    },
    right: c.r,
  });
  box(cv, iso, x + 0.3, y + 0.3, z + h, w - 0.6, d - 0.6, 0.35, MD(C.tar));
}

export function waterTank(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.wood, C.metal, C.cream, C.terra]);
  const r = st.range(2.0, 3.4);
  for (const [dx, dy] of [[0, 0], [r - 0.5, 0], [0, r - 0.5], [r - 0.5, r - 0.5]])
    box(cv, iso, x + dx, y + dy, z, 0.5, 0.5, 2.2, MD(C.metal));
  box(cv, iso, x - 0.3, y - 0.3, z + 2.2, r + 0.6, r + 0.6, 3.0, M(c));
  box(cv, iso, x + 0.2, y + 0.2, z + 5.2, r, r, 0.5, MD(c));
}

export function vent(cv, iso, C, st, x, y, z) {
  const h = st.range(1.6, 3.6);
  box(cv, iso, x, y, z, 0.6, 0.6, h, MD(C.metal));
  box(cv, iso, x - 0.25, y - 0.25, z + h, 1.1, 1.1, 0.4, M(C.metal));
}

export function stairHut(cv, iso, C, st, x, y, z, wall) {
  const w = st.range(3.5, 6), d = st.range(3.5, 6), h = st.range(3, 5);
  box(cv, iso, x, y, z, w, d, h, { top: wall.t, left: wall.l, right: wall.r });
  box(cv, iso, x - 0.3, y - 0.3, z + h, w + 0.6, d + 0.6, 0.4, MD(C.concrete));
  const dr = st.pick([C.red, C.blue, C.metal]);
  box(cv, iso, x + 0.6, y + d, z, 1.6, 0.08, 2.4, M(dr));
}

export function dish(cv, iso, C, st, x, y, z) {
  box(cv, iso, x, y, z, 0.4, 0.4, 1.4, MD(C.metal));
  const p = iso.proj(x + 0.2, y + 0.2, z + 1.4);
  const rows = ['.####.', '######', '######', '.####.', '..##..'];
  cv.blit(p[0] - 3, p[1] - 5, rows, { '#': C.white.l, '.': -1 }, x + y + z + 3);
}

export function solar(cv, iso, C, st, x, y, z, w, d) {
  const F = topFace(iso, z + 0.6, x, y);
  for (const [dx, dy] of [[0.2, 0.2], [w - 0.6, 0.2], [0.2, d - 0.6], [w - 0.6, d - 0.6]])
    box(cv, iso, x + dx, y + dy, z, 0.4, 0.4, 0.6, MD(C.metal));
  // The cell divisions are the panel's OWN dark, not the shared ink. A solar
  // array is a grid of glass in an aluminium frame; drawing that frame in the
  // silhouette black made a 3x2-unit roof gadget about a fifth pure black, and
  // it is one of a dozen props that were each spending silhouette ink on
  // interior form. Same drawing, a value step instead of a keyline.
  drawSlab(cv, iso, x, y, z + 0.6, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    if ((u % 5.5) < 0.62 || (v % 5.5) < 0.62) return C.indigo.k;
    return C.indigo.l;
  });
}

export function skylight(cv, iso, C, st, x, y, z, w, d) {
  box(cv, iso, x, y, z, w, d, 0.5, MD(C.concrete));
  const F = topFace(iso, z + 0.5, x, y);
  drawSlab(cv, iso, x + 0.3, y + 0.3, z + 0.5, w - 0.6, d - 0.6, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu;
    return (Math.floor(u / 2.4) & 1) ? C.aqua.t : C.aqua.l;
  });
}

/**
 * A mast with cross-elements.
 *
 * THE CROSSBARS USED TO BE PERFECTLY HORIZONTAL BLACK LINES, and that is a
 * projection bug, not a style. A horizontal run is off-axis for BOTH the 2:1
 * lattice and the vertical, so nothing in a dimetric city can produce one as a
 * chosen break — measured, we had 125 horizontal constant runs >= 40px against
 * the reference's 9. Four black horizontals per aerial, on every roof in the
 * frame, were a visible share of that. They also bounded nothing: a stroke that
 * begins and ends in mid-air is the "non-closing ink chain" defect exactly.
 *
 * A crossbar is now a physical box lying along +x, so it projects onto the
 * lattice like everything else, and it is drawn in the metal's own dark rather
 * than in the shared ink.
 */
export function aerial(cv, iso, C, st, x, y, z) {
  const h = st.range(5, 13);
  box(cv, iso, x, y, z, 0.3, 0.3, h, MD(C.metal));
  const n = st.int(2, 4);
  for (let i = 0; i < n; i++) {
    const len = 2.6 + i * 0.9;
    const zz = z + h - 0.6 - i * 1.5;
    if (zz < z + 1) break;
    box(cv, iso, x + 0.15 - len / 2, y + 0.1, zz, len, 0.28, 0.28,
      { top: C.metal.r, left: C.metal.k, right: C.metal.k });
  }
  if (st.bool(0.4)) box(cv, iso, x - 0.1, y - 0.1, z + h, 0.5, 0.5, 0.5, M(C.red));
}

export function railing(cv, iso, C, st, x, y, z, len, ax, h) {
  const c = st.pick([C.metal, C.slate, C.steel]);
  // Pitch out from 2.2 to 3.2 and the posts in the rail's own dark rather than
  // pure black. A parapet rail at this scale was contributing a solid black
  // comb along the top of every roof, and ink is over budget.
  const pitch = st.range(3.0, 4.4);
  const n = Math.floor(len / pitch);
  for (let i = 0; i <= n; i++) {
    const px = ax === 0 ? x + i * pitch : x;
    const py = ax === 0 ? y : y + i * pitch;
    box(cv, iso, px, py, z, 0.45, 0.45, h, { top: c.d, left: C.black, right: c.d });
  }
  if (ax === 0) box(cv, iso, x, y, z + h - 0.35, len, 0.4, 0.35, { top: c.t, left: c.l, right: c.r });
  else box(cv, iso, x, y, z + h - 0.35, 0.4, len, 0.35, { top: c.t, left: c.l, right: c.r });
}

export function crateStack(cv, iso, C, st, x, y, z) {
  let zz = z;
  const n = st.int(1, 3);
  for (let i = 0; i < n; i++) {
    const c = st.pick(C.accents);
    const s = st.range(1.4, 2.4);
    box(cv, iso, x + st.range(0, 0.5), y + st.range(0, 0.5), zz, s, s, 1.2, M(c));
    zz += 1.2;
  }
}

/**
 * A roof sign: a lit frame carrying an invented word.
 *
 * SIGNAGE WAS THE LOUDEST ABSENCE AT 1:1. The reference carries six or more
 * signs at 60px and up in a single view — a pylon, a fascia, a rooftop frame —
 * and this generator carried ZERO hero signs while already owning a working
 * hand-authored 5x7 font and a syllabary to feed it. A sign at glyph scale 2 or
 * 3 is also the largest single-colour field in a city block, which is precisely
 * what "a colour should MEAN something" looks like on the wall rather than on
 * the ground.
 *
 * Every word is invented from the syllabary in font.js and filtered. No real
 * mark, no near-miss of one, ever.
 */
export function roofSign(cv, iso, C, st, x, y, z, word, ax = 0) {
  const k = st.weighted([[1, 5], [2, 4]]);
  const rows = scaleBitmap(textBitmap(word.slice(0, 6), 1), k);
  const tw = rows[0].length, th = rows.length;
  const need = tw / 2 + 2.4;
  const h = (th + (tw >> 1)) / 2 + 2.4;
  const panel = st.weighted([[C.white, 3], [C.cream, 2], [C.tar, 3],
    [st.pick(C.accents), 7]]);
  const ink = st.pick([...C.accents, C.white, C.tar]);
  const inkC = signInk(C, panel, ink);
  const legH = st.range(1.2, 4.0);
  const w = ax === 0 ? need : 0.32, d = ax === 0 ? 0.32 : need;
  for (const t of [0, 1]) {
    const lx = x + (ax === 0 ? t * (need - 0.6) : 0);
    const ly = y + (ax === 0 ? 0 : t * (need - 0.6));
    box(cv, iso, lx, ly, z, 0.6, 0.6, legH + 0.8, MD(C.metal));
  }
  const F = ax === 0 ? leftFace(iso, y + d, x, z + legH) : rightFace(iso, x + w, y, z + legH);
  const face = textPanel(F, rows, {
    w: need, h, pad: 0.85, edge: C.black, fill: panel.t, ink: inkC,
    dir: ax === 0 ? 1 : -1,
    tu: ax === 0 ? 1.5 : need - 1.5, tv: h - 1.4,
  });
  box(cv, iso, x, y, z + legH, w, d, h, {
    top: panel.t,
    left: ax === 0 ? face : panel.l,
    right: ax === 0 ? panel.r : face,
  });
}

export function roofDeck(cv, iso, C, st, x, y, z, w, d, wall) {
  const seed = st.int(1, 9999);
  const F = topFace(iso, z, x, y);
  const g = st.bool(0.35) ? st.pick(C.accents) : st.pick([C.road, C.roadD, C.concrete, C.pave, C.slate]);
  const seam = st.range(13, 24);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    if ((u % seam) < 0.62 || (v % seam) < 0.62) return g.l;
    const k = h3(Math.floor(u / seam), Math.floor(v / seam), seed) & 15;
    return k === 0 ? g.l : k === 1 ? g.d : g.t;
  });
}
