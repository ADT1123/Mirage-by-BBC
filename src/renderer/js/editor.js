// Edit mode: the wallpaper opens as a full-screen layer you can rearrange.
// Drag to move (with snap guides), drag the corner to resize, Esc to finish.

import { icon } from './icons.js';
import { esc } from './widgets.js';
import { renderWidgetForm } from './widgetform.js';
import { wallPicker } from './wallpicker.js';

const SNAP = 7;
const MARGIN = 0.04;

export function createEditor(app) {
  const { info } = app.ctx();
  const chrome = document.getElementById('chrome');
  const history = [];
  let panel = null;
  let selected = null;
  let usePack = false;
  let picker = null;

  document.body.classList.add('editing');
  // opening the editor once means the first-run hint has done its job
  // (deferred so the first render happens with the editor fully set up)
  if (!app.cfg.onboarded) setTimeout(() => app.replace({ ...app.cfg, onboarded: true }), 0);

  chrome.innerHTML = `
    <div class="ed-hint">
      <span class="ed-dot"></span>Editing wallpaper
      <span class="ed-sep"></span>drag to move<span class="ed-sep"></span>drag corner to resize<span class="ed-sep"></span><kbd>Esc</kbd> done
    </div>
    <div class="ed-guide gx"></div><div class="ed-guide gy"></div>
    <div class="ed-panel" data-panel="themes"><div class="ed-wp"></div></div>
    <div class="ed-panel" data-panel="widgets">
      <div class="ed-panel-head"><span>Widgets</span><span class="ed-sub">click to add or remove</span></div>
      <div class="ed-widgets"></div>
    </div>
    <div class="ed-panel ed-wpanel" data-panel="widget"><div class="ed-wform"></div></div>
    <div class="ed-panel" data-panel="settings">
      <div class="ed-panel-head"><span>Settings</span></div>
      <div class="ed-settings"></div>
    </div>
    <div class="ed-dock">
      <button data-open="themes">${icon('palette')}<span>Wallpapers</span></button>
      <button data-open="widgets">${icon('grid')}<span>Widgets</span></button>
      <button data-open="settings">${icon('sliders')}<span>Settings</span></button>
      <span class="ed-div"></span>
      <button data-act="undo" title="Undo (Ctrl+Z)">${icon('undo')}</button>
      <button data-act="reset" title="Reset to the theme's pack layout">${icon('reset')}</button>
      <span class="ed-div"></span>
      <button class="ed-done" data-act="done">${icon('check')}<span>Done</span></button>
    </div>`;

  const $ = (s) => chrome.querySelector(s);
  const gx = $('.gx');
  const gy = $('.gy');

  // ---------------------------------------------------------------- panels

  function open(name) {
    panel = panel === name ? null : name;
    chrome.querySelectorAll('.ed-panel').forEach((p) => p.classList.toggle('open', p.dataset.panel === panel));
    chrome.querySelectorAll('[data-open]').forEach((b) => b.classList.toggle('on', b.dataset.open === panel));
    if (panel) fill(panel);
  }

  function fill(name) {
    const cfg = app.cfg;
    if (name === 'themes') {
      if (picker) picker.paint();
      else
        picker = wallPicker($('.ed-wp'), {
          info,
          getCfg: () => app.cfg,
          commit: app.commit,
          extra: () => `<label class="ed-check"><input type="checkbox" data-k="pack"${usePack ? ' checked' : ''} /> Also use the widget layout that suits this wallpaper</label>`,
          onPick: async (w) => {
            const layout = usePack ? await window.wall.preset(w.skin) : null;
            app.commit((c) => {
              c.wall = w.id;
              c.theme = w.skin;
              if (layout) c.widgets = layout;
            });
          },
        });
    }
    if (name === 'widgets') {
      $('.ed-widgets').innerHTML = info.widgets
        .map((w) => {
          const on = cfg.widgets.some((x) => x.type === w.type);
          return `
          <button class="ed-widget${on ? ' on' : ''}" data-type="${w.type}">
            <span class="wi">${icon(w.type)}</span>
            <span class="wn">${esc(w.name)}${w.multi ? ' <em>+</em>' : ''}</span>
            <span class="wd">${esc(w.desc)}</span>
            <span class="wbadge">${on ? (w.multi ? 'add another' : 'on') : 'add'}</span>
          </button>`;
        })
        .join('');
    }
    if (name === 'settings') {
      $('.ed-settings').innerHTML = `
        <label class="ed-field"><span>Your name</span><input data-set="name" value="${esc(cfg.name || '')}" placeholder="${esc(info.user || 'Name for the greeting')}" /></label>
        <label class="ed-field"><span>City for weather</span>
          <span class="ed-row"><input data-set="city" value="${esc(cfg.city ? `${cfg.city.name}${cfg.city.country ? ', ' + cfg.city.country : ''}` : '')}" placeholder="e.g. Mumbai" /><button class="ed-mini" data-act="city">Set</button></span>
          <small data-k="city-msg"></small>
        </label>
        <div class="ed-field"><span>Appearance</span>
          <span class="ed-seg">${[['sun', 'Auto (sunset)'], ['light', 'Day'], ['dark', 'Night'], ['auto', 'Windows']].map(([a, l]) => `<button data-appearance="${a}" class="${(cfg.appearance || 'auto') === a ? 'on' : ''}">${l}</button>`).join('')}</span>
        </div>
        <div class="ed-field"><span>Clock</span>
          <span class="ed-seg"><button data-clock="12" class="${!cfg.clock24 ? 'on' : ''}">12h</button><button data-clock="24" class="${cfg.clock24 ? 'on' : ''}">24h</button></span>
        </div>
        <div class="ed-field"><span>Background</span>
          <span class="ed-seg"><button data-bg="scene" class="${!cfg.background ? 'on' : ''}">Theme scene</button><button data-bg="image" class="${cfg.background ? 'on' : ''}">Your image…</button></span>
        </div>
        <label class="ed-field ${cfg.background ? '' : 'muted'}"><span>Image dim</span><input type="range" min="0" max="0.8" step="0.05" data-set="dim" value="${cfg.dim ?? 0.25}" /></label>
        <div class="ed-toggles">
          <label class="ed-toggle"><input type="checkbox" data-set="motion" ${cfg.motion !== false ? 'checked' : ''}/><i></i>Motion</label>
          <label class="ed-toggle"><input type="checkbox" data-set="autostart" ${cfg.autostart ? 'checked' : ''}/><i></i>Start with ${info.platform === 'darwin' ? 'macOS' : 'Windows'}</label>
        </div>
        <div class="ed-foot">Edit hotkey <kbd>${esc((info.hotkey || cfg.hotkey || '').replace('CommandOrControl', 'Ctrl'))}</kbd> · or run <code>${esc(info.brand?.command || '')} edit</code></div>`;
    }
  }

  chrome.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.open) return open(t.dataset.open);
    if (t.dataset.type) return toggleWidget(t.dataset.type);
    if (t.dataset.appearance) {
      app.commit((c) => (c.appearance = t.dataset.appearance));
      return fill('settings');
    }
    if (t.dataset.clock) {
      app.commit((c) => (c.clock24 = t.dataset.clock === '24'));
      return fill('settings');
    }
    if (t.dataset.bg === 'scene') {
      app.commit((c) => (c.background = null));
      return fill('settings');
    }
    if (t.dataset.bg === 'image') {
      const p = await window.wall.pickImage();
      if (p) app.commit((c) => (c.background = p));
      return fill('settings');
    }
    switch (t.dataset.act) {
      case 'done':
        return done();
      case 'undo':
        return undo();
      case 'reset': {
        const layout = await window.wall.preset(app.cfg.theme);
        return app.commit((c) => (c.widgets = layout));
      }
      case 'city':
        return setCity();
    }
  });

  chrome.addEventListener('change', (e) => {
    const k = e.target.dataset.set;
    if (e.target.dataset.k === 'pack') usePack = e.target.checked;
    if (!k) return;
    if (k === 'motion' || k === 'autostart') app.commit((c) => (c[k] = e.target.checked));
    if (k === 'name') app.commit((c) => (c.name = e.target.value.trim()));
    if (k === 'dim') app.commit((c) => (c.dim = Number(e.target.value)));
  });
  chrome.addEventListener('input', (e) => {
    if (e.target.dataset.set === 'dim') document.getElementById('backdrop').style.setProperty('--dim', e.target.value);
  });
  chrome.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.set === 'city') setCity();
    if (e.key === 'Enter' && e.target.dataset.set === 'name') e.target.blur();
    e.stopPropagation();
  });

  async function setCity() {
    const input = $('[data-set="city"]');
    const msg = $('[data-k="city-msg"]');
    const name = input.value.split(',')[0].trim();
    if (!name) {
      app.commit((c) => (c.city = null));
      msg.textContent = 'Cleared.';
      return;
    }
    msg.textContent = 'Looking up…';
    const city = await window.wall.geocode(name);
    if (!city) {
      msg.textContent = 'Could not find that place (are you online?).';
      return;
    }
    app.commit((c) => (c.city = city));
    msg.textContent = `Set to ${city.name}, ${city.country}`;
    input.value = `${city.name}, ${city.country}`;
  }

  async function toggleWidget(type) {
    const meta = info.widgets.find((w) => w.type === type);
    const existing = app.cfg.widgets.filter((w) => w.type === type);
    if (existing.length && !meta.multi) {
      app.commit((c) => (c.widgets = c.widgets.filter((w) => w.type !== type)));
    } else {
      const n = existing.length;
      const extra = type === 'note' ? { color: info.noteColors[n % info.noteColors.length] } : {};
      const w = await window.wall.make(type, 0.4 + (n % 4) * 0.03, 0.3 + (n % 4) * 0.04, extra);
      app.commit((c) => c.widgets.push(w));
      requestAnimationFrame(() => select(w.id));
    }
    fill('widgets');
  }

  // ---------------------------------------------------------------- history

  function remember(cfg) {
    history.push(JSON.stringify(cfg));
    if (history.length > 60) history.shift();
  }

  function undo() {
    const prev = history.pop();
    if (prev) app.replace(JSON.parse(prev));
    if (panel) fill(panel);
  }

  function done() {
    document.body.classList.add('leaving');
    setTimeout(() => window.wall.closeEditor(), 180);
  }

  // ---------------------------------------------------------------- widgets on stage

  function select(id) {
    selected = id;
    for (const [rid, rec] of app.recs) rec.el.classList.toggle('sel', rid === id);
  }

  function updateWidget(id, fn, silent = false) {
    app.commit((c) => {
      const w = c.widgets.find((x) => x.id === id);
      if (w) fn(w, c);
    }, silent ? { skip: id } : {});
  }

  // Edit Widget panel: works on a copy and commits each change (so undo works per step)
  function editWidget(id) {
    const original = app.cfg.widgets.find((w) => w.id === id);
    if (!original) return;
    const w = structuredClone(original);
    panel = 'widget';
    chrome.querySelectorAll('.ed-panel').forEach((p) => p.classList.toggle('open', p.dataset.panel === 'widget'));
    chrome.querySelectorAll('[data-open]').forEach((b) => b.classList.remove('on'));
    renderWidgetForm(
      $('.ed-wform'),
      w,
      info,
      () => app.commit((c) => {
        const i = c.widgets.findIndex((x) => x.id === id);
        if (i >= 0) c.widgets[i] = structuredClone(w);
      }),
      () => {
        removeWidget(id);
        open('widget');
      },
    );
  }

  function removeWidget(id) {
    app.commit((c) => (c.widgets = c.widgets.filter((w) => w.id !== id)));
    if (panel === 'widgets') fill('widgets');
  }

  // Called after every (re)render of a widget.
  function decorate(el, w) {
    const tools = document.createElement('div');
    tools.className = 'w-tools';
    tools.innerHTML =
      (w.type === 'note'
        ? info.noteColors.map((c) => `<button class="nc${c === w.color ? ' on' : ''}" data-color="${c}" title="${c}"></button>`).join('') + '<span class="ed-div"></span>'
        : '') + `<button class="w-cfg" title="Edit widget">${icon('sliders')}</button><button class="w-del" title="Remove">${icon('x')}</button>`;
    el.append(tools);
    if (w.type !== 'menubar') {
      const h = document.createElement('div');
      h.className = 'w-resize';
      el.append(h);
    }

    el.querySelectorAll('[data-edit]').forEach((f) => {
      f.addEventListener('input', () => {
        const val = f.innerText.replace(/\n{3,}/g, '\n\n');
        updateWidget(w.id, (x) => {
          x[f.dataset.edit] = val;
          if (x.type === 'quote' && f.dataset.edit === 'text' && !x.author) x.author = el.querySelector('[data-edit="author"]')?.innerText || '';
          if (x.type === 'quote' && f.dataset.edit === 'author' && !x.text) x.text = el.querySelector('[data-edit="text"]')?.innerText || '';
        }, true);
      });
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') f.blur();
        e.stopPropagation();
      });
    });

    const add = el.querySelector('.todo-add');
    add?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && add.value.trim()) {
        const text = add.value.trim();
        updateWidget(w.id, (x) => (x.items = [...(x.items || []), { text, done: false }]));
        requestAnimationFrame(() => app.recs.get(w.id)?.el.querySelector('.todo-add')?.focus());
      }
    });
    el.querySelector('.cd-date')?.addEventListener('change', (e) => updateWidget(w.id, (x) => (x.date = e.target.value)));

    if (selected === w.id) el.classList.add('sel');
  }

  app.stage.addEventListener('click', (e) => {
    const el = e.target.closest('.w');
    if (!el) return;
    const id = el.dataset.id;
    const color = e.target.closest('.nc');
    if (color) return updateWidget(id, (x) => (x.color = color.dataset.color));
    if (e.target.closest('.w-cfg')) return editWidget(id);
    if (e.target.closest('.w-del')) return removeWidget(id);
    const del = e.target.closest('.todo-del');
    if (del) return updateWidget(id, (x) => x.items.splice(Number(del.dataset.i), 1));
    const item = e.target.closest('.todo-item');
    if (item && !e.target.closest('[data-edit]')) return updateWidget(id, (x) => (x.items[item.dataset.i].done = !x.items[item.dataset.i].done));
  });

  // ---------------------------------------------------------------- drag + resize

  let drag = null;

  app.stage.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.w');
    if (!el) {
      select(null);
      return;
    }
    select(el.dataset.id);
    if (el.dataset.id === 'menubar') return;
    if (e.target.closest('[data-edit], input, button, .todo-item')) return;
    const w = app.cfg.widgets.find((x) => x.id === el.dataset.id);
    if (!w) return;
    const r = el.getBoundingClientRect();
    drag = {
      el,
      id: w.id,
      mode: e.target.closest('.w-resize') ? 'resize' : 'move',
      sx: e.clientX,
      sy: e.clientY,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      scale: w.scale || 1,
      center: w.align === 'center',
      others: [...app.recs.values()].filter((x) => x.el !== el && x.el.dataset.id !== 'menubar').map((x) => x.el.getBoundingClientRect()),
    };
    el.classList.add('dragging');
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  app.stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const W = innerWidth;
    const H = innerHeight;
    if (drag.mode === 'resize') {
      const s = Math.min(2.6, Math.max(0.45, drag.scale * ((drag.width + (e.clientX - drag.sx)) / drag.width)));
      drag.el.style.setProperty('--s', s.toFixed(3));
      drag.next = { scale: Number(s.toFixed(3)) };
      return;
    }
    let x = drag.left + e.clientX - drag.sx;
    let y = drag.top + e.clientY - drag.sy;
    const w = drag.width;
    const h = drag.height;

    const xs = [W * MARGIN, W / 2, W * (1 - MARGIN)];
    const ys = [H * MARGIN, H / 2, H * (1 - MARGIN)];
    for (const o of drag.others) {
      xs.push(o.left, o.right, o.left + o.width / 2);
      ys.push(o.top, o.bottom, o.top + o.height / 2);
    }
    const sx = snap([x, x + w / 2, x + w], xs);
    const sy = snap([y, y + h / 2, y + h], ys);
    if (sx) x += sx.d;
    if (sy) y += sy.d;
    gx.style.cssText = sx ? `left:${sx.line}px;opacity:1` : 'opacity:0';
    gy.style.cssText = sy ? `top:${sy.line}px;opacity:1` : 'opacity:0';

    x = Math.min(W - 24, Math.max(-w + 24, x));
    y = Math.min(H - 24, Math.max(0, y));
    // centered widgets are positioned by their middle (translateX(-50%))
    const ax = drag.center ? x + w / 2 : x;
    drag.el.style.left = `${ax}px`;
    drag.el.style.top = `${y}px`;
    drag.next = { x: Number((ax / W).toFixed(4)), y: Number((y / H).toFixed(4)) };
  });

  function endDrag() {
    if (!drag) return;
    const { id, next, el } = drag;
    el.classList.remove('dragging');
    drag = null;
    gx.style.opacity = gy.style.opacity = '0';
    if (next) updateWidget(id, (x) => Object.assign(x, next));
  }
  app.stage.addEventListener('pointerup', endDrag);
  app.stage.addEventListener('pointercancel', endDrag);

  function snap(points, lines) {
    let best = null;
    for (const p of points) {
      for (const l of lines) {
        const d = l - p;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: l };
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- keyboard

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return panel ? open(panel) : done();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') return undo();
    if (!selected) return;
    if (e.key === 'Delete' || e.key === 'Backspace') return removeWidget(selected);
    const step = e.shiftKey ? 0.02 : 0.002;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      updateWidget(selected, (x) => {
        x.x = Number((x.x + mv[0]).toFixed(4));
        x.y = Number((x.y + mv[1]).toFixed(4));
      });
    }
  });

  return {
    decorate,
    remember,
    sync() {
      if (panel) fill(panel);
    },
  };
}
