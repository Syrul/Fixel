#!/usr/bin/env node
// Blind duel assembly.
//
// Two unscaled same-size crops, one from inside the reference and one from
// inside a generated post, written in ONE identical PNG encoding, labelled A
// and B, with the mapping in key.json which the judge must never see.
//
// Everything here exists to stop the judge from telling the sides apart by
// anything other than craft. The leaks this closes, in the order they were
// found to matter in slopscroll:
//
//   1. SIZE. Different pixel dimensions sort the sources perfectly. Both crops
//      are exactly --size square.
//   2. RESAMPLING. Any scale step puts filtered pixels on one side only, and
//      a pixel-art judge spots interpolation instantly. There is no resize in
//      this file. src/core/png.js has no resize function to call.
//   3. FORMAT. The reference is 8-bit RGBA non-interlaced. Both crops are
//      re-encoded through the same encoder at the same settings, so colour
//      type, bit depth, filter choice and zlib level match. The reference crop
//      is re-encoded too, deliberately — passing it through byte-for-byte
//      would leave the original encoder's fingerprint on one side.
//   4. ALPHA. Forced to 255 on both sides. A stray transparent pixel on one
//      side is a giveaway and a metrics distortion.
//   5. FILE LENGTH. A sparse generator's PNG deflates much smaller than a
//      dense reference crop, so `ls -la` alone would give the game away. Both
//      files are padded with a private ancillary chunk to the same byte
//      length. This does not hide the density difference from the picture —
//      it hides it from the directory listing, which is not craft.
//   6. TIMESTAMPS. Both files get the same mtime.
//   7. POSITION BIAS. Every pair is emitted twice, once as (ref=A, ours=B) and
//      once as (ref=B, ours=A), in two separate directories. A win only counts
//      if it holds in both orders.
//   8. CHERRY-PICKING. The post seed and BOTH crop positions come from the
//      round seed. There is no flag to nominate a crop, on purpose.
//
// The self-test for all of this is `--control ref`, which builds pairs from
// two different crops of the REFERENCE ONLY. A judge given a control pair must
// be at chance. If a judge reliably picks one side of a control pair, the
// harness is leaking and every real result in that round is uninterpretable.
//
// Usage:
//   node tools/duel.mjs --round r1 --pairs 4 --size 320
//   node tools/duel.mjs --round r1c --pairs 2 --size 320 --control ref
//
// Only city posts are duelled: --biome selects which, and the default is the
// only one this reference can fairly judge. See the redraw filter in main().

import { mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { pickBiome } from '../src/gen/scene.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import { readPNG, crop } from '../src/core/png.js';
import { Rng } from '../src/core/rng.js';
import { treeHash } from './treehash.mjs';
import { normalisePair } from './normalise.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REF = path.join(REPO, 'refs/EBY-LA-Hot-Dog-175k.png');
const FIXED_MTIME = new Date('2001-01-01T00:00:00Z');

const args = parse(process.argv.slice(2));
const ROUND = String(args.round ?? 'r1');
const PAIRS = Number(args.pairs ?? 4);
const SIZE = Number(args.size ?? 320);
const INSET = Number(args.inset ?? 24);   // crops never touch a scene edge
// Which biome may face this reference. See the redraw filter in main().
const DUEL_BIOME = String(args.biome ?? 'city');
const SCENE_W = Number(args.sw ?? 1600);
const SCENE_H = Number(args.sh ?? 1100);
const CONTROL = args.control || null;
const OUT = path.join(REPO, 'out', `duel-${ROUND}`);

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2), n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) o[k] = true;
    else { o[k] = n; i++; }
  }
  return o;
}

/** Seeded interior crop. Position comes from the round seed, never from us. */
function seededCrop(img, st, size, inset) {
  const maxX = img.w - size - inset;
  const maxY = img.h - size - inset;
  if (maxX < inset || maxY < inset) {
    throw new Error(`image ${img.w}x${img.h} too small for a ${size}px crop inset ${inset}`);
  }
  const x = st.int(inset, maxX);
  const y = st.int(inset, maxY);
  return { ...crop(img, x, y, size, size), x, y };
}

/** One encoder, one setting, both sides. Alpha forced opaque. */
function encode(w, h, data) {
  const p = new PNG({ width: w, height: h, colorType: 6, inputHasAlpha: true });
  data.copy(p.data);
  for (let i = 3; i < p.data.length; i += 4) p.data[i] = 255;
  return PNG.sync.write(p, { colorType: 6, deflateLevel: 9, filterType: -1 });
}

/**
 * Pad a PNG buffer to `target` bytes with a private ancillary chunk.
 * Chunk type `pxPd`: byte0 lowercase = ancillary, byte1 lowercase = private,
 * byte2 uppercase = reserved-conformant, byte3 lowercase = safe to copy.
 * Every decoder ignores it; `ls -la` does not.
 */
function padTo(buf, target) {
  const overhead = 12; // length(4) + type(4) + crc(4)
  const need = target - buf.length;
  if (need < overhead) return buf;
  const payload = Buffer.alloc(need - overhead, 0);
  const type = Buffer.from('pxPd', 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, payload])), 0);
  const chunk = Buffer.concat([len, type, payload, crc]);
  const iendAt = buf.length - 12; // IEND is the final 12 bytes
  return Buffer.concat([buf.subarray(0, iendAt), chunk, buf.subarray(iendAt)]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const rng = new Rng(`fixel-duel-${ROUND}`);
  const stPost = rng.stream('post-seeds');
  const postSkips = [];
  const stRefCrop = rng.stream('ref-crops');
  const stOurCrop = rng.stream('our-crops');

  const refImg = readPNG(REF);
  const key = [];

  // Stamp the round with the digest of the generator source it was rendered
  // from, and refuse to build a round while that source is moving.
  //
  // Round r2 was assembled during a concurrent-write incident and its Fixel
  // crops therefore correspond to a tree state nobody recorded. The pixels are
  // real and the verdicts about them are valid, but the scenes cannot be
  // re-rendered, which means a losing pair cannot be re-examined after a fix.
  // A duel you cannot reproduce is a duel you can only run once.
  const treeBefore = treeHash().digest;

  for (let i = 0; i < PAIRS; i++) {
    // --- the reference side
    const refC = seededCrop(refImg, stRefCrop, SIZE, INSET);

    // --- the other side
    let otherC, otherWhat;
    if (CONTROL === 'ref') {
      // Harness self-test: both sides are the reference. A judge must be at
      // chance here. Force a distinct crop so the two are never identical.
      // The two control crops must not OVERLAP AT ALL.
      //
      // The first version of this rejected only when both axes were within
      // SIZE/2, which is satisfied by plenty of overlapping pairs. A control
      // judge found the consequence by brute-force offset search: 24,344
      // pixels — 23.8% of each frame — were RGBA-identical between the two
      // "different" crops, flush in one corner of each and seam-free. It
      // correctly concluded the two crops were windows onto one raster, which
      // makes the harness self-test partly degenerate: a judge comparing two
      // crops that share a quarter of their pixels is not being asked the
      // question the control exists to ask.
      //
      // Two axis-aligned squares of equal size are disjoint iff they are
      // separated by at least SIZE on EITHER axis.
      let c, tries = 0;
      do {
        c = seededCrop(refImg, stOurCrop, SIZE, INSET);
        if (++tries > 500) throw new Error('cannot find a non-overlapping control crop; image too small for this --size');
      } while (Math.abs(c.x - refC.x) < SIZE && Math.abs(c.y - refC.y) < SIZE);
      otherC = c;
      otherWhat = { source: 'reference-control', x: c.x, y: c.y };
    } else {
      // ONLY CITY POSTS MAY BE DUELLED AGAINST THIS REFERENCE, AND THE FILTER
      // IS A REDRAW, NOT A FORCED BIOME.
      //
      // The feed now emits four kinds of place. The bar is one urban Pixorama
      // — measured, it contains no water body and no beach: its largest
      // single-colour region is 8,780 px of pale cream and its two biggest
      // blues are ~3,200 px each, which is signage scale. So a desert, a shore
      // or a highland crop set beside it is not a craft comparison, it is a
      // subject comparison, and a judge would be answering a question nobody
      // asked. Quietly duelling only the cities and reporting a pass would be
      // worse still.
      //
      // The filter REDRAWS the post seed until the seed's own biome is a city,
      // rather than rendering a forced city at a seed the feed would have shown
      // as a desert. That distinction is the whole point: the duel must judge an
      // artefact the feed actually ships. Forcing the biome would produce a
      // picture that exists nowhere else, and a win on it would mean nothing.
      //
      // The number of seeds passed over is written into the key file, because a
      // filter nobody can audit is a cherry-pick with a comment above it.
      let postSeed, skipped = 0;
      for (;;) {
        postSeed = `fixel-${ROUND}-${stPost.int(0, 0x7fffffff).toString(36)}`;
        if (pickBiome(postSeed) === DUEL_BIOME) break;
        skipped++;
        if (skipped > 2000) throw new Error(`no ${DUEL_BIOME} post seed found in 2000 draws`);
      }
      postSkips.push(skipped);
      const scenePath = path.join(OUT, '.tmp', `scene-${i}.png`);
      await mkdir(path.dirname(scenePath), { recursive: true });
      execFileSync('node', [
        path.join(REPO, 'tools/render.mjs'),
        '--seed', postSeed, '--out', scenePath,
        '--w', String(SCENE_W), '--h', String(SCENE_H),
      ], { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] });
      const ourImg = readPNG(scenePath);
      const c = seededCrop(ourImg, stOurCrop, SIZE, INSET);
      otherC = c;
      otherWhat = { source: 'fixel', seed: postSeed, biome: DUEL_BIOME, seedsSkippedToFindIt: postSkips[postSkips.length - 1], x: c.x, y: c.y, scene: `${ourImg.w}x${ourImg.h}` };
    }

    // --- encode both through the same encoder, pad to equal length
    // BOTH sides get a padding chunk, never just the smaller one.
    //
    // Round r1 leaked here: padding only the smaller file meant exactly one
    // image in each pair carried a `pxPd` chunk, and a judge that parsed the
    // PNG structure found it — "B's PNG carries a 70,074-byte private pxPd
    // chunk that equalises the two file sizes". Since the padded side is by
    // construction the one that deflated smaller, the chunk's mere presence
    // identified our side. Equal file lengths are worthless if only one file
    // had to be stretched to get there.
    //
    // Padding to max+SLACK guarantees both files carry a chunk of non-trivial
    // size, so presence carries no information. The IDAT lengths still differ —
    // that is a real density difference and cannot be hidden without
    // re-encoding — so BRIEF.md now tells the judge that internal chunk sizes
    // are not evidence of origin.
    // Colour-normalise the pair through ONE shared palette before encoding.
    // A leak control that saw no images at all — only colour histograms —
    // recovered the reference-vs-generator partition perfectly, then labelled
    // it backwards. Perfect recovery means provenance rides in the colour
    // multiset; the inverted sign means no instruction to a judge can suppress
    // it. See tools/normalise.mjs for the two fingerprints this removes.
    // OFF BY DEFAULT. I shipped this on-by-default at K=192 before sweeping it,
    // and a sweep of this very pipeline shows K=192 SEPARATES the sides 4/4 on
    // top-1 colour share — so as deployed it did not close the leak it was
    // built for. Worse, the failure runs counter-intuitively: a FINER palette
    // is LEAKIER, because a coarse shared palette merges the reference's
    // fragmented near-black cloud into one slot and lifts its top-1 share to
    // meet ours, while a fine palette keeps our single exact ink in a slot of
    // its own with its full ~0.18 mass intact.
    //
    //   K:        16     24     32     48     64     96    128    192
    //   result: over-  over-  SEP    SEP    SEP    SEP    SEP    SEP
    //           laps   laps   4/4    4/4    4/4    4/4    4/4    4/4
    //
    // And the ordering was wrong anyway. The strongest surviving separator is
    // our own generator invariant — one exact ink at a fixed high mass share —
    // and the darkShare regression fix is already a round-4 prerequisite. If
    // that brings our ink share into the reference's 0.05-0.10 band, the
    // separator dies at source and no normaliser is needed at all. Tuning K now
    // means tuning against a number that is about to move.
    //
    // Enable explicitly with --normalise K once the ink fix has landed and the
    // leak has been re-measured on post-fix output.
    const NORM = args.normalise ? Number(args.normalise) : 0;
    let dataRef = refC.data, dataOur = otherC.data;
    if (NORM) {
      const n = normalisePair(refC.data, otherC.data, NORM);
      dataRef = n.a; dataOur = n.b;
    }

    const SLACK = 65536;
    let bufRef = encode(SIZE, SIZE, dataRef);
    let bufOur = encode(SIZE, SIZE, dataOur);
    const target = Math.max(bufRef.length, bufOur.length) + SLACK;
    bufRef = padTo(bufRef, target);
    bufOur = padTo(bufOur, target);

    // --- both orders, in separate directories
    for (const [order, first, second] of [
      ['ab', { buf: bufRef, what: { source: 'reference', x: refC.x, y: refC.y } }, { buf: bufOur, what: otherWhat }],
      ['ba', { buf: bufOur, what: otherWhat }, { buf: bufRef, what: { source: 'reference', x: refC.x, y: refC.y } }],
    ]) {
      const dir = path.join(OUT, `pair${i + 1}-${order}`);
      await mkdir(dir, { recursive: true });
      const fa = path.join(dir, 'A.png'), fb = path.join(dir, 'B.png');
      writeFileSync(fa, first.buf);
      writeFileSync(fb, second.buf);
      await utimes(fa, FIXED_MTIME, FIXED_MTIME);
      await utimes(fb, FIXED_MTIME, FIXED_MTIME);
      // Integrity manifest. Round r1 had concurrent judges sharing one
      // scratchpad; one judge's working crops were overwritten mid-run by
      // another judge's, and it only noticed because the dimensions clashed.
      // A judge that did not notice would have silently ranked the wrong
      // pixels and nothing downstream could have detected it. Every judge now
      // gets its own scratch directory AND verifies these hashes before it
      // looks at anything. Hashes of both sides leak nothing: they are equally
      // opaque for the reference and for us.
      const sha = (b) => createHash('sha256').update(b).digest('hex');
      await writeFile(path.join(dir, 'CHECKSUMS.txt'),
        `sha256  A.png  ${sha(first.buf)}\nsha256  B.png  ${sha(second.buf)}\n`);
      key.push({ pair: i + 1, order, A: first.what, B: second.what });
    }
  }

  await rm(path.join(OUT, '.tmp'), { recursive: true, force: true });
  // The key lives OUTSIDE the duel directory. A judge is pointed at
  // out/duel-<round>/pairN-<order>/ and a judge that lists its parent must not
  // find the answers one level up. slopscroll's rule — "never show a judge the
  // key" — is easier to keep when the key is not in the room.
  const treeAfter = treeHash().digest;
  if (treeAfter !== treeBefore && !CONTROL) {
    throw new Error(
      `TORN ROUND: generator source changed while building the duel ` +
      `(${treeBefore} -> ${treeAfter}). The crops in this round came from more ` +
      `than one version of the generator and cannot be reproduced. ` +
      `Serialise writers, then re-run.`);
  }

  const keyDir = path.join(REPO, 'out', '.keys');
  await mkdir(keyDir, { recursive: true });
  await writeFile(path.join(keyDir, `duel-${ROUND}.key.json`),
    JSON.stringify({ round: ROUND, treeDigest: treeAfter, size: SIZE, control: CONTROL, pairs: key }, null, 2));

  // The judge reads this. It carries no provenance.
  await writeFile(path.join(OUT, 'BRIEF.md'), [
    '# Blind pair',
    '',
    `Two images, A.png and B.png. Both are ${SIZE}x${SIZE} pixels, 8-bit RGBA PNG,`,
    'non-interlaced, at native 1:1 scale with no scaling or resampling applied.',
    '',
    'Each is an unscaled crop taken from the interior of a larger isometric',
    'pixel-art scene. Neither is a complete composition, neither is centred on',
    'a subject, and both were cut at positions chosen by a random seed. Nothing',
    'in the files, their names, their byte lengths or their timestamps indicates',
    'where either came from.',
    '',
    '## About the files themselves',
    '',
    'BOTH files carry a private padding chunk so that the two are exactly the',
    'same byte length. Internal chunk sizes, compressed-stream lengths and',
    'overall file size therefore carry NO information about origin, and reading',
    'them is not evidence of anything. Judge the pixels.',
    '',
    '`CHECKSUMS.txt` holds the sha256 of both images. Verify them before you',
    'start and again before you report, and work only in the scratch directory',
    'you were given. If a hash does not match, stop and say so rather than',
    'reporting a ranking.',
    '',
    '## What you are judging',
    '',
    'CRAFT, not subject. Do not reward one image for depicting a more appealing',
    'or more legible thing. Judge only:',
    '',
    '- pixel density and how much of the area is doing work',
    '- colour discipline: are the hues chosen, related and reused, or scattered',
    '- edge quality: hard, deliberate pixel edges vs mush, noise or antialiasing',
    '- form: do the volumes read as solid objects with consistent lighting',
    '- detail hierarchy: is there small detail that survives being looked at closely',
    '- variety: does the crop repeat itself, or is every region distinct',
    '',
    'Ignore what the scenes depict. Ignore any text or signage content.',
  ].join('\n'));

  console.log(JSON.stringify({ out: OUT, pairs: PAIRS, size: SIZE, control: CONTROL,
    normalise: args.normalise ? Number(args.normalise) : false }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
