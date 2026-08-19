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
import { leftFace, rightFace, topFace, blitFace, textPanel } from './faces.js';
import { h3 } from './palette.js';
import { textBitmap, scaleBitmap, coinWord, coinTag, signInk } from './font.js';
import * as R from './props/roof.js';
import * as S from './props/street.js';

const M = (f) => ({ top: f.t, left: f.l, right: f.r });
const MD = (f) => ({ top: f.l, left: f.r, right: f.d });

// ---------------------------------------------------------------------------
// LIT WINDOWS AT NIGHT
//
// A lit window that is simply a brighter rectangle reads as a sticker stuck on
// the building. In the reference a lit window is A VALUE STEP IN THE FACADE'S
// OWN FAMILY with the frame still reading — the same law the contour step `k`
// implements, run in the other direction. `k` is the rung BELOW the lit face
// for a shadow the light does not reach; a lit window is the rung ABOVE it for
// a room the outside light does not reach either, because it makes its own.
//
// So the primary tone of a lit window is `wall.t` where the wall itself is
// `wall.l`. That costs NO NEW COLOUR AT ALL — it is a rung of a ladder the
// building already minted — and it keeps the window inside the building's own
// material, which is the whole difference between a window and a sticker.
//
// Only the punctuation is a lamp, and the lamps are a SMALL SHARED SET drawn
// once for the scene, never one per window. Minting per window would put a
// colour on every opening in the frame and `palette.distinct` is a measured
// quantity, not spare capacity.
//
// NONE OF THIS RUNS UNLESS `cond.night`. At `golden` a low warm sun is already
// doing the work and at `day` nothing here is reachable, so the day path is
// byte-identical — which is a gate, not an aspiration.
//
// EVERY QUANTITY BELOW COMES FROM `h3`, NOT FROM AN Rng DRAW. Law 2 in
// src/core/rng.js: a new quantity opens its own stream or it re-rolls every
// subsequent draw in the stream it borrows. Occupancy is a property of the
// BUILDING and has to be stable for it, and `h3` is already how this file
// decides what is behind every other window, so there is nothing to open.
// ---------------------------------------------------------------------------

/** How bright an emitter is minted. Set by a measurement; see `lampSet`. */
const EMIT_L = 0.74;

/**
 * THE SCENE'S LAMPS. THREE TONES, shared by every window in the frame.
 *
 * A lamp is an EMITTER, not a pigment: it is not lit by the scene's ambient, it
 * IS a light in the scene. THESE ARE THE ONLY `emissive` MINTS IN THE FILE, and
 * `src/gen/palette.js` carries what the flag does and does not switch off.
 *
 * THE WARM LAMP USED TO COME OUT SALMON-RED AND THE COMMENT BELOW USED TO SAY
 * WHY IT HAD TO. `mk` routed every tone through the night ambient, which pulls
 * hue 16% of the shortest arc toward 218. Hue 38 is the ANTIPODE of 218, so the
 * whole warm band from 2 to 74 is on the far side of the sign flip: a filament
 * minted at 30 travelled -27.5 degrees and arrived at 2.5, a red. Measured off
 * the built palette over six seeds, the three lamps read hue 0.0-7.4 — the
 * scene's warmest light was the one colour it could not be.
 *
 * The old note here said the warm one "stays BELOW hue 38 deliberately", to keep
 * the set off that boundary rather than straddling it. That was a correct
 * reading of the mechanism and the wrong conclusion to draw from it: staying on
 * one side of a discontinuity does not stop you falling down it. Pre-compensating
 * across it would have been worse — an inverse function across a sign flip is a
 * bug generator. A lamp is simply not a surface, so the ambient does not apply.
 *
 * BUT THE OLD NOTE'S DISCIPLINE IS STILL RIGHT, AND IT NOW POINTS AT A DIFFERENT
 * NUMBER. With the night pull skipped, hue 38 is no longer a boundary a lamp can
 * reach — but the weather veil in `condLight` is deliberately NOT skipped, and it
 * pulls toward 214 under overcast, rain, snow and fog. Its antipode is 34, and
 * the old range 27-37.4 STRADDLED it. Measured on the built palette at
 * night+fog, that split the six seeds into hue 340.8-344.7 and hue 82.7 — two
 * lamps whose mints differ by a fifth of a degree rendering 262 degrees apart.
 * Exactly the coin-flip the old note refused to allow, relocated by this fix
 * from the night pull to the veil. So the top of the range is 33.0: still a
 * filament, and clear of 34 with a degree of margin. This is a BOUND, not a
 * pre-compensation — nothing here inverts the veil, it just declines to sit on
 * the one hue where the veil's own arithmetic is discontinuous.
 *
 * The other two lamps do not need it. 146-172 and 196-216 are nowhere near 34,
 * and straddling the veil's TARGET (214) is harmless — a target is an attractor
 * approached continuously from both sides. Only the antipode is a cliff.
 *
 * WHY THE LIGHTNESS IS NO LONGER 0.99. That was pre-compensation for the very
 * compression the flag now skips: `l = 0.07 + (l - 0.07) * 0.58` put a 0.99
 * pigment at 0.604, so the lamp was minted off the top of the range to land at
 * the top of the night ramp. With the compression gone, 0.99 is not "bright", it
 * is WHITE — HSL chroma is `(1 - |2l - 1|) * s`, which goes to zero as l goes to
 * 1, so a 0.99 emitter rasterises to rgb(254,253,251) and the amber this whole
 * function exists to produce is thrown away at the last step. A stale
 * pre-compensation left in place is how a fix reports success and changes
 * nothing. So the value is set against a MEASUREMENT instead: the night ambient
 * ramp's brightest palette entry over six seeds is hslL 0.533-0.598, capped by
 * construction at 0.6036. `EMIT_L` clears that ceiling by about a seventh while
 * keeping half the available chroma, so a lamp is both the brightest thing in
 * the frame and still a colour.
 *
 * Keyed off the scene's OWN light commitment, so two night cities have
 * different lamps without a single new random draw and without the set growing.
 *
 * EXPORTED so the lamps can be READ BACK OUT OF THE BUILT PALETTE rather than
 * asserted, on the same grounds as `nightStructure` below: `.t` is an index into
 * `pal`, so a script can print the literal RGB a lit window is painted with. A
 * hue computed from the pre-`mk` input is not evidence about a bug that lives
 * inside `mk`. It changes no pixel by being reachable.
 */
export function lampSet(C) {
  const sk = h3(Math.round(C.light.HUE0 * 1e5), Math.round(C.light.LEFT * 1e5),
    Math.round(C.paintRate * 1e5));
  const j = (n, lo, hi) => lo + ((h3(sk, n, 17) & 1023) / 1024) * (hi - lo);
  return [
    C.mk(j(1, 27, 33.0), j(2, 0.56, 0.80), EMIT_L, true),  // filament, a warm room
    C.mk(j(3, 146, 172), j(4, 0.26, 0.46), EMIT_L, true),  // a fluorescent tube
    C.mk(j(5, 196, 216), j(6, 0.03, 0.11), EMIT_L, true),  // a cold screen or landing
  ];
}

/**
 * WHO IS IN, PER BUILDING. Structure, not tone.
 *
 * Independent per-window coin flips read as noise — the same failure the
 * animation work kept hitting, and the reason a chequerboard of lights looks
 * like a spreadsheet rather than a building. Occupancy here has three
 * overlapping structures and they are all spatial:
 *
 *   a FLOOR is occupied or it is not      — horizontal bands, and they wrap the
 *                                           corner because a floor is a floor
 *   a RUN of adjacent bays on that floor  — one office suite, one flat
 *   a RISER is lit top to bottom          — the stairwell, on some buildings
 *
 * then two small corrections that stop the blocks reading as blocks: somebody
 * on a lit floor is out, and somebody on a dark floor is up late.
 *
 * EXPORTED so the occupancy rate can be MEASURED rather than asserted: a script
 * can enumerate the real (bay, floor) grid of every facade a render draws and
 * count. It is a pure function of `o` and changes no pixel by being reachable.
 */
export function nightStructure(o) {
  const s = o.seed;
  // Not every building is occupied. A whole dark block is what makes the lit
  // ones read as lit.
  o.anyLit = (h3(s, 4401, 7) % 100) < 84;
  o.floorPct = 42 + (h3(s, 4402, 7) % 30);
  o.runMax = 2 + (h3(s, 4403, 7) % 3);
  o.darkPct = 14 + (h3(s, 4404, 7) % 14);
  o.strayPct = 3 + (h3(s, 4405, 7) % 5);
  o.riser = (h3(s, 4406, 7) % 100) < 38 ? (h3(s, 4407, 7) & 0xffff) : -1;
  // How this building's lit windows divide between its own material and the
  // scene's lamps. Most of them are the material.
  o.tW = 5 + (h3(s, 4408, 7) % 3);
  o.shopPct = 26 + (h3(s, 4409, 7) % 22);
  return o;
}

/** 1 if the window in this bay on this floor is lit. `nb` is bays per face. */
export function litAt(o, nb, bay, fl) {
  if (!o.anyLit) return 0;
  const b = ((bay % nb) + nb) % nb;
  // The stairwell. Lit nearly the whole height, which is what makes it read as
  // a column rather than as a coincidence.
  if (nb >= 4 && o.riser >= 0 && b === o.riser % nb && (h3(o.seed, 8801, fl) & 7) < 6) return 1;
  let on = 0;
  if ((h3(o.seed, 5501, fl) % 100) < o.floorPct) {
    // A WIDE FACE GETS MORE THAN ONE RUN. One suite on a forty-metre floor
    // plate is a stripe with a building drawn round it; two or three separate
    // runs with dark bays between them is a floor with tenants on it.
    const runs = nb >= 13 ? 3 : nb >= 7 ? 2 : 1;
    // A RUN NEVER COVERS A WHOLE FACE. On a three-bay building a run of four
    // wraps the face and the floor becomes a solid lit band, which is the
    // stripe this section exists to avoid; the run has to leave a dark bay.
    const cap = Math.max(1, Math.min(o.runMax + (nb >> 2), nb - 1));
    for (let i = 0; i < runs && !on; i++) {
      const r = h3(o.seed + o.faceK * 977, 6607 + i * 131, fl);
      const len = 1 + (r >>> 9) % cap;
      if ((((b - (r % nb)) % nb) + nb) % nb < len) on = 1;
    }
  }
  const q = h3(o.seed + o.faceK * 977, bay + 64, fl + 4096) % 100;
  if (on) { if (q < o.darkPct) on = 0; }
  else if (q >= 100 - o.strayPct) on = 1;
  return on;
}

/**
 * The family behind a lit window, or null.
 *
 * The tone is chosen per FLOOR and not per window: one office floor is lit by
 * one kind of lamp, and a facade whose every lit window is a different colour
 * is the spreadsheet again. One window in six dissents, so the bands are not
 * perfect either.
 */
function litFam(o, nb, bay, fl) {
  if (!litAt(o, nb, bay, fl)) return null;
  const base = h3(o.seed + o.faceK * 977, 7717, fl) & 15;
  const q = (h3(o.seed, bay + 512, fl + 8192) % 6) === 0 ? (base + 7) & 15 : base;
  return q < o.tW ? o.roomW : q < o.tW + 3 ? o.roomT
    : q < o.tW + 7 ? o.lampA : q < o.tW + 9 ? o.lampB : o.lampC;
}

/** The family behind an OPEN shop, or null. Ground floor, per unit. */
function shopFam(o, bi) {
  if (!o.anyLit) return null;
  const hh = h3(o.seed + 33, bi, 313);
  if ((hh % 100) >= o.shopPct) return null;
  const q = (hh >>> 9) & 15;
  return q < 5 ? o.roomW : q < 8 ? o.roomT : q < 13 ? o.lampA : o.lampB;
}

/** Cast panels a couple of bays by a few floors, in the wall's own two steps. */
function panelTone(o, bay, fl) {
  if (o.panelSpan <= 0) return o.wall;
  const k = h3(o.seed + 7, (bay / o.panelSpan) | 0, (fl / o.panelRun) | 0) & 15;
  return k < o.panelRate ? o.wallD : o.wall;
}

function facade(F, o) {
  const { au, cu, av, bv, cv } = F;
  const W = o.W, H = o.H, K = o.black;
  // q is "one screen pixel, in face units". Every width below that describes a
  // LINE carries it; every width that describes a piece of the building — a
  // plinth, a pier, a stall riser, a string course, the wall between two
  // windows — does not, and grows with the world. Getting that split wrong in
  // either direction is the whole failure mode: doubled line weights on one
  // side, hairline architecture on the other.
  const q = F.q === undefined ? 1 : F.q;
  // Bays across THIS face. Computed once per face, not per pixel: the left and
  // right facades of one mass share every option except their width, so the
  // occupancy runs below have to be indexed against each face's own bay count.
  const nb = Math.max(1, Math.floor(o.W / o.bayU));
  return (sx, sy) => {
    const u = au * sx + cu;
    const v = av * sx + bv * sy + cv;
    if (v < 0) return o.wall;
    if (v < 1.5) return o.plinth;
    if (v > H - 0.9) return o.cornice;

    // ---------------- ground floor: shopfronts, the busiest band on a street
    //
    // Rebuilt in round 3 as CLOSED OPENINGS. It used to be a comb: a black
    // mullion every 2.4 to 4 world units — five to eight screen pixels — down
    // the whole shop window, plus a black jamb each side of every unit and a
    // black band across the fascia. All stroke, nothing closed, and between
    // them they were one of the largest consumers of an ink budget that has
    // since gone from under to over. A shop window is now one opening with a
    // frame round it and at most one transom, so the same ink encloses a cell.
    if (v < o.groundH) {
      const bi = Math.floor(u / o.shopU);
      const gu = u - bi * o.shopU;
      const hh = h3(o.seed, bi, 101);
      // AN OPEN SHOP IS THE BRIGHTEST THING AT STREET LEVEL, and a street of
      // shut ones is what makes it read. Null unless `cond.night`.
      const sf = o.night ? shopFam(o, bi) : null;
      // The fascia head is the shadow the fascia throws on the wall above it,
      // so it is the WALL's own dark. It used to be a full-width run of shared
      // ink across every shopfront on every building — one of the longest
      // single strokes in the frame and one that enclosed nothing on its own.
      if (v > o.groundH - 0.55 * q) return o.wallK;
      if (v > o.groundH - 1.9) return o.fascia[hh % o.fascia.length];
      if (gu < 0.9 || gu > o.shopU - 0.9) return o.quoin;  // pier between units
      if (v < 1.0) return o.shopBase;                      // stall riser
      const door = (hh & 7) < 3 && gu > o.shopU * 0.34 && gu < o.shopU * 0.62;
      const top = o.groundH - 2.3;
      if (!door && v > top) return o.quoin;
      // 1px frame on all four sides of the opening
      if (gu < 0.9 + 0.55 * q || gu > o.shopU - 0.9 - 0.55 * q) return K;
      if (v < 1.0 + 0.55 * q && !door) return K;
      if (!door && v > top - 0.55 * q) return K;
      if (door && v > o.groundH - 1.9 - 0.55 * q) return K;
      if (door) return v < 3.2 ? o.door : (sf ? sf.t : o.shopGlass);
      if (o.shopMull > 0 && Math.abs(gu - o.shopU * 0.5) < 0.28 * q) return K;
      if (sf) return sf.t;
      return (hh & 3) === 1 ? o.shopGlassB : o.shopGlass;
    }

    // ---------------- upper floors
    const vv = v - o.groundH;
    const fl = Math.floor(vv / o.floorH);
    const fv = vv - fl * o.floorH;
    const bay = Math.floor(u / o.bayU);
    const fu = u - bay * o.bayU;

    // A BLANK FLANK IS STILL PANELLED.
    //
    // The largest connected same-colour region in a 320px crop was 11.45% of it
    // — one unbroken tower flank — against the reference's largest at 2.07%,
    // and 36.3% of the canvas sat inside ink-free fields over 10,000px against
    // its 20.8%. The wall is now cast in PANELS a couple of bays by a few
    // floors, in the wall's own two steps, plus its banded courses. That breaks
    // the region without spending ink, which matters because ink is at budget
    // and because `slope.corrDx0Share` has no headroom left for more verticals.
    if (o.blank) {
      // An expansion joint is a groove in the wall, not an outline. Drawn in
      // shared ink it was a full-height black vertical on every second or third
      // bay of every blank flank — the single largest producer of unclosed
      // vertical ink in the frame, and `slope.corrDx0Share` has been reading it
      // as "too much of the outline mass is vertical" for two rounds.
      if (o.jointEvery > 0 && (bay % o.jointEvery) === 0 && fu < 0.5 * q) return o.wallK;
      if (o.bandEvery > 0 && (fl % o.bandEvery) === 0 && fv < 0.9) return o.band;
      return panelTone(o, bay, fl);
    }

    const rowOn = (fl % o.rowPeriod) < o.rowCount;
    const colOn = (bay % o.colPeriod) < o.colCount;
    if (!rowOn || !colOn) {
      if (o.bandEvery > 0 && (fl % o.bandEvery) === 0 && fv < 0.9) return o.band;
      return panelTone(o, bay, fl);
    }
    const wy0 = o.spandrel, wy1 = o.floorH - o.head;
    const wx0 = o.mull, wx1 = o.bayU - o.mull;
    if (fv < wy0 || fv > wy1 || fu < wx0 || fu > wx1) {
      if (o.bandEvery > 0 && (fl % o.bandEvery) === 0 && fv < 0.9) return o.band;
      return panelTone(o, bay, fl);
    }
    // A CLOSED FRAME, ALL FOUR SIDES.
    //
    // Until round 3 this drew the two JAMBS and, separately, a black line down
    // the whole height of every bay — so a facade was a comb of long vertical
    // strokes and not one window was enclosed. Two measurements, one edit:
    // `slope.corrDx0Share` was +1.65 bandwidths of "everything vertical, no
    // diagonals" (the full-height bay line, now gone), and the ink-closure
    // ratio counts a window that is ringed as its own cell (the head and sill,
    // now present). Ink spent is about the same; ink that CLOSES is all of it.
    if (fu < wx0 + 0.55 * q || fu > wx1 - 0.55 * q) return K;
    if (fv < wy0 + 0.5 * q || fv > wy1 - 0.5 * q) return K;
    // Glazing bars divide ONE opening. The frame around it is the object
    // boundary and stays ink; the bars inside it are the glass's own dark, for
    // the same reason the solar grille is. This is where the reference's
    // "rings itself at 0.49 of interior luma" actually applies — interior form.
    // THE LIT PANE, AND ITS BARS IN ITS OWN TONE.
    //
    // The glazing bars are interior form, so they take the LIT family's own
    // contour step rather than the glass's — the same rule that puts a panel
    // line in the object's material instead of in the shared ink. Drawing them
    // in black would be adding ink to a facade that is already the largest
    // interior consumer of it, and `outline.darkShare` is a two-sided open
    // regression. The frame around the opening is unchanged: it is the object
    // boundary and it was already ink, so a lit pane is still a framed hole in
    // a wall rather than a bright rectangle painted on one.
    const lf = o.night ? litFam(o, nb, bay, fl) : null;
    if (o.centreMull && wx1 - wx0 > 3.6 && Math.abs(fu - o.bayU * 0.5) < 0.28 * q) return lf ? lf.k : o.glassK;
    if (o.transom && wy1 - wy0 > 3.2 && Math.abs(fv - (wy0 + wy1) * 0.5) < 0.26 * q) return lf ? lf.k : o.glassK;
    if (lf) return lf.t;
    const hh = h3(o.seed, bay, fl) & 15;
    if (hh < o.gA) return o.g0;
    if (hh < o.gB) return o.g1;
    if (hh < o.gB + 2) return o.lit;
    if (hh < o.gB + 4) return o.blind;
    return o.open;
  };
}

function facadeOpts(C, st, wall, W, H, seed, style, blank) {
  const glass = st.pick([C.glass, C.aqua, C.steel, C.slate, C.teal]);
  const trim = st.bool(0.7) ? C.white : st.pick([C.cream, C.concrete, C.pave]);
  const acc = st.pick(C.accents);
  const o = {
    W, H, seed, black: C.black, blank, faceK: 0,
    wall: wall.l, wallD: wall.r, quoin: wall.r,
    wallK: wall.k, glassK: glass.k,
    panelSpan: st.weighted([[1, 4], [2, 6], [3, 3]]),
    panelRun: st.int(2, 5), panelRate: st.int(3, 7),
    plinth: wall.r, cornice: trim.l,
    band: acc.l, bandEvery: st.weighted([[0, 6], [3, 2], [4, 2], [5, 1]]),
    jointEvery: st.weighted([[0, 3], [2, 2], [3, 2]]),
    groundH: st.range(5.4, 7.8),
    // Floors and bays are both a good third larger than they were. At the old
    // 4.8-unit floor a window opening was 4x5 screen pixels with a 1px frame
    // round it, i.e. more frame than glass — which at 5x reads as a chequer of
    // black confetti rather than as windows, and buys `flat.frac5x5` nothing.
    floorH: st.range(3.9, 6.0),
    bayU: st.range(3.3, 5.3),
    mull: 0.66, spandrel: 1.35, head: 0.68,
    centreMull: st.bool(0.42), transom: st.bool(0.3),
    rowPeriod: 1, rowCount: 1, colPeriod: 1, colCount: 1,
    // How many of the sixteen window states are the building's ONE glass tone.
    // A facade whose windows are five different colours is a spreadsheet; the
    // reference's are overwhelmingly one tone with a few lit and a few blind.
    gA: st.int(7, 11), gB: st.int(12, 14),
    g0: glass.r, g1: glass.l, lit: C.amber.t, blind: trim.t, open: glass.d,
    shopU: st.range(6.5, 11.5),
    shopGlass: glass.r, shopGlassB: glass.l, shopMull: st.bool(0.45) ? 1 : 0,
    shopBase: wall.r,
    door: st.pick([C.red, C.blue, C.wood, C.green, C.slate]).r,
    fascia: [acc.l, acc.t, acc.r, trim.t],
    panel: st.pick(C.accents).l,
    panelU0: W * st.range(0.14, 0.3), panelU1: W * st.range(0.6, 0.88),
    panelV0: 0, panelV1: 0,
  };
  // structural gaps: whole floors or whole bays with no openings at all
  o.panelV0 = o.groundH + st.range(1.3, 4.5);
  o.panelV1 = o.panelV0 + st.range(4.5, 14);
  // MORE OF A FACADE IS WALL THAN WAS, and this is one edit for three
  // measurements. At the new scale a window frame is still one pixel while the
  // building is four times the area, so the frame's share of the facade fell —
  // but a fully glazed 160px tower still spends about a tenth of its own area
  // on ink, and it is the largest remaining consumer in the worst crops (45%
  // of the ink in our densest 320px window is INTERIOR, i.e. window frames).
  // Blank courses and blank bays take that back, raise the flat-area share at
  // the 13x13 and 17x17 windows that actually discriminate, and are what the
  // reference's facades look like: mostly wall, with the openings grouped.
  const rp = st.weighted([[1, 4], [2, 4], [3, 3]]);
  o.rowPeriod = rp; o.rowCount = rp === 1 ? 1 : st.int(1, rp - 1);
  const cp = st.weighted([[1, 5], [2, 3], [3, 2], [4, 1]]);
  o.colPeriod = cp; o.colCount = cp === 1 ? 1 : Math.max(1, cp - 1);

  // ---------------- night
  //
  // Only the tones a window can hold and the structure of who is in. Nothing
  // here is reachable by day, so the day path is untouched.
  o.night = !!(C.cond && C.cond.night);
  if (o.night) {
    nightStructure(o);
    const lamps = lampSet(C);
    // The room's own wall, one rung ABOVE the facade's lit face. This is the
    // colour most lit windows are, and it costs nothing: the building already
    // minted this ladder.
    // `roomW` is the wall family itself — a lit window uses its `.t`, one rung
    // above the `.l` the facade is drawn in, and its `.k` for the glazing bars.
    // `roomT` is the trim family, the pale ceiling or blind of a lit room.
    o.roomW = wall; o.roomT = trim;
    o.lampA = lamps[0]; o.lampB = lamps[1]; o.lampC = lamps[2];
    // The two DAY window states that are bright by construction are folded back
    // into the dark ones after dark. `lit` was the amber family's top and
    // `blind` was the trim's, and both landed on two of sixteen windows by an
    // independent per-window hash — which after dark is exactly the unstructured
    // scatter this whole section exists to avoid. A dark window is still a
    // window though, so neither becomes black: one is another glass rung and the
    // other is the pale trim in shadow, i.e. a drawn blind with nobody behind it.
    o.lit = glass.l; o.blind = trim.r;
  }

  if (style === 1) {           // ribbon glazing, wide flat spandrels
    o.mull = 0.38; o.spandrel = 1.85; o.bayU = st.range(2.9, 4.0);
    o.rowPeriod = 1; o.rowCount = 1; o.colPeriod = 1; o.colCount = 1;
    o.g0 = glass.r; o.g1 = glass.r; o.centreMull = false;
  } else if (style === 2) {    // heavy grid, deep piers
    o.mull = 1.25; o.bayU = st.range(5.0, 7.6); o.spandrel = 1.85;
    o.floorH = st.range(4.6, 6.6);
  } else if (style === 3) {    // masonry, small punched windows, big wall
    o.bayU = st.range(4.7, 7.2); o.mull = 1.75; o.floorH = st.range(4.1, 5.9);
    o.spandrel = 2.0; o.g1 = glass.r; o.centreMull = false;
  }
  return o;
}

function mass(cv, iso, C, st, x, y, z, w, d, h, wall, style, seed) {
  const FL = leftFace(iso, y + d, x, z);
  const FR = rightFace(iso, x + w, y, z);
  const blankL = ((h3(seed, 1, 3) & 15) < 5);
  const blankR = ((h3(seed, 2, 3) & 15) < 5);
  const oL = facadeOpts(C, st, wall, w, h, seed, style, blankL);
  // The two facades of one mass share every option but their width. `faceK`
  // separates the per-BAY hashes so the same run of lit windows does not appear
  // twice at the corner; the per-FLOOR hashes deliberately do NOT carry it,
  // because a lit floor wraps the corner — a floor is a floor.
  const oR = Object.assign({}, oL, { W: d, blank: blankR, faceK: 1 });
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
  // The height mix is the scene's, not the generator's: a low-rise seaside
  // strip and a tower district are different pictures, and a fixed 3/5/4/2
  // weighting made every seed the same skyline.
  const tb = opt.D && opt.D.tallBias !== undefined ? opt.D.tallBias : 0.5;
  const tall = Math.min(opt.maxH, st.weighted([
    [st.range(7.5, 13), 5 - 4 * tb], [st.range(13, 22), 3 + 2 * tb],
    [st.range(22, 37), 1.2 + 5 * tb], [st.range(37, 62), 0.3 + 4.5 * tb],
  ]));

  const masses = [];
  let cx = x, cy = y, cw = w, cd = d, cz = z, left = tall, n = 0;
  while (left > 3.4 && n < 4) {
    const share = n === 0 ? st.range(0.5, 0.85) : st.range(0.55, 0.95);
    const hh = Math.max(3.4, left * share);
    masses.push([cx, cy, cz, cw, cd, hh]);
    cz += hh; left -= hh;
    if (left <= 3.4) break;
    const ix = st.range(1.0, Math.max(1.1, cw * 0.24));
    const iy = st.range(1.0, Math.max(1.1, cd * 0.24));
    const nw = cw - ix, nd = cd - iy;
    if (nw < 8 || nd < 8) break;
    cx += st.bool(0.5) ? ix : 0; cy += st.bool(0.5) ? iy : 0;
    cw = nw; cd = nd; n++;
  }

  // EACH MASS TAKES ITS OWN TONE OFF THE BUILDING'S. A podium in stone under a
  // shaft in render is what a building looks like, and it is also where a crop
  // gets its colour count: `palette.distinct` per 320px crop wants 337 and the
  // scale change cut ours to under 200 by quartering the object count. The way
  // back is not more objects — it is more COMMITTED SURFACES per object, which
  // is the reference's arrangement (many colours, each confined to one thing).
  for (let mi = 0; mi < masses.length; mi++) {
    const [mx, my, mz, mw, md, mh] = masses[mi];
    const wt = mi === 0 ? wall
      : C.mk(wall._h + st.range(-7, 7), Math.min(1, wall._s * st.range(0.8, 1.25)),
        Math.min(0.97, wall._L * st.range(0.86, 1.16)));
    mass(cv, iso, C, st, mx, my, mz, mw, md, mh, wt, style, seed + Math.round(mz));
  }

  const pitched = tall < 26 && Math.min(w, d) < 26
    && st.bool(opt.D && opt.D.pitchRate !== undefined ? opt.D.pitchRate : 0.5);
  for (let i = 0; i < masses.length; i++) {
    const [mx, my, mz, mw, md, mh] = masses[i];
    const rz = mz + mh;
    if (pitched && i === masses.length - 1) {
      const tile = st.pick([C.terra, C.brick, C.slate, C.steel, C.red]);
      const ridgeX = mw >= md;
      // PITCH IS CHOSEN OFF THE DEAD ZONE, DELIBERATELY. Sweeping k = hr /
      // (span/2) against the slope statistic: k ~ 0.5 votes 0.353 at 1:1,
      // k ~ 1.5 votes 0.403, and k ~ 0.9-1.0 votes 0.036 — at k ~ 1 a gable's
      // two slopes fall BETWEEN the lattices and register as nothing. A roof is
      // the honest place to break a dimetric lattice and it is most of what
      // this generator has to break it with, so it may not sit at the one pitch
      // where the break is invisible. Shallow or steep, never in between.
      const kk = st.bool(0.55) ? st.range(0.23, 0.29) : st.range(0.68, 0.80);
      const hr = Math.min(11, (ridgeX ? md : mw) * kk);
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
        const ch = st.range(1.1, 2.3);
        const cm = st.pick([C.brick, C.terra, C.concrete, C.slate]);
        box(cv, iso, cxp, cyp, rz + hr - 0.4, 1.25, 1.25, ch, { top: cm.d, left: cm.l, right: cm.r });
      }
      continue;
    }
    R.roofDeck(cv, iso, C, st, mx, my, rz, mw, md, wall);
    const pc = st.bool(0.4) ? wall : st.bool(0.55) ? st.pick(C.accents) : C.concrete;
    // A parapet is 1.2 units thick, not 0.7. At 0.7 its top face is a strip
    // 1.4px across holding the middle of the shading ladder, flanked by the
    // roof above and the parapet's own shadow face below — which is exactly
    // what `edge.fracAA` calls antialiasing, and the AA map showed it lit along
    // every parapet in the frame. A wall with thickness reads better anyway.
    const ph = st.range(0.7, 1.5);
    const pt = st.range(0.8, 1.2);
    box(cv, iso, mx, my, rz, mw, pt, ph, MD(pc));
    box(cv, iso, mx, my, rz, pt, md, ph, MD(pc));
    box(cv, iso, mx, my + md - pt, rz, mw, pt, ph, MD(pc));
    box(cv, iso, mx + mw - pt, my, rz, pt, md, ph, MD(pc));

    if (st.bool(0.45)) {
      R.railing(cv, iso, C, st, mx + 0.6, my + md - 1.1, rz + ph, mw - 1.2, 0, st.range(1.4, 2.2));
      R.railing(cv, iso, C, st, mx + mw - 1.1, my + 0.6, rz + ph, md - 1.2, 1, st.range(1.4, 2.2));
    }
    const area = mw * md;
    const dens = opt.D && opt.D.density ? opt.D.density : 1;
    let budget = Math.max(2, Math.min(30, Math.round(area * dens / 19)));
    if (i < masses.length - 1) budget = Math.max(1, budget >> 1);
    for (let k = 0; k < budget; k++) {
      const px = mx + st.range(1.2, Math.max(1.4, mw - 4));
      const py = my + st.range(1.2, Math.max(1.4, md - 4));
      cv.t = opt.tag();
      const kind = st.weighted([
        ['ac', 6], ['vent', 4], ['tank', 3], ['hut', 3], ['dish', 2],
        ['solar', 3], ['sky', 2], ['aerial', 2], ['crate', 2],
      ]);
      if (kind === 'ac') R.acUnit(cv, iso, C, st, px, py, rz);
      else if (kind === 'vent') R.vent(cv, iso, C, st, px, py, rz);
      else if (kind === 'tank' && mw > 10 && md > 10) R.waterTank(cv, iso, C, st, px, py, rz);
      else if (kind === 'hut' && mw > 12 && md > 12) R.stairHut(cv, iso, C, st, px, py, rz, wall);
      else if (kind === 'dish') R.dish(cv, iso, C, st, px, py, rz);
      else if (kind === 'solar' && mw > 10) R.solar(cv, iso, C, st, px, py, rz, st.range(4, 8), st.range(3.5, 6));
      else if (kind === 'sky' && mw > 9) R.skylight(cv, iso, C, st, px, py, rz, st.range(2.8, 5.4), st.range(2.6, 4.6));
      else if (kind === 'aerial') R.aerial(cv, iso, C, st, px, py, rz);
      else R.crateStack(cv, iso, C, st, px, py, rz);
    }
  }

  // ---------------- signage, all of it invented
  const D = opt.D || {};
  const top = masses[masses.length - 1];
  const sg = opt.sign;
  if (sg && !pitched && st.bool(0.4 * (D.roofSign === undefined ? 0.26 : D.roofSign)) && top[3] > 10) {
    cv.t = opt.tag();
    const ax = st.bool(0.5) ? 0 : 1;
    R.roofSign(cv, iso, C, st, top[0] + 1.5, top[1] + 1.5, top[2] + top[5] + 1.4,
      coinWord(sg), ax);
  }
  if (sg && st.bool(0.30 * (D.heroSign === undefined ? 1 : D.heroSign))) {
    wallSign(cv, iso, C, st, x, y, z, w, d, tall, coinWord(sg), opt);
  }
  return tall;
}

/**
 * A SHOPFRONT OR FASCIA SIGN AT READING SIZE.
 *
 * What was here before blitted a 5x7 word straight onto the wall in black at
 * glyph scale 1 — about four pixels tall on screen, invisible at 1:1 and
 * indistinguishable from grime at 5x. The reference's equivalent is a panel:
 * one saturated ground, a keyline, and letters big enough to read across the
 * street. That panel is also, incidentally, the largest committed single-colour
 * field on the whole facade, and 36.3% of our canvas sits in unbroken ink-free
 * plane against the reference's 20.8%.
 *
 * The word is coined and filtered in font.js. No real mark, and no near-miss.
 */
function wallSign(cv, iso, C, st, x, y, z, w, d, tall, word, opt) {
  const cell = st.range(0.6, 1.1);
  const spec = { cell, inset: 1.3, maxChars: 6 };
  const { pw, ph } = S.signSize(word, spec);
  const ax = (d > pw + 2 && st.bool(0.5)) ? 1 : 0;
  const span = ax === 0 ? w : d;
  if (span < pw + 1.4 || tall < ph + 6) return;
  const panel = st.weighted([[st.pick(C.accents), 7], [C.white, 3], [C.cream, 2], [C.tar, 3]]);
  const inkF = st.pick([...C.accents, C.white, C.tar]);
  const inkC = signInk(C, panel, inkF);
  const off = st.range(0.6, Math.max(0.7, span - pw - 0.6));
  const zz = z + st.range(5.4, Math.max(5.5, tall - ph - 0.9));
  cv.t = opt.tag();
  // A FASCIA SIGN IS BOLTED TO A WALL, so it stands off it: the panel projects
  // and its return face is visible, and two brackets carry it. A sign flush
  // with the wall has no thickness and reads as paint.
  const bx = ax === 0 ? x + off : x + w;
  const by = ax === 0 ? y + d : y + off;
  for (const t of [0.16, 0.78]) {
    const kx = bx + (ax === 0 ? t * pw : -0.35);
    const ky = by + (ax === 0 ? -0.35 : t * pw);
    box(cv, iso, kx, ky, zz + ph * 0.25, 0.5, 0.5, ph * 0.5, MD(C.slate));
  }
  S.signBody(cv, iso, C, st, bx, by, zz, ax, word, Object.assign({
    panel, ink: inkC, thick: 0.75, frameW: st.range(0.5, 1.0),
  }, spec));
}
