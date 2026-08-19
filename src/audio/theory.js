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
  // ---- figures with HOLES IN THEM ---------------------------------------
  // Every row above this line covers all sixteen ticks with no gap, which is
  // why the bass sounded 87.2-98.7% of a 60 s post: there was nowhere in the
  // vocabulary for it to stop. These leave 4 to 9 ticks of the bar empty.
  [[0, 3, 0], [6, 2, 2], [8, 3, 0], [14, 2, 0]],
  [[0, 6, 0], [8, 4, 0]],
  [[0, 2, 0], [4, 2, 0], [8, 2, 0], [12, 2, 2]],
  [[0, 4, 0], [6, 2, 2], [10, 2, 0]],
  [[2, 2, 0], [6, 2, 2], [10, 2, 0], [14, 2, 1]],
  [[0, 3, 0], [3, 1, 2], [8, 3, 0], [11, 1, 2]],
  [[0, 7, 0], [10, 2, 2], [13, 2, 0]],
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

// HOW A POST BEGINS — which is the only part of it most listeners ever hear.
//
// Measured before this table existed, over 24 seeds: the first 5.45-8.42 s of
// EVERY post was rhythmically identical across all four tonal voices in 24 of
// 24 — the same bass figure (BASS_FIGURES[4], onsets 0,8,11,12 in every bar,
// one distinct pattern in 24 seeds), the same eighth-note arp (one distinct
// tick step in 24), the same pad struck at tick 0 and nothing else (one
// distinct onset list in 24), and NO LEAD AT ALL, because TEXTURES.intro.lead
// was the string 'none'. The first lead note of a post arrived at 5.58-8.35 s.
//
// A feed is scrolled. A post that saves its melody for the sixth second is a
// post with no melody, for most of the people who hear it. The corpus makes
// the same point from the other side: a reference track's first four seconds
// identify its own remainder 70.7% of the time and Fixel's managed 12.5%
// against a 6.3% chance floor, and Fixel was the only population measured
// whose opening carried LESS identity than its body (0.95 vs the corpus 1.82).
//
// So: the opening states the hook. Each row is a per-bar ENTRY PLAN over the
// opening section — 'L' lead, 'H' harmony, 'A' arp, 'B' bass, 'D' drums, one
// string per bar, listing the voices that sound in that bar. The lead is in
// bar 0 or bar 1 of every plan, and no plan is longer than four bars.
//
// `w` is the draw weight. Two-bar openings are weighted above four-bar ones
// because the length of the opening IS the delay before the tune arrives.
export const OPENINGS = [
  { name: 'call',     bars: 2, w: 14, plan: ['L', 'LB'] },
  { name: 'callKit',  bars: 2, w: 12, plan: ['LB', 'LBD'] },
  { name: 'inMedias', bars: 2, w: 11, plan: ['LHABD', 'LHABD'] },
  { name: 'arpCall',  bars: 2, w: 10, plan: ['A', 'LA'] },
  { name: 'hitDrop',  bars: 2, w: 10, plan: ['LBD', 'L'] },
  { name: 'duo',      bars: 2, w: 9, plan: ['LH', 'LHB'] },
  { name: 'build',    bars: 4, w: 9, plan: ['L', 'LB', 'LBA', 'LHABD'] },
  { name: 'padLift',  bars: 4, w: 8, plan: ['H', 'HL', 'HLA', 'HLABD'] },
  { name: 'groove',   bars: 4, w: 7, plan: ['BD', 'BDA', 'LBDA', 'LHABD'] },
  { name: 'bassCall', bars: 4, w: 6, plan: ['B', 'BL', 'BLH', 'LHABD'] },
  { name: 'stagger',  bars: 4, w: 4, plan: ['LA', 'L', 'LAB', 'LHABD'] },
];

// MACRO FORM, drawn per post.
//
// It used to be one module constant, so every post in the feed was the same
// arrangement: measured, 2 distinct form sequences across 24 seeds, and both of
// those were one list truncated at different bars by the render window. That is
// the other half of "they all sound kinda the same".
//
// A row is a sequence of MOTIF LETTERS. Repetition is built in on purpose —
// every row returns to a letter it has already used — because a form whose
// sections never come back is not a form, it is a list. Section LENGTHS are
// drawn separately per section, so two posts on the same row are still
// different shapes.
export const FORMS = [
  { name: 'song',    w: 14, letters: ['A', 'A', 'B', 'A', 'C', 'A'] },
  { name: 'rondo',   w: 11, letters: ['A', 'B', 'A', 'C', 'A', 'B'] },
  { name: 'binary',  w: 10, letters: ['A', 'B', 'A', 'B'] },
  { name: 'arch',    w: 10, letters: ['A', 'B', 'C', 'B', 'A'] },
  { name: 'terrace', w: 9, letters: ['A', 'A', 'B', 'B', 'C', 'A'] },
  { name: 'verse',   w: 9, letters: ['A', 'B', 'A', 'B', 'C', 'B'] },
  { name: 'strophe', w: 8, letters: ['A', 'A', 'A', 'B', 'A'] },
  { name: 'pair',    w: 8, letters: ['A', 'B', 'B', 'A', 'C'] },
  { name: 'chain',   w: 6, letters: ['A', 'B', 'C', 'A', 'B'] },
  { name: 'ritual',  w: 6, letters: ['A', 'A', 'B', 'A', 'A', 'C'] },
];

// WHICH VOICES A POST HAS AT ALL.
//
// Every post used to have all five, always, because TEXTURES was a module
// constant and no row of it ever removed a channel. Five voices is an
// arrangement decision that was made once and applied to a whole feed.
//
// The lead is in every row: it carries the hook, and the hook is why a post is
// identifiable in the four seconds most listeners give it.
//
// The weights are set on the DISTRIBUTION, not on the idea. The first draft of
// this table put the median post at three voices, and combined with the biome
// multipliers and the rest bias it pushed onsetRate to a median of 4.84/s
// against a corpus p05 of 4.58 — 5 of 12 seeds below the floor. A feed centred
// on the sparse edge is as wrong as one centred on the dense edge; it is just
// wrong in the other direction. The target is a feed that SPANS the corpus, so
// two-voice posts are the exception that makes the five-voice ones read as
// full, and the four-voice rows carry the middle.
export const ENSEMBLES = [
  { name: 'full',    w: 28, voices: ['lead', 'harmony', 'arp', 'bass', 'drums'] },
  { name: 'noArp',   w: 16, voices: ['lead', 'harmony', 'bass', 'drums'] },
  { name: 'noHarm',  w: 15, voices: ['lead', 'arp', 'bass', 'drums'] },
  { name: 'noDrums', w: 10, voices: ['lead', 'harmony', 'arp', 'bass'] },
  { name: 'trio',    w: 10, voices: ['lead', 'bass', 'drums'] },
  { name: 'chamber', w: 7, voices: ['lead', 'harmony', 'bass'] },
  { name: 'pulse',   w: 6, voices: ['lead', 'arp', 'bass'] },
  { name: 'duo',     w: 4, voices: ['lead', 'bass'] },
  { name: 'boxed',   w: 3, voices: ['lead', 'arp', 'drums'] },
  { name: 'aloft',   w: 2, voices: ['lead', 'harmony'] },
];

// WHAT A PLACE SOUNDS LIKE.
//
// docs/ROUNDS.md r5 open item 4: "One composer for four biomes. A beach and a
// mountain play the same city chiptune." The picture has known which place it
// is since biome-mix.js existed. The music never asked.
//
// Nothing here quotes anything. These are four sets of weights over vocabulary
// this file already owned, chosen so the four places differ along the axes an
// ear separates first: how fast, what mode, how many voices, how busy.
//
//   city      fast, minor-leaning, full ensembles, busy kit. The densest thing
//             the generator draws, so the densest thing it plays.
//   shore     mid, major-leaning and open, lighter kit, more pad, more space.
//   desert    slow, phrygian and harmonic minor, the fewest voices and the most
//             rest. A place with nothing in it does not play five parts.
//   highland  broad and mid-slow, dorian and minor, pad-heavy, wide register.
//
// `restBias` scales the per-section rest probabilities. `ensemble` multiplies
// the ENSEMBLES weights by name, so a desert post is far more likely to be two
// or three voices and a city post far more likely to be five.
export const BIOME_MUSIC = {
  city: {
    bpm: [140, 176],
    modes: [['minor', 30], ['dorian', 22], ['major', 18], ['mixolydian', 12],
      ['harmonicMinor', 8], ['phrygian', 6], ['lydian', 4]],
    drums: [['light', 14], ['full', 46], ['busy', 40]],
    arp: [['eighth', 34], ['sixteenth', 50], ['off', 16]],
    harmony: [['pad', 22], ['stab', 52], ['counter', 26]],
    ensemble: { full: 1.8, noArp: 1.1, noHarm: 1.2, trio: 0.9, noDrums: 0.5, chamber: 0.5, pulse: 0.8, duo: 0.4, boxed: 1.0, aloft: 0.3 },
    restBias: 0.85,
  },
  shore: {
    bpm: [114, 150],
    modes: [['major', 28], ['mixolydian', 20], ['lydian', 16], ['dorian', 14],
      ['minor', 14], ['harmonicMinor', 5], ['phrygian', 3]],
    drums: [['light', 46], ['full', 40], ['busy', 14]],
    arp: [['eighth', 44], ['sixteenth', 26], ['off', 30]],
    harmony: [['pad', 48], ['stab', 26], ['counter', 26]],
    ensemble: { full: 1.0, noArp: 1.2, noHarm: 0.9, trio: 1.1, noDrums: 1.3, chamber: 1.3, pulse: 1.0, duo: 1.1, boxed: 0.8, aloft: 1.2 },
    restBias: 1.12,
  },
  desert: {
    bpm: [100, 134],
    modes: [['phrygian', 26], ['harmonicMinor', 24], ['minor', 20], ['dorian', 14],
      ['mixolydian', 8], ['major', 6], ['lydian', 2]],
    drums: [['light', 56], ['full', 34], ['busy', 10]],
    arp: [['eighth', 34], ['sixteenth', 18], ['off', 48]],
    harmony: [['pad', 44], ['stab', 30], ['counter', 26]],
    ensemble: { full: 0.7, noArp: 1.0, noHarm: 0.9, trio: 1.3, noDrums: 1.2, chamber: 1.5, pulse: 1.1, duo: 1.6, boxed: 0.9, aloft: 1.5 },
    restBias: 1.28,
  },
  highland: {
    bpm: [108, 146],
    modes: [['dorian', 24], ['minor', 24], ['major', 18], ['lydian', 12],
      ['mixolydian', 10], ['harmonicMinor', 10], ['phrygian', 2]],
    drums: [['light', 44], ['full', 42], ['busy', 14]],
    arp: [['eighth', 40], ['sixteenth', 22], ['off', 38]],
    harmony: [['pad', 52], ['stab', 22], ['counter', 26]],
    ensemble: { full: 0.9, noArp: 1.3, noHarm: 0.9, trio: 1.1, noDrums: 1.3, chamber: 1.4, pulse: 0.9, duo: 1.0, boxed: 0.7, aloft: 1.3 },
    restBias: 1.20,
  },
};

/**
 * Used when nothing has told the composer where it is. It is the ENGINE'S OWN
 * former behaviour, not a fifth place: an offline render with no conditions
 * must not quietly become a city.
 */
export const BIOME_MUSIC_NEUTRAL = {
  bpm: [112, 176],
  modes: [['minor', 30], ['major', 26], ['dorian', 14], ['mixolydian', 10],
    ['harmonicMinor', 8], ['phrygian', 6], ['lydian', 6]],
  drums: [['light', 34], ['full', 44], ['busy', 22]],
  arp: [['eighth', 40], ['sixteenth', 34], ['off', 26]],
  harmony: [['pad', 40], ['stab', 34], ['counter', 26]],
  ensemble: {},
  restBias: 1,
};

/** 'LBD' -> Set{'lead','bass','drums'}. */
export const VOICE_OF_LETTER = { L: 'lead', H: 'harmony', A: 'arp', B: 'bass', D: 'drums' };
export function voiceSet(letters) {
  return new Set([...letters].map(c => VOICE_OF_LETTER[c]).filter(Boolean));
}

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

// HARMONIC_SHADOW AND inShadow() USED TO LIVE HERE. THEY ARE GONE, AND THE
// MEASUREMENT THAT REMOVED THEM IS THE POINT OF THIS COMMENT.
//
// The constant was [12, 19, 24, 28, 31, 34, 36] — the semitone offsets at which
// the salience grid in tools/audio-metrics.mjs suppresses a note sitting above
// an already-accepted louder one. compose.js consulted it on every harmony and
// arp note and nudged the note when it matched. It was the one place the
// composer was shaped by the measurement rather than by the music, it was
// disclosed as such, and it did not work.
//
// Measured over 24 seeds x 60 s (6,226 harmony notes):
//   * the rule fired on 80.8-93.1% of harmony notes (median 87.4%);
//   * 75.1-96.7% of those (median 83.4%) were STILL in the shadow after being
//     moved, so it failed at its own purpose on five notes in six;
//   * its escape path was `m + 12 <= HARM_HI ? m + 12 : m - 1`, and the octave
//     had headroom on 0.00-12.7% of notes (median 0.0%), so in the median seed
//     it ALWAYS fell through to `m - 1`: a chord's own third or fifth detuned a
//     semitone, every time it fired.
//
// The reason it fired on almost everything is arithmetic, not bad luck. With
// +-1 tolerance the seven offsets cover 20 distinct intervals, and the harmony
// register sits 10..39 semitones above the bass — 30 possible intervals. The
// set covers 20 of 30 = 66.7% of the space A PRIORI, before a single musical
// decision. A test that says yes to two thirds of its inputs is not a filter.
//
// What it cost: 75.0-92.9% of harmony notes (median 87.0%) were not in the
// chord of their own bar, and every seed used all 12 pitch classes.
//
// See docs/OWNERSHIP.md rule 6. The analyser's suppression grid is a fact about
// the analyser. It is not a fact about music, and nothing here is owed to it.
