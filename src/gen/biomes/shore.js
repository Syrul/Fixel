// The shore biome — one gradient into the water, and everything read off it.
//
// WHAT THIS IS STRUCTURALLY. `heightField('shore')` is a single monotone ramp
// toward the sea with a low-frequency fbm added to the RAMP rather than to a
// mask, so bays, spits and headlands are not drawn — they are where the ramp
// happens to cross zero. `makeTerrain(..., { seaH })` marks everything under
// that crossing wet. There is no grid, no block, no parcel and no land-use mix
// anywhere in this file, and — unlike the desert — no fold either: the shore's
// form is a CROSSING, not a periodicity.
//
// THE PLACEMENT AXIS IS WAVE EXPOSURE, and it is what makes this a biome
// rather than a palette. `e(x, y)` is the signed cross-shore distance in world
// units, positive landward, read straight out of the field as height over
// gradient. Every band on it means something and the bands are the whole
// content of the biome:
//
//     e < -55   deep water          nothing stands, moorings only
//     -55..-20  the outer shoal     the longshore bar rises through it
//     -20..-8   the surf            breakers where the bar makes the water
//                                   shallow; the field's own gradient finds it
//     -8..0     the swash           foam, and the only water anything walks in
//     0..+8     wet sand            tide runnels, sheen, gulls, weed. NO BUILD.
//     +8..+26   dry sand            towels, chairs, windbreaks, hauled-up boats
//     +26..+36  the storm berm      shingle, the wrack line, driftwood
//     +36..+62  marram              the dune face, grass, fences
//     > +62     firm ground         the only ground anything may be BUILT on
//
// The desert's axis is how mobile its ground is; the shore's is how much sea
// has been over it lately. Nothing here admits on slope, which is the test
// `docs/BIOME-BRIEF` §12E sets for whether four biomes are really one.
//
// AND THE TWO THINGS THAT DECIDE WHETHER IT WORKS:
//
// 1. COLOUR. The desert driver came out with 68-114 distinct colours in a
//    frame against the city's ~10,000 because its terrain drew in four tones.
//    Here the coast is cut into REGIONS along its own length — a stretch of
//    shore, the next bay — and every region mints its own sand, its own wet
//    sand, its own shingle, its own marram, its own turf and its own six-deep
//    ladder of sea, each of those as a table of level x patch tones. Two bays
//    in one frame are not the same sand, and no tone is shared with the frame
//    next to it.
//
// 2. A CALM SEA IS THE WIDEST FLAT FACE THIS GENERATOR HAS EVER BEEN ASKED TO
//    DRAW, and "flat-banded water" is simultaneously a named do-not-break
//    property. Both are satisfied by the same construction: the bands are
//    CONTOURS OF THE EXPOSURE FIELD, so they follow the coast and never the
//    screen; the coast's own bearing is chosen against the projection so it can
//    never come out horizontal; the longshore bar gives depth structure across
//    them; the swell phase is warped alongshore so no two bands stay parallel;
//    and what is left over is broken by foam at the surf line, by the breaker
//    the bar makes, by moored craft, buoys, weed rafts, skerries, the pier's
//    piles and their reflections.

import { heightField, fbm, tri, vnoise } from '../world.js';
import { makeTerrain, drawTerrain, walkTrack } from '../terrain.js';
import { drawSlab } from '../../core/iso.js';
import { box, gable } from '../draw.js';
import { h3 } from '../palette.js';
import { topFace, groundInv } from '../faces.js';
import { localC } from '../stage.js';
import { coinWord, textBitmap, signInk } from '../font.js';
import { dep, projR } from '../view.js';
import * as P from '../props/shore.js';
import * as S from '../props/street.js';
import { drawPerson } from '../props/people.js';

const MD = (f) => ({ top: f.l, left: f.r, right: f.d });
const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (t) => { const u = cl01(t); return u * u * (3 - 2 * u); };

/**
 * An fbm sum, stretched onto the unit interval.
 *
 * Two octaves of value noise almost never reach 0 or 1 — the measured spread is
 * about [0.22, 0.78] — so a threshold written as `> 0.7` fires on a few percent
 * of the ground rather than on the third of it the number says, and an index
 * `(v * 5) | 0` returns 2 or 3 almost always. That is a five-tone pool
 * collapsing to two without anything in the code looking wrong, which is the
 * same class of silent defect as the desert's four-tone terrain. Stretch once,
 * at the point the field is built, and every threshold downstream means what it
 * says.
 */
const nrm = (v) => cl01((v - 0.5) * 1.85 + 0.5);
const idxN = (v, n) => { const k = (v * n) | 0; return k < 0 ? 0 : k >= n ? n - 1 : k; };

/**
 * WORK-AROUND, NOT A FIX, AND IT IS NOT IN MY FILE TO FIX.
 *
 * `drawTerrain` rasterises each cell's top face as its own quad, and two
 * coplanar quads sharing an edge do not always tile without a gap: measured on
 * one 440x900 shore frame, 1,176 pixels — 912 runs, 648 of them one pixel wide
 * and 264 two — are never written by anything. An unwritten pixel reads back
 * palette index 0, which `buildPalette` makes TRUE BLACK, so the seam appears
 * as a lattice of little black chevrons at the terrain cell pitch: the cell
 * grid showing through, which is the one thing `terrain.js`'s own header says
 * it exists to avoid. It is in the shared substrate and the desert and highland
 * have it too.
 *
 * Healed here rather than worked around cosmetically: any pixel still unclaimed
 * after the terrain pass takes its neighbour's index, tag AND depth, so the
 * silhouette sweep sees no spurious object boundary and props drawn afterwards
 * still depth-test correctly against it.
 */
function healSeams(cv) {
  const w = cv.w, h = cv.h, tg = cv.tag, ix = cv.idx, dp = cv.depth;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const o = row + x;
      if (tg[o]) continue;
      let s = -1;
      if (x > 0 && tg[o - 1]) s = o - 1;
      else if (x + 1 < w && tg[o + 1]) s = o + 1;
      else if (y + 1 < h && tg[o + w]) s = o + w;
      else if (y > 0 && tg[o - w]) s = o - w;
      if (s < 0) continue;
      ix[o] = ix[s]; tg[o] = tg[s]; dp[o] = dp[s];
    }
  }
}

// ---------------------------------------------------------------------------
// A bilinear scalar field, four channels interleaved.
//
// Every material boundary in this biome is a level set of one of these, which
// is the only way to get a boundary that walks off the lattice at every angle.
// A patch cut per terrain cell would draw the cell grid, which is exactly the
// defect measured on the desert; a patch cut per PIXEL from a hash would be
// noise, which is the defect `docs/BAR.md` §Density names. A smooth field
// thresholded is neither: it is a curve, and the field inside it is flat.
//
// Interleaving four channels in one array is not tidiness — the shader runs
// once per ground pixel and sharing one index computation across four samples
// is most of the difference between a 70ms frame and a 200ms one.

const NCH = 4;

function makeFields(X0, Y0, X1, Y1, cell, fn) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy * NCH);
  const g = new Float32Array(gx * gy);
  const tmp = [0, 0, 0, 0];
  for (let j = 0; j < gy; j++) {
    const wy = Y0 + (j - 1) * cell;
    for (let i = 0; i < gx; i++) {
      fn(X0 + (i - 1) * cell, wy, tmp);
      const k = (j * gx + i) * NCH;
      a[k] = tmp[0]; a[k + 1] = tmp[1]; a[k + 2] = tmp[2]; a[k + 3] = tmp[3];
    }
  }
  // Gradient magnitude of channel 0 — the bathymetry. THE BREAKER IS FOUND
  // WITH THIS AND NOT PLACED: over the crest of the longshore bar the bar's
  // own rise cancels the shoreward ramp, so the seabed gradient goes to nearly
  // zero exactly where a wave would feel bottom and break. A foam line drawn on
  // `grad < t` is therefore a consequence of the bathymetry rather than a
  // stripe at a chosen depth, and it bends with every bend in the bar.
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const im = i > 0 ? i - 1 : i, ip = i < gx - 1 ? i + 1 : i;
      const jm = j > 0 ? j - 1 : j, jp = j < gy - 1 ? j + 1 : j;
      const dx = (a[(j * gx + ip) * NCH] - a[(j * gx + im) * NCH]) / (2 * cell);
      const dy = (a[(jp * gx + i) * NCH] - a[(jm * gx + i) * NCH]) / (2 * cell);
      g[j * gx + i] = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    }
  }
  return {
    gx, gy, cell, a, g,
    at(x, y, out) {
      const fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
      if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
      const tx = fx - i, ty = fy - j;
      const k = (j * gx + i) * NCH, k2 = k + gx * NCH;
      for (let c = 0; c < NCH; c++) {
        const p = a[k + c], q = a[k + NCH + c];
        const r = a[k2 + c], s = a[k2 + NCH + c];
        const lo = p + (q - p) * tx;
        out[c] = lo + ((r + (s - r) * tx) - lo) * ty;
      }
      return out;
    },
    /** One channel only — the placement path never needs all four. */
    one(x, y, c) {
      const fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
      if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
      const tx = fx - i, ty = fy - j;
      const k = (j * gx + i) * NCH + c, k2 = k + gx * NCH;
      const lo = a[k] + (a[k + NCH] - a[k]) * tx;
      return lo + ((a[k2] + (a[k2 + NCH] - a[k2]) * tx) - lo) * ty;
    },
    grad(x, y) {
      let i = Math.floor((x - X0) / cell + 1), j = Math.floor((y - Y0) / cell + 1);
      if (i < 0) i = 0; else if (i > gx - 1) i = gx - 1;
      if (j < 0) j = 0; else if (j > gy - 1) j = gy - 1;
      return g[j * gx + i];
    },
  };
}

/** Distance to a set of polylines, sampled onto a grid and interpolated. */
function makeDistField(X0, Y0, X1, Y1, cell, lines, reach) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy).fill(reach);
  for (const pts of lines) {
    for (let s = 1; s < pts.length; s++) {
      const ax = pts[s - 1][0], ay = pts[s - 1][1];
      const bx = pts[s][0], by = pts[s][1];
      const ex = bx - ax, ey = by - ay;
      const L = ex * ex + ey * ey;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - X0) / cell) + 1);
      const i1 = Math.min(gx - 1, Math.ceil((Math.max(ax, bx) + reach - X0) / cell) + 1);
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - Y0) / cell) + 1);
      const j1 = Math.min(gy - 1, Math.ceil((Math.max(ay, by) + reach - Y0) / cell) + 1);
      for (let j = j0; j <= j1; j++) {
        const wy = Y0 + (j - 1) * cell;
        for (let i = i0; i <= i1; i++) {
          const wx = X0 + (i - 1) * cell;
          let t = L > 0 ? ((wx - ax) * ex + (wy - ay) * ey) / L : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = ax + ex * t - wx, cy = ay + ey * t - wy;
          const d = Math.sqrt(cx * cx + cy * cy);
          const k = j * gx + i;
          if (d < a[k]) a[k] = d;
        }
      }
    }
  }
  return (x, y) => {
    const fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
    let i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
    if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
    const tx = fx - i, ty = fy - j;
    const k = j * gx + i, k2 = k + gx;
    const lo = a[k] + (a[k + 1] - a[k]) * tx;
    return lo + ((a[k2] + (a[k2 + 1] - a[k2]) * tx) - lo) * ty;
  };
}

/** One channel, one grid, bilinear. The cheap half of the field layer. */
function makeField1(X0, Y0, X1, Y1, cell, fn) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy);
  for (let j = 0; j < gy; j++) {
    const wy = Y0 + (j - 1) * cell;
    for (let i = 0; i < gx; i++) a[j * gx + i] = fn(X0 + (i - 1) * cell, wy);
  }
  return (x, y) => {
    const fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
    let i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
    if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
    const tx = fx - i, ty = fy - j;
    const k = j * gx + i, k2 = k + gx;
    const lo = a[k] + (a[k + 1] - a[k]) * tx;
    return lo + ((a[k2] + (a[k2 + 1] - a[k2]) * tx) - lo) * ty;
  };
}

// ---------------------------------------------------------------------------
// Committed tone tables.
//
// `docs/DRIVER-ADDENDUM` §3.2: the jitter must be WIDER than the palette's own
// quantisation or it does nothing. Lightness is quantised as coarsely as 1/18,
// so a ±7% wobble on a pale sand does not clear one step and every region draws
// the same sand — which is precisely what `palette.top1Share` reads. Every
// range below is sized to cross at least two buckets on its axis.

const clampL = (v) => (v < 0.06 ? 0.06 : v > 0.97 ? 0.97 : v);

/**
 * A table of tones for one material: rows are TERRACE LEVEL, columns are
 * PATCH. The level walk is a value ladder within one family — a contour band
 * is a different value of the same material, never a different material — and
 * the patch spread is what stops a 20-unit-wide band being one flat field.
 */
function table(C, st, fam, nLv, nPa, o) {
  const rows = [];
  for (let k = 0; k < nLv; k++) {
    const lv = 1 + (o.lvWalk || 0) * (nLv < 2 ? 0 : k / (nLv - 1) - 0.5);
    const row = [];
    for (let i = 0; i < nPa; i++) {
      const t = nPa < 2 ? 0 : i / (nPa - 1) - 0.5;
      row.push(C.mk(
        fam._h + st.range(-o.h, o.h) + (o.hw || 0) * t,
        Math.min(1, fam._s * st.range(o.s0, o.s1)),
        clampL(fam._L * lv * (1 + (o.lw || 0) * t) * st.range(o.l0, o.l1))));
    }
    rows.push(row);
  }
  return rows;
}

/** A flat pool of n tones off one family. */
function pool(C, st, fam, n, o) {
  return table(C, st, fam, 1, n, o)[0];
}

// ---------------------------------------------------------------------------

export function paintShore(stage) {
  const { C, cv, iso, rng, X0, X1, Y0, Y1, W, H, S, oy, seedN, tag, tagRaw, vis } = stage;
  const cs = rng.stream('coast');
  const S0 = seedN | 0;

  // ------------------------------------------------------- the coast's bearing
  //
  // CHOSEN AGAINST THE PROJECTION, NOT AGAINST THE MAP. A coastline running
  // along world (1,-1) is EXACTLY HORIZONTAL on screen, and `docs/CRAFT.md`
  // records a long horizontal constant run as a measured bug rather than a
  // style choice — it is off-axis for both the 2:1 lattice and the vertical, so
  // it cannot be a chosen lattice break, and a waterline is the longest single
  // edge in this biome. The natural composition for a coast (sea up-screen,
  // land down-screen) is exactly the horizontal case, so the coast's SCREEN
  // SLOPE is drawn first, in a band that stays clear of horizontal at one end
  // and of the 2:1 lattice at the other, and the world bearing is solved back
  // out of it. Every band, every terrace edge and the whole waterline inherit
  // that bearing.
  // TWO BANDS, AND THE GAP BETWEEN THEM IS THE LATTICE. A coast at screen slope
  // exactly 0.5 is a 2:1 lattice line, and so — since the perpendicular's
  // screen slope is -1/(4m) — is everything that runs down the beach from it:
  // one seed came out with the waterline, the promenade, the sea wall AND every
  // groyne all on the lattice at once, and the whole frame read as ruled paper.
  // A shoreline is the best chance this generator has at the non-conforming
  // area `docs/BAR.md` measures us twenty times short on; it must not land
  // there by accident.
  const m = (cs.bool(0.5) ? cs.range(0.24, 0.40) : cs.range(0.62, 0.92))
    * (cs.bool(0.5) ? 1 : -1);
  const cx0 = (2 * m + 1) / 2, cy0 = (2 * m - 1) / 2;
  const cn = Math.sqrt(cx0 * cx0 + cy0 * cy0);
  const cxu = cx0 / cn, cyu = cy0 / cn;      // alongshore unit vector
  const nx = -cyu, ny = cxu;                 // landward unit vector, n.(1,1) > 0

  const slope = cs.range(0.050, 0.068);      // height units per unit of run
  const rough = cs.range(4.2, 6.6);          // how bitten-into the coast is

  // The longshore bar. `bar.at` and `bar.w` are in HEIGHT units because that is
  // what `heightField` compares them against; divided by the slope they are the
  // crest's distance offshore and the bar's width, which is how they are drawn.
  const barAt = cs.range(1.45, 2.35);
  const bar = { at: barAt, h: barAt * cs.range(0.40, 0.62), w: cs.range(0.75, 1.25) };

  // ------------------------------------------------------------- the anchor
  // A world with one waterline cannot leave its position to the seed's own
  // origin. The crossing is put at a chosen height up the frame, on the frame's
  // centre line, by SHIFTING THE FIELD'S INPUT rather than by using its `base`
  // — `heightField` decides where the bar sits from the un-based gradient, so a
  // base offset would slide the coast and leave the bar behind in open water.
  const sumC = (H * cs.range(0.40, 0.50) - oy) / S;
  const Ox = sumC / 2, Oy = sumC / 2;
  const F0 = heightField('shore', { seedN: S0, nx, ny, slope, rough, base: 0, bar });

  // ------------------------------------------------------------- the bands
  const E_WET = cs.range(6, 11);
  const E_DRY = E_WET + cs.range(20, 34);
  const E_BERM = E_DRY + cs.range(9, 16);
  const E_DUNE = E_BERM + cs.range(26, 42);

  // ------------------------------------------------- the ground behind the beach
  // A constant gradient would leave the whole landward half of the frame as one
  // terrace, which is the "83% one flat mass" failure verbatim. The hinterland
  // is lifted by a ramp that starts at the berm and by two octaves of hummock
  // on top of it, so the dune field carries closed contours — blobs, not bands
  // — and the ground behind it rolls. The ramp is spread over 55-75 units on
  // purpose: shorter and the terrace treads come out under 8 world units, which
  // is the corduroy the desert measured.
  // AND THE RAMP IS THE PART THAT HAS TO STAY GENTLE. A monotone rise
  // terraces into evenly spaced parallel contours — corduroy — and each of
  // them is an inked riser, so a steep hinterland turns half the lower frame
  // black. The relief is therefore mostly HUMMOCK rather than ramp: closed
  // contours around dune mounds, which are loops that enclose a field, against
  // a rise slack enough that its own contours sit fifteen units apart.
  const riseAmp = cs.range(5, 9);
  const riseLen = cs.range(85, 115);
  const duneAmp = cs.range(2.0, 3.2);
  const duneF = cs.range(0.009, 0.013);
  const farAmp = cs.range(2.6, 4.6);

  // ------------------------------------------------------------- skerries
  // Rock stacks standing out of the shoal. They are the one thing that puts
  // real geometry — a silhouette, a wall, a contour — into open water, and
  // because they are added to the HEIGHT they terrace themselves for free.
  const SKC = cs.range(56, 78);
  const skerry = (x, y, h0) => {
    if (h0 > -0.15 || h0 < -4.6) return 0;
    let a = 0;
    const gi = Math.floor(x / SKC), gj = Math.floor(y / SKC);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = gi + di, j = gj + dj;
        const q = h3(i, j, S0 ^ 0x4c11);
        if ((q & 255) > 58) continue;
        const px = (i + 0.16 + ((q >>> 8) & 255) / 372) * SKC;
        const py = (j + 0.16 + ((q >>> 16) & 255) / 372) * SKC;
        const q2 = h3(i, j, S0 ^ 0x2d97);
        const R = 5.5 + ((q2 >>> 3) & 15) * 0.62;
        const A = 1.6 + ((q2 >>> 9) & 15) * 0.30;
        // an elliptical plan at an arbitrary angle: a quadratic form, so the
        // stack's waterline is a curve conforming to nothing
        const ea = 0.70 + ((q2 >>> 14) & 15) / 24;
        const eb = 0.70 + ((q2 >>> 19) & 15) / 24;
        const ec = (((q2 >>> 24) & 31) / 31 - 0.5) * 0.9;
        const du = x - px, dv = y - py;
        const dd = Math.sqrt(Math.max(0, du * du * ea + dv * dv * eb + du * dv * ec));
        const t = cl01((R - dd) / (R * 0.72));
        if (t > 0) a += A * t * t * (3 - 2 * t);
      }
    }
    return a;
  };

  // ------------------------------------------------------------- the fields
  // FEWER, WIDER TERRACES WITH TALLER RISERS. At step 1.05 the dune face came
  // out as a packed stack of contours — corduroy, the exact defect measured on
  // the desert. `step / slope` is the tread on the beach and must stay well
  // over eight world units; on the dune ramp, where the ground is four times
  // steeper, the same step still yields seven or eight.
  // QUANTISED TO A QUARTER UNIT. `drawTerrain` now requires the cell to project
  // to a whole number of screen pixels: at scale 2 a cell of 3.0818 is 12.327px
  // wide and adjacent quads do not tile, which was the 1,176-pixel black seam
  // lattice reported from this file. A continuous `range` here is what produced
  // it, and the assertion in terrain.js is the right place for the rule.
  const cell = Math.round(cs.range(2.8, 3.3) * 4) / 4;
  const step = cs.range(1.55, 2.05);

  // A ROUGH SEABED, AND IT IS NOT DECORATION. With the bathymetry perfectly
  // smooth the four depth zones come out as four parallel ribbons; with a
  // mid-frequency reef term under them the same four zones become patchy
  // shoals, banks and holes whose boundaries wander at every angle. It is the
  // cheapest structural break the water has, it costs one fbm, and it is what
  // the sea floor is actually like.
  const reefAmp = cs.range(0.45, 0.95);
  const MF = makeFields(X0, Y0, X1, Y1, cell, (x, y, out) => {
    let h0 = F0(x - Ox, y - Oy);
    const e0 = h0 / slope;
    if (e0 < -6) {
      h0 += reefAmp * (fbm(x * 0.031, y * 0.031, S0 + 1277, 2) - 0.5) * 2
        * sm((-6 - e0) / 14);
    }
    const e = h0 / slope;
    out[0] = h0;
    out[1] = nrm(fbm(x * 0.0092, y * 0.0092, S0 + 431, 2));
    out[2] = nrm(fbm(x * 0.043, y * 0.043, S0 + 787, 2));
    const g1 = sm((e - E_BERM) / riseLen);
    const g2 = sm((e - E_BERM - riseLen * 0.55) / (riseLen * 1.1));
    out[3] = h0
      + riseAmp * g1
      + duneAmp * (fbm(x * duneF, y * duneF, S0 + 211, 2) - 0.5) * 2 * g1
      + farAmp * (fbm(x * 0.0068, y * 0.0068, S0 + 337, 2) - 0.5) * 2 * g2
      + skerry(x, y, h0);
  });

  // A FINE FIELD, ON ITS OWN GRID.
  //
  // The four-channel field above is sampled at the terrain cell, about three
  // world units, so nothing on it resolves below about thirty screen pixels —
  // which is why the first ground stage measured flat5x5 at 0.55-0.62 against
  // the city's 0.18. That is the sparse-generator failure `docs/BAR.md` names:
  // faces too big, not detail too small. This one is sampled at 1.5 units and
  // carries a single octave at a seven-unit wavelength, so it resolves to about
  // fifteen screen pixels and can cut ripple sets, scour patches and vegetation
  // clumps at the scale a 5x5 window actually reads.
  const FF = makeField1(X0, Y0, X1, Y1, 1.5,
    (x, y) => nrm(vnoise(x * 0.138, y * 0.138, S0 + 911)));

  const T = makeTerrain({
    X0, Y0, X1, Y1, cell, step, seaH: 0,
    height: (x, y) => MF.one(x, y, 3),
  });
  stage.terrain = T;

  // ------------------------------------------------------- the region palettes
  //
  // A STRETCH OF SHORE COMMITS TO ITS OWN COLOUR, exactly as a city block does.
  // The partition is the alongshore coordinate, warped by the swell field so
  // the boundary between two bays is a curve rather than a ruled line, and it
  // wraps through a table of twelve — two regions that share a palette are
  // seven hundred world units apart and never in one frame.
  const ts = rng.stream('shoretone');
  const NR = 12;
  const REGL = cs.range(58, 92);
  const REGW = cs.range(22, 40);

  // THE GROUND FAMILIES ARE THE SHORE'S OWN DECISION, NOT THE CITY PALETTE'S.
  //
  // Taking `C.sandy` straight gave one seed a pink beach and another a grey
  // one: `sandy` is a saturated family, so it takes the scene's full accent
  // drift of +/-27 degrees, and the region jitter is applied on top of that. A
  // colour must MEAN something and the reference's own example of it is "sand
  // is a beach". So the scene draws its sand inside a hue band that is still
  // sand, and every other ground material is derived FROM the sand rather than
  // from an unrelated family — wet sand is the same pigment wet, the berm is
  // the same pigment coarsened, machair is the same pigment with turf over it.
  // That is also what stops the ground reading as five unrelated swatches.
  const sandH = ts.range(31, 48);
  const sandS = ts.range(0.26, 0.46);
  const sandL = ts.range(0.74, 0.88);
  const seaH0 = ts.range(182, 214);
  const seaS0 = ts.range(0.44, 0.80);
  const seaL0 = ts.range(0.33, 0.48);
  const B = {
    sand: C.mk(sandH, sandS, sandL),
    wet: C.mk(sandH - ts.range(0, 7), Math.min(0.44, sandS * ts.range(0.94, 1.18)),
      sandL * ts.range(0.68, 0.82)),
    berm: C.mk(sandH + ts.range(-14, 6), sandS * ts.range(0.35, 0.72), sandL * ts.range(0.80, 0.96)),
    turf: C.mk(ts.range(62, 102), ts.range(0.15, 0.33), ts.range(0.36, 0.52)),
    rock: C.mk(ts.range(24, 216), ts.range(0.06, 0.20), ts.range(0.34, 0.52)),
    // Foam is not white and it is certainly not grey. It is the sea with the
    // air beaten into it, so it is minted off the SEA's hue at the top of the
    // lightness range — a pale green-white. Minted off `C.white` its shaded
    // step came out a mid neutral grey and put concrete-coloured blooms all
    // over the water.
    foam: C.mk(seaH0 - ts.range(4, 26), seaS0 * ts.range(0.22, 0.46), ts.range(0.90, 0.96)),
    wrack: C.mk(ts.range(46, 92), ts.range(0.28, 0.52), ts.range(0.20, 0.32)),
    // Heath: the browner, woodier half of a machair mosaic. A real second
    // material rather than a fourth value of the turf, because the foreground
    // green was the last 11,000-pixel flat field in the frame and a value step
    // alone does not break a field that size.
    heath: C.mk(ts.range(28, 62), ts.range(0.20, 0.40), ts.range(0.24, 0.38)),
    shell: C.mk(sandH + ts.range(2, 16), sandS * ts.range(0.20, 0.45), Math.min(0.95, sandL * 1.10)),
  };

  // EACH REGION COMMITS TO ITS OWN HUE, AND THE PATCHES INSIDE IT VARY BY
  // VALUE. That split is the whole difference between local colour and
  // camouflage. The first version gave every patch its own hue wobble off one
  // shared base, so a single stretch of machair carried a dozen greens twelve
  // degrees apart at a fifteen-pixel scale and read as disruptive pattern. A
  // bay now differs from the next bay by hue; within one bay, sand is one sand
  // at several values.
  const REG = [];
  for (let i = 0; i < NR; i++) {
    const dh = ts.range(-11, 11), dt = ts.range(-16, 16);
    const dsat = ts.range(0.80, 1.24), dl = ts.range(0.92, 1.08);
    const RB = {};
    for (const k of Object.keys(B)) {
      const f = B[k];
      const warm = k === 'turf' || k === 'wrack' ? dt : dh;
      RB[k] = C.mk(f._h + warm, f._s * dsat, clampL(f._L * dl));
    }
    REG.push(mintRegion(C, ts, RB));
  }

  // The sea's HUE is minted once for the whole water body rather than per
  // region: one bay is not a different ocean, and a hue break running out to
  // the horizon would read as a seam. What varies per region is the value
  // ladder and the swell tones, which is what a stretch of water actually does.
  for (const R of REG) mintSea(C, ts, R, seaH0, seaS0, seaL0);

  // ------------------------------------------------------------ the footpaths
  //
  // WORN TRACKS THROUGH THE DUNES, CUT INTO THE GROUND ITSELF RATHER THAN LAID
  // ON IT. The machair behind the beach was the largest unarticulated field in
  // the frame — a flat olive staircase — and the honest thing that articulates
  // it is the reason anyone crosses it: everybody walking from the back of the
  // dunes to the sand wears the same few lines through the marram. They are
  // drawn as a distance field the ground shader reads, so the path is part of
  // the terrain — no seam, no z-fighting where it crosses a terrace, and its
  // edge is a curve at every angle.
  const pth = rng.stream('paths');
  const paths = [];
  for (let k = 0; k < pth.int(5, 9); k++) {
    let px = Ox + cxu * pth.range(-280, 280);
    let py = Oy + cyu * pth.range(-280, 280);
    // start well back, then walk to the top of the beach
    let dxp = -nx, dyp = -ny;
    for (let g = 0; g < 200; g++) {
      const e = (F0(px - Ox, py - Oy)) / slope;
      if (e > E_DUNE + pth.range(40, 110)) break;
      px += nx * 3.0; py += ny * 3.0;
      if (px < X0 + 4 || px > X1 - 4 || py < Y0 + 4 || py > Y1 - 4) break;
    }
    const line = [[px, py]];
    for (let g = 0; g < 160; g++) {
      const w = pth.range(-0.22, 0.22);
      const c = 1 - w * w / 2, sn = w - w * w * w / 6;
      const ndx = dxp * c - dyp * sn, ndy = dxp * sn + dyp * c;
      const nn = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
      dxp = ndx / nn; dyp = ndy / nn;
      px += dxp * 3.6; py += dyp * 3.6;
      if (px < X0 + 3 || px > X1 - 3 || py < Y0 + 3 || py > Y1 - 3) break;
      line.push([px, py]);
      if ((F0(px - Ox, py - Oy)) / slope < E_BERM - 3) break;
    }
    if (line.length > 3) paths.push(line);
  }
  const PATH = makeDistField(X0, Y0, X1, Y1, 2.0, paths, 26);
  const pathW = cs.range(1.5, 2.4);

  // ------------------------------------------------------------- the ground
  const buf = [0, 0, 0, 0];
  const regionAt = (u, v, swell) => {
    const a = u * cxu + v * cyu + (swell - 0.5) * REGW;
    const r = Math.floor(a / REGL) % NR;
    return REG[r < 0 ? r + NR : r];
  };
  const LVN = 5;
  const lvIdx = (z) => {
    const k = Math.round(z / step) % LVN;
    return k < 0 ? k + LVN : k;
  };

  // Foam is a field, not a stripe. `fw` is how much white water a pixel has:
  // it comes from the swash (everything within a couple of units of the sand)
  // and from the breaker (wherever the seabed has gone flat under the bar), and
  // it is cut against the mid-frequency grain so its edge is torn.
  // The breaker gate is a FRACTION OF THE SHOREWARD RAMP, not an absolute: the
  // first version compared |grad| against a constant near the ramp's own value,
  // so the fine octaves of the coast field pushed it under the threshold all
  // over the open sea and bloomed foam across the whole water body. It also
  // only applies in the shoal — a flat patch of seabed at forty metres does not
  // break a wave.
  const SURF = slope * cs.range(0.34, 0.52);
  const foamAt = (e, g0, grain) => {
    let f = 0;
    if (e > -5.5) f = sm((e + 5.5) / 4.5);
    if (e < -6 && e > -27 && g0 < SURF) {
      const b = sm((SURF - g0) / (SURF * 0.7)) * 0.92;
      if (b > f) f = b;
    }
    return f - 0.36 + grain * 0.72;
  };

  const groundTop = (u, v, z) => {
    MF.at(u, v, buf);
    const h0 = buf[0], swell = buf[1], grain = buf[2];
    const fine = FF(u, v);
    const e = h0 / slope;
    const R = regionAt(u, v, swell);
    const li = lvIdx(z);
    // TWO FIELDS AT TWO SCALES DECIDE THE PATCH, not one. The grain alone gave
    // five tones per material per region and the ground came out at 180-286
    // distinct colours in a frame against the city's 673-1223. Crossing it with
    // the swell channel makes the patch a coarse region (about 110 units, the
    // scale of one cove's worth of sand) subdivided into finer ones (about 23),
    // which is twelve committed tones per level instead of five and — more to
    // the point — cuts the largest single flat field roughly in half.
    const p = idxN(grain, 4) + 4 * idxN(swell, 3);

    // A SKERRY: dry ground the sea is on all sides of. It cannot be sand.
    if (e < -3.0) {
      const F = R.rock[li % R.rock.length][p];
      // a wet collar at the tide line, in the rock's own contour step
      return h0 > -0.55 ? F.k : (grain > 0.62 ? F.l : F.t);
    }

    // ---- wet sand: the last tide's ground.
    //
    // A RIPPLE SET, PER PATCH, NEVER PER PIXEL. Which patch a pixel is in comes
    // off the grain field, so the patch boundaries are level sets — curves at
    // every angle — and each patch carries its own pitch and phase, so the sets
    // break against each other the way ripples reorganise across a beach. One
    // ripple field over the whole frame would be a lattice with a ten-pixel
    // period, and 2D autocorrelation is the measurement that names
    // "machine-made at a glance".
    if (e < E_WET) {
      const F = R.wet[li][p];
      if (e < 1.4 && grain > 0.48) return R.foam[p % 5].t;
      const rp = h3(p, 3, S0 + 61);
      const pitch = 1.7 + (rp & 7) * 0.26;
      const t = tri(e / pitch + ((rp >>> 8) & 255) / 256 + fine * 0.85);
      // and the runnels: a longer wave the ripple sets sit inside
      const run = tri(e * 0.077 + swell * 2.4);
      const G = run < 0.22 ? R.wet[li][(p + 6) % 12] : F;
      return t < 0.18 ? G.r : t < 0.56 ? G.l : G.t;
    }

    // ---- the dry beach. Large contoured patches of the region's own sand,
    // cut by the grain field, with wind ripples on some of them, scour tails
    // and a shell drift. Never a per-pixel speckle.
    if (e < E_DRY) {
      const F = R.dry[li][p];
      if (grain > 0.775) return R.shell[p % 5].t;
      const rp = h3(p, 7, S0 + 61);
      if ((rp & 3) !== 0) {
        // a wind ripple set: a longer pitch than the swash's, and only on some
        // patches, so the beach is part combed and part smooth sheet
        const pitch = 3.1 + (rp & 7) * 0.42;
        const t = tri(e / pitch + ((rp >>> 9) & 255) / 256 + fine * 1.15 + swell * 1.4);
        if (t < 0.16) return F.r;
        if (t < 0.52) return F.l;
      }
      if (fine > 0.70) return R.dry[li][(p + 5) % 12].l;
      if (fine < 0.26) return R.scrape[p % 5].l;
      return grain > 0.52 ? F.l : F.t;
    }

    // ---- the storm berm. Shingle, and the WRACK LINE: a ribbon of stranded
    // weed on the 0.5 contour of the grain field, which threads the berm at
    // every angle and is the biome's largest off-lattice ground form.
    if (e < E_BERM) {
      const w = grain - 0.5;
      if (w > -0.075 && w < 0.075 && swell > 0.24) {
        const G = R.wrack[p % 5];
        return (w > -0.028 && w < 0.028) ? G.k : G.t;
      }
      // shingle: three values at the fine field's scale, so the berm reads as
      // graded stone rather than as a flat band
      const F = R.berm[li][p];
      if (fine > 0.68) return R.berm[li][(p + 7) % 12].t;
      if (fine < 0.30) return F.r;
      return grain > 0.50 ? F.l : F.t;
    }

    // A path is bare sand with a scuffed lip, and it takes precedence over the
    // vegetation it has worn away.
    if (e > E_BERM - 5) {
      const pd = PATH(u, v);
      if (pd < pathW) return R.scrape[p % 5].t;
      if (pd < pathW + 0.8) return R.scrape[p % 5].r;
      if (pd < pathW + 2.2) return R.dry[li][p].l;
    }

    // ---- the dune face. Marram cover thickens landward; the ground under it
    // is still sand, so the two materials interleave as patches rather than
    // meeting at a line.
    if (e < E_DUNE) {
      // COVER CLUMPS AT TWO SCALES. Marram does not advance as a front; it
      // takes a dune in patches, and the patches have patches. One threshold on
      // one field gave a smooth boundary with a hundred-pixel radius, which is
      // most of why this band measured as the weakest in the frame.
      const cover = sm((e - E_BERM) / (E_DUNE - E_BERM)) * 0.66
        + grain * 0.42 + fine * 0.34 - 0.21;
      const F = cover > 0.5 ? R.marram[li][p] : R.dry[li][p];
      if (cover > 0.46 && cover < 0.54) return R.marram[li][p].k;
      return fine > 0.52 ? F.l : F.t;
    }

    // ---- firm ground. Turf, with the sand blowing through it at the seaward
    // edge and bare scrapes where the ground is high.
    // A MACHAIR IS A MOSAIC, NOT A LAWN: turf, heath and blown sand in patches,
    // at the coarse field's scale and the fine one's together.
    if (grain > 0.72 && swell < 0.46) return R.scrape[p % 5].t;
    const H = R.heath[li % 3][p];
    if (fine > 0.78) return H.t;
    if (fine > 0.62) return H.l;
    const F = R.firm[li][p];
    if (fine < 0.24) return F.r;
    return grain > 0.48 ? F.l : F.t;
  };

  // FEW BANDS, WIDE, AND THEN BROKEN BY CRAFT.
  //
  // The first version cut the sea into a triangle-wave ladder on the exposure
  // field and it came out as a topographic map: roughly a hundred thin contour
  // bands, each with an inked edge, and a moiré across the whole water body.
  // That is not what "flat-banded water" protects. A band boundary that runs
  // edge to edge is the long-horizontal-run failure, and a hundred parallel
  // strokes that bound no cell is exactly what the ink-closure ratio punishes.
  //
  // So: FOUR depth zones read off the bathymetry — the deep, the drop-off
  // outside the bar, the bar and its trough, the swash — and inside a zone ONE
  // swell set, a crest and a trough line about a fifth of a long period wide.
  // Everything else that breaks the water is an OBJECT: foam at the surf,
  // buoys, moored craft, weed rafts, the skerries, and the pier's piles with
  // their reflections. Fewer bands plus more objects answers both constraints;
  // more bands answers neither.
  //
  // AND IT IS THE ONE FACE IN THIS GENERATOR THAT MOVES.
  //
  // `waterTop` is a pure function of (world position, FRAME INDEX). It shades
  // frame `stage.frame` and, on the same call, emits ALL K frames' palette
  // indices to `stage.anim` — see `src/core/anim.js` for why that is a few per
  // cent of a render rather than seven hundred. Everything expensive here (four
  // field lookups, the region resolution, the bathymetry, the fine field) is
  // the same for every frame and is computed ONCE, above `tone`; only the two
  // phase scalars differ per frame, and each costs a triangle wave and a
  // compare.
  //
  // `vals` is hoisted out of the shader and reused. A `new Uint16Array(K)` per
  // pixel would be 200,000 allocations a frame.
  const K = stage.frames;
  const FR = stage.frame;
  const vals = new Uint16Array(K);

  const waterTop = (u, v, z, q, sx, sy) => {
    MF.at(u, v, buf);
    const h0 = buf[0], swell = buf[1], grain = buf[2];
    const e = h0 / slope;
    const R = regionAt(u, v, swell);
    const g0 = MF.grad(u, v);
    const gi = idxN(grain, 5);

    // THE SEABED IS COMPUTED FROM THE UNSHIFTED EXPOSURE AND NEVER MOVES.
    // The depth zone and the contour ladder below it are the SEA FLOOR. A sea
    // floor that breathes is wrong at a level no amount of subtlety rescues,
    // and it is also the largest area in the picture — moving it would be the
    // scrolling gradient this design exists to refuse.
    const zi = e > -6 ? 3 : e > -21 ? 2 : e > -48 ? 1 : 0;
    const F = R.sea[zi][idxN(grain, 4) + 4 * idxN(swell, 2)];

    // SEABED CONTOURS, AND WHY THEY ARE NOT THE MOIRE AGAIN.
    //
    // Four depth zones fixed the topographic-map look and left the sea as four
    // very large flat fields — 22,454px on the worst seed, which was carrying
    // both of the two remaining failing numbers on its own. The answer is not
    // more bands across the shore; it is CONTOURS OF A ROUGH SEABED. The reef
    // term swings the exposure field by about twelve units over a thirty-unit
    // wavelength, so a ladder at six units of exposure comes out as irregular
    // closed shapes — banks and holes — rather than as parallel stripes, and
    // where the bed happens to be smooth the ladder simply widens out.
    //
    // Two values of ONE family, never a second pigment: the version that
    // reached for a different family here turned the sea into leopard print.
    // The fine field shifts the ladder index by one, which puts a fifteen-pixel
    // wobble on every contour and flips the occasional patch — the ruffle a
    // breeze puts on water, drawn as light and shade rather than as hue.
    const fine = FF(u, v);
    const si = Math.floor(e / R.subW) + (fine > 0.74 ? 1 : fine < 0.20 ? -1 : 0);
    const base = (si & 1) ? F.l : F.t;

    // The swell runs on the LINEAR cross-shore ordinate, not on the exposure
    // field: the exposure field carries the bar, and over the bar's outer face
    // it changes by thirty units in sixteen, which bunched the crests into the
    // moiré. Warped by the low-frequency swell channel so no crest stays
    // straight, and gated on the grain so each one is an arc rather than a line
    // from one edge of the frame to the other.
    const d = (u - Ox) * nx + (v - Oy) * ny;

    /**
     * One frame's answer, from the two quantities that move.
     *
     * `dE` shifts the foam band along the cross-shore ordinate, in world units.
     * `ph` shifts the swell crest, in units of the swell PERIOD. Both are zero
     * at frame 0 by construction, so frame 0 is byte-identical to the still
     * render and every craft number ever measured on this biome still stands.
     */
    const tone = (dE, ph) => {
      const fw = foamAt(e + dE, g0, grain);
      if (fw > 0.60) return R.foam[gi].t;
      if (fw > 0.44) return R.foam[gi].l;
      const t = tri(d / R.pitch + swell * 1.25 + ph);
      if (grain > 0.30) {
        if (t > 0.87) return F.l;
        // The trough takes the RIGHT step, not the contour step. `.k` is the
        // line the light does not reach at all, and a hundred pixels of it
        // running across open water read as a drawn contour rather than as a
        // swell.
        if (t < 0.06) return F.r;
      }
      return base;
    };

    // WITH ONE FRAME THE ANIMATION PATH IS NOT ENTERED AT ALL. `AnimRec.push`
    // already returns on its first line, but K frames computed and thrown away
    // would still be K frames computed.
    if (K < 2) return tone(0, 0);
    for (let k = 0; k < K; k++) vals[k] = tone(0, 0);
    stage.anim.push(sy * cv.w + sx, cv.t, vals);
    return vals[FR];
  };

  const groundSide = (u, v, plane, axis) => {
    const x = axis === 1 ? plane : u, y = axis === 1 ? u : plane;
    const h0 = MF.one(x, y, 0);
    const e = h0 / slope;
    const R = regionAt(x, y, MF.one(x, y, 1));
    const F = e < -3 ? R.rock[0][2]
      : e < E_WET ? R.wet[0][2]
        : e < E_DRY ? R.dry[0][2]
          : e < E_BERM ? R.berm[0][2]
            : e < E_DUNE ? R.marram[0][2] : R.firm[0][2];
    // A contact shadow at the foot of every riser, in the material's OWN dark.
    // A terrace wall here is four or five screen pixels, so this is the whole
    // of the modelling it can carry, and it closes the band below it.
    if (v < 0.55) return F.k;
    return axis === 1 ? F.d : F.r;
  };

  const tags = new Map();
  const tagFor = (L, wet) => {
    const k = (wet ? 'w' : 'l') + L;
    let t = tags.get(k);
    if (!t) { t = tag(); tags.set(k, t); }
    return t;
  };
  drawTerrain(cv, iso, T, { top: groundTop, side: groundSide, water: waterTop },
    { tagFor, ink: C.black });
  healSeams(cv);

  // Everything below reads the field rather than re-deriving it.
  const eAt = (x, y) => MF.one(x, y, 0) / slope;
  const SH = {
    MF, T, cxu, cyu, nx, ny, slope, Ox, Oy, REG, REGL, REGW, NR,
    E_WET, E_DRY, E_BERM, E_DUNE, step, cell, eAt,
    regionAt: (x, y) => regionAt(x, y, MF.one(x, y, 1)),
  };
  stage.shore = SH;

  // ---------------------------------------------------------------- the hero
  const PIER = pier(stage, SH);
  SH.pier = PIER;

  // ------------------------------------------------------- the organising line
  SH.prom = promenade(stage, SH, PIER);

  // ------------------------------------------------------- the ambient scatter
  scatter(stage, SH, PIER, SH.prom);
}

// ---------------------------------------------------------------------------
// THE AMBIENT SCATTER.
//
// Frostwind's rules, applied literally:
//
//   B. REJECTION IS DISCARD, NEVER RESAMPLE. A cell that fails admission
//      yields nothing. There is no relocation and no quota.
//   C. SPACING IS ENFORCED BY GEOMETRY. One candidate per jittered lattice
//      cell at `cell*g + hash*cell*jit + cell*(1-jit)/2`, so the axis
//      separation between neighbours is at least `cell*(1-jit)`. To make a
//      layer sparser, ENLARGE THE CELL — never lower an acceptance probability,
//      because thinning by rejection keeps the survivors' spacing and just
//      punches holes in it.
//   D. EVERY PER-OBJECT ATTRIBUTE IS ITS OWN COORDINATE HASH AT ITS OWN SALT,
//      so nothing depends on iteration order or on how many candidates were
//      culled before it, and a layer can be added without re-rolling the frame.
//   F. THE FIGURE IS AUTHORED FIRST AND THE MATRIX READS IT. The pier and the
//      promenade are already down; every layer below reads their distance
//      fields, so the beach crowds under the pier and empties away from it and
//      nothing is ever placed inside them.
//
// And the admission is the biome's own axis, not slope and not height: what
// stands on a piece of ground here is decided by how much sea has been over it.
// ---------------------------------------------------------------------------

/**
 * A TOWEL, AND WHY IT IS NOT `props/shore.js`'s.
 *
 * That one computes `u = F.au*sx + F.bu*sy + F.cu - x` from a `topFace(iso, z,
 * x, y)`, but `topFace` already carries the origin: its `cu` ends in `- x0`.
 * So the origin is subtracted twice and `u` comes out at about `-x`, which
 * fails the rim test at every pixel — every towel it draws is a SOLID BLACK
 * RECTANGLE about six units across. Verified by evaluating both inverses at a
 * known world point: `groundInv` gives (101, 91), `topFace` gives (1, 1) and
 * the prop's expression gives (-99, -89). It is not my file to fix, so this is
 * the work-around, and it takes the chance to be better than the original: the
 * towel is laid at an ARBITRARY angle rather than on an axis, which is a flat
 * field whose four edges are all off the 2:1 lattice.
 */
function beachTowel(cv, iso, C, st, x, y, z) {
  const a = st.pick(C.accents);
  const b = st.bool(0.45) ? C.white : st.pick(C.accents);
  const w = st.range(4.8, 6.4), d = st.range(2.8, 3.6);
  let ux = st.range(-1, 1), uy = st.range(-1, 1);
  const n = Math.sqrt(ux * ux + uy * uy) || 1;
  ux /= n; uy /= n;
  const vx = -uy, vy = ux;
  const hw = w * 0.5, hd = d * 0.5;
  const pts = [
    [x - ux * hw - vx * hd, y - uy * hw - vy * hd],
    [x + ux * hw - vx * hd, y + uy * hw - vy * hd],
    [x + ux * hw + vx * hd, y + uy * hw + vy * hd],
    [x - ux * hw + vx * hd, y - uy * hw + vy * hd],
  ];
  const G = groundInv(iso, z);
  const pitch = st.range(0.85, 1.6);
  P.polyTop(cv, iso, pts, z, (sx, sy) => {
    const wx = G.ax * sx + G.bx * sy + G.cx - x;
    const wy = G.ay * sx + G.by * sy + G.cy - y;
    const u = wx * ux + wy * uy, v = wx * vx + wy * vy;
    const e = 0.55 * G.q;
    if (u < -hw + e || u > hw - e || v < -hd + e || v > hd - e) return C.black;
    return (Math.floor((v + hd) / pitch) & 1) ? a.l : b.t;
  }, cv.t);
}

function scatter(stage, SH, PIER, PROM) {
  const { C, cv, iso, rng, X0, X1, Y0, Y1, seedN, tag, tagRaw, vis } = stage;
  const { T, eAt, MF, E_WET, E_DRY, E_BERM, E_DUNE, nx, ny, cxu, cyu } = SH;
  const S0 = seedN | 0;
  const ss = rng.stream('strand');
  const ws = rng.stream('craft');
  const ds = rng.stream('dune');
  const fs = rng.stream('beachfolk');
  const CB = localC(C, ss, 6, 2);
  const CW = localC(C, ws, 5, 2);
  // A BEACH IS NOT A BAG OF SWEETS. Per-instance colour is legitimate on a
  // towel, a parasol or a jacket — `docs/BAR.md` names individually-owned
  // mobile things as exactly the case where it is correct — but the reference
  // spends its saturation sparingly against a mostly-neutral frame, and six
  // accents all at full chroma put pink, cyan and red next to each other on
  // every square metre of sand. Half the list is knocked back, so the bright
  // ones still read as bright.
  for (let i = 0; i < CB.accents.length; i++) {
    if (!ss.bool(0.5)) continue;
    const a = CB.accents[i];
    CB.accents[i] = C.mk(a._h + ss.range(-10, 10), a._s * ss.range(0.24, 0.50),
      Math.min(0.95, a._L * ss.range(0.94, 1.24)));
  }

  const u8 = (h, k) => ((h >>> k) & 255) / 256;
  const lattice = (cell, jit, salt, fn) => {
    const i0 = Math.floor(X0 / cell), i1 = Math.ceil(X1 / cell);
    const j0 = Math.floor(Y0 / cell), j1 = Math.ceil(Y1 / cell);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h = h3(i, j, S0 ^ salt);
        const x = (i + (1 - jit) * 0.5 + u8(h, 0) * jit) * cell;
        const y = (j + (1 - jit) * 0.5 + u8(h, 8) * jit) * cell;
        if (x < X0 + 1 || x > X1 - 1 || y < Y0 + 1 || y > Y1 - 1) continue;
        fn(x, y, h3(i, j, S0 ^ (salt + 0x5bd1)), i, j);
      }
    }
  };
  const clear = (x, y, rPier, rProm) =>
    PIER.dist(x, y) > rPier && PROM.dist(x, y) > rProm;

  // ---- 1. THE DUNE. Marram in clumps, and the sand it has not taken yet.
  //
  // The cover field is the shader's own, so the tufts stand where the ground is
  // already drawn as vegetated and the two layers agree instead of arguing.
  lattice(3.9, 0.86, 0x11a3, (x, y, h) => {
    const e = eAt(x, y);
    if (e < E_BERM - 3 || e > E_DUNE + 46) return;
    if (T.isWet(x, y)) return;
    if (!clear(x, y, 7, 6)) return;
    if (!vis(x - 3, y - 3, x + 3, y + 3, 10)) return;
    const grain = MF.one(x, y, 2);
    const cover = sm((e - E_BERM) / (E_DUNE - E_BERM)) * 0.66 + grain * 0.42 - 0.06;
    if (u8(h, 0) > cover) return;
    const z = T.surfaceZ(x, y);
    const k = u8(h, 8);
    cv.t = tagRaw();
    if (k < 0.80) P.marram(cv, iso, C, ds, x, y, z);
    else if (k < 0.92) P.weedPile(cv, iso, C, ds, x, y, z, false);
    else P.rock(cv, iso, C, ds, x, y, z, false);
  });

  // ---- 2. THE MACHAIR BEHIND IT. Scrub, stone and the odd post: sparser, and
  // sparser by a BIGGER CELL rather than by a lower acceptance.
  lattice(5.2, 0.9, 0x2c07, (x, y, h) => {
    const e = eAt(x, y);
    if (e < E_DUNE + 4) return;
    if (T.isWet(x, y)) return;
    if (!clear(x, y, 9, 8)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 14)) return;
    // SCRUB GROWS IN STANDS, AND A STAND IS A CLEARING SEEN FROM THE OTHER
    // SIDE. Evenly-spaced gorse over four hundred units read as pebbledash on
    // the first build: the same object, the same size, the same gap, over the
    // whole back of the frame. The cover comes off the two smooth fields, so
    // the machair carries thickets and open grazing, and the SPECIES follows
    // the same field — one stand is one plant.
    const sw = MF.one(x, y, 1), gr = MF.one(x, y, 2);
    const dens = 0.34 + sw * 0.42 + gr * 0.36;
    if (u8(h, 0) > dens) return;
    const z = T.surfaceZ(x, y);
    const k = u8(h, 16) * 0.55 + sw * 0.45;
    cv.t = tagRaw();
    if (k < 0.46) P.marram(cv, iso, C, ds, x, y, z);
    else if (k < 0.82) P.weedPile(cv, iso, C, ds, x, y, z, u8(h, 24) < 0.35);
    else if (k < 0.95) P.rock(cv, iso, C, ds, x, y, z, u8(h, 24) < 0.22);
    else { cv.t = tag(); P.shorePost(cv, iso, CB, ds, x, y, z, (h >>> 3) % 3); }
  });

  // ---- 2b. A FEW BIG THINGS BEHIND THE DUNES, so the machair carries more
  // than one object size. `docs/BAR.md` names "one scale for everything" as a
  // tell in its own right: vehicles 24px, people 11px, props 5px and nothing
  // between or beyond.
  lattice(54.0, 0.82, 0x2f8b, (x, y, h) => {
    const e = eAt(x, y);
    if (e < E_DUNE + 14) return;
    if (T.isWet(x, y)) return;
    if (!clear(x, y, 20, 15)) return;
    if (!vis(x - 6, y - 6, x + 10, y + 10, 22)) return;
    const z = T.surfaceZ(x, y);
    const k = u8(h, 16);
    if (k < 0.34) {
      cv.t = tag();
      P.beachHut(cv, iso, C, ds, x, y, z, (h >>> 7) & 1, CB.wallTone(ds));
    } else if (k < 0.52) {
      cv.t = tag();
      P.lifeguardTower(cv, iso, CB, ds, x, y, z);
    } else if (k < 0.74) {
      // a stone outcrop: three or four boulders that read as one form
      for (let i = 0; i < 4; i++) {
        cv.t = tagRaw();
        P.rock(cv, iso, C, ds, x + ds.range(-3.5, 3.5), y + ds.range(-3.5, 3.5),
          T.surfaceZ(x, y), i < 2);
      }
    } else {
      cv.t = tag();
      S.kiosk(cv, iso, CB, ds, x, y, z, ds.range(5, 8), ds.range(4, 7), coinWord(ds));
    }
  });

  // ---- 3. SAND FENCES. Chestnut paling laid along the contour to catch
  // blowing sand — the one built thing that belongs on a dune, and a line of
  // closed cells across the largest quiet field in the frame.
  for (let f = 0; f < ds.int(3, 6); f++) {
    const e0 = E_BERM + ds.range(4, 1) + ds.range(0, E_DUNE - E_BERM);
    const [sx0, sy0] = [PROM.pts[ds.int(2, PROM.pts.length - 3)][0],
      PROM.pts[ds.int(2, PROM.pts.length - 3)][1]];
    let x = sx0, y = sy0;
    for (let k = 0; k < 40; k++) {
      const err = e0 - eAt(x, y);
      x += SH.nx * Math.max(-1.4, Math.min(1.4, err * 0.5));
      y += SH.ny * Math.max(-1.4, Math.min(1.4, err * 0.5));
      if (Math.abs(eAt(x, y) - e0) < 1.5) break;
    }
    const dir = ds.bool(0.5) ? 1 : -1;
    const hgt = ds.range(1.5, 2.4);
    const tim = ds.pick([C.wood, C.taupe, C.stone]);
    let prev = null;
    for (let k = 0; k < ds.int(9, 22); k++) {
      const err = e0 - eAt(x, y);
      x += cxu * 3.4 * dir + nx * Math.max(-1.2, Math.min(1.2, err * 0.4));
      y += cyu * 3.4 * dir + ny * Math.max(-1.2, Math.min(1.2, err * 0.4));
      if (x < X0 + 2 || x > X1 - 2 || y < Y0 + 2 || y > Y1 - 2) break;
      if (T.isWet(x, y) || !clear(x, y, 9, 7)) { prev = null; continue; }
      if (!vis(x - 3, y - 3, x + 3, y + 3, 6)) { prev = null; continue; }
      const z = T.surfaceZ(x, y);
      cv.t = tag();
      box(cv, iso, x - 0.25, y - 0.25, z - 0.4, 0.5, 0.5, hgt + 0.5, MD(tim));
      if (prev && Math.abs(prev[2] - z) < 0.9) {
        const F = wallInv(iso, prev[0], prev[1], x, y, z);
        P.wallQuad(cv, iso, prev[0], prev[1], x, y, z - 0.3, z + hgt, (sx, sy) => {
          const u = F.au * sx + F.bu * sy + F.cu;
          const v = F.av * sx + F.bv * sy + F.cv;
          if (v > hgt - 0.28) return tim.k;
          const g = u / 0.55;
          return (g - Math.floor(g) < 0.42) ? tim.l : tim.r;
        }, cv.t);
      }
      prev = [x, y, z];
    }
  }

  // ---- 4. THE STORM BERM. Everything the last big sea threw up and left.
  lattice(6.4, 0.88, 0x3d55, (x, y, h) => {
    const e = eAt(x, y);
    if (e < E_DRY - 2 || e > E_BERM + 4) return;
    if (T.isWet(x, y)) return;
    if (!clear(x, y, 6, 5)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 8)) return;
    const z = T.surfaceZ(x, y);
    const k = u8(h, 0);
    cv.t = tagRaw();
    if (k < 0.34) P.weedPile(cv, iso, C, ss, x, y, z, u8(h, 8) < 0.3);
    else if (k < 0.62) P.driftwood(cv, iso, C, ss, x, y, z);
    else if (k < 0.86) P.rock(cv, iso, C, ss, x, y, z, u8(h, 8) < 0.25);
    else P.gull(cv, iso, C, ss, x, y, z, false);
  });

  // ---- 5. THE DRY BEACH. The KIND is a readout of the hero's distance field:
  // towels, chairs and windbreaks gather where the pier and the promenade are,
  // and a mile down the sand there is driftwood, weed and a gull.
  lattice(7.2, 0.9, 0x4e91, (x, y, h) => {
    const e = eAt(x, y);
    if (e < E_WET - 1 || e > E_DRY + 3) return;
    if (T.isWet(x, y)) return;
    if (!clear(x, y, 5.5, 5)) return;
    if (!vis(x - 5, y - 5, x + 6, y + 6, 12)) return;
    const z = T.surfaceZ(x, y);
    const near = Math.min(PIER.dist(x, y), PROM.dist(x, y) + 14);
    const busy = 1 - sm((near - 22) / 95);
    const k = u8(h, 16);
    const ax = (h >>> 5) & 1;
    if (k < 0.26 * busy + 0.02) { cv.t = tag(); beachTowel(cv, iso, CB, ss, x, y, z + 0.05); return; }
    if (k < 0.46 * busy + 0.03) { cv.t = tag(); P.deckChair(cv, iso, CB, ss, x, y, z, ax); return; }
    if (k < 0.56 * busy + 0.04) {
      cv.t = tag(); P.windbreak(cv, iso, CB, ss, x, y, z, ss.range(6, 11), ax); return;
    }
    if (k < 0.585 * busy + 0.03) { cv.t = tag(); P.surfboard(cv, iso, CB, ss, x, y, z); return; }
    if (k < 0.62 * busy + 0.07) { cv.t = tag(); S.parasol(cv, iso, CB, ss, x, y, z); return; }
    if (k < 0.72) { cv.t = tagRaw(); P.driftwood(cv, iso, C, ss, x, y, z); return; }
    if (k < 0.84) { cv.t = tagRaw(); P.weedPile(cv, iso, C, ss, x, y, z, false); return; }
    if (k < 0.93) { cv.t = tagRaw(); P.gull(cv, iso, C, ss, x, y, z, false); return; }
    cv.t = tagRaw(); P.rock(cv, iso, C, ss, x, y, z, false);
  });

  // ---- 6. THE PEOPLE ON THE SAND, on their own lattice so the crowd's spacing
  // is its own and not the furniture's.
  lattice(9.5, 0.95, 0x5fa7, (x, y, h) => {
    const e = eAt(x, y);
    if (e < -3 || e > E_DRY + 2) return;
    if (!clear(x, y, 5, 4.5)) return;
    if (!vis(x - 3, y - 3, x + 3, y + 3, 12)) return;
    const near = Math.min(PIER.dist(x, y), PROM.dist(x, y) + 16);
    if (u8(h, 24) > 1 - sm((near - 18) / 110) * 0.62) return;
    const z = T.isWet(x, y) ? T.seaZ : T.surfaceZ(x, y);
    cv.t = tagRaw();
    drawPerson(cv, iso, CB, fs, x, y, z);
  });

  // ---- 7. THE WET SAND AND THE SWASH. Nothing built, ever: this ground was
  // under water six hours ago and the biome's own axis says so.
  lattice(8.0, 0.9, 0x60c3, (x, y, h) => {
    const e = eAt(x, y);
    if (e < -6 || e > E_WET) return;
    if (!clear(x, y, 5, 5)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 8)) return;
    const z = T.isWet(x, y) ? T.seaZ : T.surfaceZ(x, y);
    const k = u8(h, 0);
    cv.t = tagRaw();
    if (k < 0.40) P.gull(cv, iso, C, ss, x, y, z, false);
    else if (k < 0.68) P.weedPile(cv, iso, C, ss, x, y, z, u8(h, 8) < 0.3);
    else if (k < 0.86) P.rock(cv, iso, C, ss, x, y, z, false);
    else P.driftwood(cv, iso, C, ss, x, y, z);
  });

  // ---- 8. THE WATER. Craft, floats and weed rafts, each with the reflection
  // that is the only vertical a flat sea can carry.
  const seaR = SH.regionAt(PIER.rx - nx * 60, PIER.ry - ny * 60);
  const refl = seaR.sea[1][2].k;
  const G0 = groundInv(iso, 0.04);
  const wetOnly = (val) => (sx, sy) => {
    const wx = G0.ax * sx + G0.bx * sy + G0.cx;
    const wy = G0.ay * sx + G0.by * sy + G0.cy;
    return T.isWet(wx, wy) ? val : -1;
  };
  lattice(17.0, 0.92, 0x71d9, (x, y, h) => {
    if (!T.isWet(x, y)) return;
    const e = eAt(x, y);
    if (e > -4) return;
    if (!clear(x, y, 11, 12)) return;
    if (!vis(x - 8, y - 8, x + 10, y + 10, 18)) return;
    const k = u8(h, 16);
    const deep = e < -26;
    if (k < (deep ? 0.20 : 0.13)) {
      // a moored hull, and the streak of itself it puts on the water
      const kind = u8(h, 24) < 0.30 ? 2 : u8(h, 24) < 0.66 ? 1 : 0;
      const ax = (h >>> 7) & 1;
      cv.t = tagRaw();
      const rl = 3.0 + u8(h, 0) * 4.0;
      P.polyTop(cv, iso, [[x, y], [x + 4, y + 4],
        [x + 4 + rl, y + 4 + rl], [x + rl, y + rl]], 0.04, wetOnly(refl), cv.t);
      cv.t = tagRaw();
      P.boat(cv, iso, CW, ws, x, y, T.seaZ, ax, kind);
      return;
    }
    if (k < (deep ? 0.42 : 0.30)) { cv.t = tag(); P.buoy(cv, iso, CW, ws, x, y, T.seaZ); return; }
    if (k < 0.60) { cv.t = tagRaw(); P.weedPile(cv, iso, C, ws, x, y, T.seaZ, u8(h, 8) < 0.4); return; }
    if (k < 0.70 && !deep) { cv.t = tagRaw(); P.rock(cv, iso, C, ws, x, y, T.seaZ, u8(h, 8) < 0.3); return; }
    // A GULL ON THE WING IS EXPENSIVE AT THIS SCALE. Twenty-eight pixels of
    // white lying over flat water with nothing under it reads as debris, not as
    // a bird — measured by eye on the first scatter, where the sea came out
    // strewn with white boomerangs. A handful, high, and only over the shoal.
    if (k < 0.72 && !deep) {
      cv.t = tagRaw();
      P.gull(cv, iso, C, ws, x, y, T.seaZ + 9 + u8(h, 8) * 11, true);
    }
  });

  // ---- 8b. THE SMALL STUFF ON THE WATER, on its own denser lattice: floats,
  // weed rafts and the odd standing gull on a rock. The sea is the biggest
  // quiet surface in the frame and this is the layer that keeps it from being
  // one; a big cell would have put four objects in a hundred thousand pixels.
  lattice(10.5, 0.94, 0x7a3f, (x, y, h) => {
    if (!T.isWet(x, y)) return;
    const e = eAt(x, y);
    if (e > -5) return;
    if (!clear(x, y, 8, 10)) return;
    if (!vis(x - 5, y - 5, x + 6, y + 6, 10)) return;
    const k = u8(h, 0);
    if (k > 0.46) return;
    cv.t = tagRaw();
    if (k < 0.24) P.weedPile(cv, iso, C, ws, x, y, T.seaZ, u8(h, 8) < 0.3);
    else if (k < 0.36) P.rock(cv, iso, C, ws, x, y, T.seaZ, false);
    else P.driftwood(cv, iso, C, ws, x, y, T.seaZ);
  });

  // ---- 9. THE BEACH'S OWN FURNITURE, admitted on the berm and no lower.
  // A lifeguard stand and two or three flag poles: the verticals a beach reads
  // its own scale against.
  let placed = 0;
  lattice(46.0, 0.8, 0x82e5, (x, y, h) => {
    if (placed > 3) return;
    const e = eAt(x, y);
    if (e < E_DRY || e > E_BERM + 12) return;
    if (T.isWet(x, y)) return;
    if (!clear(x, y, 16, 12)) return;
    if (!vis(x - 6, y - 6, x + 8, y + 8, 24)) return;
    const z = T.surfaceZ(x, y);
    cv.t = tag();
    if (u8(h, 16) < 0.42) P.lifeguardTower(cv, iso, CB, ss, x, y, z);
    else P.flagPole(cv, iso, CB, ss, x, y, z, (h >>> 3) & 1);
    placed++;
  });

  // ---- 10. HULLS HAULED UP THE BEACH. Above the tide, below the huts.
  lattice(38.0, 0.85, 0x93f1, (x, y, h) => {
    const e = eAt(x, y);
    if (e < E_WET + 2 || e > E_BERM) return;
    if (T.isWet(x, y)) return;
    if (u8(h, 16) > 0.55) return;
    if (!clear(x, y, 13, 10)) return;
    if (!vis(x - 8, y - 8, x + 10, y + 10, 14)) return;
    cv.t = tagRaw();
    P.boat(cv, iso, CW, ws, x, y, T.surfaceZ(x, y), (h >>> 5) & 1,
      u8(h, 24) < 0.55 ? 0 : 1);
  });
}

// ---------------------------------------------------------------------------
// THE ORGANISING LINE.
//
// A city's line is a street grid, which is a decision. A desert's is a track,
// which is where the ground lets a lorry go. A COAST'S LINE IS THE COAST — the
// promenade, the sea wall, the row of huts and the groynes all run along one
// contour of the exposure field, because that is the only direction on a shore
// along which nothing changes. So the line is not walked by least cost here; it
// is a CONTOUR FOLLOWER, stepping alongshore and correcting back toward its
// target exposure, which means it bends into every bay and out around every
// headland and is off the 2:1 lattice at every point.
//
// And the groynes are its opposite: the one thing on a beach that runs straight
// down the exposure gradient, from the berm out into the surf. Between them
// they put a cross-hatch of real structure over the flattest surface in the
// biome, and every cell of it is closed.
// ---------------------------------------------------------------------------

function contourWalk(SH, x0, y0, targetE, sign, steps, len) {
  const pts = [];
  let x = x0, y = y0;
  for (let i = 0; i < steps; i++) {
    pts.push([x, y]);
    x += SH.cxu * len * sign; y += SH.cyu * len * sign;
    // The correction is proportional and clamped, so the line leans into a bay
    // over several steps rather than snapping across it. `eAt` is already in
    // world units of cross-shore distance, so the error IS the correction.
    let k = (targetE - SH.eAt(x, y)) * 0.5;
    const lim = len * 0.85;
    if (k > lim) k = lim; else if (k < -lim) k = -lim;
    x += SH.nx * k; y += SH.ny * k;
  }
  return pts;
}

function promenade(stage, SH, PIER) {
  const { C, cv, iso, rng, X0, X1, Y0, Y1, tag, tagRaw, vis } = stage;
  const { T, nx, ny, cxu, cyu, eAt, MF, slope, E_DRY, E_BERM } = SH;
  const st = rng.stream('prom');
  const fs = rng.stream('promfolk');
  const CB = localC(C, st, 4, 3);

  const ePro = eAt(PIER.rx, PIER.ry);
  const step = st.range(7.5, 10.5);
  const half = Math.ceil(340 / step);
  const back = contourWalk(SH, PIER.rx, PIER.ry, ePro, -1, half, step).reverse();
  const fwd = contourWalk(SH, PIER.rx, PIER.ry, ePro, 1, half, step);
  const pts = back.concat(fwd.slice(1));

  // vertex normals, so the strip is continuous through a bend
  const N = pts.length;
  const per = [];
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    let ex = b[0] - a[0], ey = b[1] - a[1];
    const L = Math.sqrt(ex * ex + ey * ey) || 1;
    ex /= L; ey /= L;
    per.push([-ey, ex]);
  }

  // The deck is level, and its height is the 0.82 quantile of the ground under
  // it rather than the maximum: one dune hummock anywhere along a six-hundred
  // unit line would otherwise lift the whole promenade onto a viaduct.
  const zs = pts.map((q) => T.surfaceZ(q[0], q[1])).sort((a, b) => a - b);
  const promZ = zs[Math.floor(zs.length * 0.82)] + st.range(0.5, 1.4);
  const wallH = st.range(2.6, 4.2);
  const hw = st.range(4.6, 6.6);

  const pave = C.mk(C.pave._h + st.range(-14, 14), C.pave._s * st.range(0.4, 1.8),
    Math.min(0.96, C.pave._L * st.range(0.82, 1.10)));
  const kerb = C.mk(C.concrete._h + st.range(-14, 14), C.concrete._s * st.range(0.4, 1.8),
    Math.min(0.95, C.concrete._L * st.range(0.78, 1.06)));
  const stoneC = C.mk(C.stone._h + st.range(-12, 12), C.stone._s * st.range(0.5, 1.6),
    Math.min(0.92, C.stone._L * st.range(0.72, 1.02)));

  // Which side is seaward: the promenade's own normal points landward, so the
  // sea wall is on -per if per agrees with n, and on +per otherwise.
  const sgn = (per[0][0] * nx + per[0][1] * ny) > 0 ? -1 : 1;

  const G = groundInv(iso, promZ);
  const paveShade = (sx, sy) => {
    const wx = G.ax * sx + G.bx * sy + G.cx;
    const wy = G.ay * sx + G.by * sy + G.cy;
    const ac = MF.one(wx, wy, 0) / slope - ePro;      // cross-shore offset
    const al = wx * cxu + wy * cyu;
    if (ac * sgn > hw - 1.4) return kerb.l;           // the seaward kerb band
    if (ac * sgn > hw - 1.65) return kerb.k;
    if (ac * sgn < -hw + 0.9) return kerb.r;          // the landward channel
    const f = al / 11.5;
    if (f - Math.floor(f) < 0.9 * G.q / 11.5) return pave.k;
    const b = h3(Math.floor(f), 0, 0x2b) & 7;
    const bay = b === 0 ? kerb : pave;
    return (ac * sgn > 0) ? bay.t : bay.l;
  };

  for (let i = 0; i + 1 < N; i++) {
    const a = pts[i], b = pts[i + 1], pa = per[i], pb = per[i + 1];
    const q0 = [a[0] - pa[0] * hw, a[1] - pa[1] * hw];
    const q1 = [b[0] - pb[0] * hw, b[1] - pb[1] * hw];
    const q2 = [b[0] + pb[0] * hw, b[1] + pb[1] * hw];
    const q3 = [a[0] + pa[0] * hw, a[1] + pa[1] * hw];
    if (!vis(Math.min(q0[0], q1[0], q2[0], q3[0]) - 2, Math.min(q0[1], q1[1], q2[1], q3[1]) - 2,
      Math.max(q0[0], q1[0], q2[0], q3[0]) + 2, Math.max(q0[1], q1[1], q2[1], q3[1]) + 2,
      promZ + 12)) continue;
    cv.t = tag();
    P.polyTop(cv, iso, [q0, q1, q2, q3], promZ, paveShade, cv.t);
    // THE SEA WALL. Coursed masonry with a batter of colour rather than of
    // geometry, a coping in its own lit step and a contact shadow at the foot
    // — four flat fields up a three-metre face, each closed by a line in the
    // stone's own contour step and not in the shared ink.
    const sa = sgn < 0 ? q0 : q3, sb = sgn < 0 ? q1 : q2;
    const A = sgn < 0 ? sa : sb, Bq = sgn < 0 ? sb : sa;
    if (P.facesCamera(A[0], A[1], Bq[0], Bq[1])) {
      const F = wallInv(iso, A[0], A[1], Bq[0], Bq[1], promZ - wallH);
      P.wallQuad(cv, iso, A[0], A[1], Bq[0], Bq[1], promZ - wallH, promZ, (sx, sy) => {
        const u = F.au * sx + F.bu * sy + F.cu;
        const v = F.av * sx + F.bv * sy + F.cv;
        if (v > wallH - 0.8) return v > wallH - 0.5 * F.q ? stoneC.k : kerb.t;
        if (v < 0.7) return stoneC.k;
        const course = 1.05;
        const g = v / course;
        if (g - Math.floor(g) < 0.5 * F.q / course) return stoneC.k;
        const row = Math.floor(g);
        const bw = 2.4;
        const uu = (u + row * 1.2) / bw;
        if (uu - Math.floor(uu) < 0.55 * F.q / bw) return stoneC.k;
        return (h3(Math.floor(uu), row, 0x71) & 3) === 0 ? stoneC.r : stoneC.l;
      }, cv.t);
    }
  }

  // ---- the balustrade, and the furniture that makes it a promenade.
  const rail = st.pick([C.metal, C.steel, C.white, C.concrete]);
  for (let i = 0; i + 1 < N; i += 1) {
    const a = pts[i], b = pts[i + 1];
    const ax = a[0] + per[i][0] * hw * sgn, ay = a[1] + per[i][1] * hw * sgn;
    const bx = b[0] + per[i + 1][0] * hw * sgn, by = b[1] + per[i + 1][1] * hw * sgn;
    if (!vis(Math.min(ax, bx) - 2, Math.min(ay, by) - 2,
      Math.max(ax, bx) + 2, Math.max(ay, by) + 2, promZ + 8)) continue;
    cv.t = tag();
    P.wallQuad(cv, iso, ax, ay, bx, by, promZ + 2.05, promZ + 2.55, rail.l, cv.t);
    P.wallQuad(cv, iso, ax, ay, bx, by, promZ + 0.9, promZ + 1.15, rail.r, cv.t);
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      box(cv, iso, px - 0.22, py - 0.22, promZ, 0.44, 0.44, 2.55, MD(rail));
    }
  }

  // ---- steps down to the sand, wherever the wall is worth breaking
  for (let i = 6; i < N - 6; i += st.int(7, 13)) {
    const a = pts[i];
    const ox2 = per[i][0] * sgn, oy2 = per[i][1] * sgn;
    const sx = a[0] + ox2 * hw, sy = a[1] + oy2 * hw;
    if (!vis(sx - 6, sy - 6, sx + 6, sy + 6, promZ + 4)) continue;
    cv.t = tag();
    const nsteps = Math.max(2, Math.round(wallH / 0.6));
    for (let k = 0; k < nsteps; k++) {
      const t = k / nsteps;
      box(cv, iso, sx + ox2 * t * 3.4 - 2.0, sy + oy2 * t * 3.4 - 2.0,
        promZ - wallH * t - 0.6, 4.0, 4.0, 0.7, { top: kerb.t, left: kerb.l, right: kerb.r });
    }
  }

  // ---- the row of huts. NOT SCATTERED: a settlement whose line is the
  // coastline rather than a grid is the whole structural argument of the shore,
  // and a row of forty identical cabins in forty different paints is the
  // clearest way this biome can say so. The row commits to a short list of
  // paints, exactly as a city block commits to a wall tone.
  const paints = [];
  for (let i = 0; i < st.int(4, 7); i++) paints.push(CB.accentTone(st));
  paints.push(C.white); paints.push(C.cream);
  const hutOff = hw + st.range(3.5, 7.0);
  const hutGap = st.range(7.2, 9.4);
  const runs = [];
  {
    let i = st.int(3, 9);
    while (i < N - 4) {
      const len = st.int(4, 11);
      runs.push([i, Math.min(N - 3, i + len)]);
      i += len + st.int(4, 14);
    }
  }
  for (const [i0, i1] of runs) {
    if (!st.bool(0.86)) continue;
    let acc = 0;
    for (let i = i0; i < i1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
      for (let d = acc; d < seg; d += hutGap) {
        const t = d / seg;
        const px = a[0] + (b[0] - a[0]) * t - per[i][0] * hutOff * sgn;
        const py = a[1] + (b[1] - a[1]) * t - per[i][1] * hutOff * sgn;
        if (!vis(px - 4, py - 4, px + 8, py + 8, 18)) continue;
        if (eAt(px, py) < E_BERM - 2) continue;        // never below the berm
        cv.t = tag();
        P.beachHut(cv, iso, C, st, px, py,
          Math.max(T.surfaceZ(px, py) + 0.9, promZ - 0.4),
          st.int(0, 1), st.pick(paints));
      }
      acc = (acc - seg) % hutGap;
      if (acc < 0) acc += hutGap;
    }
  }

  // ---- the furniture and the crowd.
  for (let i = 2; i < N - 2; i++) {
    const a = pts[i];
    const nrep = st.int(0, 2);
    for (let k = 0; k < nrep; k++) {
      const ac = st.range(-hw + 1.0, hw - 1.6) * sgn;
      const px = a[0] + per[i][0] * ac + cxu * st.range(-3, 3);
      const py = a[1] + per[i][1] * ac + cyu * st.range(-3, 3);
      if (!vis(px - 3, py - 3, px + 3, py + 3, promZ + 12)) continue;
      const w = st.weighted([['person', 22], ['lamp', 10], ['bench', 10], ['bin', 6],
        ['post', 6], ['parasol', 5], ['kiosk', 3], ['rock', 3]]);
      cv.t = w === 'person' ? tagRaw() : tag();
      if (w === 'person') drawPerson(cv, iso, CB, fs, px, py, promZ);
      else if (w === 'lamp') S.lampPost(cv, iso, CB, st, px, py, promZ, st.int(0, 1));
      else if (w === 'bench') S.bench(cv, iso, CB, st, px, py, promZ, st.int(0, 1));
      else if (w === 'bin') S.bin(cv, iso, CB, st, px, py, promZ);
      else if (w === 'post') P.shorePost(cv, iso, CB, st, px, py, promZ, st.int(0, 2));
      else if (w === 'parasol') S.parasol(cv, iso, CB, st, px, py, promZ);
      else if (w === 'kiosk') S.kiosk(cv, iso, CB, st, px, py, promZ, 5.5, 4.5, coinWord(st));
      else P.rock(cv, iso, C, st, px, py, promZ, false);
    }
  }

  // ---- THE GROYNES. The one thing on a beach that runs straight down the
  // gradient, and therefore the one line in this biome that crosses all the
  // others. Each is a run of piles from the berm out into the surf, with a
  // plank wall between them and sand banked higher on the updrift side — which
  // is why they exist and, incidentally, three more closed cells per bay.
  const gs = rng.stream('groyne');
  for (let i = 4; i < N - 4; i += gs.int(5, 11)) {
    const a = pts[i];
    if (!gs.bool(0.78)) continue;
    const tim = gs.pick([C.wood, C.taupe, C.slate, C.stone]);
    const hTop = gs.range(1.8, 3.0);
    const eEnd = gs.range(-16, -6);
    let x = a[0] - nx * 2, y = a[1] - ny * 2;
    let prev = null;
    for (let k = 0; k < 90; k++) {
      const e = eAt(x, y);
      if (e < eEnd) break;
      if (vis(x - 2, y - 2, x + 2, y + 2, 8)) {
        const g = T.surfaceZ(x, y);
        const hh = hTop * sm((e - eEnd) / 26) + 0.55;
        cv.t = tag();
        P.pile(cv, iso, C, gs, x - 0.4, y - 0.4, g - 1.2, g + hh, 0.85);
        if (prev) {
          const F = wallInv(iso, prev[0], prev[1], x, y, prev[2]);
          cv.t = tag();
          P.wallQuad(cv, iso, prev[0], prev[1], x, y, g - 0.4, g + hh * 0.82, (sx, sy) => {
            const v = F.av * sx + F.bv * sy + F.cv;
            const g2 = v / 0.62;
            return (g2 - Math.floor(g2) < 0.5 * F.q / 0.62) ? tim.k : (v > hh * 0.5 ? tim.l : tim.r);
          }, cv.t);
        }
        prev = [x, y, g];
      } else prev = null;
      x -= nx * 3.1; y -= ny * 3.1;
      if (x < X0 + 2 || x > X1 - 2 || y < Y0 + 2 || y > Y1 - 2) break;
    }
  }

  return { pts, per, hw, promZ, sgn, ePro,
    dist(px, py) {
      let best = 1e9;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const L2 = ex * ex + ey * ey;
        let t = L2 > 0 ? ((px - a[0]) * ex + (py - a[1]) * ey) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx2 = a[0] + ex * t - px, cy2 = a[1] + ey * t - py;
        const d = cx2 * cx2 + cy2 * cy2;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    } };
}

// ---------------------------------------------------------------------------
// THE PIER.
//
// "Terrain and ecology are what one walks through; authored places are what one
// walks to." A coast has exactly one place-kind that is honestly its own and it
// is not a building on the sand — it is the thing built OUT OVER THE WATER,
// which is the one structure that only a shore can have and the one that puts a
// hard, tall, man-made silhouette across the biome's biggest flat surface.
//
// It is placed EXPLICITLY. Its mid-point is aimed at the middle of the frame
// and its two ends are then found by MARCHING THE EXPOSURE FIELD — landward to
// the berm, seaward until the water is deep — so the pier's length is whatever
// the bathymetry gives it and a seed with a wide shallow shelf gets a long one.
// Nothing about it is on the 2:1 lattice: the deck runs perpendicular to the
// mean coast, which is a bearing chosen against the projection, and the deck,
// the fascia, the parapet and the pavilion's four walls are all drawn with the
// arbitrary-direction primitives in `props/shore.js` rather than with `box`.
// ---------------------------------------------------------------------------

/** The face inverse for a vertical wall along an ARBITRARY world direction.
 *
 *  `wallQuad` solves the DEPTH plane for such a face; this solves the surface
 *  coordinates, which is what lets a shader cut planking, glazing, a plinth and
 *  a sign into a wall that does not run along an axis. Derivation: a point on
 *  the face is (ax + t*ex, ay + t*ey, z), so
 *      sx = ox + 2s[(ax-ay) + t(ex-ey)]        =>  t is linear in sx alone
 *      sy = oy + s[(ax+ay) + t(ex+ey)] - 2sz   =>  z is linear in (sx, sy)
 *  and u = t*L, v = z - z0. Substituting the axis-aligned directions reproduces
 *  `faces.js` leftFace/rightFace coefficient for coefficient — checked.
 */
function wallInv(iso, ax, ay, bx, by, z0) {
  const s = iso.s === undefined ? 1 : iso.s;
  const ex = bx - ax, ey = by - ay;
  const den = ex - ey;
  const L = Math.sqrt(ex * ex + ey * ey) || 1;
  const at = 1 / (2 * s * den);
  const ct = -(iso.ox + 2 * s * (ax - ay)) / (2 * s * den);
  const k = (ex + ey) / 2;
  return {
    au: at * L, bu: 0, cu: ct * L,
    av: k * at, bv: -1 / (2 * s),
    cv: (iso.oy + s * (ax + ay)) / (2 * s) - z0 + k * ct,
    q: 1 / s, L,
  };
}

function pier(stage, SH) {
  // NOTE the scale is bound as `SC`, not `S`: `S` is the street-prop namespace
  // in this module, and destructuring the stage's scale over it silently turned
  // every `S.bin(...)` into a call on a number.
  const { C, cv, iso, rng, X0, X1, Y0, Y1, W, H, ox, oy, tag, tagRaw, vis } = stage;
  const SC = stage.S;
  const { T, nx, ny, eAt, E_BERM } = SH;
  const ps = rng.stream('pier');
  const CP = localC(C, ps, 4, 2);

  const clx = (x) => (x < X0 + 8 ? X0 + 8 : x > X1 - 8 ? X1 - 8 : x);
  const cly = (y) => (y < Y0 + 8 ? Y0 + 8 : y > Y1 - 8 ? Y1 - 8 : y);
  const march = (x0, y0, target, maxN) => {
    let x = x0, y = y0;
    const up = eAt(x, y) < target ? 1 : -1;
    for (let k = 0; k < maxN; k++) {
      const e = eAt(x, y);
      if (up > 0 ? e >= target : e <= target) break;
      const nxx = clx(x + nx * 2.0 * up), nyy = cly(y + ny * 2.0 * up);
      if (nxx === x && nyy === y) break;
      x = nxx; y = nyy;
    }
    return [x, y];
  };

  const cSx = (W * 0.5 - ox) / (2 * SC);
  const cSy = (H * ps.range(0.36, 0.46) - oy) / SC;
  const [rx, ry] = march((cSy + cSx) / 2, (cSy - cSx) / 2, E_BERM + ps.range(1, 9), 110);
  const [hx0, hy0] = march(rx, ry, ps.range(-58, -38), 140);
  let L = Math.sqrt((hx0 - rx) * (hx0 - rx) + (hy0 - ry) * (hy0 - ry));
  if (L < 46) L = 46; else if (L > 132) L = 132;
  const dx = -nx, dy = -ny;                 // seaward
  const acx = -dy, acy = dx;                // across, so the deck is CCW
  const hw = ps.range(4.6, 6.4);            // half the deck width
  const gz = T.surfaceZ(rx, ry);
  const deckZ = Math.max(gz, 0) + ps.range(2.8, 4.4);

  const P4 = (t, c) => [rx + dx * t + acx * c, ry + dy * t + acy * c];
  const at = (t, c) => P4(t, c);

  // The head: a wider platform for the last stretch, which is what makes a pier
  // a pier rather than a jetty and gives the pavilion something to stand on.
  const headL = Math.min(L * 0.42, ps.range(22, 34));
  const headW = hw * ps.range(1.85, 2.35);
  const t0 = L - headL;

  const timber = ps.pick([C.wood, C.taupe, C.stone, C.wood]);
  const deckA = C.mk(timber._h + ps.range(-10, 10), timber._s * ps.range(0.6, 1.2),
    Math.min(0.9, timber._L * ps.range(0.92, 1.22)));
  const deckB = C.mk(deckA._h + ps.range(-14, 14), deckA._s * ps.range(0.7, 1.3),
    Math.min(0.92, deckA._L * ps.range(0.84, 1.10)));

  // ---- the deck's shadow and the piles' reflections, on the water.
  //
  // A shadow is the cheapest thing that breaks a calm sea and the only one that
  // is not an object: it is a long flat field of the sea's own darker step,
  // thrown down-screen along the (1,1) view ray, and it terminates against the
  // pier above it — so unlike a free swell stroke it CLOSES something.
  const G0 = groundInv(iso, 0.03);
  const wetOnly = (val) => (sx, sy) => {
    const wx = G0.ax * sx + G0.bx * sy + G0.cx;
    const wy = G0.ay * sx + G0.by * sy + G0.cy;
    return T.isWet(wx, wy) ? val : -1;
  };
  const shR = SH.regionAt(rx + dx * L * 0.8, ry + dy * L * 0.8);
  const shade0 = shR.sea[1][0].k, shade1 = shR.sea[1][0].r;
  const SHD = ps.range(3.4, 6.0);           // how far the shadow is thrown
  {
    cv.t = tagRaw();
    const a = at(L * 0.12, -hw), b = at(L, -hw);
    P.polyTop(cv, iso, [
      [a[0], a[1]], [b[0], b[1]],
      [b[0] + SHD, b[1] + SHD], [a[0] + SHD, a[1] + SHD],
    ], 0.03, wetOnly(shade0), cv.t);
    cv.t = tagRaw();
    const c = at(L * 0.12, hw), d = at(L, hw);
    P.polyTop(cv, iso, [
      [c[0] + SHD * 0.9, c[1] + SHD * 0.9], [d[0] + SHD * 0.9, d[1] + SHD * 0.9],
      [d[0] + SHD * 1.9, d[1] + SHD * 1.9], [c[0] + SHD * 1.9, c[1] + SHD * 1.9],
    ], 0.03, wetOnly(shade1), cv.t);
  }

  // ---- the piles. Three to a bent, and the bent spacing is what gives the
  // structure its rhythm across the water.
  const gap = ps.range(6.0, 8.5);
  const pw = ps.range(0.95, 1.35);
  for (let t = gap * 0.6; t < L - 0.5; t += gap) {
    const wide = t > t0;
    const half = wide ? headW : hw;
    const n = wide ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const c = -half + 0.9 + (2 * half - 1.8) * (n === 1 ? 0.5 : i / (n - 1));
      const [x, y] = at(t, c);
      if (!vis(x - 2, y - 2, x + 2, y + 2, deckZ + 4)) continue;
      const g = T.surfaceZ(x, y);
      const z0 = Math.min(g, 0) - 0.8;
      cv.t = tag();
      P.pile(cv, iso, C, ps, x, y, z0, deckZ - 0.55, pw);
      // A pile standing in water throws a reflection. Two units of the sea's
      // contour step directly down-screen: it is the vertical the water has no
      // other way of carrying.
      if (T.isWet(x, y)) {
        cv.t = tagRaw();
        const rl = ps.range(2.2, 4.2);
        P.polyTop(cv, iso, [
          [x, y], [x + pw, y + pw], [x + pw + rl, y + pw + rl], [x + rl, y + rl],
        ], 0.05, wetOnly(shR.sea[1][2].k), cv.t);
      }
    }
  }

  // ---- the deck, its fascia, and the head platform.
  const deckShade = (z, x0, y0, half) => {
    const G = groundInv(iso, z);
    const bay = ps.range(7.5, 11.5);
    return (sx, sy) => {
      const wx = G.ax * sx + G.bx * sy + G.cx;
      const wy = G.ay * sx + G.by * sy + G.cy;
      const al = (wx - x0) * dx + (wy - y0) * dy;
      const ac = (wx - x0) * acx + (wy - y0) * acy;
      const q = G.q;
      if (ac < -half + 0.55 * q || ac > half - 0.55 * q) return deckA.k;
      // A BAY SEAM, NOT A PLANK. At plank pitch this would be a 4px lattice
      // over a 400px deck, which is the pavement-seam defect verbatim. A seam
      // every eight to twelve units is a structural bay, and each bay is a flat
      // field closed on both sides.
      const f = al / bay;
      if (f - Math.floor(f) < 1.1 * q / bay) return deckA.k;
      const bi = h3(Math.floor(f), 0, 0x51) & 3;
      const F = bi === 0 ? deckB : deckA;
      // A worn centre lane: the strip everyone walks on, in the same timber a
      // value up. One flat field bounded by two seams, which is the whole ink
      // closure argument applied to a deck.
      return (ac > -half * 0.40 && ac < half * 0.40) ? F.l : F.t;
    };
  };

  const deckQuad = (ta, tb, half) => {
    const a = at(ta, -half), b = at(tb, -half), c = at(tb, half), d = at(ta, half);
    return [a, b, c, d];
  };

  const drawDeck = (ta, tb, half) => {
    const Q = deckQuad(ta, tb, half);
    cv.t = tag();
    P.polyTop(cv, iso, Q, deckZ, deckShade(deckZ, rx, ry, half), cv.t);
    // the fascia: a beam under the deck edge, on the camera-facing sides only
    for (let i = 0; i < 4; i++) {
      const a = Q[i], b = Q[(i + 1) % 4];
      if (!P.facesCamera(a[0], a[1], b[0], b[1])) continue;
      const F = wallInv(iso, a[0], a[1], b[0], b[1], deckZ - 1.35);
      P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], deckZ - 1.35, deckZ,
        (sx, sy) => {
          const v = F.av * sx + F.bv * sy + F.cv;
          const u = F.au * sx + F.bu * sy + F.cu;
          if (v > 1.35 - 0.55 * F.q) return deckA.k;
          const uu = u / 5.5;
          return (uu - Math.floor(uu) < 0.22) ? deckB.r : deckA.r;
        }, cv.t);
    }
  };

  drawDeck(0, t0 + 0.4, hw);
  drawDeck(t0, L, headW);

  // ---- railings, lamps, benches and the people using it.
  const railZ = deckZ + ps.range(2.3, 2.9);
  const rail = ps.pick([C.metal, C.steel, C.white, C.slate]);
  const railRun = (ta, tb, half, sign) => {
    for (let t = ta; t <= tb; t += 3.3) {
      const [x, y] = at(t, half * sign);
      if (!vis(x - 1, y - 1, x + 1, y + 1, railZ + 2)) continue;
      cv.t = tag();
      box(cv, iso, x - 0.24, y - 0.24, deckZ, 0.48, 0.48, railZ - deckZ, MD(rail));
    }
    const a = at(ta, half * sign), b = at(tb, half * sign);
    cv.t = tag();
    P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], railZ - 0.75, railZ, rail.l, cv.t);
    P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], railZ - 2.0, railZ - 1.75, rail.r, cv.t);
  };
  railRun(1.5, t0, hw, -1);
  railRun(1.5, t0, hw, 1);
  railRun(t0, L - 0.6, headW, -1);
  railRun(t0, L - 0.6, headW, 1);

  const pes = rng.stream('pierfolk');
  for (let t = 5; t < L - 3; t += ps.range(5, 13)) {
    const c = ps.range(-hw * 0.75, hw * 0.75);
    const [x, y] = at(t, t > t0 ? c * 1.6 : c);
    if (!vis(x - 2, y - 2, x + 2, y + 2, deckZ + 8)) continue;
    const k = ps.int(0, 6);
    cv.t = tag();
    if (k === 0) S.lampPost(cv, iso, CP, ps, x, y, deckZ, ps.int(0, 1));
    else if (k === 1) S.bench(cv, iso, CP, ps, x, y, deckZ, ps.int(0, 1));
    else if (k === 2) S.bin(cv, iso, CP, ps, x, y, deckZ);
    else {
      cv.t = tagRaw();
      drawPerson(cv, iso, CP, pes, x, y, deckZ);
      if (ps.bool(0.5)) {
        cv.t = tagRaw();
        drawPerson(cv, iso, CP, pes, x + ps.range(-1.6, 1.6), y + ps.range(-1.6, 1.6), deckZ);
      }
    }
  }

  // ---- the pavilion at the head.
  pavilion(stage, SH, ps, CP, {
    at, t0, L, headL, headW, deckZ, dx, dy, acx, acy, timber,
  });

  return {
    rx, ry, dx, dy, acx, acy, L, hw, headW, t0, deckZ,
    /** Distance from a point to the pier's centre line — the hero's own field,
     *  which the ambient scatter reads so the beach thins under it and the
     *  moorings gather beside it. */
    dist(x, y) {
      const al = (x - rx) * dx + (y - ry) * dy;
      const ac = (x - rx) * acx + (y - ry) * acy;
      const t = al < 0 ? 0 : al > L ? L : al;
      const px = rx + dx * t, py = ry + dy * t;
      return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) + 0 * ac;
    },
  };
}

/**
 * The pavilion — the thing at the end of the pier, and the object the eye is
 * meant to land on in the first second.
 *
 * Built entirely from the arbitrary-direction primitives so it stands SQUARE TO
 * THE PIER rather than square to the world axes. That is deliberate: it is the
 * largest single off-lattice built form this generator draws, and `docs/BAR.md`
 * §5 records non-lattice-conforming area as the hardest number in the project —
 * reference 9.9%, generator 0.5%. A box() here would have been half an hour
 * cheaper and would have thrown that away.
 */
function pavilion(stage, SH, ps, CP, o) {
  const { C, cv, iso, tag, tagRaw, vis } = stage;
  const { at, t0, L, headW, deckZ } = o;
  const cw = headW * ps.range(0.66, 0.80);
  const cl = Math.min((L - t0) * 0.74, ps.range(15, 22));
  const ta = t0 + (L - t0 - cl) * ps.range(0.35, 0.65);
  const tb = ta + cl;
  const A = at(ta, -cw), Bq = at(tb, -cw), Cq = at(tb, cw), D = at(ta, cw);
  const Q = [A, Bq, Cq, D];
  if (!vis(Math.min(A[0], Bq[0], Cq[0], D[0]) - 2, Math.min(A[1], Bq[1], Cq[1], D[1]) - 2,
    Math.max(A[0], Bq[0], Cq[0], D[0]) + 2, Math.max(A[1], Bq[1], Cq[1], D[1]) + 2,
    deckZ + 30)) return;

  const wall = CP.wallTone(ps);
  const trim = ps.bool(0.55) ? C.white : C.cream;
  const roofC = ps.pick([C.slate, C.steel, C.terra, C.metal, CP.accentTone(ps)]);
  const glass = ps.pick([C.glass, C.aqua, C.cyan]);
  const wallH = ps.range(7.5, 10.5);
  const topZ = deckZ + wallH;


  // WHICH WALL CARRIES THE SIGN IS A LEGIBILITY DECISION, NOT A GEOMETRIC ONE.
  // Both camera-facing walls of an off-lattice building are foreshortened, but
  // by different amounts: the shear of type on a plane is that plane's own
  // screen slope, and the pier's long axis runs at about -0.72 where its cross
  // axis runs at the coast bearing, around 0.35. Lettering at 0.72 climbs so
  // steeply it reads as a diagonal rather than a word. So the board goes on the
  // GENTLER of the two, scored on screen width divided by shear.
  let signEdge = -1, best = 0;
  for (let i = 0; i < 4; i++) {
    const a = Q[i], b = Q[(i + 1) % 4];
    if (!P.facesCamera(a[0], a[1], b[0], b[1])) continue;
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const wpx = Math.abs(2 * (ex - ey));
    const sl = Math.abs((ex + ey) / (2 * (ex - ey) || 1e-6));
    const score = wpx / (1 + sl * 1.6);
    if (score > best) { best = score; signEdge = i; }
  }

  cv.t = tag();
  for (let i = 0; i < 4; i++) {
    const a = Q[i], b = Q[(i + 1) % 4];
    if (!P.facesCamera(a[0], a[1], b[0], b[1])) continue;
    const F = wallInv(iso, a[0], a[1], b[0], b[1], deckZ);
    const len = F.L;
    // plinth, a glazed arcade, a spandrel band and a cornice — four flat
    // fields stacked up the wall, each closed by a line in the wall's OWN
    // contour step rather than in the shared ink.
    const glazeV0 = wallH * 0.30, glazeV1 = wallH * 0.66;
    const bay = len / Math.max(3, Math.round(len / ps.range(3.4, 4.6)));
    const face = (sx, sy) => {
      const u = F.au * sx + F.bu * sy + F.cu;
      const v = F.av * sx + F.bv * sy + F.cv;
      if (v < 0.55 * F.q) return wall.k;
      if (v < 1.9) return wall.r;                      // plinth
      if (v < 2.15) return wall.k;
      if (v > glazeV0 && v < glazeV1) {
        const f = u / bay;
        const g = f - Math.floor(f);
        if (g < 0.30) return wall.l;                   // pier between windows
        if (g < 0.34 || g > 0.965) return wall.k;
        return v > glazeV1 - 0.55 * F.q ? wall.k : (g < 0.62 ? glass.t : glass.l);
      }
      if (v > wallH - 1.15) return v > wallH - 0.5 * F.q ? wall.k : trim.l;
      return v > glazeV1 && v < glazeV1 + 0.5 * F.q ? wall.k : wall.t;
    };
    P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], deckZ, topZ, face, cv.t);
  }

  // roof, parapet and a lantern — three stacked flat fields with real edges
  cv.t = tag();
  P.polyTop(cv, iso, Q, topZ, roofC.l, cv.t);
  for (let i = 0; i < 4; i++) {
    const a = Q[i], b = Q[(i + 1) % 4];
    if (!P.facesCamera(a[0], a[1], b[0], b[1])) continue;
    P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], topZ, topZ + 0.9, trim.r, cv.t);
  }
  cv.t = tag();
  P.polyTop(cv, iso, Q, topZ + 0.9, roofC.t, cv.t);

  // ---- THE SIGNBOARD, ON THE ROOF, WHERE IT FITS.
  //
  // The first version cut the lettering into a band on the wall and the band
  // ran off the top of it: seven rows at a legible cell is four world units of
  // face, and the spandrel between the glazing head and the cornice is two. A
  // pier pavilion carries its name on a board above the parapet anyway, and up
  // there the panel can be as tall as the word needs. Type on an axonometric
  // plane shears but never scales, and this is cut in face coordinates, so it
  // cannot foreshorten.
  if (signEdge >= 0) {
    const a0 = Q[signEdge], b0 = Q[(signEdge + 1) % 4];
    const ex = b0[0] - a0[0], ey = b0[1] - a0[1];
    // THE BOARD IS SIZED TO THE WORD, NOT THE OTHER WAY ROUND, AND THE WORD IS
    // ONLY EVER `coinWord`.
    //
    // The first build slid the other way: it sliced a coinage to fit the edge
    // and, when that still would not go, fell back to `coinTag`. `coinTag`'s
    // first mode is one onset plus one nucleus plus one coda and it does NOT
    // run the two real-word filters `coinWord` runs — it produced PEE on the
    // hero sign of the frame. `coinWord` is filtered against both lists, so it
    // is the only coiner used here; it is re-rolled for a short one, and if the
    // word is still longer than the pavilion's edge the BOARD overhangs, which
    // is what a pier signboard does anyway.
    let word = coinWord(ps);
    for (let k = 0; k < 6 && word.length > 5; k++) word = coinWord(ps);
    const rows = textBitmap(word, 1);
    const cell = ps.range(0.50, 0.64);
    const need = rows[0].length * cell + 5.2;
    const edge = Math.sqrt(ex * ex + ey * ey);
    const grow = Math.min(1.40, Math.max(1.0, need / edge));
    const k0 = 0.5 - grow * 0.5, k1 = 0.5 + grow * 0.5;
    const sa = [a0[0] + ex * k0, a0[1] + ey * k0];
    const sb = [a0[0] + ex * k1, a0[1] + ey * k1];
    const span = edge * grow;
    if (span < rows[0].length * cell + 1.2) return;
    const bh = rows.length * cell + 2.2;
    const z0 = topZ + 0.9;
    const F = wallInv(iso, sa[0], sa[1], sb[0], sb[1], z0);
    const dir = (sb[0] - sa[0]) - (sb[1] - sa[1]) > 0 ? 1 : -1;
    const tw = rows[0].length * cell;
    const u0 = (F.L - tw) * 0.5;
    const panel = ps.weighted([[CP.accentTone(ps), 8], [C.white, 3], [C.cream, 2]]);
    const ink2 = signInk(C, panel, ps.pick(CP.accents));
    cv.t = tag();
    // two standards, so the board is carried rather than floating
    for (const t of [0.12, 0.88]) {
      const px = sa[0] + (sb[0] - sa[0]) * t, py = sa[1] + (sb[1] - sa[1]) * t;
      box(cv, iso, px - 0.3, py - 0.3, z0, 0.6, 0.6, bh, MD(trim));
    }
    P.wallQuad(cv, iso, sa[0], sa[1], sb[0], sb[1], z0, z0 + bh, (sx, sy) => {
      const u = F.au * sx + F.bu * sy + F.cu;
      const v = F.av * sx + F.bv * sy + F.cv;
      const e = Math.min(u, v, F.L - u, bh - v);
      if (e < 0.55 * F.q) return C.black;
      if (e < 0.9) return panel.t;
      if (e < 0.9 + 0.55 * F.q) return panel.k;
      const iu = Math.floor(dir > 0 ? (u - u0) / cell : (u0 + tw - u) / cell);
      const iv = Math.floor((bh - 1.1 - v) / cell);
      if (iv >= 0 && iv < rows.length && iu >= 0 && iu < rows[0].length
        && rows[iv].charCodeAt(iu) === 35) return ink2;
      return panel.l;
    }, cv.t);
  }

  const lw = cw * 0.44, ll = cl * 0.30;
  const lm = (ta + tb) * 0.5;
  const LQ = [at(lm - ll, -lw), at(lm + ll, -lw), at(lm + ll, lw), at(lm - ll, lw)];
  cv.t = tag();
  for (let i = 0; i < 4; i++) {
    const a = LQ[i], b = LQ[(i + 1) % 4];
    if (!P.facesCamera(a[0], a[1], b[0], b[1])) continue;
    const F = wallInv(iso, a[0], a[1], b[0], b[1], topZ + 0.9);
    P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], topZ + 0.9, topZ + 5.2, (sx, sy) => {
      const v = F.av * sx + F.bv * sy + F.cv;
      const u = F.au * sx + F.bu * sy + F.cu;
      if (v < 0.6 || v > 3.9) return trim.l;
      const f = u / 1.9, g = f - Math.floor(f);
      return g < 0.22 ? trim.k : glass.t;
    }, cv.t);
  }
  cv.t = tag();
  P.polyTop(cv, iso, LQ, topZ + 5.2, roofC.t, cv.t);
  for (let i = 0; i < 4; i++) {
    const a = LQ[i], b = LQ[(i + 1) % 4];
    if (!P.facesCamera(a[0], a[1], b[0], b[1])) continue;
    P.wallQuad(cv, iso, a[0], a[1], b[0], b[1], topZ + 5.2, topZ + 5.75, roofC.k, cv.t);
  }
  const fp = at((ta + tb) * 0.5, 0);
  cv.t = tag();
  P.flagPole(cv, iso, CP, ps, fp[0], fp[1], topZ + 5.75, ps.int(0, 1));
  // a lit sign board is not enough of an anchor on its own; a couple of gulls
  // on the parapet put the object at a size the eye can read against
  for (let k = 0; k < 3; k++) {
    const g = at(ta + cl * ps.range(0, 1), (ps.bool(0.5) ? -1 : 1) * cw);
    cv.t = tagRaw();
    P.gull(cv, iso, C, ps, g[0], g[1], topZ + 0.9, false);
  }
}

// ---------------------------------------------------------------------------

/** One stretch of shore's committed colour, off the scene's own base set. */
function mintRegion(C, st, B) {
  const R = {};
  // Sand. The single largest surface in the frame and therefore the one that
  // decides the top-1 share: five patch tones per terrace level, spread wide
  // enough on hue and saturation to be five colours rather than five roundings
  // of one, and narrow enough that all of them are still sand.
  R.dry = table(C, st, B.sand, 5, 12,
    { h: 3, hw: 5, s0: 0.80, s1: 1.16, lw: 0.13, lvWalk: 0.13, l0: 0.90, l1: 1.07 });
  R.wet = table(C, st, B.wet, 5, 12,
    { h: 4, hw: 6, s0: 0.78, s1: 1.20, lw: 0.16, lvWalk: 0.11, l0: 0.87, l1: 1.12 });
  R.berm = table(C, st, B.berm, 5, 12,
    { h: 5, hw: 8, s0: 0.70, s1: 1.28, lw: 0.17, lvWalk: 0.13, l0: 0.86, l1: 1.11 });
  R.marram = table(C, st, B.turf, 5, 12,
    { h: 5, hw: 9, s0: 0.74, s1: 1.14, lw: 0.17, lvWalk: 0.14, l0: 0.90, l1: 1.15 });
  // Machair — the rough grazing behind a dune — is not a lawn. Sand is still
  // half of what it is made of, so the turf runs desaturated and pale and the
  // scrape pool cuts bare sand back through it.
  R.firm = table(C, st, B.turf, 5, 12,
    { h: 6, hw: 10, s0: 0.66, s1: 1.16, lw: 0.19, lvWalk: 0.15, l0: 0.88, l1: 1.18 });
  R.heath = table(C, st, B.heath, 3, 12,
    { h: 6, hw: 12, s0: 0.66, s1: 1.20, lw: 0.24, lvWalk: 0.12, l0: 0.88, l1: 1.22 });
  R.rock = table(C, st, B.rock, 3, 12,
    { h: 6, hw: 11, s0: 0.55, s1: 1.40, lw: 0.22, lvWalk: 0.14, l0: 0.86, l1: 1.28 });
  // Accents on the ground: shell drift, wrack, bare scrapes, foam.
  R.shell = pool(C, st, B.shell, 5, { h: 8, hw: 13, s0: 0.5, s1: 1.3, lw: 0.09, l0: 0.94, l1: 1.03 });
  R.wrack = pool(C, st, B.wrack, 5, { h: 12, hw: 22, s0: 0.6, s1: 1.4, lw: 0.24, l0: 0.80, l1: 1.16 });
  R.scrape = pool(C, st, B.sand, 5, { h: 9, hw: 14, s0: 0.55, s1: 1.35, lw: 0.13, l0: 0.94, l1: 1.10 });
  R.foam = pool(C, st, B.foam, 5, { h: 14, hw: 22, s0: 0.5, s1: 1.8, lw: 0.04, l0: 0.97, l1: 1.02 });
  return R;
}

/**
 * The sea's value ladder, per region.
 *
 * Six zones from the horizon in, each a family of four so a zone is never one
 * flat field, and each family used at three steps so the swell bands inside it
 * are the SAME pigment at three values rather than three pigments. That is the
 * whole of "flat-banded water" and the whole of not collapsing to one blue.
 */
function mintSea(C, st, R, h0, s0, l0) {
  R.sea = [];
  for (let z = 0; z < 4; z++) {
    const t = z / 3;
    const row = [];
    for (let i = 0; i < 8; i++) {
      row.push(C.mk(
        h0 - 30 * t + st.range(-4, 4),
        Math.min(1, s0 * (1 - 0.28 * t) * st.range(0.80, 1.20)),
        clampL(l0 * (1 + 1.05 * t * t) * st.range(0.90, 1.12))));
    }
    R.sea.push(row);
  }
  // A swell period of 26-46 world units is 115-205 screen pixels: three or four
  // crests over the whole sea, which is what a calm sea in this family looks
  // like. It was 2.6-4.4 and that is where the moiré came from.
  R.pitch = st.range(26, 46);
  R.subW = st.range(4.6, 7.2);
}
