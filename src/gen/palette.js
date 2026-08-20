// The palette is BUILT, never stored.
//
// A family is one hue at four steps. The steps are made by SCALING RGB, not by
// dropping HSL lightness: scaling keeps the hue exactly where it was, and the
// reference's shadow steps do not rotate hue on average (measured median
// rotation ~-3.6 degrees, i.e. nil). Procedural shaders almost always drift
// toward blue in shadow; this one must not.
//
// EVERY SCENE COMMITS TO ITS OWN LIGHT. The variety gate measured the whole
// `shade.*` family FROZEN across seeds — ratios 0.018 to 0.115 where 1.000 is
// the floor — because the ladder below used to be four module constants. One
// lighting model, one luma ladder, one hue policy for every scene the feed will
// ever emit. It is now drawn per scene off the palette stream, and the numbers
// it moves are exactly `shade.lumaRatioMedian`, `shade.lumaRatioP75`,
// `shade.hueRotMedian` and `shade.hueRotAbsMedian`.
//
// The two properties are kept SEPARATE on purpose. The luma ratio belongs to
// the light; the hue rotation belongs to the pigment. A shadow step therefore
// rotates hue and deepens saturation, and is then rescaled so its luma ratio is
// still exactly the ladder factor. Without that rescale the two are welded and
// a scene cannot vary one without dragging the other.
//
// Families are minted on demand and cached on a quantised (h, s, l) key whose
// FINENESS is also per scene: `palette.distinct` spanned 229-365 across seeds
// where the reference's own crops span 410 of width, so how much palette a
// scene spends is itself a thing a scene decides.

import { Palette, hsl } from '../core/canvas.js';

const rec601 = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// [key, hue, sat, light] — the value given is the TOP face. The reference is a
// light image: its single most common colour is a warm light grey at 4.8% of
// the frame, and 59% of all its pixels are near-neutral. Neutral families carry
// the scene; the saturated ones are accents and are spent sparingly.
const FAM = [
  ['road',     40, 0.05, 0.66],
  ['roadD',    38, 0.04, 0.50],
  ['pave',     46, 0.13, 0.82],
  ['concrete', 40, 0.07, 0.76],
  ['stone',    36, 0.10, 0.70],
  ['cream',    46, 0.22, 0.90],
  ['white',    48, 0.05, 0.97],
  ['metal',   210, 0.06, 0.72],
  ['steel',   212, 0.14, 0.54],
  ['slate',   215, 0.10, 0.42],
  // Rubber. A tyre is a MATERIAL with a value, not a hole in the picture, and
  // it was being drawn in the shared silhouette ink. Measured whole-frame, we
  // held exactly ONE colour below luma 16 where the reference holds around two
  // hundred: everything dark in our city was the same black. Four tyres on each
  // of 250+ vehicles is the largest dark mass we draw and the obvious place to
  // start giving darks back their own hue.
  ['rubber',  220, 0.06, 0.13],
  ['taupe',    30, 0.12, 0.58],
  ['sandy',    40, 0.38, 0.80],
  ['brick',    10, 0.52, 0.54],
  ['terra',    18, 0.66, 0.62],
  ['wood',     28, 0.35, 0.52],
  ['red',       2, 0.82, 0.55],
  ['orange',   24, 0.92, 0.58],
  ['amber',    38, 0.95, 0.62],
  ['yellow',   50, 0.96, 0.68],
  ['lime',     76, 0.74, 0.54],
  ['leaf',    118, 0.54, 0.42],
  ['grass',    92, 0.48, 0.52],
  ['green',   146, 0.66, 0.46],
  ['teal',    172, 0.58, 0.50],
  ['cyan',    192, 0.74, 0.56],
  ['aqua',    196, 0.54, 0.70],
  ['glass',   204, 0.52, 0.62],
  ['blue',    216, 0.72, 0.52],
  ['indigo',  250, 0.54, 0.52],
  ['magenta', 320, 0.70, 0.56],
  ['pink',    338, 0.72, 0.70],
];

export const ACCENT_KEYS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'cyan', 'blue', 'indigo', 'magenta', 'pink', 'teal', 'terra', 'brick'];
// What a building is usually made of. Overwhelmingly neutral on purpose.
export const WALL_KEYS = ['concrete', 'pave', 'cream', 'white', 'stone', 'taupe',
  'sandy', 'metal', 'steel', 'slate', 'brick', 'terra', 'wood', 'concrete',
  'stone', 'cream', 'white', 'glass', 'teal'];

/**
 * HOW A CONDITION CARRIES A PIGMENT TOWARD ITS OWN COLOUR.
 *
 * THIS REPLACES A HUE ROTATION, AND THE OPERATOR WAS THE BUG — not its
 * parameters, not the families it was applied to.
 *
 * What used to be here took the shortest arc around the hue wheel toward the
 * condition's hue. That is wrong in a way that is invisible until a pigment
 * sits opposite the target, and then it is spectacular. Rotating hue 30 toward
 * 214 travels through 340 — MAGENTA, a colour present in neither the pigment
 * nor the fog. And the arc changes sign at the ANTIPODE, so the operator is
 * discontinuous there: with the veil's target at 214, mint hue 33.9 landed at
 * 345.3 and 34.1 landed at 82.7. Two-tenths of a degree in, 262 degrees out.
 *
 * It shipped. Measured on rendered night+fog posts: amber read 310-326, orange
 * 301-317, terra 297-314, wood 304-320 — a magenta city. `sandy` straddled the
 * NIGHT antipode at 38 and read hue 66 on one seed and 347 on another: the same
 * family, two seeds, opposite sides of the wheel. `golden` has the same cliff at
 * 214, which is where `metal` (210), `steel` (212), `slate` (215) and `rubber`
 * (220) all sit, at the stronger 0.30 neutral rate.
 *
 * FOG DOES NOT ROTATE A SURFACE'S HUE. IT MIXES ITS OWN COLOUR IN FRONT OF IT.
 * That is Koschmieder, the same law that justifies keeping the veil on emitters:
 * what reaches the eye is the pigment attenuated toward the medium's radiance.
 * A warm tone washed by cool fog therefore travels toward the fog's colour
 * THROUGH GREY, because that is what desaturation is. There is no antipode in a
 * mix and no branch: the output colour is continuous in every input.
 *
 * MIXED IN LINEAR LIGHT, and the reason is that the thing being modelled is
 * light adding and attenuating, which is linear — sRGB's transfer curve is a
 * storage convention, not physics. Both endpoints are built at the SAME
 * lightness `l`, so the mix carries hue and chroma and leaves the ladder alone:
 * this file's oldest rule is that the luma ratio belongs to the light and the
 * pigment's colour belongs to the pigment, and they must vary independently.
 * That also makes the linear-vs-encoded choice principled rather than
 * load-bearing — with equal endpoint lightness the two agree closely, so the
 * physically honest one costs nothing.
 *
 * Returns [hue, saturation]. BOTH come from the mix, never one of them: near
 * the grey crossing the hue angle is ill-conditioned, and reading the hue from
 * the mix while taking saturation from somewhere else would amplify an
 * arbitrary angle back into a visible colour — the antipode bug rebuilt from
 * parts. Where the mix lands exactly on grey the hue is genuinely undefined, so
 * it takes the target's, which is the direction it was travelling.
 */
// HOW SATURATED EACH CONDITION'S OWN LIGHT IS.
//
// A rotation needed only a hue, because it never asked what colour the light
// WAS — it just dragged the pigment's angle. A mix has to know, and these are
// that missing half.
//
// SKY_C IS HIGH ON PURPOSE, AND THE THRESHOLD IS ARITHMETIC RATHER THAN TASTE.
// A mix at strength k leaves a neutral with roughly `(1-k)s + k*SKY_C` of
// chroma, so for the night sky to COLOUR a grey wall instead of bleaching it,
// SKY_C has to clear `s/k`: with the neutral rate at 0.30 and the neutral
// families sitting near s = 0.08, that is 0.27 merely to break even. Anything
// at or below it makes night a desaturator — which is precisely why the old
// code carried an `s * 1.15 + 0.03` boost bolted to a rotation that could not
// add chroma. One mix now does both jobs.
//
// Calibrated on the closest-pair statistic over 8 seeds, because that is the
// gate this quantity actually binds: at 0.30 it fell to 0.0708 against a 0.0950
// baseline, and at 0.60 it is 0.0940 — level — while night+fog IMPROVES from
// 0.0557 to 0.0588. At the low lightness the night ramp works at, a
// 0.60-saturation blue is a deep navy, not a garish one.
//
// THE VEIL IS THE OPPOSITE CASE AND IS DELIBERATELY BELOW BREAK-EVEN. Fog and
// overcast are SUPPOSED to drain colour — that is what losing the horizon looks
// like — so VEIL_C sits under `s/k` and the mix desaturates, on purpose. It is
// 0.20 rather than 0.10 because 0.10 bought nothing: day+fog 0.0870 -> 0.1004
// and night+rain 0.0814 -> 0.1076 going from 0.10 to 0.20, against baselines of
// 0.0662 and 0.0882.
//
// SUN_C AT 0.85 IS THE ONE VALUE HERE THAT WAS NOT PICKED AT ITS METRIC MAXIMUM.
// The sweep kept improving past it (0.62 -> 0.1377, 0.78 -> 0.1481, 0.85 ->
// 0.1666, 0.92 -> 0.1737 against a 0.1576 baseline), and 0.92 is a
// near-monochromatic orange that no low sun is. 0.85 clears the baseline and is
// still a colour a sun can be; taking 0.92 would have been tuning to the gate.
//
// DUST_C IS ANCHORED TO THE MATERIAL, NOT TO THE SWEEP, because the sweep did
// not discriminate: 0.22, 0.30, 0.40, 0.55 and 0.70 gave 0.0903, 0.0799, 0.0886,
// 0.0817 and 0.0780, which is noise in a min-over-28-pairs at n=8 rather than a
// trend (standing rule 10). Airborne dust is sand, and `sandy` in the table
// above is s = 0.38, so it is 0.40 and the residual -0.005 against baseline is
// reported as within noise rather than tuned away.
const SKY_C = 0.60;    // a night sky: blue, and not grey — skyglow has colour
const SUN_C = 0.85;    // a low sun: the most saturated light in the set
const VEIL_C = 0.20;   // overcast, rain, snow, fog: near-neutral by definition
const HAZE_C = 0.22;   // haze keeps a warm cast
const DUST_C = 0.40;   // dust is a MATERIAL in the air, and it is sand-coloured
const SNOW_C = 0.12;   // settled snow: barely blue, mostly value

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const toEnc = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function mixToward(h, s, l, th, ts, k) {
  if (!(k > 0)) return [h, s];
  if (k > 1) k = 1;
  const a = hsl(h, s, l), b = hsl(th, ts, l);
  const r = toEnc(toLin(a[0]) + (toLin(b[0]) - toLin(a[0])) * k);
  const g = toEnc(toLin(a[1]) + (toLin(b[1]) - toLin(a[1])) * k);
  const u = toEnc(toLin(a[2]) + (toLin(b[2]) - toLin(a[2])) * k);
  const mx = Math.max(r, g, u), mn = Math.min(r, g, u);
  const d = mx - mn;
  const L = (mx + mn) / 510;
  if (d < 1e-9) return [th, 0];
  const S = d / 255 / (1 - Math.abs(2 * L - 1));
  let H;
  if (mx === r) H = 60 * (((g - u) / d) % 6);
  else if (mx === g) H = 60 * ((u - r) / d + 2);
  else H = 60 * ((r - g) / d + 4);
  return [((H % 360) + 360) % 360, Math.max(0, Math.min(1, S))];
}

/**
 * What the conditions do to ONE family, before it is minted.
 *
 * THIS IS THE WHOLE REASON NIGHT IS NOT A FILTER. A multiply applied to the
 * finished canvas would throw away the shading ladder, the palette commitment
 * and the ink model in one line, and every craft number would move at once.
 * Here the family is DIFFERENT BEFORE IT IS MINTED: the pigment arrives cool
 * and dim, and `mk` then builds its ladder from that pigment exactly as it
 * always did — same rescale, same contour step, same law that the shadow step
 * does not rotate hue.
 *
 * `HUE0` is deliberately untouched anywhere in this file. Night's coolness
 * belongs to the PIGMENT, not to the shadow step. `shade.hueRotMedian` near
 * zero is the counterintuitive property `docs/BAR.md` says procedural shaders
 * always get wrong and this one gets right, and a night that tinted the shadow
 * step would lose it while looking, at a glance, correct.
 *
 * `emissive` MARKS A SOURCE RATHER THAN A SURFACE, and it is an opt-out from
 * exactly one of the three blocks below — see the note at the branch.
 */
function condLight(h, s, l, cond, neutral, emissive) {
  if (cond.reference) return [h, s, l];      // day + clear: exactly as drawn

  // ---- THE SKY'S LIGHT, WHICH ONLY A SURFACE RECEIVES ---------------------
  //
  // These two blocks are the ones that model light ARRIVING somewhere: a night
  // sky and a low sun. A lamp, a screen, a fire and a lit sign are SOURCES —
  // the scene's ambient does not determine their colour, they are part of what
  // the ambient IS. So `emissive` opts out of both, together, as one branch.
  //
  // WHY BOTH AND NOT JUST NIGHT. They are the same physical claim twice: the
  // night pull carries a pigment toward the sky's colour, the golden pull
  // carries it toward the sun's. Neither is true of a filament. Opting out of
  // only the night half would leave a golden-hour emitter tinted by a sun that
  // is not lighting it, which is the same category error with a warmer number
  // on it — and it would be a trap for the next caller, because the two are
  // mutually exclusive by construction in `conditions.js` (`warmth` is nonzero
  // only at `golden`) and so read as one choice, not two.
  //
  // WHY THE VEIL BELOW IS *NOT* BYPASSED, and this is the interesting half.
  // Fog, haze, dust and overcast do not light the lamp — they sit BETWEEN the
  // lamp and the camera and scatter its own photons out of the line of sight.
  // That is Koschmieder's law and it applies to a source exactly as it applies
  // to a surface: what reaches the eye is the emitter attenuated toward the
  // medium's own radiance, which is why a streetlamp in fog is a dim halo and
  // not a bright point. Keeping it is the physically right answer AND the
  // conservative one — it is the block carrying the measured veil strengths
  // that stop two scenes converging on the colour of the weather, and an
  // emitter exempt from it would be the one thing in the frame that fog cannot
  // touch.
  //
  // NIGHT. Everything approaches a cool ambient floor rather than scaling to
  // zero: a flat multiply crushes the darks into the ink and the picture loses
  // its darkest material to the silhouette, which is the failure `rubber` was
  // added to fix. Neutrals are carried further toward the night hue than
  // accents are, because a painted red awning is still red after dark and a
  // grey wall is not still grey — it is whatever colour the sky is.
  if (emissive) {
    // A source keeps its own hue, its own saturation and its own value, and
    // that is true of the mix above exactly as it was of the rotation it
    // replaced: an emitter is not lit by the sky, whatever operator the sky
    // uses. There is NO pre-compensation here and there must never be one.
  } else if (cond.night) {
    // THE NUMBERS HERE ARE SET BY A MEASUREMENT, NOT BY HOW DARK NIGHT LOOKS.
    //
    // The first version compressed lightness to 0.44 of its range and pulled
    // neutral hues 42% toward the night blue. It looked like night. It also
    // destroyed the palette: two different highland seeds, one clear and one in
    // rain, came out 0.0035 apart on the cross-seed histogram distance, against
    // 0.1926 for the closest pair of the same eight seeds rendered clear. Two
    // unrelated scenes had converged on the colour of the dark.
    //
    // That is "night must not become a filter" arriving as a number rather than
    // as a warning. A condition that compresses the ramp far enough stops being
    // a light and starts being a lossy channel — and the variety gate binds on
    // the CLOSEST pair, so the worst case is the case that counts.
    //
    // Read the collapse with one caveat stated: the distance is a 4x4x4 RGB
    // histogram, two bits a channel, so its resolution in the dark quadrant is
    // genuinely poor and it OVERSTATES how far two night scenes have converged.
    // The direction is real, the magnitude is partly the instrument.
    //
    // The hue and the saturation are now ONE operation — a mix toward the
    // night sky's own colour — because in a real mix they are. A grey wall
    // takes the sky's colour and gains chroma; a painted red awning is still
    // red after dark and only loses some. That difference used to be two
    // hand-set lines (`s * 1.15 + 0.03` against `s * 0.84`) and it now falls
    // out of the same mix run at two strengths, which is why the neutral and
    // accent rates survive unchanged.
    // THE FLOOR IS A CONDITION, NOT A CONSTANT. It was 0.07 here; a night under
    // a fog or cloud deck is brighter than a clear one because the deck
    // scatters ground light back down, and `conditions.js` resolves that
    // interaction beside the golden/fog one it already owned. 0.07 on a clear
    // night, so clear nights are untouched.
    const AMB = cond.ambient === undefined ? 0.07 : cond.ambient;
    [h, s] = mixToward(h, s, l, 218, SKY_C, neutral ? 0.30 : 0.16);
    l = AMB + (l - AMB) * 0.58;
  } else if (cond.warmth > 0) {
    // GOLDEN. A low sun is warm and it lifts the lit faces rather than the
    // whole ramp — which is why it is a ladder change and not a tint.
    //
    // The rotation's cliff sat at 214 here, which is exactly where this table
    // keeps `metal` (210), `steel` (212), `slate` (215) and `rubber` (220) —
    // four neutrals, at the stronger 0.30 neutral rate, on both sides of it.
    const w = cond.warmth;
    [h, s] = mixToward(h, s, l, 34, SUN_C, (neutral ? 0.30 : 0.14) * w);
    s = Math.min(1, s * (1 + 0.34 * w));
    l = l * (1 + 0.08 * w);
  }

  // OVERCAST, FOG, HAZE, DUST. These do not darken so much as FLATTEN and
  // drain. The sky becomes the light source, so saturation falls and everything
  // is carried toward one another — which is what losing the horizon looks
  // like. Fog is BRIGHT, not dark, and that is the part procedural weather
  // usually gets backwards.
  if (cond.overcast > 0) {
    const o = cond.overcast;
    const tgt = cond.weather === 'dust' ? 34 : cond.weather === 'haze' ? 40 : 214;
    const tgtC = cond.weather === 'dust' ? DUST_C : cond.weather === 'haze' ? HAZE_C : VEIL_C;
    // THE MIX IS THE WHOLE CHROMATIC OPERATION — there is no separate drain.
    // The rotation needed one, because rotating a hue cannot desaturate and the
    // veil has to; a mix toward a near-neutral medium desaturates by doing what
    // it already does. A first version of this kept `s * (1 - 0.18 * o)` on top
    // out of caution and it was double-counting: measured on the closest-pair
    // statistic over 8 seeds, dropping it moved day+fog from 0.0753 to 0.0870
    // against a 0.0662 baseline, i.e. the extra drain was spending variety to
    // buy nothing. Standing rule 13 again — delete the compensation.
    [h, s] = mixToward(h, s, l, tgt, tgtC, 0.30 * o);
    // Toward the fog's own value rather than simply up: a fog lightens a dark
    // material and slightly darkens a white one, because both approach the
    // scattering medium.
    // Fog is not overcast with a bigger number on it. Overcast removes the
    // sun; fog removes the DISTANCE, so it carries everything much further
    // toward one value. Without a separate strength the two read as the same
    // weather twice, which is what the first contact sheet showed.
    // THE VEIL IS DELIBERATELY WEAKER THAN IT WANTS TO BE, and the reason is
    // measured. At the first strength — fog 0.62 with saturation at 0.72 — the
    // MEDIAN cross-seed spread widened handsomely and the CLOSEST PAIR
    // collapsed: two different highland seeds under two different heavy
    // conditions landed 0.0035 apart on the histogram, against 0.1926 for the
    // same eight seeds all rendered clear. A veil that strong overwrites the
    // per-neighbourhood colour commitment the whole palette exists to produce,
    // so two unrelated scenes converge on the colour of the weather.
    //
    // That is the same failure as "night must not become a filter", found in a
    // different condition — and it matters more here, because the variety gate
    // binds on the MINIMUM pairwise distance, not the median. A feature that
    // improves the average and wrecks the worst case makes the feed worse.
    // AND THE VEIL'S OWN VALUE AT NIGHT IS THE AMBIENT, NOT A SECOND CONSTANT.
    // It was 0.16, which is below the floor the night branch now lands on under
    // a layer — so the veil pulled the picture back DOWN through the floor that
    // had just been raised, and the two mechanisms fought. A fog deck cannot be
    // darker than the glow it is made of. One quantity, read in both places.
    const veil = cond.night ? (cond.ambient === undefined ? 0.16 : cond.ambient + 0.06) : 0.82;
    const veilK = cond.weather === 'fog' ? 0.38 : cond.weather === 'haze' ? 0.26 : 0.18;
    l = l + (veil - l) * veilK * o;
    if (cond.weather === 'fog') s *= 0.86;
  }

  return [h, s, l];
}

/**
 * What the conditions do to a NAMED MATERIAL, before the light touches it.
 *
 * Split from `condLight` because the two answer different questions and apply
 * in different places. The light applies to EVERY tone this palette ever mints
 * and therefore lives inside `mk`; wet tarmac and settled snow apply to the
 * families a road or a field is made of, which only the table knows, so they
 * apply here and the light is applied on top by `mk` afterwards. Material
 * first, then light, which is also the physical order.
 */
function condMaterial(h, s, l, cond, key) {
  if (cond.reference) return [h, s, l];

  // WET. The sign inverts after dark, which is the interaction `conditions.js`
  // exists to resolve: a wet road at noon reflects the sky AWAY from the camera
  // and reads darker, and at night it reflects the lamps BACK and its
  // highlights read brighter. Applied only to the families a road, a pavement
  // or a stone is actually made of — a wet awning is not a thing.
  if (cond.wet > 0 && WETTABLE.has(key)) {
    const w = cond.wet;
    l = cond.night ? l * (1 + 0.30 * w) : l * (1 - 0.26 * w);
    s = Math.min(1, s * (1 + 0.30 * w));
  }

  // SETTLED SNOW. A cover, not a tint: the ground families become snow and keep
  // only a trace of what they were, while walls and metal are untouched.
  if (cond.settled > 0 && GROUND.has(key)) {
    // Snow is a COVER, so this is the strongest mix in the file at 0.55 — and
    // it had the rotation's cliff at 32, with `taupe` (30) on one side and
    // `stone` (36), `roadD` (38), `road` (40), `sandy` (40) and `pave` (46) on
    // the other. Every ground family a snowfall actually lands on sat within a
    // few degrees of it.
    // The residual drain is 0.55 where it was 0.30, because the mix now does
    // part of that job itself: a cover this opaque should end up near-neutral,
    // and crushing to 0.30 ON TOP of a 0.55 mix would take the ground past
    // neutral into dead grey. Measured on `sandy` (s = 0.38), the two land at
    // 0.130 against 0.114 — the same snow, arrived at once instead of twice.
    [h, s] = mixToward(h, s, l, 212, SNOW_C, 0.55);
    s = s * 0.55;
    l = l + (0.93 - l) * 0.72;
  }
  return [h, s, l];
}

/** Families a road, a pavement or a stone is made of — the ones rain wets. */
const WETTABLE = new Set(['road', 'roadD', 'pave', 'concrete', 'stone', 'taupe', 'sandy', 'tar', 'slate']);
/** Families that snow settles on. */
const GROUND = new Set(['road', 'roadD', 'pave', 'concrete', 'stone', 'taupe', 'sandy', 'grass', 'leaf', 'green', 'lime']);

export function buildPalette(rng, cond = { reference: true, overcast: 0, wet: 0, settled: 0, warmth: 0, night: false, sun: 1, weather: 'clear' }) {
  const r = rng.stream('palette');
  const pal = new Palette();
  const cache = new Map();

  // One shared black does every SILHOUETTE in the frame. The reference uses
  // one, not a per-material dark — that is what makes the edges read as a
  // system rather than as shading.
  //
  // IT IS NOW TRUE BLACK, AND THAT IS PART OF AN INK MODEL, NOT A TWEAK.
  // Measured on whole frames: the reference spends 34,672 px on literal (0,0,0)
  // while its most-used colour is a mid-tone sand at 4.84%. Ours spent ZERO on
  // true black while a single near-black #08080a held 18-19% of the frame. We
  // were simultaneously over-inked and never actually black — ink as the
  // dominant material rather than as punctuation. The correction has two
  // halves and this is the first: where we commit, commit hard.
  const BLACK = pal.add(0, 0, 0);

  // ---- this scene's light ------------------------------------------------
  // LEFT is the lit-to-shaded ratio; RIGHT falls further; DARK is the step
  // that only underside and recess faces ever reach. Centred on the old
  // constants (0.77 / 0.57 / 0.46) so a typical scene sits where the measured
  // band already accepted it, and wide enough that two seeds are lit
  // differently rather than identically.
  let LEFT = r.range(0.665, 0.865);
  let RIGHT = LEFT * r.range(0.62, 0.86);
  let DARK = RIGHT * r.range(0.66, 0.90);
  // THE LADDER IS THE SUN, so the sky flattens it. Under cloud there is less
  // difference between a face pointing at the light and one pointing away,
  // because there is no direction the light comes from any more. The steps are
  // compressed TOWARD 1 rather than scaled, so a flat scene keeps its facets at
  // reduced contrast instead of losing them.
  //
  // Night is NOT flattened by this: a night city has strong local light from
  // windows and lamps, so its contrast is high and merely differently
  // distributed. Night's change is to the pigment, in `condTone`. Conflating
  // the two would produce a flat dark grey picture, which is what a filter
  // looks like.
  if (cond.overcast > 0) {
    const keep = 1 - 0.40 * cond.overcast;
    LEFT = 1 - (1 - LEFT) * keep;
    RIGHT = 1 - (1 - RIGHT) * keep;
    DARK = 1 - (1 - DARK) * keep;
  }

  // ---- this scene's hue policy -------------------------------------------
  // TWO SEPARATE KNOBS, and the separation is the whole point.
  //
  // HUE0 is the scene's SYSTEMATIC shadow drift and it is what
  // `shade.hueRotMedian` reads. It is confined to [-2.6, +0.05], which is the
  // reference's own measured interval, and it never goes warm. "Shadows do not
  // rotate hue" is the property procedural shaders always get wrong and this
  // one has right; it must vary across seeds without ever becoming a drift.
  //
  // HUEJ is a per-PIGMENT jitter with a random sign, so it cancels in the
  // median and shows up only in `shade.hueRotAbsMedian`. The first attempt used
  // one signed knob for both and produced medians from -4.7 to +6.1 — a seed
  // whose shadows rotated six degrees warm, which is exactly the tell.
  //
  // BOTH ARE ONE-DIRECTIONAL. The first version signed the per-pigment jitter
  // randomly so it would cancel in the median, and it mostly did — but on a
  // seed whose visible faces happen to be dominated by pigments that drew the
  // warm sign, the measured median came out at +1.8 degrees, i.e. "shadows
  // rotate warm". That is precisely the tell this generator is not allowed to
  // have, and a property that only holds in expectation is not a property.
  // Every shadow step now rotates by HUE0 plus a per-pigment amount in
  // [0, HUEJ] in the SAME direction, so the median can never be positive while
  // the absolute rotation still varies from seed to seed.
  const HUE0 = r.range(-1.4, 0.02);
  const HUEJ = r.range(0, 4.0);
  const SATK = r.range(0.90, 1.32);

  // ---- this scene's palette resolution -----------------------------------
  // How finely two tones must differ before they are the same tone. A coarse
  // scene is a poster; a fine one is a crowded market street.
  const QH = r.range(3.4, 8.5), QS = r.range(9, 21), QL = r.range(18, 36);

  function mk(h, s, l, emissive) {
    // THE LIGHT APPLIES HERE, AT THE ONE CHOKE POINT EVERY TONE PASSES THROUGH.
    //
    // It was first applied in the FAM loop, and the first contact sheet showed
    // exactly what that misses: a night city whose ground and walls were dark
    // and whose SIGNS, awnings, shirts and the shore's own minted sand were
    // still at full daylight. Most of the colour in this generator is minted
    // per object through `mk` — `wallTone`, `accentTone`, every biome's own
    // materials — and never appears in the family table at all. Conditioning
    // the table conditions the minority of the frame.
    //
    // Applied BEFORE the cache key, so two pigments that the light collapses
    // onto one tone share a palette entry rather than minting two identical
    // colours. That is also why `palette.distinct` falls at night: the ramp is
    // genuinely shorter after dark, not accidentally duplicated.
    //
    // AND THE KEY IS DELIBERATELY NOT NAMESPACED BY `emissive`. An emissive
    // tone can land on the same quantised key as a conditioned pigment, so ask
    // whether that sharing is a bug. It is not, and the reason is structural
    // rather than lucky: `emissive` selects which transforms run BEFORE the
    // key and changes nothing after it. Every field of the family below — the
    // base RGB, all four rungs, the drift sign `q`, the metadata — is a pure
    // function of the post-condition (h, s, l) and the scene's own ladder. Two
    // callers that arrive at one key therefore want a byte-identical family,
    // and sharing it is the behaviour the paragraph above already describes
    // for two pigments the light collapses together. Namespacing would mint a
    // second entry holding the same colour, inflating `palette.distinct` — a
    // measured quantity — to describe a distinction that does not exist in the
    // pixels.
    //
    // MEASURED, because "it cannot happen" and "it is harmless when it happens"
    // are different claims and only the second one is true. Over 48 seeds, with
    // the pigment population minted first (the families, skin, hair, and 400
    // `wallTone`/`accentTone` draws each), an emissive tone shares an entry with
    // a conditioned pigment on 0 of 144 mints at night and 3 of 144 at golden.
    // On all three golden hits the entry handed back was the colour the emitter
    // asked for to within 0.14-0.70 degrees of hue and 0.000-0.031 of lightness
    // — inside this scene's own quantisation (QH 3.4-8.5 degrees, QL 18-36
    // buckets), which is the definition of "the same tone" everywhere else in
    // this file. Sharing it is the cache working, not the cache leaking.
    [h, s, l] = condLight(h, s, l, cond, s < 0.25, emissive);
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0.05, Math.min(0.99, l));
    const key = Math.round(h / QH) * 100000 + Math.round(s * QS) * 1000 + Math.round(l * QL);
    let f = cache.get(key);
    if (f) return f;
    const b = hsl(h, s, l);
    const bl = rec601(b);
    // Sign of the hue drift for THIS pigment. Hashed off the key so it is
    // stable for a family and uncorrelated between families; biased 3:2 cool
    // so the signed median lands just below zero where the reference's is,
    // rather than exactly on zero where it is one sample from either side.
    const q = (Math.imul(key ^ 0x9e3779b9, 2654435761) >>> 0) % 100;
    // Jitter only bites on pigments that HAVE a hue. On a near-neutral the hue
    // angle is ill-conditioned and rotating it is noise in the measurement
    // rather than a decision in the picture, and neutrals are 59% of the frame.
    const jit = s > 0.16 ? -(q / 100) * HUEJ : 0;
    const dh = HUE0 + jit;
    const step = (k, t) => {
      if (Math.abs(dh) <= 0.02 && Math.abs(SATK - 1) <= 0.01) {
        return pal.add(b[0] * k, b[1] * k, b[2] * k);
      }
      const c = hsl(h + dh * t, Math.min(1, s * (1 + (SATK - 1) * t)), l);
      const cl = rec601(c);
      // rescale so the luma ratio is EXACTLY k: hue is the pigment's business,
      // the ladder is the light's, and the two must vary independently
      const m = cl > 1 ? k * bl / cl : k;
      return pal.add(c[0] * m, c[1] * m, c[2] * m);
    };
    f = {
      t: pal.add(b[0], b[1], b[2]),
      l: step(LEFT, 1),
      r: step(RIGHT, 1.7),
      d: step(DARK, 2.3),
      // THE CONTOUR STEP — the second half of the ink model, and the technique
      // this generator did not have at all.
      //
      // `docs/BAR.md`: an isolated reference object has 0.00% below luma 20 and
      // "rings itself in its own darkest tone at 0.49 of interior luma". We
      // drew interior form with black or with nothing. A panel line, a recess,
      // a seam, a grille, a joint between two boards is not a silhouette — it
      // is a shadow in the object's own material, and drawing it in the shared
      // ink is both wrong and the reason a fifth of the frame was near-black.
      //
      // Fixed at 0.49 of the LEFT (interior) step, so it tracks the scene's own
      // light rather than being a fifth constant, and it is deliberately BELOW
      // `d`: `d` is a face of the object that the light reaches badly, `k` is a
      // line the light does not reach at all.
      // The ratio is 0.49 on a light material and rises toward 0.66 on a dark
      // one, because a shadow on a dark object is PROPORTIONALLY lighter — the
      // material has less range to give and ambient dominates. That is
      // physically right and it fixes a failure of the technique in the one
      // place it matters most: on a slate or a rubber or a deep blue, a fixed
      // 0.49 put the contour below the ink threshold, so the "object's own
      // dark" was indistinguishable from the shared black and the whole point
      // was lost. It also filled crops with dark pixels that read as murk: the
      // darkest of eight seeds carried 5.3% of its worst crop in dark MATERIAL
      // on top of its ink.
      k: step(LEFT * (0.49 + 0.17 * Math.max(0, Math.min(1, (0.55 - l) / 0.45))), 2.6),
      // metadata, deliberately underscored: `l` is already the LEFT face index
      _h: h, _s: s, _L: l,
    };
    cache.set(key, f);
    return f;
  }

  const C = { black: BLACK, ink: BLACK, mk };
  // The scene's own weather: how far its hues sit off the table, how saturated
  // it runs, and how pale. These used to be ±8 degrees and ±9% of saturation,
  // which is why `hue.meanSat` and `palette.top1Share` barely moved seed to
  // seed. A desert noon and an overcast harbour are different pictures.
  // The accent drift is stratified for the same reason the neutral hue is: a
  // continuous draw lets two of eight seeds land on the same city.
  const DZONE = [-27, -16, -6, 5, 16, 27];
  const drift = DZONE[r.int(0, DZONE.length - 1)] + r.range(-5, 5);
  const satMul = r.range(0.60, 1.14);
  // The floor was 0.84 and the darkest of eight seeds came out with 20% of its
  // whole frame under luma 45 — not one bad crop, the whole picture. The
  // mechanism is that the neutrals are 59% of the frame and the road is its
  // largest single surface, so an 18% cut to neutral lightness pushes the
  // road's own shaded steps across the ink threshold everywhere at once. Four
  // stratified zones stay (that stratification is what stops two seeds landing
  // on the same city), the darkest is just no longer darker than the family
  // this generator belongs to: the reference is a LIGHT image whose commonest
  // colour is a warm pale grey.
  const LZONE = [0.90, 0.99, 1.08, 1.18];
  const litMul = LZONE[r.int(0, LZONE.length - 1)] * r.range(0.97, 1.03);
  // THE NEUTRALS CARRY THE SCENE AND THEY WERE THE PART THAT DID NOT MOVE.
  // 59% of the frame is near-neutral, and the neutral families used to take
  // only 0.3 of the scene drift — about five degrees — so the greys that make
  // up most of every crop were nearly identical from seed to seed. That is
  // what the perceptual half of the variety gate reads first: its histogram
  // view is dominated by the commonest colours. A warm sand city, a cool blue
  // one and a flat concrete one are different pictures at a glance, and that
  // difference lives almost entirely here.
  // STRATIFIED, not uniform. With eight seeds drawn independently from one
  // continuous interval, two of the twenty-eight pairs land close together
  // often enough to decide the gate's minimum — and the perceptual half of the
  // gate reads the commonest colours first, which are these. Drawing a zone
  // and then jittering inside it spreads the eight seeds instead of sampling
  // them, so the CLOSEST pair of cities is still a different pair of cities.
  const HZONE = [-38, -27, -16, -6, 5, 15, 25, 36];
  const neutralHue = HZONE[r.int(0, HZONE.length - 1)] + r.range(-5, 5);
  const SZONE = [0.35, 0.75, 1.2, 1.75];
  const neutralSat = SZONE[r.int(0, SZONE.length - 1)] * r.range(0.85, 1.18);
  for (const [k, h, s, l] of FAM) {
    const neutral = s < 0.25;
    // The scene's own decisions first — its drift, its saturation, its
    // lightness zone — and the conditions on top of the result. That order
    // matters: conditions modify THIS scene's palette, not the table's, so two
    // night cities are still two different cities rather than one night.
    const [ch, cs, cl] = condMaterial(
      h + (neutral ? neutralHue : drift),
      s * (neutral ? neutralSat : satMul),
      Math.min(0.98, l * (neutral ? litMul : 1 + (litMul - 1) * 0.4)),
      cond, k);
    C[k] = mk(ch, cs, cl);
  }
  C.light = { LEFT, RIGHT, DARK, HUE0, HUEJ, SATK };
  C.cond = cond;
  C.tar = C.slate;

  C.skin = [
    mk(28, 0.60, 0.80), mk(26, 0.50, 0.66), mk(24, 0.44, 0.48), mk(22, 0.40, 0.34),
  ];
  C.hair = [
    mk(30, 0.30, 0.16), mk(28, 0.45, 0.34), mk(44, 0.70, 0.70), mk(0, 0.05, 0.78),
    mk(348, 0.55, 0.46),
  ];

  C.accents = ACCENT_KEYS.map((k) => C[k]);
  C.walls = WALL_KEYS.map((k) => C[k]);

  /** A wall tone near one of the neutral families, jittered per building. How
   *  much of a city is PAINTED rather than built is a property of the city,
   *  not a constant: a bleached seaside strip and a grey business district are
   *  different pictures and the old fixed 0.55 made every seed the same mix. */
  const paintRate = r.range(0.10, 0.56);
  C.paintRate = paintRate;
  C.wallTone = (st) => {
    const base = st.bool(paintRate) ? st.pick(C.accents) : st.pick(C.walls);
    return mk(base._h + st.range(-10, 10), base._s * st.range(0.85, 1.3),
      Math.min(0.97, base._L * st.range(0.86, 1.12)));
  };
  /** A saturated tone, jittered. Used for paint: awnings, signs, vehicles. */
  C.accentTone = (st) => {
    const base = st.pick(C.accents);
    return mk(base._h + st.range(-12, 12), Math.min(1, base._s * st.range(0.85, 1.15)),
      Math.min(0.92, base._L * st.range(0.88, 1.14)));
  };
  return { pal, C };
}

/** Deterministic 32-bit hash of three integers — a pure function, safe to call
 *  per pixel inside a shade callback where an Rng draw would depend on
 *  rasterisation order. */
export function h3(a, b, c) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
