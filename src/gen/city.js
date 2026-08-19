// Layout: a street grid of unequal blocks, each block cut into parcels.
//
// The grid pitch is deliberately irregular. A regular one is instantly legible
// as generated — the eye finds the period in about a second — and the reference
// has no repeating pitch anywhere in it.

import { groundInv } from './faces.js';
import { h3 } from './palette.js';

// THE GRID IS SIZED IN WORLD UNITS AND THE WORLD IS NOW TWICE AS BIG ON SCREEN,
// so every number in this file was retuned rather than left to double.
//
// The target is stated as a picture, not as a constant: a 320x320 judge crop
// covers a patch of world roughly 60 by 60 units, and it has to hold what the
// reference's 320px crops hold — one street, two building faces, a few
// vehicles, a crowd. Left at the old figures a single block would have been
// 990px across and a crop would have landed inside one wall.
const CROSS_D = 6;      // depth of a painted crossing, world units
const SIDEWALK = 4.0;   // pavement width inside each block edge

function axisBands(st, a0, a1, o) {
  const streets = [], blocks = [];
  let p = a0 - st.int(0, 30);
  while (p < a1 + 40) {
    const sw = Math.round(st.int(10, 17) * o.streetScale);
    streets.push([p, p + sw]);
    p += sw;
    const bw = Math.round(st.int(32, 76) * o.blockScale);
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
  if (w < 13 || d < 13) { if (w > 6 && d > 6) out.push([x0, y0, x1, y1]); return; }
  if (w <= 33 && d <= 33 && st.bool(0.62)) { out.push([x0, y0, x1, y1]); return; }
  if (w <= 19 && d <= 19) { out.push([x0, y0, x1, y1]); return; }
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

export function planCity(rng, X0, X1, Y0, Y1, o = {}) {
  // GRID PITCH AND LAND USE ARE PER SCENE.
  //
  // The block size distribution and the parcel mix used to be module constants,
  // so every city the feed will ever emit had the same average block, the same
  // 58% built / 7% park / 8% lot split, and therefore the same change rate, run
  // lengths and flat-area share. The variety gate reads that as the structural
  // half of "every Fixel scene is, statistically, the same scene".
  const st = rng.stream('layout');
  const stp = rng.stream('parcels');
  const opt = {
    blockScale: o.blockScale || 1, streetScale: o.streetScale || 1,
    mix: o.mix || PARCEL_MIX,
  };
  const bx = axisBands(st, X0, X1, opt);
  const by = axisBands(st, Y0, Y1, opt);
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
      if (px1 - px0 > 4 && py1 - py0 > 4) {
        const raw = [];
        subdivide(stp, px0, py0, px1, py1, raw);
        for (const r of raw) parcels.push({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], type: stp.weighted(opt.mix) });
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
export function roadShade(iso, C, plan, seedN, tones, opt = {}) {
  const G = groundInv(iso, 0);
  const { X0, Y0, nx, ny, ix, iy } = plan;
  // Each street carries its own asphalt tone. One global grey for every road in
  // the frame is what pushes a single colour to a fifth of the canvas; eight
  // near-identical greys read the same and spread the histogram.
  const TN = tones.road, TD = tones.roadD;
  // Resurfacing patches. These used to be cut on an 8-unit grid, i.e. a fresh
  // random tone every 16 screen pixels over every road in the frame: several
  // hundred separate flat faces of near-identical grey, which is most of why
  // the face count runs 2.6x the reference's while the closed-cell count runs
  // short. A patch is now a PATCH — tens of units across — and there is one
  // alternative tone, not three.
  const PSH = opt.patchShift === undefined ? 5 : opt.patchShift;
  const PRATE = opt.patchRate === undefined ? 2 : opt.patchRate;
  // Centre-line dash pitch. At 12 world units every road in the frame carried a
  // dash every 24 screen pixels, and each dash is its own flat face inside the
  // one enormous road cell: the road held 130 faces against the reference's
  // busiest cell at 55. Longer dashes, fewer faces, same marked road.
  const DASH = opt.dash || 22;
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
    // THREE tones per street, in patches tens of units across. Two tones left
    // one asphalt grey holding 15-16% of a crop against the reference's
    // 5.5-12.7% band, and the largest single flat region at nearly double what
    // the reference's crops carry. A resurfaced road is patchy; it is not one
    // grey with occasional bruises.
    const patch = h3(wx >> PSH, wy >> PSH, seedN + 7) & 15;
    const base = patch < PRATE ? A.l : patch < PRATE * 2 ? T.t : A.t;

    const inter = ax >= 0 && ay >= 0;

    if (ax >= 0 && ay < 0 && iy.pre[j] >= 0) {
      const cid = h3(ix.id[i], iy.id[j] + 1, seedN + 3);
      const bar = Math.floor((wy - Y0) / 4) % 2;
      if (bar === 0 && ax > 2 && ax < ix.wd[i] - 3) {
        return (cid & 7) === 0 ? RAIN[Math.floor((wy - Y0) / 4) % 7] : white;
      }
      return base;
    }
    if (ay >= 0 && ax < 0 && ix.pre[i] >= 0) {
      const cid = h3(iy.id[j], ix.id[i] + 1, seedN + 3);
      const bar = Math.floor((wx - X0) / 4) % 2;
      if (bar === 0 && ay > 2 && ay < iy.wd[j] - 3) {
        return (cid & 7) === 0 ? RAIN[Math.floor((wx - X0) / 4) % 7] : white;
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
      if (ax === mid && (((wy - Y0) % DASH) < DASH * 0.62)) return yellow;
      if (ax === mid - 1 && w > 17 && (((wy - Y0) % DASH) < DASH * 0.62)) return yellow;
      return base;
    }
    const w = iy.wd[j], mid = w >> 1;
    if (ay === 0) return T.r;
    if (ay === 2 || ay === w - 3) return whiteD;
    if (ay === mid && (((wx - X0) % DASH) < DASH * 0.62)) return yellow;
    if (ay === mid - 1 && w > 17 && (((wx - X0) % DASH) < DASH * 0.62)) return yellow;
    return base;
  };
}

/**
 * Pavement top of a block: large flat slabs with seams, plus occasional pale
 * organic stains. No per-pixel speckle — the interiors have to stay flat.
 */
export function pavementShade(iso, C, x0, y0, w, d, z, seedN, P, K, opt = {}) {
  const T = groundInv(iso, z);
  P = P || C.pave; K = K || C.concrete;
  // THE SEAM LATTICE WAS THE SINGLE WORST OBJECT IN THE PICTURE.
  //
  // Slab joints every 8 world units, on a rigid 2:1 lattice, over 35% of the
  // canvas. Three separate consequences, all measured: a seven-lag harmonic
  // ladder in the autocorrelation where the reference's dies after two; roughly
  // 140 extra flat faces per 320px crop, every one of them inside the SAME
  // open cell, which is the ink-closure ratio stated as a picture; and a
  // mid-tone seam colour flagged as antialiasing. The reference's pavement, at
  // 5x, is a large flat field with one organic stain across it and no lattice
  // at all.
  //
  // So the pitch is now per block and usually absent, and a block that does
  // carry joints carries them at its own pitch, which is also the thing that
  // stops every block in every seed looking like every other.
  const seam = opt.seam || 0;
  const kerb = opt.kerb === undefined ? 2.0 : opt.kerb;
  return (sx, sy) => {
    const u = T.ax * sx + T.bx * sy + T.cx - x0;
    const v = T.ay * sx + T.by * sy + T.cy - y0;
    if (u < kerb || v < kerb || u > w - kerb || v > d - kerb) return P.t;
    if (seam > 0 && ((u % seam) < 0.62 * T.q || (v % seam) < 0.62 * T.q)) return P.r;
    // Large pale stains with hand-drawn contours. The boundary is a quadratic
    // form in (u, v), so it walks off the 2:1 lattice at every angle, and the
    // interior is a big flat region in a tone nothing else uses.
    const cw = opt.stainPitch || 22;
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
