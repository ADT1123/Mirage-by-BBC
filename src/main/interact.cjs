// Makes the wallpaper usable even though it lives behind the desktop icons:
//  - forwards mouse moves/clicks on the bare desktop into the wallpaper page
//  - opens small focused popups for things that need typing (notes, to-dos) and for
//    the Control Center, calendar and app menu
//  - launches dock apps and runs system actions

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const native = require('./native.cjs');
const system = require('./system.cjs');
const git = require('./git.cjs');
const linux = process.platform === 'linux' ? require('./linux.cjs') : null;
const config = require('../shared/config.cjs');

const PAGE = path.join(__dirname, '..', 'renderer', 'index.html');
const SIZES = { control: [380, 560], wifi: [324, 420], sound: [324, 360], battery: [324, 340], calendar: [330, 380], menu: [320, 440], settings: [380, 680], wallpapers: [710, 680], widget: [360, 640], weather: [440, 640], projects: [340, 480], wrapped: [400, 760], update: [360, 300], chat: [380, 560] };

let hooks = null;
const t0 = Date.now();
const dbg = (...a) => process.env.WALL_DEBUG && console.log('[popup-dbg]', Date.now() - t0, ...a);
let popup = null;
let popupShownAt = 0;

// ---------------------------------------------------------------- input forwarding

function startForwarding() {
  if (process.platform !== 'win32') return; // other platforms deliver input natively
  let last = { x: -1, y: -1, down: false, over: false, ctrl: false, wc: null };
  let pressed = false;
  const loop = () => setTimeout(() => {
    const busy = step();
    loop.delay = busy ? 16 : 60; // over an app window we only need to notice coming back
    loop();
  }, loop.delay || 16);
  const step = () => {
    if (hooks.editorOpen()) return false;
    let p;
    try {
      p = native.pointer();
    } catch {
      return false;
    }
    const dip = screen.screenToDipPoint({ x: p.x, y: p.y });
    const display = screen.getDisplayNearestPoint(dip);
    const entry = hooks.wallpapers().find((w) => w.displayId === display.id && !w.win.isDestroyed());
    if (!entry) return false;
    const wc = entry.win.webContents;
    const x = Math.round(dip.x - display.bounds.x);
    const y = Math.round(dip.y - display.bounds.y);
    const send = (type) => wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, modifiers: p.ctrl ? ['control'] : [] });

    if (last.wc && last.wc !== wc && !last.wc.isDestroyed()) last.wc.sendInputEvent({ type: 'mouseMove', x: -50, y: -50 });

    // a press anywhere outside an open popup closes it
    if (p.down && !last.down && popup && !popup.isDestroyed() && popup.isVisible()) {
      const pb = popup.getBounds();
      const inside = dip.x >= pb.x && dip.x <= pb.x + pb.width && dip.y >= pb.y && dip.y <= pb.y + pb.height;
      if (!inside) closePopup('outside');
    }

    if (p.overDesktop) {
      if (x !== last.x || y !== last.y || !last.over || p.ctrl !== last.ctrl) send('mouseMove');
      if (p.down && !last.down) {
        send('mouseDown');
        pressed = true;
      } else if (!p.down && last.down && pressed) {
        send('mouseUp');
        pressed = false;
      }
    } else if (last.over) {
      // cursor left the desktop (onto an app window): clear hover states
      wc.sendInputEvent({ type: 'mouseMove', x: -50, y: -50 });
      if (pressed) wc.sendInputEvent({ type: 'mouseUp', x: -50, y: -50, button: 'left', clickCount: 1 });
      pressed = false;
    }
    last = { x, y, down: p.down, over: p.overDesktop, ctrl: p.ctrl, wc };
    return p.overDesktop || p.down || !!(popup && !popup.isDestroyed() && popup.isVisible());
  };
  loop();
}

// ---------------------------------------------------------------- popups

// One popup window is created up front and reused, so popups open instantly. The page
// renders the requested view first and only then asks to be shown (no flash, no jump).
let popupReady = false;
let pendingShow = null;
let revealTimer = null;
let popupFocused = false;
let popupView = '';
let lastClosed = { at: 0, view: '', reason: '' };

function ensurePopup() {
  if (popup && !popup.isDestroyed()) return popup;
  popupReady = false;
  popup = new BrowserWindow({
    icon: path.join(__dirname, '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    width: 360,
    height: 400,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  });
  const win = popup;
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.error(`[popup] ${e.message}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error(`[popup] renderer gone: ${d.reason}`));
  win.loadFile(PAGE, { query: { mode: 'popup' } });
  win.webContents.once('did-finish-load', () => {
    popupReady = true;
    const go = pendingShow;
    pendingShow = null;
    go?.();
  });
  // blur only counts once the popup really had focus, and never right after opening
  win.on('focus', () => (popupFocused = true));
  win.on('blur', () => {
    dbg('blur', Date.now() - popupShownAt, popupFocused);
    if (!popupFocused || Date.now() - popupShownAt < 600) return;
    closePopup('blur');
  });
  win.on('closed', () => {
    if (popup === win) popup = null;
  });
  return win;
}

function closePopup(reason = '') {
  dbg('closePopup', reason, popup?.isVisible?.());
  if (popup && !popup.isDestroyed() && popup.isVisible()) {
    lastClosed = { at: Date.now(), view: popupView, reason };
    popupFocused = false;
    popup.hide();
    popup.webContents.send('popup:hidden');
  }
}

// anchor: rect in the sender's page coordinates (CSS px), for note/todo popups
function openPopup(sender, view, data = {}) {
  // clicking the same menu-bar item again closes it (the press already did), like macOS
  if (lastClosed.reason === 'outside' && lastClosed.view === view && Date.now() - lastClosed.at < 400 && !data.anchor) return;
  closePopup('reopen');
  popupView = view;
  const host = sender ? BrowserWindow.fromWebContents(sender) : null;
  const display = host ? screen.getDisplayMatching(host.getBounds()) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const b = display.bounds;
  let x;
  let y;
  let width;
  let height;
  if (data.anchor) {
    const pad = 28;
    width = Math.round(data.anchor.w + pad * 2);
    height = Math.round(data.anchor.h + pad * 2 + 56);
    x = Math.round(b.x + data.anchor.x - pad);
    y = Math.round(b.y + data.anchor.y - pad);
  } else {
    [width, height] = SIZES[view] || [360, 420];
    if (data.center) data = { ...data, x: Math.round((b.width - width) / 2), y: Math.round(Math.max(36, (b.height - height) / 2)) };
    const right = data.at === 'left' ? b.x + 10 : b.x + b.width - width - 10;
    x = Math.round(data.x != null ? b.x + data.x : right);
    y = Math.round(b.y + (data.y ?? 34));
  }
  x = Math.max(b.x, Math.min(x, b.x + b.width - width));
  y = Math.max(b.y, Math.min(y, b.y + b.height - height));

  const win = ensurePopup();
  const go = () => {
    dbg('go', view);
    win.setBounds({ x, y, width, height });
    win.webContents.send('popup:show', { view, id: data.id || '', scale: data.scale || 1 });
    // safety net: if the page doesn't answer quickly, show it anyway
    clearTimeout(revealTimer);
    revealTimer = setTimeout(revealPopup, 600);
  };
  if (popupReady) go();
  else pendingShow = go;
}

// the page rendered its view and sized itself: now reveal it
function revealPopup() {
  dbg('reveal', popup?.isVisible?.());
  clearTimeout(revealTimer);
  if (!popup || popup.isDestroyed() || popup.isVisible()) return;
  popupShownAt = Date.now();
  popup.show();
  popup.focus();
}

// ---------------------------------------------------------------- system state cache
// Brightness/Wi-Fi reads take ~0.5s, so answer instantly from cache and refresh behind.

let sysCache = null;
let sysRefreshing = null;
function refreshSystem() {
  if (!sysRefreshing) {
    sysRefreshing = system
      .state()
      .then((s) => {
        sysCache = s;
        if (popup && !popup.isDestroyed()) popup.webContents.send('sys:update', s);
        return s;
      })
      .finally(() => (sysRefreshing = null));
  }
  return sysRefreshing;
}

async function systemState() {
  if (!sysCache) return refreshSystem();
  refreshSystem();
  return { ...sysCache, volume: native.getVolume() ?? sysCache.volume };
}

// ---------------------------------------------------------------- dock

const ENV = (k) => process.env[k] || '';

// Projects open in Antigravity when it's installed, otherwise VS Code.
function editor() {
  if (linux) return linux.editor();
  const local = path.join(ENV('LOCALAPPDATA'), 'Programs');
  const candidates = [
    { name: 'Antigravity', exe: path.join(local, 'Antigravity IDE', 'Antigravity IDE.exe') },
    { name: 'Antigravity', exe: path.join(local, 'Antigravity', 'Antigravity.exe') },
    { name: 'VS Code', exe: path.join(local, 'Microsoft VS Code', 'Code.exe') },
    { name: 'VS Code', exe: path.join(ENV('ProgramFiles'), 'Microsoft VS Code', 'Code.exe') },
  ];
  return candidates.find((c) => fs.existsSync(c.exe)) || null;
}

// every repo we know about, most recently touched first
function projects() {
  const when = (p) => {
    for (const f of ['.git/logs/HEAD', '.git/index', '.git/HEAD']) {
      try {
        return fs.statSync(path.join(p, f)).mtimeMs;
      } catch {}
    }
    return 0;
  };
  const list = git
    .repoPaths()
    .map((p) => ({ name: path.basename(p), path: p, at: when(p) }))
    .sort((a, b) => b.at - a.at);
  return { editor: editor()?.name || 'Explorer', list };
}
function candidates() {
  const pf = ENV('ProgramFiles') || 'C:\\Program Files';
  const pf86 = ENV('ProgramFiles(x86)') || 'C:\\Program Files (x86)';
  const local = ENV('LOCALAPPDATA');
  const roaming = ENV('APPDATA');
  const win = ENV('SystemRoot') || 'C:\\Windows';
  return [
    { name: 'Files', paths: [path.join(win, 'explorer.exe')] },
    { name: 'Chrome', paths: [path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'), path.join(local, 'Google\\Chrome\\Application\\chrome.exe')] },
    { name: 'Edge', paths: [path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')] },
    { name: 'Brave', paths: [path.join(pf, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'), path.join(local, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')] },
    { name: 'VS Code', paths: [path.join(local, 'Programs\\Microsoft VS Code\\Code.exe'), path.join(pf, 'Microsoft VS Code\\Code.exe')] },
    { name: 'Cursor', paths: [path.join(local, 'Programs\\cursor\\Cursor.exe')] },
    { name: 'Spotify', paths: [path.join(roaming, 'Spotify\\Spotify.exe')] },
    { name: 'Notepad', paths: [path.join(win, 'System32\\notepad.exe')] },
    { name: 'Calculator', paths: [path.join(win, 'System32\\calc.exe')] },
    { name: 'Settings', paths: ['ms-settings:'] },
  ];
}

function defaultDock() {
  if (linux) return linux.defaultDock();
  const found = [];
  const browsers = new Set(['Chrome', 'Edge', 'Brave']);
  let browserAdded = false;
  for (const c of candidates()) {
    const p = c.paths.find((x) => x.endsWith(':') || fs.existsSync(x));
    if (!p) continue;
    if (browsers.has(c.name)) {
      if (browserAdded) continue;
      browserAdded = true;
    }
    found.push({ name: c.name, target: p });
  }
  return found;
}

const iconCache = new Map();
async function iconFor(target) {
  if (iconCache.has(target)) return iconCache.get(target);
  let url = null;
  if (linux && String(target).startsWith('desktop:')) {
    const a = linux.apps().find((x) => x.id === target.slice(8));
    url = a ? linux.iconDataUrl(a.icon) : null;
    iconCache.set(target, url);
    return url;
  }
  if (!/^[a-z-]+:$/i.test(target) && fs.existsSync(target)) {
    try {
      url = (await app.getFileIcon(target, { size: 'large' })).toDataURL();
    } catch {}
  }
  iconCache.set(target, url);
  return url;
}

async function dockApps() {
  const cfg = config.load();
  const list = Array.isArray(cfg.dock) && cfg.dock.length ? cfg.dock : defaultDock();
  return Promise.all(list.map(async (a) => ({ ...a, icon: await iconFor(a.target) })));
}

function launch(target) {
  if (!target) return;
  if (linux && target.startsWith('desktop:')) return linux.launchApp(target.slice(8));
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:\\/i.test(target)) return shell.openExternal(target);
  return shell.openPath(target);
}

// ---------------------------------------------------------------- actions

const SETTINGS = {
  wifi: 'ms-settings:network-wifi',
  bluetooth: 'ms-settings:bluetooth',
  display: 'ms-settings:display',
  sound: 'ms-settings:sound',
  focus: 'ms-settings:notifications',
  nightlight: 'ms-settings:nightlight',
  battery: 'ms-settings:batterysaver',
  power: 'ms-settings:powersleep',
  settings: 'ms-settings:',
  screenshot: 'ms-screenclip:',
};

async function action(name, arg) {
  if (SETTINGS[name]) {
    closePopup();
    if (linux) return linux.openSettings(name);
    return shell.openExternal(SETTINGS[name]);
  }
  switch (name) {
    case 'lock':
      closePopup();
      return native.lock();
    case 'media':
      return native.tapKey(arg);
    case 'edit':
      closePopup();
      return hooks.openEditor();
    case 'quit':
      return app.quit();
    case 'restart':
      closePopup();
      return hooks.rebuild();
    case 'relaunch':
      // some settings (the GPU) only apply to a fresh process
      closePopup();
      return setTimeout(() => (app.relaunch(), app.exit(0)), 300);
    case 'url':
      closePopup();
      return /^https?:\/\//.test(arg) ? shell.openExternal(arg) : null;
    case 'repo': {
      closePopup();
      if (!arg || !fs.existsSync(arg)) return null;
      const ide = editor();
      if (ide) return require('child_process').spawn(ide.exe, [arg], { detached: true, stdio: 'ignore' }).unref();
      return shell.openPath(arg);
    }
    case 'open-photo':
      closePopup();
      return arg && /\.(jpe?g|png|webp|heic|gif)$/i.test(arg) && fs.existsSync(arg) ? shell.openPath(arg) : null;
    case 'reveal':
      closePopup();
      return arg && fs.existsSync(arg) ? shell.openPath(arg) : null;
    case 'launch':
      return launch(arg);
    case 'spotlight':
      closePopup();
      return hooks.openSpotlight?.();
    case 'player':
      closePopup();
      return hooks.openPlayer?.();
    case 'wrapped':
      return openPopup(null, 'wrapped', { center: true });
    case 'update':
      return openPopup(null, 'update', { center: true });
    case 'weather-panel':
      return openPopup(null, 'weather', { center: true });
    case 'settings-panel':
      return openPopup(null, 'settings', { y: 34 });
    case 'toggle-dark': {
      const s = await systemState();
      return setSystem('dark', !s?.dark);
    }
    case 'open-widget':
      // ask the wallpaper to open the in-place editor for a (new) widget once it has rendered
      setTimeout(() => hooks.wallpapers().forEach((w) => !w.win.isDestroyed() && w.win.webContents.send('live:open', arg)), 250);
      return null;
    default:
      return null;
  }
}

async function setSystem(key, value) {
  setTimeout(refreshSystem, 400); // keep the cache honest after a change
  switch (key) {
    case 'volume':
      return native.setVolume(Number(value));
    case 'mute':
      return native.setMute(!!value);
    case 'brightness':
      return system.setBrightness(Number(value));
    case 'dark':
      return system.setDarkMode(!!value);
    case 'taskbar':
      return native.setTaskbarAutoHide(!!value);
    case 'power':
      return native.setPowerMode(String(value));
    case 'wifi-join':
      return system.wifiConnect(String(value));
    case 'audio-out':
      return system.setAudioOutput(String(value));
    default:
      return null;
  }
}

function register(h) {
  hooks = h;
  ipcMain.handle('popup:open', (e, view, data) => openPopup(e.sender, view, data));
  ipcMain.handle('popup:close', () => closePopup());
  ipcMain.handle('popup:ready', () => revealPopup());
  ipcMain.handle('popup:resize', (e, w, h2) => {
    dbg('resize', w, h2);
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && win === popup) {
      // keep it on screen: move it up if it grows past the bottom, cap it at the screen height
      const b = win.getBounds();
      const wa = screen.getDisplayMatching(b).workArea;
      const height = Math.min(Math.round(h2), wa.height - 16);
      const y = Math.max(wa.y + 8, Math.min(b.y, wa.y + wa.height - height - 8));
      const width = Math.min(Math.round(w), wa.width - 16);
      const x = Math.max(wa.x + 8, Math.min(b.x, wa.x + wa.width - width - 8));
      win.setBounds({ x, y, width, height });
    }
  });
  ipcMain.handle('sys:state', () => systemState());
  ipcMain.handle('sys:set', (_e, key, value) => setSystem(key, value));
  ipcMain.handle('sys:action', (_e, name, arg) => action(name, arg));
  ipcMain.handle('dock:apps', () => dockApps());
  ipcMain.handle('projects:list', () => projects());
  // Control Center dropdowns
  ipcMain.handle('cc:scan', async () => {
    native.wifiScan();
    await new Promise((r) => setTimeout(r, 3500)); // a scan takes a few seconds
    return system.wifiNetworks();
  });
  ipcMain.handle('cc:list', (_e, what) => (what === 'wifi' ? system.wifiNetworks() : what === 'audio' ? system.audioOutputs() : what === 'power' ? native.powerMode() : null));
  startForwarding();
  setTimeout(() => {
    ensurePopup();
    refreshSystem();
  }, 2500);
}

const popupWindow = () => (popup && !popup.isDestroyed() ? popup : null);

module.exports = { register, closePopup, popupWindow, defaultDock, action };
