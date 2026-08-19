#!/usr/bin/env node
// The digest of the generator source tree, and the guard against measuring a
// tree that is moving.
//
// This exists because of a real incident. Two builders wrote src/gen/**
// concurrently in a repo with no version control. The identical seed, rendered
// ten minutes apart, produced different pixels — palette 16400 -> 16677, sha
// 110bd555 -> 84b43867. Nothing in the process could distinguish "the
// generator is nondeterministic" from "the generator is not the same generator
// any more", and those need completely different fixes. Half an hour of
// measurements had to be discarded because no number carried a record of what
// it was measured against.
//
// Rule adopted: a metric without a tree digest is not evidence.
//
// Usage:
//   node tools/treehash.mjs              # print the digest and the file table
//   node tools/treehash.mjs --short      # just the digest
//   import { treeHash, assertQuiesced } from './treehash.mjs'

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Every source file that can change a rendered pixel. */
export function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(path.join(REPO, 'src'));
  out.push(path.join(REPO, 'tools/render.mjs'));
  return out;
}

/** One digest over the contents of every source file, order-stable. */
export function treeHash() {
  const h = createHash('sha256');
  const files = [];
  for (const f of sourceFiles()) {
    const buf = readFileSync(f);
    const fh = createHash('sha256').update(buf).digest('hex');
    h.update(path.relative(REPO, f)).update('\0').update(fh).update('\0');
    files.push({ file: path.relative(REPO, f), sha: fh.slice(0, 12), mtime: statSync(f).mtime.toISOString() });
  }
  return { digest: h.digest('hex').slice(0, 16), files };
}

/**
 * Run `fn`, then confirm the tree did not move while it ran.
 *
 * A torn measurement is worse than a failed one: it looks like data. This
 * throws rather than returning a flag, because the one thing that must not
 * happen is a number being quoted without its caveat.
 */
export function assertQuiesced(label, fn) {
  const before = treeHash().digest;
  const result = fn();
  const after = treeHash().digest;
  if (before !== after) {
    throw new Error(
      `TORN MEASUREMENT in "${label}": source tree changed during the run ` +
      `(${before} -> ${after}). Discard this result. Serialise writers, then re-run.`);
  }
  return { result, treeDigest: after };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = treeHash();
  if (process.argv.includes('--short')) console.log(t.digest);
  else {
    console.log(`tree ${t.digest}   (${t.files.length} source files)\n`);
    for (const f of t.files) console.log(`  ${f.sha}  ${f.mtime.slice(11, 19)}  ${f.file}`);
  }
}
