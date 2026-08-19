#!/usr/bin/env node
/**
 * calibrate-audio-band.mjs — prove the audio band has teeth.
 *
 * Generates three deliberately-bad control signals (sustained note / random
 * notes / one-bar loop), masters each one onto the corpus loudness centre, and
 * scores them against the band.
 *
 * The mastering is the point. A band that only fails the controls because they
 * are quiet, or clipped, or flat, is a loudness band wearing a costume. By
 * placing loudness dead centre first, every remaining failure has to come from
 * structure the controls do not have.
 *
 * MEASURED LIMIT ON CREST FACTOR. The controls cannot be driven into the
 * corpus crest-factor band (9.42..17.20 dB) by any limiter/normaliser route.
 * A constant-amplitude square oscillator has crest 0 dB by construction, and a
 * limiter can only ever REDUCE crest. Adding a sine tremolo tops out at 4.28 dB
 * (the crest of a sine envelope), and stacking tremolos or adding compand
 * expansion buys crest only by driving the signal near-silent between peaks —
 * measured: 5.71 dB crest costs silenceFraction 0.176, and 6.12 dB costs 0.240,
 * both outside the corpus silenceFraction band of 0.000..0.125. Real music
 * reaches 14 dB crest through millisecond transients inside otherwise loud
 * frames, which is a property of having drums, not of mastering.
 *
 * So instead of one impossible target, two variants are emitted per control:
 * one with RMS placed dead centre and one with PEAK placed dead centre. Every
 * loudness statistic is therefore dead centre in at least one variant, and both
 * variants are scored. The gating verdicts are identical either way, which is
 * the whole point: no loudness statistic is carrying the band.
 *
 * A mild sine tremolo is applied first. It is kept deliberately even though it
 * HELPS the fakes — it gives the sustained-note control a 4 Hz amplitude
 * envelope that lifts its onsetRate from 19.9/s to 4.87/s, squarely into the
 * corpus band. Handing the adversary a free metric is the conservative choice.
 *
 * Usage: node tools/calibrate-audio-band.mjs [--band docs/band-audio-v1.json]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'audio-metrics.mjs');
const RAW = path.join(ROOT, 'corpus', 'controls', 'raw');
const OUT = path.join(ROOT, 'corpus', 'controls', 'mastered');
const bandPath = process.argv.includes('--band')
  ? path.resolve(process.argv[process.argv.indexOf('--band') + 1])
  : path.join(ROOT, 'docs', 'band-audio-v1.json');

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const measure = f => JSON.parse(sh('node', [TOOL, f, '--json'])).metrics;

function ffmpeg(inFile, outFile, filter) {
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', inFile,
    '-af', filter, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', outFile]);
}

const band = JSON.parse(fs.readFileSync(bandPath, 'utf8'));
const tgtRms = band.nonGating.rmsDbfs.median;
const tgtPeak = band.nonGating.peakDbfs.median;
console.log(`targets = corpus medians: rms ${tgtRms.toFixed(3)} dBFS, peak ${tgtPeak.toFixed(3)} dBFS, ` +
  `crest ${band.nonGating.crestFactorDb.median.toFixed(3)} dB (unreachable, see header)\n`);

fs.mkdirSync(OUT, { recursive: true });
sh('node', [TOOL, '--make-controls', RAW]);

const tmp = path.join(OUT, '.tmp.wav');
// Mild tremolo (depth 0.7 measured to keep silenceFraction at 0.000) then a
// limiter. Gain is applied last; crest is gain-invariant so it is unaffected.
const CHAIN = 'tremolo=f=4:d=0.7,alimiter=level_in=1:limit=0.98:attack=5:release=50';

for (const f of fs.readdirSync(RAW).filter(x => x.endsWith('.wav')).sort()) {
  const src = path.join(RAW, f);
  ffmpeg(src, tmp, CHAIN);
  const base = measure(tmp);
  for (const [tag, gain] of [['rms-centred', tgtRms - base.rmsDbfs], ['peak-centred', tgtPeak - base.peakDbfs]]) {
    const dst = path.join(OUT, f.replace(/\.wav$/, `-${tag}.wav`));
    ffmpeg(src, dst, `${CHAIN},volume=${gain.toFixed(4)}dB`);
    const m = measure(dst);
    console.log(`${f.replace('.wav', '').padEnd(28)} ${tag.padEnd(13)} gain=${gain >= 0 ? '+' : ''}${gain.toFixed(2).padStart(6)}dB  ` +
      `-> peak ${m.peakDbfs.toFixed(2).padStart(7)}  rms ${m.rmsDbfs.toFixed(2).padStart(7)}  crest ${m.crestFactorDb.toFixed(2).padStart(5)}  silence ${m.silenceFraction.toFixed(3)}`);
  }
}
fs.rmSync(tmp, { force: true });
console.log(`\nmastered controls in ${OUT}`);
