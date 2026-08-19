// The animation loop container — how a moving post is stored and played.
//
// THE MEMORY ARGUMENT, WHICH IS THE WHOLE DESIGN.
//
// A phone-shaped post is 440x1000 = 440,000 pixels. Stored as RGBA that is
// 1.76 MB per frame, so an eight-frame loop is 14 MB per post and the feed —
// already 94 MB over twelve posts — would not survive a scroll. The generator
// does not work in RGBA, though: `Canvas.idx` is one palette index per pixel,
// so a whole indexed frame is 880 KB and eight of them 7 MB. Better, and still
// far too much for something whose entire content is a few pixels of water
// moving two pixels sideways.
//
// So nothing stores a frame. What is stored is THE SET OF PIXELS THAT EVER
// MOVE, once, and then one palette index per member per frame:
//
//     off  Uint32Array[n]        screen offset of each animated pixel
//     val  Uint16Array[K * n]    its palette index in each of the K frames
//
// n is the union across the loop, and the per-frame array is DENSE over that
// union rather than sparse. Dense costs a little more memory than a sparse
// per-frame diff and buys three things worth more than the difference: playing
// a frame is one straight-line pass with no branch and no undo of the previous
// frame; frames can be shown in any order, so a scrub or a seek is free; and
// the representation cannot drift, because frame k is stored absolutely rather
// than as a chain of deltas from frame 0.
//
// At 5% of the frame animated — which is roughly what the references do — that
// is 22,000 px: 88 KB of offsets plus 352 KB of values for an eight-frame loop.
// Two per cent of the RGBA cost, and about a third of one uncompressed frame.
//
// THE INVARIANT THAT MAKES THIS SAFE: frame 0's values are exactly what the
// base canvas already holds at those offsets. Playing frame 0 is therefore a
// no-op that repaints identical bytes, and any drift between the loop and the
// base canvas is a bug this file can assert on rather than a thing that shows
// up as a flicker at the wrap.

/**
 * Build a loop from K rendered index planes.
 *
 * `planes[0]` is the base. A pixel joins the union if ANY frame disagrees with
 * the base at that offset. Nothing is thresholded and nothing is approximated:
 * a single pixel that changes on a single frame is kept, because at the
 * amplitude this project is aiming for that single pixel may be the animation.
 */
export function buildLoop(planes, w, h) {
  const K = planes.length;
  const base = planes[0];
  const n = w * h;
  if (K === 1) return { frames: 1, w, h, n: 0, off: new Uint32Array(0), val: new Uint16Array(0) };

  const moved = new Uint8Array(n);
  let count = 0;
  for (let k = 1; k < K; k++) {
    const p = planes[k];
    if (p.length !== n) throw new Error(`frame ${k} is ${p.length} px, base is ${n}`);
    for (let i = 0; i < n; i++) {
      if (p[i] !== base[i] && !moved[i]) { moved[i] = 1; count++; }
    }
  }

  const off = new Uint32Array(count);
  let j = 0;
  for (let i = 0; i < n; i++) if (moved[i]) off[j++] = i;

  const val = new Uint16Array(K * count);
  for (let k = 0; k < K; k++) {
    const p = planes[k], o = k * count;
    for (let i = 0; i < count; i++) val[o + i] = p[off[i]];
  }
  return { frames: K, w, h, n: count, off, val };
}

/**
 * Paint frame `k` of a loop into an RGBA byte array through a palette.
 *
 * `pal` is a flat Uint8Array of r,g,b triples — flattened once at build time
 * rather than kept as an array of arrays, because this runs every displayed
 * frame and an array-of-arrays lookup is two dereferences and a bounds check
 * per channel.
 */
export function paintFrame(rgba, pal3, loop, k) {
  const { n, off, val, frames } = loop;
  if (!n) return;
  const kk = ((k % frames) + frames) % frames;
  const b = kk * n;
  for (let i = 0; i < n; i++) {
    const o = off[i] << 2;
    const c = val[b + i] * 3;
    rgba[o] = pal3[c]; rgba[o + 1] = pal3[c + 1]; rgba[o + 2] = pal3[c + 2];
  }
}

/** Flatten a Palette's rgb array into the packed form `paintFrame` wants. */
export function packPalette(rgb) {
  const out = new Uint8Array(rgb.length * 3);
  for (let i = 0; i < rgb.length; i++) {
    const c = rgb[i];
    out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
  }
  return out;
}

/**
 * The union's screen-space bounding boxes, clustered into rows.
 *
 * The player has to hand the changed pixels back to the browser, and
 * `putImageData` with a dirty rectangle is far cheaper than uploading the whole
 * canvas — but only if the rectangle is actually smaller. Animated pixels are
 * scattered, so one bounding box over all of them is usually most of the frame
 * and worth nothing. Row extents are the cheap middle: one rect per band of
 * rows that contains any animated pixel, merged while the gap between bands is
 * smaller than the saving.
 */
export function dirtyBands(loop, maxGap = 24) {
  const { off, n, w, h } = loop;
  if (!n) return [];
  const rows = new Uint8Array(h);
  for (let i = 0; i < n; i++) rows[(off[i] / w) | 0] = 1;
  const bands = [];
  let y = 0;
  while (y < h) {
    if (!rows[y]) { y++; continue; }
    let y1 = y;
    let gap = 0;
    for (let z = y + 1; z < h; z++) {
      if (rows[z]) { y1 = z; gap = 0; } else if (++gap > maxGap) break;
    }
    bands.push([0, y, w, y1 - y + 1]);
    y = y1 + 1;
  }
  return bands;
}

/** Bytes a loop occupies, for the memory budget in docs/ANIM.md. */
export function loopBytes(loop) {
  return loop.off.byteLength + loop.val.byteLength;
}

// ---------------------------------------------------------------------------
// THE RECORDER — how the K frames get made without rendering the scene K times.
//
// A landscape post costs 60-260 ms to generate. Rendering it eight times to
// find out which pixels moved would cost 0.5-2 s per post, which is not a
// slower feed, it is a broken one: the worker that builds the next post is the
// same worker, and the scroll is the thing that must not lose.
//
// The observation that makes it cheap is that a shader ALREADY KNOWS every
// frame's answer at the moment it computes frame 0's. `waterTop` evaluates a
// swell phase and picks one of three tones from it; evaluating the same
// expression at eight phases costs eight adds and eight compares, against the
// field lookups, region resolution and bathymetry that dominate the call and
// are the same for all eight. So the shader emits all K values as it goes and
// the loop is assembled from them. Measured cost is a few per cent of a render
// rather than seven hundred.
//
// WHAT THIS BUYS AND WHAT IT COSTS. It buys the frames for almost nothing. It
// costs correctness *at the margin*: a pixel recorded during the water pass may
// be painted over afterwards by a mooring buoy, or blackened by the silhouette
// sweep, and the recorder cannot know that at the time. So the record is
// FILTERED at finish against the canvas that actually exists — a pixel whose
// index or tag no longer matches what was recorded is dropped from the loop.
//
// The failure mode of that filter is one-sided and that is the point: it can
// only ever drop a pixel that should have animated, never animate a pixel that
// should not have. A dropped pixel is a pixel that holds still. A wrong pixel
// would be a hole in the picture.
//
// It is still not taken on faith. `tools/animcheck.mjs` renders every frame the
// slow way — the whole scene, from the seed, at frame k — and asserts the loop
// reproduces it byte for byte. That oracle is the only reason the fast path is
// allowed to exist, and it is the same discipline that caught `putZ` writing to
// a fractional index: instrument the call and count, do not believe the
// diagnosis.

export class AnimRec {
  /**
   * @param {number} frames K, the loop length
   * @param {boolean} on recording is off entirely when a caller asks for one
   *   frame, so a still render pays nothing — not a branch inside the shader
   *   loop, not an allocation.
   */
  constructor(frames, on) {
    this.frames = frames;
    this.on = !!on && frames > 1;
    this.n = 0;
    this.cap = this.on ? 1 << 14 : 0;
    this.off = new Uint32Array(this.cap);
    this.tag = new Uint32Array(this.cap);
    this.val = new Uint16Array(this.cap * frames);
    this.dropped = 0;      // filtered out at finish; reported, never hidden
    this.flat = 0;         // recorded but identical across the loop
  }

  _grow() {
    const cap = this.cap * 2;
    const off = new Uint32Array(cap); off.set(this.off);
    const tag = new Uint32Array(cap); tag.set(this.tag);
    const val = new Uint16Array(cap * this.frames); val.set(this.val);
    this.off = off; this.tag = tag; this.val = val; this.cap = cap;
  }

  /**
   * Record one pixel's whole loop.
   *
   * `vals` is K palette indices, `vals[0]` being what the shader is about to
   * return. The caller passes a scratch array it reuses; nothing is retained.
   */
  push(off, tag, vals) {
    if (!this.on) return;
    if (this.n === this.cap) this._grow();
    const i = this.n++;
    this.off[i] = off;
    this.tag[i] = tag;
    const b = i * this.frames;
    for (let k = 0; k < this.frames; k++) this.val[b + k] = vals[k];
  }

  /**
   * Filter against the finished canvas and assemble the loop.
   *
   * Two rejections, and both are the same rule: the recorder's claim about a
   * pixel is only valid while the pixel still says what the recorder said it
   * would. A buoy drawn over the water, a hull, a pile's reflection, and every
   * pixel the silhouette sweep blackened all fail it.
   */
  finish(cv) {
    const K = this.frames;
    if (!this.on || !this.n) {
      return { frames: K, w: cv.w, h: cv.h, n: 0, off: new Uint32Array(0), val: new Uint16Array(0) };
    }
    const idx = cv.idx, tg = cv.tag;
    const keep = new Uint8Array(this.n);
    let m = 0;
    for (let i = 0; i < this.n; i++) {
      const o = this.off[i], b = i * K;
      if (idx[o] !== this.val[b] || tg[o] !== this.tag[i]) { this.dropped++; continue; }
      let moves = 0;
      for (let k = 1; k < K; k++) if (this.val[b + k] !== this.val[b]) { moves = 1; break; }
      if (!moves) { this.flat++; continue; }
      keep[i] = 1; m++;
    }
    // TWO PASSES CAN CLAIM ONE PIXEL, and left alone that is a determinism bug
    // rather than a cosmetic one. Water records a pixel; a weed raft is drawn
    // over it and records it again. Both survive the filter whenever they agree
    // on frame 0 and the tag — and then the loop holds two rows for one offset
    // whose LATER frames disagree, so which one wins depends on sort stability,
    // which is not a thing to bet a byte-identity gate on.
    //
    // Resolved by draw order: the last pass to claim a pixel is the one that
    // drew it, so the highest record index wins. `last` is indexed by screen
    // offset and costs one pass over the canvas-sized array — cheaper than any
    // form of sorting with a tie-break in it, and it removes the tie instead of
    // breaking it.
    const last = new Int32Array(cv.w * cv.h).fill(-1);
    for (let i = 0; i < this.n; i++) if (keep[i]) last[this.off[i]] = i;
    let uniq = 0;
    for (let o = 0; o < last.length; o++) if (last[o] >= 0) uniq++;

    const off = new Uint32Array(uniq);
    const val = new Uint16Array(K * uniq);
    let t = 0;
    // Ascending screen offset, which the player walks linearly every displayed
    // frame: a sorted walk strides one cache line rather than the whole heap.
    for (let o = 0; o < last.length; o++) {
      const i = last[o];
      if (i < 0) continue;
      const b = i * K;
      off[t] = o;
      for (let k = 0; k < K; k++) val[k * uniq + t] = this.val[b + k];
      t++;
    }
    this.shadowed = m - uniq;
    return {
      frames: K, w: cv.w, h: cv.h, n: uniq, off, val,
      dropped: this.dropped, flat: this.flat, shadowed: this.shadowed,
    };
  }
}

