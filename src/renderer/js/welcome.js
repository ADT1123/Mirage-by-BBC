// First run: four short steps so a new desktop arrives finished instead of default.
// Pick a look, pick what goes on it, say who you are, choose how hard it should work.
// Runs inside the popup window (see popup.js), because it needs real typing and focus.

import { esc } from './widgets.js';
import { icon } from './icons.js';
import { fillThumb } from './wallpicker.js';

// one wallpaper per pack, the one that shows the pack off best
const PICKS = [
  ['liquid', 'koi-pond'],
  ['astro', 'astro-earth'],
  ['land', 'dunes-golden'],
  ['glass', 'glass-prism'],
  ['silk', 'silk-dusk'],
  ['clay', 'clay-peach'],
  ['neon', 'neon-synth'],
  ['color', 'color-sunset'],
];

// sensible starting widgets: the ones most people keep
const SUGGESTED = ['clock', 'weather', 'note', 'todo'];
const OFFERED = ['clock', 'weather', 'note', 'todo', 'calendar', 'commits', 'music', 'system', 'quote', 'countdown'];

export function renderWelcome(root, { info, cfg, geocode, preset, onDone, onResize }) {
  const walls = info.walls || [];
  const packs = info.packs || [];
  const picks = PICKS.map(([pack, id]) => ({ pack: packs.find((p) => p.id === pack), wall: walls.find((w) => w.id === id) })).filter(
    (p) => p.pack && p.wall,
  );
  const widgets = OFFERED.map((t) => info.widgets.find((w) => w.type === t)).filter(Boolean);

  const chosen = {
    wall: picks[0]?.wall.id,
    widgets: new Set(SUGGESTED),
    name: cfg.name || info.user || '',
    city: cfg.city || '',
    quality: 'auto',
  };
  let step = 0;
  let place = null; // what the city box matched, once it has

  const STEPS = [
    {
      title: 'Pick a look',
      sub: 'Every one of these is live. You can change it any time.',
      body: () => `
        <div class="wc-walls">
          ${picks
            .map(
              (p) => `<button data-wall="${p.wall.id}" class="${chosen.wall === p.wall.id ? 'on' : ''}">
                 <i class="wc-shot" data-shot="${p.wall.id}"></i>
                 <span><b>${esc(p.wall.name)}</b><small>${esc(p.pack.name)}</small></span>
               </button>`,
            )
            .join('')}
        </div>`,
    },
    {
      title: 'What goes on it',
      sub: 'Pick a few. You can add the rest later from Rearrange.',
      body: () => `
        <div class="wc-widgets">
          ${widgets
            .map(
              (w) => `<button data-widget="${w.type}" class="${chosen.widgets.has(w.type) ? 'on' : ''}">
                 ${icon(w.type === 'music' ? 'volume' : w.type)}<b>${esc(w.name)}</b>
               </button>`,
            )
            .join('')}
        </div>`,
    },
    {
      title: 'About you',
      sub: 'Your name goes in the greeting. Your city gives you weather and sunset times.',
      body: () => `
        <label class="wc-field"><span>Name</span><input data-f="name" value="${esc(chosen.name)}" placeholder="What should it call you?" maxlength="24" spellcheck="false" /></label>
        <label class="wc-field"><span>City</span><input data-f="city" value="${esc(chosen.city)}" placeholder="Where do you live?" maxlength="40" spellcheck="false" /></label>
        <small class="wc-note" data-k="city-note">${place ? `Found ${esc(place)}` : 'Leave the city empty to skip weather.'}</small>`,
    },
    {
      title: 'How hard should it work?',
      sub: 'Mirage never takes more than its share of the graphics card.',
      body: () => `
        <div class="wc-rows">
          ${[
            ['auto', 'Automatic', 'Picks the best setting for this PC, and eases off on battery'],
            ['balanced', 'Balanced', 'Lighter. Good on a laptop you use all day'],
            ['high', 'High', 'Sharpest. Best with a dedicated graphics card'],
          ]
            .map(
              ([v, label, why]) => `<button data-q="${v}" class="${chosen.quality === v ? 'on' : ''}">
                 <span><b>${esc(label)}</b><small>${esc(why)}</small></span>${chosen.quality === v ? icon('check') : ''}
               </button>`,
            )
            .join('')}
        </div>`,
    },
  ];

  const draw = () => {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;
    root.innerHTML = `
      <div class="panel wc">
        <div class="wc-head">
          <b>${esc(s.title)}</b>
          <small>${esc(s.sub)}</small>
        </div>
        <div class="wc-body">${s.body()}</div>
        <div class="wc-foot">
          <div class="wc-steps">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
          ${step ? '<button class="wc-btn" data-back>Back</button>' : '<button class="wc-btn" data-skip>Skip</button>'}
          <button class="wc-btn primary" data-next>${last ? 'Finish' : 'Next'}</button>
        </div>
      </div>`;
    // live previews, the same ones the wallpaper picker draws
    const night = document.documentElement.dataset.appearance === 'dark' ? 1 : 0;
    for (const el of root.querySelectorAll('[data-shot]')) {
      fillThumb(el, picks.find((p) => p.wall.id === el.dataset.shot).wall, cfg, night);
    }
    onResize?.();
  };

  let findCity = null;
  root.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    chosen[f] = e.target.value;
    if (f !== 'city') return;
    clearTimeout(findCity);
    const note = root.querySelector('[data-k="city-note"]');
    const typed = chosen.city.trim();
    if (!typed) return (note.textContent = 'Leave the city empty to skip weather.');
    note.textContent = 'Looking…';
    findCity = setTimeout(async () => {
      const hit = await geocode(typed).catch(() => null);
      place = hit ? [hit.name, hit.country].filter(Boolean).join(', ') : null;
      note.textContent = place ? `Found ${place}` : "Couldn't find that one. It still works, just without weather.";
    }, 450);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.f) root.querySelector('[data-next]').click();
    e.stopPropagation();
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.wall) {
      chosen.wall = b.dataset.wall;
      return draw();
    }
    if (b.dataset.widget) {
      const t = b.dataset.widget;
      chosen.widgets.has(t) ? chosen.widgets.delete(t) : chosen.widgets.add(t);
      return draw();
    }
    if (b.dataset.q) {
      chosen.quality = b.dataset.q;
      return draw();
    }
    if (b.dataset.back !== undefined) {
      step--;
      return draw();
    }
    if (b.dataset.skip !== undefined) return onDone(null);
    if (b.dataset.next !== undefined) {
      if (step < STEPS.length - 1) {
        step++;
        return draw();
      }
      b.disabled = true;
      b.textContent = 'Setting up…';
      onDone(await settings());
    }
  });

  // the chosen look, with only the widgets that were ticked, keeping each one where the
  // pack's own layout puts it so nothing lands on top of anything else
  async function settings() {
    const wall = walls.find((w) => w.id === chosen.wall);
    const layout = (await preset(wall?.skin)) || [];
    const keep = layout.filter((w) => chosen.widgets.has(w.type));
    const missing = [...chosen.widgets].filter((t) => !keep.some((w) => w.type === t));
    return {
      wall: chosen.wall,
      theme: wall?.skin,
      widgets: keep,
      add: missing,
      name: chosen.name.trim(),
      city: chosen.city.trim(),
      wallQuality: chosen.quality === 'auto' ? '' : chosen.quality,
    };
  }

  draw();
}
