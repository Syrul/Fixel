import { dep } from '../view.js';
// Pedestrians. 10-13px tall, five to seven px wide — the scale the reference
// works at. Authored as slot tables: each character is a MATERIAL SLOT, not a
// colour, so one table produces thousands of distinct people once the slots are
// filled from the palette.
//
//   h hair/hat   s skin   t shirt   T shirt shadow   p trousers   P shoe
//   b bag/accent  . skip

const POSES = [
  // stand
  ['.hhh.', '.sss.', '.sss.', '..s..', 'TtttT', 'TtttT', '.ttt.', '.ppp.',
   '.p.p.', '.p.p.', '.P.P.'],
  // walk, arms swinging
  ['.hhh.', '.sss.', '.sss.', '..s..', 'sttt.', '.tttT', '.ttt.', '.ppp.',
   '.pp..', 'p..p.', 'P..P.'],
  // stride the other way
  ['.hhh.', '.sss.', '.sss.', '..s..', '.tttS', 'Tttt.', '.ttt.', '.ppp.',
   '..pp.', '.p..p', '.P..P'],
  // hat, hands in pockets
  ['.hhh.', 'hhhhh', '.sss.', '..s..', 'TtttT', '.ttt.', '.ttt.', '.ppp.',
   '.p.p.', '.p.p.', '.P.P.'],
  // carrying a bag
  ['.hhh.', '.sss.', '.sss.', '..s..', 'TtttT', 'sttts', '.ttt.', 'b.p.b',
   'b.p.b', '.p.p.', '.P.P.'],
  // long hair, standing talking
  ['.hhh.', 'hsssh', 'hsssh', '..s..', 'TtttT', 'TtttT', '.ttt.', '.ppp.',
   '.ppp.', '.p.p.', '.P.P.'],
  // child
  ['.hhh.', '.sss.', '..s..', 'Tttt.', '.ttt.', '.p.p.', '.P.P.'],
  // seated (bench, cafe)
  ['.hhh.', '.sss.', '.sss.', '..s..', 'Ttttt', '.tttp', '.pppp', '.p...',
   '.P...'],
];

/**
 * EVERY FIGURE CARRIES ITS OWN 1px KEYLINE.
 *
 * The pose tables above have no black in them, and pedestrians are tagged
 * no-outline precisely so the silhouette sweep does not eat a five-pixel
 * figure. Between the two, a crowd was a scatter of unoutlined colour blobs
 * lying flat on the pavement: nothing separated a person from the ground they
 * stood on, so eighty figures in a crop contributed eighty flat faces and NOT
 * ONE closed cell. It was also visibly wrong — in the reference every figure is
 * ringed, which is what lets a 12px person read as a person at 1:1.
 *
 * Dilating by the FOUR-neighbourhood is the cheap correct ring: any orthogonal
 * path out of the figure must cross it, so the interior is enclosed under the
 * 4-connectivity the closure metric uses, and it costs a perimeter rather than
 * a perimeter plus corners.
 */
function outlined(rows) {
  const h = rows.length, w = rows[0].length;
  const solid = (j, i) => j >= 0 && j < h && i >= 0 && i < w && rows[j][i] !== '.';
  const out = [];
  for (let j = -1; j <= h; j++) {
    let line = '';
    for (let i = -1; i <= w; i++) {
      if (solid(j, i)) { line += rows[j][i]; continue; }
      line += (solid(j - 1, i) || solid(j + 1, i) || solid(j, i - 1) || solid(j, i + 1)) ? 'o' : '.';
    }
    out.push(line);
  }
  return out;
}

const OUTLINED = POSES.map(outlined);

export function drawPerson(cv, iso, C, st, wx, wy, wz, opt) {
  const pi = opt && opt.pose !== undefined ? opt.pose : st.int(0, POSES.length - 1);
  const pose = OUTLINED[pi];
  // A crowd is not fourteen people repeated. Each figure mints its own shirt
  // and trousers off a family, which is where a large part of a reference
  // crop's several hundred distinct colours actually comes from: many small
  // objects each committing to a colour of their own, not one ramp sprayed
  // over everything. Five pixels of it, so the radius of gyration stays tiny.
  const own = C.ownColour === undefined ? 1 : C.ownColour;
  const mix = (f, dh, ds, dl) => (st.bool(own)
    ? C.mk(f._h + st.range(-dh, dh),
      Math.min(1, f._s * st.range(1 - ds, 1 + ds)),
      Math.min(0.97, f._L * st.range(1 - dl, 1 + dl)))
    : f);
  const shirt = mix(st.pick(C.accents), 18, 0.3, 0.18);
  const trous = st.bool(0.4) ? mix(st.pick(C.accents), 16, 0.3, 0.16)
    : mix(st.pick([C.steel, C.slate, C.wood, C.indigo, C.concrete]), 12, 0.4, 0.16);
  const bag = mix(st.pick(C.accents), 20, 0.3, 0.2);
  const map = {
    h: st.pick(C.hair), s: st.pick(C.skin),
    t: shirt.l, T: shirt.r, S: shirt.t,
    p: trous.r, P: st.bool(0.5) ? C.white.t : C.ink,
    b: bag.l, o: C.black, '.': -1,
  };
  const p = iso.proj(wx, wy, wz);
  cv.blit(p[0] - 3, p[1] - (pose.length - 2), pose, map, dep(iso, wx, wy, wz, 0.7));
}

/** A queue / cluster of people along a line — how crowds actually read. */
export function drawCrowd(cv, iso, C, st, x, y, z, dx, dy, n) {
  for (let i = 0; i < n; i++) {
    drawPerson(cv, iso, C, st,
      x + dx * i + st.range(-0.6, 0.6),
      y + dy * i + st.range(-0.6, 0.6), z);
  }
}
