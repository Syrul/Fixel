// Rooftops. In the reference no roof is ever bare: tanks, plant, vents, huts,
// dishes, solar, aerials, crates. A flat roof colour is a hole in the density.

import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { topFace, leftFace, blitFace } from '../faces.js';
import { h3 } from '../palette.js';
import { textBitmap, scaleBitmap } from '../font.js';

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
  drawSlab(cv, iso, x, y, z + 0.6, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    if ((u % 5.5) < 0.62 || (v % 5.5) < 0.62) return C.black;
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

export function aerial(cv, iso, C, st, x, y, z) {
  const h = st.range(5, 13);
  box(cv, iso, x, y, z, 0.3, 0.3, h, MD(C.metal));
  const p0 = iso.proj(x + 0.15, y + 0.15, z + h);
  for (let i = 0; i < 4; i++) {
    const yy = p0[1] + i * 2;
    cv.line(p0[0] - 3 - i, yy, p0[0] + 3 + i, yy, C.ink, x + y + z + h + 2);
  }
  if (st.bool(0.4)) cv.blit(p0[0] - 1, p0[1] - 3, ['##', '##'], { '#': C.red.t }, x + y + z + h + 3);
}

export function railing(cv, iso, C, st, x, y, z, len, ax, h) {
  const c = st.pick([C.metal, C.slate, C.steel]);
  const n = Math.floor(len / 2.2);
  for (let i = 0; i <= n; i++) {
    const px = ax === 0 ? x + i * 2.2 : x;
    const py = ax === 0 ? y : y + i * 2.2;
    box(cv, iso, px, py, z, 0.45, 0.45, h, { top: C.black, left: C.black, right: C.black });
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

/** A roof sign: a lit frame carrying an invented word. */
export function roofSign(cv, iso, C, st, x, y, z, word, len) {
  const k = st.int(1, 2);
  const rows = scaleBitmap(textBitmap(word, 1), k);
  const w = rows[0].length;
  const need = (w + 4) / 2;
  const panel = st.pick([C.white, C.cream, C.tar, ...C.accents]);
  const ink = st.pick(C.accents);
  const inkC = panel === C.tar ? ink.t : (ink === panel ? C.ink : ink.l);
  const h = (rows.length + 5) / 2;
  box(cv, iso, x, y, z, 0.4, 0.4, 2.0, MD(C.metal));
  box(cv, iso, x + need - 0.4, y, z, 0.4, 0.4, 2.0, MD(C.metal));
  box(cv, iso, x, y, z + 2.0, need, 0.25, h, { top: panel.t, left: panel.l, right: panel.r });
  const p = iso.proj(x, y, z + 2.0 + h);
  blitFace(cv, rows, { '#': inkC, '.': -1 }, p[0] + 2, p[1] + 2, 'l', x + y + z + 80);
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
