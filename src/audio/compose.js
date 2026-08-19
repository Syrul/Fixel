// src/audio/compose.js — the symbolic composer.
//
// Input: a seed string. Output: a Song — a plain, inspectable object of bars,
// chords and note lists in sixteenth-note ticks. No audio, no sample rate, no
// oscillators. `tools/render-audio.mjs --dump-song <seed>` prints it.
//
// The separation is the whole point: a note list can be diffed, counted and
// argued about, and the renderer below it can be swapped without touching a
// single musical decision. Every draw comes from a named Rng stream (see
// src/core/rng.js LAW 2) and per-section decisions use per-section stream
// names, so adding a section later cannot re-roll an earlier one.

import { Rng } from '../core/rng.js';
import {
  SCALES, QUALITIES, PROGRESSIONS, RHYTHM_CELLS, CONTOURS,
  DRUM_PATTERNS, BASS_FIGURES, ARP_SHAPES, PC_NAMES,
  chordTones, degreeStep, inShadow,
} from './theory.js';

const TICKS_PER_BAR = 16;

// Macro form. Repeated A-variants placed within ~13 s of each other so that a
// 30 s analysis window contains at least one section-scale repeat: the
// self-similarity lag search in the bar tops out at half a window (15 s).
const FORM = [
  { kind: 'intro', bars: 4 },
  { kind: 'A', bars: 8, motif: 'A' },
  { kind: 'A2', bars: 8, motif: 'A' },
  { kind: 'B', bars: 8, motif: 'B' },
  { kind: 'A3', bars: 8, motif: 'A' },
  { kind: 'C', bars: 8, motif: 'C' },
  { kind: 'A4', bars: 8, motif: 'A' },
  { kind: 'outro', bars: 4 },
];

const TEXTURES = {
  intro: { drums: 'light', arp: 'eighth', lead: 'none', harmony: 'pad', bassFig: 4, leadOct: 0 },
  A: { drums: 'full', arp: 'eighth', lead: 'motif', harmony: 'stab', bassFig: null, leadOct: 0 },
  A2: { drums: 'full', arp: 'sixteenth', lead: 'motif', harmony: 'stab', bassFig: null, leadOct: 0 },
  B: { drums: 'full', arp: 'off', lead: 'motif', harmony: 'counter', bassFig: null, leadOct: 0 },
  A3: { drums: 'busy', arp: 'eighth', lead: 'motif', harmony: 'stab', bassFig: null, leadOct: 12 },
  C: { drums: 'light', arp: 'sixteenth', lead: 'motif', harmony: 'pad', bassFig: 7, leadOct: 0 },
  A4: { drums: 'busy', arp: 'sixteenth', lead: 'motif', harmony: 'stab', bassFig: null, leadOct: 0 },
  outro: { drums: 'light', arp: 'eighth', lead: 'motif', harmony: 'pad', bassFig: 4, leadOct: 0 },
};

const LEAD_SHAPES = ['p:0.125', 'p:0.25', 'p:0.5'];
const ARP_SHAPES_W = ['p:0.125', 'p:0.25'];

export function composeSong(seed, opts = {}) {
  const seconds = opts.seconds ?? 60;
  const rng = new Rng(seed);

  // ---- global parameters ------------------------------------------------
  // Tempo is constrained to 140..172 BPM. That is a musical range, but it is
  // also chosen so the bar length (1.40..1.71 s) lands the autocorrelation
  // tempo estimate at 35..43 BPM, inside the corpus band of 32.5..142.9 — the
  // estimator locks to the bar, not the beat, on music this dense.
  const bpm = rng.stream('audio.tempo').int(140, 172);
  const beatSec = 60 / bpm;
  const barSec = 4 * beatSec;
  const secPerTick = beatSec / 4;

  const tonicPc = rng.stream('audio.key.tonic').int(0, 11);
  const mode = rng.stream('audio.key.mode').weighted([
    ['minor', 30], ['major', 26], ['dorian', 14], ['mixolydian', 10],
    ['harmonicMinor', 8], ['phrygian', 6], ['lydian', 6],
  ]);
  const scale = SCALES[mode];
  const progFamily = PROGRESSIONS[mode] ? mode : (mode === 'harmonicMinor' ? 'minor' : 'major');

  const totalBars = Math.max(8, Math.ceil(seconds / barSec));

  // ---- form -------------------------------------------------------------
  const sections = [];
  let bar = 0, fi = 0;
  while (bar < totalBars) {
    const f = FORM[fi % FORM.length];
    const idx = sections.length;
    sections.push({
      index: idx, kind: f.kind, motif: f.motif || null,
      startBar: bar, bars: Math.min(f.bars, totalBars - bar),
      pass: Math.floor(fi / FORM.length),
    });
    bar += f.bars; fi++;
  }

  // ---- harmony ----------------------------------------------------------
  // One chord per bar. Chord-per-bar is the harmonic rhythm the novelty
  // detector needs: it computes a 2 s-vs-2 s chroma distance and enforces a 2 s
  // minimum gap between accepted boundaries, so a chord change slower than
  // every other bar cannot produce the corpus rate of ~0.29 boundaries/s.
  const progPool = PROGRESSIONS[progFamily];
  const progOf = new Map();
  for (const s of sections) {
    const st = rng.stream(`audio.harmony.prog.${s.kind}.${s.pass}`);
    let p;
    if (s.kind === 'B') p = progPool[st.int(0, progPool.length - 1)];
    else if (s.kind === 'C') p = progPool[st.int(0, progPool.length - 1)];
    else if (s.motif === 'A') p = progOf.get('A') || progPool[st.int(0, progPool.length - 1)];
    else p = progPool[st.int(0, progPool.length - 1)];
    if (s.motif === 'A' && !progOf.has('A')) progOf.set('A', p);
    s.prog = p;
  }

  const chords = [];
  for (const s of sections) {
    for (let b = 0; b < s.bars; b++) {
      const [off, qual] = s.prog[b % s.prog.length];
      const ct = chordTones(tonicPc, off, qual);
      chords.push({
        bar: s.startBar + b, section: s.index,
        rootPc: ct.root, quality: qual, intervals: ct.intervals, pcs: ct.pcs,
      });
    }
  }

  // ---- timbre choices ---------------------------------------------------
  const leadShape = {};
  const arpShape = {};
  for (const s of sections) {
    const st = rng.stream(`audio.timbre.${s.index}`);
    leadShape[s.index] = LEAD_SHAPES[st.int(0, LEAD_SHAPES.length - 1)];
    arpShape[s.index] = ARP_SHAPES_W[st.int(0, ARP_SHAPES_W.length - 1)];
  }

  // ---- motifs -----------------------------------------------------------
  // A motif is 2 bars of (rhythm, contour). Sections sharing a motif letter
  // share the raw material and differ by variation, which is what puts
  // repeatStrength in the middle of the band instead of at either end.
  const motifs = {};
  for (const letter of ['A', 'B', 'C']) {
    const st = rng.stream(`audio.motif.${letter}`);
    const cells = [RHYTHM_CELLS[st.int(0, RHYTHM_CELLS.length - 1)],
      RHYTHM_CELLS[st.int(0, RHYTHM_CELLS.length - 1)]];
    const contour = CONTOURS[st.int(0, CONTOURS.length - 1)];
    motifs[letter] = { cells, contour, startDeg: st.int(-2, 4) };
  }

  const tracks = { lead: [], harmony: [], arp: [], bass: [], drums: [] };
  const chordAt = b => chords[Math.min(chords.length - 1, b)];

  // ---- bass -------------------------------------------------------------
  const BASS_LO = 33, BASS_HI = 50;
  for (const s of sections) {
    const st = rng.stream(`audio.bass.${s.index}`);
    const figIdx = TEXTURES[s.kind].bassFig ?? st.int(0, BASS_FIGURES.length - 1);
    for (let b = 0; b < s.bars; b++) {
      const ch = chordAt(s.startBar + b);
      const fig = (b % 4 === 3 && st.bool(0.35))
        ? BASS_FIGURES[st.int(0, BASS_FIGURES.length - 1)]
        : BASS_FIGURES[figIdx];
      let rootMidi = BASS_LO + (((ch.rootPc - BASS_LO) % 12) + 12) % 12;
      while (rootMidi < BASS_LO) rootMidi += 12;
      while (rootMidi > BASS_HI - 5) rootMidi -= 12;
      for (const [t, d, ti] of fig) {
        const iv = ti < 0 ? -12 : ch.intervals[Math.min(ti, ch.intervals.length - 1)];
        tracks.bass.push({
          tick: (s.startBar + b) * TICKS_PER_BAR + t,
          dur: d, midi: rootMidi + iv, vel: t === 0 ? 1 : 0.82,
        });
      }
    }
  }
  const bassAtTick = new Map();
  for (const n of tracks.bass) bassAtTick.set(n.tick, n.midi);
  const bassNear = tick => {
    for (let t = tick; t >= tick - 8; t--) if (bassAtTick.has(t)) return bassAtTick.get(t);
    return BASS_LO;
  };

  // ---- arpeggio ---------------------------------------------------------
  const ARP_LO = 55, ARP_HI = 71;
  for (const s of sections) {
    const mode_ = TEXTURES[s.kind].arp;
    if (mode_ === 'off') continue;
    const st = rng.stream(`audio.arp.${s.index}`);
    const shape = ARP_SHAPES[st.int(0, ARP_SHAPES.length - 1)];
    const step = mode_ === 'sixteenth' ? 1 : 2;
    for (let b = 0; b < s.bars; b++) {
      const ch = chordAt(s.startBar + b);
      const skipBar = st.bool(0.12);
      if (skipBar) continue;
      for (let t = 0; t < TICKS_PER_BAR; t += step) {
        if (step === 1 && (t % 4 === 3) && st.bool(0.35)) continue;   // holes keep it from being a machine
        const k = shape[(t / step) % shape.length];
        const iv = ch.intervals[k % ch.intervals.length];
        let m = ARP_LO + (((ch.rootPc - ARP_LO) % 12) + 12) % 12 + iv;
        while (m > ARP_HI) m -= 12;
        while (m < ARP_LO) m += 12;
        if (inShadow(m, [bassNear((s.startBar + b) * TICKS_PER_BAR + t)])) {
          const alt = m + (m + 2 <= ARP_HI ? 2 : -2);
          if (!inShadow(alt, [bassNear((s.startBar + b) * TICKS_PER_BAR + t)])) m = alt;
        }
        tracks.arp.push({
          tick: (s.startBar + b) * TICKS_PER_BAR + t,
          dur: step, midi: m, vel: t % 4 === 0 ? 0.85 : 0.62,
        });
      }
    }
  }

  // ---- harmony / counter-line -------------------------------------------
  const HARM_LO = 57, HARM_HI = 72;
  for (const s of sections) {
    const kind = TEXTURES[s.kind].harmony;
    const st = rng.stream(`audio.harm.${s.index}`);
    for (let b = 0; b < s.bars; b++) {
      const ch = chordAt(s.startBar + b);
      const base = HARM_LO + (((ch.rootPc - HARM_LO) % 12) + 12) % 12;
      // third and fifth (or seventh) — never the octave, which the salience
      // grid would fold into the root
      const picks = [ch.intervals[1], ch.intervals[2 % ch.intervals.length]];
      if (ch.intervals.length > 3 && st.bool(0.5)) picks[1] = ch.intervals[3];
      const events = kind === 'pad'
        ? [[0, 16]]
        : kind === 'counter'
          ? [[0, 4], [6, 2], [8, 4], [12, 4]]
          : [[2, 2], [6, 2], [10, 2], [14, 2]];
      for (const [t, d] of events) {
        for (const iv of picks) {
          let m = base + iv;
          while (m > HARM_HI) m -= 12;
          while (m < HARM_LO) m += 12;
          const lower = [bassNear((s.startBar + b) * TICKS_PER_BAR + t)];
          if (inShadow(m, lower)) m = m + 12 <= HARM_HI ? m + 12 : m - 1;
          tracks.harmony.push({
            tick: (s.startBar + b) * TICKS_PER_BAR + t, dur: d, midi: m,
            vel: kind === 'pad' ? 0.5 : 0.66,
          });
        }
      }
    }
  }

  // ---- lead melody ------------------------------------------------------
  const LEAD_CENTRE = 79, LEAD_LO = 72, LEAD_HI = 91;
  for (const s of sections) {
    if (TEXTURES[s.kind].lead === 'none') continue;
    const letter = s.motif || 'B';
    const mot = motifs[letter];
    const st = rng.stream(`audio.melody.${s.index}`);
    const orn = rng.stream(`audio.melody.orn.${s.index}`);
    const oct = TEXTURES[s.kind].leadOct;
    let cur = degreeStep(LEAD_CENTRE, mot.startDeg, tonicPc, scale) + oct;

    for (let b = 0; b < s.bars; b++) {
      const globalBar = s.startBar + b;
      const ch = chordAt(globalBar);
      const phraseBar = b % 2;
      // variation: every other 2-bar cell mutates the rhythm slightly
      let cell = mot.cells[phraseBar];
      if (b >= 4 && st.bool(0.55)) cell = RHYTHM_CELLS[st.int(0, RHYTHM_CELLS.length - 1)];
      const n = cell.length;
      let t = 0;
      for (let j = 0; j < n; j++) {
        const dur = cell[j];
        const cIdx = Math.min(mot.contour.length - 1, Math.floor(j * mot.contour.length / n));
        const targetDeg = mot.contour[cIdx] + (b >= 4 ? 1 : 0);
        // move toward the contour target rather than jumping to it: the line
        // stays connected, and the interval histogram stays step-weighted
        const want = degreeStep(LEAD_CENTRE + oct, mot.startDeg + targetDeg, tonicPc, scale);
        const delta = want - cur;
        let next = cur + Math.max(-9, Math.min(9, delta));
        // strong beats take a chord tone; weak beats may take a chromatic
        // neighbour, which is where the extra pitch classes come from
        if (t % 8 === 0) {
          let best = next, bd = 99;
          for (let d = -4; d <= 4; d++) {
            const cand = next + d;
            if (!ch.pcs.includes(((cand % 12) + 12) % 12)) continue;
            if (Math.abs(d) < bd) { bd = Math.abs(d); best = cand; }
          }
          next = best;
        } else if (orn.bool(0.16)) {
          next = next + (orn.bool(0.5) ? -1 : 1);
        } else {
          next = degreeStep(next, 0, tonicPc, scale);
        }
        while (next > LEAD_HI) next -= 12;
        while (next < LEAD_LO) next += 12;
        const rest = orn.bool(t === 0 ? 0.03 : 0.14);
        if (!rest) {
          tracks.lead.push({
            tick: globalBar * TICKS_PER_BAR + t,
            dur: Math.max(1, dur - (dur >= 4 ? 1 : 0)),
            midi: next, vel: t === 0 ? 1 : 0.85,
          });
          // ornament: a quick 16th neighbour before a long note
          if (dur >= 6 && orn.bool(0.3)) {
            tracks.lead.push({
              tick: globalBar * TICKS_PER_BAR + t + dur - 1, dur: 1,
              midi: degreeStep(next, orn.bool(0.5) ? 1 : -1, tonicPc, scale), vel: 0.7,
            });
          }
        }
        cur = next;
        t += dur;
      }
    }
  }

  // ---- drums ------------------------------------------------------------
  for (const s of sections) {
    const dens = TEXTURES[s.kind].drums;
    const st = rng.stream(`audio.drums.${s.index}`);
    const kick = DRUM_PATTERNS.kick[st.int(0, DRUM_PATTERNS.kick.length - 1)];
    const snare = DRUM_PATTERNS.snare[st.int(0, DRUM_PATTERNS.snare.length - 1)];
    const hat = DRUM_PATTERNS.hat[st.int(0, DRUM_PATTERNS.hat.length - 1)];
    for (let b = 0; b < s.bars; b++) {
      const t0 = (s.startBar + b) * TICKS_PER_BAR;
      const fill = b % 4 === 3 && dens !== 'light' && st.bool(0.6);
      for (let t = 0; t < TICKS_PER_BAR; t++) {
        if (kick[t] && dens !== 'light') tracks.drums.push({ tick: t0 + t, dur: 3, kind: 'kick', vel: kick[t] / 3 });
        else if (kick[t] && t % 8 === 0) tracks.drums.push({ tick: t0 + t, dur: 3, kind: 'kick', vel: kick[t] / 3 });
        if (snare[t] && dens !== 'light') tracks.drums.push({ tick: t0 + t, dur: 2, kind: 'snare', vel: snare[t] / 3 });
        if (hat[t]) {
          const busy = dens === 'busy' || dens === 'full';
          if (busy || t % 4 === 0) tracks.drums.push({ tick: t0 + t, dur: 1, kind: 'hat', vel: hat[t] / 2.4 });
        }
        if (fill && t >= 12) tracks.drums.push({ tick: t0 + t, dur: 1, kind: 'snare', vel: 0.55 + 0.12 * (t - 12) });
      }
      if (b === 0 && s.kind !== 'intro') tracks.drums.push({ tick: t0, dur: 8, kind: 'crash', vel: 0.9 });
    }
  }

  for (const k of Object.keys(tracks)) tracks[k].sort((a, b) => a.tick - b.tick || a.midi - b.midi);

  return {
    seed: String(seed), seconds, bpm, beatSec, barSec, secPerTick,
    ticksPerBar: TICKS_PER_BAR, totalBars,
    key: { tonicPc, tonic: PC_NAMES[tonicPc], mode },
    sections: sections.map(s => ({
      index: s.index, kind: s.kind, motif: s.motif, startBar: s.startBar, bars: s.bars,
      leadShape: leadShape[s.index], arpShape: arpShape[s.index],
      texture: TEXTURES[s.kind],
    })),
    chords: chords.map(c => ({
      bar: c.bar, root: PC_NAMES[c.rootPc], quality: c.quality, pcs: c.pcs,
    })),
    tracks,
    shapes: { lead: leadShape, arp: arpShape },
    noteCounts: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, v.length])),
  };
}

export { TICKS_PER_BAR };
