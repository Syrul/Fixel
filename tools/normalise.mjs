#!/usr/bin/env node
// Colour normalisation for the duel.
//
// WHY THIS EXISTS
//
// A leak control was run in which a judge saw NO IMAGES AT ALL — only colour
// histograms, quantities invariant under shuffling every pixel. It recovered
// the reference-vs-generator partition perfectly across four pairs, with
// infinite margin, and then labelled it backwards. Both halves of that matter:
// the perfect recovery proves provenance is carried by the colour multiset
// alone, and the inverted sign proves the signal is not something a judge can
// be *instructed* out of using. Round 3's judges said they set palette evidence
// aside, and several did so explicitly by name — and the signal was still there
// for anyone who looked.
//
// The two fingerprints, measured:
//
//   eBoy LA reference   7 cube-corner colours over 67,160 px, incl. 34,672 px
//                       of true (0,0,0); top colour (179,173,164) at 4.84%;
//                       3021 distinct, with a cloud of 42-63 near-blacks that
//                       recur verbatim between crops
//   Fixel               ZERO cube-corner colours, zero true black; one exact
//                       generated ink (8,8,10) at ~18.8%; 2172 distinct
//
// Two separate giveaways. First, exact-palette cleanliness: a generator that
// writes palette indices emits an exact small palette, while a rasterised
// artwork accumulates near-duplicate ghosts as a production artefact. Second,
// palette identity across crops: the reference's four crops come from ONE file
// so they share colours exactly, while our four come from four seeds with
// per-scene palette commitment and share almost nothing.
//
// THE FIX: quantise BOTH sides to ONE palette derived from their union, through
// this single code path. Afterwards both images are drawn from the same colour
// set, so neither "has an exact clean palette" nor "shares colours with its
// siblings" distinguishes them — the near-black ghost cloud collapses onto the
// same entries our single ink collapses onto.
//
// WHAT THIS MUST NOT DO: destroy what judges actually cite — silhouette, scale
// hierarchy, off-lattice form, interior contour, value structure. Those are
// spatial and survive quantisation as long as K is generous. K is deliberately
// far above the ~16 colours that carry half of either image.
//
// It must also be applied to BOTH sides identically. Normalising one side only
// would swap one leak for a worse one.

/** Median-cut over the UNION histogram of both images, weighted by count. */
function medianCut(hist, k) {
  // hist: Map<packedRGB, count>
  let boxes = [[...hist.entries()].map(([c, n]) => ({
    r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255, n,
  }))];
  while (boxes.length < k) {
    // Split the box with the largest weighted spread; stop if none can split.
    let bi = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0, tot = 0;
      for (const p of b) {
        if (p.r < rMin) rMin = p.r; if (p.r > rMax) rMax = p.r;
        if (p.g < gMin) gMin = p.g; if (p.g > gMax) gMax = p.g;
        if (p.b < bMin) bMin = p.b; if (p.b > bMax) bMax = p.b;
        tot += p.n;
      }
      // Luma-weighted extent: green dominates perceived value, so a box that is
      // wide in green is more worth splitting than one wide in blue.
      const ext = Math.max((rMax - rMin) * 0.30, (gMax - gMin) * 0.59, (bMax - bMin) * 0.11);
      const score = ext * Math.log2(1 + tot);
      if (score > best) { best = score; bi = i; }
    }
    if (bi < 0) break;
    const b = boxes[bi];
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const p of b) {
      if (p.r < rMin) rMin = p.r; if (p.r > rMax) rMax = p.r;
      if (p.g < gMin) gMin = p.g; if (p.g > gMax) gMax = p.g;
      if (p.b < bMin) bMin = p.b; if (p.b > bMax) bMax = p.b;
    }
    const ch = (rMax - rMin) * 0.30 >= (gMax - gMin) * 0.59
      ? ((rMax - rMin) * 0.30 >= (bMax - bMin) * 0.11 ? 'r' : 'b')
      : ((gMax - gMin) * 0.59 >= (bMax - bMin) * 0.11 ? 'g' : 'b');
    b.sort((p, q) => p[ch] - q[ch]);
    // Split at the weighted median so both halves carry similar pixel mass.
    let half = 0, tot = 0;
    for (const p of b) tot += p.n;
    let cut = 0;
    for (let i = 0; i < b.length; i++) { half += b[i].n; if (half >= tot / 2) { cut = i + 1; break; } }
    if (cut <= 0 || cut >= b.length) cut = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  // Each box becomes its pixel-weighted centroid.
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const p of b) { r += p.r * p.n; g += p.g * p.n; bl += p.b * p.n; n += p.n; }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] : [0, 0, 0];
  });
}

function histOf(rgba, hist) {
  for (let i = 0; i < rgba.length; i += 4) {
    const c = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    hist.set(c, (hist.get(c) || 0) + 1);
  }
}

/** Nearest palette entry, cached per distinct source colour. */
function mapThrough(rgba, pal, cache) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const c = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
    let e = cache.get(c);
    if (e === undefined) {
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      let bi = 0, bd = Infinity;
      for (let j = 0; j < pal.length; j++) {
        const p = pal[j];
        // Weighted RGB distance, same weights as the split metric.
        const dr = (r - p[0]) * 0.30, dg = (g - p[1]) * 0.59, db = (b - p[2]) * 0.11;
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; bi = j; }
      }
      e = bi; cache.set(c, e);
    }
    const p = pal[e];
    out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; out[i + 3] = 255;
  }
  return out;
}

/**
 * Normalise a PAIR through one shared palette.
 * Returns { a, b, palette } with both buffers drawn from the same colour set.
 */
export function normalisePair(rgbaA, rgbaB, k = 192) {
  const hist = new Map();
  histOf(rgbaA, hist);
  histOf(rgbaB, hist);
  const pal = medianCut(hist, k);
  const cache = new Map();
  return { a: mapThrough(rgbaA, pal, cache), b: mapThrough(rgbaB, pal, cache), palette: pal };
}
