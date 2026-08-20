// Fixel — the feed.
//
// One seed per post drives BOTH halves: the isometric scene and its chiptune.
// The same seed always produces the same post, and ?seed= restores one exactly.
// That pairing is the product; everything else here is plumbing to keep it
// smooth.

import { pickBiome } from '../gen/biome-mix.js';
import { pickConditions, conditionLabel } from '../gen/conditions.js';
import { FPS, frameAt } from '../core/frame.js';
import { paintFrame, dirtyBands, loopBytes } from '../core/anim.js';
// Vercel Analytics. Loaded once at startup and never touched again — it runs
// outside the rAF, so the "a still post schedules no frame" property holds.
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

inject({ mode: import.meta.env.PROD ? 'production' : 'development' });
injectSpeedInsights();

const FEED = document.getElementById('feed');
const HUD = document.getElementById('hud');
const START = document.getElementById('start');

// ---- seeds -----------------------------------------------------------------
// The URL seed IS post 0. Later posts derive from it by a fixed integer walk,
// so a link reproduces not just one picture but the run that follows it.
const url = new URL(location.href);

const BASE = (Number(url.searchParams.get('seed')) || Math.floor(Math.random() * 2 ** 31)) >>> 0;

function mix32(x) {
  x = x >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

// THE FEED CHOOSES WHICH SEEDS TO SHOW; IT NEVER CHOOSES WHAT A SEED IS.
//
// Biome identity dominates first impression, so two consecutive landscapes read
// as a repeat even when every other thing about them differs. Measured on the
// raw walk: 26.8% of consecutive posts landed in the same biome, which is
// exactly what the weights predict by chance and is far too often to scroll
// past.
//
// The fix must not be "make post i's biome depend on post i-1". A post's seed
// is its identity — `?seed=N` has to restore that exact post and a link copied
// from post 7 has to open on the picture it was copied from — so nothing about
// a post's CONTENT may depend on its position in a scroll. Any adjacency rule
// applied to the biome breaks that immediately.
//
// So the seed is REDRAWN instead: salt the walk and re-hash until the seed's
// own biome differs from its predecessor's. The biome stays a pure function of
// the seed, the post stays a pure function of its seed, and the only thing the
// feed decides is which of the four billion available posts to put next. It is
// the same move `tools/duel.mjs` makes to find a city post — redraw the seed,
// never force the content — and for the same reason.
const SEEDS = [BASE];
function seedAt(i) {
  for (let k = SEEDS.length; k <= i; k++) {
    const prev = pickBiome(String(SEEDS[k - 1]));
    let chosen = mix32(BASE + Math.imul(k, 0x9e3779b9));
    for (let salt = 0; salt < 16; salt++) {
      const cand = mix32(BASE + Math.imul(k, 0x9e3779b9) + Math.imul(salt, 0x85ebca6b));
      if (pickBiome(String(cand)) !== prev) { chosen = cand; break; }
    }
    SEEDS[k] = chosen;
  }
  return SEEDS[i];
}

// ---- frame size ------------------------------------------------------------
// Phone-shaped, and sized in CSS pixels so the browser's own device-pixel
// upscale is an integer nearest-neighbour blow-up of native generator pixels.
// Nothing is ever resampled: `image-rendering:pixelated` plus an integer DPR is
// the only enlargement in the path. 1600x1100 is not baked in anywhere — the
// generator takes w/h as parameters and round 4 kept view scale separate.
function frameSize() {
  // A VIEWPORT OF ZERO MUST NOT REACH THE GENERATOR, and it used to.
  //
  // This runs at module evaluation. A browser that has not laid the page out
  // yet reports `innerWidth` as 0 — a background tab, a prerender, a restored
  // session — and the old arithmetic then produced `{ w: 0, h: NaN }`. Both are
  // falsy, so `makeStage`'s `opts.w || 1600` fell through to the generator's
  // DESKTOP default and every post rendered at 1600x1100.
  //
  // Measured when it fired: 7,040,000 bytes of RGBA per post against the
  // 1,218,000 a phone frame costs, four materialised posts at 28 MB instead of
  // 4.9 MB, and four times the render time — with the phone shape, which is the
  // whole product, silently gone. Nothing failed and nothing warned.
  //
  // So an unmeasurable viewport falls back to a PHONE, not to a desktop canvas.
  // The resize listener corrects `FRAME` as soon as a real size arrives; posts
  // already built keep the fallback, which is the right shape and the right
  // order of magnitude even when it is not the exact size.
  const iw = Math.round(window.innerWidth) || 390;
  const ih = Math.round(window.innerHeight) || 844;
  const w = Math.min(iw, 460);
  const h = Math.round(w * (ih / iw));
  return { w, h: Math.min(h, 1000) };
}
let FRAME = frameSize();

// ---- workers ---------------------------------------------------------------
const sceneW = new Worker(new URL('./scene.worker.js', import.meta.url), { type: 'module' });
const audioW = new Worker(new URL('./audio.worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let reqId = 0;

function ask(worker, msg) {
  return new Promise((res) => { const id = ++reqId; pending.set(id, res); worker.postMessage({ ...msg, id }); });
}
for (const w of [sceneW, audioW]) {
  w.onmessage = (e) => { const r = pending.get(e.data.id); if (r) { pending.delete(e.data.id); r(e.data); } };
}

// ---- audio -----------------------------------------------------------------
let ac = null, curSrc = null, curGain = null;
const XFADE = 0.18;   // seconds

// A post boundary is a CROSSFADE, not a hard cut and not silence. A hard cut
// pops — these are square/triangle voices at full amplitude, so a discontinuity
// is audible as a click — and silence between posts makes a fast scroll feel
// broken. 180ms is long enough to mask the discontinuity and short enough that
// the new track's downbeat still lands with the new picture.
function playBuffer(mix, sampleRate) {
  if (!ac) return;
  const buf = ac.createBuffer(1, mix.length, sampleRate);
  buf.copyToChannel(mix, 0);
  const g = ac.createGain();
  const src = ac.createBufferSource();
  src.buffer = buf;
  // Loop the whole post. The composer writes ~42 bars with real sections, so
  // returning to bar 0 is a musical repeat rather than a stitch.
  src.loop = true;
  src.connect(g).connect(ac.destination);
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + XFADE);
  src.start();
  if (curSrc) {
    const old = curSrc, og = curGain;
    og.gain.cancelScheduledValues(t);
    og.gain.setValueAtTime(og.gain.value, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + XFADE);
    setTimeout(() => { try { old.stop(); old.disconnect(); } catch {} }, (XFADE + 0.1) * 1000);
  }
  curSrc = src; curGain = g;
}

// ---- posts -----------------------------------------------------------------
const posts = [];          // {i, seed, el, canvas, scene, audio, state}
const WINDOW = 3;          // how many posts either side stay materialised
let active = -1;

function makePost(i) {
  const el = document.createElement('div');
  el.className = 'post';
  el.dataset.i = String(i);
  const ph = document.createElement('div');
  ph.className = 'ph';
  ph.textContent = 'GENERATING';
  el.appendChild(ph);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `<div class="seed">#${seedAt(i)}</div><div class="sub">&nbsp;</div>`;
  el.appendChild(meta);
  const rail = document.createElement('div');
  rail.className = 'rail';
  rail.innerHTML = `<button title="copy link">&#128279;</button><button title="mute">&#9834;</button>`;
  rail.children[0].onclick = () => {
    const u = new URL(location.href); u.searchParams.set('seed', String(seedAt(i)));
    navigator.clipboard?.writeText(u.toString());
    HUD.textContent = 'LINK COPIED'; setTimeout(() => (HUD.textContent = 'FIXEL'), 1200);
  };
  rail.children[1].onclick = () => {
    if (!ac) return;
    if (ac.state === 'running') { ac.suspend(); rail.children[1].style.opacity = '.3'; }
    else { ac.resume(); rail.children[1].style.opacity = '.8'; }
  };
  el.appendChild(rail);
  const p = {
    i, seed: seedAt(i), el, ph, meta, canvas: null, scene: null, audio: null, gen: false,
    // player state; see "the player" below. A still post carries these as nulls
    // and never allocates any of them.
    ctx: null, img: null, pal3: null, loop: null, bands: null,
    k: 0, rate: 1, cost: null, ci: 0, why: null,
  };
  posts[i] = p;
  FEED.appendChild(el);
  return p;
}

async function generate(p) {
  if (p.gen) return; p.gen = true;
  const s = await ask(sceneW, { seed: String(p.seed), w: FRAME.w, h: FRAME.h });
  // METADATA ONLY. `s` holds four transferred ArrayBuffers and the largest is
  // the 1.76 MB RGBA base; retaining the whole message pinned all of them for
  // the life of the post, and nothing ever read them back. A still post now
  // retains no pixel bytes of its own at all — only the canvas's own backing
  // store, which is the same one post as before this file learned to animate.
  p.scene = { w: s.w, h: s.h, ms: s.ms, n: s.n, frames: s.frames, dropped: s.dropped, flat: s.flat, shadowed: s.shadowed };
  const img = new ImageData(new Uint8ClampedArray(s.buf), s.w, s.h);
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const ctx = c.getContext('2d');
  ctx.putImageData(img, 0, 0);
  p.canvas = c;
  p.ctx = ctx;
  p.ph.remove();
  p.el.insertBefore(c, p.el.firstChild);

  // THE LOOP, IF THERE IS ONE. Every typed array here is a VIEW over a buffer
  // the worker transferred — `new Uint32Array(someArrayBuffer)` does not copy —
  // so the loop costs exactly the bytes the worker sent and not a byte more.
  if (s.n > 0) {
    p.loop = { frames: s.frames, w: s.w, h: s.h, n: s.n, off: new Uint32Array(s.off), val: new Uint16Array(s.val) };
    p.pal3 = new Uint8Array(s.pal);
    p.bands = dirtyBands(p.loop);
    // THE RETAINED ImageData, and why it is retained rather than re-derived.
    //
    // The player has to write RGBA somewhere before handing it to the canvas.
    // The two alternatives both cost more than holding this one:
    // `ctx.getImageData` per frame is a READBACK from the canvas's backing
    // store, which is the expensive direction across that boundary and is
    // measured at ~40x the cost of the paint it would serve; rebuilding from
    // the index plane means 440,000 palette lookups to change ~20,000 pixels.
    // This buffer already exists — it arrived from the worker — so retaining it
    // costs nothing that was not already paid, and it is the only per-post cost
    // an ANIMATED post carries that a still one does not.
    p.img = img;
    p.k = 0; p.rate = 1; p.cost = new Float64Array(BUDGET_N); p.ci = 0;
    ANIM.animated++; ANIM.bytes += loopBytes(p.loop) + img.data.byteLength + p.pal3.byteLength;
  }
  if (p.i === active) armPlayer();
  // THE CONDITIONS ARE RESOLVED ONCE, HERE, AND THE SAME OBJECT IS USED THREE
  // TIMES: the audio is composed for it, the caption is written from it, and
  // the scene worker derives its own from the same pure function of the same
  // seed. The invariant that matters is that the audio and the picture can
  // never disagree about the weather, and the cheapest way to break it is two
  // resolutions of one seed drifting apart. This call used to happen AFTER the
  // audio was composed, which is how the music came to be the only part of a
  // post that did not know it was raining.
  const cnd = pickConditions(String(p.seed));
  // Audio second: the picture is what the eye lands on, and a scene that is
  // ready 250ms before its track is far better than the reverse.
  const a = await ask(audioW, { seed: String(p.seed), seconds: 48, cond: cnd });
  p.audio = a;
  // The condition is captioned only when it is not the reference one, so a
  // plain clear day reads exactly as it did before conditions existed and the
  // label means "something is going on here" rather than being furniture.
  p.meta.querySelector('.sub').textContent =
    `${cnd.biome}${cnd.reference ? '' : ' · ' + conditionLabel(cnd)}` +
    ` · ${a.bpm} BPM · ${a.key} · ${s.w}×${s.h}`;
  if (active === p.i && ac) playBuffer(new Float32Array(a.mix), a.sampleRate);
}

function setActive(i) {
  if (i === active) return;
  park(posts[active]);          // the post being left goes back to frame 0
  active = i;
  armPlayer();
  const u = new URL(location.href);
  u.searchParams.set('seed', String(seedAt(i)));
  history.replaceState(null, '', u);
  const p = posts[i];
  if (p?.audio && ac) playBuffer(new Float32Array(p.audio.mix), p.audio.sampleRate);
  // Prefetch ahead so the next post is finished before it is reached.
  for (let k = i; k <= i + WINDOW; k++) { if (!posts[k]) makePost(k); generate(posts[k]); }
  // Release pixels far behind. The Float32Array of a 48s track is ~8.5MB, so a
  // long scroll would otherwise grow without bound.
  for (let k = 0; k < i - WINDOW; k++) {
    const q = posts[k];
    if (q && q.canvas) {
      q.canvas.remove(); q.canvas = null; q.scene = null; q.audio = null; q.gen = false;
      // The loop and its paint target go with the pixels. Without this the feed
      // would leak the one thing animation added, which is the whole reason the
      // release path exists at all.
      if (q.loop) ANIM.bytes -= loopBytes(q.loop) + q.img.data.byteLength + q.pal3.byteLength, ANIM.animated--;
      q.ctx = null; q.img = null; q.pal3 = null; q.loop = null; q.bands = null;
      q.k = 0; q.rate = 1; q.cost = null; q.ci = 0; q.why = null;
      const ph = document.createElement('div'); ph.className = 'ph'; ph.textContent = '';
      q.ph = ph; q.el.insertBefore(ph, q.el.firstChild);
    }
  }
}

// ---- the player ------------------------------------------------------------
//
// IF ANIMATION WOULD MAKE THE SCROLL WORSE, THE SCROLL WINS. Everything in this
// block follows from that one sentence.
//
// ONE POST MOVES: the active one, the one `setActive` names. Every other post
// holds frame 0. This is not an optimisation to be relaxed later — a feed with
// four moving pictures in it is a different product, and a worse one, because
// the eye has nowhere to rest. The cost argument agrees with the taste argument
// but is not the reason.
//
// ONE rAF FOR THE PAGE, not one per post, and it is not even running unless the
// active post actually has a loop. A feed of stills — which is every feed today,
// because no shader records yet — schedules no callback at all, so the still
// path costs exactly zero per tick rather than a cheap something.
//
// THE CLOCK TOUCHES EXACTLY ONE LINE. `frameAt` converts `performance.now()`
// into an integer and nothing downstream of it ever sees the float; that is the
// law in `src/core/frame.js` and this is the app-layer end of it. Because `k` is
// derived from an ABSOLUTE time rather than accumulated, there is no state to
// catch up: a tab hidden for a minute resumes on whatever frame the wall clock
// says, in one paint, with no loop to run down.
//
// AND WHEN `k` HAS NOT MOVED, NOTHING HAPPENS. At 8 fps on a 120 Hz display
// that is 15 of every 16 callbacks costing one integer compare and a `return` —
// no paint, no upload, no allocation, no counter.

/** Median paint cost above which a post's animation is cut back. Measured
 *  paints are 0.04-0.13 ms at 440x1000, so this is 15-50x headroom: it can only
 *  fire on a pathological loop or a machine in trouble, and in both of those
 *  cases the scroll is what we are protecting. */
const BUDGET_MS = 2.0;
const BUDGET_N = 16;          // paints per guard window

// A read-only diagnostic surface, so the memory and cost claims made for this
// change are checkable from a console instead of taken on trust. It is written
// on generate, release and back-off — never in the per-tick hot path.
const ANIM = { animated: 0, bytes: 0, paints: 0, lastMs: 0, notes: [] };
window.FIXEL_ANIM = ANIM;

let rafId = 0;
let aboutOpen = false;

/** Start or stop the single page-wide rAF, whichever the current state wants. */
function armPlayer() {
  const p = posts[active];
  // The about page stops the animation as well. It covers the whole screen, so
  // a post that kept moving behind it would be work nobody can see — and the
  // still-post-costs-zero property is the reason the rAF is armed at all.
  const want = !document.hidden && !aboutOpen && !!(p && p.loop);
  if (want && !rafId) {
    p.k = -1;                 // force one paint at the frame the clock names
    rafId = requestAnimationFrame(tick);
  } else if (!want && rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function tick() {
  rafId = requestAnimationFrame(tick);
  const p = posts[active];
  if (!p || !p.loop) return;
  const k = frameAt(performance.now() / 1000 * p.rate);
  if (k === p.k) return;      // the common case, and it costs one compare
  paint(p, k);
}

// DIRTY BANDS, ALWAYS — measured, not assumed. At 440x1000 with 22,000 animated
// pixels, holding everything but the row coverage fixed (900 samples per point,
// three interleaved blocks so drift cannot favour either side):
//
//   coverage   full putImageData   per-band   speedup
//      10%          0.0971 ms      0.0397 ms    2.45x
//      25%          0.0951         0.0494       1.92x
//      40%          0.0942         0.0577       1.63x
//      55%          0.0933         0.0657       1.42x
//      70%          0.0928         0.0753       1.23x
//      85%          0.0940         0.0848       1.11x
//      95%          0.0927         0.0902       1.03x
//     100%          0.0938         0.0936       1.00x
//
// The curve is monotone and never crosses: bands win by 2.45x when the motion
// is contained in a quarter of the frame and converge to a dead heat when it is
// everywhere. There is no coverage at which the full upload is faster, so there
// is no threshold to tune and no second path to keep alive. A first run made
// bands look 9% SLOWER at full coverage; interleaving the two variants showed
// that was drift between runs, not an effect. Do not assume — and do not trust
// a single non-interleaved A/B either.
//
// THEN THE REAL GENERATOR LANDED AND THE CURVE WAS CHECKED AGAINST IT. Shore
// seed 3, 440x1000, K=8, tree 83b86b218c799903 — a REAL water loop of 4,065 px
// (0.924% of the frame) in one band covering 447 rows (44.7%), 1,200 samples
// per variant in four interleaved blocks:
//
//   full putImageData   mean 0.1351 ms   median 0.1   p95 0.2
//   dirty bands         mean 0.0807 ms   median 0.1   p95 0.2      1.67x
//   paintFrame alone    mean 0.0065 ms
//
// The synthetic curve predicted ~1.58x at 44.7% coverage and the real loop
// measured 1.67x, so the model held. Note the third line: resolving the palette
// costs 5% of the frame and the UPLOAD IS THE WHOLE COST. That is why the only
// lever that matters here is how few rows are handed to `putImageData`, and why
// making `paintFrame` faster would buy nothing.
function paint(p, k) {
  p.k = k;
  const t0 = performance.now();
  paintFrame(p.img.data, p.pal3, p.loop, k);
  const b = p.bands;
  if (b && b.length) for (let i = 0; i < b.length; i++) p.ctx.putImageData(p.img, 0, 0, b[i][0], b[i][1], b[i][2], b[i][3]);
  else p.ctx.putImageData(p.img, 0, 0);
  guard(p, performance.now() - t0);
}

/** Return a post to frame 0 and leave it there. */
function park(p) {
  if (p && p.loop && p.img && p.k !== 0) paint(p, 0);
}

// THE BUDGET GUARD. `performance.now()` around the paint is SCHEDULING, not
// animation — the same split `src/core/frame.js` draws, and the reason it is
// allowed here when it is banned three lines away: this clock decides whether
// to paint, never what to paint.
//
// A running median over a window of 16, not a mean and not a single sample: one
// slow paint is a GC pause or a scroll landing on the same frame, and backing
// off on it would be backing off on noise. Two steps, and the second is final —
// halve the rate, then stop that post and say so.
function guard(p, ms) {
  ANIM.paints++; ANIM.lastMs = ms;
  const s = p.cost;
  s[p.ci++ % BUDGET_N] = ms;
  if (p.ci % BUDGET_N) return;                 // only judge on a full window
  const m = s.slice().sort((a, b) => a - b)[BUDGET_N >> 1];
  if (m <= BUDGET_MS) return;
  if (p.rate === 1) {
    p.rate = 0.5;
    p.why = `post ${p.i}: median paint ${m.toFixed(2)}ms > ${BUDGET_MS}ms — halved to ${FPS / 2}fps`;
  } else {
    p.why = `post ${p.i}: median paint ${m.toFixed(2)}ms at half rate — animation stopped, held on frame 0`;
    paintFrame(p.img.data, p.pal3, p.loop, 0);
    p.ctx.putImageData(p.img, 0, 0);
    ANIM.bytes -= loopBytes(p.loop) + p.img.data.byteLength + p.pal3.byteLength;
    ANIM.animated--;
    p.loop = null; p.img = null; p.pal3 = null; p.bands = null; p.k = 0;
    armPlayer();
  }
  ANIM.notes.push(p.why);
  console.warn('[fixel/anim]', p.why);
}

// Hidden tabs paint nothing. rAF is throttled by the browser anyway, but
// "throttled" is a policy and this is a guarantee. Coming back is one call
// because the frame is a function of absolute time: no accumulator to advance,
// no catch-up, no burst of skipped frames.
document.addEventListener('visibilitychange', armPlayer);

const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(Number(e.target.dataset.i));
}, { threshold: [0.6] });

function grow() {
  const need = active + WINDOW + 1;
  for (let k = posts.length; k <= need; k++) { const p = makePost(k); io.observe(p.el); generate(p); }
}
FEED.addEventListener('scroll', () => { grow(); }, { passive: true });

// ---- boot ------------------------------------------------------------------
for (let k = 0; k <= WINDOW; k++) { const p = makePost(k); io.observe(p.el); }
generate(posts[0]);
setActive(0);

document.getElementById('go').onclick = () => {
  // Audio needs a user gesture; this is that gesture, explicitly, rather than
  // autoplay-and-hope.
  //
  // The overlay comes down FIRST and unconditionally. An earlier version
  // awaited ac.resume() before removing it, and on a machine with no audio
  // device that promise never settles — which left the entire feed stuck
  // behind the splash screen with no way past it. The picture must never be
  // hostage to the sound.
  START.remove();
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.resume().then(() => {
      const p = posts[active];
      if (p?.audio) playBuffer(new Float32Array(p.audio.mix), p.audio.sampleRate);
    }).catch(() => {});
  } catch {
    ac = null;   // no audio device: the feed still scrolls, silently
  }
};

addEventListener('resize', () => { FRAME = frameSize(); }, { passive: true });

// ---- about ------------------------------------------------------------------
// A static panel, shown and hidden with one class. It schedules no rAF, reads no
// clock and touches neither the URL nor the seed walk — `?seed=N` round-trips
// exactly as it did before this panel existed. The feed keeps its scroll
// position because nothing unmounts it; the panel simply covers it.
{
  const panel = document.getElementById('about');
  const show = (on) => {
    aboutOpen = on;
    panel.classList.toggle('on', on);
    // The feed must not scroll under the panel on a phone, where a drag that
    // starts on the panel would otherwise chain to the list behind it.
    document.getElementById('feed').style.visibility = on ? 'hidden' : '';
    if (on) panel.scrollTop = 0;
    armPlayer();
  };
  document.getElementById('aboutBtn').onclick = () => show(true);
  document.getElementById('aboutClose').onclick = () => show(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && aboutOpen) show(false); });
}
