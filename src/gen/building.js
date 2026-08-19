// Buildings.
//
// Three rules carry the look.
//
// (1) A building is never one box: podium, shaft, setbacks, parapet — so the
//     silhouette has steps in it.
// (2) Windows are drawn INSIDE the face fill by a shade callback that inverts
//     the projection back to face coordinates. A second pass would have to
//     re-find the face and would soften every edge it touched.
// (3) A facade is mostly WALL. The measured reference keeps 16.6% of the frame
//     inside a totally flat 5x5 block while running a 0.29 change rate; that is
//     only possible if the big planes stay big and the density comes from
//     separate outlined objects instead. So most faces here are blank or
//     structurally banded, and every window frame is one pixel of black.

import { drawSlab, asShade } from '../core/iso.js';
import { box, gable } from './draw.js';
import { leftFace, rightFace, topFace, blitFace } from './faces.js';
import { h3 } from './palette.js';
import { textBitmap, scaleBitmap, coinWord, coinTag } from './font.js';
import * as R from './props/roof.js';
import * as S from './props/street.js';

const M = (f) => ({ top: f.t, left: f.l, right: f.r });
const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

function facade(F, o) {
  const { au, cu, av, bv, cv } = F;
  const W = o.W, H = o.H, K = o.black;
  return (sx, sy) => {
    const u = au * sx + cu;
    const v = av * sx + bv * sy + cv;
    if (v < 0) return o.wall;
    if (v < 2.2) return o.plinth;
    if (v > H - 1.3) return o.cornice;

    // ---------------- ground floor: shopfronts, the busiest band on a street
    if (v < o.groundH) {
      const bi = Math.floor(u / o.shopU);
      const gu = u - bi * o.shopU;
      const hh = h3(o.seed, bi, 101);
      if (v > o.groundH - 0.62) return K;
      if (v > o.groundH - 2.6) return o.fascia[hh % o.fascia.length];
      if (gu < 0.55 || gu > o.shopU - 0.55) return K;
      if (gu < 1.2 || gu > o.shopU - 1.2) return o.quoin;
      if (v < 1.5) return o.shopBase;
      if ((hh & 7) < 2 && gu > o.shopU * 0.34 && gu < o.shopU * 0.60) {
        return v < 4.4 ? o.door : o.quoin;
      }
      if ((gu % o.shopMull) < 0.55) return K;
      return (hh & 3) === 1 ? o.shopGlassB : o.shopGlass;
    }

    // ---------------- upper floors
    const vv = v - o.groundH;
    const fl = Math.floor(vv / o.floorH);
    const fv = vv - fl * o.floorH;
    const bay = Math.floor(u / o.bayU);
    const fu = u - bay * o.bayU;

    if (o.blank) {
      // a plain flank wall: expansion joints and one banded course, nothing else
      if (o.jointEvery > 0 && (bay % o.jointEvery) === 0 && fu < 0.5) return K;
      if (o.bandEvery > 0 && (fl % o.bandEvery) === 0 && fv < 1.4) return o.band;
      return o.wall;
    }

    const rowOn = (fl % o.rowPeriod) < o.rowCount;
    const colOn = (bay % o.colPeriod) < o.colCount;
    if (!rowOn || !colOn) {
      if (o.bandEvery > 0 && (fl % o.bandEvery) === 0 && fv < 1.4) return o.band;
      return o.wall;
    }
    const wy0 = o.spandrel, wy1 = o.floorH - o.head;
    const wx0 = o.mull, wx1 = o.bayU - o.mull;
    if (fu < 0.55) return K;                      // 1px vertical bay line
    if (fv < wy0 || fv > wy1 || fu < wx0 || fu > wx1) {
      if (o.bandEvery > 0 && (fl % o.bandEvery) === 0 && fv < 1.4) return o.band;
      return o.wall;
    }
    // 1px black frame all round the opening, then flat glass inside it
    if (fu < wx0 + 0.55 || fu > wx1 - 0.55) return K;
    if (o.centreMull && wx1 - wx0 > 3.2 && Math.abs(fu - o.bayU * 0.5) < 0.28) return K;
    const hh = h3(o.seed, bay, fl) & 15;
    if (hh < 6) return o.g0;
    if (hh < 11) return o.g1;
    if (hh < 13) return o.lit;
    if (hh < 15) return o.blind;
    return o.open;
  };
}

function facadeOpts(C, st, wall, W, H, seed, style, blank) {
  const glass = st.pick([C.glass, C.aqua, C.steel, C.slate, C.teal]);
  const trim = st.bool(0.7) ? C.white : st.pick([C.cream, C.concrete, C.pave]);
  const acc = st.pick(C.accents);
  const o = {
    W, H, seed, black: C.black, blank,
    wall: wall.l, wallD: wall.r, quoin: wall.r,
    plinth: wall.r, cornice: trim.l,
    band: acc.l, bandEvery: st.weighted([[0, 6], [3, 2], [4, 2], [5, 1]]),
    jointEvery: st.weighted([[0, 3], [2, 2], [3, 2]]),
    groundH: st.range(6.5, 9.5),
    floorH: st.range(4.8, 7.2),
    bayU: st.range(4.0, 6.5),
    mull: 0.9, spandrel: 1.7, head: 0.9, centreMull: st.bool(0.5),
    rowPeriod: 1, rowCount: 1, colPeriod: 1, colCount: 1,
    g0: glass.r, g1: glass.l, lit: C.amber.t, blind: trim.t, open: glass.d,
    shopU: st.range(9, 16),
    shopGlass: glass.r, shopGlassB: glass.l, shopMull: st.range(2.4, 4.0),
    shopBase: wall.r,
    door: st.pick([C.red, C.blue, C.wood, C.green, C.slate]).r,
    fascia: [acc.l, acc.t, acc.r, trim.t],
    panel: st.pick(C.accents).l,
    panelU0: W * st.range(0.14, 0.3), panelU1: W * st.range(0.6, 0.88),
    panelV0: 0, panelV1: 0,
  };
  // structural gaps: whole floors or whole bays with no openings at all
  o.panelV0 = o.groundH + st.range(2, 7);
  o.panelV1 = o.panelV0 + st.range(7, 22);
  const rp = st.weighted([[1, 6], [2, 3], [3, 2]]);
  o.rowPeriod = rp; o.rowCount = rp === 1 ? 1 : st.int(1, rp - 1);
  const cp = st.weighted([[1, 7], [2, 2], [4, 1]]);
  o.colPeriod = cp; o.colCount = cp === 1 ? 1 : Math.max(1, cp - 1);

  if (style === 1) {           // ribbon glazing, wide flat spandrels
    o.mull = 0.5; o.spandrel = 2.4; o.bayU = st.range(3.6, 5.0);
    o.rowPeriod = 1; o.rowCount = 1; o.colPeriod = 1; o.colCount = 1;
    o.g0 = glass.r; o.g1 = glass.r;
  } else if (style === 2) {    // heavy grid, deep piers
    o.mull = 1.6; o.bayU = st.range(6.5, 9.5); o.spandrel = 2.4;
  } else if (style === 3) {    // masonry, small punched windows, big wall
    o.bayU = st.range(6.0, 9.5); o.mull = 2.2; o.floorH = st.range(5.4, 7.6);
    o.spandrel = 2.6; o.g1 = glass.r;
  }
  return o;
}

function mass(cv, iso, C, st, x, y, z, w, d, h, wall, style, seed) {
  const FL = leftFace(iso, y + d, x, z);
  const FR = rightFace(iso, x + w, y, z);
  const blankL = ((h3(seed, 1, 3) & 15) < 3);
  const blankR = ((h3(seed, 2, 3) & 15) < 3);
  const oL = facadeOpts(C, st, wall, w, h, seed, style, blankL);
  const oR = Object.assign({}, oL, { W: d, blank: blankR });
  box(cv, iso, x, y, z, w, d, h, {
    top: null, left: facade(FL, oL), right: facade(FR, oR),
  });
  // The near vertical arris. It is not a silhouette edge, so the outline sweep
  // will never find it, and without it the two lit faces of a mass slide into
  // one another. In this projection a world-z edge is exactly screen-vertical,
  // which is also where the reference's vertical-edge share comes from.
}

export function drawBuilding(cv, iso, C, st, x, y, z, w, d, opt) {
  const w0 = C.wallTone(st);
  const wall = C.mk(w0._h + st.range(-9, 9), w0._s * st.range(0.82, 1.2),
    Math.min(0.97, w0._L * st.range(0.9, 1.1)));
  const style = st.weighted([[0, 5], [1, 3], [2, 3], [3, 4]]);
  const seed = st.int(1, 1 << 28);
  const tall = Math.min(opt.maxH, st.weighted([
    [st.range(11, 20), 3], [st.range(20, 34), 5],
    [st.range(34, 58), 4], [st.range(58, 104), 2],
  ]));

  const masses = [];
  let cx = x, cy = y, cw = w, cd = d, cz = z, left = tall, n = 0;
  while (left > 5 && n < 3) {
    const share = n === 0 ? st.range(0.5, 0.85) : st.range(0.55, 0.95);
    const hh = Math.max(5, left * share);
    masses.push([cx, cy, cz, cw, cd, hh]);
    cz += hh; left -= hh;
    if (left <= 5) break;
    const ix = st.range(1.5, Math.max(1.6, cw * 0.24));
    const iy = st.range(1.5, Math.max(1.6, cd * 0.24));
    const nw = cw - ix, nd = cd - iy;
    if (nw < 12 || nd < 12) break;
    cx += st.bool(0.5) ? ix : 0; cy += st.bool(0.5) ? iy : 0;
    cw = nw; cd = nd; n++;
  }

  for (const [mx, my, mz, mw, md, mh] of masses) {
    mass(cv, iso, C, st, mx, my, mz, mw, md, mh, wall, style, seed + Math.round(mz));
  }

  const pitched = tall < 40 && Math.min(w, d) < 40 && st.bool(0.5);
  for (let i = 0; i < masses.length; i++) {
    const [mx, my, mz, mw, md, mh] = masses[i];
    const rz = mz + mh;
    if (pitched && i === masses.length - 1) {
      const tile = st.pick([C.terra, C.brick, C.slate, C.steel, C.red]);
      const ridgeX = mw >= md;
      const hr = Math.min(14, (ridgeX ? md : mw) * st.range(0.23, 0.28));
      // Tile courses. At this pitch the eaves run at 1:1 on screen, so courses
      // parallel to them are cut on (sx + sy) / (sx - sy) — continuous 45-degree
      // strokes, which is both what a tiled roof looks like and the only thing
      // in this generator that votes against a 100%-dimetric slope histogram.
      const cp = st.int(4, 7);
      const near = (a, b) => (sxp, syp) => (Math.floor((sxp + syp) / cp) % 5) === 0 ? b : a;
      const far = (a, b) => (sxp, syp) => (Math.floor((sxp - syp) / cp) % 5) === 0 ? b : a;
      gable(cv, iso, mx, my, rz, mw, md, hr, ridgeX, ridgeX
        ? { left: near(tile.l, tile.r), top: far(tile.t, tile.l), right: tile.r }
        : { right: far(tile.r, tile.d), top: near(tile.t, tile.l), left: tile.l });
      // ridge furniture: chimneys, vents, a roof light. A bare pitched roof is
      // the largest dead region this generator can produce.
      const nch = st.int(2, 5);
      for (let q = 0; q < nch; q++) {
        cv.t = opt.tag();
        const t = (q + 0.7) / (nch + 0.4);
        const cxp = ridgeX ? mx + t * mw : mx + mw * 0.5 - 0.9;
        const cyp = ridgeX ? my + md * 0.5 - 0.9 : my + t * md;
        const ch = st.range(1.6, 3.4);
        const cm = st.pick([C.brick, C.terra, C.concrete, C.slate]);
        box(cv, iso, cxp, cyp, rz + hr - 0.6, 1.8, 1.8, ch, { top: cm.d, left: cm.l, right: cm.r });
      }
      continue;
    }
    R.roofDeck(cv, iso, C, st, mx, my, rz, mw, md, wall);
    const pc = st.bool(0.4) ? wall : st.bool(0.55) ? st.pick(C.accents) : C.concrete;
    const ph = st.range(0.9, 2.0);
    box(cv, iso, mx, my, rz, mw, 0.7, ph, MD(pc));
    box(cv, iso, mx, my, rz, 0.7, md, ph, MD(pc));
    box(cv, iso, mx, my + md - 0.7, rz, mw, 0.7, ph, MD(pc));
    box(cv, iso, mx + mw - 0.7, my, rz, 0.7, md, ph, MD(pc));

    if (st.bool(0.45)) {
      R.railing(cv, iso, C, st, mx + 0.9, my + md - 1.6, rz + ph, mw - 1.8, 0, st.range(2.0, 3.2));
      R.railing(cv, iso, C, st, mx + mw - 1.6, my + 0.9, rz + ph, md - 1.8, 1, st.range(2.0, 3.2));
    }
    const area = mw * md;
    let budget = Math.max(3, Math.min(26, Math.round(area / 45)));
    if (i < masses.length - 1) budget = Math.max(1, budget >> 1);
    for (let k = 0; k < budget; k++) {
      const px = mx + st.range(1.8, Math.max(2.0, mw - 6));
      const py = my + st.range(1.8, Math.max(2.0, md - 6));
      cv.t = opt.tag();
      const kind = st.weighted([
        ['ac', 6], ['vent', 4], ['tank', 3], ['hut', 3], ['dish', 2],
        ['solar', 3], ['sky', 2], ['aerial', 2], ['crate', 2],
      ]);
      if (kind === 'ac') R.acUnit(cv, iso, C, st, px, py, rz);
      else if (kind === 'vent') R.vent(cv, iso, C, st, px, py, rz);
      else if (kind === 'tank' && mw > 16 && md > 16) R.waterTank(cv, iso, C, st, px, py, rz);
      else if (kind === 'hut' && mw > 18 && md > 18) R.stairHut(cv, iso, C, st, px, py, rz, wall);
      else if (kind === 'dish') R.dish(cv, iso, C, st, px, py, rz);
      else if (kind === 'solar' && mw > 16) R.solar(cv, iso, C, st, px, py, rz, st.range(6, 12), st.range(5, 9));
      else if (kind === 'sky' && mw > 14) R.skylight(cv, iso, C, st, px, py, rz, st.range(4, 8), st.range(4, 7));
      else if (kind === 'aerial') R.aerial(cv, iso, C, st, px, py, rz);
      else R.crateStack(cv, iso, C, st, px, py, rz);
    }
  }

  // ---------------- signage, all of it invented
  const top = masses[masses.length - 1];
  const sg = opt.sign;
  if (sg && !pitched && st.bool(0.26) && top[3] > 14) {
    cv.t = opt.tag();
    R.roofSign(cv, iso, C, st, top[0] + 2, top[1] + 2, top[2] + top[5] + 1.6, coinWord(sg));
  }
  if (sg && st.bool(0.6)) {
    const word = coinWord(sg).slice(0, 8);
    const rows = textBitmap(word, 1);
    const gH = st.range(6.6, 8.2);
    if (st.bool(0.5)) {
      const p = iso.proj(x + 2.0, y + d + 0.02, z + gH);
      blitFace(cv, rows, { '#': C.black, '.': -1 }, p[0], p[1], 'l', x + y + z + 400);
    } else {
      const p = iso.proj(x + w + 0.02, y + d - 2.0, z + gH);
      blitFace(cv, rows, { '#': C.black, '.': -1 }, p[0], p[1], 'r', x + y + z + 400);
    }
  }
  return tall;
}
