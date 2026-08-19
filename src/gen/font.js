// A pixel font, authored here as a table. 5x7 caps plus digits and a little
// punctuation. Nothing traced: every glyph is drawn by hand in this file, one
// row string per scanline so a miscount is visible on sight.
//
// Signage is also invented here. Fixel never reproduces real lettering, real
// wordmarks or near-misses of them — shop names are assembled from a nonsense
// syllabary and filtered, so a sign says something that reads like a word and
// is not one.

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..##.', '....#', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export const FONT_W = 5, FONT_H = 7;

export function glyph(ch) { return G[ch] || null; }

/** Bitmap for a whole string: array of row-strings, '#' = ink. */
export function textBitmap(str, tracking = 1) {
  const gs = [];
  for (const ch of String(str).toUpperCase()) gs.push(G[ch] || G[' ']);
  const rows = [];
  for (let j = 0; j < FONT_H; j++) {
    let line = '';
    for (let i = 0; i < gs.length; i++) {
      line += gs[i][j];
      if (i < gs.length - 1) line += '.'.repeat(tracking);
    }
    rows.push(line);
  }
  return rows;
}

/** Integer nearest-neighbour scale of a bitmap. */
export function scaleBitmap(rows, k) {
  if (k === 1) return rows;
  const out = [];
  for (const r of rows) {
    let line = '';
    for (const c of r) line += c.repeat(k);
    for (let n = 0; n < k; n++) out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Invented signage.

const ONSET = ['B', 'BR', 'D', 'DR', 'F', 'FL', 'G', 'GR', 'H', 'J', 'K', 'KR',
  'L', 'M', 'N', 'P', 'PR', 'Q', 'R', 'S', 'SK', 'SL', 'SN', 'ST', 'T', 'TR',
  'V', 'W', 'Z', 'ZR', 'GL', 'PL', 'VR', 'THR'];
const NUC = ['A', 'E', 'I', 'O', 'U', 'AA', 'EE', 'OO', 'AI', 'EO', 'OA', 'UI'];
const CODA = ['X', 'K', 'N', 'R', 'T', 'Z', 'L', 'M', 'SH', 'TH', 'NK', 'RT',
  'LT', 'ND', 'SK', 'FT', 'RM', 'GG', 'PP', 'SS'];

// A short defensive filter. Any generated string that collides with a
// real-world mark or a real trade word gets re-rolled; the syllabary is
// nonsense to begin with, this only closes the accidental case.
const FORBIDDEN = /^(SONY|NIKE|FORD|SHELL|ESSO|COKE|PEPSI|IKEA|ZARA|VISA|BOSCH|MOTEL|HOTEL|POLICE|TAXI|BANK|CAFE|SUSHI|PIZZA|BURGER|MART|SHOP|BAR|DELI|KFC|LOTTO|NASA|UPS|DHL|FEDEX|TUI|OREO|AUDI|BMW|SEAT|KIA|OPEL|FIAT|SAAB|LADA|MINI|JEEP|TESLA|HONDA|MAZDA|LEXUS|VOLVO|APPLE|INTEL|AMD|ARM|DELL|IBM|SAP|ORACLE|ADOBE|CISCO|NOKIA|HTC|OPPO|VIVO|AMAZON|EBAY|ETSY|UBER|LYFT|ZOOM|SLACK|NOTION|FIGMA|CANVA|MARS|TWIX|FANTA|SPRITE|EVIAN|VOLVIC|LIPTON|NESTLE|DANONE|LEGO|BIC|ELF|DOVE|OMO|ARIEL|TIDE|PERSIL|VANISH|FAIRY|HSBC|AXA|AVIVA|ING|BBVA|UBS|CITI|AMEX|BP|TOTAL|EXXON|MOBIL|GULF|ARAL|AGIP|REPSOL|ASDA|TESCO|ALDI|LIDL|COSTA|GREGGS|BOOTS|ARGOS|NEXT|DELTA|UNITED|IBERIA|LOT|SAS|PUMA|ADIDAS|FILA|ASICS|REEBOK|VANS|CROCS|GUCCI|PRADA|CHANEL|DIOR|HERMES|ROLEX|OMEGA|SUBWAY|SONIC|BAYER|MERCK|PFIZER|ROCHE|SANOFI|GSK|SIEMENS|PHILIPS|SHARP|SANYO|CASIO|SEIKO|EPSON|CANON|NIKON|FUJI|KODAK|DISNEY|PIXAR|MARVEL|NETFLIX|HULU|SPOTIFY|TIKTOK|META|GOOGLE|YAHOO|BING|SHEIN|TEMU|BAIDU|PEE|POO|ASS|FUK|SEX)$/;

// A second filter, added in round 3 after the first hero signs went up and the
// syllabary — which is nonsense by construction — coined SLEEP and REFLEE on
// the same rooftop. Neither is a mark and neither breaks the content law, but a
// sign that reads as a plain English word stops reading as invented signage and
// starts reading as a caption. These are the collisions short CVC nonsense
// actually produces; the list is short on purpose and re-rolls rather than
// mangles, so nothing here is a near-miss of anything.
const REAL_WORDS = /^(SLEEP|SLEEK|SLIP|SLOT|STOP|START|STORE|SHOT|SHIP|SHOP|TRIP|TRAP|DRESS|DRINK|PRESS|PRINT|GREEN|GRASS|BLOCK|BLACK|BRASS|BREAK|FRESH|FLASH|FLAT|FROST|CLASS|CRASH|SNOW|SNACK|SPIN|SPOT|STEEL|STEAM|TRUCK|TRAIN|GLASS|PLANT|PLATE|PRIME|SMOKE|STONE|SWEET|SPEED|SPACE|SPARK|SHARP|SHINE|SKATE|SLIDE|STAR|STAND|SWIM|TREE|TRUST|WEST|WOOD|ZOOM|ROOM|MOON|NOON|SOON|SOAP|TOOL|POOL|FOOD|GOOD|LOOK|BOOK|BOOT|ROOT|MEET|FEET|SEED|NEED|DEEP|KEEP|BEEF|REED|LEAN|MEAN|BEAN|RAIN|MAIN|PAIN|GAIN|TRAIL|SNAIL|BRAIN|DRAIN|GRAIN|STAIN|TOAST|ROAST|COAST|BOAST)$/;

/**
 * THE FILTER MUST RUN ON WHAT IS DISPLAYED, NOT ON WHAT WAS COINED.
 *
 * `signSize` in `props/street.js` cuts the word down to fit the panel —
 * `word.slice(0, o.disc ? 3 : (o.maxChars || 6))` — so a sign shows a PREFIX.
 * Both filters below used to test only the full string, which means every
 * prefix the renderer can actually draw went unchecked. That is a correctness
 * gap rather than a coverage gap: no amount of adding entries to the lists
 * fixes a check applied to a string the viewer never sees.
 *
 * Measured before the fix, 200,000 coined words against a list of ~200 real
 * marks: exact collisions 1 in 948, and TRUNCATED-PREFIX collisions 1 in 394 —
 * so the prefixes were the larger half of the exposure and were entirely
 * unguarded. TUI alone accounted for 549 of the 719 hits.
 *
 * BOTH FIGURES ARE LOWER BOUNDS BY AN UNQUANTIFIED MARGIN. The list is a couple
 * of hundred marks and a trademark register holds millions, so this reduces the
 * rate; it does not make the guarantee the content law asks for. The honest
 * statement is that a short nonsense syllabary WILL sometimes coin a real mark,
 * and the only complete remedies are a much longer word (which stops looking
 * like signage) or a register lookup (which this generator cannot carry).
 * Recorded rather than papered over.
 */
// A third filter, and the one with the least tolerance for a miss. The other
// two lists guard against looking unoriginal; this one guards against putting
// a slur or an obscenity on a billboard in a public feed. A nonsense syllabary
// coins real words by chance — a night city shipped a hero sign reading SLUT,
// which passed both lists above because it is neither a mark nor a trade word.
//
// Two differences from the lists above, both deliberate:
//   - It is matched as a SUBSTRING, not just as a prefix. An obscenity in the
//     middle of a coined word is exactly as visible as one at the start.
//   - A false positive costs one re-roll of a nonsense word, and a miss costs
//     an offensive sign on a public site. The trade is not symmetric, so this
//     list errs long.
const OFFENSIVE = /(ANAL|ARSE|ASS|BALLS|BASTARD|BITCH|BOLLOCK|BONER|BOOB|CHINK|CLIT|COCK|COON|CRAP|CUM|CUNT|DAGO|DAMN|DICK|DIKE|DILDO|DYKE|FAG|FANNY|FART|FUCK|FUK|GOOK|HELL|HOMO|HORNY|JAP|JERK|JISM|JIZZ|KIKE|KNOB|KUNT|MICK|MONG|MUFF|NAZI|NEGRO|NIG|NONCE|PAKI|PEDO|PENIS|PIKEY|PISS|POO|PORN|PRICK|PUSSY|QUEER|RAPE|RETARD|SCUM|SEMEN|SEX|SHAG|SHIT|SKANK|SLAG|SLUT|SPAZ|SPERM|SPIC|TARD|TIT|TURD|TWAT|VAG|WANK|WHORE|WOG|WOP)/;

function displayable(w) {
  if (w.length < 3 || w.length > 8) return false;
  // Every prefix the panel can show: 3 on a disc, up to 6 elsewhere, plus the
  // whole word for a panel wide enough to hold it.
  for (let k = 3; k <= w.length; k++) {
    const p = w.slice(0, k);
    if (FORBIDDEN.test(p) || REAL_WORDS.test(p)) return false;
    if (OFFENSIVE.test(p)) return false;
  }
  // and the whole coined word, since OFFENSIVE matches anywhere in it
  if (OFFENSIVE.test(w)) return false;
  return true;
}

export function coinWord(st) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let w = st.pick(ONSET) + st.pick(NUC);
    if (st.bool(0.45)) w += st.pick(CODA);
    if (st.bool(0.40)) {
      w += st.pick(ONSET).slice(0, 2) + st.pick(NUC);
      if (st.bool(0.5)) w += st.pick(CODA);
    }
    if (displayable(w)) return w;
  }
  return 'ZOK' + st.int(2, 9);
}

/**
 * A short tag for a signpost or a kiosk fascia.
 *
 * EVERY BRANCH IS FILTERED NOW. Three of the four used to assemble letters
 * directly and never saw either list, and the shore builder recorded one
 * producing PEE on the hero sign of its frame — it worked around that by
 * refusing to call this function at all, which is a fix in one biome for a bug
 * in the shared file. The lettered branches now re-roll through the same
 * `displayable` check as `coinWord`; the numeric branches cannot collide.
 */
export function coinTag(st) {
  const mode = st.int(0, 3);
  if (mode === 1) return String(st.int(2, 99));
  if (mode === 2) return st.pick(ONSET).slice(0, 1) + '-' + st.int(1, 9);
  if (mode === 0) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const w = st.pick(ONSET).slice(0, 1) + st.pick(NUC).slice(0, 1) + st.pick(CODA).slice(0, 1);
      if (displayable(w)) return w;
    }
    return 'ZK' + st.int(2, 9);
  }
  return coinWord(st).slice(0, 3);
}

/**
 * Lettering colour for a sign, chosen against the panel it sits on.
 * A pale panel takes the pigment's DARK step, a dark panel its LIT step, and a
 * pigment too close to its own ground is replaced by ink or white outright.
 */
export function signInk(C, panel, ink) {
  const pl = panel._L === undefined ? 0.9 : panel._L;
  const light = pl > 0.55;
  if (ink._L === undefined) return light ? C.ink : C.white.t;
  // Minted, NOT taken off the shading ladder. The ladder is per scene now, and
  // in a scene with a shallow one the darkest step of a warm pigment is still
  // a mid tan — which is what put tan lettering on a white board. A sign's job
  // is to be read; its ink is chosen against its ground, not against the light.
  if (light) {
    return C.mk(ink._h, Math.min(1, ink._s * 1.05),
      Math.max(0.09, Math.min(0.30, ink._L * 0.36)));
  }
  return C.mk(ink._h, Math.min(1, ink._s * 0.85),
    Math.max(0.62, Math.min(0.95, ink._L * 1.75)));
}
