// Theme backdrops. Most are DOM + CSS (cheap, GPU-composited transforms);
// "weather" is a canvas sky driven by real conditions and sun position.

const rand = (a, b) => a + Math.random() * (b - a);

function starShadows(n, w = 100, h = 60) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rand(0.25, 0.9).toFixed(2);
    out.push(`${rand(0, w).toFixed(2)}vw ${rand(0, h).toFixed(2)}vh 0 ${rand(0, 1) > 0.9 ? 1 : 0}px rgba(255,255,255,${a})`);
  }
  return out.join(',');
}

const CLOUD = 'M25 90C5 90 4 62 30 59C29 31 70 22 86 43C96 14 146 15 151 46C176 40 193 66 176 90Z';

// The terminal backdrop scrolls your own recent git history and live state.
function terminalLog(ctx) {
  const user = (ctx.info.user || 'you').toLowerCase();
  const host = ctx.info.brand?.command || 'desk';
  const lines = [`${user}@${host}:~$ git log --all --oneline -n 12`];
  const recent = ctx.store.git?.recent || [];
  for (const c of recent) lines.push(`${c.hash}  ${c.message}   (${c.repo})`);
  if (!recent.length) lines.push('(no local commits found yet)');
  const g = ctx.store.git;
  if (g?.repoCount) lines.push('', `${user}@${host}:~$ ${host} stats`, `repos scanned   ${g.repoCount}`, `commits (1y)    ${g.total ?? Object.values(g.days || {}).reduce((a, b) => a + b, 0)}`);
  const wx = ctx.store.weather;
  if (wx?.ok) lines.push('', `${user}@${host}:~$ weather ${wx.city.toLowerCase()}`, `${wx.label.toLowerCase()}  ${wx.temp}°C  humidity ${wx.humidity}%  wind ${wx.wind} km/h`);
  lines.push('', `${user}@${host}:~$ date`, ctx.now().toString().slice(0, 24), '');
  const block = lines.join('\n');
  return Array.from({ length: Math.ceil(90 / lines.length) }, () => block).join('\n');
}

const SCENES = {
  aurora: () => `
    <div class="sc sc-aurora">
      <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div>
      <div class="grain"></div><div class="vignette"></div>
    </div>`,

  midnight: () => `
    <div class="sc sc-midnight">
      <div class="eclipse"><div class="rim"></div></div>
      <div class="stars" style="box-shadow:${starShadows(90, 100, 100)}"></div>
      <i class="shoot" style="--x:12vw;--y:6vh;--t:9s;--d:1.5s"></i>
      <i class="shoot" style="--x:38vw;--y:3vh;--t:13s;--d:6s"></i>
      <i class="shoot" style="--x:22vw;--y:30vh;--t:17s;--d:11s"></i>
      <div class="grain"></div>
    </div>`,

  terminal: (ctx) => {
    const log = esc(terminalLog(ctx));
    return `
    <div class="sc sc-terminal">
      <pre class="log">${log}\n${log}</pre>
      <div class="grid"></div><div class="scan"></div><div class="vignette"></div>
    </div>`;
  },

  cartoon: () => `
    <div class="sc sc-cartoon">
      <div class="sun"><div class="rays"></div><div class="disc"></div></div>
      ${[1, 2, 3, 4, 5].map((i) => `<svg class="cloud c${i}" viewBox="0 0 200 100"><path d="${CLOUD}"/><path class="shade" d="M30 82C60 86 140 86 170 82"/></svg>`).join('')}
      <svg class="hills" viewBox="0 0 1600 420" preserveAspectRatio="none">
        <path class="h1" d="M0 230C220 120 420 140 640 220C860 300 1080 150 1300 170C1450 184 1540 230 1600 250V420H0Z"/>
        <path class="h2" d="M0 330C260 250 520 260 760 320C1000 380 1240 270 1600 300V420H0Z"/>
        <g class="trees"><circle cx="300" cy="300" r="26"/><circle cx="345" cy="292" r="20"/><circle cx="1180" cy="292" r="24"/><circle cx="1222" cy="300" r="18"/></g>
      </svg>
    </div>`,

  blast: () => `
    <div class="sc sc-blast">
      <div class="rays"></div>
      <div class="dots"></div>
      <svg class="burst" viewBox="-100 -100 200 200"><polygon points="${burst(14, 98, 62)}"/></svg>
      <div class="pow">POW!</div>
      <div class="zap">ZAP!</div>
    </div>`,

  weather: () => '<div class="sc sc-weather"><canvas></canvas></div>',

  paper: (ctx) => `
    <div class="sc sc-paper">
      <div class="grain"></div>
      <div class="rule"></div>
      <div class="masthead"><span>The ${esc(ctx.info.user || 'Desktop')} Times</span><span>${ctx.now().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span><span>No. ${dayOfYear(ctx.now())}</span></div>
      <div class="word">${ctx.now().toLocaleDateString('en-US', { weekday: 'long' })}</div>
      <div class="vignette"></div>
    </div>`,

  synthwave: () => `
    <div class="sc sc-synth">
      <div class="stars" style="box-shadow:${starShadows(140, 100, 55)}"></div>
      <div class="sun"></div>
      <svg class="mountains" viewBox="0 0 1600 200" preserveAspectRatio="none"><path d="M0 200L120 110L220 160L360 60L470 150L560 120L700 190L820 90L930 150L1060 70L1180 160L1300 100L1420 170L1520 120L1600 160V200Z"/></svg>
      <div class="floor"><div class="grid"></div></div>
      <div class="haze"></div>
    </div>`,

  zen: () => `
    <div class="sc sc-zen">
      <svg class="enso" viewBox="0 0 400 400">
        <defs><filter id="brush"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter></defs>
        <circle cx="200" cy="200" r="150" pathLength="100" stroke-dasharray="88 12" stroke-dashoffset="-6" filter="url(#brush)"/>
      </svg>
      <div class="ripples"><div class="stone"></div></div>
      <div class="ripples r2"><div class="stone"></div></div>
      <div class="grain"></div>
    </div>`,

  bhakti: () => `
    <div class="sc sc-bhakti">
      <svg class="mandala" viewBox="-200 -200 400 400">${mandala()}</svg>
      <div class="toran">${toran()}</div>
      <div class="petals">${Array.from({ length: 9 }, (_, i) => `<i style="left:${(i * 37 + 11) % 100}vw;animation-delay:-${(i * 2.7).toFixed(1)}s;animation-duration:${16 + (i % 4) * 4}s"></i>`).join('')}</div>
      <div class="diyas">${Array.from({ length: 5 }, (_, i) => `<div class="diya" style="animation-delay:-${i * 0.37}s"><span class="glow"></span><span class="flame"></span><span class="bowl"></span></div>`).join('')}</div>
    </div>`,

  pastel: () => `
    <div class="sc sc-pastel"><i class="pb p1"></i><i class="pb p2"></i><i class="pb p3"></i><i class="pb p4"></i><div class="grain"></div></div>`,

  ocean: () => `
    <div class="sc sc-ocean">
      <div class="stars" style="box-shadow:${starShadows(90, 100, 45)}"></div>
      <div class="moon"></div>
      <div class="sea"></div>
      <div class="glint"></div>
      <svg class="waves" viewBox="0 0 2400 600" preserveAspectRatio="none">
        <defs>${[1, 2, 3, 4, 5].map((i) => `<linearGradient id="wg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ws${i}a"/><stop offset="1" class="ws${i}b"/></linearGradient>`).join('')}</defs>
        ${[1, 2, 3, 4, 5].map((i) => `<g class="wl l${i}"><path d="${wave(i)}" fill="url(#wg${i})"/></g>`).join('')}
      </svg>
    </div>`,

  sakura: () => `
    <div class="sc sc-sakura">
      <div class="sun"></div>
      <svg class="fuji" viewBox="0 0 1600 300" preserveAspectRatio="none"><path class="m1" d="M0 300L520 120L640 70L700 62L760 70L880 120L1600 300Z"/><path class="snow" d="M640 70L700 62L760 70L800 92L760 100L730 90L700 104L668 90L630 98L600 92Z"/></svg>
      <svg class="branch" viewBox="0 0 600 420">${branch()}</svg>
      <div class="petals">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 41 + 13) % 100}vw;animation-delay:-${(i * 1.7).toFixed(1)}s;animation-duration:${14 + (i % 5) * 4}s"></i>`).join('')}</div>
    </div>`,

  orbit: () => `
    <div class="sc sc-orbit">
      <div class="stars" style="box-shadow:${starShadows(120, 100, 100)}"></div>
      <div class="system">
        <div class="sun"></div>
        ${[1, 2, 3, 4, 5].map((i) => `<div class="ring r${i}"><i class="planet"></i></div>`).join('')}
      </div>
    </div>`,

  forest: () => `
    <div class="sc sc-forest">
      <div class="stars" style="box-shadow:${starShadows(70, 100, 40)}"></div>
      <div class="moon"></div>
      ${[1, 2, 3].map((i) => `<svg class="range r${i}" viewBox="0 0 1600 400" preserveAspectRatio="none"><path d="${mountains(i)}"/></svg>`).join('')}
      <div class="mist m1"></div>
      <svg class="trees" viewBox="0 0 1600 300" preserveAspectRatio="none">${treeline()}</svg>
      <div class="mist m2"></div>
      <div class="flies">${Array.from({ length: 22 }, (_, i) => `<i style="left:${(i * 37 + 5) % 100}vw;top:${58 + ((i * 23) % 36)}vh;animation-delay:-${(i * 1.3).toFixed(1)}s;animation-duration:${6 + (i % 4) * 2}s"></i>`).join('')}</div>
    </div>`,

  astro: () => `
    <div class="sc sc-astro">
      <div class="stars" style="box-shadow:${starShadows(160, 100, 70)}"></div>
      <div class="planet"><div class="surface"></div><div class="shade"></div></div>
    </div>`,

  retro: () => `
    <div class="sc sc-retro">
      <div class="dither"></div>
      ${[1, 2, 3].map((i) => `<div class="pxcloud p${i}"></div>`).join('')}
    </div>`,
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

// Line-art mandala: rings of lotus petals and dots.
function mandala() {
  const petal = (r1, r2, w) => `M0 ${-r1}Q${w} ${-(r1 + r2) / 2} 0 ${-r2}Q${-w} ${-(r1 + r2) / 2} 0 ${-r1}Z`;
  const ring = (n, r1, r2, w, off = 0) =>
    Array.from({ length: n }, (_, i) => `<path d="${petal(r1, r2, w)}" transform="rotate(${(360 / n) * i + off})"/>`).join('');
  const dots = (n, r, size) => Array.from({ length: n }, (_, i) => `<circle class="dot" r="${size}" transform="rotate(${(360 / n) * i}) translate(0 ${-r})"/>`).join('');
  return `
    <circle r="22"/><circle r="30"/>
    ${ring(8, 30, 74, 20)}${ring(8, 38, 66, 10, 22.5)}
    <circle r="82"/>${dots(32, 90, 1.6)}
    ${ring(16, 98, 140, 13)}${ring(16, 104, 132, 6, 11.25)}
    <circle r="148"/>${dots(48, 156, 1.3)}
    ${ring(32, 164, 188, 6)}<circle r="194"/>`;
}

// A marigold toran: strands of flowers hanging from the top edge.
function toran() {
  const n = 26;
  return Array.from({ length: n }, (_, i) => {
    const len = 3 + ((i * 7) % 4) + (i % 2 ? 0 : 1);
    const beads = Array.from({ length: len }, (_, j) => `<b class="${(i + j) % 3 === 0 ? 'y' : 'o'}"></b>`).join('');
    return `<span class="strand" style="left:${((i + 0.5) / n) * 100}%;animation-delay:-${(i % 7) * 0.6}s">${beads}<em></em></span>`;
  }).join('');
}

// Two periods of a smooth wave across a 2400-wide tile, so sliding half-way loops seamlessly.
function wave(i) {
  const amp = 8 + i * 5;
  const base = 120 + i * 85;
  const step = 400 - i * 30;
  let d = `M0 ${base}`;
  for (let x = 0, k = 0; x < 2400; x += step, k++) d += ` Q${x + step / 2} ${k % 2 ? base + amp : base - amp} ${Math.min(2400, x + step)} ${base}`;
  return `${d} V600 H0Z`;
}

// Smooth mountain ranges, nearer ranges taller and bolder.
function mountains(i) {
  const base = 200 + i * 55;
  let d = `M0 400 L0 ${base}`;
  let k = i * 13;
  for (let x = 0; x <= 1600; x += 80) {
    k = (k * 29 + 7) % 89;
    const peak = base - 40 - (k % 9) * (14 - i * 2) - Math.sin(x / (220 + i * 60)) * (40 - i * 6);
    d += ` Q${x + 40} ${peak} ${x + 80} ${base - 30 - (k % 5) * 8}`;
  }
  return `${d} L1600 400Z`;
}

// A treeline of proper tiered pines (three tiers each) on a soft hill.
function treeline() {
  let out = '<path class="hill" d="M0 300 L0 230 Q400 200 800 225 T1600 215 L1600 300Z"/>';
  let k = 5;
  for (let x = -20; x < 1620; ) {
    k = (k * 37 + 11) % 97;
    const h = 70 + (k % 9) * 11;
    const w = h * 0.42;
    const y = 232 - Math.sin(x / 260) * 8;
    let tree = '';
    for (let t = 0; t < 3; t++) {
      const top = y - h + t * h * 0.24;
      const bw = w * (0.55 + t * 0.25);
      tree += `M${x} ${top} L${x + bw / 2} ${top + h * 0.42} L${x - bw / 2} ${top + h * 0.42}Z`;
    }
    out += `<path class="pine" d="${tree}"/>`;
    x += w * 0.55 + (k % 4) * 6;
  }
  return out;
}

// A blossom branch from the top-right corner.
function branch() {
  const flowers = [[420, 70], [470, 120], [360, 140], [300, 190], [250, 160], [210, 240], [520, 60], [395, 200], [150, 280], [330, 95], [480, 180], [260, 300]]
    .map(([x, y], i) => {
      const r = 14 + (i % 3) * 4;
      const petals = Array.from({ length: 5 }, (_, p) => `<ellipse rx="${r * 0.55}" ry="${r * 0.38}" transform="rotate(${p * 72 + i * 11}) translate(${r * 0.55} 0)"/>`).join('');
      return `<g class="bloom" transform="translate(${x} ${y})">${petals}<circle class="heart" r="${r * 0.22}"/></g>`;
    })
    .join('');
  return `<path class="wood" d="M600 0 C 520 60 460 90 420 70 M600 30 C 480 120 400 150 300 190 C 240 215 200 245 150 280 M470 120 C 450 160 420 190 395 200 M360 140 C 330 120 320 105 330 95 M300 190 C 280 230 270 270 260 300"/>${flowers}`;
}

function burst(n, outer, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer * (0.85 + ((i * 37) % 10) / 60);
    const a = (Math.PI * i) / n;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

const textures = {};

export function mountScene(el, theme, ctx) {
  el.innerHTML = (SCENES[theme] || SCENES.aurora)(ctx);
  if (theme === 'weather') return mountSky(el.querySelector('canvas'), ctx);
  if (theme === 'astro') {
    const kind = ['moon', 'mars', 'earth'].includes(ctx.cfg.planet) ? ctx.cfg.planet : 'moon';
    el.querySelector('.sc-astro').dataset.planet = kind;
    // let the widgets paint first, then draw the planet
    import('./planet.js').then(({ planetTexture }) => setTimeout(() => {
      textures[kind] ??= planetTexture(kind);
      const surf = el.querySelector('.surface');
      if (surf) surf.style.backgroundImage = `url("${textures[kind]}")`;
    }, 300));
  }
  if (theme === 'terminal') {
    let key = '';
    return {
      update(c) {
        const k = `${c.store.git?.updated}|${c.store.weather?.updated}`;
        if (k === key) return;
        key = k;
        const log = esc(terminalLog(c));
        el.querySelector('.log').innerHTML = `${log}\n${log}`;
      },
      destroy() {},
    };
  }
  return { update() {}, destroy() {} };
}

// ------------------------------------------------------------------ live sky

const PALETTES = {
  night: ['#060a1c', '#0e1838', '#1c2a50'],
  dawnA: ['#1c2250', '#6a4c8c', '#f08a6c'],
  dawnB: ['#3f6fb5', '#9fb8e0', '#ffd2a1'],
  day: ['#2c6bd2', '#5b98e6', '#acd6ff'],
  duskA: ['#3a3f8f', '#c0628f', '#ffb173'],
  duskB: ['#1f1e4d', '#6b3c78', '#f07a5a'],
};
const COVER = { clear: 0, partly: 0.12, cloudy: 0.55, fog: 0.5, rain: 0.62, snow: 0.45, storm: 0.78 };
const CLOUDS = { clear: 2, partly: 6, cloudy: 13, fog: 6, rain: 14, snow: 11, storm: 16 };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a})`;

function skyColors(min, rise, set) {
  const stops = [
    [rise - 90, 'night'], [rise - 20, 'dawnA'], [rise + 40, 'dawnB'], [rise + 130, 'day'],
    [set - 130, 'day'], [set - 35, 'duskA'], [set + 20, 'duskB'], [set + 90, 'night'],
  ];
  if (min <= stops[0][0] || min >= stops[stops.length - 1][0]) return PALETTES.night.map(hex);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, pa] = stops[i];
    const [b, pb] = stops[i + 1];
    if (min >= a && min <= b) {
      const t = (min - a) / Math.max(1, b - a);
      return PALETTES[pa].map((c, j) => mix(hex(c), hex(PALETTES[pb][j]), t));
    }
  }
  return PALETTES.day.map(hex);
}

function cloudSprite(tint) {
  const c = document.createElement('canvas');
  c.width = 520;
  c.height = 240;
  const g = c.getContext('2d');
  const puffs = [[140, 150, 90], [230, 115, 110], [330, 135, 95], [400, 160, 70], [90, 170, 60], [270, 170, 100]];
  for (const [x, y, r] of puffs) {
    const grad = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    grad.addColorStop(0, rgb(tint, 0.95));
    grad.addColorStop(0.55, rgb(tint, 0.6));
    grad.addColorStop(1, rgb(tint, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function mountSky(canvas, ctx0) {
  const g = canvas.getContext('2d');
  let ctx = ctx0;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let kind = '';
  let clouds = [];
  let drops = [];
  let stars = [];
  let sprites = {};
  let flash = 0;
  let nextBolt = performance.now() + 4000;

  function state() {
    const now = ctx.now();
    const wx = ctx.store.weather?.ok ? ctx.store.weather : null;
    const k = ctx.cfg.sky || wx?.kind || 'clear';
    return {
      kind: COVER[k] != null ? k : 'clear',
      min: now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60,
      rise: wx?.sunrise ?? 390,
      set: wx?.sunset ?? 1110,
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: 220 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.7, r: rand(0.4, 1.4), p: rand(0, 6.28) }));
  }

  function rebuild(k) {
    kind = k;
    const n = CLOUDS[k];
    clouds = Array.from({ length: n }, (_, i) => ({
      x: rand(-0.2, 1.1) * W,
      y: rand(0.02, k === 'partly' || k === 'clear' ? 0.45 : 0.55) * H,
      s: rand(0.6, 1.6) * (H / 900),
      v: rand(4, 12),
      a: rand(0.5, 0.95),
      layer: i % 3,
    }));
    const count = k === 'storm' ? 650 : k === 'rain' ? 420 : k === 'snow' ? 260 : 0;
    drops = Array.from({ length: count }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(0.7, 1.3), r: rand(1, 3.2), p: rand(0, 6.28) }));
  }

  function draw(t, dt) {
    const s = state();
    if (s.kind !== kind) rebuild(s.kind);
    const cover = COVER[s.kind];
    const isDay = s.min > s.rise && s.min < s.set;

    // sky
    let [top, mid, bot] = skyColors(s.min, s.rise, s.set);
    const grey = isDay ? hex('#7d8796') : hex('#1b1f29');
    top = mix(top, grey, cover * 0.85);
    mid = mix(mid, grey, cover * 0.8);
    bot = mix(bot, mix(grey, [255, 255, 255], isDay ? 0.2 : 0.03), cover * 0.75);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgb(top));
    sky.addColorStop(0.55, rgb(mid));
    sky.addColorStop(1, rgb(bot));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // stars and moon
    const fromEdge = s.min >= s.set ? s.min - s.set : s.rise - s.min;
    const nightness = isDay ? 0 : Math.min(1, fromEdge / 60);
    if (nightness > 0) {
      for (const st of stars) {
        const a = (0.35 + 0.65 * Math.abs(Math.sin(st.p + t / 1600))) * nightness * (1 - cover);
        g.fillStyle = `rgba(255,255,255,${a})`;
        g.fillRect(st.x, st.y, st.r, st.r);
      }
    }

    // sun / moon on an arc
    const span = isDay ? s.set - s.rise : 1440 - (s.set - s.rise);
    const into = isDay ? s.min - s.rise : (s.min - s.set + 1440) % 1440;
    const f = Math.min(1, Math.max(0, into / span));
    const bx = W * (0.08 + 0.84 * f);
    const by = H * (0.78 - 0.6 * Math.sin(Math.PI * f));
    const vis = 1 - cover * 0.85;
    if (isDay) {
      const glow = g.createRadialGradient(bx, by, 0, bx, by, H * 0.45);
      glow.addColorStop(0, `rgba(255,236,190,${0.55 * vis})`);
      glow.addColorStop(0.2, `rgba(255,214,150,${0.18 * vis})`);
      glow.addColorStop(1, 'rgba(255,200,140,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(255,248,230,${0.95 * vis})`;
      g.beginPath();
      g.arc(bx, by, H * 0.035, 0, Math.PI * 2);
      g.fill();
    } else {
      const glow = g.createRadialGradient(bx, by, 0, bx, by, H * 0.25);
      glow.addColorStop(0, `rgba(200,215,255,${0.25 * vis})`);
      glow.addColorStop(1, 'rgba(200,215,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      const r = H * 0.028;
      g.fillStyle = `rgba(236,240,255,${0.95 * vis})`;
      g.beginPath();
      g.arc(bx, by, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgb(mix(top, mid, 0.5), 0.9 * vis);
      g.beginPath();
      g.arc(bx + r * 0.42, by - r * 0.25, r * 0.86, 0, Math.PI * 2);
      g.fill();
    }

    // far mountains
    ridge(H * 0.8, 0.012, rgb(mix(bot, [10, 14, 30], isDay ? 0.45 : 0.7), 1), 1.7);
    ridge(H * 0.88, 0.02, rgb(mix(bot, [6, 8, 18], isDay ? 0.65 : 0.85), 1), 3.1);

    // clouds
    const tintKey = s.kind === 'storm' ? 'storm' : isDay ? (cover > 0.4 ? 'grey' : 'white') : 'night';
    if (!sprites[tintKey]) {
      const tints = { white: [255, 255, 255], grey: [214, 220, 228], storm: [120, 126, 140], night: [70, 82, 110] };
      sprites[tintKey] = cloudSprite(tints[tintKey]);
    }
    const sp = sprites[tintKey];
    for (const c of clouds) {
      c.x += (c.v * dt) / 1000 * (1 + c.layer * 0.4);
      const w = sp.width * c.s;
      if (c.x > W + 40) c.x = -w - rand(0, 200);
      g.globalAlpha = c.a;
      g.drawImage(sp, c.x, c.y, w, sp.height * c.s);
    }
    g.globalAlpha = 1;

    // fog bands
    if (s.kind === 'fog') {
      for (let i = 0; i < 4; i++) {
        const y = H * (0.45 + i * 0.13) + Math.sin(t / 4000 + i) * 12;
        const band = g.createLinearGradient(0, y - 80, 0, y + 80);
        band.addColorStop(0, 'rgba(220,226,235,0)');
        band.addColorStop(0.5, `rgba(220,226,235,${isDay ? 0.35 : 0.12})`);
        band.addColorStop(1, 'rgba(220,226,235,0)');
        g.fillStyle = band;
        g.fillRect(0, y - 80, W, 160);
      }
    }

    // precipitation
    if (s.kind === 'rain' || s.kind === 'storm') {
      g.strokeStyle = isDay ? 'rgba(220,232,255,0.45)' : 'rgba(170,190,230,0.35)';
      g.lineWidth = 1.1;
      g.beginPath();
      for (const d of drops) {
        d.y += d.v * dt * 1.1;
        d.x -= d.v * dt * 0.18;
        if (d.y > H) {
          d.y = -20;
          d.x = rand(0, W * 1.1);
        }
        g.moveTo(d.x, d.y);
        g.lineTo(d.x + 4 * d.v, d.y - 18 * d.v);
      }
      g.stroke();
    } else if (s.kind === 'snow') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (const d of drops) {
        d.y += d.v * dt * 0.06;
        d.x += Math.sin(t / 1200 + d.p) * 0.35;
        if (d.y > H) {
          d.y = -5;
          d.x = rand(0, W);
        }
        g.beginPath();
        g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        g.fill();
      }
    }

    // lightning
    if (s.kind === 'storm' && ctx.cfg.motion !== false && t > nextBolt) {
      flash = 1;
      nextBolt = t + rand(5000, 12000);
      bolt();
    }
    if (flash > 0) {
      g.fillStyle = `rgba(230,236,255,${flash * 0.35})`;
      g.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt / 260);
    }
  }

  let boltPath = null;
  function bolt() {
    let x = rand(W * 0.2, W * 0.8);
    let y = 0;
    boltPath = [[x, y]];
    while (y < H * 0.7) {
      x += rand(-40, 40);
      y += rand(30, 70);
      boltPath.push([x, y]);
    }
    setTimeout(() => (boltPath = null), 140);
  }

  function ridge(base, freq, color, seed) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      const y = base - (Math.sin(x * freq * 0.37 + seed) * 0.5 + Math.sin(x * freq + seed * 2) * 0.3 + Math.sin(x * freq * 2.3 + seed) * 0.2) * H * 0.07;
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.fill();
  }

  function frame(t) {
    const motion = ctx.cfg.motion !== false;
    const interval = motion ? 1000 / 30 : 60000;
    if (t - last >= interval || !last) {
      const dt = last ? Math.min(100, t - last) : 16;
      last = t;
      draw(t, motion ? dt : 0);
      if (boltPath) {
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 2;
        g.beginPath();
        boltPath.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
    }
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return {
    update(next) {
      ctx = next;
      last = 0;
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}
