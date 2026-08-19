// The desert biome — an erg riding on a rock plain, with playas in the lows.
//
// WHAT THIS IS STRUCTURALLY. Three surfaces, one field.
//
//   A SAND-SUPPLY ENVELOPE decides where sand exists at all. Where it is high a
//   directional fold builds dunes — long windward ramps, short slip faces at the
//   angle of repose; where it is low there is no sand and the bedrock plain is
//   bare; where it is low AND a second field agrees, the ground is a closed low
//   and holds a salt crust. The envelope multiplies the dune AMPLITUDE, so dune
//   fields have edges: they rise out of the plain and die back into it, and the
//   interdune corridors are the plain rather than a trough of the same sand.
//   That is the difference between a sand sea and a fold applied to a rectangle.
//
//   On top of that sits a DRAA — a second fold an order of magnitude longer, in
//   a different direction — so the frame has large-scale form and the dunes ride
//   on it instead of tiling it. And a plateau term puts a few buttes through
//   everything, which the terracing turns into stacks of benches for free.
//
// THE PLACEMENT AXIS IS HOW MOBILE THE GROUND IS. `sandCover` is a readout of
// the dune envelope: 1 on an active face, 0 on the exposed reg. Nothing built
// stands on active sand — track, poles, fences, camp and station are all
// admitted only where cover is low, which is what puts every structure in the
// corridors without any of it being composed. The three plants are three
// windows on the same number: bunchgrass never on mobile sand, a nebkha exactly
// at the margin because a nebkha IS a shrub that has caught its own mound, and
// saltbush on the pavement and the pan edge.
//
// THE THING THAT KILLED THE FIRST VERSION OF THIS FILE WAS COLOUR, NOT LANDFORM.
// Measured: 68-96 distinct colours in a frame where the city holds ~1,000 and
// the reference's own density is one new colour per ~200 pixels; a single olive
// held 39% of one frame. The cause was that the ground had ONE committed
// palette for the whole world, where the city mints a fresh one per block. So:
//
//   1. COLOUR IS COMMITTED PER REGION. The world is partitioned by a domain-
//      warped lattice — a curve-bounded blob about twenty units across, never a
//      rectangle and never the terrain cell — and each region mints its own
//      sand, its own rock, its own varnish, its own crust and its own gravel off
//      the shared families. Two dune fields in one frame are not the same sand,
//      and a stone standing on a region takes that region's rock.
//   2. TONE VARIES BY TERRACE LEVEL WITHIN THE REGION. A contour band is a
//      different value of the same material, so each region mints six sand tones
//      and indexes them by level. The jitter is deliberately WIDER than the
//      palette's own quantisation — `palette.js` rounds lightness as coarsely as
//      1/18, and the first attempt's +-7% wobble did not clear one step, which is
//      why every terrace drew the same colour.
//   3. THE MATERIAL SPLIT IS REAL. Sand, reg and crust are different families at
//      different hues, and the boundary between them is a contour of the supply
//      field, inked.
//   4. NOTHING IS CUT AT CELL RESOLUTION. Every patch, facet and region boundary
//      is a level set of a continuous warped field or a quadratic form, so it
//      walks off the lattice at every angle. `h3(floor(u/K), floor(v/K))` on the
//      raw coordinate draws the grid, and the grid was visible.
//
// AND THE LANDFORM FIX IS FEWER, WIDER TERRACES. A tread is `step / slope`, and
// at the old period the dune ramp ran at 0.42 rise per unit run, so a 2.9-unit
// step gave a seven-unit tread — the whole frame came out as thin parallel
// bands with a riser between each and read as a ploughed field. The period is
// now half again as long for a slightly lower dune, which halves the ramp slope,
// and the step is bigger: treads run 12-17 units on the ramp and stack into a
// four-riser dark band on the slip face, which is what a brink looks like.

import { fbm, tri, vnoise } from '../world.js';
import { makeTerrain, drawTerrain, walkTrack } from '../terrain.js';
import { drawSlab } from '../../core/iso.js';
import { h3 } from '../palette.js';
import { topFace } from '../faces.js';
import { localC } from '../stage.js';
import { coinWord, coinTag } from '../font.js';
import * as P from '../props/desert.js';
import * as S from '../props/street.js';
import * as RF from '../props/roof.js';
import { drawVehicle } from '../props/vehicles.js';
import { drawPerson } from '../props/people.js';

const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// A bilinear scalar field, six channels interleaved.
//
// The material boundaries have to be SMOOTH CONTOURS, not cell steps: a patch
// whose edge is quantised to the terrain cell reads as a mosaic, and the whole
// argument for putting the sand/rock boundary in the ground shader is that it
// comes out as a hand-drawn curve at an arbitrary angle. Interleaving the
// channels in one array is not tidiness — the shader runs once per ground pixel,
// and sharing one index computation across six samples is most of the difference
// between a 60ms frame and a 200ms one.

const NCH = 6;

function makeFields(X0, Y0, X1, Y1, cell, fn) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy * NCH);
  const g = new Float32Array(gx * gy * 2);
  const tmp = [0, 0, 0, 0, 0, 0];
  for (let j = 0; j < gy; j++) {
    const wy = Y0 + (j - 1) * cell;
    for (let i = 0; i < gx; i++) {
      fn(X0 + (i - 1) * cell, wy, tmp);
      const k = (j * gx + i) * NCH;
      for (let c = 0; c < NCH; c++) a[k + c] = tmp[c];
    }
  }
  // Gradient magnitude of channels 0 and 1, so the shader can cut a contour of
  // constant SCREEN width across a field whose slope varies by a factor of ten.
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const k = j * gx + i;
      const im = i > 0 ? i - 1 : i, ip = i < gx - 1 ? i + 1 : i;
      const jm = j > 0 ? j - 1 : j, jp = j < gy - 1 ? j + 1 : j;
      for (let c = 0; c < 2; c++) {
        const dx = (a[(j * gx + ip) * NCH + c] - a[(j * gx + im) * NCH + c]) / (2 * cell);
        const dy = (a[(jp * gx + i) * NCH + c] - a[(jm * gx + i) * NCH + c]) / (2 * cell);
        g[k * 2 + c] = Math.sqrt(dx * dx + dy * dy) + 1e-5;
      }
    }
  }
  return {
    gx, gy, cell, a, g,
    at(x, y, out) {
      let fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
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
    /** One channel only — the placement path never needs all six. */
    one(x, y, c) {
      let fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
      if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
      const tx = fx - i, ty = fy - j;
      const k = (j * gx + i) * NCH + c, k2 = k + gx * NCH;
      const lo = a[k] + (a[k + NCH] - a[k]) * tx;
      return lo + ((a[k2] + (a[k2 + NCH] - a[k2]) * tx) - lo) * ty;
    },
    grad(x, y, c) {
      let i = Math.floor((x - X0) / cell + 1), j = Math.floor((y - Y0) / cell + 1);
      if (i < 0) i = 0; else if (i > gx - 1) i = gx - 1;
      if (j < 0) j = 0; else if (j > gy - 1) j = gy - 1;
      return g[(j * gx + i) * 2 + c];
    },
  };
}

/** Distance to a polyline, sampled onto a grid and interpolated. */
function makeDistField(X0, Y0, X1, Y1, cell, pts, reach) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy).fill(reach);
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
  return {
    at(x, y) {
      let fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
      if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
      const tx = fx - i, ty = fy - j;
      const k = j * gx + i, k2 = k + gx;
      const lo = a[k] + (a[k + 1] - a[k]) * tx;
      return lo + ((a[k2] + (a[k2 + 1] - a[k2]) * tx) - lo) * ty;
    },
  };
}

/**
 * A patch of ground, bounded by a quadratic form.
 *
 * Returns 0 outside, 1 in the core, 2 in the rim. The boundary is an ellipse
 * arc at an arbitrary angle, which is the whole point — `pavementShade` in
 * `src/gen/city.js` is the worked example and the reason is the same: a stain
 * cut on the lattice reads as a tile and a stain cut on a conic reads as a
 * stain. Overlaid on a partition, never used AS one, because the complement of
 * a scatter of blobs is one connected mesh and a connected mesh of one tone is
 * exactly the flat region the measurement is looking for.
 */
function patch(u, v, pitch, salt, rate) {
  const pu = Math.floor(u / pitch), pv = Math.floor(v / pitch);
  const g = h3(pu, pv, salt);
  if ((g & 7) >= rate) return 0;
  const su = u - pu * pitch - pitch * (0.20 + ((g >>> 8) & 15) * 0.037);
  const sv = v - pv * pitch - pitch * (0.20 + ((g >>> 12) & 15) * 0.037);
  const rr = su * su * (0.55 + ((g >>> 17) & 7) * 0.14)
    + sv * sv * (0.62 + ((g >>> 21) & 7) * 0.12) + su * sv * 0.55;
  const RR = pitch * pitch * (0.055 + ((g >>> 25) & 15) * 0.0125);
  if (rr < RR) return 1;
  if (rr < RR * 1.38) return 2;
  return 0;
}

// ---------------------------------------------------------------------------

export function paintDesert(stage) {
  const { C, cv, iso, rng, X0, X1, Y0, Y1, H, seedN, tag, tagRaw, vis } = stage;
  const es = rng.stream('erg');
  const S0 = seedN | 0;
  const S1 = S0 + 7717;

  // ---------------------------------------------------------------- the wind
  // THE WIND DIRECTION IS CHOSEN AGAINST THE PROJECTION, NOT AGAINST THE MAP.
  // Crests run perpendicular to the wind, and a crest along world (1,-1) is
  // EXACTLY HORIZONTAL on screen — the one direction `docs/CRAFT.md` calls a bug
  // rather than a style choice, because it is off-axis for both the 2:1 lattice
  // and the vertical. So the crest's SCREEN slope is drawn first, in a band that
  // avoids horizontal at one end and the lattice at the other, and the wind
  // vector is solved back out of it. Solved as a ratio of two numbers rather
  // than as a quotient, because the quotient is singular at slope 1/2 and 1/2 is
  // inside the band.
  const mkDir = (m) => {
    const ax = 1 - 2 * m, ay = 1 + 2 * m;
    const n = Math.sqrt(ax * ax + ay * ay);
    return [ax / n, ay / n];
  };
  const [wx, wy] = mkDir(es.range(0.30, 0.64) * (es.bool(0.5) ? 1 : -1));
  const [dxD, dyD] = mkDir(es.range(0.28, 0.70) * (es.bool(0.5) ? 1 : -1));

  // A LONG PERIOD IS THE WHOLE LANDFORM FIX. Tread = step / slope, and the ramp
  // slope is amp / (sharp * period): at period 115 and amp 19 that is 0.21, so a
  // 3.4-unit step gives a sixteen-unit tread. Halve the period and it is eight,
  // which is corduroy.
  const period = es.range(112, 168);
  // The warp bends the crests. Its gradient must stay well under the fold's own
  // (1/period) or the fold locally reverses and the contours shred into single-
  // cell chevrons — measured by eye on the first attempt. One octave of value
  // noise at a long wavelength, so the bend is a slow curve rather than a wobble.
  const warp = es.range(0.42, 0.62);
  const fw = es.range(0.0055, 0.0090);
  // AMPLITUDE IS BOUNDED BY THE TREAD, NOT BY THE PICTURE OF A BIG DUNE.
  //
  // Measured on the field itself rather than guessed: a walk along the wind at
  // the first attempt's numbers gave a MEDIAN tread of 6.4 world units against
  // the eight below which a terraced field is corduroy by construction. The
  // arithmetic is forced — tread is step/slope and the mean slope over a dune is
  // 2*amp/period — so wide treads are bought by lowering relief or raising the
  // riser, and a riser over about four units is a retaining wall rather than a
  // contour. So: a lower dune on a long period, and a draa that swells rather
  // than folds.
  // AND THE BOUND IS A SCREEN BOUND, NOT A WORLD ONE. A riser occupies
  // `2*S*step + S*cell` pixels of frame height — about twenty at step 3.5 — and a
  // tread of T world units along the wind occupies about 2.1*T. Corduroy is what
  // you get when those two are the same number, which they were: T = step/slope
  // and the mean slope of a dune is 2*amp/period, so at amp 15 on a 145 period
  // the tread was 17 units against a riser 20 pixels tall. The amplitude is
  // therefore CAPPED BY THE PROJECTION at about a sixteenth of the period, which
  // is a low broad dune — and a low broad dune is what an erg looks like from
  // this angle anyway. The form comes back in the slip face and the material.
  //
  // AND THE SEED DOES NOT GET TO DECIDE IT BY LUCK. The relation is exact and it
  // is worth writing down, because it is the whole of this defect:
  //
  //     tread on screen   2.1 * step / slope                    2.1
  //     ------------- =  -------------------------  =  ---------------------
  //     riser on screen   4 * step + 2 * cell           slope * (4 + 2*cell/step)
  //
  // The STEP CANCELS. Raising it widens the tread and deepens the riser in the
  // same proportion, so the stripiness of a terraced field is set by its MEAN
  // SLOPE and by nothing else. Fixing the amplitudes and hoping is what made
  // some seeds read as dune fields and others as quarry benches from identical
  // code. So the relief is measured over exactly the ground that will be drawn
  // and scaled to hit a slope target, and the step is then solved from the
  // scaled amplitude. Nothing is chosen that can be measured.
  const amp = es.range(9, 13);
  const sharp = es.range(0.80, 0.88);
  // TERRACE COUNT IS SPECIFIED AS A PICTURE and the step is solved from it, so a
  // seed with a taller dune gets taller terraces rather than more of them. Three
  // to four bands from trough to brink, not six: a tread is `step / slope`, the
  // windward ramp runs at about 0.20, and three bands over a twenty-unit dune
  // gives a thirty-unit tread on the ramp against nine on the slip face. THAT
  // CONTRAST IS THE DUNE FORM — wide pale bands on the windward side, a tight
  // stack of four risers at the brink. Equal bands everywhere is corduroy, and
  // corduroy is what six bands produced.
  const cell = es.range(2.8, 3.3);
  const tgtSlope = es.range(0.115, 0.150);
  const bands = es.range(2.5, 3.3);

  // The draa: a second fold ten times longer in a different direction, so the
  // frame carries large-scale form and the dunes ride on it rather than tiling
  // the rectangle.
  const dPeriod = es.range(340, 500);
  const dAmp = es.range(3, 5.5);
  const rollAmp = es.range(1.1, 2.2);
  // A CONTOUR OF A SMOOTH RAMP IS A STRAIGHT LINE, and a set of them is a ruled
  // page. Whatever the tread arithmetic says, a dune ramp terraced without any
  // mid-scale irregularity comes out as eight parallel bands running edge to
  // edge, because that is genuinely what the field's level sets are. The wobble
  // is deliberately BELOW the ramp's own gradient — about half — so it displaces
  // each contour sideways by six or eight units without adding crossings.
  const wobAmp = es.range(1.2, 2.0);
  const wobF = es.range(0.013, 0.019);

  // Where sand exists at all. Multiplying the dune AMPLITUDE by this rather than
  // adding a mask is what gives dune fields edges instead of a uniform corduroy.
  // The transition is deliberately WIDE: the envelope edge is itself a slope, and
  // a narrow edge puts a twenty-unit escarpment of stacked risers around every
  // dune field, which is corduroy arriving by the back door.
  const supF = es.range(0.0032, 0.0044);
  // AND THE RIDGE MUST BREAK. A transverse fold of constant amplitude is a
  // corrugated roof however far apart the folds are: what makes a dune field
  // read as dunes is that individual crests rise, run and die out, leaving gaps
  // that the next set covers. One mid-frequency field on the amplitude does it,
  // and it is the same mechanism a barchan field actually has.
  const segF = es.range(0.011, 0.017);

  // THE THRESHOLDS ARE QUANTILES OF THE FIELD, NOT CONSTANTS ON IT.
  //
  // A fixed cut on an fbm is a cut on an unknown distribution: measured over six
  // seeds, the sand/reg/pan split came out 57/43/0, 10/73/17, 79/19/2 and
  // 100/0/0. One seed was a sand sea with no ground and another was a gravel
  // plain with no dunes, from the same code, because the field's LEVEL over the
  // visible world drifts seed to seed and the constants did not follow it. The
  // supply field is therefore sampled over exactly the region that will be drawn
  // and the cuts are taken as order statistics, so the seed still chooses how
  // much of its frame is erg — it just chooses it in units of AREA rather than in
  // units of a noise value it cannot see.
  const qOf = (f, ps) => {
    const a = [];
    for (let y = Y0; y < Y1; y += 6) {
      for (let x = X0; x < X1; x += 6) {
        if (!vis(x - 3, y - 3, x + 3, y + 3, 30)) continue;
        a.push(f(x, y));
      }
    }
    a.sort((p, q) => p - q);
    const n = a.length - 1;
    return ps.map((p) => a[Math.max(0, Math.min(n, Math.round(p * n)))]);
  };
  // AND THE ERG IS THE MINORITY OF THE FRAME. An active dune face honestly
  // carries nothing — no plant roots in moving sand, nobody builds on it — so
  // every unit of it is a unit that has to be articulated by the ground shader
  // alone, and the ground shader is not allowed to buy articulation with noise.
  // The reg is where the stones, the scrub, the track, the camp and the wire
  // live. Half the frame stony, a third sand, the rest crust.
  const pLo = es.range(0.44, 0.58), pHi = pLo + es.range(0.22, 0.30);
  const [supLo, supHi] = qOf((x, y) => fbm(x * supF, y * supF, S0 + 911, 3),
    [pLo, Math.min(0.92, pHi)]);
  const supW = Math.max(0.012, supHi - supLo);
  // (1 - env) SQUARED, because the linear form put a playa over most of the reg:
  // a pan is a CLOSED low, not "anywhere without dunes", and one seed came out
  // with half its frame in crust polygons.
  const [panBias] = qOf((x, y) => fbm(x * 0.0072, y * 0.0072, S0 + 1301, 3),
    [es.range(0.72, 0.84)]);
  const panDepth = es.range(2.6, 4.2);

  // --------------------------------------------------------------- plateaus
  // A butte is a plateau term added to the field, which the terracing then turns
  // into a stack of steep-sided benches for free. Placed on a coarse hash
  // lattice so they are sparse and never adjacent.
  const MC = 148;
  const mesaAt = (x, y) => {
    let h = 0;
    const gi = Math.floor(x / MC), gj = Math.floor(y / MC);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = gi + di, j = gj + dj;
        const q = h3(i, j, S0 ^ 0x51a9);
        if ((q & 255) > 66) continue;
        const cx = (i + 0.18 + ((q >>> 8) & 255) / 400) * MC;
        const cy = (j + 0.18 + ((q >>> 16) & 255) / 400) * MC;
        const R = 20 + ((q >>> 24) & 31) * 0.86;
        const q2 = h3(i, j, S0 ^ 0x77c3);
        // A CLIFF STEEPER THAN ABOUT ONE LEVEL PER CELL IS NOT A CLIFF, IT IS A
        // COMB. `drawTerrain` gives each cell its own +x and +y wall and inks a
        // vertical arris wherever a cell stands two terraces proud of both near
        // neighbours; at rim 5 and height 30 that is three levels per three-unit
        // cell, and six seeds came back with a forest of pillars where the buttes
        // should have been. The rim is now wide enough that the terracing has
        // room to make a stepped bench out of it.
        const HM = 11 + (q2 & 31) * 0.40;
        const rim = 11.0 + ((q2 >>> 8) & 15) * 0.60;
        // an elliptical footprint at an arbitrary angle: a quadratic form, so
        // the butte's plan is a curve that conforms to nothing
        const ea = 0.72 + ((q2 >>> 12) & 15) / 26;
        const eb = 0.72 + ((q2 >>> 17) & 15) / 26;
        const ec = (((q2 >>> 22) & 31) / 31 - 0.5) * 0.8;
        const du = x - cx, dv = y - cy;
        const dd = Math.sqrt(Math.max(0, du * du * ea + dv * dv * eb + du * dv * ec));
        const t = cl01((R - dd) / rim);
        if (t > 0) h += HM * sm(t) + HM * 0.06 * (du / R);
      }
    }
    return h;
  };

  // ------------------------------------------------------ the material field
  // Everything the biome admits, vetoes or paints is a readout of these six
  // numbers, and they are evaluated ONCE on a grid rather than per pixel and per
  // candidate.
  //
  //   0  sandCover   1 = active dune face, 0 = bare reg
  //   1  pan         the salt crust in the closed lows
  //   2  varnish     a mid-frequency field: selects rock tone, and its 0.5
  //                  contour is a sand stringer threading the plain
  //   3  fold        the dune's own phase, which the ripple sets ride on
  //   4  warpU       a domain-warped world x — the region and facet partitions
  //   5  warpV       a domain-warped world y   are level sets of these two
  //
  // 4 and 5 are the mechanism that stops the cell grid showing. `floor(u/K)` on
  // the raw coordinate is an axis-aligned rectangle at cell resolution — the
  // exact defect measured on the first attempt. `floor(warpU/K)` is a curve-
  // bounded blob, and because the warp is a smooth function of position it is
  // still a PARTITION: every pixel belongs to exactly one cell, so no tone can
  // percolate across the frame.
  const RC = es.range(19, 26);
  const rWarp = RC * es.range(0.50, 0.80);
  const rwF = es.range(0.010, 0.017);
  const fieldCell = 3.1;
  const MF = makeFields(X0 - 8, Y0 - 8, X1 + 8, Y1 + 8, fieldCell, (x, y, out) => {
    const t = (x * wx + y * wy) / period + (vnoise(x * fw, y * fw, S0 + 41) - 0.5) * warp;
    const f = tri(t);
    const crest = f < sharp ? f / sharp : 1 - (f - sharp) / (1 - sharp);
    const env = sm(cl01((fbm(x * supF, y * supF, S0 + 911, 3) - supLo) / supW));
    const mz = mesaAt(x, y);
    // A butte is bedrock: it carries no sand however much the envelope supplies.
    const bare = mz > 0.5 ? cl01(1 - (mz - 0.5) / 2.5) : 1;
    // THE MATERIAL AXIS FOLLOWS THE SUPPLY, NOT THE DUNE PHASE.
    //
    // Multiplying the envelope by the crest profile made the sand/rock boundary a
    // function of the fold, so the material came out in parallel stripes at the
    // dune period — a reg band and a sand band alternating across the whole
    // frame, which is the corduroy again in a second channel. Sand now exists
    // where sand is SUPPLIED; the fold only tips the balance at the margin. The
    // consequence is structural rather than cosmetic: where the envelope is low
    // there is no dune amplitude either, so the reg lands on flat ground and
    // carries almost no terraces at all.
    out[0] = cl01(env * 1.16 - 0.14 + 0.16 * (crest - 0.5)) * bare;
    const dry = 1 - env;
    out[1] = dry * dry * bare
      * cl01((fbm(x * 0.0072, y * 0.0072, S0 + 1301, 3) - panBias) * 5.5);
    out[2] = fbm(x * 0.0235, y * 0.0235, S0 + 613, 3);
    out[3] = t;
    out[4] = x + rWarp * (fbm(x * rwF, y * rwF, S0 + 1777, 2) - 0.5);
    out[5] = y + rWarp * (fbm(x * rwF, y * rwF, S0 + 2777, 2) - 0.5);
  });

  const relief = (x, y) => {
    const t = (x * wx + y * wy) / period + (vnoise(x * fw, y * fw, S0 + 41) - 0.5) * warp;
    const f = tri(t);
    const crest = f < sharp ? f / sharp : 1 - (f - sharp) / (1 - sharp);
    // ASYMMETRY IS THE WHOLE FORM. A dune has a long windward ramp and a short
    // slip face at the angle of repose, and it is the slip face that makes it
    // read as a dune rather than as a contour map: on the ramp the terraces come
    // out wide and pale, on the slip face they stack into a dark band four
    // risers deep. Smoothstep only the windward half, so the crest is rounded
    // and the brink stays a brink.
    const dune = f < sharp ? sm(crest) : crest;
    const env = sm(cl01((fbm(x * supF, y * supF, S0 + 911, 3) - supLo) / supW))
      * (0.45 + 1.05 * fbm(x * segF, y * segF, S0 + 1601, 2));
    const dr = tri((x * dxD + y * dyD) / dPeriod);
    return dAmp * sm(dr) + env * amp * dune
      + wobAmp * (fbm(x * wobF, y * wobF, S0 + 1451, 2) - 0.5) * 2
      + rollAmp * fbm(x * 0.0105, y * 0.0105, S0 + 97, 3)
      - panDepth * (1 - env) * (1 - env)
        * cl01((fbm(x * 0.0072, y * 0.0072, S0 + 1301, 3) - panBias) * 5.5);
  };

  // MEASURE THE SLOPE THIS SEED ACTUALLY HAS, along the wind, which is the
  // steepest direction and therefore the one that decides the tread. Twelve
  // walks across the visible world is enough to be stable and costs under a
  // millisecond.
  let acc = 0, nAcc = 0;
  {
    const DS = 2.2;
    for (let k = 0; k < 12; k++) {
      const bx = X0 + (X1 - X0) * (0.30 + (k % 4) * 0.16);
      const by = Y0 + (Y1 - Y0) * (0.30 + ((k / 4) | 0) * 0.16);
      let prev = relief(bx, by);
      for (let i = 1; i < 56; i++) {
        const h = relief(bx + wx * i * DS, by + wy * i * DS);
        acc += Math.abs(h - prev) / DS; nAcc++; prev = h;
      }
    }
  }
  // Capped rather than solved exactly: a seed whose field is already gentle is
  // left alone rather than inflated into a dune field it does not have.
  const KR = Math.min(1.0, tgtSlope / Math.max(1e-4, acc / Math.max(1, nAcc)));
  const step = Math.min(4.4, Math.max(2.9, amp * KR / bands));
  const height = (x, y) => relief(x, y) * KR + mesaAt(x, y);

  const T = makeTerrain({ X0, Y0, X1, Y1, cell, step, height });
  stage.terrain = T;

  // ------------------------------------------------------- the region palette
  // ONE COMMITTED SUB-PALETTE PER REGION, minted off the shared families exactly
  // as a city block mints its own pavement. The jitters below are all wider than
  // the palette's own quantisation — `mk` rounds hue as coarsely as 8.5 degrees
  // and lightness as coarsely as 1/18 — because a local commitment that lands
  // back on the shared tone is not local, and that is precisely what the first
  // attempt did.
  const gi0 = Math.floor((X0 - rWarp) / RC), gi1 = Math.ceil((X1 + rWarp) / RC);
  const gj0 = Math.floor((Y0 - rWarp) / RC), gj1 = Math.ceil((Y1 + rWarp) / RC);
  const rnw = gi1 - gi0 + 1, rnh = gj1 - gj0 + 1;
  const REG = new Array(rnw * rnh).fill(null);

  // A DESERT IS A HUE BAND, AND THE SCENE'S OWN DRIFT MUST NOT LEAVE IT.
  //
  // `palette.js` gives each scene up to +-32 degrees of accent drift and +-43 of
  // neutral drift, on purpose: a warm sand city and a cool blue one are different
  // pictures. Applied at full strength to the GROUND of a desert it produced a
  // magenta reg and an olive erg — measured by eye on three seeds — and a colour
  // has to MEAN something. Sand means sand. So the scene's drift is taken at
  // about two-fifths, which keeps a desert noon and a desert dusk visibly
  // different scenes while sand stays inside 26-55 degrees, rock inside 12-47 and
  // varnish inside 4-33.
  const pull = (fam, home, k) => home + (fam._h - home) * k;
  const SAND_H = pull(C.sandy, 41, 0.42);
  const ROCK_H = pull(C.taupe, 29, 0.40);
  const VARN_H = pull(C.terra, 17, 0.44);
  const CRUST_H = pull(C.cream, 45, 0.40);

  const mkReg = (gi, gj) => {
    const u = (k) => (h3(gi, gj, S0 ^ k) >>> 8) / 16777216;
    // this region's sand, rock and crust — three families, three hues
    const sh = SAND_H + (u(0x11) - 0.5) * 22;
    const ss = Math.max(0.15, C.sandy._s * (0.74 + u(0x13) * 0.92));
    // Capped at 0.86: above that hsl washes every hue out and the erg came back
    // as paper rather than as sand, on two seeds out of six.
    const sl = Math.min(0.86, Math.max(0.56, C.sandy._L * (0.82 + u(0x15) * 0.26)));
    // SIX LEVEL TONES, EACH WITH THREE NEAR SHEETS.
    //
    // The level tone is hashed wide, because a terrace is a different band of the
    // ground and the whole colour argument rests on those being distinct. The
    // three sheets inside one level are NOT: they are the same sand at +-6% of
    // lightness and four degrees of hue, because a sand sheet that changes tone
    // by a whole ladder step every seven units is camouflage, which is what the
    // facet lattice produced when it picked from unrelated level tones.
    const sandLv = [];
    for (let i = 0; i < 6; i++) {
      const q = (h3(gi, gj, S0 ^ (0x21 + i)) >>> 8);
      // VALUE, not hue and not chroma. Jittering all three per level gave a dune
      // whose terraces went cream, pink, orange — three materials stacked, not
      // one material contoured. The lightness walk is 0.84 to 1.16 in eight steps
      // of 0.045, which clears the palette's coarsest lightness quantisation
      // (1/18) when two levels land two steps apart, which the level-to-index
      // wrap makes the common case; hue moves five degrees at most, which does
      // not, because a contour band is a value of the sand and not another sand.
      const lh = sh + ((q & 15) / 15 - 0.5) * 9;
      const lss = ss * (0.92 + ((q >>> 4) & 15) / 15 * 0.17);
      const lsl = Math.min(0.90, sl * (0.90 + ((q >>> 8) & 7) * 0.029));
      sandLv.push([
        C.mk(lh - 4, lss * 1.06, Math.max(0.30, lsl * 0.935)),
        C.mk(lh, lss, lsl),
        C.mk(lh + 4, lss * 0.94, Math.min(0.92, lsl * 1.07)),
      ]);
    }
    const kh = ROCK_H + (u(0x41) - 0.5) * 26;
    const ks = C.taupe._s * (0.70 + u(0x43) * 1.50);
    // A LAG PAVEMENT IS DARK, and this is where a desert's ink honestly lives.
    // Measured at 4-9% of the frame under luma 50 against a 10-19% band, and the
    // project's whole record says the fix is never more black strokes. The reg
    // carries a varnish skin that is genuinely a dark material, and making it one
    // buys the ink as GROUND rather than as outline.
    const kl = Math.max(0.28, C.taupe._L * (0.64 + u(0x45) * 0.40));
    const rock = [];
    for (let i = 0; i < 3; i++) {
      const q = (h3(gi, gj, S0 ^ (0x51 + i)) >>> 8);
      rock.push(C.mk(kh + ((q & 15) / 15 - 0.5) * 22,
        ks * (0.72 + ((q >>> 4) & 15) / 15 * 0.70),
        Math.min(0.90, kl * (0.82 + ((q >>> 8) & 7) * 0.052))));
    }
    // Desert varnish: the dark red-brown skin on a lag pavement. It is the one
    // place the reg gets a saturated hue, and it is a different dark from every
    // other dark in the frame, which is the open "one colour below luma 16"
    // defect attacked where the ground is largest.
    const varn = C.mk(VARN_H + (u(0x61) - 0.5) * 24,
      C.terra._s * (0.30 + u(0x63) * 0.46),
      Math.min(0.38, Math.max(0.13, C.terra._L * (0.24 + u(0x65) * 0.26))));
    const grit = C.mk(pull(C.stone, 37, 0.45) + (u(0x71) - 0.5) * 22,
      C.stone._s * (0.60 + u(0x73) * 1.10),
      Math.min(0.94, Math.max(0.52, C.stone._L * (0.88 + u(0x75) * 0.26))));
    const crust = [];
    for (let i = 0; i < 4; i++) {
      const q = (h3(gi, gj, S0 ^ (0x81 + i)) >>> 8);
      crust.push(C.mk(CRUST_H + ((q & 15) / 15 - 0.5) * 18,
        C.cream._s * (0.26 + ((q >>> 4) & 15) / 15 * 0.60),
        Math.min(0.93, C.cream._L * (0.82 + ((q >>> 8) & 7) * 0.030))));
    }
    return {
      sandLv, rock, varn, grit, crust,
      drift: C.mk(sh + (u(0xa1) - 0.5) * 10, ss * 0.90,
        Math.min(0.89, sl * (1.03 + u(0xa3) * 0.06))),
      pw1: 20 + (u(0x91) * 13),          // varnish sheets
      pw2: 11 + (u(0x93) * 7),           // gravel sheets
      fp: 6.4 + (u(0x95) * 3.4),         // facet pitch
      rk: (0.80 + u(0x97) * 0.45),       // ripple pitch multiplier
    };
  };

  for (let gj = gj0; gj <= gj1; gj++) {
    for (let gi = gi0; gi <= gi1; gi++) {
      const x0 = gi * RC - rWarp, x1 = (gi + 1) * RC + rWarp;
      const y0 = gj * RC - rWarp, y1 = (gj + 1) * RC + rWarp;
      if (!vis(x0, y0, x1, y1, 70)) continue;
      REG[(gj - gj0) * rnw + (gi - gi0)] = mkReg(gi, gj);
    }
  }
  const REG0 = mkReg(0x3a1, 0x5b2);
  const regAt = (ru, rv) => {
    let gi = Math.floor(ru / RC) - gi0, gj = Math.floor(rv / RC) - gj0;
    if (gi < 0) gi = 0; else if (gi >= rnw) gi = rnw - 1;
    if (gj < 0) gj = 0; else if (gj >= rnh) gj = rnh - 1;
    return REG[gj * rnw + gi] || REG0;
  };
  /** The region a world point stands in — for props, so a stone matches its ground. */
  const regOf = (x, y) => regAt(MF.one(x, y, 4), MF.one(x, y, 5));

  // Vegetation and made things stay frame-level: a colour must MEAN something,
  // and scrub green is scrub everywhere in the frame. Two rocks on one slope may
  // not have their own hue; a bush and a bush are the same bush.
  const cs = rng.stream('ergcolour');
  const SCRUB = [
    C.mk(C.lime._h + cs.range(-16, 8), C.lime._s * cs.range(0.30, 0.58), C.lime._L * cs.range(0.62, 0.88)),
    C.mk(C.grass._h + cs.range(-14, 14), C.grass._s * cs.range(0.24, 0.50), C.grass._L * cs.range(0.68, 1.00)),
    C.mk(C.amber._h + cs.range(-10, 10), C.amber._s * cs.range(0.28, 0.52), C.amber._L * cs.range(0.62, 0.86)),
  ];
  const GRADE = C.mk(C.concrete._h + cs.range(-12, 12), C.concrete._s * cs.range(0.6, 1.7),
    Math.min(0.94, C.concrete._L * cs.range(0.78, 0.96)));
  const BONE = C.mk(C.white._h, C.white._s * 0.6, 0.93);

  // ------------------------------------------------------------- the ground
  const HAM = es.range(0.25, 0.33);          // reg / sand boundary
  const ACT = es.range(0.40, 0.56);          // fold phase above which sand moves
  // RIPPLE WAVELENGTH, WORLD UNITS. At seven the three-tone banding came out as
  // brushed wood at 3px a stripe — density bought with variation, which is the
  // one thing `docs/BAR.md` forbids by name — and it ran in the same direction as
  // the terrace edges, so it doubled the corduroy instead of breaking it. A sand
  // sheet is now ONE flat facet with a single ripple crest drawn across it every
  // dozen units: a flat field closed by a stroke, which is the house idiom.
  const ripL = es.range(10, 16);
  const strP = es.range(8.0, 12.0);          // sand-streak pitch, world units
  const buf = [0, 0, 0, 0, 0, 0];

  /**
   * A LENS OF SAND, STRETCHED ALONG THE WIND.
   *
   * The first two attempts at a sand surface were both periodic: a three-tone
   * ripple band at seven units, then a single crest line at twelve. Both read as
   * a woven material, because a periodic set parallel to the terrace contours is
   * the corduroy again at a finer pitch. This is the same quadratic form as
   * `patch`, evaluated in WIND-ALIGNED coordinates and stretched three and a half
   * to one along the flow, so each mark is an irregular streak lying down the
   * wind — across every terrace edge in the frame rather than along them — and
   * they arrive at irregular intervals rather than on a ruler.
   */
  const streak = (u, v, pitch, salt, rate, ex) => {
    const a = (u * wx + v * wy) / ex, b = u * -wy + v * wx;
    const pu = Math.floor(a / pitch), pv = Math.floor(b / pitch);
    const g = h3(pu, pv, salt);
    if ((g & 7) >= rate) return 0;
    const su = (a - (pu + 0.18 + ((g >>> 8) & 15) * 0.042) * pitch) * ex;
    const sv = b - (pv + 0.18 + ((g >>> 12) & 15) * 0.042) * pitch;
    const rr = su * su / (ex * ex) * (0.60 + ((g >>> 17) & 7) * 0.11)
      + sv * sv * (0.70 + ((g >>> 21) & 7) * 0.10);
    const RR = pitch * pitch * (0.055 + ((g >>> 25) & 15) * 0.013);
    if (rr < RR) return 1;
    if (rr < RR * 1.42) return 2;
    return 0;
  };
  // The facet lattice is rotated off both the region lattice and the world axes,
  // so the two partitions never share a boundary and neither shares one with the
  // 2:1 grid.
  const FA = 0.8746, FB = 0.4848;

  const groundTop = (u, v, z) => {
    MF.at(u, v, buf);
    const sc = buf[0], pn = buf[1], vf = buf[2], fold = buf[3];
    const ru = buf[4], rv = buf[5];
    const R = regAt(ru, rv);
    const li = ((Math.round(z / step) % 6) + 6) % 6;

    // ---- the playa, and its own closing loop
    if (pn > 0.26) {
      const gp = MF.grad(u, v, 1);
      // the pan's shore, in the rock's own dark rather than in the shared ink:
      // this is a material edge, not a silhouette
      if (pn < 0.28 + 0.085 * gp) return R.rock[1].k;
      // Polygonal cracking: a jittered-site cell pattern, so each crust plate is
      // a flat field CLOSED by a line in the crust's own dark. This is the ink-
      // closure technique applied to bare ground, and a cracked crust is one of
      // the few ground surfaces that honestly carries loops.
      const CW = 4.6;
      const gu = Math.floor(u / CW), gv = Math.floor(v / CW);
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const hh = h3(gu + di, gv + dj, S1 + 3);
          const sx = (gu + di + 0.18 + ((hh >>> 8) & 255) / 385) * CW;
          const sy = (gv + dj + 0.18 + ((hh >>> 16) & 255) / 385) * CW;
          const dx = u - sx, dy = v - sy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; best = hh; } else if (d < d2) d2 = d;
        }
      }
      const K = R.crust[best & 3];
      if (d2 - d1 < 0.28) return K.k;
      if (d2 - d1 < 0.60) return ((best >>> 5) & 1) ? K.l : K.r;
      return ((best >>> 6) & 3) === 0 ? K.l : K.t;
    }

    // ---- the material boundary between sand and rock, one pixel of ink.
    // It is a contour of the supply field, so it is a curve at every angle, and
    // it is the loop that closes the largest two fields in the frame off each
    // other. Width is normalised by the gradient so it stays one pixel wherever
    // the field is steep or slack.
    const gs = MF.grad(u, v, 0);
    if (sc > HAM - 0.05 * gs && sc < HAM + 0.05 * gs) return C.black;
    // The dune's own phase, for everything that is about the FOLD rather than
    // about the material: two operations rather than a seventh field channel.
    const ffp = tri(fold);
    const crest = ffp < sharp ? ffp / sharp : 1 - (ffp - sharp) / (1 - sharp);

    // ---- the facet partition. Level sets of the warped coordinate, rotated,
    // at about seven units — big enough to be a facet of ground and small enough
    // that no single tone can hold a region the measurement would flag.
    const fa = ru * FA + rv * FB, fb = rv * FA - ru * FB;
    const fh = h3(Math.floor(fa / R.fp), Math.floor(fb / R.fp), S1 + 71);

    if (sc < HAM) {
      // ---- the reg: a lag pavement, varnished in sheets, threaded with sand
      const RK = R.rock[vf < 0.40 ? 0 : vf < 0.58 ? 1 : 2];
      const e = vf - 0.5;
      const ge = 0.075;
      if (e > -ge && e < ge) {
        // A SAND STRINGER: the 0.5 contour of a mid-frequency field, cut to a
        // ribbon a few units wide. It threads the plain at every angle and it is
        // the largest off-lattice ground form in the frame.
        const SD = R.sandLv[(li + 4) % 6][1];
        return (e > -ge * 0.34 && e < ge * 0.34) ? SD.t : SD.l;
      }
      const pv = patch(u, v, R.pw1, S1 + 11, 3);
      if (pv) return pv === 1 ? R.varn.t : R.varn.l;
      const pg = patch(u, v, R.pw2, S1 + 23, 3);
      if (pg) return pg === 1 ? R.grit.t : R.grit.l;
      const q = fh & 7;
      return q < 3 ? RK.t : q < 6 ? RK.l : RK.r;
    }

    // ---- the erg.
    const LV = R.sandLv[li];
    const SD = LV[1];
    const ff = ffp;

    // THE SLIP FACE IS WHERE A DUNE STOPS BEING A CONTOUR MAP.
    //
    // Sand standing at the angle of repose avalanches in chutes, and the band
    // just under the brink is the darkest thing on a dune. This is the whole
    // reason the fold is asymmetric: on the windward ramp the terraces come out
    // wide and pale, and here they stack four deep behind a dark striped face.
    // Drawn in the SAND'S OWN darks, never in the shared ink — `docs/BAR.md`
    // records that interior form drawn in the silhouette colour is why a fifth of
    // the frame was once near-black — and the chutes run down the face because
    // their coordinate is the across-wind one.
    //
    // AND IT IS GATED ON THERE BEING A DUNE. The envelope is recoverable from
    // the material axis, and it has to be: with the amplitude capped by the
    // projection, a lee phase over ground the envelope has flattened is not a
    // slip face, it is level sand — and shading it dark anyway drew four
    // frame-wide bands of near-black across a flat erg, which is the corduroy a
    // third time, now in the value channel. Measured by eye on seed 2 of six.
    const env = (sc + 0.14 - 0.16 * (crest - 0.5)) / 1.16;
    // THE BRINK CATCHES THE LIGHT. A dark face alone is a stripe; a pale line
    // with a dark face under it is an edge, and the edge is the thing that says
    // dune. It is drawn on both sides of the crest phase, so it is the top of
    // the windward ramp and the lip of the slip face at once.
    if (env > 0.68 && crest > 0.93) return LV[2].t;
    if (ff > sharp && env > 0.72) {
      const t2 = (ff - sharp) / (1 - sharp);
      const pw = u * -wy + v * wx;
      const g = h3(Math.floor(pw / 3.4), Math.floor(fold), S1 + 131) & 7;
      if (t2 < 0.10) return SD.k;                    // the brink shadow
      if (t2 > 0.52) return g < 3 ? LV[2].l : SD.l;  // the apron at the foot
      return g < 2 ? SD.d : g < 5 ? SD.r : SD.l;
    }

    // THE SHEET. One large flat facet in a tone this region owns. Value contrast
    // INSIDE a sand sheet has to be small: the strong steps in this frame are the
    // terrace risers and the slip face, and a sheet that carries its own ladder
    // turns a dune into a plank — and a facet lattice of unrelated tans turns it
    // into camouflage, which is the failure the measurement script names by name.
    // "Active" is a statement about the FOLD — the upper windward face and the
    // brink, where the sand is moving — not about how much sand there is.
    const active = crest > ACT;
    const q = fh & 15;
    const base = LV[q < 5 ? 0 : q < 12 ? 1 : 2];

    // Deflation: where the sheet is thin the grit beneath comes through, in
    // hollows tens of units across.
    if (!active) {
      const p3 = patch(u, v, R.pw2 * 1.35, S1 + 97, 2);
      if (p3) return p3 === 1 ? R.grit.t : R.grit.l;
    }
    // Wind streaks: fresh sand lying pale down the flow, and the scoured lane
    // beside it. Two independent sets so they overlap at their own rate.
    const sk = streak(u, v, strP, S1 + 83, 3, 3.6);
    if (sk) return sk === 1 ? R.drift.t : R.drift.l;
    const sd2 = streak(u, v, strP * 1.7, S1 + 89, 2, 3.0);
    if (sd2) return sd2 === 1 ? (active ? base.l : R.grit.l) : base.r;
    // Ripple crests, and ONLY on the upper windward face, which is where a dune
    // has them: one stroke per set at a dozen units, so it is a line closing a
    // flat field rather than the frame-wide weave the first two attempts drew.
    if (crest > 0.68 && env > 0.6) {
      const rr = tri(fold * (period / ripL) * R.rk + ((fh >>> 9) & 255) / 256);
      if (rr < 0.13) return base.l;
    }
    return base.t;
  };

  const groundSide = (u, v, plane, axis, q, z0) => {




    const x = axis === 1 ? plane : u, y = axis === 1 ? u : plane;
    MF.at(x, y, buf);
    const R = regAt(buf[4], buf[5]);
    if (buf[1] > 0.28) {
      const F = R.crust[1];
      return v < 0.5 ? F.k : axis === 1 ? F.d : F.r;
    }
    // A TERRACE RISER IS A LIT FACE WITH A CONTACT LINE. A BUTTE WALL IS NOT.
    //
    // These are one code path and they were being shaded as one thing, at `.d`
    // and `.k`, and that single decision was most of the corduroy. A frame whose
    // ground is a pale reg gently contoured came out as pale treads separated by
    // near-black bands twenty pixels deep, every ninety pixels, edge to edge —
    // and it reads as a ploughed field however wide the treads are, because what
    // the eye follows is the value step and not the geometry. The terrace break
    // is ALREADY inked by the silhouette sweep, which tags terrain one tag per
    // level; a second dark band under it is ink spent twice on one edge.
    //
    // So: the common case, a riser one or two terraces tall, takes the ordinary
    // box ladder — the two walls are the same two faces every box in this
    // generator shows. Only where the drop is genuinely a cliff does the wall go
    // to strata in the rock's darks, and there it is a butte and should.
    const tall = v > step * 1.25;
    if (buf[0] >= HAM) {
      // The riser belongs to the terrace ABOVE it: a contour band is a different
      // value of the same material and the wall is the step between two of them.
      const F = R.sandLv[((Math.round(z0 / step + 1) % 6) + 6) % 6][1];
      if (v < 0.42) return F.r;
      if (tall) return axis === 1 ? F.r : F.l;
      // Both walls take the SAME step. On a box the two vertical faces must
      // differ or the volume collapses; a terrace riser is not a box, it is a low
      // bank whose top edge the silhouette sweep has already inked, and at the
      // RIGHT step it read as a black band fourteen pixels deep repeated across
      // the frame. The light model survives because every built thing in the
      // frame still carries the full ladder.
      return F.l;
    }
    // ROCK IS BEDDED, AND THE BEDS ARE LEVEL. Keying the tone off the ground
    // coordinate put vertical stripes down every butte — a picket fence, measured
    // by eye on three seeds. The bed index is ABSOLUTE WORLD HEIGHT, so a bed runs
    // level across every cell of the wall instead of restarting at each one.
    // THE RISER TAKES THE SAME ROCK ITS TREAD DOES. Indexing it off the bed hash
    // alone put a different rock tone on the wall from the one on the ground
    // above it, so every contour came out as a saturated rust stripe against pale
    // sand — a hue change where a value step belonged. The bed hash now only
    // chooses which STEP of that tone the band takes.
    const bh = h3(Math.floor((z0 + v) / 1.7), 0, S1 + 149);
    const F = R.rock[buf[2] < 0.40 ? 0 : buf[2] < 0.58 ? 1 : 2];
    if (v < 0.42) return F.r;
    const g = (bh >>> 4) & 7;
    if (!tall) return g < 6 ? F.l : F.r;
    if (g < 2) return R.varn.l;
    return axis === 1 ? (g < 6 ? F.d : F.k) : (g < 6 ? F.r : F.d);
  };

  const tags = new Map();
  const tagFor = (L) => {
    let t = tags.get(L);
    if (!t) { t = tag(); tags.set(L, t); }
    return t;
  };
  drawTerrain(cv, iso, T, { top: groundTop, side: groundSide, water: groundTop },
    { tagFor, ink: C.black });

  // ---------------------------------------------------------------- the hero
  // "A world with one water body cannot leave its position to a jittered angle."
  // Neither can a world with one way-station. The site is chosen by searching
  // outward from the middle of the FRAME — hard vetoes first, then a weighted
  // score, and no minimum-suitability cutoff anywhere: all the discrimination is
  // in the ranking.
  const heroZ = 10;
  const tgtU = 0, tgtV = (H * 0.44 - iso.oy + 2 * iso.s * heroZ) / iso.s;
  const hx0 = (tgtV + tgtU) / 2, hy0 = (tgtV - tgtU) / 2;
  let hero = null, heroScore = -1e9;
  for (let a = -8; a <= 8; a++) {
    for (let b = -8; b <= 8; b++) {
      const x = hx0 + (a + b) * 5.5, y = hy0 + (b - a) * 5.5;
      if (x < X0 + 40 || x > X1 - 40 || y < Y0 + 40 || y > Y1 - 40) continue;
      const sc = MF.one(x, y, 0);
      if (sc > 0.28) continue;                        // never on active sand
      if (MF.one(x, y, 1) > 0.12) continue;           // never on the crust
      if (T.slopeAt(x, y) > 0.09) continue;           // never on a slip face
      if (mesaAt(x, y) > 0.6) continue;               // never on a butte
      // THE HERO IS THE THING THE EYE LANDS ON, so it may not drift to the frame
      // edge: on two seeds of six the station sat against the right margin with
      // its sign cut off, which is a focal point that has to be found rather than
      // seen. Distance from the target is now a hard veto as well as the largest
      // term in the score.
      const d2 = Math.sqrt(a * a + b * b);
      if (d2 > 7.2) continue;
      const flat = 1 - T.slopeAt(x, y) / 0.09;
      const near = 1 - d2 / 7.2;
      const s = flat * 0.30 + near * 0.54 + (1 - sc / 0.28) * 0.16;
      if (s > heroScore) { heroScore = s; hero = [x, y]; }
    }
  }
  if (!hero) hero = [hx0, hy0];

  // --------------------------------------------------------------- the track
  // ONE graded track, walked as a least-cost polyline from the station outward
  // in both directions, so the way-station is ON the road rather than beside one.
  // It is off the 2:1 lattice everywhere, which is the twentyfold off-lattice gap
  // attacked at source.
  const ts = rng.stream('track');
  const gx0 = (T.heightAt(hero[0] + 6, hero[1]) - T.heightAt(hero[0] - 6, hero[1])) / 12;
  const gy0 = (T.heightAt(hero[0], hero[1] + 6) - T.heightAt(hero[0], hero[1] - 6)) / 12;
  let tdx = -gy0, tdy = gx0;
  const tn = Math.sqrt(tdx * tdx + tdy * tdy);
  if (tn < 1e-4) { tdx = 0.71; tdy = 0.71; } else { tdx /= tn; tdy /= tn; }
  // Bias the contour heading toward the screen's long axis, world (1,1): a track
  // that leaves sideways is out of frame in eighty pixels.
  const sgn = tdx + tdy > 0 ? 1 : -1;
  tdx = tdx * 0.45 + 0.71 * sgn;
  tdy = tdy * 0.45 + 0.71 * sgn;
  const tnn = Math.sqrt(tdx * tdx + tdy * tdy);
  tdx /= tnn; tdy /= tnn;
  const climb = ts.range(0.55, 1.05);
  const fwd = walkTrack(T, ts, { x0: hero[0], y0: hero[1], dx: tdx, dy: tdy, steps: 96, len: 6.5, fan: 0.5, climb });
  const bwd = walkTrack(T, ts, { x0: hero[0], y0: hero[1], dx: -tdx, dy: -tdy, steps: 96, len: 6.5, fan: 0.5, climb });
  const TP = bwd.pts.slice().reverse().concat(fwd.pts.slice(1));
  const halfW = ts.range(3.2, 4.4);
  const TD = makeDistField(X0, Y0, X1, Y1, cell, TP, 26);
  const trackDist = (x, y) => TD.at(x, y);

  // ---- the track surface: per-cell slabs, so it climbs the terraces it crosses
  // instead of floating over them, with its edge cut as a smooth contour of the
  // distance field rather than at the cell boundary.
  const rut = halfW * 0.52;
  const trackTag = tag();
  const faceCache = new Map();
  const faceFor = (z) => {
    let F = faceCache.get(z);
    if (!F) { F = topFace(iso, z, 0, 0); faceCache.set(z, F); }
    return F;
  };
  {
    const gxT = T.gx, gyT = T.gy;
    cv.t = trackTag;
    for (let j = 0; j < gyT; j++) {
      for (let i = 0; i < gxT; i++) {
        const x0 = X0 + i * cell, y0 = Y0 + j * cell;
        if (TD.at(x0 + cell * 0.5, y0 + cell * 0.5) > halfW + cell) continue;
        if (!vis(x0, y0, x0 + cell, y0 + cell, 6)) continue;
        const z = T.lvl[j * gxT + i] * step + 0.05;
        const F = faceFor(z);
        drawSlab(cv, iso, x0, y0, z, cell, cell, (sx, sy) => {
          const u = F.au * sx + F.bu * sy + F.cu;
          const v = F.av * sx + F.bv * sy + F.cv;
          const d = TD.at(u, v);
          if (d > halfW) return -1;
          if (d > halfW - 0.42) return C.black;      // the graded edge, closing
          const a = d - rut;
          if (a > -0.36 && a < 0.36) return GRADE.k;  // two wheel ruts
          if (a > -0.9 && a < 0.9) return GRADE.r;
          // blown sand lying on the crown, in patches tens of units across
          const R = regOf(u, v);
          const g = h3(Math.floor(u / 9), Math.floor(v / 9), S1 + 41) & 7;
          return g === 0 ? R.sandLv[2][1].l : g === 1 ? GRADE.l : GRADE.t;
        });
      }
    }
  }

  // ------------------------------------------------------------- the station
  const ss = rng.stream('station');
  const CS = localC(C, cs, 3, 2);
  const hxA = hero[0], hyA = hero[1];
  const hz = T.surfaceZ(hxA, hyA);
  const HR = regOf(hxA, hyA);
  const word = coinWord(ss);
  const wall = CS.wallTone(ss);
  const trim = CS.accentTone(ss);
  const fascia = CS.accentTone(ss);
  const yardW = 46, yardD = 34;
  const yx = hxA - yardW * 0.5, yy = hyA - yardD * 0.5;

  // The apron: one graded plane the whole place stands on, with an inked rim. It
  // is what separates the station from the desert as a REGION rather than as a
  // collection of objects, and it is the loop that closes everything on it.
  cv.t = tag();
  {
    const F = topFace(iso, hz + 0.35, yx, yy);
    drawSlab(cv, iso, yx, yy, hz + 0.35, yardW, yardD, (sx, sy) => {
      const u = F.au * sx + F.bu * sy + F.cu, v = F.av * sx + F.bv * sy + F.cv;
      const e = Math.min(u, v, yardW - u, yardD - v);
      if (e < 0.42) return C.black;
      if (e < 1.5) return GRADE.r;
      const g = h3(Math.floor(u / 7), Math.floor(v / 7), S1 + 53) & 15;
      if (g < 3) return GRADE.l;
      if (g === 3) return HR.sandLv[0][1].l;
      return GRADE.t;
    });
  }

  // A DECK IS NOT A FLAT PLATE. The canopy roof is the largest single face in the
  // frame and, drawn as one index, it is on its own a larger flat region than the
  // whole acceptance budget allows. `box` puts every face through `asShade`, so a
  // "family" whose steps are shade callbacks is a legal argument and no prop file
  // has to change. The seams are cut in SCREEN space on purpose: on any top face
  // 2*sy+sx is constant along world x and 2*sy-sx along world y, exactly, so a
  // lattice built from those two is world-aligned without needing the face
  // inverse, and at s = 2 one world unit is eight of those units.
  const deckFam = (f, pitchW, salt) => {
    const Pp = 8 * pitchW;
    const seam = (lit, mid, dk) => (sx, sy) => {
      const a = 2 * sy + sx, b = 2 * sy - sx;
      const ma = ((a % Pp) + Pp) % Pp, mb = ((b % Pp) + Pp) % Pp;
      if (ma < 3 || mb < 3) return dk;
      const g = h3(Math.floor(a / Pp), Math.floor(b / Pp), salt) & 7;
      return g < 2 ? mid : g === 2 ? dk : lit;
    };
    return { t: seam(f.t, f.l, f.k), l: seam(f.l, f.r, f.k), r: f.r, d: f.d, k: f.k };
  };

  cv.t = tag();
  P.lowBlock(cv, iso, CS, ss, hxA - 17, hyA - 11, hz + 0.4, 19, 12, 7.2, wall, trim);
  // roof furniture — the block's roof is a 200-unit flat plate otherwise, and a
  // station is a place people work at
  {
    const rz = hz + 0.4 + 0.8 + 7.2 + 1.3;
    cv.t = tag();
    RF.vent(cv, iso, CS, ss, hxA - 14, hyA - 8, rz);
    cv.t = tag();
    RF.acUnit(cv, iso, CS, ss, hxA - 9, hyA - 7, rz);
    cv.t = tag();
    RF.waterTank(cv, iso, CS, ss, hxA - 4, hyA - 8, rz);
    cv.t = tag();
    RF.stairHut(cv, iso, CS, ss, hxA + 1.0, hyA - 6, rz, wall);
    cv.t = tag();
    RF.aerial(cv, iso, CS, ss, hxA - 12, hyA - 3, rz);
  }
  cv.t = tag();
  P.canopy(cv, iso, CS, ss, hxA + 5, hyA - 9, hz + 0.4, 17, 15, 9.4,
    C.concrete, fascia, deckFam(C.cream, 3.2, S1 + 91));
  cv.t = tag();
  P.pumpIsland(cv, iso, CS, ss, hxA + 7, hyA - 5, hz + 0.4, 2, C.concrete, trim);
  cv.t = tag();
  P.tankStand(cv, iso, CS, ss, hxA - 15, hyA + 6, hz + 0.4, ss.range(9, 12), 4.4,
    C.steel, C.metal);
  cv.t = tag();
  S.pylonSign(cv, iso, CS, ss, hxA + 1, hyA + 12, hz + 0.4, word, 0);
  cv.t = tag();
  P.wireFence(cv, iso, CS, ss, yx + 1, yy + yardD - 1.2, hz + 0.4, yardW - 2, 0, C.metal);
  cv.t = tag();
  P.wireFence(cv, iso, CS, ss, yx + yardW - 1.2, yy + 1, hz + 0.4, yardD - 2, 1, C.metal);
  for (let i = 0; i < 3; i++) {
    cv.t = tag();
    P.drum(cv, iso, CS, ss, hxA - 22 + i * 2.9, hyA + 9 + ss.range(0, 2), hz + 0.4,
      CS.accentTone(ss), false);
  }
  cv.t = tag();
  P.drumStack(cv, iso, CS, ss, hxA - 21, hyA - 15, hz + 0.4, CS);
  for (let i = 0; i < 4; i++) {
    cv.t = tag();
    P.tyre(cv, iso, CS, ss, hxA + 20 + ss.range(-2, 2), hyA - 14 + i * 2.2, hz + 0.4);
  }
  {
    const CT = Object.create(CS);
    CT.accents = [CS.accentTone(ss), CS.accentTone(ss), C.white, C.concrete, C.steel];
    cv.t = tag();
    drawVehicle(cv, iso, CT, ss, hxA + 8, hyA + 4, hz + 0.4, 0,
      ss.weighted([['pickup', 4], ['van', 3], ['truck', 2]]), tag);
    cv.t = tag();
    drawVehicle(cv, iso, CT, ss, hxA - 6, hyA + 12, hz + 0.4, 1,
      ss.weighted([['car', 3], ['pickup', 3], ['bus', 1]]), tag);
  }
  const pes = rng.stream('people');
  for (let i = 0; i < 5; i++) {
    cv.t = tagRaw();
    drawPerson(cv, iso, CS, pes, hxA + pes.range(-14, 16), hyA + pes.range(-6, 14), hz + 0.4);
  }
  const heroDist = (x, y) => {
    const du = Math.abs(x - hxA) - yardW * 0.5, dv = Math.abs(y - hyA) - yardD * 0.5;
    return Math.max(du, dv);
  };

  // ------------------------------------------------------------- the camp
  // A second authored place, deliberately SMALLER and structurally different: no
  // apron, no fence line square to anything, tents and shacks turned to the wind
  // rather than to each other.
  const cps = rng.stream('camp');
  let camp = null;
  {
    const along = cps.range(0.18, 0.34) * (cps.bool(0.5) ? 1 : -1);
    const idx = Math.round(TP.length * (0.5 + along));
    const p = TP[Math.max(2, Math.min(TP.length - 3, idx))];
    const nx = cps.bool(0.5) ? 1 : -1;
    for (let r = 9; r < 34; r += 3) {
      const x = p[0] + r * nx * 0.7, y = p[1] - r * nx * 0.7;
      if (MF.one(x, y, 0) < 0.30 && T.slopeAt(x, y) < 0.10 && heroDist(x, y) > 30) {
        camp = [x, y]; break;
      }
    }
  }
  if (camp) {
    const CC = localC(C, cs, 3, 2);
    const cz = T.surfaceZ(camp[0], camp[1]);
    const n = cps.int(3, 5);
    for (let i = 0; i < n; i++) {
      const ang = i * 1.7;
      const x = camp[0] + Math.round(((ang * 7) % 21) - 10) + cps.range(-3, 3);
      const y = camp[1] + Math.round(((ang * 11) % 19) - 9) + cps.range(-3, 3);
      const zz = T.surfaceZ(x, y);
      cv.t = tag();
      if (cps.bool(0.55)) {
        P.shack(cv, iso, CC, cps, x, y, zz, cps.range(6, 9), cps.range(5, 8),
          cps.range(4.5, 6.0), CC.wallTone(cps), CC.accentTone(cps));
      } else {
        P.tent(cv, iso, CC, cps, x, y, zz, cps.range(5, 8), cps.range(5, 7), CC.accentTone(cps));
      }
    }
    cv.t = tag();
    P.wireFence(cv, iso, CC, cps, camp[0] - 13, camp[1] + 11, cz, 24, 0, C.wood);
    for (let i = 0; i < 4; i++) {
      cv.t = tag();
      P.litter(cv, iso, CC, cps, camp[0] - 12 + i * 5.5 + cps.range(0, 2), camp[1] + 11.2, cz, 0,
        CC.accentTone(cps));
    }
    for (let i = 0; i < 3; i++) {
      cv.t = tag();
      P.drum(cv, iso, CC, cps, camp[0] + cps.range(-12, 12), camp[1] + cps.range(-10, 8), cz,
        CC.accentTone(cps), cps.bool(0.35));
    }
    cv.t = tag();
    P.cairn(cv, iso, CC, cps, camp[0] + 9, camp[1] - 9, cz, regOf(camp[0] + 9, camp[1] - 9).rock[0]);
    for (let i = 0; i < 4; i++) {
      cv.t = tagRaw();
      drawPerson(cv, iso, CC, pes, camp[0] + pes.range(-11, 11), camp[1] + pes.range(-9, 9), cz);
    }
  }
  const campDist = (x, y) => {
    if (!camp) return 1e9;
    const dx = x - camp[0], dy = y - camp[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  // -------------------------------------------------------- track furniture
  // The track's distance field admits everything human, and the line of poles
  // beside it is the strongest rhythm in the frame — a repeat that MEANS
  // something, which is the only kind this generator is allowed.
  const fs = rng.stream('furniture');
  {
    const side = fs.bool(0.5) ? 1 : -1;
    const off = fs.range(7.5, 11.0);
    const gap = fs.int(4, 6);
    const poles = [];
    for (let i = 3; i < TP.length - 3; i += gap) {
      const a = TP[i - 1], b = TP[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const nn = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= nn; dy /= nn;
      const x = TP[i][0] - dy * off * side, y = TP[i][1] + dx * off * side;
      if (MF.one(x, y, 0) > 0.52) continue;
      if (T.slopeAt(x, y) > 0.30) continue;
      if (heroDist(x, y) < 4) continue;
      poles.push([x, y, T.surfaceZ(x, y)]);
    }
    for (let i = 0; i < poles.length; i++) {
      const [x, y, z] = poles[i];
      if (!vis(x - 4, y - 4, x + 4, y + 4, 20)) continue;
      cv.t = tag();
      P.telegraphPole(cv, iso, C, fs, x, y, z, C.wood, poles[i + 1] || null);
    }

    // markers, cairns, drums and a wreck, all read off the track distance
    for (let i = 6; i < TP.length - 6; i += fs.int(7, 13)) {
      const p = TP[i];
      const s2 = fs.bool(0.5) ? 1 : -1;
      const a = TP[i - 1], b = TP[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const nn = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= nn; dy /= nn;
      const off2 = fs.range(halfW + 1.6, halfW + 5.0);
      const x = p[0] - dy * off2 * s2, y = p[1] + dx * off2 * s2;
      if (heroDist(x, y) < 3) continue;
      if (!vis(x - 6, y - 6, x + 6, y + 6, 12)) continue;
      const z = T.surfaceZ(x, y);
      const RG = regOf(x, y);
      const k = fs.weighted([['marker', 6], ['cairn', 4], ['drum', 3], ['stones', 4], ['sign', 2]]);
      cv.t = tag();
      if (k === 'marker') P.markerPost(cv, iso, C, fs, x, y, z, C.white);
      else if (k === 'cairn') P.cairn(cv, iso, C, fs, x, y, z, RG.rock[0]);
      else if (k === 'drum') P.drum(cv, iso, C, fs, x, y, z, C.accentTone(fs), fs.bool(0.4));
      else if (k === 'sign') S.signPost(cv, iso, C, fs, x, y, z, coinTag(fs));
      else P.stone(cv, iso, C, fs, x, y, z, RG.rock[1], fs.int(4, 7));
    }
    // one wreck and one culvert, both on the track
    {
      const i = Math.max(4, Math.min(TP.length - 5, Math.round(TP.length * fs.range(0.14, 0.34))));
      const p = TP[i];
      const x = p[0] + fs.range(6, 11), y = p[1] - fs.range(6, 11);
      if (vis(x - 8, y - 8, x + 8, y + 8, 10)) {
        cv.t = tag();
        P.wreck(cv, iso, C, fs, x, y, T.surfaceZ(x, y), fs.int(0, 1), C.accentTone(fs));
      }
    }
    {
      let best = -1, bestH = 1e9;
      for (let i = 6; i < TP.length - 6; i++) {
        const hh = T.heightAt(TP[i][0], TP[i][1]);
        if (hh < bestH) { bestH = hh; best = i; }
      }
      if (best > 0) {
        const p = TP[best];
        const a = TP[best - 1], b = TP[best + 1];
        const ax = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 1 : 0;
        cv.t = tag();
        P.culvert(cv, iso, C, fs, p[0] - (ax ? 1.2 : 7), p[1] - (ax ? 7 : 1.2),
          T.surfaceZ(p[0], p[1]) + 0.4, ax, 14, C.concrete);
      }
    }
  }

  // --------------------------------------------------------- the stone ring
  // The one place-kind this world can honestly make. A grove is a stand closing
  // in and a clearing is a stand opened up, and neither means anything where the
  // ground carries no stand at all; a marker is what you build where the landform
  // will not hold a road.
  const rs = rng.stream('ring');
  {
    let site = null;
    for (let k = 0; k < 40 && !site; k++) {
      const x = X0 + rs.range(60, (X1 - X0) - 60);
      const y = Y0 + rs.range(60, (Y1 - Y0) - 60);
      if (!vis(x - 20, y - 20, x + 20, y + 20, 12)) continue;
      if (MF.one(x, y, 0) > 0.24) continue;
      if (T.slopeAt(x, y) > 0.08) continue;
      if (trackDist(x, y) < 26 || heroDist(x, y) < 40 || campDist(x, y) < 40) continue;
      site = [x, y];
    }
    if (site) {
      const R = rs.range(9, 13);
      let vx = 1, vy = 0;
      const RC2 = -0.7373688, RS2 = 0.6754904;
      for (let i = 0; i < 9; i++) {
        const x = site[0] + vx * R, y = site[1] + vy * R;
        cv.t = tag();
        P.cairn(cv, iso, C, rs, x, y, T.surfaceZ(x, y), regOf(x, y).rock[2]);
        const nx = vx * RC2 - vy * RS2, ny = vx * RS2 + vy * RC2;
        const nn = Math.sqrt(nx * nx + ny * ny) || 1;
        vx = nx / nn; vy = ny / nn;
      }
      cv.t = tag();
      P.boulder(cv, iso, C, rs, site[0], site[1], T.surfaceZ(site[0], site[1]),
        regOf(site[0], site[1]).rock[1], rs.int(9, 12));
    }
  }

  // --------------------------------------------------------- the wind fences
  // Sand fences stand where the sand is ARRIVING — the margin, never the ridge
  // and never the bare pavement — which is where a person would actually put one,
  // and it puts a long inked comb across the middle distance.
  // A FENCE PROTECTS SOMETHING. `windFence` can only lie on a world axis, so it
  // draws as a straight line at the lattice angle every time; eight of them
  // scattered over the frame came out as a set of long parallel dark combs and
  // read as the corduroy they were supposed to be breaking. Three or four, short,
  // and only where there is something to keep the sand off — which is where a
  // person would actually build one.
  const ws = rng.stream('fences');
  for (let k = 0; k < 9; k++) {
    const x = X0 + ws.range(30, (X1 - X0) - 60);
    const y = Y0 + ws.range(30, (Y1 - Y0) - 60);
    const sc = MF.one(x, y, 0);
    if (sc < 0.26 || sc > 0.66) continue;
    if (T.slopeAt(x, y) > 0.16) continue;
    if (heroDist(x, y) < 20) continue;
    if (trackDist(x, y) > 46 && campDist(x, y) > 46) continue;
    const len = ws.range(12, 24);
    const ax = ws.int(0, 1);
    if (!vis(x - 2, y - 2, x + (ax ? 2 : len), y + (ax ? len : 2), 8)) continue;
    cv.t = tag();
    P.windFence(cv, iso, C, ws, x, y, T.surfaceZ(x, y), len, ax, C.wood);
    // sand piles against the lee side of a fence that works
    for (let t = 2; t < len - 2; t += ws.range(5, 9)) {
      const px = x + (ax ? 0 : t), py = y + (ax ? t : 0);
      cv.t = tagRaw();
      P.driftTail(cv, iso, C, px, py, T.surfaceZ(px, py) + 0.03,
        wx, wy, ws.range(4.5, 7.5), ws.range(1.8, 2.6), regOf(px, py).drift);
    }
  }

  // ----------------------------------------------------------- ambient life
  // SPACING IS ENFORCED BY GEOMETRY, NOT BY REJECTION. One candidate per jittered
  // lattice cell at `cell*g + hash*cell*jit + cell*(1-jit)/2`, so the axis
  // separation between adjacent samples is at least `cell*(1-jit)` — a floor that
  // is a guarantee rather than a hope. To make something sparser, enlarge the
  // cell; never roll a lower acceptance probability, because thinning by
  // rejection keeps the survivors' spacing and just punches holes in it. And
  // every per-object attribute is its own coordinate hash at its own salt, so
  // nothing depends on iteration order or on how many candidates were culled
  // before it.
  const ns = rng.stream('scrub');
  const scatter = (cellS, jit, salt, fn) => {
    const gi = Math.floor(X0 / cellS), gI = Math.ceil(X1 / cellS);
    const gj = Math.floor(Y0 / cellS), gJ = Math.ceil(Y1 / cellS);
    for (let b = gj; b <= gJ; b++) {
      for (let a = gi; a <= gI; a++) {
        const hx = h3(a, b, S0 ^ salt);
        const hy = h3(a, b, S0 ^ (salt + 1));
        const x = a * cellS + ((hx >>> 9) & 1023) / 1024 * cellS * jit + cellS * (1 - jit) * 0.5;
        const y = b * cellS + ((hy >>> 9) & 1023) / 1024 * cellS * jit + cellS * (1 - jit) * 0.5;
        if (x < X0 || x > X1 || y < Y0 || y > Y1) continue;
        fn(x, y, a, b);
      }
    }
  };

  const nearBuilt = (x, y) => heroDist(x, y) < 5 || campDist(x, y) < 15
    || trackDist(x, y) < halfW + 1.2;

  // CLUMPING AT TWO SCALES. A scatter with one acceptance probability is an even
  // sprinkle, and an even sprinkle of anything is the tell a critic finds first.
  // Stones lie in fields, scrub grows in stands, junk collects where people
  // stopped. The jittered lattice keeps the spacing floor INSIDE a stand — that
  // part is geometry and must not be thinned by rejection — and a slow field
  // decides where the stands are, which is the second scale.
  const stand = (x, y, f, salt) => fbm(x * f, y * f, S0 + salt, 2);

  // stones — the workhorse of reg density, in fields rather than evenly
  scatter(4.4, 0.86, 0x1a37, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc > HAM * 0.94) return;
    if (MF.one(x, y, 1) > 0.30) return;
    const acc = h3(gi, gj, S0 ^ 0x1a41) & 255;
    if (acc > 40 + stand(x, y, 0.017, 401) * 330) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 4)) return;
    const hR = h3(gi, gj, S0 ^ 0x1a43) >>> 5;
    cv.t = tagRaw();
    P.stone(cv, iso, C, ns, x, y, T.surfaceZ(x, y),
      regOf(x, y).rock[(h3(gi, gj, S0 ^ 0x1a45) >>> 3) % 3],
      3 + (hR & 3) + ((hR >>> 4) & 1) * 3);
  });

  // STONES HALF-BURIED IN THE SAND, each with the tail the wind has combed out
  // behind it. This is the erg's whole density budget and it is spent on the one
  // thing that is honestly there: the sheet is thin enough over most of a dune
  // field that the lag beneath shows through, and every one of those stones is
  // an obstacle, so every one of them earns a drift tail. A tail without a stone
  // at its head is placement without affordance, and a scatter of them looked
  // exactly like what it was.
  scatter(6.4, 0.88, 0x1b51, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc < HAM * 0.9) return;
    if (MF.one(x, y, 1) > 0.24) return;
    if ((h3(gi, gj, S0 ^ 0x1b55) & 255) > 30 + stand(x, y, 0.021, 409) * 300) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 4)) return;
    const z = T.surfaceZ(x, y);
    const R = regOf(x, y);
    cv.t = tagRaw();
    P.driftTail(cv, iso, C, x, y, z + 0.02, wx, wy,
      5 + ((h3(gi, gj, S0 ^ 0x1b61) >>> 6) & 7), 2.2, R.drift);
    cv.t = tagRaw();
    P.stone(cv, iso, C, ns, x, y, z, R.rock[(h3(gi, gj, S0 ^ 0x1b59) >>> 3) % 3],
      3 + ((h3(gi, gj, S0 ^ 0x1b5d) >>> 5) & 3));
  });

  // boulders — bigger, rarer, with a drift tail behind each
  scatter(21, 0.8, 0x2b11, (x, y, gi, gj) => {
    if (MF.one(x, y, 0) > 0.40) return;
    if (MF.one(x, y, 1) > 0.2) return;
    if ((h3(gi, gj, S0 ^ 0x2b15) & 255) > 140) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 12, y - 12, x + 12, y + 12, 10)) return;
    const z = T.surfaceZ(x, y);
    const R = regOf(x, y);
    cv.t = tagRaw();
    P.driftTail(cv, iso, C, x, y, z + 0.03, wx, wy, 11, 3.6, R.drift);
    cv.t = tagRaw();
    P.boulder(cv, iso, C, ns, x, y, z, R.rock[(h3(gi, gj, S0 ^ 0x2b19) >>> 3) % 3],
      7 + ((h3(gi, gj, S0 ^ 0x2b1d) >>> 7) & 3));
  });

  // bunchgrass — NEVER on mobile sand, and in stands rather than evenly
  scatter(6.6, 0.9, 0x3c21, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc > 0.36) return;
    if (MF.one(x, y, 1) > 0.42) return;
    if ((h3(gi, gj, S0 ^ 0x3c25) & 255) > 24 + stand(x, y, 0.024, 417) * 300) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 6)) return;
    cv.t = tagRaw();
    P.tussock(cv, iso, C, ns, x, y, T.surfaceZ(x, y),
      SCRUB[(h3(gi, gj, S0 ^ 0x3c29) >>> 4) % 3],
      5 + ((h3(gi, gj, S0 ^ 0x3c2b) >>> 6) & 3));
  });

  // nebkha — the MARGIN species, and the one made of the axis itself. A shrub
  // that has caught its own mound lives exactly where the sand is arriving, so
  // the window is the middle of the axis and nowhere else.
  scatter(9.0, 0.88, 0x4d31, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc < 0.28 || sc > 0.84) return;
    if (T.slopeAt(x, y) > 0.36) return;
    if ((h3(gi, gj, S0 ^ 0x4d35) & 255) > 40 + stand(x, y, 0.019, 421) * 330) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 8, y - 8, x + 8, y + 8, 8)) return;
    const z = T.surfaceZ(x, y);
    const R = regOf(x, y);
    cv.t = tagRaw();
    P.driftTail(cv, iso, C, x, y, z + 0.03, wx, wy, 8, 2.8, R.drift);
    cv.t = tagRaw();
    P.nebkha(cv, iso, C, ns, x, y, z, R.sandLv[0][2],
      SCRUB[(h3(gi, gj, S0 ^ 0x4d39) >>> 4) % 3],
      5 + ((h3(gi, gj, S0 ^ 0x4d3b) >>> 6) & 3));
  });

  // saltbush — the pavement and the pan edge
  scatter(8.4, 0.9, 0x5e41, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    const pn = MF.one(x, y, 1);
    if (sc > 0.24) return;
    if (pn > 0.55) return;
    if ((h3(gi, gj, S0 ^ 0x5e45) & 255) > 40 + pn * 200 + stand(x, y, 0.022, 429) * 190) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 5)) return;
    cv.t = tagRaw();
    P.saltbush(cv, iso, C, ns, x, y, T.surfaceZ(x, y),
      SCRUB[(h3(gi, gj, S0 ^ 0x5e49) >>> 4) % 3],
      4 + ((h3(gi, gj, S0 ^ 0x5e4b) >>> 6) & 2));
  });

  // bones, tyres and litter — rare, and always where something walked. The
  // acceptance leans on distance to the track because rubbish is a readout of
  // people, and the desert is the one place that keeps every piece of it.
  scatter(26, 0.9, 0x6f51, (x, y, gi, gj) => {
    if (MF.one(x, y, 1) > 0.5) return;
    const near = trackDist(x, y) < 70 ? 1 : 0;
    if ((h3(gi, gj, S0 ^ 0x6f55) & 255) > 70 + near * 90) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 6, y - 6, x + 6, y + 6, 4)) return;
    const z = T.surfaceZ(x, y);
    const k = (h3(gi, gj, S0 ^ 0x6f59) >>> 3) & 7;
    const sandy = MF.one(x, y, 0) > HAM;
    if (sandy) {
      // half-buried: a drift tail first, so the thing sits IN the sand
      cv.t = tagRaw();
      P.driftTail(cv, iso, C, x, y, z + 0.02, wx, wy, 7, 2.4, regOf(x, y).drift);
    }
    cv.t = tagRaw();
    if (k < 2) P.tyre(cv, iso, C, ns, x, y, z);
    else if (k < 4) P.bones(cv, iso, C, ns, x, y, z, BONE);
    else if (k < 6) { cv.t = tag(); P.drum(cv, iso, C, ns, x, y, z, C.accentTone(ns), true); }
    else { cv.t = tag(); P.litter(cv, iso, C, ns, x, y, z, k & 1, C.accentTone(ns)); }
  });

  // A DRIFT TAIL NEEDS SOMETHING TO HAVE CAUSED IT. The standalone set — a
  // scatter of tails over open sand with nothing at the head of any of them —
  // came out as pale hard-edged wedges lying about the frame like paper, which
  // is placement without affordance and looked exactly like it. Tails now exist
  // only behind stones, boulders, nebkha, dumped junk and fences, where the wind
  // has something to work around. What is left standing on an active dune face
  // is nothing, and that is the correct answer: the erg is the quiet half of this
  // picture and the reg carries the density.
}
