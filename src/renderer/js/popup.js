// The reusable popup window: note and to-do editors (drawn exactly over the widget, in
// the theme's own style), Control Center, calendar and the app menu. The main process
// keeps this page loaded and asks it to render a view, then shows the window.

import { WIDGETS, esc } from './widgets.js';
import { icon, weatherIcon } from './icons.js';
import { renderWidgetForm } from './widgetform.js';

let cfg;
let info;
let host = null; // fresh container per show, so old listeners never pile up
let cleanup = [];
// IPC listeners are registered once; the open view plugs its handlers in here
const live = { sys: null, media: null };

const close = () => window.wall.closePopup();
const save = () => window.wall.setConfig(cfg);

export function start(env) {
  cfg = env.cfg;
  info = env.info;
  const chrome = document.getElementById('chrome');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.wall.onPopupShow(async ({ view, id, scale }) => {
    cleanup.forEach((fn) => fn());
    cleanup = [];
    cfg = await window.wall.getConfig();
    host = document.createElement('div');
    host.className = `pop pop-${view}`;
    chrome.replaceChildren(host);
    const render = { note, todo, control, calendar, menu, settings, widget: widgetEdit, weather: weatherPanel, wrapped: wrappedView }[view];
    if (!render) return close();
    render(host, id, Number(scale) || 1);
    await fit();
    window.wall.popupReady();
  });
  window.wall.onSysUpdate?.((s) => live.sys?.(s));
  window.wall.onMedia?.((s) => live.media?.(s));
  window.wall.onPopupHidden(() => {
    cleanup.forEach((fn) => fn());
    cleanup = [];
  });
}

function ctx(edit = true) {
  return { cfg, info, store: {}, edit, now: () => new Date() };
}

const widget = (id) => cfg.widgets.find((w) => w.id === id);

// size the window to the rendered content. Measured right away (not in an animation
// frame): the window is hidden at this point, and hidden windows get no frames.
function fit() {
  const r = document.getElementById('chrome').getBoundingClientRect();
  return window.wall.popupResize(Math.ceil(r.width), Math.ceil(r.height) + 4);
}

// ---------------------------------------------------------------- note

function note(root, id, scale) {
  const w = widget(id);
  if (!w) return close();
  root.innerHTML = `
    <div class="pop-widget" style="--s:${scale}">${WIDGETS.note.render(w, ctx())}</div>
    <div class="pop-tools">
      ${info.noteColors.map((c) => `<button class="nc${c === w.color ? ' on' : ''}" data-color="${c}" title="${c}"></button>`).join('')}
      <span class="sep"></span>
      <button class="pt-btn" data-act="delete" title="Delete note">${icon('trash')}</button>
      <button class="pt-btn pt-done" data-act="done">Done</button>
    </div>`;
  const text = root.querySelector('.note-text');
  text.addEventListener('input', () => {
    w.text = text.innerText.replace(/\n{3,}/g, '\n\n').replace(/\n$/, '');
    save();
  });
  root.querySelector('.pop-tools').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.color) {
      w.color = b.dataset.color;
      root.querySelector('.note').dataset.color = w.color;
      root.querySelectorAll('.nc').forEach((n) => n.classList.toggle('on', n === b));
      save();
      text.focus();
    }
    if (b.dataset.act === 'delete') {
      cfg.widgets = cfg.widgets.filter((x) => x.id !== id);
      save();
      close();
    }
    if (b.dataset.act === 'done') close();
  });
  setTimeout(() => focusEnd(text), 0);
}

function focusEnd(el) {
  el.focus();
  const sel = getSelection();
  sel.selectAllChildren(el);
  sel.collapseToEnd();
}

// ---------------------------------------------------------------- todo

function todo(root, id, scale) {
  const w = widget(id);
  if (!w) return close();
  const paint = () => {
    root.innerHTML = `<div class="pop-widget" style="--s:${scale}">${WIDGETS.todo.render(w, ctx())}</div>
      <div class="pop-tools"><span class="pt-hint">Enter adds · click to tick</span><span class="sep"></span><button class="pt-btn pt-done" data-act="done">Done</button></div>`;
    const add = root.querySelector('.todo-add');
    add.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && add.value.trim()) {
        w.items = [...(w.items || []), { text: add.value.trim(), done: false }];
        save();
        paint();
        fit();
      }
    });
    const title = root.querySelector('[data-edit="title"]');
    title?.addEventListener('input', () => {
      w.title = title.innerText.trim();
      save();
    });
    setTimeout(() => add.focus(), 0);
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="done"]')) return close();
    const del = e.target.closest('.todo-del');
    if (del) {
      w.items.splice(Number(del.dataset.i), 1);
      save();
      paint();
      return fit();
    }
    const item = e.target.closest('.todo-item');
    if (item && item.dataset.i != null) {
      w.items[Number(item.dataset.i)].done = !w.items[Number(item.dataset.i)].done;
      save();
      paint();
    }
  });
  paint();
}

// ---------------------------------------------------------------- control center

function control(root) {
  root.innerHTML = `
    <div class="panel cc">
      <div class="cc-grid">
        <button class="cc-tile" data-open="wifi"><span class="cc-ic" data-k="wifi-ic">${icon('wifi')}</span><span class="cc-label"><b>Wi-Fi</b><small data-k="ssid">…</small></span></button>
        <button class="cc-tile" data-open="bluetooth"><span class="cc-ic on">${icon('bluetooth')}</span><span class="cc-label"><b>Bluetooth</b><small>Devices</small></span></button>
        <button class="cc-tile" data-toggle="dark"><span class="cc-ic">${icon('moon')}</span><span class="cc-label"><b>Dark Mode</b><small data-k="dark">…</small></span></button>
        <button class="cc-tile" data-toggle="taskbar"><span class="cc-ic">${icon('taskbar')}</span><span class="cc-label"><b>Hide Taskbar</b><small data-k="taskbar">…</small></span></button>
      </div>
      <div class="cc-sliders">
        <label class="slider" data-k="bright-wrap" title="Brightness">${icon('sun2')}<input type="range" min="0" max="100" data-set="brightness" /></label>
        <div class="slide-row">
          <label class="slider" title="Volume">${icon('volume')}<input type="range" min="0" max="100" data-set="volume" /></label>
          <button class="cc-mute" data-act="mute" title="Mute">${icon('mute')}</button>
        </div>
      </div>
      <div class="cc-np" data-k="np">
        <button class="np-art-sm" data-run="player" title="Open Now Playing"></button>
        <button class="np-info" data-run="player"><b data-k="np-title"></b><small data-k="np-sub"></small></button>
        <div class="np-btns">
          <button data-media="prev" title="Previous">${icon('prev')}</button>
          <button data-media="toggle" data-k="np-play" title="Play / pause">${icon('play')}</button>
          <button data-media="next" title="Next">${icon('next')}</button>
        </div>
      </div>
      <div class="cc-actions">
        <button data-run="screenshot" title="Screenshot">${icon('camera')}</button>
        <button data-run="lock" title="Lock">${icon('lock')}</button>
        <button data-run="spotlight" title="Search">${icon('search')}</button>
        <button data-run="edit" title="Edit wallpaper">${icon('pencil')}</button>
        <button data-run="settings" title="Settings">${icon('gear')}</button>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  let state = {};
  let media = { active: false };

  const paint = () => {
    const wifi = state.wifi;
    $('[data-k="ssid"]').textContent = !wifi ? '…' : !wifi.available ? 'No adapter' : wifi.connected ? wifi.ssid : 'Off';
    $('[data-k="wifi-ic"]').classList.toggle('on', !!wifi?.connected);
    const tog = (k, on) => {
      $(`[data-toggle="${k}"] .cc-ic`).classList.toggle('on', !!on);
      $(`[data-k="${k}"]`).textContent = on == null ? '…' : on ? 'On' : 'Off';
    };
    tog('dark', state.dark);
    tog('taskbar', state.taskbarHidden);
    $('[data-k="bright-wrap"]').classList.toggle('off', state.brightness === null);
    if (state.brightness != null) $('[data-set="brightness"]').value = state.brightness;
    if (state.volume) {
      $('[data-set="volume"]').value = state.volume.level;
      $('[data-act="mute"]').classList.toggle('on', state.volume.muted);
    }
    fill();
  };

  // the media row only exists while something is playing
  const paintMedia = () => {
    const was = $('[data-k="np"]').classList.contains('active');
    $('[data-k="np"]').classList.toggle('active', !!media.active);
    $('[data-k="np-title"]').textContent = media.title || 'Unknown';
    $('[data-k="np-sub"]').textContent = media.artist || media.appName || '';
    $('[data-k="np-play"]').innerHTML = icon(media.playing ? 'pause' : 'play');
    const art = $('.np-art-sm');
    art.style.backgroundImage = media.art ? `url("${media.art}")` : '';
    art.innerHTML = media.art ? '' : icon('volume');
    if (was !== !!media.active) fit();
  };

  // fill the slider tracks like macOS
  const fill = () => root.querySelectorAll('input[type=range]').forEach((r) => r.style.setProperty('--v', `${r.value}%`));

  // cached state comes back instantly; a fresh read arrives as sys:update
  window.wall.sysState().then((s) => {
    state = s || {};
    paint();
  });
  live.sys = (s) => {
    state = { ...state, ...s };
    paint();
  };
  window.wall.media?.().then((s) => {
    media = s || media;
    paintMedia();
  });
  live.media = (s) => {
    media = s;
    paintMedia();
  };
  cleanup.push(() => {
    live.sys = live.media = null;
  });
  paint();
  paintMedia();

  let t = null;
  root.addEventListener('input', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    fill();
    clearTimeout(t);
    const v = Number(e.target.value);
    // volume is instant; brightness goes through WMI, so debounce it
    t = setTimeout(() => window.wall.sysSet(k, v), k === 'volume' ? 0 : 120);
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) return window.wall.action(b.dataset.open);
    if (b.dataset.run) return window.wall.action(b.dataset.run);
    if (b.dataset.media) {
      window.wall.mediaCmd(b.dataset.media);
      if (b.dataset.media === 'toggle') {
        media = { ...media, playing: !media.playing };
        paintMedia();
      }
      return;
    }
    if (b.dataset.act === 'mute') {
      state.volume = await window.wall.sysSet('mute', !state.volume?.muted);
      return paint();
    }
    if (b.dataset.toggle) {
      const key = b.dataset.toggle === 'dark' ? 'dark' : 'taskbarHidden';
      state[key] = !state[key];
      paint(); // optimistic: flip now, confirm when Windows answers
      state[key] = await window.wall.sysSet(b.dataset.toggle, state[key]);
      paint();
    }
  });
}

// ---------------------------------------------------------------- weather panel (click the weather widget)

function weatherPanel(root) {
  root.innerHTML = '<div class="panel wx-panel"><div class="wx-loading">Loading forecast…</div></div>';
  window.wall.forecast().then((f) => {
    const panel = root.firstElementChild;
    if (!f?.ok) {
      panel.innerHTML = `<div class="wx-loading">${f?.reason === 'no-city' ? 'Set your city in Settings' : 'Forecast unavailable offline'}</div>`;
      return fit();
    }
    const c = f.current;
    // hourly temperature line + rain bars
    const hrs = f.hourly;
    const lo = Math.min(...hrs.map((h) => h.temp));
    const hi = Math.max(...hrs.map((h) => h.temp));
    const W = 392;
    const H = 96;
    const xs = (i) => 14 + (i * (W - 28)) / (hrs.length - 1);
    const ys = (t) => 18 + (1 - (t - lo) / Math.max(1, hi - lo)) * (H - 46);
    const line = hrs.map((h, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(h.temp).toFixed(1)}`).join(' ');
    const area = `${line} L${xs(hrs.length - 1)} ${H - 22} L${xs(0)} ${H - 22}Z`;
    const labels = hrs
      .map((h, i) => (i % 3 === 0 ? `<text x="${xs(i)}" y="${ys(h.temp) - 7}" class="t">${h.temp}°</text><text x="${xs(i)}" y="${H - 6}" class="hr">${i === 0 ? 'Now' : `${h.hour % 12 || 12}${h.hour < 12 ? 'a' : 'p'}`}</text>` : ''))
      .join('');
    const rain = hrs.map((h, i) => (h.rain > 0 ? `<rect x="${xs(i) - 3}" y="${H - 22 - h.rain * 0.18}" width="6" height="${h.rain * 0.18}" rx="2" class="rain"/>` : '')).join('');
    // 7 days with range bars on a shared scale
    const dlo = Math.min(...f.daily.map((d) => d.low));
    const dhi = Math.max(...f.daily.map((d) => d.high));
    const days = f.daily
      .map((d, i) => {
        const name = i === 0 ? 'Today' : new Date(`${d.date}T12:00`).toLocaleDateString('en-US', { weekday: 'short' });
        const left = ((d.low - dlo) / Math.max(1, dhi - dlo)) * 100;
        const width = ((d.high - d.low) / Math.max(1, dhi - dlo)) * 100;
        return `<div class="wx-day"><span class="d">${name}</span><span class="i">${weatherIcon(d.kind, true)}</span><span class="p">${d.rain >= 30 ? `${d.rain}%` : ''}</span><span class="lo">${d.low}°</span><span class="bar"><i style="left:${left}%;width:${Math.max(6, width)}%"></i></span><span class="hi">${d.high}°</span></div>`;
      })
      .join('');
    panel.innerHTML = `
      <div class="wx-hero">
        <div><small>${esc(f.city)}</small><b>${c.temp}°</b><span>${esc(c.label)}</span><em>H ${f.daily[0].high}°  L ${f.daily[0].low}°</em></div>
        ${weatherIcon(c.kind, c.isDay)}
      </div>
      <div class="wx-sec">Next 24 hours</div>
      <svg class="wx-chart" viewBox="0 0 ${W} ${H}"><path class="area" d="${area}"/>${rain}<path class="line" d="${line}"/>${labels}</svg>
      <div class="wx-sec">7-day forecast</div>
      <div class="wx-days">${days}</div>
      <div class="wx-grid">
        <div><small>Feels like</small><b>${c.feels}°</b></div>
        <div><small>Humidity</small><b>${c.humidity}%</b></div>
        <div><small>Wind</small><b>${c.wind} km/h</b></div>
        <div><small>UV index</small><b>${c.uv ?? '–'}</b></div>
        <div><small>Sunrise</small><b>${f.sunrise}</b></div>
        <div><small>Sunset</small><b>${f.sunset}</b></div>
      </div>`;
    fit();
  });
}

// ---------------------------------------------------------------- edit widget (••• on a widget)

function widgetEdit(root, id) {
  const w = widget(id);
  if (!w) return close();
  root.innerHTML = '<div class="panel wf-panel"></div>';
  renderWidgetForm(
    root.firstElementChild,
    w,
    info,
    () => {
      save();
      fit();
    },
    () => {
      cfg.widgets = cfg.widgets.filter((x) => x.id !== id);
      save();
      close();
    },
  );
}

// ---------------------------------------------------------------- wallpaper settings (from the top bar)

const QUICK_WIDGETS = ['clock', 'commits', 'feed', 'note', 'todo', 'weather', 'music', 'year', 'calendar', 'countdown', 'quote', 'system', 'dock', 'menubar'];

function settings(root) {
  const fmt = (k) => (k || '').replace('CommandOrControl', 'Ctrl');
  let taskbar = null;
  const has = (type) => cfg.widgets.some((w) => w.type === type);
  const toggle = (key, label, on) => `<button class="st-toggle${on ? ' on' : ''}" data-flag="${key}"><span>${label}</span><i></i></button>`;

  const paint = () => {
    root.innerHTML = `
      <div class="panel st">
        <div class="st-head"><b>Wallpaper</b><button class="st-edit" data-run="edit">${icon('pencil')}Rearrange<kbd>${fmt(info.hotkey)}</kbd></button></div>

        <div class="st-label">Theme</div>
        <div class="st-themes">
          ${info.themes
            .map(
              (t) => `<button class="st-theme${t.id === cfg.theme ? ' on' : ''}" data-theme="${t.id}" title="${esc(t.tagline)}">
                <span class="st-sw">${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span><small>${esc(t.name)}</small></button>`,
            )
            .join('')}
        </div>

        ${cfg.theme === 'astro' ? `<div class="st-label">Planet</div><div class="menu-seg st-seg">${['moon', 'mars', 'earth'].map((p) => `<button data-planet="${p}" class="${(cfg.planet || 'moon') === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>` : ''}
        <div class="st-label">Appearance</div>
        <div class="menu-seg st-seg">${['auto', 'light', 'dark'].map((a) => `<button data-appearance="${a}" class="${(cfg.appearance || 'auto') === a ? 'on' : ''}">${a === 'auto' ? 'Auto' : a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>

        <div class="st-label">Desktop pet</div>
        <div class="menu-seg st-seg">${['cat', 'bird', 'off'].map((p) => `<button data-pet="${p}" class="${(cfg.pet ?? 'cat') === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>

        <div class="st-label">Widgets</div>
        <div class="st-chips">
          ${QUICK_WIDGETS.map((type) => {
            const meta = info.widgets.find((w) => w.type === type);
            return meta ? `<button class="st-chip${has(type) ? ' on' : ''}" data-widget="${type}">${icon(type === 'music' ? 'volume' : type)}${esc(meta.name)}</button>` : '';
          }).join('')}
        </div>

        <div class="st-label">Options</div>
        <div class="st-list">
          ${toggle('motion', 'Animations', cfg.motion !== false)}
          ${toggle('clock24', '24-hour clock', !!cfg.clock24)}
          ${toggle('visualizer', 'Music visualizer', cfg.visualizer !== false)}
          ${toggle('weatherFx', 'Live weather on desktop', cfg.weatherFx !== 'off')}
          ${toggle('autostart', 'Start with Windows', !!cfg.autostart)}
          ${toggle('taskbar', 'Hide Windows taskbar', !!taskbar)}
        </div>

        <div class="st-label">You</div>
        <div class="st-fields">
          <input data-field="name" placeholder="${esc(info.user || 'Your name')}" value="${esc(cfg.name || '')}" />
          <div class="st-row"><input data-field="city" placeholder="City (auto)" value="${esc(cfg.city?.name || '')}" /><button class="st-btn" data-act="city">Set</button></div>
          <small data-k="msg"></small>
        </div>

        <div class="st-foot"><span><kbd>${fmt(info.spotlightKey)}</kbd> Spotlight</span><span><kbd>${fmt(info.hotkey)}</kbd> Rearrange</span></div>
      </div>`;
    fit();
  };

  window.wall.sysState().then((s) => {
    taskbar = !!s?.taskbarHidden;
    paint();
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) return window.wall.action(b.dataset.run);
    if (b.dataset.theme) cfg.theme = b.dataset.theme;
    if (b.dataset.appearance) cfg.appearance = b.dataset.appearance;
    if (b.dataset.planet) cfg.planet = b.dataset.planet;
    if (b.dataset.pet) cfg.pet = b.dataset.pet;
    if (b.dataset.widget) {
      const type = b.dataset.widget;
      if (has(type)) cfg.widgets = cfg.widgets.filter((w) => w.type !== type);
      else {
        const n = cfg.widgets.length;
        cfg.widgets.push(await window.wall.make(type, 0.36 + (n % 4) * 0.04, 0.3 + (n % 3) * 0.06, {}));
      }
    }
    if (b.dataset.flag) {
      const k = b.dataset.flag;
      if (k === 'taskbar') {
        taskbar = await window.wall.sysSet('taskbar', !taskbar);
        return paint();
      }
      if (k === 'motion' || k === 'visualizer') cfg[k] = cfg[k] === false;
      else if (k === 'weatherFx') cfg.weatherFx = cfg.weatherFx === 'off' ? 'auto' : 'off';
      else cfg[k] = !cfg[k];
    }
    if (b.dataset.act === 'city') {
      const name = root.querySelector('[data-field="city"]').value.trim();
      const msg = root.querySelector('[data-k="msg"]');
      if (!name) {
        cfg.city = null;
        msg.textContent = 'Weather follows your location';
      } else {
        msg.textContent = 'Looking up…';
        const city = await window.wall.geocode(name);
        if (!city) {
          msg.textContent = 'Could not find that place';
          return;
        }
        cfg.city = city;
      }
      save();
      return paint();
    }
    save();
    paint();
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.field === 'name') {
      cfg.name = e.target.value.trim();
      save();
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.field === 'city') root.querySelector('[data-act="city"]').click();
    if (e.key === 'Enter' && e.target.dataset.field === 'name') e.target.blur();
  });
  paint();
}

// ---------------------------------------------------------------- calendar

function calendar(root) {
  const today = new Date();
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  const paint = () => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<b>${d}</b>`).join('');
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
      const wknd = [0, 6].includes(new Date(y, m, d).getDay());
      cells += `<span class="${isToday ? 'today' : ''}${wknd ? ' wk' : ''}">${d}</span>`;
    }
    const countdowns = cfg.widgets.filter((w) => w.type === 'countdown' && w.date);
    root.innerHTML = `
      <div class="panel cal">
        <div class="cal-head">
          <div><b>${view.toLocaleDateString('en-US', { month: 'long' })}</b> <span>${y}</span></div>
          <div class="cal-nav"><button data-nav="-1">${icon('chevron')}</button><button data-nav="0">Today</button><button data-nav="1">${icon('chevron')}</button></div>
        </div>
        <div class="cal-grid big">${cells}</div>
        <div class="cal-foot">
          <div><b>${today.toLocaleDateString('en-US', { weekday: 'long' })}</b><small>${today.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>
          ${countdowns.map((c) => `<div class="cal-event"><i></i>${esc(c.title)}<small>${Math.max(0, Math.ceil((new Date(`${c.date}T00:00:00`) - today) / 86400000))} days</small></div>`).join('')}
        </div>
      </div>`;
  };
  root.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]');
    if (!n) return;
    const d = Number(n.dataset.nav);
    view = d === 0 ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(view.getFullYear(), view.getMonth() + d, 1);
    paint();
    fit();
  });
  paint();
}

// ---------------------------------------------------------------- app menu

function menu(root, id) {
  const fmt = (k) => (k || '').replace('CommandOrControl', 'Ctrl');
  const themes = () => `
    <div class="panel menu">
      <div class="menu-title">Themes</div>
      ${info.themes.map((t) => `<button data-theme="${t.id}" class="${t.id === cfg.theme ? 'on' : ''}"><span class="sw">${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${esc(t.name)}${t.id === cfg.theme ? icon('check2', 'tick') : ''}</button>`).join('')}
      <hr />
      <div class="menu-title">Appearance</div>
      <div class="menu-seg">${['auto', 'light', 'dark'].map((a) => `<button data-appearance="${a}" class="${(cfg.appearance || 'auto') === a ? 'on' : ''}">${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>
    </div>`;
  const main = () => `
    <div class="panel menu">
      <button data-run="spotlight">${icon('search')}Spotlight<kbd>${fmt(info.spotlightKey)}</kbd></button>
      <button data-run="player">${icon('volume')}Now Playing</button>
      <button data-run="edit">${icon('pencil')}Edit wallpaper<kbd>${fmt(info.hotkey)}</kbd></button>
      <hr />
      <button data-do="note">${icon('note')}New sticky note</button>
      <button data-do="themes">${icon('palette')}Themes & appearance${icon('chevron', 'tick')}</button>
      <button data-run="settings">${icon('gear')}Windows settings</button>
      <hr />
      <button data-run="restart">${icon('refresh')}Reload wallpaper</button>
      <button data-run="quit">${icon('power')}Quit ${esc(info.brand?.name || '')}</button>
    </div>`;
  root.innerHTML = id === 'themes' ? themes() : main();
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) return window.wall.action(b.dataset.run);
    if (b.dataset.theme || b.dataset.appearance) {
      if (b.dataset.theme) cfg.theme = b.dataset.theme;
      if (b.dataset.appearance) cfg.appearance = b.dataset.appearance;
      save();
      root.innerHTML = themes();
      return fit();
    }
    if (b.dataset.do === 'themes') {
      root.innerHTML = themes();
      return fit();
    }
    if (b.dataset.do === 'note') {
      const w = await window.wall.make('note', 0.42 + Math.random() * 0.1, 0.32 + Math.random() * 0.1, { color: info.noteColors[cfg.widgets.filter((x) => x.type === 'note').length % info.noteColors.length] });
      cfg.widgets.push(w);
      save();
      window.wall.action('open-widget', w.id);
    }
  });
}

// ---------------------------------------------------------------- weekly Wrapped

const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`);
const shortDay = (k) => new Date(`${k}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

function wrappedView(root) {
  root.innerHTML = '<div class="panel wr"><div class="wx-loading">Putting your week together…</div></div>';
  window.wall.wrapped().then((d) => {
    const panel = root.firstElementChild;
    const maxApp = Math.max(1, ...d.apps.map((a) => a.minutes));
    const maxC = Math.max(1, ...d.commitDays);
    const dayLetters = d.commitDays.map((_, i) => new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString([], { weekday: 'narrow' }));
    const top = d.songs[0];
    panel.innerHTML = `
      <div class="wr-head">
        <small>${esc(info.brand?.name || '')} Wrapped</small>
        <h1>${esc(d.name)}'s week</h1>
        <span>${shortDay(d.from)} – ${shortDay(d.to)}</span>
      </div>
      <div class="wr-stats">
        <div><b>${hm(d.activeMinutes)}</b><small>active</small></div>
        <div><b>${d.commits}</b><small>commits</small></div>
        <div><b>${d.totalPlays}</b><small>songs played</small></div>
      </div>
      ${
        top
          ? `<div class="wr-sec">Top songs</div>
        <div class="wr-songs">
          ${d.songs
            .map(
              (s, i) => `<div class="wr-song${i ? '' : ' first'}">
              <span class="wr-n">${i + 1}</span>
              <span class="wr-cover"${s.art ? ` style="background-image:url('${s.art.replace(/'/g, '%27')}')"` : ''}>${s.art ? '' : icon('music')}</span>
              <span class="wr-t"><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>
              <span class="wr-c">${s.plays}×</span>
            </div>`,
            )
            .join('')}
        </div>`
          : '<div class="wr-sec">Top songs</div><div class="wr-empty">No music this week yet. Play something and it shows up here.</div>'
      }
      <div class="wr-sec">Most used apps</div>
      ${
        d.apps.length
          ? `<div class="wr-apps">${d.apps
              .map(
                (a) => `<div class="wr-app">
              <span class="wr-ai">${a.icon ? `<img src="${a.icon}" alt="" />` : esc(a.name.slice(0, 1))}</span>
              <span class="wr-an">${esc(a.name)}</span>
              <span class="wr-bar"><i style="width:${Math.max(4, (a.minutes / maxApp) * 100)}%"></i></span>
              <span class="wr-am">${hm(a.minutes)}</span>
            </div>`,
              )
              .join('')}</div>`
          : '<div class="wr-empty">Screen time starts counting from today.</div>'
      }
      <div class="wr-row">
        <div class="wr-tile">
          <small>Commits by day</small>
          <div class="wr-spark">${d.commitDays.map((c, i) => `<span><i style="height:${Math.max(6, (c / maxC) * 100)}%"${c ? '' : ' class="z"'}></i><em>${dayLetters[i]}</em></span>`).join('')}</div>
          <small class="wr-sub">${d.topRepo ? `Mostly in ${esc(d.topRepo)}` : ' '}</small>
        </div>
        <div class="wr-tile">
          <small>Longest focus</small>
          <b>${d.longest?.minutes ? hm(d.longest.minutes) : '–'}</b>
          <small class="wr-sub">${d.longest?.app ? `in ${esc(d.longest.app)}` : 'nonstop in one app'}</small>
        </div>
      </div>
      <div class="wr-foot">
        <button class="wr-btn primary" data-share>${icon('share')}Share</button>
        <button class="wr-btn" data-close>Close</button>
      </div>`;
    panel.querySelector('[data-close]').onclick = close;
    panel.querySelector('[data-share]').onclick = async (e) => {
      const btn = e.currentTarget;
      panel.classList.add('capturing');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = panel.getBoundingClientRect();
      const file = await window.wall.saveWrapped({ x: r.x, y: r.y, width: r.width, height: r.height });
      panel.classList.remove('capturing');
      btn.innerHTML = `${icon('check')}${file ? 'Saved & copied' : 'Couldn’t save'}`;
    };
    fit();
  });
}
