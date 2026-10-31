// The interactive shell: a Claude Code–style prompt with a slash-command menu.

import os from 'os';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Static, Text, render, useApp, useInput, useWindowSize } from 'ink';
import { COMMANDS, THEMES, WIDGETS, PACKS, WALLS, brand, byId, config, execute, find, wallDesc } from './commands.mjs';
import { SETTINGS, ADJUSTABLE, applyValue, shown, stepValue } from './settings.mjs';
import { bannerText, canColor, markCells, runs } from './mark.mjs';
import packs from '../src/shared/packs.cjs';
import * as control from './control.mjs';

const { wallById, wallsIn, wallForTheme } = packs;

const h = React.createElement;
const ACCENT = '#a78bfa';
const TEAL = '#2ee6c5';
const OK = '#4ade80';
const BAD = '#f87171';
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

// ------------------------------------------------------------------ history blocks

// The mark in half blocks with the name beside it; just the name without colors.
function Logo() {
  const t = bannerText();
  if (!canColor()) return h(Box, { flexDirection: 'column', marginY: 1 }, h(Text, { bold: true }, `  ${brand.name}`), t.tagline ? h(Text, { color: '#8a8aa0' }, `  ${t.tagline}`) : null);
  const lines = markCells();
  const mid = Math.floor(lines.length / 2) - 1;
  const side = { [mid]: h(Text, { bold: true }, `   ${t.name}`), [mid + 1]: h(Text, { color: '#8a8aa0' }, `   ${t.tagline}`), [mid + 2]: h(Text, { color: 'gray' }, `   ${t.extra}`) };
  return h(
    Box,
    { flexDirection: 'column', marginY: 1 },
    ...lines.map((cells, i) =>
      h(Text, { key: i }, '  ', ...runs(cells).map((r, k) => h(Text, { key: k, color: r.fg || undefined, backgroundColor: r.bg || undefined }, r.ch)), side[i] || null),
    ),
  );
}

function Welcome({ cols }) {
  const cfg = config.load();
  const w = wallById(cfg.wall);
  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: ACCENT, paddingX: 1, width: Math.min(cols - 2, 100) },
    h(Text, null, h(Text, { color: ACCENT }, '✻ '), h(Text, { bold: true }, `Welcome to ${brand.name}`)),
    h(Text, null, ' '),
    h(Text, { color: 'gray' }, '  /help for commands · /wall to pick a wallpaper · /settings to tune it'),
    h(Text, { color: 'gray' }, `  wallpaper: ${w ? `${w.name} (${PACKS.find((p) => p.id === w.pack)?.name})` : cfg.wall} · ${cfg.widgets.length} widgets · ${WALLS.length} wallpapers in ${PACKS.length} packs`),
    h(Text, { color: 'gray' }, `  config: ${config.FILE.replace(os.homedir(), '~')}`),
  );
}

function Tips() {
  return h(
    Box,
    { flexDirection: 'column', marginTop: 1, marginBottom: 1, paddingLeft: 1 },
    h(Text, { color: 'gray' }, 'Tips for getting started:'),
    h(Text, { color: 'gray' }, ` 1. /start to put ${brand.name} on your desktop`),
    h(Text, { color: 'gray' }, ' 2. /wall and use ← → ↑ ↓ to preview wallpapers live'),
    h(Text, { color: 'gray' }, ' 3. /settings for blur, quality, accent, clock and more'),
  );
}

function Echo({ text }) {
  return h(Box, { marginTop: 1 }, h(Text, { color: 'gray' }, '> '), h(Text, { color: '#d4d4d8' }, text));
}

// Grouped lists: every cell but the last is a padded column, the last one is gray.
function Section({ sec }) {
  const widths = [];
  for (const row of sec.rows) row.slice(0, -1).forEach((cell, i) => (widths[i] = Math.max(widths[i] || 0, [...cell].length)));
  return h(
    Box,
    { flexDirection: 'column', marginTop: 1 },
    h(Text, null, h(Text, { bold: true }, `  ${sec.title}`), sec.note ? h(Text, { color: 'gray' }, `  ${sec.note}`) : null),
    ...sec.rows.map((row, k) =>
      h(
        Text,
        { key: k },
        `    ${row.slice(0, -1).map((cell, i) => cell + ' '.repeat(widths[i] - [...cell].length)).join('  ')}  `,
        h(Text, { color: 'gray' }, row[row.length - 1]),
      ),
    ),
    sec.foot ? h(Text, { color: '#8a8aa0' }, `    ${sec.foot}`) : null,
  );
}

function Result({ res }) {
  const lines = res.lines || [];
  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, null, h(Text, { color: res.ok ? OK : BAD }, '⏺ '), h(Text, { bold: true }, res.title)),
    ...lines.map((l, i) => h(Text, { key: i, color: 'gray' }, `${i === 0 ? '  ⎿  ' : '     '}${l}`)),
    ...(res.sections || []).map((sec, i) => h(Section, { key: `s${i}`, sec })),
    res.hint ? h(Text, { color: '#8a8aa0', italic: true }, `${lines.length && !res.sections ? '     ' : '  ⎿  '}${res.hint}`) : null,
  );
}

function Block({ item, cols }) {
  switch (item.kind) {
    case 'logo':
      return h(Logo);
    case 'welcome':
      return h(Box, { flexDirection: 'column' }, h(Welcome, { cols }), h(Tips));
    case 'input':
      return h(Echo, { text: item.text });
    case 'result':
      return h(Result, { res: item.res });
    default:
      return null;
  }
}

// ------------------------------------------------------------------ suggestions

function suggest(value) {
  if (!value.startsWith('/')) return [];
  const sp = value.indexOf(' ');
  if (sp === -1) {
    const q = value.slice(1).toLowerCase();
    const starts = COMMANDS.filter((c) => c.name.startsWith(q));
    const contains = COMMANDS.filter((c) => !c.name.startsWith(q) && c.name.includes(q));
    return [...starts, ...contains].map((c) => ({ label: `/${c.name}`, hint: c.args || '', desc: c.desc, value: `/${c.name}`, cmd: c }));
  }
  const cmd = find(value.slice(0, sp));
  if (!cmd?.complete) return [];
  // complete the word being typed; /set and /widgets also complete their second word
  const words = value.slice(sp + 1).split(' ');
  const prefix = words.pop().toLowerCase();
  const prev = words.filter(Boolean);
  if (prev.length && !cmd.deep) return [];
  const base = `/${cmd.name} ${prev.length ? `${prev.join(' ')} ` : ''}`;
  return (cmd.complete(prev) || [])
    .filter((o) => o.value.toLowerCase().startsWith(prefix))
    .map((o) => ({ label: o.value, hint: '', desc: o.desc, value: base + o.value, arg: true, more: cmd.deep && !prev.length && o.value !== 'list' }));
}

function Suggestions({ items, index }) {
  if (!items.length) return null;
  const start = Math.max(0, Math.min(index - 3, items.length - 8));
  const shown = items.slice(start, start + 8);
  const w = Math.max(...items.map((s) => (s.label + (s.hint ? ' ' + s.hint : '')).length)) + 3;
  return h(
    Box,
    { flexDirection: 'column', paddingLeft: 2 },
    ...shown.map((s, i) => {
      const on = start + i === index;
      const left = (s.label + (s.hint ? ` ${s.hint}` : '')).padEnd(w);
      return h(
        Text,
        { key: s.value },
        h(Text, { color: on ? ACCENT : undefined, bold: on }, left),
        h(Text, { color: on ? '#c4b5fd' : 'gray' }, s.desc),
      );
    }),
    items.length > 8 ? h(Text, { color: 'gray' }, `  ${index + 1}/${items.length}`) : null,
  );
}

// ------------------------------------------------------------------ pickers

const Frame = (title, sub, ...children) =>
  h(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: ACCENT, paddingX: 1, marginTop: 1 }, h(Text, { bold: true }, `${title} `, h(Text, { color: 'gray' }, sub)), h(Text, null, ' '), ...children);

function ThemePicker({ onDone }) {
  const start = config.load();
  const original = useRef(start.theme);
  const originalWall = useRef(start.wall);
  const [i, setI] = useState(Math.max(0, THEMES.findIndex((t) => t.id === original.current)));
  const preview = (n) => {
    setI(n);
    config.update((c) => ((c.theme = THEMES[n].id), (c.wall = wallForTheme(THEMES[n].id, c.planet)), c));
  };
  useInput((input, key) => {
    if (key.upArrow) preview((i - 1 + THEMES.length) % THEMES.length);
    else if (key.downArrow) preview((i + 1) % THEMES.length);
    else if (key.return) onDone({ ok: true, title: `Theme set to ${THEMES[i].name}`, lines: [THEMES[i].tagline] });
    else if (key.escape) {
      config.update((c) => ((c.theme = original.current), (c.wall = originalWall.current), c));
      onDone({ ok: true, title: 'Kept your theme', lines: [byId(original.current).name] });
    }
  });
  return Frame(
    'Pick a theme',
    '· style and wallpaper together, previews live on your desktop',
    ...THEMES.map((t, n) =>
      h(
        Text,
        { key: t.id },
        h(Text, { color: n === i ? ACCENT : 'gray' }, n === i ? '❯ ' : '  '),
        ...t.swatch.map((c, k) => h(Text, { key: k, color: c }, '██')),
        h(Text, { bold: n === i, color: n === i ? 'white' : undefined }, `  ${t.name.padEnd(11)}`),
        h(Text, { color: 'gray' }, t.tagline),
      ),
    ),
    h(Text, null, ' '),
    h(Text, { color: 'gray' }, '↑ ↓ preview · enter to keep · esc to cancel'),
  );
}

// Packs across the top, that pack's wallpapers below; every move previews live.
function WallPicker({ onDone }) {
  const start = config.load();
  const original = useRef({ wall: start.wall, theme: start.theme });
  const first = Math.max(0, PACKS.findIndex((p) => p.id === wallById(start.wall)?.pack));
  const [pi, setPi] = useState(first);
  const [wi, setWi] = useState(Math.max(0, wallsIn(PACKS[first].id).findIndex((w) => w.id === start.wall)));
  const list = wallsIn(PACKS[pi].id);
  const preview = (p, n) => {
    const w = wallsIn(PACKS[p].id)[n];
    setPi(p);
    setWi(n);
    config.update((c) => ((c.wall = w.id), (c.theme = w.skin), c));
  };
  useInput((input, key) => {
    if (key.upArrow) preview(pi, (wi - 1 + list.length) % list.length);
    else if (key.downArrow) preview(pi, (wi + 1) % list.length);
    else if (key.leftArrow || key.rightArrow || key.tab) preview((pi + (key.leftArrow ? -1 : 1) + PACKS.length) % PACKS.length, 0);
    else if (key.return) onDone({ ok: true, title: `Wallpaper set to ${list[wi].name}`, lines: [`${PACKS[pi].name} · ${wallDesc(list[wi])}`] });
    else if (key.escape) {
      config.update((c) => ((c.wall = original.current.wall), (c.theme = original.current.theme), c));
      onDone({ ok: true, title: 'Kept your wallpaper', lines: [wallById(original.current.wall)?.name || original.current.wall] });
    }
  });
  return Frame(
    'Pick a wallpaper',
    `· ${WALLS.length} in ${PACKS.length} packs, previews live on your desktop`,
    h(
      Box,
      { flexWrap: 'wrap' },
      ...PACKS.map((p, n) => h(Text, { key: p.id, color: n === pi ? ACCENT : 'gray', bold: n === pi, inverse: n === pi }, ` ${p.name} `)),
    ),
    h(Text, { color: '#8a8aa0' }, PACKS[pi].desc),
    h(Text, null, ' '),
    ...list.map((w, n) =>
      h(
        Text,
        { key: w.id },
        h(Text, { color: n === wi ? ACCENT : 'gray' }, n === wi ? '❯ ' : '  '),
        h(Text, { bold: n === wi, color: n === wi ? 'white' : undefined }, w.name.padEnd(16)),
        h(Text, { color: 'gray' }, wallDesc(w)),
      ),
    ),
    h(Text, null, ' '),
    h(Text, { color: 'gray' }, '↑ ↓ wallpaper · ← → pack · enter to keep · esc to cancel'),
  );
}

function WidgetPicker({ onDone }) {
  const [cfg, setCfg] = useState(config.load());
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const on = (type) => cfg.widgets.some((w) => w.type === type);
  useInput(async (input, key) => {
    if (busy) return;
    if (key.upArrow) setI((i - 1 + WIDGETS.length) % WIDGETS.length);
    else if (key.downArrow) setI((i + 1) % WIDGETS.length);
    else if (input === ' ' || key.return) {
      const w = WIDGETS[i];
      setBusy(true);
      await execute(`${on(w.type) ? 'remove' : 'add'} ${w.type}`);
      setCfg(config.load());
      setBusy(false);
    } else if (key.escape || input === 'q') {
      const list = WIDGETS.filter((w) => config.load().widgets.some((x) => x.type === w.type)).map((w) => w.name);
      onDone({ ok: true, title: 'Widgets updated', lines: [list.join(', ') || 'none'], hint: 'Restyle them all with /widgets style, corners or font' });
    }
  });
  return Frame(
    'Widgets',
    '· space to toggle, changes apply instantly',
    ...WIDGETS.map((w, n) =>
      h(
        Text,
        { key: w.type },
        h(Text, { color: n === i ? ACCENT : 'gray' }, n === i ? '❯ ' : '  '),
        h(Text, { color: on(w.type) ? TEAL : 'gray' }, on(w.type) ? '◉ ' : '○ '),
        h(Text, { bold: n === i }, w.name.padEnd(14)),
        h(Text, { color: 'gray' }, w.desc),
      ),
    ),
    h(Text, null, ' '),
    h(Text, { color: 'gray' }, '↑ ↓ move · space toggle · esc done'),
  );
}

// Every on/off, pick-one and number setting; ← → changes it and saves right away.
function SettingsPicker({ onDone }) {
  const [cfg, setCfg] = useState(config.load());
  const [i, setI] = useState(0);
  const changed = useRef(new Set());
  const rows = ADJUSTABLE;
  const WINDOW = 14;
  useInput((input, key) => {
    if (key.upArrow) setI((i - 1 + rows.length) % rows.length);
    else if (key.downArrow) setI((i + 1) % rows.length);
    else if (key.leftArrow || key.rightArrow || input === ' ') {
      const s = rows[i];
      const v = stepValue(s, config.load(), key.leftArrow ? -1 : 1);
      config.update((c) => applyValue(s, c, v));
      changed.current.add(s.name);
      setCfg(config.load());
    } else if (key.return || key.escape || input === 'q') {
      const now = config.load();
      const list = [...changed.current].map((n) => SETTINGS.find((s) => s.name === n)).map((s) => `${s.label}: ${shown(s, now)}`);
      const after = [...changed.current].map((n) => SETTINGS.find((s) => s.name === n).after).filter(Boolean);
      onDone({ ok: true, title: list.length ? 'Settings saved' : 'No changes', lines: [...list, ...after], hint: 'Shortcuts, your name, city and the rest: /set <setting> <value>' });
    }
  });
  const top = Math.max(0, Math.min(i - Math.floor(WINDOW / 2), rows.length - WINDOW));
  const s = rows[i];
  return Frame(
    'Settings',
    `· ${i + 1}/${rows.length}, changes apply instantly`,
    ...rows.slice(top, top + WINDOW).map((r, k) => {
      const n = top + k;
      const sel = n === i;
      const v = shown(r, cfg);
      return h(
        Text,
        { key: r.name },
        h(Text, { color: sel ? ACCENT : 'gray' }, sel ? '❯ ' : '  '),
        h(Text, { color: 'gray' }, r.group.padEnd(12)),
        h(Text, { bold: sel }, r.label.padEnd(22)),
        h(Text, { color: sel ? TEAL : undefined }, sel ? `‹ ${v} ›` : `  ${v}`),
      );
    }),
    h(Text, null, ' '),
    h(Text, { color: '#8a8aa0' }, s.desc),
    h(Text, { color: 'gray' }, '↑ ↓ setting · ← → change · enter or esc done'),
  );
}

const PICKERS = { 'theme-picker': ThemePicker, 'wall-picker': WallPicker, 'widget-picker': WidgetPicker, 'settings-picker': SettingsPicker };

// ------------------------------------------------------------------ app

function App() {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const cols = columns || 80;
  const [items, setItems] = useState(() => [{ id: 0, kind: 'logo' }, { id: 1, kind: 'welcome' }]);
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(null);
  const [frame, setFrame] = useState(0);
  const [mode, setMode] = useState('prompt');
  const [status, setStatus] = useState(null);
  const [wall, setWall] = useState(config.load().wall);
  const past = useRef([]);
  const pastIdx = useRef(-1);
  const nextId = useRef(2);

  const sugg = useMemo(() => suggest(value), [value]);
  useEffect(() => setSel(0), [value]);

  const push = (item) => setItems((xs) => [...xs, { id: nextId.current++, ...item }]);

  async function refresh() {
    setStatus(await control.status());
    setWall(config.load().wall);
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFrame((f) => f + 1), 90);
    return () => clearInterval(t);
  }, [busy]);

  function setInput(v) {
    setValue(v);
    setCursor(v.length);
  }

  async function run(line) {
    const text = line.trim();
    if (!text) return;
    push({ kind: 'input', text });
    past.current.unshift(text);
    pastIdx.current = -1;
    setInput('');
    setBusy(text);
    const res = await execute(text);
    setBusy(null);
    if (!res) return;
    if (res.ui === 'exit') {
      push({ kind: 'result', res: { ok: true, title: `See you. ${brand.name} keeps running on your desktop.` } });
      setTimeout(exit, 50);
      return;
    }
    if (PICKERS[res.ui]) return setMode(res.ui);
    push({ kind: 'result', res });
    refresh();
  }

  function pickerDone(res) {
    setMode('prompt');
    push({ kind: 'result', res });
    refresh();
  }

  useInput(
    (input, key) => {
      if (busy) return;
      if (key.return) {
        const s = sugg[sel];
        if (s && s.value !== value.trim()) {
          if (s.arg) return s.more ? setInput(`${s.value} `) : run(s.value);
          const needsArg = s.cmd.args && !s.cmd.args.startsWith('[');
          if (needsArg) return setInput(`${s.value} `);
          return run(s.value);
        }
        return run(value);
      }
      if (key.tab) {
        const s = sugg[sel];
        if (s) setInput(`${s.value} `);
        return;
      }
      if (key.upArrow || key.downArrow) {
        if (sugg.length) {
          setSel((sel + (key.upArrow ? -1 : 1) + sugg.length) % sugg.length);
        } else if (past.current.length) {
          pastIdx.current = Math.max(-1, Math.min(past.current.length - 1, pastIdx.current + (key.upArrow ? 1 : -1)));
          setInput(pastIdx.current < 0 ? '' : past.current[pastIdx.current]);
        }
        return;
      }
      if (key.escape) return setInput('');
      if (key.leftArrow) return setCursor(Math.max(0, cursor - 1));
      if (key.rightArrow) return setCursor(Math.min(value.length, cursor + 1));
      if (key.home || (key.ctrl && input === 'a')) return setCursor(0);
      if (key.end || (key.ctrl && input === 'e')) return setCursor(value.length);
      if (key.ctrl && input === 'u') return setInput('');
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        setValue(value.slice(0, cursor - 1) + value.slice(cursor));
        setCursor(cursor - 1);
        return;
      }
      if (key.ctrl || key.meta || !input) return;
      const clean = input.replace(/[\r\n]+/g, ' ');
      setValue(value.slice(0, cursor) + clean + value.slice(cursor));
      setCursor(cursor + clean.length);
    },
    { isActive: mode === 'prompt' },
  );

  const width = Math.min(cols - 2, 100);
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? ' ';
  const after = value.slice(cursor + 1);
  const w = wallById(wall);
  const Picker = PICKERS[mode];

  return h(
    Box,
    { flexDirection: 'column' },
    h(Static, { items }, (item) => h(Box, { key: item.id, flexDirection: 'column' }, h(Block, { item, cols }))),
    Picker ? h(Picker, { onDone: pickerDone }) : null,
    mode === 'prompt' && busy
      ? h(Box, { marginTop: 1 }, h(Text, { color: ACCENT }, `${SPIN[frame % SPIN.length]} `), h(Text, { color: ACCENT }, 'Working… '), h(Text, { color: 'gray' }, `(${busy})`))
      : null,
    mode === 'prompt'
      ? h(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          h(
            Box,
            { borderStyle: 'round', borderColor: busy ? 'gray' : '#6b6b80', paddingX: 1, width },
            h(Text, { color: ACCENT, bold: true }, '> '),
            value.length
              ? h(Text, null, before, h(Text, { inverse: true }, at), after)
              : h(Text, null, h(Text, { inverse: true }, ' '), h(Text, { color: 'gray' }, 'Try "/wall koi pond", "/set blur 30" or "/note ship the reel tonight"')),
          ),
          sugg.length && !busy
            ? h(Suggestions, { items: sugg, index: sel })
            : h(
                Box,
                { paddingX: 2, width, justifyContent: 'space-between' },
                h(Text, { color: 'gray' }, '/ for commands · ↑ history · ctrl+c to quit'),
                h(
                  Text,
                  null,
                  h(Text, { color: status ? OK : '#8a8aa0' }, status ? '● live' : '○ stopped'),
                  h(Text, { color: 'gray' }, `  ${w?.name || ''}`),
                ),
              ),
        )
      : null,
  );
}

export function startUI(options = {}) {
  return render(h(App), { exitOnCtrlC: true, ...options });
}
