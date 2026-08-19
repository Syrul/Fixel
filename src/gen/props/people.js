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

export function drawPerson(cv, iso, C, st, wx, wy, wz, opt) {
  const pose = POSES[opt && opt.pose !== undefined ? opt.pose : st.int(0, POSES.length - 1)];
  const shirt = st.pick(C.accents);
  const trous = st.bool(0.4) ? st.pick(C.accents) : st.pick([C.steel, C.slate, C.wood, C.indigo, C.concrete]);
  const bag = st.pick(C.accents);
  const map = {
    h: st.pick(C.hair), s: st.pick(C.skin),
    t: shirt.l, T: shirt.r, S: shirt.t,
    p: trous.r, P: st.bool(0.5) ? C.white.t : C.ink,
    b: bag.l, '.': -1,
  };
  const p = iso.proj(wx, wy, wz);
  cv.blit(p[0] - 2, p[1] - (pose.length - 1), pose, map, wx + wy + wz + 0.7);
}

/** A queue / cluster of people along a line — how crowds actually read. */
export function drawCrowd(cv, iso, C, st, x, y, z, dx, dy, n) {
  for (let i = 0; i < n; i++) {
    drawPerson(cv, iso, C, st,
      x + dx * i + st.range(-0.6, 0.6),
      y + dy * i + st.range(-0.6, 0.6), z);
  }
}
