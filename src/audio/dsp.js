// src/audio/dsp.js — the numeric primitives the chip engine needs.
//
// Nothing here knows about music. FFT (used only to BUILD wavetables, never at
// render time), a biquad, and a look-ahead limiter whose gain envelope is
// computed once and applied identically to the mix and to every solo stem, so
// that the stems sum back to the mix exactly. That property is what makes a
// per-channel measurement (duty cycle, in particular) meaningful: a stem is the
// mix's own contribution from that channel, not a separate render.

/** In-place radix-2 Cooley-Tukey complex FFT. */
export function fftInPlace(re, im) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

/**
 * Real signal from Fourier coefficients:
 *   x[n] = sum_k  A[k] cos(2*pi*k*n/N) + B[k] sin(2*pi*k*n/N)
 * Only k = 1..kmax are used; DC is dropped on purpose (a pulse wave's DC term
 * is a duty-dependent offset that does nothing but eat headroom).
 */
export function synthFromCoeffs(A, B, kmax, N) {
  const re = new Float64Array(N), im = new Float64Array(N);
  const lim = Math.min(kmax, (N >> 1) - 1);
  for (let k = 1; k <= lim; k++) {
    const a = (A[k] || 0) * N / 2, b = (B[k] || 0) * N / 2;
    re[k] = a; im[k] = -b;
    re[N - k] = a; im[N - k] = b;
  }
  // inverse DFT via conjugate trick: ifft(X) = conj(fft(conj(X)))/N
  for (let i = 0; i < N; i++) im[i] = -im[i];
  fftInPlace(re, im);
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = re[i] / N;
  return out;
}

/** Forward magnitude/phase coefficients of one period sampled at N points. */
export function coeffsFromPeriod(samples) {
  const N = samples.length;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = samples[i];
  fftInPlace(re, im);
  const half = N >> 1;
  const A = new Float64Array(half), B = new Float64Array(half);
  for (let k = 1; k < half; k++) { A[k] = 2 * re[k] / N; B[k] = -2 * im[k] / N; }
  return { A, B };
}

/** Direct-form-II transposed biquad. Stateful, so chunked rendering is exact. */
export class Biquad {
  constructor(b0, b1, b2, a1, a2) {
    this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
    this.z1 = 0; this.z2 = 0;
  }
  static lowpass(fc, sr, q = Math.SQRT1_2) {
    const w = 2 * Math.PI * fc / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad(
      ((1 - cw) / 2) / a0, (1 - cw) / a0, ((1 - cw) / 2) / a0,
      (-2 * cw) / a0, (1 - alpha) / a0);
  }
  static highpass(fc, sr, q = Math.SQRT1_2) {
    const w = 2 * Math.PI * fc / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad(
      ((1 + cw) / 2) / a0, (-(1 + cw)) / a0, ((1 + cw) / 2) / a0,
      (-2 * cw) / a0, (1 - alpha) / a0);
  }
  /** Magnitude response at f, used to de-bias the duty-cycle fit. */
  mag(f, sr) {
    const w = 2 * Math.PI * f / sr;
    const cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = this.b0 + this.b1 * cw + this.b2 * c2;
    const ni = -(this.b1 * sw + this.b2 * s2);
    const dr = 1 + this.a1 * cw + this.a2 * c2;
    const di = -(this.a1 * sw + this.a2 * s2);
    return Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
  processInto(buf, from, to) {
    for (let i = from; i < to; i++) {
      const x = buf[i];
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      buf[i] = y;
    }
  }
}

/**
 * Look-ahead peak limiter that emits a GAIN ENVELOPE rather than audio.
 *
 * The envelope is derived from the mix and then multiplied into the mix and
 * into every stem, so sum(stems) === mix sample for sample. A limiter applied
 * independently per stem would break that identity and make "solo stem" a
 * different render rather than an isolated view of the same one.
 */
export function limiterGainEnvelope(mix, sr, ceiling, lookaheadMs = 5, releaseMs = 60) {
  const n = mix.length;
  const la = Math.max(1, Math.round(lookaheadMs * sr / 1000));
  const rel = Math.exp(-1 / (Math.max(1, releaseMs * sr / 1000)));
  const need = new Float64Array(n);
  // required gain at each sample, then a running max over the look-ahead window
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mix[i]);
    need[i] = a > ceiling ? ceiling / a : 1;
  }
  const g = new Float64Array(n);
  // sliding-window minimum over [i, i+la] via a monotonic deque — O(n), and
  // independent of the look-ahead length so the render stays fast.
  const dq = new Int32Array(n + 1);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[dq[tail - 1]] >= need[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + la) head++;
    g[i] = need[dq[head]];
  }
  // forward pass: exponential release so gain recovers smoothly
  let cur = 1;
  for (let i = 0; i < n; i++) {
    if (g[i] < cur) cur = g[i];
    else cur = g[i] + (cur - g[i]) * rel;
    g[i] = Math.min(1, cur);
  }
  return g;
}

export const dbToLin = db => Math.pow(10, db / 20);
export const linToDb = v => 20 * Math.log10(Math.max(v, 1e-12));
