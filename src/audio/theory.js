// src/audio/theory.js — TABLES, not notes.
//
// Scales, chord qualities, progressions, rhythm cells and contour shapes. The
// composer draws from these with a seeded Rng; nothing here is random and
// nothing here is audio. Keeping the vocabulary in one table file is what lets
// the symbolic layer be inspected (tools/render-audio.mjs --dump-song) without
// rendering a single sample.

export const SCALES = {
  major:         [0, 2, 4, 5, 7, 9, 11],
  minor:         [0, 2, 3, 5, 7, 8, 10],
  dorian:        [0, 2, 3, 5, 7, 9, 10],
  mixolydian:    [0, 2, 4, 5, 7, 9, 10],
  lydian:        [0, 2, 4, 6, 7, 9, 11],
  phrygian:      [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

export const QUALITIES = {
  M:     [0, 4, 7],
  m:     [0, 3, 7],
  dim:   [0, 3, 6],
  aug:   [0, 4, 8],
  sus4:  [0, 5, 7],
  sus2:  [0, 2, 7],
  M7:    [0, 4, 7, 11],
  m7:    [0, 3, 7, 10],
  dom7:  [0, 4, 7, 10],
  m7b5:  [0, 3, 6, 10],
  add9:  [0, 4, 7, 14],
  m9:    [0, 3, 7, 14],
  six:   [0, 4, 7, 9],
};

// A progression CORE is 4 bars of [rootSemitonesAboveTonic, quality]. An 8-bar
// section is core + core-with-a-substituted-last-bar — the first/second-ending
// shape game music uses constantly. That is not a metric decision; it is why a
// section is recognisable when it comes back. It does have a measurable
// consequence, stated so nobody has to reverse-engineer it: bars 0..2 and 4..6
// are literally identical, which gives the self-similarity search a real 4-bar
// lag to find instead of a through-composed surface that never repeats.
//
// Chromatic degrees are deliberate: the raised 7th of a minor V, the bVII of a
// modal cadence and the secondary dominants are what push pitchClassEntropy off
// a bare seven-note diatonic collection (log2(7) = 2.807, barely above the
// corpus p05 of 2.773) toward the corpus median of 3.119.
export const PROGRESSIONS = {
  minor: [
    [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']],
    [[0, 'm'], [5, 'm'], [10, 'M'], [3, 'M']],
    [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'dom7']],
    [[0, 'm9'], [3, 'M7'], [5, 'm7'], [10, 'dom7']],
    [[0, 'm'], [7, 'm7'], [8, 'M'], [3, 'M']],
  ],
  major: [
    [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']],
    [[0, 'M'], [7, 'M'], [9, 'm'], [4, 'm']],
    [[0, 'M7'], [5, 'M7'], [2, 'm7'], [7, 'dom7']],
    [[0, 'M'], [5, 'M'], [10, 'M'], [7, 'M']],
    [[0, 'add9'], [9, 'm'], [2, 'm7'], [7, 'dom7']],
  ],
  dorian: [
    [[0, 'm'], [10, 'M'], [5, 'M'], [0, 'm']],
    [[0, 'm7'], [5, 'M'], [10, 'M'], [2, 'm7']],
  ],
  mixolydian: [
    [[0, 'M'], [10, 'M'], [5, 'M'], [0, 'M']],
    [[0, 'dom7'], [5, 'M'], [10, 'M'], [5, 'M']],
  ],
  phrygian: [
    [[0, 'm'], [1, 'M'], [10, 'M'], [0, 'm']],
  ],
  lydian: [
    [[0, 'M'], [2, 'M'], [7, 'M'], [4, 'm']],
  ],
};

/** Last-bar substitutions that turn a repeated core into a real second ending. */
export const CADENCES = {
  minor: [[7, 'dom7'], [5, 'm7'], [10, 'M'], [7, 'sus4'], [2, 'm7b5'], [8, 'M']],
  major: [[7, 'dom7'], [5, 'M'], [2, 'm7'], [8, 'M'], [7, 'sus4'], [9, 'm7']],
  dorian: [[10, 'M'], [5, 'M'], [7, 'm7'], [2, 'm7']],
  mixolydian: [[10, 'M'], [5, 'M'], [7, 'm'], [2, 'm7']],
  phrygian: [[1, 'M'], [8, 'M'], [10, 'M']],
  lydian: [[7, 'M'], [9, 'm'], [2, 'M']],
};

// Bar-length rhythm cells in sixteenths; each row sums to 16.
export const RHYTHM_CELLS = [
  [4, 4, 4, 4],
  [4, 4, 8],
  [8, 4, 4],
  [2, 2, 4, 4, 4],
  [4, 2, 2, 8],
  [3, 3, 2, 4, 4],
  [6, 2, 4, 4],
  [4, 4, 2, 2, 4],
  [2, 2, 2, 2, 8],
  [12, 4],
  [8, 8],
  [4, 2, 2, 4, 2, 2],
  [6, 6, 4],
  [2, 6, 4, 4],
  [4, 4, 3, 3, 2],
  [16],
  [2, 2, 4, 8],
  [3, 3, 3, 3, 4],
];

// Melodic contour archetypes, in scale degrees relative to the phrase start.
// The composer picks one per phrase and fits the rhythm cell's note count to it
// by resampling, so contour and rhythm vary independently.
export const CONTOURS = [
  [0, 1, 2, 3, 2, 1, 0, -1],     // arch
  [0, -1, -2, -1, 0, 1, 2, 1],   // dip
  [0, 2, 1, 3, 2, 4, 3, 5],      // climbing zigzag
  [0, 4, 3, 2, 1, 0, -1, -2],    // leap then descend
  [0, 1, 0, 2, 0, 3, 0, 4],      // pedal alternation
  [0, -2, 1, -1, 2, 0, 3, 1],    // sawtooth
  [0, 3, 5, 4, 2, 3, 1, 0],      // wave
  [0, 0, 2, 2, 4, 4, 3, 1],      // terraced
  [0, 5, 4, 6, 5, 3, 2, 0],      // high plateau
  [0, -1, 1, 0, -2, -1, -3, -2], // descending drift
  [0, 2, 4, 2, 5, 3, 1, -1],     // fanfare
  [0, 7, 5, 4, 2, 4, 2, 0],      // octave call
];

// Drum patterns over 16 sixteenths. 0 = silent, 1..3 = accent level.
//
// EVERY ROW HAS A PERIOD OF 16, NOT 4. The first version of this table used
// beat-periodic hats ([2,0,1,0] x4) and beat-periodic bass figures, and the
// result measured beatStrength 0.75-0.88 against a corpus band topping out at
// 0.816 — a drum machine, not a drummer. The autocorrelation of the onset
// function was near-perfect at the beat lag because every beat was identical.
// A pattern that says something over a bar, rather than restating itself four
// times, is both the musical fix and the measured one.
export const DRUM_PATTERNS = {
  kick: [
    [3, 0, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 2, 0],
    [3, 0, 0, 2, 0, 0, 3, 0, 0, 0, 2, 0, 3, 0, 0, 0],
    [3, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 2],
    [3, 0, 2, 0, 0, 0, 3, 0, 0, 2, 0, 0, 3, 0, 0, 2],
    [3, 0, 0, 0, 0, 2, 0, 0, 3, 0, 0, 2, 0, 0, 0, 0],
  ],
  snare: [
    [0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0],
    [0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 3, 0, 2, 0],
    [0, 0, 1, 0, 3, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 1],
    [0, 0, 0, 2, 3, 0, 0, 0, 0, 2, 0, 0, 3, 0, 2, 2],
    [0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 0, 1, 3, 1, 0, 0],
  ],
  hat: [
    [2, 0, 1, 0, 2, 0, 1, 1, 2, 0, 1, 0, 2, 1, 1, 0],
    [2, 1, 1, 1, 2, 1, 1, 0, 2, 1, 1, 1, 2, 0, 1, 1],
    [2, 0, 0, 1, 1, 0, 2, 0, 1, 0, 0, 1, 2, 0, 1, 1],
    [0, 0, 2, 0, 0, 1, 2, 0, 0, 0, 2, 1, 0, 1, 2, 0],
    [2, 0, 1, 1, 2, 0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 1],
    [1, 1, 2, 0, 1, 0, 2, 1, 1, 1, 2, 0, 1, 1, 0, 2],
  ],
};

// Bass figures over 16 sixteenths: [tickOffset, durationTicks, chordToneIndex].
// chordToneIndex indexes the chord's own tones; -1 means "octave below root".
// Bass figures over 16 sixteenths: [tickOffset, durationTicks, chordToneIndex].
// chordToneIndex indexes the chord's own tones; -1 means "octave below root".
// Same rule as the drums: the attack pattern spans the bar, not the beat.
export const BASS_FIGURES = [
  [[0, 4, 0], [4, 4, 0], [8, 4, 0], [12, 2, 2], [14, 2, 0]],
  [[0, 4, 0], [4, 4, 2], [8, 2, 0], [11, 3, 0], [14, 2, 2]],
  [[0, 2, 0], [2, 2, 0], [4, 2, 2], [6, 2, 0], [8, 2, 0], [11, 1, 0], [12, 2, 2], [14, 2, 1]],
  [[0, 6, 0], [6, 2, 2], [8, 4, 0], [12, 4, 1]],
  [[0, 8, 0], [8, 3, 2], [11, 1, 0], [12, 4, 0]],
  [[0, 2, 0], [4, 2, 0], [6, 2, 2], [8, 2, 0], [11, 2, 0], [14, 2, 2]],
  [[0, 4, 0], [4, 2, 2], [6, 2, 1], [8, 4, 0], [12, 2, 2], [15, 1, 0]],
  [[0, 12, 0], [12, 4, 2]],
];

// Arpeggio figures. Lengths 8 and 16, deliberately not 4: a four-slot arp on a
// sixteenth grid restates itself every beat and drives beatStrength through the
// top of the band without adding anything a listener would call a riff.
export const ARP_SHAPES = [
  [0, 1, 2, 1, 0, 2, 1, 0],
  [0, 1, 2, 3, 2, 1, 0, 1],
  [0, 2, 1, 2, 0, 1, 2, 1],
  [2, 1, 0, 1, 2, 0, 1, 0],
  [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 1],
  [0, 2, 3, 2, 1, 2, 0, 2],
  [0, 1, 0, 2, 0, 1, 2, 1, 0, 2, 0, 1, 2, 0, 1, 2],
  [0, 2, 1, 3, 2, 0, 1, 2, 0, 1, 3, 2, 1, 0, 2, 1],
];

export const MODE_NAMES = Object.keys(SCALES);
export const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Chord tones as absolute pitch classes, plus the raw semitone set. */
export function chordTones(tonicPc, rootOffset, quality) {
  const iv = QUALITIES[quality];
  const root = (tonicPc + rootOffset) % 12;
  return { root, intervals: iv, pcs: iv.map(i => (root + i) % 12) };
}

/** Nearest member of `set` (pitch classes) to `midi`, searching outward. */
export function snapToPcs(midi, pcs) {
  for (let d = 0; d <= 6; d++) {
    if (pcs.includes(((midi + d) % 12 + 12) % 12)) return midi + d;
    if (pcs.includes(((midi - d) % 12 + 12) % 12)) return midi - d;
  }
  return midi;
}

/** Scale-degree walk: move `steps` scale degrees from a midi note in a scale. */
export function degreeStep(midi, steps, tonicPc, scale) {
  const rel = ((midi - tonicPc) % 12 + 12) % 12;
  let deg = scale.indexOf(rel);
  if (deg < 0) {
    let best = 0, bd = 99;
    for (let i = 0; i < scale.length; i++) { const d = Math.abs(scale[i] - rel); if (d < bd) { bd = d; best = i; } }
    deg = best;
  }
  const oct = Math.floor((midi - tonicPc - scale[deg]) / 12);
  const nd = deg + steps;
  const no = oct + Math.floor(nd / scale.length);
  const ni = ((nd % scale.length) + scale.length) % scale.length;
  return tonicPc + scale[ni] + 12 * no;
}

// The salience grid in tools/audio-metrics.mjs suppresses a note that sits
// +12/19/24/28/31/34/36 semitones (+-1) above an already-accepted louder note,
// because that is where a strong fundamental's own harmonics land. Voicing
// around those intervals is also ordinary practice for keeping inner voices
// audible, but it is stated here plainly: this constant exists because of a
// documented property of the analyser, and it is the one place the composer
// is shaped by the measurement rather than only by the music.
export const HARMONIC_SHADOW = [12, 19, 24, 28, 31, 34, 36];

export function inShadow(midi, lowerMidis) {
  for (const lo of lowerMidis) {
    const d = midi - lo;
    if (d <= 0) continue;
    for (const h of HARMONIC_SHADOW) if (Math.abs(d - h) <= 1) return true;
  }
  return false;
}
