// Shareable setups: your whole desktop look as one short code you can post to a friend.
//
// Two rules decide everything in this file:
//   1. Only the look travels. Nothing personal does: no name, city, GitHub user, repo or
//      file paths, dock apps, note / to-do / quote / countdown text, watchlists, shortcuts.
//      A widget that holds personal text is still shared (so the layout is identical) but
//      arrives empty, so the friend gets the same sticky note in the same place with the
//      same style and none of your words.
//   2. An imported payload is untrusted data. Nothing is copied into a config unless its
//      key is on the allow-list below and its value passes that key's own check.
//
// The wire format is `MIRAGE1-<base64url>`: the JSON payload, raw-deflated with zlib and
// base64url'd. Node built-ins only.

const zlib = require('zlib');
const brand = require('./brand.cjs');
const { WIDGETS, NOTE_COLORS, byType, make } = require('./widgets.cjs');
const { wallById } = require('./packs.cjs');
const { byId: themeById } = require('./themes.cjs');

const VERSION = 1;
const PREFIX = `${brand.slug.toUpperCase()}${VERSION}-`;

// Sane ceilings, so a pasted code can never cost much. A full desktop is ~600 bytes of code.
const MAX_CODE = 12000; // characters of base64url
const MAX_JSON = 192 * 1024; // bytes after inflating
const MAX_WIDGETS = 60;
const MAX_STACK_ITEMS = 8;

// ------------------------------------------------------------------ value checks
// Every check returns a clean value, or undefined when the value is not shareable.
// Numbers clamp (a friend's 300% scale becomes 260%), names and ids must match exactly.

const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const oneOf = (list) => (v) => (typeof v === 'string' && list.includes(v) ? v : undefined);
const num = (min, max, places = 3) => (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Number(Math.min(max, Math.max(min, v)).toFixed(places));
};
const int = (min, max) => (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.round(Math.min(max, Math.max(min, v)));
};
const text = (max, re) => (v) => (typeof v === 'string' && [...v].length <= max && (!re || re.test(v)) ? v : undefined);

// Widget color swatches, kept in step with TINTS in src/renderer/js/widgetform.js.
const TINT_NAMES = ['graphite', 'white', 'blue', 'indigo', 'purple', 'pink', 'orange', 'green', 'teal'];
const HEX = /^#[0-9a-f]{6}$/i;
const swatch = (v) => (typeof v === 'string' && (TINT_NAMES.includes(v) || HEX.test(v)) ? (HEX.test(v) ? v.toLowerCase() : v) : undefined);
const FONT_KEYS = ['classic', 'rounded', 'serif', 'mono', 'heritage', 'pixel', 'comic'];
const CLOCK_LOOKS = ['classic', 'minimal', 'stacked', 'analog', 'flip', 'duo', 'glow', 'words'];
const SHAPE_TYPES = ['photo', 'memories', 'clock', 'calendar', 'weather', 'stocks', 'music', 'assistant', 'countdown', 'year'];

// An emoji sticker is part of the look; words typed into one are not, so they stay home.
const EMOJI_ONLY = (v) => (typeof v === 'string' && v.trim() && !/[\p{L}\p{N}]/u.test(v) ? v.trim() : undefined);

// three colors in 0..1, like the gallery's pickers
const rgb = (v) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? v.map((n) => Number(Math.min(1, Math.max(0, n)).toFixed(4))) : undefined);

function wallCustom(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const color = v.color && typeof v.color === 'object' ? v.color : {};
  const emoji = v.emoji && typeof v.emoji === 'object' ? v.emoji : {};
  const out = { color: {}, emoji: {} };
  for (const k of ['A', 'B', 'C']) {
    const c = rgb(color[k]);
    if (c) out.color[k] = c;
  }
  const style = oneOf(['mesh', 'linear', 'radial'])(color.style);
  if (style) out.color.style = style;
  const t = text(40)(emoji.text);
  if (t) out.emoji.text = t;
  const layout = oneOf(['grid', 'rings', 'spiral'])(emoji.layout);
  if (layout) out.emoji.layout = layout;
  const bg = typeof emoji.bg === 'string' && HEX.test(emoji.bg) ? emoji.bg.toLowerCase() : undefined;
  if (bg) out.emoji.bg = bg;
  return out;
}

// ------------------------------------------------------------------ the allow-lists

// The look. `read` pulls the value out of a config, `write` puts it back, so a value that
// means "the default" (accent "theme", sky "auto") survives the round trip.
const LOOK = {
  wall: { check: (v) => (wallById(v) ? String(v).toLowerCase() : undefined), label: 'wallpaper' },
  theme: { check: (v) => (themeById(v) ? String(v).toLowerCase() : undefined), label: 'widget style' },
  appearance: { check: oneOf(['sun', 'auto', 'light', 'dark']), label: 'day & night' },
  accent: {
    check: (v) => (v === 'theme' || v === 'song' ? v : swatch(v)),
    label: 'accent color',
    read: (c) => c.accent || 'theme',
    write: (c, v) => (v === 'theme' ? delete c.accent : (c.accent = v)),
  },
  wallBlur: { check: int(0, 100), label: 'wallpaper blur' },
  wallQuality: { check: oneOf(['auto', 'low', 'balanced', 'high']), label: 'wallpaper quality' },
  motion: { check: bool, label: 'animations' },
  clock24: { check: bool, label: 'clock' },
  season: { check: oneOf(['off', 'auto', 'spring', 'summer', 'autumn', 'winter']), label: 'season' },
  weatherFx: { check: oneOf(['auto', 'off', 'rain', 'snow', 'storm']), label: 'live weather' },
  sky: {
    check: oneOf(['auto', 'clear', 'partly', 'cloudy', 'rain', 'snow', 'storm', 'fog']),
    label: 'live sky',
    read: (c) => c.sky || 'auto',
    write: (c, v) => (c.sky = v === 'auto' ? null : v),
  },
  planet: { check: oneOf(['moon', 'mars', 'earth']), label: 'planet' },
  pet: { check: oneOf(['cat', 'bird', 'off']), label: 'desktop pet' },
  visualizer: { check: bool, label: 'music visualizer' },
  albumWall: { check: bool, label: 'album art wallpaper', read: (c) => c.albumWall !== false },
  menubarFixed: { check: bool, label: 'menu bar' },
  wallCustom: { check: wallCustom, label: 'your Color / Emoji wallpaper' },
};

// Per-widget keys. `types` limits a key to the widgets it belongs to, so a payload can
// never, say, push text into someone's sticky note.
const WIDGET = {
  // where it sits
  x: { check: num(0, 1, 4) },
  y: { check: num(0, 1, 4) },
  scale: { check: num(0.45, 2.6, 3) },
  width: { check: num(6, 160, 2) },
  align: { check: oneOf(['center']) },
  shape: { check: oneOf(['small', 'medium']), types: SHAPE_TYPES },
  // how it looks (the "Reset style" keys in widgetform.js, plus its Look tab)
  style: { check: oneOf(['theme', 'glass', 'solid', 'clear', 'outline']) },
  tint: { check: swatch },
  accent: { check: swatch },
  textColor: { check: swatch },
  font: { check: oneOf(FONT_KEYS) },
  weight: { check: int(100, 900) },
  corners: { check: oneOf(['round', 'soft', 'square']) },
  opacity: { check: num(0.2, 1, 2) },
  shadow: { check: bool },
  // per-widget visual options
  variant: { check: oneOf(CLOCK_LOOKS), types: ['clock'] },
  textAlign: { check: oneOf(['left', 'center', 'right']), types: ['clock'] },
  zero: { check: bool, types: ['clock'] },
  seconds: { check: bool, types: ['clock'] },
  ampm: { check: bool, types: ['clock'] },
  showDate: { check: bool, types: ['clock'] },
  showGreeting: { check: bool, types: ['clock'] },
  weeks: { check: int(1, 60), types: ['commits'] },
  showStats: { check: bool, types: ['commits'] },
  count: { check: int(1, 20), types: ['feed'] },
  hideDone: { check: bool, types: ['todo'] },
  fontSize: { check: oneOf(['s', 'm', 'l']), types: ['note'] },
  color: { check: oneOf(NOTE_COLORS), types: ['note'] },
  decimals: { check: int(0, 6), types: ['year'] },
  details: { check: bool, types: ['weather'] },
  size: { check: oneOf(['s', 'm', 'l']), types: ['quote'] },
  rotate: { check: oneOf(['day', 'hour', '15m', '1m']), types: ['quote', 'verse'] },
  every: { check: int(0, 10080), types: ['photo', 'memories'] },
  plain: { check: bool, types: ['sticker'] },
  text: { check: EMOJI_ONLY, types: ['sticker'] }, // emoji only, never typed words
  interval: { check: int(0, 600), types: ['stack'] },
  items: {
    types: ['stack'],
    check: (v) => {
      if (!Array.isArray(v)) return undefined;
      const out = v
        .slice(0, MAX_STACK_ITEMS)
        .map((it) => (it && typeof it === 'object' && byType(it.type) ? { type: String(it.type).toLowerCase() } : null))
        .filter(Boolean);
      return out.length ? out : undefined;
    },
  },
};

// Everything below is deliberately left out of a share; `bro export --show` proves it.
const STRIPPED = [
  'name — your name in the greeting',
  'city — your weather city',
  'github — your GitHub username',
  'repos — the folders your commit graph reads',
  'dock — your apps (local paths)',
  'background / dim — your own wallpaper image (a local file path)',
  'note, to-do, quote and countdown text, and any sticker words you typed',
  'stocks watchlist',
  'ai model, hotkey, spotlight-key, autostart, onboarded',
  'widget ids, photo album paths, anything else under your home folder',
];

// ------------------------------------------------------------------ export

const SINGLE = new Set(['clock', 'dock', 'menubar']);

function shareWidget(w) {
  const type = String(w.type || '').toLowerCase();
  if (!byType(type)) return null; // includes 'menubar', which the app draws itself
  const out = { type, x: 0, y: 0 };
  for (const [key, spec] of Object.entries(WIDGET)) {
    if (w[key] === undefined || (spec.types && !spec.types.includes(type))) continue;
    const v = spec.check(w[key]);
    if (v !== undefined) out[key] = v;
  }
  out.x = WIDGET.x.check(w.x) ?? 0.5;
  out.y = WIDGET.y.check(w.y) ?? 0.4;
  if (out.scale === 1) delete out.scale; // make() gives every widget scale 1 anyway
  return out;
}

// A config → the payload that would be shared. Nothing else from the config is read.
function buildPayload(cfg) {
  const look = {};
  for (const [key, spec] of Object.entries(LOOK)) {
    const raw = spec.read ? spec.read(cfg) : cfg[key];
    if (raw === undefined || raw === null) continue;
    const v = spec.check(raw);
    if (v !== undefined) look[key] = v;
  }
  const widgets = (Array.isArray(cfg.widgets) ? cfg.widgets : []).slice(0, MAX_WIDGETS).map(shareWidget).filter(Boolean);
  return { v: VERSION, look, widgets };
}

const b64url = (buf) => buf.toString('base64url');

function encode(payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  return PREFIX + b64url(zlib.deflateRawSync(json, { level: 9 }));
}

// The same payload, laid out so a person can read every field before sending it.
function readable(payload) {
  const look = Object.entries(payload.look || {}).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const widgets = (payload.widgets || []).map((w) => `    ${JSON.stringify(w)}`);
  return [`{`, `  "v": ${payload.v},`, `  "look": {`, look.join(',\n'), `  },`, `  "widgets": [`, widgets.join(',\n'), `  ]`, `}`].filter((l) => l !== '').join('\n');
}

// ------------------------------------------------------------------ import

const bad = (error, lines = []) => ({ ok: false, error, lines });

// A code, with or without its prefix and with any pasted line breaks, → a payload object.
function decode(input) {
  let s = String(input == null ? '' : input).trim().replace(/\s+/g, '');
  if (!s) return bad('Nothing to import', [`Paste a ${PREFIX}… code, or give a .json file`]);
  if (s.toUpperCase().startsWith(PREFIX)) s = s.slice(PREFIX.length);
  else if (s.toUpperCase().startsWith(brand.slug.toUpperCase())) return bad(`That code is from another version of ${brand.name}`, [`This copy reads codes that start with ${PREFIX}`, `Ask for a new one, or update with \`${brand.command} update now\``]);
  else if (/^[A-Za-z]+\d*-/.test(s)) return bad(`That code is not a ${brand.name} setup`, [`${brand.name} codes start with ${PREFIX}`]);
  else return bad('That does not look like a setup code', [`A setup code starts with ${PREFIX}`, `Example: ${brand.command} import ${PREFIX}eJyrVkrLz1eyUsoFAA…`]);
  if (s.length > MAX_CODE) return bad('That code is too long to be a setup', [`${s.length} characters; the limit is ${MAX_CODE}`]);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return bad('That code has characters that do not belong in it', ['It was probably cut short or mangled by the app you copied it from']);
  let json;
  try {
    json = zlib.inflateRawSync(Buffer.from(s, 'base64url'), { maxOutputLength: MAX_JSON });
  } catch (e) {
    const big = String(e && e.code) === 'ERR_BUFFER_TOO_LARGE';
    return bad(big ? 'That setup is far too big' : 'That code is damaged', big ? [`A setup unpacks to under ${Math.round(MAX_JSON / 1024)} KB`] : ['Copy it again — codes break when they are cut short or line-wrapped']);
  }
  let raw;
  try {
    raw = JSON.parse(json.toString('utf8'));
  } catch {
    return bad('That code is damaged', ['It unpacked, but what came out is not a setup']);
  }
  return validate(raw);
}

// Text from a file: either the readable JSON, or a code saved as a line of text.
function parseText(input) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return bad('That file is empty');
  if (s.startsWith('{')) {
    try {
      return validate(JSON.parse(s));
    } catch {
      return bad('That file is not a setup', ['It should be the JSON that `' + brand.command + ' export --file` writes']);
    }
  }
  if (!s.toUpperCase().startsWith(PREFIX)) return bad('That file is not a setup', [`It should be the JSON that \`${brand.command} export --file\` writes, or one line holding a ${PREFIX}… code`]);
  return decode(s);
}

// The gate: an untrusted object → a payload with nothing but allow-listed, checked values.
function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('That is not a setup', ['A setup is a JSON object with v, look and widgets']);
  if (raw.v !== VERSION) {
    const v = raw.v;
    if (typeof v === 'number' && v > VERSION) return bad(`That setup is from a newer ${brand.name}`, [`It is version ${v}; this copy reads version ${VERSION}`, `Update with \`${brand.command} update now\``]);
    return bad('That setup is not version ' + VERSION, [v === undefined ? 'It has no version at all' : `It says version ${JSON.stringify(v)}`]);
  }
  const extra = Object.keys(raw).filter((k) => !['v', 'look', 'widgets'].includes(k));
  if (extra.length) return bad(`A setup cannot carry "${extra[0]}"`, ['A setup holds only v, look and widgets', `Unexpected: ${extra.join(', ')}`]);

  const look = {};
  if (raw.look !== undefined) {
    if (!raw.look || typeof raw.look !== 'object' || Array.isArray(raw.look)) return bad('The look in that setup is not readable');
    for (const [key, value] of Object.entries(raw.look)) {
      const spec = LOOK[key];
      if (!spec) return bad(`A setup cannot carry "${key}"`, ['Only the look is shared, and that is not one of its keys', `Shared: ${Object.keys(LOOK).join(', ')}`]);
      const v = spec.check(value);
      if (v === undefined) return bad(`${JSON.stringify(value)} is not a ${spec.label} this copy knows`, [key === 'wall' ? `No wallpaper has the id ${JSON.stringify(value)}` : `Check the ${spec.label} in the setup`]);
      look[key] = v;
    }
  }

  const widgets = [];
  if (raw.widgets !== undefined) {
    if (!Array.isArray(raw.widgets)) return bad('The widgets in that setup are not a list');
    if (raw.widgets.length > MAX_WIDGETS) return bad(`That setup has ${raw.widgets.length} widgets`, [`The most that can be shared is ${MAX_WIDGETS}`]);
    const seen = new Set();
    for (const w of raw.widgets) {
      if (!w || typeof w !== 'object' || Array.isArray(w)) return bad('One of the widgets in that setup is not readable');
      const type = String(w.type || '').toLowerCase();
      if (!byType(type)) return bad(`There is no "${w.type}" widget`, [`Widgets: ${WIDGETS.map((x) => x.type).join(', ')}`]);
      if (SINGLE.has(type) && seen.has(type)) continue; // only one clock, one dock
      seen.add(type);
      const out = { type };
      for (const [key, value] of Object.entries(w)) {
        if (key === 'type') continue;
        const spec = WIDGET[key];
        if (!spec) return bad(`A ${type} widget cannot carry "${key}"`, ['Only the look and the layout are shared', 'Your notes, to-dos and watchlists stay on your own machine']);
        if (spec.types && !spec.types.includes(type)) return bad(`A ${type} widget has no "${key}"`, [`"${key}" belongs to: ${spec.types.join(', ')}`]);
        const v = spec.check(value);
        if (v === undefined) return bad(`${JSON.stringify(value)} is not a valid "${key}" for a ${type} widget`);
        out[key] = v;
      }
      out.x = out.x ?? 0.5;
      out.y = out.y ?? 0.4;
      widgets.push(out);
    }
  }
  return { ok: true, payload: { v: VERSION, look, widgets } };
}

// ------------------------------------------------------------------ applying it

// Writes a checked payload into a config. Personal fields are never named here, so they
// cannot be touched: the import only ever sets the keys the allow-lists above describe.
function apply(cfg, payload, opts = {}) {
  const doLook = opts.widgetsOnly !== true;
  const doWidgets = opts.lookOnly !== true;
  const changed = { look: [], widgets: 0 };
  if (doLook) {
    for (const [key, value] of Object.entries(payload.look || {})) {
      const spec = LOOK[key];
      if (!spec) continue;
      if (spec.write) spec.write(cfg, value);
      else cfg[key] = value;
      changed.look.push(key);
    }
    // a shared Color / Emoji wallpaper keeps whatever the importer had not shared
    if (payload.look && payload.look.wallCustom) {
      cfg.wallCustom = {
        color: { ...(cfg.wallCustom && cfg.wallCustom.color), ...payload.look.wallCustom.color },
        emoji: { ...(cfg.wallCustom && cfg.wallCustom.emoji), ...payload.look.wallCustom.emoji },
      };
    }
  }
  if (doWidgets && Array.isArray(payload.widgets)) {
    // make() gives each widget a fresh local id and this machine's own empty content
    cfg.widgets = payload.widgets.map(({ type, x, y, ...rest }) => make(type, x, y, rest));
    changed.widgets = cfg.widgets.length;
  }
  return changed;
}

// Two or three lines describing a payload, for the preview and the export hint.
function summary(payload) {
  const look = payload.look || {};
  const w = look.wall ? wallById(look.wall) : null;
  const t = look.theme ? themeById(look.theme) : null;
  const counts = {};
  for (const x of payload.widgets || []) counts[x.type] = (counts[x.type] || 0) + 1;
  const list = Object.entries(counts).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
  return [
    `wallpaper  ${w ? w.name : look.wall || '(unchanged)'}`,
    `style      ${t ? t.name : look.theme || '(unchanged)'}${look.accent && look.accent !== 'theme' ? ` · accent ${look.accent}` : ''}${look.wallBlur ? ` · blur ${look.wallBlur}%` : ''}`,
    `widgets    ${(payload.widgets || []).length}${list.length ? `: ${list.join(', ')}` : ''}`,
  ];
}

module.exports = { VERSION, PREFIX, MAX_CODE, LOOK, WIDGET, STRIPPED, buildPayload, encode, decode, parseText, validate, apply, summary, readable };
