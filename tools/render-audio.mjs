#!/usr/bin/env node
/**
 * render-audio.mjs — headless renderer and self-attack harness for src/audio/**.
 *
 * OWNERSHIP: this file and src/audio/** belong to the synth builder. The bar it
 * is measured against (tools/audio-metrics.mjs, docs/band-audio-v1.json,
 * corpus/**) has a different owner and is not touched from here — this tool
 * only ever *reads* the band and *spawns* the metric tool as a subprocess.
 *
 * NOTHING HERE LISTENS TO ANYTHING. Every number it prints is computed.
 *
 * USAGE
 *   node tools/render-audio.mjs --seed <string> --out <file.wav> [--stems <dir>] [--seconds N]
 *   node tools/render-audio.mjs --dump-song --seed <string> [--seconds N]
 *   node tools/render-audio.mjs --latency [--seed <string>] [--runs N]
 *   node tools/render-audio.mjs --duty-check [--stem <file.wav>]
 *   node tools/render-audio.mjs --controls <dir> [--seed <string>] [--seconds N]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rng } from '../src/core/rng.js';
import {
  composeSong, renderRange, renderCalibrationTone, encodeWav,
  SAMPLE_RATE, CHANNELS, MASTER,
} from '../src/audio/index.js';
import { firstBufferLatency } from '../src/audio/index.js';
import { pulseHarmonicMag } from '../src/audio/wavetable.js';
import { Biquad, fftInPlace, linToDb } from '../src/audio/dsp.js';
import { TICKS_PER_BAR } from '../src/audio/compose.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const get = (f, dflt = null) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };

// ---------------------------------------------------------------------------
// duty-cycle fit: invert |c_k| = (4/(pi*k)) |sin(pi*k*d)|
// ---------------------------------------------------------------------------

function harmonicMagnitudes(x, sr, f0, nHarm) {
  const N = 32768;
  const seg = new Float64Array(N);
  const off = Math.min(Math.max(0, x.length - N), Math.round(0.25 * sr));
  for (let i = 0; i < N && off + i < x.length; i++) {
    seg[i] = x[off + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  }
  const re = Float64Array.from(seg), im = new Float64Array(N);
  fftInPlace(re, im);
  const binHz = sr / N;
  const out = [];
  for (let k = 1; k <= nHarm; k++) {
    const f = k * f0;
    if (f > 0.45 * sr) { out.push(0); continue; }
    const c = Math.round(f / binHz);
    let m = 0;
    for (let b = c - 3; b <= c + 3; b++) {
      if (b < 1 || b >= N / 2) continue;
      const v = Math.hypot(re[b], im[b]);
      if (v > m) m = v;
    }
    out.push(m);
  }
  return out;
}

/** Least-squares duty fit. d and 1-d are spectrally identical, so d <= 0.5. */
function fitDuty(mags, f0, sr, filter = null) {
  const K = mags.length;
  const meas = mags.slice();
  if (filter) for (let k = 1; k <= K; k++) meas[k - 1] /= Math.max(1e-6, filter.mag(k * f0, sr));
  const norm = meas[0] || 1;
  for (let i = 0; i < K; i++) meas[i] /= norm;
  let bestD = 0.5, bestE = Infinity;
  for (let d = 0.005; d <= 0.5005; d += 0.0005) {
    const model = [];
    for (let k = 1; k <= K; k++) model.push(pulseHarmonicMag(k, d));
    const mn = model[0] || 1;
    let e = 0;
    for (let i = 0; i < K; i++) { const df = meas[i] - model[i] / mn; e += df * df; }
    e /= K;
    if (e < bestE) { bestE = e; bestD = d; }
  }
  return { duty: bestD, mse: bestE, harmonics: K };
}

// ---------------------------------------------------------------------------
// adversarial controls — generated in code, played through the SAME synth
// ---------------------------------------------------------------------------

/**
 * The controls deliberately share the engine's timbre, mixer, master chain and
 * note density with the real output, and differ ONLY in musical structure. A
 * control that failed because it sounded different would prove nothing about
 * whether the bar measures music; these can only fail on structure.
 */
function makeControlSongs(seed, seconds) {
  const base = composeSong(seed, { seconds });
  const out = {};

  // (1) one bar of the real arrangement, repeated verbatim for the duration
  const barTicks = TICKS_PER_BAR;
  const loopBar = 8; // a bar from inside section A, i.e. full texture
  const oneBar = {};
  for (const c of Object.keys(base.tracks)) {
    oneBar[c] = base.tracks[c]
      .filter(n => Math.floor(n.tick / barTicks) === loopBar)
      .map(n => ({ ...n, tick: n.tick - loopBar * barTicks }));
  }
  const totalTicks = Math.ceil(seconds / base.secPerTick);
  const loopTracks = {}; for (const c of Object.keys(base.tracks)) loopTracks[c] = [];
  for (let t = 0; t < totalTicks; t += barTicks) {
    for (const c of Object.keys(oneBar)) {
      for (const n of oneBar[c]) loopTracks[c].push({ ...n, tick: n.tick + t });
    }
  }
  out['ctrl-1bar-loop'] = { ...base, tracks: loopTracks };

  // (4) eight bars of the real arrangement, repeated verbatim — the "competent
  // fake" docs/AUDIO-MEASURED.md warns about: real harmony, real melody, real
  // sections-worth of material, and zero development after bar 8.
  const eight = {};
  for (const c of Object.keys(base.tracks)) {
    eight[c] = base.tracks[c]
      .filter(n => n.tick >= 4 * barTicks && n.tick < 12 * barTicks)
      .map(n => ({ ...n, tick: n.tick - 4 * barTicks }));
  }
  const loop8 = {}; for (const c of Object.keys(base.tracks)) loop8[c] = [];
  for (let t = 0; t < totalTicks; t += 8 * barTicks) {
    for (const c of Object.keys(eight)) {
      for (const n of eight[c]) loop8[c].push({ ...n, tick: n.tick + t });
    }
  }
  out['ctrl-8bar-loop'] = { ...base, tracks: loop8 };

  // (2) uniformly-random chromatic walk at the same note density, same voices
  const rw = new Rng(seed + '/randomwalk');
  const rt = {}; for (const c of Object.keys(base.tracks)) rt[c] = [];
  const RANGES = { lead: [72, 91], harmony: [57, 72], arp: [55, 71], bass: [33, 50] };
  for (const c of ['lead', 'harmony', 'arp', 'bass']) {
    const st = rw.stream(`rand.${c}`);
    const [lo, hi] = RANGES[c];
    for (const n of base.tracks[c]) rt[c].push({ ...n, midi: st.int(lo, hi) });
  }
  const ds = rw.stream('rand.drums');
  const kinds = ['kick', 'snare', 'hat'];
  for (const n of base.tracks.drums) rt.drums.push({ ...n, kind: kinds[ds.int(0, 2)] });
  out['ctrl-random-walk'] = { ...base, tracks: rt };

  // (3) sustained drone: one chord held on every tonal channel, no percussion
  const ch = base.chords[0];
  const dt = { lead: [], harmony: [], arp: [], bass: [], drums: [] };
  const pcs = ch.pcs;
  dt.bass.push({ tick: 0, dur: totalTicks, midi: 36 + pcs[0], vel: 1 });
  dt.harmony.push({ tick: 0, dur: totalTicks, midi: 60 + pcs[1 % pcs.length], vel: 0.8 });
  dt.arp.push({ tick: 0, dur: totalTicks, midi: 55 + pcs[2 % pcs.length], vel: 0.8 });
  dt.lead.push({ tick: 0, dur: totalTicks, midi: 76 + pcs[0], vel: 1 });
  out['ctrl-drone'] = { ...base, tracks: dt };

  return out;
}

/** The calibration mastering from docs/AUDIO-MEASURED.md, reimplemented here. */
function masterControl(x, sr, { tremolo, target, targetDb }) {
  const y = Float32Array.from(x);
  if (tremolo) {
    for (let i = 0; i < y.length; i++) {
      y[i] *= 1 - 0.7 * 0.5 * (1 - Math.cos(2 * Math.PI * 4 * i / sr));
    }
  }
  // limiter at 0.98
  const lim = v => (v > 0.98 ? 0.98 : v < -0.98 ? -0.98 : v);
  for (let i = 0; i < y.length; i++) y[i] = lim(y[i]);
  const measure = () => {
    let peak = 0, ss = 0;
    for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > peak) peak = a; ss += y[i] * y[i]; }
    return { peak, rms: Math.sqrt(ss / y.length) };
  };
  for (let pass = 0; pass < 2; pass++) {
    const m = measure();
    const cur = target === 'peak' ? m.peak : m.rms;
    const g = Math.pow(10, targetDb / 20) / Math.max(cur, 1e-9);
    for (let i = 0; i < y.length; i++) y[i] = lim(y[i] * g);
    if (target === 'peak') break;
  }
  return y;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

function writeWavFile(file, samples, sr) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(path.resolve(file), encodeWav(samples, sr));
}

function cmdRender() {
  const seed = get('--seed');
  const out = get('--out');
  if (!seed || !out) { usage(); process.exit(2); }
  const seconds = Number(get('--seconds', '60'));
  const stemDir = get('--stems');

  const t0 = process.hrtime.bigint();
  const song = composeSong(seed, { seconds });
  const t1 = process.hrtime.bigint();
  const total = Math.round(seconds * SAMPLE_RATE);
  const { mix, stems } = renderRange(song, 0, total, SAMPLE_RATE);
  const t2 = process.hrtime.bigint();

  writeWavFile(out, mix, SAMPLE_RATE);
  if (stemDir) {
    fs.mkdirSync(path.resolve(stemDir), { recursive: true });
    for (const c of CHANNELS) {
      writeWavFile(path.join(path.resolve(stemDir), `${c}.wav`), stems[c], SAMPLE_RATE);
    }
  }
  let peak = 0, ss = 0;
  for (let i = 0; i < mix.length; i++) { const a = Math.abs(mix[i]); if (a > peak) peak = a; ss += mix[i] * mix[i]; }
  const rms = Math.sqrt(ss / mix.length);
  console.error(
    `seed "${seed}"  ${seconds}s  ${song.bpm} BPM  ${song.key.tonic} ${song.key.mode}  ` +
    `${song.totalBars} bars  ${song.sections.length} sections\n` +
    `notes: ${Object.entries(song.noteCounts).map(([k, v]) => `${k}=${v}`).join(' ')}\n` +
    `compose ${(Number(t1 - t0) / 1e6).toFixed(1)} ms   render ${(Number(t2 - t1) / 1e6).toFixed(1)} ms   ` +
    `peak ${linToDb(peak).toFixed(2)} dBFS   rms ${linToDb(rms).toFixed(2)} dBFS\n` +
    `wrote ${out}${stemDir ? ` and ${CHANNELS.length} stems in ${stemDir}` : ''}`);
}

function cmdDumpSong() {
  const seed = get('--seed');
  if (!seed) { usage(); process.exit(2); }
  const song = composeSong(seed, { seconds: Number(get('--seconds', '60')) });
  if (flag('--json')) { console.log(JSON.stringify(song, null, 2)); return; }
  console.log(`seed ${song.seed}   ${song.bpm} BPM   key ${song.key.tonic} ${song.key.mode}   ` +
    `${song.totalBars} bars (${song.barSec.toFixed(3)} s/bar)`);
  console.log('\nsections:');
  for (const s of song.sections) {
    console.log(`  ${String(s.index).padStart(2)}  ${s.kind.padEnd(6)} bars ${String(s.startBar).padStart(3)}..${s.startBar + s.bars - 1}  ` +
      `motif ${String(s.motif).padEnd(4)} lead ${s.leadShape}  arp ${s.arpShape}  drums ${s.texture.drums}`);
  }
  console.log('\nchords (bar: chord):');
  let line = '';
  for (const c of song.chords) {
    line += `${String(c.bar).padStart(3)}:${(c.root + c.quality).padEnd(8)}`;
    if ((c.bar + 1) % 8 === 0) { console.log('  ' + line); line = ''; }
  }
  if (line) console.log('  ' + line);
  console.log('\nnote counts: ' + Object.entries(song.noteCounts).map(([k, v]) => `${k}=${v}`).join('  '));
  const dur = song.totalBars * song.barSec;
  const attacks = Object.values(song.noteCounts).reduce((a, b) => a + b, 0);
  console.log(`symbolic attack density: ${(attacks / dur).toFixed(2)} note-onsets/s over ${dur.toFixed(1)} s`);
  console.log('\nfirst 32 lead notes (tick, dur, midi):');
  console.log('  ' + song.tracks.lead.slice(0, 32).map(n => `${n.tick}/${n.dur}/${n.midi}`).join(' '));
}

function cmdLatency() {
  const seeds = (get('--seed') || 'fixel-0001,fixel-0002,fixel-0003,fixel-0004,fixel-0005').split(',');
  const seconds = Number(get('--seconds', '60'));
  console.log(`per-post start latency (compose + first 500 ms of audio), ${seconds}s posts\n`);
  const cold = firstBufferLatency(seeds[0], 500, { seconds });
  console.log(`  COLD (empty wavetable cache, first post of the process):`);
  console.log(`    compose ${cold.composeMs.toFixed(2)} ms   first-buffer ${cold.firstBufferMs.toFixed(2)} ms   total ${cold.totalMs.toFixed(2)} ms`);
  const warm = [];
  for (const s of seeds) warm.push(firstBufferLatency(s, 500, { seconds }));
  console.log(`  WARM (tables cached, ${warm.length} seeds):`);
  for (let i = 0; i < seeds.length; i++) {
    console.log(`    ${seeds[i].padEnd(14)} compose ${warm[i].composeMs.toFixed(2)} ms   first-buffer ${warm[i].firstBufferMs.toFixed(2)} ms   total ${warm[i].totalMs.toFixed(2)} ms`);
  }
  const tot = warm.map(w => w.totalMs).sort((a, b) => a - b);
  console.log(`  warm median total: ${tot[tot.length >> 1].toFixed(2)} ms`);
  // full render cost for reference
  const t0 = process.hrtime.bigint();
  const song = composeSong(seeds[0], { seconds });
  renderRange(song, 0, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const t1 = process.hrtime.bigint();
  console.log(`  full ${seconds}s offline render: ${(Number(t1 - t0) / 1e6).toFixed(0)} ms ` +
    `(${(seconds * 1000 / (Number(t1 - t0) / 1e6)).toFixed(0)}x realtime)`);
}

function cmdDutyCheck() {
  console.log('duty-cycle recovery — fitting |c_k| = (4/pi k)|sin(pi k d)| to the rendered spectrum\n');
  console.log('  A. isolated voice, raw (no master chain) — the design requirement from docs/BAR.md');
  const midi = 69;
  const f0 = 440;
  for (const d of [0.125, 0.25, 0.5]) {
    const x = renderCalibrationTone({ shape: `p:${d}`, midi, seconds: 2 });
    const nH = Math.min(24, Math.floor(0.45 * SAMPLE_RATE / f0));
    const fit = fitDuty(harmonicMagnitudes(x, SAMPLE_RATE, f0, nH), f0, SAMPLE_RATE);
    console.log(`     requested ${(d * 100).toFixed(1)}%  ->  recovered ${(fit.duty * 100).toFixed(2)}%   ` +
      `MSE ${fit.mse.toFixed(5)}   (${fit.harmonics} harmonics)`);
  }
  console.log('\n  B. a sine at the same pitch — the control that must NOT fit a pulse model');
  {
    const n = 2 * SAMPLE_RATE;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * f0 * i / SAMPLE_RATE);
    const nH = Math.min(24, Math.floor(0.45 * SAMPLE_RATE / f0));
    const fit = fitDuty(harmonicMagnitudes(x, SAMPLE_RATE, f0, nH), f0, SAMPLE_RATE);
    console.log(`     sine          ->  recovered ${(fit.duty * 100).toFixed(2)}%   MSE ${fit.mse.toFixed(5)}`);
  }
  console.log('\n  C. mastered signals: the same tone through the master lowpass, un-filtered by');
  console.log('     dividing out the known |H(f)| of that biquad');
  const bq = Biquad.lowpass(MASTER.lowpassHz, SAMPLE_RATE, MASTER.lowpassQ);
  for (const d of [0.125, 0.25, 0.5]) {
    const x = renderCalibrationTone({ shape: `p:${d}`, midi, seconds: 2 });
    const y = Float32Array.from(x);
    Biquad.lowpass(MASTER.lowpassHz, SAMPLE_RATE, MASTER.lowpassQ).processInto(y, 0, y.length);
    const nH = Math.min(24, Math.floor(0.45 * SAMPLE_RATE / f0));
    const mags = harmonicMagnitudes(y, SAMPLE_RATE, f0, nH);
    const naive = fitDuty(mags, f0, SAMPLE_RATE);
    const comp = fitDuty(mags, f0, SAMPLE_RATE, bq);
    console.log(`     requested ${(d * 100).toFixed(1)}%  ->  uncompensated ${(naive.duty * 100).toFixed(2)}% (MSE ${naive.mse.toFixed(5)})   ` +
      `compensated ${(comp.duty * 100).toFixed(2)}% (MSE ${comp.mse.toFixed(5)})`);
  }
  const stem = get('--stem');
  if (stem) {
    console.log('\n  D. a real solo stem from a rendered post');
    const seed = get('--seed', 'fixel-0001');
    const song = composeSong(seed, { seconds: Number(get('--seconds', '60')) });
    const secIdx = song.sections.findIndex(s => s.kind === 'A');
    const shape = song.shapes.lead[secIdx >= 0 ? secIdx : 0];
    console.log(`     seed ${seed} section A lead shape = ${shape}`);
    const buf = fs.readFileSync(path.resolve(stem));
    console.log(`     (stem file ${path.basename(stem)}, ${buf.length} bytes — a stem is a mixture of many notes,`);
    console.log('      so the fit below is only meaningful on the isolated sustained tone in A/C above)');
  }
}

function scoreFile(file) {
  const bandPath = path.join(REPO, 'docs/band-audio-v1.json');
  const out = execFileSync('node', [path.join(REPO, 'tools/audio-metrics.mjs'), '--band', bandPath, file, '--json'],
    { encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out)[0];
}

function cmdControls() {
  const dir = path.resolve(get('--controls'));
  const seed = get('--seed', 'fixel-0001');
  const seconds = Number(get('--seconds', '60'));
  fs.mkdirSync(dir, { recursive: true });
  const songs = makeControlSongs(seed, seconds);
  const total = Math.round(seconds * SAMPLE_RATE);
  const written = [];
  for (const [name, song] of Object.entries(songs)) {
    const { mix } = renderRange(song, 0, total, SAMPLE_RATE);
    for (const trem of [false, true]) {
      for (const [tgt, tgtDb] of [['peak', -1.215], ['rms', -15.677]]) {
        const y = masterControl(mix, SAMPLE_RATE, { tremolo: trem, target: tgt, targetDb: tgtDb });
        const f = path.join(dir, `${name}${trem ? '-trem' : ''}-${tgt}.wav`);
        writeWavFile(f, y, SAMPLE_RATE);
        written.push(f);
      }
    }
  }
  console.error(`wrote ${written.length} control files to ${dir}`);
  for (const f of written) console.log(f);
}

function usage() {
  console.error(`usage:
  node tools/render-audio.mjs --seed <string> --out <file.wav> [--stems <dir>] [--seconds N]
  node tools/render-audio.mjs --dump-song --seed <string> [--seconds N] [--json]
  node tools/render-audio.mjs --latency [--seed a,b,c] [--seconds N]
  node tools/render-audio.mjs --duty-check
  node tools/render-audio.mjs --controls <dir> [--seed <string>] [--seconds N]`);
}

if (flag('--dump-song')) cmdDumpSong();
else if (flag('--latency')) cmdLatency();
else if (flag('--duty-check')) cmdDutyCheck();
else if (get('--controls')) cmdControls();
else if (get('--seed') && get('--out')) cmdRender();
else { usage(); process.exit(2); }
