// Layout: a street grid of unequal blocks, each block cut into parcels.
//
// The grid pitch is deliberately irregular. A regular one is instantly legible
// as generated — the eye finds the period in about a second — and the reference
// has no repeating pitch anywhere in it.

import { groundInv } from './faces.js';
import { h3 } from './palette.js';

const CROSS_D = 9;      // depth of a painted crossing, world units
const SIDEWALK = 6.0;   // pavement width inside each block edge

function axisBands(st, a0, a1) {
  const streets = [], blocks = [];
  let p = a0 - st.int(0, 30);
  while (p < a1 + 40) {
    const sw = st.int(15, 26);
    streets.push([p, p + sw]);
    p += sw;
    const bw = st.int(52, 124);
    blocks.push([p, p + bw]);
    p += bw;
  }
  return { streets, blocks };
}

function axisIndex(bands, A0, n) {
  const off = new Int16Array(n).fill(-1);
  const wd = new Int16Array(n);
  const id = new Int16Array(n).fill(-1);
  const pre = new Int16Array(n).fill(-1);
  for (let s = 0; s < bands.streets.length; s++) {
    const [a, b] = bands.streets[s];
    for (let q = a; q < b; q++) {
      const i = q - A0;
      if (i < 0 || i >= n) continue;
      off[i] = q - a; wd[i] = b - a; id[i] = s;
    }
    for (let k = 1; k <= CROSS_D; k++) {
      for (const q of [a - k, b - 1 + k]) {
        const i = q - A0;
        if (i < 0 || i >= n) continue;
        if (off[i] < 0) pre[i] = k - 1;
      }
    }
  }
  return { off, wd, id, pre };
}

function subdivide(st, x0, y0, x1, y1, out) {
  const w = x1 - x0, d = y1 - y0;
  if (w < 20 || d < 20) { if (w > 9 && d > 9) out.push([x0, y0, x1, y1]); return; }
  if (w <= 52 && d <= 52 && st.bool(0.62)) { out.push([x0, y0, x1, y1]); return; }
  if (w <= 30 && d <= 30) { out.push([x0, y0, x1, y1]); return; }
  if (w >= d) {
    const c = Math.round(x0 + st.range(0.34, 0.66) * w);
    subdivide(st, x0, y0, c, y1, out); subdivide(st, c, y0, x1, y1, out);
  } else {
    const c = Math.round(y0 + st.range(0.34, 0.66) * d);
    subdivide(st, x0, y0, x1, c, out); subdivide(st, x0, c, x1, y1, out);
  }
}

const PARCEL_MIX = [
  ['build', 58], ['park', 7], ['lot', 8], ['plaza', 5],
  ['market', 4], ['yard', 5], ['pool', 3], ['site', 5], ['low', 5],
];

export function planCity(rng, X0, X1, Y0, Y1) {
  const st = rng.stream('layout');
  const stp = rng.stream('parcels');
  const bx = axisBands(st, X0, X1);
  const by = axisBands(st, Y0, Y1);
  const nx = X1 - X0, ny = Y1 - Y0;
  const ix = axisIndex(bx, X0, nx);
  const iy = axisIndex(by, Y0, ny);

  const blocks = [];
  for (const [a, b] of bx.blocks) {
    if (b < X0 - 10 || a > X1 + 10) continue;
    for (const [c, d] of by.blocks) {
      if (d < Y0 - 10 || c > Y1 + 10) continue;
      const parcels = [];
      const px0 = a + SIDEWALK, py0 = c + SIDEWALK;
      const px1 = b - SIDEWALK, py1 = d - SIDEWALK;
      if (px1 - px0 > 6 && py1 - py0 > 6) {
        const raw = [];
        subdivide(stp, px0, py0, px1, py1, raw);
        for (const r of raw) parcels.push({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], type: stp.weighted(PARCEL_MIX) });
      }
      blocks.push({ x0: a, y0: c, x1: b, y1: d, parcels });
    }
  }
  blocks.sort((p, q) => (p.x0 + p.y0) - (q.x0 + q.y0));
  return { X0, Y0, X1, Y1, nx, ny, ix, iy, blocks, bx, by, SIDEWALK };
}

/**
 * The road surface, drawn as ONE slab whose shade callback inverts the
 * projection per pixel. Markings, crossings, bays, patches and grit are all
 * decided here, so the asphalt is never a flat fill anywhere.
 */
export function roadShade(iso, C, plan, seedN, tones) {
  const G = groundInv(iso, 0);
  const { X0, Y0, nx, ny, ix, iy } = plan;
  // Each street carries its own asphalt tone. One global grey for every road in
  // the frame is what pushes a single colour to a fifth of the canvas; eight
  // near-identical greys read the same and spread the histogram.
  const TN = tones.road, TD = tones.roadD;
  const white = C.white.t, whiteD = C.concrete.t, yellow = C.amber.t;
  const RAIN = [C.red.t, C.orange.t, C.yellow.t, C.lime.t, C.cyan.t, C.indigo.t, C.magenta.t];
  return (sx, sy) => {
    const wx = Math.floor(G.ax * sx + G.bx * sy + G.cx);
    const wy = Math.floor(G.ay * sx + G.by * sy + G.cy);
    let i = wx - X0; if (i < 0) i = 0; else if (i >= nx) i = nx - 1;
    let j = wy - Y0; if (j < 0) j = 0; else if (j >= ny) j = ny - 1;
    const ax = ix.off[i], ay = iy.off[j];

    if (ax < 0 && ay < 0) return C.concrete.r;   // hidden under a block

    // Base asphalt. Value variation comes in LARGE flat patches — a resurfaced
    // strip, a paler worn lane — never as per-pixel grit. Speckle would buy
    // change-rate and lose the flat interiors the reference actually has.
    const si = (ax >= 0 ? ix.id[i] : 0) + (ay >= 0 ? iy.id[j] * 7 : 0);
    const A = TN[(si >>> 0) % TN.length], T = TD[(si >>> 0) % TD.length];
    const patch = h3(wx >> 3, wy >> 3, seedN + 7) & 15;
    const base = patch < 2 ? T.t : patch < 4 ? A.l : A.t;

    const inter = ax >= 0 && ay >= 0;

    if (ax >= 0 && ay < 0 && iy.pre[j] >= 0) {
      const cid = h3(ix.id[i], iy.id[j] + 1, seedN + 3);
      const bar = Math.floor((wy - Y0) / 3) % 2;
      if (bar === 0 && ax > 2 && ax < ix.wd[i] - 3) {
        return (cid & 7) === 0 ? RAIN[Math.floor((wy - Y0) / 3) % 7] : white;
      }
      return base;
    }
    if (ay >= 0 && ax < 0 && ix.pre[i] >= 0) {
      const cid = h3(iy.id[j], ix.id[i] + 1, seedN + 3);
      const bar = Math.floor((wx - X0) / 3) % 2;
      if (bar === 0 && ay > 2 && ay < iy.wd[j] - 3) {
        return (cid & 7) === 0 ? RAIN[Math.floor((wx - X0) / 3) % 7] : white;
      }
      return base;
    }

    if (inter) {
      if (ax === 2 || ax === ix.wd[i] - 3 || ay === 2 || ay === iy.wd[j] - 3) return whiteD;
      return base;
    }

    if (ax >= 0) {
      const w = ix.wd[i], mid = w >> 1;
      if (ax === 0) return T.r;
      if (ax === 2 || ax === w - 3) return whiteD;
      if (ax === mid && (((wy - Y0) % 12) < 7)) return yellow;
      if (ax === mid - 1 && w > 17 && (((wy - Y0) % 12) < 7)) return yellow;
      return base;
    }
    const w = iy.wd[j], mid = w >> 1;
    if (ay === 0) return T.r;
    if (ay === 2 || ay === w - 3) return whiteD;
    if (ay === mid && (((wx - X0) % 12) < 7)) return yellow;
    if (ay === mid - 1 && w > 17 && (((wx - X0) % 12) < 7)) return yellow;
    return base;
  };
}

/**
 * Pavement top of a block: large flat slabs with seams, plus occasional pale
 * organic stains. No per-pixel speckle — the interiors have to stay flat.
 */
export function pavementShade(iso, C, x0, y0, w, d, z, seedN, P, K) {
  const T = groundInv(iso, z);
  P = P || C.pave; K = K || C.concrete;
  return (sx, sy) => {
    const u = T.ax * sx + T.bx * sy + T.cx - x0;
    const v = T.ay * sx + T.by * sy + T.cy - y0;
    if (u < 2.0 || v < 2.0 || u > w - 2.0 || v > d - 2.0) return P.t;
    if ((u % 8) < 0.62 || (v % 8) < 0.62) return P.l;
    const cu = Math.floor(u / 8), cvv = Math.floor(v / 8);
    const k = h3(cu, cvv, seedN) & 31;
    if (k === 0) return K.t;
    if (k === 1) return P.l;
    // Large pale stains with hand-drawn contours. The boundary is a quadratic
    // form in (u, v), so it walks off the 2:1 lattice at every angle, and the
    // interior is a big flat region in a tone nothing else uses.
    const cw = 22;
    const gu2 = Math.floor(u / cw), gv2 = Math.floor(v / cw);
    const g = h3(gu2, gv2, seedN + 5);
    if ((g & 3) === 0) {
      const su = u - gu2 * cw - 5 - (g >>> 8 & 15);
      const svv = v - gv2 * cw - 5 - (g >>> 12 & 15);
      const a1 = 0.6 + (g >>> 17 & 7) * 0.13;
      const a2 = 0.7 + (g >>> 21 & 7) * 0.11;
      const rr = su * su * a1 + svv * svv * a2 + su * svv * 0.55;
      const R = 26 + (g >>> 25 & 31);
      if (rr < R) return K.t;
      if (rr < R + 7) return K.l;
    }
    return P.t;
  };
}
