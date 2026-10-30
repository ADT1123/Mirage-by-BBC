// "Edit Widget": one form for any widget, used by the live wallpaper popup and the editor.
// It edits a widget object in place and calls onChange() after every change.

import { esc, SHAPES, fileUrl } from './widgets.js';
import { icon } from './icons.js';

export const STYLES = [
  ['theme', 'Theme'],
  ['glass', 'Glass'],
  ['solid', 'Solid'],
  ['clear', 'Clear'],
  ['outline', 'Outline'],
];

export const TINTS = {
  graphite: '#1c1c1e',
  white: '#f5f5f7',
  blue: '#0a84ff',
  indigo: '#5e5ce6',
  purple: '#bf5af2',
  pink: '#ff375f',
  orange: '#ff9f0a',
  green: '#30d158',
  teal: '#32ade6',
};

const SIZES = [
  ['S', 0.82],
  ['M', 1],
  ['L', 1.22],
];

// widgets that can live inside a Smart Stack (fixed-size cards that read well alone)
export const STACKABLE = ['stocks', 'weather', 'calendar', 'music', 'year', 'countdown', 'system', 'feed', 'clock', 'quote'];

const NO_STYLE = new Set(['menubar', 'dock', 'note']);

// per-widget options: [key, label, kind, choices]
const ROTATE = [['day', 'Daily'], ['hour', 'Hourly'], ['15m', '15 min'], ['1m', 'Every min']];

// Fonts for widgets, like the lock-screen clock picker. "weights" = the font has a weight axis.
export const FONTS = {
  classic: { label: 'Classic', family: "'Inter Variable', system-ui, sans-serif", weights: [100, 900] },
  rounded: { label: 'Rounded', family: "'Fredoka Variable', sans-serif", weights: [300, 700] },
  serif: { label: 'Serif', family: "'Instrument Serif', Georgia, serif" },
  mono: { label: 'Mono', family: "'JetBrains Mono Variable', monospace", weights: [100, 800] },
  heritage: { label: 'Heritage', family: "'Tiro Devanagari Sanskrit', serif" },
  pixel: { label: 'Pixel', family: "'Mirage Pixel', 'Pixelify Sans', monospace" },
  comic: { label: 'Comic', family: "'Bangers', cursive" },
};
const NO_FONT = new Set(['menubar', 'dock', 'stack', 'music', 'commits', 'art', 'photo', 'memories']);

const OPTIONS = {
  clock: [
    ['variant', 'Look', 'seg', [['classic', 'Classic'], ['analog', 'Analog'], ['stacked', 'Stacked'], ['minimal', 'Minimal']]],
    ['showDate', 'Date', 'toggle', true],
    ['showGreeting', 'Greeting', 'toggle', true],
  ],
  commits: [
    ['weeks', 'Range', 'seg', [[13, '3 mo'], [26, '6 mo'], [53, '1 yr']]],
    ['showStats', 'Streak stats', 'toggle', true],
  ],
  feed: [['count', 'Commits', 'seg', [[3, '3'], [5, '5'], [8, '8']]]],
  todo: [['hideDone', 'Hide completed', 'toggle', false]],
  note: [['fontSize', 'Text', 'seg', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]]],
  year: [['decimals', 'Precision', 'seg', [[0, '82%'], [2, '82.24%'], [6, 'Live']]]],
  weather: [['details', 'Details', 'toggle', true]],
  quote: [
    ['size', 'Size', 'seg', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], 'm'],
    ['rotate', 'New quote', 'seg', ROTATE, 'day'],
  ],
  verse: [['rotate', 'New verse', 'seg', ROTATE, 'day']],
  stocks: [['symbols', 'Watchlist', 'list', '^NSEI, RELIANCE.NS, AAPL, BTC-USD']],
  photo: [['every', 'Change photo', 'seg', [[0, 'Never'], [1, '1 min'], [60, 'Hourly'], [1440, 'Daily']], 0]],
  sticker: [['plain', 'No background', 'toggle', false]],
  memories: [['every', 'Change photo', 'seg', [[1, '1 min'], [15, '15 min'], [60, 'Hourly']], 15]],
  stack: [['interval', 'Rotate', 'seg', [[0, 'Off'], [6, '6s'], [12, '12s'], [30, '30s']]]],
};

const WEIGHT_NAMES = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const weightName = (v) => WEIGHT_NAMES[Math.round(v / 100) * 100] || '';
const CORNERS = [['', 'Theme'], ['round', 'Round'], ['soft', 'Soft'], ['square', 'Square']];
let lastTab = { id: '', tab: 'look' }; // the open tab survives re-renders of the same widget

// Edit Widget, iPhone-customization style: Look / Font / Options tabs, live previews.
export function renderWidgetForm(root, w, info, onChange, onRemove, onResize) {
  const meta = info.widgets.find((x) => x.type === w.type) || { name: w.type };
  const opt = (key, def) => (w[key] === undefined ? def : w[key]);
  const styled = !NO_STYLE.has(w.type);
  const style = opt('style', 'theme');
  const tinted = ['solid', 'glass', 'outline'].includes(style);
  const hasFont = !NO_FONT.has(w.type);

  const seg = (key, choices, def) =>
    `<div class="wg-seg">${choices.map(([v, label]) => `<button data-k="${key}" data-v="${esc(String(v))}" class="${String(opt(key, def)) === String(v) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
  const sw = (key, def) => `<button class="wg-switch${opt(key, def) ? ' on' : ''}" data-flip="${key}" role="switch" aria-checked="${!!opt(key, def)}"><i></i></button>`;
  // the last swatch: any color at all
  const custom = (key) => {
    const v = /^#[0-9a-f]{6}$/i.test(w[key] || '') ? w[key] : '';
    return `<label class="wg-anycolor${v ? ' on' : ''}" title="Any color" style="${v ? `--c:${v}` : ''}"><input type="color" data-anycolor="${key}" value="${v || '#ff6b6b'}" />${v ? icon('check') : icon('plus')}</label>`;
  };
  const row = (label, control, cls = '') => `<div class="wg-row ${cls}"><span>${label}</span>${control}</div>`;

  const fields = (OPTIONS[w.type] || [])
    .map(([key, label, kind, extra, def]) =>
      kind === 'list'
        ? row(label, `<input class="wg-input" data-list="${key}" value="${esc((w[key] || []).join(', '))}" placeholder="${esc(extra)}" spellcheck="false" /><small class="wg-hint">Yahoo Finance symbols, comma separated. Indian stocks end in .NS</small>`, 'stack')
        : kind === 'seg'
        ? row(label, seg(key, extra, def ?? extra[w.type === 'note' ? 1 : w.type === 'commits' || w.type === 'year' ? extra.length - 1 : 0][0]), 'stack')
        : row(label, sw(key, extra)),
    )
    .join('');

  const stackItems =
    w.type === 'stack'
      ? `<div class="wg-label">In this stack</div>
         <div class="wg-card">${(w.items || [])
           .map((it, i) => {
             const m = info.widgets.find((x) => x.type === it.type);
             return `<div class="wg-item"><span class="wg-mini">${icon(it.type === 'music' ? 'volume' : it.type)}</span><b>${esc(m?.name || it.type)}</b>
               <button data-move="${i}" data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('chevron')}</button>
               <button data-move="${i}" data-dir="1" title="Move down" ${i === w.items.length - 1 ? 'disabled' : ''}>${icon('chevron')}</button>
               <button data-drop="${i}" title="Remove">${icon('x')}</button></div>`;
           })
           .join('')}</div>
         <div class="wg-add">${STACKABLE.filter((t) => !(w.items || []).some((it) => it.type === t))
           .map((t) => `<button data-add="${t}">${icon('plus')}${esc(info.widgets.find((x) => x.type === t)?.name || t)}</button>`)
           .join('')}</div>`
      : '';

  const tabs = [['look', 'Look'], ...(hasFont ? [['font', 'Font']] : []), ...(fields || stackItems || w.type === 'photo' || w.type === 'sticker' ? [['options', w.type === 'stack' ? 'Stack' : w.type === 'photo' ? 'Photos' : 'Options']] : [])];
  if (lastTab.id !== w.id) lastTab = { id: w.id, tab: 'look' };
  if (!tabs.some(([k]) => k === lastTab.tab)) lastTab.tab = 'look';
  const tab = lastTab.tab;

  // ---- Look
  const shapes = SHAPES[w.type];
  const look = () => `
    ${
      shapes
        ? `<div class="wg-label">Size</div>
           <div class="wg-shapes">${[['', 'Default'], ...shapes.map((s) => [s, s === 'small' ? 'Small' : 'Medium'])]
             .map(([k, label]) => `<button data-k="shape" data-v="${k}" class="${(w.shape || '') === k ? 'on' : ''}"><i class="s-${k || 'auto'}"></i>${label}</button>`)
             .join('')}</div>`
        : ''
    }
    ${
      styled
        ? `<div class="wg-label">Style</div>
           <div class="wg-styles">${STYLES.map(([k, label]) => `<button data-k="style" data-v="${k}" class="${style === k ? 'on' : ''}"><i class="wg-prev p-${k}" style="--c:${TINTS[opt('tint', 'graphite')]}"></i><span>${label}</span></button>`).join('')}</div>
           ${
             tinted
               ? `<div class="wg-label">Color</div><div class="wg-swatches">${Object.entries(TINTS)
                   .map(([k, c]) => `<button data-tint="${k}" class="${opt('tint', 'graphite') === k ? 'on' : ''}" style="--c:${c}" title="${k}">${icon('check')}</button>`)
                   .join('')}${custom('tint')}</div>`
               : ''
           }
           <div class="wg-label">Highlight color</div><div class="wg-hint">Colors the greeting, bars and charts. Auto uses the theme color.</div>
           <div class="wg-swatches"><button data-accent="" class="auto${!w.accent ? ' on' : ''}" title="Theme accent">Auto</button>${Object.entries(TINTS)
             .filter(([k]) => k !== 'graphite' && k !== 'white')
             .map(([k, c]) => `<button data-accent="${k}" class="${w.accent === k ? 'on' : ''}" style="--c:${c}" title="${k}">${icon('check')}</button>`)
             .join('')}${custom('accent')}</div>`
        : ''
    }
    ${
      styled
        ? `<div class="wg-label">Text color</div>
           <div class="wg-swatches"><button data-textc="" class="auto${!w.textColor ? ' on' : ''}" title="Theme text">Auto</button>${Object.entries(TINTS)
             .map(([k, c]) => `<button data-textc="${k}" class="${w.textColor === k ? 'on' : ''}" style="--c:${c}" title="${k}">${icon('check')}</button>`)
             .join('')}${custom('textColor')}</div>`
        : ''
    }
    <div class="wg-label">Scale</div>
    <div class="wg-seg">${SIZES.map(([l, s]) => `<button data-size="${s}" class="${Math.abs((w.scale || 1) - s) < 0.06 ? 'on' : ''}">${{ S: 'Small', M: 'Medium', L: 'Large' }[l]}</button>`).join('')}</div>
    ${
      styled
        ? `<div class="wg-label">Corners</div>
           <div class="wg-corners">${CORNERS.map(([k, label]) => `<button data-k="corners" data-v="${k}" class="${(w.corners || '') === k ? 'on' : ''}"><i class="c-${k || 'theme'}"></i><span>${label}</span></button>`).join('')}</div>
           <div class="wg-card">
             ${['solid', 'glass'].includes(style) ? row('Opacity', `<span class="wg-slide"><input type="range" min="0.35" max="1" step="0.05" data-range="opacity" value="${opt('opacity', 1)}" /><em data-out="opacity">${Math.round(opt('opacity', 1) * 100)}%</em></span>`, 'slider-row') : ''}
             ${row('Shadow', sw('shadow', true))}
           </div>`
        : ''
    }`;

  // ---- Font: a live preview on top, like the lock screen
  const font = () => {
    const f = FONTS[w.font];
    const range = f ? f.weights : FONTS.classic.weights;
    const weight = w.weight || (w.type === 'clock' ? 250 : 500);
    const now = new Date();
    const sample = w.type === 'clock' ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '') : 'Aa Bb 123';
    return `
      <div class="wg-preview" style="font-family:${(f || FONTS.classic).family.replace(/"/g, '&quot;')};${range ? `font-weight:${weight}` : ''}">${esc(sample)}</div>
      <div class="wg-fonts">
        <button data-font="" class="${!f ? 'on' : ''}"><b>Aa</b><small>Theme</small></button>
        ${Object.entries(FONTS)
          .map(([k, v]) => `<button data-font="${k}" class="${w.font === k ? 'on' : ''}"><b style="font-family:${v.family.replace(/"/g, '&quot;')}">Aa</b><small>${v.label}</small></button>`)
          .join('')}
      </div>
      ${
        range
          ? `<div class="wg-card">${row('Weight', `<span class="wg-slide"><input type="range" min="${range[0]}" max="${range[1]}" step="50" data-range="weight" value="${weight}" /><em data-out="weight">${weightName(weight)}</em></span>`, 'slider-row')}</div>`
          : '<div class="wg-note">This font comes in one weight.</div>'
      }`;
  };

  // your photos: thumbnails, remove, add more
  const photos =
    w.type === 'photo'
      ? `<div class="wg-label">Photos</div>
         <div class="wg-photos">${(w.photos || [])
           .map((p, i) => `<span style="background-image:url('${fileUrl(p).replace(/'/g, '%27')}')"><button data-unphoto="${i}" title="Remove">${icon('x')}</button></span>`)
           .join('')}<button class="wg-addphoto" data-addphoto>${icon('plus')}<small>Add</small></button></div>`
      : '';
  // emoji / words: type anything (Win + . opens the emoji panel), or tap one
  const EMOJI = ['✨', '🌙', '☀️', '🔥', '💜', '🖤', '🌸', '🍀', '🎧', '☕', '🚀', '💻', '📚', '🏋️', '🧘', '🎯', '🙏', '🕉️', '😎', '🥳', '🌊', '⛰️', '🐈', '🦋'];
  const sticker =
    w.type === 'sticker'
      ? `<div class="wg-label">Emoji or words</div>
         <input class="wg-input wg-emoji" data-text="text" value="${esc(w.text || '')}" maxlength="24" placeholder="Type or press Win + ." />
         <div class="wg-emojis">${EMOJI.map((e) => `<button data-emoji="${e}">${e}</button>`).join('')}</div>`
      : '';
  const options = () => `${photos}${sticker}${fields ? `<div class="wg-card">${fields}</div>` : ''}${stackItems}`;

  root.innerHTML = `
    <div class="wg">
      <div class="wg-head"><div><b>${esc(meta.name)}</b><small>Customize widget</small></div></div>
      ${tabs.length > 1 ? `<div class="wg-tabs">${tabs.map(([k, label]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${label}</button>`).join('')}</div>` : ''}
      <div class="wg-body">${tab === 'font' ? font() : tab === 'options' ? options() : look()}</div>
      ${onRemove ? `<button class="wg-remove" data-remove>${icon('trash')}Remove widget</button>` : ''}
    </div>`;

  const rerender = () => renderWidgetForm(root, w, info, onChange, onRemove, onResize);

  // text lists (e.g. the stock watchlist) save when you leave the field or press Enter
  root.onchange = (e) => {
    if (e.target.dataset.anycolor) {
      w[e.target.dataset.anycolor] = e.target.value;
      onChange();
      return rerender();
    }
    if (e.target.dataset.text) {
      w[e.target.dataset.text] = e.target.value.trim();
      return onChange();
    }
    const key = e.target.dataset.list;
    if (!key) return;
    w[key] = e.target.value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);
    onChange();
  };
  root.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.dataset.list) e.target.blur();
  };

  // sliders update in place (re-rendering would drop the drag)
  root.oninput = (e) => {
    const key = e.target.dataset.range;
    if (!key) return;
    const v = Number(e.target.value);
    w[key] = v;
    const out = root.querySelector(`[data-out="${key}"]`);
    if (out) out.textContent = key === 'weight' ? weightName(v) : `${Math.round(v * 100)}%`;
    if (key === 'weight') root.querySelector('.wg-preview')?.style.setProperty('font-weight', String(v));
    onChange();
  };
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.addphoto !== undefined) {
      window.wall.pickImages?.().then((files) => {
        if (!files?.length) return;
        w.photos = [...(w.photos || []), ...files].slice(0, 50);
        onChange();
        rerender();
        onResize?.();
      });
      return;
    }
    if (b.dataset.unphoto) w.photos.splice(Number(b.dataset.unphoto), 1);
    if (b.dataset.emoji) w.text = b.dataset.emoji;
    if (b.dataset.tab) {
      lastTab.tab = b.dataset.tab;
      rerender();
      return onResize?.();
    }
    if (b.dataset.k) {
      const raw = b.dataset.v;
      w[b.dataset.k] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
      if (b.dataset.k === 'corners' && !raw) delete w.corners;
      if (b.dataset.k === 'shape' && !raw) delete w.shape;
    }
    if (b.dataset.flip) {
      const key = b.dataset.flip;
      const def = key === 'shadow' ? true : (OPTIONS[w.type] || []).find(([k]) => k === key)?.[3];
      w[key] = !opt(key, def);
    }
    if (b.dataset.tint) w.tint = b.dataset.tint;
    if (b.dataset.textc !== undefined) w.textColor = b.dataset.textc || undefined;
    if (b.dataset.accent !== undefined) w.accent = b.dataset.accent || undefined;
    if (b.dataset.font !== undefined) {
      w.font = b.dataset.font || undefined;
      if (!FONTS[w.font]?.weights) delete w.weight;
    }
    if (b.dataset.size) w.scale = Number(b.dataset.size);
    if (b.dataset.add) w.items = [...(w.items || []), { type: b.dataset.add }];
    if (b.dataset.drop) w.items.splice(Number(b.dataset.drop), 1);
    if (b.dataset.move) {
      const i = Number(b.dataset.move);
      const j = i + Number(b.dataset.dir);
      [w.items[i], w.items[j]] = [w.items[j], w.items[i]];
    }
    if (b.dataset.remove !== undefined) return onRemove?.();
    onChange();
    rerender();
    onResize?.();
  };
}
