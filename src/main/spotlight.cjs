// Spotlight: one search box for apps, files, folders, settings, repos, wallpaper actions,
// quick math and the web. Everything is indexed in memory so results appear as you type.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { app, clipboard, shell } = require('electron');

// Shortcuts carry a generic arrow icon; resolve them to the real program for a proper one.
function shortcutTarget(lnk) {
  try {
    const s = shell.readShortcutLink(lnk);
    if (s.icon && fs.existsSync(s.icon) && !/.dll$/i.test(s.icon)) return s.icon;
    if (s.target && fs.existsSync(s.target)) return s.target;
  } catch {}
  return lnk;
}
const config = require('../shared/config.cjs');
const { THEMES } = require('../shared/themes.cjs');

const HOME = os.homedir();
const USAGE_FILE = path.join(config.DIR, 'spotlight.json');
const SKIP = new Set(['node_modules', 'vendor', '.git', 'AppData', '$RECYCLE.BIN', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'target', '.cache', '.gradle', '.idea', 'Library', 'site-packages', 'bower_components', '.nuget']);
const MAX_FILES = 120000;

let apps = [];
let files = [];
let packages = null;
let lnkByName = new Map();
let usage = {};
let hooks = {};

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 }, (e, out) => resolve(e ? '' : String(out))));
}

try {
  usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
} catch {}

function bump(id) {
  usage[id] = (usage[id] || 0) + 1;
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage));
  } catch {}
}

// ---------------------------------------------------------------- indexing

async function walkLinks(dir, out) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkLinks(p, out);
    else if (/\.(lnk|url)$/i.test(e.name)) out.set(e.name.replace(/\.(lnk|url)$/i, '').toLowerCase(), p);
  }
}

async function indexApps() {
  if (process.platform !== 'win32') return;
  const links = new Map();
  await walkLinks(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'), links);
  await walkLinks(path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'), links);
  lnkByName = links;
  const raw = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ConvertTo-Json -Compress']);
  let list = [];
  try {
    list = JSON.parse(raw);
  } catch {}
  if (!Array.isArray(list)) list = list ? [list] : [];
  const seen = new Set();
  apps = list
    .filter((a) => a.Name && a.AppID && !/^(uninstall|readme|help|about )/i.test(a.Name))
    .filter((a) => !seen.has(a.Name) && seen.add(a.Name))
    .map((a) => ({ kind: 'app', id: `app:${a.AppID}`, title: a.Name, subtitle: 'Application', target: a.AppID, key: a.Name.toLowerCase() }));
}

async function walkFiles(dir, depth, out) {
  if (depth < 0 || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= MAX_FILES) return;
    if (e.name.startsWith('.') || e.name.startsWith('~$') || SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const isDir = e.isDirectory();
    if (!isDir && !e.isFile()) continue;
    out.push({ name: e.name, key: e.name.toLowerCase(), path: p, dir: isDir });
    if (isDir) await walkFiles(p, depth - 1, out);
  }
  await new Promise((r) => setImmediate(r)); // stay responsive while indexing
}

async function indexFiles() {
  const roots = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'OneDrive', 'code', 'projects', 'dev', 'source']
    .map((d) => path.join(HOME, d))
    .filter((p) => fs.existsSync(p));
  const out = [];
  for (const r of roots) {
    out.push({ name: path.basename(r), key: path.basename(r).toLowerCase(), path: r, dir: true });
    await walkFiles(r, 7, out);
  }
  files = out;
}

function startIndexing(h) {
  hooks = h;
  const all = () => Promise.all([indexApps(), indexFiles()]).catch(() => {});
  setTimeout(all, 1500);
  setInterval(indexFiles, 20 * 60 * 1000);
  setInterval(indexApps, 30 * 60 * 1000);
}

// ---------------------------------------------------------------- fixed sources

const SETTINGS = [
  ['Wi-Fi', 'network-wifi', 'wifi internet network wireless'],
  ['Bluetooth & devices', 'bluetooth', 'bluetooth headphones devices'],
  ['Display', 'display', 'screen resolution scale brightness monitor'],
  ['Sound', 'sound', 'audio volume speakers microphone'],
  ['Notifications', 'notifications', 'focus do not disturb'],
  ['Power & battery', 'batterysaver', 'battery power sleep'],
  ['Storage', 'storagesense', 'disk space storage'],
  ['Personalization', 'personalization', 'theme colors background'],
  ['Background', 'personalization-background', 'wallpaper background'],
  ['Colors & dark mode', 'colors', 'dark mode light mode accent'],
  ['Taskbar', 'taskbar', 'taskbar start menu'],
  ['Night light', 'nightlight', 'night light blue light'],
  ['Apps & features', 'appsfeatures', 'uninstall programs apps'],
  ['Default apps', 'defaultapps', 'default browser apps'],
  ['Startup apps', 'startupapps', 'startup boot'],
  ['Mouse', 'mousetouchpad', 'mouse cursor pointer'],
  ['Touchpad', 'devices-touchpad', 'touchpad trackpad gestures'],
  ['Keyboard', 'keyboard', 'keyboard typing'],
  ['Date & time', 'dateandtime', 'date time clock timezone'],
  ['Language & region', 'regionlanguage', 'language region'],
  ['Windows Update', 'windowsupdate', 'update upgrade'],
  ['Privacy & security', 'privacy', 'privacy permissions security'],
  ['Accounts', 'yourinfo', 'account user profile'],
  ['VPN', 'network-vpn', 'vpn'],
  ['Mobile hotspot', 'network-mobilehotspot', 'hotspot tethering'],
  ['Printers & scanners', 'printers', 'printer scanner'],
  ['About this PC', 'about', 'about pc specs system info'],
].map(([title, page, words]) => ({ kind: 'setting', id: `set:${page}`, title, subtitle: 'Settings', target: `ms-settings:${page}`, key: `${title} ${words}`.toLowerCase() }));

function actions() {
  const list = [
    { title: 'Edit wallpaper', action: 'edit', words: 'customize layout widgets' },
    { title: 'New sticky note', action: 'note', words: 'note sticky add' },
    { title: 'Lock PC', action: 'lock', words: 'lock screen' },
    { title: 'Weekly Wrapped', action: 'wrapped', words: 'wrapped week summary stats recap share' },
    { title: 'Now Playing', action: 'player', words: 'music player song history' },
    { title: 'Take a screenshot', action: 'screenshot', words: 'screenshot snip capture' },
    ...THEMES.map((t) => ({ title: `Theme: ${t.name}`, action: 'theme', arg: t.id, words: `theme ${t.tagline}` })),
  ];
  return list.map((a) => ({ kind: 'action', id: `act:${a.action}:${a.arg || ''}`, title: a.title, subtitle: 'Wallpaper', target: a.action, arg: a.arg, key: `${a.title} ${a.words}`.toLowerCase() }));
}

function repos() {
  return (hooks.repos?.() || []).map((p) => ({ kind: 'repo', id: `repo:${p}`, title: path.basename(p), subtitle: `Git repo · ${p.replace(HOME, '~')}`, target: p, key: path.basename(p).toLowerCase() }));
}

// ---------------------------------------------------------------- matching

function score(q, key) {
  if (key === q) return 1000;
  if (key.startsWith(q)) return 900 - Math.min(key.length, 80);
  const words = key.split(/[\s\-_.()]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 700 - Math.min(key.length, 80);
  if (q.length >= 2 && words.map((w) => w[0]).join('').startsWith(q)) return 650;
  const i = key.indexOf(q);
  if (i >= 0) return 500 - i;
  // subsequence ("vscd" -> "visual studio code")
  let k = 0;
  let gaps = 0;
  let last = -1;
  for (let j = 0; j < key.length && k < q.length; j++) {
    if (key[j] === q[k]) {
      if (last >= 0) gaps += j - last - 1;
      last = j;
      k++;
    }
  }
  // loose matches only count when the letters sit close together
  return k === q.length && q.length > 1 && gaps <= 6 ? Math.max(1, 220 - gaps * 25) : 0;
}

const WEIGHT = { app: 320, action: 120, setting: 160, repo: 140, folder: 60, file: 0 };

function calc(q) {
  if (!/^[\d\s+\-*/().%^,]+$/.test(q) || !/[+\-*/^%]/.test(q) || !/\d/.test(q)) return null;
  try {
    const v = Function(`"use strict"; return (${q.replace(/,/g, '').replace(/\^/g, '**')})`)();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    const text = String(Math.round(v * 1e10) / 1e10);
    return { kind: 'calc', id: 'calc', title: text, subtitle: `${q.trim()} = ${text} · Enter copies`, target: text };
  } catch {
    return null;
  }
}

// "note buy milk", "todo call mom", "ask plan my day" do something right away
function quick(raw) {
  const m = String(raw || '').match(/^\s*(note|todo|to-do|ask|ai)\s*:?\s+(.+)$/i) || String(raw || '').match(/^\s*(\?)\s*(.+)$/);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const text = m[2].trim();
  if (verb === 'note') return { kind: 'quick', id: 'quick:note', title: `Pin a sticky note: “${text}”`, subtitle: 'Enter to add', target: 'note-add', arg: text };
  if (verb === 'todo' || verb === 'to-do') return { kind: 'quick', id: 'quick:todo', title: `Add to-do: “${text}”`, subtitle: 'Enter to add', target: 'todo-add', arg: text };
  return { kind: 'ai', id: 'ai', title: `Ask Claude: “${text}”`, subtitle: 'Enter to ask', target: text };
}

function search(raw) {
  const fast = quick(raw);
  if (fast) return [fast];
  const q = String(raw || '').trim().toLowerCase();
  if (!q) {
    // most used, so an empty box is still useful
    const pool = [...apps, ...SETTINGS, ...actions()];
    return pool
      .filter((i) => usage[i.id])
      .sort((a, b) => usage[b.id] - usage[a.id])
      .slice(0, 8);
  }
  const out = [];
  const consider = (item, key = item.key) => {
    const s = score(q, key);
    if (s > 0) out.push({ ...item, score: s + (WEIGHT[item.kind] || 0) + Math.min(240, (usage[item.id] || 0) * 40) });
  };
  apps.forEach((a) => consider(a));
  SETTINGS.forEach((s) => consider(s));
  actions().forEach((a) => consider(a));
  repos().forEach((r) => consider(r));
  for (const f of files) {
    const s = score(q, f.key);
    if (s <= 0) continue;
    const kind = f.dir ? 'folder' : 'file';
    const id = `${kind}:${f.path}`;
    out.push({
      kind,
      id,
      title: f.name,
      subtitle: path.dirname(f.path).replace(HOME, '~'),
      target: f.path,
      score: s + WEIGHT[kind] + Math.min(240, (usage[id] || 0) * 40) - f.path.split(path.sep).length,
    });
  }
  out.sort((a, b) => b.score - a.score);
  const results = out.slice(0, 40);
  const c = calc(raw);
  if (c) results.unshift(c);
  results.push({ kind: 'ai', id: 'ai', title: `Ask Claude “${raw.trim()}”`, subtitle: 'Answers and organizes your notes and to-dos', target: raw.trim() });
  results.push({ kind: 'web', id: 'web', title: `Search the web for “${raw.trim()}”`, subtitle: 'Google', target: `https://www.google.com/search?q=${encodeURIComponent(raw.trim())}` });
  return results;
}

// ---------------------------------------------------------------- icons

async function loadPackages() {
  if (packages) return packages;
  const raw = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-AppxPackage | Select-Object PackageFamilyName, InstallLocation | ConvertTo-Json -Compress']);
  packages = new Map();
  try {
    for (const p of JSON.parse(raw)) if (p.PackageFamilyName && p.InstallLocation) packages.set(p.PackageFamilyName, p.InstallLocation);
  } catch {}
  return packages;
}

// Store apps keep their logos inside the package; pick the best-looking size.
async function storeIcon(appId) {
  const [family, entry] = appId.split('!');
  const dir = (await loadPackages()).get(family);
  if (!dir) return null;
  let manifest;
  try {
    manifest = fs.readFileSync(path.join(dir, 'AppxManifest.xml'), 'utf8');
  } catch {
    return null;
  }
  const appBlock = new RegExp(`<Application[^>]*Id="${entry}"[\\s\\S]*?</Application>`).exec(manifest)?.[0] || manifest;
  const logo = /Square44x44Logo="([^"]+)"/.exec(appBlock)?.[1] || /Square150x150Logo="([^"]+)"/.exec(appBlock)?.[1];
  if (!logo) return null;
  const base = path.join(dir, logo);
  const folder = path.dirname(base);
  const stem = path.basename(base, path.extname(base)).toLowerCase();
  let candidates = [];
  try {
    candidates = fs.readdirSync(folder).filter((f) => f.toLowerCase().startsWith(stem) && /\.png$/i.test(f));
  } catch {}
  const rank = (f) => {
    const l = f.toLowerCase();
    if (l.includes('targetsize-48_altform-unplated')) return 0;
    if (l.includes('targetsize-64_altform-unplated')) return 1;
    if (l.includes('targetsize-48')) return 2;
    if (l.includes('scale-200')) return 3;
    if (l.includes('targetsize-32')) return 4;
    return 9;
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  const file = candidates[0] ? path.join(folder, candidates[0]) : fs.existsSync(base) ? base : null;
  if (!file) return null;
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

const iconCache = new Map();
async function iconFor(item) {
  const key = item.kind === 'file' ? `ext:${path.extname(item.target).toLowerCase()}` : item.id;
  const special = /\.(exe|lnk|ico|url)$/i.test(item.target || '');
  const cacheKey = special ? item.id : key;
  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
  let url = null;
  try {
    if (item.kind === 'app') {
      const lnk = lnkByName.get(item.title.toLowerCase());
      if (item.target.includes('!')) url = await storeIcon(item.target);
      if (!url && lnk) url = (await app.getFileIcon(/.lnk$/i.test(lnk) ? shortcutTarget(lnk) : lnk, { size: 'large' })).toDataURL();
      if (!url && /^[a-z]:\\/i.test(item.target) && fs.existsSync(item.target)) url = (await app.getFileIcon(item.target, { size: 'large' })).toDataURL();
    } else if ((item.kind === 'file' || item.kind === 'folder' || item.kind === 'repo') && fs.existsSync(item.target)) {
      url = (await app.getFileIcon(item.target, { size: 'large' })).toDataURL();
    }
  } catch {}
  iconCache.set(cacheKey, url);
  return url;
}

async function icons(items) {
  return Promise.all(items.map((i) => iconFor(i)));
}

// ---------------------------------------------------------------- opening

async function open(item, reveal = false) {
  if (!item) return;
  if (item.id && !['web', 'calc', 'quick', 'ai'].includes(item.kind)) bump(item.id);
  switch (item.kind) {
    case 'app':
      if (/^[a-z]:\\/i.test(item.target) && fs.existsSync(item.target)) return shell.openPath(item.target);
      return spawn('explorer.exe', [`shell:AppsFolder\\${item.target}`], { detached: true, stdio: 'ignore' }).unref();
    case 'file':
    case 'folder':
      return reveal ? shell.showItemInFolder(item.target) : shell.openPath(item.target);
    case 'repo':
      return reveal ? shell.openPath(item.target) : hooks.action?.('repo', item.target);
    case 'setting':
    case 'web':
      return shell.openExternal(item.target);
    case 'calc':
      return clipboard.writeText(item.target);
    case 'action':
    case 'quick':
      return hooks.runAction?.(item.target, item.arg);
    default:
      return null;
  }
}

module.exports = { startIndexing, search, icons, open, stats: () => ({ apps: apps.length, files: files.length }) };
