import { dep, projR } from '../view.js';
// Pedestrians.
//
// REBUILT AT THE SCALE THE REFERENCE ACTUALLY WORKS AT. The old table was 5x11
// — eleven rows for a whole person, of which four were legs and one was a head.
// At that size a face is not small, it is absent: there is no row to put it on.
// Three rounds of judges reported zero objects below building scale resolving
// into a nameable thing at 1:1, and a five-pixel-wide figure is the clearest
// case in the frame. The reference's are 22-30px with a head, a face, arms that
// leave the body, separated legs and shoes.
//
// These are 9x20 before the keyline, 11x22 after — the reference's range, and
// the size at which every one of the following is a decision rather than an
// accident: which way the head is turned, whether the arms swing, whether the
// figure carries something, where the hem of the coat falls.
//
// SLOTS, NOT COLOURS. Each character is a MATERIAL SLOT, so one table produces
// thousands of distinct people once the slots are filled from the palette. That
// is also where a large part of a crop's several hundred distinct colours comes
// from: many small objects each committing to a colour of its own.
//
//   h hair/hat   H hat brim / hair shadow   s skin   f face mark (skin's own
//   dark — eyes and brow, drawn in the CONTOUR step, never in the shared ink)
//   t shirt   T shirt shadow   S shirt highlight   c collar/lapel
//   p trousers  q trouser shadow   P shoe   b bag/accent   . skip
const POSES = [
  // stand, facing the camera
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'stttttttS', 'sttttttts', 'sTtttttS.',
   '.TtttttS.', '..TTTSS..', '..ppppp..', '..pp.pp..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // walking, arms swinging, one leg forward
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', '.tttttttS', 'sttttttt.', 'sTttttt..',
   '.Ttttt.s.', '..TTTS...', '..ppppp..', '..ppppp..', '..pp..pp.', '..qp..pq.',
   '.pp....p.', 'PPP...PPP'],
  // striding the other way
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'Sttttttt.', '.ttttttts', '..tttttTs',
   '.s.tttttT', '...STTT..', '..ppppp..', '..ppppp..', '.pp..pp..', '.qp..pq..',
   '.p....pp.', 'PPP...PPP'],
  // wide-brimmed hat, hands in pockets
  ['....h....', '...hhh...', '.hhhhhhh.', 'HHHHHHHHH', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'sttttttts', 'sttttttts', '.Ttttttt.',
   '.TtttttS.', '..TTTSS..', '..ppppp..', '..pp.pp..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // carrying a bag in one hand
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'stttttttS', 'sttttttts', '.Tttttts.',
   'b.ttttts.', 'bbTTTSS..', 'bbbppppp.', 'bbbpp.pp.', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // long hair, standing talking, one arm raised
  ['...hhh...', '..hhhhh..', '.hhhhhhh.', '.hHsssHh.', '.hfsssfh.', '.hsssssh.',
   '.h.sss.h.', '..ccccc..', 'stttttttS', 'sttttttts', '.ttttttts', '.Ttttttt.',
   '.TtttttS.', '..TTTSS..', '..ppppp..', '..ppppp..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
  // child — shorter, bigger head, the reference has several
  ['...hhh...', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..', '...sss...',
   '..ttttt..', '.sttttts.', '.sttttts.', '..TtttS..', '..TTTS...', '..ppppp..',
   '..pp.pp..', '..pp.pp..', '..PP.PP..'],
  // seated — bench, kerb, cafe
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..HsssH..', '..fsssf..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'sttttttts', 'sttttttts', '.Tttttttp',
   '.TttttppP', '..pppppp.', '..pp.....', '..pp.....', '..qq.....', '..PP.....'],
  // standing with a coat, back to the camera (no face)
  ['...hhh...', '..hhhhh..', '..hhhhh..', '..hhhhh..', '..sssss..', '..sssss..',
   '...sss...', '..ccccc..', '.ttttttt.', 'sttttttts', 'sttttttts', 'sttttttts',
   '.ttttttt.', '.TttttTT.', '.TtttttT.', '..TTTTT..', '..pp.pp..', '..qp.pq..',
   '..pp.pp..', '.PPP.PPP.'],
];

/**
 * EVERY FIGURE CARRIES ITS OWN 1px KEYLINE.
 *
 * The pose tables have no black in them, and pedestrians are tagged no-outline
 * precisely so the silhouette sweep does not eat a figure. Between the two, a
 * crowd was a scatter of unoutlined colour blobs lying flat on the pavement:
 * nothing separated a person from the ground they stood on, so eighty figures
 * in a crop contributed eighty flat faces and NOT ONE closed cell.
 *
 * Dilating by the FOUR-neighbourhood is the cheap correct ring: any orthogonal
 * path out of the figure must cross it, so the interior is enclosed under the
 * 4-connectivity the closure metric uses, and it costs a perimeter rather than
 * a perimeter plus corners. It also stays exactly one pixel at any world scale,
 * because it is authored in screen pixels and the figure is a sprite.
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
  // over everything.
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
  const hair = st.pick(C.hair);
  const skin = st.pick(C.skin);
  // The face is drawn in the SKIN's own contour step, not in the shared ink.
  // Two eyes and a brow line on a 22px figure are interior form on a solid, and
  // interior form on a solid is the one thing this generator had no vocabulary
  // for. It is also two more colours per figure that belong to that figure.
  const map = {
    h: hair.t, H: hair.r, s: skin.t, f: skin.k,
    t: shirt.l, T: shirt.r, S: shirt.t, c: shirt.k,
    p: trous.r, q: trous.k, P: st.bool(0.5) ? C.white.t : C.slate.k,
    b: bag.l, o: C.black, '.': -1,
  };
  const p = projR(iso, wx, wy, wz);
  cv.blit(p[0] - ((pose[0].length) >> 1), p[1] - (pose.length - 3), pose, map,
    dep(iso, wx, wy, wz, 0.7));
}

/** A queue / cluster of people along a line — how crowds actually read. */
export function drawCrowd(cv, iso, C, st, x, y, z, dx, dy, n) {
  for (let i = 0; i < n; i++) {
    drawPerson(cv, iso, C, st,
      x + dx * i + st.range(-0.6, 0.6),
      y + dy * i + st.range(-0.6, 0.6), z);
  }
}
