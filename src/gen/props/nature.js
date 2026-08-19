// Planting. Canopies are authored blob tables rather than boxes: a cube tree
// reads as a crate, and the reference's trees are irregular masses with a hard
// dark edge on the shadow side.

import { drawSlab } from '../../core/iso.js';
import { box } from '../draw.js';
import { topFace } from '../faces.js';
import { h3 } from '../palette.js';

//  d dark leaf   m mid leaf   l light leaf   . skip
const CANOPY = [
  ['...ddddd....', '..ddmmmdd...', '.dmmlllmmdd.', 'dmmlllllmmdd',
   'dmlllllllmmd', 'dmmlllllmmmd', '.dmmmmmmmmd.', '..dddmmmdd..', '....dddd....'],
  ['....dddd...', '..ddmmmmdd.', '.dmmllmmmdd', 'dmmllllmmmd', 'dmmlllmmmmd',
   '.dmmmmmmmd.', '..ddmmmmd..', '...ddddd...'],
  ['..ddd..ddd..', '.dmmmddmmmd.', 'dmllmmmmllmd', 'dmlllmmlllmd', '.dmmmmmmmmd.',
   '..dmmmmmmd..', '...dddmmd...', '.....ddd....'],
  ['...ddd...', '..dmmmd..', '.dmlllmd.', 'dmllllmd.', '.dmmmmd..', '..dddd...'],
];

const FROND = [
  '..d........d..', '.dmd......dmd.', 'dmmld....dlmmd', '.dmmld..dlmmd.',
  '..dmmldmlmmd..', '...dmmlmlmd...', '....dmlllmd...', '...dmlllllmd..',
  '..dmllmlmllmd.', '.dmmld.d.dlmmd', 'dmmd.......dmmd',
];

export function tree(cv, iso, C, st, x, y, z, big) {
  const g = st.pick([C.leaf, C.grass, C.grass, C.green]);
  const th = big ? st.range(4.5, 8) : st.range(2.4, 4);
  const tr = st.pick([C.wood, C.terra, C.slate]);
  box(cv, iso, x, y, z, 0.8, 0.8, th, { top: tr.l, left: tr.l, right: tr.r });
  const rows = CANOPY[st.int(0, CANOPY.length - 1)];
  // The canopy's outer ring is BLACK, not a darker green. Foliage is the one
  // place in the scene whose silhouette is genuinely organic, so its keyline is
  // where the frame gets its non-dimetric, one-pixel-wide dark runs.
  const map = { d: C.black, m: g.l, l: g.t, '.': -1 };
  const p = iso.proj(x + 0.4, y + 0.4, z + th);
  const k = big ? 1 : 1;
  cv.blit(p[0] - ((rows[0].length * k) >> 1), p[1] - rows.length * k + 1, scale(rows, k), map,
    x + y + z + th + 1.2);
}

function scale(rows, k) {
  if (k === 1) return rows;
  const out = [];
  for (const r of rows) { let s = ''; for (const c of r) s += c.repeat(k); for (let i = 0; i < k; i++) out.push(s); }
  return out;
}

export function palm(cv, iso, C, st, x, y, z) {
  const h = st.range(11, 22);
  const tr = st.pick([C.sandy, C.wood, C.concrete]);
  const lean = st.range(-0.06, 0.06);
  const seg = Math.max(4, Math.round(h / 1.6));
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    box(cv, iso, x + lean * i * 1.2, y + lean * i * 0.5, z + t * h, 0.75, 0.75, h / seg + 0.1,
      { top: tr.l, left: i & 1 ? tr.l : tr.t, right: i & 1 ? tr.r : tr.d });
  }
  const g = st.pick([C.leaf, C.green, C.grass]);
  const map = { d: C.black, m: g.l, l: g.t, '.': -1 };
  const p = iso.proj(x + 0.4 + lean * seg * 1.2, y + 0.4 + lean * seg * 0.5, z + h);
  cv.blit(p[0] - 7, p[1] - 8, FROND, map, x + y + z + h + 2);
  if (st.bool(0.35)) {
    const c = st.pick([C.amber, C.orange, C.lime]);
    cv.blit(p[0] - 1, p[1] - 1, ['##', '##'], { '#': c.l }, x + y + z + h + 2.2);
  }
}

export function hedge(cv, iso, C, st, x, y, z, w, d, h) {
  const g = st.pick([C.leaf, C.grass, C.green]);
  const F = topFace(iso, z + h, x, y);
  const seed = st.int(1, 9999);
  box(cv, iso, x, y, z, w, d, h, {
    top: (sxp, syp) => {
      const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
      const k = h3(Math.floor(u / 2), Math.floor(v / 2), seed) & 7;
      return k < 6 ? g.l : g.t;
    },
    left: g.l, right: g.r,
  });
}

export function bush(cv, iso, C, st, x, y, z) {
  const g = st.pick([C.leaf, C.grass, C.grass, C.green]);
  const rows = CANOPY[3];
  const p = iso.proj(x, y, z);
  cv.blit(p[0] - 4, p[1] - 5, rows, { d: C.black, m: g.l, l: g.t, '.': -1 }, x + y + z + 0.9);
}

export function flowerBed(cv, iso, C, st, x, y, z, w, d) {
  const g = st.pick([C.grass, C.grass]);
  const a = st.pick(C.accents), b = st.pick(C.accents);
  const seed = st.int(1, 9999);
  const F = topFace(iso, z, x, y);
  drawSlab(cv, iso, x, y, z, w, d, (sxp, syp) => {
    const u = F.au * sxp + F.bu * syp + F.cu, v = F.av * sxp + F.bv * syp + F.cv;
    const k = h3(Math.floor(u / 1.6), Math.floor(v / 1.6), seed) & 15;
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
    const band = (Math.floor(v / 3.5) & 1);
    const k = h3(Math.floor(u / 6), Math.floor(v / 6), seed) & 15;
    if (k === 0) return g.d;
    if (k === 1) return g.t;
    return band ? g.l : g.t;
  });
}
