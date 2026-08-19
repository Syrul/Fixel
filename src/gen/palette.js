// The palette is BUILT, never stored.
//
// A family is one hue at four steps. The steps are made by SCALING RGB, not by
// dropping HSL lightness: scaling keeps the hue exactly where it was, and the
// reference's shadow steps do not rotate hue on average (measured median
// rotation ~-3.6 degrees, i.e. nil). Procedural shaders almost always drift
// toward blue in shadow; this one must not.
//
// EVERY SCENE COMMITS TO ITS OWN LIGHT. The variety gate measured the whole
// `shade.*` family FROZEN across seeds — ratios 0.018 to 0.115 where 1.000 is
// the floor — because the ladder below used to be four module constants. One
// lighting model, one luma ladder, one hue policy for every scene the feed will
// ever emit. It is now drawn per scene off the palette stream, and the numbers
// it moves are exactly `shade.lumaRatioMedian`, `shade.lumaRatioP75`,
// `shade.hueRotMedian` and `shade.hueRotAbsMedian`.
//
// The two properties are kept SEPARATE on purpose. The luma ratio belongs to
// the light; the hue rotation belongs to the pigment. A shadow step therefore
// rotates hue and deepens saturation, and is then rescaled so its luma ratio is
// still exactly the ladder factor. Without that rescale the two are welded and
// a scene cannot vary one without dragging the other.
//
// Families are minted on demand and cached on a quantised (h, s, l) key whose
// FINENESS is also per scene: `palette.distinct` spanned 229-365 across seeds
// where the reference's own crops span 410 of width, so how much palette a
// scene spends is itself a thing a scene decides.

import { Palette, hsl } from '../core/canvas.js';

const rec601 = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// [key, hue, sat, light] — the value given is the TOP face. The reference is a
// light image: its single most common colour is a warm light grey at 4.8% of
// the frame, and 59% of all its pixels are near-neutral. Neutral families carry
// the scene; the saturated ones are accents and are spent sparingly.
const FAM = [
  ['road',     40, 0.05, 0.66],
  ['roadD',    38, 0.04, 0.50],
  ['pave',     46, 0.13, 0.82],
  ['concrete', 40, 0.07, 0.76],
  ['stone',    36, 0.10, 0.70],
  ['cream',    46, 0.22, 0.90],
  ['white',    48, 0.05, 0.97],
  ['metal',   210, 0.06, 0.72],
  ['steel',   212, 0.14, 0.54],
  ['slate',   215, 0.10, 0.42],
  ['taupe',    30, 0.12, 0.58],
  ['sandy',    40, 0.38, 0.80],
  ['brick',    10, 0.52, 0.54],
  ['terra',    18, 0.66, 0.62],
  ['wood',     28, 0.35, 0.52],
  ['red',       2, 0.82, 0.55],
  ['orange',   24, 0.92, 0.58],
  ['amber',    38, 0.95, 0.62],
  ['yellow',   50, 0.96, 0.68],
  ['lime',     76, 0.74, 0.54],
  ['leaf',    118, 0.54, 0.42],
  ['grass',    92, 0.48, 0.52],
  ['green',   146, 0.66, 0.46],
  ['teal',    172, 0.58, 0.50],
  ['cyan',    192, 0.74, 0.56],
  ['aqua',    196, 0.54, 0.70],
  ['glass',   204, 0.52, 0.62],
  ['blue',    216, 0.72, 0.52],
  ['indigo',  250, 0.54, 0.52],
  ['magenta', 320, 0.70, 0.56],
  ['pink',    338, 0.72, 0.70],
];

export const ACCENT_KEYS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'cyan', 'blue', 'indigo', 'magenta', 'pink', 'teal', 'terra', 'brick'];
// What a building is usually made of. Overwhelmingly neutral on purpose.
export const WALL_KEYS = ['concrete', 'pave', 'cream', 'white', 'stone', 'taupe',
  'sandy', 'metal', 'steel', 'slate', 'brick', 'terra', 'wood', 'concrete',
  'stone', 'cream', 'white', 'glass', 'teal'];

export function buildPalette(rng) {
  const r = rng.stream('palette');
  const pal = new Palette();
  const cache = new Map();

  // One shared near-black does every outline in the frame. The reference uses
  // one, not a per-material dark — that is what makes the edges read as a
  // system rather than as shading.
  const BLACK = pal.add(8, 8, 10);

  function mk(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0.05, Math.min(0.99, l));
    const key = Math.round(h / 6) * 100000 + Math.round(s * 14) * 1000 + Math.round(l * 26);
    let f = cache.get(key);
    if (f) return f;
    const b = hsl(h, s, l);
    f = {
      t: pal.add(b[0] * TOP, b[1] * TOP, b[2] * TOP),
      l: pal.add(b[0] * LEFT, b[1] * LEFT, b[2] * LEFT),
      r: pal.add(b[0] * RIGHT, b[1] * RIGHT, b[2] * RIGHT),
      d: pal.add(b[0] * DARK, b[1] * DARK, b[2] * DARK),
      // metadata, deliberately underscored: `l` is already the LEFT face index
      _h: h, _s: s, _L: l,
    };
    cache.set(key, f);
    return f;
  }

  const C = { black: BLACK, ink: BLACK, mk };
  const drift = r.range(-8, 8);
  const satMul = r.range(0.92, 1.10);
  for (const [k, h, s, l] of FAM) {
    const neutral = s < 0.25;
    C[k] = mk(h + (neutral ? drift * 0.25 : drift), s * (neutral ? 1 : satMul), l);
  }
  C.tar = C.slate;

  C.skin = [
    mk(28, 0.60, 0.80), mk(26, 0.50, 0.66), mk(24, 0.44, 0.48), mk(22, 0.40, 0.34),
  ];
  C.hair = [
    mk(30, 0.30, 0.16), mk(28, 0.45, 0.34), mk(44, 0.70, 0.70), mk(0, 0.05, 0.78),
    mk(348, 0.55, 0.46),
  ];

  C.accents = ACCENT_KEYS.map((k) => C[k]);
  C.walls = WALL_KEYS.map((k) => C[k]);

  /** A wall tone near one of the neutral families, jittered per building. One
   *  building in four is painted rather than built, which is where a grey city
   *  gets its saturation back without turning into confetti. */
  C.wallTone = (st) => {
    const base = st.bool(0.55) ? st.pick(C.accents) : st.pick(C.walls);
    return mk(base._h + st.range(-10, 10), base._s * st.range(0.85, 1.3),
      Math.min(0.97, base._L * st.range(0.86, 1.12)));
  };
  /** A saturated tone, jittered. Used for paint: awnings, signs, vehicles. */
  C.accentTone = (st) => {
    const base = st.pick(C.accents);
    return mk(base._h + st.range(-12, 12), Math.min(1, base._s * st.range(0.85, 1.15)),
      Math.min(0.92, base._L * st.range(0.88, 1.14)));
  };
  return { pal, C };
}

/** Deterministic 32-bit hash of three integers — a pure function, safe to call
 *  per pixel inside a shade callback where an Rng draw would depend on
 *  rasterisation order. */
export function h3(a, b, c) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
