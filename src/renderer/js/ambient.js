// Things that live on the wallpaper itself rather than in a widget:
//  - real weather: rain, snow or a storm falling over any theme when it's happening outside
//  - a desktop pet that strolls along the dock and reacts when you click it

let layer; // behind the widgets: the weather canvas
let stage;
let fx = null;
let pet = null;

export function mountAmbient(stageEl) {
  stage = stageEl;
  layer = document.createElement('div');
  layer.id = 'ambient';
  layer.innerHTML = '<canvas class="fx"></canvas>';
  stageEl.before(layer);
}

// called on every render / data change
export function updateAmbient(c) {
  if (!layer) return;
  const motion = c.cfg.motion !== false;
  updateWeather(c, motion);
  updatePet(c, motion);
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
