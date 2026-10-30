// The wallpaper app: lives behind your desktop icons. No app window, just a tray icon,
// a hotkey for the visual editor, and a tiny local server for the CLI.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { app, BrowserWindow, screen, Tray, Menu, nativeImage, globalShortcut, ipcMain, session, desktopCapturer } = require('electron');
const config = require('../shared/config.cjs');
const brand = require('../shared/brand.cjs');
const { THEMES } = require('../shared/themes.cjs');
const { PACKS, wallsIn, wallById } = require('../shared/packs.cjs');
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
const updater = require('./updater.cjs');
const reminders = require('./reminders.cjs');
const lyrics = require('./lyrics.cjs');
const { Notification } = require('electron');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = path.join(ROOT, 'src', 'renderer', 'index.html');
const ICON = path.join(ROOT, 'assets', 'tray.png');

// Chromium would otherwise treat a window parented to the desktop as occluded and stop painting.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-background-timer-throttling');
if (process.env.WALL_NO_GPU === '1') app.disableHardwareAcceleration();
// Laptops with two GPUs (Intel + NVIDIA/AMD): Chromium takes the power-saving one unless it is
// asked at startup. Settings > Graphics picks; changing it restarts Mirage.
try {
  if ((config.load().gpu ?? 'dedicated') === 'dedicated') app.commandLine.appendSwitch('force_high_performance_gpu');
} catch {}
// Linux: run through X11/XWayland (GNOME and KDE honor the "desktop" window type there,
// including on Wayland sessions like Ubuntu 26.04), with see-through popups.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

// Every window is a sandboxed renderer: page code only reaches the app through preload.cjs,
// can't open new windows, and can't navigate away from Mirage's own pages.
app.enableSandbox();
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
});

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
  setupUpdates();
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
    else for (const w of wallpapers) desktop.raise(w.info); // stay above other wallpaper apps
  }, 4000);

  // rest (no animation at all) while a maximized/fullscreen app hides the wallpaper, or the PC is locked
  let locked = false;
  const { powerMonitor } = require('electron');
  powerMonitor.on('lock-screen', () => ((locked = true), checkHidden()));
  powerMonitor.on('unlock-screen', () => ((locked = false), checkHidden()));
  powerMonitor.on('suspend', () => ((locked = true), checkHidden()));
  powerMonitor.on('resume', () => ((locked = false), checkHidden()));
  function checkHidden() {
    const own = [editor, spot, player, interact.popupWindow()].filter((w) => w && !w.isDestroyed()).map((w) => desktop.hwndOf(w));
    const mon = locked ? null : native.coveredMonitor(own);
    for (const w of wallpapers) {
      if (w.win.isDestroyed()) continue;
      const b = screen.dipToScreenRect(null, w.win.getBounds());
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const hidden = locked || !!(mon && cx >= mon.left && cx <= mon.right && cy >= mon.top && cy <= mon.bottom);
      if (w.hidden !== hidden) {
        w.hidden = hidden;
        w.win.webContents.send('wall:hidden', hidden);
      }
    }
  }
  setInterval(checkHidden, 1500);
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
    // Linux desktops keep their own top panel over the wallpaper: start our menu bar below it
    const inset = process.platform === 'linux' ? Math.max(0, d.workArea.y - d.bounds.y) : 0;
    win.loadFile(PAGE, { query: { mode: 'wallpaper', primary: d.id === primary.id ? '1' : '0', inset: String(inset) } });
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
    if (e.level === 'error' || e.level === 'warning' || process.env.WALL_DEBUG === '1') console.error(`[${tag}] ${e.level}: ${e.message}`);
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
  ipcMain.handle('media:lyrics', (_e, track) => lyrics.get(track || {}));
  ipcMain.handle('media:cmd', (_e, cmd, arg) => media.command(cmd, arg));
  ipcMain.handle('player:open', () => openPlayer());
  ipcMain.handle('player:close', () => hidePlayer());
  ipcMain.handle('player:painted', () => revealPlayer?.());
  // the visualizer listens to whatever the PC is playing (system audio loopback)
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => cb({ video: sources[0], audio: 'loopback' }))
      .catch(() => cb({}));
  });
  // the player window is created the first time it's opened (saves memory on small laptops)
}

function createPlayer() {
  if (player && !player.isDestroyed()) return player;
  player = new BrowserWindow({
    show: false,
    frame: false,
    thickFrame: false, // no invisible resize border, so it covers the screen edge to edge
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

// A borderless window covering the whole screen (native fullscreen flashed grey and could hide
// itself). It stays invisible until the page says it has drawn a frame.
let revealPlayer = null;
function openPlayer() {
  const win = createPlayer();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (!win.isVisible()) win.setOpacity(0);
  win.setBounds(d.bounds);
  win.show();
  win.setBounds(d.bounds); // again, after show, in case Windows nudged it
  win.focus();
  win.webContents.send('player:show');
  const timer = setTimeout(() => revealPlayer?.(), 1500); // safety net if the page is slow
  revealPlayer = () => {
    clearTimeout(timer);
    revealPlayer = null;
    if (!win.isDestroyed()) win.setOpacity(1);
  };
}

function hidePlayer() {
  if (!player || player.isDestroyed() || !player.isVisible()) return;
  player.webContents.send('player:hidden');
  player.hide();
}

function sendAll(channel, payload) {
  const wins = [...wallpapers.map((w) => w.win), editor, interact.popupWindow(), player, spot];
  for (const w of wins) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

// ---------- Ask AI and Wrapped ----------

function setupExtras() {
  ipcMain.handle('ai:ask', async (_e, q) => ai.ask(String(q || '').slice(0, 2000), await aiContext(), [], aiHooks));
  // ✨ in a sticky note: polish / summarize it in place, or turn it into to-dos
  ipcMain.handle('ai:note', async (_e, mode, text) => {
    const body = String(text || '').slice(0, 4000);
    const prompts = {
      polish: `Rewrite this sticky note so it's clearer and well organized. Keep the meaning and the language, keep it short. Put only the new note text in "reply".\n\n"""${body}"""`,
      summarize: `Summarize this sticky note in 1-3 short lines. Put only the summary in "reply".\n\n"""${body}"""`,
      todos: `Turn this note into to-do items using add_todo actions (one per task). Reply with one short sentence.\n\n"""${body}"""`,
    };
    if (!prompts[mode]) return { ok: false };
    return ai.ask(prompts[mode], await aiContext(), [], aiHooks);
  });
  reminders.start((r) => {
    if (Notification.isSupported()) new Notification({ title: 'Reminder', body: r.text, icon: path.join(ROOT, 'assets', 'icon.png') }).show();
  });
  ipcMain.handle('wrapped:data', () => wrapped.data());

  // the Assistant widget: a running conversation, kept on disk so it survives restarts
  const CHAT = path.join(config.DIR, 'chat.json');
  let chat = [];
  try {
    chat = JSON.parse(fs.readFileSync(CHAT, 'utf8'));
  } catch {}
  const saveChat = () => {
    chat = chat.slice(-40);
    try {
      fs.writeFileSync(CHAT, JSON.stringify(chat));
    } catch {}
  };
  ipcMain.handle('chat:history', () => chat);
  ipcMain.handle('chat:clear', () => {
    chat = [];
    saveChat();
    return chat;
  });
  ipcMain.handle('chat:send', async (_e, text) => {
    const q = String(text || '').trim().slice(0, 2000);
    if (!q) return chat;
    const r = await ai.ask(q, await aiContext(), chat, aiHooks);
    chat.push({ role: 'user', text: q, at: Date.now() }, { role: 'assistant', text: r.reply, done: r.done || [], error: !r.ok, at: Date.now() });
    saveChat();
    return chat;
  });

  // shortcuts: is this combination free?
  ipcMain.handle('hotkey:test', (_e, accel, which) => testHotkey(accel, which));
  ipcMain.handle('wrapped:save', (_e, rect) => {
    const pop = interact.popupWindow();
    return pop ? wrapped.save(pop, rect) : null;
  });
}

// What the Assistant can see: a short, current snapshot of your desktop
async function aiContext() {
  const c = config.load();
  const m = media.get();
  const out = {};
  if (m.active && m.title) out.song = `${m.title}${m.artist ? ` by ${m.artist}` : ''} (${m.playing ? 'playing' : 'paused'} in ${m.appName || 'a player'})`;
  const timeout = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), 2500))]);
  const [wx, git, stk] = await Promise.all([
    timeout(require('./weather.cjs').get(c)).catch(() => null),
    timeout(require('./git.cjs').get(c)).catch(() => null),
    (() => {
      const syms = c.widgets.filter((w) => w.type === 'stocks').flatMap((w) => w.symbols || []);
      return syms.length ? timeout(require('./stocks.cjs').quotes(syms)).catch(() => null) : null;
    })(),
  ]);
  if (wx?.ok) {
    out.weather = `${wx.city}: ${wx.temp}°C, ${wx.label}, feels ${wx.feels}°, high ${wx.high}° low ${wx.low}°, humidity ${wx.humidity}%`;
    const fc = await timeout(require('./weather.cjs').forecast(c)).catch(() => null);
    const hours = (fc?.hourly || []).slice(0, 12);
    if (hours.length) {
      const wet = hours.reduce((a, h) => ((h.rain ?? 0) > (a.rain ?? 0) ? h : a), hours[0]);
      out.weather += (wet.rain ?? 0) > 0 ? `; rain chance next 12h up to ${wet.rain}% (around ${String(wet.hour).padStart(2, '0')}:00)` : '; no rain expected in the next 12 hours';
    }
  }
  if (git?.recent?.length) {
    const todayKey = new Date().toDateString();
    const today = git.recent.filter((r) => new Date(r.time).toDateString() === todayKey).length;
    out.commits = `${today} commits today; latest "${git.recent[0].message}" in ${git.recent[0].repo}`;
  }
  if (stk?.items?.length) out.stocks = stk.items.filter((s) => !s.error).map((s) => `${s.name} ${s.price.toFixed(2)} (${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(2)}%)`).join('; ');
  const p = native.powerStatus?.();
  if (p?.hasBattery) out.battery = `${Math.round((p.level || 0) * 100)}%${p.ac ? ', plugged in' : ', on battery'}`;
  const up = reminders.upcoming().slice(0, 5);
  if (up.length) out.reminders = up.map((r) => `${r.text} at ${new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`).join('; ');
  return out;
}

// What the Assistant can do beyond your notes and settings
const aiHooks = {
  music: (a) => {
    const cmd = { play: 'play', pause: 'pause', toggle: 'toggle', next: 'next', previous: 'prev', prev: 'prev' }[String(a.text).toLowerCase()];
    if (!cmd || !media.get().active) return null;
    media.command(cmd);
    return `Music: ${a.text}`;
  },
  set_volume: (a) => {
    const v = Math.max(0, Math.min(100, Number(a.index)));
    if (!Number.isFinite(v) || a.index < 0) return null;
    native.setVolume(v);
    return `Volume ${v}%`;
  },
  open_app: (a) => {
    const hit = spotlight.search(String(a.text || '')).find((r) => r.kind === 'app');
    if (!hit) return `Couldn't find an app called "${a.text}"`;
    spotlight.open(hit);
    return `Opened ${hit.title}`;
  },
  open_url: (a) => {
    const t = String(a.text || '').trim();
    if (!t) return null;
    const url = /^https?:\/\//i.test(t) ? t : `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    require('electron').shell.openExternal(url);
    return /^https?:/i.test(t) ? `Opened ${new URL(url).hostname}` : `Searched the web for "${t}"`;
  },
  remind: (a) => {
    const r = reminders.add(a.text, a.date);
    return r ? `Reminder: ${r.text}, ${new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `Couldn't set that reminder (time unclear)`;
  },
};

// ---------- updates ----------

function setupUpdates() {
  updater.start();
  updater.onAvailable((s) => {
    sendAll('update:status', s);
    refreshTray();
    if (Notification.isSupported()) {
      const n = new Notification({ title: `${brand.name} update available`, body: s.changes[0] ? `What's new: ${s.changes[0]}` : 'Click to update', icon: path.join(ROOT, 'assets', 'icon.png') });
      n.on('click', () => interact.action('update'));
      n.show();
    }
  });
  ipcMain.handle('update:status', () => updater.status());
  ipcMain.handle('update:check', async () => {
    const s = await updater.check();
    sendAll('update:status', s);
    refreshTray();
    return s;
  });
  ipcMain.handle('update:apply', async () => {
    const r = await updater.apply();
    if (r.ok) setTimeout(() => (app.relaunch(), app.exit(0)), 800); // restart into the new version
    return r;
  });
}

// ---------- shortcuts ----------

const COMMON = { 'Ctrl+C': 'Copy', 'Ctrl+V': 'Paste', 'Ctrl+X': 'Cut', 'Ctrl+Z': 'Undo', 'Ctrl+A': 'Select all', 'Ctrl+S': 'Save', 'Ctrl+F': 'Find', 'Ctrl+T': 'New tab', 'Ctrl+W': 'Close tab', 'Alt+F4': 'Close window', 'Alt+Tab': 'Switch apps' };
function testHotkey(accel, which) {
  const show = (a) => String(a || '').replace('CommandOrControl', 'Ctrl');
  const mine = which === 'spotlight' ? spotlightKey : activeHotkey;
  const other = which === 'spotlight' ? activeHotkey : spotlightKey;
  if (!accel) return { ok: false, reason: 'Press a key combination' };
  if (show(accel) === show(other)) return { ok: false, reason: `Already used for ${which === 'spotlight' ? 'Rearrange' : 'Spotlight'}` };
  if (show(accel) === show(mine)) return { ok: true, note: 'This is your current shortcut' };
  if (COMMON[show(accel)]) return { ok: false, reason: `Windows and most apps use this for ${COMMON[show(accel)]}` };
  try {
    if (!globalShortcut.register(accel, () => {})) return { ok: false, reason: 'Another app is already using this shortcut' };
    globalShortcut.unregister(accel);
    return { ok: true, note: 'Free, nothing else uses it' };
  } catch {
    return { ok: false, reason: 'That key combination is not supported' };
  }
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
  ai.warm(); // the local model loads while you type
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
    case 'wall':
      return setWall(arg);
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
  const all = [...wallpapers.map((w) => w.win), editor, interact.popupWindow(), spot, player].filter((w) => w && !w.isDestroyed());
  for (const w of all) if (w.webContents !== sender) w.webContents.send('config:changed', cfg);
}

function onSave(next, sender) {
  const prevHotkey = cfg?.hotkey;
  const prevSpot = cfg?.spotlightHotkey;
  const prevAuto = cfg?.autostart;
  cfg = next;
  lastJson = JSON.stringify(cfg);
  broadcast(sender);
  refreshTray();
  if (cfg.hotkey !== prevHotkey || cfg.spotlightHotkey !== prevSpot) registerHotkey();
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

function setWall(id) {
  const w = wallById(id);
  if (!w) return;
  config.update((c) => {
    c.wall = w.id;
    c.theme = w.skin;
    return c;
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
    updater.status().available ? { label: `Update available (${updater.status().behind} new)…`, click: () => interact.action('update') } : { label: 'Check for updates', click: () => interact.action('update') },
    {
      label: 'Wallpaper',
      submenu: PACKS.map((p) => ({
        label: p.name,
        submenu: wallsIn(p.id).map((w) => ({ label: w.name, type: 'radio', checked: cfg.wall === w.id, click: () => setWall(w.id) })),
      })),
    },
    {
      label: 'Widget style',
      submenu: THEMES.map((t) => ({
        label: t.name,
        type: 'radio',
        checked: cfg.theme === t.id,
        click: () => setTheme(t.id, false),
      })),
    },
    { label: 'Motion', type: 'checkbox', checked: cfg.motion !== false, click: (i) => config.update((c) => ((c.motion = i.checked), c)) },
    { type: 'separator' },
    { label: 'Restart wallpaper', click: buildWallpapers },
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
  for (const accel of [...new Set([cfg.spotlightHotkey || 'CommandOrControl+Space', 'CommandOrControl+Space', 'Alt+Space', 'CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space'])]) {
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
  if (process.platform === 'linux') return require('./linux.cjs').setAutostart(!!cfg.autostart, process.execPath, ROOT);
  if (!app.isPackaged && process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: !!cfg.autostart, path: process.execPath, args: [ROOT] });
  } else {
    app.setLoginItemSettings({ openAtLogin: !!cfg.autostart });
  }
}

// ---------- control server for the CLI ----------

function startControlServer() {
  const server = http.createServer((req, res) => {
    // Browsers can't send this header cross-origin without a preflight we never answer,
    // and the Host check stops web pages that re-point their own domain at 127.0.0.1.
    if (req.headers['x-wall'] !== '1' || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(req.headers.host || ''))) {
      res.writeHead(403).end();
      return;
    }
    const reply = (obj) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const url = new URL(req.url, 'http://x');
    // test hooks exist only when started with WALL_DEBUG=1
    if (url.pathname.startsWith('/debug') && process.env.WALL_DEBUG !== '1') {
      res.writeHead(404).end();
      return;
    }
    // test hook: click an element on the primary wallpaper the same way forwarded clicks do
    if (url.pathname === '/debug-click') {
      const wp = wallpapers.find((w) => !w.win.isDestroyed());
      if (!wp) return reply({ ok: false });
      // ?x=..&y=..: just move the mouse there (tests hover behaviour)
      if (url.searchParams.has('y')) {
        wp.win.webContents.sendInputEvent({ type: 'mouseMove', x: Number(url.searchParams.get('x')) || 400, y: Number(url.searchParams.get('y')) });
        return reply({ ok: true });
      }
      const sel = url.searchParams.get('sel') || '';
      wp.win.webContents
        .executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`)
        .then((pt) => {
          if (!pt) return reply({ ok: false, reason: 'not found' });
          const wc = wp.win.webContents;
          for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) wc.sendInputEvent({ type, x: Math.round(pt.x), y: Math.round(pt.y), button: 'left', clickCount: 1, modifiers: ['control'] });
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
          player: player && !player.isDestroyed() ? { visible: player.isVisible(), opacity: player.getOpacity(), min: player.isMinimized(), fs: player.isFullScreen(), focused: player.isFocused(), bounds: player.getBounds() } : null,
        });
      case '/edit':
        openEditor();
        return reply({ ok: true });
      case '/spotlight':
        showSpotlight();
        return reply({ ok: true });
      case '/update-check':
        updater.check().then((s) => (sendAll('update:status', s), refreshTray(), reply(s)));
        return;
      case '/update-apply':
        updater.apply().then((r) => {
          reply(r);
          if (r.ok) setTimeout(() => (app.relaunch(), app.exit(0)), 800);
        });
        return;
      case '/wrapped':
        interact.action('wrapped');
        return reply({ ok: true });
      case '/player-close':
        hidePlayer();
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
          .executeJavaScript(`(() => { const r = document.documentElement; const w = document.querySelector('.album-wall'); const b = document.querySelector('.aw-bg .b1'); const cs = b && getComputedStyle(b); return { perf: r.dataset.perf, paused: r.hasAttribute('data-paused'), motion: r.dataset.motion, wall: w && w.className, anim: cs && cs.animationName, state: cs && cs.animationPlayState, transform: cs && cs.transform, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory }; })()`)
          .then((r) => reply(r));
        return;
      }
      case '/debug-shot': {
        const wp = wallpapers.find((w) => !w.win.isDestroyed());
        if (!wp) return reply({ ok: false });
        const which = url.searchParams.get('win');
        const target = which === 'popup' ? interact.popupWindow() : which === 'player' ? player : which === 'spot' ? spot : which === 'editor' ? editor : wp.win;
        target.webContents.capturePage().then((img) => {
          const file = path.join(config.DIR, 'debug-shot.png');
          fs.writeFileSync(file, img.resize({ width: 1280 }).toPNG());
          reply({ ok: true, file });
        });
        return;
      }
      case '/debug-popup-click': {
        const pop = interact.popupWindow();
        if (!pop) return reply({ ok: false });
        const sel = JSON.stringify(url.searchParams.get('sel') || '');
        pop.webContents.executeJavaScript(`(() => { const e = document.querySelector(${sel}); if (!e) return false; e.click(); return true; })()`).then((ok) => reply({ ok }));
        return;
      }
      case '/debug-weather':
        require('./weather.cjs').get(config.load(), true).then((r) => reply(r));
        return;
      case '/debug-editor': {
        if (!editor || editor.isDestroyed()) return reply({ editor: null });
        editor.webContents.executeJavaScript(`({ ready: document.documentElement.classList.contains('ready'), mode: document.documentElement.dataset.mode, widgets: document.querySelectorAll('#stage .w').length, chrome: document.getElementById('chrome').innerHTML.length, bodyClass: document.body.className, firstW: document.querySelector('#stage .w') && getComputedStyle(document.querySelector('#stage .w')).opacity })`).then(reply).catch((e) => reply({ error: String(e) }));
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
          .executeJavaScript(`({ dpr: devicePixelRatio, url: location.search, mode: document.documentElement.dataset.mode, html: document.getElementById('chrome').innerHTML.slice(0, 160), chromeH: document.getElementById('chrome').getBoundingClientRect().height, hasWall: typeof window.wall })`)
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
