// "Edit Widget": one form for any widget, used by the live wallpaper popup and the editor.
// It edits a widget object in place and calls onChange() after every change.

import { esc } from './widgets.js';
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
export const STACKABLE = ['weather', 'calendar', 'music', 'year', 'countdown', 'system', 'feed', 'clock', 'quote'];

const NO_STYLE = new Set(['menubar', 'dock', 'note']);

// per-widget options: [key, label, kind, choices]
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
  quote: [['size', 'Size', 'seg', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]]],
  stack: [['interval', 'Rotate', 'seg', [[0, 'Off'], [6, '6s'], [12, '12s'], [30, '30s']]]],
};

export function renderWidgetForm(root, w, info, onChange, onRemove) {
  const meta = info.widgets.find((x) => x.type === w.type) || { name: w.type };
  const opt = (key, def) => (w[key] === undefined ? def : w[key]);

  const seg = (key, choices, def) =>
    `<div class="wf-seg">${choices.map(([v, label]) => `<button data-k="${key}" data-v="${esc(String(v))}" class="${String(opt(key, def)) === String(v) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
  const toggle = (key, def) => `<button class="wf-switch${opt(key, def) ? ' on' : ''}" data-flip="${key}"><i></i></button>`;

  const fields = (OPTIONS[w.type] || [])
    .map(([key, label, kind, extra]) => {
      if (kind === 'seg') return `<div class="wf-row"><span>${label}</span>${seg(key, extra, extra[w.type === 'note' || w.type === 'quote' ? 1 : w.type === 'commits' || w.type === 'year' ? extra.length - 1 : 0][0])}</div>`;
      return `<div class="wf-row"><span>${label}</span>${toggle(key, extra)}</div>`;
    })
    .join('');

  const stackItems =
    w.type === 'stack'
      ? `<div class="wf-label">In this stack</div>
         <div class="wf-stack">
           ${(w.items || [])
             .map((it, i) => {
               const m = info.widgets.find((x) => x.type === it.type);
               return `<div class="wf-item"><span class="wf-ic">${icon(it.type === 'music' ? 'volume' : it.type)}</span><b>${esc(m?.name || it.type)}</b>
                 <button data-move="${i}" data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('chevron')}</button>
                 <button data-move="${i}" data-dir="1" title="Move down" ${i === w.items.length - 1 ? 'disabled' : ''}>${icon('chevron')}</button>
                 <button data-drop="${i}" title="Remove">${icon('x')}</button></div>`;
             })
             .join('')}
         </div>
         <div class="wf-add">${STACKABLE.filter((t) => !(w.items || []).some((it) => it.type === t))
           .map((t) => `<button data-add="${t}">${icon(t === 'music' ? 'volume' : t)}${esc(info.widgets.find((x) => x.type === t)?.name || t)}</button>`)
           .join('')}</div>`
      : '';

  const styled = !NO_STYLE.has(w.type);
  const style = opt('style', 'theme');
  root.innerHTML = `
    <div class="wf">
      <div class="wf-head"><span class="wf-ic big">${icon(w.type === 'music' ? 'volume' : w.type === 'stack' ? 'grid' : w.type)}</span><div><b>${esc(meta.name)}</b><small>Edit widget</small></div></div>
      ${
        styled
          ? `<div class="wf-label">Style</div>${seg('style', STYLES, 'theme')}
             <div class="wf-tints ${style === 'solid' || style === 'glass' || style === 'outline' ? '' : 'off'}">${Object.entries(TINTS)
               .map(([k, c]) => `<button data-tint="${k}" class="${opt('tint', 'graphite') === k ? 'on' : ''}" style="--c:${c}" title="${k}"></button>`)
               .join('')}</div>`
          : ''
      }
      <div class="wf-label">Size</div>
      <div class="wf-seg">${SIZES.map(([l, s]) => `<button data-size="${s}" class="${Math.abs((w.scale || 1) - s) < 0.06 ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${
        styled
          ? `<div class="wf-label">Accent</div>
             <div class="wf-tints"><button data-accent="" class="auto${!w.accent ? ' on' : ''}" title="Theme accent">A</button>${Object.entries(TINTS)
               .filter(([k]) => k !== 'graphite' && k !== 'white')
               .map(([k, c]) => `<button data-accent="${k}" class="${w.accent === k ? 'on' : ''}" style="--c:${c}" title="${k}"></button>`)
               .join('')}</div>
             <div class="wf-list">
               <div class="wf-row"><span>Corners</span>${seg('corners', [['', 'Theme'], ['round', 'Round'], ['soft', 'Soft'], ['square', 'Square']], '')}</div>
               <div class="wf-row ${style === 'solid' || style === 'glass' ? '' : 'off'}"><span>Opacity</span><input type="range" min="0.35" max="1" step="0.05" data-range="opacity" value="${opt('opacity', 1)}" /></div>
               <div class="wf-row"><span>Shadow</span>${toggle('shadow', true)}</div>
             </div>`
          : ''
      }
      ${fields ? `<div class="wf-label">Options</div><div class="wf-list">${fields}</div>` : ''}
      ${stackItems}
      ${onRemove ? `<button class="wf-remove" data-remove>${icon('trash')}Remove widget</button>` : ''}
    </div>`;

  root.oninput = (e) => {
    if (e.target.dataset.range) {
      w[e.target.dataset.range] = Number(e.target.value);
      onChange();
    }
  };
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.k) {
      const raw = b.dataset.v;
      w[b.dataset.k] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    }
    if (b.dataset.flip) {
      const key = b.dataset.flip;
      const def = key === 'shadow' ? true : (OPTIONS[w.type] || []).find(([k]) => k === key)?.[3];
      w[key] = !opt(key, def);
    }
    if (b.dataset.tint) w.tint = b.dataset.tint;
    if (b.dataset.accent !== undefined) w.accent = b.dataset.accent || undefined;
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
    renderWidgetForm(root, w, info, onChange, onRemove);
  };
}
