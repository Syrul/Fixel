#!/usr/bin/env node
// LOOK AT THE LOOP. A still screenshot cannot tell you whether an animation is
// too much.
//
// Three outputs, and the second is the one that has repeatedly been the
// difference between a subtle animation and a cartoon:
//
//   .strip.png   every frame of the loop, side by side, at 1:1 or an integer
//                zoom. Read left to right: if you can see the thing move from
//                one frame to the next at 1:1, it is already too much.
//
//   .heat.png    WHERE the motion is. Every pixel that ever changes across the
//                loop, coloured by HOW MANY of the K frames it disagrees with
//                frame 0 on. Static picture, greyed to 25%. This is the honest
//                answer to "is the ground still?" and "is the motion in small
//                islands or one enormous area?", which is exactly the question
//                the references were measured on.
//
//   .diff.png    consecutive-frame difference, laid out as a strip. A pixel is
//                marked where frame k differs from frame k-1, INCLUDING the
//                wrap from the last frame back to the first — the seam a gate
//                at frame 0 cannot see. If the last panel is denser than the
//                others, the loop does not close and the viewer sees a restart.
//
// Usage:
//   node tools/strip.mjs --seed s --out out/look [--biome shore]
//                        [--w 440 --h 1000] [--x 120 --y 500 --size 160 --zoom 4]

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { renderScene } from '../src/gen/scene.js';
import { writePNG } from '../src/core/png.js';
import { FRAMES } from '../src/core/frame.js';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && !String(argv[i + 1]).startsWith('--') ? argv[i + 1] : (i >= 0 ? true : d); };

const seed = String(arg('seed', 'fixel-0'));
const out = String(arg('out', 'out/strip'));
const W = Number(arg('w', 440));
const H = Number(arg('h', 1000));
const K = Number(arg('frames', FRAMES));
const BIOME = arg('biome', undefined);
const ZOOM = Math.max(1, Number(arg('zoom', 1)));
const GAP = Number(arg('gap', 2));

const o = { w: W, h: H, frames: K };
if (BIOME && BIOME !== true) o.biome = BIOME;

const base = renderScene(seed, { ...o, frame: 0 });
const loop = base.anim;
const cols = base.pal.rgb;

// Every frame's index plane, rebuilt from the loop. Rebuilt rather than
// re-rendered on purpose: this tool must show what the PLAYER will show, not
// what the generator could show. `tools/animcheck.mjs` is where the two are
// asserted equal.
const planes = [];
for (let k = 0; k < K; k++) {
  const p = new Uint16Array(base.idx);
  for (let i = 0; i < loop.n; i++) p[loop.off[i]] = loop.val[k * loop.n + i];
  planes.push(p);
}

// ---- window -----------------------------------------------------------------
const size = Number(arg('size', 0));
const cx = Number(arg('x', 0)), cy = Number(arg('y', 0));
const win = size > 0
  ? { x: Math.max(0, Math.min(W - size, cx)), y: Math.max(0, Math.min(H - size, cy)), w: size, h: size }
  : { x: 0, y: 0, w: W, h: H };

function panel(plane, mark) {
  const b = Buffer.alloc(win.w * win.h * 4);
  for (let j = 0; j < win.h; j++) {
    for (let i = 0; i < win.w; i++) {
      const s = (win.y + j) * W + (win.x + i), d = (j * win.w + i) * 4;
      const c = cols[plane[s]] || [255, 0, 255];
      if (mark && mark[s]) { b[d] = 255; b[d + 1] = 40; b[d + 2] = 190; }
      else { b[d] = c[0]; b[d + 1] = c[1]; b[d + 2] = c[2]; }
      b[d + 3] = 255;
    }
  }
  return b;
}

/** Lay panels out left to right with a gap, at an integer zoom. */
function lay(panels) {
  const pw = win.w * ZOOM, ph = win.h * ZOOM;
  const tw = panels.length * pw + (panels.length - 1) * GAP;
  const buf = Buffer.alloc(tw * ph * 4, 0);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
  panels.forEach((p, n) => {
    const x0 = n * (pw + GAP);
    for (let j = 0; j < ph; j++) {
      const sj = (j / ZOOM) | 0;
      for (let i = 0; i < pw; i++) {
        const si = (i / ZOOM) | 0;
        const s = (sj * win.w + si) * 4, d = (j * tw + x0 + i) * 4;
        buf[d] = p[s]; buf[d + 1] = p[s + 1]; buf[d + 2] = p[s + 2]; buf[d + 3] = 255;
      }
    }
  });
  return { w: tw, h: ph, buf };
}

mkdirSync(path.dirname(out) || '.', { recursive: true });

const strip = lay(planes.map((p) => panel(p)));
writePNG(`${out}.strip.png`, strip.w, strip.h, strip.buf);

// ---- heat -------------------------------------------------------------------
// How many frames a pixel disagrees with frame 0 on. Never how far it moved —
// that is a different question and this tool would answer it wrongly.
const heatN = new Uint8Array(W * H);
for (let k = 1; k < K; k++) {
  const p = planes[k], b = planes[0];
  for (let i = 0; i < W * H; i++) if (p[i] !== b[i]) heatN[i]++;
}
{
  const b = Buffer.alloc(W * H * 4);
  let ever = 0;
  for (let i = 0; i < W * H; i++) {
    const c = cols[planes[0][i]] || [0, 0, 0];
    const d = i * 4;
    if (heatN[i]) {
      ever++;
      const t = heatN[i] / (K - 1);
      b[d] = 40 + 215 * t; b[d + 1] = 30 + 60 * (1 - t); b[d + 2] = 200 * (1 - t) + 30;
    } else {
      b[d] = 40 + c[0] * 0.25; b[d + 1] = 40 + c[1] * 0.25; b[d + 2] = 40 + c[2] * 0.25;
    }
    b[d + 3] = 255;
  }
  writePNG(`${out}.heat.png`, W, H, b);

  // Connected components of the "ever moved" mask, 4-connected. The size
  // distribution answers the question the references were measured on: is the
  // motion small isolated islands, or one enormous area?
  const seen = new Uint8Array(W * H);
  const sizes = [];
  const stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!heatN[i] || seen[i]) continue;
    let sp = 0, n = 0;
    stack[sp++] = i; seen[i] = 1;
    while (sp) {
      const q = stack[--sp]; n++;
      const x = q % W, y = (q / W) | 0;
      if (x > 0 && heatN[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[sp++] = q - 1; }
      if (x + 1 < W && heatN[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[sp++] = q + 1; }
      if (y > 0 && heatN[q - W] && !seen[q - W]) { seen[q - W] = 1; stack[sp++] = q - W; }
      if (y + 1 < H && heatN[q + W] && !seen[q + W]) { seen[q + W] = 1; stack[sp++] = q + W; }
    }
    sizes.push(n);
  }
  sizes.sort((a, b2) => b2 - a);
  const q = (p) => sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))] : 0;
  console.log(`seed=${seed} ${W}x${H} frames=${K}${o.biome ? ` biome=${o.biome}` : ''}`);
  console.log(`  ever moves      ${ever} px = ${(100 * ever / (W * H)).toFixed(2)}% of frame`);
  console.log(`  loop union      ${loop.n} px   dropped ${loop.dropped}   flat ${loop.flat}   shadowed ${loop.shadowed ?? 0}`);
  console.log(`  islands         ${sizes.length}   largest ${sizes[0] || 0}   p50 ${q(0.5)}   p90 ${q(0.9)}`);
}

// ---- consecutive-frame difference, including the wrap ------------------------
{
  const marks = [];
  const counts = [];
  for (let k = 0; k < K; k++) {
    const a = planes[(k + K - 1) % K], b = planes[k];
    const m = new Uint8Array(W * H);
    let n = 0;
    for (let i = 0; i < W * H; i++) if (a[i] !== b[i]) { m[i] = 1; n++; }
    marks.push(m); counts.push(n);
  }
  const d = lay(marks.map((m, k) => panel(planes[k], m)));
  writePNG(`${out}.diff.png`, d.w, d.h, d.buf);
  console.log(`  per-frame churn ${counts.map((c) => (100 * c / (W * H)).toFixed(2) + '%').join(' ')}`);
  const mx = Math.max(...counts), mn = Math.min(...counts);
  console.log(`  wrap step is panel 0: ${(100 * counts[0] / (W * H)).toFixed(2)}%  ` +
    `(even loop => all panels similar; range ${(100 * mn / (W * H)).toFixed(2)}-${(100 * mx / (W * H)).toFixed(2)}%)`);
  console.log(`  -> ${out}.strip.png  ${out}.heat.png  ${out}.diff.png`);
}
