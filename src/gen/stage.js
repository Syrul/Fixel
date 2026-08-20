// The stage: everything a scene needs before it decides what KIND of place it
// is.
//
// This file is the seam the biomes were cut along, and where the seam falls is
// the whole design. Above it sits everything that is true of every Fixel post
// and must never diverge — the projection and its lattice, the tagged canvas,
// the silhouette sweep, the palette with its contour step, per-neighbourhood
// colour commitment, the world bounds. Below it sits LAYOUT, which is exactly
// what a biome is: a street grid and a parcel mix, or a dune field and a
// caravan track, or a coastline and a boardwalk.
//
// The temptation this seam exists to refuse is a `biome` parameter threaded
// into `planCity` that swaps a palette and a prop table. That produces four
// dialects of one city and everyone sees through it in a second. A biome here
// owns its own layout driver end to end and shares only what is genuinely
// invariant, which is why `renderScene` dispatches to a module rather than
// branching inside one.

import { Rng } from '../core/rng.js';
import { Canvas } from '../core/canvas.js';
import { AnimRec } from '../core/anim.js';
import { View, SCALE } from './view.js';
import { setInk } from './draw.js';
import { buildPalette } from './palette.js';
import { pickConditions } from './conditions.js';

/**
 * Canvas that stamps the current object tag on everything it draws.
 *
 * THE TAG BUFFER IS 32-BIT, AND THAT IS A CORRECTNESS FIX, NOT A TIDY-UP.
 * `Canvas` allocates a `Uint16Array`, and the tag counter used to wrap at
 * 65534. The worst of eight seeds reached 53,515 tags at 1600x1100 — 18%
 * headroom — and the failure is SILENT: two objects that happen to share a tag
 * have no keyline drawn between them, so a wrapped scene loses outlines in a
 * way nothing in the harness can see.
 */
export class TaggedCanvas extends Canvas {
  constructor(w, h, pal) {
    super(w, h, pal);
    this.tag = new Uint32Array(w * h);
    this.t = 0;
  }
  put(x, y, ci, d, tag = 0) { return super.put(x, y, ci, d, tag || this.t); }
  putZ(x, y, ci, d, tag = 0) { return super.putZ(x, y, ci, d, tag || this.t); }
  fillPoly(p, a, b, c, sh, tag = 0) { return super.fillPoly(p, a, b, c, sh, tag || this.t); }
  rect(x, y, w, h, ci, d, tag = 0) { return super.rect(x, y, w, h, ci, d, tag || this.t); }
  line(a, b, c, d2, ci, d, tag = 0) { return super.line(a, b, c, d2, ci, d, tag || this.t); }
  blit(x, y, r, m, d, tag = 0) { return super.blit(x, y, r, m, d, tag || this.t); }
}

/**
 * A committed local sub-palette: a few accents and a wall tone or two.
 *
 * IT USED TO MINT FIVE NEAR-DUPLICATES OF EVERY TONE, and that was the defect a
 * round-1 judge named without having any of these numbers: "kit-of-parts
 * construction with PER-INSTANCE COLOUR RANDOMISATION, not per-object
 * drawing". A neighbourhood now commits to a SHORT list of exact tones and
 * objects pick from it. The global palette does not shrink — it grows, because
 * there are more neighbourhoods each committing to something different.
 *
 * It is in the shared layer because it is not a city property. A stretch of
 * shore commits to its own driftwood-and-bleached-blue the same way a block
 * commits to its own grey-and-red, and the reason is identical: a colour that
 * recurs six times a crop apart is a colour that means nothing.
 */
export function localC(C, st, nAcc, nWall) {
  const V = Object.create(C);
  const acc = [];
  for (let i = 0; i < nAcc; i++) acc.push(C.accentTone(st));
  V.accents = acc;
  const wl = [];
  for (let i = 0; i < nWall; i++) wl.push(C.wallTone(st));
  V.walls = wl;
  V.wallTone = (s) => wl[s.int(0, wl.length - 1)];
  V.accentTone = (s) => acc[s.int(0, acc.length - 1)];
  return V;
}

/**
 * One sweep, after everything is drawn: blacken the boundary pixel of the
 * NEARER object at every tag change. Small objects are skipped — a 1px rim on a
 * five-pixel-wide pedestrian would eat the pedestrian.
 */
export function outlinePass(cv, black, skip, nTags) {
  const w = cv.w, h = cv.h, N = nTags + 1;
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

/**
 * Build everything shared, and hand the biome a stage to paint on.
 *
 * `backPad` is the one parameter a flat city does not need and a landscape
 * cannot do without. The frame is always full because the world overflows it in
 * every direction — but relief changes how far it has to overflow. A screen
 * pixel looking just over a low foreground sees terrain further back along the
 * (1,1,1) view ray, and how much further is proportional to the relief, so a
 * biome with 60 units of height needs its world generated further out in -x and
 * -y or it renders a hole of untouched background at the horizon. Nothing in
 * the harness would fail on that; it would just look like sky in a picture that
 * has no sky.
 */
export function makeStage(seed, opts = {}) {
  const W = opts.w || 1600, H = opts.h || 1100;
  const rng = new Rng(seed);
  // CONDITIONS ARE RESOLVED BEFORE THE PALETTE AND THEREFORE BEFORE EVERYTHING.
  // They belong here, beside the biome and the palette commitment, because they
  // change what the scene is MADE OF. Anything applied after the scene is drawn
  // would be a filter over a finished picture, and would take the shading
  // ladder, the local colour and the ink model with it.
  const cond = opts.cond || pickConditions(seed);
  const { pal, C } = buildPalette(rng, cond);
  const cv = new TaggedCanvas(W, H, pal);
  setInk(C.black);

  const ox = Math.round(W / 2);
  const oy = -Math.round(H * 0.24);
  const S = opts.scale || SCALE;
  const iso = new View(ox, oy, S);

  const MX = 140, MY = 140;
  const back = opts.backPad || 0;
  const uMin = (0 - MX - ox) / (2 * S), uMax = (W + MX - ox) / (2 * S);
  const vMin = (0 - MY - oy) / S, vMax = (H + MY - oy) / S;
  const X0 = Math.floor((uMin + vMin) / 2) - 4 - back;
  const X1 = Math.ceil((uMax + vMax) / 2) + 4;
  const Y0 = Math.floor((vMin - uMax) / 2) - 4 - back;
  const Y1 = Math.ceil((vMax - uMin) / 2) + 4;

  const gs = rng.stream('ground');
  const seedN = gs.int(1, 1 << 28);

  // Tags are handed out monotonically and never reused. The side table that
  // records which of them opt out of the silhouette sweep grows with them, so
  // there is no ceiling to run into and no modulo to wrap through.
  //
  // THE ALLOCATOR HAD NO CEILING AND THE STORAGE STILL DID, WHICH IS WORSE THAN
  // THE MODULO IT REPLACED. The old counter wrapped at 65534, which at least
  // aliased inside the range the buffer could hold. Once the wrap was removed,
  // nothing bounded the counter and nothing checked that `cv.tag` could hold
  // what it was handed — and a typed-array store TRUNCATES rather than throwing.
  // Two objects that collide on a truncated tag have no keyline drawn between
  // them, silently, and no gate in this harness can see a missing keyline.
  //
  // THE CEILING IS READ OFF THE STORAGE RATHER THAN WRITTEN DOWN A SECOND TIME.
  // `TAG_STORE` is whatever `cv.tag` actually is, so the guard cannot drift away
  // from the buffer it is guarding: if anyone ever gives `TaggedCanvas` a
  // narrower array again — or deletes the override and inherits `Canvas`'s
  // `Uint16Array` — this throws at exactly the tag the truncation used to start
  // at, instead of quietly losing outlines. A constant here would have gone
  // stale the first time the storage moved, which is how the defect arrived.
  //
  // THE SECOND CEILING IS `outlinePass`'s MEMORY, and it is the one that can
  // realistically bind. That sweep allocates four Int32Arrays of `nTags + 1`, so
  // a runaway tag count is 16 bytes per tag of transient allocation before it is
  // a correctness problem. 1 << 20 is 16 MB and about twenty times the worst
  // measured seed; nothing legitimate approaches it, and a scene that does has a
  // bug rather than a lot of objects.
  const TAG_STORE = (2 ** (8 * cv.tag.BYTES_PER_ELEMENT)) - 1;
  const TAG_CEIL = Math.min(TAG_STORE, (1 << 20) - 1);
  let tagN = 0;
  let noOutline = new Uint8Array(1 << 14);
  const tag = () => {
    tagN++;
    if (tagN > TAG_CEIL) {
      throw new Error(
        `tag ${tagN} exceeds the ceiling ${TAG_CEIL} at ${W}x${H} ` +
        `(storage ${cv.tag.constructor.name} holds ${TAG_STORE}). A tag written past ` +
        `the width of cv.tag TRUNCATES silently, and two objects sharing a tag lose the ` +
        `keyline between them — a defect no gate in this harness can see. Widen the ` +
        `tag array in src/core/canvas.js and the override in TaggedCanvas together.`);
    }
    if (tagN >= noOutline.length) {
      const grown = new Uint8Array(noOutline.length * 2);
      grown.set(noOutline);
      noOutline = grown;
    }
    return tagN;
  };
  // Sprite-blitted things — pedestrians, foliage — carry their own authored
  // keyline. A second 1px rim on a five-pixel-wide figure eats the figure.
  const tagRaw = () => { const t = tag(); noOutline[t] = 1; return t; };

  const vis = (x0, y0, x1, y1, maxH) => {
    const l = iso.proj(x0, y1, 0), r = iso.proj(x1, y0, 0);
    const t = iso.proj(x0, y0, 0), b = iso.proj(x1, y1, 0);
    if (r[0] < -48 || l[0] > W + 48) return false;
    if (b[1] < -24) return false;
    if (t[1] - 2 * S * maxH > H + 24) return false;
    return true;
  };

  // THE FRAME INDEX IS A NUMBER THE STAGE CARRIES, NEVER A CLOCK IT READS.
  //
  // `frame` is which single picture of the loop this render is. `frames` is how
  // many there are. A biome that animates reads `stage.frame` for its own pose
  // and hands `stage.anim` the whole loop's worth of values for a pixel it is
  // already shading — see `src/core/anim.js` for why those are two different
  // jobs.
  //
  // WITH `frames` AT 1 THE ANIMATION PATH COSTS NOTHING AND CHANGES NOTHING.
  // `AnimRec` allocates no buffers and `push` returns on its first line, so
  // every existing measurement — every digest in `docs/`, `tools/metrics.mjs`,
  // the duel — renders exactly the bytes it always rendered. That is the
  // invariant this whole change is staged around: the machinery lands first and
  // is provably inert, then the motion lands on top of it.
  const frames = Math.max(1, opts.frames || 1);
  const frame = ((opts.frame | 0) % frames + frames) % frames;
  const anim = new AnimRec(frames, frames > 1);

  return {
    W, H, S, rng, pal, C, cv, iso, ox, oy, X0, X1, Y0, Y1, seedN,
    tag, tagRaw, vis, cond,
    frame, frames, anim,
    get tagN() { return tagN; },
    finish(o = {}) {
      if (o.outline !== false) outlinePass(cv, C.black, noOutline, tagN);
      // ANYTHING THAT IS IN FRONT OF THE INK DRAWS HERE, after the sweep and
      // before the recorder is closed. Falling rain and snow are the only
      // things that qualify: they are between the camera and every object in
      // the frame, including its outline, so a drop drawn before the sweep
      // would have the sweep drawn over it.
      //
      // It is the one place in this generator where a pass may cover ink, and
      // it is therefore the one place that can move `outline.darkShare` and the
      // ink-closure ratio. Measured, not assumed — see docs/ROUNDS.md.
      if (o.front) o.front(cv);
      // AFTER the sweep, deliberately. The sweep is the last thing that writes
      // a pixel, and a pixel it blackened is a pixel that must not animate: ink
      // that moved would be ink redistributed, and ink closure is the one
      // diagnostic in this repo that has ever ordered genuine work above ours
      // correctly. The filter in `AnimRec.finish` drops those pixels because
      // their index no longer matches what was recorded, which makes "the
      // outlines hold still" a consequence of the arithmetic rather than a rule
      // somebody has to remember.
      if (frames > 1) cv.anim = anim.finish(cv, C.black);
      // THE TAG COUNT RIDES OUT ON THE CANVAS SO IT CAN BE MEASURED RATHER THAN
      // ASSERTED. `renderScene` returns the canvas, not the stage, so without
      // this the only way to characterise headroom is to re-implement the
      // dispatcher in a script — which is a second copy of the thing being
      // measured. Same grounds as `lampSet` being exported: it changes no pixel
      // by being reachable, and a ceiling nobody can measure the distance to is
      // a ceiling nobody knows they are near.
      cv.tagN = tagN;
      cv.tagCeil = TAG_CEIL;
      return cv;
    },
  };
}
