// src/audio/wav.js — canonical 44100 Hz mono 16-bit PCM RIFF writer.
//
// Matches corpus/chiptune/wav/ exactly (44100, mono, pcm_s16le), so a rendered
// post and a reference track go through the same reader in the bar's metric
// tool with no format difference to argue about.
//
// Byte-for-byte determinism: no timestamps, no metadata chunks, and one fixed
// quantiser (round-half-away-from-zero after a hard clamp).

export function encodeWav(samples, sampleRate = 44100) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = samples[i];
    if (!(v > -1)) v = v < -1 ? -1 : (v !== v ? 0 : v);
    if (v > 1) v = 1;
    const q = v < 0 ? -Math.round(-v * 32767) : Math.round(v * 32767);
    buf.writeInt16LE(q, 44 + i * 2);
  }
  return buf;
}
