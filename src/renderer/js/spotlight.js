// Spotlight UI: type, arrow through results, Enter to open, Ctrl+Enter to reveal in Explorer.

import { esc } from './widgets.js';
import { icon } from './icons.js';

const GROUPS = [
  ['quick', 'Quick add'],
  ['calc', 'Calculator'],
  ['app', 'Applications'],
  ['action', 'Wallpaper'],
  ['setting', 'System Settings'],
  ['repo', 'Repositories'],
  ['folder', 'Folders'],
  ['file', 'Documents'],
  ['ai', 'Ask AI'],
  ['web', 'Web'],
];
const LIMIT = { app: 5, action: 3, setting: 3, repo: 3, folder: 4, file: 6, calc: 1, web: 1, ai: 1, quick: 1 };
const GLYPH = { app: 'app', action: 'palette', setting: 'gear', repo: 'feed', folder: 'folder', file: 'file', web: 'globe', calc: 'calc', ai: 'sparkle', quick: 'plus' };

// shown when the box is empty: one tap does it, or fills in the right prefix
const QUICK = [
  { label: 'Note', icon: 'note', fill: 'note ' },
  { label: 'To-do', icon: 'todo', fill: 'todo ' },
  { label: 'Ask AI', icon: 'sparkle', fill: 'ask ' },
  { label: 'Music', icon: 'music', run: 'player' },
  { label: 'Weather', icon: 'weather', run: 'weather-panel' },
  { label: 'Settings', icon: 'gear', run: 'settings-panel' },
];

let rows = [];
let sel = 0;
let seq = 0;

export function start() {
  const root = document.getElementById('chrome');
  root.className = 'spot-root';
  root.innerHTML = `
    <div class="sp">
      <div class="sp-bar">
        ${icon('search', 'sp-mag')}
        <input class="sp-input" placeholder="Spotlight Search" spellcheck="false" autocomplete="off" />
        <span class="sp-badge"></span>
      </div>
      <div class="sp-list"></div>
      <div class="sp-ai" hidden></div>
      <div class="sp-foot"><span><kbd>↵</kbd> open</span><span><kbd>Ctrl</kbd><kbd>↵</kbd> show in folder</span><span><kbd>Tab</kbd> complete</span><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>esc</kbd> close</span></div>
    </div>`;
  const input = root.querySelector('.sp-input');
  const list = root.querySelector('.sp-list');
  const sp = root.querySelector('.sp');
  const aiBox = root.querySelector('.sp-ai');
  let asking = 0;

  new ResizeObserver(() => window.wall.spotResize(sp.getBoundingClientRect().height + 24)).observe(sp);

  const query = async () => {
    const my = ++seq;
    aiBox.hidden = true;
    list.hidden = false;
    const results = await window.wall.spotSearch(input.value);
    if (my !== seq) return; // a newer keystroke already won
    paint(results, input.value.trim());
  };

  const paint = (results, q) => {
    rows = [];
    let html = '';
    if (q && results.length) {
      const top = results[0];
      rows.push(top);
      html += section('Top Hit', [top], 0, true);
      const rest = results.slice(1);
      // groups ordered by their best match, web search always last
      const order = GROUPS.map(([kind, label]) => ({ kind, label, best: Math.max(-1, ...rest.filter((r) => r.kind === kind).map((r) => r.score ?? 0)) }))
        .filter((g) => g.best >= 0)
        .sort((a, b) => ['ai', 'web'].includes(a.kind) - ['ai', 'web'].includes(b.kind) || b.best - a.best);
      for (const { kind, label } of order) {
        const items = rest.filter((r) => r.kind === kind).slice(0, LIMIT[kind]);
        if (!items.length) continue;
        html += section(label, items, rows.length);
        rows.push(...items);
      }
    } else if (!q) {
      html += `<div class="sp-quick">${QUICK.map((a, i) => `<button data-quick="${i}">${icon(a.icon)}<span>${a.label}</span></button>`).join('')}</div>`;
      if (results.length) {
        html += section('Frequently used', results.slice(0, 5), 0);
        rows.push(...results.slice(0, 5));
      }
      html += '<div class="sp-tip">Try <kbd>note buy milk</kbd> <kbd>ask plan my day</kbd> <kbd>18% of 2400</kbd> <kbd>10 km to mi</kbd></div>';
    }
    list.innerHTML = html;
    sp.classList.toggle('has-results', rows.length > 0 || !q);
    root.querySelector('.sp-badge').textContent = q && rows.length ? `${rows.length} results` : '';
    sel = 0;
    highlight();
    loadIcons();
  };

  const section = (label, items, offset, top = false) => `
    <div class="sp-sec">${label}</div>
    ${items
      .map(
        (it, i) => `
      <div class="sp-row${top ? ' top' : ''}" data-i="${offset + i}">
        <span class="sp-ic" data-icon="${offset + i}">${icon(GLYPH[it.kind] || 'app')}</span>
        <span class="sp-txt"><b>${esc(it.title)}</b><small>${esc(it.subtitle || '')}</small></span>
        <span class="sp-kind">${it.kind === 'file' || it.kind === 'folder' ? 'Open' : it.kind === 'calc' ? 'Copy' : it.kind === 'web' ? 'Search' : it.kind === 'ai' ? 'Ask' : it.kind === 'quick' ? 'Add' : 'Open'}</span>
      </div>`,
      )
      .join('')}`;

  const loadIcons = async () => {
    const my = seq;
    const wanted = rows.map((r, i) => ({ r, i })).filter(({ r }) => ['app', 'file', 'folder', 'repo'].includes(r.kind));
    if (!wanted.length) return;
    const urls = await window.wall.spotIcons(wanted.map(({ r }) => r));
    if (my !== seq) return;
    wanted.forEach(({ i }, k) => {
      const el = list.querySelector(`[data-icon="${i}"]`);
      if (el && urls[k]) el.innerHTML = `<img src="${urls[k]}" alt="" />`;
    });
  };

  const highlight = () => {
    list.querySelectorAll('.sp-row').forEach((r) => r.classList.toggle('sel', Number(r.dataset.i) === sel));
    list.querySelector('.sp-row.sel')?.scrollIntoView({ block: 'nearest' });
  };

  const open = (reveal) => {
    const it = rows[sel];
    if (!it) return;
    if (it.kind === 'ai') return askAI(it.target);
    window.wall.spotOpen(it, reveal);
  };

  // the answer shows right here; anything the AI organized is already on the wallpaper
  const askAI = async (question) => {
    const my = ++asking;
    list.hidden = true;
    aiBox.hidden = false;
    sp.classList.add('has-results');
    aiBox.innerHTML = `<div class="sp-ai-q">${icon('sparkle')}<span>${esc(question)}</span></div><div class="sp-ai-a thinking"><i></i><i></i><i></i></div>`;
    const r = await window.wall.aiAsk(question);
    if (my !== asking) return;
    aiBox.querySelector('.sp-ai-a').outerHTML = `
      <div class="sp-ai-a${r.ok ? '' : ' err'}">${esc(r.reply || '')}</div>
      ${(r.done || []).map((d) => `<div class="sp-ai-done">${icon('check')}<span>${esc(d)}</span></div>`).join('')}
      <div class="sp-ai-foot">${r.model ? esc(r.model) + ' · ' : ''}Esc to close · keep typing to ask again</div>`;
  };

  input.addEventListener('input', query);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      highlight();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const it = rows[sel];
      if (it && ['app', 'file', 'folder', 'repo', 'action', 'setting'].includes(it.kind)) {
        input.value = it.title;
        query();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(e.ctrlKey || e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) {
        input.value = '';
        query();
      } else window.wall.spotHide();
    }
  });
  list.addEventListener('mousemove', (e) => {
    const r = e.target.closest('.sp-row');
    if (r && Number(r.dataset.i) !== sel) {
      sel = Number(r.dataset.i);
      highlight();
    }
  });
  list.addEventListener('click', (e) => {
    const qb = e.target.closest('[data-quick]');
    if (qb) {
      const a = QUICK[Number(qb.dataset.quick)];
      if (a.run) return window.wall.spotOpen({ kind: 'action', target: a.run }, false);
      input.value = a.fill;
      input.focus();
      return query();
    }
    const r = e.target.closest('.sp-row');
    if (!r) return;
    sel = Number(r.dataset.i);
    open(e.ctrlKey);
  });

  window.wall.onSpotlightShow(() => {
    input.value = '';
    query();
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
  query();
  input.focus();
}
