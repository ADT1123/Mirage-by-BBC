// Every widget is { render(w, ctx) -> html, tick?(el, w, ctx) }.
// ctx = { cfg, edit, info, store }. Theme styling is pure CSS on these classes.

import { icon, weatherIcon, batteryIcon } from './icons.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pad = (n) => String(n).padStart(2, '0');
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const QUOTES = [
  ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
  ['The best way to predict the future is to invent it.', 'Alan Kay'],
  ['Programs must be written for people to read.', 'Harold Abelson'],
  ['Stay hungry. Stay foolish.', 'Stewart Brand'],
  ['First, solve the problem. Then, write the code.', 'John Johnson'],
];

// The CLI command name (from brand.json), used in on-wallpaper hints.
const cmd = (ctx) => ctx.info.brand?.command || 'wall';

// Current playback position, interpolated between updates from the media service.
export function mediaPosition(m) {
  if (!m?.active) return { pos: 0, dur: 0 };
  const dur = m.duration > 0 ? m.duration : 0;
  let pos;
  if (m.reported) pos = (m.position || 0) + (m.playing && m.updated ? (Date.now() - m.updated) / 1000 : 0);
  else {
    const c = m.clock || {};
    pos = (c.base || 0) + (c.playing ? (Date.now() - (c.since || Date.now())) / 1000 : 0);
  }
  return { pos: Math.max(0, dur ? Math.min(dur, pos) : pos), dur };
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ago(t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.round(d / 30)}mo ago`;
}

function editable(field, text, ctx, tag = 'div', cls = '', placeholder = '') {
  const ce = ctx.edit ? ' contenteditable="plaintext-only" spellcheck="false"' : '';
  const ph = placeholder ? ` data-ph="${esc(placeholder)}"` : '';
  return `<${tag} class="${cls}" data-edit="${field}"${ce}${ph}>${esc(text)}</${tag}>`;
}

function head(title, meta = '', ctx = null, field = null) {
  const t = field && ctx ? editable(field, title, ctx, 'span', 'card-title') : `<span class="card-title">${esc(title)}</span>`;
  return `<div class="card-head"><span class="card-dots"><i></i><i></i><i></i></span>${t}<span class="card-meta">${meta}</span></div>`;
}

function asciiBar(frac, width = 22) {
  const n = Math.round(Math.min(1, Math.max(0, frac)) * width);
  return `<b>${'━'.repeat(n)}</b><i>${'─'.repeat(width - n)}</i>`;
}

// ---------------------------------------------------------------- clock
function greetingHi(h) {
  if (h < 12) return 'सुप्रभात';
  if (h < 17) return 'शुभ दोपहर';
  if (h < 21) return 'शुभ संध्या';
  return 'शुभ रात्रि';
}

function greeting(h) {
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

// Analog face: numerals, minute ticks and three hands rotated every second.
function analogFace() {
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    ticks += `<line class="${major ? 'tk major' : 'tk'}" x1="0" y1="${major ? -84 : -88}" x2="0" y2="-93" transform="rotate(${i * 6})"/>`;
  }
  let nums = '';
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 * Math.PI) / 180;
    nums += `<text x="${(Math.sin(a) * 70).toFixed(1)}" y="${(-Math.cos(a) * 70 + 6).toFixed(1)}">${n}</text>`;
  }
  return `<svg class="analog-face" viewBox="-100 -100 200 200">
    <circle class="af-bg" r="98"/>${ticks}<g class="af-num">${nums}</g>
    <line class="hand h-hour" data-k="h-hour" y1="10" y2="-46"/>
    <line class="hand h-min" data-k="h-min" y1="12" y2="-72"/>
    <line class="hand h-sec" data-k="h-sec" y1="16" y2="-80"/>
    <circle class="af-pin" r="4.5"/></svg>`;
}

const clock = {
  render: (w, ctx) =>
    (w.variant || 'classic') === 'analog'
      ? `<div class="clock analog">${analogFace()}<div class="clock-date" data-k="date"></div></div>`
      : `
    <div class="clock v-${w.variant || 'classic'}${w.showDate === false ? ' no-date' : ''}${w.showGreeting === false ? ' no-greet' : ''}">
      <div class="term-line"><span class="t-user">${esc((ctx.info.user || 'you').toLowerCase())}@${esc(cmd(ctx))}</span><span class="t-dim">:</span><span class="t-path">~</span><span class="t-dim">$</span> date</div>
      <div class="clock-date" data-k="date"></div>
      <div class="clock-time" data-k="time"></div>
      <div class="clock-greet" data-k="greet"></div>
    </div>`,
  tick(el, w, ctx) {
    const now = ctx.now();
    if ((w.variant || 'classic') === 'analog') {
      const s = now.getSeconds();
      const m = now.getMinutes() + s / 60;
      const rot = (k, deg) => el.querySelector(`[data-k="${k}"]`)?.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
      rot('h-hour', ((now.getHours() % 12) + m / 60) * 30);
      rot('h-min', m * 6);
      rot('h-sec', s * 6);
      set(el, 'date', now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      return;
    }
    let h = now.getHours();
    let ampm = '';
    if (!ctx.cfg.clock24) {
      ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
    }
    const time = `<span class="hh">${ctx.cfg.clock24 ? pad(h) : h}</span><span class="sep">:</span><span class="mm">${pad(now.getMinutes())}</span>${ampm ? `<span class="ampm">${ampm}</span>` : ''}`;
    set(el, 'time', time, true);
    set(el, 'date', now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    const name = ctx.cfg.name || ctx.info.user;
    const hello = ctx.cfg.theme === 'bhakti' ? greetingHi(now.getHours()) : greeting(now.getHours());
    set(el, 'greet', name ? `${hello}, ${name}` : hello);
  },
};

function set(el, key, value, html = false) {
  const n = el.querySelector(`[data-k="${key}"]`);
  if (!n) return;
  if (html) {
    if (n.dataset.v !== value) {
      n.innerHTML = value;
      n.dataset.v = value;
    }
  } else if (n.textContent !== value) n.textContent = value;
}

// ---------------------------------------------------------------- commits
function gitStats(git, today) {
  const days = git?.days || {};
  let total = git?.total ?? 0;
  if (git?.total == null) for (const v of Object.values(days)) total += v;
  let streak = 0;
  const d = new Date(today);
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  let longest = 0;
  let run = 0;
  const s = new Date(today.getTime() - 365 * DAY);
  for (let i = 0; i <= 365; i++) {
    const k = dayKey(new Date(s.getTime() + i * DAY));
    run = days[k] ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { total, streak, longest, today: days[dayKey(today)] || 0 };
}

const commits = {
  render(w, ctx) {
    const git = ctx.store.git;
    const days = git?.days || {};
    const today = ctx.now();
    today.setHours(12, 0, 0, 0);
    const cols = Math.max(8, Math.min(53, Number(w.weeks) || 53));
    const start = new Date(today.getTime() - ((cols - 1) * 7 + today.getDay()) * DAY);
    const vals = Object.values(days);
    const max = Math.max(1, ...vals);
    let cells = '';
    let months = '';
    let lastMonth = -1;
    for (let c = 0; c < cols; c++) {
      const first = new Date(start.getTime() + c * 7 * DAY);
      if (first.getMonth() !== lastMonth) {
        if (c > 0 && c < cols - 2) months += `<span style="grid-column:${c + 1}/span 4">${MONTHS[first.getMonth()]}</span>`;
        lastMonth = first.getMonth();
      }
      for (let r = 0; r < 7; r++) {
        const d = new Date(start.getTime() + (c * 7 + r) * DAY);
        if (d > today) {
          cells += '<i class="lv-x"></i>';
          continue;
        }
        const k = dayKey(d);
        const n = days[k] || 0;
        // GitHub's own shading when we have it, so the grid matches your profile exactly
        const lv = git?.levels?.[k] ?? (n === 0 ? 0 : n <= max * 0.25 ? 1 : n <= max * 0.5 ? 2 : n <= max * 0.75 ? 3 : 4);
        const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        cells += `<i class="lv-${lv}" data-tip="${n ? `${n} contribution${n === 1 ? '' : 's'}` : 'No contributions'} on ${day}"></i>`;
      }
    }
    const st = gitStats(git, today);
    const meta = !git
      ? 'loading…'
      : git.source === 'github'
        ? `${st.total.toLocaleString()} contributions · @${esc(git.user)}`
        : git.repoCount
          ? `${st.total.toLocaleString()} commits · local repos`
          : 'no repos found';
    return `
      <div class="card commits"${git?.source === 'github' ? ` data-act="github" data-arg="${esc(git.user)}"` : ''}>
        ${head('Contributions', meta)}
        <div class="heat-wrap">
          <div class="heat-months" style="--cols:${cols}">${months}</div>
          <div class="heat" style="--cols:${cols}">${cells}</div>
        </div>
        <div class="heat-foot"${w.showStats === false ? ' hidden' : ''}>
          <span><b>${st.streak}</b> day streak</span>
          <span><b>${st.longest}</b> longest</span>
          <span><b>${st.today}</b> today</span>
          <span class="legend">less <i class="lv-0"></i><i class="lv-1"></i><i class="lv-2"></i><i class="lv-3"></i><i class="lv-4"></i> more</span>
        </div>
      </div>`;
  },
};

// ---------------------------------------------------------------- feed
const feed = {
  render(w, ctx) {
    const items = (ctx.store.git?.recent || []).slice(0, Number(w.count) || 5);
    const rows = items.length
      ? items
          .map(
            (c) => `
        <div class="feed-item" data-act="repo" data-arg="${esc(c.path || '')}">
          <span class="feed-hash">${esc(c.hash)}</span>
          <div class="feed-main"><div class="feed-msg">${esc(c.message)}</div><div class="feed-sub"><span class="feed-repo">${esc(c.repo)}</span> · ${ago(c.time)}</div></div>
        </div>`,
          )
          .join('')
      : `<div class="empty">${ctx.store.git ? 'No commits yet. Go make history.' : 'Reading git log…'}</div>`;
    return `<div class="card feed">${head('Recent commits', 'git log')}<div class="feed-list">${rows}</div></div>`;
  },
};

// ---------------------------------------------------------------- note
const note = {
  render: (w, ctx) => `
    <div class="note fs-${esc(w.fontSize || 'm')}" data-act="note" data-color="${esc(w.color || 'yellow')}">
      <span class="note-tape"></span>
      <div class="note-file">notes/${esc(w.id)}.md</div>
      ${editable('text', w.text, ctx, 'div', 'note-text', ctx.edit ? 'Type your note…' : `Empty note · ${cmd(ctx)} note "text"`)}
    </div>`,
};

// ---------------------------------------------------------------- todo
const todo = {
  render(w, ctx) {
    const items = w.items || [];
    const done = items.filter((i) => i.done).length;
    const list = items
      .map((it, i) => [it, i])
      .filter(([it]) => !(w.hideDone && it.done && !ctx.edit))
      .map(
        ([it, i]) => `
      <li class="todo-item${it.done ? ' done' : ''}" data-i="${i}">
        <span class="check" data-act="todo-toggle" data-i="${i}">${icon('check')}</span>
        <span class="todo-text">${esc(it.text)}</span>
        ${ctx.edit ? `<button class="todo-del" data-i="${i}" title="Remove">${icon('x')}</button>` : ''}
      </li>`,
      )
      .join('');
    return `
      <div class="card todo" data-act="todo">
        ${head(w.title || 'Today', `${done}/${items.length}`, ctx, 'title')}
        <ul class="todo-list">${list || `<li class="empty">No tasks yet · ${esc(cmd(ctx))} todo "task"</li>`}</ul>
        ${ctx.edit ? `<input class="todo-add" placeholder="Add a task and press Enter" />` : ''}
      </div>`;
  },
};

// ---------------------------------------------------------------- weather
const weather = {
  render(w, ctx) {
    const wx = ctx.store.weather;
    if (!wx || !wx.ok) {
      const msg = wx?.reason === 'offline' ? 'Offline right now' : 'Add your city';
      const sub = wx?.reason === 'offline' ? 'Will retry soon' : `${esc(cmd(ctx))} city &lt;name&gt;`;
      return `<div class="card weather">${head('Weather', '')}<div class="wx-top"><div class="wx-temp">--°</div>${weatherIcon('partly')}</div><div class="wx-label">${msg}</div><div class="wx-sub">${sub}</div></div>`;
    }
    return `
      <div class="card weather" data-act="weather" data-kind="${wx.kind}">
        ${head(wx.city, `${wx.humidity}% hum`)}
        <div class="wx-top"><div class="wx-temp">${wx.temp}°</div>${weatherIcon(wx.kind, wx.isDay)}</div>
        <div class="wx-label">${esc(wx.label)}</div>
        ${w.details === false ? '' : `<div class="wx-sub">H ${wx.high}°  ·  L ${wx.low}°  ·  feels ${wx.feels}°</div>`}
      </div>`;
  },
};

// ---------------------------------------------------------------- year
function yearFrac(now) {
  const y = now.getFullYear();
  const a = new Date(y, 0, 1).getTime();
  const b = new Date(y + 1, 0, 1).getTime();
  return { y, frac: (now.getTime() - a) / (b - a), left: Math.ceil((b - now.getTime()) / DAY) };
}

const year = {
  render(w, ctx) {
    const { y, left } = yearFrac(ctx.now());
    return `
      <div class="card year">
        ${head(String(y), `${left} days left`)}
        <div class="year-pct"><span data-k="pct"></span><small>%</small></div>
        <div class="year-bar"><div class="year-fill"></div></div>
        <div class="year-ascii" data-k="ascii"></div>
      </div>`;
  },
  tick(el, w, ctx) {
    const { frac } = yearFrac(ctx.now());
    set(el, 'pct', (frac * 100).toFixed(w.decimals ?? 6));
    set(el, 'ascii', asciiBar(frac), true);
    const fill = el.querySelector('.year-fill');
    if (fill) fill.style.width = `${(frac * 100).toFixed(3)}%`;
  },
};

// ---------------------------------------------------------------- system
const RING = 2 * Math.PI * 18;
function ring(key, label) {
  return `
    <div class="ring" data-ring="${key}">
      <svg viewBox="0 0 44 44"><circle class="ring-track" cx="22" cy="22" r="18"/><circle class="ring-val" cx="22" cy="22" r="18" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg>
      <div class="ring-num" data-k="${key}">--</div>
      <div class="ring-label">${label}</div>
      <div class="ring-ascii" data-k="${key}-a"></div>
    </div>`;
}

const system = {
  render: () => `<div class="card system">${head('System', 'live')}<div class="rings">${ring('cpu', 'CPU')}${ring('mem', 'Memory')}${ring('bat', 'Battery')}</div></div>`,
  tick(el, w, ctx) {
    const s = ctx.store.system || { cpu: 0, mem: 0 };
    const b = ctx.store.battery;
    const vals = { cpu: s.cpu, mem: s.mem, bat: b ? b.level : null };
    for (const [k, v] of Object.entries(vals)) {
      const r = el.querySelector(`[data-ring="${k}"] .ring-val`);
      if (r) r.style.strokeDashoffset = String(RING * (1 - (v ?? 0)));
      set(el, k, v == null ? 'AC' : `${Math.round(v * 100)}%`);
      set(el, `${k}-a`, v == null ? '' : asciiBar(v, 12), true);
    }
  },
};

// ---------------------------------------------------------------- calendar
const calendar = {
  render(w, ctx) {
    const now = ctx.now();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<b>${d}</b>`).join('');
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= count; d++) {
      const cls = d === now.getDate() ? ' class="today"' : d < now.getDate() ? ' class="past"' : '';
      cells += `<span${cls}>${d}</span>`;
    }
    const title = now.toLocaleDateString('en-US', { month: 'long' });
    return `<div class="card calendar">${head(title, String(y))}<div class="cal-grid">${cells}</div></div>`;
  },
};

// ---------------------------------------------------------------- countdown
function target(w) {
  const t = new Date(`${w.date || '2027-01-01'}T00:00:00`);
  return isNaN(t) ? new Date(Date.now() + 30 * DAY) : t;
}

const countdown = {
  render(w, ctx) {
    const t = target(w);
    const meta = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="card countdown">
        ${head(w.title || 'Countdown', meta, ctx, 'title')}
        <div class="cd-big"><span data-k="days"></span><small data-k="unit">days</small></div>
        <div class="cd-small" data-k="hms"></div>
        ${ctx.edit ? `<input type="date" class="cd-date" value="${esc(w.date || '')}" />` : ''}
      </div>`;
  },
  tick(el, w, ctx) {
    let ms = Math.max(0, target(w).getTime() - ctx.now().getTime());
    const d = Math.floor(ms / DAY);
    ms -= d * DAY;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    set(el, 'days', String(d));
    set(el, 'unit', d === 1 ? 'day' : 'days');
    set(el, 'hms', `${pad(h)}h ${pad(m)}m ${pad(s)}s`);
  },
};

// ---------------------------------------------------------------- quote
const quote = {
  render(w, ctx) {
    const day = Math.floor(ctx.now().getTime() / DAY);
    // your own quote wins; otherwise today's quote from the web, or an offline pick
    const live = ctx.store.quote;
    const [qt, qa] = w.text ? [w.text, w.author || ''] : live ? [live.text, live.author] : QUOTES[day % QUOTES.length];
    return `
      <figure class="quote q-${esc(w.size || 'm')}">
        ${editable('text', qt, ctx, 'blockquote', 'quote-text')}
        ${editable('author', qa, ctx, 'figcaption', 'quote-author')}
      </figure>`;
  },
};

// ---------------------------------------------------------------- menubar
const menubar = {
  render: (w, ctx) => `
    <div class="menubar">
      <div class="mb-left">
        <span class="mb-logo mb-item" data-act="menu"><svg viewBox="0 0 24 24"><path d="M4 7l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.5 18h7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></span>
        ${menuLeft(ctx)}
      </div>
      <div class="mb-right">
        <span class="mb-item mb-np" data-act="player" data-k="np"></span>
        <span class="mb-item" data-act="spotlight" title="Spotlight">${icon('search')}</span>
        <span class="mb-item" data-act="settings-panel" title="Wallpaper settings">${icon('sliders')}</span>
        <span class="mb-batt mb-item" data-act="control" data-k="batt"></span>
        <span class="mb-wifi mb-item" data-act="control" data-k="net"></span>
        <span class="mb-item" data-act="calendar" data-k="when"></span>
      </div>
    </div>`,
  tick(el, w, ctx) {
    const now = ctx.now();
    const date = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: !ctx.cfg.clock24 });
    set(el, 'when', `${date}  ${time}`);
    const b = ctx.store.battery;
    set(el, 'batt', b ? `${Math.round(b.level * 100)}% ${batteryIcon(b.level, b.charging)}` : batteryIcon(1, true), true);
    set(el, 'net', navigator.onLine ? icon('wifi') : `<span class="mb-off">offline</span>`, true);
    const mm = ctx.store.media;
    set(el, 'np', mm?.active && mm.title ? `${icon(mm.playing ? 'volume' : 'pause')}<span>${esc(mm.title)}${mm.artist ? ` — ${esc(mm.artist)}` : ''}</span>` : '', true);
  },
};

// Left side of the menu bar: who you are, what you're working on, which theme is live.
function menuLeft(ctx) {
  const name = ctx.cfg.name || ctx.info.user || ctx.info.brand?.name || '';
  const latest = ctx.store.git?.recent?.[0];
  const repo = latest?.repo;
  const theme = ctx.info.themes?.find((t) => t.id === ctx.cfg.theme)?.name;
  return [
    `<b class="mb-item" data-act="menu">${esc(name)}</b>`,
    repo ? `<span class="mb-repo mb-item" data-act="repo" data-arg="${esc(latest.path || '')}">${icon('feed')}${esc(repo)}</span>` : '',
    theme ? `<span class="mb-item" data-act="themes">${esc(theme)}</span>` : '',
  ].join('');
}

// ---------------------------------------------------------------- art (daily darshan)
const art = {
  render(w, ctx) {
    const a = ctx.store.art;
    if (!a) {
      const msg = ctx.store.artTried ? "Today's painting appears when you're online" : "Fetching today's darshan…";
      return `<figure class="art"><div class="art-frame"><div class="art-empty">${msg}</div></div></figure>`;
    }
    return `
      <figure class="art" data-act="url" data-arg="${esc(a.page || '')}">
        <div class="art-frame"><img src="${esc(a.url)}" alt="${esc(a.title)}" draggable="false" /></div>
        <figcaption><span class="art-title">${esc(a.title)}</span><span class="art-credit">${esc(a.artist)}</span><span class="art-credit">${esc(a.license)} · Wikimedia Commons</span></figcaption>
      </figure>`;
  },
};

// ---------------------------------------------------------------- verse (Bhagavad Gita)
const verse = {
  render(w, ctx) {
    const v = ctx.store.verse;
    if (!v) return `<div class="card verse">${head('Bhagavad Gita', '')}<div class="empty">${ctx.store.verseTried ? 'Offline right now' : "Fetching today's shloka…"}</div></div>`;
    return `
      <div class="card verse">
        ${head('Bhagavad Gita', esc(v.ref))}
        <p class="verse-sa">${esc(v.sanskrit).replace(/\n/g, '<br>')}</p>
        <p class="verse-en">${esc(v.english)}</p>
      </div>`;
  },
};

// ---------------------------------------------------------------- now playing
const music = {
  render(w, ctx) {
    const m = ctx.store.media;
    if (!m?.active) {
      return `<div class="card music idle" data-act="player">${head('Now playing', '')}<div class="mu-row"><div class="mu-art">${icon('volume')}</div><div class="mu-meta"><b>Nothing playing</b><span>Spotify, Apple Music, YouTube…</span></div></div></div>`;
    }
    return `
      <div class="card music" data-act="player">
        ${head('Now playing', esc(m.appName || ''))}
        <div class="mu-row">
          <div class="mu-art"${m.art ? ` style="background-image:url('${esc(m.art)}')"` : ''}>${m.art ? '' : icon('volume')}</div>
          <div class="mu-meta"><b>${esc(m.title || 'Unknown')}</b><span>${esc(m.artist || m.album || '')}</span></div>
        </div>
        <div class="mu-bar"><i data-k="mu-fill"></i></div>
        <div class="mu-ctrl">
          <button data-act="media" data-arg="prev" title="Previous">${icon('prev')}</button>
          <button data-act="media" data-arg="toggle" class="mu-play" data-k="mu-play" title="Play / pause"></button>
          <button data-act="media" data-arg="next" title="Next">${icon('next')}</button>
        </div>
      </div>`;
  },
  tick(el, w, ctx) {
    const m = ctx.store.media;
    if (!m?.active) return;
    const { pos, dur } = mediaPosition(m);
    const fill = el.querySelector('[data-k="mu-fill"]');
    if (fill) fill.style.width = `${dur ? (pos / dur) * 100 : 0}%`;
    set(el, 'mu-play', icon(m.playing ? 'pause' : 'play'), true);
  },
};

// ---------------------------------------------------------------- dock
const dock = {
  render(w, ctx) {
    const apps = ctx.store.dock || [];
    const items = apps.length
      ? apps
          .map(
            (a) => `
        <button class="dock-app" data-act="launch" data-arg="${esc(a.target)}" title="${esc(a.name)}">
          ${a.icon ? `<img src="${a.icon}" alt="" draggable="false" />` : `<span class="dock-glyph">${esc(a.name.slice(0, 1))}</span>`}
          <span class="dock-label">${esc(a.name)}</span>
        </button>`,
          )
          .join('')
      : '<span class="dock-empty">Finding your apps…</span>';
    return `<div class="dock">${items}<span class="dock-sep"></span><button class="dock-app" data-act="spotlight" title="Spotlight"><span class="dock-glyph">${icon('search')}</span><span class="dock-label">Spotlight</span></button></div>`;
  },
};

// ---------------------------------------------------------------- smart stack
// Several widgets in one card; it rotates through them (pausing while hovered) and the
// dots on the side jump straight to one. Cardless widgets get a card inside the stack.
const CARDLESS = new Set(['clock', 'quote']);

function stackChild(w, ctx) {
  const items = (w.items || []).filter((it) => WIDGETS[it.type] && it.type !== 'stack');
  if (!items.length) return { items };
  const i = (ctx.stackIndex?.(w.id) ?? 0) % items.length;
  return { items, i, child: { ...items[i], id: `${w.id}~${i}`, scale: 1 } };
}

const stack = {
  render(w, ctx) {
    const { items, i, child } = stackChild(w, ctx);
    if (!child) return `<div class="stack"><div class="card stack-card">${head('Smart Stack', '')}<div class="empty">Add widgets with ••• → Edit widget</div></div></div>`;
    const inner = WIDGETS[child.type].render(child, ctx);
    return `
      <div class="stack">
        <div class="stack-view" data-type="${child.type}">${CARDLESS.has(child.type) ? `<div class="card stack-card">${inner}</div>` : inner}</div>
        ${items.length > 1 ? `<div class="stack-dots">${items.map((_, k) => `<button class="${k === i ? 'on' : ''}" data-act="stack-go" data-i="${k}" title="${esc(ctx.info.widgets?.find((x) => x.type === items[k].type)?.name || items[k].type)}"></button>`).join('')}</div>` : ''}
      </div>`;
  },
  tick(el, w, ctx) {
    const { child } = stackChild(w, ctx);
    const view = el.querySelector('.stack-view');
    if (child && view) WIDGETS[child.type].tick?.(view, child, ctx);
  },
};

export const WIDGETS = { clock, commits, feed, note, todo, weather, year, system, calendar, countdown, quote, menubar, art, verse, dock, music, stack };
