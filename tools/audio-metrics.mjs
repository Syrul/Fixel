#!/usr/bin/env node
/**
 * audio-metrics.mjs — objective structural metrics for the Fixel chiptune bar.
 *
 * DESIGN PRINCIPLE
 * ----------------
 * Every GATING metric here is one that a mastering chain cannot fabricate.
 * Loudness, peak, RMS and crest factor are computed too, but they are marked
 * NON-GATING: a limiter plus a gain stage will place any signal — a sine, a
 * sustained square, white noise — at any target RMS/peak/crest you like, so
 * those numbers say nothing whatsoever about whether music happened. They are
 * here only to prove that the controls really were mastered into the band and
 * still failed, i.e. that the band is not secretly a loudness band.
 *
 * The gating metrics measure things that only note-level and section-level
 * structure produces: onsets and their spacing, harmonic content and how often
 * it changes, the shape of the melodic interval distribution, and long-lag
 * self-similarity (does the piece repeat, and does it also go somewhere new).
 *
 * NOTHING IN THIS FILE LISTENS TO ANYTHING. Every number is computed.
 *
 * USAGE
 *   node tools/audio-metrics.mjs <file.wav> [--json]
 *   node tools/audio-metrics.mjs --corpus <dir> --emit-band <band.json> [--json]
 *   node tools/audio-metrics.mjs --band <band.json> <file.wav> [--json]
 *   node tools/audio-metrics.mjs --make-controls <outdir>
 *
 * Node 22 ESM. No dependencies: the WAV reader and the FFT are in this file.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Analysis configuration
// ---------------------------------------------------------------------------

const CFG = {
  windowSeconds: 30,        // fixed-length analysis window
  minTailSeconds: 15,       // trailing remainder shorter than this is dropped
  maxWindows: 8,            // cap work on very long tracks
  // STFT #1: onsets / centroid / frame energy. Short window = sharp onsets.
  NF: 2048, HF: 512,
  // STFT #2: pitch salience / chroma. Long window = usable pitch resolution.
  NC: 4096, HC: 1024,
  midiLo: 36, midiHi: 95,   // C2..B6 salience grid
  harmonics: [1, 2, 3, 4, 5],
  featBlock: 4,             // chroma frames per structural feature frame (~93 ms)
  ssmMinLagSec: 1.0,
  novHalfSec: 2.0,
};

// ---------------------------------------------------------------------------
// WAV reader (RIFF/PCM). Returns mono Float32 in [-1,1] plus sample rate.
// ---------------------------------------------------------------------------

function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file}: not a RIFF/WAVE file`);
  }
  let pos = 12;
  let fmt = null, dataOff = -1, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
      if (fmt.format === 0xfffe && size >= 40) fmt.format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') {
      dataOff = body;
      dataLen = Math.min(size, buf.length - body);
    }
    pos = body + size + (size & 1); // chunks are word-aligned
  }
  if (!fmt || dataOff < 0) throw new Error(`${file}: missing fmt or data chunk`);

  const { channels: ch, bitsPerSample: bits, format } = fmt;
  const bytes = bits >> 3;
  const frames = Math.floor(dataLen / (bytes * ch));
  const out = new Float32Array(frames);
  const scale = 1 / ch;

  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < ch; c++) {
      const o = dataOff + (i * ch + c) * bytes;
      let v;
      if (format === 3 && bits === 32) v = buf.readFloatLE(o);
      else if (format === 3 && bits === 64) v = buf.readDoubleLE(o);
      else if (bits === 8) v = (buf.readUInt8(o) - 128) / 128;         // 8-bit PCM is unsigned
      else if (bits === 16) v = buf.readInt16LE(o) / 32768;
      else if (bits === 24) {
        const raw = buf.readUInt8(o) | (buf.readUInt8(o + 1) << 8) | (buf.readInt8(o + 2) << 16);
        v = raw / 8388608;
      } else if (bits === 32) v = buf.readInt32LE(o) / 2147483648;
      else throw new Error(`${file}: unsupported ${bits}-bit format ${format}`);
      acc += v;
    }
    out[i] = acc * scale;
  }
  return { samples: out, sampleRate: fmt.sampleRate, channels: ch, bits, sourceChannels: ch };
}

function writeWav(file, samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

// ---------------------------------------------------------------------------
// FFT — iterative in-place radix-2 Cooley-Tukey, hand-written.
// ---------------------------------------------------------------------------

const twiddleCache = new Map();
function twiddles(n) {
  let t = twiddleCache.get(n);
  if (t) return t;
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / n); sin[i] = Math.sin(-2 * Math.PI * i / n); }
  t = { cos, sin };
  twiddleCache.set(n, t);
  return t;
}

function fftInPlace(re, im) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const { cos, sin } = twiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const step = n / len, half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const tw = k * step;
        const wr = cos[tw], wi = sin[tw];
        const a = i + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  return w;
}

/** Magnitude spectrogram: frames x (N/2+1), normalised by window sum. */
function stft(x, N, H) {
  const w = hann(N);
  let wsum = 0; for (let i = 0; i < N; i++) wsum += w[i];
  const nFrames = Math.max(0, Math.floor((x.length - N) / H) + 1);
  const bins = N / 2 + 1;
  const spec = new Array(nFrames);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < nFrames; f++) {
    const off = f * H;
    for (let i = 0; i < N; i++) { re[i] = x[off + i] * w[i]; im[i] = 0; }
    fftInPlace(re, im);
    const m = new Float32Array(bins);
    for (let k = 0; k < bins; k++) m[k] = 2 * Math.hypot(re[k], im[k]) / wsum;
    spec[f] = m;
  }
  return { spec, nFrames, bins, hop: H, size: N };
}

// ---------------------------------------------------------------------------
// small numeric helpers
// ---------------------------------------------------------------------------

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
function median(a) {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function std(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); }
function percentile(a, p) {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}
function entropyBits(v) {
  let sum = 0; for (const x of v) sum += Math.max(0, x);
  if (sum <= 0) return 0;
  let h = 0;
  for (const x of v) { const p = Math.max(0, x) / sum; if (p > 0) h -= p * Math.log2(p); }
  return h;
}
/** Running median over +-half frames (naive; sizes here are small). */
function runningMedian(arr, half) {
  const n = arr.length, out = new Float64Array(n);
  const scratch = new Float64Array(2 * half + 1);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n - 1, i + half);
    let c = 0;
    for (let j = a; j <= b; j++) scratch[c++] = arr[j];
    const s = scratch.slice(0, c).sort();
    out[i] = c % 2 ? s[c >> 1] : (s[(c >> 1) - 1] + s[c >> 1]) / 2;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pitch salience: harmonic-summed semitone grid, then greedy harmonic
// suppression so that one square wave reads as ONE note, not as a chord made
// of its own odd harmonics. This is what gives pitchClassEntropy and
// polyphony their teeth against a static waveform.
// ---------------------------------------------------------------------------

const HARMONIC_SEMITONES = [12, 19, 24, 28, 31, 34, 36]; // 2f,3f,4f,5f,6f,7f,8f above f0

function buildSalienceBands(sr, N) {
  const nMidi = CFG.midiHi - CFG.midiLo + 1;
  const bands = new Array(nMidi);
  const binHz = sr / N;
  const maxBin = N / 2;
  for (let i = 0; i < nMidi; i++) {
    const f0 = 440 * Math.pow(2, (CFG.midiLo + i - 69) / 12);
    const hb = [];
    for (const h of CFG.harmonics) {
      const f = f0 * h;
      const lo = Math.max(1, Math.floor(f * Math.pow(2, -1 / 24) / binHz));
      const hi = Math.min(maxBin, Math.ceil(f * Math.pow(2, 1 / 24) / binHz));
      if (lo > maxBin) break;
      hb.push({ lo, hi: Math.max(lo, hi), w: 1 / h });
    }
    bands[i] = hb;
  }
  return bands;
}

/**
 * Per-frame note salience.
 * Returns { note: Float32Array[nMidi] per frame (harmonics suppressed),
 *           voices: number of accepted simultaneous notes,
 *           active: boolean (frame has enough energy to analyse) }
 */
function noteSalience(spec, bands, activeFloor) {
  const nMidi = bands.length;
  const raw = new Float64Array(nMidi);
  const fund = new Float64Array(nMidi);   // energy actually AT f(m), i.e. the h=1 term
  const note = new Float32Array(nMidi);
  let total = 0, maxFund = 0;
  for (let i = 0; i < nMidi; i++) {
    let s = 0;
    for (let h = 0; h < bands[i].length; h++) {
      const { lo, hi, w } = bands[i][h];
      let mx = 0;
      for (let k = lo; k <= hi; k++) if (spec[k] > mx) mx = spec[k];
      if (h === 0) { fund[i] = mx; if (mx > maxFund) maxFund = mx; }
      s += w * mx;
    }
    raw[i] = s; total += s;
  }
  if (total < activeFloor) return { chroma: new Float64Array(12), dom: -1, voices: 0, active: false };

  // Sub-harmonic ghost rejection: a bin whose harmonic sum comes only from
  // partials of some HIGHER note has no energy at its own fundamental. Real
  // chiptune waveforms (square/pulse/tri/saw) all carry a strong fundamental.
  for (let i = 0; i < nMidi; i++) if (fund[i] < 0.08 * maxFund) raw[i] *= 0.05;

  note.set(raw);
  let maxS = 0; for (let i = 0; i < nMidi; i++) if (raw[i] > maxS) maxS = raw[i];
  const cand = [];
  for (let i = 0; i < nMidi; i++) {
    const l = i > 0 ? raw[i - 1] : -1, r = i < nMidi - 1 ? raw[i + 1] : -1;
    if (raw[i] >= l && raw[i] >= r && raw[i] > 0) cand.push(i);
  }
  cand.sort((a, b) => raw[b] - raw[a]);
  const ALPHA = 0.22;
  const chroma = new Float64Array(12);
  const peaks = [];
  let voices = 0, dom = -1, domV = 0;
  for (const p of cand) {
    if (note[p] < ALPHA * maxS) continue;
    voices++;
    // chroma and pitch come from ACCEPTED NOTES ONLY — summing the whole
    // salience curve smears a single tone across the octave via leakage.
    chroma[(CFG.midiLo + p) % 12] += note[p];
    if (note[p] > domV) { domV = note[p]; dom = CFG.midiLo + p; }
    peaks.push({ midi: CFG.midiLo + p, rel: note[p] / maxS });
    for (const d of HARMONIC_SEMITONES) {
      for (let dd = -1; dd <= 1; dd++) {
        const q = p + d + dd;
        if (q > p && q < nMidi) note[q] *= 0.08;
      }
    }
  }
  return { chroma, dom, peaks, voices, active: true };
}

// ---------------------------------------------------------------------------
// Window analysis — every metric for one fixed-length window of audio
// ---------------------------------------------------------------------------

function analyzeWindow(x, sr) {
  const dur = x.length / sr;
  const R = {};

  // ---- NON-GATING loudness block ---------------------------------------
  // A limiter + gain stage sets all three of these to whatever you want.
  // They gate nothing. They exist so the calibration can prove the controls
  // were mastered INTO the band and still failed everything that matters.
  let peak = 0, sumSq = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; sumSq += x[i] * x[i]; }
  const rms = Math.sqrt(sumSq / Math.max(1, x.length));
  const db = v => 20 * Math.log10(Math.max(v, 1e-9));
  R.peakDbfs = db(peak);
  R.rmsDbfs = db(rms);
  R.crestFactorDb = R.peakDbfs - R.rmsDbfs;

  // ---- STFT #1: onsets, centroid, frame energy -------------------------
  const S1 = stft(x, CFG.NF, CFG.HF);
  const fps1 = sr / CFG.HF;
  const binHz1 = sr / CFG.NF;
  // Log-spaced band edges for the flux front-end. Spectral flux is computed on
  // BAND SUMS, not raw bins: an aliasing oscillator sprays hash that moves
  // between bins within a band from frame to frame, which a per-bin
  // half-wave-rectified difference reads as a huge onset every frame. Summing
  // into bands before differencing cancels that redistribution while leaving a
  // real note attack — which lifts whole bands at once — fully intact.
  const FLUX_BANDS = 48, FLUX_LO = 60, FLUX_HI = 11000;
  const fluxEdges = new Int32Array(FLUX_BANDS + 1);
  for (let b = 0; b <= FLUX_BANDS; b++) {
    const f = FLUX_LO * Math.pow(FLUX_HI / FLUX_LO, b / FLUX_BANDS);
    fluxEdges[b] = Math.min(S1.bins - 1, Math.max(1, Math.round(f / binHz1)));
  }

  const frameRms = new Float64Array(S1.nFrames);
  const centroid = new Float64Array(S1.nFrames);
  const flux = new Float64Array(S1.nFrames);   // RELATIVE spectral flux (see below)
  let prevLog = null;

  for (let f = 0; f < S1.nFrames; f++) {
    const m = S1.spec[f];
    let e = 0, num = 0, den = 0;
    for (let k = 0; k < S1.bins; k++) { const v = m[k]; e += v * v; num += v * k * binHz1; den += v; }
    frameRms[f] = Math.sqrt(e);
    centroid[f] = den > 1e-9 ? num / den : 0;
    // log-compressed magnitude, half-wave rectified difference = spectral flux.
    // Divided by the frame's total log-spectral content so the result is a
    // scale-free "what fraction of this frame's spectrum is NEW" figure. Without
    // this, a perfectly static tone's floating-point jitter normalises up into
    // hundreds of phantom onsets.
    const lg = new Float64Array(FLUX_BANDS);
    let elog = 0;
    for (let b = 0; b < FLUX_BANDS; b++) {
      let s = 0;
      const k0 = fluxEdges[b], k1 = Math.max(fluxEdges[b] + 1, fluxEdges[b + 1]);
      for (let k = k0; k < k1; k++) s += m[k];
      lg[b] = Math.log1p(1000 * s); elog += lg[b];
    }
    if (prevLog && elog > 1e-6) { let s = 0; for (let b = 0; b < FLUX_BANDS; b++) { const d = lg[b] - prevLog[b]; if (d > 0) s += d; } flux[f] = s / elog; }
    prevLog = lg;
  }

  // silenceFraction: frames >40 dB under the loudest frame, or below -60 dBFS
  let maxFr = 0; for (const v of frameRms) if (v > maxFr) maxFr = v;
  const silThresh = Math.max(maxFr * Math.pow(10, -40 / 20), Math.pow(10, -60 / 20) * 0.001);
  let silent = 0;
  for (const v of frameRms) if (v < silThresh) silent++;
  R.silenceFraction = S1.nFrames ? silent / S1.nFrames : 1;

  // spectral centroid over non-silent frames
  const activeCentroids = [];
  for (let f = 0; f < S1.nFrames; f++) if (frameRms[f] >= silThresh && centroid[f] > 0) activeCentroids.push(centroid[f]);
  const cMean = mean(activeCentroids), cStd = std(activeCentroids);
  R.spectralCentroidMean = cMean;
  R.spectralCentroidVar = cStd * cStd;            // Hz^2
  R.spectralCentroidCV = cMean > 0 ? cStd / cMean : 0; // scale-free twin of the above

  // ---- onset detection: median-threshold peak picker --------------------
  // Two tests must both pass: (1) a local-median-relative threshold, which finds
  // peaks, and (2) an ABSOLUTE floor on relative flux, which stops a static
  // signal's numerical noise from being peak-picked into a rhythm.
  // A third test — multiplicative PROMINENCE over the local median — is what
  // separates a real note attack (flux spikes many times above its surroundings)
  // from a signal whose spectrum merely fizzes at a constant level, e.g. the
  // aliasing hash of a naive square oscillator, which an additive threshold
  // happily peak-picks into a nonexistent 20 Hz rhythm.
  //
  // PROMINENCE is set from the measured peak-to-local-median ratio of the flux.
  // A naive square oscillator's period jitters between 50 and 51 samples at
  // 440 Hz; that modulates its spectrum to flux 0.057, higher than the 0.033
  // typical of real onsets in the loop control, so no ABSOLUTE flux threshold
  // separates buzz from notes. What does separate them is shape: the buzz is
  // elevated continuously and tops out at 4.5x its own median, while genuine
  // note attacks are sparse spikes reaching 10-27x. Prominence over the local
  // median is therefore the discriminator; the multiplier below is tuned so
  // that onset rates on the real CC0 corpus stay musically plausible, which is
  // the constraint that matters. See AUDIO-MEASURED.md for the residual
  // weakness this leaves against a stationary aliasing oscillator.
  const ABS_ONSET_FLOOR = 0.012;
  const PROMINENCE = 2.0;
  const fn = flux;
  const medHalf = Math.max(1, Math.round(0.2 * fps1));
  const locMed = runningMedian(fn, medHalf);
  const delta = 0.35 * std(Array.from(fn));
  const minGap = Math.max(2, Math.round(0.045 * fps1));
  const onsetFrames = [];
  for (let i = 1; i < fn.length - 1; i++) {
    if (fn[i] < ABS_ONSET_FLOOR) continue;
    if (fn[i] < locMed[i] * PROMINENCE) continue;
    if (fn[i] <= locMed[i] + delta) continue;
    let isMax = true;
    for (let j = Math.max(0, i - 3); j <= Math.min(fn.length - 1, i + 3); j++) if (fn[j] > fn[i]) { isMax = false; break; }
    if (!isMax) continue;
    if (onsetFrames.length && i - onsetFrames[onsetFrames.length - 1] < minGap) continue;
    onsetFrames.push(i);
  }
  const onsetTimes = onsetFrames.map(f => f / fps1);
  R.onsetRate = onsetTimes.length / dur;

  // ---- inter-onset intervals -------------------------------------------
  const iois = [];
  for (let i = 1; i < onsetTimes.length; i++) {
    const d = onsetTimes[i] - onsetTimes[i - 1];
    if (d > 0.03 && d < 4) iois.push(d);
  }
  // log-spaced IOI histogram, 0.04 s .. 2.56 s, 24 bins (quarter-octave-ish)
  const IOI_LO = 0.04, IOI_HI = 2.56, IOI_BINS = 24;
  const ioiHist = new Float64Array(IOI_BINS);
  for (const d of iois) {
    if (d < IOI_LO || d > IOI_HI) continue;
    let b = Math.floor(IOI_BINS * Math.log2(d / IOI_LO) / Math.log2(IOI_HI / IOI_LO));
    b = Math.max(0, Math.min(IOI_BINS - 1, b));
    ioiHist[b]++;
  }
  R.ioiEntropy = iois.length >= 4 ? entropyBits(ioiHist) : 0;
  R.ioiMedian = iois.length ? median(iois) : 0;

  // beat periodicity: autocorrelation of the onset detection function
  // over lags 0.2..2.0 s (30..300 BPM)
  // The ODF is the half-wave-rectified EXCESS over the local median, not the raw
  // flux. Correlating raw flux measures the periodicity of the noise floor: a
  // static aliased oscillator has a perfectly periodic aliasing pattern and
  // scores beatStrength ~0.95 without containing a single note.
  const odf = new Float64Array(fn.length);
  for (let i = 0; i < fn.length; i++) odf[i] = Math.max(0, fn[i] - locMed[i] * PROMINENCE);
  { const m = mean(Array.from(odf)); for (let i = 0; i < odf.length; i++) odf[i] -= m; }
  let acf0 = 0; for (let i = 0; i < odf.length; i++) acf0 += odf[i] * odf[i];
  const lagLo = Math.round(0.2 * fps1), lagHi = Math.min(odf.length - 2, Math.round(2.0 * fps1));
  const acfMax = Math.min(odf.length - 2, Math.round(3.0 * fps1));
  const acf = new Float64Array(acfMax + 1);
  let bestLag = 0, bestVal = 0;
  // Fewer than 8 events in the window is not a tempo, it is an accident.
  if (acf0 > 1e-12 && onsetFrames.length >= 8) {
    for (let l = 1; l <= acfMax; l++) {
      let s = 0; for (let i = 0; i + l < odf.length; i++) s += odf[i] * odf[i + l];
      acf[l] = s / acf0;
    }
    for (let l = lagLo; l <= lagHi; l++) if (acf[l] > bestVal) { bestVal = acf[l]; bestLag = l; }
  }
  // beatStrength keeps its original definition: the strongest periodicity
  // anywhere in 30..300 BPM. It answers "is there a beat at all", which does not
  // depend on which metrical level that beat sits on.
  R.beatStrength = Math.max(0, bestVal);

  // TEMPO IS RETIRED. There is deliberately no tempoBpm metric.
  //
  // It shipped as a gating metric and was wrong. Taking the argmax of the
  // autocorrelation reported the BAR rate on dense tracks and the BEAT rate on
  // sparse ones — 32.5 BPM for music plainly at ~130 — so the band built from it
  // was a mixture of two different quantities and admitted a sustained square.
  //
  // Two repairs were attempted and measured, not assumed:
  //   1. harmonic-sum salience over a canonical 90..180 BPM octave. This made
  //      every reading beat-level and musically plausible (beat/ioiMedian ratios
  //      moved from an absurd 14.4 to a coherent 2-4), but left a 3:2 hemiola
  //      error: a 150 BPM ground truth read as 99.4.
  //   2. multiplicative salience, requiring the candidate period to be a strong
  //      peak in its own right. This fixed the hemiola cases.
  //
  // Both were then tested for the property that actually matters: does the
  // metric report ONE quantity? Real corpus tracks were resampled by known
  // factors (asetrate, which preserves onset structure exactly — verified, as
  // onsetRate scales at 94-105% under it, whereas ffmpeg's atempo does NOT and
  // invalidates the test at 126-134%). If the metric tracked tempo, a track sped
  // up by 1.25 would report 1.25x its tempo. Measured: 6 of 24 correct, and the
  // failures were not random — junkala-level2 reported 105.5 BPM at both 1.0x
  // and 1.25x, sketchy-boss reported 120.2 at both 1.0x and 1.5x. The estimator
  // returns the centre of its own search window, not the music's tempo.
  //
  // A metric that tracks its search window rather than its input cannot be
  // repaired by widening a band, and reporting it at 25% accuracy would be worse
  // than reporting nothing. Do not re-add it without redoing the resampling
  // self-consistency test above.
  //
  // beatStrength survives and still gates: it is the strongest periodicity
  // ANYWHERE in 30..300 BPM, so it never has to choose a metrical level. It
  // answers "is there a beat at all", drifts only +17%/-24% in magnitude under
  // the same resampling test, and catches all six adversarial controls.

  R._ioiHist = Array.from(ioiHist);

  // ---- STFT #2: pitch salience, chroma, polyphony -----------------------
  const S2 = stft(x, CFG.NC, CFG.HC);
  const fps2 = sr / CFG.HC;
  const bands = buildSalienceBands(sr, CFG.NC);
  const nMidi = bands.length;

  // energy floor for "this frame contains a note"
  const frameTot = new Float64Array(S2.nFrames);
  for (let f = 0; f < S2.nFrames; f++) { let s = 0; const m = S2.spec[f]; for (let k = 1; k < S2.bins; k++) s += m[k]; frameTot[f] = s; }
  let totMax = 0; for (const v of frameTot) if (v > totMax) totMax = v;
  const activeFloor = totMax * 0.02;

  const chromaSeq = [];              // per frame, 12-dim
  const chromaAvg = new Float64Array(12);
  const domPitch = new Int16Array(S2.nFrames).fill(-1);  // melodic (top) line
  const voiceCounts = [];
  const peaksSeq = new Array(S2.nFrames);
  for (let f = 0; f < S2.nFrames; f++) {
    const { chroma, peaks, voices, active } = noteSalience(S2.spec[f], bands, activeFloor);
    peaksSeq[f] = active ? peaks : [];
    if (active) {
      voiceCounts.push(voices);
      for (let p = 0; p < 12; p++) chromaAvg[p] += chroma[p];
    }
    chromaSeq.push(chroma);
  }

  // Melodic line: two passes.
  // Pass 1 takes the highest reasonably strong voice per frame — the melody is
  // conventionally the top line, and the LOUDEST partial is almost always the
  // bass, so tracking loudness measures the bass line's (near-static) intervals
  // and calls them the melody.
  // Pass 2 fixes what pass 1 gets wrong: whenever the top voice drops out for a
  // frame, pass 1 jumps down to an accompaniment voice an octave or more away
  // and fabricates a huge leap. Confining the line to a two-octave register
  // around its own median kills those voice-swap artefacts, which is what makes
  // the interval distribution discriminative instead of merely wide.
  const pass1 = [];
  for (let f = 0; f < S2.nFrames; f++) {
    let m = -1;
    for (const pk of peaksSeq[f]) if (pk.rel >= 0.35 && pk.midi > m) m = pk.midi;
    if (m >= 0) pass1.push(m);
  }
  const melCentre = pass1.length ? median(pass1) : 0;
  for (let f = 0; f < S2.nFrames; f++) {
    let m = -1;
    for (const pk of peaksSeq[f]) {
      if (pk.rel < 0.30) continue;
      if (Math.abs(pk.midi - melCentre) > 12) continue;
      if (pk.midi > m) m = pk.midi;
    }
    domPitch[f] = m;
  }
  R.pitchClassEntropy = entropyBits(chromaAvg);
  R.polyphony = voiceCounts.length ? mean(voiceCounts) : 0;

  // ---- chord / chroma change rate --------------------------------------
  // 0.5 s blocks, matched against 24 major/minor triad templates.
  const blockLen = Math.max(1, Math.round(0.5 * fps2));
  const blocks = [];
  for (let b = 0; b + blockLen <= chromaSeq.length; b += blockLen) {
    const acc = new Float64Array(12);
    for (let f = b; f < b + blockLen; f++) for (let p = 0; p < 12; p++) acc[p] += chromaSeq[f][p];
    let n = 0; for (const v of acc) n += v * v;
    n = Math.sqrt(n);
    if (n > 0) for (let p = 0; p < 12; p++) acc[p] /= n;
    blocks.push({ v: acc, energy: n });
  }
  const templates = [];
  for (let root = 0; root < 12; root++) {
    for (const iv of [[0, 4, 7], [0, 3, 7]]) {
      const t = new Float64Array(12);
      for (const s of iv) t[(root + s) % 12] = 1;
      let n = Math.sqrt(iv.length);
      for (let p = 0; p < 12; p++) t[p] /= n;
      templates.push(t);
    }
  }
  const labels = [];
  for (const b of blocks) {
    if (b.energy <= 0) { labels.push(-1); continue; }
    let best = -1, bv = -1;
    for (let t = 0; t < templates.length; t++) {
      let s = 0; for (let p = 0; p < 12; p++) s += b.v[p] * templates[t][p];
      if (s > bv) { bv = s; best = t; }
    }
    labels.push(best);
  }
  let changes = 0, cosSum = 0, cosN = 0;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] !== labels[i - 1] && labels[i] >= 0 && labels[i - 1] >= 0) changes++;
    if (blocks[i].energy > 0 && blocks[i - 1].energy > 0) {
      let s = 0; for (let p = 0; p < 12; p++) s += blocks[i].v[p] * blocks[i - 1].v[p];
      cosSum += 1 - s; cosN++;
    }
  }
  R.chromaChangeRate = dur > 0 ? changes / dur : 0;
  R.chromaFlux = cosN ? cosSum / cosN : 0;

  // ---- melodic interval distribution ------------------------------------
  // median-filter the dominant pitch, segment into stable notes, take
  // successive intervals.
  const dp = Array.from(domPitch);
  const dpf = new Int16Array(dp.length);
  for (let i = 0; i < dp.length; i++) {
    const a = Math.max(0, i - 1), b = Math.min(dp.length - 1, i + 1);
    const w = [];
    for (let j = a; j <= b; j++) if (dp[j] >= 0) w.push(dp[j]);
    dpf[i] = w.length ? Math.round(median(w)) : -1;
  }
  const minNoteFrames = Math.max(2, Math.round(0.06 * fps2));
  const notes = [];
  let cur = -1, run = 0;
  for (let i = 0; i <= dpf.length; i++) {
    const v = i < dpf.length ? dpf[i] : -2;
    if (v === cur) { run++; continue; }
    if (cur >= 0 && run >= minNoteFrames) { if (!notes.length || notes[notes.length - 1] !== cur) notes.push(cur); }
    cur = v; run = 1;
  }
  const intervals = [];
  for (let i = 1; i < notes.length; i++) { const d = Math.abs(notes[i] - notes[i - 1]); if (d >= 1 && d <= 36) intervals.push(d); }
  const nI = intervals.length;
  R.stepFrac = nI ? intervals.filter(d => d <= 2).length / nI : 0;
  R.leapFrac = nI ? intervals.filter(d => d >= 3 && d <= 7).length / nI : 0;
  R.bigLeapFrac = nI ? intervals.filter(d => d > 7).length / nI : 0;
  R.noteCount = notes.length;
  R.intervalCount = nI;

  // ---- structural features, self-similarity, novelty --------------------
  // feature = L2-normalised chroma (12) + L2-normalised 4-band log energy
  const bandEdges = [0, 250, 1000, 4000, 16000].map(f => Math.min(S2.bins - 1, Math.round(f / (sr / CFG.NC))));
  const featFrames = [];
  const B = CFG.featBlock;
  for (let b = 0; b + B <= chromaSeq.length; b += B) {
    const c = new Float64Array(12);
    const be = new Float64Array(4);
    for (let f = b; f < b + B; f++) {
      for (let p = 0; p < 12; p++) c[p] += chromaSeq[f][p];
      const m = S2.spec[f];
      for (let g = 0; g < 4; g++) { let s = 0; for (let k = bandEdges[g] + 1; k <= bandEdges[g + 1]; k++) s += m[k] * m[k]; be[g] += Math.log1p(1e4 * Math.sqrt(s)); }
    }
    let nc = 0; for (const v of c) nc += v * v; nc = Math.sqrt(nc);
    if (nc > 0) for (let p = 0; p < 12; p++) c[p] /= nc;
    let nb = 0; for (const v of be) nb += v * v; nb = Math.sqrt(nb);
    if (nb > 0) for (let g = 0; g < 4; g++) be[g] /= nb;
    const feat = new Float64Array(16);
    feat.set(c, 0); feat.set(be, 12);
    featFrames.push(feat);
  }
  const fpsF = fps2 / B;
  const NF_ = featFrames.length, D = 16;

  // mean-remove each dimension across the whole window
  const mu = new Float64Array(D);
  for (const f of featFrames) for (let d = 0; d < D; d++) mu[d] += f[d];
  for (let d = 0; d < D; d++) mu[d] /= Math.max(1, NF_);
  const X = featFrames.map(f => { const g = new Float64Array(D); for (let d = 0; d < D; d++) g[d] = f[d] - mu[d]; return g; });

  // Degenerate-constant guard. A frozen signal has residual variance at the
  // floating-point noise floor; correlating that noise yields a meaningless
  // number. The honest characterisation of a signal that never changes is that
  // it repeats perfectly (repeatStrength 1) and introduces nothing new
  // (novelFraction 0) — which is exactly how it should fail the two-sided band.
  let totVar = 0, totEng = 0;
  for (let i = 0; i < NF_; i++) for (let d = 0; d < D; d++) { totVar += X[i][d] * X[i][d]; totEng += featFrames[i][d] * featFrames[i][d]; }
  const frozen = NF_ > 0 && totEng > 0 && totVar / totEng < 1e-6;

  const minLag = Math.max(2, Math.round(CFG.ssmMinLagSec * fpsF));
  const maxLag = Math.floor(NF_ / 2);
  let bestL = 0, bestC = 0;
  if (!frozen) {
    for (let l = minLag; l <= maxLag; l++) {
      let num = 0, da = 0, dbb = 0;
      for (let i = 0; i + l < NF_; i++) {
        const a = X[i], b = X[i + l];
        for (let d = 0; d < D; d++) { num += a[d] * b[d]; da += a[d] * a[d]; dbb += b[d] * b[d]; }
      }
      const den = Math.sqrt(da * dbb);
      const c = den > 1e-12 ? num / den : 0;
      if (c > bestC) { bestC = c; bestL = l; }
    }
  }
  R.repeatStrength = frozen ? 1 : Math.max(0, bestC);
  R.repeatLagSec = bestL > 0 ? bestL / fpsF : 0;

  // novelFraction: at the best lag, how much of the window is NOT that repeat
  if (frozen) {
    R.novelFraction = 0;
  } else if (bestL > 0) {
    let novel = 0, n = 0;
    for (let i = 0; i + bestL < NF_; i++) {
      const a = X[i], b = X[i + bestL];
      let num = 0, da = 0, dbb = 0;
      for (let d = 0; d < D; d++) { num += a[d] * b[d]; da += a[d] * a[d]; dbb += b[d] * b[d]; }
      const den = Math.sqrt(da * dbb);
      const s = den > 1e-12 ? num / den : 0;
      if (s < 0.8) novel++;
      n++;
    }
    R.novelFraction = n ? novel / n : 1;
  } else R.novelFraction = 1;

  // noveltyPerSecond: sliding 2 s-vs-2 s cosine distance on the raw features,
  // peak-picked. A track that never develops scores ~0.
  const halfF = Math.max(1, Math.round(CFG.novHalfSec * fpsF));
  const nov = [];
  for (let i = halfF; i + halfF < NF_; i++) {
    const a = new Float64Array(D), b = new Float64Array(D);
    for (let j = i - halfF; j < i; j++) for (let d = 0; d < D; d++) a[d] += featFrames[j][d];
    for (let j = i; j < i + halfF; j++) for (let d = 0; d < D; d++) b[d] += featFrames[j][d];
    let num = 0, da = 0, dbb = 0;
    for (let d = 0; d < D; d++) { num += a[d] * b[d]; da += a[d] * a[d]; dbb += b[d] * b[d]; }
    const den = Math.sqrt(da * dbb);
    nov.push(den > 1e-12 ? 1 - num / den : 0);
  }
  let bounds = 0;
  const ABS_NOVELTY_FLOOR = 0.02; // absolute cosine distance; stops flat-curve noise counting as structure
  if (nov.length > 3) {
    const nm = median(nov), nd = std(nov);
    const gap = Math.max(1, Math.round(2.0 * fpsF));
    let last = -1e9;
    for (let i = 1; i < nov.length - 1; i++) {
      if (nov[i] < ABS_NOVELTY_FLOOR) continue;
      if (nov[i] <= nm + 0.6 * nd) continue;
      if (nov[i] < nov[i - 1] || nov[i] < nov[i + 1]) continue;
      if (i - last < gap) continue;
      bounds++; last = i;
    }
  }
  const novSpan = nov.length / fpsF;
  R.noveltyPerSecond = novSpan > 0 ? bounds / novSpan : 0;

  return R;
}

// ---------------------------------------------------------------------------
// Per-file analysis: split into fixed-length windows, take the per-metric
// median across windows so a 3-minute track and a 40-second track produce
// one comparable vector each.
// ---------------------------------------------------------------------------

// A metric earns a gate only if it (a) reports ONE quantity regardless of input,
// (b) is not a restatement of another gate, and (c) actually discriminates.
// Three metrics were demoted for failing (c), and are still computed and
// reported — see docs/AUDIO-MEASURED.md for the measurements behind each:
//   ioiEntropy         - r = -0.63 with onsetRate, i.e. substantially a readout
//                        of how many onsets the detector fired; caught 0 of 6.
//   spectralCentroidVar- r = 0.710 with spectralCentroidCV, the same measurement
//                        in Hz^2 instead of scale-free; CV is the better
//                        discriminator of the two on every control.
const GATING = [
  'onsetRate', 'beatStrength',
  'pitchClassEntropy', 'chromaChangeRate',
  'stepFrac', 'leapFrac', 'bigLeapFrac',
  'repeatStrength', 'novelFraction',
  'spectralCentroidMean', 'spectralCentroidCV',
  'polyphony', 'silenceFraction', 'noveltyPerSecond',
];
const NON_GATING = ['peakDbfs', 'rmsDbfs', 'crestFactorDb'];
const INFO = ['ioiEntropy', 'spectralCentroidVar', 'ioiMedian', 'chromaFlux', 'repeatLagSec', 'noteCount', 'intervalCount'];

function analyzeFile(file) {
  const { samples, sampleRate: sr } = readWav(file);
  const wlen = Math.round(CFG.windowSeconds * sr);
  const minTail = Math.round(CFG.minTailSeconds * sr);
  const starts = [];
  if (samples.length <= wlen) starts.push(0);
  else {
    for (let s = 0; s + minTail <= samples.length && starts.length < CFG.maxWindows; s += wlen) starts.push(s);
  }
  const perWindow = [];
  for (const s of starts) {
    const seg = samples.subarray(s, Math.min(samples.length, s + wlen));
    if (seg.length < sr * 4) continue; // ignore anything under 4 s
    perWindow.push(analyzeWindow(seg, sr));
  }
  if (!perWindow.length) throw new Error(`${file}: too short to analyse`);
  const keys = [...GATING, ...NON_GATING, ...INFO];
  const track = {};
  for (const k of keys) track[k] = median(perWindow.map(w => w[k] ?? 0));
  const ih = new Float64Array(24);
  for (const w of perWindow) if (w._ioiHist) for (let i = 0; i < 24; i++) ih[i] += w._ioiHist[i];
  return {
    file: path.basename(file),
    durationSec: samples.length / sr,
    sampleRate: sr,
    windows: perWindow.length,
    windowSeconds: CFG.windowSeconds,
    metrics: track,
    ioiHistogram: Array.from(ih),
  };
}

// ---------------------------------------------------------------------------
// Band derivation and scoring
// ---------------------------------------------------------------------------

function emitBand(results) {
  const band = { version: 1, generated: new Date().toISOString(), method: 'p05..p95 across corpus tracks; per-track value = median across 30 s windows', windowSeconds: CFG.windowSeconds, corpusSize: results.length, tracks: results.map(r => r.file), gating: {}, nonGating: {} };
  for (const k of GATING) {
    const vals = results.map(r => r.metrics[k]);
    band.gating[k] = { lo: percentile(vals, 0.05), hi: percentile(vals, 0.95), median: median(vals), min: Math.min(...vals), max: Math.max(...vals) };
  }

  // ACCEPTANCE RULE, derived by leave-one-out on the corpus itself.
  //
  // Requiring every metric to sit inside p05..p95 is the wrong gate and the
  // corpus proves it: with 17 two-sided p05..p95 bands, a track is expected to
  // fall outside about 1.7 of them by construction, and measured leave-one-out
  // only 5 of 38 genuine CC0 chiptunes clear all 17. A bar that rejects 87% of
  // real chiptune is measuring percentile arithmetic, not music.
  //
  // So the gate is a budget: how many metrics a track may miss. The budget is
  // the p95 of the leave-one-out fail-count distribution over the corpus, i.e.
  // set so that ~95% of real chiptune is accepted. Everything is still scored
  // and reported per metric; this only decides the verdict.
  const looCounts = results.map((r, i) => {
    const others = results.filter((_, j) => j !== i);
    let n = 0;
    for (const k of GATING) {
      const vals = others.map(t => t.metrics[k]);
      const lo = percentile(vals, 0.05), hi = percentile(vals, 0.95);
      const v = r.metrics[k];
      if (v < lo || v > hi) n++;
    }
    return n;
  });
  band.acceptance = {
    rule: 'PASS if the number of gating metrics outside their p05..p95 band is <= maxGatingFails',
    maxGatingFails: Math.ceil(percentile(looCounts, 0.95)),
    gatingMetricCount: GATING.length,
    leaveOneOut: {
      note: 'each corpus track scored against a band built from the other tracks',
      failCounts: Object.fromEntries(results.map((r, i) => [r.file, looCounts[i]])),
      mean: mean(looCounts), median: median(looCounts), max: Math.max(...looCounts),
      acceptedAtThisBudget: looCounts.filter(c => c <= Math.ceil(percentile(looCounts, 0.95))).length,
    },
  };
  for (const k of NON_GATING) {
    const vals = results.map(r => r.metrics[k]);
    band.nonGating[k] = { lo: percentile(vals, 0.05), hi: percentile(vals, 0.95), median: median(vals), min: Math.min(...vals), max: Math.max(...vals), note: 'NON-GATING: a limiter plus a gain stage sets this to any value. Reported to prove the band is not a loudness band.' };
  }
  return band;
}

function scoreAgainstBand(result, band) {
  const rows = [];
  let fails = 0;
  for (const k of GATING) {
    const v = result.metrics[k];
    const b = band.gating[k];
    if (!b) continue;
    const width = (b.hi - b.lo) || 1e-9;
    let dist = 0, pass = true;
    if (v < b.lo) { dist = (v - b.lo) / width; pass = false; }
    else if (v > b.hi) { dist = (v - b.hi) / width; pass = false; }
    if (!pass) fails++;
    rows.push({ metric: k, value: v, lo: b.lo, hi: b.hi, pass, distBandWidths: dist, gating: true });
  }
  for (const k of NON_GATING) {
    const v = result.metrics[k];
    const b = band.nonGating[k];
    if (!b) continue;
    const width = (b.hi - b.lo) || 1e-9;
    let dist = 0;
    if (v < b.lo) dist = (v - b.lo) / width;
    else if (v > b.hi) dist = (v - b.hi) / width;
    rows.push({ metric: k, value: v, lo: b.lo, hi: b.hi, pass: dist === 0, distBandWidths: dist, gating: false });
  }
  const budget = band.acceptance ? band.acceptance.maxGatingFails : 0;
  return { file: result.file, gatingFails: fails, maxGatingFails: budget, verdict: fails <= budget ? 'PASS' : 'FAIL', rows };
}

// ---------------------------------------------------------------------------
// Deliberately-bad control signals (calibration). Generated, not sampled.
// ---------------------------------------------------------------------------

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

function squareOsc(phase) { return phase % 1 < 0.5 ? 1 : -1; }

function makeControls(outDir, sr = 44100, dur = 90) {
  fs.mkdirSync(outDir, { recursive: true });
  const n = Math.round(sr * dur);

  // (a) one sustained square-wave note for the whole duration
  {
    const x = new Float32Array(n);
    const f = midiHz(69);
    let ph = 0;
    for (let i = 0; i < n; i++) { x[i] = 0.5 * squareOsc(ph); ph += f / sr; }
    writeWav(path.join(outDir, 'control-a-sustained-square.wav'), x, sr);
  }

  // (b) uniformly-random chromatic notes at a fixed rate (8 notes/sec)
  {
    const x = new Float32Array(n);
    const rnd = mulberry32(0xC0FFEE);
    const noteLen = Math.round(sr / 8);
    let ph = 0;
    for (let s = 0; s < n; s += noteLen) {
      const m = 48 + Math.floor(rnd() * 36); // uniform over 3 chromatic octaves
      const f = midiHz(m);
      const len = Math.min(noteLen, n - s);
      for (let i = 0; i < len; i++) {
        const env = Math.min(1, i / 64) * Math.min(1, (len - i) / 64);
        x[s + i] = 0.5 * env * squareOsc(ph);
        ph += f / sr;
      }
    }
    writeWav(path.join(outDir, 'control-b-random-notes.wav'), x, sr);
  }

  // (c) one bar, looped verbatim for the whole duration
  {
    const bpm = 120, beat = 60 / bpm, bar = 4 * beat; // 2 s bar
    const barN = Math.round(bar * sr);
    const barBuf = new Float32Array(barN);
    // lead: eight eighth notes over a C major arpeggio; bass: root on beats
    const lead = [60, 64, 67, 72, 67, 64, 60, 64];
    const eighth = Math.round(barN / 8);
    let ph = 0;
    for (let k = 0; k < 8; k++) {
      const f = midiHz(lead[k]);
      for (let i = 0; i < eighth && k * eighth + i < barN; i++) {
        const env = Math.min(1, i / 64) * Math.min(1, (eighth - i) / 200);
        barBuf[k * eighth + i] += 0.35 * env * squareOsc(ph);
        ph += f / sr;
      }
      ph = 0;
    }
    let bph = 0;
    const quarter = Math.round(barN / 4);
    for (let k = 0; k < 4; k++) {
      const f = midiHz(36);
      for (let i = 0; i < quarter && k * quarter + i < barN; i++) {
        const env = Math.min(1, i / 64) * Math.min(1, (quarter - i) / 400);
        barBuf[k * quarter + i] += 0.35 * env * squareOsc(bph);
        bph += f / sr;
      }
      bph = 0;
    }
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = barBuf[i % barN];
    writeWav(path.join(outDir, 'control-c-one-bar-loop.wav'), x, sr);
  }
  return outDir;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

function printSingle(r) {
  console.log(`\n${r.file}  (${r.durationSec.toFixed(1)} s, ${r.sampleRate} Hz, ${r.windows} x ${r.windowSeconds}s window${r.windows > 1 ? 's' : ''}, median across windows)\n`);
  const w = 24;
  console.log('  GATING (structure — a limiter cannot fake these)');
  for (const k of GATING) console.log(`    ${k.padEnd(w)} ${fmt(r.metrics[k]).padStart(12)}`);
  console.log('  NON-GATING (loudness — a limiter fakes all of these; they gate nothing)');
  for (const k of NON_GATING) console.log(`    ${k.padEnd(w)} ${fmt(r.metrics[k]).padStart(12)}`);
  console.log('  REPORTED, NOT GATING (see GATING comment in this file for why)');
  for (const k of INFO) console.log(`    ${k.padEnd(w)} ${fmt(r.metrics[k]).padStart(12)}`);
}

function printScore(s) {
  console.log(`\n${s.file} — ${s.verdict} (${s.gatingFails} gating metric${s.gatingFails === 1 ? '' : 's'} out of band; budget is ${s.maxGatingFails})\n`);
  console.log('  metric                        value        band(lo..hi)              result    dist(bandwidths)');
  for (const r of s.rows) {
    const tag = r.gating ? (r.pass ? 'PASS' : 'FAIL') : (r.pass ? 'in   ' : 'out  ');
    const label = r.gating ? r.metric : r.metric + ' *';
    console.log(`  ${label.padEnd(28)} ${fmt(r.value).padStart(10)}   ${(fmt(r.lo) + ' .. ' + fmt(r.hi)).padStart(22)}   ${tag.padEnd(8)} ${(r.distBandWidths >= 0 ? '+' : '') + fmt(r.distBandWidths, 2)}`);
  }
  console.log('  * = NON-GATING loudness metric (limiter-fakeable); shown for transparency, never gates.');
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const get = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };

  const mc = get('--make-controls');
  if (mc) { makeControls(path.resolve(mc)); console.log(`controls written to ${path.resolve(mc)}`); return; }

  const corpus = get('--corpus');
  if (corpus) {
    const dir = path.resolve(corpus);
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.wav')).sort();
    if (!files.length) throw new Error(`no .wav files in ${dir}`);
    const results = [];
    for (const f of files) {
      const r = analyzeFile(path.join(dir, f));
      results.push(r);
      if (!json) console.error(`measured ${r.file} (${r.durationSec.toFixed(0)}s, ${r.windows} window(s))`);
    }
    const band = emitBand(results);
    const out = get('--emit-band');
    if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(path.resolve(out), JSON.stringify(band, null, 2)); }
    if (json) console.log(JSON.stringify({ band, tracks: results }, null, 2));
    else {
      console.log(`\nBand from ${results.length} tracks (p05..p95):\n`);
      for (const k of GATING) { const b = band.gating[k]; console.log(`  ${k.padEnd(24)} ${fmt(b.lo).padStart(10)} .. ${fmt(b.hi).padStart(10)}   (median ${fmt(b.median)})`); }
      console.log('\n  NON-GATING (limiter-fakeable, gates nothing):');
      for (const k of NON_GATING) { const b = band.nonGating[k]; console.log(`  ${k.padEnd(24)} ${fmt(b.lo).padStart(10)} .. ${fmt(b.hi).padStart(10)}   (median ${fmt(b.median)})`); }
      if (out) console.log(`\nwrote ${out}`);
    }
    return;
  }

  const bandPath = get('--band');
  const files = argv.filter(a => !a.startsWith('--') && a !== bandPath && a !== corpus && a !== get('--emit-band') && a !== mc);
  if (!files.length) { console.error('usage: audio-metrics.mjs <file.wav> [--json] | --corpus <dir> --emit-band <out.json> | --band <band.json> <file.wav> | --make-controls <dir>'); process.exit(2); }

  if (bandPath) {
    const band = JSON.parse(fs.readFileSync(path.resolve(bandPath), 'utf8'));
    const scores = files.map(f => scoreAgainstBand(analyzeFile(path.resolve(f)), band));
    if (json) console.log(JSON.stringify(scores, null, 2));
    else scores.forEach(printScore);
    return;
  }

  const results = files.map(f => analyzeFile(path.resolve(f)));
  if (json) console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  else results.forEach(printSingle);
}

main();
