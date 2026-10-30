// One JSON file is the source of truth. The wallpaper watches it, the CLI and
// the visual editor write to it, so every surface stays in sync.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { presetLayout } = require('./widgets.cjs');
const { byId } = require('./themes.cjs');
const { wallById, wallForTheme, CUSTOM } = require('./packs.cjs');
const brand = require('./brand.cjs');

const DIR = process.env.WALL_HOME || path.join(os.homedir(), `.${brand.slug}`);
const FILE = path.join(DIR, 'config.json');
const PORT = Number(process.env.WALL_PORT) || 47391;

function defaults() {
  return {
    version: 1,
    theme: 'midnight', // the widget style; the wallpaper picks one when you choose it
    wall: 'silk-dusk', // the wallpaper, from a pack in packs.cjs
    wallCustom: structuredClone(CUSTOM), // your own Color and Emoji wallpapers
    name: '',
    clock24: false,
    appearance: 'sun', // day & night: 'sun' (sunrise to sunset), 'auto' (follows Windows), 'light', 'dark'
    visualizer: true, // bars in the Now Playing view
    planet: 'moon', // Astronomy theme: moon | mars | earth
    weatherFx: 'auto', // rain/snow over the desktop when it's really happening: auto | off | rain | snow | storm
    pet: 'cat', // a little desktop pet on the dock: cat | bird | off
    menubarFixed: true, // false = the menu bar hides and slides down at the top edge
    perf: 'auto', // auto | saver | full: auto saves power on battery and on modest laptops
    wallQuality: 'auto', // auto | low | balanced | high: how sharp the live wallpapers render
    wallBlur: 0, // 0..100: how much the wallpaper is blurred (every pack, and photos)
    gpu: 'dedicated', // dedicated | integrated: which GPU draws the wallpaper on two-GPU laptops
    season: 'off', // only when you pick one: spring | summer | autumn | winter | auto (follows the calendar) | off
    ai: { model: 'llama3.1:8b' }, // local model served by Ollama
    motion: true,
    background: null, // absolute path to an image, or null for the theme scene
    dim: 0.25, // darkening over a custom background image
    city: null, // { name, country, lat, lon }
    repos: { roots: [], extra: [] },
    github: null, // GitHub username for the contribution graph; null = auto-detect, 'off' = local git only
    hotkey: 'Alt+W',
    autostart: false,
    onboarded: false, // shows a how-to hint on the wallpaper until the editor is opened once
    widgets: presetLayout('midnight'),
  };
}

function load() {
  // first run: write the defaults so every caller sees the same widget ids
  if (!fs.existsSync(FILE)) return save(defaults());
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const cfg = { ...defaults(), ...raw };
    if (!byId(cfg.theme)) cfg.theme = 'midnight'; // includes themes that were retired
    if (raw.wall === undefined || !wallById(cfg.wall)) cfg.wall = wallForTheme(cfg.theme, cfg.planet);
    cfg.wallCustom = { color: { ...CUSTOM.color, ...raw.wallCustom?.color }, emoji: { ...CUSTOM.emoji, ...raw.wallCustom?.emoji } };
    if (!Array.isArray(cfg.widgets)) cfg.widgets = presetLayout(cfg.theme);
    return cfg;
  } catch {
    return defaults();
  }
}

function save(cfg) {
  fs.mkdirSync(DIR, { recursive: true });
  const data = JSON.stringify(cfg, null, 2);
  const tmp = `${FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, FILE);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
    fs.writeFileSync(FILE, data);
  }
  return cfg;
}

function update(fn) {
  const cfg = load();
  const next = fn(cfg) || cfg;
  return save(next);
}

function ensure() {
  if (!fs.existsSync(FILE)) save(defaults());
  return load();
}

module.exports = { DIR, FILE, PORT, defaults, load, save, update, ensure };
