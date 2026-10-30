// Builds our own bitmap font, "Mirage Pixel", as a TrueType file:  node scripts/pixel-font.cjs
// Each glyph is drawn below as rows of '#' (lit) and '.' (blank) on a 5x7 cap grid in the
// HD44780 LCD style, with 2 extra rows for descenders. Lit pixels are traced into square
// outlines, so the font stays crisp at any size. No dependencies.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'fonts', 'mirage-pixel.ttf');
const FAMILY = 'Mirage Pixel';
const VERSION = '1.000';

// 1 pixel = 100 units on a 1000 em: caps are 7 pixels (700), like Pixelify Sans, so it lines up the same
const PX = 100;
const UPM = 1000;
const ASCENT = 900; // 7 cap rows + 2 rows of headroom
const DESCENT = 300; // 2 descender rows + 1 of air; 1.2 line height, like Pixelify
const BASE_ROW = 6; // row 6 sits on the baseline, rows 7-8 hang below it

// Rows are top-down from the cap line; fewer than 9 rows are padded below.
// Width = row length; every glyph gets 1 blank column after it.
const GLYPHS = {
  ' ': ['...'],

  // digits: all 5 wide so times don't jiggle
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],

  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['....#', '....#', '....#', '....#', '....#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],

  // lowercase: x-height 5, ascenders reach the cap line, real 2-row descenders
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##', '.#..', '###.', '.#..', '.#..', '.#..', '.#..'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  i: ['#', '.', '#', '#', '#', '#', '#'],
  j: ['...#', '....', '..##', '...#', '...#', '...#', '...#', '#..#', '.##.'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.##.#', '#..##', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['....', '....', '#.##', '##..', '#...', '#...', '#...'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#..', '.#..', '###.', '.#..', '.#..', '.#..', '..##'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],

  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '"': ['#.#', '#.#'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  "'": ['#', '#'],
  '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
  ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
  '*': ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..'],
  ',': ['..', '..', '..', '..', '..', '.#', '.#', '#.'],
  '-': ['....', '....', '....', '####'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  '/': ['...#', '...#', '..#.', '..#.', '.#..', '.#..', '#...', '#...'],
  ':': ['.', '.', '#', '.', '.', '#'],
  ';': ['..', '..', '.#', '..', '..', '.#', '.#', '#.'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '=': ['.....', '.....', '#####', '.....', '#####'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.##.', '#....', '.####'],
  '[': ['###', '#..', '#..', '#..', '#..', '#..', '###'],
  '\\': ['#...', '#...', '.#..', '.#..', '..#.', '..#.', '...#', '...#'],
  ']': ['###', '..#', '..#', '..#', '..#', '..#', '###'],
  '^': ['..#..', '.#.#.', '#...#'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '`': ['#.', '.#'],
  '{': ['..#', '.#.', '.#.', '#..', '.#.', '.#.', '..#'],
  '|': ['#', '#', '#', '#', '#', '#', '#', '#', '#'],
  '}': ['#..', '.#.', '.#.', '..#', '.#.', '.#.', '#..'],
  '~': ['.....', '.....', '.#...', '#.#.#', '...#.'],

  '·': ['.', '.', '.', '#'], // middle dot
  '°': ['.##.', '#..#', '#..#', '.##.'], // degree
  '–': ['.....', '.....', '.....', '#####'], // en dash
  '—': ['.........', '.........', '.........', '#########'], // em dash
  '‘': ['.#', '#.', '#.'], // left single quote
  '’': ['.#', '.#', '#.'], // right single quote / apostrophe
  '“': ['.#..#', '#..#.', '#..#.'], // left double quote
  '”': ['.#..#', '.#..#', '#..#.'], // right double quote
  '…': ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'], // ellipsis
};

const NOTDEF = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'];

// ---------------------------------------------------------------- outlines

// Traces lit pixels into closed outlines: clockwise outsides, counter-clockwise holes (TrueType rule)
function trace(rows) {
  const edges = new Map(); // "x,y,x2,y2" -> [x, y, x2, y2], in pixel units, y up
  const add = (x, y, x2, y2) => {
    const back = `${x2},${y2},${x},${y}`;
    if (edges.has(back)) edges.delete(back); // shared edge between two lit pixels
    else edges.set(`${x},${y},${x2},${y2}`, [x, y, x2, y2]);
  };
  rows.forEach((row, r) => {
    const y = BASE_ROW - r;
    [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      add(x, y, x, y + 1);
      add(x, y + 1, x + 1, y + 1);
      add(x + 1, y + 1, x + 1, y);
      add(x + 1, y, x, y);
    });
  });
  const from = new Map(); // start vertex -> outgoing edges
  for (const e of edges.values()) {
    const k = `${e[0]},${e[1]}`;
    if (!from.has(k)) from.set(k, []);
    from.get(k).push(e);
  }
  const take = (e) => {
    const list = from.get(`${e[0]},${e[1]}`);
    list.splice(list.indexOf(e), 1);
    edges.delete(e.join(','));
  };
  const contours = [];
  while (edges.size) {
    let e = edges.values().next().value;
    const start = `${e[0]},${e[1]}`;
    const pts = [];
    for (;;) {
      take(e);
      pts.push([e[0], e[1]]);
      const k = `${e[2]},${e[3]}`;
      if (k === start) break;
      // where two pixels touch only at a corner, turn right so they stay separate shapes
      const dx = e[2] - e[0];
      const dy = e[3] - e[1];
      const out = from.get(k);
      const pick = (tx, ty) => out.find((o) => o[2] - o[0] === tx && o[3] - o[1] === ty);
      e = pick(dy, -dx) || pick(dx, dy) || pick(-dy, dx);
    }
    // drop points in the middle of straight runs
    contours.push(
      pts.filter((p, i) => {
        const a = pts[(i + pts.length - 1) % pts.length];
        const b = pts[(i + 1) % pts.length];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      }),
    );
  }
  return contours;
}

// Encodes one simple glyph (all points on-curve, no hinting instructions)
function encodeGlyph(contours) {
  const pts = contours.flat().map(([x, y]) => [x * PX, y * PX]);
  if (!pts.length) return { data: Buffer.alloc(0), xMin: 0, xMax: 0, points: 0, contours: 0 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const head = Buffer.alloc(10 + contours.length * 2 + 2);
  head.writeInt16BE(contours.length, 0);
  box.forEach((v, i) => head.writeInt16BE(v, 2 + i * 2));
  let end = -1;
  contours.forEach((c, i) => head.writeUInt16BE((end += c.length), 10 + i * 2));
  // flags: short deltas where they fit, "same" bit when a coordinate doesn't move
  const flags = [];
  const xb = [];
  const yb = [];
  let px = 0;
  let py = 0;
  const delta = (d, short, same, bytes) => {
    if (d === 0) return same;
    if (Math.abs(d) < 256) {
      bytes.push(Math.abs(d));
      return short | (d > 0 ? same : 0);
    }
    bytes.push((d >> 8) & 0xff, d & 0xff);
    return 0;
  };
  for (const [x, y] of pts) {
    flags.push(0x01 | delta(x - px, 0x02, 0x10, xb) | delta(y - py, 0x04, 0x20, yb));
    px = x;
    py = y;
  }
  let data = Buffer.concat([head, Buffer.from(flags), Buffer.from(xb), Buffer.from(yb)]);
  data = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
  return { data, xMin: box[0], yMin: box[1], xMax: box[2], yMax: box[3], points: pts.length, contours: contours.length };
}

// ---------------------------------------------------------------- tables

const u16 = (...v) => { const b = Buffer.alloc(v.length * 2); v.forEach((n, i) => b.writeUInt16BE(n & 0xffff, i * 2)); return b; };
const i16 = (...v) => { const b = Buffer.alloc(v.length * 2); v.forEach((n, i) => b.writeInt16BE(n, i * 2)); return b; };
const u32 = (...v) => { const b = Buffer.alloc(v.length * 4); v.forEach((n, i) => b.writeUInt32BE(n >>> 0, i * 4)); return b; };

function checksum(buf) {
  const b = Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4)]);
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum = (sum + b.readUInt32BE(i)) >>> 0;
  return sum;
}

function build() {
  // glyph order: .notdef, then by code point
  const chars = Object.keys(GLYPHS).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  for (let c = 32; c <= 126; c++) if (!GLYPHS[String.fromCharCode(c)]) throw new Error(`missing glyph ${String.fromCharCode(c)}`);
  const glyphs = [{ rows: NOTDEF, code: null }, ...chars.map((ch) => ({ rows: GLYPHS[ch], code: ch.codePointAt(0) }))];
  for (const g of glyphs) {
    const w = g.rows[0].length;
    if (g.rows.length > 9 || g.rows.some((r) => r.length !== w || /[^#.]/.test(r))) throw new Error(`bad bitmap for ${g.code}`);
    g.advance = (w + 1) * PX;
    Object.assign(g, encodeGlyph(trace(g.rows)));
  }
  const inked = glyphs.filter((g) => g.points);
  const xMin = Math.min(...inked.map((g) => g.xMin));
  const yMin = Math.min(...inked.map((g) => g.yMin));
  const xMax = Math.max(...inked.map((g) => g.xMax));
  const yMax = Math.max(...inked.map((g) => g.yMax));
  const n = glyphs.length;
  const codes = glyphs.filter((g) => g.code !== null).map((g) => g.code);

  // glyf + loca (long offsets)
  const offsets = [0];
  for (const g of glyphs) offsets.push(offsets[offsets.length - 1] + g.data.length);
  const glyf = Buffer.concat(glyphs.map((g) => g.data));
  const loca = u32(...offsets);

  const date = BigInt(Date.UTC(2026, 9, 30) / 1000 + 2082844800); // fixed, so builds are repeatable
  const longDate = Buffer.alloc(8);
  longDate.writeBigUInt64BE(date);
  const head = Buffer.concat([
    u32(0x00010000, 0x00010000, 0, 0x5f0f3cf5), // version, revision, checkSumAdjustment (later), magic
    u16(0x000b, UPM), // flags: baseline at 0, lsb at 0, integer ppem
    longDate, longDate,
    i16(xMin, yMin, xMax, yMax),
    u16(0, 8), // macStyle, lowestRecPPEM
    i16(2, 1, 0), // fontDirectionHint, indexToLocFormat (long), glyphDataFormat
  ]);

  const hhea = Buffer.concat([
    u32(0x00010000),
    i16(ASCENT, -DESCENT, 0),
    u16(Math.max(...glyphs.map((g) => g.advance))),
    i16(Math.min(...inked.map((g) => g.xMin)), Math.min(...inked.map((g) => g.advance - g.xMax)), Math.max(...inked.map((g) => g.xMax))),
    i16(1, 0, 0, 0, 0, 0, 0, 0), // caret rise/run/offset, reserved
    u16(n),
  ]);

  const maxp = Buffer.concat([
    u32(0x00010000),
    u16(n, Math.max(...glyphs.map((g) => g.points)), Math.max(...glyphs.map((g) => g.contours)), 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0),
  ]);

  const hmtx = Buffer.concat(glyphs.map((g) => Buffer.concat([u16(g.advance), i16(g.points ? g.xMin : 0)])));

  const avg = Math.round(glyphs.reduce((s, g) => s + g.advance, 0) / n);
  const os2 = Buffer.concat([
    u16(4), i16(avg), u16(400, 5, 0), // version, xAvgCharWidth, weight, width, fsType (installable)
    i16(650, 600, 0, 75, 650, 600, 0, 350, PX, 3 * PX, 0), // sub/superscript, strikeout, family class
    Buffer.alloc(10), // panose: no claims
    u32(0x80000003, 0, 0, 0), // Basic Latin, Latin-1, General Punctuation
    Buffer.from('MRGE'),
    u16(0x00c0, Math.min(...codes), Math.min(Math.max(...codes), 0xffff)), // regular + use typo metrics
    i16(ASCENT, -DESCENT, 0),
    u16(Math.max(ASCENT, yMax), Math.max(DESCENT, -yMin)),
    u32(1, 0), // code page: Latin 1
    i16(5 * PX, 7 * PX),
    u16(0, 32, 1),
  ]);

  // cmap format 4: runs where code and glyph id both step by one share a delta
  const segs = [];
  glyphs.forEach((g, gid) => {
    if (g.code === null) return;
    const last = segs[segs.length - 1];
    if (last && g.code === last.end + 1 && gid - g.code === last.delta) last.end = g.code;
    else segs.push({ start: g.code, end: g.code, delta: gid - g.code });
  });
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const sc = segs.length;
  const sel = Math.floor(Math.log2(sc));
  const sub = Buffer.concat([
    u16(4, 16 + sc * 8, 0, sc * 2, 2 ** (sel + 1), sel, sc * 2 - 2 ** (sel + 1)),
    u16(...segs.map((s) => s.end)), u16(0),
    u16(...segs.map((s) => s.start)),
    u16(...segs.map((s) => s.delta)),
    u16(...segs.map(() => 0)),
  ]);
  const cmap = Buffer.concat([u16(0, 2), u16(0, 3), u32(20), u16(3, 1), u32(20), sub]);

  const names = [
    [0, 'Made for Mirage'],
    [1, FAMILY],
    [2, 'Regular'],
    [3, `${FAMILY} ${VERSION}`],
    [4, FAMILY],
    [5, `Version ${VERSION}`],
    [6, 'MiragePixel-Regular'],
  ];
  const strs = names.map(([, s]) => Buffer.from(s, 'utf16le').swap16());
  let at = 0;
  const name = Buffer.concat([
    u16(0, names.length, 6 + names.length * 12),
    ...names.map(([id], i) => { const r = u16(3, 1, 0x409, id, strs[i].length, at); at += strs[i].length; return r; }),
    ...strs,
  ]);

  const post = Buffer.concat([u32(0x00030000, 0), i16(-PX, PX), u32(0, 0, 0, 0, 0)]); // v3: no glyph names

  // sfnt wrapper: tables sorted by tag, 4-byte aligned, then the whole-file checksum goes into head
  const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const nt = tags.length;
  const es = Math.floor(Math.log2(nt));
  const dir = [u32(0x00010000), u16(nt, 16 * 2 ** es, es, nt * 16 - 16 * 2 ** es)];
  const body = [];
  let off = 12 + nt * 16;
  let headAt = 0;
  for (const tag of tags) {
    const t = tables[tag];
    if (tag === 'head') headAt = off;
    dir.push(Buffer.from(tag.padEnd(4)), u32(checksum(t), off, t.length));
    const padded = Buffer.concat([t, Buffer.alloc((4 - (t.length % 4)) % 4)]);
    body.push(padded);
    off += padded.length;
  }
  const font = Buffer.concat([...dir, ...body]);
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headAt + 8);
  return { font, count: n };
}

const { font, count } = build();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, font);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${count} glyphs, ${font.length} bytes`);
