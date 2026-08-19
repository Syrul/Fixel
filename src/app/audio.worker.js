// Chiptune generation, off the main thread.
//
// Imports compose.js and render.js DIRECTLY rather than src/audio/index.js,
// because index.js also re-exports the WAV encoder, which is node-only. The
// composer and the renderer are pure — tables in, Float32Array out — so they
// run unmodified in a worker. src/audio/** is not touched.

import { composeSong } from '../audio/compose.js';
import { renderRange, SAMPLE_RATE } from '../audio/render.js';

// `cond` is the RESOLVED conditions object main.js already made for the
// caption and the picture — passed in rather than re-derived here, because two
// resolutions of one seed are two opinions and the invariant is that the audio
// and the picture never disagree about the weather. Absent, the composer is
// biome-neutral and there is no ambience; that is the offline path, not this
// one.
self.onmessage = (e) => {
  const { id, seed, seconds = 48, cond = null } = e.data;
  const t0 = performance.now();
  const song = composeSong(seed, { seconds, cond });
  const t1 = performance.now();
  const { mix } = renderRange(song, 0, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE);
  self.postMessage({
    id, seed,
    sampleRate: SAMPLE_RATE,
    bpm: song.bpm,
    key: `${song.key.tonic} ${song.key.mode}`,
    bars: song.totalBars,
    voices: song.ensemble.voices.length,
    composeMs: t1 - t0,
    renderMs: performance.now() - t1,
    mix: mix.buffer,
  }, [mix.buffer]);
};
