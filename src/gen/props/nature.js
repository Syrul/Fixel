// Planting.
//
// Canopies are authored blob tables rather than boxes: a cube tree reads as a
// crate, and the reference's trees are irregular masses with a hard dark edge
// on the shadow side.
//
// FOLIAGE IS WHERE THIS GENERATOR GETS ITS OFF-LATTICE FORM, and that is the
// hardest number in the project — 0.5% of our area in non-lattice-conforming
// shapes against the reference's 9.9%, a twentyfold gap. Every other mass in a
// dimetric city is a box and steps 2 across for 1 down. A canopy steps by
// whatever it likes. So a tree is not decoration here; at 26-34px it is one of
// the few things in the frame whose silhouette is genuinely organic, and it has
// to be big enough for that silhouette to be a shape rather than a smudge.
//
// The tables are therefore authored as a CORE and grown: the outer keyline is
// derived by dilation AFTER scaling, so it stays exactly one pixel however
// large the canopy is. Scaling a table that already contained its own ring
// would have produced a two-pixel outline, which the dark-run histogram reads
// as a fat outline and which is the easiest available way to lose `run1Share`.
//
//   l light leaf   m mid leaf   x leaf shadow (the leaf's OWN dark, not ink)
//   . skip                      d is added by grow(), never authored

import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { topFace, leftFace, rightFace } from '../faces.js';
import { h3 } from '../palette.js';
import { dep, projR } from '../view.js';

const CANOPY = [
  ['...mmmm...', '..mmlllmm.', '.mllllllmm', 'mllllllllm', 'mlllllllmm',
   'mmlllllmmx', '.mmmmmmmxx', '..xmmmmxx.', '...xxxx...'],
  ['....mmm...', '..mmlllmm.', '.mllllmmmm', 'mlllllmmmm', 'mllllmmmmx',
   '.mmmmmmmxx', '..mmmmmxx.', '...xxxxx..'],
  ['..mmm..mmm..', '.mlllmmlllm.', 'mlllllmllllm', 'mllllmmllllm',
   '.mmlllmmmmm.', '..mmmmmmxx..', '...xmmmxx...', '....xxxx....'],
  ['...mmm...', '..mlllm..', '.mllllmm.', 'mlllllmm.', '.mmlllmx.', '..xmmxx..'],
];

// A palm crown: the fronds radiate, so its outline is nowhere near the lattice.
const FROND = [
  '..m.........m..', '.mlm.......mlm.', 'mlllm.....mlllm', '.mlllm...mlllm.',
  '..mlllm.mlllm..', '...mlllmlllm...', '....mlllllm....', '...mlllllllm...',
  '..mllmlmlmllm..', '.mllm...x...mllm', 'mllm....x....mllm',
];

/**
 * A CANOPY GROWN FROM A RADIUS FUNCTION, NOT FROM A SCALED TABLE.
 *
 * The first attempt at big foliage scaled the authored tables by 2 or 3, and
 * measured OFF-LATTICE FORM WENT DOWN. Obvious in hindsight and worth writing
 * down: scaling a table by k multiplies every step in its outline by k, so a
 * hand-drawn 1-pixel jog becomes a 2-pixel jog — which is exactly the 2:1 iso
 * stair, i.e. the lattice. Enlarging a table makes its silhouette MORE
 * machine-like, not less. The only way to keep an organic contour at size is to
 * generate it at that size.
 *
 * So the outline is a periodic radius, r(theta) = R * (1 + sum of three
 * harmonics), sampled per pixel. Three harmonics with incommensurate phases
 * never repeat around the circle, the boundary crosses every angle, and none of
 * those angles is 2:1 except by coincidence. The vertical axis is squashed
 * because a tree seen in this projection is wider than it is deep.
 *
 * Interior tones are a light ramp plus a clumping hash, so the canopy reads as
 * a mass with a lit side rather than as a flat blob — and the shadow side is
 * the leaf's OWN dark, `g.k`, not the shared ink.
 */
function blob(R, variant) {
  const key = R * 16 + variant;
  const had = BLOB_CACHE.get(key);
  if (had) return had;
  const h = (a, b) => (h3(a, b, 0x51ed + variant * 977) >>> 0) / 4294967296;
  const A = [0.09 + 0.07 * h(1, 0), 0.06 + 0.05 * h(2, 0), 0.035 + 0.03 * h(3, 0)];
  const P = [h(4, 0) * 6.283, h(5, 0) * 6.283, h(6, 0) * 6.283];
  const SQ = 0.78;                       // vertical squash
  const rad = (th) => R * (1 + A[0] * Math.sin(3 * th + P[0])
    + A[1] * Math.sin(5 * th + P[1]) + A[2] * Math.sin(7 * th + P[2]));
  const RX = Math.ceil(R * 1.4), RY = Math.ceil(R * 1.4 * SQ);
  const core = [];
  for (let j = -RY; j <= RY; j++) {
    let line = '';
    for (let i = -RX; i <= RX; i++) {
      const jj = j / SQ;
      const d = Math.sqrt(i * i + jj * jj);
      const th = Math.atan2(jj, i);
      if (d > rad(th)) { line += '.'; continue; }
      // FOUR TONES, CLUMPED AT TWO SCALES. A canopy is 30-50px across now, and
      // at three tones in big smooth bands it read as a green slab with one
      // lighter patch — the same "large undetailed facet" failure the round is
      // about, moved onto foliage. The ramp is the light; the two octaves of
      // hash are the clumps of leaf that break it, one at 3px and one at 7px,
      // so the mass has structure at both the size of a branch and the size of
      // a leaf cluster.
      const n1 = ((h3(i >> 1, j >> 1, 0x2f1b + variant) >>> 8) & 15) / 15 - 0.5;
      const n2 = ((h3(i / 7 | 0, j / 7 | 0, 0x71c3 + variant) >>> 8) & 15) / 15 - 0.5;
      const s = (i * 0.5 + jj * 0.86) / R + n1 * 0.34 + n2 * 0.40;
      line += s < -0.52 ? 'a' : s < -0.06 ? 'l' : s < 0.44 ? 'm' : 'x';
    }
    core.push(line);
  }
  const out = ring(core);
  BLOB_CACHE.set(key, out);
  return out;
}
const BLOB_CACHE = new Map();

/**
 * A palm crown as radiating fronds rather than one mass.
 *
 * Seven to nine tapered arcs swept from the crown centre at irregular angles.
 * Nothing in it is axis-aligned and nothing in it is 2:1; a palm is the single
 * most off-lattice object a street can legitimately contain, and the reference
 * uses them for exactly that.
 */
function frondCrown(R, variant) {
  const key = 100000 + R * 16 + variant;
  const had = BLOB_CACHE.get(key);
  if (had) return had;
  const rnd = (a) => (h3(a, variant, 0x77c1) >>> 0) / 4294967296;
  const n = 7 + (h3(1, variant, 0x31) & 3);
  const SQ = 0.62;
  const RX = R + 3, RY = Math.ceil(R * SQ) + 4;
  const g = [];
  for (let j = 0; j < 2 * RY + 1; j++) g.push(new Array(2 * RX + 1).fill('.'));
  const put = (i, j, c) => {
    const jj = j + RY, ii = i + RX;
    if (jj < 0 || jj >= g.length || ii < 0 || ii >= g[0].length) return;
    if (g[jj][ii] === '.' || c === 'l') g[jj][ii] = c;
  };
  for (let f = 0; f < n; f++) {
    const a0 = (f / n) * 6.283 + rnd(f + 2) * 0.5;
    const droop = 0.5 + rnd(f + 30) * 0.7;
    const len = R * (0.72 + rnd(f + 60) * 0.42);
    for (let t = 0; t <= 1.0001; t += 0.045) {
      const rr = len * t;
      const a = a0 + t * t * 0.55 * (Math.cos(a0) >= 0 ? 1 : -1);
      const px = Math.round(Math.cos(a) * rr);
      const py = Math.round((Math.sin(a) * rr + t * t * droop * R * 0.45) * SQ);
      const wdt = Math.max(0, Math.round(2.2 * (1 - t * 0.85)));
      for (let q = -wdt; q <= wdt; q++) {
        put(px, py + q, Math.abs(q) === wdt && wdt > 0 ? 'm' : 'l');
      }
    }
  }
  // a heart of shadow where the fronds meet
  for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) {
    if (i * i + j * j * 3 <= 9) put(i, j, 'x');
  }
  const out = ring(g.map((r) => r.join('')));
  BLOB_CACHE.set(key, out);
  return out;
}

/** Add a fresh one-pixel keyline by four-neighbour dilation. */
function ring(core) {
  const H = core.length, W = core[0].length;
  const solid = (j, i) => j >= 0 && j < H && i >= 0 && i < W && core[j][i] !== '.';
  const out = [];
  for (let j = -1; j <= H; j++) {
    let line = '';
    for (let i = -1; i <= W; i++) {
      if (solid(j, i)) { line += core[j][i]; continue; }
      line += (solid(j - 1, i) || solid(j + 1, i) || solid(j, i - 1) || solid(j, i + 1)) ? 'd' : '.';
    }
    out.push(line);
  }
  return out;
}

/**
 * Scale a core table by k and give it a fresh one-pixel keyline.
 *
 * The dilation is by the FOUR-neighbourhood for the same reason it is on the
 * figures: any orthogonal path out of the mass must cross the ring, so the
 * interior is a closed cell under the 4-connectivity the closure metric uses.
 */
function grow(rows, k) {
  const w0 = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => r + '.'.repeat(w0 - r.length));
  const core = [];
  for (const r of padded) {
    let s = '';
    for (const c of r) s += c.repeat(k);
    for (let i = 0; i < k; i++) core.push(s);
  }
  return ring(core);
}

const SMALL = CANOPY.map((r) => grow(r, 1));

const leafMap = (C, g) => ({ d: C.black, x: g.k, m: g.r, l: g.l, a: g.t, '.': -1 });

export function tree(cv, iso, C, st, x, y, z, big) {
  const g = st.pick([C.leaf, C.grass, C.grass, C.green]);
  const th = big ? st.range(5.0, 9.0) : st.range(3.0, 5.0);
  const tr = st.pick([C.wood, C.terra, C.slate]);
  // A trunk with a base flare, not a stick: at this scale a 3px pole under a
  // 30px canopy reads as a lollipop.
  const tw = big ? 1.5 : 1.1;
  box(cv, iso, x, y, z, tw, tw, th, { top: tr.l, left: tr.l, right: tr.r });
  box(cv, iso, x - 0.2, y - 0.2, z, tw + 0.4, tw + 0.4, Math.max(0.5, th * 0.16),
    { top: tr.l, left: tr.k, right: tr.r });
  const R = big ? st.int(9, 14) : st.int(6, 9);
  const rows = blob(R, st.int(0, 7));
  const p = projR(iso, x + tw * 0.5, y + tw * 0.5, z + th);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    leafMap(C, g), dep(iso, x, y, z + th, 1.2));
}

export function palm(cv, iso, C, st, x, y, z) {
  const h = st.range(14, 28);
  const tr = st.pick([C.sandy, C.wood, C.concrete]);
  const lean = st.range(-0.06, 0.06);
  const seg = Math.max(5, Math.round(h / 2.6));
  // The trunk tapers and its scars are every THIRD segment, not every other
  // one. Alternating two tones up a pole is a barber pole, not a palm, and at
  // the new scale it was the most conspicuous repeat in the frame.
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const wdt = 1.35 - 0.45 * t;
    box(cv, iso, x + lean * i * 1.2 + (1.35 - wdt) * 0.5, y + lean * i * 0.5 + (1.35 - wdt) * 0.5,
      z + t * h, wdt, wdt, h / seg + 0.1,
      { top: tr.l, left: (i % 3) === 0 ? tr.r : tr.l, right: (i % 3) === 0 ? tr.k : tr.r });
  }
  const g = st.pick([C.leaf, C.green, C.grass]);
  const p = projR(iso, x + 0.5 + lean * seg * 1.2, y + 0.5 + lean * seg * 0.5, z + h);
  const crown = frondCrown(st.int(15, 21), st.int(0, 7));
  cv.blit(p[0] - (crown[0].length >> 1), p[1] - crown.length + 4, crown,
    leafMap(C, g), dep(iso, x, y, z + h, 2));
  if (st.bool(0.35)) {
    const c = st.pick([C.amber, C.orange, C.lime]);
    cv.blit(p[0] - 2, p[1] - 3, ['.##.', '####', '####', '.##.'],
      { '#': c.l, '.': -1 }, dep(iso, x, y, z + h, 2.2));
  }
}

export function hedge(cv, iso, C, st, x, y, z, w, d, h) {
  const g = st.pick([C.leaf, C.grass, C.green]);
  const F = topFace(iso, z + h, x, y);
  const seed = st.int(1, 9999);
  const FL = leftFace(iso, y + d, x, z);
  const FR = rightFace(iso, x + w, y, z);
  // A clipped hedge is a solid with a shadow under its own overhang: the lower
  // band of each side face takes the leaf's contour step, and the face carries
  // the same two-scale clumping the canopies do. Left flat it was a 40x30px
  // slab of one green.
  const side = (Fx, lit, mid) => (sxp, syp) => {
    const u = Fx.au * sxp + Fx.bu * syp + Fx.cu, v = Fx.av * sxp + Fx.bv * syp + Fx.cv;
    if (v < h * 0.24) return g.k;
    const k = h3(Math.floor(u / 1.1), Math.floor(v / 1.1), seed) & 7;
    return k < 5 ? mid : lit;
  };
  box(cv, iso, x, y, z, w, d, h, {
    top: (sxp, syp) => {
      const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
      const k = h3(Math.floor(u / 1.4), Math.floor(v / 1.4), seed) & 7;
      return k < 6 ? g.l : g.t;
    },
    left: side(FL, g.t, g.l), right: side(FR, g.l, g.r),
  });
}

export function bush(cv, iso, C, st, x, y, z) {
  const g = st.pick([C.leaf, C.grass, C.grass, C.green]);
  const rows = blob(st.int(5, 8), st.int(0, 7));
  const p = projR(iso, x, y, z);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    leafMap(C, g), dep(iso, x, y, z, 0.9));
}

export function flowerBed(cv, iso, C, st, x, y, z, w, d) {
  const g = st.pick([C.grass, C.grass]);
  const a = st.pick(C.accents), b = st.pick(C.accents);
  const seed = st.int(1, 9999);
  const F = topFace(iso, z, x, y);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    const k = h3(Math.floor(u / 1.1), Math.floor(v / 1.1), seed) & 15;
    if (k === 0) return a.t;
    if (k === 1) return b.t;
    return k < 9 ? g.l : g.t;
  });
}

export function grassPlot(cv, iso, C, st, x, y, z, w, d) {
  const g = st.pick([C.grass, C.grass]);
  const seed = st.int(1, 9999);
  const F = topFace(iso, z, x, y);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    // mown stripes: flat bands, structured, and never a uniform 16x16 field
    const band = (Math.floor(v / 2.4) & 1);
    const k = h3(Math.floor(u / 4), Math.floor(v / 4), seed) & 15;
    if (k === 0) return g.k;
    if (k === 1) return g.t;
    return band ? g.l : g.t;
  });
}

/**
 * SMALL is retained deliberately: a 1x-grown canopy is 12px and is the largest
 * thing that still fits in a window box or a roof planter. It is not used for
 * street trees, where a 12px blob is exactly the defect this file was rebuilt
 * to remove.
 */
export function potPlant(cv, iso, C, st, x, y, z) {
  const g = st.pick([C.leaf, C.grass, C.green]);
  const pot = st.pick([C.terra, C.brick, C.concrete]);
  box(cv, iso, x, y, z, 1.5, 1.5, 1.3, { top: pot.k, left: pot.l, right: pot.r });
  const rows = SMALL[st.int(0, SMALL.length - 1)];
  const p = projR(iso, x + 0.75, y + 0.75, z + 1.3);
  cv.blit(p[0] - (rows[0].length >> 1), p[1] - rows.length + 2, rows,
    leafMap(C, g), dep(iso, x, y, z + 1.3, 0.9));
}
