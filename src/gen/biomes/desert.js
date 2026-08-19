// The desert biome — an erg with a rock pavement showing through it.
//
// WHAT THIS IS STRUCTURALLY. A directional fold (`heightField('dune')`) gives a
// sand sea: long windward ramps and short slip faces at the angle of repose,
// bent by a low-frequency warp so no two crests stay parallel. A plateau term
// is added on top of it, so a few mesas stand out of the sand as terraced
// stacks with steep sides. `makeTerrain` contours the sum; `drawTerrain` draws
// it as flat tops with exposed walls. There is no grid, no block, no parcel and
// no land-use mix anywhere in this file.
//
// THE PLACEMENT AXIS IS HOW MOBILE THE GROUND IS, and it is the thing that
// makes this a biome rather than a palette. `sandCover` is read straight out of
// the dune envelope, modulated by a sand-supply field: 1 on an active dune
// face, 0 on the exposed hamada of the interdune corridors, with a salt crust
// in the closed lows between crests. From that one number:
//
//   - NOTHING BUILT STANDS ON ACTIVE SAND. The track, the poles, the fences,
//     the camp and the station are all admitted only where `sandCover` is low.
//     That single veto is what puts every structure in the corridors and leaves
//     the ridges clean, and it is a consequence rather than a composition. The
//     city admits on a parcel type; nothing here has a type.
//   - THE THREE PLANTS ARE THREE ANSWERS TO THE SAME QUESTION. Bunchgrass
//     never stands on mobile sand; a nebkha is a shrub that has caught its own
//     mound and lives exactly at the margin; saltbush wants the pavement and
//     the pan edge. Same axis, three windows on it, and the vegetation map is
//     therefore a readout of the landform rather than a scatter over it.
//
// AND THE THING THAT KILLS A DUNE FIELD IS EMPTINESS. `docs/BAR.md` measures
// the reference at 95% occupancy and a 29% change rate; a wide clean sand field
// is a failed post however well the dune is modelled, and it fails four
// measurements at once — the largest flat region, the uniform 13x13 and 17x17
// window shares, and the long horizontal runs, all of which are one root cause:
// A TERRACE TOP IS A WIDE FLAT FACE BY CONSTRUCTION. The answer here is never
// texture. It is ground FACETS that mean something — ripple sets cut as flat
// contoured bands, sand stringers threading the pavement, salt-crust polygons,
// drift tails behind every obstacle, deflation patches — plus several hundred
// stones, tussocks, bones and pieces of track furniture standing on them.

import { heightField, fbm, tri } from '../world.js';
import { makeTerrain, drawTerrain, walkTrack } from '../terrain.js';
import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { h3 } from '../palette.js';
import { topFace } from '../faces.js';
import { localC } from '../stage.js';
import { coinWord, coinTag } from '../font.js';
import { dep, projR } from '../view.js';
import * as P from '../props/desert.js';
import * as S from '../props/street.js';
import { drawVehicle } from '../props/vehicles.js';
import { drawPerson } from '../props/people.js';

const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// A bilinear scalar field, four channels interleaved.
//
// The material boundaries have to be SMOOTH CONTOURS, not cell steps: a
// pavement patch whose edge is quantised to the 12-pixel terrain cell reads as
// a mosaic, and the whole argument for putting the sand/rock boundary in the
// ground shader is that it comes out as a hand-drawn curve at an arbitrary
// angle. Interleaving four channels in one array is not tidiness — the shader
// runs once per ground pixel, and sharing one index computation across four
// samples is most of the difference between a 60ms frame and a 200ms one.

const NCH = 4;

function makeFields(X0, Y0, X1, Y1, cell, fn) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy * NCH);
  const g = new Float32Array(gx * gy * 2);
  const tmp = [0, 0, 0, 0];
  for (let j = 0; j < gy; j++) {
    const wy = Y0 + (j - 1) * cell;
    for (let i = 0; i < gx; i++) {
      fn(X0 + (i - 1) * cell, wy, tmp);
      const k = (j * gx + i) * NCH;
      a[k] = tmp[0]; a[k + 1] = tmp[1]; a[k + 2] = tmp[2]; a[k + 3] = tmp[3];
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
    /** One channel only — the placement path never needs all four. */
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

// ---------------------------------------------------------------------------

export function paintDesert(stage) {
  const { C, cv, iso, rng, X0, X1, Y0, Y1, W, H, seedN, tag, tagRaw, vis } = stage;
  const es = rng.stream('erg');
  const S0 = seedN | 0;

  // ---------------------------------------------------------------- the wind
  // THE WIND DIRECTION IS CHOSEN AGAINST THE PROJECTION, NOT AGAINST THE MAP.
  // Crests run perpendicular to the wind, and a crest along world (1,-1) is
  // EXACTLY HORIZONTAL on screen — the one direction `docs/CRAFT.md` calls a
  // bug rather than a style choice, because it is off-axis for both the 2:1
  // lattice and the vertical. So the crest's screen slope is drawn first, in a
  // band that avoids horizontal at one end and the lattice itself at the other,
  // and the wind vector is solved back out of it.
  const crestSlope = es.range(0.23, 0.45) * (es.bool(0.5) ? 1 : -1);
  const ratio = (1 + 2 * crestSlope) / (1 - 2 * crestSlope);
  const wn = Math.sqrt(1 + ratio * ratio);
  const wx = 1 / wn, wy = ratio / wn;

  const period = es.range(54, 82);
  // The warp had to come DOWN from the smoke-test value. At warp 1.3 the fine
  // octave of the warping fbm advances the fold's phase at half the rate the
  // fold itself advances, so the dune direction locally reverses and the
  // contours shred into single-cell chevrons — measured by eye on the
  // placeholder before anything else was built. Below about 0.6 the crests bend
  // without ever turning back on themselves.
  const warp = es.range(0.30, 0.58);
  const amp = es.range(17, 27);
  const sharp = es.range(0.70, 0.84);
  // Terrace count is specified as a PICTURE — five to seven bands from trough
  // to brink — and the step is solved from it, so a seed with a taller dune
  // gets taller terraces rather than more of them.
  const step = (amp * 0.72) / es.range(4.6, 6.4);
  const cell = es.range(2.4, 3.0);

  // --------------------------------------------------------------- plateaus
  // A mesa is a plateau term added to the dune field, which the terracing then
  // turns into a stack of steep-sided benches for free. Placed on a coarse hash
  // lattice so they are sparse and never adjacent.
  const MC = 122;
  const mesaAt = (x, y) => {
    let h = 0;
    const gi = Math.floor(x / MC), gj = Math.floor(y / MC);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = gi + di, j = gj + dj;
        const q = h3(i, j, S0 ^ 0x51a9);
        if ((q & 255) > 74) continue;
        const cx = (i + 0.18 + ((q >>> 8) & 255) / 400) * MC;
        const cy = (j + 0.18 + ((q >>> 16) & 255) / 400) * MC;
        const R = 15 + ((q >>> 24) & 31) * 0.62;
        const q2 = h3(i, j, S0 ^ 0x77c3);
        const HM = 9 + (q2 & 31) * 0.42;
        const rim = 4.5 + ((q2 >>> 8) & 15) * 0.32;
        // an elliptical footprint at an arbitrary angle: a quadratic form, so
        // the mesa's plan is a curve that conforms to nothing
        const ea = 0.72 + ((q2 >>> 12) & 15) / 26;
        const eb = 0.72 + ((q2 >>> 17) & 15) / 26;
        const ec = (((q2 >>> 22) & 31) / 31 - 0.5) * 0.8;
        const du = x - cx, dv = y - cy;
        const dd = Math.sqrt(Math.max(0, du * du * ea + dv * dv * eb + du * dv * ec));
        const t = cl01((R - dd) / rim);
        if (t > 0) h += HM * t * t * (3 - 2 * t) + HM * 0.06 * (du / R);
      }
    }
    return h;
  };

  // ------------------------------------------------------ the material field
  // Everything the biome admits, vetoes or paints is a readout of these four
  // numbers, and they are evaluated ONCE on a grid rather than per pixel and
  // per candidate.
  //
  //   0  sandCover   1 = active dune face, 0 = exposed pavement
  //   1  pan         the salt crust in the closed lows
  //   2  stringer    a mid-frequency field whose 0.5 contour is a sand ribbon
  //   3  fold        the dune's own phase, which the ripple sets ride on
  const supplyF = es.range(1.05, 1.45);
  const supplyOff = es.range(-0.16, -0.02);
  const panBias = es.range(0.50, 0.60);
  const fieldCell = 3.1;
  const MF = makeFields(X0 - 8, Y0 - 8, X1 + 8, Y1 + 8, fieldCell, (x, y, out) => {
    const w = fbm(x * 0.011, y * 0.011, S0 + 41, 3) - 0.5;
    const t = (x * wx + y * wy) / period + w * warp;
    const f = tri(t);
    const crest = f < sharp ? f / sharp : 1 - (f - sharp) / (1 - sharp);
    const supply = fbm(x * 0.0062, y * 0.0062, S0 + 911, 3);
    const sc = cl01(crest * supplyF + (supply - 0.5) * 1.25 + supplyOff);
    out[0] = sc;
    out[1] = sc > 0.34 ? 0
      : cl01((0.34 - sc) * 3.6) * cl01((fbm(x * 0.0088, y * 0.0088, S0 + 1301, 3) - panBias) * 7);
    out[2] = fbm(x * 0.0255, y * 0.0255, S0 + 613, 3);
    out[3] = t;
  });

  const duneH = heightField('dune', { seedN, wx, wy, period, warp, amp, base: 0, sharp });
  // The pan is a CLOSED low, so it is cut into the field rather than painted on
  // it: without this a salt flat is a bright patch on a slope, which is the one
  // thing a salt flat can never be.
  const height = (x, y) => duneH(x, y) + mesaAt(x, y) - 3.4 * MF.one(x, y, 1);

  const T = makeTerrain({ X0, Y0, X1, Y1, cell, step, height });
  stage.terrain = T;

  // ------------------------------------------------------------- the palette
  // Colour is committed per SHEET, not per object: four sand tones selected by
  // the supply field, three pavement tones selected by the stringer field. The
  // two selectors have different contours, so the frame carries a dozen tone
  // regions whose boundaries never coincide — and none of them is a rectangle.
  const cs = rng.stream('ergcolour');
  const jitFam = (f, dh, ds, dl) => C.mk(f._h + cs.range(-dh, dh),
    f._s * cs.range(1 - ds, 1 + ds), Math.min(0.97, f._L * cs.range(1 - dl, 1 + dl)));
  const SANDS = [];
  for (let i = 0; i < 4; i++) SANDS.push(jitFam(C.sandy, 9, 0.30, 0.10));
  const ROCKS = [];
  for (let i = 0; i < 3; i++) {
    ROCKS.push(C.mk(C.taupe._h + cs.range(-13, 13), C.taupe._s * cs.range(0.7, 1.5),
      Math.min(0.9, C.taupe._L * cs.range(0.68, 0.86))));
  }
  const GRIT = C.mk(C.stone._h + cs.range(-10, 10), C.stone._s * cs.range(0.8, 1.5),
    Math.min(0.95, C.stone._L * cs.range(0.86, 1.02)));
  const CRUST = C.mk(C.cream._h + cs.range(-8, 8), C.cream._s * cs.range(0.25, 0.7),
    Math.min(0.98, C.cream._L * cs.range(1.0, 1.08)));
  const SCRUB = C.mk(C.lime._h + cs.range(-16, 10), C.lime._s * cs.range(0.30, 0.58),
    C.lime._L * cs.range(0.66, 0.90));
  const SCRUB2 = C.mk(C.grass._h + cs.range(-14, 14), C.grass._s * cs.range(0.24, 0.50),
    C.grass._L * cs.range(0.70, 1.00));
  const GRADE = C.mk(C.concrete._h + cs.range(-10, 10), C.concrete._s * cs.range(0.7, 1.5),
    Math.min(0.94, C.concrete._L * cs.range(0.80, 0.94)));
  const BONE = C.mk(C.white._h, C.white._s * 0.6, 0.93);

  // ------------------------------------------------------------- the ground
  const HAM = es.range(0.30, 0.38);          // pavement / margin boundary
  const ACT = es.range(0.56, 0.66);          // margin / active sand boundary
  const rip = { pitch: es.range(7.0, 10.5), amp: es.range(0.34, 0.62) };
  const S1 = S0 + 7717;
  const buf = [0, 0, 0, 0];

  const groundTop = (u, v, z, q) => {
    MF.at(u, v, buf);
    const sc = buf[0], pn = buf[1], str = buf[2], fold = buf[3];

    // ---- the salt pan, and its own closing loop
    if (pn > 0.30) {
      const gp = MF.grad(u, v, 1);
      if (pn < 0.34 + 0.10 * gp) return C.black;
      // Polygonal cracking: a jittered-site cell pattern, so each crust plate
      // is a flat field CLOSED by a line in the crust's own dark. This is the
      // ink-closure technique applied to bare ground — `docs/BAR.md` measures
      // our average block as busy as eBoy's empty ocean, and a cracked crust is
      // one of the few ground surfaces that honestly carries loops.
      const CW = 5.2;
      const gu = Math.floor(u / CW), gv = Math.floor(v / CW);
      let d1 = 1e9, d2 = 1e9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const hh = h3(gu + di, gv + dj, S1 + 3);
          const sx = (gu + di + 0.18 + ((hh >>> 8) & 255) / 385) * CW;
          const sy = (gv + dj + 0.18 + ((hh >>> 16) & 255) / 385) * CW;
          const dx = u - sx, dy = v - sy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      if (d2 - d1 < 0.30) return CRUST.k;
      if (d2 - d1 < 0.62) return CRUST.l;
      return pn > 0.72 ? CRUST.t : CRUST.l;
    }

    // ---- pavement / sand, and the material boundary between them
    const gs = MF.grad(u, v, 0);
    if (sc > HAM - 0.055 * gs && sc < HAM + 0.055 * gs) return C.black;

    if (sc < HAM) {
      const R = ROCKS[str < 0.44 ? 0 : str < 0.60 ? 1 : 2];
      // A SAND STRINGER: the 0.5 contour of a mid-frequency field, cut to a
      // ribbon a few units wide. It threads the pavement at every angle and it
      // is the single largest off-lattice ground form in the frame.
      const e = str - 0.5;
      const ge = 0.16;
      if (e > -ge && e < ge) {
        const SD = SANDS[3];
        return (e > -ge * 0.28 && e < ge * 0.28) ? SD.t : SD.l;
      }
      // large contoured patches of a second pavement tone — a quadratic form,
      // so the boundary walks off the lattice at every angle
      const cwp = 27;
      const pu = Math.floor(u / cwp), pv = Math.floor(v / cwp);
      const g = h3(pu, pv, S1 + 11);
      if ((g & 3) === 0) {
        const su = u - pu * cwp - 6 - ((g >>> 8) & 15);
        const sv = v - pv * cwp - 6 - ((g >>> 12) & 15);
        const rr = su * su * (0.62 + ((g >>> 17) & 7) * 0.12)
          + sv * sv * (0.70 + ((g >>> 21) & 7) * 0.11) + su * sv * 0.5;
        const RR = 34 + ((g >>> 25) & 31);
        if (rr < RR) return GRIT.t;
        if (rr < RR + 9) return GRIT.l;
      }
      return sc < HAM * 0.45 ? R.t : R.l;
    }

    // ---- ripple sets. Flat contoured bands, per PATCH, never per pixel.
    //
    // One ripple field over the whole frame would be a lattice with a
    // 20-pixel period, and 2D autocorrelation is the measurement that names
    // "machine-made at a glance". A patch is 28-40 units across and carries
    // its own pitch and phase, so the sets break against each other the way
    // ripples reorganise across a slope.
    const SD = SANDS[str < 0.38 ? 0 : str < 0.52 ? 1 : str < 0.68 ? 2 : 3];
    const PW = 34;
    const ru = Math.floor(u / PW), rv = Math.floor(v / PW);
    const rh = h3(ru, rv, S1 + 29);
    const active = sc > ACT;
    if ((rh & 7) !== 0) {
      const mult = rip.pitch * (0.72 + ((rh >>> 5) & 15) / 26);
      const ph = ((rh >>> 12) & 255) / 256;
      const r = tri(fold * mult + ph);
      const band = r < 0.36 ? 0 : r < 0.72 ? 1 : 2;
      if (active) {
        if (band === 0) return SD.l;
        if (band === 2 && ((rh >>> 22) & 3) === 0) return SD.d;
        return SD.t;
      }
      return band === 0 ? GRIT.l : band === 2 ? SD.l : SD.t;
    }
    // an unrippled sheet: still faceted, by a deflation patch in the grit tone
    if (!active) return str < 0.47 ? GRIT.t : SD.l;
    return str > 0.56 ? SD.l : SD.t;
  };

  const groundSide = (u, v, plane, axis, q, z0) => {
    const x = axis === 1 ? plane : u, y = axis === 1 ? u : plane;
    const sc = MF.one(x, y, 0);
    const pn = MF.one(x, y, 1);
    const F = pn > 0.34 ? CRUST : sc < HAM ? ROCKS[1] : SANDS[1];
    // A contact shadow at the foot of every wall, in the material's OWN dark.
    // The wall is only a terrace tall — four or five screen pixels — so this is
    // the whole of the modelling it can carry, and it closes the band below it.
    if (v < 0.55) return F.k;
    return axis === 1 ? F.d : F.r;
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
  // "A world with one water body cannot leave its position to a jittered
  // angle." Neither can a world with one way-station. The site is chosen by
  // searching outward from the middle of the FRAME — hard vetoes first, then a
  // weighted score, and no minimum-suitability cutoff anywhere: all the
  // discrimination is in the ranking.
  const heroZ = 10;
  const tgtU = 0, tgtV = (H * 0.44 - iso.oy + 2 * iso.s * heroZ) / iso.s;
  const hx0 = (tgtV + tgtU) / 2, hy0 = (tgtV - tgtU) / 2;
  let hero = null, heroScore = -1e9;
  for (let a = -8; a <= 8; a++) {
    for (let b = -8; b <= 8; b++) {
      const x = hx0 + (a + b) * 5.5, y = hy0 + (b - a) * 5.5;
      if (x < X0 + 40 || x > X1 - 40 || y < Y0 + 40 || y > Y1 - 40) continue;
      const sc = MF.one(x, y, 0);
      if (sc > 0.30) continue;                        // never on active sand
      if (MF.one(x, y, 1) > 0.12) continue;           // never on the crust
      if (T.slopeAt(x, y) > 0.09) continue;           // never on a slip face
      if (mesaAt(x, y) > 0.6) continue;               // never on a plateau
      const flat = 1 - T.slopeAt(x, y) / 0.09;
      const near = 1 - Math.sqrt(a * a + b * b) / 12;
      const s = flat * 0.44 + near * 0.36 + (1 - sc / 0.30) * 0.20;
      if (s > heroScore) { heroScore = s; hero = [x, y]; }
    }
  }
  if (!hero) hero = [hx0, hy0];

  // ----------------------------------------------------------------- the track
  // ONE graded track, walked as a least-cost polyline from the station outward
  // in both directions, so the way-station is ON the road rather than beside
  // one. It is off the 2:1 lattice everywhere, which is the twentyfold
  // off-lattice gap attacked at source.
  const ts = rng.stream('track');
  const gx0 = (T.heightAt(hero[0] + 6, hero[1]) - T.heightAt(hero[0] - 6, hero[1])) / 12;
  const gy0 = (T.heightAt(hero[0], hero[1] + 6) - T.heightAt(hero[0], hero[1] - 6)) / 12;
  let tdx = -gy0, tdy = gx0;
  const tn = Math.sqrt(tdx * tdx + tdy * tdy);
  if (tn < 1e-4) { tdx = 0.71; tdy = 0.71; } else { tdx /= tn; tdy /= tn; }
  // Bias the contour heading toward the screen's long axis, world (1,1): a
  // track that leaves sideways is out of frame in eighty pixels.
  tdx = tdx * 0.45 + 0.71 * (tdx + tdy > 0 ? 1 : -1);
  tdy = tdy * 0.45 + 0.71 * (tdx + tdy > 0 ? 1 : -1);
  const tnn = Math.sqrt(tdx * tdx + tdy * tdy);
  tdx /= tnn; tdy /= tnn;
  const climb = ts.range(0.55, 1.05);
  const fwd = walkTrack(T, ts, { x0: hero[0], y0: hero[1], dx: tdx, dy: tdy, steps: 96, len: 6.5, fan: 0.5, climb });
  const bwd = walkTrack(T, ts, { x0: hero[0], y0: hero[1], dx: -tdx, dy: -tdy, steps: 96, len: 6.5, fan: 0.5, climb });
  const TP = bwd.pts.slice().reverse().concat(fwd.pts.slice(1));
  const halfW = ts.range(3.2, 4.4);
  const TD = makeDistField(X0, Y0, X1, Y1, cell, TP, 26);
  const trackDist = (x, y) => TD.at(x, y);

  // ---- the track surface: per-cell slabs, so it climbs the terraces it
  // crosses instead of floating over them, with its edge cut as a smooth
  // contour of the distance field rather than at the cell boundary.
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
          const g = h3(Math.floor(u / 9), Math.floor(v / 9), S1 + 41) & 7;
          return g === 0 ? SANDS[1].l : g === 1 ? GRADE.l : GRADE.t;
        });
      }
    }
  }

  // ------------------------------------------------------------- the station
  const ss = rng.stream('station');
  const CS = localC(C, cs, 3, 2);
  const hxA = hero[0], hyA = hero[1];
  const hz = T.surfaceZ(hxA, hyA);
  const word = coinWord(ss);
  const wall = CS.wallTone(ss);
  const trim = CS.accentTone(ss);
  const fascia = CS.accentTone(ss);
  const yardW = 46, yardD = 34;
  const yx = hxA - yardW * 0.5, yy = hyA - yardD * 0.5;

  // The apron: one graded plane the whole place stands on, with an inked rim.
  // It is what separates the station from the desert as a REGION rather than as
  // a collection of objects, and it is the loop that closes everything on it.
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
      if (g === 3) return SANDS[0].l;
      return GRADE.t;
    });
  }

  cv.t = tag();
  P.lowBlock(cv, iso, CS, ss, hxA - 17, hyA - 11, hz + 0.4, 19, 12, 7.2, wall, trim);
  cv.t = tag();
  P.canopy(cv, iso, CS, ss, hxA + 5, hyA - 9, hz + 0.4, 17, 15, 9.4,
    C.concrete, fascia, C.cream);
  cv.t = tag();
  P.pumpIsland(cv, iso, CS, ss, hxA + 7, hyA - 5, hz + 0.4, 2, C.concrete, trim);
  cv.t = tag();
  P.tankStand(cv, iso, CS, ss, hxA - 15, hyA + 6, hz + 0.4, ss.range(8, 11), 3.6,
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
  // A second authored place, deliberately SMALLER and structurally different:
  // no apron, no fence line square to anything, tents and shacks turned to the
  // wind rather than to each other.
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
    P.cairn(cv, iso, CC, cps, camp[0] + 9, camp[1] - 9, cz, ROCKS[0]);
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
    let prev = null;
    const poles = [];
    for (let i = 3; i < TP.length - 3; i += gap) {
      const a = TP[i - 1], b = TP[i + 1];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const nn = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= nn; dy /= nn;
      const x = TP[i][0] - dy * off * side, y = TP[i][1] + dx * off * side;
      if (MF.one(x, y, 0) > 0.52) { prev = null; continue; }
      if (T.slopeAt(x, y) > 0.30) { prev = null; continue; }
      if (heroDist(x, y) < 4) { prev = null; continue; }
      poles.push([x, y, T.surfaceZ(x, y)]);
    }
    for (let i = 0; i < poles.length; i++) {
      const [x, y, z] = poles[i];
      if (!vis(x - 4, y - 4, x + 4, y + 4, 20)) continue;
      cv.t = tag();
      P.telegraphPole(cv, iso, C, fs, x, y, z, C.wood, poles[i + 1] || null);
      prev = poles[i];
    }
    if (prev) { /* keeps the walk's shape referenced */ }

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
      const k = fs.weighted([['marker', 6], ['cairn', 4], ['drum', 3], ['stones', 4], ['sign', 2]]);
      cv.t = tag();
      if (k === 'marker') P.markerPost(cv, iso, C, fs, x, y, z, C.white);
      else if (k === 'cairn') P.cairn(cv, iso, C, fs, x, y, z, ROCKS[0]);
      else if (k === 'drum') P.drum(cv, iso, C, fs, x, y, z, C.accentTone(fs), fs.bool(0.4));
      else if (k === 'sign') S.signPost(cv, iso, C, fs, x, y, z, coinTag(fs));
      else P.stone(cv, iso, C, fs, x, y, z, ROCKS[1], fs.int(4, 7));
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
  // in and a clearing is a stand opened up, and neither means anything where
  // the ground carries no stand at all; a marker is what you build where the
  // landform will not hold a road.
  const rs = rng.stream('ring');
  {
    let site = null;
    for (let k = 0; k < 40 && !site; k++) {
      const x = X0 + rs.range(60, (X1 - X0) - 60);
      const y = Y0 + rs.range(60, (Y1 - Y0) - 60);
      if (!vis(x - 20, y - 20, x + 20, y + 20, 12)) continue;
      if (MF.one(x, y, 0) > 0.26) continue;
      if (T.slopeAt(x, y) > 0.08) continue;
      if (trackDist(x, y) < 26 || heroDist(x, y) < 40 || campDist(x, y) < 40) continue;
      site = [x, y];
    }
    if (site) {
      const R = rs.range(9, 13);
      let vx = 1, vy = 0;
      const RC = -0.7373688, RS = 0.6754904;
      for (let i = 0; i < 9; i++) {
        const x = site[0] + vx * R, y = site[1] + vy * R;
        cv.t = tag();
        P.cairn(cv, iso, C, rs, x, y, T.surfaceZ(x, y), ROCKS[2]);
        const nx = vx * RC - vy * RS, ny = vx * RS + vy * RC;
        const nn = Math.sqrt(nx * nx + ny * ny) || 1;
        vx = nx / nn; vy = ny / nn;
      }
      cv.t = tag();
      P.boulder(cv, iso, C, rs, site[0], site[1], T.surfaceZ(site[0], site[1]), ROCKS[1], rs.int(9, 12));
    }
  }

  // --------------------------------------------------------- the wind fences
  // Sand fences stand where the sand is ARRIVING — the margin, never the ridge
  // and never the bare pavement — which is where a person would actually put
  // one, and it puts a long inked comb across the middle distance.
  const ws = rng.stream('fences');
  for (let k = 0; k < 7; k++) {
    const x = X0 + ws.range(30, (X1 - X0) - 60);
    const y = Y0 + ws.range(30, (Y1 - Y0) - 60);
    const sc = MF.one(x, y, 0);
    if (sc < 0.26 || sc > 0.60) continue;
    if (T.slopeAt(x, y) > 0.16) continue;
    if (heroDist(x, y) < 26) continue;
    const len = ws.range(20, 40);
    const ax = ws.int(0, 1);
    if (!vis(x - 2, y - 2, x + (ax ? 2 : len), y + (ax ? len : 2), 8)) continue;
    cv.t = tag();
    P.windFence(cv, iso, C, ws, x, y, T.surfaceZ(x, y), len, ax, C.wood);
    // sand piles against the lee side of a fence that works
    for (let t = 2; t < len - 2; t += ws.range(5, 9)) {
      cv.t = tagRaw();
      P.driftTail(cv, iso, C, x + (ax ? 0 : t), y + (ax ? t : 0),
        T.surfaceZ(x + (ax ? 0 : t), y + (ax ? t : 0)) + 0.03,
        wx, wy, ws.range(6, 11), ws.range(2.2, 3.4), SANDS[2]);
    }
  }

  // ----------------------------------------------------------- ambient life
  // SPACING IS ENFORCED BY GEOMETRY, NOT BY REJECTION. One candidate per
  // jittered lattice cell at `cell*g + hash*cell*jit + cell*(1-jit)/2`, so the
  // axis separation between adjacent samples is at least `cell*(1-jit)` — a
  // floor that is a guarantee rather than a hope. To make something sparser,
  // enlarge the cell; never roll a lower acceptance probability, because
  // thinning by rejection keeps the survivors' spacing and just punches holes
  // in it. And every per-object attribute is its own coordinate hash at its own
  // salt, so nothing depends on iteration order or on how many candidates were
  // culled before it.
  const ns = rng.stream('scrub');
  const scatter = (cellS, jit, salt, fn) => {
    const gi0 = Math.floor(X0 / cellS), gi1 = Math.ceil(X1 / cellS);
    const gj0 = Math.floor(Y0 / cellS), gj1 = Math.ceil(Y1 / cellS);
    for (let gj = gj0; gj <= gj1; gj++) {
      for (let gi = gi0; gi <= gi1; gi++) {
        const hx = h3(gi, gj, S0 ^ salt);
        const hy = h3(gi, gj, S0 ^ (salt + 1));
        const x = gi * cellS + ((hx >>> 9) & 1023) / 1024 * cellS * jit + cellS * (1 - jit) * 0.5;
        const y = gj * cellS + ((hy >>> 9) & 1023) / 1024 * cellS * jit + cellS * (1 - jit) * 0.5;
        if (x < X0 || x > X1 || y < Y0 || y > Y1) continue;
        fn(x, y, gi, gj);
      }
    }
  };

  const nearBuilt = (x, y) => heroDist(x, y) < 5 || campDist(x, y) < 15
    || trackDist(x, y) < halfW + 1.2;

  // stones — the workhorse of pavement density
  scatter(4.6, 0.86, 0x1a37, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc > HAM * 0.86) return;
    if (MF.one(x, y, 1) > 0.30) return;
    const acc = h3(gi, gj, S0 ^ 0x1a41) & 255;
    if (acc > 128 + (1 - sc / HAM) * 110) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 3, y - 3, x + 3, y + 3, 4)) return;
    const R = 3 + ((h3(gi, gj, S0 ^ 0x1a43) >>> 5) & 3);
    cv.t = tagRaw();
    P.stone(cv, iso, C, ns, x, y, T.surfaceZ(x, y),
      ROCKS[(h3(gi, gj, S0 ^ 0x1a45) >>> 3) % 3], R);
  });

  // boulders — bigger, rarer, with a drift tail behind each
  scatter(23, 0.8, 0x2b11, (x, y, gi, gj) => {
    if (MF.one(x, y, 0) > 0.34) return;
    if (MF.one(x, y, 1) > 0.2) return;
    if ((h3(gi, gj, S0 ^ 0x2b15) & 255) > 130) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 12, y - 12, x + 12, y + 12, 10)) return;
    const z = T.surfaceZ(x, y);
    cv.t = tagRaw();
    P.driftTail(cv, iso, C, x, y, z + 0.03, wx, wy, 12, 4.2, SANDS[2]);
    cv.t = tagRaw();
    P.boulder(cv, iso, C, ns, x, y, z, ROCKS[(h3(gi, gj, S0 ^ 0x2b19) >>> 3) % 3],
      7 + ((h3(gi, gj, S0 ^ 0x2b1d) >>> 7) & 3));
  });

  // bunchgrass — NEVER on mobile sand
  scatter(7.4, 0.9, 0x3c21, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc > 0.34) return;
    if (MF.one(x, y, 1) > 0.42) return;
    if ((h3(gi, gj, S0 ^ 0x3c25) & 255) > 88 + (1 - sc / 0.34) * 100) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 6)) return;
    cv.t = tagRaw();
    P.tussock(cv, iso, C, ns, x, y, T.surfaceZ(x, y),
      (h3(gi, gj, S0 ^ 0x3c29) & 1) ? SCRUB : SCRUB2,
      5 + ((h3(gi, gj, S0 ^ 0x3c2b) >>> 6) & 3));
  });

  // nebkha — the MARGIN species, and the one made of the axis itself
  scatter(13.5, 0.88, 0x4d31, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc < 0.31 || sc > 0.68) return;
    if (T.slopeAt(x, y) > 0.34) return;
    if ((h3(gi, gj, S0 ^ 0x4d35) & 255) > 168) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 8, y - 8, x + 8, y + 8, 8)) return;
    const z = T.surfaceZ(x, y);
    cv.t = tagRaw();
    P.driftTail(cv, iso, C, x, y, z + 0.03, wx, wy, 9, 3.0, SANDS[2]);
    cv.t = tagRaw();
    P.nebkha(cv, iso, C, ns, x, y, z, SANDS[0],
      (h3(gi, gj, S0 ^ 0x4d39) & 1) ? SCRUB : SCRUB2,
      5 + ((h3(gi, gj, S0 ^ 0x4d3b) >>> 6) & 3));
  });

  // saltbush — the pavement and the pan edge
  scatter(9.8, 0.9, 0x5e41, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    const pn = MF.one(x, y, 1);
    if (sc > 0.22) return;
    if (pn > 0.55) return;
    if ((h3(gi, gj, S0 ^ 0x5e45) & 255) > 96 + pn * 240) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 4, y - 4, x + 4, y + 4, 5)) return;
    cv.t = tagRaw();
    P.saltbush(cv, iso, C, ns, x, y, T.surfaceZ(x, y),
      (h3(gi, gj, S0 ^ 0x5e49) & 1) ? SCRUB2 : SCRUB,
      4 + ((h3(gi, gj, S0 ^ 0x5e4b) >>> 6) & 2));
  });

  // bones and dumped tyres — rare, and always where something walked
  scatter(38, 0.9, 0x6f51, (x, y, gi, gj) => {
    if (MF.one(x, y, 0) > 0.42) return;
    if ((h3(gi, gj, S0 ^ 0x6f55) & 255) > 150) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 6, y - 6, x + 6, y + 6, 4)) return;
    const z = T.surfaceZ(x, y);
    cv.t = tagRaw();
    if ((h3(gi, gj, S0 ^ 0x6f59) & 3) === 0) P.tyre(cv, iso, C, ns, x, y, z);
    else P.bones(cv, iso, C, ns, x, y, z, BONE);
  });

  // drift tails alone, on the open sand: the wind's own mark on empty ground
  scatter(17, 0.92, 0x7a61, (x, y, gi, gj) => {
    const sc = MF.one(x, y, 0);
    if (sc < 0.5) return;
    if ((h3(gi, gj, S0 ^ 0x7a65) & 255) > 118) return;
    if (nearBuilt(x, y)) return;
    if (!vis(x - 12, y - 12, x + 12, y + 12, 4)) return;
    cv.t = tagRaw();
    P.driftTail(cv, iso, C, x, y, T.surfaceZ(x, y) + 0.03, wx, wy,
      9 + ((h3(gi, gj, S0 ^ 0x7a69) >>> 4) & 7), 3.4, SANDS[1]);
  });
}
