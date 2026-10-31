// Every CLI command lives here. Each returns { ok, title, lines?, sections?, hint?, ui? } so
// the interactive UI and the one-shot mode can render the same result their own way.
// sections: [{ title, note?, rows: [[cell, …, description]], foot? }] for grouped lists.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import config from '../src/shared/config.cjs';
import brand from '../src/shared/brand.cjs';
import themes from '../src/shared/themes.cjs';
import packs from '../src/shared/packs.cjs';
import widgets from '../src/shared/widgets.cjs';
import share from '../src/shared/share.cjs';
import * as control from './control.mjs';
import { lookup, closest, norm } from './fuzzy.mjs';
import { version } from './mark.mjs';
import { SETTINGS, GROUPS, STYLES, CORNERS, FONTS, DEFAULT_KEYS, showKey, findSetting, shown, valueOf, usage, parseValue, applyValue } from './settings.mjs';
import ai from '../src/main/ai.cjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { THEMES, byId } = themes;
const { PACKS, WALLS, wallById, wallsIn, wallForTheme } = packs;
const { WIDGETS, NOTE_COLORS, byType, make, presetLayout } = widgets;
// /theme keeps its old meaning: the whole look, wallpaper and widget style together
const withTheme = (c, id) => ((c.theme = id), (c.wall = wallForTheme(id, c.planet)), c);
const packOf = (w) => PACKS.find((p) => p.id === w.pack);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ok = (title, lines = [], extra = {}) => ({ ok: true, title, lines, ...extra });
const fail = (title, lines = [], extra = {}) => ({ ok: false, title, lines, ...extra });
const didYouMean = (list) => (list.length ? [`Did you mean ${list.map((x) => `"${x}"`).join(' or ')}?`] : []);

// Saves a change and reminds you to start the wallpaper if it isn't running yet.
async function change(fn) {
  config.update(fn);
  const running = await control.status();
  return running ? {} : { hint: `Saved. ${brand.name} is not running yet, so run /start to see it.` };
}

// Finds a free-ish spot for a new widget so it doesn't land on top of another.
function spot(cfg) {
  const taken = cfg.widgets.filter((w) => w.type !== 'menubar');
  for (const y of [0.3, 0.45, 0.6, 0.15, 0.75]) {
    for (const x of [0.5, 0.71, 0.3, 0.085]) {
      if (!taken.some((w) => Math.abs(w.x - x) < 0.15 && Math.abs(w.y - y) < 0.12)) return [x, y];
    }
  }
  return [0.45, 0.4];
}

// ------------------------------------------------------------------ wallpapers

// A few words on what each wallpaper is. Planet captions come straight from the renderer.
const LOOKS = {
  glass: 'liquid glass that bends the light',
  chrome: 'molten chrome',
  koi: 'koi under ripples that follow your cursor',
  ink: 'ink blooming in water as you move',
  blobs: 'chrome blobs that merge around your cursor',
  bubble: 'a soap bubble with shifting film colors',
  silk: 'satin folds that slowly breathe',
  dunes: 'wind-shaped dunes at golden hour',
  aurora: 'northern lights over the snow',
  galaxy: 'a slowly turning spiral galaxy',
  clay: 'soft matte 3D shapes',
  lava: 'a lava lamp',
  dots: 'a dot-matrix wave',
  neon: 'an endless synthwave drive',
};
const CAPTIONS = (() => {
  const out = { earth: 'the real Earth, day and night', city: 'the Earth, turned to your city', moon: 'tonight’s Moon, in its real phase', earthrise: 'the Earth rising over the Moon' };
  try {
    const src = fs.readFileSync(path.join(ROOT, 'src/renderer/js/gl/astro.js'), 'utf8');
    for (const m of src.matchAll(/^\s*(\w+):\s*\{[^\n]*caption:\s*'[^'·]*·\s*([^']+)'/gm)) out[m[1]] = m[2];
  } catch {}
  return out;
})();
function wallDesc(w) {
  if (w.kind === 'shader') return LOOKS[w.shader] || 'live 3D';
  if (w.kind === 'astro') return CAPTIONS[w.body] || 'from real maps';
  if (w.kind === 'scene') return byId(w.scene)?.tagline || 'a classic scene';
  if (w.custom) return w.kind === 'color' ? 'your own colors (/colors)' : 'your own emoji (/emoji)';
  if (w.kind === 'color') return `${w.style} gradient`;
  if (w.kind === 'emoji') return `${w.text} in ${w.layout === 'rings' ? 'rings' : `a ${w.layout}`}`;
  return '';
}

// a wallpaper by id ("silk-dusk"), name ("prism glass"), or pack + name ("clay graphite")
function findWall(words) {
  return lookup(
    words.join(' '),
    WALLS.map((w) => ({ item: w, keys: [w.id, w.name, `${w.pack} ${w.name}`, `${packOf(w)?.name} ${w.name}`, `${w.name} ${w.pack}`] })),
  );
}
const findPack = (q) => lookup(q, PACKS.map((p) => ({ item: p, keys: [p.id, p.name, p.name.split(/\s*&\s*/)[0]] })));
const wallRow = (w, cur) => [`${w.id === cur ? '●' : '○'} ${w.name}`, w.id, wallDesc(w)];
const packSection = (p, cur) => ({ title: `${p.name} · ${wallsIn(p.id).length}`, note: p.desc, rows: wallsIn(p.id).map((w) => wallRow(w, cur)) });

async function setWall(w) {
  const extra = await change((c) => ((c.wall = w.id), (c.theme = w.skin), c));
  const tip = w.custom ? [`Make it yours with /${w.kind === 'color' ? 'colors' : 'emoji'}`] : w.pack === 'astro' ? ['Click a planet on the wallpaper to zoom'] : [];
  return ok(`Wallpaper set to ${w.name}`, [`${packOf(w)?.name} · ${wallDesc(w)}`, ...tip], extra);
}

// "#ff8800", "ff8800" or "#f80" → [r, g, b] in 0..1, like the gallery's color pickers
function hexColor(s) {
  let h = String(s || '').replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) : null;
}
const toHex = (v) => `#${(v || [0, 0, 0]).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;

// ------------------------------------------------------------------ widgets

const findWidget = (q, list = WIDGETS) => lookup(q, list.map((w) => ({ item: w, keys: [w.type, w.name] })));
const widgetNotFound = (q, r) =>
  fail(q ? `No widget called "${q}"` : 'Which widget?', r.many ? [`Which one: ${r.many.map((w) => w.type).join(', ')}?`] : [...didYouMean((r.near || []).map((w) => w.type)), 'See them all with /widgets'].slice(0, 2));

// every widget except the menu bar and dock, which keep their own look (same as Settings)
const everyWidget = (c, fn) => c.widgets.filter((w) => !['menubar', 'dock'].includes(w.type)).forEach(fn);

// ------------------------------------------------------------------ settings

// Shows, validates and saves one setting from the table in settings.mjs.
async function applySetting(s, words) {
  if (s.kind === 'command') return executeWords([...s.command, ...words]);
  const cfg = config.load();
  if (!words.length) return ok(`${s.label}: ${shown(s, cfg)}`, [s.desc, ...usage(s).map((u) => `  ${u}`)], { hint: `Change it with /set ${s.name} <value>` });
  const r = parseValue(s, words, cfg);
  if (r.error) return fail(r.error, r.lines || usage(s));
  if (valueOf(s, cfg) === r.value) return ok(`${s.label} is already ${shown(s, cfg)}`, [s.desc]);
  const extra = await change((c) => applyValue(s, c, r.value));
  const lines = [s.desc];
  if (s.after) lines.push(s.after);
  if (s.kind === 'key') lines.push(...(await confirmKey(s, r.value)));
  return ok(`${s.label}: ${shown(s, config.load())}`, lines, extra);
}

// The app registers the new shortcut as soon as it sees the change; another app may own it.
async function confirmKey(s, accel) {
  if (!(await control.status())) return [];
  let live = '';
  for (let i = 0; i < 6; i++) {
    await sleep(200);
    const st = await control.status();
    live = showKey(s.key === 'hotkey' ? st?.hotkey : st?.spotlight);
    if (live === accel) return ['Active now'];
  }
  return [`Another app already uses ${accel}, so ${brand.name} is using ${live || 'none'} for now`];
}

const setting = (name) => SETTINGS.find((s) => s.name === name);
// A short command for one setting, e.g. /blur 30 is /set blur 30.
const settingCommand = (name, args, desc, more = {}) => ({
  name,
  args,
  desc,
  group: 'Settings',
  example: `${name} ${setting(more.setting || name).choices?.[1]?.[0] ?? (setting(more.setting || name).kind === 'number' ? '30' : 'on')}`,
  complete: () => (setting(more.setting || name).choices || []).map(([value, d]) => ({ value, desc: d })),
  run: (words) => applySetting(setting(more.setting || name), words),
  ...more,
});

function settingsList() {
  const cfg = config.load();
  const sections = GROUPS.map((g) => ({
    title: g,
    rows: SETTINGS.filter((s) => s.group === g).map((s) => [s.name, shown(s, cfg), s.label === s.desc ? '' : s.desc]),
  }));
  return ok('Settings', [], { sections, hint: 'Change one with /set <setting> <value>, e.g. /set blur 30 · /set accent pink · /set quality high' });
}

// ------------------------------------------------------------------ the commands

export const GROUP_ORDER = ['Start & stop', 'Wallpapers & packs', 'Widgets', 'Settings', 'Share setups', 'Extras', 'Updates', 'Troubleshooting'];

export const COMMANDS = [
  // ---------------------------------------------------------------- start & stop
  {
    name: 'start',
    group: 'Start & stop',
    desc: `Put ${brand.name} on your desktop`,
    async run() {
      const r = await control.start();
      const key = (st) => showKey(st?.hotkey || config.load().hotkey || DEFAULT_KEYS.hotkey);
      if (r.already) return ok('Already on your desktop', [`${r.status.displays} display(s) · press ${key(r.status)} (or /edit) to rearrange`]);
      if (r.started) return ok(`${brand.name} is live on your desktop`, [`Press ${key(r.status)} (or /edit) to drag things around`, 'Look for the tray icon to switch wallpapers or quit']);
      return fail('It did not start in time', [`Check the log with /log, or open ${r.log}`]);
    },
  },
  {
    name: 'stop',
    group: 'Start & stop',
    desc: 'Take it off and restore your normal wallpaper',
    async run() {
      const r = await control.stop();
      if (r.notRunning) return ok('Nothing to stop', [`${brand.name} was not running`]);
      return r.stopped ? ok('Stopped', ['Your normal wallpaper is back']) : fail('It is taking a while to stop', ['Try again in a moment']);
    },
  },
  {
    name: 'restart',
    group: 'Start & stop',
    desc: 'Restart the wallpaper (applies a GPU change)',
    async run() {
      await control.stop();
      const r = await control.start();
      return r.started || r.already ? ok('Restarted', [`${brand.name} is back on your desktop`]) : fail('Could not restart', [`Check the log with /log, or open ${r.log}`]);
    },
  },
  {
    name: 'status',
    group: 'Start & stop',
    desc: 'Is it running, and what is on it?',
    async run() {
      const s = await control.status();
      const cfg = config.load();
      const w = wallById(cfg.wall);
      const row = (label, value) => `${label.padEnd(10)}${value}`;
      const lines = [
        row('running', s ? `yes · ${s.displays} display(s) · ${s.attached.join(', ') || 'window'} mode` : 'no (run /start)'),
        row('wallpaper', w ? `${w.name} · ${packOf(w)?.name}` : cfg.wall),
        row('style', byId(cfg.theme).name),
        row('look', `${shown(setting('appearance'), cfg)} · accent ${shown(setting('accent'), cfg)} · blur ${shown(setting('blur'), cfg)}`),
        row('widgets', [...new Set(cfg.widgets.map((x) => x.type))].join(', ') || 'none'),
        row('city', cfg.city ? `${cfg.city.name}, ${cfg.city.country}` : 'auto (from your network)'),
        row('clock', `${cfg.clock24 ? '24h' : '12h'} · motion ${cfg.motion === false ? 'off' : 'on'} · quality ${cfg.wallQuality || 'auto'}`),
        row('shortcuts', `${showKey(s?.hotkey || cfg.hotkey || DEFAULT_KEYS.hotkey)} rearrange · ${showKey(s?.spotlight || cfg.spotlightHotkey || DEFAULT_KEYS.spotlightHotkey)} Spotlight`),
      ];
      return ok(s ? `${brand.name} is running` : `${brand.name} is stopped`, lines, { hint: 'Every setting: /settings' });
    },
  },
  {
    name: 'edit',
    group: 'Start & stop',
    desc: 'Open the visual editor (drag, resize, type)',
    async run() {
      if (!(await control.status())) {
        const r = await control.start();
        if (!r.started && !r.already) return fail(`Could not start ${brand.name}`, [`Check the log with /log, or open ${r.log}`]);
      }
      await control.openEditor();
      return ok('Editor open on your screen', ['Drag to move · drag the corner to resize · Esc when done']);
    },
  },

  // ---------------------------------------------------------------- wallpapers & packs
  {
    name: 'walls',
    aliases: ['wallpapers', 'packs', 'gallery'],
    args: '[pack]',
    group: 'Wallpapers & packs',
    desc: `List all ${WALLS.length} wallpapers in ${PACKS.length} packs`,
    example: 'walls liquid',
    complete: () => PACKS.map((p) => ({ value: p.id, desc: `${p.name} · ${wallsIn(p.id).length}` })),
    async run(words) {
      const cur = config.load().wall;
      if (words.length) {
        const r = findPack(words.join(' '));
        if (!r.hit) return fail(`No pack called "${words.join(' ')}"`, [...didYouMean((r.many || r.near).map((p) => p.id)), `Packs: ${PACKS.map((p) => p.id).join(', ')}`]);
        return ok(`${r.hit.name} pack`, [], { sections: [packSection(r.hit, cur)], hint: `Set one with /wall <name>, e.g. /wall ${wallsIn(r.hit.id)[0].name.toLowerCase()}` });
      }
      return ok(`${WALLS.length} wallpapers in ${PACKS.length} packs`, [], { sections: PACKS.map((p) => packSection(p, cur)), hint: 'Set one by name or id, e.g. /wall koi pond · one pack: /walls liquid' });
    },
  },
  {
    name: 'wall',
    aliases: ['wallpaper'],
    args: '<name or id>',
    group: 'Wallpapers & packs',
    desc: 'Switch wallpaper by name or id (no name opens a picker)',
    example: 'wall koi pond',
    complete: () => WALLS.map((w) => ({ value: w.id, desc: `${packOf(w)?.name} · ${w.name}` })),
    async run(words) {
      if (!words.length) return { ok: true, ui: 'wall-picker' };
      const q = words.join(' ');
      // a pack's own name shows what's in it
      const pack = PACKS.find((p) => [p.id, p.name].some((k) => norm(k) === norm(q)));
      if (pack) return find('walls').run([pack.id]);
      const r = findWall(words);
      if (r.hit) return setWall(r.hit);
      if (r.many) return fail(`Which "${q}"?`, r.many.slice(0, 8).map((w) => `${w.id.padEnd(18)}${w.name} · ${packOf(w)?.name}`), { hint: `Use the id, e.g. /wall ${r.many[0].id}` });
      return fail(`No wallpaper called "${q}"`, [...didYouMean(r.near.map((w) => w.name.toLowerCase())), 'See every pack with /walls']);
    },
  },
  {
    name: 'theme',
    args: '[name]',
    group: 'Wallpapers & packs',
    desc: 'Switch style and its matching wallpaper (no name opens a picker)',
    example: 'theme paper',
    complete: () => THEMES.map((t) => ({ value: t.id, desc: t.tagline })),
    async run([name]) {
      if (!name) return { ok: true, ui: 'theme-picker' };
      const r = lookup(name, THEMES.map((t) => ({ item: t, keys: [t.id, t.name] })));
      if (!r.hit) return fail(`No theme called "${name}"`, [...didYouMean((r.many || r.near).map((t) => t.id)), `Themes: ${THEMES.map((x) => x.id).join(', ')}`]);
      const extra = await change((c) => withTheme(c, r.hit.id));
      return ok(`Theme set to ${r.hit.name}`, [r.hit.tagline, `Wallpaper: ${wallById(wallForTheme(r.hit.id, config.load().planet))?.name}`], extra);
    },
  },
  {
    name: 'themes',
    aliases: ['styles'],
    group: 'Wallpapers & packs',
    desc: `List the ${THEMES.length} widget styles`,
    async run() {
      const cur = config.load().theme;
      return ok(`${THEMES.length} widget styles`, [], {
        sections: [{ title: 'Styles', rows: THEMES.map((t) => [`${t.id === cur ? '●' : '○'} ${t.name}`, t.id, t.tagline]) }],
        hint: '/theme <name> also switches the wallpaper · /style <name> keeps it · /pack <name> adds its layout',
      });
    },
  },
  {
    ...settingCommand('style', '<name>', 'Change only the widget style, keep the wallpaper'),
    group: 'Wallpapers & packs',
    example: 'style retro',
  },
  {
    name: 'pack',
    args: '<style | pack>',
    group: 'Wallpapers & packs',
    desc: 'Apply a style with its own widget layout, or list a wallpaper pack',
    example: 'pack zen',
    complete: () => [...THEMES.map((t) => ({ value: t.id, desc: `style + layout · ${t.tagline}` })), ...PACKS.map((p) => ({ value: p.id, desc: `wallpaper pack · ${p.name}` }))],
    async run(words) {
      const q = words.join(' ');
      if (!q) return fail('Which pack?', [`Styles (with layout): ${THEMES.map((x) => x.id).join(', ')}`, `Wallpaper packs: ${PACKS.map((p) => p.id).join(', ')}`]);
      const t = lookup(q, THEMES.map((x) => ({ item: x, keys: [x.id, x.name] })));
      if (!t.hit) {
        const p = findPack(q);
        if (p.hit) return find('walls').run([p.hit.id]);
        return fail(`No pack called "${q}"`, didYouMean([...(t.near || []).map((x) => x.id), ...(p.near || []).map((x) => x.id)]));
      }
      const extra = await change((c) => ((c.widgets = presetLayout(t.hit.id)), withTheme(c, t.hit.id)));
      return ok(`${t.hit.name} pack applied`, ['Style, wallpaper and widget layout all switched'], extra);
    },
  },
  {
    name: 'planet',
    args: '<body>',
    group: 'Wallpapers & packs',
    desc: 'Show the Sun, a planet or the Moon from the Astronomy pack',
    example: 'planet saturn',
    complete: () => wallsIn('astro').filter((w) => w.body).map((w) => ({ value: w.body, desc: CAPTIONS[w.body] || '' })),
    async run(words) {
      const bodies = wallsIn('astro').filter((w) => w.body);
      if (!words.length) return fail('Which one?', [bodies.map((w) => w.body).join(', ')]);
      const r = lookup(words.join(' '), bodies.map((w) => ({ item: w, keys: [w.body, w.name, w.id] })));
      if (!r.hit) return fail(`No "${words.join(' ')}" in the Astronomy pack`, [...didYouMean((r.many || r.near).map((w) => w.body)), `Try: ${bodies.map((w) => w.body).join(', ')}`]);
      const extra = await change((c) => {
        c.wall = r.hit.id;
        c.theme = r.hit.skin;
        if (['moon', 'mars', 'earth'].includes(r.hit.body)) c.planet = r.hit.body;
        return c;
      });
      return ok(`Astronomy: ${r.hit.name}`, [wallDesc(r.hit), 'Click it on the wallpaper to zoom'], extra);
    },
  },
  {
    name: 'colors',
    aliases: ['colours', 'gradient'],
    args: '<#hex…> [mesh|linear|radial]',
    group: 'Wallpapers & packs',
    desc: 'Make your own Color wallpaper from up to three colors',
    example: 'colors #ff6b6b #5f9cf5 #ffd166 mesh',
    complete: () => [['mesh', 'soft blended mesh'], ['linear', 'straight gradient'], ['radial', 'from the centre']].map(([value, desc]) => ({ value, desc })),
    async run(words) {
      const styles = ['mesh', 'linear', 'radial'];
      const cur = config.load().wallCustom.color;
      if (!words.length) return ok('Your Colors', [`${['A', 'B', 'C'].map((k) => toHex(cur[k])).join(' ')} · ${cur.style}`], { hint: 'Example: /colors #ff6b6b #5f9cf5 #ffd166 radial' });
      const style = words.find((w) => styles.includes(w.toLowerCase()))?.toLowerCase();
      const rest = words.filter((w) => !styles.includes(w.toLowerCase()));
      const cols = rest.map(hexColor);
      const bad = rest.find((w, i) => !cols[i]);
      if (bad) return fail(`"${bad}" is not a color`, ['Use hex colors like #ff6b6b or #f80, and optionally mesh, linear or radial']);
      if (cols.length > 3) return fail('Up to three colors, please');
      const w = WALLS.find((x) => x.pack === 'color' && x.custom);
      const extra = await change((c) => {
        const o = { ...c.wallCustom.color };
        cols.forEach((v, i) => (o['ABC'[i]] = v));
        if (style) o.style = style;
        c.wallCustom = { ...c.wallCustom, color: o };
        c.wall = w.id;
        c.theme = w.skin;
        return c;
      });
      const now = config.load().wallCustom.color;
      return ok('Your Colors wallpaper is on', [`${['A', 'B', 'C'].map((k) => toHex(now[k])).join(' ')} · ${now.style}`], extra);
    },
  },
  {
    name: 'emoji',
    args: '<emoji> [grid|rings|spiral] [#bg]',
    group: 'Wallpapers & packs',
    desc: 'Make your own Emoji wallpaper',
    example: 'emoji 🌙✨ spiral #141a3a',
    complete: () => [['grid', ''], ['rings', ''], ['spiral', '']].map(([value, desc]) => ({ value, desc })),
    async run(words) {
      const layouts = ['grid', 'rings', 'spiral'];
      const cur = config.load().wallCustom.emoji;
      if (!words.length) return ok('Your Emoji', [`${cur.text} · ${cur.layout} · ${cur.bg}`], { hint: 'Example: /emoji 🌙✨ spiral #141a3a' });
      const layout = words.find((w) => layouts.includes(w.toLowerCase()))?.toLowerCase();
      const bgWord = words.find((w) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(w));
      const text = words.filter((w) => w !== bgWord && !layouts.includes(w.toLowerCase())).join('');
      if ([...text].length > 40) return fail('That is a lot of emoji', ['Keep it to a handful (the gallery allows up to 40 characters)']);
      const w = WALLS.find((x) => x.pack === 'emoji' && x.custom);
      const extra = await change((c) => {
        const o = { ...c.wallCustom.emoji };
        if (text) o.text = text;
        if (layout) o.layout = layout;
        if (bgWord) o.bg = toHex(hexColor(bgWord));
        c.wallCustom = { ...c.wallCustom, emoji: o };
        c.wall = w.id;
        c.theme = w.skin;
        return c;
      });
      const now = config.load().wallCustom.emoji;
      return ok('Your Emoji wallpaper is on', [`${now.text} · ${now.layout} · ${now.bg}`], extra);
    },
  },
  {
    name: 'bg',
    args: '<image path> | none',
    group: 'Wallpapers & packs',
    desc: 'Use your own image as the background',
    example: 'bg "C:/Pictures/beach.jpg"',
    async run(args) {
      const p = args.join(' ').trim().replace(/^["']|["']$/g, '');
      if (!p || p === 'none' || p === 'theme' || p === 'off') {
        const extra = await change((c) => ((c.background = null), c));
        return ok('Back to your wallpaper', ['Your own image is off'], extra);
      }
      const abs = path.resolve(p);
      if (!fs.existsSync(abs)) return fail('That file does not exist', [abs]);
      if (!/\.(jpe?g|png|webp|gif|avif)$/i.test(abs)) return fail('That does not look like an image', ['Use a jpg, png, webp, gif or avif']);
      const extra = await change((c) => ((c.background = abs), c));
      return ok('Background image set', [abs, 'Darken it with /set dim 40'], extra);
    },
  },
  { ...settingCommand('blur', '<0-100>', 'Blur the wallpaper (0 = sharp)'), group: 'Wallpapers & packs', example: 'blur 30', complete: () => [0, 25, 50, 75, 100].map((v) => ({ value: String(v), desc: v ? `${v}%` : 'off' })) },
  { ...settingCommand('sky', '[sky]', 'Force the Live Sky weather (great for reels)'), group: 'Wallpapers & packs', example: 'sky snow' },
  { ...settingCommand('season', '<season | auto | off>', 'Seasonal effects: petals, summer light, leaves or snow'), group: 'Wallpapers & packs', example: 'season autumn' },
  { ...settingCommand('fx', 'auto | off | rain | snow | storm', 'Rain or snow over the desktop (auto = only when it really does)', { setting: 'weather' }), group: 'Wallpapers & packs', example: 'fx auto' },

  // ---------------------------------------------------------------- widgets
  {
    name: 'widgets',
    args: '[list | style | corners | font]',
    group: 'Widgets',
    desc: 'Toggle widgets, see what is on, or restyle them all at once',
    example: 'widgets style glass',
    deep: true,
    complete: (prev) => {
      if (!prev.length) return [['list', 'what is on your wallpaper'], ['style', 'look of every widget'], ['corners', 'corners of every widget'], ['font', 'font of every widget']].map(([value, desc]) => ({ value, desc }));
      const opts = { style: STYLES, corners: CORNERS.map(([k, l]) => [k || 'theme', l]), font: [['theme', 'Theme'], ...FONTS] }[prev[0]];
      return prev.length === 1 && opts ? opts.map(([value, desc]) => ({ value, desc })) : [];
    },
    async run([sub, ...rest]) {
      const cfg = config.load();
      if (!sub) return { ok: true, ui: 'widget-picker' };
      const opts = { style: STYLES, corners: CORNERS.map(([k, l]) => [k || 'theme', l]), font: [['theme', 'Theme'], ...FONTS] }[sub];
      if (opts) {
        const v = rest.join(' ').toLowerCase();
        const pick = opts.find(([k, l]) => k === v || l.toLowerCase() === v);
        if (!pick) return fail(v ? `"${v}" is not a widget ${sub}` : `Which ${sub}?`, [`Choose: ${opts.map(([k]) => k).join(', ')}`]);
        const [k, label] = pick;
        const extra = await change((c) => {
          everyWidget(c, (w) => {
            if (sub === 'style') w.style = k;
            else if (k === 'theme') delete w[sub === 'font' ? 'font' : 'corners'];
            else w[sub === 'font' ? 'font' : 'corners'] = k;
          });
          return c;
        });
        return ok(`Every widget: ${label} ${sub}`, ['The menu bar and dock keep their own look', 'Fine-tune one widget with /edit'], extra);
      }
      if (sub !== 'list') return fail(`Unknown option "${sub}"`, ['Use /widgets, /widgets list, /widgets style <x>, /widgets corners <x> or /widgets font <x>']);
      const count = (type) => cfg.widgets.filter((w) => w.type === type).length;
      const rows = WIDGETS.map((w) => [`${count(w.type) ? '◉' : '○'} ${w.name}`, `${w.type}${count(w.type) > 1 ? ` ×${count(w.type)}` : ''}`, w.desc]);
      const on = WIDGETS.filter((w) => count(w.type)).length;
      return ok(`${on} of ${WIDGETS.length} widgets on your wallpaper`, [], { sections: [{ title: 'Widgets', rows }], hint: '/add <widget> · /remove <widget>, e.g. /add weather' });
    },
  },
  {
    name: 'add',
    args: '<widget>',
    group: 'Widgets',
    desc: 'Add a widget (by type or name)',
    example: 'add now playing',
    complete: () => WIDGETS.map((w) => ({ value: w.type, desc: w.desc })),
    async run(words) {
      const q = words.join(' ');
      const r = findWidget(q);
      if (!r.hit) return widgetNotFound(q, r);
      const meta = r.hit;
      const cfg = config.load();
      if (!meta.multi && cfg.widgets.some((w) => w.type === meta.type)) return ok(`${meta.name} is already on your wallpaper`, [], { hint: 'Move it with /edit' });
      const [x, y] = spot(cfg);
      const extra = await change((c) => (c.widgets.push(make(meta.type, x, y)), c));
      return ok(`Added ${meta.name}`, [meta.desc, 'Use /edit to move it where you like'], extra);
    },
  },
  {
    name: 'remove',
    aliases: ['rm'],
    args: '<widget>',
    group: 'Widgets',
    desc: 'Remove a widget (every copy of it)',
    example: 'remove year',
    complete: () => [...new Set(config.load().widgets.map((w) => w.type))].map((t) => ({ value: t, desc: byType(t)?.desc || '' })),
    async run(words) {
      const q = words.join(' ');
      const cfg = config.load();
      const onScreen = WIDGETS.filter((w) => cfg.widgets.some((x) => x.type === w.type));
      const r = findWidget(q, onScreen);
      if (!r.hit) {
        const any = findWidget(q);
        if (any.hit) return ok(`${any.hit.name} is not on your wallpaper`, [], { hint: `On now: ${onScreen.map((w) => w.type).join(', ') || 'none'}` });
        return widgetNotFound(q, r.many ? r : any);
      }
      const n = cfg.widgets.filter((w) => w.type === r.hit.type).length;
      const extra = await change((c) => ((c.widgets = c.widgets.filter((w) => w.type !== r.hit.type)), c));
      return ok(`Removed ${r.hit.name}${n > 1 ? ` (${n})` : ''}`, ['Bring it back with /add'], extra);
    },
  },
  {
    name: 'note',
    args: '<text> [--pink | --blue | …]',
    group: 'Widgets',
    desc: 'Pin a sticky note to your wallpaper',
    example: 'note ship the reel tonight --pink',
    async run(args) {
      const color = NOTE_COLORS.find((c) => args.includes(`--${c}`)) || null;
      const text = args.filter((a) => !a.startsWith('--')).join(' ').trim();
      if (!text) return fail('What should the note say?', ['Example: /note ship the reel tonight --pink']);
      const cfg = config.load();
      const empty = cfg.widgets.find((w) => w.type === 'note' && !w.text);
      const extra = await change((c) => {
        const target = empty && c.widgets.find((w) => w.id === empty.id);
        if (target) {
          target.text = text;
          if (color) target.color = color;
        } else {
          const n = c.widgets.filter((w) => w.type === 'note').length;
          const [x, y] = spot(c);
          c.widgets.push(make('note', x, y, { text, color: color || NOTE_COLORS[n % NOTE_COLORS.length] }));
        }
        return c;
      });
      return ok('Note pinned', [text], extra);
    },
  },
  {
    name: 'notes',
    args: '[clear]',
    group: 'Widgets',
    desc: 'List your sticky notes, or clear them all',
    async run([sub]) {
      const notes = config.load().widgets.filter((w) => w.type === 'note');
      if (sub === 'clear') {
        const extra = await change((c) => ((c.widgets = c.widgets.filter((w) => w.type !== 'note')), c));
        return ok(`Cleared ${notes.length} note(s)`, [], extra);
      }
      if (!notes.length) return ok('No sticky notes yet', [], { hint: 'Add one with /note <text>' });
      return ok(`${notes.length} sticky note(s)`, notes.map((n, i) => `${i + 1}. [${n.color}] ${n.text || '(empty)'}`));
    },
  },
  {
    name: 'todo',
    args: '<task>',
    group: 'Widgets',
    desc: 'Add a task to your to-do widget (no task lists them)',
    example: 'todo call the bank',
    async run(args) {
      const text = args.join(' ').trim();
      const cfg = config.load();
      const list = cfg.widgets.find((w) => w.type === 'todo');
      if (!text) {
        const items = list?.items || [];
        if (!items.length) return ok('Your list is empty', [], { hint: 'Add one with /todo <task>' });
        return ok(`${list.title || 'Today'}`, items.map((it, i) => `${i + 1}. ${it.done ? '✓' : '·'} ${it.text}`), { hint: 'Tick one off with /done <number>' });
      }
      const extra = await change((c) => {
        let w = c.widgets.find((x) => x.type === 'todo');
        if (!w) {
          const [x, y] = spot(c);
          w = make('todo', x, y);
          c.widgets.push(w);
        }
        w.items = [...(w.items || []), { text, done: false }];
        return c;
      });
      return ok('Task added', [text], extra);
    },
  },
  {
    name: 'done',
    args: '<number>',
    group: 'Widgets',
    desc: 'Tick off a task by its number',
    example: 'done 1',
    async run([n]) {
      const i = Number(n) - 1;
      const list = config.load().widgets.find((w) => w.type === 'todo');
      if (!list?.items?.[i]) return fail(n ? `No task number ${n}` : 'Which task number?', ['See your list with /todo']);
      const extra = await change((c) => {
        const it = c.widgets.find((w) => w.type === 'todo').items[i];
        it.done = !it.done;
        return c;
      });
      return ok(list.items[i].done ? 'Marked as not done' : 'Nice, ticked off', [list.items[i].text], extra);
    },
  },
  {
    name: 'countdown',
    args: '<YYYY-MM-DD> <title>',
    group: 'Widgets',
    desc: 'Count down to a date',
    example: 'countdown 2026-12-31 Launch day',
    async run([date, ...rest]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) return fail('Give me a date like 2026-12-31', ['Example: /countdown 2026-12-31 Launch day']);
      const title = rest.join(' ').trim() || 'Countdown';
      const extra = await change((c) => {
        let w = c.widgets.find((x) => x.type === 'countdown');
        if (!w) {
          const [x, y] = spot(c);
          w = make('countdown', x, y);
          c.widgets.push(w);
        }
        Object.assign(w, { date, title });
        return c;
      });
      const days = Math.ceil((new Date(`${date}T00:00:00`) - Date.now()) / 86400000);
      return ok(`Counting down to ${title}`, [days >= 0 ? `${days} day(s) to go` : `That was ${-days} day(s) ago`], extra);
    },
  },
  {
    name: 'quote',
    args: '<text> [-- author] | auto',
    group: 'Widgets',
    desc: 'Pin your own quote (auto = quote of the day)',
    example: 'quote Stay hungry -- Steve Jobs',
    async run(args) {
      const raw = args.join(' ').trim();
      const auto = !raw || raw === 'auto';
      const [text, author = ''] = auto ? ['', ''] : raw.split(/\s+--\s+/);
      const extra = await change((c) => {
        let w = c.widgets.find((x) => x.type === 'quote');
        if (!w) {
          const [x, y] = spot(c);
          w = make('quote', x, y);
          c.widgets.push(w);
        }
        Object.assign(w, { text, author });
        return c;
      });
      return ok(auto ? 'Showing the quote of the day' : 'Quote pinned', auto ? ['A fresh quote arrives every day'] : [`“${text}”${author ? ` — ${author}` : ''}`], extra);
    },
  },
  {
    name: 'stocks',
    args: 'add | remove | list [SYMBOL]',
    group: 'Widgets',
    desc: 'Your Stocks watchlist (Yahoo symbols: ^NSEI, TCS.NS, AAPL)',
    example: 'stocks add AAPL',
    complete: () => ['add', 'remove', 'list'].map((v) => ({ value: v, desc: '' })),
    async run([sub, sym]) {
      const cfg = config.load();
      const w = cfg.widgets.find((x) => x.type === 'stocks');
      const list = w?.symbols || [];
      if (!sub || sub === 'list') return w ? ok('Watchlist', list.length ? list : ['(empty)'], { hint: 'Add with /stocks add <SYMBOL>' }) : ok('No Stocks widget yet', [], { hint: 'Add one with /add stocks' });
      if (sub !== 'add' && sub !== 'remove') return fail(`Use /stocks add, remove or list`);
      const s = String(sym || '').toUpperCase();
      if (!s) return fail(`Which symbol? e.g. /stocks ${sub} RELIANCE.NS`);
      if (sub === 'remove' && !list.includes(s)) return fail(`${s} is not on your watchlist`, [list.join(', ') || '(empty)']);
      if (sub === 'add' && list.length >= 8 && !list.includes(s)) return fail('Your watchlist is full (8 symbols)', ['Remove one first with /stocks remove <SYMBOL>']);
      const extra = await change((c) => {
        let x = c.widgets.find((y) => y.type === 'stocks');
        if (!x) {
          const [px, py] = spot(c);
          x = make('stocks', px, py);
          c.widgets.push(x);
        }
        x.symbols = sub === 'remove' ? (x.symbols || []).filter((y) => y !== s) : [...new Set([...(x.symbols || []), s])].slice(0, 8);
        return c;
      });
      return ok(sub === 'remove' ? `Removed ${s}` : `Watching ${s}`, [], extra);
    },
  },
  {
    name: 'dock',
    args: 'add | remove | reset | list',
    group: 'Widgets',
    desc: 'Choose the apps in your dock',
    example: 'dock add "C:/Program Files/App/app.exe"',
    complete: () => ['add', 'remove', 'reset', 'list'].map((v) => ({ value: v, desc: '' })),
    async run([sub = 'list', ...rest]) {
      const cfg = config.load();
      const list = Array.isArray(cfg.dock) ? cfg.dock : null;
      const arg = rest.join(' ').trim().replace(/^["']|["']$/g, '');
      if (sub === 'add') {
        if (!arg) return fail('Usage: /dock add <path to an app, file or folder>');
        const abs = /^[a-z][a-z0-9+.-]*:$/i.test(arg) ? arg : path.resolve(arg);
        if (!abs.endsWith(':') && !fs.existsSync(abs)) return fail('That path does not exist', [abs]);
        const name = path.basename(abs).replace(/\.(exe|lnk)$/i, '');
        const extra = await change((c) => ((c.dock = [...(c.dock || []), { name, target: abs }]), c));
        return ok(`Added ${name} to the dock`, list ? [] : ['Your dock now uses your own list (/dock reset goes back to auto)'], extra);
      }
      if (sub === 'remove') {
        if (!list) return fail('Your dock is automatic', ['Add an app first with /dock add <path>, or /dock reset']);
        const hit = list.find((a) => a.name.toLowerCase() === arg.toLowerCase());
        if (!hit) return fail(`No "${arg}" in your dock`, [...didYouMean(closest(arg, list.map((a) => a.name))), `In your dock: ${list.map((a) => a.name).join(', ')}`]);
        const extra = await change((c) => ((c.dock = c.dock.filter((a) => a !== hit && a.name !== hit.name)), c));
        return ok(`Removed ${hit.name}`, [], extra);
      }
      if (sub === 'reset') {
        const extra = await change((c) => ((c.dock = null), c));
        return ok('Dock is automatic again', ['It shows the apps it finds on your PC'], extra);
      }
      if (sub !== 'list') return fail(`Use /dock add, remove, reset or list`);
      return ok('Dock', list ? list.map((a) => `${a.name.padEnd(14)} ${a.target}`) : ['automatic: Files, your browser, VS Code, Spotify, Notepad, Calculator, Settings (whichever you have)']);
    },
  },
  {
    name: 'github',
    args: '<username> | auto | off',
    group: 'Widgets',
    desc: 'Use your GitHub contribution graph (auto-detected by default)',
    example: 'github octocat',
    async run([user]) {
      if (!user) {
        const cur = config.load().github;
        return ok('GitHub graph', [cur === 'off' ? 'off (local git only)' : cur ? `@${cur}` : 'auto (detected from gh or your repo remotes)'], { hint: 'Change it with /github <username>, auto or off' });
      }
      const value = user === 'auto' ? null : user === 'off' ? 'off' : user.replace(/^@/, '');
      if (value && value !== 'off') {
        const res = await fetch(`https://github.com/users/${encodeURIComponent(value)}/contributions`, { headers: { 'user-agent': 'Mozilla/5.0' } }).catch(() => null);
        if (!res?.ok) return fail(`Could not load @${value}'s contributions`, ['Check the username and your internet connection']);
      }
      const extra = await change((c) => ((c.github = value), c));
      await control.reload();
      return ok(value === 'off' ? 'Using local git history only' : value ? `Showing @${value}'s GitHub contributions` : 'GitHub user will be auto-detected', [], extra);
    },
  },
  {
    name: 'repo',
    args: 'add | scan | list [path]',
    group: 'Widgets',
    desc: 'Choose which git repos feed the commit graph',
    example: 'repo scan ~/code',
    complete: () => [{ value: 'add', desc: 'add one repo' }, { value: 'scan', desc: 'scan a folder for repos' }, { value: 'list', desc: 'show settings' }],
    async run([sub, ...rest]) {
      const cfg = config.load();
      const p = rest.join(' ').trim().replace(/^["']|["']$/g, '');
      if (sub === 'add' || sub === 'scan') {
        if (!p) return fail(`Usage: /repo ${sub} <path>`);
        const abs = path.resolve(p);
        if (!fs.existsSync(abs)) return fail('That folder does not exist', [abs]);
        if (sub === 'add' && !fs.existsSync(path.join(abs, '.git'))) return fail('That folder is not a git repo', [abs, 'To find every repo inside it, use /repo scan']);
        const extra = await change((c) => {
          c.repos = c.repos || { roots: [], extra: [] };
          const key = sub === 'add' ? 'extra' : 'roots';
          c.repos[key] = [...new Set([...(c.repos[key] || []), abs])];
          return c;
        });
        await control.reload();
        return ok(sub === 'add' ? 'Repo added' : 'Folder will be scanned', [abs], extra);
      }
      if (sub && sub !== 'list') return fail('Use /repo add <path>, /repo scan <folder> or /repo list');
      const roots = cfg.repos?.roots?.length ? cfg.repos.roots : ['(default: Desktop, Documents, code, projects, dev, …)'];
      return ok('Commit graph sources', [...roots.map((r) => `scan  ${r}`), ...(cfg.repos?.extra || []).map((r) => `repo  ${r}`)]);
    },
  },
  {
    name: 'city',
    args: '<name> | auto',
    group: 'Widgets',
    desc: 'Set your city for weather and sunrise (auto = detect)',
    example: 'city Mumbai',
    async run(args) {
      const name = args.join(' ').trim();
      if (!name || name === 'auto') {
        const extra = await change((c) => ((c.city = null), c));
        return ok('Weather will follow your location', ['Detected from your network each time'], extra);
      }
      let res;
      try {
        res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name)}`).then((r) => r.json());
      } catch {
        return fail('Could not reach the weather service', ['Check your internet connection']);
      }
      const r = res.results?.[0];
      if (!r) return fail(`Could not find "${name}"`, ['Check the spelling, or try a bigger city nearby']);
      const city = { name: r.name, country: r.country_code || '', lat: r.latitude, lon: r.longitude };
      const extra = await change((c) => ((c.city = city), c));
      return ok(`Weather set to ${city.name}, ${city.country}`, [`${r.admin1 ? r.admin1 + ' · ' : ''}${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}`], extra);
    },
  },
  {
    name: 'reset',
    group: 'Widgets',
    desc: 'Reset the widget layout to the current style',
    async run() {
      const cfg = config.load();
      const extra = await change((c) => ((c.widgets = presetLayout(c.theme)), c));
      return ok(`Layout reset to the ${byId(cfg.theme).name} layout`, ['Widgets are back where this style puts them'], extra);
    },
  },

  // ---------------------------------------------------------------- settings
  {
    name: 'settings',
    aliases: ['prefs', 'preferences', 'options'],
    args: '[list]',
    group: 'Settings',
    desc: 'See every setting and its current value',
    async run([sub]) {
      const res = settingsList();
      // the interactive shell opens a menu; one-shot mode and /settings list print the table
      return sub === 'list' ? res : { ...res, ui: 'settings-picker' };
    },
  },
  {
    name: 'set',
    args: '<setting> <value>',
    group: 'Settings',
    desc: 'Change any setting (see /settings)',
    example: 'set quality high',
    deep: true,
    complete: (prev) => {
      if (!prev.length) return SETTINGS.map((s) => ({ value: s.name, desc: s.label }));
      const s = prev.length === 1 && findSetting(prev[0]).hit;
      return s?.choices ? s.choices.map(([value, desc]) => ({ value, desc })) : [];
    },
    async run([name, ...value]) {
      if (!name) return settingsList();
      const r = findSetting(name);
      if (!r.hit) return fail(`No setting called "${name}"`, [...didYouMean((r.many || r.near).map((s) => s.name)), 'See them all with /settings']);
      return applySetting(r.hit, value);
    },
  },
  settingCommand('accent', '<color | #hex | song | theme>', 'Accent color for the clock, rings and graph', { example: 'accent pink' }),
  settingCommand('appearance', 'sun | light | dark | auto', 'Day & night: sun follows sunset, auto follows Windows'),
  settingCommand('quality', 'auto | low | balanced | high', 'How sharp the live wallpapers render'),
  settingCommand('motion', 'on | off', 'Turn animations on or off (saves battery)'),
  settingCommand('clock', '12 | 24', '12 or 24 hour clock'),
  settingCommand('autostart', 'on | off', `Start ${brand.name} when you log in`),
  settingCommand('pet', 'cat | bird | off', 'A tiny pet that walks along your dock'),
  {
    name: 'name',
    args: '<your name>',
    group: 'Settings',
    desc: 'The name in your greeting ("" = your account name)',
    example: 'name Sam',
    async run(args) {
      if (!args.length) return applySetting(setting('name'), []);
      const name = args.join(' ').trim();
      const extra = await change((c) => ((c.name = name), c));
      return ok(name ? `Hi ${name}` : 'Using your computer account name', ['Shown in the clock greeting'], extra);
    },
  },
  {
    name: 'config',
    group: 'Settings',
    desc: 'Show where your settings file lives',
    async run() {
      return ok('Your settings file', [config.FILE, 'Edit it by hand if you like. The wallpaper reloads instantly.']);
    },
  },

  // ---------------------------------------------------------------- share setups
  {
    name: 'export',
    aliases: ['share'],
    args: '[--show] [--file <path>]',
    group: 'Share setups',
    desc: 'Pack your whole look into one code you can send a friend',
    example: 'export --show',
    complete: () => [
      { value: '--show', desc: 'print the exact JSON that would be shared' },
      { value: '--file', desc: 'write it to a .json file instead' },
    ],
    async run(words) {
      const show = words.includes('--show') || words.includes('-s');
      const at = words.findIndex((w) => w === '--file' || w === '-f');
      const where = at >= 0 ? words.slice(at + 1).filter((w) => !w.startsWith('-')).join(' ').trim().replace(/^["']|["']$/g, '') : '';
      if (at >= 0 && !where) return fail('Which file should I write?', ['Example: /export --file my-setup.json']);
      const payload = share.buildPayload(config.load());
      const code = share.encode(payload);
      const never = ['Never shared:', ...share.STRIPPED.map((s) => `  · ${s}`)];
      if (show) return ok('Exactly what would be shared', [...share.readable(payload).split('\n'), '', ...never], { hint: 'Happy with it? /export gives you the code' });
      if (where) {
        const abs = path.resolve(where.endsWith('.json') ? where : `${where}.json`);
        try {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, `${share.readable(payload)}\n`);
        } catch (e) {
          return fail('Could not write that file', [abs, String(e.message || e)]);
        }
        return ok('Your setup is in a file', [abs, ...share.summary(payload), '', ...never], { hint: `Send it over — your friend runs /import ${path.basename(abs)}` });
      }
      return ok('Your setup, in one code', [code, '', ...share.summary(payload)], { hint: `Send this to a friend: they run /import <code> and their desktop looks like yours. See it first with /export --show` });
    },
  },
  {
    name: 'import',
    aliases: ['setup'],
    args: '<code | file> [--look-only | --widgets-only]',
    group: 'Share setups',
    desc: 'Wear a setup someone shared (your notes and details stay yours)',
    example: `import ${share.PREFIX}eJyrVgrLz1ey…`,
    complete: () => [
      { value: '--look-only', desc: 'wallpaper and style, keep your widgets' },
      { value: '--widgets-only', desc: 'the widget layout, keep your wallpaper' },
    ],
    async run(words) {
      const flags = words.filter((w) => w.startsWith('-'));
      const odd = flags.find((f) => !['--look-only', '--look', '--widgets-only', '--widgets'].includes(f));
      if (odd) return fail(`Unknown option "${odd}"`, ['Use --look-only (wallpaper and style) or --widgets-only (the layout)']);
      const lookOnly = flags.some((f) => f.startsWith('--look'));
      const widgetsOnly = flags.some((f) => f.startsWith('--widgets'));
      if (lookOnly && widgetsOnly) return fail('Pick one', ['--look-only or --widgets-only, not both']);
      const arg = words.filter((w) => !w.startsWith('-')).join(' ').trim().replace(/^["']|["']$/g, '');
      if (!arg) return fail('Paste the code, or point me at the file', [`Example: /import ${share.PREFIX}eJyrVgrLz1ey…`, 'Or: /import my-setup.json', 'Make your own with /export']);

      const looksLikeCode = arg.toUpperCase().startsWith(share.PREFIX);
      const abs = path.resolve(arg);
      let isFile = false;
      try {
        isFile = !looksLikeCode && fs.statSync(abs).isFile();
      } catch {}
      let r;
      if (isFile) {
        if (fs.statSync(abs).size > 1024 * 1024) return fail('That file is far too big to be a setup', [abs, 'A shared setup is a few kilobytes at most']);
        try {
          r = share.parseText(fs.readFileSync(abs, 'utf8'));
        } catch (e) {
          return fail('Could not read that file', [abs, String(e.message || e)]);
        }
      } else if (!looksLikeCode && /[\\/]|\.json$/i.test(arg)) {
        return fail('No file there', [abs, 'Give the path to a .json a friend sent you, or paste their code']);
      } else {
        r = share.decode(arg);
      }
      if (!r.ok) return fail(r.error, [...r.lines, ...(isFile ? [abs] : [])], { hint: 'Nothing was changed' });

      const all = share.summary(r.payload);
      const preview = widgetsOnly ? all.slice(2) : lookOnly ? all.slice(0, 2) : all;
      const extra = await change((c) => (share.apply(c, r.payload, { lookOnly, widgetsOnly }), c));
      const kept = widgetsOnly ? 'Your wallpaper and style stayed as they were.' : 'Your name, city, GitHub, dock, notes and to-dos are untouched.';
      return ok(lookOnly ? 'Their look is on' : widgetsOnly ? 'Their layout is on' : 'Setup imported', [...preview, '', kept], extra);
    },
  },

  // ---------------------------------------------------------------- extras
  {
    name: 'player',
    group: 'Extras',
    desc: 'Open the full-screen Now Playing view',
    async run() {
      if (!(await control.status())) return fail(`${brand.name} is not running`, ['Run /start first']);
      const r = await control.call('/player');
      const m = r?.media;
      return ok('Now Playing is open', [m?.active ? `${m.title}${m.artist ? ` — ${m.artist}` : ''} · ${m.appName}` : 'Nothing is playing right now']);
    },
  },
  {
    name: 'spotlight',
    group: 'Extras',
    desc: 'Open Spotlight search (apps, files, settings, math, web)',
    async run() {
      if (!(await control.status())) return fail(`${brand.name} is not running`, ['Run /start first']);
      await control.call('/spotlight');
      const s = await control.status();
      return ok('Spotlight is open', [`Shortcut: ${showKey(s?.spotlight || config.load().spotlightHotkey || DEFAULT_KEYS.spotlightHotkey)} · change it with /set spotlight-key`]);
    },
  },
  {
    name: 'wrapped',
    group: 'Extras',
    desc: 'Your week: top songs, commits, active time and apps',
    async run() {
      if (!(await control.status())) return fail(`${brand.name} is not running`, ['Run /start first']);
      await control.call('/wrapped');
      return ok('Wrapped is open on your desktop', ['Share saves a PNG to Pictures and copies it']);
    },
  },
  {
    name: 'ai',
    args: '<question> | model | models',
    group: 'Extras',
    desc: 'Ask the local AI, or let it organize your notes and to-dos',
    example: 'ai sort my to-dos by priority',
    async run(args) {
      const [sub, ...rest] = args;
      const current = () => config.load().ai?.model || ai.DEFAULT_MODEL;
      if (sub === 'models') {
        const list = await ai.models();
        if (!list) return fail('Ollama is not installed', ['Get it from https://ollama.com, then: ollama pull llama3.1:8b']);
        if (!list.length) return fail('No models downloaded yet', ['Run: ollama pull llama3.1:8b']);
        return ok('Local models', list.map((m) => `${m === current() ? '●' : '○'} ${m}`), { hint: 'Switch with /ai model <name>' });
      }
      if (sub === 'model') {
        const id = rest[0];
        if (!id) return ok(`Model: ${current()}`, [], { hint: 'See what you have with /ai models' });
        const extra = await change((c) => ((c.ai = { ...(c.ai || {}), model: id }), c));
        return ok(`Model set to ${id}`, [], extra);
      }
      const q = args.join(' ').trim();
      if (!q) return ok('Ask AI (runs locally with Ollama)', [`Model: ${current()}`, 'Try: /ai sort my to-dos by priority', 'Or in Spotlight: ask plan my evening']);
      const r = await ai.ask(q);
      return r.ok ? ok(r.reply, (r.done || []).map((d) => `✓ ${d}`)) : fail(r.reply);
    },
  },
  {
    name: 'taskbar',
    args: 'hide | show',
    group: 'Extras',
    desc: 'Auto-hide the system taskbar (Ubuntu: the dock) so your own dock takes over',
    complete: () => [{ value: 'hide', desc: 'auto-hide' }, { value: 'show', desc: 'always show' }],
    async run([v]) {
      if (v !== 'hide' && v !== 'show') return fail('Use /taskbar hide or /taskbar show');
      const s = await control.status();
      if (!s) return fail(`${brand.name} is not running`, ['Run /start first']);
      await control.call(`/taskbar-${v}`);
      return ok(v === 'hide' ? 'The taskbar auto-hides now' : 'The taskbar is always visible', v === 'hide' ? ['Move the mouse to the bottom edge to bring it back'] : []);
    },
  },
  {
    name: 'shortcuts',
    group: 'Extras',
    desc: 'Linux (GNOME): add Alt+W and Ctrl+Space as system shortcuts',
    async run() {
      if (process.platform !== 'linux') return ok('Shortcuts already work here', ['Change them with /set hotkey <keys> and /set spotlight-key <keys>']);
      const linux = require('../src/main/linux.cjs');
      const cli = `"${process.execPath}" "${path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.mjs')}"`;
      const done = linux.installShortcuts(cli, { edit: '<Alt>w', spotlight: '<Control>space' });
      return done ? ok('Added to GNOME keyboard shortcuts', ['Alt+W  rearrange', 'Ctrl+Space  Spotlight', 'Change them in Settings → Keyboard → Custom Shortcuts']) : fail('GNOME settings not found', [`Add shortcuts in your desktop settings that run: ${brand.command} edit / ${brand.command} spotlight`]);
    },
  },

  // ---------------------------------------------------------------- updates
  {
    name: 'update',
    args: '[now]',
    group: 'Updates',
    desc: 'Check for a new version (now = download and install it)',
    example: 'update now',
    complete: () => [{ value: 'now', desc: 'download and install' }],
    async run([sub]) {
      const running = await control.status();
      const updater = require('../src/main/updater.cjs');
      if (sub === 'now' || sub === 'install') {
        // the running app pulls, then restarts itself into the new version
        const r = running ? await control.call('/update-apply', 15 * 60 * 1000) : await updater.apply();
        if (!r?.ok) return fail('Could not update', [r?.reason || `${brand.name} did not answer. Try /restart, then /update now`]);
        return ok(`Updated ${r.from} → ${r.to}`, [running ? `${brand.name} is restarting with the new version` : 'Run /start to use it']);
      }
      if (sub) return fail(`Use /update to check, or /update now to install`);
      const st = running ? await control.call('/update-check', 2 * 60 * 1000) : await updater.check();
      if (!st) return fail('Could not check for updates', [`${brand.name} did not answer. Try again in a moment`]);
      if (st.error === 'not-a-clone') return ok('This copy updates by hand', ['It was not cloned with git, so download the new version yourself']);
      if (st.error === 'offline') return fail('Could not check for updates', ['Check your internet connection']);
      if (!st.available) return ok('You are up to date', [`${brand.name} ${version() ? `v${version()}` : ''}`.trim()]);
      const rel = st.release || {};
      return ok(`Update available${rel.version ? `: v${rel.version}` : ''}`, [rel.title || 'Bug fixes and improvements', ...(rel.notes || []).map((n) => `• ${n}`)], { hint: 'Install it with /update now' });
    },
  },
  {
    name: 'version',
    aliases: ['whatsnew', 'changelog', '--version', '-v'],
    group: 'Updates',
    desc: 'Which version you have and what is new in it',
    async run() {
      let rel = {};
      try {
        rel = JSON.parse(fs.readFileSync(path.join(ROOT, 'release.json'), 'utf8'));
      } catch {}
      const v = version();
      return ok(`${brand.name}${v ? ` v${v}` : ''}`, [...(rel.title ? [rel.title] : []), ...(rel.notes || []).map((n) => `• ${n}`)], { hint: 'Check for a newer one with /update' });
    },
  },

  // ---------------------------------------------------------------- troubleshooting
  {
    name: 'doctor',
    group: 'Troubleshooting',
    desc: `Check this computer: which ${brand.name} features will work here`,
    async run() {
      const { execFileSync } = await import('child_process');
      const has = (bin) => {
        try {
          execFileSync(process.platform === 'win32' ? 'where' : 'sh', process.platform === 'win32' ? [bin] : ['-c', `command -v ${bin}`], { stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      };
      const line = (okay, what, why) => `${okay ? '✓' : '·'} ${what}${okay ? '' : `  (${why})`}`;
      const running = await control.status();
      const lines = [`Node ${process.versions.node} · ${process.platform}`, running ? `✓ ${brand.name} is running` : `· ${brand.name} is not running (run /start)`];
      if (process.platform === 'linux') {
        const session = process.env.XDG_SESSION_TYPE || 'unknown';
        const desk = process.env.XDG_CURRENT_DESKTOP || 'unknown';
        lines.push(`Desktop: ${desk} · session: ${session}${session === 'wayland' ? ' (runs through XWayland)' : ''}`);
        lines.push(
          line(has('gdbus'), 'Now Playing + brightness (D-Bus)', 'needs gdbus, part of GLib'),
          line(has('wpctl') || has('pactl'), 'Volume', 'needs PipeWire (wpctl) or PulseAudio (pactl)'),
          line(has('pactl'), 'Sound output picker', 'needs pactl'),
          line(has('nmcli'), 'Wi-Fi list and connect', 'needs NetworkManager (nmcli)'),
          line(has('gsettings'), 'Dark mode, dock auto-hide, shortcuts', 'GNOME only'),
          line(has('powerprofilesctl'), 'Power mode', 'needs power-profiles-daemon'),
          line(has('loginctl'), 'Lock screen', 'needs systemd'),
          line(has('gtk-launch'), 'Dock and Spotlight app launching', 'falls back to running the app directly'),
          line(has('git'), 'Updates', 'needs git'),
          line(has('ollama'), 'Assistant (local AI)', 'optional: install Ollama yourself if you want it'),
        );
        if (session === 'wayland') lines.push('Tip: run /shortcuts once so Alt+W and Ctrl+Space work on Wayland');
      } else {
        lines.push(line(has('git'), 'Updates', 'needs git'), line(has('ollama'), 'Assistant (local AI)', 'optional: install Ollama'));
      }
      return ok(`${brand.name} check-up`, lines, { hint: 'Something odd? See the last log lines with /log' });
    },
  },
  {
    name: 'log',
    aliases: ['logs'],
    args: '[lines]',
    group: 'Troubleshooting',
    desc: 'Show the end of the app log',
    example: 'log 40',
    async run([n]) {
      const file = path.join(config.DIR, 'app.log');
      if (!fs.existsSync(file)) return ok('No log yet', [`It appears after the first /start: ${file}`]);
      const count = Math.max(1, Math.min(200, Number(n) || 15));
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-count);
      return ok(`Last ${lines.length} log line(s)`, lines.length ? lines : ['(empty)'], { hint: file });
    },
  },
  {
    name: 'help',
    aliases: ['?', '--help', '-h'],
    args: '[command]',
    group: 'Troubleshooting',
    desc: 'Show all commands, or how to use one',
    example: 'help wall',
    complete: () => COMMANDS.map((c) => ({ value: c.name, desc: c.desc })),
    async run([name]) {
      if (name) {
        const c = find(name);
        if (!c) return fail(`No command called "${name}"`, [...didYouMean(suggestCommands(name)), 'See them all with /help']);
        return ok(`/${c.name}${c.args ? ` ${c.args}` : ''}`, [c.desc, ...(c.example ? [`Example: /${c.example}`] : []), ...(c.aliases?.filter((a) => !a.startsWith('-')).length ? [`Also: ${c.aliases.filter((a) => !a.startsWith('-')).map((a) => `/${a}`).join(', ')}`] : [])]);
      }
      const sections = GROUP_ORDER.map((g) => {
        const list = COMMANDS.filter((c) => c.group === g);
        const examples = list.filter((c) => c.example).slice(0, 3).map((c) => `/${c.example}`);
        return { title: g, rows: list.map((c) => [`${c.name}${c.args ? ` ${c.args}` : ''}`, c.desc]), foot: examples.length ? `e.g. ${examples.join(' · ')}` : '' };
      });
      return ok('Commands', [], { sections, hint: 'More on one command: /help <command>' });
    },
  },
  {
    name: 'exit',
    aliases: ['q'],
    group: 'Troubleshooting',
    desc: 'Leave the CLI (the wallpaper keeps running)',
    async run() {
      return { ok: true, ui: 'exit' };
    },
  },
];

export const find = (name) => {
  const n = String(name || '').replace(/^\//, '').toLowerCase();
  return COMMANDS.find((c) => c.name === n) || COMMANDS.find((c) => c.aliases?.includes(n));
};

// the nearest command names to a typo
export const suggestCommands = (word) => closest(word.replace(/^\//, ''), COMMANDS.flatMap((c) => [c.name, ...(c.aliases || []).filter((a) => /^\w/.test(a))]))
  .map((n) => find(n).name)
  .filter((n, i, a) => a.indexOf(n) === i);

// Splits an input line into words, keeping "quoted strings" together.
export function parse(line) {
  const words = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) words.push(m[1] ?? m[2] ?? m[3]);
  return words;
}

export function execute(line) {
  return executeWords(parse(line.trim()));
}

export async function executeWords([head, ...args]) {
  if (!head) return null;
  const cmd = find(head);
  if (!cmd) {
    const bare = head.replace(/^\//, '');
    // "/paper" alone is a theme switch, "/koi-pond" alone a wallpaper switch
    const t = byId(bare);
    if (t && !args.length) return find('theme').run([t.id]);
    const w = wallById(bare);
    if (w && !args.length) return setWall(w);
    const near = suggestCommands(bare);
    return fail(`Unknown command "${head}"`, [...didYouMean(near.map((n) => `/${n}`)), 'Type /help to see everything']);
  }
  try {
    return await cmd.run(args);
  } catch (e) {
    return fail(`/${cmd.name} failed`, [String(e.message || e)]);
  }
}

export { THEMES, WIDGETS, PACKS, WALLS, brand, byId, config, wallDesc, setWall };
