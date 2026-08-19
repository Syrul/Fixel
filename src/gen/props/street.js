// Street furniture. Empty asphalt and empty pavement is the number one way this
// generator fails, so this file is deliberately long: lamps, lights, hydrants,
// bins, benches, planters, bollards, cones, meters, kiosks, shelters, stalls,
// parasols, scaffolds, containers, fences, cables.

import { drawSlab } from '../../core/iso.js';
import { box, gable } from '../draw.js';
import { leftFace, rightFace, topFace, blitFace } from '../faces.js';
import { h3 } from '../palette.js';
import { textBitmap } from '../font.js';

const M = (f) => ({ top: f.t, left: f.l, right: f.r });
const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

export function lampPost(cv, iso, C, st, x, y, z, dir) {
  const h = st.range(6.5, 9);
  box(cv, iso, x, y, z, 0.8, 0.8, h, MD(C.slate));
  const ax = dir === 0 ? 1 : 0;
  const ex = x + (ax ? 0 : 1.6) * 0 + (dir === 0 ? 1.4 : 0);
  const ey = y + (dir === 1 ? 1.4 : 0);
  box(cv, iso, Math.min(x, ex), Math.min(y, ey), z + h - 0.4,
    dir === 0 ? 1.9 : 0.5, dir === 1 ? 1.9 : 0.5, 0.4, MD(C.slate));
  box(cv, iso, ex + (dir === 0 ? 1.1 : 0), ey + (dir === 1 ? 1.1 : 0), z + h - 0.85,
    0.8, 0.8, 0.5, { top: C.cream.t, left: C.amber.t, right: C.amber.l });
  if (st.bool(0.35)) {
    const b = st.pick(C.accents);
    box(cv, iso, x + 0.5, y + 0.05, z + h - 3.6, 0.15, 0.4, 2.4, { top: b.t, left: b.l, right: b.r });
  }
}

export function trafficLight(cv, iso, C, st, x, y, z) {
  const h = st.range(6, 7.5);
  box(cv, iso, x, y, z, 0.8, 0.8, h, MD(C.slate));
  box(cv, iso, x - 0.35, y - 0.35, z + h - 3.2, 1.5, 1.5, 3.2, MD(C.tar));
  const on = st.int(0, 2);
  const cols = [C.red, C.amber, C.green];
  for (let i = 0; i < 3; i++) {
    const c = cols[i];
    const lit = i === on;
    box(cv, iso, x - 0.3, y + 0.05, z + h - 0.85 - i * 0.75, 0.18, 0.55, 0.5,
      { top: lit ? c.t : c.d, left: lit ? c.t : c.d, right: lit ? c.l : c.d });
  }
}

export function hydrant(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.red, C.yellow, C.cyan]);
  box(cv, iso, x, y, z, 1.4, 1.4, 1.8, M(c));
  box(cv, iso, x + 0.25, y + 0.25, z + 1.8, 0.9, 0.9, 0.6, M(c));
  box(cv, iso, x - 0.4, y + 0.4, z + 0.9, 0.5, 0.6, 0.6, MD(c));
}

export function bin(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.green, C.slate, C.blue, C.steel, C.orange]);
  box(cv, iso, x, y, z, 1.8, 1.8, 2.4, { top: c.d, left: c.l, right: c.r });
  box(cv, iso, x - 0.2, y - 0.2, z + 2.4, 2.2, 2.2, 0.4, M(c));
}

export function bench(cv, iso, C, st, x, y, z, dir) {
  const w = st.pick([C.wood, C.terra, C.grass]);
  const L = 4.4;
  if (dir === 0) {
    box(cv, iso, x, y, z, L, 1.5, 0.9, M(w));
    box(cv, iso, x, y + 1.2, z + 0.9, L, 0.35, 1.2, M(w));
  } else {
    box(cv, iso, x, y, z, 1.5, L, 0.9, M(w));
    box(cv, iso, x + 1.2, y, z + 0.9, 0.35, L, 1.2, M(w));
  }
}

export function bollard(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.metal, C.yellow, C.red, C.slate]);
  box(cv, iso, x, y, z, 0.8, 0.8, 2.1, M(c));
  box(cv, iso, x - 0.1, y - 0.1, z + 2.1, 1.0, 1.0, 0.35, { top: C.white.t, left: c.r, right: c.d });
}

export function cone(cv, iso, C, st, x, y, z) {
  box(cv, iso, x, y, z, 1.6, 1.6, 0.35, M(C.orange));
  box(cv, iso, x + 0.3, y + 0.3, z + 0.35, 1.0, 1.0, 0.7, M(C.orange));
  box(cv, iso, x + 0.4, y + 0.4, z + 1.05, 0.8, 0.8, 0.45, M(C.white));
  box(cv, iso, x + 0.45, y + 0.45, z + 1.5, 0.7, 0.7, 0.5, M(C.orange));
}

export function planter(cv, iso, C, st, x, y, z, s) {
  const c = st.pick([C.concrete, C.terra, C.wood, C.pave]);
  box(cv, iso, x, y, z, s, s, 1.1, M(c));
  const g = st.pick([C.leaf, C.grass, C.grass]);
  drawSlab(cv, iso, x + 0.2, y + 0.2, z + 1.1, s - 0.4, s - 0.4, g.l);
  const F = topFace(iso, z + 1.1, x, y);
  const seed = st.int(1, 9999);
  drawSlab(cv, iso, x + 0.2, y + 0.2, z + 1.12, s - 0.4, s - 0.4, (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
    const k = h3(Math.floor(u), Math.floor(v), seed) & 7;
    return k < 5 ? g.l : g.t;
  });
}

export function meter(cv, iso, C, st, x, y, z) {
  box(cv, iso, x, y, z, 0.7, 0.7, 2.4, MD(C.metal));
  box(cv, iso, x - 0.35, y - 0.35, z + 2.4, 1.4, 1.4, 1.4,
    { top: C.metal.t, left: C.tar.l, right: C.metal.r });
}

export function postbox(cv, iso, C, st, x, y, z) {
  const c = st.pick([C.red, C.blue, C.green]);
  box(cv, iso, x, y, z, 1.4, 1.4, 2.6, M(c));
  box(cv, iso, x - 0.1, y - 0.1, z + 2.6, 1.6, 1.6, 0.3, MD(c));
  box(cv, iso, x + 0.3, y + 1.4, z + 1.9, 0.8, 0.06, 0.3, { top: C.ink, left: C.ink, right: C.ink });
}

export function signPost(cv, iso, C, st, x, y, z, word) {
  const h = st.range(3.4, 5.2);
  box(cv, iso, x, y, z, 0.7, 0.7, h, MD(C.metal));
  const c = st.pick([C.green, C.blue, C.white, C.amber]);
  const rows = textBitmap(word, 1);
  const w = rows[0].length;
  const pw = (w + 3) / 2;
  box(cv, iso, x - pw + 0.2, y, z + h, pw, 0.12, (rows.length + 3) / 2,
    { top: c.t, left: c.l, right: c.r });
  const p = iso.proj(x - pw + 0.2, y, z + h + (rows.length + 3) / 2);
  blitFace(cv, rows, { '#': c === C.white ? C.ink : C.white.t, '.': -1 },
    p[0] + 1, p[1] + 2, 'l', x + y + z + 40);
}

export function kiosk(cv, iso, C, st, x, y, z, w, d, word) {
  const c = st.pick(C.accents);
  const h = st.range(4.5, 6);
  box(cv, iso, x, y, z, w, d, h, { top: c.d, left: c.l, right: c.r });
  box(cv, iso, x - 0.4, y - 0.4, z + h, w + 0.8, d + 0.8, 0.5, M(C.cream));
  const gl = st.pick([C.glass, C.aqua]);
  box(cv, iso, x + 0.4, y + d, z + 1.6, w - 0.8, 0.08, h - 2.6, M(gl));
  box(cv, iso, x + w, y + 0.4, z + 1.6, 0.08, d - 0.8, h - 2.6, M(gl));
  if (word) {
    const rows = textBitmap(word.slice(0, 5), 1);
    const p = iso.proj(x + 0.4, y + d + 0.09, z + h - 0.2);
    blitFace(cv, rows, { '#': C.white.t, '.': -1 }, p[0] + 1, p[1] - 1, 'l', x + y + z + 60);
  }
}

export function busShelter(cv, iso, C, st, x, y, z, dir) {
  const L = 7, W = 2.4;
  const sx = dir === 0 ? L : W, sy = dir === 0 ? W : L;
  const gl = C.aqua;
  box(cv, iso, x, y, z, 0.35, 0.35, 3.2, MD(C.metal));
  box(cv, iso, x + sx - 0.35, y + sy - 0.35, z, 0.35, 0.35, 3.2, MD(C.metal));
  if (dir === 0) box(cv, iso, x, y + sy - 0.12, z + 0.4, sx, 0.12, 2.6, M(gl));
  else box(cv, iso, x + sx - 0.12, y, z + 0.4, 0.12, sy, 2.6, M(gl));
  gable(cv, iso, x - 0.3, y - 0.3, z + 3.2, sx + 0.6, sy + 0.6, (dir === 0 ? sy : sx) * 0.26,
    dir === 0, { top: C.red.t, left: C.red.l, right: C.red.r });
  bench(cv, iso, C, st, x + 0.6, y + 0.5, z, dir);
}

export function marketStall(cv, iso, C, st, x, y, z, w, d) {
  const a = st.pick(C.accents), b = st.pick(C.accents);
  box(cv, iso, x, y, z, w, d, 1.6, MD(C.wood));
  // goods
  for (let i = 0; i < 10; i++) {
    const g = st.pick(C.accents);
    box(cv, iso, x + st.range(0.2, w - 1), y + st.range(0.2, d - 1), z + 1.6,
      0.7, 0.7, st.range(0.4, 0.9), M(g));
  }
  for (const [cx, cy] of [[x, y], [x + w - 0.3, y], [x, y + d - 0.3], [x + w - 0.3, y + d - 0.3]])
    box(cv, iso, cx, cy, z, 0.3, 0.3, 4.2, MD(C.metal));
  // a tent, not a flat lid: the canvas pitches, and its eaves come off the
  // 2:1 lattice
  const ridgeX = w >= d;
  const span = ridgeX ? d + 1.2 : w + 1.2;
  const stripe = (base, alt) => (sxp, syp) => (Math.floor((sxp - syp) / 7) & 1) ? base : alt;
  gable(cv, iso, x - 0.6, y - 0.6, z + 4.2, w + 1.2, d + 1.2, span * 0.25, ridgeX, {
    top: stripe(a.t, C.white.t), left: stripe(a.l, C.concrete.t), right: stripe(a.r, C.concrete.l),
  });
  box(cv, iso, x - 0.6, y + d + 0.5, z + 3.9, w + 1.2, 0.1, 0.35, M(a));
}

export function parasol(cv, iso, C, st, x, y, z) {
  const a = st.pick(C.accents);
  box(cv, iso, x, y, z, 0.3, 0.3, 4.0, MD(C.wood));
  const r = 3.2;
  const F = topFace(iso, z + 4.0, x - r, y - r);
  drawSlab(cv, iso, x - r, y - r, z + 4.0, r * 2, r * 2, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu - r, v = F.av * sxp + F.bv * syp + F.cv - r;
    if (u * u + v * v > r * r) return -1;
    const q = (u > 0 ? 1 : 0) + (v > 0 ? 2 : 0);
    return (q & 1) ? a.t : C.white.t;
  });
}

export function scaffold(cv, iso, C, st, x, y, z, w, d, h) {
  const m = C.metal;
  for (let i = 0; i <= 1; i++) for (let j = 0; j <= 1; j++)
    box(cv, iso, x + i * (w - 0.35), y + j * (d - 0.35), z, 0.35, 0.35, h, MD(m));
  for (let lv = 2.6; lv < h; lv += 2.6) {
    box(cv, iso, x, y, z + lv, w, 0.3, 0.25, M(m));
    box(cv, iso, x, y + d - 0.3, z + lv, w, 0.3, 0.25, M(m));
    box(cv, iso, x, y, z + lv, 0.3, d, 0.25, M(m));
    if (st.bool(0.5)) {
      const c = st.pick(C.accents);
      box(cv, iso, x, y + d - 0.15, z + lv + 0.25, w, 0.1, 1.4, M(c));
    }
    // cross-braces: drawn straight in screen space at 45 degrees, which no
    // axis-aligned box in this projection can produce
    {
      const p0 = iso.proj(x, y + d, z + lv);
      const p1 = iso.proj(x + w, y + d, z + lv + 2.6);
      const dep = x + w + y + d + z + lv + 3;
      const n = Math.max(1, Math.round(Math.abs(p1[0] - p0[0]) / 14));
      for (let q = 0; q < n; q++) {
        const ax0 = Math.round(p0[0] + (p1[0] - p0[0]) * q / n);
        const ax1 = Math.round(p0[0] + (p1[0] - p0[0]) * (q + 1) / n);
        const ay0 = Math.round(p0[1] + (p1[1] - p0[1]) * q / n);
        const span = Math.abs(ax1 - ax0);
        cv.line(ax0, ay0, ax1, ay0 - span, C.black, dep);
        cv.line(ax0, ay0 - span, ax1, ay0, C.black, dep);
      }
    }
  }
}

export function container(cv, iso, C, st, x, y, z, ax) {
  const c = st.pick(C.accents);
  const L = 8, W = 3.4, H = 3.2;
  const w = ax ? W : L, d = ax ? L : W;
  const FL = leftFace(iso, y + d, x, z), FR = rightFace(iso, x + w, y, z);
  const rib = (F, base, dk) => (sxp, syp) => {
    const u = F.au * sxp + F.cu;
    return ((u % 6) < 1.0) ? dk : base;
  };
  box(cv, iso, x, y, z, w, d, H, {
    top: c.d, left: rib(FL, c.l, c.r), right: rib(FR, c.r, c.d),
  });
}

export function fenceRun(cv, iso, C, st, x, y, z, len, ax, h) {
  const c = st.pick([C.metal, C.slate, C.wood, C.leaf]);
  for (let i = 0; i < len; i += 2.6) {
    if (ax === 0) box(cv, iso, x + i, y, z, 0.6, 0.6, h, { top: c.t, left: C.black, right: c.r });
    else box(cv, iso, x, y + i, z, 0.6, 0.6, h, { top: c.t, left: C.black, right: c.r });
  }
  if (ax === 0) box(cv, iso, x, y, z + h - 0.25, len, 0.25, 0.25, M(c));
  else box(cv, iso, x, y, z + h - 0.25, 0.25, len, 0.25, M(c));
}

export function awning(cv, iso, C, st, x, y, z, len, ax, colA) {
  const a = colA || st.pick(C.accents);
  const dep = 2.0;
  const w = ax === 0 ? len : dep, d = ax === 0 ? dep : len;
  const F = topFace(iso, z, x, y);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = ax === 0 ? (F.au * sxp + F.bu * syp + F.cu) : (F.av * sxp + F.bv * syp + F.cv);
    return (Math.floor(u / 5) & 1) ? a.t : C.white.t;
  });
  const hem = (sxp, syp) => (((sxp + syp) >> 1) & 3) === 0 ? C.black : a.r;
  if (ax === 0) box(cv, iso, x, y + d - 0.2, z - 0.9, w, 0.2, 0.9, { top: a.r, left: hem, right: a.d });
  else box(cv, iso, x + w - 0.2, y, z - 0.9, 0.2, d, 0.9, { top: a.r, left: a.d, right: hem });
}

/**
 * A site hoarding. The stripes are cut in SCREEN space on (sx+sy), which makes
 * them 45 degrees — off the 2:1 lattice on purpose. The reference is 71.9% at
 * 2:1 but a deliberate 14.5% at 1:1, and a generator that puts every edge on
 * the lattice reads mechanical however dense it is.
 */
export function hoarding(cv, iso, C, st, x, y, z, len, ax, h) {
  const a = st.pick(C.accents);
  const b = st.bool(0.5) ? C.white : C.black;
  const pitch = st.int(4, 7);
  const face = (dark) => (sxp, syp) => (Math.floor((sxp + syp) / pitch) & 1)
    ? (dark ? a.r : a.l) : (b === C.black ? C.black : (dark ? C.concrete.l : C.white.t));
  const w = ax === 0 ? len : 0.7, d = ax === 0 ? 0.7 : len;
  box(cv, iso, x, y, z, w, d, h, { top: C.concrete.l, left: face(false), right: face(true) });
}

export function barrier(cv, iso, C, st, x, y, z, ax) {
  const len = 5.5;
  const w = ax === 0 ? len : 1.0, d = ax === 0 ? 1.0 : len;
  const pitch = 5;
  const face = (sxp, syp) => (Math.floor((sxp + syp) / pitch) & 1) ? C.red.l : C.white.t;
  box(cv, iso, x, y, z, w, d, 2.2, { top: C.white.t, left: face, right: face });
}

export function cableRun(cv, iso, C, st, x0, y0, z0, x1, y1, z1) {
  const a = iso.proj(x0, y0, z0), b = iso.proj(x1, y1, z1);
  const d = Math.max(x0 + y0 + z0, x1 + y1 + z1) + 1.2;
  const sag = 3;
  let px = a[0], py = a[1];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    const nx = Math.round(a[0] + (b[0] - a[0]) * t);
    const ny = Math.round(a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * sag);
    cv.line(px, py, nx, ny, C.ink, d);
    px = nx; py = ny;
  }
}

/** Small stack of crates/pallets — used to fill yards and leftover slivers. */
export function crateStackShim(cv, iso, C, st, x, y, z) {
  let zz = z;
  const n = st.int(1, 3);
  for (let i = 0; i < n; i++) {
    const c = st.pick(C.accents);
    const s = st.range(1.2, 2.2);
    box(cv, iso, x + st.range(0, 0.4), y + st.range(0, 0.4), zz, s, s, 1.1, M(c));
    zz += 1.1;
  }
}
