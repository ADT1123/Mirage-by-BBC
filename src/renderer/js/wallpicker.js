// The wallpaper gallery, shared by the editor and the Wallpapers popup: pick a pack, then a
// design in it; set day & night; make your own Color or Emoji wallpaper.

import { renderThumb } from './gl/engine.js';
import { esc } from './widgets.js';

const DAYNIGHT = [
  ['sun', 'Auto', 'Light by day, dark after sunset'],
  ['light', 'Day', 'Always the daytime look'],
  ['dark', 'Night', 'Always the night look'],
  ['auto', 'System', 'Follows Windows light and dark mode'],
];
const STYLES = [['mesh', 'Mesh'], ['linear', 'Linear'], ['radial', 'Radial']];
const LAYOUTS = [['grid', 'Grid'], ['rings', 'Rings'], ['spiral', 'Spiral']];

const toHex = (v) => `#${(v || [0, 0, 0]).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

const thumbs = new Map();
let queue = Promise.resolve();

function thumbKey(wall, cfg, night) {
  const custom = wall.custom ? JSON.stringify(cfg.wallCustom?.[wall.kind] || {}) : '';
  return `wt3:${wall.id}:${night}:${custom}`;
}

// thumbnails are drawn one at a time (they share one GPU context) and kept for next time
function fillThumb(el, wall, cfg, night) {
  if (wall.kind === 'scene') {
    el.classList.add('thumb');
    el.dataset.t = wall.scene;
    el.innerHTML = '<i></i><i></i><i></i>';
    return;
  }
  // Astronomy ships ready-made previews: drawing them here meant decoding a 2k map each
  if (wall.pack === 'astro') {
    el.style.backgroundImage = `url("${new URL(`../../../assets/thumbs/${wall.id}.jpg`, import.meta.url).href}")`;
    el.classList.add('ready');
    return;
  }
  const key = thumbKey(wall, cfg, night);
  const show = (url) => {
    if (url) el.style.backgroundImage = `url("${url}")`;
    el.classList.add('ready');
  };
  let hit = thumbs.get(key);
  if (!hit && !wall.custom) {
    try {
      hit = localStorage.getItem(key);
    } catch {}
  }
  if (hit) return show(hit);
  queue = queue.then(async () => {
    if (!el.isConnected) return;
    const url = await renderThumb(wall, cfg, night).catch(() => null);
    if (!url) return show(null);
    thumbs.set(key, url);
    if (!wall.custom) {
      try {
        localStorage.setItem(key, url);
      } catch {}
    }
    show(url);
    await new Promise((r) => setTimeout(r, 16));
  });
}

export function wallPicker(root, { info, getCfg, commit, onPick, onRender, extra = '' }) {
  const walls = info.walls || [];
  const packs = info.packs || [];
  let open = walls.find((w) => w.id === getCfg().wall)?.pack || packs[0]?.id;
  let typing = 0;

  function paint() {
    const cfg = getCfg();
    const night = document.documentElement.dataset.appearance === 'dark' ? 1 : 0;
    const cur = walls.find((w) => w.id === cfg.wall);
    const pack = packs.find((p) => p.id === open) || packs[0];
    const inPack = walls.filter((w) => w.pack === pack.id);
    const color = cfg.wallCustom?.color || {};
    const emoji = cfg.wallCustom?.emoji || {};
    const dn = cfg.appearance || 'auto';

    root.innerHTML = `
      <div class="wp">
        <div class="wp-head">
          <div class="wp-title"><b>Wallpapers</b><small>${packs.length} packs · ${walls.length} designs</small></div>
          <div class="wp-seg" role="group" aria-label="Day and night">${DAYNIGHT.map(([v, l, tip]) => `<button type="button" data-dn="${v}" class="${dn === v ? 'on' : ''}" title="${tip}">${l}</button>`).join('')}</div>
        </div>
        <div class="wp-packs">${packs
          .map((p) => {
            const list = walls.filter((w) => w.pack === p.id);
            return `<button type="button" class="wp-pack${p.id === pack.id ? ' on' : ''}" data-pack="${p.id}">
              <span class="wp-cover" data-thumb="${list[0]?.id || ''}"></span>
              <span class="wp-pname">${esc(p.name)}</span>
              <span class="wp-pcount">${list.length} designs${list.some((w) => w.id === cfg.wall) ? ' · in use' : ''}</span>
            </button>`;
          })
          .join('')}</div>
        <div class="wp-pack-head"><b>${esc(pack.name)}</b><span>${esc(pack.desc)}</span></div>
        <div class="wp-grid">${inPack
          .map((w) => `<button type="button" class="wp-tile${w.id === cfg.wall ? ' on' : ''}" data-wall="${w.id}" aria-pressed="${w.id === cfg.wall}">
              <span class="wp-img" data-thumb="${w.id}"></span>
              <span class="wp-name">${esc(w.name)}${w.custom ? '<em>Edit below</em>' : ''}</span>
            </button>`)
          .join('')}</div>
        ${
          pack.id === 'color'
            ? `<div class="wp-make">
                <div class="wp-make-title">Your Colors</div>
                <div class="wp-row"><span>Colors</span><span class="wp-colors">${['A', 'B', 'C'].map((k) => `<label class="wp-swatch" style="--c:${toHex(color[k])}"><input type="color" data-color="${k}" value="${toHex(color[k])}" aria-label="Color ${k}" /></label>`).join('')}</span></div>
                <div class="wp-row"><span>Style</span><span class="wp-seg">${STYLES.map(([v, l]) => `<button type="button" data-style="${v}" class="${color.style === v ? 'on' : ''}">${l}</button>`).join('')}</span></div>
              </div>`
            : ''
        }
        ${
          pack.id === 'emoji'
            ? `<div class="wp-make">
                <div class="wp-make-title">Your Emoji</div>
                <label class="wp-row"><span>Emoji</span><input class="wp-input" data-emoji maxlength="40" value="${esc(emoji.text || '')}" placeholder="Type up to 6 emoji" /></label>
                <div class="wp-row"><span>Layout</span><span class="wp-seg">${LAYOUTS.map(([v, l]) => `<button type="button" data-layout="${v}" class="${emoji.layout === v ? 'on' : ''}">${l}</button>`).join('')}</span></div>
                <div class="wp-row"><span>Background</span><label class="wp-swatch" style="--c:${esc(emoji.bg || '#2b2f6b')}"><input type="color" data-emojibg value="${esc(emoji.bg || '#2b2f6b')}" aria-label="Background color" /></label></div>
              </div>`
            : ''
        }
        <div class="wp-foot">
          <label class="wp-row"><span>Widget style</span>
            <select class="wp-select" data-skin>${(info.themes || []).map((t) => `<option value="${t.id}"${t.id === cfg.theme ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          </label>
          ${typeof extra === 'function' ? extra() : extra}
          <small class="wp-now">${cur ? `Now: ${esc(cur.name)} · ${esc(packs.find((p) => p.id === cur.pack)?.name || '')}` : ''}</small>
        </div>
      </div>`;

    root.querySelectorAll('[data-thumb]').forEach((el) => {
      const w = walls.find((x) => x.id === el.dataset.thumb);
      if (w) fillThumb(el, w, cfg, night);
    });
    onRender?.();
  }

  const pick = async (w) => {
    if (onPick) await onPick(w);
    else commit((c) => {
      c.wall = w.id;
      c.theme = w.skin;
    });
    paint();
  };
  const custom = (kind, fn) => {
    commit((c) => {
      c.wallCustom ??= {};
      c.wallCustom[kind] = { ...(c.wallCustom[kind] || {}) };
      fn(c.wallCustom[kind]);
      const w = walls.find((x) => x.pack === kind && x.custom);
      if (w && c.wall !== w.id) {
        c.wall = w.id;
        c.theme = w.skin;
      }
    });
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.pack) {
      open = b.dataset.pack;
      return paint();
    }
    if (b.dataset.wall) return pick(walls.find((w) => w.id === b.dataset.wall));
    if (b.dataset.dn) {
      commit((c) => (c.appearance = b.dataset.dn));
      return setTimeout(paint, 60);
    }
    if (b.dataset.style) {
      custom('color', (o) => (o.style = b.dataset.style));
      return paint();
    }
    if (b.dataset.layout) {
      custom('emoji', (o) => (o.layout = b.dataset.layout));
      return paint();
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.color) {
      t.parentElement.style.setProperty('--c', t.value);
      custom('color', (o) => (o[t.dataset.color] = fromHex(t.value)));
    }
    if (t.dataset.emojibg !== undefined) {
      t.parentElement.style.setProperty('--c', t.value);
      custom('emoji', (o) => (o.bg = t.value));
    }
    if (t.dataset.emoji !== undefined) {
      clearTimeout(typing);
      typing = setTimeout(() => custom('emoji', (o) => (o.text = t.value)), 250);
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.skin !== undefined) commit((c) => (c.theme = t.value));
    // a finished color pick redraws the "Your Colors" thumbnail
    if (t.dataset.color || t.dataset.emojibg !== undefined || t.dataset.emoji !== undefined) paint();
  });
  // typing an emoji must not trigger the editor's shortcuts
  root.addEventListener('keydown', (e) => {
    if (e.target.matches('input') && e.key !== 'Escape') e.stopPropagation();
  });

  paint();
  return { paint };
}
