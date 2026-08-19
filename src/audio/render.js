// src/audio/render.js — Song -> audio.
//
// Renders per-channel SOLO STEMS first and the mix as their sum, never the
// other way round. docs/BAR.md records why this had to be a design requirement
// rather than an afterthought: duty cycle is recoverable from an isolated voice
// at MSE 0.0004 and returns 47.5% nonsense from a polyphonic mixture. If stems
// are a separate render, they are evidence about a different signal.
//
// The master chain is linear (a biquad) plus ONE gain envelope computed from
// the mix and applied identically to every stem, so sum(stems) == mix exactly.

import { Biquad, limiterGainEnvelope, dbToLin } from './dsp.js';
import { renderTone, renderNoise, renderThump } from './voices.js';
import { TICKS_PER_BAR } from './compose.js';

export const SAMPLE_RATE = 44100;
export const CHANNELS = ['lead', 'harmony', 'arp', 'bass', 'drums'];

// Master chain constants. The lowpass is a deliberate, disclosed choice: chip
// hardware drives a small speaker through an RC network and the reference
// corpus is mp3-derived, so an unfiltered additive pulse stack (spectral
// centroid ~5.5 kHz measured) is brighter than any of the 38 reference tracks.
// Cutoff and slope are fixed constants, not per-seed knobs.
export const MASTER = {
  lowpassHz: 10500,
  lowpassQ: 0.707,
  ceiling: 0.8688,          // -1.215 dBFS, the corpus median peak
  preGain: 0.92,            // headroom: the limiter should catch peaks, not ride
  lookaheadMs: 5,
  releaseMs: 70,
};

const PATCHES = {
  lead: {
    gain: 0.30,
    env: { a: 0.0022, d: 0.055, s: 0.74, r: 0.022 },
    vib: { rate: 5.5, depth: 0.18, delay: 0.16 },
  },
  harmony: {
    gain: 0.115,
    env: { a: 0.004, d: 0.09, s: 0.58, r: 0.035 },
    shape: 'p:0.5',
  },
  arp: {
    gain: 0.135,
    env: { a: 0.0012, d: 0.030, s: 0.46, r: 0.012 },
  },
  bass: {
    gain: 0.40,
    env: { a: 0.002, d: 0.06, s: 0.88, r: 0.02 },
    shape: 'tri',
  },
};

const DRUM_PATCHES = {
  kick: { type: 'thump', f0: 150, f1: 44, gain: 0.62, lenSec: 0.15, env: { a: 0.001, d: 0.055, s: 0.0, r: 0.03 } },
  snare: { type: 'noise', period: 2, lp: 0.42, short: false, gain: 0.30, lenSec: 0.135, env: { a: 0.001, d: 0.085, s: 0.06, r: 0.04 } },
  hat: { type: 'noise', period: 1, lp: 0.92, short: true, gain: 0.155, lenSec: 0.042, env: { a: 0.0006, d: 0.02, s: 0.0, r: 0.012 } },
  crash: { type: 'noise', period: 1, lp: 0.70, short: false, gain: 0.155, lenSec: 0.85, env: { a: 0.001, d: 0.42, s: 0.10, r: 0.40 } },
};

function noiseSeed(tick, kind) {
  let h = 2166136261 ^ tick;
  for (let i = 0; i < kind.length; i++) { h ^= kind.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ((h >>> 0) & 0x7fff) | 1;
}

function sectionOfBar(song) {
  const map = new Int16Array(song.totalBars + 8).fill(0);
  for (const s of song.sections) {
    for (let b = s.startBar; b < s.startBar + s.bars && b < map.length; b++) map[b] = s.index;
  }
  return map;
}

/**
 * Render [fromSample, toSample) of the song.
 * Output is identical for any sub-range because every note integrates its phase
 * from its own onset and the filters are reset per render call.
 */
export function renderRange(song, fromSample, toSample, sr = SAMPLE_RATE) {
  const n = Math.max(0, toSample - fromSample);
  const stems = {};
  for (const c of CHANNELS) stems[c] = new Float32Array(n);
  const secOfBar = sectionOfBar(song);
  const tickSec = song.secPerTick;
  const toSamp = tick => Math.round(tick * tickSec * sr);

  const shapeFor = (track, tick) => {
    const bar = Math.floor(tick / TICKS_PER_BAR);
    const si = secOfBar[Math.min(bar, secOfBar.length - 1)];
    if (track === 'lead') return song.shapes.lead[si] || 'p:0.25';
    if (track === 'arp') return song.shapes.arp[si] || 'p:0.125';
    return PATCHES[track].shape;
  };

  for (const track of ['lead', 'harmony', 'arp', 'bass']) {
    const p = PATCHES[track];
    const out = stems[track];
    for (const nt of song.tracks[track]) {
      const start = toSamp(nt.tick);
      const len = Math.max(4, toSamp(nt.tick + nt.dur) - start);
      if (start >= toSample || start + len <= fromSample) continue;
      const shape = shapeFor(track, nt.tick);
      const patch = {
        shape, gain: p.gain, env: p.env,
        vib: (track === 'lead' && len > 0.28 * sr) ? p.vib : null,
      };
      renderTone(out, fromSample, toSample, sr, { start, len, midi: nt.midi, vel: nt.vel }, patch);
    }
  }

  {
    const out = stems.drums;
    for (const nt of song.tracks.drums) {
      const dp = DRUM_PATCHES[nt.kind];
      if (!dp) continue;
      const start = toSamp(nt.tick);
      const len = Math.max(8, Math.round(dp.lenSec * sr));
      if (start >= toSample || start + len <= fromSample) continue;
      const note = { start, len, midi: 0, vel: nt.vel };
      if (dp.type === 'thump') {
        renderThump(out, fromSample, toSample, sr, note,
          { f0: dp.f0, f1: dp.f1, gain: dp.gain, env: dp.env });
      } else {
        renderNoise(out, fromSample, toSample, sr, note, {
          period: dp.period, lp: dp.lp, short: dp.short, gain: dp.gain, env: dp.env,
          seedReg: noiseSeed(nt.tick, nt.kind),
        });
      }
    }
  }

  // ---- master chain -----------------------------------------------------
  // 1. identical linear lowpass on every stem (so the sum is still the mix)
  for (const c of CHANNELS) {
    const bq = Biquad.lowpass(MASTER.lowpassHz, sr, MASTER.lowpassQ);
    for (let i = 0; i < n; i++) stems[c][i] *= MASTER.preGain;
    bq.processInto(stems[c], 0, n);
  }
  // 2. sum
  const mix = new Float32Array(n);
  for (const c of CHANNELS) { const s = stems[c]; for (let i = 0; i < n; i++) mix[i] += s[i]; }
  // 3. ONE limiter envelope from the mix, applied to the mix and every stem
  const g = limiterGainEnvelope(mix, sr, MASTER.ceiling, MASTER.lookaheadMs, MASTER.releaseMs);
  for (let i = 0; i < n; i++) mix[i] *= g[i];
  for (const c of CHANNELS) { const s = stems[c]; for (let i = 0; i < n; i++) s[i] *= g[i]; }

  return { mix, stems, sampleRate: sr };
}

/** Raw, pre-master render of a single channel — the honest input to a duty fit. */
export function renderChannelRaw(song, channel, fromSample, toSample, sr = SAMPLE_RATE) {
  const n = Math.max(0, toSample - fromSample);
  const out = new Float32Array(n);
  const secOfBar = sectionOfBar(song);
  const toSamp = tick => Math.round(tick * song.secPerTick * sr);
  const p = PATCHES[channel];
  for (const nt of song.tracks[channel]) {
    const start = toSamp(nt.tick);
    const len = Math.max(4, toSamp(nt.tick + nt.dur) - start);
    if (start >= toSample || start + len <= fromSample) continue;
    const bar = Math.floor(nt.tick / TICKS_PER_BAR);
    const si = secOfBar[Math.min(bar, secOfBar.length - 1)];
    const shape = channel === 'lead' ? song.shapes.lead[si]
      : channel === 'arp' ? song.shapes.arp[si] : p.shape;
    renderTone(out, fromSample, toSample, sr, { start, len, midi: nt.midi, vel: nt.vel },
      { shape, gain: p.gain, env: p.env, vib: null });
  }
  return out;
}

/** A sustained single tone through the exact voice path, for calibration. */
export function renderCalibrationTone({ shape, midi = 69, seconds = 2, sr = SAMPLE_RATE }) {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  renderTone(out, 0, n, sr, { start: 0, len: n, midi, vel: 1 },
    { shape, gain: 0.5, env: { a: 0.001, d: 0.001, s: 1, r: 0.001 }, vib: null });
  return out;
}

export { dbToLin };
