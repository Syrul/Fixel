// The highland biome — a terraced massif with a tree line across it.
//
// WHAT THIS IS STRUCTURALLY. `heightField('highland')` is a domain-warped
// ridged sum: the |2n-1| fold puts a crease at every zero crossing, so the
// surface is arêtes and gullies rather than lumps. Three things are done to it
// before it is contoured, and each of them is a landform rather than a
// decoration:
//
//   THE BENCH LADDER. A monotone piecewise-linear remap of HEIGHT — not of
//   position — whose derivative alternates between about 0.2 and about 2.5 with
//   a period of a dozen height units. Where the derivative is small the ground
//   is a bench thirty units wide carrying one terrace; where it is large the
//   terraces stack four and five deep into a cliff band. Uniform terracing of a
//   uniform field is what produced the desert's corduroy: every tread the same
//   width, every riser the same height, a ploughed field to the horizon. A
//   ladder gives the two things a mountainside actually has, and it gives them
//   at a scale the eye reads as bedding rather than as banding.
//
//   THE DIP. The ladder is evaluated on `h + tilt(x, y)` and the tilt is
//   subtracted again, so the benches are not level: they dip across the frame
//   the way a bedding plane does, and no bench is a horizontal line on screen.
//
//   THE HUMMOCKS. A small mid-frequency term, about half a terrace deep, added
//   after the ladder. On a cliff it does nothing but ragged the contour; on a
//   bench it breaks a thirty-unit tread into blobs of two or three levels —
//   moraine mounds and peat hags. This is the answer to the finding in
//   `docs/CRAFT.md` that 83% of long horizontal runs are the cross-section of
//   one flat face too big. It is GEOMETRY, not a value step every N pixels.
//
// THE PLACEMENT AXIS IS THE TREE LINE, AS A FIELD.
//
// Every other biome in this project admits on slope and on height. This one
// computes, per point, the ELEVATION CEILING for woody growth, out of three
// terms that are all readouts of the same surface:
//
//   - concavity, over a 16-unit ring. A gully is scoured by avalanche and
//     pools cold air, so the ceiling SAGS in it;
//   - aspect against this seed's sun vector, weighted by slope. A sunny
//     shoulder runs warmer, so the ceiling RISES on it;
//   - a low-frequency noise, because a tree line is not an isopleth.
//
// Everything then zones off `h - treeLine`: pasture and tarn below it, closing
// forest under it, a THINNING BAND across it, krummholz just above, then heath,
// scree, bare rock and snow. The band is what this biome is for. A horizontal
// line where the conifers stop is the failure state; the ceiling here moves by
// twenty height units across a frame, which on a 0.4 slope is fifty world units
// of horizontal wander, and the trees themselves are admitted on a probability
// ramp eight units deep so they straggle out rather than stop.
//
// AND THE COLOUR. The desert driver died of colour collapse — 68-82 distinct
// tones in a frame because its ground drew in four. Here the frame is
// partitioned into REGIONS by two slow noise fields whose level sets are curves
// at every angle, each region mints its own turf / heath / scree / rock / snow /
// moss / soil bases off the scene's families, and each region mints a separate
// tone per TERRACE LEVEL within each of those, with the jitter deliberately
// wider than `palette.js`'s own quantisation step. A contour band is a
// different value of the same material; a neighbouring massif is a different
// material. That is the city's per-block commitment applied to ground.

import { heightField, fbm, ridged, vnoise, tri } from '../world.js';
import { makeTerrain, drawTerrain, walkTrack } from '../terrain.js';
import { drawSlab, drawBox } from '../../core/iso.js';
import { box } from '../draw.js';
import { h3 } from '../palette.js';
import { topFace } from '../faces.js';
import { localC } from '../stage.js';
import { dep, projR } from '../view.js';
import * as P from '../props/highland.js';

const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The seven ground materials. They are FAMILIES, not values: turf is green,
// heath is olive, scree is a pale warm grey, rock is a cool dark one, snow is
// near-white, moss is a deep blue-green and soil is brown. §3.3 of the
// addendum: if the axis does not visibly change the material it is not doing
// anything.
const M_TURF = 0, M_HEATH = 1, M_SCREE = 2, M_ROCK = 3;
const M_SNOW = 4, M_MOSS = 5, M_SOIL = 6, M_HEATHER = 7, NMAT = 8;

// FOUR THINGS DECIDE A GROUND PIXEL, AND EACH OF THEM MEANS EXACTLY ONE THING.
//
//   the FAMILY        is the material — turf is green, scree is buff grey,
//                     rock is one hue, snow is near-white, heather is the one
//                     purple in the biome and it is a minority
//   the family's
//   INSTANCE          is (this massif region, this terrace level): many local
//                     variants WITHIN the material, never across materials
//   the family's
//   STEP (.t/.l/.r)   is the LIGHT — which way this flank faces
//   the family's
//   .k                is a closing line and nothing else
//
// The first render of this file got that wrong in the way `docs/BAR.md` names
// as the round-1 defect: it jittered hue by up to fifty-five degrees per region
// and fifteen per level, so it cleared the distinct-colour floor with hue chaos
// and a viewer could not say what any patch was made of. Look at `pv` in
// `biomes/city.js` — a SIXTEEN degree wobble on one family, and the width comes
// from saturation and lightness, which do not change what a thing is.
const HTR = [22, 12, 8, -6, -10, 7, 8, 6];       // hue trend over the ladder
const LTR = [0.30, 0.16, 0.22, 0.26, 0.05, -0.06, 0.12, 0.10];  // rel lightness
const STR = [-0.36, -0.20, -0.12, -0.14, 0.0, -0.22, -0.16, -0.18]; // rel sat
// Region hue wobble, per material, in degrees. Rock and snow are near-fixed:
// two massifs may be different greys, they may not be different colours.
const HJIT = [12, 9, 8, 9, 10, 12, 9, 10];
// SATURATION CEILINGS. Rock, scree and snow are NEUTRALS and the scene's own
// `neutralSat` already runs them as high as 1.75x before a region jitter
// touches them. Left uncapped, `C.slate` came out of the first render as a
// 45%-saturated indigo and half the massif was violet.
const SCAP = [0.60, 0.33, 0.16, 0.19, 0.085, 0.50, 0.34, 0.30];

// ---------------------------------------------------------------------------
// A bilinear scalar field, eight channels interleaved, with a cursor.
//
// The material boundaries must be SMOOTH CONTOURS. A boundary quantised to the
// terrain cell is a 12-pixel mosaic, and the whole argument for putting the
// turf/scree line in the ground shader rather than in the cell loop is that it
// then comes out as a hand-drawn curve at an arbitrary angle. Interleaving is
// not tidiness: the shader runs once per ground pixel and sharing one index
// computation across every channel it wants is most of the difference between a
// 90ms frame and a 250ms one — which is why `locate` and `ch` are separate.

const NCH = 10;
const CH_SLP = 8;    // slope magnitude at the scale of the massif
const CH_RIB2 = 9;   // fine rib field — erosion stringers through the turf
const CH_H = 0;      // smooth surface height, world units
const CH_TL = 1;     // the tree line ceiling, world units
const CH_CONC = 2;   // concavity over a ring; positive is a hollow
const CH_RIB = 3;    // outcrop rib field
const CH_FAN = 4;    // scree supply — how much cliff stands above this point
const CH_RA = 5;     // region field A
const CH_RB = 6;     // region field B
const CH_ASP = 7;    // aspect against the sun vector, [-1, 1]

// Gradient magnitudes are kept for the three channels a CONTOUR is cut on, so
// an inked material boundary is one pixel wide whether the ground under it
// falls at 5% or at 300%.
const GC = [CH_H, CH_RIB, CH_FAN];

function makeFields(X0, Y0, X1, Y1, cell, fn) {
  const gx = Math.ceil((X1 - X0) / cell) + 4;
  const gy = Math.ceil((Y1 - Y0) / cell) + 4;
  const a = new Float32Array(gx * gy * NCH);
  const g = new Float32Array(gx * gy * 3);
  const tmp = new Float64Array(NCH);
  for (let j = 0; j < gy; j++) {
    const wy = Y0 + (j - 1) * cell;
    for (let i = 0; i < gx; i++) {
      fn(X0 + (i - 1) * cell, wy, tmp);
      const k = (j * gx + i) * NCH;
      for (let c = 0; c < NCH; c++) a[k + c] = tmp[c];
    }
  }
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const k = j * gx + i;
      const im = i > 0 ? i - 1 : i, ip = i < gx - 1 ? i + 1 : i;
      const jm = j > 0 ? j - 1 : j, jp = j < gy - 1 ? j + 1 : j;
      for (let q = 0; q < 3; q++) {
        const c = GC[q];
        const dx = (a[(j * gx + ip) * NCH + c] - a[(j * gx + im) * NCH + c]) / (2 * cell);
        const dy = (a[(jp * gx + i) * NCH + c] - a[(jm * gx + i) * NCH + c]) / (2 * cell);
        g[k * 3 + q] = Math.sqrt(dx * dx + dy * dy) + 1e-5;
      }
    }
  }
  let k0 = 0, k1 = 0, tx = 0, ty = 0, gk = 0;
  const F = {
    gx, gy, cell,
    locate(x, y) {
      const fx = (x - X0) / cell + 1, fy = (y - Y0) / cell + 1;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
      if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
      tx = fx - i; ty = fy - j;
      if (tx < 0) tx = 0; else if (tx > 1) tx = 1;
      if (ty < 0) ty = 0; else if (ty > 1) ty = 1;
      gk = j * gx + i;
      k0 = gk * NCH; k1 = k0 + gx * NCH;
    },
    ch(c) {
      const p = a[k0 + c], q = a[k0 + NCH + c];
      const r = a[k1 + c], s = a[k1 + NCH + c];
      const lo = p + (q - p) * tx;
      return lo + ((r + (s - r) * tx) - lo) * ty;
    },
    grad(q) { return g[gk * 3 + q]; },
    one(x, y, c) { F.locate(x, y); return F.ch(c); },
  };
  return F;
}

// Eight unit directions, as literal constants: nothing that decides a pixel in
// this generator may call a transcendental.
const RING = [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071],
  [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071],
];

// ---------------------------------------------------------------------------

export function paintHighland(stage) {
  const { C, cv, iso, rng, W, H, S, X0, X1, Y0, Y1, seedN, tag, tagRaw } = stage;

  // ------------------------------------------------------------- the massif
  // What KIND of mountain this seed is. Relief, grain, how deeply it is
  // benched, where its tree line sits and how far the sun swings it are all
  // things a massif HAS, not constants the generator has.
  const ms = rng.stream('massif');
  //
  // THE RELIEF IS THE SUBJECT AND IT HAS TO BE BIG. In this projection the
  // ground recedes at two screen pixels per world unit of (x+y) and height
  // lifts at four, so a frame 900 pixels tall looks along about 330 units of
  // ground: a 48-unit massif lifts 190 pixels out of 900 and reads as downland.
  // Seventy to ninety-five lifts 280-380 and reads as a mountain. The grain is
  // lengthened in step so the SLOPE stays where the terraces want it — around a
  // third — and the frame then holds one or two landforms instead of six.
  const amp = ms.range(70, 95);
  const base = ms.range(-10, -3);
  const freq = ms.range(0.0042, 0.0058);
  const warpAmp = ms.range(26, 46);
  // THE TERRACE STEP IS THE LEGIBILITY BUDGET. At 2.6 the first render came out
  // as a moiré of contour lines: forty crossings across the frame's depth, and
  // a landform you could not read behind them. Thirteen or fourteen levels over
  // the whole relief is the figure that shows benches, and a riser at 3.6 units
  // is fourteen screen pixels — a cliff you can see rather than a seam.
  //
  // AND BOTH ARE QUANTISED TO THE PIXEL LATTICE, WHICH IS A CORRECTNESS FIX.
  // A cell's top face projects to the diamond
  //     (0,0) (4c, 2c) (0, 4c) (-4c, 2c)
  // offset vertically by 4z, so with `cell` a multiple of 0.5 and `step` a
  // multiple of 0.25 every corner is an integer and the diamonds tile exactly.
  // At 3.2 and 2.71 they do not: `fillPoly`'s ceil/floor span rule then leaves
  // a one-pixel hole at the meeting point of four cells, and since the canvas
  // is initialised to palette index 0 — which is the shared TRUE BLACK — the
  // whole frame came out stippled with a black chevron every twenty-six
  // pixels. Nothing in the harness sees a hole; it reads as ink.
  const step = Math.round(ms.range(4.0, 5.0) * 4) / 4;
  const cell = 3.5;
  const raw = heightField('highland', { seedN, amp, base, freq, warpAmp });

  // ---- the bench ladder.  M(t + LP) = M(t) + LP, monotone, piecewise linear.
  const LP = ms.range(16.0, 23.0);
  const GF = ms.range(0.68, 0.78);          // fraction of a period that benches
  const g0 = ms.range(0.26, 0.38);          // bench gradient factor
  const g1 = (1 - g0 * GF) / (1 - GF);      // riser factor, so the map is exact
  const ladder = (t) => {
    const n = Math.floor(t / LP);
    const f = t / LP - n;
    return (n + (f < GF ? f * g0 : g0 * GF + (f - GF) * g1)) * LP;
  };
  // The dip: benches are bedding planes, and a bedding plane is not level.
  const dipA = ms.range(0.020, 0.055), dipB = ms.range(0.020, 0.055);
  const dipS = ms.bool(0.5) ? 1 : -1;
  const dipN = ms.range(3.0, 7.0);
  const tiltAt = (x, y) => dipA * x + dipS * dipB * y
    + dipN * (fbm(x * 0.0035, y * 0.0035, seedN + 851, 2) - 0.5) * 2;
  // Moraine mounds. A wavelength of about forty units, which is two or three
  // terrace treads: enough to break a bench into blobs, far too coarse to read
  // as noise. At the first attempt this ran at half the wavelength and twice
  // the amplitude and the whole frame turned into hummocks with no massif left.
  const humA = step * ms.range(0.26, 0.40);
  const humF = ms.range(0.020, 0.030);

  // THE MASSIF IS AUTHORED, AND FOR THE SAME REASON THE HERO IS.
  //
  // "A world with one water body cannot leave its position to a jittered
  // angle." A world with one mountain cannot either. The frame looks along a
  // corridor about seventy world units wide, so whether a noise field's peak
  // lands inside it is luck, and half the seeds came back as a slice of
  // mid-slope with no summit anywhere — terraced country, not mountains. A
  // single broad dome is added under the ridged sum, centred by INVERTING the
  // projection at a target screen position in the upper third of the frame, so
  // every seed has a summit where the eye lands and a valley in front of it.
  // The ridged sum then supplies the arêtes and gullies on its flanks and the
  // ladder wraps its benches round it as contour rings.
  const domeA = amp * ms.range(0.55, 0.92);
  const domeR = ms.range(98, 142);
  const tz = base + amp * 0.55 + domeA;
  const tu = (W * (0.5 + ms.range(-0.14, 0.14)) - iso.ox) / (2 * S);
  const tv = (H * ms.range(0.16, 0.32) - iso.oy) / S + 2 * tz;
  const dcx = (tv + tu) / 2, dcy = (tv - tu) / 2;
  // The profile is (1 - r/R)^2 and NOT (1 - r^2/R^2)^2, which matters more than
  // it looks: every function of r-squared has zero gradient at its centre, so
  // the first version put a flat plateau the size of the frame at the top of
  // the mountain, and the snow line — which is defined off the summit — covered
  // half the picture in white. Taking the root first gives a genuine apex.
  const dome = (x, y) => {
    const dx = x - dcx, dy = y - dcy;
    const t = 1 - Math.sqrt(dx * dx + dy * dy) / domeR;
    return t <= 0 ? 0 : domeA * t * t;
  };

  const height = (x, y) => {
    const t = tiltAt(x, y);
    return ladder(raw(x, y) + dome(x, y) + t) - t
      + humA * (fbm(x * humF, y * humF, seedN + 421, 3) - 0.5) * 2;
  };

  // ---- the world box.
  // RECORDED DEVIATION. The stage pads the world 190 units behind the frame in
  // both -x and -y, which is more than this relief needs and costs a terrain
  // grid four times the area that is ever drawn. The box below is derived from
  // the projection instead: invert the screen rectangle plus a margin through
  // u = x-y and v = x+y over this seed's own height range. It is never smaller
  // than what the frame can see and it is a third the cells.
  const MG = 96;
  const zLo = base - 12, zHi = base + amp + domeA + 8;
  const uLo = (-MG - iso.ox) / (2 * S), uHi = (W + MG - iso.ox) / (2 * S);
  const vLo = (-MG - iso.oy) / S + 2 * zLo, vHi = (H + MG - iso.oy) / S + 2 * zHi;
  const A0 = Math.max(X0, Math.floor((vLo + uLo) / 2) - 6);
  const A1 = Math.ceil((vHi + uHi) / 2) + 6;
  const B0 = Math.max(Y0, Math.floor((vLo - uHi) / 2) - 6);
  const B1 = Math.ceil((vHi - uLo) / 2) + 6;

  const T = makeTerrain({ X0: A0, Y0: B0, X1: A1, Y1: B1, cell, step, height });
  stage.terrain = T;

  // ------------------------------------------------------------- the fields
  let sunx = ms.range(-1, 1), suny = ms.range(-1, 1);
  { const n = Math.sqrt(sunx * sunx + suny * suny) || 1; sunx /= n; suny /= n; }
  // THE ZONES ARE FRACTIONS OF THE WHOLE RELIEF, DOME INCLUDED. Read off `amp`
  // alone the tree line sat at a third of the mountain's height, so five sixths
  // of every frame was above it and the biome had no forest in it at all.
  const HREL = amp + domeA;
  // AND THEY ARE READ OFF THE TERRAIN THAT WAS ACTUALLY BUILT, not off the
  // parameters that were asked for. The dome's summit sits wherever the ridged
  // sum happens to leave it, so a snow line computed as a fraction of the
  // NOMINAL relief landed above the real summit on most seeds and no frame had
  // any snow in it. Scanned over the authored massif, "snow is the top fifteen
  // units of the mountain" is a statement that is true by construction.
  let zTop = -1e9, zBot = 1e9;
  {
    const RR = domeR * 1.15;
    for (let j = 0; j < T.gy; j++) {
      for (let i = 0; i < T.gx; i++) {
        const x = A0 + i * cell - dcx, y = B0 + j * cell - dcy;
        if (x * x + y * y > RR * RR) continue;
        const h = T.raw[j * T.gx + i];
        if (h > zTop) zTop = h;
        if (h < zBot) zBot = h;
      }
    }
    if (zTop < zBot) { zTop = base + HREL; zBot = base; }
  }
  const TL0 = zBot + (zTop - zBot) * ms.range(0.40, 0.55);   // mean tree line
  const SN0 = zTop - ms.range(7, 15);                        // mean snow line
  const kGully = ms.range(0.9, 1.7);
  const kAspect = ms.range(4.0, 8.0);
  const kNoise = ms.range(7.0, 12.0);
  const RC = 16;

  // THE ASPECT IS READ AT THE SCALE OF THE MASSIF, NOT AT THE SCALE OF A CELL.
  // It is what puts the light on this landscape: every top face in this
  // projection is the same lit plane, so without an aspect term a mountain and
  // a plain shade identically and the picture reads as a contour map. Taken
  // over a 14-unit arm it gives two or three large coherent masses — a sunlit
  // flank, a shaded one — whose boundaries are the ridge lines themselves.
  const AE = 14;
  const F = makeFields(A0, B0, A1, B1, 3.2, (x, y, out) => {
    const hh = T.heightAt(x, y);
    out[CH_H] = hh;
    const ax = (T.heightAt(x + AE, y) - T.heightAt(x - AE, y)) / (2 * AE);
    const ay = (T.heightAt(x, y + AE) - T.heightAt(x, y - AE)) / (2 * AE);
    const am = Math.sqrt(ax * ax + ay * ay);
    let ring = 0;
    for (let i = 0; i < 8; i++) ring += T.heightAt(x + RING[i][0] * RC, y + RING[i][1] * RC);
    const conc = (ring * 0.125 - hh) / 7;
    out[CH_CONC] = conc;
    const asp = am > 1e-4 ? -(ax * sunx + ay * suny) / am : 0;
    out[CH_ASP] = asp * cl01(am / 0.07);
    out[CH_SLP] = am;
    out[CH_TL] = TL0
      - kGully * (conc > 0 ? conc : 0) * 9
      + kAspect * asp * cl01(am / 0.30)
      + kNoise * (fbm(x * 0.0055, y * 0.0055, seedN + 91, 3) - 0.5) * 2;
    // OUTCROP RIBS ARE LINEAR, so they are the ridge lines of a ridged sum at a
    // 70-unit wavelength: an outcrop that follows the fall line for a hundred
    // units and is fifteen wide. At the first attempt this ran at 0.026 and
    // three octaves and rock came out as forty-unit blotches over a third of
    // the frame — a material break with no landform behind it.
    out[CH_RIB] = ridged(x * 0.0135, y * 0.0135, seedN + 131, 2);
    // EROSION STRINGERS. The same fold at three times the frequency and taken
    // only in its top few percent: a winding line of broken ground fifteen to
    // twenty-five units long and two or three wide, at every angle. This is
    // what stops a bench being one flat face — `flat5x5` is the number that
    // reads it, and a mountainside is full of these.
    out[CH_RIB2] = ridged(x * 0.042, y * 0.042, seedN + 523, 2);
    // Scree supply: how much cliff stands over this point, lobed by a
    // mid-frequency field so the aprons are fans and not a continuous belt.
    let rise = 0;
    if (am > 1e-4) {
      const D = 26;
      rise = (T.heightAt(x + ax / am * D, y + ay / am * D) - hh) / D;
    }
    out[CH_FAN] = cl01((rise - 0.50) / 0.42) * cl01((0.90 - am) / 0.40)
      * (0.45 + 1.05 * fbm(x * 0.015, y * 0.015, seedN + 177, 2));
    out[CH_RA] = vnoise(x * 0.0105, y * 0.0105, seedN + 211);
    out[CH_RB] = vnoise(x * 0.0091, y * 0.0091, seedN + 307);
  });

  // ------------------------------------------------------------ the palette
  // ONE COMMITTED PALETTE PER REGION, AND ONE TONE PER TERRACE LEVEL INSIDE IT.
  //
  // The jitters below are deliberately wide. `palette.js` caches on a quantised
  // key whose lightness step is as coarse as 1/18 and whose hue step is up to
  // 8.5 degrees, and `biomes/city.js` records what happens when the wobble does
  // not clear one step: every block drew the same pavement and one tone held
  // 16% of the frame. A level walk of a few percent would do exactly nothing.
  const cs = rng.stream('massifcolour');
  const regSeed = cs.int(1, 1 << 26);
  const NREG = 16;
  // The BIOME's own identity, drawn once: this seed's turf hue, its rock hue,
  // its scree hue. A region then wobbles around them by a few degrees and gets
  // its width out of saturation and lightness, which change how weathered a
  // material is and never change what it is.
  //
  // FIVE MATERIALS THAT ARE FIVE DIFFERENT THINGS AT A GLANCE: green turf,
  // tawny moor, pale scree, dark rock, near-white snow. The version before this
  // one built heath off `C.lime` and the whole frame came back one olive, which
  // is the same failure as the desert's four tones arriving by a different
  // road. Heather is the one purple in the biome, it is a minority patch inside
  // the moor, and it means heather.
  const HB = [
    C.grass._h + cs.range(-13, 13),
    C.wood._h + cs.range(10, 30),
    C.stone._h + cs.range(-12, 12),
    C.slate._h + cs.range(-26, 16),
    C.white._h + cs.range(-30, 24),
    C.leaf._h + cs.range(-14, 14),
    C.wood._h + cs.range(-10, 10),
    C.magenta._h + cs.range(-26, 14),
  ];
  const SB = [C.grass._s * cs.range(0.7, 1.15), C.wood._s * cs.range(0.55, 0.92),
    C.stone._s * cs.range(0.7, 1.5), C.slate._s * cs.range(0.7, 1.5),
    C.white._s * cs.range(0.6, 1.8), C.leaf._s * cs.range(0.6, 1.0),
    C.wood._s * cs.range(0.7, 1.2), C.magenta._s * cs.range(0.28, 0.44)];
  const LB = [C.grass._L * cs.range(0.80, 1.08), C.wood._L * cs.range(0.78, 1.02),
    C.stone._L * cs.range(0.76, 0.98), C.slate._L * cs.range(1.05, 1.55),
    C.white._L * cs.range(0.86, 0.98), C.leaf._L * cs.range(0.80, 1.16),
    C.wood._L * cs.range(0.68, 0.98), C.magenta._L * cs.range(0.62, 0.86)];
  const REG = [];
  for (let r = 0; r < NREG; r++) {
    const row = [];
    for (let m = 0; m < NMAT; m++) {
      row.push({
        _h: HB[m] + cs.range(-HJIT[m], HJIT[m]),
        _s: Math.min(SCAP[m], SB[m] * cs.range(0.60, 1.55)),
        _L: Math.min(0.96, LB[m] * cs.range(0.88, 1.13)),
      });
    }
    REG.push(row);
  }

  let L0 = 1e9, L1 = -1e9;
  for (let k = 0; k < T.lvl.length; k++) {
    const v = T.lvl[k];
    if (v < L0) L0 = v;
    if (v > L1) L1 = v;
  }
  const nL = Math.max(1, L1 - L0 + 1);
  const TB = new Array(NREG * nL * NMAT);
  for (let r = 0; r < NREG; r++) {
    for (let li = 0; li < nL; li++) {
      const t = nL > 1 ? li / (nL - 1) : 0.5;
      for (let m = 0; m < NMAT; m++) {
        const sp = REG[r][m];
        const u = h3(r * 37 + m, li, regSeed);
        const uh = ((u >>> 3) & 1023) / 1024;
        const us = ((u >>> 13) & 511) / 512;
        const ul = ((u >>> 22) & 255) / 256;
        // Per LEVEL: six degrees of hue and no more — a contour band is a
        // different value of the same material. The width that keeps
        // `palette.distinct` up comes from saturation (a factor of 1.7 across
        // the range) and lightness (a third), both of which clear the
        // quantisation in `palette.js` and neither of which is a hue.
        TB[(r * nL + li) * NMAT + m] = C.mk(
          sp._h + HTR[m] * (t - 0.5) + 6.5 * (uh - 0.5),
          Math.max(0.008, Math.min(SCAP[m],
            sp._s * (1 + STR[m] * (t - 0.5)) * (0.76 + 0.52 * us))),
          Math.min(0.97, sp._L * (1 + LTR[m] * (t - 0.5) + 0.17 * (ul - 0.5))));
      }
    }
  }
  const LI = (z) => {
    let li = Math.round(z / step) - L0;
    return li < 0 ? 0 : li >= nL ? nL - 1 : li;
  };
  // A region is the cell of a two-field quantisation. The level sets of two
  // bilinear value-noise fields cross at every angle, so region boundaries are
  // curves — never the axis-aligned rectangles the desert's per-cell hash drew.
  const regOf = (ra, rb) => {
    let i = Math.floor(ra * 3.999), j = Math.floor(rb * 3.999);
    if (i < 0) i = 0; else if (i > 3) i = 3;
    if (j < 0) j = 0; else if (j > 3) j = 3;
    return i * 4 + j;
  };
  const TN = (m, r, li) => TB[(r * nL + li) * NMAT + m];

  // ---- water. One or two corrie tarns, cut into the terrain after the fact.
  const ws = rng.stream('tarn');
  // A tarn is a HOLE full of sky, not a pool of pigment. At the first attempt
  // it came out as near-black indigo and read as a shadow.
  const tarnFam = C.mk(C.teal._h + ws.range(-14, 14),
    Math.min(0.40, C.teal._s * ws.range(0.34, 0.72)),
    Math.min(0.68, C.teal._L * ws.range(0.86, 1.16)));
  const tarnDeep = C.mk(tarnFam._h + ws.range(-6, 6),
    Math.min(0.44, tarnFam._s * ws.range(1.0, 1.35)),
    tarnFam._L * ws.range(0.74, 0.88));
  cutTarns(T, F, ws, step, TL0, seedN);

  // -------------------------------------------------------------- the ground
  const gs = rng.stream('groundmix');
  const kSnowC = gs.range(7.0, 13.0);     // snow lies in hollows, not on ridges
  const kSnowA = gs.range(2.5, 6.0);      // and melts off the sunny side
  // MEASURED, NOT GUESSED. `ridged` has a MEDIAN of 0.66, not a mean of 0.5:
  // the |2n-1| fold pushes the whole distribution up against its ceiling. A
  // threshold of 0.70 therefore put FORTY PERCENT of the frame in bare rock and
  // the first two renders came back as a slate-blue field with grass on it.
  // p90 is 0.865, so an outcrop that covers a tenth of the ground wants 0.88.
  const RIB0 = gs.range(0.86, 0.92);
  const FAN0 = gs.range(0.34, 0.46);
  const CRAG = gs.range(1.55, 2.10);      // above this slope, turf does not hold
  const TP = gs.range(3.0, 4.4);          // sheep-track contour interval
  const S1 = seedN ^ 0x5b7d;
  const INK = C.black;

  // A quadratic-form patch, the idiom `pavementShade` works out in full: the
  // boundary is an ellipse at an arbitrary rotation, so it walks off the 2:1
  // lattice at every angle, and the interior is one large flat field. `k` is
  // the patch pitch, `rate` how many of the cells carry one.
  const patch = (u, v, k, salt, rate) => {
    const pu = Math.floor(u / k), pv = Math.floor(v / k);
    const g = h3(pu, pv, salt);
    if ((g & 7) >= rate) return 0;
    const su = u - pu * k - k * 0.22 - ((g >>> 8) & 15) * 0.4;
    const sv = v - pv * k - k * 0.22 - ((g >>> 12) & 15) * 0.4;
    const rr = su * su * (0.58 + ((g >>> 17) & 7) * 0.13)
      + sv * sv * (0.68 + ((g >>> 21) & 7) * 0.12) + su * sv * 0.52;
    const RR = 34 + ((g >>> 25) & 31);
    return rr < RR ? 2 : rr < RR + 9 ? 1 : 0;
  };

  const groundTop = (u, v, z, q) => {
    F.locate(u, v);
    const hf = F.ch(CH_H);
    const li = LI(z);
    const reg = regOf(F.ch(CH_RA), F.ch(CH_RB));
    const conc = F.ch(CH_CONC);
    const gh = F.grad(0);
    // THE LIGHT ON THE MASSIF. Every top face in this projection is the same
    // plane, so nothing in the renderer knows which way a slope faces; the
    // aspect field is what turns fifteen flat terraces into a sunlit flank and
    // a shaded one. Three masses, whose boundaries are the ridge lines.
    // `.r` is reserved for a genuinely back-lit flank: it runs as low as 0.41
    // of the base luma, and used for every shaded slope it turned half the
    // frame to mud.
    const asp = F.ch(CH_ASP);
    const lit = asp > 0.22 ? 0 : asp > -0.55 ? 1 : 2;
    const pk = (G) => (lit === 0 ? G.t : lit === 1 ? G.l : G.r);

    // ---- snow, and the snow line inked as one closing contour
    const dS = hf - (SN0 - kSnowC * conc - kSnowA * asp);
    if (dS > -0.19 * gh) {
      if (dS < 0.19 * gh) return INK;
      const SNW = TN(M_SNOW, reg, li);
      const rib = F.ch(CH_RIB);
      // Wind-scoured rock through a snowfield: only on convexities, which is
      // where it happens and which keeps the snow lying in the hollows.
      if (rib > 0.80 && conc < 0.02) return pk(TN(M_ROCK, reg, li));
      const r2 = F.ch(CH_RIB2);
      if (r2 > 0.885 && conc < 0.06) return TN(M_ROCK, reg, li).l;
      if (r2 > 0.845 && conc < 0.06) return SNW.k;
      // WIND SCOOPS. A snowfield is not one plane: the wind cuts lobes out of
      // it and the lee side of every rise carries a drift. Without these a
      // summit bench came out as a single white table two hundred pixels
      // across, which is `flat5x5` in its purest form.
      const p = patch(u, v, 21, S1 + 137, 3);
      if (p === 2) return SNW.r;
      if (p === 1) return SNW.l;
      return conc > 0.10 ? SNW.t : pk(SNW);
    }

    // ---- scree fans below the cliff bands
    const fan = F.ch(CH_FAN);
    if (fan > FAN0) {
      const SC = TN(M_SCREE, reg, li);
      if (fan < FAN0 + 0.14 * F.grad(2)) return INK;
      // Sorted debris: the coarse blocks run out to the toe of the fan, so the
      // apron is banded by the supply field itself rather than by a hash.
      if (fan > FAN0 + 0.30 && F.ch(CH_RIB) > 0.84) return pk(TN(M_ROCK, reg, li));
      // Boulder trains: the coarse stuff runs furthest down a fan, and it lies
      // in lobes because a debris cone builds one lobe at a time.
      const r2 = F.ch(CH_RIB2);
      if (r2 > 0.895) return TN(M_ROCK, reg, li).l;
      if (r2 > 0.855) return SC.k;
      const p = patch(u, v, 16, S1 + 53, 3);
      if (p === 2) return SC.d;
      if (p === 1) return SC.r;
      return fan > FAN0 + 0.18 ? SC.t : pk(SC);
    }

    // ---- outcrop ribs. The threshold falls with altitude, so bare rock takes
    // over gradually instead of at a line. Steep ground below the tree line is
    // crag for the same reason: turf does not hold on it.
    const tl = F.ch(CH_TL);
    const above = hf - tl;
    const rib = F.ch(CH_RIB);
    const rth = RIB0 + 0.055 * cl01(-above / 26) - 0.115 * cl01(above / 24);
    // The crag gate is on the MASSIF's slope, not on the cell's. The bench
    // ladder multiplies the local gradient by two inside every cliff band, so a
    // threshold read off `F.grad(0)` fired on every riser in the frame and the
    // picture came back half bare rock.
    const crag = F.ch(CH_SLP) > CRAG && above > -30;
    if (rib > rth || crag) {
      if (rib > rth && !crag && rib < rth + 0.10 * F.grad(1)) return INK;
      const RK = TN(M_ROCK, reg, li);
      // Bedding on the tread: bands of constant HEIGHT, so they are contours of
      // the surface and run at every angle, closed by the rock's own dark.
      const bd = hf / 2.4;
      const bf = bd - Math.floor(bd);
      if (bf < 0.13) return RK.k;
      return pk(RK);
    }

    // ---- above the tree line: heath, alpine sward, moss in the hollows
    if (above > 0) {
      const HT = TN(M_HEATH, reg, li);
      if (conc > 0.17) return pk(TN(M_MOSS, reg, li));
      // PEAT HAGS. Where a stringer crosses the moor the peat is cut through to
      // bare ground, and the cut has a lip of its own dark. Six percent of the
      // moor, in winding lines, and it is the difference between a moor and a
      // brown rectangle.
      const r2 = F.ch(CH_RIB2);
      if (r2 > 0.90) return pk(TN(M_SOIL, reg, li));
      if (r2 > 0.862) return HT.k;
      const p = patch(u, v, 26, S1 + 11, 2);
      if (p === 2) return pk(TN(M_SCREE, reg, li));
      if (p === 1) return HT.r;
      const hp = patch(u, v, 34, S1 + 71, 2);
      if (hp === 2) return pk(TN(M_HEATHER, reg, li));
      if (hp === 1) return HT.d;
      const sp = patch(u, v, 13, S1 + 97, 2);
      if (sp === 2) return TN(M_TURF, reg, li).l;
      if (sp === 1) return HT.l;
      return pk(HT);
    }

    // ---- below the tree line: turf, moss, bog, and sheep tracks
    const TF = TN(M_TURF, reg, li);
    if (conc > 0.23) return pk(TN(M_MOSS, reg, li));
    // SHEEP TRACKS. Contours of the surface at a fixed height interval, cut to
    // one screen pixel by the gradient, and only inside patches forty units
    // across on ground a sheep would actually traverse. They are the one ground
    // mark in this biome that is genuinely off every lattice, and they break a
    // thirty-unit bench without a value step anywhere.
    if (gh > 0.13 && gh < 0.62
      && (h3(Math.floor(u / 41), Math.floor(v / 41), S1 + 29) & 3) === 0) {
      const tk = hf / TP;
      const tf = tk - Math.floor(tk);
      const wq = 0.22 * gh / TP;
      if (tf < wq) return TN(M_SOIL, reg, li).l;
      if (tf < wq * 1.8) return TF.r;
    }
    const r2 = F.ch(CH_RIB2);
    if (r2 > 0.905) return pk(TN(M_SOIL, reg, li));
    if (r2 > 0.868) return TF.k;
    const p = patch(u, v, 30, S1 + 17, 2);
    if (p === 2) return pk(TN(M_MOSS, reg, li));
    if (p === 1) return TF.r;
    const bp = patch(u, v, 14, S1 + 113, 2);
    if (bp === 2) return TF.d;
    if (bp === 1) return TF.l;
    return pk(TF);
  };

  // A RISER IS MADE OF THE SAME THING THE GROUND ABOVE IT IS MADE OF.
  //
  // The version before this one gave every riser below the tree line a brown
  // soil face with a turf strip over it, and the result was a bright rust line
  // under the lip of every terrace across the whole frame — a repeating
  // decoration, which is the one thing a landscape must not have. A grassy
  // bench ends in a grassy bank. Soil and bedrock appear where they physically
  // do: on a genuinely tall face, on an outcrop, or on ground too steep to hold
  // turf. Then a green hillside is ONE material with a light on it, which is
  // what "a colour must mean something" comes to on open ground.
  const groundSide = (u, v, plane, axis, q, z0) => {
    const x = axis === 1 ? plane : u, y = axis === 1 ? u : plane;
    F.locate(x, y);
    const hf = F.ch(CH_H);
    const conc = F.ch(CH_CONC);
    const zabs = z0 + v;
    const li = LI(zabs);
    const reg = regOf(F.ch(CH_RA), F.ch(CH_RB));
    const above = hf - F.ch(CH_TL);
    const rib = F.ch(CH_RIB);
    const rock = v > step * 1.45 || rib > RIB0 - 0.04
      || (F.ch(CH_SLP) > CRAG && above > -30) || above > 10;
    let m;
    if (zabs > SN0 - kSnowC * conc - kSnowA * F.ch(CH_ASP)) m = M_SNOW;
    else if (rock) m = M_ROCK;
    else if (F.ch(CH_FAN) > FAN0) m = M_SCREE;
    else if (above > 0) m = M_HEATH;
    else m = M_TURF;
    const G = TN(m, reg, li);
    // A CONTACT SHADOW AT THE FOOT OF EVERY RISER, in the material's own dark.
    // It closes the band below and it is the whole of the modelling a face four
    // screen pixels tall can carry.
    if (v < 0.55) return G.k;
    if (m !== M_ROCK) return axis === 1 ? G.d : G.r;
    // Coursed bedrock. Every joint CLOSES a block — `docs/BAR.md`'s one case
    // where a lattice of strokes is right — and none of it is drawn in the
    // shared ink, which is over budget.
    //
    // AND NO PERPEND JOINTS AT ALL. Bed joints plus perpends over a wide cliff
    // band drew a regular grid of blocks across a third of the frame and the
    // whole lower slope read as a brick wall — a mountainside that looked like
    // a city, which is the one confusion this biome exists to avoid. Bedding is
    // horizontal and continuous in real rock; the vertical break is a change of
    // VALUE between blocks, not a stroke.
    const course = 2.5;
    const row = Math.floor(v / course);
    if (v > 1.3 && v - row * course < 0.5 * q) return G.k;
    const blk = 6.5;
    const off = (h3(row, 3, S1) & 7) * (blk * 0.15);
    const col = Math.floor((u + off) / blk);
    const qq = h3(col, row, S1 + 5) & 15;
    if (qq < 5) return axis === 1 ? G.r : G.l;
    if (qq < 8) return G.k;
    return axis === 1 ? G.d : G.r;
  };

  const groundWater = (u, v, z, q) => {
    F.locate(u, v);
    const hf = F.ch(CH_H);
    const d = z - hf;
    if (d < 0.55) return tarnFam.t;
    // Two flat bands and a bright rim: a tarn is a hole in the hill, and the
    // only thing that says so at this size is that its edge is a value change
    // rather than a gradient.
    const g = h3(Math.floor(u / 9), Math.floor(v / 9), S1 + 41) & 15;
    if (d > 3.4) return g < 4 ? tarnDeep.l : tarnDeep.t;
    return g < 5 ? tarnFam.l : tarnFam.t;
  };

  const tags = new Map();
  const tagFor = (L, wet) => {
    const k = (wet ? 'w' : 'l') + L;
    let t = tags.get(k);
    if (!t) { t = tag(); tags.set(k, t); }
    return t;
  };
  drawTerrain(cv, iso, T, { top: groundTop, side: groundSide, water: groundWater },
    { tagFor, ink: INK });

  stage.highland = { T, F, TN, LI, regOf, step, TL0, SN0, A0, A1, B0, B1 };
}

// ---------------------------------------------------------------------------
// CORRIE TARNS.
//
// `makeTerrain` knows one global sea level, which is the right model for a
// shore and the wrong one for a mountain: a tarn is a CLOSED hollow with its
// own surface, and there may be two of them fifty units apart at different
// heights. So they are cut afterwards, into the arrays this driver owns —
// wetness and level, nothing else — and `drawTerrain` then draws the water
// shader on those cells and hangs the surrounding walls down to them, which is
// exactly what the rim of a corrie does.

function cutTarns(T, F, st, step, TL0, seedN) {
  const { X0, Y0, X1, Y1, cell, gx, gy, raw, lvl, wet } = T;
  const want = st.int(1, 2);
  const picked = [];
  const G = 26;
  const cands = [];
  for (let y = Y0 + G; y < Y1 - G; y += G) {
    for (let x = X0 + G; x < X1 - G; x += G) {
      const h = T.heightAt(x, y);
      if (h > TL0 + 6) continue;                       // no tarns on the summit
      const conc = F.one(x, y, CH_CONC);
      if (conc < 0.24) continue;                       // must be a real hollow
      if (T.slopeAt(x, y) > 0.14) continue;
      cands.push([x, y, conc, h]);
    }
  }
  cands.sort((a, b) => b[2] - a[2]);
  for (const c of cands) {
    if (picked.length >= want) break;
    let ok = true;
    for (const p of picked) {
      const dx = p[0] - c[0], dy = p[1] - c[1];
      if (dx * dx + dy * dy < 90 * 90) { ok = false; break; }
    }
    if (ok) picked.push(c);
  }
  for (const [cx, cy, , h] of picked) {
    const R = st.range(9, 16);
    const wl = h + st.range(0.5, 1.4);
    const L = Math.floor(wl / step);
    const i0 = Math.max(0, Math.floor((cx - R - X0) / cell));
    const i1 = Math.min(gx - 1, Math.ceil((cx + R - X0) / cell));
    const j0 = Math.max(0, Math.floor((cy - R - Y0) / cell));
    const j1 = Math.min(gy - 1, Math.ceil((cy + R - Y0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = X0 + i * cell, y = Y0 + j * cell;
        const dx = x - cx, dy = y - cy;
        // The outline is the intersection of a disc with the sub-water-level
        // ground, which is a hand-drawn curve at every angle rather than a
        // circle: the hollow decides most of the shape and the disc only caps
        // how far it can run.
        if (dx * dx + dy * dy > R * R) continue;
        const k = j * gx + i;
        if (raw[k] > wl) continue;
        wet[k] = 1;
        lvl[k] = L;
      }
    }
  }
}
