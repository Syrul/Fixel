// Fixel — the feed.
//
// One seed per post drives BOTH halves: the isometric scene and its chiptune.
// The same seed always produces the same post, and ?seed= restores one exactly.
// That pairing is the product; everything else here is plumbing to keep it
// smooth.

import { pickBiome } from '../gen/biome-mix.js';

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
  const w = Math.min(Math.round(window.innerWidth), 460);
  const h = Math.round(w * (window.innerHeight / window.innerWidth));
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
  const p = { i, seed: seedAt(i), el, ph, meta, canvas: null, scene: null, audio: null, gen: false };
  posts[i] = p;
  FEED.appendChild(el);
  return p;
}

async function generate(p) {
  if (p.gen) return; p.gen = true;
  const s = await ask(sceneW, { seed: String(p.seed), w: FRAME.w, h: FRAME.h });
  p.scene = s;
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.buf), s.w, s.h), 0, 0);
  p.canvas = c;
  p.ph.remove();
  p.el.insertBefore(c, p.el.firstChild);
  // Audio second: the picture is what the eye lands on, and a scene that is
  // ready 250ms before its track is far better than the reverse.
  const a = await ask(audioW, { seed: String(p.seed), seconds: 48 });
  p.audio = a;
  p.meta.querySelector('.sub').textContent = `${pickBiome(String(p.seed))} · ${a.bpm} BPM · ${a.key} · ${s.w}×${s.h}`;
  if (active === p.i && ac) playBuffer(new Float32Array(a.mix), a.sampleRate);
}

function setActive(i) {
  if (i === active) return;
  active = i;
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
      const ph = document.createElement('div'); ph.className = 'ph'; ph.textContent = '';
      q.ph = ph; q.el.insertBefore(ph, q.el.firstChild);
    }
  }
}

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
