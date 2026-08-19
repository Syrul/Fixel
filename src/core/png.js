// PNG in/out. One format for both sides of every duel: 8-bit RGBA,
// non-interlaced, no scaling, no filtering, no colour-profile chunks.
//
// The reference is 8-bit RGBA non-interlaced. Anything we emit that differs —
// a palette chunk, RGB instead of RGBA, an interlace flag — sorts the two
// sources apart in `file` output before a judge has looked at a single pixel.
// slopscroll lost four A/B rounds to exactly this class of leak.

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export function readPNG(file) {
  const p = PNG.sync.read(readFileSync(file));
  return { w: p.width, h: p.height, data: p.data };
}

/** @param {Buffer} rgba length w*h*4 */
export function writePNG(file, w, h, rgba) {
  const p = new PNG({ width: w, height: h, colorType: 6, inputHasAlpha: true });
  rgba.copy(p.data);
  writeFileSync(file, PNG.sync.write(p, { colorType: 6, deflateLevel: 9 }));
}

/**
 * Unscaled crop. This is the only way pixels are ever taken out of an image in
 * Fixel — there is no resize path, deliberately.
 */
export function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let j = 0; j < h; j++) {
    const src = ((y + j) * img.w + x) * 4;
    img.data.copy(out, j * w * 4, src, src + w * 4);
  }
  return { w, h, data: out };
}
