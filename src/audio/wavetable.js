// src/audio/wavetable.js — band-limited waveform tables for the chip voices.
//
// WHY BAND-LIMITED, AND WHY IT IS NOT NEGOTIABLE
// ---------------------------------------------
// A naive `phase < duty ? 1 : -1` oscillator aliases. docs/AUDIO-MEASURED.md
// records what that costs: the aliasing hash of a naive square reads as a
// 19.93 onsets/second "rhythm" with no notes in it at all, and ffmpeg's
// Flat factor actively REWARDS the broken version (21.5 on the aliasing square,
// 0.0 on a correct band-limited pulse). So the oscillator is a mip-mapped
// wavetable: per shape, per half-octave band, a table containing only the
// harmonics that fit under Nyquist for the top of that band.
//
// The pulse coefficients are analytic, not sampled, so the harmonic magnitude
// law |sin(k*pi*d)/k| survives exactly into the rendered audio. That is what
// makes duty cycle recoverable from a solo stem by fitting.

import { synthFromCoeffs, coeffsFromPeriod } from './dsp.js';

export const TBL = 2048;               // samples per table
const F_MIN = 16.351597831287414;      // C0
const BANDS_PER_OCT = 2;               // half-octave mips
const N_BANDS = 22;                    // C0 .. ~ 16.9 kHz
const KMAX = (TBL >> 1) - 1;

export function bandOf(freq) {
  const b = Math.floor(Math.log2(Math.max(freq, F_MIN) / F_MIN) * BANDS_PER_OCT);
  return b < 0 ? 0 : b > N_BANDS - 1 ? N_BANDS - 1 : b;
}
function bandTop(b) { return F_MIN * Math.pow(2, (b + 1) / BANDS_PER_OCT); }

/**
 * Pulse of duty d, +1 for the first d of the period and -1 after, DC removed.
 *   A[k] = 2 sin(2*pi*k*d) / (pi*k)
 *   B[k] = 2 (1 - cos(2*pi*k*d)) / (pi*k)
 *   |c_k| = sqrt(A^2+B^2) = (4/(pi*k)) |sin(pi*k*d)|      <- the fit target
 */
function pulseCoeffs(d) {
  const A = new Float64Array(KMAX + 1), B = new Float64Array(KMAX + 1);
  for (let k = 1; k <= KMAX; k++) {
    A[k] = 2 * Math.sin(2 * Math.PI * k * d) / (Math.PI * k);
    B[k] = 2 * (1 - Math.cos(2 * Math.PI * k * d)) / (Math.PI * k);
  }
  return { A, B };
}

/** The NES triangle is a 4-bit staircase (32 steps), not a smooth ramp. */
function steppedTriCoeffs(steps) {
  const N = 8192;
  const p = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const ph = i / N;
    const s = Math.floor(ph * steps);
    const half = steps >> 1;
    const lvl = s < half ? s : steps - 1 - s;      // 0..half-1
    p[i] = (lvl / (half - 1)) * 2 - 1;
  }
  return coeffsFromPeriod(p);
}

function sawCoeffs() {
  const A = new Float64Array(KMAX + 1), B = new Float64Array(KMAX + 1);
  for (let k = 1; k <= KMAX; k++) B[k] = 2 / (Math.PI * k) * (k % 2 ? 1 : -1);
  return { A, B };
}

const SHAPE_COEFFS = new Map();
function coeffsFor(shape) {
  let c = SHAPE_COEFFS.get(shape);
  if (c) return c;
  if (shape.startsWith('p:')) c = pulseCoeffs(Number(shape.slice(2)));
  else if (shape === 'tri') c = steppedTriCoeffs(32);
  else if (shape === 'saw') c = sawCoeffs();
  else throw new Error(`unknown shape ${shape}`);
  SHAPE_COEFFS.set(shape, c);
  return c;
}

// Module-level cache: the tables are a pure function of the shape set, so the
// cost is paid once per process, not once per post. Cold vs warm cost is
// reported by tools/render-audio.mjs --latency.
const TABLES = new Map();

export function tableFor(shape, band, sampleRate) {
  const key = `${shape}|${band}|${sampleRate}`;
  let t = TABLES.get(key);
  if (t) return t;
  const { A, B } = coeffsFor(shape);
  const nyq = 0.45 * sampleRate;                       // headroom below sr/2
  const kmax = Math.max(1, Math.min(KMAX, Math.floor(nyq / bandTop(band))));
  const d = synthFromCoeffs(A, B, kmax, TBL);
  t = new Float32Array(TBL + 1);
  for (let i = 0; i < TBL; i++) t[i] = d[i];
  t[TBL] = d[0];                                       // guard sample for lerp
  TABLES.set(key, t);
  return t;
}

/**
 * The highest harmonic this engine actually renders at `freq`. A duty fit that
 * asks about harmonics above this is measuring the band-limiter, not the duty:
 * the model predicts energy the table deliberately does not contain.
 */
export function bandLimitK(freq, sampleRate) {
  return Math.max(1, Math.min(KMAX, Math.floor(0.45 * sampleRate / bandTop(bandOf(freq)))));
}

/** Analytic |c_k| for a pulse of duty d — the model the duty fit inverts. */
export function pulseHarmonicMag(k, d) {
  return (4 / (Math.PI * k)) * Math.abs(Math.sin(Math.PI * k * d));
}

/** RMS of a DC-removed unit pulse: 2*sqrt(d*(1-d)). Used to level the duties. */
export function pulseRms(d) { return 2 * Math.sqrt(d * (1 - d)); }

export function tableCacheSize() { return TABLES.size; }
export function clearTableCache() { TABLES.clear(); SHAPE_COEFFS.clear(); }
