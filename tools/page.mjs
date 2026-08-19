#!/usr/bin/env node
// The live page: same seeds each round, numbers beside the bar, win-loss.
//
// Regenerated from what is actually on disk — the duel directories, the key,
// the band, and tools/metrics.mjs run live over the very crops the judges saw.
// Nothing on this page is typed in by hand, because a scoreboard somebody
// edits is a scoreboard that flatters.
//
// Crops are copied, never scaled, and displayed at exactly 320x320 with
// image-rendering:pixelated so a browser cannot resample them either.
//
// Usage: node tools/page.mjs --rounds r1 [--out web]

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const a = {};
for (let i = 2; i < process.argv.length; i++) {
  const v = process.argv[i];
  if (v.startsWith('--')) {
    const n = process.argv[i + 1];
    a[v.slice(2)] = n === undefined || n.startsWith('--') ? true : (i++, n);
  }
}
const OUT = path.join(REPO, String(a.out ?? 'web'));
const ROUNDS = String(a.rounds ?? 'r1').split(',');

const band = JSON.parse(readFileSync(path.join(REPO, 'docs/band-pixel-v1.json'), 'utf8'));
const BM = band.metrics || band;

// The metrics worth putting in front of a human. The full 34 live in the JSON.
const SHOW = [
  'changeRate.h', 'runLen.fracGt8', 'colorsPerTile.median16',
  'palette.distinct', 'flat.frac3x3', 'edge.meanDelta', 'hue.fracNearGrey',
];

function metricsOf(file) {
  const txt = execFileSync('node', [path.join(REPO, 'tools/metrics.mjs'), file], { cwd: REPO }).toString();
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.trim().match(/^([A-Za-z0-9.]+)\s+(-?[\d.]+)$/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

function bandOf(k) {
  const b = BM[k];
  if (!b) return null;
  const lo = b.p05 ?? b.lo ?? (Array.isArray(b) ? b[0] : null);
  const hi = b.p95 ?? b.hi ?? (Array.isArray(b) ? b[1] : null);
  return lo == null || hi == null ? null : [lo, hi];
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

mkdirSync(path.join(OUT, 'img'), { recursive: true });
const sections = [];
let wins = 0, losses = 0, pending = 0, voids = 0;

for (const round of ROUNDS) {
  const dir = path.join(REPO, 'out', `duel-${round}`);
  if (!existsSync(dir)) continue;
  const keyFile = path.join(REPO, 'out/.keys', `duel-${round}.key.json`);
  // Key files written before the tree-digest change are a bare array; newer
  // ones wrap the pairs in an object carrying the round's source digest.
  const rawKey = JSON.parse(readFileSync(keyFile, 'utf8'));
  const key = Array.isArray(rawKey) ? rawKey : rawKey.pairs;
  const treeDigest = Array.isArray(rawKey) ? null : rawKey.treeDigest;
  const verdictFile = path.join(REPO, 'out/.keys', `duel-${round}.verdicts.json`);
  const verdicts = existsSync(verdictFile) ? JSON.parse(readFileSync(verdictFile, 'utf8')) : {};

  const pairs = [...new Set(key.map((k) => k.pair))].sort((x, y) => x - y);
  const rows = [];

  for (const p of pairs) {
    const ab = key.find((k) => k.pair === p && k.order === 'ab');
    const refSide = ab.A.source === 'reference' ? 'A' : 'B';
    const fixSide = refSide === 'A' ? 'B' : 'A';
    const refFile = path.join(dir, `pair${p}-ab`, `${refSide}.png`);
    const fixFile = path.join(dir, `pair${p}-ab`, `${fixSide}.png`);
    // Inlined as data URIs so the page is one portable file that renders the
    // same from disk, from a static snapshot, or served. The PNG bytes are
    // copied verbatim — base64 is not a re-encode, so these are still the exact
    // pixels the judges saw.
    copyFileSync(refFile, path.join(OUT, 'img', `${round}-p${p}-ref.png`));
    copyFileSync(fixFile, path.join(OUT, 'img', `${round}-p${p}-fixel.png`));
    const refImg = 'data:image/png;base64,' + readFileSync(refFile).toString('base64');
    const fixImg = 'data:image/png;base64,' + readFileSync(fixFile).toString('base64');

    const mr = metricsOf(refFile), mf = metricsOf(fixFile);
    const v = verdicts[`p${p}`] || {};
    const res = v.result || 'pending';
    if (res === 'WIN') wins++; else if (res === 'LOSS') losses++;
    else if (res === 'VOID') voids++; else pending++;

    const mrows = SHOW.map((k) => {
      const b = bandOf(k);
      const val = mf[k];
      const inBand = b && val != null && val >= b[0] && val <= b[1];
      return `<tr><td class="k">${esc(k)}</td><td>${fmt(mr[k])}</td>
        <td class="${inBand ? 'ok' : 'bad'}">${fmt(val)}</td>
        <td class="band">${b ? `${fmt(b[0])} – ${fmt(b[1])}` : '—'}</td></tr>`;
    }).join('');

    rows.push(`<section class="pair">
      <h3>pair ${p} <span class="res ${res.toLowerCase()}">${res}</span></h3>
      <div class="prov">seed <code>${esc(ab[fixSide].seed ?? '')}</code> · fixel crop (${ab[fixSide].x}, ${ab[fixSide].y}) · reference crop (${ab[refSide].x}, ${ab[refSide].y})</div>
      <div class="imgs">
        <figure><img src="${refImg}" width="320" height="320" alt="reference crop"><figcaption>the bar</figcaption></figure>
        <figure><img src="${fixImg}" width="320" height="320" alt="fixel crop"><figcaption>fixel</figcaption></figure>
      </div>
      <table><thead><tr><th>metric</th><th>bar</th><th>fixel</th><th>band p05–p95</th></tr></thead><tbody>${mrows}</tbody></table>
      ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
    </section>`);
  }
  sections.push(`<h2>round ${esc(round)}</h2>` +
    (treeDigest ? `<p class="prov">generator source digest <code>${esc(treeDigest)}</code></p>` : '') +
    rows.join(''));
}

function fmt(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(v < 1 ? 3 : 2);
}

const html = `<!doctype html><meta charset="utf-8">
<title>Fixel — against the bar</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#0f1013;--fg:#e8e6e1;--dim:#8b8a86;--line:#26272c;--ok:#5ec269;--bad:#e0555b;--acc:#e8a33d}
*{box-sizing:border-box}
body{margin:0;padding:32px 20px 80px;background:var(--bg);color:var(--fg);
  font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
.wrap{max-width:820px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px;letter-spacing:.02em}
h2{font-size:15px;margin:40px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line);color:var(--acc)}
h3{font-size:13px;margin:0 0 6px;font-weight:600}
.sub{color:var(--dim);margin:0 0 24px}
.tally{display:flex;gap:20px;padding:12px 16px;border:1px solid var(--line);border-radius:6px;margin-bottom:8px}
.tally b{font-size:20px;display:block}
.pair{border:1px solid var(--line);border-radius:6px;padding:16px;margin-bottom:18px}
.prov{color:var(--dim);font-size:12px;margin-bottom:12px}
.imgs{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px}
figure{margin:0}
img{image-rendering:pixelated;display:block;border:1px solid var(--line);width:320px;height:320px}
figcaption{color:var(--dim);font-size:12px;padding-top:4px}
table{border-collapse:collapse;width:100%;font-size:12px}
th{text-align:left;color:var(--dim);font-weight:400;padding:4px 8px 4px 0;border-bottom:1px solid var(--line)}
td{padding:3px 8px 3px 0;border-bottom:1px solid #191a1e}
td.k{color:var(--dim)}
td.ok{color:var(--ok)}
td.bad{color:var(--bad)}
td.band{color:var(--dim)}
.res{font-size:11px;padding:1px 7px;border-radius:3px;vertical-align:1px}
.res.win{background:#1c3a20;color:var(--ok)}
.res.loss{background:#3a1c1e;color:var(--bad)}
.res.pending{background:#2a2a2f;color:var(--dim)}
.res.void{background:#33291c;color:var(--acc);text-decoration:line-through}
b.void{color:var(--acc)}
.note{color:var(--dim);font-size:12px;margin:10px 0 0}
footer{color:var(--dim);font-size:12px;margin-top:40px;border-top:1px solid var(--line);padding-top:12px}
</style>
<div class="wrap">
<h1>Fixel — against the bar</h1>
<p class="sub">Unscaled 320&times;320 crops, both from inside a larger scene, same PNG encoding.
Seeds pick the post and both crops. A pair wins only if a fresh judge picks Fixel in <em>both</em> orders.
Metric counts are <em>not</em> a craft score and are not shown as one &mdash; the band measures
artwork identity, not craft. <strong>Void</strong> = judged under a brief later found to be biased.</p>
<div class="tally">
  <div><b class="ok">${wins}</b>won</div>
  <div><b class="bad">${losses}</b>lost</div>
  <div><b>${pending}</b>pending</div>
  <div><b class="void">${voids}</b>void</div>
</div>
${sections.join('')}
<footer>Generated by <code>tools/page.mjs</code> from the duel directories and a live run of
<code>tools/metrics.mjs</code>. Band: <code>docs/band-pixel-v1.json</code>, derived from 128 seeded
interior crops of the reference. Nothing on this page is hand-entered.</footer>
</div>`;

writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`${path.join(OUT, 'index.html')}  ${wins}W ${losses}L ${pending} pending`);
