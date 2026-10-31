// Linux side of the system features (GNOME first, KDE where it's easy): the same things the
// Windows code does, through the standard tools every mainstream distro ships:
//   PipeWire/PulseAudio (wpctl, pactl), NetworkManager (nmcli), GNOME settings (gsettings),
//   power-profiles-daemon (powerprofilesctl), systemd (loginctl), and D-Bus (gdbus) for
//   MPRIS media players and screen brightness. A missing tool just turns that feature off.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const HOME = os.homedir();
const DESKTOP = String(process.env.XDG_CURRENT_DESKTOP || '').toLowerCase(); // "ubuntu:gnome", "kde", …

function run(cmd, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, env: { ...process.env, LC_ALL: 'C' } }, (err, out) => resolve(err ? '' : String(out)));
  });
}
function runSync(cmd, args, timeout = 1500) {
  try {
    return String(execFileSync(cmd, args, { timeout, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, LC_ALL: 'C' } }));
  } catch {
    return '';
  }
}
const detached = (cmd, args) => {
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- sound

// { level: 0-100, muted } from PipeWire (wpctl), else PulseAudio (pactl)
function getVolume() {
  const w = runSync('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
  const m = /Volume:\s*([\d.]+)/.exec(w);
  if (m) return { level: Math.round(Number(m[1]) * 100), muted: /MUTED/.test(w) };
  const v = /(\d+)%/.exec(runSync('pactl', ['get-sink-volume', '@DEFAULT_SINK@']));
  if (!v) return null;
  return { level: Number(v[1]), muted: /yes/.test(runSync('pactl', ['get-sink-mute', '@DEFAULT_SINK@'])) };
}
let pipewire = null; // does wpctl answer? checked once
const hasWpctl = () => (pipewire ??= /Volume:/.test(runSync('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'])));
function setVolume(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (hasWpctl()) runSync('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', String(p / 100)]);
  else runSync('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${p}%`]);
  return getVolume();
}
function setMute(on) {
  if (hasWpctl()) runSync('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', on ? '1' : '0']);
  else runSync('pactl', ['set-sink-mute', '@DEFAULT_SINK@', on ? '1' : '0']);
  return getVolume();
}

// sound outputs: [{ id, name, default }]
async function audioOutputs() {
  const [list, def] = await Promise.all([run('pactl', ['list', 'sinks']), run('pactl', ['get-default-sink'])]);
  return list
    .split(/\n(?=Sink #)/)
    .map((b) => ({ id: /^\s*Name:\s*(.+)$/m.exec(b)?.[1]?.trim(), name: /^\s*Description:\s*(.+)$/m.exec(b)?.[1]?.trim() }))
    .filter((s) => s.id)
    .map((s) => ({ ...s, name: s.name || s.id, default: s.id === def.trim() }));
}
async function setAudioOutput(id) {
  if (id) await run('pactl', ['set-default-sink', id]);
  return audioOutputs();
}

// ---------------------------------------------------------------- network (NetworkManager)

const nmSplit = (line) => line.split(/(?<!\\):/).map((x) => x.replace(/\\:/g, ':'));

async function wifi() {
  const out = await run('nmcli', ['-t', '-f', 'ACTIVE,SSID,SIGNAL', 'dev', 'wifi']);
  if (!out) return { available: false };
  const active = out.split('\n').map(nmSplit).find((f) => f[0] === 'yes');
  return { available: true, connected: !!active, ssid: active?.[1] || '', signal: Number(active?.[2] || 0) };
}
async function wifiNetworks() {
  const [list, cons] = await Promise.all([run('nmcli', ['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list']), run('nmcli', ['-t', '-f', 'NAME,TYPE', 'con', 'show'])]);
  const known = new Set(cons.split('\n').map(nmSplit).filter((f) => /wireless/.test(f[1] || '')).map((f) => f[0]));
  const seen = new Map();
  for (const f of list.split('\n').map(nmSplit)) {
    const ssid = f[1];
    if (!ssid) continue;
    const n = { ssid, signal: Number(f[2] || 0), secure: !!(f[3] && f[3] !== '--'), known: known.has(ssid), connected: f[0] === '*' };
    const prev = seen.get(ssid);
    if (!prev || n.connected || n.signal > prev.signal) seen.set(ssid, n);
  }
  return [...seen.values()].sort((a, b) => b.connected - a.connected || b.signal - a.signal);
}
const wifiScan = () => detached('nmcli', ['dev', 'wifi', 'rescan']);
async function wifiConnect(ssid) {
  return /success/i.test(await run('nmcli', ['con', 'up', 'id', ssid], 20000));
}

// ---------------------------------------------------------------- display + appearance

const SD_POWER = ['--session', '--dest', 'org.gnome.SettingsDaemon.Power', '--object-path', '/org/gnome/SettingsDaemon/Power'];
async function brightness() {
  const g = /<int32 (\d+)>/.exec(await run('gdbus', ['call', ...SD_POWER, '--method', 'org.freedesktop.DBus.Properties.Get', 'org.gnome.SettingsDaemon.Power.Screen', 'Brightness']));
  if (g && Number(g[1]) >= 0) return Number(g[1]);
  const b = /,(\d+)%,/.exec(await run('brightnessctl', ['-m']));
  return b ? Number(b[1]) : null;
}
async function setBrightness(pct) {
  const p = String(Math.max(1, Math.min(100, Math.round(pct))));
  const ok = await run('gdbus', ['call', ...SD_POWER, '--method', 'org.freedesktop.DBus.Properties.Set', 'org.gnome.SettingsDaemon.Power.Screen', 'Brightness', `<int32 ${p}>`]);
  if (!ok) await run('brightnessctl', ['set', `${p}%`]);
  return brightness();
}

async function darkMode() {
  const out = await run('gsettings', ['get', 'org.gnome.desktop.interface', 'color-scheme']);
  return out ? /dark/.test(out) : null;
}
async function setDarkMode(on) {
  await run('gsettings', ['set', 'org.gnome.desktop.interface', 'color-scheme', on ? 'prefer-dark' : 'default']);
  return darkMode();
}

// Ubuntu's dock (dash-to-dock) stands in for the Windows taskbar
const DOCK = 'org.gnome.shell.extensions.dash-to-dock';
function taskbarAutoHide() {
  return /false/.test(runSync('gsettings', ['get', DOCK, 'dock-fixed']));
}
function setTaskbarAutoHide(on) {
  runSync('gsettings', ['set', DOCK, 'dock-fixed', on ? 'false' : 'true']);
  if (on) runSync('gsettings', ['set', DOCK, 'autohide', 'true']);
  return taskbarAutoHide();
}

// ---------------------------------------------------------------- power + session

const PROFILE = { efficiency: 'power-saver', balanced: 'balanced', performance: 'performance' };
function powerMode() {
  const p = runSync('powerprofilesctl', ['get']).trim();
  return Object.keys(PROFILE).find((k) => PROFILE[k] === p) || null;
}
function setPowerMode(mode) {
  if (PROFILE[mode]) runSync('powerprofilesctl', ['set', PROFILE[mode]], 4000);
  return powerMode();
}
const lock = () => detached('loginctl', ['lock-session']) || detached('xdg-screensaver', ['lock']);

// battery straight from the kernel: { ac, hasBattery, level, charging }
function powerStatus() {
  const base = '/sys/class/power_supply';
  let names = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    return null;
  }
  const read = (n, f) => {
    try {
      return fs.readFileSync(path.join(base, n, f), 'utf8').trim();
    } catch {
      return '';
    }
  };
  const bat = names.find((n) => read(n, 'type') === 'Battery');
  const ac = names.some((n) => read(n, 'type') === 'Mains' && read(n, 'online') === '1');
  if (!bat) return { ac: true, hasBattery: false, level: null, charging: false };
  return { ac, hasBattery: true, level: Number(read(bat, 'capacity')) / 100, charging: read(bat, 'status') === 'Charging' };
}

// ---------------------------------------------------------------- settings pages

const GNOME_PANELS = { wifi: 'wifi', bluetooth: 'bluetooth', display: 'display', sound: 'sound', focus: 'notifications', nightlight: 'display', battery: 'power', power: 'power', settings: '' };
function openSettings(name) {
  if (name === 'screenshot') return detached('gnome-screenshot', ['-i']) || detached('spectacle', []);
  if (DESKTOP.includes('kde')) return detached('systemsettings', []);
  return detached('gnome-control-center', GNOME_PANELS[name] ? [GNOME_PANELS[name]] : []);
}

// ---------------------------------------------------------------- apps (.desktop files)

const APP_DIRS = [
  path.join(HOME, '.local/share/applications'),
  '/usr/local/share/applications',
  '/usr/share/applications',
  '/var/lib/snapd/desktop/applications',
  '/var/lib/flatpak/exports/share/applications',
  path.join(HOME, '.local/share/flatpak/exports/share/applications'),
];

function parseDesktop(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const entry = text.split(/^\[/m).find((s) => s.startsWith('Desktop Entry]'));
  if (!entry) return null;
  const get = (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(entry)?.[1]?.trim() || '';
  if (get('Type') !== 'Application' || /true/i.test(get('NoDisplay')) || /true/i.test(get('Hidden')) || !get('Name')) return null;
  return { id: path.basename(file), name: get('Name'), exec: get('Exec'), icon: get('Icon'), file };
}

// every launchable app, first copy of each id wins (user overrides come first); read once a minute
let appCache = { at: 0, list: [] };
function apps() {
  if (Date.now() - appCache.at < 60000) return appCache.list;
  const byId = new Map();
  for (const dir of APP_DIRS) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith('.desktop'));
    } catch {
      continue;
    }
    for (const n of names) if (!byId.has(n)) byId.set(n, parseDesktop(path.join(dir, n)));
  }
  appCache = { at: Date.now(), list: [...byId.values()].filter(Boolean) };
  return appCache.list;
}

const ICON_ROOTS = ['/usr/share/icons', path.join(HOME, '.local/share/icons'), '/var/lib/flatpak/exports/share/icons', path.join(HOME, '.local/share/flatpak/exports/share/icons')];
const THEMES = ['hicolor', 'Yaru', 'Adwaita', 'breeze', 'Papirus'];
const SIZES = ['256x256', '128x128', '96x96', '64x64', '48x48', 'scalable', '512x512', '32x32'];
const iconFiles = new Map();
function iconFile(name) {
  if (!name) return null;
  if (iconFiles.has(name)) return iconFiles.get(name);
  let found = path.isAbsolute(name) && fs.existsSync(name) ? name : null;
  outer: for (const root of found ? [] : ICON_ROOTS)
    for (const theme of THEMES)
      for (const size of SIZES)
        for (const ext of ['png', 'svg']) {
          const p = path.join(root, theme, size, 'apps', `${name}.${ext}`);
          if (fs.existsSync(p)) {
            found = p;
            break outer;
          }
        }
  if (!found) for (const ext of ['png', 'svg', 'xpm']) if (fs.existsSync(`/usr/share/pixmaps/${name}.${ext}`)) found = `/usr/share/pixmaps/${name}.${ext}`;
  iconFiles.set(name, found);
  return found;
}
function iconDataUrl(name) {
  const f = iconFile(name);
  if (!f || f.endsWith('.xpm')) return null;
  try {
    return `data:${f.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${fs.readFileSync(f).toString('base64')}`;
  } catch {
    return null;
  }
}

// launch by .desktop id (gtk-launch knows snaps and flatpaks too), else run its Exec line
function launchApp(id) {
  const a = apps().find((x) => x.id === id);
  if (detached('gtk-launch', [id.replace(/\.desktop$/, '')])) return true;
  if (!a?.exec) return false;
  const cmd = a.exec.replace(/\s%[a-zA-Z]/g, '').trim();
  return detached('sh', ['-c', cmd]);
}

// the dock's starting apps: whichever of these are installed
const DOCK_PICKS = [
  ['Files', ['org.gnome.Nautilus.desktop', 'org.kde.dolphin.desktop', 'nemo.desktop']],
  ['Browser', ['firefox_firefox.desktop', 'firefox.desktop', 'google-chrome.desktop', 'brave-browser.desktop', 'chromium_chromium.desktop', 'org.mozilla.firefox.desktop']],
  ['Terminal', ['org.gnome.Ptyxis.desktop', 'org.gnome.Terminal.desktop', 'org.gnome.Console.desktop', 'org.kde.konsole.desktop']],
  ['Code', ['code.desktop', 'code_code.desktop', 'com.visualstudio.code.desktop', 'antigravity.desktop']],
  ['Spotify', ['spotify_spotify.desktop', 'spotify.desktop', 'com.spotify.Client.desktop']],
  ['Settings', ['org.gnome.Settings.desktop', 'systemsettings.desktop']],
];
function defaultDock() {
  const ids = new Map(apps().map((a) => [a.id, a]));
  return DOCK_PICKS.map(([, opts]) => opts.map((o) => ids.get(o)).find(Boolean))
    .filter(Boolean)
    .map((a) => ({ name: a.name, target: `desktop:${a.id}`, iconName: a.icon }));
}

// editors for the project switcher
function editor() {
  for (const [name, bin] of [['Antigravity', 'antigravity'], ['VS Code', 'code']]) {
    if (runSync('sh', ['-c', `command -v ${bin}`]).trim()) return { name, exe: bin };
  }
  return null;
}

// ---------------------------------------------------------------- keyboard shortcuts (GNOME)
// On Wayland, apps can't grab global keys, so we add two GNOME custom shortcuts that run the
// CLI instead. Only done when you run `bro shortcuts`; nothing else is touched.

const MK = 'org.gnome.settings-daemon.plugins.media-keys';
const KB_PATH = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/';
function installShortcuts(cli, keys) {
  const list = runSync('gsettings', ['get', MK, 'custom-keybindings']);
  if (!list) return false;
  const paths = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const ours = [
    ['mirage-edit', 'Mirage: rearrange', `${cli} edit`, keys.edit],
    ['mirage-spotlight', 'Mirage: Spotlight', `${cli} spotlight`, keys.spotlight],
  ];
  for (const [id, name, command, binding] of ours) {
    const p = `${KB_PATH}${id}/`;
    if (!paths.includes(p)) paths.push(p);
    const schema = `${MK}.custom-keybinding:${p}`;
    runSync('gsettings', ['set', schema, 'name', name]);
    runSync('gsettings', ['set', schema, 'command', command]);
    runSync('gsettings', ['set', schema, 'binding', binding]);
  }
  runSync('gsettings', ['set', MK, 'custom-keybindings', `[${paths.map((p) => `'${p}'`).join(', ')}]`]);
  return true;
}

// ---------------------------------------------------------------- start at login

function setAutostart(on, electronPath, appRoot) {
  const dir = path.join(HOME, '.config', 'autostart');
  const file = path.join(dir, 'mirage.desktop');
  if (!on) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    file,
    `[Desktop Entry]\nType=Application\nName=Mirage\nComment=Live desktop wallpaper\nExec="${electronPath}" "${appRoot}"\nIcon=${path.join(appRoot, 'assets', 'icon.png')}\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n`,
  );
}

// an app-menu entry with the Mirage logo (opening it while running shows the editor)
function setLauncher(electronPath, appRoot) {
  const dir = path.join(HOME, '.local', 'share', 'applications');
  const file = path.join(dir, 'mirage.desktop');
  // StartupWMClass ties the running window to this entry, so the dock shows Mirage's own icon
  // and name instead of a second, nameless Electron tile next to it
  const body = `[Desktop Entry]\nType=Application\nName=Mirage\nComment=Live desktop wallpaper\nExec="${electronPath}" "${appRoot}"\nIcon=${path.join(appRoot, 'assets', 'icon.png')}\nStartupWMClass=Mirage\nCategories=Utility;\nTerminal=false\n`;
  try {
    if (fs.readFileSync(file, 'utf8') === body) return;
  } catch {}
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, body);
}

// ---------------------------------------------------------------- media (MPRIS over D-Bus)
// The same shape media.ps1 prints on Windows, so media.cjs treats both the same way.

const MP = '/org/mpris/MediaPlayer2';
let players = [];
let playersAt = 0;
let current = '';

async function listPlayers() {
  if (Date.now() - playersAt < 5000) return players;
  const out = await run('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.ListNames'], 3000);
  players = [...out.matchAll(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g)].map((m) => m[1]);
  playersAt = Date.now();
  return players;
}

// pull one value out of gdbus's GVariant text
function gv(text, key) {
  const re = new RegExp(`'${key.replace(/[.:]/g, (c) => `\\${c}`)}': <(?:@\\w+ )?(?:(?:u?int64|int32|uint32|double) )?('((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"|\\[(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")|[-\\d.]+|true|false)`);
  const m = re.exec(text);
  if (!m) return null;
  const s = m[2] ?? m[3] ?? m[4] ?? m[5];
  return s !== undefined ? s.replace(/\\(.)/g, '$1') : m[1];
}

async function mediaState() {
  const names = await listPlayers();
  let best = null;
  for (const name of names) {
    const out = await run('gdbus', ['call', '--session', '--dest', name, '--object-path', MP, '--method', 'org.freedesktop.DBus.Properties.GetAll', 'org.mpris.MediaPlayer2.Player'], 2000);
    if (!out) continue;
    const status = gv(out, 'PlaybackStatus');
    const s = { name, out, status, rank: status === 'Playing' ? 2 : status === 'Paused' ? 1 : 0 };
    if (!best || s.rank > best.rank) best = s;
  }
  if (!best || !best.rank) return { active: false };
  current = best.name;
  const o = best.out;
  const len = Number(gv(o, 'mpris:length') || 0);
  return {
    active: true,
    app: best.name.replace('org.mpris.MediaPlayer2.', '').replace(/\.instance.*$/, ''),
    title: gv(o, 'xesam:title') || '',
    artist: gv(o, 'xesam:artist') || '',
    album: gv(o, 'xesam:album') || '',
    artUrl: gv(o, 'mpris:artUrl') || '',
    playing: best.status === 'Playing',
    status: best.status,
    shuffle: gv(o, 'Shuffle') === 'true',
    repeat: gv(o, 'LoopStatus') === 'Track' ? 1 : gv(o, 'LoopStatus') === 'Playlist' ? 2 : 0,
    position: Number(gv(o, 'Position') || 0) / 1e6,
    duration: len / 1e6,
    updated: Date.now(),
    canSeek: gv(o, 'CanSeek') !== 'false',
    canNext: gv(o, 'CanGoNext') !== 'false',
    canPrev: gv(o, 'CanGoPrevious') !== 'false',
    canShuffle: gv(o, 'Shuffle') !== null,
    canRepeat: gv(o, 'LoopStatus') !== null,
  };
}

// cover art: web URLs as they are, local files (Firefox, VLC…) as data URLs
function artFor(url) {
  if (!url) return null;
  if (/^https?:/.test(url)) return url;
  if (url.startsWith('file://')) {
    try {
      const f = decodeURIComponent(url.slice(7));
      return `data:image/${/\.png$/i.test(f) ? 'png' : 'jpeg'};base64,${fs.readFileSync(f).toString('base64')}`;
    } catch {}
  }
  return null;
}

function mediaCommand(cmd, arg) {
  if (!current) return;
  const call = (method, ...args) => run('gdbus', ['call', '--session', '--dest', current, '--object-path', MP, '--method', `org.mpris.MediaPlayer2.Player.${method}`, ...args]);
  const set = (prop, value) => run('gdbus', ['call', '--session', '--dest', current, '--object-path', MP, '--method', 'org.freedesktop.DBus.Properties.Set', 'org.mpris.MediaPlayer2.Player', prop, value]);
  switch (cmd) {
    case 'toggle':
      return call('PlayPause');
    case 'play':
      return call('Play');
    case 'pause':
      return call('Pause');
    case 'next':
      return call('Next');
    case 'prev':
      return call('Previous');
    case 'seek':
      return mediaState().then((s) => s.active && call('Seek', '--', String(Math.round((Number(arg) - s.position) * 1e6))));
    case 'shuffle':
      return mediaState().then((s) => set('Shuffle', `<${s.shuffle ? 'false' : 'true'}>`));
    case 'repeat':
      return mediaState().then((s) => set('LoopStatus', `<'${['Playlist', 'Track', 'None'][s.repeat] || 'None'}'>`));
    default:
      return null;
  }
}

// media keys from the Control Center map onto the same player commands
function tapKey(name) {
  const map = { playpause: 'toggle', next: 'next', prev: 'prev' };
  if (map[name]) return mediaCommand(map[name]);
}

module.exports = {
  DESKTOP,
  getVolume,
  setVolume,
  setMute,
  audioOutputs,
  setAudioOutput,
  wifi,
  wifiNetworks,
  wifiScan,
  wifiConnect,
  brightness,
  setBrightness,
  darkMode,
  setDarkMode,
  taskbarAutoHide,
  setTaskbarAutoHide,
  powerMode,
  setPowerMode,
  powerStatus,
  lock,
  openSettings,
  apps,
  iconDataUrl,
  launchApp,
  defaultDock,
  editor,
  setAutostart,
  setLauncher,
  installShortcuts,
  mediaState,
  mediaCommand,
  artFor,
  tapKey,
};
