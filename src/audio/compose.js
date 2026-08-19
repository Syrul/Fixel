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
  SCALES, QUALITIES, PROGRESSIONS, CADENCES, RHYTHM_CELLS, CONTOURS,
  DRUM_PATTERNS, BASS_FIGURES, ARP_SHAPES, PC_NAMES, OPENINGS,
  FORMS, ENSEMBLES, BIOME_MUSIC, BIOME_MUSIC_NEUTRAL,
  chordTones, degreeStep, voiceSet,
} from './theory.js';

const TICKS_PER_BAR = 16;

const LEAD_SHAPES = ['p:0.125', 'p:0.25', 'p:0.5'];
const ARP_SHAPES_W = ['p:0.125', 'p:0.25'];

/**
 * Compose a post.
 *
 * @param seed  the post's identity; the same string that draws its pixels.
 * @param opts.seconds   how much music to plan for.
 * @param opts.cond      the RESOLVED conditions object from
 *                       src/gen/conditions.js — the SAME object the picture is
 *                       drawn from, never a second resolution of the same seed.
 *                       Only `biome` is read here. Omitted, the composer is
 *                       biome-neutral and behaves as it did before it could ask.
 */
export function composeSong(seed, opts = {}) {
  const seconds = opts.seconds ?? 60;
  const cond = opts.cond || null;
  const rng = new Rng(seed);

  // ---- where this post IS -----------------------------------------------
  // docs/ROUNDS.md r5 open item 4. The picture has known its biome since
  // biome-mix.js existed and the music never asked, so a beach and a mountain
  // played the same city chiptune. `place` is a set of WEIGHTS, not a set of
  // decisions: every draw below is still the seed's, it is just drawn from a
  // table that knows where it is.
  const place = (cond && BIOME_MUSIC[cond.biome]) || BIOME_MUSIC_NEUTRAL;

  // ---- global parameters ------------------------------------------------
  // TEMPO IS UNGATED. No metric in the suite constrains how fast this music is:
  // `tempoBpm` was removed from the gating set entirely (along with
  // `ioiEntropy` and `spectralCentroidVar`), so 112..176 BPM rests on musical
  // judgement for the idiom and on nothing else. It has not passed a check
  // because there is no check. A synth could emit a crawl or a blur here
  // unnoticed as long as onsetRate stays inside 4.58..9.59/s.
  //
  // Kept because it is the reason the metric is gone: the old estimator
  // autocorrelated an onset function over 0.2..2.0 s and took the global
  // maximum, which on music this dense locks to the bar or half-bar rather
  // than the beat — a 160 BPM post read as ~40 BPM, and widening this range
  // from 140..172 to 112..176 flipped four of eight seeds out of band without
  // changing anything a listener would call tempo.
  const bpm = rng.stream('audio.tempo').int(place.bpm[0], place.bpm[1]);
  const beatSec = 60 / bpm;
  const barSec = 4 * beatSec;
  const secPerTick = beatSec / 4;

  const tonicPc = rng.stream('audio.key.tonic').int(0, 11);
  const mode = rng.stream('audio.key.mode').weighted(place.modes);
  const scale = SCALES[mode];
  const progFamily = PROGRESSIONS[mode] ? mode : (mode === 'harmonicMinor' ? 'minor' : 'major');

  // ---- per-post voicing and drum kit ------------------------------------
  // Without these every post is, statistically, the same post: measured across
  // 8 seeds with a fixed voicing, spectralCentroidMean spanned 2702..2947 Hz
  // (+-4%) while the reference corpus spans 1285..5428. A feed of forty scenes
  // that all sound alike is a failure whether or not any band notices.
  const vst = rng.stream('audio.voicing');
  const voicing = {
    harmony: vst.weighted([['p:0.5', 38], ['p:0.25', 34], ['tri', 28]]),
    bass: vst.weighted([['tri', 58], ['p:0.25', 26], ['p:0.5', 16]]),
    leadCentre: vst.int(76, 83),
    arpLo: vst.int(52, 59),
  };
  const kst = rng.stream('audio.kit');
  const kit = {
    hatPeriod: kst.int(1, 3),
    hatLp: kst.range(0.55, 0.99),
    hatShort: kst.bool(0.5),
    hatGain: kst.range(0.10, 0.21),
    snarePeriod: kst.int(1, 4),
    snareLp: kst.range(0.28, 0.72),
    kickF0: kst.int(115, 195),
    kickF1: kst.int(38, 56),
  };

  // Per-post channel balance. This is where most of the timbral spread comes
  // from: the corpus ranges over spectralCentroidMean 1285..5428 because a
  // bass-heavy track and a hat-heavy track are different ARRANGEMENTS, not
  // because they were filtered differently. A post that leans on its noise
  // channel is bright; one that leans on its triangle bass is dark.
  const bst = rng.stream('audio.balance');
  const balance = {
    lead: bst.range(0.80, 1.25),
    harmony: bst.range(0.55, 1.45),
    arp: bst.range(0.45, 1.55),
    bass: bst.range(0.75, 1.35),
    drums: bst.range(0.40, 1.70),
  };

  // ---- which voices this post HAS ---------------------------------------
  // Not "which voices play in this bar" — which channels the post owns at all.
  // Every post used to own all five. The biome multiplies the weights, so a
  // desert post is far more likely to be two or three voices and a city post
  // far more likely to be five.
  const ens = rng.stream('audio.ensemble').weighted(
    ENSEMBLES.map(e => [e, e.w * (place.ensemble[e.name] ?? 1)]));
  const ensemble = new Set(ens.voices);

  // A TRIO PLAYS MORE NOTES PER PART THAN A QUINTET. This is ordinary
  // arrangement, and it is also the fix for a measured overshoot: the first
  // version of the ensemble draw kept every part as sparse as it had been when
  // there were five of them, and onsetRate fell to a median of 4.78/s against a
  // corpus p05 of 4.58, with 5 of 12 seeds under the floor. Removing voices
  // without giving the survivors more to do is not thinning an arrangement, it
  // is deleting one. `fill` rises as the ensemble shrinks and biases the arp
  // toward sixteenths, the kit toward busy, and the motif toward denser cells.
  const nVoices = ens.voices.length;
  const fill = Math.pow(1.5, 5 - nVoices);       // 1.00 1.50 2.25 3.38
  const denser = (pairs, up, down) => pairs.map(([k, w]) =>
    [k, k === up ? w * fill : k === down ? w / fill : w]);

  // ---- the opening ------------------------------------------------------
  // The most-heard bars of the post, and until now the least varied. See the
  // OPENINGS note in theory.js for the 24-seed measurement that made this a
  // draw instead of a constant. Separate streams, because the entry plan and
  // the opening's timbre are separable quantities and law 2 means a later draw
  // added to one must not re-roll the other.
  const opening = rng.stream('audio.opening.plan')
    .weighted(OPENINGS.map(o => [o, o.w]));
  const otx = rng.stream('audio.opening.texture');
  const introTexture = {
    drums: otx.weighted(denser(place.drums, 'busy', 'light')),
    arp: otx.weighted(denser(place.arp, 'sixteenth', 'off')),
    lead: 'motif',
    harmony: otx.weighted(place.harmony),
    bassFig: null,                       // was the constant 4, in every post
    leadOct: otx.bool(0.22) ? 12 : 0,
    opening: opening.name,
  };
  // The arp is the one voice a texture can switch off, so an arp-only plan bar
  // plus `arp: 'off'` is a bar with nothing in it. Caught by measurement, not
  // by reading: "voices sounding in bar 0" came back with a minimum of 0 across
  // 24 seeds, and a post that opens with an empty bar has no opening at all.
  // Overridden after the draw rather than conditioned into it, so the number of
  // draws taken from this stream does not depend on the plan.
  if (introTexture.arp === 'off' && opening.plan.some(p => p === 'A')) introTexture.arp = 'eighth';

  const totalBars = Math.max(8, Math.ceil(seconds / barSec));

  // ---- form -------------------------------------------------------------
  // Drawn per post. It used to be a module constant and measured 2 distinct
  // sequences across 24 seeds. The section KIND is the motif letter plus its
  // occurrence number, so 'A', 'A2', 'A3' still name variations of one idea and
  // the texture table below is still keyed by something meaningful.
  const fst = rng.stream('audio.form.shape');
  const lst = rng.stream('audio.form.lengths');
  const form = fst.weighted(FORMS.map(f => [f, f.w]));
  const sections = [];
  const seen = {};
  let bar = 0;
  sections.push({ index: 0, kind: 'intro', motif: 'A', startBar: 0, bars: opening.bars });
  bar = opening.bars;
  for (let i = 0; bar < totalBars; i++) {
    const letter = form.letters[i % form.letters.length];
    seen[letter] = (seen[letter] || 0) + 1;
    const kind = letter + (seen[letter] > 1 ? String(seen[letter]) : '');
    // 4-bar sections make a post that turns over quickly, 16-bar ones make one
    // that settles. Both, drawn, rather than 8 forever.
    const want = lst.weighted([[4, 26], [8, 48], [16, 26]]);
    sections.push({
      index: sections.length, kind, motif: letter,
      startBar: bar, bars: Math.min(want, totalBars - bar),
    });
    bar += want;
  }

  // ---- texture, per section kind, per post -------------------------------
  // TEXTURES was a module constant: 2 distinct texture signatures across 24
  // seeds, which is the same arrangement in every post in the feed. Each
  // section KIND gets its own stream so adding a section kind later cannot
  // re-roll an earlier one.
  const textures = { intro: introTexture };
  for (const s of sections) {
    if (textures[s.kind]) continue;
    const tst = rng.stream(`audio.texture.${s.kind}`);
    textures[s.kind] = {
      drums: tst.weighted(denser(place.drums, 'busy', 'light')),
      arp: tst.weighted(denser(place.arp, 'sixteenth', 'off')),
      lead: 'motif',
      harmony: tst.weighted(place.harmony),
      bassFig: null,
      leadOct: tst.bool(0.18) ? 12 : 0,
    };
  }

  // ---- arrangement mask -------------------------------------------------
  // Which voices sound in which bar. `null` means "every voice the post has".
  // Keyed by absolute bar so every voice generator asks the same question.
  const barVoices = new Map();
  for (const s of sections) {
    if (s.kind !== 'intro') continue;
    for (let b = 0; b < s.bars; b++) {
      // Intersected with the ensemble: an entry plan naming a voice this post
      // does not own would otherwise plan an empty bar, which is the same bug
      // the arp-only opening had. The lead is the floor because every ENSEMBLES
      // row contains it, so the fallback can never be empty either.
      const want = new Set([...voiceSet(opening.plan[Math.min(b, opening.plan.length - 1)])]
        .filter(v => ensemble.has(v)));
      barVoices.set(s.startBar + b, want.size ? want : new Set(['lead']));
    }
  }
  // ---- rest ---------------------------------------------------------------
  // SPACE WAS NOT A PARAMETER IN THIS COMPOSER, IT WAS AN ABSENCE. Measured
  // over 24 seeds x 60 s before this block existed: zero seconds of total
  // silence in 24 of 24; three or more voices sounding for 53.5-56.9 s of every
  // 60; the quietest moment in a whole minute about a fifth of a second long;
  // and the bass sounding 87.2-98.7% of the time with no rest mechanism of any
  // kind. A listener reads relentlessness as annoyance long before they read
  // any harmonic detail, and this is the half of "annoying" that is structural.
  //
  // Three mechanisms, all per section, all from that section's own stream:
  //   BREATH      one bar stops early and the next downbeat arrives into it.
  //               This is the only one that makes real silence.
  //   THIN PATCH  two consecutive bars with one or two voices taken out.
  //   BASS REST   whole bars where the bass simply does not play.
  const barHole = new Map();       // absolute bar -> tick from which it is silent
  // NEVER EMPTY A BAR. Measured, and it shipped for about twenty minutes: a
  // two-voice post whose thin patch happened to name both of its voices left
  // 3.5 CONTINUOUS SECONDS of digital silence in the middle of fixel-0020 —
  // seven consecutive half-second blocks under -100 dBFS. Rest is a phrase
  // ending; four bars of nothing is a dropout. The floor is one voice, and it
  // is the lead where the bar had one.
  const dropFrom = (b, drop) => {
    const cur = barVoices.get(b) || new Set(ens.voices);
    const next = new Set([...cur].filter(v => !drop.has(v)));
    if (!next.size) {
      barVoices.set(b, new Set([cur.has('lead') ? 'lead' : [...cur][0]]));
      return;
    }
    barVoices.set(b, next);
  };
  // A quiet place rests more. `restBias` above 1 makes a breath likelier and a
  // full texture rarer; the desert is 1.35 and the city 0.85.
  // A duo that also rests heavily is a silence with a tune in it. Thin
  // ensembles rest a little less, so the two mechanisms do not compound.
  const rb = place.restBias * (0.86 + 0.028 * nVoices);
  const bias = (p) => Math.max(0, Math.min(1, p * rb));
  for (const s of sections) {
    // The opening is the hook and is already thinned by its entry plan.
    if (s.kind === 'intro' || s.bars < 4) continue;
    const rst = rng.stream(`audio.rest.${s.index}`);
    if (rst.bool(bias(0.78))) {
      const at = s.startBar + (rst.bool(0.45) ? Math.min(3, s.bars - 1) : s.bars - 1);
      // A BREATH IS MEASURED IN SECONDS, NOT IN TICKS. Eight ticks is 0.69 s at
      // 175 BPM and 1.16 s at 103, and the slow end of that is not a phrase
      // ending any more, it is a gap: measured, a 103 BPM post held 1.48 s of
      // digital silence. Fast music can hold a longer rest in ticks than slow
      // music can, so the floor moves with the tempo.
      const earliest = TICKS_PER_BAR - Math.floor(0.75 / secPerTick);
      barHole.set(at, Math.max(earliest, [8, 10, 12][rst.int(0, 2)]));
    }
    const nDrop = rst.weighted([[0, 24], [1, 46 * rb], [2, 30 * rb]]);
    if (nDrop) {
      const at = s.startBar + 2 * rst.int(0, Math.floor(s.bars / 2) - 1);
      const drop = new Set(rst.sample(ens.voices, nDrop));
      for (let b = at; b < Math.min(at + 2, s.startBar + s.bars); b++) dropFrom(b, drop);
    }
    const bassOff = rst.weighted([[0, 30], [1, 42 * rb], [2, 28 * rb]]);
    for (let k = 0; k < bassOff; k++) {
      dropFrom(s.startBar + rst.int(0, s.bars - 1), new Set(['bass']));
    }
  }

  /** Does `track` sound in absolute bar `b`? */
  const sounds = (track, b) => {
    if (!ensemble.has(track)) return false;
    const set = barVoices.get(b);
    return set ? set.has(track) : true;
  };
  /** The tick from which bar `b` is silent, or 16 if it plays out. */
  const holeAt = b => barHole.get(b) ?? TICKS_PER_BAR;
  /** Clip a note to the bar's hole; returns 0 when the note is inside it. */
  const clip = (t, d, hole) => (t >= hole ? 0 : Math.min(d, hole - t));

  // ---- harmony ----------------------------------------------------------
  // One chord per bar. Chord-per-bar is the harmonic rhythm the novelty
  // detector needs: it computes a 2 s-vs-2 s chroma distance and enforces a 2 s
  // minimum gap between accepted boundaries, so a chord change slower than
  // every other bar cannot produce the corpus rate of ~0.29 boundaries/s.
  const progPool = PROGRESSIONS[progFamily];
  const cadPool = CADENCES[progFamily];
  const progOf = new Map();
  for (const s of sections) {
    // Keyed by kind alone: kinds are now unique per section ('A', 'A2', 'A3'),
    // so the `.pass` counter the fixed FORM needed has nothing left to count.
    const st = rng.stream(`audio.harmony.prog.${s.kind}`);
    const core = progPool[st.int(0, progPool.length - 1)];
    const cad = cadPool[st.int(0, cadPool.length - 1)];
    // sections sharing a motif letter share the harmony too, so the A-variants
    // are variations of one idea rather than four unrelated eight-bar tunes
    let prog;
    if (s.motif === 'A' && progOf.has('A')) prog = progOf.get('A');
    else {
      prog = [...core, core[0], core[1], core[2], cad];
      if (s.motif === 'A') progOf.set('A', prog);
    }
    s.prog = prog;
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
    // Same principle as `fill`: a two-voice post's tune carries the bar, so
    // its cells are weighted toward the ones with more notes in them. At five
    // voices the exponent is 0 and this is a uniform pick, exactly as before.
    const cellW = RHYTHM_CELLS.map(c => [c, Math.pow(c.length, 0.45 * (5 - nVoices))]);
    const cells = [st.weighted(cellW), st.weighted(cellW)];
    const contour = CONTOURS[st.int(0, CONTOURS.length - 1)];
    motifs[letter] = { cells, contour, startDeg: st.int(-2, 4) };
  }

  const tracks = { lead: [], harmony: [], arp: [], bass: [], drums: [] };
  const chordAt = b => chords[Math.min(chords.length - 1, b)];

  // ---- bass -------------------------------------------------------------
  const BASS_LO = 33, BASS_HI = 50;
  for (const s of sections) {
    const st = rng.stream(`audio.bass.${s.index}`);
    const figIdx = textures[s.kind].bassFig ?? st.int(0, BASS_FIGURES.length - 1);
    for (let b = 0; b < s.bars; b++) {
      if (!sounds('bass', s.startBar + b)) continue;
      const ch = chordAt(s.startBar + b);
      const fig = (b % 4 === 3 && st.bool(0.35))
        ? BASS_FIGURES[st.int(0, BASS_FIGURES.length - 1)]
        : BASS_FIGURES[figIdx];
      let rootMidi = BASS_LO + (((ch.rootPc - BASS_LO) % 12) + 12) % 12;
      while (rootMidi < BASS_LO) rootMidi += 12;
      while (rootMidi > BASS_HI - 5) rootMidi -= 12;
      const hole = holeAt(s.startBar + b);
      for (const [t, d, ti] of fig) {
        const dd = clip(t, d, hole);
        if (!dd) continue;
        const iv = ti < 0 ? -12 : ch.intervals[Math.min(ti, ch.intervals.length - 1)];
        tracks.bass.push({
          tick: (s.startBar + b) * TICKS_PER_BAR + t,
          dur: dd, midi: rootMidi + iv, vel: t === 0 ? 1 : 0.82,
        });
      }
    }
  }
  // ---- arpeggio ---------------------------------------------------------
  const ARP_LO = voicing.arpLo, ARP_HI = ARP_LO + 16;
  for (const s of sections) {
    const mode_ = textures[s.kind].arp;
    if (mode_ === 'off') continue;
    const st = rng.stream(`audio.arp.${s.index}`);
    const shape = ARP_SHAPES[st.int(0, ARP_SHAPES.length - 1)];
    const step = mode_ === 'sixteenth' ? 1 : 2;
    // ONE rhythmic mask per section, reused every bar. A chiptune arpeggio is
    // an ostinato — a figure you recognise — not a fresh random draw per bar.
    // Re-rolling the holes bar by bar (which the first version of this file
    // did) destroys every repeat the piece has: measured, it held
    // repeatStrength at 0.163-0.223 against a corpus median of 0.321.
    const nSlots = Math.ceil(TICKS_PER_BAR / step);
    const mask = [], maskB = [];
    for (let i = 0; i < nSlots; i++) {
      const hole = step === 1 && (i % 4 === 3) && st.bool(0.4);
      mask.push(!hole);
      maskB.push(i % 4 === 3 ? !st.bool(0.5) : !hole);
    }
    for (let b = 0; b < s.bars; b++) {
      if (!sounds('arp', s.startBar + b)) continue;
      const ch = chordAt(s.startBar + b);
      const msk = (b % 4 === 3) ? maskB : mask;
      const hole = holeAt(s.startBar + b);
      for (let t = 0, i = 0; t < TICKS_PER_BAR; t += step, i++) {
        if (!msk[i] || t >= hole) continue;
        const k = shape[(t / step) % shape.length];
        const iv = ch.intervals[k % ch.intervals.length];
        let m = ARP_LO + (((ch.rootPc - ARP_LO) % 12) + 12) % 12 + iv;
        while (m > ARP_HI) m -= 12;
        while (m < ARP_LO) m += 12;
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
    const kind = textures[s.kind].harmony;
    const st = rng.stream(`audio.harm.${s.index}`);
    for (let b = 0; b < s.bars; b++) {
      if (!sounds('harmony', s.startBar + b)) continue;
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
      const hole = holeAt(s.startBar + b);
      for (const [t, d] of events) {
        const dd = clip(t, d, hole);
        if (!dd) continue;
        for (const iv of picks) {
          // The chord tone, played. Nothing is nudged off it to satisfy an
          // analyser — see the deleted-constant note in theory.js for the
          // measurement that removed the rule that used to sit here.
          let m = base + iv;
          while (m > HARM_HI) m -= 12;
          while (m < HARM_LO) m += 12;
          tracks.harmony.push({
            tick: (s.startBar + b) * TICKS_PER_BAR + t, dur: dd, midi: m,
            vel: kind === 'pad' ? 0.5 : 0.66,
          });
        }
      }
    }
  }

  // ---- lead melody ------------------------------------------------------
  //
  // Phrase plan over an 8-bar section: 2-bar groups a / a' / a / b. Groups 0
  // and 2 sit over identical chords (see the CADENCES note in theory.js), and
  // every ornament, rest and neighbour-tone decision is drawn ONCE into a table
  // indexed by position inside the cell rather than pulled from a running
  // stream — so the third group is note-for-note the first, not a near-miss.
  // A tune whose phrases never come back is the defect the first version of
  // this file had, and it is audible as a defect long before it is measurable
  // as one.
  const LEAD_CENTRE = voicing.leadCentre, LEAD_LO = LEAD_CENTRE - 7, LEAD_HI = LEAD_CENTRE + 12;
  const PHRASE_PLAN = [0, 0, 0, 1];   // 0 = motif cells, 1 = cadence cells

  for (const s of sections) {
    if (textures[s.kind].lead === 'none') continue;
    const letter = s.motif || 'B';
    const mot = motifs[letter];
    const st = rng.stream(`audio.melody.${s.index}`);
    const orn = rng.stream(`audio.melody.orn.${s.index}`);
    const oct = textures[s.kind].leadOct;
    const cadCells = [RHYTHM_CELLS[st.int(0, RHYTHM_CELLS.length - 1)],
      RHYTHM_CELLS[st.int(0, RHYTHM_CELLS.length - 1)]];

    // decision table: [cellKind][barInGroup][slot] -> {chrom, dir, rest, orna}
    // `chrom` is the chromatic-neighbour rate. NES-era chiptune is markedly
    // diatonic; at 0.07 this engine measured pitchClassEntropy 3.31..3.35
    // against a corpus p95 of 3.301 (corpus max 3.371), i.e. it was reaching
    // for ~10 effective pitch classes where the idiom uses 8. Lowered on that
    // ground.
    const dec = [];
    for (let ck = 0; ck < 2; ck++) {
      dec.push([0, 1].map(() => {
        const row = [];
        for (let j = 0; j < 12; j++) {
          // The same `fill` principle reaching the tune itself: in a two-voice
          // post the lead IS the arrangement, so it rests less and ornaments
          // more. At five voices these are 0.12 and 0.30, unchanged.
          row.push({
            chrom: orn.bool(0.04), dir: orn.bool(0.5) ? -1 : 1,
            rest: orn.bool(0.12 * (0.55 + 0.09 * nVoices)),
            orna: orn.bool(Math.min(0.62, 0.30 * Math.pow(fill, 0.45))),
          });
        }
        return row;
      }));
    }

    for (let g = 0; g * 2 < s.bars; g++) {
      const ck = PHRASE_PLAN[g % PHRASE_PLAN.length];
      const cells = ck === 0 ? mot.cells : cadCells;
      const gBar0 = s.startBar + g * 2;
      // anchor the group on a chord tone: a pure function of its first chord,
      // so two groups over the same chords start from the same note
      const anchorChord = chordAt(gBar0);
      let cur = degreeStep(LEAD_CENTRE + oct, mot.startDeg, tonicPc, scale);
      {
        let best = cur, bd = 99;
        for (let d = -5; d <= 5; d++) {
          if (!anchorChord.pcs.includes((((cur + d) % 12) + 12) % 12)) continue;
          if (Math.abs(d) < bd) { bd = Math.abs(d); best = cur + d; }
        }
        cur = best;
      }
      for (let bg = 0; bg < 2; bg++) {
        const globalBar = gBar0 + bg;
        if (globalBar >= s.startBar + s.bars) break;
        const leadSounds = sounds('lead', globalBar);
        const hole = holeAt(globalBar);
        const ch = chordAt(globalBar);
        const cell = cells[bg];
        const n = cell.length;
        let t = 0;
        for (let j = 0; j < n; j++) {
          const dur = cell[j];
          const d0 = dec[ck][bg][j % 12];
          const cIdx = Math.min(mot.contour.length - 1, Math.floor(j * mot.contour.length / n));
          // Clamp the contour TARGET into the register, never the played note.
          // Wrapping a played note by an octave when it runs past the ceiling
          // (which this file did at first) manufactures a 12-semitone leap out
          // of nothing: measured, it held stepFrac at 0.16 against a corpus p05
          // of 0.176. A melody that hits its ceiling turns around.
          let want = degreeStep(LEAD_CENTRE + oct, mot.startDeg + mot.contour[cIdx], tonicPc, scale);
          if (want > LEAD_HI) want = degreeStep(LEAD_HI, 0, tonicPc, scale);
          if (want < LEAD_LO) want = degreeStep(LEAD_LO, 0, tonicPc, scale);
          // move toward the contour target rather than jumping to it: the line
          // stays connected, and the interval histogram stays step-weighted
          let next = cur + Math.max(-7, Math.min(7, want - cur));
          if (t % 8 === 0) {
            let best = next, bd = 99;
            for (let d = -4; d <= 4; d++) {
              if (!ch.pcs.includes((((next + d) % 12) + 12) % 12)) continue;
              if (Math.abs(d) < bd) { bd = Math.abs(d); best = next + d; }
            }
            next = best;
          } else if (d0.chrom) {
            next = next + d0.dir;        // chromatic neighbour: extra pitch class
          } else {
            next = degreeStep(next, 0, tonicPc, scale);
          }
          if (next > LEAD_HI) next = degreeStep(LEAD_HI, -1, tonicPc, scale);
          if (next < LEAD_LO) next = degreeStep(LEAD_LO, 1, tonicPc, scale);
          // `cur` still advances through a silent bar, so the line picks up
          // where it would have been rather than restarting on the anchor.
          const dd = clip(t, Math.max(1, dur - (dur >= 4 ? 1 : 0)), hole);
          if (leadSounds && dd && !(d0.rest && t !== 0)) {
            tracks.lead.push({
              tick: globalBar * TICKS_PER_BAR + t, dur: dd,
              midi: next, vel: t === 0 ? 1 : 0.85,
            });
            if (dur >= 6 && d0.orna && t + dur - 1 < hole) {
              tracks.lead.push({
                tick: globalBar * TICKS_PER_BAR + t + dur - 1, dur: 1,
                midi: degreeStep(next, d0.dir, tonicPc, scale), vel: 0.7,
              });
            }
          }
          cur = next;
          t += dur;
        }
      }
    }
  }

  // ---- drums ------------------------------------------------------------
  for (const s of sections) {
    const dens = textures[s.kind].drums;
    const st = rng.stream(`audio.drums.${s.index}`);
    const kick = DRUM_PATTERNS.kick[st.int(0, DRUM_PATTERNS.kick.length - 1)];
    const snare = DRUM_PATTERNS.snare[st.int(0, DRUM_PATTERNS.snare.length - 1)];
    const hat = DRUM_PATTERNS.hat[st.int(0, DRUM_PATTERNS.hat.length - 1)];
    for (let b = 0; b < s.bars; b++) {
      if (!sounds('drums', s.startBar + b)) continue;
      const t0 = (s.startBar + b) * TICKS_PER_BAR;
      const fill = b % 4 === 3 && dens !== 'light' && st.bool(0.6);
      // Drums stop a tick EARLY into a hole. A kick is 0.15 s of audio from a
      // 1-tick event, so gating it at the hole itself leaves the kick ringing
      // into the silence the hole exists to create. `-1` only where there IS a
      // hole: applying it unconditionally would silently drop tick 15 of every
      // bar in the piece, which is how a rest mechanism becomes a groove bug.
      const raw = holeAt(s.startBar + b);
      const hole = raw < TICKS_PER_BAR ? Math.max(0, raw - 1) : TICKS_PER_BAR;
      for (let t = 0; t < hole; t++) {
        if (kick[t] && dens !== 'light') tracks.drums.push({ tick: t0 + t, dur: 3, kind: 'kick', vel: kick[t] / 3 });
        else if (kick[t] && t % 8 === 0) tracks.drums.push({ tick: t0 + t, dur: 3, kind: 'kick', vel: kick[t] / 3 });
        if (snare[t] && dens !== 'light') tracks.drums.push({ tick: t0 + t, dur: 2, kind: 'snare', vel: snare[t] / 3 });
        if (hat[t]) {
          const busy = dens === 'busy' || dens === 'full';
          if (busy || t % 4 === 0) tracks.drums.push({ tick: t0 + t, dur: 1, kind: 'hat', vel: hat[t] / 2.4 });
        }
        if (fill && t >= 12) tracks.drums.push({ tick: t0 + t, dur: 1, kind: 'snare', vel: 0.55 + 0.12 * (t - 12) });
      }
      // A crash marks the top of every section, and also bar 0 when the
      // opening plan starts with the kit — an `inMedias` or `hitDrop` post
      // begins ON the hit rather than walking up to one.
      if (b === 0 && (s.kind !== 'intro' || opening.plan[0].includes('D'))) {
        tracks.drums.push({ tick: t0, dur: 8, kind: 'crash', vel: 0.9 });
      }
    }
  }

  for (const k of Object.keys(tracks)) tracks[k].sort((a, b) => a.tick - b.tick || a.midi - b.midi);

  return {
    seed: String(seed), seconds, bpm, beatSec, barSec, secPerTick,
    ticksPerBar: TICKS_PER_BAR, totalBars,
    key: { tonicPc, tonic: PC_NAMES[tonicPc], mode },
    voicing, kit, balance,
    biome: cond ? cond.biome : null,
    ensemble: { name: ens.name, voices: ens.voices },
    form: { name: form.name, letters: form.letters },
    opening: { name: opening.name, bars: opening.bars, plan: opening.plan },
    sections: sections.map(s => ({
      index: s.index, kind: s.kind, motif: s.motif, startBar: s.startBar, bars: s.bars,
      leadShape: leadShape[s.index], arpShape: arpShape[s.index],
      texture: textures[s.kind],
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
