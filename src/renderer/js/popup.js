// The reusable popup window: note and to-do editors (drawn exactly over the widget, in
// the theme's own style), Control Center, calendar and the app menu. The main process
// keeps this page loaded and asks it to render a view, then shows the window.

import { WIDGETS, esc } from './widgets.js';
import { icon, weatherIcon } from './icons.js';
import { renderWidgetForm, TINTS } from './widgetform.js';

let cfg;
let info;
let host = null; // fresh container per show, so old listeners never pile up
let cleanup = [];
// IPC listeners are registered once; the open view plugs its handlers in here
const live = { sys: null, media: null };

const close = () => window.wall.closePopup();
const save = () => {
  syncLook();
  return window.wall.setConfig(cfg);
};

// theme + light/dark for the popup chrome, same rule as the wallpaper ('auto' follows Windows)
function syncLook() {
  const root = document.documentElement;
  const a = cfg.appearance || 'auto';
  root.dataset.theme = cfg.theme;
  root.dataset.appearance = a === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : a;
}

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
    syncLook();
    host = document.createElement('div');
    host.className = `pop pop-${view}`;
    chrome.replaceChildren(host);
    const render = { note, todo, control, calendar, menu, settings, widget: widgetEdit, weather: weatherPanel, wrapped: wrappedView, projects: projectsView, chat: chatView, update: updateView }[view];
    if (!render) return close();
    render(host, id, Number(scale) || 1);
    await fit();
    window.wall.popupReady();
    setTimeout(fit, 150); // fonts and images can still shift the size a little
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
  // measure the full height (the scroll cap is relative to the current window size)
  document.documentElement.classList.add('measuring');
  const chrome = document.getElementById('chrome');
  const box = chrome.getBoundingClientRect();
  // never smaller than what is actually drawn (long names, bigger system fonts)
  const r = { width: Math.max(box.width, chrome.scrollWidth), height: Math.max(box.height, chrome.scrollHeight) };
  document.documentElement.classList.remove('measuring');
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
        <button class="cc-tile" data-drop="wifi"><span class="cc-ic" data-k="wifi-ic">${icon('wifi')}</span><span class="cc-label"><b>Wi-Fi</b><small data-k="ssid">…</small></span></button>
        <button class="cc-tile" data-open="bluetooth"><span class="cc-ic on">${icon('bluetooth')}</span><span class="cc-label"><b>Bluetooth</b><small>Devices</small></span></button>
      </div>
      <div class="cc-drop" data-drop-for="wifi"></div>
      <div class="cc-quick">
        <button data-toggle="dark" title="Dark mode"><span class="cc-ic">${icon('moon')}</span><small>Dark</small></button>
        <button data-toggle="taskbar" title="Hide the Windows taskbar"><span class="cc-ic">${icon('taskbar')}</span><small>Taskbar</small></button>
        <button data-drop="power" title="Power mode"><span class="cc-ic on">${icon('bolt')}</span><small data-k="power">Power</small></button>
      </div>
      <div class="cc-drop" data-drop-for="power"></div>
      <div class="cc-sliders">
        <label class="slider" data-k="bright-wrap" title="Brightness">${icon('sun2')}<input type="range" min="0" max="100" data-set="brightness" /></label>
        <div class="slide-row">
          <label class="slider" title="Volume">${icon('volume')}<input type="range" min="0" max="100" data-set="volume" /></label>
          <button class="cc-out" data-drop="audio" title="Sound output">${icon('chevron', 'cc-chev')}</button>
        </div>
        <div class="cc-drop" data-drop-for="audio"></div>
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
        <button data-run="lock" title="Lock">${icon('lock')}</button>
        <button data-run="edit" title="Rearrange widgets">${icon('grid')}</button>
        <button data-pop="settings" title="Wallpaper settings">${icon('gear')}</button>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  let state = {};
  let media = { active: false };

  const paint = () => {
    const wifi = state.wifi;
    $('[data-k="ssid"]').textContent = !wifi ? '…' : !wifi.available ? 'No adapter' : wifi.connected ? wifi.ssid : 'Off';
    $('[data-k="wifi-ic"]').classList.toggle('on', !!wifi?.connected);
    const tog = (k, on) => $(`[data-toggle="${k}"] .cc-ic`).classList.toggle('on', !!on);
    tog('dark', state.dark);
    tog('taskbar', state.taskbarHidden);
    $('[data-k="bright-wrap"]').classList.toggle('off', state.brightness === null);
    if (state.brightness != null) $('[data-set="brightness"]').value = state.brightness;
    if (state.volume) $('[data-set="volume"]').value = state.volume.level;
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

  // ---- dropdowns: one open at a time, filled from live system data
  const POWER = [
    ['efficiency', 'Best power efficiency', 'Longer battery, quieter fans'],
    ['balanced', 'Balanced', 'Windows decides'],
    ['performance', 'Best performance', 'Faster, uses more power'],
  ];
  let openDrop = '';
  let lists = {};
  const shortName = (n) => String(n || '').replace(/\s*\(.*\)\s*$/, '');
  const paintDrop = (what) => {
    const box = root.querySelector(`[data-drop-for="${what}"]`);
    const data = lists[what];
    if (what === 'wifi') {
      box.innerHTML =
        (data?.length
          ? data
              .map(
                (n) => `<button class="cc-opt${n.connected ? ' on' : ''}" data-wifi="${esc(n.ssid)}" data-known="${n.known ? 1 : ''}">
              <span class="cc-sig" style="--s:${Math.max(0.25, n.signal / 100)}">${icon('wifi')}</span>
              <span class="cc-opt-t">${esc(n.ssid)}${n.known && !n.connected ? '<small>Saved</small>' : ''}</span>
              ${n.secure ? icon('lock', 'cc-lock') : ''}${n.connected ? icon('check', 'cc-check') : ''}
            </button>`,
              )
              .join('')
          : '<div class="cc-dl">No networks found</div>') + '<button class="cc-link" data-run="wifi">Wi-Fi Settings…</button>';
    } else if (what === 'audio') {
      box.innerHTML =
        (data?.length
          ? data.map((d) => `<button class="cc-opt${d.default ? ' on' : ''}" data-audio="${esc(d.id)}">${icon('volume')}<span class="cc-opt-t">${esc(shortName(d.name))}</span>${d.default ? icon('check', 'cc-check') : ''}</button>`).join('')
          : '<div class="cc-dl">No output devices</div>') + '<button class="cc-link" data-run="sound">Sound Settings…</button>';
    } else if (what === 'power') {
      box.innerHTML =
        POWER.map(([k, label, sub]) => `<button class="cc-opt${data === k ? ' on' : ''}" data-power="${k}"><span class="cc-opt-t">${label}<small>${sub}</small></span>${data === k ? icon('check', 'cc-check') : ''}</button>`).join('') +
        '<button class="cc-link" data-run="power">Power Settings…</button>';
      $('[data-k="power"]').textContent = { efficiency: 'Efficient', balanced: 'Balanced', performance: 'Fast' }[data] || 'Power';
    }
    if (what === 'audio') $('.cc-out').title = `Sound output: ${shortName(data?.find((d) => d.default)?.name) || 'default'}`;
  };
  const load = async (what) => {
    lists[what] = await window.wall.ccList(what);
    paintDrop(what);
    fit();
  };
  const toggleDrop = (what) => {
    openDrop = openDrop === what ? '' : what;
    root.querySelectorAll('.cc-drop').forEach((d) => d.classList.toggle('open', d.dataset.dropFor === openDrop));
    root.querySelectorAll('[data-drop]').forEach((b) => b.classList.toggle('open', b.dataset.drop === openDrop));
    if (openDrop && !lists[openDrop]) root.querySelector(`[data-drop-for="${openDrop}"]`).innerHTML = '<div class="cc-dl">Loading…</div>';
    fit();
    if (openDrop) load(openDrop); // always refresh: networks come and go
    // Wi-Fi: show what Windows remembers now, then the result of a fresh scan
    if (openDrop === 'wifi')
      window.wall.ccScan?.().then((list) => {
        if (openDrop !== 'wifi' || !list) return;
        lists.wifi = list;
        paintDrop('wifi');
        fit();
      });
  };
  // labels on the closed rows
  load('power');
  load('audio');

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.drop) return toggleDrop(b.dataset.drop);
    if (b.dataset.wifi !== undefined) {
      // saved networks connect right here; new ones need a password, so open Settings
      if (!b.dataset.known) return window.wall.action('wifi');
      b.querySelector('.cc-opt-t').insertAdjacentHTML('beforeend', '<small>Connecting…</small>');
      await window.wall.sysSet('wifi-join', b.dataset.wifi);
      setTimeout(() => load('wifi'), 2500);
      return;
    }
    if (b.dataset.audio) {
      lists.audio = (lists.audio || []).map((d) => ({ ...d, default: d.id === b.dataset.audio }));
      paintDrop('audio');
      lists.audio = await window.wall.sysSet('audio-out', b.dataset.audio);
      return paintDrop('audio');
    }
    if (b.dataset.power) {
      lists.power = b.dataset.power;
      paintDrop('power');
      lists.power = await window.wall.sysSet('power', b.dataset.power);
      return paintDrop('power');
    }
    if (b.dataset.pop) return window.wall.popup(b.dataset.pop, { y: 34 });
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
    fit,
  );
}

// ---------------------------------------------------------------- wallpaper settings (from the top bar)

const QUICK_WIDGETS = ['stocks', 'clock', 'commits', 'feed', 'note', 'todo', 'weather', 'music', 'year', 'calendar', 'countdown', 'quote', 'system', 'dock', 'menubar'];

function settings(root) {
  const fmt = (k) => (k || '').replace('CommandOrControl', 'Ctrl');
  let taskbar = null;
  let widgetsOpen = false;
  let openPick = ''; // which inline picker (season / pet) is open
  let more = false; // the less-used settings stay folded away
  const has = (type) => cfg.widgets.some((w) => w.type === type);
  const sw = (key, label, on) => `<button class="sm-row" data-flag="${key}"><span>${label}</span><i class="sm-switch${on ? ' on' : ''}"></i></button>`;
  // a row that opens its options inline (Windows' own dropdown list can't be styled)
  const pick = (key, label, value, choices) =>
    `<button class="sm-row" data-open-pick="${key}"><span>${label}</span><em>${choices.find(([v]) => v === value)?.[1] || value}</em>${icon('chevron', `sm-chev${openPick === key ? ' open' : ''}`)}</button>` +
    (openPick === key
      ? `<div class="sm-opts">${choices.map(([v, l]) => `<button data-pick-k="${key}" data-pick-v="${v}" class="${value === v ? 'on' : ''}">${l}</button>`).join('')}</div>`
      : '');
  const seg = (key, value, choices) => `<span class="sm-seg">${choices.map(([v, l]) => `<button data-${key}="${v}" class="${value === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;


  // ---- shortcuts: click a row, press the new keys; we say right away if it clashes
  let keys = { edit: info.hotkey, spotlight: info.spotlightKey };
  let rec = '';
  const show = (a) => String(a || '—').replace('CommandOrControl', 'Ctrl');
  const NAMED = { Space: 'Space', Enter: 'Enter', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Tab: 'Tab', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete' };
  const accelFrom = (e) => {
    const c = e.code;
    const k = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F\d{1,2}$/.test(c) ? c : NAMED[c];
    if (!k) return null; // only modifiers so far
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    if (!mods.length && !/^F\d/.test(k)) return '';
    return [...mods, k].join('+');
  };
  const keyMsg = (text, kind) => {
    const el = root.querySelector('[data-k="keymsg"]');
    if (el) {
      el.textContent = text;
      el.className = `sm-msg ${kind || ''}`;
    }
  };
  const onKey = async (e) => {
    if (!rec) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      rec = '';
      paint();
      return;
    }
    const accel = accelFrom(e);
    if (accel === null) return;
    if (!accel) return keyMsg('Use Ctrl, Alt or Shift with a key', 'bad');
    const which = rec;
    const r = await window.wall.hotkeyTest(accel, which);
    rec = '';
    if (r.ok) {
      keys[which] = accel;
      cfg[which === 'edit' ? 'hotkey' : 'spotlightHotkey'] = accel;
      save();
    }
    paint();
    keyMsg(r.ok ? `${show(accel)}: ${r.note}` : `${show(accel)}: ${r.reason}`, r.ok ? 'good' : 'bad');
  };
  window.addEventListener('keydown', onKey, true);
  cleanup.push(() => window.removeEventListener('keydown', onKey, true));

  const paint = () => {
    const theme = info.themes.find((t) => t.id === cfg.theme);
    const shown = QUICK_WIDGETS.filter(has).length;
    root.innerHTML = `
      <div class="panel sm">
        <div class="sm-head">
          <div><b>Wallpaper</b><small>${esc(theme?.name || '')}</small></div>
          <button class="sm-pill" data-run="edit" title="${fmt(info.hotkey)}">${icon('grid')}Rearrange</button>
        </div>

        <div class="sm-themes">${info.themes
          .map((t) => `<button class="sm-theme${t.id === cfg.theme ? ' on' : ''}" data-theme="${t.id}" title="${esc(t.name)}"><span>${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span></button>`)
          .join('')}</div>

        <div class="sm-card">
          <div class="sm-row"><span>Appearance</span>${seg('appearance', cfg.appearance || 'auto', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
          <div class="sm-row"><span>Accent</span><span class="sm-dots"><button data-accent="" class="auto${!cfg.accent ? ' on' : ''}" title="Theme color"></button>${Object.entries(TINTS)
            .filter(([k]) => !['graphite', 'white'].includes(k))
            .map(([k, c]) => `<button data-accent="${k}" class="${cfg.accent === k ? 'on' : ''}" style="--c:${c}" title="${k}"></button>`)
            .join('')}</span></div>
          ${cfg.theme === 'astro' ? `<div class="sm-row"><span>Planet</span>${seg('planet', cfg.planet || 'moon', [['moon', 'Moon'], ['mars', 'Mars'], ['earth', 'Earth']])}</div>` : ''}
        </div>

        <div class="sm-card">
          <button class="sm-row" data-widgets><span>Widgets</span><em>${shown} on</em>${icon('chevron', `sm-chev${widgetsOpen ? ' open' : ''}`)}</button>
          ${
            widgetsOpen
              ? `<div class="sm-widgets">${QUICK_WIDGETS.map((type) => {
                  const meta = info.widgets.find((w) => w.type === type);
                  return meta ? `<button class="sm-w${has(type) ? ' on' : ''}" data-widget="${type}">${icon(type === 'music' ? 'volume' : type)}<span>${esc(meta.name)}</span>${icon('check', 'sm-tick')}</button>` : '';
                }).join('')}</div>`
              : ''
          }
        </div>

        <button class="sm-more" data-more>${more ? 'Fewer settings' : 'More settings'}${icon('chevron', `sm-chev${more ? ' open' : ''}`)}</button>
        ${more ? `
        <div class="sm-card">
          ${pick('season', 'Season', cfg.season ?? 'off', [['off', 'Off'], ['auto', 'Auto'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']])}
          ${pick('pet', 'Desktop pet', cfg.pet ?? 'cat', [['off', 'Off'], ['cat', 'Cat'], ['bird', 'Bird']])}
          ${pick('perf', 'Performance', cfg.perf ?? 'auto', [['auto', 'Auto'], ['saver', 'Battery saver'], ['full', 'Full quality']])}
        </div>

        <div class="sm-card">
          ${sw('motion', 'Animations', cfg.motion !== false)}
          ${sw('weatherFx', 'Live weather', cfg.weatherFx !== 'off')}
          ${sw('visualizer', 'Music visualizer', cfg.visualizer !== false)}
          ${sw('clock24', '24-hour clock', !!cfg.clock24)}
          ${sw('taskbar', 'Hide taskbar', !!taskbar)}
          ${sw('autostart', 'Start with Windows', !!cfg.autostart)}
        </div>

        <div class="sm-card">
          <button class="sm-row" data-rec="edit"><span>Rearrange shortcut</span><kbd class="${rec === 'edit' ? 'rec' : ''}">${rec === 'edit' ? 'Press keys…' : show(keys.edit)}</kbd></button>
          <button class="sm-row" data-rec="spotlight"><span>Spotlight shortcut</span><kbd class="${rec === 'spotlight' ? 'rec' : ''}">${rec === 'spotlight' ? 'Press keys…' : show(keys.spotlight)}</kbd></button>
        </div>
        <small class="sm-msg" data-k="keymsg"></small>

        <div class="sm-card">
          <label class="sm-row"><span>Name</span><input data-field="name" placeholder="${esc(info.user || 'Your name')}" value="${esc(cfg.name || '')}" /></label>
          <label class="sm-row"><span>City</span><input data-field="city" placeholder="Auto" value="${esc(cfg.city?.name || '')}" /></label>
        </div>` : ''}
        <small class="sm-msg" data-k="msg"></small>
      </div>`;
    fit();
  };

  window.wall.sysState().then((s) => {
    taskbar = !!s?.taskbarHidden;
    paint();
  });

  const setCity = async (name) => {
    const msg = root.querySelector('[data-k="msg"]');
    if (!name) {
      cfg.city = null;
      msg.textContent = 'Weather follows your location';
    } else {
      msg.textContent = 'Looking up…';
      const city = await window.wall.geocode(name);
      if (!city) return (msg.textContent = 'Could not find that place');
      cfg.city = city;
      msg.textContent = `Weather for ${city.name}`;
    }
    save();
  };

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) return window.wall.action(b.dataset.run);
    if (b.dataset.rec) {
      rec = rec === b.dataset.rec ? '' : b.dataset.rec;
      paint();
      if (rec) keyMsg('Press the new shortcut, or Esc to cancel');
      return;
    }
    if (b.dataset.accent !== undefined && b.closest('.sm-dots')) {
      cfg.accent = b.dataset.accent || undefined;
      save();
      return paint();
    }
    if (b.dataset.openPick) {
      openPick = openPick === b.dataset.openPick ? '' : b.dataset.openPick;
      return paint();
    }
    if (b.dataset.pickK) {
      cfg[b.dataset.pickK] = b.dataset.pickV;
      openPick = '';
      save();
      return paint();
    }
    if (b.dataset.more !== undefined) {
      more = !more;
      return paint();
    }
    if (b.dataset.widgets !== undefined) {
      widgetsOpen = !widgetsOpen;
      return paint();
    }
    if (b.dataset.theme) cfg.theme = b.dataset.theme;
    if (b.dataset.appearance) cfg.appearance = b.dataset.appearance;
    if (b.dataset.planet) cfg.planet = b.dataset.planet;
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
    save();
    paint();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.field === 'name') {
      cfg.name = t.value.trim();
      save();
    }
    if (t.dataset.field === 'city') setCity(t.value.trim());
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.field) e.target.blur(); // blur fires "change", which saves
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
      <button data-run="spotlight">${icon('search')}Search<kbd>${fmt(info.spotlightKey)}</kbd></button>
      <button data-do="note">${icon('note')}New note</button>
      <button data-run="edit">${icon('grid')}Rearrange<kbd>${fmt(info.hotkey)}</kbd></button>
      <button data-pop="settings">${icon('gear')}Settings</button>
      <hr />
      <button data-run="restart">${icon('refresh')}Restart wallpaper</button>
      <button data-run="quit">${icon('power')}Quit ${esc(info.brand?.name || '')}</button>
    </div>`;
  root.innerHTML = id === 'themes' ? themes() : main();
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.run) return window.wall.action(b.dataset.run);
    if (b.dataset.pop) return window.wall.popup(b.dataset.pop, { y: 34 });
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

// ---------------------------------------------------------------- projects (menu bar)

function projectsView(root) {
  root.innerHTML = '<div class="panel pj"><div class="wx-loading">Finding your projects…</div></div>';
  const ago = (t) => {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
  };
  window.wall.projects().then(({ editor, list }) => {
    const panel = root.firstElementChild;
    panel.innerHTML = `
      <div class="pj-search">${icon('search')}<input placeholder="Search projects" spellcheck="false" /></div>
      <div class="pj-list"></div>
      <div class="pj-foot">Opens in <b>${esc(editor)}</b> · Ctrl+click shows the folder</div>`;
    const box = panel.querySelector('.pj-list');
    const input = panel.querySelector('input');
    let sel = 0;
    let shown = [];
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      shown = list.filter((p) => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)).slice(0, 30);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      box.innerHTML = shown.length
        ? shown
            .map(
              (p, i) => `<button class="pj-row${i === sel ? ' sel' : ''}" data-i="${i}">
            <span class="pj-ic">${esc(p.name.slice(0, 1).toUpperCase())}</span>
            <span class="pj-txt"><b>${esc(p.name)}</b><small>${esc(p.path.replace(/^[A-Z]:\\Users\\[^\\]+/i, '~'))}</small></span>
            <em>${ago(p.at)}</em>
          </button>`,
            )
            .join('')
        : '<div class="wx-loading">No projects found. Add a folder with: brow repo scan &lt;folder&gt;</div>';
      fit();
    };
    const open = (i, reveal) => shown[i] && window.wall.action(reveal ? 'reveal' : 'repo', shown[i].path);
    input.addEventListener('input', () => ((sel = 0), draw()));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length);
        draw();
      } else if (e.key === 'Enter') open(sel, e.ctrlKey);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.pj-row');
      if (b) open(Number(b.dataset.i), e.ctrlKey);
    });
    draw();
    setTimeout(() => input.focus(), 50);
  });
}

// ---------------------------------------------------------------- Assistant (chat)

function chatView(root, prefill) {
  root.innerHTML = `
    <div class="panel ch">
      <div class="ch-head"><b>Assistant</b><button class="ch-new" title="New chat">${icon('pencil')}</button></div>
      <div class="ch-list"></div>
      <form class="ch-bar">
        <textarea rows="1" placeholder="Ask anything" spellcheck="false"></textarea>
        <button type="submit" title="Send (Enter)" disabled>${icon('send')}</button>
      </form>
      <div class="ch-foot">Runs privately on this PC</div>
    </div>`;
  const list = root.querySelector('.ch-list');
  const input = root.querySelector('textarea');
  const sendBtn = root.querySelector('.ch-bar button');
  let history = [];
  let sending = false;
  const SUGGEST = ['Plan my day', 'Sort my to-dos by urgency', 'Add a note: call mom at 7'];

  const draw = (thinking) => {
    list.innerHTML = history.length
      ? history
          .map((m, i) =>
            m.role === 'user'
              ? `<div class="ch-me">${esc(m.text)}</div>`
              : `<div class="ch-ai${m.error ? ' err' : ''}"><p>${esc(m.text)}</p>${(m.done || []).map((d) => `<span class="ch-done">${icon('check')}${esc(d)}</span>`).join('')}<button class="ch-copy" data-copy="${i}" title="Copy">${icon('file')}</button></div>`,
          )
          .join('') + (thinking ? '<div class="ch-ai thinking"><p>Thinking</p></div>' : '')
      : `<div class="ch-empty"><b>How can I help?</b>${SUGGEST.map((s) => `<button data-say="${esc(s)}">${esc(s)}${icon('chevron')}</button>`).join('')}</div>`;
    list.scrollTop = list.scrollHeight;
  };
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(110, input.scrollHeight)}px`;
    sendBtn.disabled = !input.value.trim() || sending;
  };
  const send = async (text) => {
    const q = String(text || '').trim();
    if (!q || sending) return;
    sending = true;
    input.value = '';
    grow();
    history = [...history, { role: 'user', text: q }];
    draw(true);
    history = await window.wall.chatSend(q);
    sending = false;
    draw(false);
    grow();
    input.focus();
  };

  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
  root.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.say) return send(b.dataset.say);
    if (b.dataset.copy) {
      navigator.clipboard.writeText(history[Number(b.dataset.copy)]?.text || '');
      b.classList.add('done');
      return setTimeout(() => b.classList.remove('done'), 1200);
    }
    if (b.classList.contains('ch-new')) {
      history = await window.wall.chatClear();
      draw(false);
      input.focus();
    }
  });
  window.wall.chatHistory().then((h) => {
    history = h || [];
    draw(false);
    if (prefill) send(prefill);
  });
  setTimeout(() => input.focus(), 60);
}

// ---------------------------------------------------------------- updates

function updateView(root) {
  root.innerHTML = '<div class="panel upd"><div class="wx-loading">Checking for updates…</div></div>';
  const panel = root.firstElementChild;
  const paint = (s) => {
    if (s.available) {
      panel.innerHTML = `
        <div class="up-ic">${icon('refresh')}</div>
        <b>Update available</b>
        <small>${s.behind} new change${s.behind === 1 ? '' : 's'} from the ${esc(info.brand?.name || '')} repo</small>
        ${s.changes.length ? `<ul class="up-list">${s.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        <div class="up-btns"><button class="wr-btn primary" data-go>Update now</button><button class="wr-btn" data-later>Later</button></div>
        <small class="up-msg" data-k="msg"></small>`;
    } else {
      const why = s.error === 'not-a-clone' ? 'This copy was not cloned with git, so it can’t update itself.' : s.error === 'offline' ? 'Couldn’t reach GitHub. Check your internet.' : 'You have the latest version.';
      panel.innerHTML = `<div class="up-ic ok">${icon(s.error ? 'x' : 'check')}</div><b>${s.error ? 'Can’t check right now' : 'You’re up to date'}</b><small>${why}</small><div class="up-btns"><button class="wr-btn" data-later>Close</button></div>`;
    }
    fit();
  };
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.later !== undefined) return close();
    if (b.dataset.go !== undefined) {
      b.textContent = 'Updating…';
      b.disabled = true;
      const r = await window.wall.updateApply();
      const msg = panel.querySelector('[data-k="msg"]');
      if (r.ok) {
        b.textContent = 'Restarting…';
        msg.textContent = 'Updated. Mirage is restarting with the new version.';
      } else {
        b.textContent = 'Try again';
        b.disabled = false;
        msg.textContent = r.reason;
      }
      fit();
    }
  });
  window.wall.updateCheck().then(paint);
}
