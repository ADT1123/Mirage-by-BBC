// The interactive shell: a Claude Code–style prompt with a slash-command menu.

import os from 'os';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Static, Text, render, useApp, useInput, useWindowSize } from 'ink';
import { COMMANDS, THEMES, WIDGETS, brand, byId, config, execute, find } from './commands.mjs';
import { banner } from './logo.mjs';
import * as control from './control.mjs';

const h = React.createElement;
const ACCENT = '#a78bfa';
const TEAL = '#2ee6c5';
const OK = '#4ade80';
const BAD = '#f87171';
const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

const LOGO_COLORS = ['#c4b5fd', '#a78bfa', '#8b7bff', '#5f9cf5', '#2ee6c5'];

// ------------------------------------------------------------------ history blocks

function Logo({ cols }) {
  const rows = banner(brand.name, cols - 4);
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1, marginTop: 1 },
    ...(rows || [brand.name]).map((line, i) => h(Text, { key: i, color: LOGO_COLORS[i], bold: !rows }, `  ${line}`)),
    brand.tagline ? h(Text, { color: '#8a8aa0' }, `  ${brand.tagline}`) : null,
  );
}

function Welcome({ cols }) {
  const cfg = config.load();
  const t = byId(cfg.theme);
  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: ACCENT, paddingX: 1, width: Math.min(cols - 2, 100) },
    h(Text, null, h(Text, { color: ACCENT }, '✻ '), h(Text, { bold: true }, `Welcome to ${brand.name}`)),
    h(Text, null, ' '),
    h(Text, { color: 'gray' }, '  /help for commands · /theme to restyle · /edit to drag things'),
    h(Text, { color: 'gray' }, `  theme: ${t.name} · ${cfg.widgets.length} widgets · ${THEMES.length} packs`),
    h(Text, { color: 'gray' }, `  config: ${config.FILE.replace(os.homedir(), '~')}`),
  );
}

function Tips() {
  return h(
    Box,
    { flexDirection: 'column', marginTop: 1, marginBottom: 1, paddingLeft: 1 },
    h(Text, { color: 'gray' }, 'Tips for getting started:'),
    h(Text, { color: 'gray' }, ` 1. /start to put ${brand.name} on your desktop`),
    h(Text, { color: 'gray' }, ' 2. /theme and use ↑ ↓ to preview themes live'),
    h(Text, { color: 'gray' }, ' 3. /note, /todo and /countdown to fill your widgets'),
  );
}

function Echo({ text }) {
  return h(Box, { marginTop: 1 }, h(Text, { color: 'gray' }, '> '), h(Text, { color: '#d4d4d8' }, text));
}

function Result({ res }) {
  const lines = res.lines || [];
  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, null, h(Text, { color: res.ok ? OK : BAD }, '⏺ '), h(Text, { bold: true }, res.title)),
    ...lines.map((l, i) => h(Text, { key: i, color: 'gray' }, `${i === 0 ? '  ⎿  ' : '     '}${l}`)),
    res.hint ? h(Text, { color: '#8a8aa0', italic: true }, `${lines.length ? '     ' : '  ⎿  '}${res.hint}`) : null,
  );
}

function Block({ item, cols }) {
  switch (item.kind) {
    case 'logo':
      return h(Logo, { cols });
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
  const rest = value.slice(sp + 1);
  if (rest.includes(' ')) return [];
  return cmd
    .complete()
    .filter((o) => o.value.startsWith(rest.toLowerCase()))
    .map((o) => ({ label: o.value, hint: '', desc: o.desc, value: `/${cmd.name} ${o.value}`, arg: true }));
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
  );
}

// ------------------------------------------------------------------ pickers

function ThemePicker({ onDone }) {
  const original = useRef(config.load().theme);
  const [i, setI] = useState(Math.max(0, THEMES.findIndex((t) => t.id === original.current)));
  const preview = (n) => {
    setI(n);
    config.update((c) => ((c.theme = THEMES[n].id), c));
  };
  useInput((input, key) => {
    if (key.upArrow) preview((i - 1 + THEMES.length) % THEMES.length);
    else if (key.downArrow) preview((i + 1) % THEMES.length);
    else if (key.return) onDone({ ok: true, title: `Theme set to ${THEMES[i].name}`, lines: [THEMES[i].tagline] });
    else if (key.escape) {
      config.update((c) => ((c.theme = original.current), c));
      onDone({ ok: true, title: 'Kept your theme', lines: [byId(original.current).name] });
    }
  });
  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: ACCENT, paddingX: 1, marginTop: 1 },
    h(Text, { bold: true }, 'Pick a theme ', h(Text, { color: 'gray' }, '· previews live on your desktop')),
    h(Text, null, ' '),
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
      onDone({ ok: true, title: 'Widgets updated', lines: [list.join(', ') || 'none'] });
    }
  });
  return h(
    Box,
    { flexDirection: 'column', borderStyle: 'round', borderColor: ACCENT, paddingX: 1, marginTop: 1 },
    h(Text, { bold: true }, 'Widgets ', h(Text, { color: 'gray' }, '· space to toggle, changes apply instantly')),
    h(Text, null, ' '),
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
  const [theme, setTheme] = useState(config.load().theme);
  const past = useRef([]);
  const pastIdx = useRef(-1);
  const nextId = useRef(2);

  const sugg = useMemo(() => suggest(value), [value]);
  useEffect(() => setSel(0), [value]);

  const push = (item) => setItems((xs) => [...xs, { id: nextId.current++, ...item }]);

  async function refresh() {
    setStatus(await control.status());
    setTheme(config.load().theme);
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
    if (res.ui === 'theme-picker') return setMode('themes');
    if (res.ui === 'widget-picker') return setMode('widgets');
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
          if (s.arg) return run(s.value);
          const needsArg = s.cmd.args && !s.cmd.args.startsWith('[');
          if (needsArg) return setInput(`${s.value} `);
          return run(s.value);
        }
        return run(value);
      }
      if (key.tab) {
        const s = sugg[sel];
        if (s) setInput(s.arg ? `${s.value} ` : `${s.value} `);
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
  const t = byId(theme);

  return h(
    Box,
    { flexDirection: 'column' },
    h(Static, { items }, (item) => h(Box, { key: item.id, flexDirection: 'column' }, h(Block, { item, cols }))),
    mode === 'themes' ? h(ThemePicker, { onDone: pickerDone }) : null,
    mode === 'widgets' ? h(WidgetPicker, { onDone: pickerDone }) : null,
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
              : h(Text, null, h(Text, { inverse: true }, ' '), h(Text, { color: 'gray' }, 'Try "/theme" or "/note ship the reel tonight"')),
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
                  h(Text, { color: 'gray' }, `  ${t?.name || ''}`),
                ),
              ),
        )
      : null,
  );
}

export function startUI(options = {}) {
  return render(h(App), { exitOnCtrlC: true, ...options });
}
