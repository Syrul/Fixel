// PLACEHOLDER — replaced wholesale by the desert builder.
// Renders bare terrain so the module graph resolves and the dispatcher can be
// verified before any biome content exists.

import { heightField } from '../world.js';
import { makeTerrain, drawTerrain } from '../terrain.js';

export function paintDesert(stage) {
  const { C, cv, iso, rng, X0, X1, Y0, Y1, seedN, tag } = stage;
  const st = rng.stream('desert');
  const spec = { desert: ['dune', 2.5, 2.0], shore: ['shore', 3.0, 1.2], highland: ['highland', 3.5, 3.2] }['desert'];
  const P = {
    dune: { seedN, wx: 0.82, wy: 0.57, period: 64, warp: 1.3, amp: 15, base: 0, sharp: 0.8 },
    shore: { seedN, nx: 0.72, ny: 0.69, slope: 0.035, rough: 9, base: 2, bar: { at: 22, h: 2, w: 16 } },
    highland: { seedN, amp: 46, base: 0, freq: 0.0072, warpAmp: 24 },
  }[spec[0]];
  const T = makeTerrain({ X0, Y0, X1, Y1, cell: spec[1], step: spec[2], height: heightField(spec[0], P), seaH: spec[0] === 'shore' ? 0 : undefined });
  const tags = new Map();
  const tagFor = (L, wet) => { const k = (wet ? 'w' : 'l') + L; let t = tags.get(k); if (!t) { t = tag(); tags.set(k, t); } return t; };
  drawTerrain(cv, iso, T, {
    top: (u, v, z) => z > 30 ? C.white.t : z > 16 ? C.stone.l : z > 4 ? C.sandy.t : C.grass.t,
    side: (u, v, p, ax) => ax === 1 ? C.stone.r : C.stone.d,
    water: () => C.aqua.t,
  }, { tagFor, ink: C.black });
  stage.terrain = T;
}
