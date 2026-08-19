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
const FORBIDDEN = /^(SONY|NIKE|FORD|SHELL|ESSO|COKE|PEPSI|IKEA|ZARA|VISA|BOSCH|MOTEL|HOTEL|POLICE|TAXI|BANK|CAFE|SUSHI|PIZZA|BURGER|MART|SHOP|BAR|DELI|KFC|LOTTO|NASA|UPS|DHL|FEDEX)$/;

// A second filter, added in round 3 after the first hero signs went up and the
// syllabary — which is nonsense by construction — coined SLEEP and REFLEE on
// the same rooftop. Neither is a mark and neither breaks the content law, but a
// sign that reads as a plain English word stops reading as invented signage and
// starts reading as a caption. These are the collisions short CVC nonsense
// actually produces; the list is short on purpose and re-rolls rather than
// mangles, so nothing here is a near-miss of anything.
const REAL_WORDS = /^(SLEEP|SLEEK|SLIP|SLOT|STOP|START|STORE|SHOT|SHIP|SHOP|TRIP|TRAP|DRESS|DRINK|PRESS|PRINT|GREEN|GRASS|BLOCK|BLACK|BRASS|BREAK|FRESH|FLASH|FLAT|FROST|CLASS|CRASH|SNOW|SNACK|SPIN|SPOT|STEEL|STEAM|TRUCK|TRAIN|GLASS|PLANT|PLATE|PRIME|SMOKE|STONE|SWEET|SPEED|SPACE|SPARK|SHARP|SHINE|SKATE|SLIDE|STAR|STAND|SWIM|TREE|TRUST|WEST|WOOD|ZOOM|ROOM|MOON|NOON|SOON|SOAP|TOOL|POOL|FOOD|GOOD|LOOK|BOOK|BOOT|ROOT|MEET|FEET|SEED|NEED|DEEP|KEEP|BEEF|REED|LEAN|MEAN|BEAN|RAIN|MAIN|PAIN|GAIN|TRAIL|SNAIL|BRAIN|DRAIN|GRAIN|STAIN|TOAST|ROAST|COAST|BOAST)$/;

export function coinWord(st) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let w = st.pick(ONSET) + st.pick(NUC);
    if (st.bool(0.45)) w += st.pick(CODA);
    if (st.bool(0.40)) {
      w += st.pick(ONSET).slice(0, 2) + st.pick(NUC);
      if (st.bool(0.5)) w += st.pick(CODA);
    }
    if (w.length >= 3 && w.length <= 8 && !FORBIDDEN.test(w) && !REAL_WORDS.test(w)) return w;
  }
  return 'ZOK' + st.int(2, 9);
}

export function coinTag(st) {
  const mode = st.int(0, 3);
  if (mode === 0) return st.pick(ONSET).slice(0, 1) + st.pick(NUC).slice(0, 1) + st.pick(CODA).slice(0, 1);
  if (mode === 1) return String(st.int(2, 99));
  if (mode === 2) return st.pick(ONSET).slice(0, 1) + '-' + st.int(1, 9);
  return coinWord(st).slice(0, 3);
}
