// Things that live on the wallpaper itself rather than in a widget:
//  - real weather: rain, snow or a storm falling over any theme when it's happening outside
//  - the season: cherry petals, summer light, falling leaves or snow (picked, or from the calendar)
//  - a desktop pet that strolls along the dock and reacts when you click it
//  - the album-art wallpaper: a slow, blurred version of the cover while music plays
//  - confetti when you finish your to-dos or a countdown reaches zero

import { extractPalette, fallbackPalette } from './player.js';

let layer; // behind the widgets: album art + season tint + season canvas + weather canvas
let stage;
let fx = null;
let pet = null;

export function mountAmbient(stageEl) {
  stage = stageEl;
  layer = document.createElement('div');
  layer.id = 'ambient';
  layer.innerHTML = '<div class="album-wall"><div class="aw-bg"><i class="art-layer a1"></i><i class="art-layer a2"></i><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i></div><div class="aw-bg"><i class="art-layer a1"></i><i class="art-layer a2"></i><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><i class="blob b4"></i></div><b></b></div><div class="season-tint"></div><canvas class="season"></canvas><canvas class="fx"></canvas>';
  stageEl.before(layer);
}

// called on every render / data change
export function updateAmbient(c) {
  if (!layer) return;
  const motion = c.cfg.motion !== false && document.documentElement.dataset.perf !== 'saver';
  updateWeather(c, motion);
  updateSeason(c, motion);
  updatePet(c, motion);
  updateAlbum(c);
}

// ------------------------------------------------------------------ album-art wallpaper
// The same living background as the Now Playing screen: blurred copies of the cover that
// slowly turn, with four soft blobs of the cover's own colors drifting over them. It fades in
// while music plays and back to your theme a little after it pauses or stops.

// two copies of the background: the next song is painted into the hidden one, which then
// slowly cross-fades over the current one
const album = { art: '', on: false, offTimer: 0, front: 0 };
function paintAlbum(wall, m) {
  const stacks = wall.querySelectorAll('.aw-bg');
  const bg = stacks[album.front ^ 1];
  const set = (palette, art) => {
    palette.forEach((c, i) => bg.style.setProperty(`--p${i + 1}`, c));
    bg.style.setProperty('--tint', palette[3]);
    bg.querySelectorAll('.art-layer').forEach((l) => (l.style.backgroundImage = `url("${art.replace(/"/g, '%22')}")`));
    album.front ^= 1;
    stacks[album.front].classList.add('front');
    stacks[album.front ^ 1].classList.remove('front');
  };
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0, 16, 16);
      set(extractPalette(g.getImageData(0, 0, 16, 16).data), cv.toDataURL());
    } catch {
      set(fallbackPalette(m.title || 'music'), m.art);
    }
  };
  im.onerror = () => set(fallbackPalette(m.title || 'music'), m.art);
  im.src = m.art;
}
function updateAlbum(c) {
  const m = c.store.media;
  const wall = layer.querySelector('.album-wall');
  const wanted = c.cfg.albumWall !== false && !c.edit && m?.active && m.art;
  if (wanted && m.art !== album.art) {
    album.art = m.art;
    paintAlbum(wall, m);
  }
  wall.classList.toggle('playing', !!m?.playing);
  const show = !!(wanted && m.playing);
  clearTimeout(album.offTimer);
  if (show && !album.on) {
    album.on = true;
    wall.classList.add('on');
  } else if (!show && album.on) {
    // paused: wait a moment (a quick pause shouldn't flash the theme back)
    album.offTimer = setTimeout(() => {
      album.on = false;
      wall.classList.remove('on');
    }, wanted ? 8000 : 600);
  }
}

// ------------------------------------------------------------------ confetti

export function confetti() {
  const root = document.documentElement;
  if (root.dataset.motion === 'off' || root.hasAttribute('data-paused')) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.append(cv);
  const W = (cv.width = innerWidth);
  const H = (cv.height = innerHeight);
  const g = cv.getContext('2d');
  const accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#ff8a3d';
  const colors = [accent, '#ffd60a', '#30d158', '#0a84ff', '#ff375f', '#bf5af2', '#ffffff'];
  const n = root.dataset.perf === 'saver' ? 90 : 180;
  const bits = Array.from({ length: n }, (_, i) => {
    const fromLeft = i % 2 === 0; // two cannons, from the bottom corners
    const a = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
    const v = (0.9 + Math.random() * 0.6) * H * 0.0024;
    return { x: fromLeft ? W * 0.05 : W * 0.95, y: H * 0.95, vx: Math.cos(a) * v * 16, vy: Math.sin(a) * v * 16, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[i % colors.length] };
  });
  const start = performance.now();
  const frame = (t) => {
    const dt = 1;
    g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.32 * dt;
      b.vx *= 0.992;
      b.vy *= 0.992;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.r += b.vr;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.scale(1, Math.cos(t / 120 + b.r)); // the flutter
      g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (t - start < 4200) requestAnimationFrame(frame);
    else cv.remove();
  };
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ weather on the desktop

function weatherKind(c) {
  const mode = c.cfg.weatherFx ?? 'auto';
  if (mode === 'off') return null;
  if (mode !== 'auto') return mode; // a forced preview: rain | snow | storm
  if (c.cfg.theme === 'weather') return null; // that theme already draws the sky
  const k = c.store.weather?.ok ? c.store.weather.kind : null;
  return ['rain', 'snow', 'storm'].includes(k) ? k : null;
}

function updateWeather(c, motion) {
  const kind = motion ? weatherKind(c) : null;
  if (fx?.kind === kind) return;
  fx?.stop();
  fx = kind ? startFx(layer.querySelector('.fx'), kind) : null;
  if (!kind) {
    const cv = layer.querySelector('.fx');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }
}

function startFx(cv, kind) {
  const g = cv.getContext('2d');
  let W = 0;
  let H = 0;
  const size = () => {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
  };
  size();
  addEventListener('resize', size);
  const snow = kind === 'snow';
  const n = snow ? 140 : kind === 'storm' ? 260 : 170;
  const drops = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.4 + Math.random() * 0.6, p: Math.random() * 6.28 }));
  let flash = 0;
  let raf = 0;
  let last = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    g.clearRect(0, 0, W, H);
    if (snow) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (const d of drops) {
        d.y += (30 + 40 * d.z) * dt;
        d.x += Math.sin(t / 1400 + d.p) * 18 * dt;
        if (d.y > H + 4) (d.y = -4), (d.x = Math.random() * W);
        g.globalAlpha = 0.35 + d.z * 0.55;
        g.beginPath();
        g.arc(d.x, d.y, 0.9 + d.z * 2.1, 0, 6.28);
        g.fill();
      }
    } else {
      const slant = kind === 'storm' ? 0.28 : 0.16;
      g.strokeStyle = 'rgba(200,215,235,1)';
      g.lineCap = 'round';
      for (const d of drops) {
        const v = (900 + 700 * d.z) * dt;
        d.y += v;
        d.x += v * slant;
        if (d.y > H) (d.y = -20), (d.x = Math.random() * (W + 200) - 200);
        g.globalAlpha = 0.12 + d.z * 0.28;
        g.lineWidth = 0.6 + d.z * 0.9;
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - 14 * d.z * slant, d.y - 14 * d.z);
        g.stroke();
      }
      if (kind === 'storm') {
        if (flash <= 0 && Math.random() < dt * 0.12) flash = 1;
        if (flash > 0) {
          g.globalAlpha = flash * 0.22;
          g.fillStyle = '#eef3ff';
          g.fillRect(0, 0, W, H);
          flash -= dt * 3.2;
        }
      }
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    kind,
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
    },
  };
}

// ------------------------------------------------------------------ seasons

// 'auto' follows the calendar (northern hemisphere): Mar-May spring, Jun-Aug summer, Sep-Nov autumn
export function seasonFor(setting, now = new Date()) {
  if (setting && setting !== 'auto') return setting === 'off' ? null : setting;
  const m = now.getMonth();
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}

let season = null;
function updateSeason(c, motion) {
  const kind = seasonFor(c.cfg.season ?? 'off');
  const tint = layer.querySelector('.season-tint');
  tint.dataset.s = kind || '';
  const want = motion && kind ? kind : null;
  if (season?.kind === want) return;
  season?.stop();
  season = want ? startSeason(layer.querySelector('.season'), want) : null;
  if (!want) {
    const cv = layer.querySelector('.season');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }
}

const LEAVES = ['#d9622b', '#e8a33d', '#b5432a', '#c98a2e', '#a8551f'];
const PETALS = ['#f7b6c8', '#f4c6d4', '#ffd9e3', '#f29bb5'];

function startSeason(cv, kind) {
  const g = cv.getContext('2d');
  let W = 0;
  let H = 0;
  const size = () => {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
  };
  size();
  addEventListener('resize', size);
  const u = () => H / 67.5; // one "rem"
  const n = { spring: 34, summer: 40, autumn: 26, winter: 90 }[kind];
  const make = (fresh) => ({
    x: Math.random() * W,
    y: fresh ? (kind === 'summer' ? H + 10 : -20) : Math.random() * H,
    z: 0.5 + Math.random() * 0.5,
    r: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 2,
    p: Math.random() * 6.28,
    c: (kind === 'autumn' ? LEAVES : PETALS)[Math.floor(Math.random() * 5) % (kind === 'autumn' ? LEAVES.length : PETALS.length)],
  });
  const parts = Array.from({ length: n }, () => make(false));
  let raf = 0;
  let last = performance.now();
  const frame = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    g.clearRect(0, 0, W, H);
    const s = u();
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      if (kind === 'summer') {
        // warm motes drifting up, softly twinkling
        q.y -= (8 + 14 * q.z) * dt;
        q.x += Math.sin(t / 2200 + q.p) * 10 * dt;
        if (q.y < -10) parts[i] = make(true);
        g.globalAlpha = (0.25 + 0.45 * q.z) * (0.6 + 0.4 * Math.sin(t / 700 + q.p));
        g.fillStyle = 'rgba(255, 214, 140, 1)';
        g.beginPath();
        g.arc(q.x, q.y, 0.08 * s + q.z * 0.12 * s, 0, 6.28);
        g.fill();
        continue;
      }
      if (kind === 'winter') {
        q.y += (18 + 26 * q.z) * dt;
        q.x += Math.sin(t / 1800 + q.p) * 12 * dt;
        if (q.y > H + 6) parts[i] = make(true);
        g.globalAlpha = 0.3 + q.z * 0.5;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(q.x, q.y, 0.04 * s + q.z * 0.1 * s, 0, 6.28);
        g.fill();
        continue;
      }
      // spring petals and autumn leaves: fall, sway, tumble
      q.y += (kind === 'autumn' ? 34 : 24) * (0.6 + q.z) * dt;
      q.x += (Math.sin(t / 1300 + q.p) * 28 + 10) * dt;
      q.r += q.vr * dt;
      if (q.y > H + 30 || q.x > W + 30) parts[i] = make(true);
      const size = (kind === 'autumn' ? 0.55 : 0.32) * s * (0.7 + q.z * 0.6);
      g.save();
      g.translate(q.x, q.y);
      g.rotate(q.r);
      g.scale(Math.cos(t / 600 + q.p), 1); // the flutter: turning edge-on and back
      g.globalAlpha = 0.55 + q.z * 0.4;
      g.fillStyle = q.c;
      g.beginPath();
      if (kind === 'autumn') {
        g.moveTo(0, -size);
        g.quadraticCurveTo(size * 0.95, -size * 0.25, 0, size);
        g.quadraticCurveTo(-size * 0.95, -size * 0.25, 0, -size);
        g.fill();
        g.strokeStyle = 'rgba(70, 30, 10, 0.35)';
        g.lineWidth = Math.max(0.6, size * 0.06);
        g.beginPath();
        g.moveTo(0, -size * 0.8);
        g.lineTo(0, size * 1.25);
        g.stroke();
      } else {
        g.ellipse(0, 0, size, size * 0.62, 0, 0, 6.28);
        g.fill();
      }
      g.restore();
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    kind,
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
    },
  };
}

// ------------------------------------------------------------------ desktop pet

const PETS = {
  cat: `<svg viewBox="0 0 64 48" class="pet-svg">
      <path class="pet-tail" d="M12 30c-7-2-9-10-5-15" />
      <g class="pet-legs"><rect x="16" y="34" width="4.5" height="11" rx="2.2"/><rect x="24" y="34" width="4.5" height="11" rx="2.2"/><rect x="38" y="34" width="4.5" height="11" rx="2.2"/><rect x="46" y="34" width="4.5" height="11" rx="2.2"/></g>
      <ellipse class="pet-body" cx="32" cy="30" rx="21" ry="10"/>
      <g class="pet-head">
        <path class="pet-body" d="M44 12l2-9 6 7M58 10l3-8 2 9"/>
        <circle class="pet-body" cx="53" cy="18" r="10"/>
        <circle class="pet-eye" cx="50" cy="17" r="1.6"/><circle class="pet-eye" cx="57.5" cy="17" r="1.6"/>
        <path class="pet-nose" d="M53 21l1.6 1.4M53 21l-1.6 1.4"/>
      </g>
    </svg>`,
  bird: `<svg viewBox="0 0 48 44" class="pet-svg">
      <g class="pet-legs"><path d="M20 34v7M28 34v7" /></g>
      <ellipse class="pet-body" cx="24" cy="24" rx="15" ry="13"/>
      <ellipse class="pet-belly" cx="27" cy="28" rx="9" ry="7"/>
      <path class="pet-wing" d="M10 22c4-6 14-6 16 2-6 4-12 3-16-2z"/>
      <circle class="pet-eye" cx="31" cy="18" r="1.8"/>
      <path class="pet-beak" d="M37 19l7 2-7 3z"/>
    </svg>`,
};
const SAYS = { cat: ['meow', 'purr…', 'mrrp?', '♥'], bird: ['tweet!', 'chirp', '♪', '♥'] };

function updatePet(c, motion) {
  const kind = c.edit ? null : c.cfg.pet ?? 'cat';
  if (!PETS[kind]) {
    pet?.stop();
    pet = null;
    return;
  }
  if (pet?.kind === kind) {
    pet.motion = motion;
    return;
  }
  pet?.stop();
  pet = startPet(kind, motion);
}

function startPet(kind, motion) {
  const el = document.createElement('div');
  el.className = `pet pet-${kind}`;
  el.dataset.act = 'pet';
  el.innerHTML = `${PETS[kind]}<span class="pet-say"></span>`;
  stage.append(el);
  const self = { kind, motion, x: innerWidth * 0.4, dir: 1, state: 'walk', until: 0, raf: 0 };
  let last = performance.now();

  // walk on top of the dock if there is one, else along the bottom of the screen
  const ground = () => {
    const d = document.querySelector('.dock');
    const r = d?.getBoundingClientRect();
    if (r && r.width) return { left: r.left + 6, right: r.right - 6, y: r.top };
    return { left: 40, right: innerWidth - 40, y: innerHeight - 70 };
  };

  const frame = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const gnd = ground();
    const w = el.offsetWidth;
    if (self.motion && t > self.until) {
      // wander: mostly walk, sometimes sit a while, now and then nap
      const roll = Math.random();
      self.state = roll < 0.55 ? 'walk' : roll < 0.9 ? 'sit' : 'sleep';
      if (self.state === 'walk' && Math.random() < 0.4) self.dir *= -1;
      self.until = t + (self.state === 'walk' ? 3000 + Math.random() * 5000 : self.state === 'sit' ? 2500 + Math.random() * 4000 : 8000 + Math.random() * 8000);
    }
    if (!self.motion && self.state === 'walk') self.state = 'sit';
    if (self.state === 'walk') {
      self.x += self.dir * (kind === 'bird' ? 26 : 34) * dt;
      if (self.x < gnd.left) (self.x = gnd.left), (self.dir = 1);
      if (self.x > gnd.right - w) (self.x = gnd.right - w), (self.dir = -1);
    }
    self.x = Math.max(gnd.left, Math.min(self.x, gnd.right - w));
    el.style.transform = `translate(${self.x}px, ${gnd.y - el.offsetHeight + 2}px)`;
    el.dataset.state = self.state;
    el.dataset.dir = self.dir > 0 ? 'r' : 'l';
    self.raf = requestAnimationFrame(frame);
  };
  self.raf = requestAnimationFrame(frame);

  self.poke = () => {
    const say = el.querySelector('.pet-say');
    const lines = SAYS[kind];
    say.textContent = lines[Math.floor(Math.random() * lines.length)];
    el.classList.remove('poked');
    void el.offsetWidth;
    el.classList.add('poked');
    // a poke wakes it up and sends it trotting the other way
    self.state = 'walk';
    self.dir *= -1;
    self.until = performance.now() + 2500;
  };
  self.stop = () => {
    cancelAnimationFrame(self.raf);
    el.remove();
  };
  return self;
}

export function pokePet() {
  pet?.poke();
}
