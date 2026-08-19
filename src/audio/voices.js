// src/audio/voices.js — the chip voices.
//
// Four voice families, all rendered from tables built in wavetable.js:
//   pulse    — 12.5 / 25 / 50 / 75 % duty, the two melodic channels
//   triangle — 4-bit staircase, the bass channel
//   noise    — 15-bit LFSR, long (hiss) and short (metallic) modes
//   thump    — a pitch-swept triangle, the kick, exactly as chip music does it
//
// Every voice renders into an absolute sample range and writes only the part of
// itself that falls inside [absFrom, absTo). Phase is always integrated from
// the note's own start, so the output of a note does not depend on where the
// render window boundaries fall. That is what makes a 0.5 s "first buffer"
// render bit-identical to the same span of a full 60 s render.

import { tableFor, bandOf, TBL, pulseRms } from './wavetable.js';

export const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

/** Linear ADSR in seconds, evaluated at a sample offset within the note. */
function envAt(i, len, sr, env) {
  const a = Math.max(1, Math.round(env.a * sr));
  const d = Math.max(1, Math.round(env.d * sr));
  const r = Math.max(1, Math.round(env.r * sr));
  const sus = Math.max(0, len - r);
  let v;
  if (i < a) v = i / a;
  else if (i < a + d) v = 1 + (env.s - 1) * (i - a) / d;
  else v = env.s;
  if (i >= sus) v *= Math.max(0, 1 - (i - sus) / r);
  return v;
}

/**
 * Render one tonal note.
 *
 * @param out       destination Float32Array covering [absFrom, absTo)
 * @param note      { start, len (samples), midi, vel }
 * @param patch     { shape, env, gain, vib:{rate,depth,delay}, pwm:[shape...] }
 */
export function renderTone(out, absFrom, absTo, sr, note, patch) {
  const s0 = note.start, s1 = note.start + note.len;
  if (s1 <= absFrom || s0 >= absTo) return;
  const f0 = midiToHz(note.midi);
  const band = bandOf(f0);
  const shapes = patch.pwm && patch.pwm.length ? patch.pwm : [patch.shape];
  const tables = shapes.map(s => tableFor(s, band, sr));
  const norm = patch.shape.startsWith('p:') ? 1 / pulseRms(Number(patch.shape.slice(2))) : 1;
  const gain = patch.gain * note.vel * norm;
  const vib = patch.vib;
  const pwmRate = patch.pwmRate || 0;

  let ph = 0;
  const base = f0 / sr;
  const end = Math.min(s1, absTo);
  for (let i = s0; i < end; i++) {
    const t = i - s0;
    let inc = base;
    if (vib && t > vib.delay * sr) {
      const lfo = Math.sin(2 * Math.PI * vib.rate * (t / sr - vib.delay));
      inc = base * Math.pow(2, vib.depth * lfo / 12);
    }
    if (i >= absFrom) {
      const e = envAt(t, note.len, sr, patch.env);
      if (e > 0) {
        let tbl = tables[0];
        if (tables.length > 1) {
          const k = pwmRate > 0
            ? Math.floor(t / sr * pwmRate) % tables.length
            : Math.min(tables.length - 1, Math.floor(tables.length * t / note.len));
          tbl = tables[k];
        }
        const x = ph * TBL;
        const idx = x | 0;
        const fr = x - idx;
        out[i - absFrom] += gain * e * (tbl[idx] + (tbl[idx + 1] - tbl[idx]) * fr);
      }
    }
    ph += inc;
    if (ph >= 1) ph -= (ph | 0);
  }
}

/**
 * 15-bit NES LFSR noise. Long mode taps bit0^bit1 (32767-step hiss); short mode
 * taps bit0^bit6 (93-step, audibly pitched). Sample-and-hold at `period`
 * samples, which is what gives chip noise its band-limited, gritty character
 * rather than flat white.
 */
export function renderNoise(out, absFrom, absTo, sr, note, patch) {
  const s0 = note.start, s1 = note.start + note.len;
  if (s1 <= absFrom || s0 >= absTo) return;
  let reg = patch.seedReg || 1;
  const shortMode = !!patch.short;
  let hold = 0, acc = 0;
  const period = Math.max(1, patch.period);
  const gain = patch.gain * note.vel;
  const sweep = patch.periodSweep || 0;   // multiplicative, per second
  const end = Math.min(s1, absTo);
  let lp = 0;
  const lpK = patch.lp === undefined ? 1 : patch.lp;
  for (let i = s0; i < end; i++) {
    const t = i - s0;
    const per = Math.max(1, period * Math.pow(2, sweep * t / sr));
    if (acc <= 0) {
      const b0 = reg & 1;
      const b1 = shortMode ? (reg >> 6) & 1 : (reg >> 1) & 1;
      reg = (reg >> 1) | (((b0 ^ b1) & 1) << 14);
      hold = (reg & 1) ? 1 : -1;
      acc += per;
    }
    acc -= 1;
    lp += lpK * (hold - lp);
    if (i >= absFrom) {
      const e = envAt(t, note.len, sr, patch.env);
      if (e > 0) out[i - absFrom] += gain * e * lp;
    }
  }
}

/**
 * A continuous ambience bed — the sound of the place, under the music.
 *
 * The same 15-bit LFSR as the drum channel, sample-and-held at `period`,
 * one-pole lowpassed, optionally one-pole highpassed, and swelled by a slow
 * raised-cosine. No pitch, no rhythm, no envelope: it starts before the first
 * note and ends after the last, which is what makes it a room rather than an
 * instrument.
 *
 * PHASE IS INTEGRATED FROM ABSOLUTE SAMPLE ZERO, not from the render window, so
 * a 0.5 s first-buffer render is bit-identical to the same span of a full 60 s
 * one — the same requirement every other voice in this file meets. That costs a
 * warm-up loop over the skipped samples, which is why the LFSR is advanced
 * without writing anything until the window opens.
 */
export function renderAmbience(out, absFrom, absTo, sr, layer, reg0) {
  let reg = reg0 || 1;
  const period = Math.max(1, layer.period);
  const lpK = Math.max(1e-4, Math.min(1, layer.lp));
  const hpK = layer.hp > 0 ? Math.exp(-2 * Math.PI * layer.hp / sr) : 0;
  const depth = Math.max(0, Math.min(1, layer.depth));
  // The swell is evaluated on a 64-sample grid and interpolated between grid
  // points. A cosine per sample cost 180 ms of a 60 s render for three layers —
  // most of the ambience budget — to describe a curve whose whole period is ten
  // seconds. The grid step is 1.5 ms; the error is below the float noise floor.
  const STEP = 64;
  const swellAt = (i) => {
    const p = layer.swellHz * (i / sr) + layer.swellPhase;
    return 1 - depth + depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * p));
  };
  let hold = 0, acc = 0, lp = 0, hpPrevIn = 0, hpPrevOut = 0;
  let sA = swellAt(0), sB = swellAt(STEP), sD = (sB - sA) / STEP, sCur = sA, sN = STEP;
  for (let i = 0; i < absTo; i++) {
    if (i === sN) { sA = sB; sB = swellAt(sN + STEP); sD = (sB - sA) / STEP; sCur = sA; sN += STEP; }
    if (acc <= 0) {
      const b0 = reg & 1, b1 = (reg >> 1) & 1;
      reg = (reg >> 1) | (((b0 ^ b1) & 1) << 14);
      hold = (reg & 1) ? 1 : -1;
      acc += period;
    }
    acc -= 1;
    lp += lpK * (hold - lp);
    let v = lp;
    if (hpK) { const y = hpK * (hpPrevOut + v - hpPrevIn); hpPrevIn = v; hpPrevOut = y; v = y; }
    if (i >= absFrom) out[i - absFrom] += layer.gain * sCur * v;
    sCur += sD;
  }
}

/** Kick: a triangle whose pitch falls from f0 to f1 over the note. */
export function renderThump(out, absFrom, absTo, sr, note, patch) {
  const s0 = note.start, s1 = note.start + note.len;
  if (s1 <= absFrom || s0 >= absTo) return;
  const f0 = patch.f0, f1 = patch.f1;
  const tbl = tableFor('tri', bandOf(f0), sr);
  const gain = patch.gain * note.vel;
  let ph = 0;
  const end = Math.min(s1, absTo);
  for (let i = s0; i < end; i++) {
    const t = i - s0;
    const u = t / note.len;
    const f = f0 * Math.pow(f1 / f0, Math.min(1, u * 3));
    if (i >= absFrom) {
      const e = envAt(t, note.len, sr, patch.env);
      if (e > 0) {
        const x = ph * TBL;
        const idx = x | 0;
        const fr = x - idx;
        out[i - absFrom] += gain * e * (tbl[idx] + (tbl[idx + 1] - tbl[idx]) * fr);
      }
    }
    ph += f / sr;
    if (ph >= 1) ph -= (ph | 0);
  }
}
