const os = require('os');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const { pathToFileURL } = require('url');
const config = require('../shared/config.cjs');
const git = require('./git.cjs');
const weather = require('./weather.cjs');
const feeds = require('./feeds.cjs');
const stocks = require('./stocks.cjs');
const native = require('./native.cjs');
const { THEMES } = require('../shared/themes.cjs');
const brand = require('../shared/brand.cjs');
const { WIDGETS, NOTE_COLORS, presetLayout, make } = require('../shared/widgets.cjs');

let lastCpu = os.cpus();

function cpuUsage() {
  const now = os.cpus();
  let idle = 0;
  let total = 0;
  now.forEach((c, i) => {
    const prev = lastCpu[i] || c;
    for (const k of Object.keys(c.times)) total += c.times[k] - prev.times[k];
    idle += c.times.idle - prev.times.idle;
  });
  lastCpu = now;
  return total > 0 ? 1 - idle / total : 0;
}

function firstName() {
  try {
    const raw = os.userInfo().username || '';
    const first = raw.split(/[\s._-]+/)[0] || '';
    return first ? first[0].toUpperCase() + first.slice(1) : '';
  } catch {
    return '';
  }
}

// hooks.onSave(cfg, senderWebContents) lets main broadcast to the other windows.
function register(hooks = {}) {
  ipcMain.handle('config:get', () => config.load());
  ipcMain.handle('config:set', (e, cfg) => {
    config.save(cfg);
    hooks.onSave?.(cfg, e.sender);
    return true;
  });
  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    brand,
    hotkey: hooks.hotkey?.() || null,
    spotlightKey: hooks.spotlightKey?.() || null,
    user: firstName(),
    themes: THEMES,
    widgets: WIDGETS,
    noteColors: NOTE_COLORS,
  }));
  ipcMain.handle('app:preset', (_e, theme) => presetLayout(theme));
  ipcMain.handle('app:make', (_e, type, x, y, extra) => make(type, x, y, extra || {}));
  ipcMain.handle('app:file-url', (_e, p) => (p ? pathToFileURL(p).href : null));
  ipcMain.handle('data:git', (_e, force) => git.get(config.load(), !!force));
  ipcMain.handle('data:weather', (_e, force) => weather.get(config.load(), !!force));
  ipcMain.handle('data:forecast', () => weather.forecast(config.load()));
  ipcMain.handle('data:geocode', (_e, name) => weather.geocode(String(name || '')).catch(() => null));
  ipcMain.handle('data:quote', (_e, every) => feeds.quote(every));
  ipcMain.handle('data:verse', (_e, every) => feeds.verse(every));
  ipcMain.handle('data:power', () => native.powerStatus());
  ipcMain.handle('data:stocks', (_e, symbols) => stocks.quotes(Array.isArray(symbols) ? symbols : []));
  ipcMain.handle('data:art', async () => {
    const a = await feeds.art();
    return a ? { ...a, url: pathToFileURL(a.file).href } : null;
  });
  ipcMain.handle('data:system', () => ({ cpu: cpuUsage(), mem: 1 - os.freemem() / os.totalmem() }));
  ipcMain.handle('dialog:image', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a wallpaper image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('editor:close', () => hooks.closeEditor?.());
}

module.exports = { register };
