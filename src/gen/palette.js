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

  // ---- this scene's light ------------------------------------------------
  // LEFT is the lit-to-shaded ratio; RIGHT falls further; DARK is the step
  // that only underside and recess faces ever reach. Centred on the old
  // constants (0.77 / 0.57 / 0.46) so a typical scene sits where the measured
  // band already accepted it, and wide enough that two seeds are lit
  // differently rather than identically.
  const LEFT = r.range(0.665, 0.865);
  const RIGHT = LEFT * r.range(0.62, 0.86);
  const DARK = RIGHT * r.range(0.66, 0.90);

  // ---- this scene's hue policy -------------------------------------------
  // HUEK is how far a shadow step drifts in hue; the SIGN is per family, so
  // some pigments cool and others warm and the scene has no net rotation. That
  // is the measured reference behaviour: `hueRotAbsMedian` up to 5.6 degrees
  // while `hueRotMedian` is nil. A scene-wide rotation is the classic
  // procedural-shader tell and this must never do it — the small negative bias
  // below is the reference's own, not a drift toward blue.
  const HUEK = r.range(0, 7.5);
  const SATK = r.range(0.90, 1.32);

  // ---- this scene's palette resolution -----------------------------------
  // How finely two tones must differ before they are the same tone. A coarse
  // scene is a poster; a fine one is a crowded market street.
  const QH = r.range(3.4, 8.5), QS = r.range(9, 21), QL = r.range(18, 36);

  function mk(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0.05, Math.min(0.99, l));
    const key = Math.round(h / QH) * 100000 + Math.round(s * QS) * 1000 + Math.round(l * QL);
    let f = cache.get(key);
    if (f) return f;
    const b = hsl(h, s, l);
    const bl = rec601(b);
    // Sign of the hue drift for THIS pigment. Hashed off the key so it is
    // stable for a family and uncorrelated between families; biased 3:2 cool
    // so the signed median lands just below zero where the reference's is,
    // rather than exactly on zero where it is one sample from either side.
    const q = (Math.imul(key ^ 0x9e3779b9, 2654435761) >>> 0) % 100;
    const sgn = q < 60 ? -1 : 1;
    const step = (k, t) => {
      if (HUEK <= 0.02) return pal.add(b[0] * k, b[1] * k, b[2] * k);
      const c = hsl(h + sgn * HUEK * t, Math.min(1, s * (1 + (SATK - 1) * t)), l);
      const cl = rec601(c);
      // rescale so the luma ratio is EXACTLY k: hue is the pigment's business,
      // the ladder is the light's, and the two must vary independently
      const m = cl > 1 ? k * bl / cl : k;
      return pal.add(c[0] * m, c[1] * m, c[2] * m);
    };
    f = {
      t: pal.add(b[0], b[1], b[2]),
      l: step(LEFT, 1),
      r: step(RIGHT, 1.7),
      d: step(DARK, 2.3),
      // metadata, deliberately underscored: `l` is already the LEFT face index
      _h: h, _s: s, _L: l,
    };
    cache.set(key, f);
    return f;
  }

  const C = { black: BLACK, ink: BLACK, mk };
  // The scene's own weather: how far its hues sit off the table, how saturated
  // it runs, and how pale. These used to be ±8 degrees and ±9% of saturation,
  // which is why `hue.meanSat` and `palette.top1Share` barely moved seed to
  // seed. A desert noon and an overcast harbour are different pictures.
  const drift = r.range(-16, 16);
  const satMul = r.range(0.60, 1.14);
  const litMul = r.range(0.90, 1.08);
  const neutralSat = r.range(0.7, 1.6);
  for (const [k, h, s, l] of FAM) {
    const neutral = s < 0.25;
    C[k] = mk(h + (neutral ? drift * 0.3 : drift),
      s * (neutral ? neutralSat : satMul),
      Math.min(0.98, l * (neutral ? litMul : 1 + (litMul - 1) * 0.4)));
  }
  C.light = { LEFT, RIGHT, DARK, HUEK, SATK };
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

  /** A wall tone near one of the neutral families, jittered per building. How
   *  much of a city is PAINTED rather than built is a property of the city,
   *  not a constant: a bleached seaside strip and a grey business district are
   *  different pictures and the old fixed 0.55 made every seed the same mix. */
  const paintRate = r.range(0.10, 0.56);
  C.paintRate = paintRate;
  C.wallTone = (st) => {
    const base = st.bool(paintRate) ? st.pick(C.accents) : st.pick(C.walls);
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
