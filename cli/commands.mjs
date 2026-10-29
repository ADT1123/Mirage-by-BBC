// Every CLI command lives here. Each returns { ok, title, lines?, hint?, ui? } so the
// interactive UI and the one-shot mode can render the same result their own way.

import fs from 'fs';
import path from 'path';
import config from '../src/shared/config.cjs';
import brand from '../src/shared/brand.cjs';
import themes from '../src/shared/themes.cjs';
import packs from '../src/shared/packs.cjs';
import widgets from '../src/shared/widgets.cjs';
import * as control from './control.mjs';
import ai from '../src/main/ai.cjs';

const { THEMES, byId } = themes;
const { PACKS, WALLS, wallById, wallsIn, wallForTheme } = packs;
// /theme keeps its old meaning: the whole look, wallpaper and widget style together
const withTheme = (c, id) => ((c.theme = id), (c.wall = wallForTheme(id, c.planet)), c);
// a wallpaper by id ("silk-dusk") or by name ("silk dusk", "Prism Glass")
const findWall = (words) => {
  const q = words.join(' ').toLowerCase().trim();
  return wallById(q.replace(/\s+/g, '-')) || WALLS.find((w) => w.name.toLowerCase() === q || `${w.pack} ${w.name}`.toLowerCase() === q);
};
const { WIDGETS, NOTE_COLORS, byType, make, presetLayout } = widgets;

const SKIES = ['auto', 'clear', 'partly', 'cloudy', 'rain', 'snow', 'storm', 'fog'];
const ok = (title, lines = [], extra = {}) => ({ ok: true, title, lines, ...extra });
const fail = (title, lines = [], extra = {}) => ({ ok: false, title, lines, ...extra });

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

function themeLine(t, current) {
  return `${t.id === current ? '●' : '○'} ${t.name.padEnd(10)} ${t.tagline}`;
}

export const COMMANDS = [
  {
    name: 'start',
    desc: `Put ${brand.name} on your desktop`,
    async run() {
      const r = await control.start();
      if (r.already) return ok('Already on your desktop', [`${r.status.displays} display(s) · press Ctrl+Alt+E to edit`]);
      if (r.started) {
        const key = (r.status.hotkey || 'Ctrl+Alt+E').replace('CommandOrControl', 'Ctrl');
        return ok(`${brand.name} is live on your desktop`, [`Press ${key} (or /edit) to drag things around`, 'Look for the tray icon to switch themes or quit']);
      }
      return fail('It did not start in time', [`Check the log: ${r.log}`]);
    },
  },
  {
    name: 'stop',
    desc: 'Take it off and restore your normal wallpaper',
    async run() {
      const r = await control.stop();
      if (r.notRunning) return ok('Nothing to stop', [`${brand.name} was not running`]);
      return r.stopped ? ok('Stopped', ['Your normal wallpaper is back']) : fail('It is taking a while to stop');
    },
  },
  {
    name: 'restart',
    desc: 'Restart the wallpaper',
    async run() {
      await control.stop();
      const r = await control.start();
      return r.started || r.already ? ok('Restarted') : fail('Could not restart', [`Check the log: ${r.log}`]);
    },
  },
  {
    name: 'status',
    desc: 'Is it running, and what is on it?',
    async run() {
      const s = await control.status();
      const cfg = config.load();
      const t = byId(cfg.theme);
      const lines = [
        `wallpaper ${wallById(cfg.wall)?.name || cfg.wall}`,
        `style     ${t.name}`,
        `widgets   ${cfg.widgets.map((w) => w.type).join(', ') || 'none'}`,
        `city      ${cfg.city ? `${cfg.city.name}, ${cfg.city.country}` : 'auto (from your network)'}`,
        `clock     ${cfg.clock24 ? '24h' : '12h'} · motion ${cfg.motion === false ? 'off' : 'on'}`,
      ];
      if (s) lines.unshift(`running   yes · ${s.displays} display(s) · ${s.attached.join(', ') || 'window'} mode`);
      if (s?.hotkey) lines.splice(1, 0, `edit key  ${s.hotkey.replace('CommandOrControl', 'Ctrl')}`);
      else lines.unshift('running   no (run /start)');
      return ok(s ? `${brand.name} is running` : `${brand.name} is stopped`, lines);
    },
  },
  {
    name: 'edit',
    desc: 'Open the visual editor (drag, resize, type)',
    async run() {
      if (!(await control.status())) {
        const r = await control.start();
        if (!r.started && !r.already) return fail(`Could not start ${brand.name}`, [`Check the log: ${r.log}`]);
      }
      await control.openEditor();
      return ok('Editor open on your screen', ['Drag to move · drag the corner to resize · Esc when done']);
    },
  },
  {
    name: 'theme',
    args: '[name]',
    desc: 'Switch theme (no name opens a live picker)',
    complete: () => THEMES.map((t) => ({ value: t.id, desc: t.tagline })),
    async run([name]) {
      if (!name) return { ok: true, ui: 'theme-picker' };
      const t = byId(name);
      if (!t) return fail(`No theme called "${name}"`, [`Try one of: ${THEMES.map((x) => x.id).join(', ')}`]);
      const extra = await change((c) => withTheme(c, t.id));
      return ok(`Theme set to ${t.name}`, [t.tagline], extra);
    },
  },
  {
    name: 'themes',
    desc: `List all ${THEMES.length} theme packs`,
    async run() {
      const cur = config.load().theme;
      return ok(`${THEMES.length} theme packs`, THEMES.map((t) => themeLine(t, cur)), { hint: 'Use /theme <name>, or /pack <name> to also get its layout' });
    },
  },
  {
    name: 'pack',
    args: '<name>',
    desc: 'Apply a theme together with its own layout',
    complete: () => THEMES.map((t) => ({ value: t.id, desc: t.tagline })),
    async run([name]) {
      const t = byId(name);
      if (!t) return fail('Which pack?', [`Try one of: ${THEMES.map((x) => x.id).join(', ')}`]);
      const extra = await change((c) => ((c.widgets = presetLayout(t.id)), withTheme(c, t.id)));
      return ok(`${t.name} pack applied`, ['Theme and layout both switched'], extra);
    },
  },
  {
    name: 'wall',
    args: '<wallpaper>',
    desc: 'Switch wallpaper (see /walls)',
    complete: () => WALLS.map((w) => ({ value: w.id, desc: `${PACKS.find((p) => p.id === w.pack)?.name} · ${w.name}` })),
    async run(words) {
      const w = findWall(words);
      if (!w) return fail(words.length ? `No wallpaper called "${words.join(' ')}"` : 'Which wallpaper?', ['Run /walls to see every pack']);
      const extra = await change((c) => ((c.wall = w.id), (c.theme = w.skin), c));
      return ok(`Wallpaper set to ${w.name}`, [PACKS.find((p) => p.id === w.pack)?.desc || ''], extra);
    },
  },
  {
    name: 'walls',
    desc: `List the ${PACKS.length} wallpaper packs`,
    async run() {
      const cur = config.load().wall;
      const lines = PACKS.flatMap((p) => [`${p.name}  ${p.desc}`, ...wallsIn(p.id).map((w) => `  ${w.id === cur ? '●' : '○'} ${w.id.padEnd(16)} ${w.name}`)]);
      return ok(`${WALLS.length} wallpapers in ${PACKS.length} packs`, lines, { hint: 'Use /wall <name>, e.g. /wall prism glass' });
    },
  },
  {
    name: 'widgets',
    desc: 'Toggle widgets on and off',
    async run() {
      return { ok: true, ui: 'widget-picker' };
    },
  },
  {
    name: 'add',
    args: '<widget>',
    desc: 'Add a widget',
    complete: () => WIDGETS.map((w) => ({ value: w.type, desc: w.desc })),
    async run([type]) {
      const meta = byType(type);
      if (!meta) return fail(`Unknown widget "${type || ''}"`, [`Widgets: ${WIDGETS.map((w) => w.type).join(', ')}`]);
      const cfg = config.load();
      if (!meta.multi && cfg.widgets.some((w) => w.type === meta.type)) return ok(`${meta.name} is already on your wallpaper`);
      const [x, y] = spot(cfg);
      const extra = await change((c) => (c.widgets.push(make(meta.type, x, y)), c));
      return ok(`Added ${meta.name}`, ['Use /edit to move it where you like'], extra);
    },
  },
  {
    name: 'remove',
    args: '<widget>',
    desc: 'Remove a widget',
    complete: () => [...new Set(config.load().widgets.map((w) => w.type))].map((t) => ({ value: t, desc: byType(t)?.desc || '' })),
    async run([type]) {
      const meta = byType(type);
      const cfg = config.load();
      if (!meta || !cfg.widgets.some((w) => w.type === meta.type)) return fail(`No ${type || 'such'} widget on your wallpaper`);
      const extra = await change((c) => ((c.widgets = c.widgets.filter((w) => w.type !== meta.type)), c));
      return ok(`Removed ${meta.name}`, [], extra);
    },
  },
  {
    name: 'note',
    args: '<text> [--pink|--blue|--green|--purple]',
    desc: 'Pin a sticky note to your wallpaper',
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
    desc: 'Add a task to your to-do widget',
    async run(args) {
      const text = args.join(' ').trim();
      const cfg = config.load();
      const list = cfg.widgets.find((w) => w.type === 'todo');
      if (!text) {
        const items = list?.items || [];
        if (!items.length) return ok('Your list is empty', [], { hint: 'Add one with /todo <task>' });
        return ok(`${list.title || 'Today'}`, items.map((it, i) => `${i + 1}. ${it.done ? '✓' : '·'} ${it.text}`));
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
    desc: 'Tick off a task by its number',
    async run([n]) {
      const i = Number(n) - 1;
      const list = config.load().widgets.find((w) => w.type === 'todo');
      if (!list?.items?.[i]) return fail('No task with that number', ['See your list with /todo']);
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
    desc: 'Count down to a date',
    async run([date, ...rest]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return fail('Give me a date like 2026-12-31', ['Example: /countdown 2026-12-31 Launch day']);
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
      return ok(`Counting down to ${title}`, [`${days} day(s) to go`], extra);
    },
  },
  {
    name: 'quote',
    args: '<text> [-- author] | auto',
    desc: 'Pin your own quote (auto = quote of the day)',
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
    name: 'city',
    args: '<name> | auto',
    desc: 'Set your city for weather (auto = detect)',
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
      if (!r) return fail(`Could not find "${name}"`);
      const city = { name: r.name, country: r.country_code || '', lat: r.latitude, lon: r.longitude };
      const extra = await change((c) => ((c.city = city), c));
      return ok(`Weather set to ${city.name}, ${city.country}`, [`${r.admin1 ? r.admin1 + ' · ' : ''}${r.latitude.toFixed(2)}, ${r.longitude.toFixed(2)}`], extra);
    },
  },
  {
    name: 'sky',
    args: '[auto|clear|partly|cloudy|rain|snow|storm|fog]',
    desc: 'Force the Weather theme sky (great for reels)',
    complete: () => SKIES.map((s) => ({ value: s, desc: s === 'auto' ? 'follow the real weather' : '' })),
    async run([kind = 'auto']) {
      if (!SKIES.includes(kind)) return fail(`Unknown sky "${kind}"`, [`Try: ${SKIES.join(', ')}`]);
      const extra = await change((c) => ((c.sky = kind === 'auto' ? null : kind), c));
      const cfg = config.load();
      const tip = cfg.theme === 'weather' ? [] : ['Switch to it with /theme weather'];
      return ok(kind === 'auto' ? 'Sky follows the real weather' : `Sky set to ${kind}`, tip, extra);
    },
  },
  {
    name: 'name',
    args: '<your name>',
    desc: 'The name used in your greeting',
    async run(args) {
      const name = args.join(' ').trim();
      const extra = await change((c) => ((c.name = name), c));
      return ok(name ? `Hi ${name}` : 'Using your computer account name', [], extra);
    },
  },
  {
    name: 'clock',
    args: '12|24',
    desc: '12 or 24 hour clock',
    complete: () => [{ value: '12', desc: '12-hour' }, { value: '24', desc: '24-hour' }],
    async run([v]) {
      if (v !== '12' && v !== '24') return fail('Use /clock 12 or /clock 24');
      const extra = await change((c) => ((c.clock24 = v === '24'), c));
      return ok(`${v}-hour clock`, [], extra);
    },
  },
  {
    name: 'bg',
    args: '<image path> | none',
    desc: 'Use your own image as the background',
    async run(args) {
      const p = args.join(' ').trim().replace(/^["']|["']$/g, '');
      if (!p || p === 'none' || p === 'theme') {
        const extra = await change((c) => ((c.background = null), c));
        return ok('Back to the theme scene', [], extra);
      }
      const abs = path.resolve(p);
      if (!fs.existsSync(abs)) return fail('That file does not exist', [abs]);
      if (!/\.(jpe?g|png|webp|gif|avif)$/i.test(abs)) return fail('That does not look like an image', ['Use a jpg, png, webp, gif or avif']);
      const extra = await change((c) => ((c.background = abs), c));
      return ok('Background image set', [abs, 'Adjust the darkening in /edit, Settings'], extra);
    },
  },
  {
    name: 'motion',
    args: 'on|off',
    desc: 'Turn animations on or off (saves battery)',
    complete: () => [{ value: 'on', desc: '' }, { value: 'off', desc: '' }],
    async run([v]) {
      if (v !== 'on' && v !== 'off') return fail('Use /motion on or /motion off');
      const extra = await change((c) => ((c.motion = v === 'on'), c));
      return ok(`Motion ${v}`, [], extra);
    },
  },
  {
    name: 'autostart',
    args: 'on|off',
    desc: `Start ${brand.name} when you log in`,
    complete: () => [{ value: 'on', desc: '' }, { value: 'off', desc: '' }],
    async run([v]) {
      if (v !== 'on' && v !== 'off') return fail('Use /autostart on or /autostart off');
      const extra = await change((c) => ((c.autostart = v === 'on'), c));
      return ok(`Autostart ${v}`, v === 'on' ? [`Applied the next time ${brand.name} runs`] : [], extra);
    },
  },
  {
    name: 'appearance',
    args: 'auto | light | dark | sun',
    desc: 'Light or dark version of every theme (auto follows Windows)',
    complete: () => [{ value: 'auto', desc: 'follow Windows' }, { value: 'light', desc: '' }, { value: 'dark', desc: '' }],
    async run([v]) {
      if (!['auto', 'light', 'dark', 'sun'].includes(v)) return fail('Use /appearance auto, light, dark or sun (follows sunrise and sunset)');
      const extra = await change((c) => ((c.appearance = v), c));
      return ok(v === 'auto' ? 'Appearance follows Windows' : `${v[0].toUpperCase() + v.slice(1)} appearance`, ['Every theme has a light and a dark version'], extra);
    },
  },
  {
    name: 'planet',
    args: 'moon | mars | earth',
    desc: 'Which planet the Astronomy theme shows',
    complete: () => ['moon', 'mars', 'earth'].map((v) => ({ value: v, desc: '' })),
    async run([v]) {
      if (!['moon', 'mars', 'earth'].includes(v)) return fail('Use /planet moon, mars or earth');
      const extra = await change((c) => ((c.planet = v), (c.theme = 'astro'), (c.wall = `astro-${v}`), c));
      return ok(`Astronomy: ${v[0].toUpperCase() + v.slice(1)}`, [], extra);
    },
  },
  {
    name: 'player',
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
    desc: 'Open Spotlight search (apps, files, settings, math, web)',
    async run() {
      if (!(await control.status())) return fail(`${brand.name} is not running`, ['Run /start first']);
      await control.call('/spotlight');
      const s = await control.status();
      return ok('Spotlight is open', [`Shortcut: ${(s?.spotlight || 'Alt+Space').replace('CommandOrControl', 'Ctrl')}`]);
    },
  },
  {
    name: 'dock',
    args: 'add <path> | remove <name> | reset | list',
    desc: 'Choose the apps in your dock',
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
        const extra = await change((c) => ((c.dock = c.dock.filter((a) => a.name.toLowerCase() !== arg.toLowerCase())), c));
        return ok(`Removed ${arg}`, [], extra);
      }
      if (sub === 'reset') {
        const extra = await change((c) => ((c.dock = null), c));
        return ok('Dock is automatic again', ['It shows the apps it finds on your PC'], extra);
      }
      return ok('Dock', list ? list.map((a) => `${a.name.padEnd(14)} ${a.target}`) : ['automatic: Files, your browser, VS Code, Spotify, Notepad, Calculator, Settings (whichever you have)']);
    },
  },
  {
    name: 'taskbar',
    args: 'hide | show',
    desc: 'Auto-hide the Windows taskbar so the dock takes over',
    complete: () => [{ value: 'hide', desc: 'auto-hide' }, { value: 'show', desc: 'always show' }],
    async run([v]) {
      if (v !== 'hide' && v !== 'show') return fail('Use /taskbar hide or /taskbar show');
      const s = await control.status();
      if (!s) return fail(`${brand.name} is not running`, ['Run /start first']);
      await control.call(`/taskbar-${v}`);
      return ok(v === 'hide' ? 'Windows taskbar auto-hides now' : 'Windows taskbar is always visible', v === 'hide' ? ['Move the mouse to the bottom edge to bring it back'] : []);
    },
  },
  {
    name: 'github',
    args: '<username> | auto | off',
    desc: 'Use your GitHub contribution graph (auto-detected by default)',
    async run([user]) {
      if (!user) {
        const cur = config.load().github;
        return ok('GitHub graph', [cur === 'off' ? 'off (local git only)' : cur ? `@${cur}` : 'auto (detected from gh or your repo remotes)']);
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
    args: 'add <path> | list | scan <folder>',
    desc: 'Choose which git repos feed the commit graph',
    complete: () => [{ value: 'add', desc: 'add one repo' }, { value: 'scan', desc: 'scan a folder for repos' }, { value: 'list', desc: 'show settings' }],
    async run([sub, ...rest]) {
      const cfg = config.load();
      const p = rest.join(' ').trim().replace(/^["']|["']$/g, '');
      if (sub === 'add' || sub === 'scan') {
        if (!p) return fail(`Usage: /repo ${sub} <path>`);
        const abs = path.resolve(p);
        if (!fs.existsSync(abs)) return fail('That folder does not exist', [abs]);
        if (sub === 'add' && !fs.existsSync(path.join(abs, '.git'))) return fail('That folder is not a git repo', [abs]);
        const extra = await change((c) => {
          c.repos = c.repos || { roots: [], extra: [] };
          const key = sub === 'add' ? 'extra' : 'roots';
          c.repos[key] = [...new Set([...(c.repos[key] || []), abs])];
          return c;
        });
        await control.reload();
        return ok(sub === 'add' ? 'Repo added' : 'Folder will be scanned', [abs], extra);
      }
      const roots = cfg.repos?.roots?.length ? cfg.repos.roots : ['(default: Desktop, Documents, code, projects, dev, …)'];
      return ok('Commit graph sources', [...roots.map((r) => `scan  ${r}`), ...(cfg.repos?.extra || []).map((r) => `repo  ${r}`)]);
    },
  },
  {
    name: 'ai',
    args: '<question> | model [name] | models',
    desc: 'Ask the local AI, or let it organize your notes and to-dos',
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
    name: 'wrapped',
    desc: 'Your week: top songs, commits, active time and apps (shareable card)',
    async run() {
      if (!(await control.status())) return fail(`${brand.name} is not running`, ['Run /start first']);
      await control.call('/wrapped');
      return ok('Wrapped is open on your desktop', ['Share saves a PNG to Pictures and copies it']);
    },
  },
  {
    name: 'pet',
    args: 'cat | bird | off',
    desc: 'A tiny pet that walks along your dock',
    complete: () => ['cat', 'bird', 'off'].map((v) => ({ value: v, desc: '' })),
    async run([v]) {
      if (!['cat', 'bird', 'off'].includes(v)) return fail('Use /pet cat, bird or off');
      const extra = await change((c) => ((c.pet = v), c));
      return ok(v === 'off' ? 'Pet is taking a nap (off)' : `Say hi to your ${v}`, v === 'off' ? [] : ['Click it on the wallpaper'], extra);
    },
  },
  {
    name: 'doctor',
    desc: 'Check this computer: which Mirage features will work here',
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
      const lines = [`Node ${process.versions.node} · ${process.platform}`];
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
      return ok('Mirage check-up', lines);
    },
  },
  {
    name: 'shortcuts',
    desc: 'Linux (GNOME): add Alt+W and Ctrl+Space as system shortcuts',
    async run() {
      if (process.platform !== 'linux') return ok('Shortcuts already work on Windows', ['Change them in Settings → More settings']);
      const { createRequire } = await import('module');
      const linux = createRequire(import.meta.url)('../src/main/linux.cjs');
      const cli = `"${process.execPath}" "${path.join(path.dirname((await import('url')).fileURLToPath(import.meta.url)), 'main.mjs')}"`;
      const done = linux.installShortcuts(cli, { edit: '<Alt>w', spotlight: '<Control>space' });
      return done ? ok('Added to GNOME keyboard shortcuts', ['Alt+W  rearrange', 'Ctrl+Space  Spotlight', 'Change them in Settings → Keyboard → Custom Shortcuts']) : fail('GNOME settings not found', ['Add shortcuts in your desktop settings that run: brow edit / brow spotlight']);
    },
  },
  {
    name: 'stocks',
    args: 'add <SYMBOL> | remove <SYMBOL> | list',
    desc: 'Your Stocks widget watchlist (Yahoo symbols: ^NSEI, TCS.NS, AAPL)',
    complete: () => ['add', 'remove', 'list'].map((v) => ({ value: v, desc: '' })),
    async run([sub, sym]) {
      const cfg = config.load();
      const w = cfg.widgets.find((x) => x.type === 'stocks');
      const list = w?.symbols || [];
      if (!sub || sub === 'list') return w ? ok('Watchlist', list.length ? list : ['(empty)']) : ok('No Stocks widget yet', [], { hint: 'Add one with /add stocks' });
      const s = String(sym || '').toUpperCase();
      if (!s) return fail(`Which symbol? e.g. /stocks ${sub} RELIANCE.NS`);
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
    name: 'season',
    args: 'auto | spring | summer | autumn | winter | off',
    desc: 'Seasonal wallpaper: cherry petals, summer light, falling leaves or snow',
    complete: () => ['auto', 'spring', 'summer', 'autumn', 'winter', 'off'].map((v) => ({ value: v, desc: '' })),
    async run([v]) {
      const all = ['auto', 'spring', 'summer', 'autumn', 'winter', 'off'];
      if (!all.includes(v)) return fail('Use /season auto, spring, summer, autumn, winter or off');
      const extra = await change((c) => ((c.season = v), c));
      return ok(v === 'auto' ? 'Season follows the calendar' : v === 'off' ? 'Seasons off' : `It's ${v} on your desktop`, [], extra);
    },
  },
  {
    name: 'fx',
    args: 'auto | off | rain | snow | storm',
    desc: 'Weather on the desktop (auto = only when it really rains or snows)',
    complete: () => ['auto', 'off', 'rain', 'snow', 'storm'].map((v) => ({ value: v, desc: '' })),
    async run([v]) {
      if (!['auto', 'off', 'rain', 'snow', 'storm'].includes(v)) return fail('Use /fx auto, off, rain, snow or storm');
      const extra = await change((c) => ((c.weatherFx = v), c));
      return ok(`Desktop weather: ${v}`, v === 'auto' ? ['Rain or snow appears when it is really happening outside'] : [], extra);
    },
  },
  {
    name: 'reset',
    desc: 'Reset the layout to the current theme pack',
    async run() {
      const cfg = config.load();
      const extra = await change((c) => ((c.widgets = presetLayout(c.theme)), c));
      return ok(`Layout reset to the ${byId(cfg.theme).name} pack`, [], extra);
    },
  },
  {
    name: 'config',
    desc: 'Show where your settings live',
    async run() {
      return ok('Your settings', [config.FILE, 'Edit it by hand if you like. The wallpaper reloads instantly.']);
    },
  },
  {
    name: 'help',
    desc: 'Show all commands',
    async run() {
      return ok('Commands', COMMANDS.map((c) => `${`/${c.name}`.padEnd(12)}${c.desc}${c.args ? `  ·  /${c.name} ${c.args}` : ''}`), { hint: 'Tip: type / and use ↑ ↓ Tab to pick a command' });
    },
  },
  {
    name: 'exit',
    desc: 'Leave the CLI (the wallpaper keeps running)',
    async run() {
      return { ok: true, ui: 'exit' };
    },
  },
];

export const find = (name) => COMMANDS.find((c) => c.name === String(name || '').replace(/^\//, '').toLowerCase());

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
    // "/terminal" or "cartoon" alone is a theme switch
    const t = byId(head.replace(/^\//, ''));
    if (t) return find('theme').run([t.id]);
    return fail(`Unknown command "${head}"`, ['Type /help to see everything']);
  }
  try {
    return await cmd.run(args);
  } catch (e) {
    return fail(`/${cmd.name} failed`, [String(e.message || e)]);
  }
}

export { THEMES, WIDGETS, brand, byId, config };
