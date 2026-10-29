import { WIDGETS, SHAPED } from './widgets.js';
import { mountScene } from './scenes.js';
import { demoStore } from './demo.js';
import { TINTS, FONTS } from './widgetform.js';
import { mountAmbient, updateAmbient, confetti } from './ambient.js';

const q = new URLSearchParams(location.search);
const MODE = q.get('mode') || 'wallpaper'; // wallpaper | edit
const PRIMARY = q.get('primary') !== '0';
const DEMO = q.has('demo');
// Linux: room for the desktop's own top panel above our menu bar
document.documentElement.style.setProperty('--inset-top', `${Number(q.get('inset')) || 0}px`);
// a named tint or any #rrggbb the user picked
const color = (v) => TINTS[v] || (/^#[0-9a-f]{6}$/i.test(v || '') ? v : null);
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000 > 0.62;
};
const AMBIENT = PRIMARY && !DEMO && (MODE === 'wallpaper' || MODE === 'edit');

const root = document.documentElement;
const stage = document.getElementById('stage');
const sceneEl = document.getElementById('scene');
const backdrop = document.getElementById('backdrop');
const chrome = document.getElementById('chrome');

// While a maximized app hides the wallpaper (or the PC is locked) nothing needs to move:
// animation frames are held back and CSS animations pause, so the wallpaper costs ~nothing.
let hidden = false;
const rawRaf = window.requestAnimationFrame.bind(window);
let heldFrames = [];
window.requestAnimationFrame = (cb) => (hidden ? (heldFrames.push(cb), 0) : rawRaf(cb));
function setHidden(h) {
  if (hidden === h) return;
  hidden = h;
  document.documentElement.toggleAttribute('data-paused', h);
  if (!h) {
    const q = heldFrames;
    heldFrames = [];
    q.forEach((cb) => rawRaf(cb));
    tick();
    render();
  }
}

// Performance: 'auto' saves power on battery and on modest laptops (fewer cores / less memory)
const weakDevice = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
function applyPerf() {
  const mode = cfg?.perf || 'auto';
  const onBattery = store.battery && !store.battery.plugged;
  const saver = mode === 'saver' || (mode === 'auto' && (weakDevice || onBattery));
  root.dataset.perf = saver ? 'saver' : 'full';
}

const store = { git: null, weather: null, system: null, battery: null, quote: null, verse: null, art: null, dock: null, media: null };
const recs = new Map(); // widget id -> { el, key }
let cfg = null;
let info = { user: '' };
let scene = null;
let sceneKey = '';
let editor = null;
let bgPath = undefined;

const theme = () => q.get('theme') || cfg.theme;

// Light / dark: 'auto' follows Windows (and flips live when you toggle dark mode).
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// 'sun': light from your real sunrise to sunset (from the weather), dark after
let sunTimes = null; // { rise, set } in minutes after midnight
function byTheSun() {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  const { rise = 390, set = 1110 } = sunTimes || {};
  return m >= rise && m < set ? 'light' : 'dark';
}
function applyAppearance() {
  const a = q.get('appearance') || cfg?.appearance || 'auto';
  root.dataset.appearance = a === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : a === 'sun' ? byTheSun() : a;
}
darkQuery.addEventListener('change', () => {
  applyAppearance();
  if (cfg && MODE !== 'popup' && MODE !== 'spotlight' && MODE !== 'player') applyLook();
});
// Smart Stack: which card each stack shows right now (runtime only, not saved)
const stackIdx = new Map();
const stackTurn = new Map();
const ctx = () => ({ cfg: { ...cfg, theme: theme(), sky: q.get('sky') || cfg.sky }, info, store, edit: MODE === 'edit', now: () => new Date(), stackIndex: (id) => stackIdx.get(id) || 0 });
const has = (...types) => PRIMARY && cfg.widgets.some((w) => types.includes(w.type));

// ------------------------------------------------------------------ look

async function applyLook() {
  root.dataset.theme = theme();
  applyAppearance();
  root.dataset.motion = cfg.motion === false ? 'off' : 'on';
  document.body.classList.toggle('mb-auto', cfg.menubarFixed === false && MODE === 'wallpaper'); // shown unless you turn it off
  applyPerf();
  root.dataset.mode = MODE;

  if (cfg.background !== bgPath) {
    bgPath = cfg.background;
    const url = bgPath ? await window.wall.fileUrl(bgPath) : null;
    backdrop.style.backgroundImage = url ? `url("${url}")` : '';
    root.dataset.bg = url ? 'image' : 'scene';
  }
  backdrop.style.setProperty('--dim', String(cfg.dim ?? 0.25));
  applyAccent();

  const key = `${theme()}|${root.dataset.bg}|${root.dataset.appearance}|${cfg.planet || ''}`;
  if (key !== sceneKey) {
    sceneKey = key;
    scene?.destroy();
    scene = root.dataset.bg === 'image' ? null : mountScene(sceneEl, theme(), ctx());
    if (!scene) sceneEl.innerHTML = '';
  } else {
    scene?.update(ctx());
  }
}

// your own accent for the whole theme (Settings), including the commit graph.
// 'song' follows the cover of whatever is playing.
function applyAccent() {
  const acc = cfg.accent === 'song' ? (store.media?.active && store.media.color) || null : color(cfg.accent);
  for (const [k, v] of Object.entries({ '--accent': acc, '--heat-1': acc && `color-mix(in srgb, ${acc} 28%, transparent)`, '--heat-2': acc && `color-mix(in srgb, ${acc} 50%, transparent)`, '--heat-3': acc && `color-mix(in srgb, ${acc} 75%, transparent)`, '--heat-4': acc }))
    if (v) root.style.setProperty(k, v);
    else root.style.removeProperty(k);
}

// ------------------------------------------------------------------ widgets

function keyFor(w) {
  let k = `${JSON.stringify(w)}|${theme()}`;
  if (w.type === 'clock' || w.type === 'menubar') k += `|${cfg.name}|${cfg.clock24}|${info.user}|${store.git?.updated ?? ''}|${!!store.update?.available}`;
  if (w.type === 'assistant') k += `|${store.chat?.length ?? 0}|${cfg.name}`;
  if (w.type === 'quote') k += `|${store.quote?.text ?? ''}`;
  if (w.type === 'stack') k += `|${stackIdx.get(w.id) || 0}|${store.media?.key ?? ''}|${store.media?.art ?? ''}|${store.weather?.updated ?? ''}|${store.git?.updated ?? ''}|${new Date().toDateString()}`;
  if (w.type === 'music') k += `|${store.media?.key ?? ''}|${store.media?.art ?? ''}|${!!store.media?.active}`;
  if (w.type === 'dock') k += `|${store.dock?.map((a) => a.target + !!a.icon).join() ?? ''}`;
  if (w.type === 'art') k += `|${store.art?.id ?? ''}|${store.artTried ?? ''}`;
  if (w.type === 'stocks') k += `|${store.stocks?.updated ?? ''}`;
  if (w.type === 'photo' && w.every) k += `|${Math.floor(Date.now() / (w.every * 60000))}`;
  if (w.type === 'memories') k += `|${store.memories?.photos.length ?? -1}|${Math.floor(Date.now() / ((w.every || 15) * 60000))}`;
  if (w.type === 'verse') k += `|${store.verse?.ref ?? ''}|${store.verseTried ?? ''}`;
  if (w.type === 'commits' || w.type === 'feed') k += `|${store.git?.updated ?? 'none'}`;
  if (w.type === 'weather') k += `|${store.weather?.updated ?? store.weather?.reason ?? 'none'}`;
  if (w.type === 'calendar' || w.type === 'quote' || w.type === 'year') k += `|${new Date().toDateString()}`;
  return k;
}

// 🎉 the moment the last to-do is ticked, or a countdown reaches zero
const allDone = new Map(); // todo widget id -> were all items done last time
const celebrated = new Set(); // countdown ids that already went off
function checkCelebrations() {
  if (!AMBIENT || MODE !== 'wallpaper') return;
  let party = false;
  for (const w of cfg.widgets) {
    if (w.type === 'todo') {
      const items = w.items || [];
      const done = items.length > 0 && items.every((i) => i.done);
      if (done && allDone.get(w.id) === false) party = true;
      allDone.set(w.id, done);
    }
    if (w.type === 'countdown' && w.date) {
      const left = new Date(`${w.date}T00:00:00`).getTime() - Date.now();
      const key = `${w.id}|${w.date}`;
      if (left <= 0 && left > -60000 && !celebrated.has(key)) party = true;
      if (left <= 0) celebrated.add(key);
    }
  }
  if (party) confetti();
}

// The menu bar belongs to every theme: always on the main screen, never a widget you can lose
const MENUBAR = { id: 'menubar', type: 'menubar', x: 0, y: 0 };

function render(opts = {}) {
  const list = PRIMARY ? [MENUBAR, ...cfg.widgets.filter((w) => w.type !== 'menubar')] : [];
  const seen = new Set();
  const c = ctx();
  for (const w of list) {
    const impl = WIDGETS[w.type];
    if (!impl) continue;
    seen.add(w.id);
    let rec = recs.get(w.id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = `w w-${w.type}`;
      el.dataset.id = w.id;
      stage.append(el);
      rec = { el, key: '' };
      recs.set(w.id, rec);
      if (MODE === 'edit') el.classList.add('w-enter');
    }
    place(rec.el, w);
    const key = keyFor(w);
    if (rec.key === key) continue;
    rec.key = key;
    if (opts.skip === w.id) continue; // the editor is typing in this one; don't clobber the caret
    const shaped = w.shape && SHAPED[w.type]?.[w.shape]; // Apple-style Small / Medium tile
    rec.el.innerHTML = shaped ? shaped(w, c) : impl.render(w, c);
    impl.tick?.(rec.el, w, c);
    if (w.type !== 'menubar') editor?.decorate(rec.el, w);
    // live wallpaper: a quiet ••• on hover opens Edit Widget
    if (MODE === 'wallpaper' && PRIMARY && !DEMO && w.type !== 'menubar') rec.el.insertAdjacentHTML('beforeend', `<button class="w-more" data-act="widget-edit" title="Edit widget">•••</button>`);
  }
  for (const [id, rec] of recs) {
    if (!seen.has(id)) {
      rec.el.remove();
      recs.delete(id);
    }
  }
  if (AMBIENT) updateAmbient(c);
  checkCelebrations();
}

// First-run hint: the wallpaper can't be clicked, so tell people how to edit it.
function renderHint() {
  if (MODE !== 'wallpaper' || !PRIMARY || DEMO) return;
  if (cfg.onboarded) {
    chrome.innerHTML = '';
    return;
  }
  const key = (k, d) => (k || d).replace('CommandOrControl', 'Ctrl');
  chrome.innerHTML = `
    <div class="hint">
      <span class="hint-dot"></span>
      <span>Your wallpaper is live: click notes, to-dos, Wi-Fi or the dock</span>
      <span class="hint-sep"></span>
      <span><kbd>${key(info.spotlightKey, 'Alt+Space')}</kbd> Spotlight</span>
      <span class="hint-sep"></span>
      <span><kbd>${key(info.hotkey, 'Ctrl+Alt+E')}</kbd> rearrange</span>
    </div>`;
}

function place(el, w) {
  if (w.type === 'menubar') return;
  el.style.left = `${(w.x * 100).toFixed(3)}%`;
  el.style.top = `${(w.y * 100).toFixed(3)}%`;
  el.style.setProperty('--s', String(w.scale || 1));
  el.classList.toggle('center', w.align === 'center');
  el.classList.toggle('has-w', !!w.width);
  if (w.width) el.style.setProperty('--w', `${w.width}rem`);
  // per-widget look (Edit Widget): style, tint, accent, corners, opacity, shadow
  el.dataset.style = w.style || 'theme';
  if (w.shape) el.dataset.shape = w.shape;
  else delete el.dataset.shape;
  const tint = color(w.tint) || TINTS.graphite;
  el.dataset.tint = TINTS[w.tint] ? w.tint : w.tint && isLight(tint) ? 'white' : 'graphite';
  el.style.setProperty('--wt', tint);
  el.style.setProperty('--wo', String(w.opacity ?? 1));
  el.classList.toggle('has-accent', !!color(w.accent));
  if (color(w.accent)) el.style.setProperty('--accent', color(w.accent));
  else el.style.removeProperty('--accent');
  if (w.corners) el.dataset.corners = w.corners;
  else delete el.dataset.corners;
  el.classList.toggle('no-shadow', w.shadow === false);
  // text color (Edit Widget)
  const tc = color(w.textColor);
  for (const [k, v] of Object.entries({ '--fg': tc, '--fg-2': tc && `color-mix(in srgb, ${tc} 68%, transparent)`, '--fg-3': tc && `color-mix(in srgb, ${tc} 44%, transparent)` }))
    if (v) el.style.setProperty(k, v);
    else el.style.removeProperty(k);
  // font and weight (Edit Widget), like the lock-screen clock picker
  const font = FONTS[w.font];
  if (font) {
    el.dataset.font = w.font;
    el.style.setProperty('--wf', font.family);
  } else {
    delete el.dataset.font;
    el.style.removeProperty('--wf');
  }
  if (w.weight && (!font || font.weights)) {
    el.dataset.weight = '';
    el.style.setProperty('--ww', String(w.weight));
  } else {
    delete el.dataset.weight;
    el.style.removeProperty('--ww');
  }
}

let lastSun = '';
function tick() {
  if (hidden) return;
  if (cfg.appearance === 'sun' && byTheSun() !== lastSun) {
    lastSun = byTheSun();
    applyLook();
  }
  applyPerf();
  // advance Smart Stacks on their own clock (paused while the pointer is over them)
  const now = Date.now();
  let turned = false;
  for (const w of PRIMARY ? cfg.widgets : []) {
    if (w.type !== 'stack' || !(w.items || []).length) continue;
    const every = (w.interval ?? 12) * 1000;
    const rec = recs.get(w.id);
    if (!every || !rec || rec.el.matches(':hover')) continue;
    if (!stackTurn.has(w.id)) stackTurn.set(w.id, now);
    if (now - stackTurn.get(w.id) >= every) {
      stackIdx.set(w.id, ((stackIdx.get(w.id) || 0) + 1) % w.items.length);
      stackTurn.set(w.id, now);
      turned = true;
    }
  }
  if (turned) render();
  // rotating quote / verse: fetch the next one when its slot changes
  if (PRIMARY && ((has('quote') && slotKey('quote') !== rotated.quote) || (has('verse') && slotKey('verse') !== rotated.verse))) pollDaily();
  const c = ctx();
  for (const w of PRIMARY ? cfg.widgets : []) {
    const rec = recs.get(w.id);
    if (rec) WIDGETS[w.type]?.tick?.(rec.el, w, c);
  }
}

// ------------------------------------------------------------------ data

async function pollGit(force = false) {
  if (DEMO || !has('commits', 'feed')) return;
  store.git = await window.wall.git(force);
  render();
  scene?.update(ctx());
}

let weatherKey = '';
let gitKey = '';
let dockKey = '';
async function pollWeather(force = false) {
  // weather is also needed for rain/snow on the desktop itself
  if (!has('weather') && theme() !== 'weather' && cfg.appearance !== 'sun' && !(AMBIENT && cfg.weatherFx !== 'off')) return;
  store.weather = await window.wall.weather(force);
  if (store.weather?.ok) sunTimes = { rise: store.weather.sunrise, set: store.weather.sunset };
  if (cfg.appearance === 'sun') applyLook();
  render();
  scene?.update(ctx());
  // a failed fetch (network still waking up, a hiccup) tries again soon instead of in 15 minutes
  clearTimeout(weatherRetry);
  if (store.weather?.reason === 'offline') {
    weatherDelay = Math.min(300000, (weatherDelay || 10000) * 2);
    weatherRetry = setTimeout(() => pollWeather(true), weatherDelay);
  } else weatherDelay = 0;
}
let weatherRetry = 0;
let weatherDelay = 0;

// Daily content (quote, Gita verse, painting) is real even in demo previews.
// how often quotes / verses change (from the first widget of that type)
const everyFor = (type) => cfg.widgets.find((w) => w.type === type)?.rotate || 'day';
const PERIOD = { hour: 3600e3, '30m': 1800e3, '15m': 900e3, '5m': 300e3, '1m': 60e3 };
const slotKey = (type) => {
  const e = everyFor(type);
  return `${e}:${PERIOD[e] ? Math.floor(Date.now() / PERIOD[e]) : new Date().toDateString()}`;
};
let rotated = { quote: '', verse: '' };

async function pollDaily() {
  const jobs = [];
  rotated = { quote: slotKey('quote'), verse: slotKey('verse') };
  if (has('quote')) jobs.push(window.wall.quote(everyFor('quote')).then((v) => (store.quote = v)));
  if (has('verse')) jobs.push(window.wall.verse(everyFor('verse')).then((v) => ((store.verse = v), (store.verseTried = true))));
  if (has('art')) jobs.push(window.wall.art().then((v) => ((store.art = v), (store.artTried = true))));
  if (!jobs.length) return;
  await Promise.allSettled(jobs);
  render();
}

async function pollDock() {
  if (!has('dock')) return;
  try {
    store.dock = await window.wall.dockApps();
  } catch {
    store.dock = [];
  }
  render();
}

// one request for every symbol on any Stocks widget
let stocksKey = '';
async function pollStocks() {
  if (!has('stocks')) return;
  const symbols = [...new Set(cfg.widgets.filter((w) => w.type === 'stocks').flatMap((w) => w.symbols || []))];
  stocksKey = symbols.join();
  store.stocks = await window.wall.stocks(symbols);
  render();
}

async function pollMemories() {
  if (!has('memories')) return;
  store.memories = await window.wall.memories();
  render();
}

async function pollSystem() {
  if (DEMO || !has('system')) return;
  store.system = await window.wall.system();
  tick();
}

async function watchBattery() {
  if (DEMO) return;
  try {
    // Windows knows for sure whether there's a battery and whether it's plugged in
    const upd = async () => {
      const p = await window.wall.power?.();
      if (p) store.battery = p.hasBattery ? { level: p.level ?? 1, charging: p.charging, plugged: p.ac } : null;
      else {
        const b = await navigator.getBattery();
        store.battery = { level: b.level, charging: b.charging, plugged: b.charging };
      }
      tick();
    };
    const b = await navigator.getBattery().catch(() => null);
    b?.addEventListener('levelchange', upd);
    b?.addEventListener('chargingchange', upd); // plug / unplug shows up right away
    setInterval(upd, 15000);
    upd();
  } catch {}
}

// ------------------------------------------------------------------ editor API

function commit(mutator, opts = {}) {
  editor?.remember(cfg);
  const next = structuredClone(cfg);
  mutator(next);
  cfg = next;
  applyLook();
  render(opts);
  window.wall.setConfig(cfg);
  onConfigSideEffects();
}

function replace(next) {
  cfg = next;
  applyLook();
  render();
  window.wall.setConfig(cfg);
  onConfigSideEffects();
}

function onConfigSideEffects() {
  const k = cfg.city ? `${cfg.city.lat},${cfg.city.lon}` : '';
  if (k !== weatherKey) {
    weatherKey = k;
    pollWeather(true);
  }
  const gk = JSON.stringify([cfg.github ?? null, cfg.repos ?? null]);
  if (gk !== gitKey) {
    const first = !gitKey;
    gitKey = gk;
    if (!first) pollGit(true); // GitHub user or repo folders changed
  }
  if (has('commits', 'feed') && !store.git) pollGit();
  if (has('dock') && (!store.dock || JSON.stringify(cfg.dock ?? null) !== dockKey)) {
    dockKey = JSON.stringify(cfg.dock ?? null);
    pollDock();
  }
  const sk = [...new Set(cfg.widgets.filter((w) => w.type === 'stocks').flatMap((w) => w.symbols || []))].join();
  if (has('stocks') && sk !== stocksKey) pollStocks();
  if (has('memories') && !store.memories) pollMemories();
  if ((has('quote') && !store.quote) || (has('verse') && !store.verse) || (has('art') && !store.art)) pollDaily();
}

export const app = {
  get cfg() {
    return cfg;
  },
  get theme() {
    return theme();
  },
  store,
  recs,
  stackGo(id, i) {
    stackIdx.set(id, i);
    stackTurn.set(id, Date.now());
    render();
  },
  stage,
  commit,
  replace,
  ctx,
  render,
};

// ------------------------------------------------------------------ boot

async function boot() {
  cfg = await window.wall.getConfig();
  info = await window.wall.info();
  document.title = info.brand?.name || document.title;
  root.dataset.mode = MODE;

  // popups (note/to-do editor, Control Center, calendar, menu) and Spotlight are their own small apps
  if (MODE === 'popup' || MODE === 'spotlight' || MODE === 'player') {
    root.dataset.theme = theme();
    applyAppearance();
    window.wall.onConfig((next) => {
      cfg = next;
      root.dataset.theme = theme();
      applyAppearance();
    });
    window.wall.weather?.().then((w) => {
      if (w?.ok) sunTimes = { rise: w.sunrise, set: w.sunset };
      applyAppearance();
    });
    setInterval(applyAppearance, 60 * 1000);
    const mod = await import({ popup: './popup.js', spotlight: './spotlight.js', player: './player.js' }[MODE]);
    mod.start({ cfg, info, params: q });
    document.fonts.ready.then(() => root.classList.add('ready'));
    return;
  }
  if (AMBIENT) mountAmbient(stage);
  if (MODE === 'wallpaper' && PRIMARY && !DEMO) (await import('./live.js')).enableLive(app);
  window.wall.onHidden?.(setHidden);
  if (DEMO) Object.assign(store, demoStore());
  weatherKey = cfg.city ? `${cfg.city.lat},${cfg.city.lon}` : '';

  if (MODE === 'edit') {
    const { createEditor } = await import('./editor.js');
    editor = createEditor(app);
  }

  await applyLook();
  render();
  renderHint();
  document.fonts.ready.then(() => root.classList.add('ready'));

  window.wall.onConfig((next) => {
    cfg = next;
    applyLook();
    render();
    renderHint();
    editor?.sync();
    onConfigSideEffects();
  });

  // align the tick to the wall-clock second so the clock flips exactly on time
  setTimeout(() => {
    tick();
    setInterval(tick, 1000);
  }, 1000 - (Date.now() % 1000));
  setInterval(render, 60 * 1000);
  setInterval(pollSystem, 2000);
  setInterval(() => pollGit(true), 10 * 60 * 1000);
  setInterval(() => pollWeather(true), 15 * 60 * 1000);
  setInterval(pollDaily, 30 * 60 * 1000);
  setInterval(pollStocks, 60 * 1000);
  setInterval(pollMemories, 3 * 60 * 60 * 1000); // picks up a new day's photos
  window.addEventListener('online', () => {
    pollWeather(true);
    pollDaily();
    tick();
  });
  window.addEventListener('offline', tick);

  pollGit();
  pollWeather();
  pollDaily();
  pollStocks();
  pollMemories();
  pollSystem();
  dockKey = JSON.stringify(cfg.dock ?? null);
  pollDock();
  watchBattery();
  // a new version on GitHub shows as a small "Update" in the menu bar
  if (MODE === 'wallpaper' && PRIMARY && !DEMO && window.wall.updateStatus) {
    window.wall.updateStatus().then((s) => ((store.update = s), render()));
    window.wall.onUpdate((s) => ((store.update = s), render()));
  }
  // the Assistant widget previews the latest answer
  const pollChat = () => has('assistant') && window.wall.chatHistory?.().then((h) => {
    if ((h?.length ?? 0) !== (store.chat?.length ?? 0)) {
      store.chat = h;
      render();
    }
  });
  pollChat();
  setInterval(pollChat, 4000);

  if (window.wall.media) {
    window.wall.media().then((s) => {
      store.media = s;
      render();
    });
    window.wall.onMedia((s) => {
      const recolor = cfg.accent === 'song' && (s?.color !== store.media?.color || !!s?.active !== !!store.media?.active);
      store.media = s;
      if (recolor) applyAccent();
      render();
      tick();
    });
    const resync = () =>
      window.wall.media().then((s) => {
        if (JSON.stringify([s?.key, !!s?.art, s?.playing]) === JSON.stringify([store.media?.key, !!store.media?.art, store.media?.playing])) return;
        store.media = s;
        render();
      });
    setInterval(resync, 15000);
    window.addEventListener('online', resync);
  }
}

boot();
