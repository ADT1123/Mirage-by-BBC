// Every setting you can change in the app (Settings, Control Center and the wallpaper
// gallery) as one table. `bro settings`, `bro set` and the interactive settings menu all
// read it, so they agree with each other and with the defaults in src/shared/config.cjs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import themes from '../src/shared/themes.cjs';
import packs from '../src/shared/packs.cjs';
import brand from '../src/shared/brand.cjs';
import { lookup } from './fuzzy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { THEMES } = themes;
const { PACKS, wallById } = packs;

// ------------------------------------------------------------------ catalogs from the app

// Accent colors, widget fonts and so on live in the renderer, which is browser code we can't
// import here. Read them out of the source so the CLI never drifts from the app; the
// fallbacks only matter if those files move.
function readConsts(file) {
  let src = '';
  try {
    src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {}
  return (name) => src.match(new RegExp(`const ${name} = ([\\[{][\\s\\S]*?[\\]}]);`))?.[1] || '';
}
const form = readConsts('src/renderer/js/widgetform.js');
const mainSrc = readConsts('src/main/main.cjs');
const pairs = (text, re, fallback) => {
  const found = [...text.matchAll(re)].map((m) => [m[1], m[2]]);
  return found.length ? found : fallback;
};

export const TINTS = pairs(form('TINTS'), /(\w+):\s*'(#[0-9a-f]{6})'/gi, [['blue', '#0a84ff'], ['indigo', '#5e5ce6'], ['purple', '#bf5af2'], ['pink', '#ff375f'], ['orange', '#ff9f0a'], ['green', '#30d158'], ['teal', '#32ade6']]);
export const FONTS = pairs(form('FONTS'), /^\s*(\w+):\s*\{\s*label:\s*'([^']+)'/gm, [['classic', 'Classic'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono']]);
export const STYLES = pairs(form('STYLES'), /\['(\w+)',\s*'([^']+)'\]/g, [['theme', 'Theme'], ['glass', 'Glass'], ['solid', 'Solid'], ['clear', 'Clear']]);
export const CORNERS = pairs(form('CORNERS'), /\['(\w*)',\s*'([^']+)'\]/g, [['', 'Theme'], ['round', 'Round'], ['soft', 'Soft'], ['square', 'Square']]);
// shortcuts Windows and most apps already use (the app refuses them too)
const COMMON = Object.fromEntries(pairs(mainSrc('COMMON'), /'([^']+)':\s*'([^']+)'/g, [['Ctrl+C', 'Copy'], ['Ctrl+V', 'Paste'], ['Alt+F4', 'Close window'], ['Alt+Tab', 'Switch apps']]));

// The app's default shortcuts (src/main/main.cjs registers these first).
export const DEFAULT_KEYS = { hotkey: 'Alt+W', spotlightHotkey: 'Ctrl+Space' };
export const showKey = (k) => String(k || '').replace('CommandOrControl', 'Ctrl');

// ------------------------------------------------------------------ value helpers

const YES = ['on', 'yes', 'true', '1', 'enable', 'enabled', 'show'];
const NO = ['off', 'no', 'false', '0', 'disable', 'disabled', 'hide'];

// "ctrl+alt+k", "Alt + W", "win+shift+s" → an Electron accelerator like "Ctrl+Alt+K"
const MODS = { ctrl: 'Ctrl', control: 'Ctrl', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', super: 'Super', win: 'Super', windows: 'Super', meta: 'Super', cmd: 'Super', command: 'Super' };
const KEYS = { space: 'Space', enter: 'Enter', return: 'Enter', tab: 'Tab', up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert', delete: 'Delete', del: 'Delete', backquote: '`', minus: '-', plus: 'Plus', comma: ',', period: '.', slash: '/' };
export function parseKey(text) {
  const parts = String(text || '').split('+').map((p) => p.trim()).filter(Boolean);
  const mods = [];
  let key = null;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (MODS[low]) mods.includes(MODS[low]) || mods.push(MODS[low]);
    else if (key) return null; // two plain keys
    else if (/^[a-z0-9]$/i.test(p)) key = p.toUpperCase();
    else if (/^f([1-9]|1\d|2[0-4])$/i.test(p)) key = p.toUpperCase();
    else if (KEYS[low]) key = KEYS[low];
    else if (/^[`\-=,./;'[\]\\]$/.test(p)) key = p;
    else return null;
  }
  if (!key) return null;
  const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
  return { accel: [...order.filter((m) => mods.includes(m)), key].join('+'), bare: !mods.length && !/^F\d/.test(key) };
}

// ------------------------------------------------------------------ the table

// kinds: choice (one of a list) · toggle (on/off) · number · text · key (a shortcut) ·
// command (handled by its own command, e.g. a city lookup)
const choice = (name, key, group, label, desc, choices, more = {}) => ({ name, key, group, label, desc, kind: 'choice', choices, ...more });
const toggle = (name, key, group, label, desc, def, more = {}) => ({
  name,
  key,
  group,
  label,
  desc,
  kind: 'toggle',
  choices: [['on', ''], ['off', '']],
  get: (c) => (def ? c[key] !== false : !!c[key]),
  ...more,
});
const command = (name, group, label, desc, run, show, more = {}) => ({ name, group, label, desc, kind: 'command', command: run, show, ...more });

export const SETTINGS = [
  // wallpaper
  command('wallpaper', 'Wallpaper', 'Wallpaper', 'What fills your screen (see /walls)', ['wall'], (c) => {
    const w = wallById(c.wall);
    return w ? `${w.name} · ${PACKS.find((p) => p.id === w.pack)?.name || w.pack}` : c.wall;
  }, { aliases: ['wall'] }),
  {
    name: 'blur',
    key: 'wallBlur',
    group: 'Wallpaper',
    label: 'Wallpaper blur',
    desc: 'Blur the wallpaper behind your widgets, 0 (sharp) to 100',
    kind: 'number',
    min: 0,
    max: 100,
    step: 5,
    get: (c) => Number(c.wallBlur) || 0,
    show: (v) => (v ? `${v}%` : 'off'),
    aliases: ['wallblur'],
  },
  command('background', 'Wallpaper', 'Background image', 'Your own picture instead of the wallpaper (none = back to the wallpaper)', ['bg'], (c) => c.background || 'none (the wallpaper)', { aliases: ['bg', 'image', 'photo'] }),
  {
    name: 'dim',
    key: 'dim',
    group: 'Wallpaper',
    label: 'Image dim',
    desc: 'How much your background image is darkened, 0 to 80',
    kind: 'number',
    min: 0,
    max: 80,
    step: 5,
    get: (c) => Math.round((c.dim ?? 0.25) * 100),
    set: (c, v) => (c.dim = v / 100),
    show: (v) => `${v}%`,
  },
  command('planet', 'Wallpaper', 'Planet', 'Which body the Astronomy pack shows', ['planet'], (c) => wallById(c.wall)?.body || c.planet || 'moon'),
  choice('sky', 'sky', 'Wallpaper', 'Live Sky', 'Force a sky on the Live Sky wallpaper (auto = your real weather)', [['auto', 'your real weather'], ['clear', ''], ['partly', 'partly cloudy'], ['cloudy', ''], ['rain', ''], ['snow', ''], ['storm', ''], ['fog', '']], {
    get: (c) => c.sky || 'auto',
    set: (c, v) => (c.sky = v === 'auto' ? null : v),
  }),
  choice('weather', 'weatherFx', 'Wallpaper', 'Live weather', 'Rain or snow over your desktop', [['auto', 'only when it really rains or snows'], ['off', ''], ['rain', 'always'], ['snow', 'always'], ['storm', 'always']], { aliases: ['fx', 'weatherfx'] }),
  choice('season', 'season', 'Wallpaper', 'Season', 'Cherry petals, summer light, falling leaves or snow', [['off', ''], ['auto', 'follows the calendar'], ['spring', 'cherry petals'], ['summer', 'summer light'], ['autumn', 'falling leaves'], ['winter', 'snow']], { aliases: ['seasons'] }),

  // look
  choice('appearance', 'appearance', 'Look', 'Day & night', 'Light or dark version of every wallpaper and style', [['sun', 'light by day, dark after sunset'], ['light', 'always the day look'], ['dark', 'always the night look'], ['auto', 'follows Windows light/dark mode']], {
    get: (c) => c.appearance || 'sun',
    alias: { day: 'light', night: 'dark', system: 'auto', windows: 'auto', sunset: 'sun', sunrise: 'sun' },
    aliases: ['daynight', 'mode'],
  }),
  choice('accent', 'accent', 'Look', 'Accent color', 'One color for the clock, rings and commit graph (or any #hex)', [['theme', 'the style’s own color'], ...TINTS.map(([k, hex]) => [k, hex]), ['song', 'follows the album art of what’s playing']], {
    get: (c) => c.accent || 'theme',
    set: (c, v) => (v === 'theme' ? delete c.accent : (c.accent = v)),
    custom: (raw) => (/^#?[0-9a-f]{6}$/i.test(raw) ? `#${raw.replace('#', '').toLowerCase()}` : null),
    alias: { auto: 'theme', none: 'theme', default: 'theme', music: 'song', album: 'song' },
    aliases: ['color', 'colour'],
  }),
  choice('style', 'theme', 'Look', 'Widget style', 'How the widgets look; the wallpaper stays (see /themes)', THEMES.map((t) => [t.id, t.tagline]), { aliases: ['skin', 'widgetstyle'] }),
  choice('clock', 'clock24', 'Look', 'Clock', '12 or 24 hour time', [['12', '1:30 PM'], ['24', '13:30']], {
    get: (c) => (c.clock24 ? '24' : '12'),
    show: (v) => `${v}-hour`,
    set: (c, v) => (c.clock24 = v === '24'),
    alias: { '12h': '12', '24h': '24' },
    aliases: ['clock24', '24h'],
  }),

  // performance
  choice('quality', 'wallQuality', 'Performance', 'Wallpaper quality', 'How sharp the live wallpapers render', [['auto', 'picks for your screen and battery'], ['low', 'lightest on the GPU'], ['balanced', ''], ['high', 'sharpest']], { aliases: ['wallquality', 'resolution'] }),
  choice('perf', 'perf', 'Performance', 'Performance', 'Auto saves power on battery and on modest laptops', [['auto', 'saves power on battery'], ['saver', 'battery saver, always'], ['full', 'full quality, always']], { alias: { battery: 'saver', max: 'full' }, aliases: ['performance', 'power'] }),
  choice('gpu', 'gpu', 'Performance', 'Graphics', 'Which GPU draws the wallpaper on laptops with two', [['dedicated', 'fast GPU'], ['integrated', 'power saving']], {
    alias: { fast: 'dedicated', discrete: 'dedicated', saving: 'integrated', igpu: 'integrated' },
    after: 'Takes effect the next time it starts (run /restart)',
    aliases: ['graphics'],
  }),
  toggle('motion', 'motion', 'Performance', 'Animations', 'Turn animations off to save battery', true, { aliases: ['animations'] }),

  // desktop
  toggle('menubar', 'menubarFixed', 'Desktop', 'Always show menu bar', 'Off: the menu bar hides and slides down at the top edge', true, { aliases: ['menubarfixed'] }),
  toggle('albumart', 'albumWall', 'Desktop', 'Album art wallpaper', 'Show the album art full screen while music plays', true, { aliases: ['albumwall', 'album'] }),
  toggle('visualizer', 'visualizer', 'Desktop', 'Music visualizer', 'Bars in the Now Playing view', true),
  choice('pet', 'pet', 'Desktop', 'Desktop pet', 'A tiny pet that walks along your dock', [['cat', ''], ['bird', ''], ['off', '']], { get: (c) => c.pet ?? 'cat' }),
  toggle('autostart', 'autostart', 'Desktop', 'Start at login', `Start ${brand.name} when you log in`, false, { aliases: ['startup', 'login'] }),

  // shortcuts
  { name: 'hotkey', key: 'hotkey', group: 'Shortcuts', label: 'Rearrange shortcut', desc: 'Opens the editor to drag and resize widgets', kind: 'key', get: (c) => showKey(c.hotkey || DEFAULT_KEYS.hotkey), other: 'spotlightHotkey', aliases: ['editkey', 'rearrange', 'shortcut'] },
  { name: 'spotlight-key', key: 'spotlightHotkey', group: 'Shortcuts', label: 'Spotlight shortcut', desc: 'Opens Spotlight search', kind: 'key', get: (c) => showKey(c.spotlightHotkey || DEFAULT_KEYS.spotlightHotkey), other: 'hotkey', aliases: ['spotlighthotkey', 'spotlight'] },

  // you
  { name: 'name', key: 'name', group: 'You', label: 'Your name', desc: 'The name in your greeting (empty = your computer account name)', kind: 'text', get: (c) => c.name || '', show: (v) => v || '(your account name)' },
  command('city', 'You', 'Weather city', 'The city for weather and sunrise (auto = from your network)', ['city'], (c) => (c.city ? `${c.city.name}${c.city.country ? `, ${c.city.country}` : ''}` : 'auto')),
  command('github', 'You', 'GitHub user', 'Whose contributions the commit graph shows', ['github'], (c) => (c.github === 'off' ? 'off' : c.github ? `@${c.github}` : 'auto')),
  command('ai-model', 'You', 'AI model', 'The local Ollama model the Assistant uses', ['ai', 'model'], (c) => c.ai?.model || 'llama3.1:8b', { aliases: ['model', 'ai'] }),
];

export const GROUPS = [...new Set(SETTINGS.map((s) => s.group))];

// ------------------------------------------------------------------ reading and writing

export const valueOf = (s, cfg) => (s.get ? s.get(cfg) : cfg[s.key]);

export function shown(s, cfg) {
  if (s.kind === 'command') return s.show(cfg);
  const v = valueOf(s, cfg);
  if (s.show) return s.show(v);
  if (s.kind === 'toggle') return v ? 'on' : 'off';
  return String(v ?? '');
}

export function findSetting(name) {
  return lookup(name, SETTINGS.map((s) => ({ item: s, keys: [s.name, s.key, s.label, ...(s.aliases || [])].filter(Boolean) })));
}

// What you can type, for messages and completion.
export function usage(s) {
  if (s.kind === 'number') return [`A number from ${s.min} to ${s.max}${s.name === 'blur' ? ' (0 or off = sharp)' : ''}`];
  if (s.kind === 'toggle') return ['on or off'];
  if (s.kind === 'key') return ['A key combination, e.g. Alt+W, Ctrl+Alt+K or Ctrl+Space'];
  if (s.kind === 'text') return ['Any text (leave empty to clear)'];
  if (s.kind === 'choice') {
    const w = Math.max(...s.choices.map(([v]) => v.length)) + 2;
    return [...s.choices.map(([v, hint]) => `${v.padEnd(w)}${hint}`), ...(s.custom ? ['#rrggbb   any color, e.g. #ff6b6b'] : [])];
  }
  return [];
}

// words → { value } or { error }
export function parseValue(s, words, cfg) {
  const raw = words.join(' ').trim();
  const low = raw.toLowerCase();
  if (s.kind === 'text') return { value: raw };
  if (s.kind === 'toggle') {
    if (YES.includes(low)) return { value: true };
    if (NO.includes(low)) return { value: false };
    return { error: `Use on or off for ${s.label.toLowerCase()}` };
  }
  if (s.kind === 'number') {
    const v = low === 'off' || low === 'none' ? 0 : low === 'max' ? s.max : Number(low.replace('%', ''));
    if (!raw || !Number.isFinite(v)) return { error: `${s.label} takes a number from ${s.min} to ${s.max}` };
    // 0.25 means 25% for the image dim, like the app's slider
    const n = s.name === 'dim' && v > 0 && v <= 1 && low.includes('.') ? v * 100 : v;
    if (n < s.min || n > s.max) return { error: `${s.label} goes from ${s.min} to ${s.max}`, lines: [`You gave ${raw}`] };
    return { value: Math.round(n) };
  }
  if (s.kind === 'key') {
    const k = parseKey(raw);
    if (!k) return { error: `"${raw}" is not a key combination`, lines: usage(s) };
    if (k.bare) return { error: 'Add Ctrl, Alt, Shift or Win to the key', lines: ['A single key would fire every time you type it'] };
    if (COMMON[k.accel]) return { error: `${k.accel} is already ${COMMON[k.accel]} in Windows and most apps`, lines: ['Pick another combination'] };
    if (showKey(cfg[s.other] || DEFAULT_KEYS[s.other]) === k.accel) return { error: `${k.accel} is already your ${SETTINGS.find((x) => x.key === s.other).label.toLowerCase()}` };
    return { value: k.accel };
  }
  if (s.kind === 'choice') {
    const v = s.alias?.[low] || low;
    if (s.choices.some(([c]) => c === v)) return { value: v };
    const custom = s.custom?.(raw);
    if (custom) return { value: custom };
    const r = lookup(raw, s.choices.map(([c, hint]) => ({ item: c, keys: [c, s.key === 'theme' ? THEMES.find((t) => t.id === c)?.name : ''].filter(Boolean) })));
    if (r.hit) return { value: r.hit };
    const near = r.many || r.near || [];
    return { error: raw ? `"${raw}" is not an option for ${s.label.toLowerCase()}` : `Which ${s.label.toLowerCase()}?`, lines: near.length ? [`Did you mean ${near.map((n) => `"${n}"`).join(' or ')}?`] : usage(s) };
  }
  return { error: 'Not a setting you can change here' };
}

export function applyValue(s, c, v) {
  if (s.set) s.set(c, v);
  else c[s.key] = v;
  return c;
}

// Next/previous value, for the arrow keys in the interactive settings menu.
export function stepValue(s, cfg, dir) {
  const v = valueOf(s, cfg);
  if (s.kind === 'toggle') return !v;
  if (s.kind === 'number') return Math.max(s.min, Math.min(s.max, v + dir * s.step));
  if (s.kind === 'choice') {
    const list = s.choices.map(([c]) => c);
    const i = list.indexOf(v);
    return list[(Math.max(0, i) + dir + list.length) % list.length];
  }
  return v;
}

export const ADJUSTABLE = SETTINGS.filter((s) => ['choice', 'toggle', 'number'].includes(s.kind));
