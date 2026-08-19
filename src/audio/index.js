// src/audio/index.js — the public surface of the Fixel chiptune engine.
//
//   composePost(seed)                  -> Song (symbolic, no audio)
//   renderPost(seed, { seconds })      -> { song, mix, stems, timings }
//   firstBufferLatency(seed, ms)       -> per-post start cost, in milliseconds
//
// One post = one seed = one scene = one tune. The same seed that draws the
// pixels writes the tables the synth plays; nothing here reads the clock, the
// filesystem, or Math.random.

import { composeSong } from './compose.js';
import { renderRange, renderChannelRaw, renderCalibrationTone, SAMPLE_RATE, CHANNELS, MASTER } from './render.js';
import { encodeWav } from './wav.js';
import { tableCacheSize } from './wavetable.js';

export { composeSong, renderRange, renderChannelRaw, renderCalibrationTone, encodeWav };
export { SAMPLE_RATE, CHANNELS, MASTER };

export function composePost(seed, opts = {}) {
  return composeSong(seed, opts);
}

export function renderPost(seed, opts = {}) {
  const seconds = opts.seconds ?? 60;
  const sr = opts.sampleRate ?? SAMPLE_RATE;
  const t0 = process.hrtime.bigint();
  const song = composeSong(seed, { seconds });
  const t1 = process.hrtime.bigint();
  const total = Math.round(seconds * sr);
  const { mix, stems } = renderRange(song, 0, total, sr);
  const t2 = process.hrtime.bigint();
  return {
    song, mix, stems, sampleRate: sr,
    timings: {
      composeMs: Number(t1 - t0) / 1e6,
      renderMs: Number(t2 - t1) / 1e6,
      totalMs: Number(t2 - t0) / 1e6,
      tables: tableCacheSize(),
    },
  };
}

/**
 * What a feed post actually costs before the first sample can be handed to the
 * audio device: compose the whole song, then render only the leading `ms`.
 * Reported cold (empty wavetable cache) and warm by tools/render-audio.mjs.
 */
export function firstBufferLatency(seed, ms = 500, opts = {}) {
  const sr = opts.sampleRate ?? SAMPLE_RATE;
  const t0 = process.hrtime.bigint();
  const song = composeSong(seed, { seconds: opts.seconds ?? 60 });
  const t1 = process.hrtime.bigint();
  const out = renderRange(song, 0, Math.round(ms * sr / 1000), sr);
  const t2 = process.hrtime.bigint();
  return {
    composeMs: Number(t1 - t0) / 1e6,
    firstBufferMs: Number(t2 - t1) / 1e6,
    totalMs: Number(t2 - t0) / 1e6,
    bufferSeconds: ms / 1000,
    samples: out.mix.length,
  };
}
