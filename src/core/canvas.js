// Indexed pixel canvas + convex-quad rasteriser with a per-pixel depth buffer.
//
// Everything here is integer and 1:1. There is no antialiasing, no filtering,
// no scaling and no resampling anywhere in Fixel's pixel path — a crop of the
// output is a crop of the pixels the generator wrote. That is the whole point:
// the duel is unscaled same-size crops, and any smoothing would leak which
// side is which before a judge even looked at the craft.

const NO_DEPTH = -1e9;

export class Canvas {
  /**
   * @param {number} w
   * @param {number} h
   * @param {Palette} pal
   */
  constructor(w, h, pal) {
    this.w = w; this.h = h;
    this.pal = pal;
    this.idx = new Uint16Array(w * h);       // palette index per pixel
    this.depth = new Float32Array(w * h);    // world depth, larger = nearer
    this.depth.fill(NO_DEPTH);
    this.tag = new Uint16Array(w * h);       // object tag, for outline passes
  }

  clear(ci) { this.idx.fill(ci); this.depth.fill(NO_DEPTH); this.tag.fill(0); }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  get(x, y) { return this.idx[y * this.w + x]; }

  /** Unconditional write (2D overlay layer — signage, sprites, sky). */
  put(x, y, ci, d = 1e8, tag = 0) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = y * this.w + x;
    this.idx[o] = ci; this.depth[o] = d; this.tag[o] = tag;
  }

  /** Depth-tested write. */
  putZ(x, y, ci, d, tag = 0) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const o = y * this.w + x;
    if (d < this.depth[o]) return false;
    this.idx[o] = ci; this.depth[o] = d; this.tag[o] = tag;
    return true;
  }

  /**
   * Fill a convex polygon given integer screen-space corners, depth-tested.
   * `depthAt(sx, sy)` is linear per face, so it is passed as coefficients
   * (A, B, C) => depth = A*sx + B*sy + C. Linear because every face of an
   * axis-aligned box in this projection has a closed-form depth (see iso.js).
   *
   * `shade(sx, sy, depth)` returns a palette index, or -1 to skip the pixel.
   * Passing a function rather than a flat index is what makes dither, noise
   * texture and per-face detail possible without a second pass.
   */
  fillPoly(pts, dA, dB, dC, shade, tag = 0) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    minY = Math.max(0, Math.ceil(minY));
    maxY = Math.min(this.h - 1, Math.floor(maxY));
    const n = pts.length;
    for (let y = minY; y <= maxY; y++) {
      const yc = y + 0.5;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ay = a[1], by = b[1];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          const t = (yc - ay) / (by - ay);
          const x = a[0] + t * (b[0] - a[0]);
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      if (lo > hi) continue;
      let x0 = Math.max(0, Math.ceil(lo - 0.5));
      let x1 = Math.min(this.w - 1, Math.floor(hi - 0.5));
      for (let x = x0; x <= x1; x++) {
        const d = dA * x + dB * y + dC;
        const o = y * this.w + x;
        if (d < this.depth[o]) continue;
        const ci = shade(x, y, d);
        if (ci < 0) continue;
        this.idx[o] = ci; this.depth[o] = d; this.tag[o] = tag;
      }
    }
  }

  /** Axis-aligned screen-space rect, depth-tested at a constant depth. */
  rect(x0, y0, w, h, ci, d, tag = 0) {
    const xa = Math.max(0, x0), ya = Math.max(0, y0);
    const xb = Math.min(this.w, x0 + w), yb = Math.min(this.h, y0 + h);
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const o = y * this.w + x;
        if (d < this.depth[o]) continue;
        this.idx[o] = ci; this.depth[o] = d; this.tag[o] = tag;
      }
    }
  }

  /** Bresenham line, depth-tested at a constant depth. */
  line(x0, y0, x1, y1, ci, d, tag = 0) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.putZ(x0, y0, ci, d, tag);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /**
   * Blit a string-art sprite. `rows` is an array of equal-length strings; each
   * character keys into `map` (char -> palette index, or -1/undefined to skip).
   * Sprites are authored as tables — never as stored bitmaps of anything real.
   */
  blit(x0, y0, rows, map, d, tag = 0) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        const ci = map[c];
        if (ci === undefined || ci < 0) continue;
        this.putZ(x0 + i, y0 + j, ci, d, tag);
      }
    }
  }

  /** RGBA8 buffer, resolved through the palette. */
  toRGBA() {
    const out = Buffer.alloc(this.w * this.h * 4);
    const cols = this.pal.rgb;
    for (let i = 0; i < this.idx.length; i++) {
      const c = cols[this.idx[i]] || [255, 0, 255];
      const o = i * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
    return out;
  }
}

/** Palette: an index -> [r,g,b] table built by the generator, never stored. */
export class Palette {
  constructor() { this.rgb = []; this._seen = new Map(); }
  add(r, g, b) {
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
    const k = (r << 16) | (g << 8) | b;
    const had = this._seen.get(k);
    if (had !== undefined) return had;
    const i = this.rgb.length;
    this.rgb.push([r, g, b]);
    this._seen.set(k, i);
    return i;
  }
  get size() { return this.rgb.length; }
}

function clamp255(v) { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; }

/** HSL -> RGB, h in [0,360), s and l in [0,1]. */
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
