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
import { h3, EMIT_L } from '../palette.js';
import { topFace, leftFace, rightFace } from '../faces.js';
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

  // AND THE HUMMOCKS GROW WITH THE DOME. A smooth cone terraces into concentric
  // platforms with clean vertical faces, and a stepped pale mass with clean
  // vertical faces is a building — three seeds came back with a summit that
  // read as a modernist block. Doubling the mid-frequency term where the dome
  // is highest breaks the summit terraces into crags without touching the
  // benches on the flanks, which is where the landform wants to stay legible.
  const height = (x, y) => {
    const t = tiltAt(x, y);
    const dm = dome(x, y);
    return ladder(raw(x, y) + dm + t) - t
      + humA * (1 + 1.5 * (dm / domeA)) * (fbm(x * humF, y * humF, seedN + 421, 3) - 0.5) * 2;
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

  // The stage's own `vis` projects at z = 0, which on a hundred-unit massif is
  // out by four hundred pixels. This one takes the object's foot where it
  // actually stands and its height above that.
  const seen = (x, y, z, hh) => {
    const p = iso.proj(x, y, z);
    if (p[0] < -56 || p[0] > W + 56) return false;
    if (p[1] < -24) return false;
    return p[1] - 2 * S * hh <= H + 28;
  };

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
  const TL0 = zBot + (zTop - zBot) * ms.range(0.34, 0.48);   // mean tree line
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
    out[CH_RA] = vnoise(x * 0.0172, y * 0.0172, seedN + 211);
    out[CH_RB] = vnoise(x * 0.0148, y * 0.0148, seedN + 307);
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
  // A TARN AFTER DARK IS A MIRROR, AND A MIRROR IS NOT A SURFACE.
  //
  // This is the emissive argument arriving from the other direction, and it is
  // the third of this biome's night lights — the one that needs no lamp in it.
  // `condLight`'s night branch compresses every pigment toward the ambient
  // floor because that is what happens to a thing the sky is LIGHTING. Still
  // water is not lit by the sky; it IS the sky, folded. Crushed to 0.07 the
  // tarn came out as a hole of near-black indigo in a near-black mountain, which
  // is exactly the "read as a shadow" failure the tone above was already minted
  // to avoid — undone after dark by a transform that had no business applying.
  //
  // So at night the tarn is minted as a SOURCE: a cold pale sky-slate that skips
  // the night compression and the night hue pull, and keeps the weather veil,
  // because fog genuinely does hide a reflection. Against a mountain sitting at
  // the ambient floor it reads as a sheet of light, which is what a corrie tarn
  // under any sky at all actually looks like.
  //
  // AND IT IS STILL, DELIBERATELY. Everything else this round that catches light
  // also moves; this does not. A tarn in a corrie on a cold night is glass —
  // there is no fetch to raise a ripple — and the whole point of the amplitude
  // floor is that a thing which cannot move by a coherent pixel must not move at
  // all. It also keeps the loop out of the biome that already owns the worst
  // case (highland + snow, 694 KB at 440x1000).
  //
  // WHY THIS IS NOT DONE TO THE SEA. The same physics applies to the shore, and
  // the shore must not have it: open water is most of that frame, so lifting it
  // out of the night ramp would raise the key of the whole picture rather than
  // put a highlight in it. A tarn is small enough to be a highlight. Scope is
  // the argument, not physics — stated so nobody generalises it later.
  //
  // NO Rng DRAW HAPPENS HERE. The numbers are hashed off the daylight tarn's own
  // minted family, so the `tarn` stream is untouched and every subsequent draw
  // in it — and therefore every scattered object in the frame — is unmoved.
  let tarnSky = null, tarnSkyD = null;
  if (C.cond && C.cond.night) {
    const sk = h3(Math.round(tarnFam._h * 64), Math.round(tarnFam._L * 4096), 0x7ab1);
    const j = (n, lo, hi) => lo + ((h3(sk, n, 23) & 1023) / 1024) * (hi - lo);
    tarnSky = C.mk(j(1, 200, 224), j(2, 0.10, 0.24), EMIT_L * j(3, 0.60, 0.74), true);
    tarnSkyD = C.mk(j(4, 202, 228), j(5, 0.16, 0.30), EMIT_L * j(6, 0.40, 0.52), true);
  }
  cutTarns(T, F, ws, step, TL0, seedN);

  // ---------------------------------------------------------------- the hero
  // GENERATE THE MATRIX, AUTHOR THE FIGURE, LET THE MATRIX READ THE FIGURE.
  //
  // Everything else in this frame is admitted by the land: a tree stands where
  // the elevation lets it, a wall follows a contour, scree lies where a cliff
  // put it. The viaduct is the one thing that was DECIDED, and it is decided
  // FIRST so the track can be routed to it and the scatter can yield to it.
  //
  // The site is searched, not sampled: hard vetoes and then a weighted score,
  // with no minimum-suitability cutoff anywhere. What a viaduct needs is a
  // GULLY — high ground at both ends, a deep sag between them, and the two
  // abutments within a few units of each other — and none of that can be got
  // by picking a point and hoping.
  const hs = rng.stream('viaduct');
  const hero = findViaduct(T, iso, W, H, S, A0, A1, B0, B1, hs);

  // --------------------------------------------------------------- the track
  // A road in a city is a decision; a track in a landscape is a CONSEQUENCE.
  // `walkTrack` with a heavy climb cost takes the flattest heading available at
  // every step, so it contours round a spur and doubles back where the ground
  // shuts it out — a hill track, off the 2:1 lattice everywhere. It is walked
  // out of the viaduct's western abutment in both directions so the crossing is
  // ON the route rather than beside one.
  const ts = rng.stream('track');
  const climb = ts.range(1.8, 4.2);
  const tw = ts.range(2.1, 3.0);
  // IT STARTS IN THE MIDDLE OF THE FRAME AND IS WALKED BOTH WAYS.
  //
  // The first version started it at the viaduct's abutment, and since a hundred
  // -unit viaduct spans the whole frame width its abutments are at the frame
  // EDGES: the track left the picture in four steps and no seed had a visible
  // route at all. The seed point is inverted from the centre pixel onto the
  // terrain surface, and both walks are biased along world (1,1), which is the
  // screen's long axis — a track that leaves sideways is out of frame in eighty
  // pixels.
  let tsx0 = 0, tsy0 = 0;
  {
    const u = (W * 0.5 - iso.ox) / (2 * S);
    let p = [(u + (H * 0.5 - iso.oy) / S) / 2, ((H * 0.5 - iso.oy) / S - u) / 2];
    for (let i = 0; i < 3; i++) {
      const v = (H * 0.5 - iso.oy) / S + 2 * T.surfaceZ(p[0], p[1]);
      p = [(v + u) / 2, (v - u) / 2];
    }
    tsx0 = p[0]; tsy0 = p[1];
  }
  const th = ts.range(-0.30, 0.30);
  const tdx = 0.7071 - th * 0.7071, tdy = 0.7071 + th * 0.7071;
  const tn = Math.sqrt(tdx * tdx + tdy * tdy);
  const wa = { pts: walkLeg(T, ts, tsx0, tsy0, -tdx / tn, -tdy / tn, climb) };
  const wb = { pts: walkLeg(T, ts, tsx0, tsy0, tdx / tn, tdy / tn, climb) };
  const TRK = splatTrack([wa.pts.slice().reverse(), wb.pts], A0, B0, A1, B1);

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

    // ---- the track, cut into whatever it crosses
    const td = TRK.at(u, v);
    if (td < tw + 1.1) {
      if (td > tw + 0.35) return INK;             // the track's own closing line
      const c = td / tw;
      if (c < 0.30) return TN(M_TURF, reg, li).r; // the crown, still grassed
      if (c > 0.74) return TN(M_SOIL, reg, li).k; // the rut, in its own dark
      const SCq = TN(M_SCREE, reg, li);
      const p = patch(u, v, 9, S1 + 211, 4);
      return p === 2 ? SCq.l : p === 1 ? TN(M_SOIL, reg, li).l : SCq.t;
    }
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
      // AND THE LEDGE IS NEVER CLEAN. A terraced rock knoll drawn as flat pale
      // tops with dark risers reads as a ruined building — measured by eye on
      // three seeds, and the openings between its levels look like doorways.
      // What breaks it is debris: blocks fallen off the bed above, lying in
      // lobes on the ledge, plus the shaded half of each bed.
      const p2 = patch(u, v, 12, S1 + 151, 3);
      if (p2 === 2) return TN(M_SCREE, reg, li).l;
      if (p2 === 1) return RK.r;
      return bf < 0.40 ? RK.d : pk(RK);
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
      const hp = patch(u, v, 38, S1 + 71, 1);
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
    // A RISER ABOVE THE TREE LINE IS NOT AUTOMATICALLY ROCK. It was, and the
    // whole upper mountain came back as flat grey faces in a regular block
    // pattern that read as brutalist architecture rather than as a crag. Moor
    // and scree cover their own risers; bedrock shows on a genuinely TALL face,
    // on an outcrop, and where the massif is too steep to hold anything.
    const rock = v > step * 1.60 || rib > RIB0 - 0.02
      || (F.ch(CH_SLP) > CRAG && above > -30);
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
    // The block width varies per course as well as its phase, so the face is
    // rubble rather than a panel grid, and the value spread is narrow: two
    // steps and the contour, not a checkerboard.
    const blk = 4.2 + (h3(row, 9, S1 + 2) & 7) * 0.7;
    const off = (h3(row, 3, S1) & 15) * (blk * 0.08);
    const col = Math.floor((u + off) / blk);
    const qq = h3(col, row, S1 + 5) & 15;
    if (qq < 6) return axis === 1 ? G.r : G.l;
    if (qq < 9) return G.k;
    return axis === 1 ? G.d : G.r;
  };

  const groundWater = (u, v, z, q) => {
    F.locate(u, v);
    const hf = F.ch(CH_H);
    const d = z - hf;
    // The night families are a straight substitution: same three bands, same
    // rim, same hash. Only the pigment behind them is a source rather than a
    // surface, so the structure a daylight reader learned still holds.
    const FAM = tarnSky || tarnFam, DEEP = tarnSkyD || tarnDeep;
    if (d < 0.55) return FAM.t;
    // Two flat bands and a bright rim: a tarn is a hole in the hill, and the
    // only thing that says so at this size is that its edge is a value change
    // rather than a gradient.
    const g = h3(Math.floor(u / 9), Math.floor(v / 9), S1 + 41) & 15;
    if (d > 3.4) return g < 4 ? DEEP.l : DEEP.t;
    return g < 5 ? FAM.l : FAM.t;
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

  // ------------------------------------------------------- drawing the hero
  const vs = rng.stream('viaductdraw');
  const mason = C.mk(C.stone._h + vs.range(-11, 11), C.stone._s * vs.range(0.55, 1.5),
    Math.min(0.88, C.stone._L * vs.range(0.70, 0.96)));
  const ballast = C.mk(C.roadD._h + vs.range(-12, 12), C.roadD._s * vs.range(0.5, 1.8),
    Math.min(0.72, C.roadD._L * vs.range(0.82, 1.16)));
  P.viaduct(cv, iso, C, vs, {
    x0: hero.x0, y0: hero.y0, len: hero.len, wide: hero.wide, ax: hero.ax,
    zDeck: hero.zDeck, rise: hero.rise, bays: hero.bays,
    groundZ: (x, y) => T.surfaceZ(x, y), tone: mason, deck: ballast, tag,
  });
  // The abutment: a short masonry wing at each end so the deck runs INTO the
  // hillside instead of stopping in mid-air. Two boxes, and they are what makes
  // the crossing read as part of a line rather than as an ornament.
  for (const e of [0, 1]) {
    const t = e === 0 ? -9 : hero.len + 1;
    const bx = hero.ax === 0 ? hero.x0 + t : hero.x0 - 1.4;
    const by = hero.ax === 0 ? hero.y0 - 1.4 : hero.y0 + t;
    const bw = hero.ax === 0 ? 8 : hero.wide + 2.8;
    const bd = hero.ax === 0 ? hero.wide + 2.8 : 8;
    const gz = T.surfaceZ(bx + bw * 0.5, by + bd * 0.5);
    if (hero.zDeck + 1.4 - gz < 1) continue;
    // COURSED, LIKE THE PIERS. Drawn as three flat faces it was a hundred by a
    // hundred and sixty pixels of unbroken pale grey at the end of the finest
    // object in the frame, which is the largest flat region this biome makes
    // and it reads as a concrete block rather than as the end of a viaduct.
    const sd = vs.int(1, 1 << 26);
    const FL = leftFace(iso, by + bd, bx, gz - 2);
    const FR = rightFace(iso, bx + bw, by, gz - 2);
    cv.t = tag();
    box(cv, iso, bx, by, gz - 2, bw, bd, hero.zDeck + 1.4 - gz + 2, {
      top: mason.t,
      left: P.masonry(FL, mason, sd, { course: 1.55, base: mason.l, lit: mason.t, dark: mason.r }),
      right: P.masonry(FR, mason, sd + 7, { course: 1.55, base: mason.r, lit: mason.l, dark: mason.k }),
    });
  }

  // --------------------------------------------------- the route's furniture
  const fs = rng.stream('routefurniture');
  const allPts = wa.pts.slice().reverse().concat(wb.pts);
  routeFurniture(cv, iso, C, fs, T, F, allPts, hero, tag, tagRaw, seen, mason);

  // ------------------------------------------------------- the enclosed land
  // THE HEAD DYKE. On a real hill the wall that matters is the one that
  // separates the enclosed pasture from the open moor, and it runs along the
  // contour because that is where the boundary between the two IS. It is
  // followed out of the field rather than drawn: step perpendicular to the
  // gradient and the wall goes where the hillside says it goes.
  const ls = rng.stream('walls');
  const wallTone = C.mk(C.stone._h + ls.range(-11, 11), C.stone._s * ls.range(0.5, 1.5),
    Math.min(0.84, C.stone._L * ls.range(0.60, 0.86)));
  const dykeH = TL0 - ls.range(10, 30);
  const dyke = contourSeek(T, F, iso, W, H, S, dykeH, ls);
  if (dyke) {
    const line = contourRun(T, dyke[0], dyke[1], 62, 3.4, ls);
    cv.t = tag();
    P.wallRun(cv, iso, C, ls, line, (x, y) => T.surfaceZ(x, y), {
      tone: wallTone, h: ls.range(1.9, 2.6), t: 1.2, step: 1.3, gap: 1,
      cull: (x, y) => seen(x, y, T.surfaceZ(x, y), 4),
    });
    // Cross walls dropping down the fall line off it, so the pasture is
    // divided into fields rather than fenced along one edge.
    for (let k = 4; k < line.length - 4; k += ls.int(7, 14)) {
      const [sx, sy] = line[k];
      const down = fallRun(T, sx, sy, ls.int(7, 16), 3.4);
      if (down.length < 4) continue;
      cv.t = tag();
      P.wallRun(cv, iso, C, ls, down, (x, y) => T.surfaceZ(x, y), {
        tone: wallTone, h: ls.range(1.7, 2.4), t: 1.15, step: 1.3, gap: 2,
        cull: (x, y) => seen(x, y, T.surfaceZ(x, y), 4),
      });
    }
  }

  // ------------------------------------------------------------- the steading
  // A bothy on a bench beside the track: the biome's second authored place, and
  // the thing that gives the pasture a reason. Sited by the same method as the
  // hero — vetoes, then a score — over the track's own points.
  const bs = rng.stream('bothy');
  const steadTone = C.mk(C.stone._h + bs.range(-9, 9), C.stone._s * bs.range(0.6, 1.5),
    Math.min(0.86, C.stone._L * bs.range(0.66, 0.94)));
  const roofTone = C.mk(C.slate._h + bs.range(-14, 14), Math.min(0.22, C.slate._s * bs.range(0.6, 1.6)),
    Math.min(0.62, C.slate._L * bs.range(0.72, 1.20)));
  const stead = pickSteading(T, F, allPts, seen, TL0, bs);
  if (stead) {
    const [sx, sy] = stead;
    const sz = T.surfaceZ(sx, sy);
    // SOMEBODY IS IN, OR THE BOTHY IS EMPTY, AND MOST OF THEM ARE EMPTY.
    //
    // The highland had no emitters at all: after dark the massif, the viaduct,
    // the walls and the trees all sat at the ambient floor and the frame had
    // nothing in it that was a LIGHT. A bothy with a fire in it is the honest
    // answer — it is what is actually up there — and it works because everything
    // around it is black. A lit hut on an unlit mountain reads at a hundred
    // pixels; twenty lamps along a track would read as a suburb.
    //
    // FROM `h3`, NOT FROM `bs`. Law 2 in `src/core/rng.js`: appending a draw to
    // an existing stream re-rolls every subsequent draw in it, and `bs` still
    // has the log stack, the fold and its wall to draw. Occupancy is a property
    // of the SITE and hashing its coordinates is both stable for it and free.
    //
    // 55 IN 100, AND THE OTHER 45 ARE THE POINT. An always-lit bothy is a lamp
    // the feed has, not a thing the feed sometimes does — and a dark bothy on a
    // dark hill is what makes the lit one mean somebody is up there.
    const occupied = C.cond && C.cond.night
      && (h3(Math.round(sx), Math.round(sy), 0x5c31) % 100) < 55;
    let bothyLamp = null;
    if (occupied) {
      // A HEARTH AND A HURRICANE LAMP, WHICH IS A WARMER LIGHT THAN A CITY'S.
      // Deliberately not `lampSet` from `building.js`: that set is a filament, a
      // fluorescent tube and a cold screen, and two of the three are things a
      // bothy does not contain. The shared quantity is `EMIT_L` — how bright an
      // emitter is minted against this file's own night ramp — and it is
      // imported rather than copied, so there is one measured number and one
      // home for it.
      const sk = h3(Math.round(C.light.HUE0 * 1e5), Math.round(sx), Math.round(sy));
      const j = (n, lo, hi) => lo + ((h3(sk, n, 31) & 1023) / 1024) * (hi - lo);
      bothyLamp = C.mk(j(1, 17, 33), j(2, 0.62, 0.86), EMIT_L * j(3, 0.92, 1.0), true);
    }
    cv.t = tag();
    P.bothy(cv, iso, C, bs, sx, sy, sz, bs.range(11, 15), bs.range(8, 11),
      { tone: steadTone, roof: roofTone, dark: C.slate, lamp: bothyLamp });
    cv.t = tag();
    P.logStack(cv, iso, C, bs, sx - bs.range(5, 8), sy + bs.range(1, 5), sz,
      { tone: C.mk(C.wood._h + bs.range(-8, 8), C.wood._s * bs.range(0.7, 1.2), C.wood._L) });
    // a fold — the one enclosure that is a closed loop of wall
    const fx = sx + bs.range(-26, -15), fy = sy + bs.range(9, 22);
    if (seen(fx, fy, T.surfaceZ(fx, fy), 4)) {
      const r = bs.range(7, 11);
      const ring = [];
      for (let i = 0; i <= 12; i++) {
        const a = i % 12;
        ring.push([fx + FOLD[a][0] * r * bs.range(0.86, 1.14),
          fy + FOLD[a][1] * r * bs.range(0.86, 1.14)]);
      }
      ring.push(ring[0]);
      cv.t = tag();
      P.wallRun(cv, iso, C, bs, ring, (x, y) => T.surfaceZ(x, y),
        { tone: wallTone, h: bs.range(2.0, 2.6), t: 1.2, step: 1.35, gap: 0,
          cull: (x, y) => seen(x, y, T.surfaceZ(x, y), 4) });
    }
  }

  // ----------------------------------------------------------- the cable line
  // Three pylons and the wire between them. It is the one stroke in this biome
  // that crosses open air, and it is drawn in the metal's own contour step
  // rather than in the shared ink: it is a wire, not a silhouette.
  const cs2 = rng.stream('cable');
  cableLine(cv, iso, C, cs2, T, F, stage, W, H, S, tag, seen, TL0);

  // ------------------------------------------------------------- the scatter
  scatterHighland(stage, {
    T, F, TN, TRK, tw, hero, seen, step, TL0, SN0, RIB0, FAN0, CRAG, regOf,
    A0, A1, B0, B1, cl: cl01,
  });

  stage.highland = { T, F, TN, LI, regOf, step, TL0, SN0, A0, A1, B0, B1, TRK, hero, wa, wb, tw };
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

// ---------------------------------------------------------------------------
// WHERE THE VIADUCT GOES.
//
// Frostwind's rule for its single oasis — "a world with one water body cannot
// leave its position to a jittered angle" — is the same case as this. So the
// site is SEARCHED: eleven candidate midpoints by eleven, each tried in both
// axes, hard vetoes first and a weighted score after, and no minimum-
// suitability cutoff anywhere. All the discrimination lives in the ranking.
//
// The candidates are laid out in SCREEN space and dropped onto the terrain by
// three rounds of fixed-point inversion, because "near the middle of the frame"
// is a screen property and on a hundred-unit massif the world point under a
// given pixel moves by two hundred units as the ground rises under it.

function findViaduct(T, iso, W, H, S, A0, A1, B0, B1, st) {
  const bays = st.int(4, 7);
  const len = Math.round(st.range(66, 104));
  const wide = st.range(8.0, 11.0);
  const inv = (sx, sy, z) => {
    const u = (sx - iso.ox) / (2 * S);
    const v = (sy - iso.oy) / S + 2 * z;
    return [(v + u) / 2, (v - u) / 2];
  };
  const site = (sx, sy) => {
    let p = inv(sx, sy, 0);
    for (let i = 0; i < 3; i++) p = inv(sx, sy, T.surfaceZ(p[0], p[1]));
    return p;
  };
  const tsx = W * 0.5, tsy = H * 0.44;
  let best = null, bestS = -1e9, fall = null, fallS = -1e9;
  for (let a = -5; a <= 5; a++) {
    for (let b = -5; b <= 5; b++) {
      const sx = tsx + a * (W * 0.075), sy = tsy + b * (H * 0.055);
      const m = site(sx, sy);
      for (let ax = 0; ax < 2; ax++) {
        const dx = ax === 0 ? 1 : 0, dy = ax === 0 ? 0 : 1;
        const x0 = m[0] - dx * len * 0.5, y0 = m[1] - dy * len * 0.5;
        const x1 = x0 + dx * len, y1 = y0 + dy * len;
        if (x0 < A0 + 20 || x1 > A1 - 20 || y0 < B0 + 20 || y1 > B1 - 20) continue;
        const z0 = T.surfaceZ(x0, y0), z1 = T.surfaceZ(x1, y1);
        if (T.isWet(x0, y0) || T.isWet(x1, y1)) continue;      // not off a tarn
        const drop = Math.abs(z0 - z1);
        if (drop > 15) continue;                    // abutments must be a pair
        const zDeck = Math.max(z0, z1) + 1.0;
        let sag = 1e9;
        for (let q = 2; q <= 8; q++) {
          const t = q / 10;
          sag = Math.min(sag, zDeck - T.surfaceZ(x0 + dx * len * t, y0 + dy * len * t));
        }
        const near = 1 - Math.sqrt(a * a * 1.0 + b * b * 1.0) / 8;
        const sc = cl01(sag / 34) * 0.44 + near * 0.44 + (1 - cl01(drop / 15)) * 0.12;
        if (sc > fallS) { fallS = sc; fall = { x0, y0, ax, zDeck, sag }; }
        if (sag < 13) continue;                     // it must cross a real gully
        if (sc > bestS) { bestS = sc; best = { x0, y0, ax, zDeck, sag }; }
      }
    }
  }
  const h = best || fall || { x0: A0 + 60, y0: B0 + 60, ax: 0, zDeck: 20, sag: 14 };
  h.len = len; h.wide = wide; h.bays = bays;
  h.rise = Math.min(h.sag * 0.42, len / bays * 0.46);
  h.x = h.x0 + (h.ax === 0 ? len * 0.5 : 0);
  h.y = h.y0 + (h.ax === 0 ? 0 : len * 0.5);
  return h;
}

// ---------------------------------------------------------------------------
// The track's distance field, splatted rather than solved.
//
// The ground shader needs "how far is this pixel from the track" three hundred
// thousand times a frame, and the polyline has two hundred segments. Walking
// the polyline once and stamping a bounded disc of minimum distances into a
// two-unit grid costs about a hundred and sixty thousand operations TOTAL, and
// bilinear sampling of the result is smooth enough that the track's edge is a
// hand-drawn curve rather than a staircase.

// A LEAST-COST WALK ON A CONE IS A CIRCLE, which is the one thing this track
// must not be. `walkTrack` takes the flattest heading at every step, and the
// authored massif is a cone, so a single 90-step walk came back after 455 units
// of walking fourteen units from where it started — a closed loop round the
// hill. Walking it in three legs and nudging the heading back toward the
// screen's long axis between them keeps what the walk is FOR — the ground
// decides the line, and a spur it cannot climb turns it — while making it a
// traverse that crosses the frame instead of a spiral that leaves it empty.
function walkLeg(T, st, x0, y0, dx, dy, climb) {
  const pts = [[x0, y0]];
  let cx = x0, cy = y0, cdx = dx, cdy = dy;
  for (let s = 0; s < 4; s++) {
    const w = walkTrack(T, st, {
      x0: cx, y0: cy, dx: cdx, dy: cdy, steps: 26, len: 5.4, fan: 0.72, climb,
    });
    if (w.pts.length < 2) break;
    for (let i = 1; i < w.pts.length; i++) pts.push(w.pts[i]);
    const a = w.pts[w.pts.length - 1], b = w.pts[Math.max(0, w.pts.length - 3)];
    let nx = (a[0] - b[0]) * 0.22 + dx * 0.78, ny = (a[1] - b[1]) * 0.22 + dy * 0.78;
    const n = Math.sqrt(nx * nx + ny * ny) || 1;
    cdx = nx / n; cdy = ny / n; cx = a[0]; cy = a[1];
  }
  return pts;
}

function splatTrack(polys, X0, Y0, X1, Y1) {
  const cell = 2.0, R = 15;
  const gx = Math.ceil((X1 - X0) / cell) + 2, gy = Math.ceil((Y1 - Y0) / cell) + 2;
  const a = new Float32Array(gx * gy).fill(R + 4);
  const rc = Math.ceil(R / cell);
  for (const pts of polys) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const L = Math.sqrt(dx * dx + dy * dy);
      const n = Math.max(1, Math.ceil(L / 1.6));
      for (let q = 0; q <= n; q++) {
        const x = ax + dx * (q / n), y = ay + dy * (q / n);
        const ci = Math.round((x - X0) / cell), cj = Math.round((y - Y0) / cell);
        for (let j = cj - rc; j <= cj + rc; j++) {
          if (j < 0 || j >= gy) continue;
          const py = Y0 + j * cell - y;
          for (let k = ci - rc; k <= ci + rc; k++) {
            if (k < 0 || k >= gx) continue;
            const px = X0 + k * cell - x;
            const d = Math.sqrt(px * px + py * py);
            const o = j * gx + k;
            if (d < a[o]) a[o] = d;
          }
        }
      }
    }
  }
  return {
    at(x, y) {
      const fx = (x - X0) / cell, fy = (y - Y0) / cell;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gx - 2) i = gx - 2;
      if (j < 0) j = 0; else if (j > gy - 2) j = gy - 2;
      const tx = fx - i, ty = fy - j;
      const o = j * gx + i;
      const lo = a[o] + (a[o + 1] - a[o]) * tx;
      const hi = a[o + gx] + (a[o + gx + 1] - a[o + gx]) * tx;
      return lo + (hi - lo) * ty;
    },
  };
}

// ---------------------------------------------------------------------------
// What stands beside the track.
//
// A route in this landscape is not a line, it is a line with things ALONG it,
// and they are the things that say what the line is for: a cairn where it
// crosses a shoulder, a marker post at a bend, a run of post-and-wire on the
// pasture side, a fold where it passes a bench. Each is admitted by the ground
// under it and discarded — not relocated — when the ground refuses.

function routeFurniture(cv, iso, C, st, T, F, pts, hero, tag, tagRaw, seen, mason) {
  const g = C.mk(C.stone._h + st.range(-10, 10), C.stone._s * st.range(0.6, 1.5),
    Math.min(0.86, C.stone._L * st.range(0.62, 0.90)));
  const w = C.mk(C.wood._h + st.range(-10, 10), C.wood._s * st.range(0.6, 1.2),
    C.wood._L * st.range(0.7, 1.0));
  let d = 0;
  for (let i = 4; i < pts.length - 4; i++) {
    const [x, y] = pts[i];
    const [px, py] = pts[i - 1];
    d += Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
    if (d < st.range(26, 62)) continue;
    d = 0;
    const z = T.surfaceZ(x, y);
    if (T.isWet(x, y)) continue;
    // A cairn wants a shoulder — convex ground with a view — and a marker post
    // is what you put where the cairn would not be seen.
    const conc = F.one(x, y, CH_CONC);
    const nx = -(pts[i + 1][1] - py), ny = pts[i + 1][0] - px;
    const nn = Math.sqrt(nx * nx + ny * ny) || 1;
    const ox = (nx / nn) * st.range(3.4, 5.2), oy = (ny / nn) * st.range(3.4, 5.2);
    if (!seen(x + ox, y + oy, z, 6)) continue;
    if (conc < -0.06 && st.bool(0.62)) {
      cv.t = tag();
      P.cairn(cv, iso, C, st, x + ox, y + oy, T.surfaceZ(x + ox, y + oy),
        { tone: g, R: st.range(1.5, 2.4) });
    } else {
      cv.t = tag();
      const zz = T.surfaceZ(x + ox, y + oy);
      box(cv, iso, x + ox, y + oy, zz - 0.4, 0.9, 0.9, st.range(3.6, 5.4),
        { top: w.t, left: w.l, right: w.k });
      cv.t = tag();
      box(cv, iso, x + ox - 0.3, y + oy - 0.3, zz - 0.4 + 4.2, 1.5, 1.5, 0.7,
        { top: mason.t, left: mason.l, right: mason.r });
    }
  }
  // POST AND WIRE ALONG ONE SIDE, in lengths, because a fence that runs the
  // whole track is a stroke that encloses nothing. Culled per post against the
  // frame, so the ones behind the camera cost a projection and no pixels.
  let i = st.int(6, 16);
  while (i < pts.length - 12) {
    const n = st.int(9, 22);
    const run = pts.slice(i, Math.min(pts.length - 2, i + n));
    if (run.length > 3) {
      cv.t = tag();
      const s = st.bool(0.5) ? 1 : -1;
      const off = run.map(([x, y], k) => {
        const q = run[Math.min(run.length - 1, k + 1)];
        const dx = q[0] - x, dy = q[1] - y;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        return [x - s * (dy / L) * 4.0, y + s * (dx / L) * 4.0];
      });
      P.postWire(cv, iso, C, st, off, (x, y) => T.surfaceZ(x, y),
        { tone: w, h: st.range(2.4, 3.2), pitch: st.range(4.0, 5.4),
          cull: (x, y) => seen(x, y, T.surfaceZ(x, y), 4) });
    }
    i += n + st.int(10, 30);
  }
}

const FOLD = [
  [1, 0], [0.87, 0.5], [0.5, 0.87], [0, 1], [-0.5, 0.87], [-0.87, 0.5],
  [-1, 0], [-0.87, -0.5], [-0.5, -0.87], [0, -1], [0.5, -0.87], [0.87, -0.5],
];

/** A visible point at about a given height, on ground gentle enough to build a
 *  wall on. Screen positions inverted onto the surface, best score wins. */
function contourSeek(T, F, iso, W, H, S, want, st) {
  let best = null, bestS = 1e9;
  for (let a = -6; a <= 6; a++) {
    for (let b = -4; b <= 5; b++) {
      const sx = W * 0.5 + a * (W * 0.09), sy = H * 0.5 + b * (H * 0.075);
      const u = (sx - iso.ox) / (2 * S);
      let p = [((sy - iso.oy) / S + u) / 2, ((sy - iso.oy) / S - u) / 2];
      for (let i = 0; i < 3; i++) {
        const v = (sy - iso.oy) / S + 2 * T.surfaceZ(p[0], p[1]);
        p = [(v + u) / 2, (v - u) / 2];
      }
      if (T.isWet(p[0], p[1])) continue;
      const sl = T.slopeAt(p[0], p[1]);
      if (sl > 1.1) continue;
      const d = Math.abs(T.heightAt(p[0], p[1]) - want) + sl * 6;
      if (d < bestS) { bestS = d; best = p; }
    }
  }
  return bestS < 26 ? best : null;
}

/** Walk along a contour: every step is perpendicular to the local gradient, so
 *  the line is the hillside's own and is off the 2:1 lattice at every angle. */
function contourRun(T, x0, y0, n, len, st) {
  const pts = [[x0, y0]];
  let x = x0, y = y0, px = 0, py = 0;
  const e = 4;
  for (let i = 0; i < n; i++) {
    const gx = (T.heightAt(x + e, y) - T.heightAt(x - e, y)) / (2 * e);
    const gy = (T.heightAt(x, y + e) - T.heightAt(x, y - e)) / (2 * e);
    const g = Math.sqrt(gx * gx + gy * gy) || 1;
    let dx = -gy / g, dy = gx / g;
    if (i === 0) { if (dx + dy < 0) { dx = -dx; dy = -dy; } }
    else if (px * dx + py * dy < 0) { dx = -dx; dy = -dy; }
    // A dyke is built, not surveyed: a small wander keeps it off a perfect
    // isopleth without letting it leave the contour it is following.
    const w = st.range(-0.10, 0.10);
    const nx = dx - dy * w, ny = dy + dx * w;
    const nn = Math.sqrt(nx * nx + ny * ny) || 1;
    px = nx / nn; py = ny / nn;
    x += px * len; y += py * len;
    pts.push([x, y]);
  }
  return pts;
}

/** Walk down the fall line. */
function fallRun(T, x0, y0, n, len) {
  const pts = [[x0, y0]];
  let x = x0, y = y0;
  const e = 4;
  for (let i = 0; i < n; i++) {
    const gx = (T.heightAt(x + e, y) - T.heightAt(x - e, y)) / (2 * e);
    const gy = (T.heightAt(x, y + e) - T.heightAt(x, y - e)) / (2 * e);
    const g = Math.sqrt(gx * gx + gy * gy);
    if (g < 1e-3) break;
    x -= (gx / g) * len; y -= (gy / g) * len;
    pts.push([x, y]);
  }
  return pts;
}

/** A bench beside the track, below the tree line, flat enough to build on. */
function pickSteading(T, F, pts, seen, TL0, st) {
  let best = null, bestS = -1e9;
  for (let i = 6; i < pts.length - 6; i += 2) {
    const [px, py] = pts[i];
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : -1;
      const q = pts[i + 2];
      const dx = q[0] - px, dy = q[1] - py;
      const L = Math.sqrt(dx * dx + dy * dy) || 1;
      const x = px - s * (dy / L) * 13, y = py + s * (dx / L) * 13;
      if (T.isWet(x, y)) continue;
      const h = T.heightAt(x, y);
      if (h > TL0 - 6) continue;                    // a bothy is below the moor
      const sl = T.slopeAt(x, y);
      if (sl > 0.22) continue;                      // and on a bench
      if (!seen(x, y, T.surfaceZ(x, y), 18)) continue;
      const sc = (1 - sl / 0.22) * 0.6 + st.range(0, 0.4);
      if (sc > bestS) { bestS = sc; best = [x, y]; }
    }
  }
  return best;
}

/** Three pylons on the skyline and the wire between them. */
// `A` IS THE STAGE, AND IT USED TO BE `iso` PASSED A SECOND TIME INTO AN UNUSED
// PARAMETER. The beacon needs the frame index and the recorder, both of which
// live on the stage; the dead slot was already there and is now the thing that
// carries them, so the arity is unchanged and there is no fifth-argument call to
// a four-parameter function anywhere in the chain. Counted at the call site.
function cableLine(cv, iso, C, st, T, F, A, W, H, S, tag, seen, TL0) {
  const m = C.mk(C.metal._h + st.range(-12, 12), Math.min(0.11, C.metal._s * st.range(0.6, 1.8)),
    Math.min(0.80, C.metal._L * st.range(0.62, 0.94)));
  const cc = C.mk(C.orange._h + st.range(-10, 10), C.orange._s * st.range(0.7, 1.0),
    C.orange._L * st.range(0.8, 1.1));
  // THE OBSTRUCTION LAMP, MINTED ONCE FOR THE LINE AND HUNG ON ONE PYLON.
  //
  // Three rungs of one red, not three colours: what pulses is how bright it is,
  // and a beacon that changed hue as it flashed would be a fairground. All three
  // are emissive — a lamp is a source, so the night pull and the night
  // compression do not apply to it, while the weather veil still does, because
  // fog scatters a lamp's own photons out of the line of sight exactly as it
  // scatters a wall's. See `src/gen/palette.js`.
  //
  // From `h3` off the scene's own light commitment, so two night highlands get
  // different beacons without a single new random draw and without this stream
  // moving under the pylons it is about to place.
  // AND IT IS *NOT* MINTED AT `EMIT_L`, WHICH IS THE INTERESTING PART.
  //
  // `EMIT_L` is 0.74 and it is correct where it came from: a lit WINDOW is a
  // near-neutral warm light and 0.74 clears the night ramp's lightness ceiling
  // (0.6036 by construction, 0.533-0.598 measured) while keeping half the
  // available chroma. It is a LUMA target, and a luma target is only
  // well-conditioned on a pigment that has little chroma to lose.
  //
  // A SIGNAL LAMP IS THE OTHER CASE AND IT INVERTS. HSL chroma is
  // `(1 - |2l - 1|) * s`, so on a saturated pigment every step up in lightness
  // past 0.5 buys luma by spending colour. Measured at hue 10, s 0.90:
  //
  //     l     0.50            0.60            0.74
  //     rgb   242, 51, 13     245, 92, 61     248, 149, 129
  //     luma  103.8           134.1           176.4
  //     chroma 230            184             119
  //
  // At `EMIT_L` a red beacon rasterises to rgb(248,149,129) — SALMON. That is
  // standing rule 13's lesson in a new costume: the emitter would have passed a
  // luma check while throwing the red away, exactly as a 0.99 lamp passed a hue
  // check while throwing the amber away.
  //
  // SO THE TARGET IS CHROMA, AND THE CEILING IT HAS TO CLEAR IS MEASURED. Over 6
  // seeds of highland/night/clear, no tone holding 40 px or more of the frame
  // exceeds chroma 53-65 or luma 84-125. A beacon at l = 0.50 sits at chroma 230
  // and luma 104: unmatchable in colour by anything the night ramp can produce,
  // which is the property that makes it read as a LIGHT rather than as a bright
  // surface. The three rungs step down in lightness from there, so the pulse is
  // a change in how bright it is and never in what colour it is.
  //
  // `EMIT_L` IS DELIBERATELY LEFT ALONE ON THE CITY'S WINDOWS. A lit window seen
  // from outside really is pale, the constant was measured for it, and moving it
  // would be a picture change to a measured object smuggled into a commit about
  // a mountain. Two emitters, two arguments, both stated. `EMIT_L` is imported
  // above and used by the bothy, which is a window and not a signal.
  let lamp = null;
  if (C.cond && C.cond.night) {
    const sk = h3(Math.round(C.light.LEFT * 1e5), Math.round(C.light.HUE0 * 1e5), 0x2c07);
    const j = (n, lo, hi) => lo + ((h3(sk, n, 41) & 1023) / 1024) * (hi - lo);
    const hue = j(1, 4, 19), sat = j(2, 0.82, 0.96);
    lamp = [
      C.mk(hue, sat, j(3, 0.48, 0.53), true).t,
      C.mk(hue, sat, 0.36, true).t,
      C.mk(hue, Math.min(1, sat * 1.04), 0.24, true).t,
    ];
  }
  const seed = contourSeek(T, F, iso, W, H, S, TL0 + st.range(4, 26), st);
  if (!seed) return;
  const a = st.range(0, 1) < 0.5 ? 1 : -1;
  let dx = st.range(0.3, 1.0) * a, dy = st.range(0.3, 1.0) * -a;
  const n = Math.sqrt(dx * dx + dy * dy); dx /= n; dy /= n;
  const gap = st.range(52, 78);
  let prev = null;
  for (let i = -1; i <= 1; i++) {
    const x = seed[0] + dx * gap * i, y = seed[1] + dy * gap * i;
    if (T.isWet(x, y)) { prev = null; continue; }
    const z = T.surfaceZ(x, y);
    const hh = st.range(13, 20);
    if (!seen(x, y, z, hh + 4)) { prev = null; continue; }
    cv.t = tag();
    // ONE LAMP ON THE LINE, ON THE MIDDLE PYLON. The middle one is the seed
    // point the other two are stepped off, so it is the one that is actually in
    // frame; lighting all three would be a runway, and lighting the tallest
    // would need a second pass to find out which that is.
    const top = P.pylon(cv, iso, C, st, x, y, z, hh,
      {
        tone: m, base: st.range(2.2, 3.0),
        lamp: i === 0 ? lamp : null,
        // Its own tag, and one the silhouette sweep skips. A lamp is a source,
        // not a solid, so it has no silhouette to close — and the head beam it
        // sits on projects to a four-pixel sliver, far too thin to contain a
        // 3x2 lamp, so sharing the pylon's tag had the sweep ink two thirds of
        // it against the terrain behind.
        lampTag: i === 0 && lamp ? A.tagRaw() : 0,
      }, A);
    if (prev) {
      cv.t = tag();
      P.cable(cv, iso, C, prev, top, st.range(10, 20), m.k);
      const mx = (prev[0] + top[0]) * 0.5, my = (prev[1] + top[1]) * 0.5;
      cv.t = tag();
      P.skip(cv, iso, C, mx, my, (prev[2] + top[2]) * 0.5 - 5.5, { tone: cc });
    }
    prev = top;
  }
}

// ---------------------------------------------------------------------------
// THE SCATTER, AND THE TREE LINE IS THE WHOLE OF IT.
//
// Every attribute of every scattered object is its own coordinate hash at its
// own salt — position jitter, acceptance, species, size tier, variant — never a
// sequential draw off a stream. Two things fall out that a stream cannot give:
// nothing depends on iteration order or on how many candidates were culled
// before it, and a sixth attribute can be added without re-rolling the other
// five on every object in the frame.
//
// Spacing is enforced by GEOMETRY, not by rejection. One candidate per lattice
// cell at `cell*g + hash*cell*jit + cell*(1-jit)/2`, so the axis separation
// between adjacent samples is at least `cell*(1-jit)` — a floor that is a
// guarantee rather than a hope. To make a stand sparser, enlarge the cell.
// Thinning by rejection keeps the survivors' spacing and punches holes in it.
//
// And the acceptance ramp is what makes the tree line a BAND. It rises from
// nothing sixty units below the local ceiling to certainty at thirty-eight, and
// falls from certainty eight units below the ceiling to nothing five above it.
// The ceiling itself sags in the gullies and rises on the sunny shoulders by
// twenty units, which on a third-slope is sixty units of horizontal wander. A
// tree therefore stands above where its neighbour down the slope stopped, and
// the edge of the wood is ragged in two directions at once.

function scatterHighland(stage, X) {
  const { C, cv, rng, iso, W, H, S, seedN, tag, tagRaw } = stage;
  const { T, F, TN, TRK, tw, hero, seen, TL0, RIB0, FAN0, A0, A1, B0, B1, regOf } = X;
  const ss = rng.stream('scatter');
  const S2 = seedN ^ 0x2f13;
  const NR = 16;
  const CONIF = [], TIPS = [], TRUNK = [], BOUL = [];
  for (let r = 0; r < NR; r++) {
    const g = C.mk(C.leaf._h + ss.range(-15, 15),
      Math.min(0.74, C.leaf._s * ss.range(0.60, 1.30)),
      Math.min(0.44, C.leaf._L * ss.range(0.52, 1.02)));
    CONIF.push(g);
    TIPS.push(C.mk(g._h + ss.range(-6, 10), g._s * ss.range(0.7, 1.05),
      Math.min(0.60, g._L * ss.range(1.10, 1.45))));
    TRUNK.push(C.mk(C.wood._h + ss.range(-8, 8), C.wood._s * ss.range(0.6, 1.1),
      C.wood._L * ss.range(0.55, 0.88)));
    BOUL.push(C.mk(C.stone._h + ss.range(-12, 12),
      Math.min(0.17, C.stone._s * ss.range(0.5, 1.6)),
      Math.min(0.84, C.stone._L * ss.range(0.60, 0.96))));
  }
  const FLEECE = C.mk(C.cream._h + ss.range(-8, 8), C.cream._s * ss.range(0.14, 0.48),
    Math.min(0.94, C.cream._L * ss.range(0.94, 1.04)));

  const uLo = (-80 - iso.ox) / (2 * S), uHi = (W + 80 - iso.ox) / (2 * S);
  const lattice = (cellS, jit, salt, fn) => {
    const i0 = Math.floor(A0 / cellS), i1 = Math.ceil(A1 / cellS);
    const j0 = Math.floor(B0 / cellS), j1 = Math.ceil(B1 / cellS);
    const off = cellS * (1 - jit) * 0.5;
    for (let gj = j0; gj <= j1; gj++) {
      for (let gi = i0; gi <= i1; gi++) {
        const u = (gi - gj) * cellS;
        if (u < uLo - 2 * cellS || u > uHi + 2 * cellS) continue;
        const hh = h3(gi, gj, salt);
        const x = gi * cellS + off + (((hh >>> 3) & 511) / 512) * cellS * jit;
        const y = gj * cellS + off + (((hh >>> 13) & 511) / 512) * cellS * jit;
        if (x < A0 || x > A1 || y < B0 || y > B1) continue;
        fn(x, y, hh);
      }
    }
  };
  // The formation yields nothing to the ecology: a viaduct's deck, piers and
  // approach are cleared ground.
  const hx0 = hero.ax === 0 ? hero.x0 - 12 : hero.x0 - hero.wide * 0.5 - 6;
  const hx1 = hero.ax === 0 ? hero.x0 + hero.len + 12 : hero.x0 + hero.wide * 1.5 + 6;
  const hy0 = hero.ax === 0 ? hero.y0 - hero.wide * 0.5 - 6 : hero.y0 - 12;
  const hy1 = hero.ax === 0 ? hero.y0 + hero.wide * 1.5 + 6 : hero.y0 + hero.len + 12;
  const onHero = (x, y) => x > hx0 && x < hx1 && y > hy0 && y < hy1;

  // ---- conifers
  lattice(6.7, 0.80, S2 + 11, (x, y, hh) => {
    const z = T.surfaceZ(x, y);
    if (T.isWet(x, y) || onHero(x, y)) return;
    if (!seen(x, y, z, 24)) return;
    if (TRK.at(x, y) < tw + 2.8) return;
    F.locate(x, y);
    const above = F.ch(CH_H) - F.ch(CH_TL);
    if (F.ch(CH_SLP) > 1.45) return;                 // not on a crag
    if (F.ch(CH_FAN) > FAN0) return;                 // not on live scree
    if (F.ch(CH_RIB) > RIB0) return;                 // not on an outcrop
    const p = Math.min(cl01((above + 38) / 18), cl01((4 - above) / 12));
    if (((hh >>> 23) & 255) / 256 > p) return;
    const reg = regOf(F.ch(CH_RA), F.ch(CH_RB));
    const tier = ((hh >>> 6) & 255) / 256;
    // Tall in the body of the wood, stunted at its upper margin.
    const hw = (9.5 + 13 * cl01((-above - 8) / 40)) * (0.78 + 0.48 * tier);
    cv.t = tagRaw();
    P.conifer(cv, iso, C, x, y, z, {
      hw, aspect: 0.30 + ((hh >>> 15) & 15) / 60,
      variant: (hh >>> 19) & 7,
      kind: ((hh >>> 2) & 3) < 2 ? 'spruce' : 'pine',
      tone: CONIF[reg], trunk: TRUNK[reg], tip: TIPS[reg].t,
    }, stage);
  });

  // ---- krummholz: the same tree, beaten flat, in the band and just above it
  lattice(6.4, 0.84, S2 + 23, (x, y, hh) => {
    const z = T.surfaceZ(x, y);
    if (T.isWet(x, y) || onHero(x, y)) return;
    if (!seen(x, y, z, 8)) return;
    if (TRK.at(x, y) < tw + 2.2) return;
    F.locate(x, y);
    const above = F.ch(CH_H) - F.ch(CH_TL);
    if (F.ch(CH_SLP) > 1.5) return;
    if (F.ch(CH_FAN) > FAN0 + 0.10) return;
    const p = Math.min(cl01((above + 12) / 10), cl01((17 - above) / 13)) * 0.85;
    if (((hh >>> 23) & 255) / 256 > p) return;
    const reg = regOf(F.ch(CH_RA), F.ch(CH_RB));
    cv.t = tagRaw();
    P.conifer(cv, iso, C, x, y, z, {
      hw: 1.7 + ((hh >>> 6) & 31) / 8, aspect: 0.76 + ((hh >>> 15) & 15) / 20,
      variant: (hh >>> 19) & 7, kind: 'krummholz',
      tone: CONIF[reg], trunk: TRUNK[reg], tip: CONIF[reg].l,
    }, stage);
  });

  // ---- boulders: where a cliff put them, and on the moraine
  lattice(10.5, 0.86, S2 + 37, (x, y, hh) => {
    const z = T.surfaceZ(x, y);
    if (T.isWet(x, y) || onHero(x, y)) return;
    if (!seen(x, y, z, 6)) return;
    if (TRK.at(x, y) < tw + 2.0) return;
    F.locate(x, y);
    const fan = F.ch(CH_FAN), rib = F.ch(CH_RIB), conc = F.ch(CH_CONC);
    const above = F.ch(CH_H) - F.ch(CH_TL);
    const p = Math.max(
      cl01((fan - FAN0 * 0.45) / 0.3) * 0.98,         // on and below the fans
      cl01((rib - RIB0 + 0.12) / 0.12) * 0.88,        // on the outcrops
      cl01(conc / 0.3) * cl01((above + 40) / 30) * 0.30,  // erratics on moraine
      cl01(above / 10) * 0.42);                       // blockfield on the tops
    if (((hh >>> 23) & 255) / 256 > p) return;
    const reg = regOf(F.ch(CH_RA), F.ch(CH_RB));
    cv.t = tagRaw();
    P.boulder(cv, iso, C, x, y, z, {
      R: 4 + ((hh >>> 6) & 31) * 0.32, variant: (hh >>> 12) & 7, tone: BOUL[reg],
    });
  });

  // ---- cairns on the tops: the one place-kind this ground can honestly make
  //
  // AND, ON ONE HIGHLAND IN TWENTY, ONE OF THOSE TOPS CARRIES SOMETHING ELSE.
  // The eligible sites are collected as the lattice walks them and the stone
  // goes on the one NEAREST THE MIDDLE OF THE FRAME rather than the first the
  // walk happens to reach — the lattice starts at a world corner, so "first"
  // means "off to one side", and an easter egg nobody can see is not one. The
  // cairn is still drawn at that site: a cairn at the foot of the stone is what
  // the place would actually have.
  const eye = (h3(seedN, 3301, 0x5e1) % 20) === 0;
  let eyeAt = null, eyeD = 1e18;
  lattice(46, 0.88, S2 + 51, (x, y, hh) => {
    const z = T.surfaceZ(x, y);
    if (T.isWet(x, y) || onHero(x, y)) return;
    if (!seen(x, y, z, 8)) return;
    F.locate(x, y);
    if (F.ch(CH_H) - F.ch(CH_TL) < 4) return;        // only on the open tops
    if (F.ch(CH_CONC) > -0.04) return;               // and only on a convexity
    if (F.ch(CH_SLP) > 0.7) return;
    if (((hh >>> 23) & 255) / 256 > 0.55) return;
    const reg = regOf(F.ch(CH_RA), F.ch(CH_RB));
    cv.t = tag();
    P.cairn(cv, iso, C, ss, x, y, z, { tone: BOUL[reg], R: 1.4 + ((hh >>> 6) & 7) * 0.16 });
    if (!eye) return;
    const p = iso.proj(x, y, z);
    const dx = p[0] - W * 0.5, dy = p[1] - H * 0.46;
    const dd = dx * dx + dy * dy;
    if (dd < eyeD) { eyeD = dd; eyeAt = [x, y, z, reg, hh]; }
  });
  if (eyeAt) {
    cv.t = tag();
    P.holedStone(cv, iso, C, eyeAt[0] + 3.4, eyeAt[1] + 2.2, T.surfaceZ(eyeAt[0] + 3.4, eyeAt[1] + 2.2),
      { tone: BOUL[eyeAt[3]], seed: (eyeAt[4] ^ S2) >>> 0 });
  }

  // ---- sheep on the enclosed pasture, in twos and threes
  lattice(15, 0.85, S2 + 67, (x, y, hh) => {
    const z = T.surfaceZ(x, y);
    if (T.isWet(x, y) || onHero(x, y)) return;
    if (!seen(x, y, z, 4)) return;
    F.locate(x, y);
    const above = F.ch(CH_H) - F.ch(CH_TL);
    if (above > -6) return;                          // below the head dyke
    if (F.ch(CH_SLP) > 0.55) return;
    if (F.ch(CH_FAN) > FAN0 * 0.6 || F.ch(CH_RIB) > RIB0 - 0.06) return;
    if (((hh >>> 23) & 255) / 256 > 0.42) return;
    const n = 1 + ((hh >>> 4) & 3);
    for (let k = 0; k < n; k++) {
      const q = h3(Math.round(x), Math.round(y) + k * 13, S2 + 71);
      const px = x + (((q >>> 3) & 63) - 31) * 0.16;
      const py = y + (((q >>> 11) & 63) - 31) * 0.16;
      if (T.isWet(px, py)) continue;
      cv.t = tagRaw();
      P.sheep(cv, iso, C, px, py, T.surfaceZ(px, py),
        { flip: ((q >>> 19) & 1) === 1, tone: FLEECE });
    }
  });
}

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
