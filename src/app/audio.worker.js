// Chiptune generation, off the main thread.
//
// Imports compose.js and render.js DIRECTLY rather than src/audio/index.js,
// because index.js also re-exports the WAV encoder, which is node-only. The
// composer and the renderer are pure — tables in, Float32Array out — so they
// run unmodified in a worker. src/audio/** is not touched.

import { composeSong } from '../audio/compose.js';
import { renderRange, SAMPLE_RATE } from '../audio/render.js';

self.onmessage = (e) => {
  const { id, seed, seconds = 48 } = e.data;
  const t0 = performance.now();
  const song = composeSong(seed, { seconds });
  const t1 = performance.now();
  const { mix } = renderRange(song, 0, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE);
  self.postMessage({
    id, seed,
    sampleRate: SAMPLE_RATE,
    bpm: song.bpm,
    key: `${song.key.tonic} ${song.key.mode}`,
    bars: song.totalBars,
    composeMs: t1 - t0,
    renderMs: performance.now() - t1,
    mix: mix.buffer,
  }, [mix.buffer]);
};
