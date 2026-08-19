// Scene generation, off the main thread.
//
// A scene is ~70-370ms depending on frame size. On the main thread that is a
// visibly broken scroll, so it runs here and the finished pixels are
// transferred back as a detached ArrayBuffer (zero-copy).
//
// NOTE ON THE PIXEL PATH: `Canvas.toRGBA()` allocates a node `Buffer` and is
// therefore node-only. Rather than touch src/core or src/gen — frozen trees
// with four rounds of measurement behind them — this resolves palette indices
// itself from the canvas's public `idx` and `pal.rgb` fields. Same arithmetic,
// additive, and it leaves every recorded digest intact.
//
// WHAT ELSE COMES BACK NOW: the animation loop. The worker asks for FRAMES
// frames rather than one, and returns the loop's `off`/`val` planes and the
// packed palette alongside the base RGBA. All four are TRANSFERRED, not copied
// — a 440x1000 post's RGBA alone is 1.76 MB and a structured clone of it per
// post is the difference between a feed and a slideshow.
//
// The main thread never sees an index plane and never sees a float. It gets
// bytes it can paint and an integer-indexed table to paint them from; deciding
// WHICH integer is the app's job and `src/core/frame.js` is the only place that
// decision is made.
//
// THE STILL PATH IS NOT AN ERROR PATH. When the generator records nothing —
// which is every post today, because no shader has been taught to record yet —
// `cv.anim` is a loop with `n === 0`. That is posted as an empty loop and the
// app treats the post as a still. Nothing about the still path may be slower or
// different because animation exists; it is the path almost every post is on.

import { renderScene } from '../gen/scene.js';
import { FRAMES } from '../core/frame.js';
import { packPalette } from '../core/anim.js';

/**
 * A typed array that exactly owns its buffer, so the buffer can be transferred.
 *
 * `AnimRec.finish` allocates exact arrays today and this is a no-op, but a view
 * with a non-zero byteOffset would transfer its ENTIRE backing buffer and the
 * receiver would read from the wrong place — a silent wrong-pixels bug rather
 * than a throw. One compare per post to make that impossible.
 */
function own(ta) {
  if (ta.byteOffset === 0 && ta.byteLength === ta.buffer.byteLength) return ta;
  return ta.slice();
}

self.onmessage = (e) => {
  const { id, seed, w, h } = e.data;
  const t0 = performance.now();
  const cv = renderScene(seed, { w, h, frames: FRAMES, frame: 0 });
  const cols = cv.pal.rgb;
  const idx = cv.idx;
  const n = cv.w * cv.h;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = cols[idx[i]] || [255, 0, 255];
    const o = i << 2;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }

  // The loop, defensively. `cv.anim` is absent when a caller asks for one frame
  // and present-but-empty when nothing recorded; both mean "still", and the
  // app must not have to tell them apart.
  const loop = cv.anim;
  const an = loop && loop.n > 0 ? loop.n : 0;
  const off = an ? own(loop.off) : new Uint32Array(0);
  const val = an ? own(loop.val) : new Uint16Array(0);
  const pal = packPalette(cols);

  self.postMessage(
    {
      id, seed, w: cv.w, h: cv.h, ms: performance.now() - t0,
      buf: out.buffer,
      pal: pal.buffer,
      off: off.buffer,
      val: val.buffer,
      n: an,
      frames: an ? loop.frames : 1,
      // Diagnostics, reported and never hidden — see src/core/anim.js. A loop
      // that drops most of what it recorded is a generator bug, and the only
      // place that is visible from is here.
      dropped: (loop && loop.dropped) | 0,
      flat: (loop && loop.flat) | 0,
      shadowed: (loop && loop.shadowed) | 0,
    },
    [out.buffer, pal.buffer, off.buffer, val.buffer],
  );
};
