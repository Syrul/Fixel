#!/usr/bin/env node
// node tools/render.mjs --seed <string> --out out/scene.png [--w 1600 --h 1100]
//
// Deterministic: the same seed produces a byte-identical PNG across processes.

import { renderScene } from '../src/gen/scene.js';
import { pickConditions, resolveConditions, TIME_KEYS, WEATHER_KEYS } from '../src/gen/conditions.js';
import { pickBiome, BIOME_KEYS } from '../src/gen/biome-mix.js';
import { writePNG } from '../src/core/png.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
function arg(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}

const seed = arg('seed', 'fixel-0');
const out = arg('out', 'out/scene.png');
const w = parseInt(arg('w', '1600'), 10);
const h = parseInt(arg('h', '1100'), 10);
// --biome OVERRIDES THE SEED'S OWN DRAW, AND IS A MEASUREMENT TOOL ONLY.
//
// The feed picks the biome from the seed; forcing one here renders a picture the
// feed would never show for that seed. That is exactly what you want for
// characterising one biome across many seeds, and exactly what you must not do
// for a duel — see the redraw filter in `tools/duel.mjs`, which finds a seed
// whose OWN biome is a city rather than forcing a city onto a desert's seed.
// Left off, this file behaves as it always has.
//
// READING THE FLAG IS ITSELF A TRAP, and this file's `arg()` fails differently
// from `tools/strip.mjs`'s, so the two validators cannot share one line:
//   * `--time --weather rain` makes `arg('time')` return the STRING '--weather',
//     which is truthy and would sail into the resolver as a time name;
//   * a trailing `--time` with nothing after it returns the default, which is
//     indistinguishable from the flag being absent — exactly the silent discard.
// So a value counts only if it is a non-empty string that is not itself a flag,
// and PRESENCE is read from `argv` directly rather than inferred from `arg()`.
const str = (v) => (typeof v === 'string' && v.length && !v.startsWith('--') ? v : undefined);
const biome = str(arg('biome', undefined));
// --time / --weather OVERRIDE THE SEED'S OWN DRAW, and are measurement tools
// only, for the same reason --biome is. Sweeping one condition across many
// seeds is what they are for. `--time day --weather clear` renders the
// REFERENCE condition, which is how the byte-identity check against the
// pre-conditions tree is done.
//
// AN UNKNOWN NAME IS REFUSED, NOT DEFAULTED, and that is the whole point of the
// block below. Nothing downstream validates one: `resolveConditions` falls
// through to `daySun 0.10` for any unrecognised time and to the FOG branch for
// any unrecognised weather. So `--time nite --weather rian` used to render a
// silent night and then print `nite/rian` back at you — a typo in a sweep
// producing a plausible picture of the wrong condition and a log line
// confirming the typo. It has already voided a 56-render sweep, where a zsh
// word-splitting mistake handed every render `--time "day clear" --weather ""`
// and the resolver accepted it as a night. It was caught by looking at the
// output, not by the exit code. Same shape as this repo's three silent-discard
// bugs: it reports success while doing something other than what was asked.
//
// THE ACCEPTED NAMES COME FROM THE RESOLVER'S AND THE MIX'S OWN EXPORTS. A
// second copy of either table here would be a bug waiting for someone to add a
// fifth weather or a fifth biome.
//
// `--biome` is validated on the same grounds and in the same loop. It had the
// identical defect: `--biome nonsense` rendered a city and printed
// `biome=nonsense` back, so a typo'd biome in a sweep produced a plausible
// picture of the wrong biome and a log line confirming the typo. `str()` and the
// presence test above apply to it unchanged.
const time = str(arg('time', undefined));
const weather = str(arg('weather', undefined));
for (const [flag, val, keys] of [['time', time, TIME_KEYS], ['weather', weather, WEATHER_KEYS],
  ['biome', biome, BIOME_KEYS]]) {
  if (!argv.includes('--' + flag)) continue;
  if (val === undefined || !keys.includes(val)) {
    process.stderr.write(
      `--${flag} ${val === undefined ? 'needs a value' : `"${val}" is not a ${flag}`}; ` +
      `one of: ${keys.join(' ')}\n`);
    process.exit(2);
  }
}

// --frame / --frames: WHICH picture of the loop, and how many there are.
//
// Left off, `frames` is 1 and the animation path is provably inert — no
// recorder, no allocation, not a branch inside a shader — so every digest,
// every metric run and every duel crop this repo has ever recorded still
// renders the same bytes. `docs/OWNERSHIP.md` rule 2 depends on that: a metric
// without a tree digest is not evidence, and a tree whose default output moved
// under a feature nobody asked to enable would invalidate all of them at once.
const frames = parseInt(arg('frames', '1'), 10);
const frame = parseInt(arg('frame', '0'), 10);

const t0 = Date.now();
// Re-derived through the same resolver the feed uses, so the INTERACTIONS stay
// consistent: overriding the two names on an already-resolved object would keep
// the old `sun`, `warmth` and `wet` and produce a state the resolver would
// never emit — a golden night, a dry rain.
let cond;
if (time || weather) {
  const kind = biome || pickBiome(seed);
  const base = pickConditions(seed, kind);
  cond = resolveConditions(time || base.time, weather || base.weather, kind);
}

const cv = renderScene(seed, {
  w, h, frames, frame,
  ...(biome ? { biome } : {}),
  ...(cond ? { cond } : {}),
});
const ms = Date.now() - t0;
mkdirSync(dirname(out), { recursive: true });
writePNG(out, cv.w, cv.h, cv.toRGBA());
process.stderr.write(
  `seed=${seed}${biome ? ` biome=${biome}` : ''}${cond ? ` ${cond.time}/${cond.weather}` : ''} ${cv.w}x${cv.h} palette=${cv.pal.size}` +
  `${frames > 1 ? ` frame=${frame}/${frames} anim=${cv.anim ? cv.anim.n : 0}px` : ''} ${ms}ms -> ${out}\n`);
