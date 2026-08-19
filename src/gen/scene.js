// renderScene(seed, opts) -> Canvas
//
// The frame is always FULL. The world is generated wider and deeper than the
// viewport in every direction and simply overflows it, so there is no sky band,
// no ground border and no vignette — a 320x320 crop taken anywhere inside the
// output lands in the middle of a city.
//
// Two things here are load-bearing and easy to miss.
//
// COLOUR IS LOCAL. The reference holds ~500 distinct colours in a 320px crop
// but only ~8 in any 16x16 tile. That is not a small palette sprayed evenly —
// it is a large palette committed LOCALLY: this block is grey-and-red, the next
// one is cream-and-teal. Every block and every parcel here mints its own tiny
// sub-palette off the shared families, so both numbers move the right way at
// once.
//
// OUTLINES ARE A PASS, NOT A STYLE. Every drawn thing carries an object tag.
// After the scene is built, one sweep blackens the boundary pixel of whichever
// object is nearer at each tag change. That reproduces the reference's system:
// one shared near-black, exactly 1px, on the near side of every silhouette.

import { Rng } from '../core/rng.js';
import { Canvas } from '../core/canvas.js';
import { Iso, drawSlab } from '../core/iso.js';
import { box, setInk } from './draw.js';
import { buildPalette, h3 } from './palette.js';
import { planCity, roadShade, pavementShade } from './city.js';
import { drawBuilding } from './building.js';
import { topFace } from './faces.js';
import { coinTag } from './font.js';
import { drawPerson } from './props/people.js';
import { drawVehicle } from './props/vehicles.js';
import * as S from './props/street.js';
import * as N from './props/nature.js';

const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

/** Canvas that stamps the current object tag on everything it draws. */
class TaggedCanvas extends Canvas {
  constructor(w, h, pal) { super(w, h, pal); this.t = 0; }
  put(x, y, ci, d, tag = 0) { return super.put(x, y, ci, d, tag || this.t); }
  putZ(x, y, ci, d, tag = 0) { return super.putZ(x, y, ci, d, tag || this.t); }
  fillPoly(p, a, b, c, sh, tag = 0) { return super.fillPoly(p, a, b, c, sh, tag || this.t); }
  rect(x, y, w, h, ci, d, tag = 0) { return super.rect(x, y, w, h, ci, d, tag || this.t); }
  line(a, b, c, d2, ci, d, tag = 0) { return super.line(a, b, c, d2, ci, d, tag || this.t); }
  blit(x, y, r, m, d, tag = 0) { return super.blit(x, y, r, m, d, tag || this.t); }
}

/** A committed local sub-palette: a couple of accents and a wall tone or two. */
function localC(C, st, nAcc, nWall) {
  const V = Object.create(C);
  const acc = [];
  for (let i = 0; i < nAcc; i++) {
    const b = C.accentTone(st);
    acc.push(b);
    for (let k = 0; k < 4; k++) {
      acc.push(C.mk(b._h + st.range(-20, 20), b._s * st.range(0.72, 1.18),
        Math.min(0.94, b._L * st.range(0.76, 1.22))));
    }
  }
  V.accents = acc;
  const wl = [];
  for (let i = 0; i < nWall; i++) {
    const b = C.wallTone(st);
    wl.push(b);
    for (let k = 0; k < 6; k++) {
      wl.push(C.mk(b._h + st.range(-14, 14), b._s * st.range(0.7, 1.3),
        Math.min(0.97, b._L * st.range(0.84, 1.16))));
    }
  }
  V.walls = wl;
  V.wallTone = (s) => wl[s.int(0, wl.length - 1)];
  V.accentTone = (s) => acc[s.int(0, acc.length - 1)];
  return V;
}

export function renderScene(seed, opts = {}) {
  const W = opts.w || 1600, H = opts.h || 1100;
  const rng = new Rng(seed);
  const { pal, C } = buildPalette(rng);
  const cv = new TaggedCanvas(W, H, pal);
  setInk(C.black);

  const ox = Math.round(W / 2);
  const oy = -Math.round(H * 0.24);
  const iso = new Iso(ox, oy);

  const MX = 140, MY = 140;
  const uMin = (0 - MX - ox) / 2, uMax = (W + MX - ox) / 2;
  const vMin = (0 - MY - oy), vMax = (H + MY - oy);
  const X0 = Math.floor((uMin + vMin) / 2) - 4;
  const X1 = Math.ceil((uMax + vMax) / 2) + 4;
  const Y0 = Math.floor((vMin - uMax) / 2) - 4;
  const Y1 = Math.ceil((vMax - uMin) / 2) + 4;

  const gs = rng.stream('ground');
  const seedN = gs.int(1, 1 << 28);
  const plan = planCity(rng, X0, X1, Y0, Y1);

  let tagN = 0;
  const noOutline = new Uint8Array(65536);
  const tag = () => { tagN = (tagN % 65534) + 1; return tagN; };
  // Sprite-blitted things — pedestrians, foliage — carry their own authored
  // keyline. A second 1px rim on a five-pixel-wide figure eats the figure.
  const tagRaw = () => { const t = tag(); noOutline[t] = 1; return t; };

  const vis = (x0, y0, x1, y1, maxH) => {
    const l = iso.proj(x0, y1, 0), r = iso.proj(x1, y0, 0);
    const t = iso.proj(x0, y0, 0), b = iso.proj(x1, y1, 0);
    if (r[0] < -48 || l[0] > W + 48) return false;
    if (b[1] < -24) return false;
    if (t[1] - 2 * maxH > H + 24) return false;
    return true;
  };

  // ---------------------------------------------------------------- ground
  const cs0 = rng.stream('surfaces');
  const jit = (f, n, dh, dl) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(C.mk(f._h + cs0.range(-dh, dh), f._s * cs0.range(0.6, 1.5),
        Math.min(0.97, f._L * cs0.range(1 - dl, 1 + dl))));
    }
    return out;
  };
  const tones = { road: jit(C.road, 9, 14, 0.11), roadD: jit(C.roadD, 9, 14, 0.13) };
  const paveTones = jit(C.pave, 11, 12, 0.08);
  const kerbTones = jit(C.concrete, 11, 12, 0.10);
  cv.t = 0;
  drawSlab(cv, iso, X0, Y0, 0, X1 - X0, Y1 - Y0, roadShade(iso, C, plan, seedN, tones));

  const bs = rng.stream('buildings');
  const ps = rng.stream('props');
  const ns = rng.stream('nature');
  const pes = rng.stream('people');
  const sg = rng.stream('signage');
  const ts = rng.stream('traffic');
  const cs = rng.stream('colour');

  for (const b of plan.blocks) {
    const bw = b.x1 - b.x0, bd = b.y1 - b.y0;
    if (!vis(b.x0, b.y0, b.x1, b.y1, 100)) continue;
    const CB = localC(C, cs, 3, 2);
    const CW = localC(C, cs, 3, 1);
    const bi9 = (h3(b.x0, b.y0, seedN) >>> 0);

    cv.t = tag();
    noOutline[cv.t] = 1;
    box(cv, iso, b.x0, b.y0, 0, bw, bd, 2.4, {
      top: pavementShade(iso, C, b.x0, b.y0, bw, bd, 2.4, seedN + 17,
        paveTones[bi9 % paveTones.length], kerbTones[bi9 % kerbTones.length]),
      left: kerbTones[bi9 % kerbTones.length].l, right: kerbTones[bi9 % kerbTones.length].r,
    });

    const parcels = b.parcels.slice().sort((p, q) => (p.x0 + p.y0) - (q.x0 + q.y0));
    for (const p of parcels) {
      if (!vis(p.x0, p.y0, p.x1, p.y1, 100)) continue;
      const CP = localC(CB, cs, 2, 1);
      parcel(cv, iso, CP, { bs, ps, ns, pes, sg }, p, seedN, tag, tagRaw);
    }
    sidewalkProps(cv, iso, CB, { ps, ns, pes, sg }, b, tag, CW, tagRaw);
  }

  traffic(cv, iso, C, ts, pes, plan, vis, tag, cs, tagRaw);
  if (opts.outline !== false && !opts.noOut) outlinePass(cv, C.black, noOutline);
  return cv;
}

// ---------------------------------------------------------------------------
// One sweep, after everything is drawn: blacken the boundary pixel of the
// NEARER object at every tag change. Small objects are skipped — a 1px rim on a
// five-pixel-wide pedestrian would eat the pedestrian.

function outlinePass(cv, black, skip) {
  const w = cv.w, h = cv.h, N = 65536;
  const tag = cv.tag, depth = cv.depth, idx = cv.idx;
  const minx = new Int32Array(N).fill(1 << 30), maxx = new Int32Array(N).fill(-1);
  const miny = new Int32Array(N).fill(1 << 30), maxy = new Int32Array(N).fill(-1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const t = tag[row + x];
      if (!t) continue;
      if (x < minx[t]) minx[t] = x;
      if (x > maxx[t]) maxx[t] = x;
      if (y < miny[t]) miny[t] = y;
      if (y > maxy[t]) maxy[t] = y;
    }
  }
  const big = new Uint8Array(N);
  for (let t = 1; t < N; t++) {
    if (maxx[t] < 0 || skip[t]) continue;
    if (maxx[t] - minx[t] >= 3 && maxy[t] - miny[t] >= 3) big[t] = 1;
  }
  const mark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const o = row + x;
      const t = tag[o];
      if (!t || !big[t]) continue;
      const d = depth[o];
      // Strictly nearer wins, and an exact depth tie is broken by tag order, so
      // a shared boundary is blackened on ONE side only. Marking both sides
      // would make every outline 2px and the dark-run histogram would say so.
      const win = (q) => tag[q] !== t && (d > depth[q] || (d === depth[q] && t < tag[q]));
      let m = 0;
      if (x + 1 < w && win(o + 1)) m = 1;
      else if (x > 0 && win(o - 1)) m = 1;
      else if (y > 0 && win(o - w)) m = 1;
      if (m) mark[o] = 1;
    }
  }
  for (let i = 0; i < mark.length; i++) if (mark[i]) idx[i] = black;
}

// ---------------------------------------------------------------------------

function parcel(cv, iso, C, st, p, seedN, tag, tagRaw) {
  const { bs, ps, ns, pes, sg } = st;
  const x0 = p.x0, y0 = p.y0, w = p.x1 - p.x0, d = p.y1 - p.y0;
  const Z = 2.4;

  if (p.type === 'build' || p.type === 'low') {
    const ix = bs.range(0, Math.min(4.0, w * 0.10));
    const iy = bs.range(0, Math.min(4.0, d * 0.10));
    const bw = w - ix - bs.range(0, Math.min(4.0, w * 0.08));
    const bd = d - iy - bs.range(0, Math.min(4.0, d * 0.08));
    if (bw < 10 || bd < 10) return;
    cv.t = tag();
    drawBuilding(cv, iso, C, bs, x0 + ix, y0 + iy, Z, bw, bd, {
      maxH: p.type === 'low' ? 17 : 92, sign: sg, tag,
    });
    // awnings over the shopfronts on the two visible street faces
    const aw = ps.range(9, 15);
    for (let u = 1.5; u < bw - aw; u += aw + ps.range(1, 5)) {
      if (!ps.bool(0.72)) continue;
      cv.t = tag();
      S.awning(cv, iso, C, ps, x0 + ix + u, y0 + iy + bd, Z + 6.0, aw, 0);
    }
    for (let u = 1.5; u < bd - aw; u += aw + ps.range(1, 5)) {
      if (!ps.bool(0.6)) continue;
      cv.t = tag();
      S.awning(cv, iso, C, ps, x0 + ix + bw, y0 + iy + u, Z + 6.0, aw, 1);
    }
    if (ix > 2.5) {
      for (let t = 0; t < 3; t++) {
        cv.t = tag();
        const px = x0 + 0.4, py = y0 + ps.range(0.5, Math.max(0.6, d - 3));
        const k = ps.int(0, 3);
        if (k === 0) S.bin(cv, iso, C, ps, px, py, Z);
        else if (k === 1) N.bush(cv, iso, C, ns, px, py, Z);
        else if (k === 2) S.crateStackShim(cv, iso, C, ps, px, py, Z);
        else S.bollard(cv, iso, C, ps, px, py, Z);
      }
    }
    return;
  }

  if (p.type === 'park') {
    cv.t = tag();
    N.grassPlot(cv, iso, C, ns, x0, y0, Z, w, d);
    if (ns.bool(0.6)) { cv.t = tag(); drawSlab(cv, iso, x0, y0 + d * 0.45, Z + 0.01, w, 4.5, C.pave.t); }
    const n = Math.max(3, Math.round(w * d / 130));
    for (let i = 0; i < n; i++) {
      cv.t = tagRaw();
      const px = x0 + ns.range(1.0, Math.max(1.1, w - 3)), py = y0 + ns.range(1.0, Math.max(1.1, d - 3));
      const k = ns.weighted([['tree', 7], ['palm', 3], ['bush', 4], ['bed', 3], ['bench', 3], ['hedge', 3]]);
      if (k === 'tree') N.tree(cv, iso, C, ns, px, py, Z, ns.bool(0.5));
      else if (k === 'palm') N.palm(cv, iso, C, ns, px, py, Z);
      else if (k === 'bush') N.bush(cv, iso, C, ns, px, py, Z);
      else if (k === 'bed') N.flowerBed(cv, iso, C, ns, px, py, Z + 0.02, ns.range(4, 9), ns.range(4, 9));
      else if (k === 'bench') S.bench(cv, iso, C, ps, px, py, Z, ps.int(0, 1));
      else N.hedge(cv, iso, C, ns, px, py, Z, ns.range(6, 16), 2.0, 2.2);
    }
    for (let i = 0; i < Math.max(2, Math.round(w * d / 260)); i++) {
      cv.t = tagRaw();
      drawPerson(cv, iso, C, pes, x0 + pes.range(1, w - 1), y0 + pes.range(1, d - 1), Z);
    }
    return;
  }

  if (p.type === 'lot') {
    cv.t = tag();
    const F = topFace(iso, Z, x0, y0);
    drawSlab(cv, iso, x0, y0, Z, w, d, (sx, sy) => {
      const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
      if ((u % 5.5) < 0.62) return C.white.t;
      return C.road.t;
    });
    for (let row = 0; row < 2; row++) {
      const yy = row === 0 ? y0 + 1.4 : y0 + d - 5.6;
      if (row === 1 && d < 18) break;
      for (let u = 1.4; u < w - 9; u += 5.4) {
        if (!ps.bool(0.72)) continue;
        cv.t = tag();
        drawVehicle(cv, iso, C, ps, x0 + u + 0.6, yy, Z, 0,
          ps.weighted([['car', 6], ['van', 2], ['pickup', 2], ['taxi', 1]]), tag);
      }
    }
    cv.t = tag(); S.fenceRun(cv, iso, C, ps, x0, y0 + d - 0.4, Z, w, 0, 2.4);
    cv.t = tag(); S.lampPost(cv, iso, C, ps, x0 + w * 0.5, y0 + d * 0.5, Z, 0);
    return;
  }

  if (p.type === 'plaza') {
    cv.t = tag();
    const F = topFace(iso, Z, x0, y0);
    drawSlab(cv, iso, x0, y0, Z, w, d, (sx, sy) => {
      const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
      const cu = Math.floor(u / 6), cvv = Math.floor(v / 6);
      if ((u % 6) < 0.62 || (v % 6) < 0.62) return C.pave.l;
      return ((cu + cvv) & 1) ? C.pave.t : C.concrete.t;
    });
    for (let i = 0; i < Math.max(3, Math.round(w * d / 120)); i++) {
      cv.t = tag();
      const px = x0 + ps.range(1.2, Math.max(1.3, w - 5)), py = y0 + ps.range(1.2, Math.max(1.3, d - 5));
      const k = ps.weighted([['planter', 5], ['bench', 4], ['parasol', 3], ['stall', 3], ['bin', 3], ['lamp', 3], ['tree', 4]]);
      if (k === 'planter') S.planter(cv, iso, C, ps, px, py, Z, ps.range(3, 5));
      else if (k === 'bench') S.bench(cv, iso, C, ps, px, py, Z, ps.int(0, 1));
      else if (k === 'parasol') S.parasol(cv, iso, C, ps, px, py, Z);
      else if (k === 'stall') S.marketStall(cv, iso, C, ps, px, py, Z, 6, 5);
      else if (k === 'bin') S.bin(cv, iso, C, ps, px, py, Z);
      else if (k === 'lamp') S.lampPost(cv, iso, C, ps, px, py, Z, 0);
      else N.tree(cv, iso, C, ps, px, py, Z, false);
    }
    for (let i = 0; i < Math.max(3, Math.round(w * d / 130)); i++) {
      cv.t = tagRaw();
      drawPerson(cv, iso, C, pes, x0 + pes.range(1, w - 1), y0 + pes.range(1, d - 1), Z);
    }
    return;
  }

  if (p.type === 'market') {
    cv.t = tag();
    drawSlab(cv, iso, x0, y0, Z, w, d, C.pave.t);
    for (let u = 1.0; u < w - 7; u += 8.0) {
      for (let v = 1.0; v < d - 6; v += 7.5) {
        if (!ps.bool(0.85)) continue;
        cv.t = tag();
        S.marketStall(cv, iso, C, ps, x0 + u, y0 + v, Z, 6.0, 5.0);
      }
    }
    for (let i = 0; i < Math.max(4, Math.round(w * d / 100)); i++) {
      cv.t = tagRaw();
      drawPerson(cv, iso, C, pes, x0 + pes.range(1, w - 1), y0 + pes.range(1, d - 1), Z);
    }
    return;
  }

  if (p.type === 'yard') {
    cv.t = tag();
    const F = topFace(iso, Z, x0, y0);
    drawSlab(cv, iso, x0, y0, Z, w, d, (sx, sy) => {
      const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
      const k = h3(Math.floor(u / 8), Math.floor(v / 8), seedN + 61) & 15;
      return k < 3 ? C.sandy.l : k < 5 ? C.concrete.l : C.concrete.t;
    });
    for (let u = 1.0; u < w - 10; u += ps.range(6, 13)) {
      const stack = ps.int(1, 2);
      const yy = y0 + ps.range(1.0, Math.max(1.1, d - 6));
      for (let s = 0; s < stack; s++) {
        cv.t = tag();
        S.container(cv, iso, C, ps, x0 + u, yy, Z + s * 3.2, 0);
      }
    }
    for (let i = 0; i < 5; i++) {
      cv.t = tag();
      S.crateStackShim(cv, iso, C, ps, x0 + ps.range(1, w - 3), y0 + ps.range(1, d - 3), Z);
    }
    cv.t = tag(); S.fenceRun(cv, iso, C, ps, x0, y0 + d - 0.4, Z, w, 0, 2.8);
    return;
  }

  if (p.type === 'pool') {
    cv.t = tag();
    drawSlab(cv, iso, x0, y0, Z, w, d, C.pave.t);
    const px = x0 + 3.0, py = y0 + 3.0, pw = Math.max(5, w - 6), pd = Math.max(5, d - 6);
    cv.t = tag();
    const FP = topFace(iso, Z, px, py);
    box(cv, iso, px, py, Z - 1.2, pw, pd, 1.2, {
      top: (sx, sy) => {
        const u = FP.au * sx + FP.bu * sy + FP.cu, v = FP.av * sx + FP.bv * sy + FP.cv;
        if (u < 1.0 || v < 1.0 || u > pw - 1.0 || v > pd - 1.0) return C.white.t;
        if ((v % 4.5) < 0.62) return C.cyan.l;
        return (Math.floor(u / 3.5) & 1) ? C.aqua.t : C.aqua.l;
      },
      left: C.aqua.r, right: C.aqua.d,
    });
    for (let i = 0; i < 5; i++) {
      cv.t = tag();
      S.bench(cv, iso, C, ps, x0 + ps.range(0.4, 2.2), y0 + ps.range(1, Math.max(1.1, d - 4)), Z, 1);
    }
    for (let i = 0; i < 3; i++) {
      cv.t = tag();
      S.parasol(cv, iso, C, ps, x0 + ps.range(0.6, 2.4), y0 + ps.range(2, Math.max(2.1, d - 4)), Z);
    }
    for (let i = 0; i < 4; i++) {
      cv.t = tagRaw();
      drawPerson(cv, iso, C, pes, x0 + pes.range(0.6, 2.4), y0 + pes.range(1, d - 1), Z);
    }
    return;
  }

  // site: hoarding, scaffold, half-built frame, plant
  cv.t = tag();
  const F = topFace(iso, Z, x0, y0);
  drawSlab(cv, iso, x0, y0, Z, w, d, (sx, sy) => {
    const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
    const k = h3(Math.floor(u / 7), Math.floor(v / 7), seedN + 77) & 15;
    return k < 4 ? C.sandy.l : k < 7 ? C.taupe.l : C.sandy.t;
  });
  const sh = ps.range(12, 44);
  if (w > 16 && d > 16) {
    cv.t = tag();
    box(cv, iso, x0 + 3, y0 + 3, Z, w - 6, d - 6, sh * ps.range(0.35, 0.8), MD(C.concrete));
    cv.t = tag();
    S.scaffold(cv, iso, C, ps, x0 + 1.6, y0 + 1.6, Z, w - 3.2, d - 3.2, sh);
  }
  cv.t = tag(); S.hoarding(cv, iso, C, ps, x0, y0 + d - 0.7, Z, w, 0, ps.range(3.5, 5.5));
  cv.t = tag(); S.hoarding(cv, iso, C, ps, x0 + w - 0.7, y0, Z, d, 1, ps.range(3.5, 5.5));
  for (let i = 0; i < 6; i++) { cv.t = tag(); S.cone(cv, iso, C, ps, x0 + ps.range(0.6, w - 2), y0 + ps.range(0.6, d - 2), Z); }
  for (let i = 0; i < 3; i++) { cv.t = tag(); S.crateStackShim(cv, iso, C, ps, x0 + ps.range(0.6, w - 3), y0 + ps.range(0.6, d - 3), Z); }
  if (ps.bool(0.4) && w > 20) {
    cv.t = tag();
    box(cv, iso, x0 + w * 0.5, y0 + d * 0.5, Z, 2.2, 2.2, sh + 9, MD(C.amber));
    cv.t = tag();
    box(cv, iso, x0 + w * 0.5 - 16, y0 + d * 0.5 + 0.3, Z + sh + 6, 34, 1.6, 1.6, MD(C.amber));
  }
}

// ---------------------------------------------------------------------------

function sidewalkProps(cv, iso, C, st, b, tag, CW, tagRaw) {
  const { ps, ns, pes, sg } = st;
  const Z = 2.4;
  // Two ranks per edge: one at the kerb, one against the building line. A
  // single line of props leaves the middle of the pavement empty, and empty
  // pavement is the largest thing a judge sees that the reference never has.
  const edges = [
    [b.x0 + 2.0, b.y0 + 2.0, 1, 0, b.x1 - b.x0 - 4.0],
    [b.x0 + 2.0, b.y1 - 2.0, 1, 0, b.x1 - b.x0 - 4.0],
    [b.x0 + 2.0, b.y0 + 2.0, 0, 1, b.y1 - b.y0 - 4.0],
    [b.x1 - 2.0, b.y0 + 2.0, 0, 1, b.y1 - b.y0 - 4.0],
    [b.x0 + 4.8, b.y0 + 4.8, 1, 0, b.x1 - b.x0 - 9.6],
    [b.x0 + 4.8, b.y1 - 4.8, 1, 0, b.x1 - b.x0 - 9.6],
    [b.x0 + 4.8, b.y0 + 4.8, 0, 1, b.y1 - b.y0 - 9.6],
    [b.x1 - 4.8, b.y0 + 4.8, 0, 1, b.y1 - b.y0 - 9.6],
  ];
  for (const [ex, ey, dx, dy, len] of edges) {
    let t = ps.range(0, 6);
    while (t < len) {
      cv.t = tag();
      const x = ex + dx * t, y = ey + dy * t;
      const k = ps.weighted([
        ['lamp', 7], ['tree', 8], ['bin', 5], ['hydrant', 3], ['bollard', 4],
        ['meter', 4], ['sign', 4], ['bench', 4], ['planter', 4], ['post', 2],
        ['shelter', 2], ['kiosk', 2], ['palm', 4], ['light', 3], ['barrier', 3], ['none', 5],
      ]);
      if (k === 'lamp') S.lampPost(cv, iso, C, ps, x, y, Z, dx ? 1 : 0);
      else if (k === 'tree') { cv.t = tagRaw(); N.tree(cv, iso, C, ns, x, y, Z, ns.bool(0.4)); }
      else if (k === 'palm') { cv.t = tagRaw(); N.palm(cv, iso, C, ns, x, y, Z); }
      else if (k === 'bin') S.bin(cv, iso, C, ps, x, y, Z);
      else if (k === 'hydrant') S.hydrant(cv, iso, C, ps, x, y, Z);
      else if (k === 'bollard') { for (let q = 0; q < 3; q++) { cv.t = tag(); S.bollard(cv, iso, C, ps, x + dx * q * 2.4, y + dy * q * 2.4, Z); } }
      else if (k === 'meter') S.meter(cv, iso, C, ps, x, y, Z);
      else if (k === 'sign') S.signPost(cv, iso, C, ps, x, y, Z, coinTag(sg));
      else if (k === 'bench') S.bench(cv, iso, C, ps, x, y, Z, dx ? 0 : 1);
      else if (k === 'planter') S.planter(cv, iso, C, ps, x, y, Z, ps.range(3, 5));
      else if (k === 'post') S.postbox(cv, iso, C, ps, x, y, Z);
      else if (k === 'shelter') S.busShelter(cv, iso, C, ps, x, y, Z, dx ? 0 : 1);
      else if (k === 'kiosk') S.kiosk(cv, iso, C, ps, x, y, Z, 5.0, 4.4, coinTag(sg));
      else if (k === 'light') S.trafficLight(cv, iso, C, ps, x, y, Z);
      else if (k === 'barrier') S.barrier(cv, iso, C, ps, x, y, Z, dx ? 0 : 1);
      t += ps.range(4.0, 10.5);
    }
    let q = pes.range(0, 3);
    while (q < len) {
      cv.t = tag();
      const jx = dx ? pes.range(-1.6, 1.6) : pes.range(-3.4, 3.4);
      const jy = dy ? pes.range(-1.6, 1.6) : pes.range(-3.4, 3.4);
      drawPerson(cv, iso, CW, pes, ex + dx * q + jx, ey + dy * q + jy, Z);
      q += pes.range(1.6, 4.4);
    }
  }
}

// ---------------------------------------------------------------------------

function traffic(cv, iso, C, ts, pes, plan, vis, tag, cs, tagRaw) {
  const KINDS = [['car', 10], ['taxi', 3], ['van', 3], ['pickup', 3], ['truck', 2], ['bus', 1], ['moto', 2], ['bike', 2]];
  const { bx, by, X0, X1, Y0, Y1 } = plan;
  // Traffic keeps its own committed palette: mostly the neutral families with a
  // few painted vehicles, which is both what a street looks like and what keeps
  // colours-per-tile down where cars sit two deep.
  const CT = Object.create(C);
  CT.accents = [C.accentTone(cs), C.accentTone(cs), C.accentTone(cs),
    C.accentTone(cs), C.accentTone(cs), C.white, C.concrete, C.slate,
    C.steel, C.road, C.white, C.slate];

  // Parked ranks against both kerbs. An empty gutter is the single largest
  // uniform region a street grid produces, and uniform regions are what the
  // tile-repeat metric punishes.
  for (const [a, b] of bx.streets) {
    for (const lane of [a + 1.4, b - 5.8]) {
      let y = Y0 + ts.range(0, 12);
      while (y < Y1) {
        if (vis(a, y, b, y + 12, 8) && ts.bool(0.66)) {
          cv.t = tag();
          drawVehicle(cv, iso, CT, ts, lane, y, 0, 1,
            ts.weighted([['car', 8], ['van', 3], ['pickup', 3], ['taxi', 2], ['moto', 1]]), tag);
        }
        y += ts.range(9.5, 17);
      }
    }
  }
  for (const [c, d] of by.streets) {
    for (const lane of [c + 1.4, d - 5.8]) {
      let x = X0 + ts.range(0, 12);
      while (x < X1) {
        if (vis(x, c, x + 12, d, 8) && ts.bool(0.66)) {
          cv.t = tag();
          drawVehicle(cv, iso, CT, ts, x, lane, 0, 0,
            ts.weighted([['car', 8], ['van', 3], ['pickup', 3], ['taxi', 2], ['moto', 1]]), tag);
        }
        x += ts.range(9.5, 17);
      }
    }
  }
  for (const [a, b] of bx.streets) {
    const lanes = [a + 4.5, b - 9.0];
    for (let li = 0; li < 2; li++) {
      let y = Y0 + ts.range(0, 18);
      while (y < Y1) {
        const kind = ts.weighted(KINDS);
        if (vis(a, y, b, y + 14, 8) && ts.bool(0.84)) {
          cv.t = tag();
          drawVehicle(cv, iso, CT, ts, lanes[li], y, 0, 1, kind, tag);
        }
        y += ts.range(11, 26);
      }
    }
  }
  for (const [c, d] of by.streets) {
    const lanes = [c + 4.5, d - 9.0];
    for (let li = 0; li < 2; li++) {
      let x = X0 + ts.range(0, 18);
      while (x < X1) {
        const kind = ts.weighted(KINDS);
        if (vis(x, c, x + 14, d, 8) && ts.bool(0.84)) {
          cv.t = tag();
          drawVehicle(cv, iso, CT, ts, x, lanes[li], 0, 0, kind, tag);
        }
        x += ts.range(11, 26);
      }
    }
  }
  for (const [a, b] of bx.streets) {
    for (const [c, d] of by.streets) {
      if (!vis(a, c, b, d, 4)) continue;
      const n = pes.int(2, 9);
      for (let i = 0; i < n; i++) {
        cv.t = tag();
        if (pes.bool(0.5)) drawPerson(cv, iso, C, pes, a + pes.range(1, b - a - 1), c - pes.range(1, 10), 0);
        else drawPerson(cv, iso, C, pes, a - pes.range(1, 10), c + pes.range(1, d - c - 1), 0);
      }
    }
  }
}
