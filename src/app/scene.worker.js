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

import { renderScene } from '../gen/scene.js';

self.onmessage = (e) => {
  const { id, seed, w, h } = e.data;
  const t0 = performance.now();
  const cv = renderScene(seed, { w, h });
  const cols = cv.pal.rgb;
  const idx = cv.idx;
  const n = cv.w * cv.h;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = cols[idx[i]] || [255, 0, 255];
    const o = i << 2;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  self.postMessage(
    { id, seed, w: cv.w, h: cv.h, ms: performance.now() - t0, buf: out.buffer },
    [out.buffer],
  );
};
