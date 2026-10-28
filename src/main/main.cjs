// The wallpaper app: lives behind your desktop icons. No app window, just a tray icon,
// a hotkey for the visual editor, and a tiny local server for the CLI.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, session, desktopCapturer } = require('electron');
const config = require('../shared/config.cjs');
const brand = require('../shared/brand.cjs');
const { THEMES } = require('../shared/themes.cjs');
const { presetLayout, make } = require('../shared/widgets.cjs');
const desktop = require('./desktop.cjs');
const ipc = require('./ipc.cjs');
const interact = require('./interact.cjs');
const spotlight = require('./spotlight.cjs');
const git = require('./git.cjs');
const native = require('./native.cjs');
const media = require('./media.cjs');
const activity = require('./activity.cjs');
const ai = require('./ai.cjs');
const wrapped = require('./wrapped.cjs');
const organize = require('../shared/organize.cjs');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'src', 'renderer', 'index.html');
const ICON = path.join(ROOT, 'assets', 'tray.png');

// Chromium would otherwise treat a window parented to the desktop as occluded and stop painting.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');
if (process.env.WALL_NO_GPU === '1') app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openEditor());
  app.whenReady().then(boot);
}

let cfg = null;
let lastJson = '';
let tray = null;
let editor = null;
let wallpapers = []; // { win, info, displayId }
let quitting = false;
let rebuildTimer = null;
let activeHotkey = null; // the edit shortcut that actually got registered
let spotlightKey = null; // the Spotlight shortcut that actually got registered
let spot = null; // the Spotlight window (kept hidden between uses so it opens instantly)
let player = null; // the full-screen Now Playing window (also kept warm)

function boot() {
  cfg = config.ensure();
  lastJson = JSON.stringify(cfg);
  ipc.register({ onSave, closeEditor, hotkey: () => activeHotkey, spotlightKey: () => spotlightKey });
  interact.register({
    wallpapers: () => wallpapers,
    editorOpen: () => !!(editor && !editor.isDestroyed()),
    openEditor,
    rebuild: buildWallpapers,
    openSpotlight: showSpotlight,
    openPlayer,
  });
  setupMedia();
  setupExtras();
  activity.start();
  spotlight.startIndexing({ repos: git.repoPaths, action: interact.action, runAction: runSpotlightAction });
  registerSpotlightIpc();
  setTimeout(createSpotlight, 1200);
  buildWallpapers();
  buildTray();
  registerHotkey();
  applyAutostart();
  watchConfig();
  startControlServer();

  screen.on('display-added', scheduleRebuild);
  screen.on('display-removed', scheduleRebuild);
  screen.on('display-metrics-changed', scheduleRebuild);

  // Explorer restarts (or a theme change in Windows) can drop us off the desktop.
  setInterval(() => {
    if (quitting || rebuildTimer) return;
    if (wallpapers.some((w) => w.win.isDestroyed() || (w.info && !desktop.isAttached(w.info)))) scheduleRebuild();
  }, 4000);
}

// ---------- wallpaper windows ----------

function buildWallpapers() {
  destroyWallpapers();
  const primary = screen.getPrimaryDisplay();
  for (const d of screen.getAllDisplays()) {
    const win = new BrowserWindow({
      ...d.bounds,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      // without this Windows keeps an invisible ~8px resize border, leaving gaps at the edges
      thickFrame: false,
      backgroundColor: '#000000',
      // macOS / Linux have a native desktop window level; Windows uses desktop.cjs instead
      ...(process.platform !== 'win32' ? { type: 'desktop' } : {}),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        backgroundThrottling: false,
      },
    });
    const entry = { win, info: null, displayId: d.id };
    logRenderer(win, 'wallpaper');
    wallpapers.push(entry);
    win.loadFile(PAGE, { query: { mode: 'wallpaper', primary: d.id === primary.id ? '1' : '0' } });
    win.once('ready-to-show', () => {
      const px = screen.dipToScreenRect(null, d.bounds);
      try {
        entry.info = desktop.attach(win, px);
        win.showInactive();
        entry.info = desktop.attach(win, px);
      } catch (e) {
        console.error('[wall] could not attach to desktop:', e.message);
        win.showInactive();
      }
    });
    win.on('closed', () => {
      if (!quitting && wallpapers.includes(entry)) scheduleRebuild();
    });
  }
}

function destroyWallpapers() {
  const old = wallpapers;
  wallpapers = [];
  for (const { win } of old) if (!win.isDestroyed()) win.destroy();
  if (old.length) desktop.refreshDesktop();
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    if (!quitting) buildWallpapers();
  }, 800);
}

// Page errors end up in app.log (next to config.json) when started from the CLI.
function logRenderer(win, tag) {
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.error(`[${tag}] ${e.message}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error(`[${tag}] renderer gone: ${d.reason}`));
}

// ---------- editor ----------

function openEditor() {
  if (editor && !editor.isDestroyed()) {
    editor.focus();
    return;
  }
  const d = screen.getPrimaryDisplay();
  editor = new BrowserWindow({
    ...d.bounds,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  editor.setAlwaysOnTop(true, 'screen-saver');
  logRenderer(editor, 'editor');
  editor.loadFile(PAGE, { query: { mode: 'edit', primary: '1' } });
  editor.once('ready-to-show', () => {
    editor.setBounds(d.bounds);
    editor.show();
    editor.focus();
  });
  editor.on('closed', () => (editor = null));
}

function closeEditor() {
  if (editor && !editor.isDestroyed()) editor.close();
}

function toggleEditor() {
  if (editor && !editor.isDestroyed()) closeEditor();
  else openEditor();
}

// ---------- now playing ----------

function setupMedia() {
  media.start();
  media.onChange((s) => sendAll('media:state', s));
  media.onHistory((h) => sendAll('media:history', h));
  ipcMain.handle('media:get', () => media.get());
  ipcMain.handle('media:history', () => media.history());
  ipcMain.handle('media:cmd', (_e, cmd, arg) => media.command(cmd, arg));
  ipcMain.handle('player:open', () => openPlayer());
  ipcMain.handle('player:close', () => hidePlayer());
  // the visualizer listens to whatever the PC is playing (system audio loopback)
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => cb({ video: sources[0], audio: 'loopback' }))
      .catch(() => cb({}));
  });
  setTimeout(createPlayer, 3000);
}

function createPlayer() {
  if (player && !player.isDestroyed()) return player;
  player = new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: false,
    backgroundColor: '#000000',
    title: 'Now Playing',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: true },
  });
  logRenderer(player, 'player');
  player.loadFile(PAGE, { query: { mode: 'player' } });
  player.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    hidePlayer();
  });
  player.on('closed', () => (player = null));
  return player;
}

function openPlayer() {
  const win = createPlayer();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds(d.bounds);
  win.webContents.send('player:show');
  win.show();
  win.setFullScreen(true);
  win.focus();
}

function hidePlayer() {
  if (!player || player.isDestroyed() || !player.isVisible()) return;
  player.webContents.send('player:hidden');
  player.setFullScreen(false);
  player.hide();
}

function sendAll(channel, payload) {
  const wins = [...wallpapers.map((w) => w.win), editor, interact.popupWindow(), player, spot];
  for (const w of wins) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

// ---------- Ask Claude and Wrapped ----------

function setupExtras() {
  ipcMain.handle('ai:ask', (_e, q) => {
    const m = media.get();
    return ai.ask(String(q || '').slice(0, 2000), { song: m.active && m.title ? `${m.title}${m.artist ? ` by ${m.artist}` : ''}` : '' });
  });
  ipcMain.handle('wrapped:data', () => wrapped.data());
  ipcMain.handle('wrapped:save', (_e, rect) => {
    const pop = interact.popupWindow();
    return pop ? wrapped.save(pop, rect) : null;
  });
}

// ---------- spotlight ----------

function createSpotlight() {
  if (spot && !spot.isDestroyed()) return spot;
  spot = new BrowserWindow({
    width: 720,
    height: 96,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  spot.setAlwaysOnTop(true, 'pop-up-menu');
  logRenderer(spot, 'spotlight');
  spot.loadFile(PAGE, { query: { mode: 'spotlight' } });
  spot.on('blur', () => spot && !spot.isDestroyed() && spot.hide());
  spot.on('closed', () => (spot = null));
  return spot;
}

function showSpotlight() {
  const win = createSpotlight();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [w] = win.getSize();
  win.setPosition(Math.round(d.workArea.x + (d.workArea.width - w) / 2), Math.round(d.workArea.y + d.workArea.height * 0.2));
  win.webContents.send('spotlight:show');
  win.show();
  win.focus();
}

function hideSpotlight() {
  if (spot && !spot.isDestroyed()) spot.hide();
}

function toggleSpotlight() {
  if (spot && !spot.isDestroyed() && spot.isVisible()) hideSpotlight();
  else showSpotlight();
}

function runSpotlightAction(name, arg) {
  switch (name) {
    case 'edit':
      return openEditor();
    case 'theme':
      return setTheme(arg, false);
    case 'note-add':
    {
      let id;
      config.update((c) => ((id = organize.addNote(c, arg)), c));
      return id;
    }
    case 'todo-add':
      return config.update((c) => (organize.addTodo(c, arg), c));
    case 'note':
    {
      const w = make('note', 0.42, 0.36);
      config.update((c) => (c.widgets.push(w), c));
      return interact.action('open-widget', w.id);
    }
    default:
      return interact.action(name, arg);
  }
}

function registerSpotlightIpc() {
  ipcMain.handle('spot:search', (_e, q) => spotlight.search(q));
  ipcMain.handle('spot:icons', (_e, items) => spotlight.icons(items));
  ipcMain.handle('spot:open', (_e, item, reveal) => {
    hideSpotlight();
    return spotlight.open(item, reveal);
  });
  ipcMain.handle('spot:hide', () => hideSpotlight());
  ipcMain.handle('spot:resize', (_e, h) => {
    if (spot && !spot.isDestroyed()) spot.setSize(720, Math.max(80, Math.min(640, Math.round(h))));
  });
}

// ---------- config sync ----------

function broadcast(sender) {
  const all = [...wallpapers.map((w) => w.win), editor, interact.popupWindow()].filter((w) => w && !w.isDestroyed());
  for (const w of all) if (w.webContents !== sender) w.webContents.send('config:changed', cfg);
}

function onSave(next, sender) {
  const prevHotkey = cfg?.hotkey;
  const prevAuto = cfg?.autostart;
  cfg = next;
  lastJson = JSON.stringify(cfg);
  broadcast(sender);
  refreshTray();
  if (cfg.hotkey !== prevHotkey) registerHotkey();
  if (cfg.autostart !== prevAuto) applyAutostart();
}

function watchConfig() {
  fs.mkdirSync(config.DIR, { recursive: true });
  let t = null;
  fs.watch(config.DIR, (_ev, file) => {
    if (file && !String(file).startsWith('config.json')) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const next = config.load();
      const json = JSON.stringify(next);
      if (json === lastJson) return;
      onSave(next, null);
    }, 60);
  });
}

function setTheme(id, withLayout) {
  config.update((c) => {
    c.theme = id;
    if (withLayout) c.widgets = presetLayout(id);
    return c;
  });
}

// ---------- tray, hotkey, autostart ----------

function buildTray() {
  let img = nativeImage.createFromPath(ICON);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip(brand.name);
  tray.on('click', openEditor);
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Edit wallpaper', accelerator: activeHotkey || undefined, click: openEditor },
    { label: 'Spotlight search', accelerator: spotlightKey || undefined, click: showSpotlight },
    { label: 'Now Playing', click: openPlayer },
    { label: 'Weekly Wrapped', click: () => interact.action('wrapped') },
    {
      label: 'Theme',
      submenu: THEMES.map((t) => ({
        label: t.name,
        type: 'radio',
        checked: cfg.theme === t.id,
        click: () => setTheme(t.id, false),
      })),
    },
    { label: 'Motion', type: 'checkbox', checked: cfg.motion !== false, click: (i) => config.update((c) => ((c.motion = i.checked), c)) },
    { type: 'separator' },
    { label: 'Reload', click: buildWallpapers },
    { label: `Quit ${brand.name}`, click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// Another app may already own the shortcut, so fall back until one sticks.
function registerHotkey() {
  globalShortcut.unregisterAll();
  activeHotkey = null;
  const candidates = [...new Set([cfg.hotkey || 'Alt+W', 'Alt+W', 'Alt+Shift+W', 'CommandOrControl+Alt+W', 'CommandOrControl+Shift+Alt+E'])];
  for (const accel of candidates) {
    try {
      if (globalShortcut.register(accel, toggleEditor)) {
        activeHotkey = accel;
        console.log(`[wall] edit hotkey: ${accel}`);
        break;
      }
    } catch {}
  }
  if (!activeHotkey) console.error('[wall] no edit hotkey could be registered; use the tray icon or the CLI');

  spotlightKey = null;
  for (const accel of ['CommandOrControl+Space', 'Alt+Space', 'CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space']) {
    try {
      if (globalShortcut.register(accel, toggleSpotlight)) {
        spotlightKey = accel;
        console.log(`[wall] spotlight hotkey: ${accel}`);
        break;
      }
    } catch {}
  }
  refreshTray();
}

function applyAutostart() {
  if (!app.isPackaged && process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: !!cfg.autostart, path: process.execPath, args: [ROOT] });
  } else {
    app.setLoginItemSettings({ openAtLogin: !!cfg.autostart });
  }
}

// ---------- control server for the CLI ----------

function startControlServer() {
  const server = http.createServer((req, res) => {
    // Browsers can't send this header cross-origin without a preflight we never answer.
    if (req.headers['x-wall'] !== '1') {
      res.writeHead(403).end();
      return;
    }
    const reply = (obj) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const url = new URL(req.url, 'http://x');
    // test hook: click an element on the primary wallpaper the same way forwarded clicks do
    if (url.pathname === '/debug-click') {
      const wp = wallpapers.find((w) => !w.win.isDestroyed());
      if (!wp) return reply({ ok: false });
      const sel = url.searchParams.get('sel') || '';
      wp.win.webContents
        .executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)
        .then((pt) => {
          if (!pt) return reply({ ok: false, reason: 'not found' });
          const wc = wp.win.webContents;
          for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) wc.sendInputEvent({ type, x: Math.round(pt.x), y: Math.round(pt.y), button: 'left', clickCount: 1 });
          reply({ ok: true, pt });
        });
      return;
    }
    switch (url.pathname) {
      case '/status':
        return reply({
          running: true,
          pid: process.pid,
          displays: wallpapers.length,
          attached: wallpapers.filter((w) => w.info).map((w) => w.info.mode),
          editing: !!editor,
          hotkey: activeHotkey,
          spotlight: spotlightKey,
          index: spotlight.stats(),
        });
      case '/edit':
        openEditor();
        return reply({ ok: true });
      case '/spotlight':
        showSpotlight();
        return reply({ ok: true });
      case '/wrapped':
        interact.action('wrapped');
        return reply({ ok: true });
      case '/player':
        openPlayer();
        return reply({ ok: true, media: media.get() });
      case '/taskbar-hide':
        return reply({ hidden: native.setTaskbarAutoHide(true) });
      case '/taskbar-show':
        return reply({ hidden: native.setTaskbarAutoHide(false) });
      case '/done':
        closeEditor();
        return reply({ ok: true });
      case '/reload':
        buildWallpapers();
        return reply({ ok: true });
      case '/debug-wall': {
        const wp = wallpapers.find((w) => !w.win.isDestroyed());
        if (!wp) return reply({ ok: false });
        wp.win.webContents
          .executeJavaScript(`(() => { const a = document.querySelector('.music .mu-art'); return { found: !!a, bg: a ? getComputedStyle(a).backgroundImage.slice(0, 60) : null, inline: a ? a.getAttribute('style')?.length : null }; })()`)
          .then((r) => reply(r));
        return;
      }
      case '/debug-shot': {
        const wp = wallpapers.find((w) => !w.win.isDestroyed());
        if (!wp) return reply({ ok: false });
        const target = url.searchParams.get('win') === 'popup' ? interact.popupWindow() : wp.win;
        target.webContents.capturePage().then((img) => {
          const file = path.join(config.DIR, 'debug-shot.png');
          fs.writeFileSync(file, img.resize({ width: 1280 }).toPNG());
          reply({ ok: true, file });
        });
        return;
      }
      case '/debug-media': {
        const m = media.get();
        return reply({ ...m, art: m.art ? `${m.art.slice(0, 40)}… (${m.art.length})` : null });
      }
      case '/debug-state': {
        const pop = interact.popupWindow();
        if (!pop) return reply({ popup: null });
        pop.webContents
          .executeJavaScript(`({ url: location.search, mode: document.documentElement.dataset.mode, html: document.getElementById('chrome').innerHTML.slice(0, 160), chromeH: document.getElementById('chrome').getBoundingClientRect().height, hasWall: typeof window.wall })`)
          .then((page) => reply({ popupVisible: pop.isVisible(), popupBounds: pop.getBounds(), page }))
          .catch((e) => reply({ popupVisible: pop.isVisible(), error: String(e) }));
        return;
      }
      case '/quit':
        reply({ ok: true });
        setTimeout(() => app.quit(), 50);
        return;
      default:
        res.writeHead(404).end();
    }
  });
  server.on('error', (e) => console.error('[wall] control server:', e.message));
  server.listen(config.PORT, '127.0.0.1');
}

// ---------- lifecycle ----------

app.on('window-all-closed', () => {
  // Stay alive in the tray; wallpapers are rebuilt by the watchdog.
});

app.on('before-quit', () => {
  quitting = true;
  media.stop();
  globalShortcut.unregisterAll();
  destroyWallpapers();
});
