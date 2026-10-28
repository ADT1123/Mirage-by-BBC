import { WIDGETS } from './widgets.js';
import { mountScene } from './scenes.js';
import { demoStore } from './demo.js';
import { TINTS } from './widgetform.js';
import { mountAmbient, updateAmbient } from './ambient.js';

const q = new URLSearchParams(location.search);
const MODE = q.get('mode') || 'wallpaper'; // wallpaper | edit
const PRIMARY = q.get('primary') !== '0';
const DEMO = q.has('demo');
const AMBIENT = PRIMARY && !DEMO && (MODE === 'wallpaper' || MODE === 'edit');

const root = document.documentElement;
const stage = document.getElementById('stage');
const sceneEl = document.getElementById('scene');
const backdrop = document.getElementById('backdrop');
const chrome = document.getElementById('chrome');

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
function applyAppearance() {
  const a = q.get('appearance') || cfg?.appearance || 'auto';
  root.dataset.appearance = a === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : a;
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
  root.dataset.mode = MODE;

  if (cfg.background !== bgPath) {
    bgPath = cfg.background;
    const url = bgPath ? await window.wall.fileUrl(bgPath) : null;
    backdrop.style.backgroundImage = url ? `url("${url}")` : '';
    root.dataset.bg = url ? 'image' : 'scene';
  }
  backdrop.style.setProperty('--dim', String(cfg.dim ?? 0.25));

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

// ------------------------------------------------------------------ widgets

function keyFor(w) {
  let k = `${JSON.stringify(w)}|${theme()}`;
  if (w.type === 'clock' || w.type === 'menubar') k += `|${cfg.name}|${cfg.clock24}|${info.user}|${store.git?.updated ?? ''}`;
  if (w.type === 'quote') k += `|${store.quote?.text ?? ''}`;
  if (w.type === 'stack') k += `|${stackIdx.get(w.id) || 0}|${store.media?.key ?? ''}|${store.media?.art ?? ''}|${store.weather?.updated ?? ''}|${store.git?.updated ?? ''}|${new Date().toDateString()}`;
  if (w.type === 'music') k += `|${store.media?.key ?? ''}|${store.media?.art ?? ''}|${!!store.media?.active}`;
  if (w.type === 'dock') k += `|${store.dock?.map((a) => a.target + !!a.icon).join() ?? ''}`;
  if (w.type === 'art') k += `|${store.art?.id ?? ''}|${store.artTried ?? ''}`;
  if (w.type === 'verse') k += `|${store.verse?.ref ?? ''}|${store.verseTried ?? ''}`;
  if (w.type === 'commits' || w.type === 'feed') k += `|${store.git?.updated ?? 'none'}`;
  if (w.type === 'weather') k += `|${store.weather?.updated ?? store.weather?.reason ?? 'none'}`;
  if (w.type === 'calendar' || w.type === 'quote' || w.type === 'year') k += `|${new Date().toDateString()}`;
  return k;
}

function render(opts = {}) {
  const list = PRIMARY ? cfg.widgets : [];
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
    rec.el.innerHTML = impl.render(w, c);
    impl.tick?.(rec.el, w, c);
    editor?.decorate(rec.el, w);
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
  el.dataset.tint = w.tint || 'graphite';
  el.style.setProperty('--wt', TINTS[w.tint] || TINTS.graphite);
  el.style.setProperty('--wo', String(w.opacity ?? 1));
  el.classList.toggle('has-accent', !!(w.accent && TINTS[w.accent]));
  if (w.accent && TINTS[w.accent]) el.style.setProperty('--accent', TINTS[w.accent]);
  else el.style.removeProperty('--accent');
  if (w.corners) el.dataset.corners = w.corners;
  else delete el.dataset.corners;
  el.classList.toggle('no-shadow', w.shadow === false);
}

function tick() {
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
  if (!has('weather') && theme() !== 'weather' && !(AMBIENT && cfg.weatherFx !== 'off')) return;
  store.weather = await window.wall.weather(force);
  render();
  scene?.update(ctx());
}

// Daily content (quote, Gita verse, painting) is real even in demo previews.
async function pollDaily() {
  const jobs = [];
  if (has('quote')) jobs.push(window.wall.quote().then((v) => (store.quote = v)));
  if (has('verse')) jobs.push(window.wall.verse().then((v) => ((store.verse = v), (store.verseTried = true))));
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

async function pollSystem() {
  if (DEMO || !has('system')) return;
  store.system = await window.wall.system();
  tick();
}

async function watchBattery() {
  if (DEMO) return;
  try {
    const b = await navigator.getBattery();
    const upd = () => {
      // Desktops without a battery report "full and charging" forever; show them as AC power.
      const noBattery = b.level === 1 && b.charging && b.chargingTime === 0;
      store.battery = noBattery ? null : { level: b.level, charging: b.charging };
      tick();
    };
    b.addEventListener('levelchange', upd);
    b.addEventListener('chargingchange', upd);
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
    const mod = await import({ popup: './popup.js', spotlight: './spotlight.js', player: './player.js' }[MODE]);
    mod.start({ cfg, info, params: q });
    document.fonts.ready.then(() => root.classList.add('ready'));
    return;
  }
  if (AMBIENT) mountAmbient(stage);
  if (MODE === 'wallpaper' && PRIMARY && !DEMO) (await import('./live.js')).enableLive(app);
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
  window.addEventListener('online', () => {
    pollWeather(true);
    pollDaily();
    tick();
  });
  window.addEventListener('offline', tick);

  pollGit();
  pollWeather();
  pollDaily();
  pollSystem();
  dockKey = JSON.stringify(cfg.dock ?? null);
  pollDock();
  watchBattery();
  if (window.wall.media) {
    window.wall.media().then((s) => {
      store.media = s;
      render();
    });
    window.wall.onMedia((s) => {
      store.media = s;
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
