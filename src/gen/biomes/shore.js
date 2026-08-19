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

import { heightField, fbm, tri } from '../world.js';
import { makeTerrain, drawTerrain, walkTrack } from '../terrain.js';
import { drawSlab } from '../../core/iso.js';
import { box, gable } from '../draw.js';
import { h3 } from '../palette.js';
import { topFace, leftFace, rightFace, textPanel } from '../faces.js';
import { localC } from '../stage.js';
import { coinWord, coinTag, textBitmap, signInk } from '../font.js';
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
  const m = cs.range(0.28, 0.60) * (cs.bool(0.5) ? 1 : -1);
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
  const cell = cs.range(2.8, 3.3);
  const step = cs.range(1.55, 2.05);

  const MF = makeFields(X0, Y0, X1, Y1, cell, (x, y, out) => {
    const h0 = F0(x - Ox, y - Oy);
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
    shell: C.mk(sandH + ts.range(2, 16), sandS * ts.range(0.20, 0.45), Math.min(0.95, sandL * 1.10)),
  };

  const REG = [];
  for (let i = 0; i < NR; i++) REG.push(mintRegion(C, ts, B));

  // The sea's HUE is minted once for the whole water body rather than per
  // region: one bay is not a different ocean, and a hue break running out to
  // the horizon would read as a seam. What varies per region is the value
  // ladder and the swell tones, which is what a stretch of water actually does.
  for (const R of REG) mintSea(C, ts, R, seaH0, seaS0, seaL0);

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

    // ---- wet sand: the last tide's ground. Runnels and a sheen, drawn as
    // contoured bands of the same sand at two values — a beach at low water is
    // banded, and it is banded ALONG the shore.
    if (e < E_WET) {
      const F = R.wet[li][p];
      // A runnel set at a 13-unit period — 60 screen pixels, two values — not
      // the 6px ladder the first version drew.
      const t = tri(e * 0.077 + swell * 2.4 + grain * 0.45);
      if (e < 1.4 && grain > 0.48) return R.foam[p % 5].t;
      return t < 0.12 ? F.r : t < 0.58 ? F.l : F.t;
    }

    // ---- the dry beach. Large contoured patches of the region's own sand,
    // cut by the grain field, plus scour tails and a shell-drift in the pale
    // pool. Never a per-pixel speckle.
    if (e < E_DRY) {
      const F = R.dry[li][p];
      if (grain > 0.775) return R.shell[p % 5].t;
      if (grain < 0.155) return R.dry[li][(p + 5) % 12].l;
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
      const F = R.berm[li][p];
      return grain > 0.50 ? F.l : F.t;
    }

    // ---- the dune face. Marram cover thickens landward; the ground under it
    // is still sand, so the two materials interleave as patches rather than
    // meeting at a line.
    if (e < E_DUNE) {
      const cover = sm((e - E_BERM) / (E_DUNE - E_BERM)) * 0.72 + grain * 0.5 - 0.11;
      const F = cover > 0.5 ? R.marram[li][p] : R.dry[li][p];
      return grain > 0.54 ? F.l : F.t;
    }

    // ---- firm ground. Turf, with the sand blowing through it at the seaward
    // edge and bare scrapes where the ground is high.
    const F = R.firm[li][p];
    if (grain > 0.72 && swell < 0.46) return R.scrape[p % 5].t;
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
  const waterTop = (u, v) => {
    MF.at(u, v, buf);
    const h0 = buf[0], swell = buf[1], grain = buf[2];
    const e = h0 / slope;
    const R = regionAt(u, v, swell);

    const fw = foamAt(e, MF.grad(u, v), grain);
    if (fw > 0.60) return R.foam[idxN(grain, 5)].t;
    if (fw > 0.44) return R.foam[idxN(grain, 5)].l;

    const zi = e > -6 ? 3 : e > -21 ? 2 : e > -48 ? 1 : 0;
    const F = R.sea[zi][idxN(grain, 4) + 4 * idxN(swell, 2)];

    // The swell runs on the LINEAR cross-shore ordinate, not on the exposure
    // field: the exposure field carries the bar, and over the bar's outer face
    // it changes by thirty units in sixteen, which bunched the crests into the
    // moiré. Warped by the low-frequency swell channel so no crest stays
    // straight, and gated on the grain so each one is an arc rather than a line
    // from one edge of the frame to the other.
    const d = (u - Ox) * nx + (v - Oy) * ny;
    const t = tri(d / R.pitch + swell * 1.25);
    if (grain > 0.30) {
      if (t > 0.87) return F.l;
      // The trough takes the RIGHT step, not the contour step. `.k` is the line
      // the light does not reach at all, and a hundred pixels of it running
      // across open water read as a drawn contour rather than as a swell.
      if (t < 0.06) return F.r;
    }
    return F.t;
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
  stage.shore = {
    MF, T, cxu, cyu, nx, ny, slope, Ox, Oy, REG, REGL, REGW, NR,
    E_WET, E_DRY, E_BERM, E_DUNE, step, cell,
    eAt: (x, y) => MF.one(x, y, 0) / slope,
    regionAt: (x, y) => regionAt(x, y, MF.one(x, y, 1)),
  };
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
    { h: 7, hw: 11, s0: 0.66, s1: 1.30, lw: 0.11, lvWalk: 0.13, l0: 0.90, l1: 1.06 });
  R.wet = table(C, st, B.wet, 5, 12,
    { h: 8, hw: 12, s0: 0.62, s1: 1.34, lw: 0.15, lvWalk: 0.11, l0: 0.86, l1: 1.12 });
  R.berm = table(C, st, B.berm, 5, 12,
    { h: 10, hw: 16, s0: 0.50, s1: 1.44, lw: 0.15, lvWalk: 0.13, l0: 0.86, l1: 1.10 });
  R.marram = table(C, st, B.turf, 5, 12,
    { h: 12, hw: 20, s0: 0.55, s1: 1.18, lw: 0.15, lvWalk: 0.14, l0: 0.90, l1: 1.14 });
  // Machair — the rough grazing behind a dune — is not a lawn. Sand is still
  // half of what it is made of, so the turf runs desaturated and pale and the
  // scrape pool cuts bare sand back through it.
  R.firm = table(C, st, B.turf, 5, 12,
    { h: 14, hw: 24, s0: 0.42, s1: 1.10, lw: 0.15, lvWalk: 0.14, l0: 0.88, l1: 1.16 });
  R.rock = table(C, st, B.rock, 3, 12,
    { h: 12, hw: 22, s0: 0.40, s1: 1.60, lw: 0.20, lvWalk: 0.14, l0: 0.86, l1: 1.30 });
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
        h0 - 30 * t + st.range(-8, 8),
        Math.min(1, s0 * (1 - 0.28 * t) * st.range(0.80, 1.20)),
        clampL(l0 * (1 + 1.05 * t * t) * st.range(0.90, 1.12))));
    }
    R.sea.push(row);
  }
  // A swell period of 26-46 world units is 115-205 screen pixels: three or four
  // crests over the whole sea, which is what a calm sea in this family looks
  // like. It was 2.6-4.4 and that is where the moiré came from.
  R.pitch = st.range(26, 46);
}
