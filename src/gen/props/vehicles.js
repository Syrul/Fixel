// Traffic. Everything is a stack of boxes so it takes the depth buffer and
// occludes correctly against kerbs, poles and people. A car is 8x4 world units
// => 24px long, a bus 17x5 => 44px, which is the reference's range.

import { box as box3 } from '../draw.js';
import { leftFace, rightFace } from '../faces.js';

// axis 0: length runs along +x. axis 1: length runs along +y.
function box(cv, iso, ax, x, y, z, L, W, H, mat, tag) {
  if (ax === 0) box3(cv, iso, x, y, z, L, W, H, mat, tag);
  else box3(cv, iso, x, y, z, W, L, H, mat, tag);
}

function stripeShade(F, base, band, y0, y1) {
  const { au, cu, av, bv, cv } = F;
  return (sx, sy) => {
    const v = av * sx + bv * sy + cv;
    return (v >= y0 && v < y1) ? band : base;
  };
}

export function drawVehicle(cv, iso, C, st, x, y, z, ax, kind) {
  const dark = C.slate.d;   // a dark grey, not black: a black slab this long
                            // would blow the 1px dark-run budget on its own
  const glassC = st.pick([C.glass, C.aqua, C.steel]);
  const body = st.weighted([
    [st.pick(C.accents), 5], [C.white, 4], [C.concrete, 2],
    [C.slate, 2], [C.steel, 2],
  ]);

  if (kind === 'bike') {
    box(cv, iso, ax, x, y + 0.6, z, 3.4, 0.5, 0.4, { top: dark, left: dark, right: dark });
    box(cv, iso, ax, x + 1.2, y + 0.4, z + 0.4, 0.6, 0.9, 1.2, { top: body.t, left: body.l, right: body.r });
    return;
  }
  if (kind === 'moto') {
    box(cv, iso, ax, x, y + 0.4, z, 4, 1.2, 0.9, { top: dark, left: dark, right: dark });
    box(cv, iso, ax, x + 1, y + 0.3, z + 0.9, 2, 1.4, 0.7, { top: body.t, left: body.l, right: body.r });
    return;
  }

  const spec = {
    car: [8, 4, 1.5, 2.4, 3.4, 1.3],
    taxi: [8.5, 4, 1.5, 2.4, 3.6, 1.4],
    pickup: [9.5, 4.2, 1.7, 1.6, 3.0, 1.5],
    van: [11, 4.4, 1.6, 1.2, 7.0, 2.2],
    truck: [14, 5, 1.8, 0.8, 4.0, 2.6],
    bus: [17, 5, 1.4, 0.6, 15.6, 2.8],
  }[kind] || [8, 4, 1.5, 2.4, 3.4, 1.3];
  const [L, W, H, cf, cl, ch] = spec;

  // wheels: two dark blocks tucked under, the shadow line that sells contact
  box(cv, iso, ax, x + 0.6, y + 0.15, z, L - 1.2, W - 0.3, 0.55,
    { top: null, left: dark, right: dark });
  // body
  const bodyMat = { top: body.t, left: body.l, right: body.r };
  box(cv, iso, ax, x, y, z + 0.45, L, W, H, bodyMat);
  // cabin / box
  const cz = z + 0.45 + H;
  if (kind === 'truck') {
    box(cv, iso, ax, x + 0.4, y + 0.2, cz, 4.0, W - 0.4, ch,
      { top: body.t, left: glassC.l, right: glassC.r });
    const cargo = st.pick(C.accents);
    box(cv, iso, ax, x + 5.0, y + 0.1, cz - 0.2, L - 5.4, W - 0.2, ch + 0.6,
      { top: cargo.t, left: cargo.l, right: cargo.r });
  } else if (kind === 'bus') {
    const FL = ax === 0 ? leftFace(iso, y + W - 0.2, x, cz) : leftFace(iso, y + cl, x, cz);
    const FR = ax === 0 ? rightFace(iso, x + cf + cl, y, cz) : rightFace(iso, x + W - 0.2, y, cz);
    const sl = stripeShade(FL, body.l, glassC.l, 0.8, 2.1);
    const sr = stripeShade(FR, body.r, glassC.r, 0.8, 2.1);
    box(cv, iso, ax, x + cf, y + 0.1, cz - 0.2, cl, W - 0.2, ch,
      { top: body.t, left: sl, right: sr });
  } else {
    box(cv, iso, ax, x + cf, y + 0.35, cz, cl, W - 0.7, ch,
      { top: body.t, left: glassC.l, right: glassC.r });
    if (kind === 'taxi') {
      box(cv, iso, ax, x + cf + cl * 0.35, y + W * 0.35, cz + ch, 1.4, 1.2, 0.5,
        { top: C.yellow.t, left: C.yellow.l, right: C.yellow.r });
    }
  }
  // 1px black waist line: the panel seam that makes a flat body read as a body
  {
    const yb = z + 0.45 + H;
    const q0 = ax === 0 ? iso.proj(x, y + W, yb) : iso.proj(x, y + L, yb);
    const q1 = ax === 0 ? iso.proj(x + L, y + W, yb) : iso.proj(x + W, y + L, yb);
    cv.line(Math.round(q0[0]), Math.round(q0[1]), Math.round(q1[0]), Math.round(q1[1]),
      C.black, x + y + z + W + 2.2);
  }
  // lamps
  const lamp = { top: C.amber.t, left: C.amber.t, right: C.amber.l };
  box(cv, iso, ax, x + L - 0.35, y + 0.4, z + 1.2, 0.35, 0.9, 0.5, lamp);
  box(cv, iso, ax, x + L - 0.35, y + W - 1.3, z + 1.2, 0.35, 0.9, 0.5, lamp);
  const tail = { top: C.red.l, left: C.red.l, right: C.red.r };
  box(cv, iso, ax, x, y + 0.4, z + 1.2, 0.3, 0.9, 0.45, tail);
  box(cv, iso, ax, x, y + W - 1.3, z + 1.2, 0.3, 0.9, 0.45, tail);
}
