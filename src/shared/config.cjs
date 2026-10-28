// One JSON file is the source of truth. The wallpaper watches it, the CLI and
// the visual editor write to it, so every surface stays in sync.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { presetLayout } = require('./widgets.cjs');
const { byId } = require('./themes.cjs');
const brand = require('./brand.cjs');

const DIR = process.env.WALL_HOME || path.join(os.homedir(), `.${brand.slug}`);
const FILE = path.join(DIR, 'config.json');
const PORT = Number(process.env.WALL_PORT) || 47391;

function defaults() {
  return {
    version: 1,
    theme: 'aurora',
    name: '',
    clock24: false,
    appearance: 'auto', // 'auto' follows Windows light/dark; or 'light' / 'dark'
    visualizer: true, // bars in the Now Playing view
    planet: 'moon', // Astronomy theme: moon | mars | earth
    weatherFx: 'auto', // rain/snow over the desktop when it's really happening: auto | off | rain | snow | storm
    pet: 'cat', // a little desktop pet on the dock: cat | bird | off
    perf: 'auto', // auto | saver | full: auto saves power on battery and on modest laptops
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
    widgets: presetLayout('aurora'),
  };
}

function load() {
  // first run: write the defaults so every caller sees the same widget ids
  if (!fs.existsSync(FILE)) return save(defaults());
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const cfg = { ...defaults(), ...raw };
    if (!byId(cfg.theme)) cfg.theme = 'aurora';
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
